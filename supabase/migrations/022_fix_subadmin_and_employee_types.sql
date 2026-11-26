-- ====================================================================
-- BAJRANG PHARMACY — MIGRATION 022:
-- 1. Fix Sub-Admin / Employee creation & login (auth.users tokens + auth.identities + search_path crypt)
-- 2. Add structured employee_type ('admin' | 'parchi_billing' | 'medicine_billing') on public.profiles
-- 3. Enforce strict backend permission checks in RPCs and RLS policies
-- 4. Preserve all existing Admin and employee records safely
-- ====================================================================

-- 1. ADD STRUCTURED employee_type COLUMN TO public.profiles
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS employee_type VARCHAR(30);

-- Safely backfill existing records without breaking any existing Admin or staff account
UPDATE public.profiles
SET employee_type = CASE
    WHEN role::text IN ('master_admin', 'branch_manager', 'inventory_manager') THEN 'admin'
    WHEN role::text = 'prescription_employee' THEN 'parchi_billing'
    WHEN role::text = 'sub_admin'
         AND COALESCE((permissions->>'access_prescription_billing')::boolean, FALSE) = TRUE
         AND COALESCE((permissions->>'access_billing')::boolean, FALSE) = FALSE
        THEN 'parchi_billing'
    ELSE 'medicine_billing'
END
WHERE employee_type IS NULL;

ALTER TABLE public.profiles
    ALTER COLUMN employee_type SET DEFAULT 'medicine_billing';

ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_employee_type_check;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_employee_type_check
    CHECK (employee_type IN ('admin', 'parchi_billing', 'medicine_billing'));

CREATE INDEX IF NOT EXISTS idx_profiles_employee_type ON public.profiles(employee_type);

