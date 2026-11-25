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
