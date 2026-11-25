-- ====================================================================
-- PHARMADESK — MIGRATION 019: REMOVE UNREFERENCED SEED/DEMO DATA
-- 1. Creates backup tables (_bak) before any deletion
-- 2. Purges unused seed suppliers, customers, doctors, batches, medicines
-- 3. Preserves all user-edited branches, counters, staff accounts,
--    and medicines/batches referenced by real invoices (e.g. Alprax 0.5mg)
-- ====================================================================

-- 1. Backup snapshots
CREATE TABLE IF NOT EXISTS public.suppliers_bak AS SELECT * FROM public.suppliers;
CREATE TABLE IF NOT EXISTS public.customers_bak AS SELECT * FROM public.customers;
CREATE TABLE IF NOT EXISTS public.doctors_bak AS SELECT * FROM public.doctors;
CREATE TABLE IF NOT EXISTS public.medicine_master_bak AS SELECT * FROM public.medicine_master;
CREATE TABLE IF NOT EXISTS public.medicine_barcodes_bak AS SELECT * FROM public.medicine_barcodes;
CREATE TABLE IF NOT EXISTS public.inventory_batches_bak AS SELECT * FROM public.inventory_batches;

-- 2. Remove Demo Suppliers (0 purchases or movements linked)
DELETE FROM public.suppliers
WHERE id IN (
    'e0000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000002',
    'e0000000-0000-0000-0000-000000000003'
)
AND id NOT IN (SELECT DISTINCT supplier_id FROM public.purchase_invoices WHERE supplier_id IS NOT NULL);

-- 3. Remove Demo Customers (0 invoices or ledger linked)
DELETE FROM public.customers
WHERE id IN (
    'f0000000-0000-0000-0000-000000000001',
    'f0000000-0000-0000-0000-000000000002',
    'f0000000-0000-0000-0000-000000000003'
)
AND id NOT IN (SELECT DISTINCT customer_id FROM public.invoices WHERE customer_id IS NOT NULL)
AND id NOT IN (SELECT DISTINCT customer_id FROM public.customer_ledger WHERE customer_id IS NOT NULL);

-- 4. Remove Demo Doctors (0 invoices or prescriptions linked)
DELETE FROM public.doctors
WHERE id IN (
    'a0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000002'
)
AND id NOT IN (SELECT DISTINCT doctor_id FROM public.invoices WHERE doctor_id IS NOT NULL);

-- 5. Remove Unused Demo Inventory Batches (batches never sold)
DELETE FROM public.inventory_batches
WHERE batch_number IN ('DL27A04', 'DL27A09', 'AUG26F12', 'AUG26E05', 'CET25Z99')
  AND id NOT IN (SELECT DISTINCT batch_id FROM public.invoice_items WHERE batch_id IS NOT NULL);

-- 6. Remove Unused Demo Medicine Barcodes
DELETE FROM public.medicine_barcodes
WHERE medicine_id IN (
    SELECT id FROM public.medicine_master
    WHERE id::text LIKE '10000000-0000-0000-0000-%'
      AND id NOT IN (SELECT DISTINCT medicine_id FROM public.invoice_items WHERE medicine_id IS NOT NULL)
);

-- 7. Remove Unused Demo Medicines from Medicine Master
DELETE FROM public.medicine_master
WHERE id::text LIKE '10000000-0000-0000-0000-%'
  AND id NOT IN (SELECT DISTINCT medicine_id FROM public.invoice_items WHERE medicine_id IS NOT NULL);

NOTIFY pgrst, 'reload schema';
