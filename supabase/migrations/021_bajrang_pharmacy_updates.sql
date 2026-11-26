-- ====================================================================
-- BAJRANG PHARMACY — MIGRATION 021:
-- 1. Add 'prescription_employee' role to public.app_role
-- 2. Fix inventory_batches <-> branch_inventory split-brain bug & rewrite adjust_stock_atomic
-- 3. Enhance doctors table & RLS policies
-- 4. Create prescription_slips, prescription_slip_sequences, consultation_fee_records
-- 5. Atomic concurrency-safe RPCs for prescription slip generation + public branding RPC
-- ====================================================================

-- 1. ADD NEW ROLE VALUE (Safe, idempotent)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'prescription_employee';

-- 2. INVENTORY ROOT-CAUSE FIX: SYNC LEGACY branch_inventory INTO inventory_batches
-- Preserves any manually entered stock in branch_inventory that had no corresponding batch row
INSERT INTO public.inventory_batches (
    branch_id,
    medicine_id,
    batch_number,
    expiry_date,
    stock_pieces,
    mrp,
    purchase_rate,
    rack_location,
    is_active
)
SELECT
    bi.branch_id,
    bi.medicine_id,
    COALESCE(NULLIF(TRIM(bi.batch_number), ''), 'OPENING-01'),
    COALESCE(bi.expiry_date, (CURRENT_DATE + INTERVAL '2 years')::DATE),
    bi.stock_pieces,
    COALESCE(m.mrp, 0),
    m.purchase_cost,
    bi.rack_location,
    TRUE
FROM public.branch_inventory bi
JOIN public.medicine_master m ON m.id = bi.medicine_id
WHERE bi.stock_pieces > 0
  AND NOT EXISTS (
      SELECT 1
      FROM public.inventory_batches ib
      WHERE ib.branch_id = bi.branch_id
        AND ib.medicine_id = bi.medicine_id
        AND ib.is_active = TRUE
        AND ib.deleted_at IS NULL
        AND ib.stock_pieces > 0
  )
ON CONFLICT (branch_id, medicine_id, batch_number) DO UPDATE
SET stock_pieces = GREATEST(public.inventory_batches.stock_pieces, EXCLUDED.stock_pieces),
    expiry_date = COALESCE(EXCLUDED.expiry_date, public.inventory_batches.expiry_date),
    is_active = TRUE,
    deleted_at = NULL,
    updated_at = NOW();

-- 2b. TRIGGER TO KEEP branch_inventory AUTOMATICALLY SYNCHRONIZED WITH inventory_batches
CREATE OR REPLACE FUNCTION public.sync_branch_inventory_from_batches()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_branch_id UUID;
    v_medicine_id UUID;
    v_total_pieces BIGINT;
    v_next_batch VARCHAR(100);
    v_next_expiry DATE;
    v_rack VARCHAR(50);
BEGIN
    v_branch_id := COALESCE(NEW.branch_id, OLD.branch_id);
    v_medicine_id := COALESCE(NEW.medicine_id, OLD.medicine_id);

    SELECT COALESCE(SUM(stock_pieces), 0)
    INTO v_total_pieces
    FROM public.inventory_batches
    WHERE branch_id = v_branch_id
      AND medicine_id = v_medicine_id
      AND is_active = TRUE
      AND deleted_at IS NULL;

    SELECT batch_number, expiry_date, rack_location
    INTO v_next_batch, v_next_expiry, v_rack
    FROM public.inventory_batches
    WHERE branch_id = v_branch_id
      AND medicine_id = v_medicine_id
      AND is_active = TRUE
      AND deleted_at IS NULL
      AND stock_pieces > 0
    ORDER BY expiry_date ASC
    LIMIT 1;

    INSERT INTO public.branch_inventory (
        branch_id,
        medicine_id,
        stock_pieces,
        batch_number,
        expiry_date,
        rack_location,
        updated_at
    ) VALUES (
        v_branch_id,
        v_medicine_id,
        v_total_pieces,
        v_next_batch,
        v_next_expiry,
        v_rack,
        NOW()
    )
    ON CONFLICT (branch_id, medicine_id) DO UPDATE
    SET stock_pieces = EXCLUDED.stock_pieces,
        batch_number = COALESCE(EXCLUDED.batch_number, public.branch_inventory.batch_number),
        expiry_date = COALESCE(EXCLUDED.expiry_date, public.branch_inventory.expiry_date),
        rack_location = COALESCE(EXCLUDED.rack_location, public.branch_inventory.rack_location),
        updated_at = NOW();

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_branch_inventory_from_batches ON public.inventory_batches;
CREATE TRIGGER trg_sync_branch_inventory_from_batches
    AFTER INSERT OR UPDATE OR DELETE ON public.inventory_batches
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_branch_inventory_from_batches();

