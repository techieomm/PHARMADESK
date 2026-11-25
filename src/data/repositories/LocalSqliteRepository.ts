/**
 * PharmaDesk Local SQLite Repository Stub
 * Designed for future Windows Desktop Application (Tauri 2.0 / Electron + SQLite).
 * All methods implement the repository interfaces with offline replication outbox logging.
 */

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

function throwSqliteStubError(feature: string): never {
  throw new Error(
    `[LocalSqliteRepository] ${feature} is a desktop offline feature. When packaging the Windows .exe with Tauri / better-sqlite3, this connects to the local SQLite database at %APPDATA%/PharmaDesk/pharmadesk.db. Refer to docs/DESKTOP_APP_PLAN.md for synchronization specifications.`
  );
}

export class LocalSqliteMedicineRepository implements IMedicineRepository {
  async getMedicines(): Promise<Medicine[]> {
    throwSqliteStubError('getMedicines');
  }
  async getMedicineById(): Promise<Medicine | null> {
    throwSqliteStubError('getMedicineById');
  }
  async getMedicineByBarcode(): Promise<Medicine | null> {
    throwSqliteStubError('getMedicineByBarcode');
  }
  async searchMedicines(): Promise<Medicine[]> {
    throwSqliteStubError('searchMedicines');
  }
  async createMedicine(): Promise<Medicine> {
    throwSqliteStubError('createMedicine');
  }
  async updateMedicine(): Promise<Medicine> {
    throwSqliteStubError('updateMedicine');
  }
  async deleteMedicine(): Promise<void> {
    throwSqliteStubError('deleteMedicine');
  }
}

export class LocalSqliteInventoryRepository implements IInventoryRepository {
  async getBranchInventory(): Promise<BranchInventory[]> {
    throwSqliteStubError('getBranchInventory');
  }
  async getInventoryBatches(): Promise<InventoryBatch[]> {
    throwSqliteStubError('getInventoryBatches');
  }
  async getExpiringBatches(): Promise<InventoryBatch[]> {
    throwSqliteStubError('getExpiringBatches');
  }
  async adjustStock(): Promise<{ success: boolean; newStock: number }> {
    throwSqliteStubError('adjustStock');
  }
  async transferStock(): Promise<{ transferNumber: string }> {
    throwSqliteStubError('transferStock');
  }
  async getStockMovements(): Promise<StockMovement[]> {
    throwSqliteStubError('getStockMovements');
  }
}

export class LocalSqliteInvoiceRepository implements IInvoiceRepository {
  async createInvoiceAtomic(): Promise<{
    success: boolean;
    invoice_id: string;
    invoice_number: string;
    grand_total: number;
    subtotal_taxable: number;
    total_gst: number;
    round_off: number;
  }> {
    throwSqliteStubError('createInvoiceAtomic');
  }
  async getInvoices(): Promise<Invoice[]> {
    throwSqliteStubError('getInvoices');
  }
  async getInvoiceById(): Promise<Invoice | null> {
    throwSqliteStubError('getInvoiceById');
  }
  async cancelInvoice(): Promise<{ success: boolean; invoice_number: string }> {
    throwSqliteStubError('cancelInvoice');
  }
  async createSalesReturn(): Promise<{ success: boolean; credit_note_number: string; total_amount: number }> {
    throwSqliteStubError('createSalesReturn');
  }
  async getSalesReturns(): Promise<SalesReturn[]> {
    throwSqliteStubError('getSalesReturns');
  }
  async getDayBook(): Promise<DayBookData> {
    throwSqliteStubError('getDayBook');
  }
}

export class LocalSqliteCustomerRepository implements ICustomerRepository {
  async getCustomers(): Promise<Customer[]> {
    throwSqliteStubError('getCustomers');
  }
  async getCustomerById(): Promise<Customer | null> {
    throwSqliteStubError('getCustomerById');
  }
  async getCustomerByPhone(): Promise<Customer | null> {
    throwSqliteStubError('getCustomerByPhone');
  }
  async createCustomer(): Promise<Customer> {
    throwSqliteStubError('createCustomer');
  }
  async updateCustomer(): Promise<Customer> {
    throwSqliteStubError('updateCustomer');
  }
  async getCustomerLedger(): Promise<CustomerLedgerEntry[]> {
    throwSqliteStubError('getCustomerLedger');
  }
  async recordCustomerPayment(): Promise<{ success: boolean; new_balance: number }> {
    throwSqliteStubError('recordCustomerPayment');
  }
}

