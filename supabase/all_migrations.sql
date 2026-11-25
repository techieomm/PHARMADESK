-- ====================================================================
-- PHARMADESK — CONSOLIDATED FULL DATABASE MIGRATIONS
-- Generated systematically in sequence
-- ====================================================================



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 001_initial_schema.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ====================================================================
-- PHARMADESK — PRODUCTION POSTGRESQL DATABASE SCHEMA & MIGRATION
-- Multi-Branch Pharmacy Management & POS Billing System
-- ====================================================================

-- Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Clean existing schema if re-running in development (safe drop with CASCADE)
-- Note: In production migrations, this is managed incrementally.

-- 1. BUSINESSES TABLE
CREATE TABLE IF NOT EXISTS public.businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL DEFAULT 'PharmaDesk Healthcare',
    legal_name VARCHAR(255),
    gstin VARCHAR(20),
    pan VARCHAR(20),
    drug_license VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(255),
    address TEXT,
    currency VARCHAR(10) DEFAULT 'INR',
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. BRANCHES TABLE (Configured for 2 initial branches, scalable to N)
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    branch_code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(100) DEFAULT 'Mumbai',
    state VARCHAR(100) DEFAULT 'Maharashtra',
    pincode VARCHAR(20) DEFAULT '400001',
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    gstin VARCHAR(20),
    drug_license VARCHAR(100) NOT NULL,
    invoice_prefix VARCHAR(10) NOT NULL,
    invoice_sequence BIGINT DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. USER ROLES ENUM & TABLE
DO $$ BEGIN
    CREATE TYPE public.app_role AS ENUM (
        'master_admin',
        'sub_admin',
        'branch_manager',
        'inventory_manager',
        'billing_employee'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 4. PROFILES (Extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
    employee_id VARCHAR(50) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20),
    role public.app_role NOT NULL DEFAULT 'billing_employee',
    primary_branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    permissions JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for high-speed Employee ID login lookups
CREATE INDEX IF NOT EXISTS idx_profiles_employee_id ON public.profiles(employee_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_branch ON public.profiles(primary_branch_id);

-- 5. BRANCH MEMBERSHIPS (Multi-branch assignment if employee works at multiple branches)
CREATE TABLE IF NOT EXISTS public.branch_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    role_override public.app_role,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(profile_id, branch_id)
);

-- 6. MEDICINE MASTER (Centralized Shared Medicine Catalog)
CREATE TABLE IF NOT EXISTS public.medicine_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    barcode VARCHAR(100) UNIQUE,
    brand_name VARCHAR(255) NOT NULL,
    generic_name VARCHAR(255) NOT NULL,
    composition TEXT,
    strength VARCHAR(100),
    dosage_form VARCHAR(50) NOT NULL DEFAULT 'Tablet', -- Tablet, Capsule, Syrup, Drops, Injection, Ointment, etc.
    manufacturer VARCHAR(255) NOT NULL,
    packaging_label VARCHAR(100) NOT NULL DEFAULT '10 tablets / strip',
    pieces_per_strip INT NOT NULL CHECK (pieces_per_strip > 0) DEFAULT 10,
    mrp NUMERIC(12, 2) NOT NULL CHECK (mrp >= 0),
    strip_selling_price NUMERIC(12, 2) NOT NULL CHECK (strip_selling_price >= 0),
    piece_selling_price NUMERIC(12, 2) NOT NULL CHECK (piece_selling_price >= 0),
    purchase_cost NUMERIC(12, 2) CHECK (purchase_cost >= 0), -- Confidential: only Master Admin & Managers
    gst_rate NUMERIC(5, 2) NOT NULL DEFAULT 12.00, -- 0%, 5%, 12%, 18%, 28%
    hsn_code VARCHAR(20) DEFAULT '3004',
    min_stock_alert INT NOT NULL DEFAULT 20, -- In pieces
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medicine_barcode ON public.medicine_master(barcode);
CREATE INDEX IF NOT EXISTS idx_medicine_brand_name ON public.medicine_master(brand_name);
CREATE INDEX IF NOT EXISTS idx_medicine_generic_name ON public.medicine_master(generic_name);
CREATE INDEX IF NOT EXISTS idx_medicine_manufacturer ON public.medicine_master(manufacturer);

-- 7. BRANCH INVENTORY (Independent Stock per Branch stored in Smallest Unit: Pieces)
CREATE TABLE IF NOT EXISTS public.branch_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    medicine_id UUID NOT NULL REFERENCES public.medicine_master(id) ON DELETE CASCADE,
    stock_pieces BIGINT NOT NULL DEFAULT 0 CHECK (stock_pieces >= 0),
    rack_location VARCHAR(50),
    batch_number VARCHAR(50),
    expiry_date DATE,
    last_restocked_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(branch_id, medicine_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_inventory_branch ON public.branch_inventory(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_inventory_medicine ON public.branch_inventory(medicine_id);
CREATE INDEX IF NOT EXISTS idx_branch_inventory_stock ON public.branch_inventory(stock_pieces);

-- 8. STOCK MOVEMENTS (Audit trail for every inventory change)
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    medicine_id UUID NOT NULL REFERENCES public.medicine_master(id) ON DELETE CASCADE,
    movement_type VARCHAR(50) NOT NULL, -- 'purchase', 'sale', 'adjustment_add', 'adjustment_sub', 'return', 'transfer'
    quantity_pieces INT NOT NULL,
    unit_used VARCHAR(20) NOT NULL, -- 'strip', 'piece'
    unit_quantity NUMERIC(10, 2) NOT NULL,
    balance_after_pieces BIGINT NOT NULL,
    reference_id VARCHAR(100), -- Invoice ID or PO Number
    notes TEXT,
    performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_branch ON public.stock_movements(branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_medicine ON public.stock_movements(medicine_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON public.stock_movements(created_at);

-- 9. INVOICES (GST Tax Invoices)
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(100) NOT NULL UNIQUE,
    invoice_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    subtotal_taxable NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    sgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    igst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_gst NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('cash', 'upi', 'card')),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'paid', -- 'paid', 'cancelled'
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_branch ON public.invoices(branch_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON public.invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON public.invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_phone ON public.invoices(customer_phone);

-- 10. INVOICE ITEMS (Snapshot of medicine details, price, and tax at moment of sale)
CREATE TABLE IF NOT EXISTS public.invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    medicine_id UUID NOT NULL REFERENCES public.medicine_master(id) ON DELETE RESTRICT,
    medicine_name VARCHAR(255) NOT NULL,
    selected_unit VARCHAR(20) NOT NULL CHECK (selected_unit IN ('strip', 'piece')),
    unit_quantity NUMERIC(10, 2) NOT NULL CHECK (unit_quantity > 0),
    pieces_count BIGINT NOT NULL CHECK (pieces_count > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    gst_rate NUMERIC(5, 2) NOT NULL DEFAULT 12.00,
    taxable_amount NUMERIC(12, 2) NOT NULL CHECK (taxable_amount >= 0),
    gst_amount NUMERIC(12, 2) NOT NULL CHECK (gst_amount >= 0),
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_medicine ON public.invoice_items(medicine_id);

-- 11. PAYMENT RECORDS
CREATE TABLE IF NOT EXISTS public.payment_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('cash', 'upi', 'card')),
    amount NUMERIC(12, 2) NOT NULL,
    transaction_reference VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'success',
    recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. MEDICINE PRICE HISTORY
CREATE TABLE IF NOT EXISTS public.medicine_price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id UUID NOT NULL REFERENCES public.medicine_master(id) ON DELETE CASCADE,
    old_mrp NUMERIC(12, 2),
    new_mrp NUMERIC(12, 2) NOT NULL,
    old_strip_price NUMERIC(12, 2),
    new_strip_price NUMERIC(12, 2) NOT NULL,
    old_piece_price NUMERIC(12, 2),
    new_piece_price NUMERIC(12, 2) NOT NULL,
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. BUSINESS SETTINGS
CREATE TABLE IF NOT EXISTS public.business_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    user_email VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100),
    details JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

-- ====================================================================
-- STORED FUNCTIONS & PROCEDURES
-- ====================================================================

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS set_businesses_updated_at ON public.businesses;
CREATE TRIGGER set_businesses_updated_at BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_branches_updated_at ON public.branches;
CREATE TRIGGER set_branches_updated_at BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_medicine_updated_at ON public.medicine_master;
CREATE TRIGGER set_medicine_updated_at BEFORE UPDATE ON public.medicine_master FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_inventory_updated_at ON public.branch_inventory;
CREATE TRIGGER set_inventory_updated_at BEFORE UPDATE ON public.branch_inventory FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Lookup User Role Helper
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS public.app_role AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Lookup User Branch Helper
CREATE OR REPLACE FUNCTION public.get_current_user_branch()
RETURNS UUID AS $$
    SELECT primary_branch_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Function: Lookup Employee Email by Employee ID (Used for Employee ID login)
DROP FUNCTION IF EXISTS public.lookup_employee_email(VARCHAR);
DROP FUNCTION IF EXISTS public.lookup_employee_email(TEXT);

CREATE OR REPLACE FUNCTION public.lookup_employee_email(p_employee_id VARCHAR)
RETURNS TABLE (email VARCHAR, is_active BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT p.email, p.is_active
    FROM public.profiles p
    WHERE UPPER(p.employee_id) = UPPER(TRIM(p_employee_id));
END;
$$;

-- ====================================================================
-- ATOMIC BILLING & INVENTORY TRANSACTION PROCEDURE
-- ====================================================================
CREATE OR REPLACE FUNCTION public.create_invoice_atomic(
    p_branch_id UUID,
    p_customer_name VARCHAR,
    p_customer_phone VARCHAR,
    p_payment_method VARCHAR,
    p_items JSONB, -- Array of { medicine_id: UUID, selected_unit: 'strip'|'piece', unit_quantity: number }
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_user_role public.app_role;
    v_user_branch UUID;
    v_branch_rec RECORD;
    v_invoice_id UUID;
    v_invoice_num VARCHAR(100);
    v_today_str VARCHAR(8);
    v_next_seq BIGINT;
    v_subtotal NUMERIC(12, 2) := 0.00;
    v_total_cgst NUMERIC(12, 2) := 0.00;
    v_total_sgst NUMERIC(12, 2) := 0.00;
    v_total_gst NUMERIC(12, 2) := 0.00;
    v_grand_total NUMERIC(12, 2) := 0.00;
    v_item RECORD;
    v_med RECORD;
    v_inv RECORD;
    v_pieces_needed BIGINT;
    v_unit_price NUMERIC(12, 2);
    v_item_total NUMERIC(12, 2);
    v_taxable NUMERIC(12, 2);
    v_item_gst NUMERIC(12, 2);
    v_cgst NUMERIC(12, 2);
    v_sgst NUMERIC(12, 2);
BEGIN
    -- 1. Security & Authentication Check
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User is not authenticated';
    END IF;

    SELECT role, primary_branch_id, is_active
    INTO v_user_role, v_user_branch
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Profile not found';
    END IF;

    -- Branch permission check: Master Admin can bill at any branch; others only their primary branch
    IF v_user_role <> 'master_admin' AND v_user_branch <> p_branch_id THEN
        RAISE EXCEPTION 'Forbidden: User not authorized to create invoices for this branch';
    END IF;

    -- 2. Verify Branch Exists & Active
    SELECT * INTO v_branch_rec
    FROM public.branches
    WHERE id = p_branch_id AND is_active = TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Branch not found or inactive';
    END IF;

    -- 3. Generate Sequential Unique Invoice Number atomically
    v_today_str := TO_CHAR(NOW(), 'YYYYMMDD');
    v_next_seq := v_branch_rec.invoice_sequence;
    v_invoice_num := v_branch_rec.invoice_prefix || '-' || v_today_str || '-' || LPAD(v_next_seq::TEXT, 5, '0');

    -- Increment sequence for next bill
    UPDATE public.branches
    SET invoice_sequence = invoice_sequence + 1
    WHERE id = p_branch_id;

    -- 4. Create Draft Invoice Record
    INSERT INTO public.invoices (
        branch_id,
        invoice_number,
        invoice_date,
        customer_name,
        customer_phone,
        payment_method,
        payment_status,
        notes,
        created_by
    ) VALUES (
        p_branch_id,
        v_invoice_num,
        NOW(),
        p_customer_name,
        p_customer_phone,
        p_payment_method,
        'paid',
        p_notes,
        v_user_id
    ) RETURNING id INTO v_invoice_id;

    -- 5. Process Each Item (Lock Inventory, Validate Stock, Compute Exact Taxes, Deduct Stock)
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        medicine_id UUID,
        selected_unit VARCHAR,
        unit_quantity NUMERIC
    )
    LOOP
        -- Fetch and Lock Medicine Record
        SELECT * INTO v_med
        FROM public.medicine_master
        WHERE id = v_item.medicine_id AND is_active = TRUE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Medicine % not found or inactive in catalog', v_item.medicine_id;
        END IF;

        -- Calculate pieces count based on selected unit
        IF v_item.selected_unit = 'strip' THEN
            v_pieces_needed := ROUND(v_item.unit_quantity * v_med.pieces_per_strip);
            v_unit_price := v_med.strip_selling_price;
            v_item_total := ROUND(v_unit_price * v_item.unit_quantity, 2);
        ELSIF v_item.selected_unit = 'piece' THEN
            v_pieces_needed := ROUND(v_item.unit_quantity);
            v_unit_price := v_med.piece_selling_price;
            v_item_total := ROUND(v_unit_price * v_item.unit_quantity, 2);
        ELSE
            RAISE EXCEPTION 'Invalid unit % specified. Must be strip or piece', v_item.selected_unit;
        END IF;

        -- Lock & Check Branch Inventory
        SELECT * INTO v_inv
        FROM public.branch_inventory
        WHERE branch_id = p_branch_id AND medicine_id = v_item.medicine_id
        FOR UPDATE;

        IF NOT FOUND OR v_inv.stock_pieces < v_pieces_needed THEN
            RAISE EXCEPTION 'Insufficient stock for "%". Required: % pieces, Available: % pieces',
                v_med.brand_name,
                v_pieces_needed,
                COALESCE(v_inv.stock_pieces, 0);
        END IF;

        -- GST Calculation (Inclusive or Exclusive - Standard Indian Retail Pharmacy Selling Price is Inclusive of GST)
        -- Selling Price Total = Taxable + GST
        -- Taxable = Item_Total / (1 + (GST_Rate / 100))
        v_taxable := ROUND(v_item_total / (1 + (v_med.gst_rate / 100.0)), 2);
        v_item_gst := v_item_total - v_taxable;
        v_cgst := ROUND(v_item_gst / 2.0, 2);
        v_sgst := v_item_gst - v_cgst;

        -- Accumulate Totals
        v_subtotal := v_subtotal + v_taxable;
        v_total_cgst := v_total_cgst + v_cgst;
        v_total_sgst := v_total_sgst + v_sgst;
        v_total_gst := v_total_gst + v_item_gst;
        v_grand_total := v_grand_total + v_item_total;

        -- Insert Invoice Item
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
            total_amount
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
            v_item_total
        );

        -- Deduct Stock
        UPDATE public.branch_inventory
        SET stock_pieces = stock_pieces - v_pieces_needed,
            updated_at = NOW()
        WHERE id = v_inv.id;

        -- Log Stock Movement
        INSERT INTO public.stock_movements (
            branch_id,
            medicine_id,
            movement_type,
            quantity_pieces,
            unit_used,
            unit_quantity,
            balance_after_pieces,
            reference_id,
            notes,
            performed_by
        ) VALUES (
            p_branch_id,
            v_med.id,
            'sale',
            -v_pieces_needed,
            v_item.selected_unit,
            v_item.unit_quantity,
            v_inv.stock_pieces - v_pieces_needed,
            v_invoice_num,
            'POS Bill Sale',
            v_user_id
        );
    END LOOP;

    -- 6. Update Final Invoice Totals
    UPDATE public.invoices
    SET subtotal_taxable = v_subtotal,
        cgst_amount = v_total_cgst,
        sgst_amount = v_total_sgst,
        total_gst = v_total_gst,
        total_amount = v_grand_total
    WHERE id = v_invoice_id;

    -- 7. Record Payment
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

    -- 8. Audit Log
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
        'CREATE_INVOICE',
        'INVOICE',
        v_invoice_num,
        jsonb_build_object('total', v_grand_total, 'customer', p_customer_name, 'phone', p_customer_phone)
    );

    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_num,
        'total_amount', v_grand_total,
        'subtotal_taxable', v_subtotal,
        'total_gst', v_total_gst,
        'created_at', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ====================================================================
-- ATOMIC STOCK ADJUSTMENT & RESTOCK PROCEDURE
-- ====================================================================
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
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_user_role public.app_role;
    v_med RECORD;
    v_inv RECORD;
    v_pieces_delta BIGINT;
    v_new_balance BIGINT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT role INTO v_user_role FROM public.profiles WHERE id = v_user_id;
    IF v_user_role NOT IN ('master_admin', 'sub_admin', 'branch_manager', 'inventory_manager') THEN
        RAISE EXCEPTION 'Forbidden: Insufficient privileges for stock management';
    END IF;

    SELECT * INTO v_med FROM public.medicine_master WHERE id = p_medicine_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Medicine not found';
    END IF;

    -- Convert entered unit into pieces
    IF p_unit = 'strip' THEN
        v_pieces_delta := ROUND(p_quantity * v_med.pieces_per_strip);
    ELSIF p_unit = 'piece' THEN
        v_pieces_delta := ROUND(p_quantity);
    ELSE
        RAISE EXCEPTION 'Invalid unit. Must be strip or piece';
    END IF;

    -- Ensure branch inventory row exists
    INSERT INTO public.branch_inventory (branch_id, medicine_id, stock_pieces)
    VALUES (p_branch_id, p_medicine_id, 0)
    ON CONFLICT (branch_id, medicine_id) DO NOTHING;

    -- Lock row
    SELECT * INTO v_inv
    FROM public.branch_inventory
    WHERE branch_id = p_branch_id AND medicine_id = p_medicine_id
    FOR UPDATE;

    IF p_adjustment_type = 'add' THEN
        v_new_balance := v_inv.stock_pieces + v_pieces_delta;
    ELSIF p_adjustment_type = 'subtract' THEN
        IF v_inv.stock_pieces < v_pieces_delta THEN
            RAISE EXCEPTION 'Cannot subtract % pieces. Current stock is only % pieces', v_pieces_delta, v_inv.stock_pieces;
        END IF;
        v_new_balance := v_inv.stock_pieces - v_pieces_delta;
    ELSIF p_adjustment_type = 'set' THEN
        v_new_balance := v_pieces_delta;
    ELSE
        RAISE EXCEPTION 'Invalid adjustment type';
    END IF;

    UPDATE public.branch_inventory
    SET stock_pieces = v_new_balance,
        batch_number = COALESCE(p_batch_number, batch_number),
        expiry_date = COALESCE(p_expiry_date, expiry_date),
        last_restocked_at = CASE WHEN p_adjustment_type = 'add' THEN NOW() ELSE last_restocked_at END,
        updated_at = NOW()
    WHERE id = v_inv.id;

    INSERT INTO public.stock_movements (
        branch_id,
        medicine_id,
        movement_type,
        quantity_pieces,
        unit_used,
        unit_quantity,
        balance_after_pieces,
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
        p_notes,
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'branch_id', p_branch_id,
        'medicine_id', p_medicine_id,
        'new_stock_pieces', v_new_balance,
        'new_stock_strips', FLOOR(v_new_balance / v_med.pieces_per_strip),
        'remaining_pieces', MOD(v_new_balance, v_med.pieces_per_strip)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicine_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicine_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: Authenticated users can read active profiles in their business
CREATE POLICY "Profiles read policy" ON public.profiles
    FOR SELECT TO authenticated
    USING (
        auth.uid() = id OR
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'master_admin' OR
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'sub_admin'
    );

CREATE POLICY "Master admin profiles update" ON public.profiles
    FOR UPDATE TO authenticated
    USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'master_admin' OR
        auth.uid() = id
    );

-- Branches: All authenticated staff can read active branches; Master admin can manage
CREATE POLICY "Branches read" ON public.branches
    FOR SELECT TO authenticated
    USING (is_active = TRUE OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'master_admin');

CREATE POLICY "Branches admin manage" ON public.branches
    FOR ALL TO authenticated
    USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'master_admin');

-- Medicine Master: All authenticated staff can search and view medicines
CREATE POLICY "Medicine catalog view" ON public.medicine_master
    FOR SELECT TO authenticated
    USING (is_active = TRUE OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('master_admin', 'inventory_manager'));

CREATE POLICY "Medicine catalog edit" ON public.medicine_master
    FOR ALL TO authenticated
    USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('master_admin', 'sub_admin', 'inventory_manager'));

-- Branch Inventory: Staff can read their branch or master admin reads all
CREATE POLICY "Branch inventory read" ON public.branch_inventory
    FOR SELECT TO authenticated
    USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'master_admin' OR
        branch_id = (SELECT primary_branch_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "Branch inventory manage" ON public.branch_inventory
    FOR ALL TO authenticated
    USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('master_admin', 'sub_admin', 'branch_manager', 'inventory_manager')
    );

-- Invoices: Staff can read their branch invoices; Master admin reads all
CREATE POLICY "Invoices read" ON public.invoices
    FOR SELECT TO authenticated
    USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'master_admin' OR
        branch_id = (SELECT primary_branch_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "Invoices create" ON public.invoices
    FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'master_admin' OR
        branch_id = (SELECT primary_branch_id FROM public.profiles WHERE id = auth.uid())
    );

-- Invoice items: Follow invoice visibility
CREATE POLICY "Invoice items read" ON public.invoice_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.invoices inv
            WHERE inv.id = invoice_items.invoice_id
            AND (
                (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'master_admin' OR
                inv.branch_id = (SELECT primary_branch_id FROM public.profiles WHERE id = auth.uid())
            )
        )
    );

