import { describe, it, expect } from 'vitest';
import {
  calculateLineGst,
  calculateInvoiceTotals,
  numberToIndianWords,
  validateGstin,
  verifyGstinChecksum,
  allocateFefoStock,
  formatInvoiceNumber,
  getIndianFinancialYearCode,
  generateUuidV7,
} from '../core';
import { parseGs1Barcode } from '../utils/gs1Parser';

describe('GST Engine & Indian Math', () => {
  it('calculates retail inclusive GST correctly for standard 12% medicine', () => {
    // Retail pharmacy item MRP: ₹112.00 (inclusive of 12% GST)
    // Taxable = 112 / 1.12 = 100.00
    // Total GST = 12.00 -> CGST: 6.00, SGST: 6.00
    const result = calculateLineGst({
      unitPrice: 112,
      quantity: 1,
      gstRate: 12,
      isPriceInclusiveGst: true,
      isInterState: false,
    });

    expect(result.lineTotalGross).toBe(112.0);
    expect(result.taxableAmount).toBe(100.0);
    expect(result.totalGst).toBe(12.0);
    expect(result.cgstAmount).toBe(6.0);
    expect(result.sgstAmount).toBe(6.0);
    expect(result.igstAmount).toBe(0.0);
  });

  it('calculates inter-state IGST correctly when customer is outside UP', () => {
    const result = calculateLineGst({
      unitPrice: 112,
      quantity: 1,
      gstRate: 12,
      isPriceInclusiveGst: true,
      isInterState: true,
    });

    expect(result.taxableAmount).toBe(100.0);
    expect(result.totalGst).toBe(12.0);
    expect(result.cgstAmount).toBe(0.0);
    expect(result.sgstAmount).toBe(0.0);
    expect(result.igstAmount).toBe(12.0);
  });

  it('calculates invoice totals with round-off and Indian words', () => {
    // Line 1: ₹33.33 (inclusive 12% GST)
    const line1 = calculateLineGst({
      unitPrice: 33.33,
      quantity: 1,
      gstRate: 12,
    });

    const totals = calculateInvoiceTotals([line1]);
    expect(totals.grandTotal).toBe(33); // 33.33 rounds to 33
    expect(totals.roundOff).toBe(-0.33);
    expect(totals.amountInWords).toBe('Thirty-Three Rupees Only');
  });

  it('calculates mixed GST rate cart totals accurately', () => {
    // Line 1: 0% GST (e.g. Life-saving drug) ₹100
    const line1 = calculateLineGst({ unitPrice: 100, quantity: 1, gstRate: 0 });
    // Line 2: 5% GST (e.g. Insulin / Vaccine) ₹210 (inclusive)
    const line2 = calculateLineGst({ unitPrice: 210, quantity: 1, gstRate: 5 });
    // Line 3: 12% GST (e.g. Paracetamol) ₹112 (inclusive)
    const line3 = calculateLineGst({ unitPrice: 112, quantity: 1, gstRate: 12 });
    // Line 4: 18% GST (e.g. Disinfectant / Cosmetic) ₹118 (inclusive)
    const line4 = calculateLineGst({ unitPrice: 118, quantity: 1, gstRate: 18 });

    const totals = calculateInvoiceTotals([line1, line2, line3, line4]);
    expect(totals.grandTotal).toBe(540);
    expect(totals.totalCgst + totals.totalSgst).toBe(totals.totalGst);
  });

  it('converts large numbers to Indian numbering format (Lakhs, Crores)', () => {
    expect(numberToIndianWords(125430)).toBe(
      'One Lakh Twenty-Five Thousand Four Hundred Thirty Rupees Only'
    );
  });
});

describe('GSTIN Validation & PAN Derivation', () => {
  it('validates Bajrang Pharmacy GSTIN: 09CMVPM3439A1ZS (Uttar Pradesh)', () => {
    const gstin = '09CMVPM3439A1ZS';
    const result = validateGstin(gstin);

    expect(result.isValid).toBe(true);
    expect(result.stateCode).toBe('09');
    expect(result.stateName).toBe('Uttar Pradesh');
    expect(result.pan).toBe('CMVPM3439A');
    expect(result.isUttarPradesh).toBe(true);
  });

  it('rejects invalid GSTIN checksum or wrong length', () => {
    const badGstin = '09CMVPM3439A1Z9'; // wrong checksum char
    const result = validateGstin(badGstin);
    expect(result.isValid).toBe(false);
  });
});