-- 2c. REWRITE adjust_stock_atomic TO OPERATE ON inventory_batches (SINGLE SOURCE OF TRUTH)
CREATE OR REPLACE FUNCTION public.adjust_stock_atomic(
    p_branch_id UUID,
    p_medicine_id UUID,
    p_adjustment_type VARCHAR, -- 'add', 'set', 'subtract'
    p_unit VARCHAR, -- 'strip', 'piece'
    p_quantity NUMERIC,
    p_notes TEXT DEFAULT NULL,
    p_batch_number VARCHAR DEFAULT NULL,
    p_expiry_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_user_role TEXT;
    v_med RECORD;
    v_batch RECORD;
    v_pieces_delta BIGINT;
    v_current_total BIGINT;
    v_new_balance BIGINT;
    v_target_batch VARCHAR(100);
    v_target_expiry DATE;
    v_remaining BIGINT;
    v_take BIGINT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT role::text INTO v_user_role FROM public.profiles WHERE id = v_user_id;
    IF v_user_role NOT IN ('master_admin', 'sub_admin', 'branch_manager', 'inventory_manager') THEN
        RAISE EXCEPTION 'Forbidden: Insufficient privileges for stock management';
    END IF;

    SELECT * INTO v_med FROM public.medicine_master WHERE id = p_medicine_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Medicine not found';
    END IF;

    IF p_unit = 'strip' THEN
        v_pieces_delta := ROUND(p_quantity * GREATEST(COALESCE(v_med.pieces_per_strip, 1), 1));
    ELSIF p_unit = 'piece' THEN
        v_pieces_delta := ROUND(p_quantity);
    ELSE
        RAISE EXCEPTION 'Invalid unit. Must be strip or piece';
    END IF;

    IF p_adjustment_type IN ('add', 'subtract') AND v_pieces_delta <= 0 THEN
        RAISE EXCEPTION 'Quantity must be greater than zero';
    END IF;
    IF p_adjustment_type = 'set' AND v_pieces_delta < 0 THEN
        RAISE EXCEPTION 'Stock quantity cannot be negative';
    END IF;

    v_target_batch := NULLIF(TRIM(p_batch_number), '');
    v_target_expiry := p_expiry_date;

    -- Lock existing batches for this branch & medicine
    PERFORM 1 FROM public.inventory_batches
    WHERE branch_id = p_branch_id AND medicine_id = p_medicine_id
    FOR UPDATE;

    SELECT COALESCE(SUM(stock_pieces), 0) INTO v_current_total
    FROM public.inventory_batches
    WHERE branch_id = p_branch_id
      AND medicine_id = p_medicine_id
      AND is_active = TRUE
      AND deleted_at IS NULL;

    IF p_adjustment_type = 'add' THEN
        IF v_target_batch IS NULL THEN
            -- Reuse latest active non-expired batch if one exists, otherwise create DEFAULT-01
            SELECT * INTO v_batch
            FROM public.inventory_batches
            WHERE branch_id = p_branch_id
              AND medicine_id = p_medicine_id
              AND is_active = TRUE
              AND deleted_at IS NULL
              AND expiry_date > CURRENT_DATE
            ORDER BY expiry_date DESC, created_at DESC
            LIMIT 1;

            IF FOUND THEN
                v_target_batch := v_batch.batch_number;
                v_target_expiry := COALESCE(v_target_expiry, v_batch.expiry_date);
            ELSE
                v_target_batch := 'DEFAULT-01';
                v_target_expiry := COALESCE(v_target_expiry, (CURRENT_DATE + INTERVAL '2 years')::DATE);
            END IF;
        ELSE
            v_target_expiry := COALESCE(v_target_expiry, (CURRENT_DATE + INTERVAL '2 years')::DATE);
        END IF;

        INSERT INTO public.inventory_batches (
            branch_id,
            medicine_id,
            batch_number,
            expiry_date,
            stock_pieces,
            mrp,
            purchase_rate,
            is_active
        ) VALUES (
            p_branch_id,
            p_medicine_id,
            v_target_batch,
            v_target_expiry,
            v_pieces_delta,
            COALESCE(v_med.mrp, 0),
            v_med.purchase_cost,
            TRUE
        )
        ON CONFLICT (branch_id, medicine_id, batch_number) DO UPDATE
        SET stock_pieces = public.inventory_batches.stock_pieces + v_pieces_delta,
            expiry_date = COALESCE(p_expiry_date, public.inventory_batches.expiry_date),
            is_active = TRUE,
            deleted_at = NULL,
            version = public.inventory_batches.version + 1,
            updated_at = NOW();

    ELSIF p_adjustment_type = 'subtract' THEN
        IF v_current_total < v_pieces_delta THEN
            RAISE EXCEPTION 'Cannot subtract % pieces. Current stock is only % pieces', v_pieces_delta, v_current_total;
        END IF;

        IF v_target_batch IS NOT NULL THEN
            SELECT * INTO v_batch
            FROM public.inventory_batches
            WHERE branch_id = p_branch_id
              AND medicine_id = p_medicine_id
              AND batch_number = v_target_batch
              AND is_active = TRUE
              AND deleted_at IS NULL;

            IF NOT FOUND OR v_batch.stock_pieces < v_pieces_delta THEN
                RAISE EXCEPTION 'Insufficient stock in batch % (Available: % pieces)', v_target_batch, COALESCE(v_batch.stock_pieces, 0);
            END IF;

            v_target_expiry := COALESCE(v_target_expiry, v_batch.expiry_date);
            UPDATE public.inventory_batches
            SET stock_pieces = stock_pieces - v_pieces_delta,
                version = version + 1,
                updated_at = NOW()
            WHERE id = v_batch.id;
        ELSE
            v_remaining := v_pieces_delta;
            FOR v_batch IN
                SELECT * FROM public.inventory_batches
                WHERE branch_id = p_branch_id
                  AND medicine_id = p_medicine_id
                  AND is_active = TRUE
                  AND deleted_at IS NULL
                  AND stock_pieces > 0
                ORDER BY expiry_date ASC, created_at ASC
            LOOP
                IF v_remaining <= 0 THEN EXIT; END IF;
                v_take := LEAST(v_batch.stock_pieces, v_remaining);
                v_target_batch := COALESCE(v_target_batch, v_batch.batch_number);
                v_target_expiry := COALESCE(v_target_expiry, v_batch.expiry_date);

                UPDATE public.inventory_batches
                SET stock_pieces = stock_pieces - v_take,
                    version = version + 1,
                    updated_at = NOW()
                WHERE id = v_batch.id;

                v_remaining := v_remaining - v_take;
            END LOOP;
        END IF;

    ELSIF p_adjustment_type = 'set' THEN
        IF v_target_batch IS NOT NULL THEN
            v_target_expiry := COALESCE(v_target_expiry, (CURRENT_DATE + INTERVAL '2 years')::DATE);
            INSERT INTO public.inventory_batches (
                branch_id,
                medicine_id,
                batch_number,
                expiry_date,
                stock_pieces,
                mrp,
                purchase_rate,
                is_active
            ) VALUES (
                p_branch_id,
                p_medicine_id,
                v_target_batch,
                v_target_expiry,
                v_pieces_delta,
                COALESCE(v_med.mrp, 0),
                v_med.purchase_cost,
                TRUE
            )
            ON CONFLICT (branch_id, medicine_id, batch_number) DO UPDATE
            SET stock_pieces = v_pieces_delta,
                expiry_date = COALESCE(p_expiry_date, public.inventory_batches.expiry_date),
                is_active = TRUE,
                deleted_at = NULL,
                version = public.inventory_batches.version + 1,
                updated_at = NOW();
        ELSE
            -- Set exact total branch stock
            UPDATE public.inventory_batches
            SET stock_pieces = 0,
                version = version + 1,
                updated_at = NOW()
            WHERE branch_id = p_branch_id
              AND medicine_id = p_medicine_id
              AND is_active = TRUE
              AND deleted_at IS NULL;

            IF v_pieces_delta > 0 THEN
                SELECT * INTO v_batch
                FROM public.inventory_batches
                WHERE branch_id = p_branch_id
                  AND medicine_id = p_medicine_id
                  AND is_active = TRUE
                  AND deleted_at IS NULL
                ORDER BY expiry_date DESC
                LIMIT 1;

                v_target_batch := COALESCE(v_batch.batch_number, 'DEFAULT-01');
                v_target_expiry := COALESCE(v_target_expiry, v_batch.expiry_date, (CURRENT_DATE + INTERVAL '2 years')::DATE);

                INSERT INTO public.inventory_batches (
                    branch_id,
                    medicine_id,
                    batch_number,
                    expiry_date,
                    stock_pieces,
                    mrp,
                    purchase_rate,
                    is_active
                ) VALUES (
                    p_branch_id,
                    p_medicine_id,
                    v_target_batch,
                    v_target_expiry,
                    v_pieces_delta,
                    COALESCE(v_med.mrp, 0),
                    v_med.purchase_cost,
                    TRUE
                )
                ON CONFLICT (branch_id, medicine_id, batch_number) DO UPDATE
                SET stock_pieces = v_pieces_delta,
                    expiry_date = COALESCE(p_expiry_date, public.inventory_batches.expiry_date),
                    is_active = TRUE,
                    deleted_at = NULL,
                    version = public.inventory_batches.version + 1,
                    updated_at = NOW();
            END IF;
        END IF;
    ELSE
        RAISE EXCEPTION 'Invalid adjustment type';
    END IF;

    -- Recalculate authoritative total balance
    SELECT COALESCE(SUM(stock_pieces), 0) INTO v_new_balance
    FROM public.inventory_batches
    WHERE branch_id = p_branch_id
      AND medicine_id = p_medicine_id
      AND is_active = TRUE
      AND deleted_at IS NULL;

    UPDATE public.branch_inventory
    SET last_restocked_at = CASE WHEN p_adjustment_type = 'add' THEN NOW() ELSE last_restocked_at END
    WHERE branch_id = p_branch_id AND medicine_id = p_medicine_id;

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
        notes,
        performed_by
    ) VALUES (
        p_branch_id,
        p_medicine_id,
        'adjustment_' || p_adjustment_type,
        CASE WHEN p_adjustment_type = 'subtract' THEN -v_pieces_delta ELSE v_pieces_delta END,
        p_unit,
        p_quantity,
        v_new_balance,
        v_target_batch,
        v_target_expiry,
        p_notes,
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'branch_id', p_branch_id,
        'medicine_id', p_medicine_id,
        'new_stock_pieces', v_new_balance,
        'new_stock_strips', FLOOR(v_new_balance / GREATEST(COALESCE(v_med.pieces_per_strip, 1), 1)),
        'remaining_pieces', MOD(v_new_balance, GREATEST(COALESCE(v_med.pieces_per_strip, 1), 1))
    );
