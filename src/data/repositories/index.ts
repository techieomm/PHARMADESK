/**
 * PharmaDesk Repository Provider & Factory
 * Central gateway to choose between Supabase and Local SQLite via runtime config.
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
} from './interfaces';

import {
  SupabaseMedicineRepository,
  SupabaseInventoryRepository,
  SupabaseInvoiceRepository,
  SupabaseCustomerRepository,
  SupabaseSupplierRepository,
  SupabasePurchaseRepository,
  SupabaseDayCloseRepository,
  SupabaseDiscrepancyRepository,
  SupabaseBusinessRepository,
  SupabaseReportsRepository,
  SupabaseSyncRepository,
} from './SupabaseRepository';

import {
  LocalSqliteMedicineRepository,
  LocalSqliteInventoryRepository,
  LocalSqliteInvoiceRepository,
  LocalSqliteCustomerRepository,
  LocalSqliteSupplierRepository,
  LocalSqlitePurchaseRepository,
  LocalSqliteDayCloseRepository,
  LocalSqliteDiscrepancyRepository,
  LocalSqliteBusinessRepository,
  LocalSqliteReportsRepository,
  LocalSqliteSyncRepository,
} from './LocalSqliteRepository';

export type RepositoryProviderType = 'supabase' | 'sqlite';

const PROVIDER_TYPE: RepositoryProviderType = 
  (import.meta.env.VITE_DATA_PROVIDER as RepositoryProviderType) || 'supabase';

export interface RepositoryBundle {
  medicines: IMedicineRepository;
  inventory: IInventoryRepository;
  invoices: IInvoiceRepository;
  customers: ICustomerRepository;
  suppliers: ISupplierRepository;
  purchases: IPurchaseRepository;
  dayClose: IDayCloseRepository;
  discrepancies: IDiscrepancyRepository;
  business: IBusinessRepository;
  reports: IReportsRepository;
  sync: ISyncRepository;
}

function createRepositories(type: RepositoryProviderType): RepositoryBundle {
  if (type === 'sqlite') {
    return {
      medicines: new LocalSqliteMedicineRepository(),
      inventory: new LocalSqliteInventoryRepository(),
      invoices: new LocalSqliteInvoiceRepository(),
      customers: new LocalSqliteCustomerRepository(),
      suppliers: new LocalSqliteSupplierRepository(),
      purchases: new LocalSqlitePurchaseRepository(),
      dayClose: new LocalSqliteDayCloseRepository(),
      discrepancies: new LocalSqliteDiscrepancyRepository(),
      business: new LocalSqliteBusinessRepository(),
      reports: new LocalSqliteReportsRepository(),
      sync: new LocalSqliteSyncRepository(),
    };
  }

  return {
    medicines: new SupabaseMedicineRepository(),
    inventory: new SupabaseInventoryRepository(),
    invoices: new SupabaseInvoiceRepository(),
    customers: new SupabaseCustomerRepository(),
    suppliers: new SupabaseSupplierRepository(),
    purchases: new SupabasePurchaseRepository(),
    dayClose: new SupabaseDayCloseRepository(),
    discrepancies: new SupabaseDiscrepancyRepository(),
    business: new SupabaseBusinessRepository(),
    reports: new SupabaseReportsRepository(),
    sync: new SupabaseSyncRepository(),
  };
}

export const repositories = createRepositories(PROVIDER_TYPE);

export * from './interfaces';
export * from './SupabaseRepository';
export * from './LocalSqliteRepository';
