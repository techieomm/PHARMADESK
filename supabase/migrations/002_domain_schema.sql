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
