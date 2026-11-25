-- ====================================================================
-- PHARMADESK — RESTORE FROM PRE-HANDOVER BACKUP
-- Purpose: Restores all wiped test tables from backup_pre_handover schema
--          back into public schema and restores original sequences.
-- Run in: Supabase SQL Editor (as postgres/service_role)
-- ====================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'backup_pre_handover') THEN
        RAISE EXCEPTION 'RESTORE ABORTED: Schema backup_pre_handover does not exist!';
    END IF;
END $$;

BEGIN;

-- STEP 1: RESTORE MASTER CATALOG & ENTITIES
INSERT INTO public.doctors SELECT * FROM backup_pre_handover.doctors
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.suppliers SELECT * FROM backup_pre_handover.suppliers
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.customers SELECT * FROM backup_pre_handover.customers
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.prescriptions SELECT * FROM backup_pre_handover.prescriptions
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.supplier_ledger SELECT * FROM backup_pre_handover.supplier_ledger
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.customer_ledger SELECT * FROM backup_pre_handover.customer_ledger
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.medicine_master SELECT * FROM backup_pre_handover.medicine_master
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.medicine_barcodes SELECT * FROM backup_pre_handover.medicine_barcodes
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.medicine_price_history SELECT * FROM backup_pre_handover.medicine_price_history
ON CONFLICT (id) DO NOTHING;

-- STEP 2: RESTORE PURCHASES
INSERT INTO public.purchase_invoices SELECT * FROM backup_pre_handover.purchase_invoices
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.purchase_items SELECT * FROM backup_pre_handover.purchase_items
ON CONFLICT (id) DO NOTHING;

-- STEP 3: RESTORE INVENTORY BATCHES & STOCK
INSERT INTO public.inventory_batches SELECT * FROM backup_pre_handover.inventory_batches
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.branch_inventory SELECT * FROM backup_pre_handover.branch_inventory
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.stock_movements SELECT * FROM backup_pre_handover.stock_movements
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.stock_transfers SELECT * FROM backup_pre_handover.stock_transfers
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.stock_transfer_items SELECT * FROM backup_pre_handover.stock_transfer_items
ON CONFLICT (id) DO NOTHING;

-- STEP 4: RESTORE INVOICES & PAYMENTS
INSERT INTO public.invoices SELECT * FROM backup_pre_handover.invoices
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.invoice_items SELECT * FROM backup_pre_handover.invoice_items
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.payment_records SELECT * FROM backup_pre_handover.payment_records
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.h1_register SELECT * FROM backup_pre_handover.h1_register
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sales_returns SELECT * FROM backup_pre_handover.sales_returns
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sales_return_items SELECT * FROM backup_pre_handover.sales_return_items
ON CONFLICT (id) DO NOTHING;

-- STEP 5: RESTORE BOOKS, EXPENSES & LOGS
INSERT INTO public.day_close SELECT * FROM backup_pre_handover.day_close
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.expenses SELECT * FROM backup_pre_handover.expenses
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.discrepancies SELECT * FROM backup_pre_handover.discrepancies
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.audit_logs SELECT * FROM backup_pre_handover.audit_logs
ON CONFLICT (id) DO NOTHING;

-- STEP 6: RESTORE COUNTER AND BRANCH SEQUENCES
UPDATE public.counters c
SET current_sequence = m.sequence_value,
    updated_at = NOW()
FROM backup_pre_handover.meta_sequences m
WHERE m.entity_type = 'counter' AND c.id = m.entity_id;

UPDATE public.branches b
SET invoice_sequence = m.sequence_value,
    updated_at = NOW()
FROM backup_pre_handover.meta_sequences m
WHERE m.entity_type = 'branch' AND b.id = m.entity_id;

COMMIT;

-- STEP 7: RELOAD POSTGREST
NOTIFY pgrst, 'reload schema';

-- STEP 8: RESTORATION VERIFICATION
SELECT 
    'invoices' AS table_name, count(*) AS restored_count FROM public.invoices
UNION ALL SELECT 'inventory_batches', count(*) FROM public.inventory_batches
UNION ALL SELECT 'medicine_master', count(*) FROM public.medicine_master
UNION ALL SELECT 'purchase_invoices', count(*) FROM public.purchase_invoices
UNION ALL SELECT 'h1_register', count(*) FROM public.h1_register
UNION ALL SELECT 'audit_logs', count(*) FROM public.audit_logs
ORDER BY table_name;