END;
$$;

-- 3. DOCTORS TABLE EXTENSIONS & RLS POLICIES
ALTER TABLE public.doctors
    ADD COLUMN IF NOT EXISTS specialization VARCHAR(150),
    ADD COLUMN IF NOT EXISTS default_consultation_fee NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

DROP POLICY IF EXISTS "Doctors view" ON public.doctors;
DROP POLICY IF EXISTS "Doctors manage" ON public.doctors;

CREATE POLICY "Doctors view" ON public.doctors
    FOR SELECT TO authenticated
    USING (TRUE);

CREATE POLICY "Doctors manage" ON public.doctors
    FOR ALL TO authenticated
    USING (
        (SELECT role::text FROM public.profiles WHERE id = auth.uid()) IN ('master_admin', 'sub_admin', 'branch_manager')
    )
    WITH CHECK (
        (SELECT role::text FROM public.profiles WHERE id = auth.uid()) IN ('master_admin', 'sub_admin', 'branch_manager')
    );

-- 4. PRESCRIPTION / PATIENT SLIP TABLES & INDEXES
CREATE TABLE IF NOT EXISTS public.prescription_slip_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL UNIQUE REFERENCES public.branches(id) ON DELETE CASCADE,
    next_serial_seq BIGINT NOT NULL DEFAULT 1,
    next_prescription_seq BIGINT NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.prescription_slips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    serial_seq BIGINT NOT NULL,
    serial_number VARCHAR(50) NOT NULL UNIQUE,
    prescription_seq BIGINT NOT NULL,
    prescription_number VARCHAR(50) NOT NULL UNIQUE,
    patient_name VARCHAR(255) NOT NULL,
    patient_phone VARCHAR(30),
    patient_age INT,
    patient_gender VARCHAR(20),
    patient_address TEXT,
    doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE RESTRICT,
    doctor_name VARCHAR(255) NOT NULL,
    doctor_qualification VARCHAR(100),
    doctor_registration_number VARCHAR(100),
    consultation_fee NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (consultation_fee >= 0),
    payment_method VARCHAR(20) NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'upi', 'card')),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('paid', 'cancelled')),
    notes TEXT,
    slip_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_by_name VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prescription_slips_branch ON public.prescription_slips(branch_id);
