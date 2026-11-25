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
