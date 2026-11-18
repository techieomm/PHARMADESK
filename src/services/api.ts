import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { localDb } from '@/services/storage';
import { 
  Profile, 
  Branch, 
  Medicine, 
  BranchInventory, 
  Invoice, 
  StockMovement, 
  CartItem, 
  PaymentMethod,
  AuditLog
} from '@/types';

// ====================================================================
// AUTHENTICATION SERVICES
// ====================================================================

export const authService = {
  /**
   * Log in using Employee ID (e.g. EMP001) and Password.
   * Maps employee_id to the registered Supabase Auth email.
   */
  async loginWithEmployeeId(employeeId: string, password: string): Promise<{ profile: Profile; sessionToken?: string }> {
    const cleanId = employeeId.trim().toUpperCase();

    if (isSupabaseConfigured()) {
      // 1. Look up profile email for this employee_id via RPC or table
      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .ilike('employee_id', cleanId)
        .single();

      if (profileErr || !profileData) {
        throw new Error(`Invalid Employee ID: ${employeeId}`);
      }

      if (!profileData.is_active) {
        throw new Error('This account has been deactivated. Please contact Master Admin.');
      }

      // 2. Authenticate against Supabase Auth with resolved email & password
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: profileData.email,
        password: password,
      });

      if (authErr) {
        throw new Error(authErr.message || 'Incorrect password');
      }

      return {
        profile: profileData as Profile,
        sessionToken: authData.session?.access_token,
      };
    } else {
      // Local fallback mode
      const profile = localDb.getProfileByEmployeeId(cleanId);
      if (!profile) {
        throw new Error(`Invalid Employee ID "${cleanId}". In setup mode, use EMP001 (Master Admin).`);
      }
      if (!profile.is_active) {
        throw new Error('This account has been deactivated. Please contact Master Admin.');
      }
      // Simple verification for setup mode
      if (password.length < 4) {
        throw new Error('Password must be at least 4 characters');
      }

      // Store auth state in localStorage for session restoration
      localStorage.setItem('pharmadesk_active_user_id', profile.id);
      return { profile };
    }
  },

  /**
   * Log in using Email and Password
   */
  async loginWithEmail(email: string, password: string): Promise<{ profile: Profile; sessionToken?: string }> {
    const cleanEmail = email.trim().toLowerCase();

    if (isSupabaseConfigured()) {
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: password,
      });

      if (authErr) {
        throw new Error(authErr.message || 'Invalid email or password');
      }

      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('*, branch:branches(*)')
        .eq('id', authData.user.id)
        .single();

      if (profileErr || !profile) {
        throw new Error('User profile record not found');
      }

      if (!profile.is_active) {
        await supabase.auth.signOut();
        throw new Error('This account has been deactivated. Please contact Master Admin.');
      }

      return {
        profile: profile as Profile,
        sessionToken: authData.session?.access_token,
      };
    } else {
      const profile = localDb.getProfiles().find(p => p.email.toLowerCase() === cleanEmail);
      if (!profile) {
        throw new Error(`No account found with email ${cleanEmail}`);
      }
      if (!profile.is_active) {
        throw new Error('This account has been deactivated.');
      }
      localStorage.setItem('pharmadesk_active_user_id', profile.id);
      return { profile };
    }
  },

  /**
   * Restore current active session
   */
  async getCurrentUser(): Promise<Profile | null> {
    if (isSupabaseConfigured()) {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.user) return null;

      const { data: profile } = await supabase
        .from('profiles')
        .select('*, branch:branches(*)')
        .eq('id', sessionData.session.user.id)
        .single();

      if (!profile || !profile.is_active) return null;
      return profile as Profile;
    } else {
      const activeId = localStorage.getItem('pharmadesk_active_user_id');
      if (!activeId) return null;
      const profile = localDb.getProfileById(activeId);
      if (!profile || !profile.is_active) {
        localStorage.removeItem('pharmadesk_active_user_id');
        return null;
      }
      return profile;
    }
  },

  /**
   * Log out
   */
  async logout(): Promise<void> {
    if (isSupabaseConfigured()) {
      await supabase.auth.signOut();
    }
    localStorage.removeItem('pharmadesk_active_user_id');
  },

  /**
   * Password Reset Request
   */
  async requestPasswordReset(email: string): Promise<void> {
    if (isSupabaseConfigured()) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw new Error(error.message);
    } else {
      // In local mode, simulate success
      console.log(`Password reset simulated for ${email}`);
    }
  },
};

// ====================================================================
// EMPLOYEE & PROFILE MANAGEMENT (Master Admin)
// ====================================================================

