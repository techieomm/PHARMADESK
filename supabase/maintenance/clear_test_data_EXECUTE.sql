-- ====================================================================
-- PHARMADESK — TEST DATA PURGE & CLEAN OWNER HANDOVER EXECUTE SCRIPT
-- Purpose: Permanently wipes all transactional and master test records,
--          resets invoice series to 1, and verifies a 100% clean state.
-- Target: Supabase SQL Editor (Run as postgres/service_role)
-- CAUTION: Destructive operation. Ensure backup_pre_handover.sql has run.
-- ====================================================================

-- STEP 1: SAFETY CONFIRMATION GUARD
-- Uncomment the following line to authorize execution:
-- SET app.confirm_wipe = 'YES';

DO $$
BEGIN
    IF current_setting('app.confirm_wipe', true) IS DISTINCT FROM 'YES' THEN
        RAISE EXCEPTION 'SAFETY GUARD: Test data purge aborted. You must uncomment "SET app.confirm_wipe = ''YES'';" at the top of this script to proceed.';
    END IF;
END $$;

BEGIN;

-- STEP 2: CHILD TRANSACTIONS & SALES RETURNS
DELETE FROM public.sales_return_items;
DELETE FROM public.sales_returns;

-- STEP 3: BILLING, INVOICES & COMPLIANCE REGISTERS
DELETE FROM public.h1_register;
DELETE FROM public.payment_records;
DELETE FROM public.invoice_items;
DELETE FROM public.invoices;

-- STEP 4: STOCK TRANSFERS
DELETE FROM public.stock_transfer_items;
DELETE FROM public.stock_transfers;

-- STEP 5: STOCK MOVEMENTS & INVENTORY BATCHES
DELETE FROM public.stock_movements;
DELETE FROM public.branch_inventory;
DELETE FROM public.inventory_batches;

-- STEP 6: PURCHASES & SUPPLIER INVOICES
DELETE FROM public.purchase_items;
DELETE FROM public.purchase_invoices;

-- STEP 7: MEDICINE CATALOG & BARCODES
DELETE FROM public.medicine_price_history;
DELETE FROM public.medicine_barcodes;
DELETE FROM public.medicine_master;

-- STEP 8: LEDGERS & PRESCRIPTIONS
DELETE FROM public.customer_ledger;
DELETE FROM public.supplier_ledger;
DELETE FROM public.prescriptions;

-- STEP 9: PARTIES (CUSTOMERS, SUPPLIERS, DOCTORS)
DELETE FROM public.customers;
DELETE FROM public.suppliers;
DELETE FROM public.doctors;

-- STEP 10: BOOKS, EXPENSES, DISCREPANCIES & AUDIT LOGS
DELETE FROM public.expenses;
DELETE FROM public.day_close;
DELETE FROM public.discrepancies;
DELETE FROM public.audit_logs;

-- STEP 11: DROP LEFTOVER TEMPORARY SEED BACKUP TABLES (IF PRESENT IN PUBLIC)
DROP TABLE IF EXISTS public.customers_bak CASCADE;
DROP TABLE IF EXISTS public.doctors_bak CASCADE;
DROP TABLE IF EXISTS public.inventory_batches_bak CASCADE;
DROP TABLE IF EXISTS public.medicine_barcodes_bak CASCADE;
DROP TABLE IF EXISTS public.medicine_master_bak CASCADE;
DROP TABLE IF EXISTS public.suppliers_bak CASCADE;

-- STEP 12: RESET BILLING SEQUENCES TO 1 FOR FIRST REAL INVOICE (e.g. AM-01-C1-2627-000001)
UPDATE public.counters 
SET current_sequence = 1, 
    updated_at = NOW();

UPDATE public.branches 
SET invoice_sequence = 1, 
    updated_at = NOW();

-- STEP 13: POST-WIPE INTEGRITY ASSERTIONS
DO $$
DECLARE
    r RECORD;
    v_cnt BIGINT;
    v_seq_cnt BIGINT;
    v_profiles_cnt BIGINT;
    v_branches_cnt BIGINT;
    v_businesses_cnt BIGINT;
    v_counters_cnt BIGINT;
