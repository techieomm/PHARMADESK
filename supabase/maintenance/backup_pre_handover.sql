-- ====================================================================
-- PHARMADESK — PRE-HANDOVER DATABASE BACKUP SCRIPT
-- Destination Schema: backup_pre_handover
-- Purpose: Complete snapshot of all transactional and master tables
--          prior to owner handover data wipe.
-- Run in: Supabase SQL Editor (as postgres/service_role)
-- Safe to re-run: Yes (drops and recreates tables in backup schema)
-- ====================================================================

-- 1. Create isolated backup schema
CREATE SCHEMA IF NOT EXISTS backup_pre_handover;

-- 2. Snapshot Sequence & Counter State
DROP TABLE IF EXISTS backup_pre_handover.meta_sequences;
CREATE TABLE backup_pre_handover.meta_sequences AS
SELECT 
    'counter' AS entity_type,
    id AS entity_id,
    counter_code AS code,
    counter_name AS name,
    current_sequence AS sequence_value,
    NOW() AS snapshot_time
FROM public.counters
UNION ALL
SELECT 
    'branch' AS entity_type,
    id AS entity_id,
    branch_code AS code,
    name AS name,
    invoice_sequence AS sequence_value,
    NOW() AS snapshot_time
FROM public.branches;

-- 3. Billing & Invoices
DROP TABLE IF EXISTS backup_pre_handover.invoices;
CREATE TABLE backup_pre_handover.invoices AS SELECT * FROM public.invoices;

DROP TABLE IF EXISTS backup_pre_handover.invoice_items;
CREATE TABLE backup_pre_handover.invoice_items AS SELECT * FROM public.invoice_items;

DROP TABLE IF EXISTS backup_pre_handover.payment_records;
CREATE TABLE backup_pre_handover.payment_records AS SELECT * FROM public.payment_records;

DROP TABLE IF EXISTS backup_pre_handover.sales_returns;
CREATE TABLE backup_pre_handover.sales_returns AS SELECT * FROM public.sales_returns;

DROP TABLE IF EXISTS backup_pre_handover.sales_return_items;
CREATE TABLE backup_pre_handover.sales_return_items AS SELECT * FROM public.sales_return_items;

-- 4. Stock & Inventory
DROP TABLE IF EXISTS backup_pre_handover.inventory_batches;
CREATE TABLE backup_pre_handover.inventory_batches AS SELECT * FROM public.inventory_batches;

DROP TABLE IF EXISTS backup_pre_handover.stock_movements;
CREATE TABLE backup_pre_handover.stock_movements AS SELECT * FROM public.stock_movements;

DROP TABLE IF EXISTS backup_pre_handover.branch_inventory;
CREATE TABLE backup_pre_handover.branch_inventory AS SELECT * FROM public.branch_inventory;

DROP TABLE IF EXISTS backup_pre_handover.stock_transfers;
CREATE TABLE backup_pre_handover.stock_transfers AS SELECT * FROM public.stock_transfers;

DROP TABLE IF EXISTS backup_pre_handover.stock_transfer_items;
CREATE TABLE backup_pre_handover.stock_transfer_items AS SELECT * FROM public.stock_transfer_items;

-- 5. Medicines & Catalog
DROP TABLE IF EXISTS backup_pre_handover.medicine_master;
CREATE TABLE backup_pre_handover.medicine_master AS SELECT * FROM public.medicine_master;

DROP TABLE IF EXISTS backup_pre_handover.medicine_barcodes;
CREATE TABLE backup_pre_handover.medicine_barcodes AS SELECT * FROM public.medicine_barcodes;

DROP TABLE IF EXISTS backup_pre_handover.medicine_price_history;
CREATE TABLE backup_pre_handover.medicine_price_history AS SELECT * FROM public.medicine_price_history;

-- 6. Purchases & Suppliers
DROP TABLE IF EXISTS backup_pre_handover.purchase_invoices;
CREATE TABLE backup_pre_handover.purchase_invoices AS SELECT * FROM public.purchase_invoices;

DROP TABLE IF EXISTS backup_pre_handover.purchase_items;
CREATE TABLE backup_pre_handover.purchase_items AS SELECT * FROM public.purchase_items;

DROP TABLE IF EXISTS backup_pre_handover.suppliers;
CREATE TABLE backup_pre_handover.suppliers AS SELECT * FROM public.suppliers;

DROP TABLE IF EXISTS backup_pre_handover.supplier_ledger;
CREATE TABLE backup_pre_handover.supplier_ledger AS SELECT * FROM public.supplier_ledger;

