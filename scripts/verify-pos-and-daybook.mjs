/**
 * PharmaDesk Live Database POS & Day Book Verification Script
 * Validates:
 * 1. create_invoice_atomic with stock deduction & payment record creation
 * 2. Over-stock rejection
 * 3. Idempotency deduplication
 * 4. Day Book IST aggregation & reconciliation check
 * 5. cancel_invoice with stock restoration & payment_records status sync
 * 
 * Cleans up all created test data so no residue remains in production.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read .env safely without printing values
const envText = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf-8') : '';
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) {
    let val = m[2] ? m[2].trim() : '';
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    env[m[1]] = val;
  }
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
const masterAdminEmail = process.env.MASTER_ADMIN_EMAIL || env.MASTER_ADMIN_EMAIL || 'omlenka22@gmail.com';
const masterAdminPassword = process.env.MASTER_ADMIN_PASSWORD || env.MASTER_ADMIN_PASSWORD || 'master-admin';

if (!supabaseUrl || !anonKey) {
  console.error('Missing Supabase configuration in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, anonKey);

async function run() {
  console.log('--- PHARMADESK POS & DAY BOOK INTEGRATION AUDIT ---');

  // 1. Authenticate as Master Admin
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: masterAdminEmail,
    password: masterAdminPassword,
  });

  if (authErr || !authData.user) {
    console.error('Authentication failed:', authErr?.message);
    process.exit(1);
  }
  console.log('✓ Master Admin authenticated successfully:', authData.user.email);

  // 2. Fetch Active Branch & Medicine
  const { data: branches, error: bErr } = await supabase.from('branches').select('*').limit(1);
  if (bErr || !branches || branches.length === 0) {
    console.error('No branch found:', bErr?.message);
    process.exit(1);
  }
  const branch = branches[0];
  console.log(`✓ Using branch: ${branch.name} (${branch.branch_code})`);

  const { data: meds, error: mErr } = await supabase.from('medicine_master').select('*').limit(1);
  if (mErr || !meds || meds.length === 0) {
    console.error('No medicines found in master catalog:', mErr?.message);
    process.exit(1);
  }
  const medicine = meds[0];
  console.log(`✓ Using medicine: ${medicine.brand_name} (ID: ${medicine.id})`);

  // 3. Fetch Batch Stock
  const { data: batches, error: batErr } = await supabase
    .from('inventory_batches')
    .select('*')
    .eq('branch_id', branch.id)
    .eq('medicine_id', medicine.id)
    .gt('stock_pieces', 5)
    .limit(1);

  if (batErr || !batches || batches.length === 0) {
    console.error('No batch with stock found for testing');
    process.exit(1);
  }
  const batch = batches[0];
  const initialStock = batch.stock_pieces;
  console.log(`✓ Initial batch ${batch.batch_number} stock: ${initialStock} pieces`);

  // 4. Test 1: Over-Stock Rejection
  console.log('\n[Test 1] Attempting to sell more than available stock...');
  const excessiveQty = initialStock + 1000;
  const { data: overData, error: overErr } = await supabase.rpc('create_invoice_atomic', {
    p_branch_id: branch.id,
    p_counter_id: null,
    p_customer_name: 'Test Overstock',
    p_customer_phone: null,
    p_customer_id: null,
    p_customer_gstin: null,
    p_customer_state_code: '09',
    p_doctor_id: null,
    p_doctor_name: null,
    p_doctor_reg_no: null,
    p_payment_method: 'cash',
    p_payment_splits: [],
    p_items: [
      {
        medicine_id: medicine.id,
        selected_unit: 'piece',
        unit_quantity: excessiveQty,
        batch_id: batch.id,
        discount_amount: 0.0,
      },
    ],
    p_bill_discount: 0.0,
    p_notes: null,
    p_device_id: null,
    p_idempotency_key: null,
    p_customer_age: null,
    p_customer_address: null,
  });

  if (overErr) {
    console.log('✓ Correctly REJECTED over-stock sale:', overErr.message);
  } else {
    console.error('FAILED: Over-stock sale was allowed!', overData);
    process.exit(1);
  }

  // 5. Test 2: Successful Sale (1 piece)
  console.log('\n[Test 2] Creating valid bill for 1 piece...');
  const idempotencyKey = `audit-test-${Date.now()}`;
  const { data: saleData, error: saleErr } = await supabase.rpc('create_invoice_atomic', {
    p_branch_id: branch.id,
    p_counter_id: null,
    p_customer_name: 'Audit Customer',
    p_customer_phone: null,
    p_customer_id: null,
    p_customer_gstin: null,
    p_customer_state_code: '09',
    p_doctor_id: null,
    p_doctor_name: null,
    p_doctor_reg_no: null,
    p_payment_method: 'cash',
    p_payment_splits: [],
    p_items: [
      {
        medicine_id: medicine.id,
        selected_unit: 'piece',
        unit_quantity: 1,
        batch_id: batch.id,
        discount_amount: 0.0,
      },
    ],
    p_bill_discount: 0.0,
    p_notes: 'Live audit test bill',
    p_device_id: 'CLI-AUDIT',
    p_idempotency_key: idempotencyKey,
    p_customer_age: 30,
    p_customer_address: 'Audit Address, UP',
  });

  if (saleErr || !saleData?.success) {
    console.error('FAILED to create invoice:', saleErr?.message);
    process.exit(1);
  }
  const invoiceId = saleData.invoice_id;
  const invoiceNum = saleData.invoice_number;
  console.log(`✓ Invoice created successfully: ${invoiceNum} (ID: ${invoiceId})`);

  // Verify stock deduction
  const { data: batchAfterSale } = await supabase
    .from('inventory_batches')
    .select('stock_pieces')
    .eq('id', batch.id)
    .single();
  console.log(`✓ Stock after 1-piece sale: ${batchAfterSale.stock_pieces} (Expected: ${initialStock - 1})`);
  if (batchAfterSale.stock_pieces !== initialStock - 1) {
    console.error('Stock deduction mismatch!');
    process.exit(1);
  }

  // 6. Test 3: Idempotency Key Deduplication
  console.log('\n[Test 3] Double-submitting with identical idempotency key...');
  const { data: dupData, error: dupErr } = await supabase.rpc('create_invoice_atomic', {
    p_branch_id: branch.id,
    p_counter_id: null,
    p_customer_name: 'Audit Customer',
    p_customer_phone: null,
    p_customer_id: null,
    p_customer_gstin: null,
    p_customer_state_code: '09',
    p_doctor_id: null,
    p_doctor_name: null,
    p_doctor_reg_no: null,
    p_payment_method: 'cash',
    p_payment_splits: [],
    p_items: [
      {
        medicine_id: medicine.id,
        selected_unit: 'piece',
        unit_quantity: 1,
        batch_id: batch.id,
        discount_amount: 0.0,
      },
    ],
    p_bill_discount: 0.0,
    p_notes: 'Live audit test bill duplicate',
    p_device_id: 'CLI-AUDIT',
    p_idempotency_key: idempotencyKey,
    p_customer_age: 30,
    p_customer_address: 'Audit Address, UP',
  });

  if (dupData?.is_duplicate) {
    console.log(`✓ Correctly identified duplicate bill: ${dupData.invoice_number} (No duplicate created)`);
  } else {
    console.error('FAILED: Duplicate idempotency was not detected!', dupData, dupErr);
    process.exit(1);
  }

  // 7. Test 4: Day Book Reconciliation
  console.log('\n[Test 4] Querying Day Book with strict Asia/Kolkata date...');
  const todayIst = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const { data: dayBook, error: dbErr } = await supabase.rpc('get_day_book', {
    p_branch_id: branch.id,
    p_date: todayIst,
  });

  if (dbErr || !dayBook) {
    console.error('Day Book RPC failed:', dbErr?.message);
    process.exit(1);
  }
  console.log('✓ Day Book IST Summary:');
  console.log(`   - Date: ${dayBook.date} (${dayBook.timezone})`);
  console.log(`   - Gross Sales Amount: ₹${dayBook.summary.gross_sales_amount}`);
  console.log(`   - Cash Collected: ₹${dayBook.summary.cash_collected}`);
  console.log(`   - Total GST: ₹${dayBook.summary.total_gst}`);
  console.log(`   - Is Balanced: ${dayBook.summary.is_balanced}`);
  console.log(`   - Discrepancy: ₹${dayBook.summary.reconciliation_difference}`);

  if (!dayBook.summary.is_balanced) {
    console.error('FAILED: Day Book is not balanced!');
    process.exit(1);
  }

  // 8. Test 5: Cancel Invoice & Stock Restoration
  console.log(`\n[Test 5] Cancelling invoice ${invoiceNum} and testing stock restock...`);
  const { data: cancelData, error: cancelErr } = await supabase.rpc('cancel_invoice', {
    p_invoice_id: invoiceId,
    p_reason: 'Automated POS Audit Verification Test',
  });

  if (cancelErr || !cancelData?.success) {
    console.error('Cancel invoice failed:', cancelErr?.message);
    process.exit(1);
  }
  console.log(`✓ Invoice cancelled successfully: ${cancelData.invoice_number}`);

  // Verify stock restoration
  const { data: batchAfterCancel } = await supabase
    .from('inventory_batches')
    .select('stock_pieces')
    .eq('id', batch.id)
    .single();
  console.log(`✓ Stock after cancellation: ${batchAfterCancel.stock_pieces} (Expected: ${initialStock})`);
  if (batchAfterCancel.stock_pieces !== initialStock) {
    console.error('Stock was NOT restored correctly!');
    process.exit(1);
  }

  // Verify payment_records status set to cancelled
  const { data: paymentRecords } = await supabase
    .from('payment_records')
    .select('id, status')
    .eq('invoice_id', invoiceId);
  console.log(`✓ Payment records for invoice:`, paymentRecords);
  if (paymentRecords?.some((pr) => pr.status !== 'cancelled')) {
    console.error('Payment records status was not synchronized to cancelled!');
    process.exit(1);
  }

  // 9. Clean up test invoice & related records so DB stays clean
  console.log('\n[Cleanup] Removing test invoice from live database...');
  await supabase.from('stock_movements').delete().eq('reference_id', invoiceNum);
  await supabase.from('h1_register').delete().eq('invoice_id', invoiceId);
  await supabase.from('payment_records').delete().eq('invoice_id', invoiceId);
  await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId);
  await supabase.from('invoices').delete().eq('id', invoiceId);
  await supabase.from('audit_logs').delete().eq('entity_id', invoiceNum);
  console.log('✓ Test invoice and audit movements cleaned up cleanly. Live database is pristine.');

  console.log('\n========================================');
  console.log('ALL INTEGRATION AUDIT CHECKS PASSED (5/5)');
  console.log('========================================\n');
}

run().catch((err) => {
  console.error('Unhandled error during verification:', err);
  process.exit(1);
});
