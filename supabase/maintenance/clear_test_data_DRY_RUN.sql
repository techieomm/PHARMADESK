-- ====================================================================
-- PHARMADESK — TEST DATA CLEARANCE DRY-RUN AUDIT
-- Purpose: Read-only query to inspect all test data to be wiped,
--          verified against tables and configurations to be kept.
-- Run in: Supabase SQL Editor (Read-only, NO mutations performed)
-- ====================================================================

-- 1. ROW COUNTS OF TABLES TARGETED FOR COMPLETE WIPEOUT
WITH wipe_targets AS (
    SELECT 'invoices' AS table_name, count(*) AS row_count FROM public.invoices
    UNION ALL SELECT 'invoice_items', count(*) FROM public.invoice_items
    UNION ALL SELECT 'payment_records', count(*) FROM public.payment_records
    UNION ALL SELECT 'sales_returns', count(*) FROM public.sales_returns
    UNION ALL SELECT 'sales_return_items', count(*) FROM public.sales_return_items
    UNION ALL SELECT 'inventory_batches', count(*) FROM public.inventory_batches
    UNION ALL SELECT 'stock_movements', count(*) FROM public.stock_movements
    UNION ALL SELECT 'branch_inventory', count(*) FROM public.branch_inventory
    UNION ALL SELECT 'stock_transfers', count(*) FROM public.stock_transfers
    UNION ALL SELECT 'stock_transfer_items', count(*) FROM public.stock_transfer_items
    UNION ALL SELECT 'medicine_master', count(*) FROM public.medicine_master
    UNION ALL SELECT 'medicine_barcodes', count(*) FROM public.medicine_barcodes
    UNION ALL SELECT 'medicine_price_history', count(*) FROM public.medicine_price_history
    UNION ALL SELECT 'purchase_invoices', count(*) FROM public.purchase_invoices
    UNION ALL SELECT 'purchase_items', count(*) FROM public.purchase_items
    UNION ALL SELECT 'suppliers', count(*) FROM public.suppliers
    UNION ALL SELECT 'supplier_ledger', count(*) FROM public.supplier_ledger
    UNION ALL SELECT 'customers', count(*) FROM public.customers
    UNION ALL SELECT 'customer_ledger', count(*) FROM public.customer_ledger
    UNION ALL SELECT 'doctors', count(*) FROM public.doctors
    UNION ALL SELECT 'prescriptions', count(*) FROM public.prescriptions
    UNION ALL SELECT 'h1_register', count(*) FROM public.h1_register
    UNION ALL SELECT 'audit_logs', count(*) FROM public.audit_logs
    UNION ALL SELECT 'day_close', count(*) FROM public.day_close
    UNION ALL SELECT 'expenses', count(*) FROM public.expenses
    UNION ALL SELECT 'discrepancies', count(*) FROM public.discrepancies
)
SELECT 
    table_name, 
    row_count, 
    'WILL BE WIPED (0 rows after execute)' AS planned_action 
FROM wipe_targets
ORDER BY table_name;

-- 2. ROW COUNTS OF CORE TABLES KEPT 100% INTACT
SELECT 'businesses' AS table_name, count(*) AS preserved_rows, 'PRESERVED' AS status FROM public.businesses
UNION ALL SELECT 'branches', count(*), 'PRESERVED' FROM public.branches
UNION ALL SELECT 'counters', count(*), 'PRESERVED (Sequence will reset to 1)' FROM public.counters
UNION ALL SELECT 'profiles', count(*), 'PRESERVED (Staff accounts kept)' FROM public.profiles
UNION ALL SELECT 'branch_memberships', count(*), 'PRESERVED' FROM public.branch_memberships
UNION ALL SELECT 'business_settings', count(*), 'PRESERVED' FROM public.business_settings;

-- 3. COUNTER SEQUENCES TO BE RESET TO 1
SELECT 
    c.id AS counter_id,
    c.counter_code,
    c.counter_name,
    b.branch_code,
    b.name AS branch_name,
    c.current_sequence AS current_seq,
    1 AS target_seq_after_wipe,
    (b.invoice_prefix || '-' || c.counter_code || '-2627-000001') AS next_first_invoice_preview
FROM public.counters c
JOIN public.branches b ON b.id = c.branch_id
ORDER BY b.branch_code, c.counter_code;

-- 4. BRANCH INVOICE SEQUENCES TO BE RESET TO 1
SELECT 
    id AS branch_id,
    branch_code,
    name AS branch_name,
    invoice_prefix,
    invoice_sequence AS current_branch_seq,
    1 AS target_seq_after_wipe
FROM public.branches
ORDER BY branch_code;

-- 5. STAFF PROFILES PRESERVED (FOR OWNER REVIEW)
SELECT 
    p.id AS profile_id,
    p.full_name,
    p.employee_id,
    p.system_role,
    b.name AS primary_branch_name,
    p.is_active,
    p.created_at,
    p.last_login_at
FROM public.profiles p
LEFT JOIN public.branches b ON b.id = p.primary_branch_id
ORDER BY p.created_at;
