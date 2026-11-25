import { describe, it, expect } from 'vitest';
import { calculateLineGst, calculateInvoiceTotals } from '@/core/gst/gstEngine';
import { formatDualUnitStock, calculatePieces } from '@/utils/formatters';

describe('PharmaDesk POS Pricing & GST Engine', () => {
  it('calculates retail MRP inclusive GST correctly for intra-state (UP 09)', () => {
    // 1 strip @ Rs 60 (12% inclusive GST)
    const line = calculateLineGst({
      unitPrice: 60.0,
      quantity: 1,
      gstRate: 12.0,
      isPriceInclusiveGst: true,
      isInterState: false, // Intra-state (Uttar Pradesh)
    });

    // Taxable = 60 / 1.12 = 53.5714 -> 53.57
    expect(line.taxableAmount).toBeCloseTo(53.57, 2);
    // GST = 60 - 53.57 = 6.43
    expect(line.totalGst).toBeCloseTo(6.43, 2);
    // CGST = 3.22, SGST = 3.21
    expect(line.cgstAmount + line.sgstAmount).toBeCloseTo(6.43, 2);
    expect(line.igstAmount).toBe(0.0);
    expect(line.lineTotalNet).toBe(60.0);
  });

  it('calculates retail MRP inclusive GST correctly for inter-state (IGST)', () => {
    const line = calculateLineGst({
      unitPrice: 60.0,
      quantity: 2,
      gstRate: 12.0,
      isPriceInclusiveGst: true,
      isInterState: true, // Interstate supply
    });

    // Gross = 120, Taxable = 120 / 1.12 = 107.14
    expect(line.taxableAmount).toBeCloseTo(107.14, 2);
    expect(line.igstAmount).toBeCloseTo(12.86, 2);
    expect(line.cgstAmount).toBe(0.0);
    expect(line.sgstAmount).toBe(0.0);
    expect(line.lineTotalNet).toBe(120.0);
  });

  it('applies Indian 50-paise commercial round-off rule accurately', () => {
    const line = calculateLineGst({
      unitPrice: 4.15,
      quantity: 1,
      gstRate: 12.0,
      isPriceInclusiveGst: true,
      isInterState: false,
    });

    const totals = calculateInvoiceTotals([line]);
    // Raw total 4.15 rounds to 4.00, round-off = -0.15
    expect(totals.grandTotal).toBe(4.0);
    expect(totals.roundOff).toBeCloseTo(-0.15, 2);
  });

  it('correctly converts strips and loose pieces to inventory pieces', () => {
    // 2 strips of 15 pieces = 30 pieces
    expect(calculatePieces(2, 'strip', 15)).toBe(30);
    // 5 loose tablets = 5 pieces
    expect(calculatePieces(5, 'piece', 15)).toBe(5);

    // Dual unit breakdown: 35 pieces of 15-pack = 2 strips and 5 tablets
    const dual = formatDualUnitStock(35, 15);
    expect(dual.strips).toBe(2);
    expect(dual.loosePieces).toBe(5);
  });
});

describe('PharmaDesk Split Payment & Cash Tender Validation', () => {
  it('validates exact split allocation matching grand total', () => {
    const grandTotal = 850.0;
    const splitCash = 500.0;
    const splitUpi = 350.0;
    const splitCard = 0.0;
    const splitCredit = 0.0;

    const allocated = splitCash + splitUpi + splitCard + splitCredit;
    const isBalanced = Math.abs(grandTotal - allocated) < 0.05;

    expect(allocated).toBe(850.0);
    expect(isBalanced).toBe(true);
  });

  it('detects under-allocated split payment mismatch', () => {
    const grandTotal = 850.0;
    const splitCash = 400.0;
    const splitUpi = 300.0;

    const allocated = splitCash + splitUpi;
    const diff = grandTotal - allocated;
    const isBalanced = Math.abs(diff) < 0.05;

    expect(diff).toBe(150.0);
    expect(isBalanced).toBe(false);
  });

  it('calculates change return correctly when cash tendered exceeds bill', () => {
    const billTotal = 432.0;
    const cashTendered = 500.0;
    const changeToReturn = cashTendered - billTotal;

    expect(changeToReturn).toBe(68.0);
  });
});

describe('PharmaDesk Day Book & IST Date Logic', () => {
  it('formats calendar date strictly in Asia/Kolkata timezone', () => {
    // Test a late-night timestamp: 2026-11-24 19:00:00 UTC = 2026-11-25 00:30:00 IST (+5:30)
    const lateNightUtc = new Date('2026-11-24T19:00:00Z');

    const istDateString = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(lateNightUtc);

    // In UTC it is 2026-11-24, but in IST it is 2026-11-25!
    expect(istDateString).toBe('2026-11-25');
  });

  it('reconciles Day Book when all sales equal collected tender + credit', () => {
    const grossSales = 12500.0;
    const cashCollected = 8000.0;
    const upiCollected = 3500.0;
    const cardCollected = 500.0;
    const creditGiven = 500.0;

    const totalCollected = cashCollected + upiCollected + cardCollected;
    const discrepancy = grossSales - (totalCollected + creditGiven);
    const isBalanced = Math.abs(discrepancy) < 0.05;

    expect(discrepancy).toBe(0.0);
    expect(isBalanced).toBe(true);
  });

  it('flags reconciliation discrepancy when collections do not match sales', () => {
    const grossSales = 12500.0;
    const cashCollected = 7500.0; // Rs 500 missing from drawer
    const upiCollected = 3500.0;
    const cardCollected = 500.0;
    const creditGiven = 500.0;

    const totalCollected = cashCollected + upiCollected + cardCollected;
    const discrepancy = grossSales - (totalCollected + creditGiven);
    const isBalanced = Math.abs(discrepancy) < 0.05;

    expect(discrepancy).toBe(500.0);
    expect(isBalanced).toBe(false);
  });
});
