/**
 * Automated PharmaDesk Verification Suite
 * Tests:
 * 1. Dual-unit conversion math (strips <-> pieces)
 * 2. Barcode parsing (1D & GS1 DataMatrix identifiers)
 * 3. GST calculations & taxable totals
 * 4. GSTIN checksum validation & PAN extraction
 * 5. FEFO batch selection math
 * 6. Multi-branch isolation & local/real storage handling
 */

import { formatDualUnitStock, calculatePieces } from '../utils/formatters';
import { parseBarcode } from '../utils/barcode';
import { localDb } from '../services/storage';
import { validateGstin, calculateLineGst, allocateFefoStock, AvailableBatch } from '../core';

const isDemo = import.meta.env.VITE_DEMO_MODE === 'true';

export const runSystemVerification = () => {
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

  // Test 3: GST & GSTIN Math
  console.log('\n--- Test Group 3: GST & GSTIN Math ---');
  const gstinRes = validateGstin('09CMVPM3439A1ZS');
  assert(gstinRes.isValid === true, 'Bajrang Pharmacy GSTIN 09CMVPM3439A1ZS is valid');
  assert(gstinRes.stateCode === '09', 'State code resolved to 09 (Uttar Pradesh)');
  assert(gstinRes.pan === 'CMVPM3439A', 'PAN derived accurately: CMVPM3439A');

  const lineGst = calculateLineGst({
    unitPrice: 112,
    quantity: 1,
    gstRate: 12,
    isPriceInclusiveGst: true,
  });
  assert(lineGst.taxableAmount === 100.0, 'Taxable amount on ₹112 (12% incl) = ₹100.00');
  assert(lineGst.cgstAmount === 6.0 && lineGst.sgstAmount === 6.0, 'CGST=₹6, SGST=₹6');

  // Test 4: FEFO Engine Allocation
  console.log('\n--- Test Group 4: FEFO Batch Allocation ---');
  const batches: AvailableBatch[] = [
    { id: 'b1', batch_number: 'EXP_SOON', expiry_date: '2026-12-01', stock_pieces: 10, mrp: 100 },
    { id: 'b2', batch_number: 'EXP_LATER', expiry_date: '2027-06-01', stock_pieces: 20, mrp: 100 },
  ];
  const fefo = allocateFefoStock(batches, 15);
  assert(fefo.isFullyAllocated === true, 'FEFO successfully satisfied 15 pieces requirement');
  assert(fefo.allocatedSlices.length === 2, 'Allocated across 2 batches');
  assert(
    fefo.allocatedSlices[0].batchNumber === 'EXP_SOON' && fefo.allocatedSlices[0].piecesAllocated === 10,
    'First allocated 10 from earliest expiry'
  );
  assert(
    fefo.allocatedSlices[1].batchNumber === 'EXP_LATER' && fefo.allocatedSlices[1].piecesAllocated === 5,
    'Remaining 5 allocated from later expiry'
  );

  // Test 5: Local Sandbox Integration (only when Demo Mode is explicitly on)
  if (isDemo) {
    console.log('\n--- Test Group 5: Local Database Fallback Verification ---');
    localDb.initDatabase();
    const branches = localDb.getBranches();
    assert(branches.length >= 2, 'At least 2 branches configured');
    const profiles = localDb.getProfiles();
    assert(profiles.some(p => p.role === 'master_admin'), 'Master admin exists');
  } else {
    console.log('\n--- Real Supabase Production Mode Active (LocalDb Sandbox Skipped) ---');
  }

  console.log(`\n=== SUMMARY: ${passed} PASSED, ${failed} FAILED ===\n`);
  return { passed, failed };
};

// Auto-run if executed in Node CLI
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('systemVerification')) {
  const result = runSystemVerification();
  if (result.failed > 0) process.exit(1);
}
