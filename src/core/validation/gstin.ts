/**
 * Indian GSTIN Validation and Analysis Utilities
 * Standard 15-character Goods and Services Tax Identification Number
 */

export const INDIAN_STATES: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
};

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export interface GstinValidationResult {
  isValid: boolean;
  gstin: string;
  stateCode?: string;
  stateName?: string;
  pan?: string;
  isUttarPradesh?: boolean;
  error?: string;
}

/**
 * Calculates and validates the Modulo 36 checksum of a 15-digit GSTIN.
 */
export function verifyGstinChecksum(gstin: string): boolean {
  if (gstin.length !== 15) return false;

  const chars = gstin.toUpperCase().split('');
  let sum = 0;

  for (let i = 0; i < 14; i++) {
    const char = chars[i];
    const val = ALPHANUMERIC.indexOf(char);
    if (val === -1) return false;

    // Weight alternates 1, 2
    const factor = (i % 2 === 0) ? 1 : 2;
    const product = val * factor;
    const quotient = Math.floor(product / 36);
    const remainder = product % 36;
    sum += quotient + remainder;
  }

  const remainder = sum % 36;
  const checkCodeIndex = (36 - remainder) % 36;
  const expectedChar = ALPHANUMERIC[checkCodeIndex];

  return chars[14] === expectedChar;
}

/**
 * Validates GSTIN format, state code, checksum, and extracts state and PAN.
 */
export function validateGstin(rawGstin: string): GstinValidationResult {
  const gstin = (rawGstin || '').trim().toUpperCase();

  if (!gstin) {
    return { isValid: false, gstin: '', error: 'GSTIN is required' };
  }

  if (gstin.length !== 15) {
    return { isValid: false, gstin, error: 'GSTIN must be exactly 15 characters' };
  }

  if (!GSTIN_REGEX.test(gstin)) {
    return { isValid: false, gstin, error: 'Invalid GSTIN structure or characters' };
  }

  const stateCode = gstin.substring(0, 2);
  const stateName = INDIAN_STATES[stateCode];

  if (!stateName) {
    return { isValid: false, gstin, stateCode, error: `Invalid GST state code: ${stateCode}` };
  }

  const isValidChecksum = verifyGstinChecksum(gstin);
  if (!isValidChecksum) {
    return { isValid: false, gstin, stateCode, stateName, error: 'GSTIN checksum verification failed' };
  }

  // PAN is characters 3 to 12 (indices 2 to 12)
  const pan = gstin.substring(2, 12);
  const isUttarPradesh = stateCode === '09';

  return {
    isValid: true,
    gstin,
    stateCode,
    stateName,
    pan,
    isUttarPradesh,
  };
}

/**
 * Derives PAN from a valid or raw GSTIN.
 */
export function extractPanFromGstin(gstin: string): string {
  const clean = (gstin || '').trim().toUpperCase();
  if (clean.length >= 12) {
    return clean.substring(2, 12);
  }
  return '';
}
