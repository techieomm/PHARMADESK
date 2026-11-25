# PharmaDesk — Enterprise Indian Retail Pharmacy Management System
**Client / Seed Entity**: Bajrang Pharmacy, Lucknow, Uttar Pradesh  
**GSTIN**: `09CMVPM3439A1ZS` (State Code 09 = Uttar Pradesh)  
**PAN**: `CMVPM3439A` (Derived from GSTIN characters 3..12)  
**Drug Licences**: Form 20B (`UP-LKO-20B-10928`) & Form 21B (`UP-LKO-21B-10929`)

---

## 1. Overview & Architecture

PharmaDesk is a production-grade pharmacy billing and enterprise dispensary management suite built for Indian retail pharmacies. It runs as a high-performance web application (React 18 + Vite + TypeScript + Tailwind CSS + Supabase Postgres) and is pre-architected for a standalone Windows offline `.exe` desktop terminal (Tauri 2.0 + SQLite).

### Key Architectural Pillars
- **Supabase Postgres Single Source of Truth**: All money-changing and stock-altering operations execute through Postgres `SECURITY DEFINER` atomic RPCs with row locking (`FOR UPDATE`) on invoice counters. Negative stock is strictly blocked at the database level.
- **Strict Production Mode (`VITE_DEMO_MODE=false`)**: Silent fallback to `localStorage`/`localDb` is strictly eliminated. If Supabase is unconfigured or credentials are placeholders, PharmaDesk displays a dedicated, non-bypassable setup screen with migration and connection instructions.
- **Secure RLS-Bypass for Authentication**: Employee ID login resolves via `public.lookup_employee_email(p_employee_id)` (`SECURITY DEFINER`), allowing unauthenticated (anon) clients on the login screen to resolve their email without exposing the sensitive `profiles` table to public read access.
- **Pure Core Domain Package (`src/core/*`)**: Zero-dependency domain math, tested with Vitest:
  - `gstEngine.ts`: Half-up rounding (`round2`), inclusive retail pricing, CGST/SGST/IGST breakdown, explicit `round_off` lines, and Indian numbering format to words (Lakhs and Crores).
  - `validation/gstin.ts`: 15-character Modulo 36 checksum verification, regex validation, state code lookup, and PAN extraction.
  - `fefo/fefoEngine.ts`: Automated First-Expiry-First-Out batch allocation, blocking expired items and alerting on stock expiring in <90 days.
  - `identifiers/uuid.ts`: RFC 9562 UUIDv7 generator for offline collision-free primary keys and idempotency tokens.
  - `invoice/series.ts`: Indian financial year code generator (`2627`) and gap-free counter sequence formatter (`LKO1-C1-2627-000001`).
- **Data Access Repository Layer (`src/data/repositories/*`)**: Clean inversion-of-control abstraction through `IMedicineRepository`, `IInventoryRepository`, `IPurchaseRepository`, etc. Facilitates transparent switching between `SupabaseRepository` and `LocalSqliteRepository`.
- **Keyboard-First & Barcode-Ready POS**: F-key shortcuts (`F1`–`F9`), USB barcode scanner interception (<35ms latency detection), GS1 DataMatrix parser, and Web Audio API synthesized acoustic feedback tones.
- **Statutory Drug Schedule Enforcement**: Compliant with Drugs and Cosmetics Rules (OTC, Schedule H, Schedule H1, Schedule X, Narcotic). Schedule H1 writes directly to the immutable `h1_register`.

---

## 2. Database Migrations

Database migrations are located in `supabase/migrations/` and must be executed in exact sequential order:

