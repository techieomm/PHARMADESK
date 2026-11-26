import { describe, it, expect, beforeEach } from 'vitest';
import { getStockStatus, calculatePieces } from '@/utils/formatters';
import { allocateFefoStock, getDaysUntilExpiry } from '@/core/fefo/fefoEngine';
import { localDb } from '@/services/storage';

describe('Bajrang Pharmacy Inventory & Out-of-Stock Logic', () => {
  const branchId = 'c0000000-0000-0000-0000-000000000001';

  it('classifies 100 units, 5 units, and 0 units consistently', () => {
    const res100 = getStockStatus(100, 20);
    expect(res100.isAvailable).toBe(true);
    expect(res100.isOutOfStock).toBe(false);
    expect(res100.status).toBe('in_stock');

    const res5 = getStockStatus(5, 20);
    expect(res5.isAvailable).toBe(true);
    expect(res5.isOutOfStock).toBe(false);
    expect(res5.isLowStock).toBe(true);
    expect(res5.status).toBe('low_stock');

    const res0 = getStockStatus(0, 20);
    expect(res0.isAvailable).toBe(false);
    expect(res0.isOutOfStock).toBe(true);
    expect(res0.status).toBe('out_of_stock');
  });

  it('handles full stock lifecycle: add -> sell -> deplete -> restock', () => {
    const med = localDb.createMedicine({
      brand_name: 'Test Paracetamol 650',
      generic_name: 'Paracetamol',
      dosage_form: 'Tablet',
      manufacturer: 'Test Labs',
      packaging_label: '10 tablets per strip',
      pieces_per_strip: 10,
      mrp: 30,
      strip_selling_price: 25,
      piece_selling_price: 2.5,
      gst_rate: 12,
      min_stock_alert: 20,
      is_active: true,
    });

    // 1. Add 5 units (pieces)
    const add5 = localDb.adjustStockAtomic({
      branchId,
      medicineId: med.id,
      adjustmentType: 'add',
      unit: 'piece',
      quantity: 5,
    });
    expect(add5.newStockPieces).toBe(5);
    expect(getStockStatus(add5.newStockPieces, med.min_stock_alert).isAvailable).toBe(true);

    // 2. Sell 2 units -> 3 remaining
    localDb.createInvoiceAtomic({
      branchId,
      customerName: 'Test Patient',
      customerPhone: '',
      paymentMethod: 'cash',
      userId: 'u0000000-0000-0000-0000-000000000001',
      items: [
        {
          medicine: med,
          selected_unit: 'piece',
          unit_quantity: 2,
          unit_price: 2.5,
          item_total: 5,
          available_pieces: 5,
          required_pieces: 2,
        },
      ],
    });

    const afterSell2 = localDb.getInventoryItem(branchId, med.id);
    expect(afterSell2?.stock_pieces).toBe(3);

    // 3. Prevent selling more than available (4 > 3)
    expect(() =>
      localDb.createInvoiceAtomic({
        branchId,
        customerName: 'Test Patient',
        customerPhone: '',
        paymentMethod: 'cash',
        userId: 'u0000000-0000-0000-0000-000000000001',
        items: [
          {
            medicine: med,
            selected_unit: 'piece',
            unit_quantity: 4,
            unit_price: 2.5,
            item_total: 10,
            available_pieces: 3,
            required_pieces: 4,
          },
        ],
      })
    ).toThrow(/Insufficient stock/);

    // 4. Sell remaining 3 units -> 0 remaining (Out of Stock)
    localDb.createInvoiceAtomic({
      branchId,
      customerName: 'Test Patient',
      customerPhone: '',
      paymentMethod: 'cash',
      userId: 'u0000000-0000-0000-0000-000000000001',
      items: [
        {
          medicine: med,
          selected_unit: 'piece',
          unit_quantity: 3,
          unit_price: 2.5,
          item_total: 7.5,
          available_pieces: 3,
          required_pieces: 3,
        },
      ],
    });

    const afterSellAll = localDb.getInventoryItem(branchId, med.id);
    expect(afterSellAll?.stock_pieces).toBe(0);
    expect(getStockStatus(afterSellAll?.stock_pieces || 0, med.min_stock_alert).isOutOfStock).toBe(true);

    // 5. Add 10 more units to empty stock -> In Stock
    const restock10 = localDb.adjustStockAtomic({
      branchId,
      medicineId: med.id,
      adjustmentType: 'add',
      unit: 'piece',
      quantity: 10,
    });
    expect(restock10.newStockPieces).toBe(10);
    expect(getStockStatus(restock10.newStockPieces, med.min_stock_alert).isAvailable).toBe(true);
  });

  it('parses YYYY-MM-DD expiry dates accurately and allocates FEFO across multiple batches', () => {
    const ref = new Date(2026, 10, 25); // Nov 25, 2026
    expect(getDaysUntilExpiry('2026-11-26', ref)).toBe(1);
    expect(getDaysUntilExpiry('2026-11-25', ref)).toBe(0);

    const alloc = allocateFefoStock(
      [
        { id: 'b1', batch_number: 'B-OLD-EXP', expiry_date: '2026-11-20', stock_pieces: 50, mrp: 10 },
        { id: 'b2', batch_number: 'B-FIRST', expiry_date: '2027-01-15', stock_pieces: 3, mrp: 10 },
        { id: 'b3', batch_number: 'B-SECOND', expiry_date: '2027-06-30', stock_pieces: 10, mrp: 10 },
      ],
      calculatePieces(1, 'strip', 10),
      ref
    );

    expect(alloc.isFullyAllocated).toBe(true);
    expect(alloc.totalAllocatedPieces).toBe(10);
    expect(alloc.allocatedSlices).toHaveLength(2);
    expect(alloc.allocatedSlices[0].batchNumber).toBe('B-FIRST');
    expect(alloc.allocatedSlices[0].piecesAllocated).toBe(3);
    expect(alloc.allocatedSlices[1].batchNumber).toBe('B-SECOND');
    expect(alloc.allocatedSlices[1].piecesAllocated).toBe(7);
  });
});