export class LocalSqliteSupplierRepository implements ISupplierRepository {
  async getSuppliers(): Promise<Supplier[]> {
    throwSqliteStubError('getSuppliers');
  }
  async getSupplierById(): Promise<Supplier | null> {
    throwSqliteStubError('getSupplierById');
  }
  async createSupplier(): Promise<Supplier> {
    throwSqliteStubError('createSupplier');
  }
  async updateSupplier(): Promise<Supplier> {
    throwSqliteStubError('updateSupplier');
  }
  async getSupplierLedger(): Promise<SupplierLedgerEntry[]> {
    throwSqliteStubError('getSupplierLedger');
  }
  async recordSupplierPayment(): Promise<{ success: boolean; new_balance: number }> {
    throwSqliteStubError('recordSupplierPayment');
  }
}

export class LocalSqlitePurchaseRepository implements IPurchaseRepository {
  async getPurchaseInvoices(): Promise<PurchaseInvoice[]> {
    throwSqliteStubError('getPurchaseInvoices');
  }
  async getPurchaseInvoiceById(): Promise<PurchaseInvoice | null> {
    throwSqliteStubError('getPurchaseInvoiceById');
  }
  async createPurchaseInvoice(): Promise<{ success: boolean; purchase_id: string; total_amount: number }> {
    throwSqliteStubError('createPurchaseInvoice');
  }
}

export class LocalSqliteDayCloseRepository implements IDayCloseRepository {
  async getDayCloseRecords(): Promise<DayCloseRecord[]> {
    throwSqliteStubError('getDayCloseRecords');
  }
  async getTodayDayClose(): Promise<DayCloseRecord | null> {
    throwSqliteStubError('getTodayDayClose');
  }
  async closeDay(): Promise<{ success: boolean; system_closing_cash: number; actual_closing_cash: number; difference: number }> {
    throwSqliteStubError('closeDay');
  }
  async getExpenses(): Promise<ExpenseRecord[]> {
    throwSqliteStubError('getExpenses');
  }
  async recordExpense(): Promise<ExpenseRecord> {
    throwSqliteStubError('recordExpense');
  }
}

export class LocalSqliteDiscrepancyRepository implements IDiscrepancyRepository {
  async getDiscrepancies(): Promise<Discrepancy[]> {
    throwSqliteStubError('getDiscrepancies');
  }
  async resolveDiscrepancy(): Promise<{ success: boolean }> {
    throwSqliteStubError('resolveDiscrepancy');
  }
}

export class LocalSqliteBusinessRepository implements IBusinessRepository {
  async getBusiness(): Promise<Business> {
    throwSqliteStubError('getBusiness');
  }
  async updateBusiness(): Promise<Business> {
    throwSqliteStubError('updateBusiness');
  }
  async getBranches(): Promise<Branch[]> {
    throwSqliteStubError('getBranches');
  }
  async getCounters(): Promise<Counter[]> {
    throwSqliteStubError('getCounters');
  }
  async createCounter(): Promise<Counter> {
    throwSqliteStubError('createCounter');
  }
}

export class LocalSqliteReportsRepository implements IReportsRepository {
  async getGstr1Data(): Promise<any> {
    throwSqliteStubError('getGstr1Data');
  }
  async getH1Register(): Promise<H1RegisterEntry[]> {
    throwSqliteStubError('getH1Register');
  }
}

export class LocalSqliteSyncRepository implements ISyncRepository {
  async pullChanges(): Promise<Record<string, unknown>> {
    throwSqliteStubError('pullChanges');
  }
  async pushChanges(): Promise<{ success: boolean; processed_records: number; discrepancies_flagged: number }> {
    throwSqliteStubError('pushChanges');
  }
}
