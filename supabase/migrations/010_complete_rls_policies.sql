-- ====================================================================
-- PHARMADESK — MIGRATION 010: PRODUCTION RLS AUDIT & POLICY COMPLETION
-- Adds missing RLS policies for:
-- 1. businesses
-- 2. business_settings
-- 3. branch_memberships
-- 4. expenses
-- 5. medicine_price_history
-- 6. payment_records
-- 7. purchase_items
-- 8. sales_return_items
-- 9. stock_transfers & stock_transfer_items
-- ====================================================================

-- 1. businesses
DROP POLICY IF EXISTS "Businesses read" ON public.businesses;
DROP POLICY IF EXISTS "Businesses manage" ON public.businesses;

CREATE POLICY "Businesses read" ON public.businesses
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Businesses manage" ON public.businesses
    FOR ALL TO authenticated
    USING (public.get_current_user_role() = 'master_admin');


-- 2. business_settings
DROP POLICY IF EXISTS "Business settings read" ON public.business_settings;
DROP POLICY IF EXISTS "Business settings manage" ON public.business_settings;

CREATE POLICY "Business settings read" ON public.business_settings
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Business settings manage" ON public.business_settings
    FOR ALL TO authenticated
    USING (public.get_current_user_role() = 'master_admin');


-- 3. branch_memberships
DROP POLICY IF EXISTS "Branch memberships read" ON public.branch_memberships;
DROP POLICY IF EXISTS "Branch memberships manage" ON public.branch_memberships;

CREATE POLICY "Branch memberships read" ON public.branch_memberships
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Branch memberships manage" ON public.branch_memberships
    FOR ALL TO authenticated
    USING (public.get_current_user_role() IN ('master_admin', 'sub_admin'));


-- 4. expenses
DROP POLICY IF EXISTS "Expenses read" ON public.expenses;
DROP POLICY IF EXISTS "Expenses insert" ON public.expenses;
DROP POLICY IF EXISTS "Expenses manage" ON public.expenses;

CREATE POLICY "Expenses read" ON public.expenses
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Expenses insert" ON public.expenses
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "Expenses manage" ON public.expenses
    FOR ALL TO authenticated
    USING (public.get_current_user_role() IN ('master_admin', 'sub_admin', 'branch_manager'));


-- 5. medicine_price_history
DROP POLICY IF EXISTS "Medicine price history read" ON public.medicine_price_history;
DROP POLICY IF EXISTS "Medicine price history manage" ON public.medicine_price_history;

CREATE POLICY "Medicine price history read" ON public.medicine_price_history
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Medicine price history manage" ON public.medicine_price_history
    FOR ALL TO authenticated
    USING (public.get_current_user_role() IN ('master_admin', 'sub_admin', 'inventory_manager'));


-- 6. payment_records
DROP POLICY IF EXISTS "Payment records read" ON public.payment_records;
DROP POLICY IF EXISTS "Payment records insert" ON public.payment_records;

CREATE POLICY "Payment records read" ON public.payment_records
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Payment records insert" ON public.payment_records
    FOR INSERT TO authenticated
    WITH CHECK (true);


-- 7. purchase_items
DROP POLICY IF EXISTS "Purchase items read" ON public.purchase_items;
DROP POLICY IF EXISTS "Purchase items manage" ON public.purchase_items;

CREATE POLICY "Purchase items read" ON public.purchase_items
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Purchase items manage" ON public.purchase_items
    FOR ALL TO authenticated
    USING (public.get_current_user_role() IN ('master_admin', 'sub_admin', 'inventory_manager'));


-- 8. sales_return_items
DROP POLICY IF EXISTS "Sales return items read" ON public.sales_return_items;
DROP POLICY IF EXISTS "Sales return items manage" ON public.sales_return_items;

CREATE POLICY "Sales return items read" ON public.sales_return_items
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Sales return items manage" ON public.sales_return_items
    FOR ALL TO authenticated
    USING (true);


-- 9. stock_transfers & stock_transfer_items
DROP POLICY IF EXISTS "Stock transfers read" ON public.stock_transfers;
DROP POLICY IF EXISTS "Stock transfers manage" ON public.stock_transfers;
DROP POLICY IF EXISTS "Stock transfer items read" ON public.stock_transfer_items;
DROP POLICY IF EXISTS "Stock transfer items manage" ON public.stock_transfer_items;

CREATE POLICY "Stock transfers read" ON public.stock_transfers
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Stock transfers manage" ON public.stock_transfers
    FOR ALL TO authenticated
    USING (public.get_current_user_role() IN ('master_admin', 'sub_admin', 'inventory_manager', 'branch_manager'));

CREATE POLICY "Stock transfer items read" ON public.stock_transfer_items
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Stock transfer items manage" ON public.stock_transfer_items
    FOR ALL TO authenticated
    USING (public.get_current_user_role() IN ('master_admin', 'sub_admin', 'inventory_manager', 'branch_manager'));

NOTIFY pgrst, 'reload schema';