CREATE INDEX IF NOT EXISTS idx_prescription_slips_serial ON public.prescription_slips(serial_number);
CREATE INDEX IF NOT EXISTS idx_prescription_slips_rx ON public.prescription_slips(prescription_number);
CREATE INDEX IF NOT EXISTS idx_prescription_slips_patient ON public.prescription_slips(patient_name);
CREATE INDEX IF NOT EXISTS idx_prescription_slips_doctor ON public.prescription_slips(doctor_id);
CREATE INDEX IF NOT EXISTS idx_prescription_slips_date ON public.prescription_slips(slip_date DESC);
CREATE INDEX IF NOT EXISTS idx_prescription_slips_created_by ON public.prescription_slips(created_by);

CREATE TABLE IF NOT EXISTS public.consultation_fee_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    prescription_slip_id UUID NOT NULL UNIQUE REFERENCES public.prescription_slips(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE RESTRICT,
    employee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    fee_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (fee_amount >= 0),
    payment_method VARCHAR(20) NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'upi', 'card')),
    status VARCHAR(20) NOT NULL DEFAULT 'collected' CHECK (status IN ('collected', 'cancelled')),
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consultation_fees_branch ON public.consultation_fee_records(branch_id);
CREATE INDEX IF NOT EXISTS idx_consultation_fees_doctor ON public.consultation_fee_records(doctor_id);
CREATE INDEX IF NOT EXISTS idx_consultation_fees_date ON public.consultation_fee_records(collected_at DESC);