| # | Migration File | Description |
| :---: | :--- | :--- |
| **001** | `001_initial_schema.sql` | Base schema: `businesses`, `branches`, `medicines`, `branch_inventory`, `invoices`, `invoice_items`, `stock_movements`, `audit_logs`, base triggers & RLS. |
| **002** | `002_domain_schema.sql` | Domain extensions: `counters`, `medicine_barcodes`, `inventory_batches` (FEFO), `suppliers`, `supplier_ledger`, `customers`, `customer_ledger`, `doctors`, `prescriptions`, `h1_register`, `purchase_invoices`, `purchase_items`, `sales_returns`, `sales_return_items`, `stock_transfers`, `day_close`, `expenses`, `discrepancies`, and RLS policies on all new tables. |
| **003** | `003_rpcs.sql` | Atomic Postgres RPCs: `create_invoice_atomic`, `cancel_invoice`, `create_sales_return`, `create_purchase_invoice`, `create_purchase_return`, `record_customer_payment`, `record_supplier_payment`, `close_day`, `get_gstr1_data`, `pull_changes`, and `push_changes`. |
| **004** | `004_seed_bajrang_pharmacy.sql` | Seed data for Bajrang Pharmacy (Lucknow, UP, GSTIN `09CMVPM3439A1ZS`), 2 branches (`LKO1`, `LKO2`), 4 billing counters (`C1`, `C2`), 20+ realistic medicines across all drug schedules, opening batches with FEFO dates, suppliers, and customers. |
| **005** | `005_auth_rpc_and_admin_seed.sql` | Employee ID login resolver `public.lookup_employee_email(varchar)` with execution granted to `anon` and `authenticated`. Automated script to link initial Master Admin profile (`EMP001`) with Supabase Auth. |

---

## 3. Initial Master Admin Provisioning

PharmaDesk disables public user signups to protect internal pharmacy operations. Follow these steps to provision the initial Master Administrator:

1. **Create the User in Supabase Auth**:
   - In Supabase Dashboard, navigate to **Authentication** &rarr; **Users** &rarr; **Add User** &rarr; **Create User**.
   - Email: `admin@bajrangpharmacy.in`
   - Password: `admin123` (or your preferred secure master password)
   - Ensure **Auto Confirm User?** is checked.
2. **Link the Profile**:
   - Execute migration `005_auth_rpc_and_admin_seed.sql` in the Supabase SQL Editor.
   - The embedded idempotent block will locate `admin@bajrangpharmacy.in` in `auth.users` and link it to `public.profiles` as:
     - Employee ID: `EMP001`
     - Role: `master_admin`
     - Primary Branch: Hazratganj Flagship (`c0000000-0000-0000-0000-000000000001`)
     - Is Active: `TRUE`
3. **Sign In**:
   - Navigate to the login screen, choose **Employee ID**, enter `EMP001` and your chosen password.

---

## 4. Getting Started & Local Development

### 4.1 Prerequisites
- **Node.js**: v18.0.0 or later (Node 24 tested)
- **NPM**: v9.0.0 or later
- **Supabase Project**: Live cloud instance or local Supabase CLI

### 4.2 Environment Configuration
1. Clone the repository and navigate into the root directory:
   ```bash
   cd PHARMADESK
   ```
2. Copy the sample environment template:
   ```bash
   cp .env.example .env
   ```
3. Edit `.env` with your project's credentials:
   ```env
   # Live Supabase Connection
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key

   # Strict Production Settings
   VITE_DEMO_MODE=false
   VITE_DATA_PROVIDER=supabase

   # App Settings
   VITE_APP_NAME=PharmaDesk
   VITE_DEFAULT_CURRENCY=INR
   VITE_TIMEZONE=Asia/Kolkata
   ```
   *(Note: `.env` is gitignored and will never be committed to source control).*

### 4.3 Running the Development Server
```bash
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173).

---

## 5. Deployment Guide (Vercel & Netlify)

PharmaDesk is pre-configured for zero-configuration Single Page Application (SPA) deployments on Vercel and Netlify.

### 5.1 Vercel Deployment
1. Connect your Git repository to [Vercel](https://vercel.com).
2. The bundled `vercel.json` automatically configures Vite build settings and SPA rewrites (`/(.*)` &rarr; `/index.html`).
3. In **Project Settings** &rarr; **Environment Variables**, configure:
   - `VITE_SUPABASE_URL`: `https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: `<your-anon-jwt-key>`
   - `VITE_DEMO_MODE`: `false`
   - `VITE_DATA_PROVIDER`: `supabase`
