/**
 * Format amount into Indian Rupee (INR) representation
 * Example: 1250 -> "₹1,250.00"
 */
export const formatCurrency = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '₹0.00';
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

/**
 * Format Date in Indian standard display (DD/MM/YYYY, hh:mm A)
 */
export const formatDate = (dateString: string | null | undefined, includeTime = true): string => {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '-';
    
    const options: Intl.DateTimeFormatOptions = {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    };

    if (includeTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
      options.hour12 = true;
    }

    return new Intl.DateTimeFormat('en-IN', options).format(d);
  } catch {
    return '-';
  }
};

/**
 * Convert pieces into dual-unit readable format:
 * Example: 104 pieces (10 pcs/strip) => "10 strips + 4 pcs (104 total)"
 */
export const formatDualUnitStock = (pieces: number, piecesPerStrip: number = 10): {
  strips: number;
  loosePieces: number;
  totalPieces: number;
  display: string;
} => {
  const safePieces = Math.max(0, pieces || 0);
  const pps = Math.max(1, piecesPerStrip || 10);
  const strips = Math.floor(safePieces / pps);
  const loosePieces = safePieces % pps;

  let display = '';
  if (strips > 0 && loosePieces > 0) {
    display = `${strips} strips + ${loosePieces} pcs (${safePieces} pcs)`;
  } else if (strips > 0) {
    display = `${strips} strips (${safePieces} pcs)`;
  } else {
    display = `${loosePieces} pcs`;
  }

  return {
    strips,
    loosePieces,
    totalPieces: safePieces,
    display,
  };
};

/**
 * Calculate pieces from entered quantity and unit
 */
export const calculatePieces = (quantity: number, unit: 'strip' | 'piece', piecesPerStrip: number = 10): number => {
  const pps = Math.max(1, piecesPerStrip || 10);
  if (unit === 'strip') {
    return Math.round(quantity * pps);
  }
  return Math.round(quantity);
};

export type StockStatusType = 'in_stock' | 'low_stock' | 'out_of_stock';

/**
 * Consistent stock status calculation shared across Inventory, Low Stock, Dashboard, and POS:
 * - availablePieces <= 0 => 'out_of_stock'
 * - 0 < availablePieces < threshold => 'low_stock' (still available/in-stock for billing!)
 * - availablePieces >= threshold => 'in_stock'
 */
export const getStockStatus = (
  availablePieces: number,
  minStockAlert: number = 20
): {
  status: StockStatusType;
  isAvailable: boolean;
  isOutOfStock: boolean;
  isLowStock: boolean;
  label: string;
} => {
  const qty = Math.max(0, Number(availablePieces) || 0);
  const threshold = Math.max(0, Number(minStockAlert ?? 20));

  if (qty <= 0) {
    return {
      status: 'out_of_stock',
      isAvailable: false,
      isOutOfStock: true,
      isLowStock: false,
      label: 'Out of Stock',
    };
  }

  if (threshold > 0 && qty < threshold) {
    return {
      status: 'low_stock',
      isAvailable: true,
      isOutOfStock: false,
      isLowStock: true,
      label: 'Low Stock',
    };
  }

  return {
    status: 'in_stock',
    isAvailable: true,
    isOutOfStock: false,
    isLowStock: false,
    label: 'In Stock',
  };
};
