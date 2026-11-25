-- ====================================================================
-- PHARMADESK — POST-WIPE VERIFICATION & SMOKE TEST
-- Purpose: 1. Confirms 0 rows across all 26 wiped transactional/master tables.
--          2. Confirms preserved business, branch, counter, and staff rows.
--          3. Confirms counter sequence is set to 1.
--          4. Performs an isolated billing smoke test (atomic rollback)
--             verifying that the next bill starts from #000001.
-- Run in: Supabase SQL Editor
-- Safe: 100% safe (smoke test is in BEGIN; ... ROLLBACK; block)
-- ====================================================================

-- 1. VERIFY WIPED TABLES (All MUST be 0 rows)
WITH table_audit AS (
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
    CASE 
        WHEN row_count = 0 THEN 'PASS: Clean (0 rows)' 
        ELSE 'FAIL: Contains remaining rows!' 
    END AS status
FROM table_audit
ORDER BY table_name;

-- 2. VERIFY PRESERVED INFRASTRUCTURE TABLES
SELECT 
    'businesses' AS table_name, 
    count(*) AS row_count, 
    CASE WHEN count(*) > 0 THEN 'PASS: Preserved' ELSE 'FAIL: Missing business!' END AS status 
FROM public.businesses
UNION ALL 
SELECT 'branches', count(*), CASE WHEN count(*) >= 2 THEN 'PASS: Preserved' ELSE 'FAIL: Missing branches!' END FROM public.branches
UNION ALL 
SELECT 'counters', count(*), CASE WHEN count(*) >= 2 THEN 'PASS: Preserved' ELSE 'FAIL: Missing counters!' END FROM public.counters
UNION ALL 
SELECT 'profiles (staff)', count(*), CASE WHEN count(*) >= 1 THEN 'PASS: Preserved' ELSE 'FAIL: Missing staff profiles!' END FROM public.profiles
UNION ALL 
SELECT 'branch_memberships', count(*), CASE WHEN count(*) > 0 THEN 'PASS: Preserved' ELSE 'WARN: Check memberships' END FROM public.branch_memberships
UNION ALL 
SELECT 'business_settings', count(*), CASE WHEN count(*) > 0 THEN 'PASS: Preserved' ELSE 'WARN: Check settings' END FROM public.business_settings;

-- 3. VERIFY COUNTER SEQUENCE RESET TO 1
SELECT 
    c.id AS counter_id,
    c.counter_code,
    c.counter_name,
    b.branch_code,
    c.current_sequence,
    CASE 
        WHEN c.current_sequence = 1 THEN 'PASS: Reset to 1' 
        ELSE 'FAIL: Sequence is not 1!' 
    END AS sequence_status,
    (b.invoice_prefix || '-' || c.counter_code || '-2627-000001') AS expected_first_invoice_number
FROM public.counters c
JOIN public.branches b ON b.id = c.branch_id
ORDER BY b.branch_code, c.counter_code;

-- 4. VERIFY FIXED POS COUNTER ID EXISTS
SELECT 
    id AS fixed_pos_counter_id,
    counter_code,
    counter_name,
    CASE 
        WHEN id = 'd0000000-0000-0000-0000-000000000001' AND current_sequence = 1 
        THEN 'PASS: Fixed POS counter is ready for first billing'
        ELSE 'FAIL: Check fixed counter configuration'
    END AS pos_readiness
FROM public.counters 
WHERE id = 'd0000000-0000-0000-0000-000000000001';

-- 5. LIVE BILLING SMOKE TEST (GUARANTEED ROLLBACK)
-- Simulates owner adding 1 medicine + batch, billing it, and testing invoice #000001
DO $$
DECLARE
    v_branch_id UUID;
    v_counter_id UUID;
    v_biz_id UUID;
    v_admin_id UUID;
    v_med_id UUID;
    v_batch_id UUID;
    v_result JSONB;
    v_inv_no VARCHAR;
BEGIN
    SELECT id INTO v_biz_id FROM public.businesses LIMIT 1;
    SELECT id INTO v_branch_id FROM public.branches WHERE is_active = TRUE LIMIT 1;
    SELECT id INTO v_counter_id FROM public.counters WHERE branch_id = v_branch_id AND is_active = TRUE LIMIT 1;
    SELECT id INTO v_admin_id FROM public.profiles WHERE system_role = 'master_admin' LIMIT 1;

    -- A. Insert test medicine
    INSERT INTO public.medicine_master (
        business_id, brand_name, generic_name, manufacturer, form,
        hsn_code, gst_rate, strip_selling_price, mrp, pieces_per_strip, is_active
    ) VALUES (
        v_biz_id, 'SmokeTest Tab 500mg', 'Paracetamol IP', 'Test Pharma Ltd', 'tablet',
        '30049099', 12.00, 20.00, 25.00, 10, TRUE
    ) RETURNING id INTO v_med_id;

    -- B. Insert test inventory batch
    INSERT INTO public.inventory_batches (
        branch_id, medicine_id, batch_number, expiry_date,
        stock_pieces, purchase_price, mrp, is_active
    ) VALUES (
        v_branch_id, v_med_id, 'SMK001', (CURRENT_DATE + INTERVAL '365 days')::DATE,
        100, 15.00, 25.00, TRUE
    ) RETURNING id INTO v_batch_id;

    -- C. Call create_invoice_atomic
    v_result := public.create_invoice_atomic(
        p_branch_id := v_branch_id,
        p_counter_id := v_counter_id,
        p_customer_name := 'Smoke Test Customer',
        p_customer_phone := '9876543210',
        p_customer_state_code := '09',
        p_payment_method := 'cash',
        p_items := jsonb_build_array(
            jsonb_build_object(
                'medicine_id', v_med_id,
                'batch_id', v_batch_id,
                'selected_unit', 'strip',
                'unit_quantity', 1,
                'discount_amount', 0
            )
        )
    );

    v_inv_no := v_result->>'invoice_number';

    IF v_inv_no NOT LIKE '%000001' THEN
        RAISE EXCEPTION 'SMOKE TEST FAILED: Generated invoice % does not end in 000001!', v_inv_no;
    END IF;

    RAISE NOTICE 'SUCCESS: Smoke test generated first invoice % successfully!', v_inv_no;

    -- Always raise exception in DO block to force full rollback of smoke test data
    RAISE EXCEPTION 'SMOKE_TEST_ROLLBACK_OK: Verified clean series generation without persisting any test row.';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLERRM LIKE '%SMOKE_TEST_ROLLBACK_OK%' THEN
            RAISE NOTICE 'CONFIRMED: Database is clean. Invoice #000001 generation verified.';
        ELSE
            RAISE EXCEPTION 'SMOKE TEST ERROR: %', SQLERRM;
        END IF;
END $$;
