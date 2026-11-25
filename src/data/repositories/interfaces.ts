/**
 * PharmaDesk Repository Interfaces
 * Complete Data-Access Abstraction Layer
 * Pages and hooks call ONLY these interfaces, never Supabase or SQLite directly.
 */

import {
  Medicine,
  InventoryBatch,
  BranchInventory,
  StockMovement,
  Invoice,
  InvoiceItem,
  PaymentRecord,
  Customer,
  CustomerLedgerEntry,
  Supplier,
  SupplierLedgerEntry,
  PurchaseInvoice,
  PurchaseItem,
  SalesReturn,
  Doctor,
  H1RegisterEntry,
  DayCloseRecord,
  ExpenseRecord,
  Discrepancy,
  Business,
  Branch,
  Counter,
  AuditLog,
  CartItem,
  PaymentMethod,
  PaymentSplit,
  DayBookData,
} from '@/types';

export interface CreateInvoiceParams {
  branchId: string;
  counterId?: string;
  customerName: string;
  customerPhone?: string;
  customerAge?: number;
  customerAddress?: string;
  customerId?: string;
  customerGstin?: string;
  customerStateCode?: string;
  doctorId?: string;
  doctorName?: string;
  doctorRegNo?: string;
  paymentMethod: PaymentMethod;
  paymentSplits?: PaymentSplit[];
  items: CartItem[];
  billDiscount?: number;
  notes?: string;
  deviceId?: string;
  idempotencyKey?: string;
}

export interface CreatePurchaseParams {
  branchId: string;
  supplierId: string;
  supplierInvoiceNumber: string;
  invoiceDate: string;
  items: Array<{
    medicine_id: string;
    batch_number: string;
    expiry_date: string;
    quantity_units: number;
    pieces_per_unit: number;
    free_quantity_units: number;
    purchase_rate: number;
    mrp: number;
    gst_rate: number;
    discount_percent: number;
  }>;
  billImageUrl?: string;
  notes?: string;
}

export interface CreateSalesReturnParams {
  branchId: string;
  originalInvoiceId: string;
  items: Array<{
    invoice_item_id: string;
    pieces_returned: number;
    restock: boolean;
  }>;
  reason: string;
  refundMethod: 'cash' | 'upi' | 'card' | 'store_credit';
}

export interface AdjustStockParams {
  branchId: string;
  medicineId: string;
  batchNumber: string;
  expiryDate: string;
  adjustmentType: 'add' | 'subtract' | 'set';
  quantityPieces: number;
  reason: string;
}

export interface IMedicineRepository {
  getMedicines(): Promise<Medicine[]>;
  getMedicineById(id: string): Promise<Medicine | null>;
  getMedicineByBarcode(barcode: string): Promise<Medicine | null>;
  searchMedicines(query: string): Promise<Medicine[]>;
  createMedicine(data: Omit<Medicine, 'id' | 'created_at' | 'updated_at'>): Promise<Medicine>;
  updateMedicine(id: string, data: Partial<Medicine>): Promise<Medicine>;
  deleteMedicine(id: string): Promise<void>; // Soft-deletes
}

export interface IInventoryRepository {
  getBranchInventory(branchId?: string): Promise<BranchInventory[]>;
  getInventoryBatches(branchId?: string, medicineId?: string): Promise<InventoryBatch[]>;
  getExpiringBatches(branchId?: string, daysThreshold?: number): Promise<InventoryBatch[]>;
  adjustStock(params: AdjustStockParams): Promise<{ success: boolean; newStock: number }>;
  transferStock(params: {
    sourceBranchId: string;
    destinationBranchId: string;
    items: Array<{ medicine_id: string; batch_number: string; expiry_date: string; pieces: number; mrp: number }>;
    notes?: string;
  }): Promise<{ transferNumber: string }>;
  getStockMovements(branchId?: string, medicineId?: string): Promise<StockMovement[]>;
}

export interface IInvoiceRepository {
  createInvoiceAtomic(params: CreateInvoiceParams): Promise<{
    success: boolean;
    invoice_id: string;
    invoice_number: string;
    grand_total: number;
    subtotal_taxable: number;
    total_gst: number;
    round_off: number;
  }>;
  getInvoices(branchId?: string): Promise<Invoice[]>;
  getInvoiceById(id: string): Promise<Invoice | null>;
  cancelInvoice(invoiceId: string, reason: string): Promise<{ success: boolean; invoice_number: string }>;
  createSalesReturn(params: CreateSalesReturnParams): Promise<{ success: boolean; credit_note_number: string; total_amount: number }>;
  getSalesReturns(branchId?: string): Promise<SalesReturn[]>;
  getDayBook(params?: { branchId?: string; date?: string; cashierId?: string }): Promise<DayBookData>;
}

