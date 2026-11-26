/**
 * PharmaDesk FEFO (First-Expiry-First-Out) Inventory Allocation Engine
 * Pure TypeScript utility used for cart batch preview and mirrored in PostgreSQL RPCs.
 */

export interface AvailableBatch {
  id: string; // inventory_batches ID
  batch_number: string;
  expiry_date: string; // YYYY-MM-DD
  stock_pieces: number;
  mrp: number;
  purchase_rate?: number;
  rack_location?: string;
  created_at?: string;
}

export interface AllocatedBatchSlice {
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  piecesAllocated: number;
  mrp: number;
  purchaseRate?: number;
  daysUntilExpiry: number;
  isNearExpiry: boolean; // <90 days
}

export interface FefoAllocationResult {
  isFullyAllocated: boolean;
  requiredPieces: number;
  totalAllocatedPieces: number;
  unallocatedPieces: number;
  allocatedSlices: AllocatedBatchSlice[];
  warnings: string[];
  primaryBatchNumber?: string;
  primaryExpiryDate?: string;
  primaryMrp?: number;
}

/**
 * Calculates days between today and the expiry date.
 */
export function getDaysUntilExpiry(expiryDateStr: string, referenceDate: Date = new Date()): number {
  let expiry: Date;
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec((expiryDateStr || '').trim());
  if (isoMatch) {
    expiry = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  } else {
    expiry = new Date(expiryDateStr);
  }
  if (isNaN(expiry.getTime())) return 0;
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const diffTime = expiry.getTime() - today.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Allocates requested pieces from available batches using FEFO (First-Expiry-First-Out).
 * Automatically excludes already-expired batches.
 */
export function allocateFefoStock(
  batches: AvailableBatch[],
  requiredPieces: number,
  referenceDate: Date = new Date()
): FefoAllocationResult {
  const warnings: string[] = [];

  if (requiredPieces <= 0) {
    return {
      isFullyAllocated: true,
      requiredPieces: 0,
      totalAllocatedPieces: 0,
      unallocatedPieces: 0,
      allocatedSlices: [],
      warnings: [],
    };
  }

  // Filter out expired batches and batches with 0 stock, then sort by expiry date ascending
  const validBatches = batches
    .map(b => ({
      ...b,
      daysUntilExpiry: getDaysUntilExpiry(b.expiry_date, referenceDate),
    }))
    .filter(b => {
      if (b.daysUntilExpiry <= 0) {
        // Expired batch - blocked from sale
        return false;
      }
      return b.stock_pieces > 0;
    })
    .sort((a, b) => {
      const dateA = new Date(a.expiry_date).getTime();
      const dateB = new Date(b.expiry_date).getTime();
      if (dateA !== dateB) return dateA - dateB;
      // Secondary sort: created_at or id
      return (a.created_at || '').localeCompare(b.created_at || '');
    });

  let remainingToAllocate = requiredPieces;
  const allocatedSlices: AllocatedBatchSlice[] = [];

  for (const batch of validBatches) {
    if (remainingToAllocate <= 0) break;

    const allocatableFromThisBatch = Math.min(batch.stock_pieces, remainingToAllocate);
    const isNearExpiry = batch.daysUntilExpiry <= 90;

    if (isNearExpiry) {
      warnings.push(`Batch ${batch.batch_number} expires in ${batch.daysUntilExpiry} days (${batch.expiry_date})`);
    }

    allocatedSlices.push({
      batchId: batch.id,
      batchNumber: batch.batch_number,
      expiryDate: batch.expiry_date,
      piecesAllocated: allocatableFromThisBatch,
      mrp: batch.mrp,
      purchaseRate: batch.purchase_rate,
      daysUntilExpiry: batch.daysUntilExpiry,
      isNearExpiry,
    });

    remainingToAllocate -= allocatableFromThisBatch;
  }

  const totalAllocatedPieces = requiredPieces - remainingToAllocate;
  const isFullyAllocated = remainingToAllocate === 0;

  if (!isFullyAllocated) {
    warnings.push(`Insufficient stock: needed ${requiredPieces} pieces, only ${totalAllocatedPieces} available in sellable batches`);
  }

  const primarySlice = allocatedSlices[0];

  return {
    isFullyAllocated,
    requiredPieces,
    totalAllocatedPieces,
    unallocatedPieces: Math.max(0, remainingToAllocate),
    allocatedSlices,
    warnings,
    primaryBatchNumber: primarySlice?.batchNumber,
    primaryExpiryDate: primarySlice?.expiryDate,
    primaryMrp: primarySlice?.mrp,
  };
}