describe('FEFO Inventory Allocation Engine', () => {
  const refDate = new Date('2026-11-19T00:00:00Z');

  const batches = [
    {
      id: 'batch-expired',
      batch_number: 'EXP-01',
      expiry_date: '2026-10-01', // Expired!
      stock_pieces: 100,
      mrp: 50,
    },
    {
      id: 'batch-soon',
      batch_number: 'B26-DEC',
      expiry_date: '2026-12-15', // Expires in ~26 days (<90d warning)
      stock_pieces: 10,
      mrp: 50,
    },
    {
      id: 'batch-later',
      batch_number: 'B27-JUN',
      expiry_date: '2027-06-30', // Good stock
      stock_pieces: 50,
      mrp: 52,
    },
  ];

  it('blocks expired batches and allocates across nearest expiring batch first', () => {
    // Request 15 pieces:
    // Should take 0 from batch-expired
    // Should take 10 from batch-soon (exhausts batch-soon)
    // Should take 5 from batch-later
    const allocation = allocateFefoStock(batches, 15, refDate);

    expect(allocation.isFullyAllocated).toBe(true);
    expect(allocation.allocatedSlices).toHaveLength(2);
    expect(allocation.allocatedSlices[0].batchNumber).toBe('B26-DEC');
    expect(allocation.allocatedSlices[0].piecesAllocated).toBe(10);
    expect(allocation.allocatedSlices[0].isNearExpiry).toBe(true);
    expect(allocation.allocatedSlices[1].batchNumber).toBe('B27-JUN');
    expect(allocation.allocatedSlices[1].piecesAllocated).toBe(5);
  });

  it('flags unallocated pieces when stock is insufficient', () => {
    const allocation = allocateFefoStock(batches, 100, refDate);
    expect(allocation.isFullyAllocated).toBe(false);
    expect(allocation.totalAllocatedPieces).toBe(60); // 10 + 50 (expired 100 ignored)
    expect(allocation.unallocatedPieces).toBe(40);
  });
});

describe('Financial Year & Invoice Numbering Series', () => {
  it('generates correct Indian FY code', () => {
    // Nov 2026 -> FY 2026-27 -> '2627'
    const novDate = new Date('2026-11-19');
    expect(getIndianFinancialYearCode(novDate)).toBe('2627');

    // Feb 2027 -> Still FY 2026-27 -> '2627'
    const febDate = new Date('2027-02-15');
    expect(getIndianFinancialYearCode(febDate)).toBe('2627');

    // April 2027 -> FY 2027-28 -> '2728'
    const aprDate = new Date('2027-04-01');
    expect(getIndianFinancialYearCode(aprDate)).toBe('2728');
  });

  it('formats invoice number with branch, counter, FY, and padded sequence', () => {
    const num = formatInvoiceNumber({
      branchPrefix: 'LKO1',
      counterCode: 'C2',
      sequenceNumber: 123,
      date: new Date('2026-11-19'),
    });
    expect(num).toBe('LKO1-C2-2627-000123');
  });
});

describe('UUIDv7 & GS1 DataMatrix Parser', () => {
  it('generates RFC 9562 compliant UUIDv7 with valid version 7 identifier', () => {
    const id = generateUuidV7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('parses GS1 DataMatrix barcode string into GTIN, Expiry, and Batch Number', () => {
    const rawGs1 = '(01)08901030001011(17)271231(10)BT2601';
    const parsed = parseGs1Barcode(rawGs1);

    expect(parsed.isGs1).toBe(true);
    expect(parsed.gtin).toBe('08901030001011');
    expect(parsed.expiryDate).toBe('2027-12-31');
    expect(parsed.batchNumber).toBe('BT2601');
  });

  it('handles regular 1D EAN-13 barcodes gracefully without GS1 error', () => {
    const rawEan = '8901030001011';
    const parsed = parseGs1Barcode(rawEan);

    expect(parsed.isGs1).toBe(false);
    expect(parsed.rawBarcode).toBe('8901030001011');
  });
});
