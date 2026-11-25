-- ====================================================================
-- PHARMADESK — MIGRATION 008: CASE-INSENSITIVE EMPLOYEE ID & RLS REINFORCEMENT
-- 1. Normalise existing employee_id values to lowercase
-- 2. Replace UNIQUE constraint with unique index on lower(employee_id)
-- 3. Case-insensitive lookup_employee_email RPC
-- 4. Re-enforce 006 RLS helpers, policies, and update guard trigger
-- ====================================================================

-- 1. Normalise all existing employee IDs to lowercase
UPDATE public.profiles
SET employee_id = lower(employee_id);

-- 2. Replace the UNIQUE constraint on employee_id with a functional unique index
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_employee_id_key;
DROP INDEX IF EXISTS idx_profiles_employee_id;
DROP INDEX IF EXISTS idx_profiles_employee_id_lower;

CREATE UNIQUE INDEX idx_profiles_employee_id_lower ON public.profiles (lower(employee_id));

-- 3. Recreate lookup_employee_email RPC with case-insensitive lower(...) matching
DROP FUNCTION IF EXISTS public.lookup_employee_email(varchar);
DROP FUNCTION IF EXISTS public.lookup_employee_email(text);

CREATE OR REPLACE FUNCTION public.lookup_employee_email(p_employee_id text)
RETURNS TABLE(email text, is_active boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT p.email::text, p.is_active
    FROM public.profiles p
    WHERE lower(p.employee_id) = lower(trim(p_employee_id))
    LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_employee_email(text) FROM public;
GRANT EXECUTE ON FUNCTION public.lookup_employee_email(text) TO anon, authenticated;

-- 4. Re-enforce 006 RLS helpers and policies (Idempotent: CREATE OR REPLACE / DROP IF EXISTS)
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS public.app_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role public.app_role;
BEGIN
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
    RETURN v_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_branch()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_branch UUID;
BEGIN
    SELECT primary_branch_id INTO v_branch FROM public.profiles WHERE id = auth.uid();
    RETURN v_branch;
END;
$$;

DROP POLICY IF EXISTS "Profiles read policy" ON public.profiles;
CREATE POLICY "Profiles read policy" ON public.profiles
    FOR SELECT TO authenticated
    USING (
        auth.uid() = id OR
        public.get_current_user_role() IN ('master_admin', 'sub_admin')
    );

DROP POLICY IF EXISTS "Master admin profiles update" ON public.profiles;
CREATE POLICY "Master admin profiles update" ON public.profiles
    FOR UPDATE TO authenticated
    USING (
        auth.uid() = id OR
        public.get_current_user_role() = 'master_admin'
    );

CREATE OR REPLACE FUNCTION public.guard_profile_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF public.get_current_user_role() IS DISTINCT FROM 'master_admin' THEN
        IF NEW.role IS DISTINCT FROM OLD.role THEN
            RAISE EXCEPTION 'Only master_admin can change user role';
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

DROP TRIGGER IF EXISTS trg_guard_profile_updates ON public.profiles;
CREATE TRIGGER trg_guard_profile_updates
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_profile_updates();

NOTIFY pgrst, 'reload schema';
