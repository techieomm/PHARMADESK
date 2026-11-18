import { 
  Business, 
  Branch, 
  Profile, 
  Medicine, 
  BranchInventory, 
  StockMovement, 
  Invoice, 
  InvoiceItem, 
  PaymentRecord, 
  AuditLog,
  CartItem
} from '@/types';

const STORAGE_KEYS = {
  BUSINESSES: 'pharmadesk_businesses',
  BRANCHES: 'pharmadesk_branches',
  PROFILES: 'pharmadesk_profiles',
  MEDICINES: 'pharmadesk_medicines',
  INVENTORY: 'pharmadesk_inventory',
  STOCK_MOVEMENTS: 'pharmadesk_stock_movements',
  INVOICES: 'pharmadesk_invoices',
  INVOICE_ITEMS: 'pharmadesk_invoice_items',
  PAYMENTS: 'pharmadesk_payments',
  AUDIT_LOGS: 'pharmadesk_audit_logs',
  CURRENT_USER: 'pharmadesk_auth_user',
  INITIALIZED: 'pharmadesk_initialized_v1',
};

// Default System Entities (Business & Initial 2 Branches)
const DEFAULT_BUSINESS: Business = {
  id: 'b0000000-0000-0000-0000-000000000001',
  name: 'PharmaDesk Healthcare',
  legal_name: 'PharmaDesk Pharmacy Private Limited',
  gstin: '27AABCP1234F1Z5',
  pan: 'AABCP1234F',
  drug_license: 'MH-MZ2-123456 & MH-MZ2-654321',
  phone: '+91 98200 12345',
  email: 'contact@pharmadesk.local',
  address: 'Corporate Plaza, Bandra Kurla Complex, Mumbai, Maharashtra 400051',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const DEFAULT_BRANCHES: Branch[] = [
  {
    id: 'c0000000-0000-0000-0000-000000000001',
    business_id: 'b0000000-0000-0000-0000-000000000001',
    branch_code: 'BR01',
    name: 'PharmaDesk — Branch 01 (Central Dispensary)',
    address: 'Shop No. 4, Market Promenade, Station Road',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
    phone: '+91 98200 54321',
    email: 'branch01@pharmadesk.local',
    gstin: '27AABCP1234F1Z5',
    drug_license: 'MH-MZ2-123456',
    invoice_prefix: 'BR01',
    invoice_sequence: 1001,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'c0000000-0000-0000-0000-000000000002',
    business_id: 'b0000000-0000-0000-0000-000000000001',
    branch_code: 'BR02',
    name: 'PharmaDesk — Branch 02 (Metro Health Hub)',
    address: 'Plot 18, Commercial Block, Ring Road',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400053',
    phone: '+91 98200 67890',
    email: 'branch02@pharmadesk.local',
    gstin: '27AABCP1234F1Z5',
    drug_license: 'MH-MZ2-654321',
    invoice_prefix: 'BR02',
    invoice_sequence: 1001,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// Initial Master Admin profile
const DEFAULT_PROFILES: Profile[] = [
  {
    id: 'u0000000-0000-0000-0000-000000000001',
    business_id: 'b0000000-0000-0000-0000-000000000001',
    employee_id: 'EMP001',
    full_name: 'Master Admin',
    email: 'admin@pharmadesk.local',
    phone: '+91 98200 12345',
    role: 'master_admin',
    primary_branch_id: 'c0000000-0000-0000-0000-000000000001',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// Isomorphic storage helper (supports both browser localStorage and node test runner)
const memoryStorageMap = new Map<string, string>();
const storage = {
  getItem: (key: string): string | null => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return memoryStorageMap.get(key) || null;
  },
  setItem: (key: string, value: string): void => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    } else {
      memoryStorageMap.set(key, value);
    }
  },
  removeItem: (key: string): void => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    } else {
      memoryStorageMap.delete(key);
    }
  },
};

class LocalDatabaseService {
  constructor() {
    this.initDatabase();
  }

