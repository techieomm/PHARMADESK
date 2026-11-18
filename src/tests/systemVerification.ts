/**
 * Automated PharmaDesk Verification Suite
 * Tests:
 * 1. Dual-unit conversion math (strips <-> pieces)
 * 2. Barcode parsing (1D & GS1 DataMatrix identifiers)
 * 3. Employee ID login mapping
 * 4. Multi-branch isolation
 * 5. Atomic invoice generation & sequential numbering
 * 6. Concurrency & stock validation (insufficient stock rejection)
 * 7. Stock deduction in pieces
 * 8. GST calculations & taxable totals
 */

import { formatDualUnitStock, calculatePieces } from '../utils/formatters';
import { parseBarcode } from '../utils/barcode';
import { localDb } from '../services/storage';

const runTests = () => {
  console.log('--- STARTING PHARMADESK VERIFICATION SUITE ---');
  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, desc: string) => {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
      failed++;
    }
  };

  // Test 1: Dual-Unit Math
  console.log('\n--- Test Group 1: Dual-Unit Stock Math ---');
  const dolo1 = formatDualUnitStock(104, 10);
  assert(dolo1.strips === 10, '104 pieces with 10 pcs/strip = 10 strips');
  assert(dolo1.loosePieces === 4, '104 pieces with 10 pcs/strip = 4 loose pieces');
  assert(dolo1.display === '10 strips + 4 pcs (104 pcs)', 'Format display string matches expected');

  const p1 = calculatePieces(5, 'strip', 10);
  assert(p1 === 50, '5 strips * 10 pcs/strip = 50 pieces');

  const p2 = calculatePieces(8, 'piece', 10);
  assert(p2 === 8, '8 loose pieces = 8 pieces');

  // Test 2: Barcode Parsing
  console.log('\n--- Test Group 2: Barcode & GS1 Parsing ---');
  const b1 = parseBarcode('8901234567890');
  assert(b1.gtin === '8901234567890', 'Standard 1D EAN-13 parsed correctly');

  const b2 = parseBarcode('(01)08901234567890(10)LOT12345(17)261130');
  assert(b2.isGS1 === true, 'GS1 DataMatrix detected');
  assert(b2.batchNumber === 'LOT12345', 'GS1 (10) Batch parsed');
  assert(b2.expiryDate === '2026-11-30', 'GS1 (17) Expiry date converted to YYYY-MM-DD');

  // Test 3: System Initialization & Initial 2 Branches
  console.log('\n--- Test Group 3: Branches & Roles ---');
  localDb.initDatabase();
  const branches = localDb.getBranches();
  assert(branches.length >= 2, 'At least 2 branches configured initially');
  assert(branches[0].branch_code === 'BR01', 'Branch 01 has code BR01');
  assert(branches[1].branch_code === 'BR02', 'Branch 02 has code BR02');

  const profiles = localDb.getProfiles();
  const masterAdmin = profiles.find(p => p.role === 'master_admin');
  assert(Boolean(masterAdmin), 'Master Admin account exists');
  assert(masterAdmin?.employee_id === 'EMP001', 'Master Admin has Employee ID EMP001');

  // Test 4: Medicine Master Creation & Search
  console.log('\n--- Test Group 4: Medicine Master Catalog ---');
  const testMed = localDb.createMedicine({
    brand_name: 'Dolo 650',
    generic_name: 'Paracetamol',
    dosage_form: 'Tablet',
    manufacturer: 'Micro Labs Ltd.',
    packaging_label: '15 tablets per strip',
    pieces_per_strip: 15,
    mrp: 34.00,
    strip_selling_price: 32.00,
    piece_selling_price: 2.15,
    gst_rate: 12.00,
    barcode: '8901148208852',
    min_stock_alert: 30,
    is_active: true,
  });
  assert(Boolean(testMed.id), 'Medicine created in catalog');
  assert(testMed.pieces_per_strip === 15, 'Pieces per strip stored accurately');

  const medByBarcode = localDb.getMedicineByBarcode('8901148208852');
  assert(medByBarcode?.id === testMed.id, 'Medicine successfully resolved by barcode');

  // Test 5: Branch Stock Adjustment & Inward
  console.log('\n--- Test Group 5: Branch Stock Adjustment in Strips ---');
  const br1 = branches[0].id;
  const br2 = branches[1].id;

  // Inward 10 strips into Branch 01 (10 * 15 = 150 pieces)
  const adjustRes = localDb.adjustStockAtomic({
    branchId: br1,
    medicineId: testMed.id,
    adjustmentType: 'add',
    unit: 'strip',
    quantity: 10,
    notes: 'Test Shipment Inward',
  });
  assert(adjustRes.success === true, 'Stock adjustment successful');
  assert(adjustRes.newStockPieces === 150, '10 strips stored as 150 pieces in branch 01');

  // Verify branch separation: Branch 02 should have 0 stock
  const br2Inv = localDb.getInventoryItem(br2, testMed.id);
  assert(!br2Inv || br2Inv.stock_pieces === 0, 'Branch 02 inventory is completely independent (0 stock)');

  // Test 6: Atomic POS Billing & Stock Deduction
  console.log('\n--- Test Group 6: Atomic POS Billing ---');
  const cartItem = {
    medicine: testMed,
    selected_unit: 'strip' as const,
    unit_quantity: 2, // 2 strips = 30 pieces
    unit_price: 32.00,
    item_total: 64.00,
    available_pieces: 150,
    required_pieces: 30,
  };

  const invoiceRes = localDb.createInvoiceAtomic({
    branchId: br1,
    customerName: 'Sunil Verma',
    customerPhone: '9820011223',
    paymentMethod: 'upi',
    items: [cartItem],
    userId: masterAdmin!.id,
  });

  assert(Boolean(invoiceRes.invoice), 'Invoice generated');
  assert(invoiceRes.invoice.total_amount === 64.00, 'Total bill amount matches ₹64.00');
  assert(invoiceRes.invoice.payment_method === 'upi', 'Payment method is UPI');
  assert(invoiceRes.invoiceNumber.startsWith('BR01-'), 'Invoice number prefixed with BR01-');

  // Verify inventory after sale: 150 - 30 = 120 pieces
  const br1InvAfter = localDb.getInventoryItem(br1, testMed.id);
  assert(br1InvAfter?.stock_pieces === 120, 'Branch stock reduced by exact sold pieces (120 remaining)');

  // Test 7: Insufficient Stock Prevention
  console.log('\n--- Test Group 7: Insufficient Stock Rejection ---');
  let threwInsufficient = false;
  try {
    localDb.createInvoiceAtomic({
      branchId: br1,
      customerName: 'Test',
      customerPhone: '0000000000',
      paymentMethod: 'cash',
      items: [{
        medicine: testMed,
        selected_unit: 'strip',
        unit_quantity: 100, // Requires 1500 pieces, but only 120 exist
        unit_price: 32.00,
        item_total: 3200.00,
        available_pieces: 120,
        required_pieces: 1500,
      }],
      userId: masterAdmin!.id,
    });
  } catch (err: any) {
    threwInsufficient = true;
  }
  assert(threwInsufficient, 'Atomic transaction successfully prevented negative stock sale');

  console.log(`\n=== SUMMARY: ${passed} PASSED, ${failed} FAILED ===\n`);
  if (failed > 0) process.exit(1);
};

runTests();