-- Stock movements: Branch-restricted or master admin
CREATE POLICY "Stock movements read" ON public.stock_movements
    FOR SELECT TO authenticated
    USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'master_admin' OR
        branch_id = (SELECT primary_branch_id FROM public.profiles WHERE id = auth.uid())
    );

-- Audit logs: Read only by Master Admin
CREATE POLICY "Audit logs admin view" ON public.audit_logs
    FOR SELECT TO authenticated
    USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'master_admin');

-- ====================================================================
-- INITIAL SYSTEM SEED DATA (Businesses & 2 Configured Branches)
-- ====================================================================
INSERT INTO public.businesses (id, name, legal_name, gstin, pan, drug_license, phone, email, address)
VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'PharmaDesk Healthcare',
    'PharmaDesk Pharmacy Private Limited',
    '27AABCP1234F1Z5',
    'AABCP1234F',
    'MH-MZ2-123456 & MH-MZ2-654321',
    '+91 98200 12345',
    'contact@pharmadesk.local',
    'Corporate Plaza, Bandra Kurla Complex, Mumbai, Maharashtra 400051'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.branches (id, business_id, branch_code, name, address, city, state, pincode, phone, email, gstin, drug_license, invoice_prefix, invoice_sequence)
VALUES 
(
    'c0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'BR01',
    'PharmaDesk — Branch 01 (Central Dispensary)',
    'Shop No. 4, Market Promenade, Station Road',
    'Mumbai',
    'Maharashtra',
    '400001',
    '+91 98200 54321',
    'branch01@pharmadesk.local',
    '27AABCP1234F1Z5',
    'MH-MZ2-123456',
    'BR01',
    1001
),
(
    'c0000000-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000001',
    'BR02',
    'PharmaDesk — Branch 02 (Metro Health Hub)',
    'Plot 18, Commercial Block, Ring Road',
    'Mumbai',
    'Maharashtra',
    '400053',
    '+91 98200 67890',
    'branch02@pharmadesk.local',
    '27AABCP1234F1Z5',
    'MH-MZ2-654321',
    'BR02',
    1001
) ON CONFLICT (id) DO NOTHING;

