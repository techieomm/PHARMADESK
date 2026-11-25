-- ====================================================================
-- PHARMADESK — MIGRATION 017: CUSTOMER AGE, ADDRESS, AND OPTIONAL PHONE
-- 1. Makes phone optional in public.invoices and public.customers
-- 2. Adds customer_age and customer_address to public.invoices
-- 3. Adds age to public.customers (address already exists)
-- 4. Updates create_invoice_atomic RPC with p_customer_age and p_customer_address
-- ====================================================================

-- 1. Invoices Table: Optional phone, add age & address
ALTER TABLE public.invoices ALTER COLUMN customer_phone DROP NOT NULL;
ALTER TABLE public.invoices ALTER COLUMN customer_phone SET DEFAULT NULL;

ALTER TABLE public.invoices 
    ADD COLUMN IF NOT EXISTS customer_age INT CHECK (customer_age IS NULL OR (customer_age >= 0 AND customer_age <= 150));

ALTER TABLE public.invoices 
    ADD COLUMN IF NOT EXISTS customer_address TEXT;

-- 2. Customers Table: Optional phone, add age
ALTER TABLE public.customers ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE public.customers ALTER COLUMN phone SET DEFAULT NULL;

ALTER TABLE public.customers 
    ADD COLUMN IF NOT EXISTS age INT CHECK (age IS NULL OR (age >= 0 AND age <= 150));

-- 3. Update create_invoice_atomic RPC
DROP FUNCTION IF EXISTS public.create_invoice_atomic(UUID, UUID, VARCHAR, VARCHAR, UUID, VARCHAR, VARCHAR, UUID, VARCHAR, VARCHAR, VARCHAR, JSONB, JSONB, NUMERIC, TEXT, VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION public.create_invoice_atomic(
    p_branch_id UUID,
    p_counter_id UUID,
    p_customer_name VARCHAR,
    p_customer_phone VARCHAR DEFAULT NULL,
    p_customer_id UUID DEFAULT NULL,
    p_customer_gstin VARCHAR DEFAULT NULL,
    p_customer_state_code VARCHAR DEFAULT '09',
    p_doctor_id UUID DEFAULT NULL,
    p_doctor_name VARCHAR DEFAULT NULL,
    p_doctor_reg_no VARCHAR DEFAULT NULL,
    p_payment_method VARCHAR DEFAULT 'cash', -- 'cash', 'upi', 'card', 'credit', 'split'
    p_payment_splits JSONB DEFAULT '[]'::jsonb,
    p_items JSONB DEFAULT '[]'::jsonb,
    p_bill_discount NUMERIC(12, 2) DEFAULT 0.00,
    p_notes TEXT DEFAULT NULL,
    p_device_id VARCHAR DEFAULT NULL,
    p_idempotency_key VARCHAR DEFAULT NULL,
    p_customer_age INT DEFAULT NULL,
    p_customer_address TEXT DEFAULT NULL
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
    v_clean_phone VARCHAR(30);
    v_clean_addr TEXT;
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

    -- Clean phone & address
    v_clean_phone := NULLIF(trim(p_customer_phone), '');
    v_clean_addr := NULLIF(trim(p_customer_address), '');

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
        customer_age,
        customer_address,
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
        v_clean_phone,
        p_customer_age,
        v_clean_addr,
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

    -- If customer_id provided, sync age and address to customer profile
    IF p_customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET age = COALESCE(p_customer_age, age),
            address = COALESCE(v_clean_addr, address),
            phone = COALESCE(v_clean_phone, phone),
            updated_at = NOW()
        WHERE id = p_customer_id;
    END IF;

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

            -- Statutory Schedule H1 Register Entry (Captures customer name & address)
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
                    COALESCE(v_clean_addr, p_notes, 'Local'),
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
                        COALESCE(v_clean_addr, p_notes, 'Local'),
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
        new_values
    ) VALUES (
        v_branch_rec.business_id,
        v_user_id,
        'INSERT',
        'invoices',
        v_invoice_id,
        jsonb_build_object(
            'invoice_number', v_invoice_num,
            'total_amount', v_grand_total,
            'customer_name', p_customer_name,
            'customer_phone', v_clean_phone,
            'customer_age', p_customer_age,
            'customer_address', v_clean_addr,
            'branch_id', p_branch_id,
            'payment_method', p_payment_method
        )
    );

    -- 14. Return Success Payload
    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_num,
        'invoice_date', NOW(),
        'customer_name', p_customer_name,
        'customer_phone', v_clean_phone,
        'customer_age', p_customer_age,
        'customer_address', v_clean_addr,
        'subtotal_taxable', v_subtotal_taxable,
        'cgst_amount', v_total_cgst,
        'sgst_amount', v_total_sgst,
        'igst_amount', v_total_igst,
        'total_gst', v_total_gst,
        'discount_amount', COALESCE(p_bill_discount, 0.00),
        'round_off', v_round_off,
        'total_amount', v_grand_total,
        'payment_method', p_payment_method
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_invoice_atomic TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
