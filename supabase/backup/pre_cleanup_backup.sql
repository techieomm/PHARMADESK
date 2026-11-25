-- ====================================================================
-- PHARMADESK — PRE-CLEANUP DATABASE SNAPSHOT BACKUP
-- Creates temporary backup tables for all affected entities before purge
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.suppliers_bak AS SELECT * FROM public.suppliers;
CREATE TABLE IF NOT EXISTS public.customers_bak AS SELECT * FROM public.customers;
CREATE TABLE IF NOT EXISTS public.doctors_bak AS SELECT * FROM public.doctors;
CREATE TABLE IF NOT EXISTS public.medicine_master_bak AS SELECT * FROM public.medicine_master;
CREATE TABLE IF NOT EXISTS public.medicine_barcodes_bak AS SELECT * FROM public.medicine_barcodes;
CREATE TABLE IF NOT EXISTS public.inventory_batches_bak AS SELECT * FROM public.inventory_batches;
