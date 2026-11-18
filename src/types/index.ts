export type AppRole = 
  | 'master_admin'
  | 'sub_admin'
  | 'branch_manager'
  | 'inventory_manager'
  | 'billing_employee';

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

export interface SubAdminPermissions {
  view_branch_dashboard: boolean;
  manage_medicines: boolean;
  manage_inventory: boolean;
  view_invoices: boolean;
  access_billing: boolean;
  view_branch_reports: boolean;
  manage_permitted_employees: boolean;
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
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
  reference_id?: string;
  notes?: string;
  performed_by?: string;
  created_at: string;
  medicine?: Medicine;
  performer?: Profile;
}

export type PaymentMethod = 'cash' | 'upi' | 'card';

export interface Invoice {
  id: string;
  branch_id: string;
  invoice_number: string;
  invoice_date: string;
  customer_name: string;
  customer_phone: string;
  subtotal_taxable: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_gst: number;
  discount_amount: number;
  total_amount: number;
  payment_method: PaymentMethod;
  payment_status: 'paid' | 'cancelled';
  notes?: string;
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
  total_amount: number;
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

export interface AuditLog {
  id: string;
  business_id?: string;
  user_id?: string;
  user_email?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  details?: Record<string, any>;
  ip_address?: string;
  created_at: string;
}

export interface CartItem {
  medicine: Medicine;
  inventory?: BranchInventory;
  selected_unit: 'strip' | 'piece';
  unit_quantity: number;
  unit_price: number;
  item_total: number;
  available_pieces: number;
  required_pieces: number;
}

export type PrintFormat = 'thermal_80mm' | 'thermal_58mm' | 'a4';