-- Initial Business Settings
INSERT INTO public.business_settings (business_id, setting_key, setting_value)
VALUES 
(
    'b0000000-0000-0000-0000-000000000001',
    'invoice_print_config',
    '{"default_printer_type": "thermal_80mm", "show_gst_breakup": true, "show_drug_license": true, "footer_note": "Thank you for trusting PharmaDesk. Prescribed medicines cannot be returned."}'::jsonb
),
(
    'b0000000-0000-0000-0000-000000000001',
    'barcode_config',
    '{"auto_focus": true, "beep_on_scan": true, "gs1_parsing": true}'::jsonb
) ON CONFLICT (setting_key) DO NOTHING;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 002_domain_schema.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ====================================================================
-- PHARMADESK — MIGRATION 002: DOMAIN SCHEMA EXTENSIONS
-- Indian Retail Pharmacy Domain: Batches, FEFO, Suppliers, Purchases,
-- Customers, Ledgers, Drug Schedules, H1 Register, Counters, Audit, Sync
-- ====================================================================

-- 1. DRUG SCHEDULE ENUM
DO $$ BEGIN
    CREATE TYPE public.drug_schedule AS ENUM (
        'otc',
        'schedule_h',
        'schedule_h1',
        'schedule_x',
        'narcotic'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. DISCREPANCY & RECONCILIATION ENUMS
DO $$ BEGIN
    CREATE TYPE public.discrepancy_type AS ENUM (
        'negative_stock',
        'oversold_batch',
        'price_mismatch',
        'expired_sold',
        'duplicate_customer',
        'sequence_gap'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.discrepancy_status AS ENUM (
        'open',
        'resolved',
        'ignored'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. REGISTERED BILLING COUNTERS & GAP-FREE SERIES
CREATE TABLE IF NOT EXISTS public.counters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    counter_code VARCHAR(10) NOT NULL, -- e.g. 'C1', 'C2'
    counter_name VARCHAR(100) NOT NULL,
    device_id VARCHAR(100),
    invoice_prefix VARCHAR(10) DEFAULT 'INV',
    current_sequence BIGINT NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(branch_id, counter_code)
);

CREATE INDEX IF NOT EXISTS idx_counters_branch ON public.counters(branch_id);

-- 4. MEDICINE MASTER EXTENSIONS
ALTER TABLE public.medicine_master 
    ADD COLUMN IF NOT EXISTS drug_schedule public.drug_schedule NOT NULL DEFAULT 'otc',
    ADD COLUMN IF NOT EXISTS storage_location VARCHAR(50),
    ADD COLUMN IF NOT EXISTS prescription_required BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 5. MEDICINE BARCODES TABLE (Multiple barcodes per medicine: piece, strip, pack)
CREATE TABLE IF NOT EXISTS public.medicine_barcodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    medicine_id UUID NOT NULL REFERENCES public.medicine_master(id) ON DELETE CASCADE,
    barcode VARCHAR(100) NOT NULL,
    unit_type VARCHAR(20) NOT NULL DEFAULT 'strip' CHECK (unit_type IN ('piece', 'strip', 'pack')),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(business_id, barcode)
);

CREATE INDEX IF NOT EXISTS idx_medicine_barcodes_lookup ON public.medicine_barcodes(barcode);
CREATE INDEX IF NOT EXISTS idx_medicine_barcodes_med ON public.medicine_barcodes(medicine_id);

-- 6. INVENTORY BATCHES (Granular Batch-level stock for FEFO)
CREATE TABLE IF NOT EXISTS public.inventory_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    medicine_id UUID NOT NULL REFERENCES public.medicine_master(id) ON DELETE CASCADE,
    batch_number VARCHAR(100) NOT NULL,
    expiry_date DATE NOT NULL,
    stock_pieces BIGINT NOT NULL DEFAULT 0 CHECK (stock_pieces >= 0),
    mrp NUMERIC(12, 2) NOT NULL CHECK (mrp >= 0),
    purchase_rate NUMERIC(12, 2) CHECK (purchase_rate >= 0),
    rack_location VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(branch_id, medicine_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_inv_batches_fefo ON public.inventory_batches(branch_id, medicine_id, expiry_date ASC);
CREATE INDEX IF NOT EXISTS idx_inv_batches_expiry ON public.inventory_batches(expiry_date);

-- 7. SUPPLIERS TABLE
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    legal_name VARCHAR(255),
    gstin VARCHAR(20),
    dl_number_20 VARCHAR(100),
    dl_number_21 VARCHAR(100),
    phone VARCHAR(30) NOT NULL,
    email VARCHAR(255),
    address TEXT,
    state_code VARCHAR(5) DEFAULT '09', -- 09 = Uttar Pradesh
    payment_terms_days INT DEFAULT 30,
    opening_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    current_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_suppliers_business ON public.suppliers(business_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_gstin ON public.suppliers(gstin);

-- 8. SUPPLIER LEDGER
CREATE TABLE IF NOT EXISTS public.supplier_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    entry_type VARCHAR(50) NOT NULL CHECK (entry_type IN ('purchase', 'payment', 'debit_note', 'adjustment')),
    reference_id VARCHAR(100),
    debit_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,  -- Payment made or return
    credit_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- Purchase bill
    balance_after NUMERIC(12, 2) NOT NULL,
    payment_method VARCHAR(30),
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_ledger_supp ON public.supplier_ledger(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_ledger_date ON public.supplier_ledger(created_at);

-- 9. CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    address TEXT,
    gstin VARCHAR(20),
    state_code VARCHAR(5) DEFAULT '09',
    credit_limit NUMERIC(12, 2) NOT NULL DEFAULT 5000.00,
    outstanding_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    loyalty_points INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(business_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_business ON public.customers(business_id);

-- 10. CUSTOMER LEDGER (Udhaar & Payment tracking)
CREATE TABLE IF NOT EXISTS public.customer_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    entry_type VARCHAR(50) NOT NULL CHECK (entry_type IN ('sale_credit', 'payment_received', 'credit_note', 'adjustment')),
    reference_id VARCHAR(100),
    debit_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,  -- Sale on credit
    credit_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- Cash/UPI received or return
    balance_after NUMERIC(12, 2) NOT NULL,
    payment_method VARCHAR(30),
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_ledger_cust ON public.customer_ledger(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_date ON public.customer_ledger(created_at);

-- 11. DOCTORS & PRESCRIPTIONS
CREATE TABLE IF NOT EXISTS public.doctors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    registration_number VARCHAR(100) NOT NULL,
    clinic_hospital_name VARCHAR(255),
    phone VARCHAR(30),
    qualification VARCHAR(100),
    address TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doctors_reg ON public.doctors(registration_number);

CREATE TABLE IF NOT EXISTS public.prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
    doctor_name VARCHAR(255),
    doctor_reg_no VARCHAR(100),
    patient_name VARCHAR(255) NOT NULL,
    patient_age INT,
    patient_gender VARCHAR(10),
    patient_address TEXT,
    rx_image_url TEXT,
    invoice_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_invoice ON public.prescriptions(invoice_id);

-- 12. SCHEDULE H1 REGISTER (Statutory Indian Pharmacy Requirement)
CREATE TABLE IF NOT EXISTS public.h1_register (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL,
    invoice_number VARCHAR(100) NOT NULL,
    medicine_id UUID NOT NULL REFERENCES public.medicine_master(id) ON DELETE RESTRICT,
    medicine_name VARCHAR(255) NOT NULL,
    batch_number VARCHAR(100) NOT NULL,
    quantity_pieces INT NOT NULL,
    patient_name VARCHAR(255) NOT NULL,
    patient_address TEXT,
    doctor_name VARCHAR(255) NOT NULL,
    doctor_reg_no VARCHAR(100) NOT NULL,
    sale_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_h1_register_branch ON public.h1_register(branch_id);
CREATE INDEX IF NOT EXISTS idx_h1_register_date ON public.h1_register(sale_date);

-- 13. PURCHASE INVOICES & PURCHASE ITEMS
CREATE TABLE IF NOT EXISTS public.purchase_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    supplier_invoice_number VARCHAR(100) NOT NULL,
    invoice_date DATE NOT NULL,
    received_date DATE NOT NULL DEFAULT CURRENT_DATE,
    subtotal_taxable NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_cgst NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_sgst NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_igst NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_gst NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    round_off NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    payment_status VARCHAR(30) NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('paid', 'unpaid', 'partial')),
    bill_image_url TEXT,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_branch ON public.purchase_invoices(branch_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier ON public.purchase_invoices(supplier_id);

CREATE TABLE IF NOT EXISTS public.purchase_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_invoice_id UUID NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
    medicine_id UUID NOT NULL REFERENCES public.medicine_master(id) ON DELETE RESTRICT,
    batch_number VARCHAR(100) NOT NULL,
    expiry_date DATE NOT NULL,
    unit_type VARCHAR(20) NOT NULL DEFAULT 'strip' CHECK (unit_type IN ('piece', 'strip', 'pack')),
    quantity_units NUMERIC(10, 2) NOT NULL,
    pieces_per_unit INT NOT NULL DEFAULT 10,
    total_pieces BIGINT NOT NULL,
    free_quantity_units NUMERIC(10, 2) NOT NULL DEFAULT 0,
    purchase_rate NUMERIC(12, 2) NOT NULL,
    mrp NUMERIC(12, 2) NOT NULL,
    discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    gst_rate NUMERIC(5, 2) NOT NULL DEFAULT 12.00,
    taxable_amount NUMERIC(12, 2) NOT NULL,
    gst_amount NUMERIC(12, 2) NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL,
    hsn_code VARCHAR(20) DEFAULT '3004',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_items_invoice ON public.purchase_items(purchase_invoice_id);

-- 14. SALES RETURNS / CREDIT NOTES
CREATE TABLE IF NOT EXISTS public.sales_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    original_invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
    credit_note_number VARCHAR(100) NOT NULL UNIQUE,
    return_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(30) NOT NULL,
    subtotal_taxable NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_cgst NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_sgst NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_igst NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_gst NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    refund_method VARCHAR(30) NOT NULL DEFAULT 'cash' CHECK (refund_method IN ('cash', 'upi', 'card', 'store_credit')),
    refund_status VARCHAR(30) NOT NULL DEFAULT 'completed',
    reason TEXT NOT NULL,
    is_stock_restocked BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_returns_invoice ON public.sales_returns(original_invoice_id);

CREATE TABLE IF NOT EXISTS public.sales_return_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_return_id UUID NOT NULL REFERENCES public.sales_returns(id) ON DELETE CASCADE,
    invoice_item_id UUID,
    medicine_id UUID NOT NULL REFERENCES public.medicine_master(id) ON DELETE RESTRICT,
    batch_number VARCHAR(100) NOT NULL,
    pieces_returned BIGINT NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL,
    gst_rate NUMERIC(5, 2) NOT NULL DEFAULT 12.00,
    taxable_amount NUMERIC(12, 2) NOT NULL,
    gst_amount NUMERIC(12, 2) NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL,
    restock_status VARCHAR(30) NOT NULL DEFAULT 'restocked', -- 'restocked', 'quarantined', 'discarded'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. STOCK TRANSFERS (Inter-Branch Transfers)
CREATE TABLE IF NOT EXISTS public.stock_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    destination_branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    transfer_number VARCHAR(100) NOT NULL UNIQUE,
    status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_transit', 'received', 'cancelled')),
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    received_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    received_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_transfer_id UUID NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
    medicine_id UUID NOT NULL REFERENCES public.medicine_master(id) ON DELETE RESTRICT,
    batch_number VARCHAR(100) NOT NULL,
    expiry_date DATE NOT NULL,
    pieces_sent BIGINT NOT NULL,
    pieces_received BIGINT,
    mrp NUMERIC(12, 2) NOT NULL,
    purchase_rate NUMERIC(12, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. DAY CLOSE & EXPENSES
CREATE TABLE IF NOT EXISTS public.day_close (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    counter_id UUID REFERENCES public.counters(id) ON DELETE SET NULL,
    opening_cash NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cash_sales NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    upi_sales NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    card_sales NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    credit_sales NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cash_returns NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cash_expenses NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    system_closing_cash NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    actual_closing_cash NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    difference NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(30) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    notes TEXT,
    opened_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    closed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    day_close_id UUID REFERENCES public.day_close(id) ON DELETE SET NULL,
    category VARCHAR(100) NOT NULL, -- 'tea_snacks', 'cleaning', 'courier', 'stationery', 'other'
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(30) NOT NULL DEFAULT 'cash',
    payee VARCHAR(255),
    notes TEXT,
    recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. DISCREPANCIES TABLE (Reconciliation & Sync Issues)
CREATE TABLE IF NOT EXISTS public.discrepancies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    discrepancy_type public.discrepancy_type NOT NULL,
    status public.discrepancy_status NOT NULL DEFAULT 'open',
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    client_record_id VARCHAR(100),
    server_record_id VARCHAR(100),
    payload JSONB DEFAULT '{}'::jsonb,
    resolution_action VARCHAR(100),
    resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_discrepancies_status ON public.discrepancies(status);
CREATE INDEX IF NOT EXISTS idx_discrepancies_branch ON public.discrepancies(branch_id);

-- 18. EXTENSIONS TO INVOICES TABLE (Offline, Idempotency, Splits, GSTIN)
ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS counter_id UUID REFERENCES public.counters(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS device_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100) UNIQUE,
    ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS doctor_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS customer_gstin VARCHAR(20),
    ADD COLUMN IF NOT EXISTS is_interstate BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS round_off NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS payment_splits JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS upi_reference VARCHAR(100),
    ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS cancelled_reason TEXT,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 19. EXTENSIONS TO INVOICE_ITEMS TABLE (Batch links, HSN, Tax breakups)
ALTER TABLE public.invoice_items
    ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.inventory_batches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS expiry_date DATE,
    ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(20) DEFAULT '3004',
    ADD COLUMN IF NOT EXISTS cgst_rate NUMERIC(5, 2) DEFAULT 6.00,
    ADD COLUMN IF NOT EXISTS sgst_rate NUMERIC(5, 2) DEFAULT 6.00,
    ADD COLUMN IF NOT EXISTS igst_rate NUMERIC(5, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS cgst_amount NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS sgst_amount NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS igst_amount NUMERIC(12, 2) DEFAULT 0.00;

-- 20. EXTENSIONS TO STOCK_MOVEMENTS (Batch-aware movements)
ALTER TABLE public.stock_movements
    ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS expiry_date DATE,
    ADD COLUMN IF NOT EXISTS counter_id UUID,
    ADD COLUMN IF NOT EXISTS device_id VARCHAR(100);

-- 21. BACKWARD COMPATIBLE VIEW FOR BRANCH INVENTORY
CREATE OR REPLACE VIEW public.branch_inventory_view AS
SELECT
    branch_id,
    medicine_id,
    COALESCE(SUM(stock_pieces), 0) AS stock_pieces,
    MIN(expiry_date) AS next_expiry_date,
    MAX(updated_at) AS updated_at
FROM public.inventory_batches
WHERE is_active = TRUE AND (deleted_at IS NULL)
GROUP BY branch_id, medicine_id;

-- 22. EXPIRY ALERTS VIEW
CREATE OR REPLACE VIEW public.expiry_alerts_view AS
SELECT
    ib.id AS batch_id,
    ib.branch_id,
    b.name AS branch_name,
    ib.medicine_id,
    m.brand_name,
    m.generic_name,
    m.dosage_form,
    ib.batch_number,
    ib.expiry_date,
    ib.stock_pieces,
    ib.mrp,
    ib.rack_location,
    (ib.expiry_date - CURRENT_DATE) AS days_until_expiry,
    CASE
        WHEN ib.expiry_date < CURRENT_DATE THEN 'expired'
        WHEN ib.expiry_date <= (CURRENT_DATE + INTERVAL '30 days') THEN 'urgent_30'
        WHEN ib.expiry_date <= (CURRENT_DATE + INTERVAL '60 days') THEN 'warning_60'
        WHEN ib.expiry_date <= (CURRENT_DATE + INTERVAL '90 days') THEN 'notice_90'
        ELSE 'good'
    END AS alert_tier
FROM public.inventory_batches ib
JOIN public.medicine_master m ON ib.medicine_id = m.id
JOIN public.branches b ON ib.branch_id = b.id
WHERE ib.is_active = TRUE AND ib.stock_pieces > 0 AND ib.deleted_at IS NULL;

-- 23. ENABLE ROW LEVEL SECURITY ON ALL NEW TABLES
ALTER TABLE public.counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicine_barcodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.h1_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.day_close ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discrepancies ENABLE ROW LEVEL SECURITY;

-- 24. RLS POLICIES FOR NEW TABLES
CREATE POLICY "Counters read" ON public.counters
    FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Counters manage" ON public.counters
    FOR ALL TO authenticated USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'master_admin');

CREATE POLICY "Medicine barcodes view" ON public.medicine_barcodes
    FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Medicine barcodes edit" ON public.medicine_barcodes
    FOR ALL TO authenticated USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('master_admin', 'sub_admin', 'inventory_manager'));

CREATE POLICY "Inventory batches read" ON public.inventory_batches
    FOR SELECT TO authenticated USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'master_admin' OR
        branch_id = (SELECT primary_branch_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "Inventory batches manage" ON public.inventory_batches
    FOR ALL TO authenticated USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('master_admin', 'sub_admin', 'branch_manager', 'inventory_manager')
    );

CREATE POLICY "Suppliers read" ON public.suppliers
    FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Suppliers manage" ON public.suppliers
    FOR ALL TO authenticated USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('master_admin', 'sub_admin', 'inventory_manager'));

CREATE POLICY "Supplier ledger read" ON public.supplier_ledger
    FOR SELECT TO authenticated USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('master_admin', 'sub_admin', 'branch_manager', 'inventory_manager')
    );

CREATE POLICY "Customers read" ON public.customers
    FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Customers manage" ON public.customers
    FOR ALL TO authenticated USING (TRUE);

CREATE POLICY "Customer ledger read" ON public.customer_ledger
    FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Doctors view" ON public.doctors
    FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Prescriptions read" ON public.prescriptions
    FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "H1 register read" ON public.h1_register
    FOR SELECT TO authenticated USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('master_admin', 'sub_admin', 'branch_manager', 'billing_employee')
    );

CREATE POLICY "Purchase invoices view" ON public.purchase_invoices
    FOR SELECT TO authenticated USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'master_admin' OR
        branch_id = (SELECT primary_branch_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "Sales returns view" ON public.sales_returns
    FOR SELECT TO authenticated USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'master_admin' OR
        branch_id = (SELECT primary_branch_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "Day close view" ON public.day_close
    FOR SELECT TO authenticated USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'master_admin' OR
        branch_id = (SELECT primary_branch_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "Discrepancies view" ON public.discrepancies
    FOR SELECT TO authenticated USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('master_admin', 'sub_admin', 'branch_manager')
    );


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 003_rpcs.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 004_seed_bajrang_pharmacy.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ====================================================================
-- PHARMADESK — MIGRATION 004: CORE INFRASTRUCTURE BOOTSTRAP (NEUTRALISED SEED)
-- Retains ONLY structural entities required for fresh initialization:
-- 1. Primary Business
-- 2. Initial Operational Branches
-- 3. Point-of-Sale Billing Counters
-- Demo catalog, customers, suppliers, doctors, and batches removed.
-- ====================================================================

-- 1. BOOTSTRAP BUSINESS
INSERT INTO public.businesses (
    id,
    name,
    legal_name,
    gstin,
    pan,
    drug_license,
    phone,
    email,
    address,
    currency,
    timezone
) VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'Bajrang Pharmacy',
    'Bajrang Pharmacy Retail LLP',
    '09CMVPM3439A1ZS',
    'CMVPM3439A',
    'UP-LKO-20B-10928 & UP-LKO-21B-10929',
    '+91 522 261 4001',
    'contact@bajrangpharmacy.in',
    'Shop 12-14, Hazratganj Commercial Complex, Lucknow, Uttar Pradesh 226001',
    'INR',
    'Asia/Kolkata'
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    gstin = EXCLUDED.gstin,
    pan = EXCLUDED.pan,
    address = EXCLUDED.address,
    drug_license = EXCLUDED.drug_license;

-- 2. BOOTSTRAP BRANCHES
INSERT INTO public.branches (
    id,
    business_id,
    branch_code,
    name,
    address,
    city,
    state,
    pincode,
    phone,
    email,
    gstin,
    drug_license,
    invoice_prefix,
    invoice_sequence
) VALUES
(
    'c0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'LKO1',
    'Bajrang Pharmacy — Hazratganj Main Dispensary',
    'Shop 12-14, Hazratganj Commercial Complex, MG Marg',
    'Lucknow',
    'Uttar Pradesh',
    '226001',
    '+91 522 261 4001',
    'hazratganj@bajrangpharmacy.in',
    '09CMVPM3439A1ZS',
    'UP-LKO-20B-10928 & UP-LKO-21B-10929',
    'LKO1',
    1001
),
(
    'c0000000-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000001',
    'LKO2',
    'Bajrang Pharmacy — Alambagh Health Hub',
    'Plot 45, Kanpur Road, Near Metro Station, Alambagh',
    'Lucknow',
    'Uttar Pradesh',
    '226005',
    '+91 522 245 8890',
    'alambagh@bajrangpharmacy.in',
    '09CMVPM3439A1ZS',
    'UP-LKO-20B-20411 & UP-LKO-21B-20412',
    'LKO2',
    1001
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    branch_code = EXCLUDED.branch_code,
    gstin = EXCLUDED.gstin,
    city = EXCLUDED.city,
    state = EXCLUDED.state,
    address = EXCLUDED.address;

-- 3. BOOTSTRAP BILLING COUNTERS
INSERT INTO public.counters (
    id,
    branch_id,
    counter_code,
    counter_name,
    invoice_prefix,
    current_sequence
) VALUES
('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'C1', 'Counter 1 (Main Cash & POS)', 'LKO1', 1),
('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'C2', 'Counter 2 (Express & Digital UPI)', 'LKO1', 1),
('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'C1', 'Counter 1 (Dispensing Counter)', 'LKO2', 1),
('d0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', 'C2', 'Counter 2 (Consultation Desk)', 'LKO2', 1)
ON CONFLICT (branch_id, counter_code) DO NOTHING;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 005_auth_lookup_and_bootstrap.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ====================================================================
-- PHARMADESK — MIGRATION 005: AUTH LOOKUP & MASTER ADMIN BOOTSTRAP
-- 1. DROP previous lookup_employee_email overloads
-- 2. CREATE public.lookup_employee_email(p_employee_id text)
--    RETURNS TABLE(email text, is_active boolean)
-- 3. GRANT EXECUTE to anon and authenticated
-- 4. NOTIFY pgrst, 'reload schema'
-- 5. Master Admin bootstrap template and auto-linker
-- ====================================================================

-- 1. DROP ANY PREVIOUS SIGNATURES
DROP FUNCTION IF EXISTS public.lookup_employee_email(varchar);
DROP FUNCTION IF EXISTS public.lookup_employee_email(text);

-- 2. CREATE SECURE EMPLOYEE ID LOOKUP RPC
-- SECURITY DEFINER allows unauthenticated login screen to look up auth email
-- by employee ID (e.g. EMP001) without opening the profiles table to anon RLS.
CREATE OR REPLACE FUNCTION public.lookup_employee_email(p_employee_id text)
RETURNS TABLE(email text, is_active boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT p.email::text, p.is_active
    FROM public.profiles p
    WHERE UPPER(p.employee_id) = UPPER(TRIM(p_employee_id))
    LIMIT 1;
END;
$$;

-- 3. PERMISSIONS: REVOKE PUBLIC, GRANT EXPLICITLY TO anon AND authenticated
REVOKE ALL ON FUNCTION public.lookup_employee_email(text) FROM public;
GRANT EXECUTE ON FUNCTION public.lookup_employee_email(text) TO anon, authenticated;

COMMENT ON FUNCTION public.lookup_employee_email(text) IS
'Security Definer lookup to resolve Employee ID (e.g. EMP001) to registered auth email for login screen without granting anon access to public.profiles.';

-- 4. RELOAD POSTGREST SCHEMA CACHE
NOTIFY pgrst, 'reload schema';

-- ====================================================================
-- 5. MASTER ADMIN BOOTSTRAP INSTRUCTIONS & TEMPLATE
-- ====================================================================
/*
STEP 1: In Supabase Dashboard -> Authentication -> Users -> "Add User" -> "Create User"
  - Email:    admin@bajrangpharmacy.in
  - Password: <your-secure-password> (e.g. admin123)
  - Auto Confirm User?: YES
  - Copy the generated Auth User UID (UUID).

STEP 2: Run the SQL statement below, replacing 'YOUR_AUTH_USER_UUID_HERE' with the copied UID:

INSERT INTO public.profiles (
    id,
    business_id,
    employee_id,
    full_name,
    email,
    phone,
    role,
    primary_branch_id,
    is_active,
    permissions
) VALUES (
    'YOUR_AUTH_USER_UUID_HERE'::uuid,
    'b0000000-0000-0000-0000-000000000001',
    'EMP001',
    'Master Administrator',
    'admin@bajrangpharmacy.in',
    '+91 522 261 4001',
    'master_admin',
    'c0000000-0000-0000-0000-000000000001',
    TRUE,
    '{"all": true, "view_branch_dashboard": true, "manage_medicines": true, "manage_inventory": true, "view_invoices": true, "access_billing": true, "view_branch_reports": true, "manage_permitted_employees": true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
    employee_id = EXCLUDED.employee_id,
    role = 'master_admin',
    is_active = TRUE;
*/

-- AUTOMATED IDEMPOTENT LINKER:
-- If admin@bajrangpharmacy.in already exists in auth.users, links it into public.profiles as EMP001
DO $$
DECLARE
    v_auth_user_id UUID;
    v_business_id UUID := 'b0000000-0000-0000-0000-000000000001';
    v_branch_id UUID := 'c0000000-0000-0000-0000-000000000001';
BEGIN
    SELECT id INTO v_auth_user_id 
    FROM auth.users 
    WHERE email = 'admin@bajrangpharmacy.in' 
    LIMIT 1;

    IF v_auth_user_id IS NOT NULL THEN
        INSERT INTO public.profiles (
            id,
            business_id,
            employee_id,
            full_name,
            email,
            phone,
            role,
            primary_branch_id,
            is_active,
            permissions
        ) VALUES (
            v_auth_user_id,
            v_business_id,
            'EMP001',
            'Master Administrator',
            'admin@bajrangpharmacy.in',
            '+91 522 261 4001',
            'master_admin',
            v_branch_id,
            TRUE,
            '{"all": true, "view_branch_dashboard": true, "manage_medicines": true, "manage_inventory": true, "view_invoices": true, "access_billing": true, "view_branch_reports": true, "manage_permitted_employees": true}'::jsonb
        )
        ON CONFLICT (id) DO UPDATE SET
            employee_id = 'EMP001',
            role = 'master_admin',
            is_active = TRUE;
            
        RAISE NOTICE 'Master Admin (EMP001) successfully linked in public.profiles for user %', v_auth_user_id;
    ELSE
        RAISE NOTICE 'Note: First create user admin@bajrangpharmacy.in in Supabase Auth Dashboard, then re-run to auto-link EMP001 profile.';
    END IF;
END $$;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 006_fix_login_profiles_rls.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ====================================================================
-- PHARMADESK — MIGRATION 006: FIX LOGIN PROFILES RLS RECURSION
-- Resolves "infinite recursion detected in policy for relation profiles"
-- by using SECURITY DEFINER helper get_current_user_role() and
-- installs privilege guard trigger on public.profiles.
-- ====================================================================

-- 1. Helper Function: get_current_user_role() (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS public.app_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role public.app_role;
BEGIN
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
    RETURN v_role;
END;
$$;

-- 2. Helper Function: get_current_user_branch() (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_current_user_branch()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_branch UUID;
BEGIN
    SELECT primary_branch_id INTO v_branch FROM public.profiles WHERE id = auth.uid();
    RETURN v_branch;
END;
$$;

-- 3. Profiles Read Policy (Breaks recursion by using SECURITY DEFINER role lookup)
DROP POLICY IF EXISTS "Profiles read policy" ON public.profiles;
CREATE POLICY "Profiles read policy" ON public.profiles
    FOR SELECT TO authenticated
    USING (
        auth.uid() = id OR
        public.get_current_user_role() IN ('master_admin', 'sub_admin')
    );

-- 4. Profiles Update Policy
DROP POLICY IF EXISTS "Master admin profiles update" ON public.profiles;
CREATE POLICY "Master admin profiles update" ON public.profiles
    FOR UPDATE TO authenticated
    USING (
        auth.uid() = id OR
        public.get_current_user_role() = 'master_admin'
    );

-- 5. Guard Trigger: Prevent non-master_admin from privilege escalation
-- Allows users to update non-sensitive columns or toggle must_change_password via complete_password_change
CREATE OR REPLACE FUNCTION public.guard_profile_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- If caller is not master_admin, prevent modifying sensitive columns
    IF public.get_current_user_role() IS DISTINCT FROM 'master_admin' THEN
        IF NEW.role IS DISTINCT FROM OLD.role THEN
            RAISE EXCEPTION 'Only master_admin can change user role';
        END IF;
        IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
            RAISE EXCEPTION 'Only master_admin can change active status';
        END IF;
        -- Allow password change flow to remove must_change_password, but disallow altering other permissions
        IF (NEW.permissions - 'must_change_password') IS DISTINCT FROM (OLD.permissions - 'must_change_password') THEN
            RAISE EXCEPTION 'Only master_admin can modify permissions';
        END IF;
        IF NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
            RAISE EXCEPTION 'Only master_admin can change employee_id';
        END IF;
        IF NEW.primary_branch_id IS DISTINCT FROM OLD.primary_branch_id THEN
            RAISE EXCEPTION 'Only master_admin can change branch assignment';
        END IF;
        IF NEW.business_id IS DISTINCT FROM OLD.business_id THEN
            RAISE EXCEPTION 'Only master_admin can change business assignment';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_updates ON public.profiles;
CREATE TRIGGER trg_guard_profile_updates
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_profile_updates();

NOTIFY pgrst, 'reload schema';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 007_link_master_admin.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ====================================================================
-- PHARMADESK — MIGRATION 007: LINK MASTER ADMIN PROFILE TO AUTH.USERS
-- Safely links auth.users record (omlenka22@gmail.com) to public.profiles
-- ====================================================================

DO $$
DECLARE
    v_uid UUID;
    v_bus UUID;
    v_br UUID;
BEGIN
    -- 1. Look up auth.users UID for omlenka22@gmail.com
    SELECT id INTO v_uid 
    FROM auth.users 
    WHERE lower(email) = 'omlenka22@gmail.com' 
    LIMIT 1;

    -- 2. Fetch default business and branch IDs (fallback to seed defaults if needed)
    SELECT id INTO v_bus FROM public.businesses ORDER BY created_at ASC LIMIT 1;
    SELECT id INTO v_br FROM public.branches ORDER BY created_at ASC LIMIT 1;

    IF v_bus IS NULL THEN
        v_bus := 'b0000000-0000-0000-0000-000000000001'::uuid;
    END IF;
    IF v_br IS NULL THEN
        v_br := 'c0000000-0000-0000-0000-000000000001'::uuid;
    END IF;

    -- 3. If the auth user exists, link to public.profiles
    IF v_uid IS NOT NULL THEN
        -- Clean up any placeholder profile that claimed employee_id or email with an invalid/mismatched UID
        DELETE FROM public.profiles 
        WHERE (lower(employee_id) = 'master-admin' OR lower(email) = 'omlenka22@gmail.com')
          AND id <> v_uid;

        INSERT INTO public.profiles (
            id,
            business_id,
            employee_id,
            full_name,
            email,
            phone,
            role,
            primary_branch_id,
            is_active,
            permissions
        ) VALUES (
            v_uid,
            v_bus,
            'master-admin',
            'Master Administrator',
            'omlenka22@gmail.com',
            '+91 522 261 4001',
            'master_admin',
            v_br,
            TRUE,
            '{"all": true, "must_change_password": true, "view_branch_dashboard": true, "manage_medicines": true, "manage_inventory": true, "view_invoices": true, "access_billing": true, "view_branch_reports": true, "manage_permitted_employees": true}'::jsonb
        )
        ON CONFLICT (id) DO UPDATE SET
            business_id = EXCLUDED.business_id,
            employee_id = 'master-admin',
            full_name = EXCLUDED.full_name,
            email = 'omlenka22@gmail.com',
            role = 'master_admin',
            primary_branch_id = EXCLUDED.primary_branch_id,
            is_active = TRUE,
            permissions = EXCLUDED.permissions;

        RAISE NOTICE 'Successfully linked master-admin profile for % with UID %', 'omlenka22@gmail.com', v_uid;
    ELSE
        RAISE NOTICE 'Auth user omlenka22@gmail.com not yet found in auth.users. Run setup:admin or create in Supabase Auth.';
    END IF;
END $$;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 008_employee_id_case_insensitive.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ====================================================================
-- PHARMADESK — MIGRATION 008: CASE-INSENSITIVE EMPLOYEE ID & RLS REINFORCEMENT
-- 1. Normalise existing employee_id values to lowercase
-- 2. Replace UNIQUE constraint with unique index on lower(employee_id)
-- 3. Case-insensitive lookup_employee_email RPC
-- 4. Re-enforce 006 RLS helpers, policies, and update guard trigger
-- ====================================================================

-- 1. Normalise all existing employee IDs to lowercase
UPDATE public.profiles
SET employee_id = lower(employee_id);

-- 2. Replace the UNIQUE constraint on employee_id with a functional unique index
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_employee_id_key;
DROP INDEX IF EXISTS idx_profiles_employee_id;
DROP INDEX IF EXISTS idx_profiles_employee_id_lower;

CREATE UNIQUE INDEX idx_profiles_employee_id_lower ON public.profiles (lower(employee_id));

-- 3. Recreate lookup_employee_email RPC with case-insensitive lower(...) matching
DROP FUNCTION IF EXISTS public.lookup_employee_email(varchar);
DROP FUNCTION IF EXISTS public.lookup_employee_email(text);

CREATE OR REPLACE FUNCTION public.lookup_employee_email(p_employee_id text)
RETURNS TABLE(email text, is_active boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT p.email::text, p.is_active
    FROM public.profiles p
    WHERE lower(p.employee_id) = lower(trim(p_employee_id))
    LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_employee_email(text) FROM public;
GRANT EXECUTE ON FUNCTION public.lookup_employee_email(text) TO anon, authenticated;

-- 4. Re-enforce 006 RLS helpers and policies (Idempotent: CREATE OR REPLACE / DROP IF EXISTS)
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS public.app_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role public.app_role;
BEGIN
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
    RETURN v_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_branch()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_branch UUID;
BEGIN
    SELECT primary_branch_id INTO v_branch FROM public.profiles WHERE id = auth.uid();
    RETURN v_branch;
END;
$$;

DROP POLICY IF EXISTS "Profiles read policy" ON public.profiles;
CREATE POLICY "Profiles read policy" ON public.profiles
    FOR SELECT TO authenticated
    USING (
        auth.uid() = id OR
        public.get_current_user_role() IN ('master_admin', 'sub_admin')
    );

DROP POLICY IF EXISTS "Master admin profiles update" ON public.profiles;
CREATE POLICY "Master admin profiles update" ON public.profiles
    FOR UPDATE TO authenticated
    USING (
        auth.uid() = id OR
        public.get_current_user_role() = 'master_admin'
    );

CREATE OR REPLACE FUNCTION public.guard_profile_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF public.get_current_user_role() IS DISTINCT FROM 'master_admin' THEN
        IF NEW.role IS DISTINCT FROM OLD.role THEN
            RAISE EXCEPTION 'Only master_admin can change user role';
        END IF;
        IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
            RAISE EXCEPTION 'Only master_admin can change active status';
        END IF;
        IF (NEW.permissions - 'must_change_password') IS DISTINCT FROM (OLD.permissions - 'must_change_password') THEN
            RAISE EXCEPTION 'Only master_admin can modify permissions';
        END IF;
        IF NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
            RAISE EXCEPTION 'Only master_admin can change employee_id';
        END IF;
        IF NEW.primary_branch_id IS DISTINCT FROM OLD.primary_branch_id THEN
            RAISE EXCEPTION 'Only master_admin can change branch assignment';
        END IF;
        IF NEW.business_id IS DISTINCT FROM OLD.business_id THEN
            RAISE EXCEPTION 'Only master_admin can change business assignment';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_updates ON public.profiles;
CREATE TRIGGER trg_guard_profile_updates
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_profile_updates();

NOTIFY pgrst, 'reload schema';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 009_complete_password_change.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ====================================================================
-- PHARMADESK — MIGRATION 009: COMPLETE PASSWORD CHANGE RPC
-- Removes must_change_password flag from the caller's profile permissions
-- ====================================================================

CREATE OR REPLACE FUNCTION public.complete_password_change()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_current_perms JSONB;
    v_new_perms JSONB;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT COALESCE(permissions, '{}'::jsonb) INTO v_current_perms
    FROM public.profiles
    WHERE id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User profile record not found';
    END IF;

    -- Remove must_change_password flag from permissions jsonb
    v_new_perms := v_current_perms - 'must_change_password';

    UPDATE public.profiles
    SET permissions = v_new_perms,
        updated_at = NOW()
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Password change completed successfully'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_password_change() FROM public;
GRANT EXECUTE ON FUNCTION public.complete_password_change() TO authenticated;

COMMENT ON FUNCTION public.complete_password_change() IS
'RPC called after an authenticated user updates their password to clear the must_change_password requirement flag.';

NOTIFY pgrst, 'reload schema';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 010_complete_rls_policies.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ====================================================================
-- PHARMADESK — MIGRATION 010: PRODUCTION RLS AUDIT & POLICY COMPLETION
-- Adds missing RLS policies for:
-- 1. businesses
-- 2. business_settings
-- 3. branch_memberships
-- 4. expenses
-- 5. medicine_price_history
-- 6. payment_records
-- 7. purchase_items
-- 8. sales_return_items
-- 9. stock_transfers & stock_transfer_items
-- ====================================================================

-- 1. businesses
DROP POLICY IF EXISTS "Businesses read" ON public.businesses;
DROP POLICY IF EXISTS "Businesses manage" ON public.businesses;

CREATE POLICY "Businesses read" ON public.businesses
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Businesses manage" ON public.businesses
    FOR ALL TO authenticated
    USING (public.get_current_user_role() = 'master_admin');


-- 2. business_settings
DROP POLICY IF EXISTS "Business settings read" ON public.business_settings;
DROP POLICY IF EXISTS "Business settings manage" ON public.business_settings;

CREATE POLICY "Business settings read" ON public.business_settings
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Business settings manage" ON public.business_settings
    FOR ALL TO authenticated
    USING (public.get_current_user_role() = 'master_admin');


-- 3. branch_memberships
DROP POLICY IF EXISTS "Branch memberships read" ON public.branch_memberships;
DROP POLICY IF EXISTS "Branch memberships manage" ON public.branch_memberships;

CREATE POLICY "Branch memberships read" ON public.branch_memberships
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Branch memberships manage" ON public.branch_memberships
    FOR ALL TO authenticated
    USING (public.get_current_user_role() IN ('master_admin', 'sub_admin'));


-- 4. expenses
DROP POLICY IF EXISTS "Expenses read" ON public.expenses;
DROP POLICY IF EXISTS "Expenses insert" ON public.expenses;
DROP POLICY IF EXISTS "Expenses manage" ON public.expenses;

CREATE POLICY "Expenses read" ON public.expenses
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Expenses insert" ON public.expenses
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "Expenses manage" ON public.expenses
    FOR ALL TO authenticated
    USING (public.get_current_user_role() IN ('master_admin', 'sub_admin', 'branch_manager'));


-- 5. medicine_price_history
DROP POLICY IF EXISTS "Medicine price history read" ON public.medicine_price_history;
DROP POLICY IF EXISTS "Medicine price history manage" ON public.medicine_price_history;

CREATE POLICY "Medicine price history read" ON public.medicine_price_history
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Medicine price history manage" ON public.medicine_price_history
    FOR ALL TO authenticated
    USING (public.get_current_user_role() IN ('master_admin', 'sub_admin', 'inventory_manager'));


-- 6. payment_records
DROP POLICY IF EXISTS "Payment records read" ON public.payment_records;
DROP POLICY IF EXISTS "Payment records insert" ON public.payment_records;

CREATE POLICY "Payment records read" ON public.payment_records
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Payment records insert" ON public.payment_records
    FOR INSERT TO authenticated
    WITH CHECK (true);


-- 7. purchase_items
DROP POLICY IF EXISTS "Purchase items read" ON public.purchase_items;
DROP POLICY IF EXISTS "Purchase items manage" ON public.purchase_items;

CREATE POLICY "Purchase items read" ON public.purchase_items
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Purchase items manage" ON public.purchase_items
    FOR ALL TO authenticated
    USING (public.get_current_user_role() IN ('master_admin', 'sub_admin', 'inventory_manager'));


-- 8. sales_return_items
DROP POLICY IF EXISTS "Sales return items read" ON public.sales_return_items;
DROP POLICY IF EXISTS "Sales return items manage" ON public.sales_return_items;

CREATE POLICY "Sales return items read" ON public.sales_return_items
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Sales return items manage" ON public.sales_return_items
    FOR ALL TO authenticated
    USING (true);


-- 9. stock_transfers & stock_transfer_items
DROP POLICY IF EXISTS "Stock transfers read" ON public.stock_transfers;
DROP POLICY IF EXISTS "Stock transfers manage" ON public.stock_transfers;
DROP POLICY IF EXISTS "Stock transfer items read" ON public.stock_transfer_items;
DROP POLICY IF EXISTS "Stock transfer items manage" ON public.stock_transfer_items;

CREATE POLICY "Stock transfers read" ON public.stock_transfers
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Stock transfers manage" ON public.stock_transfers
    FOR ALL TO authenticated
    USING (public.get_current_user_role() IN ('master_admin', 'sub_admin', 'inventory_manager', 'branch_manager'));

CREATE POLICY "Stock transfer items read" ON public.stock_transfer_items
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Stock transfer items manage" ON public.stock_transfer_items
    FOR ALL TO authenticated
    USING (public.get_current_user_role() IN ('master_admin', 'sub_admin', 'inventory_manager', 'branch_manager'));

NOTIFY pgrst, 'reload schema';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 011_grant_schema_permissions.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ====================================================================
-- PHARMADESK — MIGRATION 011: GRANT SCHEMA AND TABLE PERMISSIONS
-- Grants USAGE, SELECT, INSERT, UPDATE, DELETE on public schema to
-- authenticated, anon, and service_role, allowing RLS policies to govern row access.
-- ====================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 012_smart_lookup_employee_email.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ====================================================================
-- PHARMADESK — MIGRATION 012: SMART EMPLOYEE ID LOOKUP RPC
-- Supports case-insensitivity, whitespace trimming, and common master-admin aliases
-- ====================================================================

CREATE OR REPLACE FUNCTION public.lookup_employee_email(p_employee_id text)
RETURNS TABLE(email text, is_active boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean text := lower(trim(p_employee_id));
    v_normalised text := replace(replace(v_clean, '_', ''), '-', '');
BEGIN
    RETURN QUERY
    SELECT p.email::text, p.is_active
    FROM public.profiles p
    WHERE lower(p.employee_id) = v_clean
       OR replace(replace(lower(p.employee_id), '_', ''), '-', '') = v_normalised
       OR (v_normalised IN ('emp001', 'masteradmin', 'admin', 'master') AND p.role = 'master_admin')
    ORDER BY (lower(p.employee_id) = v_clean) DESC
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_employee_email(text) TO anon, authenticated, service_role, postgres;

NOTIFY pgrst, 'reload schema';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 013_employee_creation_and_profiles_rls.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ====================================================================
-- PHARMADESK — MIGRATION 013: EMPLOYEE CREATION RPC & PROFILES RLS
-- 1. Adds missing INSERT and DELETE RLS policies on public.profiles
-- 2. Provides public.admin_create_employee RPC for atomic employee creation
--    by master_admin without breaking active browser session.
-- ====================================================================

-- 1. Profiles INSERT policy
DROP POLICY IF EXISTS "Profiles insert policy" ON public.profiles;
DROP POLICY IF EXISTS "Master admin profiles insert" ON public.profiles;

CREATE POLICY "Profiles insert policy" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (
        public.get_current_user_role() = 'master_admin' OR
        auth.uid() = id
    );

-- 2. Profiles DELETE policy
DROP POLICY IF EXISTS "Profiles delete policy" ON public.profiles;
DROP POLICY IF EXISTS "Master admin profiles delete" ON public.profiles;

CREATE POLICY "Profiles delete policy" ON public.profiles
    FOR DELETE TO authenticated
    USING (
        public.get_current_user_role() = 'master_admin'
    );

-- 3. Atomic admin employee creation function
CREATE OR REPLACE FUNCTION public.admin_create_employee(
    p_full_name TEXT,
    p_employee_id TEXT,
    p_email TEXT,
    p_password TEXT,
    p_role TEXT,
    p_branch_id UUID,
    p_phone TEXT DEFAULT NULL,
    p_permissions JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_clean_emp_id TEXT;
    v_clean_email TEXT;
    v_target_role public.app_role;
    v_user_id UUID;
    v_business_id UUID;
    v_result JSONB;
BEGIN
    -- 1. Authorization: Only master_admin can create staff accounts
    IF public.get_current_user_role() <> 'master_admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only master_admin can create staff accounts.';
    END IF;

    -- 2. Clean and validate inputs
    v_clean_emp_id := lower(trim(p_employee_id));
    v_clean_email := lower(trim(p_email));

    IF v_clean_emp_id = '' OR v_clean_email = '' OR trim(p_full_name) = '' THEN
        RAISE EXCEPTION 'Full name, employee ID, and email are required.';
    END IF;

    IF length(p_password) < 6 THEN
        RAISE EXCEPTION 'Password must be at least 6 characters.';
    END IF;

    -- Validate role enum
    BEGIN
        v_target_role := p_role::public.app_role;
    EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Invalid role specified: %', p_role;
    END;

    -- 3. Determine business_id from branch or fallback to first business
    SELECT business_id INTO v_business_id FROM public.branches WHERE id = p_branch_id LIMIT 1;
    IF v_business_id IS NULL THEN
        SELECT id INTO v_business_id FROM public.businesses ORDER BY created_at ASC LIMIT 1;
    END IF;
    IF v_business_id IS NULL THEN
        v_business_id := 'b0000000-0000-0000-0000-000000000001'::uuid;
    END IF;

    -- 4. Check if auth user already exists in auth.users
    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_clean_email LIMIT 1;

    -- Check for Employee ID collision in public.profiles (different user)
    IF EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE lower(employee_id) = v_clean_emp_id 
          AND (v_user_id IS NULL OR id <> v_user_id)
    ) THEN
        RAISE EXCEPTION 'Employee ID "%" is already assigned to an existing staff member.', p_employee_id;
    END IF;

    IF v_user_id IS NOT NULL THEN
        -- Existing auth user: update password and ensure email is confirmed
        UPDATE auth.users
        SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
            email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
            raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
            raw_user_meta_data = jsonb_build_object(
                'full_name', trim(p_full_name),
                'employee_id', v_clean_emp_id,
                'role', v_target_role::text
            ),
            updated_at = NOW()
        WHERE id = v_user_id;
    ELSE
        -- Create new user in auth.users
        v_user_id := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            is_super_admin,
            created_at,
            updated_at
        ) VALUES (
            '00000000-0000-0000-0000-000000000000'::uuid,
            v_user_id,
            'authenticated',
            'authenticated',
            v_clean_email,
            extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
            NOW(),
            jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
            jsonb_build_object(
                'full_name', trim(p_full_name),
                'employee_id', v_clean_emp_id,
                'role', v_target_role::text
            ),
            false,
            NOW(),
            NOW()
        );
    END IF;

    -- 5. Insert or update public.profiles
    INSERT INTO public.profiles (
        id,
        business_id,
        employee_id,
        full_name,
        email,
        phone,
        role,
        primary_branch_id,
        is_active,
        permissions
    ) VALUES (
        v_user_id,
        v_business_id,
        v_clean_emp_id,
        trim(p_full_name),
        v_clean_email,
        NULLIF(trim(p_phone), ''),
        v_target_role,
        p_branch_id,
        TRUE,
        COALESCE(p_permissions, '{}'::jsonb)
    )
    ON CONFLICT (id) DO UPDATE SET
        business_id = EXCLUDED.business_id,
        employee_id = EXCLUDED.employee_id,
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        role = EXCLUDED.role,
        primary_branch_id = EXCLUDED.primary_branch_id,
        is_active = EXCLUDED.is_active,
        permissions = EXCLUDED.permissions,
        updated_at = NOW();

    -- 6. Add to branch_memberships
    IF p_branch_id IS NOT NULL THEN
        INSERT INTO public.branch_memberships (business_id, branch_id, profile_id, is_active)
        VALUES (v_business_id, p_branch_id, v_user_id, TRUE)
        ON CONFLICT DO NOTHING;
    END IF;

    -- 7. Return complete profile JSON
    SELECT jsonb_build_object(
        'id', p.id,
        'business_id', p.business_id,
        'employee_id', p.employee_id,
        'full_name', p.full_name,
        'email', p.email,
        'phone', p.phone,
        'role', p.role,
        'primary_branch_id', p.primary_branch_id,
        'is_active', p.is_active,
        'permissions', p.permissions,
        'created_at', p.created_at
    )
    INTO v_result
    FROM public.profiles p
    WHERE p.id = v_user_id;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_employee(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_create_employee(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 014_fix_admin_create_employee.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ====================================================================
-- PHARMADESK — MIGRATION 014: FIX SEARCH_PATH AND EXTENSIONS FOR ADMIN_CREATE_EMPLOYEE
-- Explicitly scopes extensions.crypt and extensions.gen_salt
-- Corrects branch_memberships column schema (profile_id, branch_id, is_active)
-- ====================================================================

CREATE OR REPLACE FUNCTION public.admin_create_employee(
    p_full_name TEXT,
    p_employee_id TEXT,
    p_email TEXT,
    p_password TEXT,
    p_role TEXT,
    p_branch_id UUID,
    p_phone TEXT DEFAULT NULL,
    p_permissions JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_clean_emp_id TEXT;
    v_clean_email TEXT;
    v_target_role public.app_role;
    v_user_id UUID;
    v_business_id UUID;
    v_result JSONB;
BEGIN
    -- 1. Authorization: Only master_admin can create staff accounts
    IF public.get_current_user_role() <> 'master_admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only master_admin can create staff accounts.';
    END IF;

    -- 2. Clean and validate inputs
    v_clean_emp_id := lower(trim(p_employee_id));
    v_clean_email := lower(trim(p_email));

    IF v_clean_emp_id = '' OR v_clean_email = '' OR trim(p_full_name) = '' THEN
        RAISE EXCEPTION 'Full name, employee ID, and email are required.';
    END IF;

    IF length(p_password) < 6 THEN
        RAISE EXCEPTION 'Password must be at least 6 characters.';
    END IF;

    -- Validate role enum
    BEGIN
        v_target_role := p_role::public.app_role;
    EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Invalid role specified: %', p_role;
    END;

    -- 3. Determine business_id from branch or fallback to first business
    SELECT business_id INTO v_business_id FROM public.branches WHERE id = p_branch_id LIMIT 1;
    IF v_business_id IS NULL THEN
        SELECT id INTO v_business_id FROM public.businesses ORDER BY created_at ASC LIMIT 1;
    END IF;
    IF v_business_id IS NULL THEN
        v_business_id := 'b0000000-0000-0000-0000-000000000001'::uuid;
    END IF;

    -- 4. Check if auth user already exists in auth.users
    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_clean_email LIMIT 1;

    -- Check for Employee ID collision in public.profiles (different user)
    IF EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE lower(employee_id) = v_clean_emp_id 
          AND (v_user_id IS NULL OR id <> v_user_id)
    ) THEN
        RAISE EXCEPTION 'Employee ID "%" is already assigned to an existing staff member.', p_employee_id;
    END IF;

    IF v_user_id IS NOT NULL THEN
        -- Existing auth user: update password and ensure email is confirmed
        UPDATE auth.users
        SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
            email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
            raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
            raw_user_meta_data = jsonb_build_object(
                'full_name', trim(p_full_name),
                'employee_id', v_clean_emp_id,
                'role', v_target_role::text
            ),
            updated_at = NOW()
        WHERE id = v_user_id;
    ELSE
        -- Create new user in auth.users
        v_user_id := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            is_super_admin,
            created_at,
            updated_at
        ) VALUES (
            '00000000-0000-0000-0000-000000000000'::uuid,
            v_user_id,
            'authenticated',
            'authenticated',
            v_clean_email,
            extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
            NOW(),
            jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
            jsonb_build_object(
                'full_name', trim(p_full_name),
                'employee_id', v_clean_emp_id,
                'role', v_target_role::text
            ),
            false,
            NOW(),
            NOW()
        );
    END IF;

    -- 5. Insert or update public.profiles
    INSERT INTO public.profiles (
        id,
        business_id,
        employee_id,
        full_name,
        email,
        phone,
        role,
        primary_branch_id,
        is_active,
        permissions
    ) VALUES (
        v_user_id,
        v_business_id,
        v_clean_emp_id,
        trim(p_full_name),
        v_clean_email,
        NULLIF(trim(p_phone), ''),
        v_target_role,
        p_branch_id,
        TRUE,
        COALESCE(p_permissions, '{}'::jsonb)
    )
    ON CONFLICT (id) DO UPDATE SET
        business_id = EXCLUDED.business_id,
        employee_id = EXCLUDED.employee_id,
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        role = EXCLUDED.role,
        primary_branch_id = EXCLUDED.primary_branch_id,
        is_active = EXCLUDED.is_active,
        permissions = EXCLUDED.permissions,
        updated_at = NOW();

    -- 6. Add to branch_memberships
    IF p_branch_id IS NOT NULL THEN
        INSERT INTO public.branch_memberships (branch_id, profile_id, is_active)
        VALUES (p_branch_id, v_user_id, TRUE)
        ON CONFLICT (profile_id, branch_id) DO UPDATE SET is_active = TRUE;
    END IF;

    -- 7. Return complete profile JSON
    SELECT jsonb_build_object(
        'id', p.id,
        'business_id', p.business_id,
        'employee_id', p.employee_id,
        'full_name', p.full_name,
        'email', p.email,
        'phone', p.phone,
        'role', p.role,
        'primary_branch_id', p.primary_branch_id,
        'is_active', p.is_active,
        'permissions', p.permissions,
        'created_at', p.created_at
    )
    INTO v_result
    FROM public.profiles p
    WHERE p.id = v_user_id;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_employee(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_create_employee(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 015_fix_branch_memberships_admin_create.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ====================================================================
-- PHARMADESK — MIGRATION 015: FIX BRANCH_MEMBERSHIPS IN ADMIN_CREATE_EMPLOYEE
-- Uses correct branch_memberships columns: (profile_id, branch_id, is_active)
-- ====================================================================

CREATE OR REPLACE FUNCTION public.admin_create_employee(
    p_full_name TEXT,
    p_employee_id TEXT,
    p_email TEXT,
    p_password TEXT,
    p_role TEXT,
    p_branch_id UUID,
    p_phone TEXT DEFAULT NULL,
    p_permissions JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_clean_emp_id TEXT;
    v_clean_email TEXT;
    v_target_role public.app_role;
    v_user_id UUID;
    v_business_id UUID;
    v_result JSONB;
BEGIN
    -- 1. Authorization: Only master_admin can create staff accounts
    IF public.get_current_user_role() <> 'master_admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only master_admin can create staff accounts.';
    END IF;

    -- 2. Clean and validate inputs
    v_clean_emp_id := lower(trim(p_employee_id));
    v_clean_email := lower(trim(p_email));

    IF v_clean_emp_id = '' OR v_clean_email = '' OR trim(p_full_name) = '' THEN
        RAISE EXCEPTION 'Full name, employee ID, and email are required.';
    END IF;

    IF length(p_password) < 6 THEN
        RAISE EXCEPTION 'Password must be at least 6 characters.';
    END IF;

    -- Validate role enum
    BEGIN
        v_target_role := p_role::public.app_role;
    EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Invalid role specified: %', p_role;
    END;

    -- 3. Determine business_id from branch or fallback to first business
    SELECT business_id INTO v_business_id FROM public.branches WHERE id = p_branch_id LIMIT 1;
    IF v_business_id IS NULL THEN
        SELECT id INTO v_business_id FROM public.businesses ORDER BY created_at ASC LIMIT 1;
    END IF;
    IF v_business_id IS NULL THEN
        v_business_id := 'b0000000-0000-0000-0000-000000000001'::uuid;
    END IF;

    -- 4. Check if auth user already exists in auth.users
    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_clean_email LIMIT 1;

    -- Check for Employee ID collision in public.profiles (different user)
    IF EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE lower(employee_id) = v_clean_emp_id 
          AND (v_user_id IS NULL OR id <> v_user_id)
    ) THEN
        RAISE EXCEPTION 'Employee ID "%" is already assigned to an existing staff member.', p_employee_id;
    END IF;

    IF v_user_id IS NOT NULL THEN
        -- Existing auth user: update password and ensure email is confirmed
        UPDATE auth.users
        SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
            email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
            raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
            raw_user_meta_data = jsonb_build_object(
                'full_name', trim(p_full_name),
                'employee_id', v_clean_emp_id,
                'role', v_target_role::text
            ),
            updated_at = NOW()
        WHERE id = v_user_id;
    ELSE
        -- Create new user in auth.users
        v_user_id := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            is_super_admin,
            created_at,
            updated_at
        ) VALUES (
            '00000000-0000-0000-0000-000000000000'::uuid,
            v_user_id,
            'authenticated',
            'authenticated',
            v_clean_email,
            extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
            NOW(),
            jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
            jsonb_build_object(
                'full_name', trim(p_full_name),
                'employee_id', v_clean_emp_id,
                'role', v_target_role::text
            ),
            false,
            NOW(),
            NOW()
        );
    END IF;

    -- 5. Insert or update public.profiles
    INSERT INTO public.profiles (
        id,
        business_id,
        employee_id,
        full_name,
        email,
        phone,
        role,
        primary_branch_id,
        is_active,
        permissions
    ) VALUES (
        v_user_id,
        v_business_id,
        v_clean_emp_id,
        trim(p_full_name),
        v_clean_email,
        NULLIF(trim(p_phone), ''),
        v_target_role,
        p_branch_id,
        TRUE,
        COALESCE(p_permissions, '{}'::jsonb)
    )
    ON CONFLICT (id) DO UPDATE SET
        business_id = EXCLUDED.business_id,
        employee_id = EXCLUDED.employee_id,
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        role = EXCLUDED.role,
        primary_branch_id = EXCLUDED.primary_branch_id,
        is_active = EXCLUDED.is_active,
        permissions = EXCLUDED.permissions,
        updated_at = NOW();

    -- 6. Add to branch_memberships
    IF p_branch_id IS NOT NULL THEN
        INSERT INTO public.branch_memberships (branch_id, profile_id, is_active)
        VALUES (p_branch_id, v_user_id, TRUE)
        ON CONFLICT (profile_id, branch_id) DO UPDATE SET is_active = TRUE;
    END IF;

    -- 7. Return complete profile JSON
    SELECT jsonb_build_object(
        'id', p.id,
        'business_id', p.business_id,
        'employee_id', p.employee_id,
        'full_name', p.full_name,
        'email', p.email,
        'phone', p.phone,
        'role', p.role,
        'primary_branch_id', p.primary_branch_id,
        'is_active', p.is_active,
        'permissions', p.permissions,
        'created_at', p.created_at
    )
    INTO v_result
    FROM public.profiles p
    WHERE p.id = v_user_id;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_employee(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_create_employee(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 016_admin_password_reset.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ====================================================================
-- PHARMADESK — MIGRATION 016: MASTER ADMIN PASSWORD RESET FOR STAFF
-- Allows master_admin to reset any staff member's password directly from the UI
-- ====================================================================

CREATE OR REPLACE FUNCTION public.admin_reset_employee_password(
    p_profile_id UUID,
    p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_clean_email TEXT;
    v_emp_id TEXT;
BEGIN
    -- 1. Authorization: Only master_admin can reset staff passwords
    IF public.get_current_user_role() <> 'master_admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only master_admin can reset staff passwords.';
    END IF;

    IF length(p_new_password) < 6 THEN
        RAISE EXCEPTION 'Password must be at least 6 characters.';
    END IF;

    -- 2. Fetch employee details
    SELECT email, employee_id INTO v_clean_email, v_emp_id 
    FROM public.profiles 
    WHERE id = p_profile_id;

    IF v_clean_email IS NULL THEN
        RAISE EXCEPTION 'Staff member not found.';
    END IF;

    -- 3. Update auth.users password
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        updated_at = NOW()
    WHERE id = p_profile_id;

    RETURN jsonb_build_object(
        'success', true,
        'employee_id', v_emp_id,
        'message', 'Password reset successfully'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_employee_password(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_reset_employee_password(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 017_customer_age_address_optional_phone.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 018_fix_create_invoice_atomic_record_assignment.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ====================================================================
-- PHARMADESK — MIGRATION 018: FIX CREATE_INVOICE_ATOMIC SCHEMA & RECORD ASSIGNMENT
-- 1. Fixes "record v_counter_rec is not assigned yet" by typing as counters%ROWTYPE
-- 2. Corrects medicine_master field: pieces_per_strip (not package_size)
-- 3. Corrects invoice_items columns: pieces_count, taxable_amount, gst_amount, etc.
-- 4. Uses payment_records table (not payments)
-- 5. Uses audit_logs details column (not new_values)
-- 6. Persists customer_age, customer_address, and optional customer_phone
-- ====================================================================

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
    v_branch_rec public.branches%ROWTYPE;
    v_counter_rec public.counters%ROWTYPE;
    v_customer_rec public.customers%ROWTYPE;
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
    v_pieces_remaining BIGINT;
    v_pieces_from_batch BIGINT;
    v_unit_price NUMERIC(12, 2);
    v_line_gross NUMERIC(12, 2);
    v_line_net NUMERIC(12, 2);
    v_taxable NUMERIC(12, 2);
    v_item_gst NUMERIC(12, 2);
    v_cgst NUMERIC(12, 2);
    v_sgst NUMERIC(12, 2);
    v_igst NUMERIC(12, 2);
    v_today_month INT;
    v_today_year INT;
    v_fy_start_year INT;
    v_fy_end_year INT;
    v_clean_phone VARCHAR;
    v_clean_addr TEXT;
    v_split RECORD;
    v_split_method VARCHAR;
    v_split_ref VARCHAR;
BEGIN
    -- 1. Authentication and Authorization Guard
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT role, primary_branch_id INTO v_user_role, v_user_branch
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'User profile not found';
    END IF;

    -- Strict Branch Scoping: non-master admins can only bill for their primary branch
    IF v_user_role <> 'master_admin' AND v_user_branch <> p_branch_id THEN
        RAISE EXCEPTION 'Unauthorized: User cannot bill for branch %', p_branch_id;
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
    v_fy_str := RIGHT(v_fy_start_year::TEXT, 2) || RIGHT(v_fy_end_year::TEXT, 2);

    -- 5. Generate Gap-Free Sequence with Counter Row Lock (safe against NULL counter)
    IF p_counter_id IS NOT NULL THEN
        SELECT * INTO v_counter_rec FROM public.counters WHERE id = p_counter_id AND branch_id = p_branch_id AND is_active = TRUE FOR UPDATE;
        IF FOUND THEN
            v_next_seq := v_counter_rec.current_sequence;
            v_invoice_num := v_branch_rec.invoice_prefix || '-' || v_counter_rec.counter_code || '-' || v_fy_str || '-' || LPAD(v_next_seq::TEXT, 6, '0');
            UPDATE public.counters SET current_sequence = current_sequence + 1, updated_at = NOW() WHERE id = v_counter_rec.id;
        ELSE
            v_next_seq := v_branch_rec.invoice_sequence;
            v_invoice_num := v_branch_rec.invoice_prefix || '-C1-' || v_fy_str || '-' || LPAD(v_next_seq::TEXT, 6, '0');
            UPDATE public.branches SET invoice_sequence = invoice_sequence + 1, updated_at = NOW() WHERE id = p_branch_id;
        END IF;
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

    -- 8. Process Line Items (FEFO Inventory Deduction & Math Calculation)
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        medicine_id UUID,
        selected_unit VARCHAR,
        unit_quantity INT,
        batch_id UUID,
        discount_amount NUMERIC
    )
    LOOP
        SELECT * INTO v_med FROM public.medicine_master WHERE id = v_item.medicine_id AND is_active = TRUE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Medicine % not found or inactive in master catalog', v_item.medicine_id;
        END IF;

        IF v_item.selected_unit = 'strip' THEN
            v_pieces_needed := ROUND(v_item.unit_quantity * COALESCE(v_med.pieces_per_strip, 1));
            v_unit_price := COALESCE(v_med.strip_selling_price, v_med.mrp, 0);
        ELSIF v_item.selected_unit = 'piece' THEN
            v_pieces_needed := ROUND(v_item.unit_quantity);
            v_unit_price := COALESCE(v_med.piece_selling_price, ROUND(v_med.mrp / GREATEST(v_med.pieces_per_strip, 1), 2), 0);
        ELSE
            RAISE EXCEPTION 'Invalid unit %: must be strip or piece', v_item.selected_unit;
        END IF;

        IF v_pieces_needed <= 0 THEN
            RAISE EXCEPTION 'Quantity must be greater than zero for %', v_med.brand_name;
        END IF;

        v_line_gross := ROUND(v_unit_price * v_item.unit_quantity, 2);
        v_line_net := GREATEST(0.00, v_line_gross - COALESCE(v_item.discount_amount, 0.00));

        -- GST Calculation (Inclusive Retail MRP)
        IF COALESCE(v_med.gst_rate, 0) > 0 THEN
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
                COALESCE(v_med.gst_rate, 12.0),
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
                    COALESCE(v_clean_addr, p_notes, 'Retail Walk-in'),
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
                    v_item.unit_quantity,
                    v_pieces_from_batch,
                    v_unit_price,
                    COALESCE(v_med.gst_rate, 12.0),
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
                    'POS Bill Sale (FEFO Auto)',
                    v_user_id
                );

                v_pieces_remaining := v_pieces_remaining - v_pieces_from_batch;
            END LOOP;

            IF v_pieces_remaining > 0 THEN
                RAISE EXCEPTION 'Insufficient stock for % across all batches (Shortfall: % pieces)',
                    v_med.brand_name, v_pieces_remaining;
            END IF;
        END IF;
    END LOOP;

    -- 9. Apply Bill Discount
    IF p_bill_discount > 0.00 THEN
        v_raw_total := GREATEST(0.00, v_raw_total - p_bill_discount);
    END IF;

    -- 10. Indian Commercial Round-off (50 paise rule)
    v_grand_total := ROUND(v_raw_total);
    v_round_off := v_grand_total - v_raw_total;

    -- Update Final Invoice Amounts
    UPDATE public.invoices
    SET subtotal_taxable = v_subtotal_taxable,
        cgst_amount = v_total_cgst,
        sgst_amount = v_total_sgst,
        igst_amount = v_total_igst,
        total_gst = v_total_gst,
        discount_amount = p_bill_discount,
        round_off = v_round_off,
        total_amount = v_grand_total,
        updated_at = NOW()
    WHERE id = v_invoice_id;

    -- 10b. Synchronize Customer Age & Address to customers profile if customer_id exists
    IF p_customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET age = COALESCE(p_customer_age, age),
            address = COALESCE(v_clean_addr, address),
            phone = COALESCE(v_clean_phone, phone),
            updated_at = NOW()
        WHERE id = p_customer_id;
    END IF;

    -- 11. Payment Processing (public.payment_records)
    IF p_payment_method = 'split' THEN
        FOR v_split IN SELECT * FROM jsonb_to_recordset(p_payment_splits) AS s(
            method VARCHAR,
            payment_method VARCHAR,
            amount NUMERIC,
            reference VARCHAR,
            reference_number VARCHAR
        )
        LOOP
            v_split_method := COALESCE(v_split.payment_method, v_split.method, 'cash');
            v_split_ref := COALESCE(v_split.reference_number, v_split.reference, '');

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
                v_split_method,
                v_split.amount,
                v_split_ref,
                'success',
                v_user_id
            );

            IF v_split_method = 'credit' THEN
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
            'invoice_number', v_invoice_num,
            'grand_total', v_grand_total,
            'customer_name', p_customer_name,
            'customer_phone', v_clean_phone,
            'customer_age', p_customer_age,
            'customer_address', v_clean_addr,
            'payment_method', p_payment_method
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_num,
        'grand_total', v_grand_total,
        'subtotal_taxable', v_subtotal_taxable,
        'total_gst', v_total_gst,
        'round_off', v_round_off
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_atomic(
    UUID, UUID, VARCHAR, VARCHAR, UUID, VARCHAR, VARCHAR, UUID, VARCHAR, VARCHAR, VARCHAR, JSONB, JSONB, NUMERIC, TEXT, VARCHAR, VARCHAR, INT, TEXT
) FROM public;

GRANT EXECUTE ON FUNCTION public.create_invoice_atomic(
    UUID, UUID, VARCHAR, VARCHAR, UUID, VARCHAR, VARCHAR, UUID, VARCHAR, VARCHAR, VARCHAR, JSONB, JSONB, NUMERIC, TEXT, VARCHAR, VARCHAR, INT, TEXT
) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 019_remove_demo_data.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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