4. Click **Deploy**.

### 5.2 Netlify Deployment
1. Connect your repository to [Netlify](https://netlify.com).
2. The bundled `netlify.toml` configures `npm run build`, publish directory `dist`, and SPA redirect rules (`/*` &rarr; `/index.html` 200).
3. In **Site Configuration** &rarr; **Environment Variables**, configure the same four environment variables.
4. Trigger site deployment.

---

## 6. End-to-End Operational Verification Checklist

Before releasing to pharmacy counter staff, verify the following core flows:

- [ ] **1. Login Authentication**:
  - Sign in with Employee ID `EMP001` and password &rarr; verifies `public.lookup_employee_email` RPC and Supabase Auth session creation.
  - Sign in with de-activated account &rarr; verified blocked with clear alert.
- [ ] **2. POS Billing & FEFO Batch Deduction**:
  - Add medicine with multiple active batches (e.g., Augmentin 625 Duo) to POS cart.
  - Complete checkout &rarr; verify `create_invoice_atomic` automatically allocates stock from earliest expiring batch first.
  - Verify expired batches are blocked from billing.
- [ ] **3. Negative Stock Prevention**:
  - Attempt to bill more pieces than available stock across all active batches.
  - Verify atomic RPC aborts the transaction with `INSUFFICIENT_STOCK`.
- [ ] **4. Statutory Drug Schedules**:
  - Add Schedule H / H1 / X medicine &rarr; verify Doctor name and Patient details are enforced before checkout.
  - Check `h1_register` &rarr; verify immutable audit record created automatically.
- [ ] **5. Customer Ledger & Credit Sales**:
  - Bill sale against registered customer with payment method `credit`.
  - Verify customer outstanding balance increases and transaction logs to `customer_ledger`.
- [ ] **6. Sales Return & Credit Note**:
  - Initiate return against an issued invoice.
  - Verify `create_sales_return` restores batch stock and issues gap-free credit note.
- [ ] **7. Purchase Inwarding**:
  - Record purchase invoice with batch number, expiry date, purchase rate, and MRP.
  - Verify `inventory_batches` are created/updated and `supplier_ledger` records credit entry.
- [ ] **8. Day Close & Cash Reconciliation**:
  - Perform Day Close &rarr; verify system aggregates collections by mode (Cash, UPI, Card, Credit) and records cash differences.
- [ ] **9. GST & GSTR-1 Reporting**:
  - Navigate to Reports &rarr; GSTR-1 Export.
  - Verify B2B, B2C (tax rate-wise), and HSN summary tables match the mathematical totals.

---

## 7. Testing & Quality Assurance

```bash
# Run Vitest unit tests (GST math, GSTIN validation, FEFO engine, GS1 parsing)
npm test

# Run strict TypeScript type check
node node_modules/typescript/bin/tsc --noEmit

# Run Vite production bundle build
npm run build
```

---

## 8. POS Billing Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| **F1** | Focus medicine search box |
| **F2** | Quick-add / search customer by phone or name |
| **F3** | Hold current cart (supports multiple open tabs) |
| **F4** | Resume held cart |
| **F5** | Select payment method (Cash / UPI / Card / Credit) |
| **F8** | Open Camera Barcode Scanner Modal |
| **F9** | Complete Checkout & Generate Tax Invoice (Atomic RPC) |
| **Escape** | Close open modals or clear current search |

---

## 9. Statutory Compliance Disclaimer

PharmaDesk is designed in strict compliance with the **Drugs and Cosmetics Act, 1940**, **Drugs and Cosmetics Rules, 1945**, and the **Central Goods and Services Tax Act, 2017**. Statutory tax rates, HSN codes, and drug schedules should be verified with the pharmacist-in-charge and chartered accountant.
