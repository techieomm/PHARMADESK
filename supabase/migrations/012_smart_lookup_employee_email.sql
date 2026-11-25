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