-- 7. Customers, Doctors & Prescriptions
DROP TABLE IF EXISTS backup_pre_handover.customers;
CREATE TABLE backup_pre_handover.customers AS SELECT * FROM public.customers;

DROP TABLE IF EXISTS backup_pre_handover.customer_ledger;
CREATE TABLE backup_pre_handover.customer_ledger AS SELECT * FROM public.customer_ledger;

DROP TABLE IF EXISTS backup_pre_handover.doctors;
CREATE TABLE backup_pre_handover.doctors AS SELECT * FROM public.doctors;

DROP TABLE IF EXISTS backup_pre_handover.prescriptions;
CREATE TABLE backup_pre_handover.prescriptions AS SELECT * FROM public.prescriptions;

-- 8. Compliance, Books, Logs & Registers
DROP TABLE IF EXISTS backup_pre_handover.h1_register;
CREATE TABLE backup_pre_handover.h1_register AS SELECT * FROM public.h1_register;

DROP TABLE IF EXISTS backup_pre_handover.audit_logs;
CREATE TABLE backup_pre_handover.audit_logs AS SELECT * FROM public.audit_logs;

DROP TABLE IF EXISTS backup_pre_handover.day_close;
CREATE TABLE backup_pre_handover.day_close AS SELECT * FROM public.day_close;

DROP TABLE IF EXISTS backup_pre_handover.expenses;
CREATE TABLE backup_pre_handover.expenses AS SELECT * FROM public.expenses;

DROP TABLE IF EXISTS backup_pre_handover.discrepancies;
CREATE TABLE backup_pre_handover.discrepancies AS SELECT * FROM public.discrepancies;

-- 9. Verification Summary of Backed Up Rows
SELECT 'invoices' AS table_name, count(*) AS backed_up_rows FROM backup_pre_handover.invoices
UNION ALL SELECT 'invoice_items', count(*) FROM backup_pre_handover.invoice_items
UNION ALL SELECT 'payment_records', count(*) FROM backup_pre_handover.payment_records
UNION ALL SELECT 'sales_returns', count(*) FROM backup_pre_handover.sales_returns
UNION ALL SELECT 'sales_return_items', count(*) FROM backup_pre_handover.sales_return_items
UNION ALL SELECT 'inventory_batches', count(*) FROM backup_pre_handover.inventory_batches
UNION ALL SELECT 'stock_movements', count(*) FROM backup_pre_handover.stock_movements
UNION ALL SELECT 'branch_inventory', count(*) FROM backup_pre_handover.branch_inventory
UNION ALL SELECT 'stock_transfers', count(*) FROM backup_pre_handover.stock_transfers
UNION ALL SELECT 'stock_transfer_items', count(*) FROM backup_pre_handover.stock_transfer_items
UNION ALL SELECT 'medicine_master', count(*) FROM backup_pre_handover.medicine_master
UNION ALL SELECT 'medicine_barcodes', count(*) FROM backup_pre_handover.medicine_barcodes
UNION ALL SELECT 'medicine_price_history', count(*) FROM backup_pre_handover.medicine_price_history
UNION ALL SELECT 'purchase_invoices', count(*) FROM backup_pre_handover.purchase_invoices
UNION ALL SELECT 'purchase_items', count(*) FROM backup_pre_handover.purchase_items
UNION ALL SELECT 'suppliers', count(*) FROM backup_pre_handover.suppliers
UNION ALL SELECT 'supplier_ledger', count(*) FROM backup_pre_handover.supplier_ledger
UNION ALL SELECT 'customers', count(*) FROM backup_pre_handover.customers
UNION ALL SELECT 'customer_ledger', count(*) FROM backup_pre_handover.customer_ledger
UNION ALL SELECT 'doctors', count(*) FROM backup_pre_handover.doctors
UNION ALL SELECT 'prescriptions', count(*) FROM backup_pre_handover.prescriptions
UNION ALL SELECT 'h1_register', count(*) FROM backup_pre_handover.h1_register
UNION ALL SELECT 'audit_logs', count(*) FROM backup_pre_handover.audit_logs
UNION ALL SELECT 'day_close', count(*) FROM backup_pre_handover.day_close
UNION ALL SELECT 'expenses', count(*) FROM backup_pre_handover.expenses
UNION ALL SELECT 'discrepancies', count(*) FROM backup_pre_handover.discrepancies
ORDER BY table_name;