-- 2. HEAL ANY EXISTING auth.users / auth.identities CREATED BY PREVIOUS admin_create_employee
-- Ensures non-NULL token columns (prevents GoTrue scan errors) and ensures email identity row exists
UPDATE auth.users
SET confirmation_token = COALESCE(confirmation_token, ''),
    recovery_token = COALESCE(recovery_token, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    email_change = COALESCE(email_change, ''),
    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    raw_app_meta_data = COALESCE(raw_app_meta_data, jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')))
WHERE id IN (SELECT id FROM public.profiles);

INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
)
SELECT
    gen_random_uuid(),
    u.id,
    u.id::text,
    jsonb_build_object(
        'sub', u.id::text,
        'email', u.email,
        'email_verified', true,
        'phone_verified', false
    ),
    'email',
    NOW(),
    NOW(),
    NOW()
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
WHERE NOT EXISTS (
    SELECT 1 FROM auth.identities i
    WHERE i.user_id = u.id AND i.provider = 'email'
);

-- 3. HELPER FUNCTION FOR STRUCTURED PERMISSION CHECKS IN RLS
CREATE OR REPLACE FUNCTION public.current_user_has_permission(p_perm TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_prof public.profiles%ROWTYPE;
BEGIN
    SELECT * INTO v_prof FROM public.profiles WHERE id = auth.uid();
    IF NOT FOUND OR NOT v_prof.is_active THEN
        RETURN FALSE;
    END IF;

    IF v_prof.role::text = 'master_admin' THEN
        RETURN TRUE;
    END IF;

    -- Explicit permission boolean on JSONB overrides defaults
    IF v_prof.permissions ? p_perm THEN
        RETURN COALESCE((v_prof.permissions->>p_perm)::boolean, FALSE);
    END IF;

    -- Role / employee_type defaults
    IF v_prof.role::text = 'branch_manager' THEN
        RETURN p_perm IN (
            'view_branch_dashboard', 'manage_inventory', 'view_invoices', 'access_billing',
            'access_prescription_billing', 'view_prescription_history', 'manage_doctors', 'view_branch_reports'
        );
    ELSIF v_prof.role::text = 'inventory_manager' THEN
        RETURN p_perm IN ('manage_medicines', 'manage_inventory');
    ELSIF v_prof.employee_type = 'parchi_billing' OR v_prof.role::text = 'prescription_employee' THEN
        RETURN p_perm IN ('access_prescription_billing', 'view_prescription_history');
    ELSIF v_prof.employee_type = 'medicine_billing' OR v_prof.role::text = 'billing_employee' THEN
        RETURN p_perm IN ('access_billing', 'view_invoices');
    END IF;

    RETURN FALSE;
END;
$$;

-- 4. REPLACE admin_create_employee WITH FIXED AUTH + IDENTITY + TWO EMPLOYEE TYPES
DROP FUNCTION IF EXISTS public.admin_create_employee(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.admin_create_employee(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB, TEXT);

CREATE OR REPLACE FUNCTION public.admin_create_employee(
    p_full_name TEXT,
    p_employee_id TEXT,
    p_email TEXT DEFAULT NULL,
    p_password TEXT DEFAULT NULL,
    p_role TEXT DEFAULT 'sub_admin',
    p_branch_id UUID DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_permissions JSONB DEFAULT '{}'::jsonb,
    p_employee_type TEXT DEFAULT NULL
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
    v_emp_type TEXT;
    v_final_perms JSONB;
    v_user_id UUID;
    v_branch_id UUID;
    v_business_id UUID;
    v_result JSONB;
BEGIN
    -- 1. Authorization: Only active master_admin can create staff / sub-admin accounts
    IF public.get_current_user_role()::text <> 'master_admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only Master Admin can create Sub-Admin or staff accounts.';
    END IF;

    -- 2. Clean and validate inputs
    v_clean_emp_id := lower(trim(COALESCE(p_employee_id, '')));
    IF v_clean_emp_id = '' OR trim(COALESCE(p_full_name, '')) = '' THEN
        RAISE EXCEPTION 'Full name and Login ID (Employee ID) are required.';
    END IF;

    IF v_clean_emp_id ~ '\s' THEN
        RAISE EXCEPTION 'Login ID cannot contain spaces.';
    END IF;

    v_clean_email := lower(trim(COALESCE(p_email, '')));
    IF v_clean_email = '' THEN
        v_clean_email := regexp_replace(v_clean_emp_id, '[^a-z0-9._-]', '', 'g') || '@staff.bajrangpharmacy.local';
    END IF;

    IF p_password IS NULL OR length(p_password) < 6 THEN
        RAISE EXCEPTION 'Password must be at least 6 characters.';
    END IF;

    -- 3. Validate role enum
    BEGIN
        v_target_role := COALESCE(NULLIF(trim(p_role), ''), 'sub_admin')::public.app_role;
    EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Invalid role specified: %', p_role;
    END;

    -- 4. Validate and resolve structured employee_type ('admin' | 'parchi_billing' | 'medicine_billing')
    IF p_employee_type IS NOT NULL AND trim(p_employee_type) <> '' THEN
        v_emp_type := lower(trim(p_employee_type));
        IF v_emp_type NOT IN ('admin', 'parchi_billing', 'medicine_billing') THEN
            RAISE EXCEPTION 'Invalid employee type "%". Must be admin, parchi_billing, or medicine_billing.', p_employee_type;
        END IF;
    ELSE
        IF v_target_role::text IN ('master_admin', 'branch_manager', 'inventory_manager') THEN
            v_emp_type := 'admin';
        ELSIF v_target_role::text = 'prescription_employee'
              OR COALESCE((p_permissions->>'access_prescription_billing')::boolean, FALSE) = TRUE THEN
            v_emp_type := 'parchi_billing';
        ELSE
            v_emp_type := 'medicine_billing';
        END IF;
    END IF;

    -- Require explicit parchi_billing or medicine_billing for sub_admin accounts
    IF v_target_role::text = 'sub_admin' AND v_emp_type NOT IN ('parchi_billing', 'medicine_billing') THEN
        RAISE EXCEPTION 'Sub-Admin must be assigned either parchi_billing or medicine_billing employee type.';
    END IF;

    -- Enforce clean, strictly separated permission defaults on backend
    IF v_emp_type = 'parchi_billing' THEN
        v_final_perms := jsonb_build_object(
            'access_prescription_billing', TRUE,
            'view_prescription_history', TRUE,
            'access_billing', FALSE,
            'view_invoices', FALSE,
            'manage_inventory', FALSE,
            'manage_medicines', FALSE,
            'manage_doctors', FALSE,
            'view_branch_dashboard', FALSE,
            'view_branch_reports', FALSE,
            'manage_permitted_employees', FALSE
        );
    ELSIF v_emp_type = 'medicine_billing' THEN
        v_final_perms := jsonb_build_object(
            'access_billing', TRUE,
            'view_invoices', TRUE,
            'access_prescription_billing', FALSE,
            'view_prescription_history', FALSE,
            'manage_doctors', FALSE,
            'manage_inventory', COALESCE((p_permissions->>'manage_inventory')::boolean, FALSE),
            'manage_medicines', FALSE,
            'view_branch_dashboard', FALSE,
            'view_branch_reports', FALSE,
            'manage_permitted_employees', FALSE
        );
    ELSE
        v_final_perms := COALESCE(p_permissions, '{}'::jsonb);
    END IF;

    -- 5. Resolve branch_id & business_id safely (auto-fallback if p_branch_id is NULL)
    v_branch_id := p_branch_id;
    IF v_branch_id IS NULL THEN
        SELECT id INTO v_branch_id FROM public.branches WHERE is_active = TRUE ORDER BY created_at ASC LIMIT 1;
    END IF;

    SELECT business_id INTO v_business_id FROM public.branches WHERE id = v_branch_id LIMIT 1;
    IF v_business_id IS NULL THEN
        SELECT id INTO v_business_id FROM public.businesses ORDER BY created_at ASC LIMIT 1;
    END IF;
    IF v_business_id IS NULL THEN
        v_business_id := 'b0000000-0000-0000-0000-000000000001'::uuid;
    END IF;

    -- 6. Prevent duplicate employee_id or email across existing profiles
    IF EXISTS (
        SELECT 1 FROM public.profiles WHERE lower(employee_id) = v_clean_emp_id
    ) THEN
        RAISE EXCEPTION 'Login ID "%" is already assigned to an existing employee.', p_employee_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.profiles WHERE lower(email) = v_clean_email
    ) THEN
        RAISE EXCEPTION 'Email "%" is already registered to an existing employee.', v_clean_email;
    END IF;

    -- Check if an orphaned auth.users row exists for this email (no profile yet)
    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_clean_email LIMIT 1;

    IF v_user_id IS NOT NULL THEN
        UPDATE auth.users
        SET encrypted_password = crypt(p_password, gen_salt('bf', 10)),
            email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
            confirmation_token = COALESCE(confirmation_token, ''),
            recovery_token = COALESCE(recovery_token, ''),
            email_change_token_new = COALESCE(email_change_token_new, ''),
            email_change = COALESCE(email_change, ''),
            raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
            raw_user_meta_data = jsonb_build_object(
                'full_name', trim(p_full_name),
                'employee_id', v_clean_emp_id,
                'role', v_target_role::text,
                'employee_type', v_emp_type
            ),
            updated_at = NOW()
        WHERE id = v_user_id;
    ELSE
        v_user_id := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            confirmation_token,
            recovery_token,
            email_change_token_new,
            email_change,
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
            crypt(p_password, gen_salt('bf', 10)),
            NOW(),
            '',
            '',
            '',
            '',
            jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
            jsonb_build_object(
                'full_name', trim(p_full_name),
                'employee_id', v_clean_emp_id,
                'role', v_target_role::text,
                'employee_type', v_emp_type
            ),
            false,
            NOW(),
            NOW()
        );
    END IF;

    -- 7. Ensure auth.identities row exists (REQUIRED for Supabase GoTrue password login)
    IF NOT EXISTS (
        SELECT 1 FROM auth.identities
        WHERE user_id = v_user_id AND provider = 'email'
    ) THEN
        INSERT INTO auth.identities (
            id,
            user_id,
            provider_id,
            identity_data,
            provider,
            last_sign_in_at,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            v_user_id,
            v_user_id::text,
            jsonb_build_object(
                'sub', v_user_id::text,
                'email', v_clean_email,
                'email_verified', true,
                'phone_verified', false
            ),
            'email',
            NOW(),
            NOW(),
            NOW()
        );
    END IF;

    -- 8. Insert public.profiles record
    INSERT INTO public.profiles (
        id,
        business_id,
        employee_id,
        full_name,
        email,
        phone,
        role,
        employee_type,
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
        v_emp_type,
        v_branch_id,
        TRUE,
        v_final_perms
    );

    -- 9. Add branch membership
    IF v_branch_id IS NOT NULL THEN
        INSERT INTO public.branch_memberships (branch_id, profile_id, is_active)
        VALUES (v_branch_id, v_user_id, TRUE)
        ON CONFLICT (profile_id, branch_id) DO UPDATE SET is_active = TRUE;
    END IF;

    -- 10. Audit log
    INSERT INTO public.audit_logs (
        business_id,
        user_id,
        action,
        entity_type,
        entity_id,
        details
    ) VALUES (
        v_business_id,
        auth.uid(),
        'CREATE_EMPLOYEE',
        'PROFILE',
        v_clean_emp_id,
        jsonb_build_object(
            'employee_id', v_clean_emp_id,
            'full_name', trim(p_full_name),
            'role', v_target_role::text,
            'employee_type', v_emp_type,
            'branch_id', v_branch_id
        )
    );

    SELECT jsonb_build_object(
        'id', p.id,
        'business_id', p.business_id,
        'employee_id', p.employee_id,
        'full_name', p.full_name,
        'email', p.email,
        'phone', p.phone,
        'role', p.role,
        'employee_type', p.employee_type,
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

REVOKE ALL ON FUNCTION public.admin_create_employee(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_create_employee(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB, TEXT) TO authenticated;

-- 5. FIX admin_reset_employee_password (portable crypt + token healing + identity check)
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
    IF public.get_current_user_role()::text <> 'master_admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only Master Admin can reset staff passwords.';
    END IF;

    IF p_new_password IS NULL OR length(p_new_password) < 6 THEN
        RAISE EXCEPTION 'Password must be at least 6 characters.';
    END IF;

    SELECT email, employee_id INTO v_clean_email, v_emp_id
    FROM public.profiles
    WHERE id = p_profile_id;

    IF v_clean_email IS NULL THEN
        RAISE EXCEPTION 'Staff member not found.';
    END IF;

    UPDATE auth.users
    SET encrypted_password = crypt(p_new_password, gen_salt('bf', 10)),
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        confirmation_token = COALESCE(confirmation_token, ''),
        recovery_token = COALESCE(recovery_token, ''),
        email_change_token_new = COALESCE(email_change_token_new, ''),
        email_change = COALESCE(email_change, ''),
        updated_at = NOW()
    WHERE id = p_profile_id;

    IF NOT EXISTS (
        SELECT 1 FROM auth.identities WHERE user_id = p_profile_id AND provider = 'email'
    ) THEN
        INSERT INTO auth.identities (
            id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
        ) VALUES (
            gen_random_uuid(),
            p_profile_id,
            p_profile_id::text,
            jsonb_build_object('sub', p_profile_id::text, 'email', v_clean_email, 'email_verified', true, 'phone_verified', false),
            'email',
            NOW(),
            NOW(),
            NOW()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'employee_id', v_emp_id,
        'message', 'Password reset successfully'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_employee_password(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_reset_employee_password(UUID, TEXT) TO authenticated;

-- 6. ENFORCE PERMISSIONS IN guard_profile_updates() (protect employee_type too)
CREATE OR REPLACE FUNCTION public.guard_profile_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF public.get_current_user_role()::text IS DISTINCT FROM 'master_admin' THEN
        IF NEW.role IS DISTINCT FROM OLD.role THEN
            RAISE EXCEPTION 'Only master_admin can change user role';
        END IF;
        IF NEW.employee_type IS DISTINCT FROM OLD.employee_type THEN
            RAISE EXCEPTION 'Only master_admin can change employee type';
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

-- 7. ENFORCE STRICT DATABASE-LEVEL RLS POLICIES FOR THE TWO SUB-ADMIN TYPES

-- Profiles: Only master_admin (or self) can read profiles; sub_admins cannot enumerate other staff
DROP POLICY IF EXISTS "Profiles read policy" ON public.profiles;
CREATE POLICY "Profiles read policy" ON public.profiles
    FOR SELECT TO authenticated
    USING (
        auth.uid() = id OR
        public.get_current_user_role()::text = 'master_admin'
    );

-- Invoices: Parchi employees cannot read or insert regular medicine invoices
DROP POLICY IF EXISTS "Invoices read" ON public.invoices;
CREATE POLICY "Invoices read" ON public.invoices
    FOR SELECT TO authenticated
    USING (
        public.get_current_user_role()::text = 'master_admin'
        OR (
            branch_id = public.get_current_user_branch()
            AND public.current_user_has_permission('view_invoices')
        )
    );

DROP POLICY IF EXISTS "Invoices create" ON public.invoices;
CREATE POLICY "Invoices create" ON public.invoices
    FOR INSERT TO authenticated
    WITH CHECK (
        public.get_current_user_role()::text = 'master_admin'
        OR (
            branch_id = public.get_current_user_branch()
            AND public.current_user_has_permission('access_billing')
        )
    );

-- Prescription slips: Medicine billing employees cannot read or insert consultation slips unless explicitly permitted
DROP POLICY IF EXISTS "Prescription slips read" ON public.prescription_slips;
CREATE POLICY "Prescription slips read" ON public.prescription_slips
    FOR SELECT TO authenticated
    USING (
        public.get_current_user_role()::text = 'master_admin'
        OR (
            branch_id = public.get_current_user_branch()
            AND (
                public.current_user_has_permission('view_prescription_history')
                OR public.current_user_has_permission('access_prescription_billing')
            )
        )
    );

DROP POLICY IF EXISTS "Prescription slips insert" ON public.prescription_slips;
CREATE POLICY "Prescription slips insert" ON public.prescription_slips
    FOR INSERT TO authenticated
    WITH CHECK (
        public.get_current_user_role()::text = 'master_admin'
        OR (
            branch_id = public.get_current_user_branch()
            AND public.current_user_has_permission('access_prescription_billing')
        )
    );

-- Doctors: Only Master Admin or explicitly permitted managers can modify doctors (Sub-Admin employees cannot)
DROP POLICY IF EXISTS "Doctors manage" ON public.doctors;
CREATE POLICY "Doctors manage" ON public.doctors
    FOR ALL TO authenticated
    USING (
        public.get_current_user_role()::text = 'master_admin'
        OR public.current_user_has_permission('manage_doctors')
    )
    WITH CHECK (
        public.get_current_user_role()::text = 'master_admin'
        OR public.current_user_has_permission('manage_doctors')
    );

-- Inventory batches & Medicine Master: Restrict write access strictly to Master Admin / Inventory Manager / explicitly permitted staff
DROP POLICY IF EXISTS "Inventory batches manage" ON public.inventory_batches;
CREATE POLICY "Inventory batches manage" ON public.inventory_batches
    FOR ALL TO authenticated
    USING (
        public.get_current_user_role()::text = 'master_admin'
        OR public.current_user_has_permission('manage_inventory')
    )
    WITH CHECK (
        public.get_current_user_role()::text = 'master_admin'
        OR public.current_user_has_permission('manage_inventory')
    );

DROP POLICY IF EXISTS "Medicine catalog edit" ON public.medicine_master;
CREATE POLICY "Medicine catalog edit" ON public.medicine_master
    FOR ALL TO authenticated
    USING (
        public.get_current_user_role()::text = 'master_admin'
        OR public.current_user_has_permission('manage_medicines')
    )
    WITH CHECK (
        public.get_current_user_role()::text = 'master_admin'
        OR public.current_user_has_permission('manage_medicines')
    );

-- 8. ENFORCE PERMISSIONS INSIDE adjust_stock_atomic & create_invoice_atomic & create_prescription_slip_atomic
CREATE OR REPLACE FUNCTION public.adjust_stock_atomic(
    p_branch_id UUID,
    p_medicine_id UUID,
    p_adjustment_type VARCHAR,
    p_unit VARCHAR,
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

    IF NOT public.current_user_has_permission('manage_inventory') THEN
        RAISE EXCEPTION 'Forbidden: Insufficient privileges for inventory stock modification';
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
            branch_id, medicine_id, batch_number, expiry_date, stock_pieces, mrp, purchase_rate, is_active
        ) VALUES (
            p_branch_id, p_medicine_id, v_target_batch, v_target_expiry, v_pieces_delta, COALESCE(v_med.mrp, 0), v_med.purchase_cost, TRUE
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
            WHERE branch_id = p_branch_id AND medicine_id = p_medicine_id AND batch_number = v_target_batch AND is_active = TRUE AND deleted_at IS NULL;

            IF NOT FOUND OR v_batch.stock_pieces < v_pieces_delta THEN
                RAISE EXCEPTION 'Insufficient stock in batch % (Available: % pieces)', v_target_batch, COALESCE(v_batch.stock_pieces, 0);
            END IF;

            v_target_expiry := COALESCE(v_target_expiry, v_batch.expiry_date);
            UPDATE public.inventory_batches
            SET stock_pieces = stock_pieces - v_pieces_delta, version = version + 1, updated_at = NOW()
            WHERE id = v_batch.id;
        ELSE
            v_remaining := v_pieces_delta;
            FOR v_batch IN
                SELECT * FROM public.inventory_batches
                WHERE branch_id = p_branch_id AND medicine_id = p_medicine_id AND is_active = TRUE AND deleted_at IS NULL AND stock_pieces > 0
                ORDER BY expiry_date ASC, created_at ASC
            LOOP
                IF v_remaining <= 0 THEN EXIT; END IF;
                v_take := LEAST(v_batch.stock_pieces, v_remaining);
                v_target_batch := COALESCE(v_target_batch, v_batch.batch_number);
                v_target_expiry := COALESCE(v_target_expiry, v_batch.expiry_date);

                UPDATE public.inventory_batches
                SET stock_pieces = stock_pieces - v_take, version = version + 1, updated_at = NOW()
                WHERE id = v_batch.id;

                v_remaining := v_remaining - v_take;
            END LOOP;
        END IF;

    ELSIF p_adjustment_type = 'set' THEN
        IF v_target_batch IS NOT NULL THEN
            v_target_expiry := COALESCE(v_target_expiry, (CURRENT_DATE + INTERVAL '2 years')::DATE);
            INSERT INTO public.inventory_batches (
                branch_id, medicine_id, batch_number, expiry_date, stock_pieces, mrp, purchase_rate, is_active
            ) VALUES (
                p_branch_id, p_medicine_id, v_target_batch, v_target_expiry, v_pieces_delta, COALESCE(v_med.mrp, 0), v_med.purchase_cost, TRUE
            )
            ON CONFLICT (branch_id, medicine_id, batch_number) DO UPDATE
            SET stock_pieces = v_pieces_delta,
                expiry_date = COALESCE(p_expiry_date, public.inventory_batches.expiry_date),
                is_active = TRUE,
                deleted_at = NULL,
                version = public.inventory_batches.version + 1,
                updated_at = NOW();
        ELSE
            UPDATE public.inventory_batches
            SET stock_pieces = 0, version = version + 1, updated_at = NOW()
            WHERE branch_id = p_branch_id AND medicine_id = p_medicine_id AND is_active = TRUE AND deleted_at IS NULL;

            IF v_pieces_delta > 0 THEN
                SELECT * INTO v_batch
                FROM public.inventory_batches
                WHERE branch_id = p_branch_id AND medicine_id = p_medicine_id AND is_active = TRUE AND deleted_at IS NULL
                ORDER BY expiry_date DESC LIMIT 1;

                v_target_batch := COALESCE(v_batch.batch_number, 'DEFAULT-01');
                v_target_expiry := COALESCE(v_target_expiry, v_batch.expiry_date, (CURRENT_DATE + INTERVAL '2 years')::DATE);

                INSERT INTO public.inventory_batches (
                    branch_id, medicine_id, batch_number, expiry_date, stock_pieces, mrp, purchase_rate, is_active
                ) VALUES (
                    p_branch_id, p_medicine_id, v_target_batch, v_target_expiry, v_pieces_delta, COALESCE(v_med.mrp, 0), v_med.purchase_cost, TRUE
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

    SELECT COALESCE(SUM(stock_pieces), 0) INTO v_new_balance
    FROM public.inventory_batches
    WHERE branch_id = p_branch_id AND medicine_id = p_medicine_id AND is_active = TRUE AND deleted_at IS NULL;

    UPDATE public.branch_inventory
    SET last_restocked_at = CASE WHEN p_adjustment_type = 'add' THEN NOW() ELSE last_restocked_at END
    WHERE branch_id = p_branch_id AND medicine_id = p_medicine_id;

    INSERT INTO public.stock_movements (
        branch_id, medicine_id, movement_type, quantity_pieces, unit_used, unit_quantity,
        balance_after_pieces, batch_number, expiry_date, notes, performed_by
    ) VALUES (
        p_branch_id, p_medicine_id, 'adjustment_' || p_adjustment_type,
        CASE WHEN p_adjustment_type = 'subtract' THEN -v_pieces_delta ELSE v_pieces_delta END,
        p_unit, p_quantity, v_new_balance, v_target_batch, v_target_expiry, p_notes, v_user_id
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

-- Enforce billing permission inside create_prescription_slip_atomic using structured employee_type & permissions
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
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
    IF NOT FOUND OR NOT v_profile.is_active THEN
        RAISE EXCEPTION 'Active user profile not found';
    END IF;

    IF NOT public.current_user_has_permission('access_prescription_billing') THEN
        RAISE EXCEPTION 'Forbidden: You do not have permission to generate consultation slips';
    END IF;

    IF v_profile.role::text <> 'master_admin' AND v_profile.primary_branch_id <> p_branch_id THEN
        RAISE EXCEPTION 'Forbidden: User cannot generate slips for branch %', p_branch_id;
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

    INSERT INTO public.prescription_slips (
        business_id, branch_id, serial_seq, serial_number, prescription_seq, prescription_number,
        patient_name, patient_phone, patient_age, patient_gender, patient_address,
        doctor_id, doctor_name, doctor_qualification, doctor_registration_number,
        consultation_fee, payment_method, payment_status, notes, slip_date, created_by, created_by_name
    ) VALUES (
        v_branch.business_id, p_branch_id, v_serial_seq, v_serial_num, v_rx_seq, v_rx_num,
        TRIM(p_patient_name), NULLIF(TRIM(p_patient_phone), ''), p_patient_age, NULLIF(TRIM(p_patient_gender), ''), NULLIF(TRIM(p_patient_address), ''),
        v_doctor.id, v_doctor.full_name, v_doctor.qualification, v_doctor.registration_number,
        ROUND(p_consultation_fee, 2), p_payment_method, 'paid', NULLIF(TRIM(p_notes), ''), NOW(), v_user_id, v_profile.full_name
    ) RETURNING id INTO v_slip_id;

    INSERT INTO public.consultation_fee_records (
        business_id, branch_id, prescription_slip_id, doctor_id, employee_id,
        fee_amount, payment_method, status, collected_at
    ) VALUES (
        v_branch.business_id, p_branch_id, v_slip_id, v_doctor.id, v_user_id,
        ROUND(p_consultation_fee, 2), p_payment_method, 'collected', NOW()
    );

    INSERT INTO public.audit_logs (
        business_id, user_id, action, entity_type, entity_id, details
    ) VALUES (
        v_branch.business_id, v_user_id, 'CREATE_PRESCRIPTION_SLIP', 'PRESCRIPTION_SLIP', v_rx_num,
        jsonb_build_object(
            'slip_id', v_slip_id, 'serial_number', v_serial_num, 'prescription_number', v_rx_num,
            'patient_name', TRIM(p_patient_name), 'doctor_id', v_doctor.id, 'doctor_name', v_doctor.full_name,
            'consultation_fee', ROUND(p_consultation_fee, 2), 'payment_method', p_payment_method
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

-- Enforce medicine billing permission inside create_invoice_atomic (blocks parchi_billing employees at DB layer)
-- Uses a lightweight BEFORE INSERT trigger on public.invoices so create_invoice_atomic & direct inserts are both protected!
CREATE OR REPLACE FUNCTION public.enforce_invoice_billing_permission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NOT NULL THEN
        IF NOT public.current_user_has_permission('access_billing') THEN
            RAISE EXCEPTION 'Forbidden: You do not have permission to create medicine billing invoices';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_invoice_billing_permission ON public.invoices;
CREATE TRIGGER trg_enforce_invoice_billing_permission
    BEFORE INSERT ON public.invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_invoice_billing_permission();

NOTIFY pgrst, 'reload schema';
