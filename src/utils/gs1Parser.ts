/**
 * GS1 / DataMatrix Barcode String Parser
 * Standard Application Identifiers (AI):
 * (01): GTIN - 14 digits
 * (17): Expiration date - YYMMDD
 * (10): Batch / Lot number - variable length (up to 20 chars)
 * (21): Serial number
 */

export interface ParsedGs1Barcode {
  isGs1: boolean;
  rawBarcode: string;
  gtin?: string;
  batchNumber?: string;
  expiryDate?: string; // Formatted as YYYY-MM-DD
  serialNumber?: string;
}

export function parseGs1Barcode(raw: string): ParsedGs1Barcode {
  const clean = (raw || '').trim();

  // If barcode does not contain GS1 AI indicators or bracketed AIs, treat as plain barcode
  const hasParentheses = clean.includes('(01)') || clean.includes('(17)') || clean.includes('(10)');
  const hasFnc1OrGs = clean.startsWith('01') && clean.length >= 16;

  if (!hasParentheses && !hasFnc1OrGs) {
    return {
      isGs1: false,
      rawBarcode: clean,
    };
  }

  const result: ParsedGs1Barcode = {
    isGs1: true,
    rawBarcode: clean,
  };

  try {
    if (hasParentheses) {
      // Format with parentheses: (01)08901030001011(17)271231(10)BT2601
      const gtinMatch = clean.match(/\(01\)(\d{14})/);
      if (gtinMatch) result.gtin = gtinMatch[1];

      const expiryMatch = clean.match(/\(17\)(\d{6})/);
      if (expiryMatch) {
        const yymmdd = expiryMatch[1];
        const yy = parseInt(yymmdd.substring(0, 2), 10);
        const mm = yymmdd.substring(2, 4);
        const dd = yymmdd.substring(4, 6);
        const year = 2000 + yy;
        result.expiryDate = `${year}-${mm}-${dd}`;
      }

      const batchMatch = clean.match(/\(10\)([a-zA-Z0-9_-]+)/);
      if (batchMatch) result.batchNumber = batchMatch[1];

      const serialMatch = clean.match(/\(21\)([a-zA-Z0-9_-]+)/);
      if (serialMatch) result.serialNumber = serialMatch[1];
    } else {
      // Plain prefix format: 01 + 14 digits GTIN + 17 + 6 digits YYMMDD + 10 + batch
      if (clean.startsWith('01') && clean.length >= 16) {
        result.gtin = clean.substring(2, 16);
        let pos = 16;
        while (pos < clean.length) {
          const ai = clean.substring(pos, pos + 2);
          if (ai === '17') {
            const yymmdd = clean.substring(pos + 2, pos + 8);
            const yy = parseInt(yymmdd.substring(0, 2), 10);
            const mm = yymmdd.substring(2, 4);
            const dd = yymmdd.substring(4, 6);
            result.expiryDate = `${2000 + yy}-${mm}-${dd}`;
            pos += 8;
          } else if (ai === '10') {
            // Batch extends to end or separator
            result.batchNumber = clean.substring(pos + 2);
            break;
          } else {
            pos += 2;
          }
        }
      }
    }
  } catch {
    // If parsing fails, fall back to plain barcode
    return {
      isGs1: false,
      rawBarcode: clean,
    };
  }

  return result;
}
