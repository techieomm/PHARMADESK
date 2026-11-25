/**
 * PharmaDesk Shared Core GST Engine
 * Pure TypeScript utility for Indian GST calculations (mirrored in PostgreSQL RPCs).
 * Zero DOM or Supabase dependencies.
 */

export interface GstLineCalculationInput {
  unitPrice: number; // Selling price per unit (piece or strip)
  quantity: number; // Units sold
  gstRate: number; // e.g. 0, 5, 12, 18, 28
  discountAmount?: number; // Line-level discount in INR
  isPriceInclusiveGst?: boolean; // Retail pharmacy MRP/selling prices are inclusive by default
  isInterState?: boolean; // true if IGST applies (supplier state != customer state)
}

export interface GstLineCalculationResult {
  lineTotalGross: number; // Quantity * UnitPrice
  discountAmount: number;
  taxableAmount: number; // Base taxable value rounded to 2 decimals
  gstRate: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalGst: number;
  lineTotalNet: number; // Taxable + TotalGst
}

export interface InvoiceTotalsSummary {
  subtotalTaxable: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalGst: number;
  billDiscount: number;
  rawTotal: number;
  roundOff: number; // Difference between rounded grand total and raw total (+/-)
  grandTotal: number; // Final payable integer amount
  amountInWords: string;
}

/**
 * Rounds a number to exactly 2 decimal places using half-up arithmetic.
 */
export function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates GST breakdown for a single invoice item.
 */
export function calculateLineGst(input: GstLineCalculationInput): GstLineCalculationResult {
  const {
    unitPrice,
    quantity,
    gstRate,
    discountAmount = 0,
    isPriceInclusiveGst = true,
    isInterState = false,
  } = input;

  const lineTotalGross = round2(unitPrice * quantity);
  const effectiveTotal = Math.max(0, round2(lineTotalGross - discountAmount));

  let taxableAmount = 0;
  let totalGst = 0;

  if (gstRate === 0) {
    taxableAmount = effectiveTotal;
    totalGst = 0;
  } else if (isPriceInclusiveGst) {
    // Inclusive: EffectiveTotal = Taxable * (1 + rate / 100)
    taxableAmount = round2(effectiveTotal / (1 + gstRate / 100));
    totalGst = round2(effectiveTotal - taxableAmount);
  } else {
    // Exclusive: Taxable is base, GST is added on top
    taxableAmount = effectiveTotal;
    totalGst = round2(taxableAmount * (gstRate / 100));
  }

  let cgstRate = 0;
  let sgstRate = 0;
  let igstRate = 0;
  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;

  if (isInterState) {
    igstRate = gstRate;
    igstAmount = totalGst;
  } else {
    cgstRate = round2(gstRate / 2);
    sgstRate = round2(gstRate / 2);
    cgstAmount = round2(totalGst / 2);
    sgstAmount = round2(totalGst - cgstAmount); // Exact penny allocation
  }

  const lineTotalNet = isPriceInclusiveGst ? effectiveTotal : round2(taxableAmount + totalGst);

  return {
    lineTotalGross,
    discountAmount: round2(discountAmount),
    taxableAmount,
    gstRate,
    cgstRate,
    sgstRate,
    igstRate,
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalGst,
    lineTotalNet,
  };
}

/**
 * Aggregates line calculations into final invoice totals with round-off and amount in words.
 */
export function calculateInvoiceTotals(
  lines: GstLineCalculationResult[],
  billDiscount: number = 0
): InvoiceTotalsSummary {
  let subtotalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalGst = 0;
  let rawTotal = 0;

  for (const line of lines) {
    subtotalTaxable = round2(subtotalTaxable + line.taxableAmount);
    totalCgst = round2(totalCgst + line.cgstAmount);
    totalSgst = round2(totalSgst + line.sgstAmount);
    totalIgst = round2(totalIgst + line.igstAmount);
    totalGst = round2(totalGst + line.totalGst);
    rawTotal = round2(rawTotal + line.lineTotalNet);
  }

  const discountedRaw = Math.max(0, round2(rawTotal - billDiscount));
  const grandTotal = Math.round(discountedRaw);
  const roundOff = round2(grandTotal - discountedRaw);

  return {
    subtotalTaxable,
    totalCgst,
    totalSgst,
    totalIgst,
    totalGst,
    billDiscount: round2(billDiscount),
    rawTotal: discountedRaw,
    roundOff,
    grandTotal,
    amountInWords: numberToIndianWords(grandTotal),
  };
}

/**
 * Converts a numeric Indian Rupee amount to words (e.g., "Forty-Eight Thousand Two Hundred Fifty Rupees Only").
 */
export function numberToIndianWords(num: number): string {
  if (num === 0) return 'Zero Rupees Only';

  const singleDigits = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const twoDigits = [
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertThree = (n: number): string => {
    let str = '';
    if (Math.floor(n / 100) > 0) {
      str += singleDigits[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n >= 10 && n <= 19) {
      str += twoDigits[n - 10] + ' ';
    } else if (n >= 20 || n < 10) {
      const ten = Math.floor(n / 10);
      const unit = n % 10;
      if (ten > 0 && unit > 0) {
        str += tens[ten] + '-' + singleDigits[unit] + ' ';
      } else if (ten > 0) {
        str += tens[ten] + ' ';
      } else if (unit > 0) {
        str += singleDigits[unit] + ' ';
      }
    }
    return str.trim();
  };

  const rupees = Math.floor(Math.abs(num));
  let result = '';

  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const remainder = rupees % 1000;

  if (crore > 0) result += convertThree(crore) + ' Crore ';
  if (lakh > 0) result += convertThree(lakh) + ' Lakh ';
  if (thousand > 0) result += convertThree(thousand) + ' Thousand ';
  if (remainder > 0) result += convertThree(remainder) + ' ';

  return result.trim() + ' Rupees Only';
}
