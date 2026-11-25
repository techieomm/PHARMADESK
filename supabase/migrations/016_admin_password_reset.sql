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