BEGIN
    -- A. Assert zero rows in all wiped tables
    FOR r IN (
        SELECT unnest(ARRAY[
            'invoices', 'invoice_items', 'payment_records', 'sales_returns', 'sales_return_items',
            'inventory_batches', 'stock_movements', 'branch_inventory', 'stock_transfers', 'stock_transfer_items',
            'medicine_master', 'medicine_barcodes', 'medicine_price_history',
            'purchase_invoices', 'purchase_items', 'suppliers', 'supplier_ledger',
            'customers', 'customer_ledger', 'doctors', 'prescriptions',
            'h1_register', 'audit_logs', 'day_close', 'expenses', 'discrepancies'
        ]) AS tbl
    ) LOOP
        EXECUTE format('SELECT count(*) FROM public.%I', r.tbl) INTO v_cnt;
        IF v_cnt > 0 THEN
            RAISE EXCEPTION 'POST-WIPE ASSERTION FAILED: Table % still contains % rows!', r.tbl, v_cnt;
        END IF;
    END LOOP;

    -- B. Assert all counters are reset to sequence 1
    SELECT count(*) INTO v_seq_cnt FROM public.counters WHERE current_sequence <> 1;
    IF v_seq_cnt > 0 THEN
        RAISE EXCEPTION 'POST-WIPE ASSERTION FAILED: Found % counters with sequence <> 1!', v_seq_cnt;
    END IF;

    -- C. Assert all branches are reset to invoice sequence 1
    SELECT count(*) INTO v_seq_cnt FROM public.branches WHERE invoice_sequence <> 1;
    IF v_seq_cnt > 0 THEN
        RAISE EXCEPTION 'POST-WIPE ASSERTION FAILED: Found % branches with invoice_sequence <> 1!', v_seq_cnt;
    END IF;

    -- D. Assert kept infrastructure is intact
    SELECT count(*) INTO v_businesses_cnt FROM public.businesses;
    IF v_businesses_cnt = 0 THEN
        RAISE EXCEPTION 'CRITICAL INTEGRITY FAILURE: public.businesses has 0 rows!';
    END IF;

    SELECT count(*) INTO v_branches_cnt FROM public.branches;
    IF v_branches_cnt = 0 THEN
        RAISE EXCEPTION 'CRITICAL INTEGRITY FAILURE: public.branches has 0 rows!';
    END IF;

    SELECT count(*) INTO v_counters_cnt FROM public.counters WHERE id = 'd0000000-0000-0000-0000-000000000001';
    IF v_counters_cnt = 0 THEN
        RAISE EXCEPTION 'CRITICAL INTEGRITY FAILURE: Fixed POS Counter d0000000-0000-0000-0000-000000000001 is missing!';
    END IF;

    SELECT count(*) INTO v_profiles_cnt FROM public.profiles;
    IF v_profiles_cnt = 0 THEN
        RAISE EXCEPTION 'CRITICAL INTEGRITY FAILURE: public.profiles has 0 rows! Staff accounts must be preserved.';
    END IF;

    RAISE NOTICE 'SUCCESS: All 26 tables wiped to 0 rows. Counter sequences reset to 1. Infrastructure intact.';
END $$;

COMMIT;

-- STEP 14: RELOAD POSTGREST SCHEMA CACHE
NOTIFY pgrst, 'reload schema';

-- STEP 15: FINAL STATUS CONFIRMATION QUERY
SELECT 
    'public.invoices' AS table_name, count(*) AS count FROM public.invoices
UNION ALL SELECT 'public.inventory_batches', count(*) FROM public.inventory_batches
UNION ALL SELECT 'public.medicine_master', count(*) FROM public.medicine_master
UNION ALL SELECT 'public.customers', count(*) FROM public.customers
UNION ALL SELECT 'public.suppliers', count(*) FROM public.suppliers
UNION ALL SELECT 'public.audit_logs', count(*) FROM public.audit_logs
UNION ALL SELECT 'public.counters (total)', count(*) FROM public.counters
UNION ALL SELECT 'public.counters (seq=1)', count(*) FROM public.counters WHERE current_sequence = 1
UNION ALL SELECT 'public.profiles (staff kept)', count(*) FROM public.profiles
UNION ALL SELECT 'public.branches (kept)', count(*) FROM public.branches
UNION ALL SELECT 'public.businesses (kept)', count(*) FROM public.businesses;
