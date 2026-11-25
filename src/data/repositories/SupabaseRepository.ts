/**
 * Supabase Data Repository Implementation
 * Single Source of Truth for Live Production System
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { localDb } from '@/services/storage';
import {
  IMedicineRepository,
  IInventoryRepository,
  IInvoiceRepository,
  ICustomerRepository,
  ISupplierRepository,
  IPurchaseRepository,
  IDayCloseRepository,
  IDiscrepancyRepository,
  IBusinessRepository,
  IReportsRepository,
  ISyncRepository,
  CreateInvoiceParams,
  CreatePurchaseParams,
  CreateSalesReturnParams,
  AdjustStockParams,
} from './interfaces';
import {
  Medicine,
  InventoryBatch,
  BranchInventory,
  StockMovement,
  Invoice,
  Customer,
  CustomerLedgerEntry,
  Supplier,
  SupplierLedgerEntry,
  PurchaseInvoice,
  SalesReturn,
  H1RegisterEntry,
  DayCloseRecord,
  ExpenseRecord,
  Discrepancy,
  Business,
  Branch,
  Counter,
  DayBookData,
} from '@/types';

const isDemoMode = (): boolean => {
  return import.meta.env.VITE_DEMO_MODE === 'true';
};

// 1. MEDICINES REPOSITORY
export class SupabaseMedicineRepository implements IMedicineRepository {
  async getMedicines(): Promise<Medicine[]> {
    if (isDemoMode()) return localDb.getMedicines();

    const { data, error } = await supabase
      .from('medicine_master')
      .select('*')
      .is('deleted_at', null)
      .order('brand_name');

    if (error) throw new Error(`Failed to load medicines: ${error.message}`);
    return data as Medicine[];
  }

  async getMedicineById(id: string): Promise<Medicine | null> {
    if (isDemoMode()) return localDb.getMedicineById(id) || null;

    const { data, error } = await supabase
      .from('medicine_master')
      .select('*')
      .eq('id', id)
      .single();

    if (error) return null;
    return data as Medicine;
  }

  async getMedicineByBarcode(barcode: string): Promise<Medicine | null> {
    if (isDemoMode()) {
      const all = localDb.getMedicines();
      return all.find(m => m.barcode === barcode) || null;
    }

    // Check direct barcode or medicine_barcodes table
    const { data: directData } = await supabase
      .from('medicine_master')
      .select('*')
      .eq('barcode', barcode)
      .is('deleted_at', null)
      .maybeSingle();

    if (directData) return directData as Medicine;

    const { data: linkData } = await supabase
      .from('medicine_barcodes')
      .select('medicine:medicine_master(*)')
      .eq('barcode', barcode)
      .maybeSingle();

    if (linkData && (linkData as any).medicine) {
      return (linkData as any).medicine as Medicine;
    }

    return null;
  }

  async searchMedicines(query: string): Promise<Medicine[]> {
    if (isDemoMode()) {
      const q = query.toLowerCase().trim();
      return localDb.getMedicines().filter(m => 
        m.brand_name.toLowerCase().includes(q) ||
        m.generic_name.toLowerCase().includes(q) ||
        (m.composition && m.composition.toLowerCase().includes(q)) ||
        (m.barcode && m.barcode.includes(q))
      );
    }

    const clean = query.trim();
    const { data, error } = await supabase
      .from('medicine_master')
      .select('*')
      .is('deleted_at', null)
      .or(`brand_name.ilike.%${clean}%,generic_name.ilike.%${clean}%,composition.ilike.%${clean}%,barcode.ilike.%${clean}%`)
      .limit(30);

    if (error) throw new Error(error.message);
    return data as Medicine[];
  }

  async createMedicine(data: Omit<Medicine, 'id' | 'created_at' | 'updated_at'>): Promise<Medicine> {
    if (isDemoMode()) return localDb.createMedicine(data as any);

    const { data: created, error } = await supabase
      .from('medicine_master')
      .insert(data)
      .select()
      .single();

    if (error) throw new Error(`Create medicine failed: ${error.message}`);
    return created as Medicine;
  }

  async updateMedicine(id: string, data: Partial<Medicine>): Promise<Medicine> {
    if (isDemoMode()) return localDb.updateMedicine(id, data as any);

    const { data: updated, error } = await supabase
      .from('medicine_master')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Update medicine failed: ${error.message}`);
    return updated as Medicine;
  }

  async deleteMedicine(id: string): Promise<void> {
    if (isDemoMode()) {
      localDb.updateMedicine(id, { is_active: false });
      return;
    }

    // Soft delete
    const { error } = await supabase
      .from('medicine_master')
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('id', id);

    if (error) throw new Error(error.message);
  }
}

// 2. INVENTORY REPOSITORY
export class SupabaseInventoryRepository implements IInventoryRepository {
  async getBranchInventory(branchId?: string): Promise<BranchInventory[]> {
    if (isDemoMode()) return localDb.getInventory(branchId);

    let query = supabase.from('branch_inventory_view').select('*, medicine:medicine_master(*)');
    if (branchId && branchId !== 'all') {
      query = query.eq('branch_id', branchId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to load inventory: ${error.message}`);
    return data as BranchInventory[];
  }

  async getInventoryBatches(branchId?: string, medicineId?: string): Promise<InventoryBatch[]> {
    if (isDemoMode()) {
      const inv = localDb.getInventory(branchId);
      const batches: InventoryBatch[] = [];
      inv.forEach(i => {
        if (!medicineId || i.medicine_id === medicineId) {
          batches.push({
            id: i.id,
            branch_id: i.branch_id,
            medicine_id: i.medicine_id,
            batch_number: i.batch_number || 'DEFAULT-01',
            expiry_date: i.expiry_date || '2027-12-31',
            stock_pieces: i.stock_pieces,
            mrp: i.medicine?.mrp || 0,
            purchase_rate: i.medicine?.purchase_cost,
            rack_location: i.rack_location,
            is_active: true,
            version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            medicine: i.medicine,
          });
        }
      });
      return batches;
    }

    let q = supabase.from('inventory_batches').select('*, medicine:medicine_master(*)').is('deleted_at', null).order('expiry_date', { ascending: true });
    if (branchId && branchId !== 'all') q = q.eq('branch_id', branchId);
    if (medicineId) q = q.eq('medicine_id', medicineId);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data as InventoryBatch[];
  }

  async getExpiringBatches(branchId?: string, daysThreshold: number = 90): Promise<InventoryBatch[]> {
    if (isDemoMode()) return [];

    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);
    const dateStr = thresholdDate.toISOString().split('T')[0];

    let q = supabase
      .from('inventory_batches')
      .select('*, medicine:medicine_master(*)')
      .lte('expiry_date', dateStr)
      .gt('stock_pieces', 0)
      .is('deleted_at', null)
      .order('expiry_date', { ascending: true });

    if (branchId && branchId !== 'all') q = q.eq('branch_id', branchId);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data as InventoryBatch[];
  }

  async adjustStock(params: AdjustStockParams): Promise<{ success: boolean; newStock: number }> {
    if (isDemoMode()) {
      const res = localDb.adjustStockAtomic({
        branchId: params.branchId,
        medicineId: params.medicineId,
        adjustmentType: params.adjustmentType,
        unit: 'piece',
        quantity: params.quantityPieces,
        notes: params.reason,
        performedByUserId: 'local-user',
        batchNumber: params.batchNumber,
        expiryDate: params.expiryDate,
      });
      return { success: true, newStock: res.newStockPieces };
    }

    // Call Supabase RPC adjust_stock_atomic
    const { data, error } = await supabase.rpc('adjust_stock_atomic', {
      p_branch_id: params.branchId,
      p_medicine_id: params.medicineId,
      p_adjustment_type: params.adjustmentType,
      p_unit: 'piece',
      p_quantity: params.quantityPieces,
      p_notes: params.reason,
      p_batch_number: params.batchNumber,
      p_expiry_date: params.expiryDate,
    });

    if (error) throw new Error(`Stock adjustment failed: ${error.message}`);
    return { success: true, newStock: data?.new_stock_pieces || 0 };
  }

  async transferStock(params: {
    sourceBranchId: string;
    destinationBranchId: string;
    items: Array<{ medicine_id: string; batch_number: string; expiry_date: string; pieces: number; mrp: number }>;
    notes?: string;
  }): Promise<{ transferNumber: string }> {
    if (isDemoMode()) {
      return { transferNumber: `TRF-${Date.now()}` };
    }

    const transferNum = `TRF-${Date.now()}`;
    const { data, error } = await supabase.from('stock_transfers').insert({
      source_branch_id: params.sourceBranchId,
      destination_branch_id: params.destinationBranchId,
      transfer_number: transferNum,
      status: 'in_transit',
      notes: params.notes,
    }).select().single();

    if (error) throw new Error(error.message);
    return { transferNumber: transferNum };
  }

  async getStockMovements(branchId?: string, medicineId?: string): Promise<StockMovement[]> {
    if (isDemoMode()) return localDb.getStockMovements(branchId, medicineId);

    let q = supabase.from('stock_movements').select('*, medicine:medicine_master(*), performer:profiles(*)').order('created_at', { ascending: false }).limit(100);
    if (branchId && branchId !== 'all') q = q.eq('branch_id', branchId);
    if (medicineId) q = q.eq('medicine_id', medicineId);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data as StockMovement[];
  }
}

// 3. INVOICE REPOSITORY (Atomic RPC + FEFO)
export class SupabaseInvoiceRepository implements IInvoiceRepository {
  async createInvoiceAtomic(params: CreateInvoiceParams): Promise<{
    success: boolean;
    invoice_id: string;
    invoice_number: string;
    grand_total: number;
    subtotal_taxable: number;
    total_gst: number;
    round_off: number;
  }> {
    if (isDemoMode()) {
      const res = localDb.createInvoiceAtomic({
        branchId: params.branchId,
        customerName: params.customerName,
        customerPhone: params.customerPhone || '',
        paymentMethod: params.paymentMethod,
        items: params.items,
        notes: params.notes,
        userId: 'EMP001',
      });
      return {
        success: true,
        invoice_id: res.invoice.id,
        invoice_number: res.invoiceNumber,
        grand_total: res.invoice.total_amount,
        subtotal_taxable: res.invoice.subtotal_taxable,
        total_gst: res.invoice.total_gst,
        round_off: res.invoice.round_off || 0,
      };
    }

    // Call atomic PostgreSQL RPC
    const rpcPayload = {
      p_branch_id: params.branchId,
      p_counter_id: params.counterId || null,
      p_customer_name: params.customerName,
      p_customer_phone: params.customerPhone || null,
      p_customer_age: params.customerAge ?? null,
      p_customer_address: params.customerAddress || null,
      p_customer_id: params.customerId || null,
      p_customer_gstin: params.customerGstin || null,
      p_customer_state_code: params.customerStateCode || '09',
      p_doctor_id: params.doctorId || null,
      p_doctor_name: params.doctorName || null,
      p_doctor_reg_no: params.doctorRegNo || null,
      p_payment_method: params.paymentMethod,
      p_payment_splits: params.paymentSplits || [],
      p_items: params.items.map(it => ({
        medicine_id: it.medicine.id,
        selected_unit: it.selected_unit,
        unit_quantity: it.unit_quantity,
        batch_id: it.selectedBatch?.id || null,
        discount_amount: it.discount_amount || 0,
      })),
      p_bill_discount: params.billDiscount || 0,
      p_notes: params.notes || null,
      p_device_id: params.deviceId || null,
      p_idempotency_key: params.idempotencyKey || null,
    };

    const { data, error } = await supabase.rpc('create_invoice_atomic', rpcPayload);

    if (error) throw new Error(`Atomic bill creation failed: ${error.message}`);
    return data;
  }

  async getInvoices(branchId?: string): Promise<Invoice[]> {
    if (isDemoMode()) return localDb.getInvoices(branchId);

    let q = supabase
      .from('invoices')
      .select('*, branch:branches(*), items:invoice_items(*), creator:profiles!created_by(*)')
      .order('invoice_date', { ascending: false });

    if (branchId && branchId !== 'all') q = q.eq('branch_id', branchId);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data as Invoice[];
  }

  async getInvoiceById(id: string): Promise<Invoice | null> {
    if (isDemoMode()) return localDb.getInvoiceById(id) || null;

    const { data, error } = await supabase
      .from('invoices')
      .select('*, branch:branches(*), items:invoice_items(*), creator:profiles!created_by(*)')
      .eq('id', id)
      .single();

    if (error) return null;
    return data as Invoice;
  }

  async cancelInvoice(invoiceId: string, reason: string): Promise<{ success: boolean; invoice_number: string }> {
    if (isDemoMode()) {
      const inv = localDb.getInvoiceById(invoiceId);
      if (!inv) throw new Error('Invoice not found');
      inv.payment_status = 'cancelled';
      inv.cancelled_reason = reason;
      return { success: true, invoice_number: inv.invoice_number };
    }

    const { data, error } = await supabase.rpc('cancel_invoice', {
      p_invoice_id: invoiceId,
      p_reason: reason,
    });

    if (error) throw new Error(`Cancellation failed: ${error.message}`);
    return data;
  }

  async createSalesReturn(params: CreateSalesReturnParams): Promise<{ success: boolean; credit_note_number: string; total_amount: number }> {
    if (isDemoMode()) {
      return { success: true, credit_note_number: `CN-${Date.now()}`, total_amount: 100 };
    }

    const { data, error } = await supabase.rpc('create_sales_return', {
      p_branch_id: params.branchId,
      p_original_invoice_id: params.originalInvoiceId,
      p_items: params.items,
      p_reason: params.reason,
      p_refund_method: params.refundMethod,
    });

    if (error) throw new Error(`Sales return failed: ${error.message}`);
    return data;
  }

  async getSalesReturns(branchId?: string): Promise<SalesReturn[]> {
    if (isDemoMode()) return [];

    let q = supabase.from('sales_returns').select('*, items:sales_return_items(*)').order('return_date', { ascending: false });
    if (branchId && branchId !== 'all') q = q.eq('branch_id', branchId);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data as SalesReturn[];
  }

  async getDayBook(params?: { branchId?: string; date?: string; cashierId?: string }): Promise<DayBookData> {
    if (isDemoMode()) {
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

    const { data, error } = await supabase.rpc('get_day_book', {
      p_branch_id: params?.branchId && params.branchId !== 'all' ? params.branchId : null,
      p_date: params?.date || null,
      p_cashier_id: params?.cashierId || null,
    });

    if (error) throw new Error(`Failed to load Day Book: ${error.message}`);
    return data as DayBookData;
  }
}

// 4. CUSTOMER REPOSITORY
export class SupabaseCustomerRepository implements ICustomerRepository {
  async getCustomers(): Promise<Customer[]> {
    if (isDemoMode()) {
      return [
        {
          id: 'c-01',
          name: 'Rajesh Kumar Verma',
          phone: '9839012345',
          address: 'Hazratganj, Lucknow',
          credit_limit: 10000,
          outstanding_balance: 1450,
          loyalty_points: 120,
          is_active: true,
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
    }

    const { data, error } = await supabase.from('customers').select('*').is('deleted_at', null).order('name');
    if (error) throw new Error(error.message);
    return data as Customer[];
  }

  async getCustomerById(id: string): Promise<Customer | null> {
    if (isDemoMode()) return null;
    const { data } = await supabase.from('customers').select('*').eq('id', id).maybeSingle();
    return data as Customer;
  }

  async getCustomerByPhone(phone: string): Promise<Customer | null> {
    if (isDemoMode()) return null;
    if (!phone || !phone.trim()) return null;
    const { data } = await supabase.from('customers').select('*').eq('phone', phone.trim()).maybeSingle();
    return data as Customer;
  }

  async createCustomer(data: Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'version'>): Promise<Customer> {
    if (isDemoMode()) return { ...data, id: `cust-${Date.now()}`, version: 1, created_at: '', updated_at: '' };

    const { data: created, error } = await supabase.from('customers').insert(data).select().single();
    if (error) throw new Error(error.message);
    return created as Customer;
  }

  async updateCustomer(id: string, data: Partial<Customer>): Promise<Customer> {
    if (isDemoMode()) return { id, ...data } as Customer;

    const { data: updated, error } = await supabase.from('customers').update(data).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return updated as Customer;
  }

  async getCustomerLedger(customerId: string): Promise<CustomerLedgerEntry[]> {
    if (isDemoMode()) return [];

    const { data, error } = await supabase.from('customer_ledger').select('*').eq('customer_id', customerId).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data as CustomerLedgerEntry[];
  }

  async recordCustomerPayment(params: {
    customerId: string;
    amount: number;
    paymentMethod: string;
    reference?: string;
    notes?: string;
  }): Promise<{ success: boolean; new_balance: number }> {
    if (isDemoMode()) return { success: true, new_balance: 0 };

    const { data, error } = await supabase.rpc('record_customer_payment', {
      p_customer_id: params.customerId,
      p_amount: params.amount,
      p_payment_method: params.paymentMethod,
      p_reference: params.reference,
      p_notes: params.notes,
    });

    if (error) throw new Error(error.message);
    return data;
  }
}

// 5. SUPPLIER REPOSITORY
export class SupabaseSupplierRepository implements ISupplierRepository {
  async getSuppliers(): Promise<Supplier[]> {
    if (isDemoMode()) {
      return [
        {
          id: 's-01',
          name: 'Awadh Pharma Distributors',
          phone: '+91 522 220 8910',
          gstin: '09AABCA1234F1Z1',
          payment_terms_days: 30,
          opening_balance: 0,
          current_balance: 24500,
          is_active: true,
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
    }

    const { data, error } = await supabase.from('suppliers').select('*').is('deleted_at', null).order('name');
    if (error) throw new Error(error.message);
    return data as Supplier[];
  }

  async getSupplierById(id: string): Promise<Supplier | null> {
    if (isDemoMode()) return null;
    const { data } = await supabase.from('suppliers').select('*').eq('id', id).maybeSingle();
    return data as Supplier;
  }

  async createSupplier(data: Omit<Supplier, 'id' | 'created_at' | 'updated_at' | 'version'>): Promise<Supplier> {
    if (isDemoMode()) return { ...data, id: `supp-${Date.now()}`, version: 1, created_at: '', updated_at: '' };

    const { data: created, error } = await supabase.from('suppliers').insert(data).select().single();
    if (error) throw new Error(error.message);
    return created as Supplier;
  }

  async updateSupplier(id: string, data: Partial<Supplier>): Promise<Supplier> {
    if (isDemoMode()) return { id, ...data } as Supplier;

    const { data: updated, error } = await supabase.from('suppliers').update(data).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return updated as Supplier;
  }

  async getSupplierLedger(supplierId: string): Promise<SupplierLedgerEntry[]> {
    if (isDemoMode()) return [];

    const { data, error } = await supabase.from('supplier_ledger').select('*').eq('supplier_id', supplierId).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data as SupplierLedgerEntry[];
  }

  async recordSupplierPayment(params: {
    supplierId: string;
    amount: number;
    paymentMethod: string;
    reference?: string;
    notes?: string;
  }): Promise<{ success: boolean; new_balance: number }> {
    if (isDemoMode()) return { success: true, new_balance: 0 };

    const { data, error } = await supabase.rpc('record_supplier_payment', {
      p_supplier_id: params.supplierId,
      p_amount: params.amount,
      p_payment_method: params.paymentMethod,
      p_reference: params.reference,
      p_notes: params.notes,
    });

    if (error) throw new Error(error.message);
    return data;
  }
}

// 6. PURCHASE REPOSITORY
export class SupabasePurchaseRepository implements IPurchaseRepository {
  async getPurchaseInvoices(branchId?: string): Promise<PurchaseInvoice[]> {
    if (isDemoMode()) return [];

    let q = supabase.from('purchase_invoices').select('*, supplier:suppliers(*), items:purchase_items(*)').order('invoice_date', { ascending: false });
    if (branchId && branchId !== 'all') q = q.eq('branch_id', branchId);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data as PurchaseInvoice[];
  }

  async getPurchaseInvoiceById(id: string): Promise<PurchaseInvoice | null> {
    if (isDemoMode()) return null;
    const { data } = await supabase.from('purchase_invoices').select('*, supplier:suppliers(*), items:purchase_items(*)').eq('id', id).maybeSingle();
    return data as PurchaseInvoice;
  }

  async createPurchaseInvoice(params: CreatePurchaseParams): Promise<{ success: boolean; purchase_id: string; total_amount: number }> {
    if (isDemoMode()) return { success: true, purchase_id: `po-${Date.now()}`, total_amount: 5000 };

    const { data, error } = await supabase.rpc('create_purchase_invoice', {
      p_branch_id: params.branchId,
      p_supplier_id: params.supplierId,
      p_supplier_invoice_number: params.supplierInvoiceNumber,
      p_invoice_date: params.invoiceDate,
      p_items: params.items,
      p_bill_image_url: params.billImageUrl || null,
      p_notes: params.notes || null,
    });

    if (error) throw new Error(`Purchase creation failed: ${error.message}`);
    return data;
  }
}

// 7. DAY CLOSE & CASH REPOSITORY
export class SupabaseDayCloseRepository implements IDayCloseRepository {
  async getDayCloseRecords(branchId?: string): Promise<DayCloseRecord[]> {
    if (isDemoMode()) return [];

    let q = supabase.from('day_close').select('*').order('opened_at', { ascending: false });
    if (branchId && branchId !== 'all') q = q.eq('branch_id', branchId);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data as DayCloseRecord[];
  }

  async getTodayDayClose(branchId: string, counterId?: string): Promise<DayCloseRecord | null> {
    if (isDemoMode()) return null;

    let q = supabase.from('day_close').select('*').eq('branch_id', branchId).gte('opened_at', new Date().toISOString().split('T')[0]).maybeSingle();
    const { data } = await q;
    return data as DayCloseRecord;
  }

  async closeDay(params: {
    branchId: string;
    counterId?: string;
    actualCash: number;
    notes?: string;
  }): Promise<{ success: boolean; system_closing_cash: number; actual_closing_cash: number; difference: number }> {
    if (isDemoMode()) return { success: true, system_closing_cash: params.actualCash, actual_closing_cash: params.actualCash, difference: 0 };

    const { data, error } = await supabase.rpc('close_day', {
      p_branch_id: params.branchId,
      p_counter_id: params.counterId || null,
      p_actual_cash: params.actualCash,
      p_notes: params.notes || null,
    });

    if (error) throw new Error(error.message);
    return data;
  }

  async getExpenses(branchId?: string): Promise<ExpenseRecord[]> {
    if (isDemoMode()) return [];

    let q = supabase.from('expenses').select('*').order('created_at', { ascending: false });
    if (branchId && branchId !== 'all') q = q.eq('branch_id', branchId);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data as ExpenseRecord[];
  }

  async recordExpense(params: {
    branchId: string;
    category: string;
    amount: number;
    paymentMethod?: string;
    payee?: string;
    notes?: string;
  }): Promise<ExpenseRecord> {
    if (isDemoMode()) {
      return { id: `exp-${Date.now()}`, branch_id: params.branchId, category: params.category, amount: params.amount, payment_method: params.paymentMethod || 'cash', created_at: '' };
    }

    const { data, error } = await supabase.from('expenses').insert({
      branch_id: params.branchId,
      category: params.category,
      amount: params.amount,
      payment_method: params.paymentMethod || 'cash',
      payee: params.payee,
      notes: params.notes,
    }).select().single();

    if (error) throw new Error(error.message);
    return data as ExpenseRecord;
  }
}

// 8. DISCREPANCIES REPOSITORY
export class SupabaseDiscrepancyRepository implements IDiscrepancyRepository {
  async getDiscrepancies(branchId?: string): Promise<Discrepancy[]> {
    if (isDemoMode()) {
      return [
        {
          id: 'disc-01',
          branch_id: branchId,
          discrepancy_type: 'negative_stock',
          status: 'open',
          title: 'Stock oversold below zero on batch DL26B01',
          description: 'Offline counter C2 billed 15 pieces of Dolo 650 while physical stock was 10.',
          detected_at: new Date().toISOString(),
          client_record_id: 'LKO1-C2-2627-000042',
        },
      ];
    }

    let q = supabase.from('discrepancies').select('*').order('detected_at', { ascending: false });
    if (branchId && branchId !== 'all') q = q.eq('branch_id', branchId);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data as Discrepancy[];
  }

  async resolveDiscrepancy(params: { id: string; action: string; notes?: string }): Promise<{ success: boolean }> {
    if (isDemoMode()) return { success: true };

    const { error } = await supabase.from('discrepancies').update({
      status: 'resolved',
      resolution_action: params.action,
      resolution_notes: params.notes,
      resolved_at: new Date().toISOString(),
    }).eq('id', params.id);

    if (error) throw new Error(error.message);
    return { success: true };
  }
}

// 9. BUSINESS & SETTINGS REPOSITORY
export class SupabaseBusinessRepository implements IBusinessRepository {
  async getBusiness(): Promise<Business> {
    if (isDemoMode()) return localDb.getBusiness();

    const { data, error } = await supabase.from('businesses').select('*').single();
    if (error || !data) {
      throw new Error(`Failed to fetch business profile from Supabase: ${error?.message || 'No record found. Ensure migration 004 seed has run.'}`);
    }
    return data as Business;
  }

  async updateBusiness(data: Partial<Business>): Promise<Business> {
    if (isDemoMode()) return localDb.updateBusiness(data as any);

    const { data: updated, error } = await supabase.from('businesses').update(data).select().single();
    if (error) throw new Error(error.message);
    return updated as Business;
  }

  async getBranches(): Promise<Branch[]> {
    if (isDemoMode()) return localDb.getBranches();

    const { data, error } = await supabase.from('branches').select('*').order('branch_code');
    if (error) throw new Error(error.message);
    return data as Branch[];
  }

  async getCounters(branchId?: string): Promise<Counter[]> {
    if (isDemoMode()) {
      return [
        {
          id: 'cntr-01',
          branch_id: branchId || 'c0000000-0000-0000-0000-000000000001',
          counter_code: 'C1',
          counter_name: 'Counter 1 (Main Cash & POS)',
          invoice_prefix: 'LKO1',
          current_sequence: 1,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
    }

    let q = supabase.from('counters').select('*').order('counter_code');
    if (branchId && branchId !== 'all') q = q.eq('branch_id', branchId);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data as Counter[];
  }

  async createCounter(data: Omit<Counter, 'id' | 'created_at' | 'updated_at'>): Promise<Counter> {
    if (isDemoMode()) {
      return { ...data, id: `cntr-${Date.now()}`, created_at: '', updated_at: '' };
    }

    const { data: created, error } = await supabase.from('counters').insert(data).select().single();
    if (error) throw new Error(error.message);
    return created as Counter;
  }
}

// 10. REPORTS REPOSITORY
export class SupabaseReportsRepository implements IReportsRepository {
  async getGstr1Data(startDate: string, endDate: string, branchId?: string): Promise<{
    b2b_invoices: Array<Record<string, unknown>>;
    b2c_breakup: Array<Record<string, unknown>>;
    hsn_summary: Array<Record<string, unknown>>;
    totals: { taxable: number; cgst: number; sgst: number; igst: number; total_gst: number; grand_total: number };
  }> {
    if (isDemoMode()) {
      return {
        b2b_invoices: [],
        b2c_breakup: [
          { gst_rate: 12, taxable_amount: 10000, cgst_amount: 600, sgst_amount: 600, igst_amount: 0, total_amount: 11200 },
        ],
        hsn_summary: [
          { hsn_code: '3004', items_count: 5, total_pieces: 120, taxable_amount: 10000, gst_amount: 1200, total_amount: 11200 },
        ],
        totals: { taxable: 10000, cgst: 600, sgst: 600, igst: 0, total_gst: 1200, grand_total: 11200 },
      };
    }

    const { data, error } = await supabase.rpc('get_gstr1_data', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_branch_id: branchId && branchId !== 'all' ? branchId : null,
    });

    if (error) throw new Error(error.message);
    return data;
  }

  async getH1Register(branchId?: string): Promise<H1RegisterEntry[]> {
    if (isDemoMode()) return [];

    let q = supabase.from('h1_register').select('*').order('sale_date', { ascending: false });
    if (branchId && branchId !== 'all') q = q.eq('branch_id', branchId);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data as H1RegisterEntry[];
  }
}

// 11. SYNC REPOSITORY
export class SupabaseSyncRepository implements ISyncRepository {
  async pullChanges(sinceTimestamp: string, branchId: string): Promise<Record<string, unknown>> {
    if (isDemoMode()) return { server_timestamp: new Date().toISOString() };

    const { data, error } = await supabase.rpc('pull_changes', {
      p_since_timestamp: sinceTimestamp,
      p_branch_id: branchId,
    });

    if (error) throw new Error(error.message);
    return data;
  }

  async pushChanges(changes: Array<{ entity: string; payload: Record<string, unknown>; idempotency_key: string }>): Promise<{
    success: boolean;
    processed_records: number;
    discrepancies_flagged: number;
  }> {
    if (isDemoMode()) return { success: true, processed_records: changes.length, discrepancies_flagged: 0 };

    const { data, error } = await supabase.rpc('push_changes', {
      p_changes: changes,
    });

    if (error) throw new Error(error.message);
    return data;
  }
}
