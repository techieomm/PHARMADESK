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