describe('Bajrang Pharmacy Prescription / Patient Slip System', () => {
  const branchId = 'c0000000-0000-0000-0000-000000000001';

  it('creates doctors and generates unique sequential serial & prescription numbers without touching stock', () => {
    const doctor = localDb.createDoctor({
      full_name: 'Dr. A.K. Tripathi',
      registration_number: 'UPMC-78231',
      qualification: 'MBBS, MD',
      specialization: 'General Medicine',
      default_consultation_fee: 250,
      is_active: true,
    });

    const med = localDb.createMedicine({
      brand_name: 'Slip Isolation Test Med',
      generic_name: 'Amoxicillin',
      dosage_form: 'Capsule',
      manufacturer: 'Test Pharma',
      packaging_label: '10 capsules per strip',
      pieces_per_strip: 10,
      mrp: 80,
      strip_selling_price: 75,
      piece_selling_price: 7.5,
      gst_rate: 12,
      min_stock_alert: 20,
      is_active: true,
    });
    localDb.adjustStockAtomic({
      branchId,
      medicineId: med.id,
      adjustmentType: 'add',
      unit: 'piece',
      quantity: 40,
    });

    const invoicesBefore = localDb.getInvoices(branchId).length;

    const slip1 = localDb.createPrescriptionSlip({
      branchId,
      patientName: 'Ramesh Tiwari',
      doctorId: doctor.id,
      consultationFee: 250,
      paymentMethod: 'cash',
    });

    const slip2 = localDb.createPrescriptionSlip({
      branchId,
      patientName: 'Sunita Devi',
      doctorId: doctor.id,
      consultationFee: 300,
      paymentMethod: 'upi',
    });

    expect(slip1.serial_number).toBe('LKO1-SN-000001');
    expect(slip2.serial_number).toBe('LKO1-SN-000002');
    expect(slip1.prescription_number).not.toBe(slip2.prescription_number);
    expect(slip1.prescription_number).toMatch(/^RX-LKO1-\d{4}-000001$/);
    expect(slip2.prescription_number).toMatch(/^RX-LKO1-\d{4}-000002$/);
    expect(slip1.consultation_fee).toBe(250);
    expect(slip2.consultation_fee).toBe(300);

    // Ensure medicine stock and medicine invoices are untouched
    expect(localDb.getInventoryItem(branchId, med.id)?.stock_pieces).toBe(40);
    expect(localDb.getInvoices(branchId).length).toBe(invoicesBefore);
  });
});
