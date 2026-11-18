/**
 * GS1 DataMatrix & 1D Barcode parser utility.
 * Supports standard 1D barcodes (EAN-13, UPC, Code 128)
 * as well as GS1 Application Identifiers:
 * (01) GTIN - 14 digits
 * (10) Batch / Lot Number
 * (17) Expiry Date - YYMMDD
 * (21) Serial Number
 */

export interface ParsedBarcode {
  raw: string;
  isGS1: boolean;
  gtin?: string;
  batchNumber?: string;
  expiryDate?: string; // Formatted YYYY-MM-DD
  serialNumber?: string;
}

export const parseBarcode = (rawInput: string): ParsedBarcode => {
  const input = rawInput.trim();
  const result: ParsedBarcode = {
    raw: input,
    isGS1: false,
  };

  if (!input) return result;

  // Check if barcode contains GS1 AI markers (either bracketed like "(01)...(10)..." or GS1 FNC1 formatted)
  const bracketMatches = input.match(/\((\d{2})\)([^()]+)/g);

  if (bracketMatches && bracketMatches.length > 0) {
    result.isGS1 = true;
    for (const match of bracketMatches) {
      const aiMatch = match.match(/\((\d{2})\)(.+)/);
      if (aiMatch) {
        const ai = aiMatch[1];
        const val = aiMatch[2].trim();

        if (ai === '01') {
          // GTIN
          result.gtin = val;
        } else if (ai === '10') {
          // Batch / Lot
          result.batchNumber = val;
        } else if (ai === '17') {
          // Expiration date YYMMDD
          if (val.length === 6) {
            const yy = parseInt(val.substring(0, 2), 10);
            const mm = val.substring(2, 4);
            const dd = val.substring(4, 6);
            const fullYear = 2000 + yy;
            result.expiryDate = `${fullYear}-${mm}-${dd}`;
          }
        } else if (ai === '21') {
          // Serial number
          result.serialNumber = val;
        }
      }
    }
    return result;
  }

  // Standard 1D barcode (EAN-13, GTIN-14, Code 128, etc.)
  result.gtin = input;
  return result;
};

/**
 * Audio feedback on successful barcode scan
 */
export const playScanBeep = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, audioCtx.currentTime); // Crisp pharmacy POS scanner beep
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
  } catch (e) {
    // Audio might be blocked if user hasn't interacted yet
  }
};