export const employeeService = {
  async getEmployees(): Promise<Profile[]> {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, branch:branches(*)')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data || []) as Profile[];
    } else {
      return localDb.getProfiles();
    }
  },

  async createEmployee(params: {
    fullName: string;
    employeeId: string;
    email: string;
    phone?: string;
    role: Profile['role'];
    branchId: string;
    initialPassword: string;
    permissions?: Profile['permissions'];
  }): Promise<Profile> {
    if (isSupabaseConfigured()) {
      // In Supabase, creating another user with email/password from frontend is done via Supabase Edge Function
      // or admin auth API. When called with anon key, we use the custom RPC or signUp.
      // Call Supabase auth signUp with profile metadata
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: params.email,
        password: params.initialPassword,
        options: {
          data: {
            full_name: params.fullName,
            employee_id: params.employeeId.toUpperCase(),
            role: params.role,
            primary_branch_id: params.branchId,
          },
        },
      });

      if (authErr) throw new Error(authErr.message);

      const userId = authData.user?.id;
      if (!userId) throw new Error('Failed to create auth user');

      // Insert profile record
      const { data: newProfile, error: profileErr } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          full_name: params.fullName,
          employee_id: params.employeeId.toUpperCase(),
          email: params.email,
          phone: params.phone || null,
          role: params.role,
          primary_branch_id: params.branchId,
          is_active: true,
          permissions: params.permissions || {},
        })
        .select('*, branch:branches(*)')
        .single();

      if (profileErr) throw new Error(profileErr.message);
      return newProfile as Profile;
    } else {
      return localDb.createProfile({
        full_name: params.fullName,
        employee_id: params.employeeId,
        email: params.email,
        phone: params.phone,
        role: params.role,
        primary_branch_id: params.branchId,
        is_active: true,
        permissions: params.permissions,
      });
    }
  },

  async toggleEmployeeStatus(id: string, isActive: boolean): Promise<Profile> {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from('profiles')
        .update({ is_active: isActive })
        .eq('id', id)
        .select('*, branch:branches(*)')
        .single();
      if (error) throw new Error(error.message);
      return data as Profile;
    } else {
      return localDb.updateProfile(id, { is_active: isActive });
    }
  },

  async updateEmployee(id: string, updates: Partial<Profile>): Promise<Profile> {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', id)
        .select('*, branch:branches(*)')
        .single();
      if (error) throw new Error(error.message);
      return data as Profile;
    } else {
      return localDb.updateProfile(id, updates);
    }
  },
};

// ====================================================================
// BRANCH MANAGEMENT
// ====================================================================

export const branchService = {
  async getBranches(): Promise<Branch[]> {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .order('branch_code');
      if (error) throw new Error(error.message);
      return (data || []) as Branch[];
    } else {
      return localDb.getBranches();
    }
  },

  async updateBranch(id: string, updates: Partial<Branch>): Promise<Branch> {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from('branches')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as Branch;
    } else {
      return localDb.updateBranch(id, updates);
    }
  },

  async createBranch(branchData: Omit<Branch, 'id' | 'created_at' | 'updated_at' | 'invoice_sequence'>): Promise<Branch> {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from('branches')
        .insert({
          ...branchData,
          invoice_sequence: 1001,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as Branch;
    } else {
      return localDb.createBranch(branchData);
    }
  },
};

// ====================================================================
// MEDICINE MASTER & CATALOG
// ====================================================================

export const medicineService = {
  async getMedicines(): Promise<Medicine[]> {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from('medicine_master')
        .select('*')
        .order('brand_name');
      if (error) throw new Error(error.message);
      return (data || []) as Medicine[];
    } else {
      return localDb.getMedicines();
    }
  },

  async getMedicineByBarcode(barcode: string): Promise<Medicine | null> {
    const clean = barcode.trim();
    if (!clean) return null;

    if (isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from('medicine_master')
        .select('*')
        .eq('barcode', clean)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as Medicine) || null;
    } else {
      return localDb.getMedicineByBarcode(clean) || null;
    }
  },

  async searchMedicines(query: string): Promise<Medicine[]> {
    const clean = query.trim().toLowerCase();
    if (!clean) return [];

    if (isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from('medicine_master')
        .select('*')
        .or(`brand_name.ilike.%${clean}%,generic_name.ilike.%${clean}%,composition.ilike.%${clean}%,barcode.ilike.%${clean}%`)
        .limit(20);
      if (error) throw new Error(error.message);
      return (data || []) as Medicine[];
    } else {
      const all = localDb.getMedicines();
      return all.filter(m => 
        m.brand_name.toLowerCase().includes(clean) ||
        m.generic_name.toLowerCase().includes(clean) ||
        (m.composition && m.composition.toLowerCase().includes(clean)) ||
        (m.barcode && m.barcode.toLowerCase().includes(clean)) ||
        (m.manufacturer && m.manufacturer.toLowerCase().includes(clean))
      ).slice(0, 20);
    }
  },

  async createMedicine(data: Omit<Medicine, 'id' | 'created_at' | 'updated_at'>): Promise<Medicine> {
    if (isSupabaseConfigured()) {
      const { data: created, error } = await supabase
        .from('medicine_master')
        .insert(data)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return created as Medicine;
    } else {
      return localDb.createMedicine(data);
    }
  },

  async updateMedicine(id: string, updates: Partial<Medicine>): Promise<Medicine> {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from('medicine_master')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as Medicine;
    } else {
      return localDb.updateMedicine(id, updates);
    }
  },
};

