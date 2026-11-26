export type AppRole = 
  | 'master_admin'
  | 'sub_admin'
  | 'branch_manager'
  | 'inventory_manager'
  | 'billing_employee'
  | 'prescription_employee';

export type DrugSchedule = 
  | 'otc'
  | 'schedule_h'
  | 'schedule_h1'
  | 'schedule_x'
  | 'narcotic';

export type PaymentMethod = 
  | 'cash' 
  | 'upi' 
  | 'card' 
  | 'credit' 
  | 'split';

export type DiscrepancyType = 
  | 'negative_stock' 
  | 'oversold_batch' 
  | 'price_mismatch' 
  | 'expired_sold' 
  | 'duplicate_customer' 
  | 'sequence_gap';

export type DiscrepancyStatus = 'open' | 'resolved' | 'ignored';

export interface Business {
  id: string;
  name: string;
  legal_name?: string;
  gstin?: string;
  pan?: string;
  drug_license?: string;
  phone?: string;
  email?: string;
  address?: string;
  currency: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface Branch {
  id: string;
  business_id: string;
  branch_code: string;
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email?: string;
  gstin?: string;
  drug_license: string;
  invoice_prefix: string;
  invoice_sequence: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Counter {
  id: string;
  branch_id: string;
  counter_code: string;
  counter_name: string;
  device_id?: string;
  invoice_prefix: string;
  current_sequence: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubAdminPermissions {
  view_branch_dashboard: boolean;
  manage_medicines: boolean;
  manage_inventory: boolean;
  view_invoices: boolean;
  access_billing: boolean;
  access_prescription_billing?: boolean;
  view_prescription_history?: boolean;
  manage_doctors?: boolean;
  view_branch_reports: boolean;
  manage_permitted_employees: boolean;
  must_change_password?: boolean;
  all?: boolean;
}

export interface Profile {
  id: string;
  business_id?: string;
  employee_id: string;
  full_name: string;
  email: string;
  phone?: string;
  role: AppRole;
  primary_branch_id?: string;
  is_active: boolean;
  permissions?: Partial<SubAdminPermissions>;
  created_at: string;
  updated_at: string;
  branch?: Branch;
}

export interface Medicine {
  id: string;
  business_id?: string;
  barcode?: string;
  brand_name: string;
  generic_name: string;
  composition?: string;
  strength?: string;
  dosage_form: string;
  manufacturer: string;
  packaging_label: string;
  pieces_per_strip: number;
  mrp: number;
  strip_selling_price: number;
  piece_selling_price: number;
  purchase_cost?: number;
  gst_rate: number;
  hsn_code?: string;
  min_stock_alert: number;
  drug_schedule?: DrugSchedule;
  prescription_required?: boolean;
  storage_location?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface MedicineBarcode {
  id: string;
  business_id?: string;
  medicine_id: string;
  barcode: string;
  unit_type: 'strip' | 'piece' | 'pack';
  is_primary: boolean;
  created_at: string;
  medicine?: Medicine;
}

export interface InventoryBatch {
  id: string;
  branch_id: string;
  medicine_id: string;
  batch_number: string;
  expiry_date: string; // YYYY-MM-DD
  stock_pieces: number;
  mrp: number;
  purchase_rate?: number;
  rack_location?: string;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  medicine?: Medicine;
}

export interface BranchInventory {
  id: string;
  branch_id: string;
  medicine_id: string;
  stock_pieces: number;
  rack_location?: string;
  batch_number?: string;
  expiry_date?: string;
  last_restocked_at?: string;
  updated_at: string;
  medicine?: Medicine;
  batches?: InventoryBatch[];
}

export interface StockMovement {
  id: string;
  branch_id: string;
  medicine_id: string;
  movement_type: 'purchase' | 'sale' | 'adjustment_add' | 'adjustment_sub' | 'return' | 'transfer';
  quantity_pieces: number;
  unit_used: 'strip' | 'piece';
  unit_quantity: number;
  balance_after_pieces: number;
  batch_number?: string;
  expiry_date?: string;
  counter_id?: string;
  device_id?: string;
  reference_id?: string;
  notes?: string;
  performed_by?: string;
  created_at: string;
  medicine?: Medicine;
  performer?: Profile;
}

export interface PaymentSplit {
  method: 'cash' | 'upi' | 'card' | 'credit';
  amount: number;
  reference?: string;
}

export interface Invoice {
  id: string;
  branch_id: string;
  counter_id?: string;
  device_id?: string;
  idempotency_key?: string;
  invoice_number: string;
  invoice_date: string;
  customer_id?: string;
  customer_name: string;
  customer_phone?: string;
  customer_age?: number;
  customer_address?: string;
  customer_gstin?: string;
  doctor_id?: string;
  doctor_name?: string;
  subtotal_taxable: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_gst: number;
  discount_amount: number;
  round_off?: number;
  total_amount: number;
  payment_method: PaymentMethod;
  payment_status: 'paid' | 'cancelled';
  payment_splits?: PaymentSplit[];
  is_interstate?: boolean;
  upi_reference?: string;
  notes?: string;
  cancelled_reason?: string;
  cancelled_at?: string;
  cancelled_by?: string;
  created_by?: string;
  created_at: string;
  branch?: Branch;
  items?: InvoiceItem[];
  creator?: Profile;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  medicine_id: string;
  medicine_name: string;
  selected_unit: 'strip' | 'piece';
  unit_quantity: number;
  pieces_count: number;
  unit_price: number;
  gst_rate: number;
  taxable_amount: number;
  gst_amount: number;
  cgst_rate?: number;
  sgst_rate?: number;
  igst_rate?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  total_amount: number;
  batch_id?: string;
  batch_number?: string;
  expiry_date?: string;
  hsn_code?: string;
  created_at: string;
}

export interface PaymentRecord {
  id: string;
  invoice_id: string;
  branch_id: string;
  payment_method: PaymentMethod;
  amount: number;
  transaction_reference?: string;
  status: 'success' | 'refunded';
  recorded_by?: string;
  created_at: string;
}

export interface Customer {
  id: string;
  business_id?: string;
  name: string;
  phone?: string;
  age?: number;
  address?: string;
  gstin?: string;
  state_code?: string;
  credit_limit: number;
  outstanding_balance: number;
  loyalty_points: number;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface CustomerLedgerEntry {
  id: string;
  business_id?: string;
  customer_id: string;
  entry_type: 'sale_credit' | 'payment_received' | 'credit_note' | 'adjustment';
  reference_id?: string;
  debit_amount: number;
  credit_amount: number;
  balance_after: number;
  payment_method?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
}

export interface Supplier {
  id: string;
  business_id?: string;
  name: string;
  legal_name?: string;
  gstin?: string;
  dl_number_20?: string;
  dl_number_21?: string;
  phone: string;
  email?: string;
  address?: string;
  state_code?: string;
  payment_terms_days: number;
  opening_balance: number;
  current_balance: number;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface SupplierLedgerEntry {
  id: string;
  business_id?: string;
  supplier_id: string;
  entry_type: 'purchase' | 'payment' | 'debit_note' | 'adjustment';
  reference_id?: string;
  debit_amount: number;
  credit_amount: number;
  balance_after: number;
  payment_method?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
}

export interface PurchaseInvoice {
  id: string;
  branch_id: string;
  supplier_id: string;
  supplier_invoice_number: string;
  invoice_date: string;
  received_date: string;
  subtotal_taxable: number;
  total_cgst: number;
  total_sgst: number;
  total_igst: number;
  total_gst: number;
  round_off: number;
  total_amount: number;
  payment_status: 'paid' | 'unpaid' | 'partial';
  bill_image_url?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  supplier?: Supplier;
  items?: PurchaseItem[];
}

export interface PurchaseItem {
  id: string;
  purchase_invoice_id: string;
  medicine_id: string;
  batch_number: string;
  expiry_date: string;
  unit_type: 'strip' | 'piece' | 'pack';
  quantity_units: number;
  pieces_per_unit: number;
  total_pieces: number;
  free_quantity_units: number;
  purchase_rate: number;
  mrp: number;
  discount_percent: number;
  gst_rate: number;
  taxable_amount: number;
  gst_amount: number;
  total_amount: number;
  hsn_code?: string;
  medicine?: Medicine;
}

export interface SalesReturn {
  id: string;
  branch_id: string;
  original_invoice_id: string;
  credit_note_number: string;
  return_date: string;
  customer_name: string;
  customer_phone: string;
  subtotal_taxable: number;
  total_cgst: number;
  total_sgst: number;
  total_igst: number;
  total_gst: number;
  total_amount: number;
  refund_method: 'cash' | 'upi' | 'card' | 'store_credit';
  refund_status: string;
  reason: string;
  is_stock_restocked: boolean;
  created_by?: string;
  created_at: string;
  items?: SalesReturnItem[];
}

export interface SalesReturnItem {
  id: string;
  sales_return_id: string;
  invoice_item_id?: string;
  medicine_id: string;
  batch_number: string;
  pieces_returned: number;
  unit_price: number;
  gst_rate: number;
  taxable_amount: number;
  gst_amount: number;
  total_amount: number;
  restock_status: 'restocked' | 'quarantined' | 'discarded';
  medicine?: Medicine;
}

export interface Doctor {
  id: string;
  business_id?: string;
  full_name: string;
  registration_number: string;
  specialization?: string;
  default_consultation_fee?: number;
  clinic_hospital_name?: string;
  phone?: string;
  qualification?: string;
  address?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SlipSequencePreview {
  serial_seq: number;
  serial_number: string;
  prescription_seq: number;
  prescription_number: string;
}

export interface PrescriptionSlip {
  id: string;
  business_id?: string;
  branch_id: string;
  serial_seq: number;
  serial_number: string;
  prescription_seq: number;
  prescription_number: string;
  patient_name: string;
  patient_phone?: string;
  patient_age?: number;
  patient_gender?: string;
  patient_address?: string;
  doctor_id: string;
  doctor_name: string;
  doctor_qualification?: string;
  doctor_registration_number?: string;
  consultation_fee: number;
  payment_method: 'cash' | 'upi' | 'card';
  payment_status: 'paid' | 'cancelled';
  notes?: string;
  slip_date: string;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
  branch?: Branch;
  doctor?: Doctor;
  creator?: Profile;
}

export interface ConsultationFeeRecord {
  id: string;
  business_id?: string;
  branch_id: string;
  prescription_slip_id: string;
  doctor_id: string;
  employee_id?: string;
  fee_amount: number;
  payment_method: 'cash' | 'upi' | 'card';
  status: 'collected' | 'cancelled';
  collected_at: string;
  created_at: string;
}

export interface H1RegisterEntry {
  id: string;
  branch_id: string;
  invoice_id: string;
  invoice_number: string;
  medicine_id: string;
  medicine_name: string;
  batch_number: string;
  quantity_pieces: number;
  patient_name: string;
  patient_address?: string;
  doctor_name: string;
  doctor_reg_no: string;
  sale_date: string;
  created_at: string;
}

export interface DayCloseRecord {
  id: string;
  branch_id: string;
  counter_id?: string;
  opening_cash: number;
  cash_sales: number;
  upi_sales: number;
  card_sales: number;
  credit_sales: number;
  cash_returns: number;
  cash_expenses: number;
  system_closing_cash: number;
  actual_closing_cash: number;
  difference: number;
  status: 'open' | 'closed';
  notes?: string;
  opened_by?: string;
  closed_by?: string;
  opened_at: string;
  closed_at?: string;
}

export interface ExpenseRecord {
  id: string;
  branch_id: string;
  day_close_id?: string;
  category: string;
  amount: number;
  payment_method: string;
  payee?: string;
  notes?: string;
  recorded_by?: string;
  created_at: string;
}

export interface Discrepancy {
  id: string;
  branch_id?: string;
  discrepancy_type: DiscrepancyType;
  status: DiscrepancyStatus;
  title: string;
  description: string;
  detected_at: string;
  client_record_id?: string;
  server_record_id?: string;
  payload?: Record<string, unknown>;
  resolution_action?: string;
  resolved_by?: string;
  resolved_at?: string;
  resolution_notes?: string;
}

export interface AuditLog {
  id: string;
  business_id?: string;
  user_id?: string;
  user_email?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  details?: Record<string, unknown>;
  ip_address?: string;
  created_at: string;
}

export interface CartItem {
  medicine: Medicine;
  inventory?: BranchInventory;
  selectedBatch?: InventoryBatch;
  selected_unit: 'strip' | 'piece';
  unit_quantity: number;
  unit_price: number;
  discount_amount?: number;
  item_total: number;
  available_pieces: number;
  required_pieces: number;
  warning?: string;
}

export type PrintFormat = 'thermal_80mm' | 'thermal_58mm' | 'a4';

export interface DayBookSummary {
  gross_sales_count: number;
  gross_sales_amount: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_gst: number;
  discount_amount: number;
  round_off: number;
  cash_collected: number;
  upi_collected: number;
  card_collected: number;
  total_collected: number;
  credit_given: number;
  credit_recovered: number;
  returns_count: number;
  returns_amount: number;
  returns_gst: number;
  cancelled_count: number;
  cancelled_amount: number;
  net_sales_amount: number;
  reconciliation_difference: number;
  is_balanced: boolean;
}

export interface DayBookInvoiceItem {
  id: string;
  invoice_number: string;
  invoice_date: string;
  customer_name: string;
  customer_phone?: string;
  payment_method: string;
  payment_status: string;
  subtotal_taxable: number;
  total_gst: number;
  round_off: number;
  total_amount: number;
  branch_name?: string;
  branch_code?: string;
  cashier_name?: string;
}

export interface DayBookCancelledItem {
  id: string;
  invoice_number: string;
  invoice_date: string;
  cancelled_at: string;
  cancelled_reason: string;
  customer_name: string;
  total_amount: number;
  branch_name?: string;
  branch_code?: string;
  cashier_name?: string;
}

export interface DayBookReturnItem {
  id: string;
  credit_note_number: string;
  customer_name: string;
  total_amount: number;
  refund_method: string;
  reason?: string;
  created_at: string;
  branch_name?: string;
}

export interface DayBookCustomerPaymentItem {
  id: string;
  customer_name: string;
  credit_amount: number;
  balance_after: number;
  payment_method?: string;
  notes?: string;
  created_at: string;
}

export interface DayBookPaymentRecordItem {
  id: string;
  payment_method: string;
  amount: number;
  transaction_reference?: string;
  status: string;
  created_at: string;
  invoice_id: string;
}

export interface DayBookData {
  success: boolean;
  date: string;
  timezone: string;
  branch_id?: string;
  summary: DayBookSummary;
  invoices: DayBookInvoiceItem[];
  returns: DayBookReturnItem[];
  cancelled_invoices: DayBookCancelledItem[];
  customer_payments: DayBookCustomerPaymentItem[];
  payment_records: DayBookPaymentRecordItem[];
}