export interface ICustomerRepository {
  getCustomers(): Promise<Customer[]>;
  getCustomerById(id: string): Promise<Customer | null>;
  getCustomerByPhone(phone: string): Promise<Customer | null>;
  createCustomer(data: Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'version'>): Promise<Customer>;
  updateCustomer(id: string, data: Partial<Customer>): Promise<Customer>;
  getCustomerLedger(customerId: string): Promise<CustomerLedgerEntry[]>;
  recordCustomerPayment(params: {
    customerId: string;
    amount: number;
    paymentMethod: string;
    reference?: string;
    notes?: string;
  }): Promise<{ success: boolean; new_balance: number }>;
}

export interface ISupplierRepository {
  getSuppliers(): Promise<Supplier[]>;
  getSupplierById(id: string): Promise<Supplier | null>;
  createSupplier(data: Omit<Supplier, 'id' | 'created_at' | 'updated_at' | 'version'>): Promise<Supplier>;
  updateSupplier(id: string, data: Partial<Supplier>): Promise<Supplier>;
  getSupplierLedger(supplierId: string): Promise<SupplierLedgerEntry[]>;
  recordSupplierPayment(params: {
    supplierId: string;
    amount: number;
    paymentMethod: string;
    reference?: string;
    notes?: string;
  }): Promise<{ success: boolean; new_balance: number }>;
}

export interface IPurchaseRepository {
  getPurchaseInvoices(branchId?: string): Promise<PurchaseInvoice[]>;
  getPurchaseInvoiceById(id: string): Promise<PurchaseInvoice | null>;
  createPurchaseInvoice(params: CreatePurchaseParams): Promise<{ success: boolean; purchase_id: string; total_amount: number }>;
}

export interface IDayCloseRepository {
  getDayCloseRecords(branchId?: string): Promise<DayCloseRecord[]>;
  getTodayDayClose(branchId: string, counterId?: string): Promise<DayCloseRecord | null>;
  closeDay(params: {
    branchId: string;
    counterId?: string;
    actualCash: number;
    notes?: string;
  }): Promise<{ success: boolean; system_closing_cash: number; actual_closing_cash: number; difference: number }>;
  getExpenses(branchId?: string): Promise<ExpenseRecord[]>;
  recordExpense(params: {
    branchId: string;
    category: string;
    amount: number;
    paymentMethod?: string;
    payee?: string;
    notes?: string;
  }): Promise<ExpenseRecord>;
}

export interface IDiscrepancyRepository {
  getDiscrepancies(branchId?: string): Promise<Discrepancy[]>;
  resolveDiscrepancy(params: {
    id: string;
    action: string;
    notes?: string;
  }): Promise<{ success: boolean }>;
}

export interface IBusinessRepository {
  getBusiness(): Promise<Business>;
  updateBusiness(data: Partial<Business>): Promise<Business>;
  getBranches(): Promise<Branch[]>;
  getCounters(branchId?: string): Promise<Counter[]>;
  createCounter(data: Omit<Counter, 'id' | 'created_at' | 'updated_at'>): Promise<Counter>;
}

export interface IReportsRepository {
  getGstr1Data(startDate: string, endDate: string, branchId?: string): Promise<{
    b2b_invoices: Array<Record<string, unknown>>;
    b2c_breakup: Array<Record<string, unknown>>;
    hsn_summary: Array<Record<string, unknown>>;
    totals: { taxable: number; cgst: number; sgst: number; igst: number; total_gst: number; grand_total: number };
  }>;
  getH1Register(branchId?: string): Promise<H1RegisterEntry[]>;
}

export interface ISyncRepository {
  pullChanges(sinceTimestamp: string, branchId: string): Promise<Record<string, unknown>>;
  pushChanges(changes: Array<{ entity: string; payload: Record<string, unknown>; idempotency_key: string }>): Promise<{
    success: boolean;
    processed_records: number;
    discrepancies_flagged: number;
  }>;
}
