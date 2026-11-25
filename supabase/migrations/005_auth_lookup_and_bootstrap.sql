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