// ====================================================================
// INVENTORY & STOCK MANAGEMENT
// ====================================================================

export const inventoryService = {
  async getBranchInventory(branchId?: string): Promise<BranchInventory[]> {
    if (isSupabaseConfigured()) {
      let query = supabase
        .from('branch_inventory')
        .select('*, medicine:medicine_master(*)');

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data || []) as BranchInventory[];
    } else {
      return localDb.getInventory(branchId);
    }
  },

  async adjustStock(params: {
    branchId: string;
    medicineId: string;
    adjustmentType: 'add' | 'set' | 'subtract';
    unit: 'strip' | 'piece';
    quantity: number;
    notes?: string;
    performedByUserId?: string;
    batchNumber?: string;
    expiryDate?: string;
  }): Promise<{ success: boolean; newStockPieces: number }> {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase.rpc('adjust_stock_atomic', {
        p_branch_id: params.branchId,
        p_medicine_id: params.medicineId,
        p_adjustment_type: params.adjustmentType,
        p_unit: params.unit,
        p_quantity: params.quantity,
        p_notes: params.notes || null,
        p_batch_number: params.batchNumber || null,
        p_expiry_date: params.expiryDate || null,
      });

      if (error) throw new Error(error.message);
      return { success: true, newStockPieces: data?.new_stock_pieces || 0 };
    } else {
      return localDb.adjustStockAtomic(params);
    }
  },

  async getStockMovements(branchId?: string, medicineId?: string): Promise<StockMovement[]> {
    if (isSupabaseConfigured()) {
      let query = supabase
        .from('stock_movements')
        .select('*, medicine:medicine_master(*), performer:profiles(*)')
        .order('created_at', { ascending: false });

      if (branchId) query = query.eq('branch_id', branchId);
      if (medicineId) query = query.eq('medicine_id', medicineId);

      const { data, error } = await query.limit(100);
      if (error) throw new Error(error.message);
      return (data || []) as StockMovement[];
    } else {
      return localDb.getStockMovements(branchId, medicineId);
    }
  },
};

// ====================================================================
// INVOICES & POS BILLING
// ====================================================================

export const billingService = {
  async createInvoiceAtomic(params: {
    branchId: string;
    customerName: string;
    customerPhone: string;
    paymentMethod: PaymentMethod;
    items: CartItem[];
    notes?: string;
    userId: string;
  }): Promise<{ invoice: Invoice; invoiceNumber: string }> {
    if (isSupabaseConfigured()) {
      const payloadItems = params.items.map(it => ({
        medicine_id: it.medicine.id,
        selected_unit: it.selected_unit,
        unit_quantity: it.unit_quantity,
      }));

      const { data, error } = await supabase.rpc('create_invoice_atomic', {
        p_branch_id: params.branchId,
        p_customer_name: params.customerName.trim(),
        p_customer_phone: params.customerPhone.trim(),
        p_payment_method: params.paymentMethod,
        p_items: payloadItems,
        p_notes: params.notes || null,
      });

      if (error) throw new Error(error.message);

      // Fetch newly created invoice with branch and items
      const { data: inv, error: fetchErr } = await supabase
        .from('invoices')
        .select('*, branch:branches(*), items:invoice_items(*), creator:profiles(*)')
        .eq('id', data.invoice_id)
        .single();

      if (fetchErr || !inv) throw new Error('Invoice created, but failed to retrieve details');

      return {
        invoice: inv as Invoice,
        invoiceNumber: inv.invoice_number,
      };
    } else {
      return localDb.createInvoiceAtomic(params);
    }
  },

  async getInvoices(branchId?: string): Promise<Invoice[]> {
    if (isSupabaseConfigured()) {
      let query = supabase
        .from('invoices')
        .select('*, branch:branches(*), items:invoice_items(*), creator:profiles(*)')
        .order('invoice_date', { ascending: false });

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data || []) as Invoice[];
    } else {
      return localDb.getInvoices(branchId);
    }
  },

  async getInvoiceById(id: string): Promise<Invoice | null> {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, branch:branches(*), items:invoice_items(*), creator:profiles(*)')
        .eq('id', id)
        .single();
      if (error) throw new Error(error.message);
      return data as Invoice;
    } else {
      return localDb.getInvoiceById(id) || null;
    }
  },
};

// ====================================================================
// AUDIT LOGS
// ====================================================================

export const auditService = {
  async getAuditLogs(): Promise<AuditLog[]> {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return (data || []) as AuditLog[];
    } else {
      return localDb.getAuditLogs();
    }
  },
};
