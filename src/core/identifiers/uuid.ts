/**
 * RFC 9562 Compliant UUIDv7 Generator
 * Time-ordered 128-bit UUID ensuring chronological database clustering and zero collisions across counters.
 */

let lastMs = 0;
let counter = 0;

export function generateUuidV7(): string {
  const now = Date.now();

  if (now === lastMs) {
    counter = (counter + 1) & 0xfff;
    if (counter === 0) {
      // Counter overflow within same millisecond, wait 1ms
      while (Date.now() <= now) {
        // Spin wait
      }
    }
  } else {
    lastMs = now;
    counter = Math.floor(Math.random() * 0xfff);
  }

  // 48-bit timestamp
  const timeHex = now.toString(16).padStart(12, '0');

  // 12-bit counter with 4-bit version 7 (0x7)
  const verAndSeq = (0x7000 | (counter & 0x0fff)).toString(16).padStart(4, '0');

  // 2-bit variant (10xx) + 14-bit random + 48-bit random
  const randA = (0x8000 | Math.floor(Math.random() * 0x3fff)).toString(16).padStart(4, '0');
  const randB = Math.floor(Math.random() * 0xffffffffffff).toString(16).padStart(12, '0');

  return `${timeHex.substring(0, 8)}-${timeHex.substring(8, 12)}-${verAndSeq}-${randA}-${randB}`.toLowerCase();
}

/**
 * Standard client ID generator (uses UUIDv7)
 */
export function generateClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return generateUuidV7();
    } catch {
      return crypto.randomUUID();
    }
  }
  return generateUuidV7();
}

/**
 * Generates an idempotency key for transactions.
 */
export function generateIdempotencyKey(prefix: string = 'tx'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
