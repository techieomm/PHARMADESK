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
