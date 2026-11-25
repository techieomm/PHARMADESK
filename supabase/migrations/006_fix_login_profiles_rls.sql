-- ====================================================================
-- PHARMADESK — MIGRATION 006: FIX LOGIN PROFILES RLS RECURSION
-- Resolves "infinite recursion detected in policy for relation profiles"
-- by using SECURITY DEFINER helper get_current_user_role() and
-- installs privilege guard trigger on public.profiles.
-- ====================================================================

-- 1. Helper Function: get_current_user_role() (SECURITY DEFINER to avoid RLS recursion)
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

-- 2. Helper Function: get_current_user_branch() (SECURITY DEFINER)
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

-- 3. Profiles Read Policy (Breaks recursion by using SECURITY DEFINER role lookup)
DROP POLICY IF EXISTS "Profiles read policy" ON public.profiles;
CREATE POLICY "Profiles read policy" ON public.profiles
    FOR SELECT TO authenticated
    USING (
        auth.uid() = id OR
        public.get_current_user_role() IN ('master_admin', 'sub_admin')
    );

-- 4. Profiles Update Policy
DROP POLICY IF EXISTS "Master admin profiles update" ON public.profiles;
CREATE POLICY "Master admin profiles update" ON public.profiles
    FOR UPDATE TO authenticated
    USING (
        auth.uid() = id OR
        public.get_current_user_role() = 'master_admin'
    );

-- 5. Guard Trigger: Prevent non-master_admin from privilege escalation
-- Allows users to update non-sensitive columns or toggle must_change_password via complete_password_change
CREATE OR REPLACE FUNCTION public.guard_profile_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- If caller is not master_admin, prevent modifying sensitive columns
    IF public.get_current_user_role() IS DISTINCT FROM 'master_admin' THEN
        IF NEW.role IS DISTINCT FROM OLD.role THEN
            RAISE EXCEPTION 'Only master_admin can change user role';
        END IF;
        IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
            RAISE EXCEPTION 'Only master_admin can change active status';
        END IF;
        -- Allow password change flow to remove must_change_password, but disallow altering other permissions
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
