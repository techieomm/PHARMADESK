-- ====================================================================
-- PHARMADESK — DRY RUN: DEMO DATA IDENTIFICATION & SELECTION
-- Lists exactly which demo rows will be removed vs preserved
-- ====================================================================

-- 1. Demo Suppliers to delete (all 3 seed suppliers with 0 linked purchases)
SELECT 'suppliers_to_delete' AS target, id, name, gstin
FROM public.suppliers
WHERE id IN (
    'e0000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000002',
    'e0000000-0000-0000-0000-000000000003'
);

-- 2. Demo Customers to delete (all 3 seed customers with 0 linked invoices)
SELECT 'customers_to_delete' AS target, id, name, phone
FROM public.customers
WHERE id IN (
    'f0000000-0000-0000-0000-000000000001',
    'f0000000-0000-0000-0000-000000000002',
    'f0000000-0000-0000-0000-000000000003'
);

-- 3. Demo Doctors to delete (all 2 seed doctors with 0 linked invoices)
SELECT 'doctors_to_delete' AS target, id, full_name, registration_number
FROM public.doctors
WHERE id IN (
    'a0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000002'
);

-- 4. Unused Demo Inventory Batches to delete (batches with 0 sales/movements)
SELECT 'batches_to_delete' AS target, id, batch_number, stock_pieces, mrp
FROM public.inventory_batches
WHERE batch_number IN ('DL27A04', 'DL27A09', 'AUG26F12', 'AUG26E05', 'CET25Z99')
  AND id NOT IN (SELECT DISTINCT batch_id FROM public.invoice_items WHERE batch_id IS NOT NULL);

-- 5. Batches PRESERVED (linked to actual user/test invoices)
SELECT 'batches_preserved' AS target, id, batch_number, stock_pieces
FROM public.inventory_batches
WHERE id IN (SELECT DISTINCT batch_id FROM public.invoice_items WHERE batch_id IS NOT NULL);

-- 6. Unused Demo Medicines to delete (medicines with 0 invoice items linked)
SELECT 'medicines_to_delete' AS target, id, brand_name, barcode
FROM public.medicine_master
WHERE id LIKE '10000000-0000-0000-0000-%'
  AND id NOT IN (SELECT DISTINCT medicine_id FROM public.invoice_items WHERE medicine_id IS NOT NULL);

-- 7. Medicines PRESERVED (linked to actual user/test invoices)
SELECT 'medicines_preserved' AS target, id, brand_name
FROM public.medicine_master
WHERE id IN (SELECT DISTINCT medicine_id FROM public.invoice_items WHERE medicine_id IS NOT NULL);
