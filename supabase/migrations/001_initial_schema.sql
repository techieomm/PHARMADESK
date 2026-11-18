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
CREATE OR REPLACE FUNCTION public.lookup_employee_email(p_employee_id VARCHAR)
RETURNS TABLE (email VARCHAR, is_active BOOLEAN) AS $$
BEGIN
    RETURN QUERY
    SELECT p.email, p.is_active
    FROM public.profiles p
    WHERE UPPER(p.employee_id) = UPPER(p_employee_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