ALTER TABLE public.prescription_slip_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_slips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultation_fee_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Slip sequences read" ON public.prescription_slip_sequences;
CREATE POLICY "Slip sequences read" ON public.prescription_slip_sequences
    FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "Prescription slips read" ON public.prescription_slips;
CREATE POLICY "Prescription slips read" ON public.prescription_slips
    FOR SELECT TO authenticated
    USING (
        (SELECT role::text FROM public.profiles WHERE id = auth.uid()) = 'master_admin'
        OR (
            branch_id = (SELECT primary_branch_id FROM public.profiles WHERE id = auth.uid())
            AND (
                (SELECT role::text FROM public.profiles WHERE id = auth.uid()) IN ('sub_admin', 'branch_manager', 'prescription_employee')
                OR COALESCE(((SELECT permissions FROM public.profiles WHERE id = auth.uid())->>'view_prescription_history')::boolean, false) = TRUE
                OR COALESCE(((SELECT permissions FROM public.profiles WHERE id = auth.uid())->>'access_prescription_billing')::boolean, false) = TRUE
            )
        )
    );

DROP POLICY IF EXISTS "Prescription slips insert" ON public.prescription_slips;
CREATE POLICY "Prescription slips insert" ON public.prescription_slips
    FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT role::text FROM public.profiles WHERE id = auth.uid()) = 'master_admin'
        OR (
            branch_id = (SELECT primary_branch_id FROM public.profiles WHERE id = auth.uid())
            AND (
                (SELECT role::text FROM public.profiles WHERE id = auth.uid()) IN ('sub_admin', 'branch_manager', 'prescription_employee')
                OR COALESCE(((SELECT permissions FROM public.profiles WHERE id = auth.uid())->>'access_prescription_billing')::boolean, false) = TRUE
            )
        )
    );

