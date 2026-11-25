/**
 * Indian Pharmacy Financial Year & Counter Sequence Utilities
 * Format: {BranchPrefix}-{CounterCode}-{FinancialYear}-{Sequence}
 * Example: LKO1-C1-2627-000042
 */

/**
 * Returns Indian Financial Year code (e.g., '2627' for FY 2026-2027).
 * Indian FY starts 1st April and ends 31st March.
 */
export function getIndianFinancialYearCode(date: Date = new Date()): string {
  const month = date.getMonth(); // 0-indexed: Jan=0, Feb=1, Mar=2, Apr=3
  const year = date.getFullYear();

  let startYear = year;
  let endYear = year + 1;

  if (month < 3) {
    // January, February, March belong to previous calendar start year
    startYear = year - 1;
    endYear = year;
  }

  const startPart = (startYear % 100).toString().padStart(2, '0');
  const endPart = (endYear % 100).toString().padStart(2, '0');

  return `${startPart}${endPart}`;
}

export interface InvoiceNumberFormatOptions {
  branchPrefix: string; // e.g. 'LKO1'
  counterCode: string; // e.g. 'C1'
  sequenceNumber: number; // e.g. 42
  date?: Date;
  digits?: number; // e.g. 6 digits -> 000042
}

/**
 * Generates formatted invoice number.
 */
export function formatInvoiceNumber({
  branchPrefix,
  counterCode,
  sequenceNumber,
  date = new Date(),
  digits = 6,
}: InvoiceNumberFormatOptions): string {
  const cleanBranch = (branchPrefix || 'BR01').trim().toUpperCase();
  const cleanCounter = (counterCode || 'C1').trim().toUpperCase();
  const fyCode = getIndianFinancialYearCode(date);
  const paddedSeq = sequenceNumber.toString().padStart(digits, '0');

  return `${cleanBranch}-${cleanCounter}-${fyCode}-${paddedSeq}`;
}

/**
 * Parses an invoice number into its components.
 */
export function parseInvoiceNumber(invoiceNum: string): {
  isValid: boolean;
  branchPrefix?: string;
  counterCode?: string;
  fyCode?: string;
  sequence?: number;
} {
  const parts = invoiceNum.split('-');
  if (parts.length === 4) {
    const sequence = parseInt(parts[3], 10);
    return {
      isValid: !isNaN(sequence),
      branchPrefix: parts[0],
      counterCode: parts[1],
      fyCode: parts[2],
      sequence,
    };
  }
  return { isValid: false };
}
