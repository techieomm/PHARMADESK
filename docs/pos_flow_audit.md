# PharmaDesk — End-to-End POS Data Flow & Architecture Audit

## 1. Flow Overview
```
[PosBilling UI]
   │
   ├─ 1. Cart Management: Barcode Scan / Name / Generic search
   ├─ 2. Validation: Stock availability, Expiry check, Schedule H/H1 Doctor info, Split payment match
   ├─ 3. Atomic Dispatch: repository.createInvoiceAtomic() / SupabaseRepository
   │
   ▼
[RPC: public.create_invoice_atomic] (SECURITY DEFINER, Postgres Transaction)
   │
   ├─ Step 1: Auth & Role check (auth.uid(), user must belong to branch unless master_admin)
   ├─ Step 2: Idempotency Key check (avoids double-billing on network lag/double-clicks)
   ├─ Step 3: Row-level lock on Branch (`public.branches FOR UPDATE`)
   ├─ Step 4: Indian Financial Year calculation (April 1 to March 31, e.g. 2627)
   ├─ Step 5: Counter row lock & gap-free sequence generation (e.g. AM-01-C1-2627-000001)
   ├─ Step 6: Interstate tax check (State code 09 = UP → CGST+SGST; other → IGST)
   ├─ Step 7: Insert `public.invoices` (header record with customer, totals, payment mode)
   ├─ Step 8: Item loop:
   │    ├─ Medicine lookup (`public.medicine_master`)
   │    ├─ Stock deduction & lock (`public.inventory_batches FOR UPDATE`)
   │    ├─ Back-calculated GST math (MRP inclusive: Taxable = Net / (1 + Rate/100))
   │    ├─ Insert `public.invoice_items`
   │    ├─ Insert `public.stock_movements` (movement_type = 'sale', negative qty)
   │    └─ If schedule_h1: Insert `public.h1_register` (patient name, address, doctor)
   ├─ Step 9: Bill discount application
   ├─ Step 10: Indian commercial round-off (50 paise rule) & Invoice totals update
   ├─ Step 10b: Synchronize customer profile (age, address, phone) if customer_id provided
   ├─ Step 11: Payment recording (`public.payment_records`)
   ├─ Step 12: If credit/udhaar: Update `public.customers.outstanding_balance` & log to `public.customer_ledger`
   └─ Step 13: Audit log write (`public.audit_logs`)
   │
   ▼
[Frontend UI Invalidation & Downstream Pages]
```

## 2. Downstream Consumption Matrix

| Page / Component | Tables Read | Trigger / Filter Criteria | Purpose |
| :--- | :--- | :--- | :--- |
| **PosBilling** (`/pos`) | `medicine_master`, `inventory_batches`, `customers`, `counters` | Branch ID, active stock, non-expired | Cart entry, batch selection, customer quick-fill |
| **InvoiceHistory** (`/invoices`) | `invoices`, `invoice_items`, `branches`, `profiles` | Branch ID (or all for admin), Date range, Cashier | Audit invoices, thermal receipt reprint, cancellation, return |
| **DayBook** (`/day-book`) *(New)* | `invoices`, `payment_records`, `customer_ledger`, `sales_returns` | IST calendar date (`Asia/Kolkata`), Branch, Cashier | Daily reconciliation, cash register, GST collected, mode split |
| **DayClose** (`/day-close`) | `invoices`, `payment_records`, `day_close` | Today's IST date, Branch ID, Cashier | Physical cash count vs expected, closing register snapshot |
| **Dashboard** (`/`) | `invoices`, `branches`, `branch_inventory` | Today vs Yesterday, 7-day trend | Executive KPI cards, sales trends, payment breakdown |
| **Reports** (`/reports`) | `invoices`, `invoice_items`, `h1_register` | Date range, GST rate slabs | GSTR-1 B2B / B2C tables, Schedule H1 statutory register |
| **LowStock** (`/low-stock`) | `inventory_batches`, `medicine_master` | Expiry within 90 days, or stock < min_stock_alert | Stock expiry warning, reorder alert |
| **BranchInventory** (`/inventory`) | `inventory_batches`, `medicine_master` | Branch ID, batch number | Batch inventory view, stock reconciliation |
| **StockOperations** (`/stock-operations`) | `inventory_batches`, `stock_movements`, `stock_transfers` | Branch ID | Inter-branch transfers, physical stock adjustments |
| **Customers** (`/customers`) | `customers`, `customer_ledger` | Business ID, outstanding_balance > 0 | Udhaar management, debt collection, ledger history |

## 3. Demo Data Identification Strategy

1. **Seed Business & Branches**:
   - `businesses`: `b0000000-0000-0000-0000-000000000001` (Bajrang Pharmacy). **KEPT** (User renamed branches under it).
   - `branches`: `c0000000-0000-0000-0000-000000000001` (Renamed by user to `AMBEDKARNAGAR BRANCH`, code: `AM`), `c0000000-0000-0000-0000-000000000002` (Renamed to `BRANCH2`). **KEPT**.
   - `counters`: `d0000000-0000-0000-0000-000000000001` through `0004`. **KEPT** (Essential counter anchors for gap-free sequence).
2. **Seed Suppliers**:
   - IDs: `e0000000-0000-0000-0000-000000000001` to `0003`.
   - Identification: Zero purchases or movements linked. **SAFE TO REMOVE**.
3. **Seed Customers**:
   - IDs: `f0000000-0000-0000-0000-000000000001` to `0003`.
   - Identification: Zero invoices linked (invoices used walk-in patient "omm"). **SAFE TO REMOVE**.
4. **Seed Doctors**:
   - IDs: `a0000000-0000-0000-0000-000000000001` to `0002`.
   - Identification: Zero prescription records linked. **SAFE TO REMOVE**.
5. **Seed Medicines & Batches**:
   - Total seed medicines: 20 (`10000000-0000-0000-0000-000000000001` to `0020`).
   - Medicines referenced by real invoices:
     - `10000000-0000-0000-0000-000000000014` (`Alprax 0.5mg`) and batch `ALP26K01` are used in user invoices `AM-01-C1-2627-000001` & `AM-01-C1-2627-000002`. **KEPT (User Invoices Reference)**.
     - `10000000-0000-0000-0000-000000000001` (`Dolo 650 Tablet`) and batch `DL26B01` are used in test invoice `LKO1-C1-2627-001001`. **KEPT (Referenced)**.
   - The other 18 medicines, barcodes, and 5 batches have 0 invoices and 0 movements. **SAFE TO REMOVE**.
