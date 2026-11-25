-- ====================================================================
-- PHARMADESK — MIGRATION 003: PRODUCTION POSTGRESQL RPCs
-- Atomic Transactions: FEFO Billing, Split Payments, Credit/Udhaar,
-- Returns, Purchases, Transfers, Day Close, Reporting, Sync Feed
-- ====================================================================

-- 1. ATOMIC INVOICE CREATION RPC (FEFO + Inter-state GST + Split Payments + H1 Register + Idempotency)
-- Drop legacy 6-parameter signature from 001 to prevent PostgREST function overload ambiguity
DROP FUNCTION IF EXISTS public.create_invoice_atomic(UUID, VARCHAR, VARCHAR, VARCHAR, JSONB, TEXT);

CREATE OR REPLACE FUNCTION public.create_invoice_atomic(
    p_branch_id UUID,
    p_counter_id UUID,
    p_customer_name VARCHAR,
    p_customer_phone VARCHAR,
    p_customer_id UUID DEFAULT NULL,
    p_customer_gstin VARCHAR DEFAULT NULL,
    p_customer_state_code VARCHAR DEFAULT '09',
    p_doctor_id UUID DEFAULT NULL,
    p_doctor_name VARCHAR DEFAULT NULL,
    p_doctor_reg_no VARCHAR DEFAULT NULL,
    p_payment_method VARCHAR DEFAULT 'cash', -- 'cash', 'upi', 'card', 'credit', 'split'
    p_payment_splits JSONB DEFAULT '[]'::jsonb, -- Array of { method: string, amount: number, reference?: string }
    p_items JSONB DEFAULT '[]'::jsonb, -- Array of { medicine_id: UUID, selected_unit: 'strip'|'piece', unit_quantity: number, batch_id?: UUID, discount_amount?: number }
    p_bill_discount NUMERIC(12, 2) DEFAULT 0.00,
    p_notes TEXT DEFAULT NULL,
    p_device_id VARCHAR DEFAULT NULL,
    p_idempotency_key VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_user_role public.app_role;
    v_user_branch UUID;
    v_branch_rec RECORD;
    v_counter_rec RECORD;
    v_customer_rec RECORD;
    v_existing_inv RECORD;
    v_invoice_id UUID;
    v_invoice_num VARCHAR(100);
    v_next_seq BIGINT;
    v_fy_str VARCHAR(4);
    v_is_interstate BOOLEAN;
    v_subtotal_taxable NUMERIC(12, 2) := 0.00;
    v_total_cgst NUMERIC(12, 2) := 0.00;
    v_total_sgst NUMERIC(12, 2) := 0.00;
    v_total_igst NUMERIC(12, 2) := 0.00;
    v_total_gst NUMERIC(12, 2) := 0.00;
    v_raw_total NUMERIC(12, 2) := 0.00;
    v_round_off NUMERIC(12, 2) := 0.00;
    v_grand_total NUMERIC(12, 2) := 0.00;
    v_credit_amount NUMERIC(12, 2) := 0.00;
    v_item RECORD;
    v_med RECORD;
    v_batch RECORD;
    v_pieces_needed BIGINT;
    v_unit_price NUMERIC(12, 2);
    v_line_gross NUMERIC(12, 2);
    v_line_net NUMERIC(12, 2);
    v_taxable NUMERIC(12, 2);
    v_item_gst NUMERIC(12, 2);
    v_cgst NUMERIC(12, 2) := 0.00;
    v_sgst NUMERIC(12, 2) := 0.00;
    v_igst NUMERIC(12, 2) := 0.00;
    v_split RECORD;
    v_pieces_from_batch BIGINT;
    v_pieces_remaining BIGINT;
    v_today_month INT;
    v_today_year INT;
    v_fy_start_year INT;
    v_fy_end_year INT;
BEGIN
    -- 1. Authentication & Role Check
    v_user_id := auth.uid();
    IF v_user_id IS NOT NULL THEN
        SELECT role, primary_branch_id INTO v_user_role, v_user_branch
        FROM public.profiles WHERE id = v_user_id;

        IF v_user_role IS NOT NULL AND v_user_role <> 'master_admin' AND v_user_branch <> p_branch_id THEN
            RAISE EXCEPTION 'Forbidden: User not authorized to bill at branch %', p_branch_id;
        END IF;
    END IF;

    -- 2. Idempotency Check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, invoice_number, total_amount, subtotal_taxable, total_gst INTO v_existing_inv
        FROM public.invoices
        WHERE idempotency_key = p_idempotency_key;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'is_duplicate', true,
                'invoice_id', v_existing_inv.id,
                'invoice_number', v_existing_inv.invoice_number,
                'total_amount', v_existing_inv.total_amount,
                'subtotal_taxable', v_existing_inv.subtotal_taxable,
                'total_gst', v_existing_inv.total_gst
            );
        END IF;
    END IF;

    -- 3. Lock Branch
    SELECT * INTO v_branch_rec FROM public.branches WHERE id = p_branch_id AND is_active = TRUE FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Branch % not found or inactive', p_branch_id;
    END IF;

    -- 4. Calculate Indian Financial Year (April to March)
    v_today_month := EXTRACT(MONTH FROM NOW())::INT;
    v_today_year := EXTRACT(YEAR FROM NOW())::INT;
    IF v_today_month < 4 THEN
        v_fy_start_year := v_today_year - 1;
        v_fy_end_year := v_today_year;
    ELSE
        v_fy_start_year := v_today_year;
        v_fy_end_year := v_today_year + 1;
    END IF;
    v_fy_str := LPAD((v_fy_start_year % 100)::TEXT, 2, '0') || LPAD((v_fy_end_year % 100)::TEXT, 2, '0');

    -- 5. Generate Gap-Free Sequence with Counter Row Lock
    IF p_counter_id IS NOT NULL THEN
        SELECT * INTO v_counter_rec FROM public.counters WHERE id = p_counter_id AND branch_id = p_branch_id AND is_active = TRUE FOR UPDATE;
    END IF;

    IF v_counter_rec.id IS NOT NULL THEN
        v_next_seq := v_counter_rec.current_sequence;
        v_invoice_num := v_branch_rec.invoice_prefix || '-' || v_counter_rec.counter_code || '-' || v_fy_str || '-' || LPAD(v_next_seq::TEXT, 6, '0');
        UPDATE public.counters SET current_sequence = current_sequence + 1, updated_at = NOW() WHERE id = v_counter_rec.id;
    ELSE
        v_next_seq := v_branch_rec.invoice_sequence;
        v_invoice_num := v_branch_rec.invoice_prefix || '-C1-' || v_fy_str || '-' || LPAD(v_next_seq::TEXT, 6, '0');
        UPDATE public.branches SET invoice_sequence = invoice_sequence + 1, updated_at = NOW() WHERE id = p_branch_id;
    END IF;

    -- 6. Interstate supply check (09 = Uttar Pradesh)
    v_is_interstate := (COALESCE(p_customer_state_code, '09') <> '09');

    -- 7. Insert Draft Invoice
    INSERT INTO public.invoices (
        branch_id,
        counter_id,
        device_id,
        idempotency_key,
        invoice_number,
        invoice_date,
        customer_id,
        customer_name,
        customer_phone,
        customer_gstin,
        doctor_id,
        doctor_name,
        payment_method,
        payment_status,
        payment_splits,
        is_interstate,
        notes,
        created_by
    ) VALUES (
        p_branch_id,
        p_counter_id,
        p_device_id,
        p_idempotency_key,
        v_invoice_num,
        NOW(),
        p_customer_id,
        p_customer_name,
        p_customer_phone,
        p_customer_gstin,
        p_doctor_id,
        p_doctor_name,
        p_payment_method,
        'paid',
        p_payment_splits,
        v_is_interstate,
        p_notes,
        v_user_id
    ) RETURNING id INTO v_invoice_id;

    -- 8. Process Items with FEFO Batch Deduction
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        medicine_id UUID,
        selected_unit VARCHAR,
        unit_quantity NUMERIC,
        batch_id UUID,
        discount_amount NUMERIC
    )
    LOOP
        SELECT * INTO v_med FROM public.medicine_master WHERE id = v_item.medicine_id AND is_active = TRUE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Medicine % not found or inactive in master catalog', v_item.medicine_id;
        END IF;

        IF v_item.selected_unit = 'strip' THEN
            v_pieces_needed := ROUND(v_item.unit_quantity * v_med.pieces_per_strip);
            v_unit_price := v_med.strip_selling_price;
        ELSIF v_item.selected_unit = 'piece' THEN
            v_pieces_needed := ROUND(v_item.unit_quantity);
            v_unit_price := v_med.piece_selling_price;
        ELSE
            RAISE EXCEPTION 'Invalid unit %: must be strip or piece', v_item.selected_unit;
        END IF;

        IF v_pieces_needed <= 0 THEN
            RAISE EXCEPTION 'Quantity must be greater than zero for %', v_med.brand_name;
        END IF;

        v_line_gross := ROUND(v_unit_price * v_item.unit_quantity, 2);
        v_line_net := GREATEST(0.00, v_line_gross - COALESCE(v_item.discount_amount, 0.00));

        -- GST Calculation (Inclusive Retail MRP)
        IF v_med.gst_rate > 0 THEN
            v_taxable := ROUND(v_line_net / (1.0 + (v_med.gst_rate / 100.0)), 2);
            v_item_gst := v_line_net - v_taxable;
        ELSE
            v_taxable := v_line_net;
            v_item_gst := 0.00;
        END IF;

        IF v_is_interstate THEN
            v_igst := v_item_gst;
            v_cgst := 0.00;
            v_sgst := 0.00;
            v_total_igst := v_total_igst + v_igst;
        ELSE
            v_cgst := ROUND(v_item_gst / 2.0, 2);
            v_sgst := v_item_gst - v_cgst;
            v_igst := 0.00;
            v_total_cgst := v_total_cgst + v_cgst;
            v_total_sgst := v_total_sgst + v_sgst;
        END IF;

        v_subtotal_taxable := v_subtotal_taxable + v_taxable;
        v_total_gst := v_total_gst + v_item_gst;
        v_raw_total := v_raw_total + v_line_net;

        -- FEFO Batch Allocation & Stock Deduction
        v_pieces_remaining := v_pieces_needed;

        -- If specific batch specified by user, use that; otherwise allocate FEFO
        IF v_item.batch_id IS NOT NULL THEN
            SELECT * INTO v_batch FROM public.inventory_batches
            WHERE id = v_item.batch_id AND branch_id = p_branch_id AND is_active = TRUE
            FOR UPDATE;

            IF NOT FOUND OR v_batch.stock_pieces < v_pieces_needed THEN
                RAISE EXCEPTION 'Insufficient stock in batch % for % (Required: %, Available: %)',
                    COALESCE(v_batch.batch_number, 'specified'), v_med.brand_name, v_pieces_needed, COALESCE(v_batch.stock_pieces, 0);
            END IF;

            IF v_batch.expiry_date <= CURRENT_DATE THEN
                RAISE EXCEPTION 'Cannot sell expired batch % for % (Expired on %)',
                    v_batch.batch_number, v_med.brand_name, v_batch.expiry_date;
            END IF;

            UPDATE public.inventory_batches
            SET stock_pieces = stock_pieces - v_pieces_needed, version = version + 1, updated_at = NOW()
            WHERE id = v_batch.id;

            -- Record Invoice Item
            INSERT INTO public.invoice_items (
                invoice_id,
                medicine_id,
                medicine_name,
                selected_unit,
                unit_quantity,
                pieces_count,
                unit_price,
                gst_rate,
                taxable_amount,
                gst_amount,
                cgst_amount,
                sgst_amount,
                igst_amount,
                total_amount,
                batch_id,
                batch_number,
                expiry_date,
                hsn_code
            ) VALUES (
                v_invoice_id,
                v_med.id,
                v_med.brand_name,
                v_item.selected_unit,
                v_item.unit_quantity,
                v_pieces_needed,
                v_unit_price,
                v_med.gst_rate,
                v_taxable,
                v_item_gst,
                v_cgst,
                v_sgst,
                v_igst,
                v_line_net,
                v_batch.id,
                v_batch.batch_number,
                v_batch.expiry_date,
                v_med.hsn_code
            );

            -- Stock Movement
            INSERT INTO public.stock_movements (
                branch_id,
                medicine_id,
                movement_type,
                quantity_pieces,
                unit_used,
                unit_quantity,
                balance_after_pieces,
                batch_number,
                expiry_date,
                reference_id,
                counter_id,
                device_id,
                notes,
                performed_by
            ) VALUES (
                p_branch_id,
                v_med.id,
                'sale',
                -v_pieces_needed,
                v_item.selected_unit,
                v_item.unit_quantity,
                v_batch.stock_pieces - v_pieces_needed,
                v_batch.batch_number,
                v_batch.expiry_date,
                v_invoice_num,
                p_counter_id,
                p_device_id,
                'POS Bill Sale',
                v_user_id
            );

            -- Statutory Schedule H1 Register Entry
            IF v_med.drug_schedule = 'schedule_h1' THEN
                INSERT INTO public.h1_register (
                    branch_id,
                    invoice_id,
                    invoice_number,
                    medicine_id,
                    medicine_name,
                    batch_number,
                    quantity_pieces,
                    patient_name,
                    patient_address,
                    doctor_name,
                    doctor_reg_no,
                    sale_date
                ) VALUES (
                    p_branch_id,
                    v_invoice_id,
                    v_invoice_num,
                    v_med.id,
                    v_med.brand_name,
                    v_batch.batch_number,
                    v_pieces_needed,
                    p_customer_name,
                    p_notes,
                    COALESCE(p_doctor_name, 'Registered Medical Practitioner'),
                    COALESCE(p_doctor_reg_no, 'UP-RMP-REQ'),
                    NOW()
                );
            END IF;
        ELSE
            -- Automatic FEFO allocation across valid non-expired batches
            FOR v_batch IN
                SELECT * FROM public.inventory_batches
                WHERE branch_id = p_branch_id
                  AND medicine_id = v_med.id
                  AND is_active = TRUE
                  AND stock_pieces > 0
                  AND expiry_date > CURRENT_DATE
                  AND deleted_at IS NULL
                ORDER BY expiry_date ASC, created_at ASC
                FOR UPDATE
            LOOP
                IF v_pieces_remaining <= 0 THEN EXIT; END IF;

                v_pieces_from_batch := LEAST(v_batch.stock_pieces, v_pieces_remaining);

                UPDATE public.inventory_batches
                SET stock_pieces = stock_pieces - v_pieces_from_batch, version = version + 1, updated_at = NOW()
                WHERE id = v_batch.id;

                INSERT INTO public.invoice_items (
                    invoice_id,
                    medicine_id,
                    medicine_name,
                    selected_unit,
                    unit_quantity,
                    pieces_count,
                    unit_price,
                    gst_rate,
                    taxable_amount,
                    gst_amount,
                    cgst_amount,
                    sgst_amount,
                    igst_amount,
                    total_amount,
                    batch_id,
                    batch_number,
                    expiry_date,
                    hsn_code
                ) VALUES (
                    v_invoice_id,
                    v_med.id,
                    v_med.brand_name,
                    v_item.selected_unit,
                    ROUND((v_pieces_from_batch::NUMERIC / v_pieces_needed::NUMERIC) * v_item.unit_quantity, 2),
                    v_pieces_from_batch,
                    v_unit_price,
                    v_med.gst_rate,
                    ROUND((v_pieces_from_batch::NUMERIC / v_pieces_needed::NUMERIC) * v_taxable, 2),
                    ROUND((v_pieces_from_batch::NUMERIC / v_pieces_needed::NUMERIC) * v_item_gst, 2),
                    ROUND((v_pieces_from_batch::NUMERIC / v_pieces_needed::NUMERIC) * v_cgst, 2),
                    ROUND((v_pieces_from_batch::NUMERIC / v_pieces_needed::NUMERIC) * v_sgst, 2),
                    ROUND((v_pieces_from_batch::NUMERIC / v_pieces_needed::NUMERIC) * v_igst, 2),
                    ROUND((v_pieces_from_batch::NUMERIC / v_pieces_needed::NUMERIC) * v_line_net, 2),
                    v_batch.id,
                    v_batch.batch_number,
                    v_batch.expiry_date,
                    v_med.hsn_code
                );

                INSERT INTO public.stock_movements (
                    branch_id,
                    medicine_id,
                    movement_type,
                    quantity_pieces,
                    unit_used,
                    unit_quantity,
                    balance_after_pieces,
                    batch_number,
                    expiry_date,
                    reference_id,
                    counter_id,
                    device_id,
                    notes,
                    performed_by
                ) VALUES (
                    p_branch_id,
                    v_med.id,
                    'sale',
                    -v_pieces_from_batch,
                    v_item.selected_unit,
                    v_item.unit_quantity,
                    v_batch.stock_pieces - v_pieces_from_batch,
                    v_batch.batch_number,
                    v_batch.expiry_date,
                    v_invoice_num,
                    p_counter_id,
                    p_device_id,
                    'FEFO Auto Batch Sale',
                    v_user_id
                );

                IF v_med.drug_schedule = 'schedule_h1' THEN
                    INSERT INTO public.h1_register (
                        branch_id,
                        invoice_id,
                        invoice_number,
                        medicine_id,
                        medicine_name,
                        batch_number,
                        quantity_pieces,
                        patient_name,
                        patient_address,
                        doctor_name,
                        doctor_reg_no,
                        sale_date
                    ) VALUES (
                        p_branch_id,
                        v_invoice_id,
                        v_invoice_num,
                        v_med.id,
                        v_med.brand_name,
                        v_batch.batch_number,
                        v_pieces_from_batch,
                        p_customer_name,
                        p_notes,
                        COALESCE(p_doctor_name, 'Registered Medical Practitioner'),
                        COALESCE(p_doctor_reg_no, 'UP-RMP-REQ'),
                        NOW()
                    );
                END IF;

                v_pieces_remaining := v_pieces_remaining - v_pieces_from_batch;
            END LOOP;

            IF v_pieces_remaining > 0 THEN
                RAISE EXCEPTION 'Insufficient sellable stock for "%". Required: %, Shortfall: % pieces',
                    v_med.brand_name, v_pieces_needed, v_pieces_remaining;
            END IF;
        END IF;
    END LOOP;

    -- 9. Bill Discount, Round-Off, and Grand Total
    v_raw_total := GREATEST(0.00, v_raw_total - COALESCE(p_bill_discount, 0.00));
    v_grand_total := ROUND(v_raw_total);
    v_round_off := v_grand_total - v_raw_total;

    -- 10. Update Invoice Record
    UPDATE public.invoices
    SET subtotal_taxable = v_subtotal_taxable,
        cgst_amount = v_total_cgst,
        sgst_amount = v_total_sgst,
        igst_amount = v_total_igst,
        total_gst = v_total_gst,
        discount_amount = COALESCE(p_bill_discount, 0.00),
        round_off = v_round_off,
        total_amount = v_grand_total
    WHERE id = v_invoice_id;

    -- 11. Payment Processing & Split Payment Ledger
    IF jsonb_array_length(p_payment_splits) > 0 THEN
        FOR v_split IN SELECT * FROM jsonb_to_recordset(p_payment_splits) AS y(
            method VARCHAR,
            amount NUMERIC,
            reference VARCHAR
        )
        LOOP
            INSERT INTO public.payment_records (
                invoice_id,
                branch_id,
                payment_method,
                amount,
                transaction_reference,
                status,
                recorded_by
            ) VALUES (
                v_invoice_id,
                p_branch_id,
                v_split.method,
                v_split.amount,
                v_split.reference,
                'success',
                v_user_id
            );

            IF v_split.method = 'credit' THEN
                v_credit_amount := v_credit_amount + v_split.amount;
            END IF;
        END LOOP;
    ELSE
        INSERT INTO public.payment_records (
            invoice_id,
            branch_id,
            payment_method,
            amount,
            status,
            recorded_by
        ) VALUES (
            v_invoice_id,
            p_branch_id,
            p_payment_method,
            v_grand_total,
            'success',
            v_user_id
        );

        IF p_payment_method = 'credit' THEN
            v_credit_amount := v_grand_total;
        END IF;
    END IF;

    -- 12. Customer Udhaar / Credit Ledger Processing
    IF v_credit_amount > 0 AND p_customer_id IS NOT NULL THEN
        SELECT * INTO v_customer_rec FROM public.customers WHERE id = p_customer_id FOR UPDATE;
        IF FOUND THEN
            IF (v_customer_rec.outstanding_balance + v_credit_amount) > v_customer_rec.credit_limit THEN
                RAISE EXCEPTION 'Customer credit limit exceeded! Limit: ₹%, Current Due: ₹%, Attempted Credit: ₹%',
                    v_customer_rec.credit_limit, v_customer_rec.outstanding_balance, v_credit_amount;
            END IF;

            UPDATE public.customers
            SET outstanding_balance = outstanding_balance + v_credit_amount,
                version = version + 1,
                updated_at = NOW()
            WHERE id = p_customer_id;

            INSERT INTO public.customer_ledger (
                business_id,
                customer_id,
                entry_type,
                reference_id,
                debit_amount,
                credit_amount,
                balance_after,
                notes,
                created_by
            ) VALUES (
                v_branch_rec.business_id,
                p_customer_id,
                'sale_credit',
                v_invoice_num,
                v_credit_amount,
                0.00,
                v_customer_rec.outstanding_balance + v_credit_amount,
                'Credit sale POS invoice ' || v_invoice_num,
                v_user_id
            );
        END IF;
    END IF;

    -- 13. Audit Trail Entry
    INSERT INTO public.audit_logs (
        business_id,
        user_id,
        action,
        entity_type,
        entity_id,
        details
    ) VALUES (
        v_branch_rec.business_id,
        v_user_id,
        'CREATE_INVOICE_ATOMIC',
        'INVOICE',
        v_invoice_num,
        jsonb_build_object(
            'grand_total', v_grand_total,
            'taxable', v_subtotal_taxable,
            'gst', v_total_gst,
            'payment_method', p_payment_method,
            'customer_phone', p_customer_phone,
            'counter_id', p_counter_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_num,
        'grand_total', v_grand_total,
        'subtotal_taxable', v_subtotal_taxable,
        'total_gst', v_total_gst,
        'round_off', v_round_off,
        'created_at', NOW()
    );
END;
$$;

-- 2. CANCEL INVOICE RPC (Mandatory Reason + Permission Check + Stock Restock + Reversal)
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
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
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

-- 3. CREATE SALES RETURN / CREDIT NOTE RPC
CREATE OR REPLACE FUNCTION public.create_sales_return(
    p_branch_id UUID,
    p_original_invoice_id UUID,
    p_items JSONB, -- Array of { invoice_item_id: UUID, pieces_returned: number, restock: boolean }
    p_reason TEXT,
    p_refund_method VARCHAR DEFAULT 'cash'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_inv RECORD;
    v_credit_note_num VARCHAR(100);
    v_return_id UUID;
    v_subtotal NUMERIC(12, 2) := 0.00;
    v_total_cgst NUMERIC(12, 2) := 0.00;
    v_total_sgst NUMERIC(12, 2) := 0.00;
    v_total_igst NUMERIC(12, 2) := 0.00;
    v_total_gst NUMERIC(12, 2) := 0.00;
    v_total_amount NUMERIC(12, 2) := 0.00;
    v_ret_item RECORD;
    v_orig_item RECORD;
    v_line_taxable NUMERIC(12, 2);
    v_line_gst NUMERIC(12, 2);
    v_line_cgst NUMERIC(12, 2);
    v_line_sgst NUMERIC(12, 2);
    v_line_igst NUMERIC(12, 2);
    v_line_total NUMERIC(12, 2);
BEGIN
    v_user_id := auth.uid();
    SELECT * INTO v_inv FROM public.invoices WHERE id = p_original_invoice_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Original invoice not found';
    END IF;

    v_credit_note_num := 'CN-' || v_inv.invoice_number;

    INSERT INTO public.sales_returns (
        branch_id,
        original_invoice_id,
        credit_note_number,
        customer_name,
        customer_phone,
        refund_method,
        reason,
        created_by
    ) VALUES (
        p_branch_id,
        p_original_invoice_id,
        v_credit_note_num,
        v_inv.customer_name,
        v_inv.customer_phone,
        p_refund_method,
        p_reason,
        v_user_id
    ) RETURNING id INTO v_return_id;

    FOR v_ret_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        invoice_item_id UUID,
        pieces_returned BIGINT,
        restock BOOLEAN
    )
    LOOP
        SELECT * INTO v_orig_item FROM public.invoice_items WHERE id = v_ret_item.invoice_item_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invoice item % not found', v_ret_item.invoice_item_id;
        END IF;

        v_line_total := ROUND((v_orig_item.total_amount / v_orig_item.pieces_count) * v_ret_item.pieces_returned, 2);
        v_line_taxable := ROUND((v_orig_item.taxable_amount / v_orig_item.pieces_count) * v_ret_item.pieces_returned, 2);
        v_line_gst := v_line_total - v_line_taxable;

        IF v_inv.is_interstate THEN
            v_line_igst := v_line_gst;
            v_line_cgst := 0.00;
            v_line_sgst := 0.00;
            v_total_igst := v_total_igst + v_line_igst;
        ELSE
            v_line_cgst := ROUND(v_line_gst / 2.0, 2);
            v_line_sgst := v_line_gst - v_line_cgst;
            v_line_igst := 0.00;
            v_total_cgst := v_total_cgst + v_line_cgst;
            v_total_sgst := v_total_sgst + v_line_sgst;
        END IF;

        v_subtotal := v_subtotal + v_line_taxable;
        v_total_gst := v_total_gst + v_line_gst;
        v_total_amount := v_total_amount + v_line_total;

        INSERT INTO public.sales_return_items (
            sales_return_id,
            invoice_item_id,
            medicine_id,
            batch_number,
            pieces_returned,
            unit_price,
            gst_rate,
            taxable_amount,
            gst_amount,
            total_amount,
            restock_status
        ) VALUES (
            v_return_id,
            v_ret_item.invoice_item_id,
            v_orig_item.medicine_id,
            v_orig_item.batch_number,
            v_ret_item.pieces_returned,
            v_orig_item.unit_price,
            v_orig_item.gst_rate,
            v_line_taxable,
            v_line_gst,
            v_line_total,
            CASE WHEN v_ret_item.restock THEN 'restocked' ELSE 'quarantined' END
        );

        IF v_ret_item.restock AND v_orig_item.batch_id IS NOT NULL THEN
            UPDATE public.inventory_batches
            SET stock_pieces = stock_pieces + v_ret_item.pieces_returned, version = version + 1, updated_at = NOW()
            WHERE id = v_orig_item.batch_id;
        END IF;
    END LOOP;

    UPDATE public.sales_returns
    SET subtotal_taxable = v_subtotal,
        total_cgst = v_total_cgst,
        total_sgst = v_total_sgst,
        total_igst = v_total_igst,
        total_gst = v_total_gst,
        total_amount = v_total_amount
    WHERE id = v_return_id;

    RETURN jsonb_build_object(
        'success', true,
        'credit_note_number', v_credit_note_num,
        'total_amount', v_total_amount
    );
END;
$$;

-- 4. CREATE PURCHASE INVOICE RPC (Creates Batches + Updates Costs + Supplier Ledger)
CREATE OR REPLACE FUNCTION public.create_purchase_invoice(
    p_branch_id UUID,
    p_supplier_id UUID,
    p_supplier_invoice_number VARCHAR,
    p_invoice_date DATE,
    p_items JSONB, -- Array of { medicine_id: UUID, batch_number: string, expiry_date: date, quantity_units: number, pieces_per_unit: number, free_quantity_units: number, purchase_rate: number, mrp: number, gst_rate: number, discount_percent: number }
    p_bill_image_url TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_purchase_id UUID;
    v_item RECORD;
    v_med RECORD;
    v_total_pieces BIGINT;
    v_line_gross NUMERIC(12, 2);
    v_line_taxable NUMERIC(12, 2);
    v_line_gst NUMERIC(12, 2);
    v_line_total NUMERIC(12, 2);
    v_subtotal NUMERIC(12, 2) := 0.00;
    v_total_gst NUMERIC(12, 2) := 0.00;
    v_grand_total NUMERIC(12, 2) := 0.00;
    v_supplier RECORD;
BEGIN
    v_user_id := auth.uid();
    SELECT * INTO v_supplier FROM public.suppliers WHERE id = p_supplier_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Supplier not found';
    END IF;

    INSERT INTO public.purchase_invoices (
        branch_id,
        supplier_id,
        supplier_invoice_number,
        invoice_date,
        bill_image_url,
        notes,
        created_by
    ) VALUES (
        p_branch_id,
        p_supplier_id,
        p_supplier_invoice_number,
        p_invoice_date,
        p_bill_image_url,
        p_notes,
        v_user_id
    ) RETURNING id INTO v_purchase_id;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        medicine_id UUID,
        batch_number VARCHAR,
        expiry_date DATE,
        quantity_units NUMERIC,
        pieces_per_unit INT,
        free_quantity_units NUMERIC,
        purchase_rate NUMERIC,
        mrp NUMERIC,
        gst_rate NUMERIC,
        discount_percent NUMERIC
    )
    LOOP
        SELECT * INTO v_med FROM public.medicine_master WHERE id = v_item.medicine_id;
        v_total_pieces := ROUND((v_item.quantity_units + COALESCE(v_item.free_quantity_units, 0)) * v_item.pieces_per_unit);

        v_line_gross := ROUND(v_item.quantity_units * v_item.purchase_rate, 2);
        IF v_item.discount_percent > 0 THEN
            v_line_gross := ROUND(v_line_gross * (1.0 - (v_item.discount_percent / 100.0)), 2);
        END IF;

        v_line_taxable := v_line_gross;
        v_line_gst := ROUND(v_line_taxable * (v_item.gst_rate / 100.0), 2);
        v_line_total := v_line_taxable + v_line_gst;

        v_subtotal := v_subtotal + v_line_taxable;
        v_total_gst := v_total_gst + v_line_gst;
        v_grand_total := v_grand_total + v_line_total;

        INSERT INTO public.purchase_items (
            purchase_invoice_id,
            medicine_id,
            batch_number,
            expiry_date,
            quantity_units,
            pieces_per_unit,
            total_pieces,
            free_quantity_units,
            purchase_rate,
            mrp,
            discount_percent,
            gst_rate,
            taxable_amount,
            gst_amount,
            total_amount
        ) VALUES (
            v_purchase_id,
            v_item.medicine_id,
            v_item.batch_number,
            v_item.expiry_date,
            v_item.quantity_units,
            v_item.pieces_per_unit,
            v_total_pieces,
            COALESCE(v_item.free_quantity_units, 0),
            v_item.purchase_rate,
            v_item.mrp,
            COALESCE(v_item.discount_percent, 0),
            v_item.gst_rate,
            v_line_taxable,
            v_line_gst,
            v_line_total
        );

        -- Upsert into inventory_batches
        INSERT INTO public.inventory_batches (
            branch_id,
            medicine_id,
            batch_number,
            expiry_date,
            stock_pieces,
            mrp,
            purchase_rate
        ) VALUES (
            p_branch_id,
            v_item.medicine_id,
            v_item.batch_number,
            v_item.expiry_date,
            v_total_pieces,
            v_item.mrp,
            v_item.purchase_rate
        )
        ON CONFLICT (branch_id, medicine_id, batch_number) DO UPDATE
        SET stock_pieces = public.inventory_batches.stock_pieces + v_total_pieces,
            mrp = EXCLUDED.mrp,
            purchase_rate = EXCLUDED.purchase_rate,
            expiry_date = EXCLUDED.expiry_date,
            version = public.inventory_batches.version + 1,
            updated_at = NOW();

        -- Update catalog purchase cost
        UPDATE public.medicine_master
        SET purchase_cost = v_item.purchase_rate,
            mrp = GREATEST(mrp, v_item.mrp),
            updated_at = NOW()
        WHERE id = v_item.medicine_id;
    END LOOP;

    UPDATE public.purchase_invoices
    SET subtotal_taxable = v_subtotal,
        total_gst = v_total_gst,
        total_amount = v_grand_total
    WHERE id = v_purchase_id;

    -- Update supplier ledger & balance
    UPDATE public.suppliers
    SET current_balance = current_balance + v_grand_total,
        version = version + 1,
        updated_at = NOW()
    WHERE id = p_supplier_id;

    INSERT INTO public.supplier_ledger (
        business_id,
        supplier_id,
        entry_type,
        reference_id,
        debit_amount,
        credit_amount,
        balance_after,
        notes,
        created_by
    ) VALUES (
        v_supplier.business_id,
        p_supplier_id,
        'purchase',
        p_supplier_invoice_number,
        0.00,
        v_grand_total,
        v_supplier.current_balance + v_grand_total,
        'Purchase bill ' || p_supplier_invoice_number,
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'purchase_id', v_purchase_id,
        'total_amount', v_grand_total
    );
END;
$$;

-- 5. RECORD CUSTOMER PAYMENT RPC
CREATE OR REPLACE FUNCTION public.record_customer_payment(
    p_customer_id UUID,
    p_amount NUMERIC(12, 2),
    p_payment_method VARCHAR DEFAULT 'cash',
    p_reference VARCHAR DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_cust RECORD;
    v_new_bal NUMERIC(12, 2);
BEGIN
    v_user_id := auth.uid();
    SELECT * INTO v_cust FROM public.customers WHERE id = p_customer_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Customer not found';
    END IF;

    v_new_bal := GREATEST(0.00, v_cust.outstanding_balance - p_amount);

    UPDATE public.customers
    SET outstanding_balance = v_new_bal,
        version = version + 1,
        updated_at = NOW()
    WHERE id = p_customer_id;

    INSERT INTO public.customer_ledger (
        business_id,
        customer_id,
        entry_type,
        reference_id,
        debit_amount,
        credit_amount,
        balance_after,
        payment_method,
        notes,
        created_by
    ) VALUES (
        v_cust.business_id,
        p_customer_id,
        'payment_received',
        p_reference,
        0.00,
        p_amount,
        v_new_bal,
        p_payment_method,
        COALESCE(p_notes, 'Customer dues payment received'),
        v_user_id
    );

    RETURN jsonb_build_object('success', true, 'new_balance', v_new_bal);
END;
$$;

-- 6. RECORD SUPPLIER PAYMENT RPC
CREATE OR REPLACE FUNCTION public.record_supplier_payment(
    p_supplier_id UUID,
    p_amount NUMERIC(12, 2),
    p_payment_method VARCHAR DEFAULT 'bank_transfer',
    p_reference VARCHAR DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_supp RECORD;
    v_new_bal NUMERIC(12, 2);
BEGIN
    v_user_id := auth.uid();
    SELECT * INTO v_supp FROM public.suppliers WHERE id = p_supplier_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Supplier not found';
    END IF;

    v_new_bal := v_supp.current_balance - p_amount;

    UPDATE public.suppliers
    SET current_balance = v_new_bal,
        version = version + 1,
        updated_at = NOW()
    WHERE id = p_supplier_id;

    INSERT INTO public.supplier_ledger (
        business_id,
        supplier_id,
        entry_type,
        reference_id,
        debit_amount,
        credit_amount,
        balance_after,
        payment_method,
        notes,
        created_by
    ) VALUES (
        v_supp.business_id,
        p_supplier_id,
        'payment',
        p_reference,
        p_amount,
        0.00,
        v_new_bal,
        p_payment_method,
        COALESCE(p_notes, 'Supplier payment disbursed'),
        v_user_id
    );

    RETURN jsonb_build_object('success', true, 'new_balance', v_new_bal);
END;
$$;

-- 7. DAY CLOSE RPC (Cash Management & Shift Reconciliation)
CREATE OR REPLACE FUNCTION public.close_day(
    p_branch_id UUID,
    p_counter_id UUID,
    p_actual_cash NUMERIC(12, 2),
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_day_rec RECORD;
    v_cash_sales NUMERIC(12, 2) := 0.00;
    v_upi_sales NUMERIC(12, 2) := 0.00;
    v_card_sales NUMERIC(12, 2) := 0.00;
    v_credit_sales NUMERIC(12, 2) := 0.00;
    v_cash_returns NUMERIC(12, 2) := 0.00;
    v_cash_expenses NUMERIC(12, 2) := 0.00;
    v_opening_cash NUMERIC(12, 2) := 0.00;
    v_system_closing NUMERIC(12, 2);
    v_diff NUMERIC(12, 2);
    v_day_close_id UUID;
BEGIN
    v_user_id := auth.uid();

    -- Calculate collections for today on this branch/counter
    SELECT
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN payment_method = 'upi' THEN amount ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN amount ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN amount ELSE 0 END), 0.00)
    INTO v_cash_sales, v_upi_sales, v_card_sales, v_credit_sales
    FROM public.payment_records
    WHERE branch_id = p_branch_id AND DATE(created_at) = CURRENT_DATE;

    SELECT COALESCE(SUM(total_amount), 0.00) INTO v_cash_returns
    FROM public.sales_returns
    WHERE branch_id = p_branch_id AND refund_method = 'cash' AND DATE(return_date) = CURRENT_DATE;

    SELECT COALESCE(SUM(amount), 0.00) INTO v_cash_expenses
    FROM public.expenses
    WHERE branch_id = p_branch_id AND payment_method = 'cash' AND DATE(created_at) = CURRENT_DATE;

    v_system_closing := (v_opening_cash + v_cash_sales) - (v_cash_returns + v_cash_expenses);
    v_diff := p_actual_cash - v_system_closing;

    INSERT INTO public.day_close (
        branch_id,
        counter_id,
        opening_cash,
        cash_sales,
        upi_sales,
        card_sales,
        credit_sales,
        cash_returns,
        cash_expenses,
        system_closing_cash,
        actual_closing_cash,
        difference,
        status,
        notes,
        closed_by,
        closed_at
    ) VALUES (
        p_branch_id,
        p_counter_id,
        v_opening_cash,
        v_cash_sales,
        v_upi_sales,
        v_card_sales,
        v_credit_sales,
        v_cash_returns,
        v_cash_expenses,
        v_system_closing,
        p_actual_cash,
        v_diff,
        'closed',
        p_notes,
        v_user_id,
        NOW()
    ) RETURNING id INTO v_day_close_id;

    RETURN jsonb_build_object(
        'success', true,
        'day_close_id', v_day_close_id,
        'system_closing_cash', v_system_closing,
        'actual_closing_cash', p_actual_cash,
        'difference', v_diff
    );
END;
$$;

-- 8. GSTR-1 & GST SUMMARY RPC
CREATE OR REPLACE FUNCTION public.get_gstr1_data(
    p_start_date DATE,
    p_end_date DATE,
    p_branch_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_b2b JSONB;
    v_b2c JSONB;
    v_hsn JSONB;
    v_totals JSONB;
BEGIN
    -- B2B Sales (Invoices with customer GSTIN)
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_b2b
    FROM (
        SELECT
            i.invoice_number,
            i.invoice_date,
            i.customer_name,
            i.customer_gstin,
            i.subtotal_taxable,
            i.cgst_amount,
            i.sgst_amount,
            i.igst_amount,
            i.total_gst,
            i.total_amount
        FROM public.invoices i
        WHERE i.customer_gstin IS NOT NULL
          AND DATE(i.invoice_date) BETWEEN p_start_date AND p_end_date
          AND i.payment_status = 'paid'
          AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
    ) t;

    -- B2C Sales Summary by Tax Rate
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_b2c
    FROM (
        SELECT
            ii.gst_rate,
            SUM(ii.taxable_amount) AS taxable_amount,
            SUM(ii.cgst_amount) AS cgst_amount,
            SUM(ii.sgst_amount) AS sgst_amount,
            SUM(ii.igst_amount) AS igst_amount,
            SUM(ii.total_amount) AS total_amount
        FROM public.invoice_items ii
        JOIN public.invoices i ON ii.invoice_id = i.id
        WHERE i.customer_gstin IS NULL
          AND DATE(i.invoice_date) BETWEEN p_start_date AND p_end_date
          AND i.payment_status = 'paid'
          AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
        GROUP BY ii.gst_rate
    ) t;

    -- HSN Summary
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_hsn
    FROM (
        SELECT
            COALESCE(ii.hsn_code, '3004') AS hsn_code,
            COUNT(DISTINCT ii.medicine_id) AS items_count,
            SUM(ii.pieces_count) AS total_pieces,
            SUM(ii.taxable_amount) AS taxable_amount,
            SUM(ii.gst_amount) AS gst_amount,
            SUM(ii.total_amount) AS total_amount
        FROM public.invoice_items ii
        JOIN public.invoices i ON ii.invoice_id = i.id
        WHERE DATE(i.invoice_date) BETWEEN p_start_date AND p_end_date
          AND i.payment_status = 'paid'
          AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
        GROUP BY COALESCE(ii.hsn_code, '3004')
    ) t;

    -- Overall Totals
    SELECT row_to_json(t) INTO v_totals
    FROM (
        SELECT
            COALESCE(SUM(subtotal_taxable), 0.00) AS taxable,
            COALESCE(SUM(cgst_amount), 0.00) AS cgst,
            COALESCE(SUM(sgst_amount), 0.00) AS sgst,
            COALESCE(SUM(igst_amount), 0.00) AS igst,
            COALESCE(SUM(total_gst), 0.00) AS total_gst,
            COALESCE(SUM(total_amount), 0.00) AS grand_total
        FROM public.invoices
        WHERE DATE(invoice_date) BETWEEN p_start_date AND p_end_date
          AND payment_status = 'paid'
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    ) t;

    RETURN jsonb_build_object(
        'b2b_invoices', v_b2b,
        'b2c_breakup', v_b2c,
        'hsn_summary', v_hsn,
        'totals', v_totals
    );
END;
$$;

-- 9. SYNC FEED RPCs (Offline SQLite Replication & Outbox)
CREATE OR REPLACE FUNCTION public.pull_changes(
    p_since_timestamp TIMESTAMPTZ,
    p_branch_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_medicines JSONB;
    v_batches JSONB;
    v_customers JSONB;
    v_counters JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(row_to_json(m)), '[]'::jsonb) INTO v_medicines
    FROM public.medicine_master m
    WHERE m.updated_at >= p_since_timestamp;

    SELECT COALESCE(jsonb_agg(row_to_json(b)), '[]'::jsonb) INTO v_batches
    FROM public.inventory_batches b
    WHERE b.branch_id = p_branch_id AND b.updated_at >= p_since_timestamp;

    SELECT COALESCE(jsonb_agg(row_to_json(c)), '[]'::jsonb) INTO v_customers
    FROM public.customers c
    WHERE c.updated_at >= p_since_timestamp;

    SELECT COALESCE(jsonb_agg(row_to_json(ct)), '[]'::jsonb) INTO v_counters
    FROM public.counters ct
    WHERE ct.branch_id = p_branch_id AND ct.updated_at >= p_since_timestamp;

    RETURN jsonb_build_object(
        'server_timestamp', NOW(),
        'medicines', v_medicines,
        'batches', v_batches,
        'customers', v_customers,
        'counters', v_counters
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.push_changes(
    p_changes JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_item RECORD;
    v_processed_count INT := 0;
    v_discrepancy_count INT := 0;
BEGIN
    -- Processes queued offline bills idempotently
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_changes) AS x(
        entity VARCHAR,
        payload JSONB,
        idempotency_key VARCHAR
    )
    LOOP
        IF v_item.entity = 'invoice' THEN
            -- In offline mode, create_invoice_atomic executes with idempotency key
            BEGIN
                PERFORM public.create_invoice_atomic(
                    (v_item.payload->>'branch_id')::UUID,
                    (v_item.payload->>'counter_id')::UUID,
                    v_item.payload->>'customer_name',
                    v_item.payload->>'customer_phone',
                    (v_item.payload->>'customer_id')::UUID,
                    v_item.payload->>'customer_gstin',
                    v_item.payload->>'customer_state_code',
                    (v_item.payload->>'doctor_id')::UUID,
                    v_item.payload->>'doctor_name',
                    v_item.payload->>'doctor_reg_no',
                    v_item.payload->>'payment_method',
                    COALESCE(v_item.payload->'payment_splits', '[]'::jsonb),
                    v_item.payload->'items',
                    COALESCE((v_item.payload->>'bill_discount')::NUMERIC, 0.00),
                    v_item.payload->>'notes',
                    v_item.payload->>'device_id',
                    v_item.idempotency_key
                );
                v_processed_count := v_processed_count + 1;
            EXCEPTION WHEN OTHERS THEN
                -- Offline policy: record discrepancy rather than crash sync batch
                INSERT INTO public.discrepancies (
                    branch_id,
                    discrepancy_type,
                    status,
                    title,
                    description,
                    client_record_id,
                    payload
                ) VALUES (
                    (v_item.payload->>'branch_id')::UUID,
                    'negative_stock',
                    'open',
                    'Sync conflict on offline bill ' || COALESCE(v_item.payload->>'invoice_number', v_item.idempotency_key),
                    SQLERRM,
                    v_item.idempotency_key,
                    v_item.payload
                );
                v_discrepancy_count := v_discrepancy_count + 1;
            END;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'processed_records', v_processed_count,
        'discrepancies_flagged', v_discrepancy_count
    );
END;
$$;
