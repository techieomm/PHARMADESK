-- ====================================================================
-- PHARMADESK — MIGRATION 020: DAY BOOK AUDIT RPC & CASH RECONCILIATION
-- 1. Updates payment_records constraint to allow 'credit', 'split', 'cheque'
-- 2. Updates cancel_invoice to synchronize payment_records.status = 'cancelled'
-- 3. Implements get_day_book RPC with strict Asia/Kolkata (IST) date aggregation,
--    statutory GST breakdowns, sales returns, and cash drawer reconciliation
-- ====================================================================

-- 1. Update payment_records constraints
ALTER TABLE public.payment_records 
    DROP CONSTRAINT IF EXISTS payment_records_payment_method_check;

ALTER TABLE public.payment_records 
    ADD CONSTRAINT payment_records_payment_method_check 
    CHECK (payment_method IN ('cash', 'upi', 'card', 'credit', 'split', 'cheque', 'neft_rtgs'));

-- 2. Enhanced cancel_invoice RPC (Synchronizes payment_records and restores stock)
CREATE OR REPLACE FUNCTION public.cancel_invoice(
    p_invoice_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_user_role public.app_role;
    v_inv RECORD;
    v_item RECORD;
    v_target_batch RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User authentication required';
    END IF;

    SELECT role INTO v_user_role FROM public.profiles WHERE id = v_user_id;
    IF v_user_role NOT IN ('master_admin', 'sub_admin', 'branch_manager') THEN
        RAISE EXCEPTION 'Forbidden: Only managers and admins can cancel invoices';
    END IF;

    IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
        RAISE EXCEPTION 'Cancellation reason is mandatory';
    END IF;

    SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found';
    END IF;

    IF v_inv.payment_status = 'cancelled' THEN
        RAISE EXCEPTION 'Invoice % is already cancelled', v_inv.invoice_number;
    END IF;

    -- Restock items back into inventory_batches
    FOR v_item IN SELECT * FROM public.invoice_items WHERE invoice_id = p_invoice_id
    LOOP
        IF v_item.batch_id IS NOT NULL THEN
            UPDATE public.inventory_batches
            SET stock_pieces = stock_pieces + v_item.pieces_count, version = version + 1, updated_at = NOW()
            WHERE id = v_item.batch_id;
        ELSE
            -- Fallback: Restock into active batch with latest expiry
            SELECT * INTO v_target_batch 
            FROM public.inventory_batches 
            WHERE branch_id = v_inv.branch_id AND medicine_id = v_item.medicine_id AND is_active = TRUE
            ORDER BY expiry_date DESC
            LIMIT 1;

            IF FOUND THEN
                UPDATE public.inventory_batches
                SET stock_pieces = stock_pieces + v_item.pieces_count, version = version + 1, updated_at = NOW()
                WHERE id = v_target_batch.id;
            END IF;
        END IF;

        INSERT INTO public.stock_movements (
            branch_id,
            medicine_id,
            movement_type,
            quantity_pieces,
            unit_used,
            unit_quantity,
            balance_after_pieces,
            batch_number,
            reference_id,
            notes,
            performed_by
        ) VALUES (
            v_inv.branch_id,
            v_item.medicine_id,
            'return',
            v_item.pieces_count,
            v_item.selected_unit,
            v_item.unit_quantity,
            v_item.pieces_count,
            v_item.batch_number,
            v_inv.invoice_number,
            'Invoice Cancelled: ' || p_reason,
            v_user_id
        );
    END LOOP;

    -- Reversal on Customer Ledger if Credit
    IF v_inv.payment_method = 'credit' AND v_inv.customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET outstanding_balance = GREATEST(0.00, outstanding_balance - v_inv.total_amount),
            version = version + 1,
            updated_at = NOW()
        WHERE id = v_inv.customer_id;

        INSERT INTO public.customer_ledger (
            customer_id,
            entry_type,
            reference_id,
            debit_amount,
            credit_amount,
            balance_after,
            notes,
            created_by
        ) VALUES (
            v_inv.customer_id,
            'adjustment',
            v_inv.invoice_number,
            0.00,
            v_inv.total_amount,
            0.00,
            'Invoice Cancelled: ' || p_reason,
            v_user_id
        );
    END IF;

    -- Mark Invoice Cancelled
    UPDATE public.invoices
    SET payment_status = 'cancelled',
        cancelled_reason = p_reason,
        cancelled_at = NOW(),
        cancelled_by = v_user_id
    WHERE id = p_invoice_id;

    -- Synchronize payment records so Day Book does not count cancelled collections
    UPDATE public.payment_records
    SET status = 'cancelled'
    WHERE invoice_id = p_invoice_id;

    -- Audit log
    INSERT INTO public.audit_logs (
        user_id,
        action,
        entity_type,
        entity_id,
        details
    ) VALUES (
        v_user_id,
        'CANCEL_INVOICE',
        'INVOICE',
        v_inv.invoice_number,
        jsonb_build_object('reason', p_reason, 'amount', v_inv.total_amount)
    );

    RETURN jsonb_build_object('success', true, 'invoice_number', v_inv.invoice_number);
END;
$$;

-- 3. Day Book Aggregation RPC (Strict Asia/Kolkata IST grouping)
CREATE OR REPLACE FUNCTION public.get_day_book(
    p_branch_id UUID DEFAULT NULL,
    p_date DATE DEFAULT (NOW() AT TIME ZONE 'Asia/Kolkata')::date,
    p_cashier_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_user_role public.app_role;
    v_target_date DATE;
    v_summary JSONB;
    v_invoices JSONB;
    v_returns JSONB;
    v_cancelled JSONB;
    v_customer_payments JSONB;
    v_payment_records JSONB;
    
    -- Summary accumulators
    v_gross_sales_count BIGINT := 0;
    v_gross_sales_amount NUMERIC(12, 2) := 0.00;
    v_taxable_amount NUMERIC(12, 2) := 0.00;
    v_cgst_amount NUMERIC(12, 2) := 0.00;
    v_sgst_amount NUMERIC(12, 2) := 0.00;
    v_igst_amount NUMERIC(12, 2) := 0.00;
    v_total_gst NUMERIC(12, 2) := 0.00;
    v_discount_amount NUMERIC(12, 2) := 0.00;
    v_round_off NUMERIC(12, 2) := 0.00;
    
    v_cash_collected NUMERIC(12, 2) := 0.00;
    v_upi_collected NUMERIC(12, 2) := 0.00;
    v_card_collected NUMERIC(12, 2) := 0.00;
    v_total_collected NUMERIC(12, 2) := 0.00;
    
    v_credit_given NUMERIC(12, 2) := 0.00;
    v_credit_recovered NUMERIC(12, 2) := 0.00;
    
    v_returns_count BIGINT := 0;
    v_returns_amount NUMERIC(12, 2) := 0.00;
    v_returns_gst NUMERIC(12, 2) := 0.00;
    
    v_cancelled_count BIGINT := 0;
    v_cancelled_amount NUMERIC(12, 2) := 0.00;
    
    v_net_sales_amount NUMERIC(12, 2) := 0.00;
    v_reconciliation_difference NUMERIC(12, 2) := 0.00;
    v_is_balanced BOOLEAN := TRUE;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT role INTO v_user_role FROM public.profiles WHERE id = v_user_id;
    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'Profile not found';
    END IF;

    v_target_date := COALESCE(p_date, (NOW() AT TIME ZONE 'Asia/Kolkata')::date);

    -- 1. Active Sales Aggregation (Strict IST Date)
    SELECT
        COALESCE(COUNT(i.id), 0),
        COALESCE(SUM(i.total_amount), 0.00),
        COALESCE(SUM(i.subtotal_taxable), 0.00),
        COALESCE(SUM(i.cgst_amount), 0.00),
        COALESCE(SUM(i.sgst_amount), 0.00),
        COALESCE(SUM(i.igst_amount), 0.00),
        COALESCE(SUM(i.total_gst), 0.00),
        COALESCE(SUM(i.discount_amount), 0.00),
        COALESCE(SUM(i.round_off), 0.00)
    INTO
        v_gross_sales_count,
        v_gross_sales_amount,
        v_taxable_amount,
        v_cgst_amount,
        v_sgst_amount,
        v_igst_amount,
        v_total_gst,
        v_discount_amount,
        v_round_off
    FROM public.invoices i
    WHERE (i.invoice_date AT TIME ZONE 'Asia/Kolkata')::date = v_target_date
      AND i.payment_status <> 'cancelled'
      AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
      AND (p_cashier_id IS NULL OR i.created_by = p_cashier_id);

    -- 2. Cancelled Sales Aggregation
    SELECT
        COALESCE(COUNT(i.id), 0),
        COALESCE(SUM(i.total_amount), 0.00)
    INTO
        v_cancelled_count,
        v_cancelled_amount
    FROM public.invoices i
    WHERE (i.invoice_date AT TIME ZONE 'Asia/Kolkata')::date = v_target_date
      AND i.payment_status = 'cancelled'
      AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
      AND (p_cashier_id IS NULL OR i.created_by = p_cashier_id);

    -- 3. Tender / Cash Collections from payment_records (Strict IST Date, non-cancelled)
    SELECT
        COALESCE(SUM(CASE WHEN pr.payment_method = 'cash' THEN pr.amount ELSE 0.00 END), 0.00),
        COALESCE(SUM(CASE WHEN pr.payment_method = 'upi' THEN pr.amount ELSE 0.00 END), 0.00),
        COALESCE(SUM(CASE WHEN pr.payment_method = 'card' THEN pr.amount ELSE 0.00 END), 0.00)
    INTO
        v_cash_collected,
        v_upi_collected,
        v_card_collected
    FROM public.payment_records pr
    JOIN public.invoices i ON pr.invoice_id = i.id
    WHERE (pr.created_at AT TIME ZONE 'Asia/Kolkata')::date = v_target_date
      AND pr.status = 'success'
      AND i.payment_status <> 'cancelled'
      AND (p_branch_id IS NULL OR pr.branch_id = p_branch_id)
      AND (p_cashier_id IS NULL OR pr.recorded_by = p_cashier_id);

    v_total_collected := v_cash_collected + v_upi_collected + v_card_collected;

    -- 4. Credit (Udhaar) Given in Sales (from customer_ledger)
    SELECT
        COALESCE(SUM(cl.debit_amount), 0.00)
    INTO
        v_credit_given
    FROM public.customer_ledger cl
    WHERE (cl.created_at AT TIME ZONE 'Asia/Kolkata')::date = v_target_date
      AND cl.entry_type = 'sale_credit'
      AND (p_cashier_id IS NULL OR cl.created_by = p_cashier_id);

    -- 5. Credit Payments Recovered (Udhaar Vasooli received from customers)
    SELECT
        COALESCE(SUM(cl.credit_amount), 0.00)
    INTO
        v_credit_recovered
    FROM public.customer_ledger cl
    WHERE (cl.created_at AT TIME ZONE 'Asia/Kolkata')::date = v_target_date
      AND cl.entry_type = 'payment_received'
      AND (p_cashier_id IS NULL OR cl.created_by = p_cashier_id);

    -- 6. Sales Returns / Credit Notes
    SELECT
        COALESCE(COUNT(sr.id), 0),
        COALESCE(SUM(sr.total_amount), 0.00),
        COALESCE(SUM(sr.total_gst), 0.00)
    INTO
        v_returns_count,
        v_returns_amount,
        v_returns_gst
    FROM public.sales_returns sr
    WHERE (sr.created_at AT TIME ZONE 'Asia/Kolkata')::date = v_target_date
      AND (p_branch_id IS NULL OR sr.branch_id = p_branch_id)
      AND (p_cashier_id IS NULL OR sr.created_by = p_cashier_id);

    -- 7. Net Sales & Drawer Balancing Reconciliation
    v_net_sales_amount := v_gross_sales_amount - v_returns_amount;

    -- Reconciliation formula: Total Active Sales must balance with (Cash + UPI + Card + Credit Given)
    v_reconciliation_difference := v_gross_sales_amount - (v_total_collected + v_credit_given);
    v_is_balanced := (ABS(v_reconciliation_difference) < 0.05);

    -- 8. JSON Objects
    v_summary := jsonb_build_object(
        'gross_sales_count', v_gross_sales_count,
        'gross_sales_amount', v_gross_sales_amount,
        'taxable_amount', v_taxable_amount,
        'cgst_amount', v_cgst_amount,
        'sgst_amount', v_sgst_amount,
        'igst_amount', v_igst_amount,
        'total_gst', v_total_gst,
        'discount_amount', v_discount_amount,
        'round_off', v_round_off,
        'cash_collected', v_cash_collected,
        'upi_collected', v_upi_collected,
        'card_collected', v_card_collected,
        'total_collected', v_total_collected,
        'credit_given', v_credit_given,
        'credit_recovered', v_credit_recovered,
        'returns_count', v_returns_count,
        'returns_amount', v_returns_amount,
        'returns_gst', v_returns_gst,
        'cancelled_count', v_cancelled_count,
        'cancelled_amount', v_cancelled_amount,
        'net_sales_amount', v_net_sales_amount,
        'reconciliation_difference', v_reconciliation_difference,
        'is_balanced', v_is_balanced
    );

    -- 9. Invoices Array
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', i.id,
            'invoice_number', i.invoice_number,
            'invoice_date', i.invoice_date,
            'customer_name', i.customer_name,
            'customer_phone', i.customer_phone,
            'payment_method', i.payment_method,
            'payment_status', i.payment_status,
            'subtotal_taxable', i.subtotal_taxable,
            'total_gst', i.total_gst,
            'round_off', i.round_off,
            'total_amount', i.total_amount,
            'branch_name', b.name,
            'branch_code', b.branch_code,
            'cashier_name', p.full_name
        ) ORDER BY i.invoice_date DESC
    ), '[]'::jsonb)
    INTO v_invoices
    FROM public.invoices i
    LEFT JOIN public.branches b ON i.branch_id = b.id
    LEFT JOIN public.profiles p ON i.created_by = p.id
    WHERE (i.invoice_date AT TIME ZONE 'Asia/Kolkata')::date = v_target_date
      AND i.payment_status <> 'cancelled'
      AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
      AND (p_cashier_id IS NULL OR i.created_by = p_cashier_id);

    -- 10. Cancelled Invoices Array
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', i.id,
            'invoice_number', i.invoice_number,
            'invoice_date', i.invoice_date,
            'cancelled_at', i.cancelled_at,
            'cancelled_reason', i.cancelled_reason,
            'customer_name', i.customer_name,
            'total_amount', i.total_amount,
            'branch_name', b.name,
            'branch_code', b.branch_code,
            'cashier_name', p.full_name
        ) ORDER BY i.cancelled_at DESC
    ), '[]'::jsonb)
    INTO v_cancelled
    FROM public.invoices i
    LEFT JOIN public.branches b ON i.branch_id = b.id
    LEFT JOIN public.profiles p ON i.created_by = p.id
    WHERE (i.invoice_date AT TIME ZONE 'Asia/Kolkata')::date = v_target_date
      AND i.payment_status = 'cancelled'
      AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
      AND (p_cashier_id IS NULL OR i.created_by = p_cashier_id);

    -- 11. Returns Array
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', sr.id,
            'credit_note_number', sr.credit_note_number,
            'customer_name', sr.customer_name,
            'total_amount', sr.total_amount,
            'refund_method', sr.refund_method,
            'reason', sr.reason,
            'created_at', sr.created_at,
            'branch_name', b.name
        ) ORDER BY sr.created_at DESC
    ), '[]'::jsonb)
    INTO v_returns
    FROM public.sales_returns sr
    LEFT JOIN public.branches b ON sr.branch_id = b.id
    WHERE (sr.created_at AT TIME ZONE 'Asia/Kolkata')::date = v_target_date
      AND (p_branch_id IS NULL OR sr.branch_id = p_branch_id)
      AND (p_cashier_id IS NULL OR sr.created_by = p_cashier_id);

    -- 12. Customer Ledger Payments Received (Udhaar Vasooli)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', cl.id,
            'customer_name', c.name,
            'credit_amount', cl.credit_amount,
            'balance_after', cl.balance_after,
            'payment_method', cl.payment_method,
            'notes', cl.notes,
            'created_at', cl.created_at
        ) ORDER BY cl.created_at DESC
    ), '[]'::jsonb)
    INTO v_customer_payments
    FROM public.customer_ledger cl
    JOIN public.customers c ON cl.customer_id = c.id
    WHERE (cl.created_at AT TIME ZONE 'Asia/Kolkata')::date = v_target_date
      AND cl.entry_type = 'payment_received'
      AND (p_cashier_id IS NULL OR cl.created_by = p_cashier_id);

    -- 13. Payment Records Array
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', pr.id,
            'payment_method', pr.payment_method,
            'amount', pr.amount,
            'transaction_reference', pr.transaction_reference,
            'status', pr.status,
            'created_at', pr.created_at,
            'invoice_id', pr.invoice_id
        ) ORDER BY pr.created_at DESC
    ), '[]'::jsonb)
    INTO v_payment_records
    FROM public.payment_records pr
    JOIN public.invoices i ON pr.invoice_id = i.id
    WHERE (pr.created_at AT TIME ZONE 'Asia/Kolkata')::date = v_target_date
      AND (p_branch_id IS NULL OR pr.branch_id = p_branch_id)
      AND (p_cashier_id IS NULL OR pr.recorded_by = p_cashier_id);

    RETURN jsonb_build_object(
        'success', true,
        'date', v_target_date,
        'timezone', 'Asia/Kolkata',
        'branch_id', p_branch_id,
        'summary', v_summary,
        'invoices', v_invoices,
        'returns', v_returns,
        'cancelled_invoices', v_cancelled,
        'customer_payments', v_customer_payments,
        'payment_records', v_payment_records
    );
END;
$$;

-- Grant permissions to authenticated roles
GRANT EXECUTE ON FUNCTION public.get_day_book(UUID, DATE, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_invoice(UUID, TEXT) TO authenticated;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