  private getItem<T>(key: string, defaultValue: T): T {
    try {
      const data = storage.getItem(key);
      return data ? JSON.parse(data) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  private setItem<T>(key: string, value: T): void {
    try {
      storage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error(`Error saving to storage [${key}]:`, e);
    }
  }

  public initDatabase(): void {
    if (!storage.getItem(STORAGE_KEYS.INITIALIZED)) {
      this.setItem(STORAGE_KEYS.BUSINESSES, [DEFAULT_BUSINESS]);
      this.setItem(STORAGE_KEYS.BRANCHES, DEFAULT_BRANCHES);
      this.setItem(STORAGE_KEYS.PROFILES, DEFAULT_PROFILES);
      this.setItem(STORAGE_KEYS.MEDICINES, []);
      this.setItem(STORAGE_KEYS.INVENTORY, []);
      this.setItem(STORAGE_KEYS.STOCK_MOVEMENTS, []);
      this.setItem(STORAGE_KEYS.INVOICES, []);
      this.setItem(STORAGE_KEYS.INVOICE_ITEMS, []);
      this.setItem(STORAGE_KEYS.PAYMENTS, []);
      this.setItem(STORAGE_KEYS.AUDIT_LOGS, []);
      storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
    }
  }

  // --- Businesses ---
  public getBusiness(): Business {
    const list = this.getItem<Business[]>(STORAGE_KEYS.BUSINESSES, [DEFAULT_BUSINESS]);
    return list[0] || DEFAULT_BUSINESS;
  }

  public updateBusiness(data: Partial<Business>): Business {
    const current = this.getBusiness();
    const updated = { ...current, ...data, updated_at: new Date().toISOString() };
    this.setItem(STORAGE_KEYS.BUSINESSES, [updated]);
    return updated;
  }

  // --- Branches ---
  public getBranches(): Branch[] {
    return this.getItem<Branch[]>(STORAGE_KEYS.BRANCHES, DEFAULT_BRANCHES);
  }

  public getBranchById(id: string): Branch | undefined {
    return this.getBranches().find(b => b.id === id);
  }

  public createBranch(branchData: Omit<Branch, 'id' | 'created_at' | 'updated_at' | 'invoice_sequence'>): Branch {
    const branches = this.getBranches();
    const newBranch: Branch = {
      ...branchData,
      id: crypto.randomUUID(),
      invoice_sequence: 1001,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    branches.push(newBranch);
    this.setItem(STORAGE_KEYS.BRANCHES, branches);
    return newBranch;
  }

  public updateBranch(id: string, branchData: Partial<Branch>): Branch {
    const branches = this.getBranches();
    const idx = branches.findIndex(b => b.id === id);
    if (idx === -1) throw new Error('Branch not found');
    branches[idx] = { ...branches[idx], ...branchData, updated_at: new Date().toISOString() };
    this.setItem(STORAGE_KEYS.BRANCHES, branches);
    return branches[idx];
  }

  // --- Profiles & Employees ---
  public getProfiles(): Profile[] {
    const profiles = this.getItem<Profile[]>(STORAGE_KEYS.PROFILES, DEFAULT_PROFILES);
    const branches = this.getBranches();
    return profiles.map(p => ({
      ...p,
      branch: branches.find(b => b.id === p.primary_branch_id),
    }));
  }

  public getProfileById(id: string): Profile | undefined {
    return this.getProfiles().find(p => p.id === id);
  }

  public getProfileByEmployeeId(empId: string): Profile | undefined {
    return this.getProfiles().find(p => p.employee_id.toUpperCase() === empId.trim().toUpperCase());
  }

  public createProfile(data: Omit<Profile, 'id' | 'created_at' | 'updated_at'>): Profile {
    const profiles = this.getProfiles();
    if (profiles.some(p => p.employee_id.toUpperCase() === data.employee_id.trim().toUpperCase())) {
      throw new Error(`Employee ID ${data.employee_id} already exists`);
    }
    if (profiles.some(p => p.email.toLowerCase() === data.email.trim().toLowerCase())) {
      throw new Error(`Email ${data.email} is already registered`);
    }

    const newProfile: Profile = {
      ...data,
      id: crypto.randomUUID(),
      employee_id: data.employee_id.trim().toUpperCase(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    profiles.push(newProfile);
    this.setItem(STORAGE_KEYS.PROFILES, profiles);
    return newProfile;
  }

  public updateProfile(id: string, data: Partial<Profile>): Profile {
    const profiles = this.getItem<Profile[]>(STORAGE_KEYS.PROFILES, DEFAULT_PROFILES);
    const idx = profiles.findIndex(p => p.id === id);
    if (idx === -1) throw new Error('Profile not found');
    profiles[idx] = { ...profiles[idx], ...data, updated_at: new Date().toISOString() };
    this.setItem(STORAGE_KEYS.PROFILES, profiles);
    return profiles[idx];
  }

  // --- Medicine Master ---
  public getMedicines(): Medicine[] {
    return this.getItem<Medicine[]>(STORAGE_KEYS.MEDICINES, []);
  }

  public getMedicineById(id: string): Medicine | undefined {
    return this.getMedicines().find(m => m.id === id);
  }

  public getMedicineByBarcode(barcode: string): Medicine | undefined {
    const clean = barcode.trim();
    if (!clean) return undefined;
    return this.getMedicines().find(m => m.barcode && m.barcode.trim() === clean);
  }

  public createMedicine(data: Omit<Medicine, 'id' | 'created_at' | 'updated_at'>): Medicine {
    const medicines = this.getMedicines();
    if (data.barcode && medicines.some(m => m.barcode && m.barcode === data.barcode)) {
      throw new Error(`Barcode ${data.barcode} is already assigned to another medicine`);
    }
    const newMedicine: Medicine = {
      ...data,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    medicines.unshift(newMedicine);
    this.setItem(STORAGE_KEYS.MEDICINES, medicines);
    return newMedicine;
  }

  public updateMedicine(id: string, data: Partial<Medicine>): Medicine {
    const medicines = this.getMedicines();
    const idx = medicines.findIndex(m => m.id === id);
    if (idx === -1) throw new Error('Medicine not found');
    medicines[idx] = { ...medicines[idx], ...data, updated_at: new Date().toISOString() };
    this.setItem(STORAGE_KEYS.MEDICINES, medicines);
    return medicines[idx];
  }

  // --- Branch Inventory ---
  public getInventory(branchId?: string): BranchInventory[] {
    const inventory = this.getItem<BranchInventory[]>(STORAGE_KEYS.INVENTORY, []);
    const medicines = this.getMedicines();
    const filtered = branchId ? inventory.filter(i => i.branch_id === branchId) : inventory;
    return filtered.map(item => ({
      ...item,
      medicine: medicines.find(m => m.id === item.medicine_id),
    }));
  }

  public getInventoryItem(branchId: string, medicineId: string): BranchInventory | undefined {
    const list = this.getInventory(branchId);
    return list.find(i => i.medicine_id === medicineId);
  }

  public adjustStockAtomic(params: {
    branchId: string;
    medicineId: string;
    adjustmentType: 'add' | 'set' | 'subtract';
    unit: 'strip' | 'piece';
    quantity: number;
    notes?: string;
    performedByUserId?: string;
    batchNumber?: string;
    expiryDate?: string;
  }): { success: boolean; newStockPieces: number } {
    const medicines = this.getMedicines();
    const med = medicines.find(m => m.id === params.medicineId);
    if (!med) throw new Error('Medicine not found');

    const piecesPerStrip = med.pieces_per_strip || 10;
    const deltaPieces = params.unit === 'strip' 
      ? Math.round(params.quantity * piecesPerStrip)
      : Math.round(params.quantity);

    const inventoryList = this.getItem<BranchInventory[]>(STORAGE_KEYS.INVENTORY, []);
    let item = inventoryList.find(i => i.branch_id === params.branchId && i.medicine_id === params.medicineId);

    if (!item) {
      item = {
        id: crypto.randomUUID(),
        branch_id: params.branchId,
        medicine_id: params.medicineId,
        stock_pieces: 0,
        updated_at: new Date().toISOString(),
      };
      inventoryList.push(item);
    }

    let newStock = item.stock_pieces;
    if (params.adjustmentType === 'add') {
      newStock += deltaPieces;
    } else if (params.adjustmentType === 'subtract') {
      if (item.stock_pieces < deltaPieces) {
        throw new Error(`Insufficient stock. Available: ${item.stock_pieces} pieces, Requested to subtract: ${deltaPieces} pieces`);
      }
      newStock -= deltaPieces;
    } else if (params.adjustmentType === 'set') {
      newStock = deltaPieces;
    }

    item.stock_pieces = newStock;
    if (params.batchNumber) item.batch_number = params.batchNumber;
    if (params.expiryDate) item.expiry_date = params.expiryDate;
    item.last_restocked_at = new Date().toISOString();
    item.updated_at = new Date().toISOString();

    this.setItem(STORAGE_KEYS.INVENTORY, inventoryList);

    // Record Stock Movement
    const movements = this.getItem<StockMovement[]>(STORAGE_KEYS.STOCK_MOVEMENTS, []);
    const movement: StockMovement = {
      id: crypto.randomUUID(),
      branch_id: params.branchId,
      medicine_id: params.medicineId,
      movement_type: `adjustment_${params.adjustmentType}` as any,
      quantity_pieces: params.adjustmentType === 'subtract' ? -deltaPieces : deltaPieces,
      unit_used: params.unit,
      unit_quantity: params.quantity,
      balance_after_pieces: newStock,
      notes: params.notes || `Stock ${params.adjustmentType} via Inventory Manager`,
      performed_by: params.performedByUserId,
      created_at: new Date().toISOString(),
    };
    movements.unshift(movement);
    this.setItem(STORAGE_KEYS.STOCK_MOVEMENTS, movements);

    return { success: true, newStockPieces: newStock };
  }

  // --- Invoicing & Billing (Atomic) ---
  public getInvoices(branchId?: string): Invoice[] {
    const invoices = this.getItem<Invoice[]>(STORAGE_KEYS.INVOICES, []);
    const items = this.getItem<InvoiceItem[]>(STORAGE_KEYS.INVOICE_ITEMS, []);
    const branches = this.getBranches();
    const profiles = this.getProfiles();

    const filtered = branchId ? invoices.filter(inv => inv.branch_id === branchId) : invoices;
    return filtered.map(inv => ({
      ...inv,
      branch: branches.find(b => b.id === inv.branch_id),
      creator: profiles.find(p => p.id === inv.created_by),
      items: items.filter(it => it.invoice_id === inv.id),
    })).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public getInvoiceById(id: string): Invoice | undefined {
    return this.getInvoices().find(i => i.id === id);
  }

  public createInvoiceAtomic(params: {
    branchId: string;
    customerName: string;
    customerPhone: string;
    paymentMethod: 'cash' | 'upi' | 'card';
    items: CartItem[];
    notes?: string;
    userId: string;
  }): { invoice: Invoice; invoiceNumber: string } {
    if (!params.items || params.items.length === 0) {
      throw new Error('Cannot generate an invoice with empty cart');
    }

    const branches = this.getBranches();
    const branch = branches.find(b => b.id === params.branchId);
    if (!branch) throw new Error('Branch not found');

    const inventoryList = this.getItem<BranchInventory[]>(STORAGE_KEYS.INVENTORY, []);
    const medicines = this.getMedicines();

    // 1. Stock verification & calculation pass
    let subtotalTaxable = 0;
    let totalGst = 0;
    let grandTotal = 0;
    const preparedItems: Omit<InvoiceItem, 'id' | 'invoice_id' | 'created_at'>[] = [];

    for (const item of params.items) {
      const med = medicines.find(m => m.id === item.medicine.id);
      if (!med) throw new Error(`Medicine ${item.medicine.brand_name} not found`);

      const piecesPerStrip = med.pieces_per_strip || 10;
      const piecesNeeded = item.selected_unit === 'strip' 
        ? Math.round(item.unit_quantity * piecesPerStrip)
        : Math.round(item.unit_quantity);

      const invRecord = inventoryList.find(i => i.branch_id === params.branchId && i.medicine_id === med.id);
      const availablePieces = invRecord ? invRecord.stock_pieces : 0;

      if (availablePieces < piecesNeeded) {
        throw new Error(
          `Insufficient stock for "${med.brand_name}". Available: ${availablePieces} pieces (${Math.floor(availablePieces / piecesPerStrip)} strips), Required: ${piecesNeeded} pieces`
        );
      }

      const unitPrice = item.selected_unit === 'strip' ? med.strip_selling_price : med.piece_selling_price;
      const lineTotal = Number((unitPrice * item.unit_quantity).toFixed(2));
      const taxable = Number((lineTotal / (1 + (med.gst_rate / 100))).toFixed(2));
      const lineGst = Number((lineTotal - taxable).toFixed(2));

      subtotalTaxable += taxable;
      totalGst += lineGst;
      grandTotal += lineTotal;

      preparedItems.push({
        medicine_id: med.id,
        medicine_name: med.brand_name,
        selected_unit: item.selected_unit,
        unit_quantity: item.unit_quantity,
        pieces_count: piecesNeeded,
        unit_price: unitPrice,
        gst_rate: med.gst_rate,
        taxable_amount: taxable,
        gst_amount: lineGst,
        total_amount: lineTotal,
      });
    }

    // 2. Generate Invoice Number
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seq = branch.invoice_sequence || 1001;
    const invoiceNumber = `${branch.invoice_prefix}-${today}-${String(seq).padStart(5, '0')}`;
    branch.invoice_sequence = seq + 1;
    this.setItem(STORAGE_KEYS.BRANCHES, branches);

    const invoiceId = crypto.randomUUID();
    const halfGst = Number((totalGst / 2).toFixed(2));

    const newInvoice: Invoice = {
      id: invoiceId,
      branch_id: params.branchId,
      invoice_number: invoiceNumber,
      invoice_date: new Date().toISOString(),
      customer_name: params.customerName.trim(),
      customer_phone: params.customerPhone.trim(),
      subtotal_taxable: Number(subtotalTaxable.toFixed(2)),
      cgst_amount: halfGst,
      sgst_amount: Number((totalGst - halfGst).toFixed(2)),
      igst_amount: 0,
      total_gst: Number(totalGst.toFixed(2)),
      discount_amount: 0,
      total_amount: Number(grandTotal.toFixed(2)),
      payment_method: params.paymentMethod,
      payment_status: 'paid',
      notes: params.notes,
      created_by: params.userId,
      created_at: new Date().toISOString(),
    };

    // 3. Save Invoice
    const invoices = this.getItem<Invoice[]>(STORAGE_KEYS.INVOICES, []);
    invoices.unshift(newInvoice);
    this.setItem(STORAGE_KEYS.INVOICES, invoices);

    // 4. Save Invoice Items
    const allInvoiceItems = this.getItem<InvoiceItem[]>(STORAGE_KEYS.INVOICE_ITEMS, []);
    const savedItems: InvoiceItem[] = preparedItems.map(it => ({
      ...it,
      id: crypto.randomUUID(),
      invoice_id: invoiceId,
      created_at: new Date().toISOString(),
    }));
    this.setItem(STORAGE_KEYS.INVOICE_ITEMS, [...savedItems, ...allInvoiceItems]);

    // 5. Deduct inventory & log stock movements
    const movements = this.getItem<StockMovement[]>(STORAGE_KEYS.STOCK_MOVEMENTS, []);
    for (const it of preparedItems) {
      const invRecord = inventoryList.find(i => i.branch_id === params.branchId && i.medicine_id === it.medicine_id)!;
      invRecord.stock_pieces -= it.pieces_count;
      invRecord.updated_at = new Date().toISOString();

      movements.unshift({
        id: crypto.randomUUID(),
        branch_id: params.branchId,
        medicine_id: it.medicine_id,
        movement_type: 'sale',
        quantity_pieces: -it.pieces_count,
        unit_used: it.selected_unit,
        unit_quantity: it.unit_quantity,
        balance_after_pieces: invRecord.stock_pieces,
        reference_id: invoiceNumber,
        notes: `POS Bill Sale #${invoiceNumber}`,
        performed_by: params.userId,
        created_at: new Date().toISOString(),
      });
    }
    this.setItem(STORAGE_KEYS.INVENTORY, inventoryList);
    this.setItem(STORAGE_KEYS.STOCK_MOVEMENTS, movements);

    // 6. Record Payment
    const payments = this.getItem<PaymentRecord[]>(STORAGE_KEYS.PAYMENTS, []);
    payments.unshift({
      id: crypto.randomUUID(),
      invoice_id: invoiceId,
      branch_id: params.branchId,
      payment_method: params.paymentMethod,
      amount: newInvoice.total_amount,
      status: 'success',
      recorded_by: params.userId,
      created_at: new Date().toISOString(),
    });
    this.setItem(STORAGE_KEYS.PAYMENTS, payments);

    // 7. Audit Log
    this.addAuditLog({
      action: 'CREATE_INVOICE',
      entity_type: 'INVOICE',
      entity_id: invoiceNumber,
      user_id: params.userId,
      details: {
        total: newInvoice.total_amount,
        customer: newInvoice.customer_name,
        branch: branch.name,
      },
    });

    return {
      invoice: {
        ...newInvoice,
        branch,
        items: savedItems,
      },
      invoiceNumber,
    };
  }

  // --- Stock Movements ---
  public getStockMovements(branchId?: string, medicineId?: string): StockMovement[] {
    const movements = this.getItem<StockMovement[]>(STORAGE_KEYS.STOCK_MOVEMENTS, []);
    const medicines = this.getMedicines();
    const profiles = this.getProfiles();

    return movements
      .filter(m => (!branchId || m.branch_id === branchId) && (!medicineId || m.medicine_id === medicineId))
      .map(m => ({
        ...m,
        medicine: medicines.find(med => med.id === m.medicine_id),
        performer: profiles.find(p => p.id === m.performed_by),
      }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // --- Audit Logs ---
  public getAuditLogs(): AuditLog[] {
    return this.getItem<AuditLog[]>(STORAGE_KEYS.AUDIT_LOGS, []);
  }

  public addAuditLog(log: Omit<AuditLog, 'id' | 'created_at'>): void {
    const logs = this.getItem<AuditLog[]>(STORAGE_KEYS.AUDIT_LOGS, []);
    logs.unshift({
      ...log,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    });
    this.setItem(STORAGE_KEYS.AUDIT_LOGS, logs);
  }
}

export const localDb = new LocalDatabaseService();
