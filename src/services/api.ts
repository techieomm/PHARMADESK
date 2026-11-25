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
  AuditLog,
  DayBookData
} from '@/types';

/**
 * Returns true ONLY if explicit demo mode flag is active.
 * When false, local storage fallback is strictly disabled across all services.
 */
const isDemoMode = (): boolean => {
  return import.meta.env.VITE_DEMO_MODE === 'true';
};

const assertLiveDatabase = () => {
  if (!isSupabaseConfigured() && !isDemoMode()) {
    throw new Error('Supabase live connection required. Local database fallback is disabled in production.');
  }
};

// ====================================================================
// AUTHENTICATION SERVICES
// ====================================================================

export const authService = {
  /**
   * Log in using Employee ID (e.g. EMP001) and Password.
   * Resolves employee_id to the registered Supabase Auth email via
   * public.lookup_employee_email(p_employee_id) (SECURITY DEFINER),
   * bypassing anonymous RLS restrictions securely.
   */
  async loginWithEmployeeId(employeeId: string, password: string): Promise<{ profile: Profile; sessionToken?: string }> {
    if (employeeId.includes('@')) {
      throw new Error('That looks like an email. Use the Email Address tab.');
    }
    const cleanId = employeeId.trim().toLowerCase();

    if (isSupabaseConfigured()) {
      // 1. Look up profile email for this employee_id via SECURITY DEFINER RPC
      // Returns TABLE(email text, is_active boolean) -> array of objects in Supabase client
      const { data, error: rpcErr } = await supabase.rpc('lookup_employee_email', {
        p_employee_id: cleanId,
      });

      if (rpcErr) {
        console.error('Lookup employee RPC error:', rpcErr);
        throw new Error('Authentication service temporarily unavailable. Please retry.');
      }

      const row = Array.isArray(data) ? data[0] : (data as { email?: string; is_active?: boolean } | null);

      if (!row || !row.email) {
        // Generic credentials error to prevent enumeration of valid employee IDs
        throw new Error('Invalid credentials');
      }

      if (row.is_active === false) {
        throw new Error('This account has been deactivated. Please contact Master Admin.');
      }

      // 2. Authenticate against Supabase Auth with resolved email & password
      let { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: row.email,
        password: password,
      });

      // If initial attempt failed, retry with trimmed password in case of accidental trailing whitespace
      if (authErr && password !== password.trim()) {
        const retry = await supabase.auth.signInWithPassword({
          email: row.email,
          password: password.trim(),
        });
        if (!retry.error) {
          authData = retry.data;
          authErr = null;
        }
      }

      if (authErr) {
        console.error('Supabase signInWithPassword failed:', authErr.message, authErr.status);
        const isMaster = cleanId === 'master-admin';
        const errorMsg = import.meta.env.DEV
          ? (isMaster
            ? `Invalid credentials (${authErr.message}). Ensure Master Admin password is entered correctly.`
            : `Invalid credentials (${authErr.message}). Check employee password or contact Master Admin to reset it.`)
          : 'Invalid credentials';
        throw new Error(errorMsg);
      }

      if (!authData?.user) {
        throw new Error('Authentication failed. No user session returned.');
      }

      // 3. Post-login: Fetch profile using the authenticated session
      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('*, branch:branches(*)')
        .eq('id', authData.user.id)
        .single();

      if (profileErr || !profileData) {
        await supabase.auth.signOut();
        throw new Error('User profile record not found. Please contact administrator.');
      }

      if (!profileData.is_active) {
        await supabase.auth.signOut();
        throw new Error('This account has been deactivated. Please contact Master Admin.');
      }

      return {
        profile: profileData as Profile,
        sessionToken: authData.session?.access_token,
      };
    } else {
      if (!isDemoMode()) {
        throw new Error('Supabase live connection required. Local fallback is disabled in production.');
      }

      // Demo fallback mode (VITE_DEMO_MODE=true)
      const profile = localDb.getProfileByEmployeeId(cleanId);
      if (!profile) {
        throw new Error(`Invalid Employee ID "${cleanId}". In demo mode, use EMP001 (Master Admin).`);
      }
      if (!profile.is_active) {
        throw new Error('This account has been deactivated. Please contact Master Admin.');
      }
      if (password.length < 4) {
        throw new Error('Password must be at least 4 characters');
      }

      // Store auth state in localStorage for session restoration in demo mode
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
      let { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: password,
      });

      if (authErr && password !== password.trim()) {
        const retry = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: password.trim(),
        });
        if (!retry.error) {
          authData = retry.data;
          authErr = null;
        }
      }

      if (authErr) {
        console.error('Supabase signInWithPassword failed:', authErr.message, authErr.status);
        const isMaster = cleanEmail === 'omlenka22@gmail.com';
        const errorMsg = import.meta.env.DEV
          ? (isMaster
            ? `Invalid credentials (${authErr.message}). Ensure Master Admin password is entered correctly.`
            : `Invalid credentials (${authErr.message}). Check employee password or contact Master Admin to reset it.`)
          : 'Invalid credentials';
        throw new Error(errorMsg);
      }

      if (!authData?.user) {
        throw new Error('Authentication failed. No user session returned.');
      }

      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('*, branch:branches(*)')
        .eq('id', authData.user.id)
        .single();

      if (profileErr || !profile) {
        await supabase.auth.signOut();
        throw new Error('User profile record not found. Please contact administrator.');
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
      if (!isDemoMode()) {
        throw new Error('Supabase live connection required. Local fallback is disabled in production.');
      }

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
      if (!isDemoMode()) return null;

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
      if (!isDemoMode()) {
        throw new Error('Supabase live connection required.');
      }
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
      assertLiveDatabase();
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
      const cleanEmpId = params.employeeId.trim().toLowerCase();
      const cleanEmail = params.email.trim().toLowerCase();

      // 1. Primary: Use atomic SECURITY DEFINER admin RPC
      // This provisions auth.users with confirmed email and sets up public.profiles
      // without displacing the active Master Admin session in the browser.
      const { data: rpcData, error: rpcErr } = await supabase.rpc('admin_create_employee', {
        p_full_name: params.fullName.trim(),
        p_employee_id: cleanEmpId,
        p_email: cleanEmail,
        p_password: params.initialPassword,
        p_role: params.role,
        p_branch_id: params.branchId,
        p_phone: params.phone?.trim() || null,
        p_permissions: params.permissions || {},
      });

      if (!rpcErr && rpcData) {
        const { data: fullProfile } = await supabase
          .from('profiles')
          .select('*, branch:branches(*)')
          .eq('id', (rpcData as any).id)
          .single();

        return (fullProfile || rpcData) as Profile;
      }

      // Never fall back to client-side signUp: it would replace the Master Admin
      // session in this browser and create a half-working account.
      if (rpcErr) {
        const msg = rpcErr.message || '';
        if (msg.includes('Could not find') || msg.includes('schema cache')) {
          throw new Error(
            'Staff creation is not set up in the database yet. Run supabase/migrations/017_fix_staff_login_identities.sql in the Supabase SQL Editor.'
          );
        }
        throw new Error(msg);
      }
      throw new Error('Staff creation returned no data. Please retry.');
    } else {
      assertLiveDatabase();
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
      assertLiveDatabase();
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
      assertLiveDatabase();
      return localDb.updateProfile(id, updates);
    }
  },

  async resetEmployeePassword(profileId: string, newPassword: string): Promise<void> {
    if (isSupabaseConfigured()) {
      const { error } = await supabase.rpc('admin_reset_employee_password', {
        p_profile_id: profileId,
        p_new_password: newPassword,
      });
      if (error) throw new Error(error.message);
    } else {
      assertLiveDatabase();
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
      assertLiveDatabase();
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
      assertLiveDatabase();
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
      assertLiveDatabase();
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
      assertLiveDatabase();
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
      assertLiveDatabase();
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
      assertLiveDatabase();
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
      assertLiveDatabase();
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
      assertLiveDatabase();
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
      assertLiveDatabase();
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
      assertLiveDatabase();
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
      assertLiveDatabase();
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
        .select('*, branch:branches(*), items:invoice_items(*), creator:profiles!created_by(*)')
        .eq('id', data.invoice_id)
        .single();

      if (fetchErr || !inv) throw new Error('Invoice created, but failed to retrieve details');

      return {
        invoice: inv as Invoice,
        invoiceNumber: inv.invoice_number,
      };
    } else {
      assertLiveDatabase();
      return localDb.createInvoiceAtomic(params);
    }
  },

  async getInvoices(branchId?: string): Promise<Invoice[]> {
    if (isSupabaseConfigured()) {
      let query = supabase
        .from('invoices')
        .select('*, branch:branches(*), items:invoice_items(*), creator:profiles!created_by(*)')
        .order('invoice_date', { ascending: false });

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data || []) as Invoice[];
    } else {
      assertLiveDatabase();
      return localDb.getInvoices(branchId);
    }
  },

  async getInvoiceById(id: string): Promise<Invoice | null> {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, branch:branches(*), items:invoice_items(*), creator:profiles!created_by(*)')
        .eq('id', id)
        .single();
      if (error) throw new Error(error.message);
      return data as Invoice;
    } else {
      assertLiveDatabase();
      return localDb.getInvoiceById(id) || null;
    }
  },

  async cancelInvoice(invoiceId: string, reason: string): Promise<{ success: boolean; invoice_number: string }> {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase.rpc('cancel_invoice', {
        p_invoice_id: invoiceId,
        p_reason: reason,
      });
      if (error) throw new Error(`Invoice cancellation failed: ${error.message}`);
      return data;
    } else {
      assertLiveDatabase();
      const inv = localDb.getInvoiceById(invoiceId);
      if (!inv) throw new Error('Invoice not found');
      inv.payment_status = 'cancelled';
      inv.cancelled_reason = reason;
      return { success: true, invoice_number: inv.invoice_number };
    }
  },

  async getDayBook(params?: { branchId?: string; date?: string; cashierId?: string }): Promise<DayBookData> {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase.rpc('get_day_book', {
        p_branch_id: params?.branchId && params.branchId !== 'all' ? params.branchId : null,
        p_date: params?.date || null,
        p_cashier_id: params?.cashierId || null,
      });
      if (error) throw new Error(`Failed to load Day Book: ${error.message}`);
      return data as DayBookData;
    } else {
      assertLiveDatabase();
      return {
        success: true,
        date: params?.date || new Date().toISOString().split('T')[0],
        timezone: 'Asia/Kolkata',
        branch_id: params?.branchId,
        summary: {
          gross_sales_count: 0,
          gross_sales_amount: 0,
          taxable_amount: 0,
          cgst_amount: 0,
          sgst_amount: 0,
          igst_amount: 0,
          total_gst: 0,
          discount_amount: 0,
          round_off: 0,
          cash_collected: 0,
          upi_collected: 0,
          card_collected: 0,
          total_collected: 0,
          credit_given: 0,
          credit_recovered: 0,
          returns_count: 0,
          returns_amount: 0,
          returns_gst: 0,
          cancelled_count: 0,
          cancelled_amount: 0,
          net_sales_amount: 0,
          reconciliation_difference: 0,
          is_balanced: true,
        },
        invoices: [],
        returns: [],
        cancelled_invoices: [],
        customer_payments: [],
        payment_records: [],
      };
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
      assertLiveDatabase();
      return localDb.getAuditLogs();
    }
  },
};