DROP POLICY IF EXISTS "Prescription slips manage" ON public.prescription_slips;
CREATE POLICY "Prescription slips manage" ON public.prescription_slips
    FOR UPDATE TO authenticated
    USING (
        (SELECT role::text FROM public.profiles WHERE id = auth.uid()) IN ('master_admin', 'sub_admin', 'branch_manager')
    );

DROP POLICY IF EXISTS "Consultation fees read" ON public.consultation_fee_records;
CREATE POLICY "Consultation fees read" ON public.consultation_fee_records
    FOR SELECT TO authenticated
    USING (
        (SELECT role::text FROM public.profiles WHERE id = auth.uid()) = 'master_admin'
        OR branch_id = (SELECT primary_branch_id FROM public.profiles WHERE id = auth.uid())
    );

-- 5. ATOMIC SEQUENCE PREVIEW & SLIP GENERATION RPCs
CREATE OR REPLACE FUNCTION public.get_next_prescription_slip_preview(p_branch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_branch public.branches%ROWTYPE;
    v_seq public.prescription_slip_sequences%ROWTYPE;
    v_serial_seq BIGINT;
    v_rx_seq BIGINT;
    v_fy_str VARCHAR(4);
    v_today_month INT;
    v_today_year INT;
    v_fy_start INT;
    v_fy_end INT;
BEGIN
    SELECT * INTO v_branch FROM public.branches WHERE id = p_branch_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Branch not found';
    END IF;

    SELECT * INTO v_seq FROM public.prescription_slip_sequences WHERE branch_id = p_branch_id;
    v_serial_seq := COALESCE(v_seq.next_serial_seq, 1);
    v_rx_seq := COALESCE(v_seq.next_prescription_seq, 1);

    v_today_month := EXTRACT(MONTH FROM (NOW() AT TIME ZONE 'Asia/Kolkata'))::INT;
    v_today_year := EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Asia/Kolkata'))::INT;
    IF v_today_month < 4 THEN
        v_fy_start := v_today_year - 1;
        v_fy_end := v_today_year;
    ELSE
        v_fy_start := v_today_year;
        v_fy_end := v_today_year + 1;
    END IF;
    v_fy_str := RIGHT(v_fy_start::TEXT, 2) || RIGHT(v_fy_end::TEXT, 2);

    RETURN jsonb_build_object(
        'serial_seq', v_serial_seq,
        'serial_number', UPPER(v_branch.branch_code) || '-SN-' || LPAD(v_serial_seq::TEXT, 6, '0'),
        'prescription_seq', v_rx_seq,
        'prescription_number', 'RX-' || UPPER(v_branch.branch_code) || '-' || v_fy_str || '-' || LPAD(v_rx_seq::TEXT, 6, '0')
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_prescription_slip_atomic(
    p_branch_id UUID,
    p_patient_name VARCHAR,
    p_doctor_id UUID,
    p_consultation_fee NUMERIC(12, 2),
    p_patient_phone VARCHAR DEFAULT NULL,
    p_patient_age INT DEFAULT NULL,
    p_patient_gender VARCHAR DEFAULT NULL,
    p_patient_address TEXT DEFAULT NULL,
    p_payment_method VARCHAR DEFAULT 'cash',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_profile public.profiles%ROWTYPE;
    v_branch public.branches%ROWTYPE;
    v_doctor public.doctors%ROWTYPE;
    v_seq public.prescription_slip_sequences%ROWTYPE;
    v_serial_seq BIGINT;
    v_rx_seq BIGINT;
    v_serial_num VARCHAR(50);
    v_rx_num VARCHAR(50);
    v_fy_str VARCHAR(4);
    v_today_month INT;
    v_today_year INT;
    v_fy_start INT;
    v_fy_end INT;
    v_slip_id UUID;
    v_can_create BOOLEAN := FALSE;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
    IF NOT FOUND OR NOT v_profile.is_active THEN
        RAISE EXCEPTION 'Active user profile not found';
    END IF;

    -- Permission check: master_admin, sub_admin, branch_manager, prescription_employee, or billing_employee with explicit permission
    IF v_profile.role::text = 'master_admin' THEN
        v_can_create := TRUE;
    ELSIF v_profile.primary_branch_id = p_branch_id THEN
        IF v_profile.role::text IN ('branch_manager', 'prescription_employee') THEN
            v_can_create := TRUE;
        ELSIF COALESCE((v_profile.permissions->>'access_prescription_billing')::boolean, FALSE) = TRUE THEN
            v_can_create := TRUE;
        ELSIF v_profile.role::text = 'sub_admin' AND COALESCE((v_profile.permissions->>'access_billing')::boolean, FALSE) = TRUE THEN
            v_can_create := TRUE;
        END IF;
    END IF;

    IF NOT v_can_create THEN
        RAISE EXCEPTION 'Forbidden: You do not have permission to generate prescription slips for this branch';
    END IF;

    IF TRIM(COALESCE(p_patient_name, '')) = '' THEN
        RAISE EXCEPTION 'Patient name is required';
    END IF;
    IF COALESCE(p_consultation_fee, -1) < 0 THEN
        RAISE EXCEPTION 'Consultation fee cannot be negative';
    END IF;
    IF p_payment_method NOT IN ('cash', 'upi', 'card') THEN
        RAISE EXCEPTION 'Invalid payment method. Must be cash, upi, or card';
    END IF;

    SELECT * INTO v_branch FROM public.branches WHERE id = p_branch_id AND is_active = TRUE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Branch not found or inactive';
    END IF;

    SELECT * INTO v_doctor FROM public.doctors WHERE id = p_doctor_id AND is_active = TRUE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected doctor not found or inactive';
    END IF;

    -- Ensure sequence row exists, then lock FOR UPDATE to prevent concurrent duplicates
    INSERT INTO public.prescription_slip_sequences (branch_id, next_serial_seq, next_prescription_seq)
    VALUES (p_branch_id, 1, 1)
    ON CONFLICT (branch_id) DO NOTHING;

    SELECT * INTO v_seq
    FROM public.prescription_slip_sequences
    WHERE branch_id = p_branch_id
    FOR UPDATE;

    v_serial_seq := v_seq.next_serial_seq;
    v_rx_seq := v_seq.next_prescription_seq;

    v_today_month := EXTRACT(MONTH FROM (NOW() AT TIME ZONE 'Asia/Kolkata'))::INT;
    v_today_year := EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Asia/Kolkata'))::INT;
    IF v_today_month < 4 THEN
        v_fy_start := v_today_year - 1;
        v_fy_end := v_today_year;
    ELSE
        v_fy_start := v_today_year;
        v_fy_end := v_today_year + 1;
    END IF;
    v_fy_str := RIGHT(v_fy_start::TEXT, 2) || RIGHT(v_fy_end::TEXT, 2);

    v_serial_num := UPPER(v_branch.branch_code) || '-SN-' || LPAD(v_serial_seq::TEXT, 6, '0');
    v_rx_num := 'RX-' || UPPER(v_branch.branch_code) || '-' || v_fy_str || '-' || LPAD(v_rx_seq::TEXT, 6, '0');

    UPDATE public.prescription_slip_sequences
    SET next_serial_seq = next_serial_seq + 1,
        next_prescription_seq = next_prescription_seq + 1,
        updated_at = NOW()
    WHERE branch_id = p_branch_id;

    -- Insert prescription slip (strictly isolated from medicine sales & stock)
    INSERT INTO public.prescription_slips (
        business_id,
        branch_id,
        serial_seq,
        serial_number,
        prescription_seq,
        prescription_number,
        patient_name,
        patient_phone,
        patient_age,
        patient_gender,
        patient_address,
        doctor_id,
        doctor_name,
        doctor_qualification,
        doctor_registration_number,
        consultation_fee,
        payment_method,
        payment_status,
        notes,
        slip_date,
        created_by,
        created_by_name
    ) VALUES (
        v_branch.business_id,
        p_branch_id,
        v_serial_seq,
        v_serial_num,
        v_rx_seq,
        v_rx_num,
        TRIM(p_patient_name),
        NULLIF(TRIM(p_patient_phone), ''),
        p_patient_age,
        NULLIF(TRIM(p_patient_gender), ''),
        NULLIF(TRIM(p_patient_address), ''),
        v_doctor.id,
        v_doctor.full_name,
        v_doctor.qualification,
        v_doctor.registration_number,
        ROUND(p_consultation_fee, 2),
        p_payment_method,
        'paid',
        NULLIF(TRIM(p_notes), ''),
        NOW(),
        v_user_id,
        v_profile.full_name
    ) RETURNING id INTO v_slip_id;

    INSERT INTO public.consultation_fee_records (
        business_id,
        branch_id,
        prescription_slip_id,
        doctor_id,
        employee_id,
        fee_amount,
        payment_method,
        status,
        collected_at
    ) VALUES (
        v_branch.business_id,
        p_branch_id,
        v_slip_id,
        v_doctor.id,
        v_user_id,
        ROUND(p_consultation_fee, 2),
        p_payment_method,
        'collected',
        NOW()
    );

    INSERT INTO public.audit_logs (
        business_id,
        user_id,
        action,
        entity_type,
        entity_id,
        details
    ) VALUES (
        v_branch.business_id,
        v_user_id,
        'CREATE_PRESCRIPTION_SLIP',
        'PRESCRIPTION_SLIP',
        v_rx_num,
        jsonb_build_object(
            'slip_id', v_slip_id,
            'serial_number', v_serial_num,
            'prescription_number', v_rx_num,
            'patient_name', TRIM(p_patient_name),
            'doctor_id', v_doctor.id,
            'doctor_name', v_doctor.full_name,
            'consultation_fee', ROUND(p_consultation_fee, 2),
            'payment_method', p_payment_method
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'slip_id', v_slip_id,
        'serial_number', v_serial_num,
        'prescription_number', v_rx_num
    );
END;
$$;

-- 6. PUBLIC BRANDING RPC (Allows Login screen to load uploaded Bajrang Pharmacy logo)
CREATE OR REPLACE FUNCTION public.get_public_branding()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_val JSONB;
BEGIN
    SELECT setting_value INTO v_val
    FROM public.business_settings
    WHERE setting_key = 'branding_config'
    LIMIT 1;

    RETURN COALESCE(v_val, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_next_prescription_slip_preview(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.get_next_prescription_slip_preview(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.create_prescription_slip_atomic(UUID, VARCHAR, UUID, NUMERIC, VARCHAR, INT, VARCHAR, TEXT, VARCHAR, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.create_prescription_slip_atomic(UUID, VARCHAR, UUID, NUMERIC, VARCHAR, INT, VARCHAR, TEXT, VARCHAR, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.get_public_branding() FROM public;
GRANT EXECUTE ON FUNCTION public.get_public_branding() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
