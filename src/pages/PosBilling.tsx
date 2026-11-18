import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { medicineService, inventoryService, billingService } from '@/services/api';
import { Medicine, BranchInventory, CartItem, PaymentMethod, Invoice } from '@/types';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Badge } from '@/components/common/Badge';
import { Card } from '@/components/common/Card';
import { EmptyState } from '@/components/common/EmptyState';
import { formatCurrency, formatDualUnitStock, calculatePieces } from '@/utils/formatters';
import { useBarcodeScanner } from '@/components/common/BarcodeScannerListener';
import { parseBarcode } from '@/utils/barcode';
import { InvoicePrintModal } from '@/components/pos/InvoicePrintModal';
import { 
  Scan, 
  Search, 
  Trash2, 
  Receipt, 
  CreditCard, 
  Banknote, 
  QrCode, 
  AlertTriangle,
  Building2,
  CheckCircle2
} from 'lucide-react';

export const PosBilling: React.FC = () => {
  const { user } = useAuth();
  const { branches, selectedBranchId, setSelectedBranchId } = useBranch();

  // Resolve active billing branch
  const billingBranchId = selectedBranchId === 'all' 
    ? (user?.primary_branch_id || branches[0]?.id || '') 
    : selectedBranchId;
  const currentBranch = branches.find(b => b.id === billingBranchId);

  // Customer state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');

  // Search & Cart state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Medicine[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [branchInventory, setBranchInventory] = useState<BranchInventory[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Completed invoice for printing
  const [completedInvoice, setCompletedInvoice] = useState<Invoice | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load branch inventory on branch change
  const loadInventory = async () => {
    if (!billingBranchId) return;
    try {
      const inv = await inventoryService.getBranchInventory(billingBranchId);
      setBranchInventory(inv);
    } catch (e) {
      console.error('Failed to load inventory for branch:', e);
    }
  };

  useEffect(() => {
    loadInventory();
  }, [billingBranchId]);

  // Barcode scanner listener
  useBarcodeScanner({
    enabled: true,
    beepOnScan: true,
    onScan: async (rawBarcode) => {
      const parsed = parseBarcode(rawBarcode);
      const codeToSearch = parsed.gtin || parsed.raw;

      try {
        const med = await medicineService.getMedicineByBarcode(codeToSearch);
        if (med) {
          addMedicineToCart(med);
        } else {
          setErrorMsg(`Barcode "${codeToSearch}" not found in medicine master.`);
          setTimeout(() => setErrorMsg(null), 4000);
        }
      } catch (err) {
        console.error('Barcode lookup error:', err);
      }
    },
  });

  // Search medicines
  useEffect(() => {
    const handler = setTimeout(async () => {
      if (searchQuery.trim().length >= 2) {
        setIsSearching(true);
        try {
          const results = await medicineService.searchMedicines(searchQuery);
          setSearchResults(results);
        } catch (e) {
          console.error(e);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 200);

    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Add medicine to cart
  const addMedicineToCart = (med: Medicine) => {
    setErrorMsg(null);
    const inv = branchInventory.find(i => i.medicine_id === med.id);
    const availablePieces = inv ? inv.stock_pieces : 0;

    setCart(prevCart => {
      const existingIdx = prevCart.findIndex(it => it.medicine.id === med.id);

      if (existingIdx >= 0) {
        const item = prevCart[existingIdx];
        const nextQty = item.unit_quantity + 1;
        const requiredPieces = calculatePieces(nextQty, item.selected_unit, med.pieces_per_strip);

        if (requiredPieces > availablePieces) {
          setErrorMsg(`Cannot add more "${med.brand_name}". Available stock: ${availablePieces} pieces.`);
          return prevCart;
        }

        const updated = [...prevCart];
        updated[existingIdx] = {
          ...item,
          unit_quantity: nextQty,
          item_total: Number((item.unit_price * nextQty).toFixed(2)),
          required_pieces: requiredPieces,
        };
        return updated;
      } else {
        // Add new line (Default to 1 Strip if strip price exists, else 1 Piece)
        const defaultUnit: 'strip' | 'piece' = med.strip_selling_price > 0 ? 'strip' : 'piece';
        const unitPrice = defaultUnit === 'strip' ? med.strip_selling_price : med.piece_selling_price;
        const requiredPieces = calculatePieces(1, defaultUnit, med.pieces_per_strip);

        if (requiredPieces > availablePieces) {
          setErrorMsg(`Out of stock for "${med.brand_name}". Available: ${availablePieces} pieces.`);
          return prevCart;
        }

        return [
          ...prevCart,
          {
            medicine: med,
            inventory: inv,
            selected_unit: defaultUnit,
            unit_quantity: 1,
            unit_price: unitPrice,
            item_total: unitPrice,
            available_pieces: availablePieces,
            required_pieces: requiredPieces,
          },
        ];
      }
    });

    setSearchQuery('');
    setSearchResults([]);
    searchInputRef.current?.focus();
  };

  // Update unit for a line item
  const handleUnitChange = (index: number, newUnit: 'strip' | 'piece') => {
    setCart(prev => {
      const updated = [...prev];
      const item = updated[index];
      const med = item.medicine;
      const unitPrice = newUnit === 'strip' ? med.strip_selling_price : med.piece_selling_price;
      const requiredPieces = calculatePieces(item.unit_quantity, newUnit, med.pieces_per_strip);

      updated[index] = {
        ...item,
        selected_unit: newUnit,
        unit_price: unitPrice,
        item_total: Number((unitPrice * item.unit_quantity).toFixed(2)),
        required_pieces: requiredPieces,
      };
      return updated;
    });
  };

  // Update quantity for a line item
  const handleQuantityChange = (index: number, valStr: string) => {
    const qty = parseFloat(valStr) || 0;
    if (qty < 0) return;

    setCart(prev => {
      const updated = [...prev];
      const item = updated[index];
      const med = item.medicine;
      const requiredPieces = calculatePieces(qty, item.selected_unit, med.pieces_per_strip);

      updated[index] = {
        ...item,
        unit_quantity: qty,
        item_total: Number((item.unit_price * qty).toFixed(2)),
        required_pieces: requiredPieces,
      };
      return updated;
    });
  };

  const removeItem = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  // Calculate cart summary
  const totalAmountPayable = cart.reduce((sum, it) => sum + it.item_total, 0);
  const totalItemsCount = cart.length;

  // Complete & Generate Bill
  const handleCompleteBill = async () => {
    setErrorMsg(null);

    if (!billingBranchId) {
      setErrorMsg('Please select a valid branch for billing.');
      return;
    }
    if (!customerName.trim()) {
      setErrorMsg('Customer name is required.');
      return;
    }
    if (!customerPhone.trim()) {
      setErrorMsg('Customer phone number is required.');
      return;
    }
    if (cart.length === 0) {
      setErrorMsg('Cannot generate bill with empty cart.');
      return;
    }

    // Verify stock constraints
    for (const item of cart) {
      if (item.unit_quantity <= 0) {
        setErrorMsg(`Quantity for "${item.medicine.brand_name}" must be greater than zero.`);
        return;
      }
      if (item.required_pieces > item.available_pieces) {
        setErrorMsg(
          `Insufficient stock for "${item.medicine.brand_name}". Available: ${item.available_pieces} pieces, Required: ${item.required_pieces} pieces.`
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const res = await billingService.createInvoiceAtomic({
        branchId: billingBranchId,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        paymentMethod,
        items: cart,
        userId: user?.id || '',
      });

      // Bill completed successfully!
      setCompletedInvoice(res.invoice);
      setShowPrintModal(true);

      // Reset cart and fields
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      await loadInventory();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to complete bill. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Branch Status */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-charcoal-200">
        <div>
          <h1 className="text-xl font-bold text-charcoal-900 tracking-tight">POS Terminal Billing</h1>
          <p className="text-xs text-charcoal-500 mt-0.5">
            Rapid medicine billing, dual-unit conversion & GST tax invoice generation.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-md border border-charcoal-200">
          <Building2 className="w-4 h-4 text-brand-600" />
          <span className="text-xs font-semibold text-charcoal-700">Billing Branch:</span>
          {user?.role === 'master_admin' ? (
            <select
              value={billingBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="text-xs font-bold text-charcoal-900 bg-cream-50 border border-charcoal-200 rounded px-2 py-1 focus:outline-none"
            >
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name} ({b.branch_code})</option>
              ))}
            </select>
          ) : (
            <span className="text-xs font-bold text-charcoal-900 bg-cream-100 px-2 py-0.5 rounded">
              {currentBranch?.name || 'Assigned Branch'}
            </span>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2.5 text-xs text-red-800 font-medium animate-shake">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Grid: Left (Customer & Items) vs Right (Summary & Checkout) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Customer Details Box */}
          <Card className="p-4 bg-white">
            <h3 className="text-xs font-bold text-charcoal-700 uppercase tracking-wider mb-3">
              1. Customer Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Customer Full Name *"
                placeholder="e.g. Ramesh Kumar"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
              />
              <Input
                label="Customer Phone Number *"
                placeholder="e.g. 9876543210"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                required
              />
            </div>
          </Card>

          {/* Barcode & Medicine Search Box */}
          <Card className="p-4 bg-white relative">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-charcoal-700 uppercase tracking-wider">
                2. Scan Barcode or Search Medicine
              </h3>
              <div className="flex items-center gap-1.5 text-[11px] text-charcoal-500">
                <Scan className="w-3.5 h-3.5 text-brand-600 animate-pulse" />
                <span>USB Scanner Ready</span>
              </div>
            </div>

            <div className="relative">
              <Input
                ref={searchInputRef}
                placeholder="Scan barcode or type Brand Name, Generic Composition, Manufacturer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
                autoComplete="off"
              />

              {/* Live search results dropdown */}
              {searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-charcoal-200 rounded-md shadow-lg z-20 max-h-64 overflow-y-auto">
                  {searchResults.map((med) => {
                    const inv = branchInventory.find(i => i.medicine_id === med.id);
                    const stock = inv ? inv.stock_pieces : 0;
                    const dual = formatDualUnitStock(stock, med.pieces_per_strip);
                    const isOutOfStock = stock <= 0;

                    return (
                      <button
                        key={med.id}
                        type="button"
                        onClick={() => addMedicineToCart(med)}
                        disabled={isOutOfStock}
                        className={`w-full text-left px-4 py-2.5 border-b border-charcoal-100 hover:bg-cream-50 flex items-center justify-between transition-colors ${
                          isOutOfStock ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-charcoal-900">{med.brand_name}</span>
                            <span className="text-[10px] text-charcoal-500">{med.strength}</span>
                            <Badge variant="neutral" className="text-[10px] py-0">{med.dosage_form}</Badge>
                          </div>
                          <p className="text-[11px] text-charcoal-500">{med.generic_name} • {med.manufacturer}</p>
                          {med.barcode && (
                            <p className="text-[10px] font-mono text-charcoal-400">Barcode: {med.barcode}</p>
                          )}
                        </div>

                        <div className="text-right">
                          <div className="text-xs font-bold text-charcoal-900">
                            {formatCurrency(med.strip_selling_price)} / strip
                          </div>
                          <div className="text-[10px] text-charcoal-600">
                            ({formatCurrency(med.piece_selling_price)} / pc)
                          </div>
                          <div className="mt-0.5">
                            <span className={`text-[10px] font-semibold ${isOutOfStock ? 'text-red-600 font-bold' : 'text-emerald-700'}`}>
                              {isOutOfStock ? 'Out of Stock' : dual.display}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>

          {/* Billing Cart Items Table */}
          <Card className="bg-white overflow-hidden" noPadding>
            <div className="px-5 py-3 border-b border-charcoal-100 bg-cream-50/50 flex items-center justify-between">
              <h3 className="text-xs font-bold text-charcoal-700 uppercase tracking-wider">
                3. Invoice Items ({totalItemsCount})
              </h3>
              {cart.length > 0 && (
                <button
                  onClick={() => setCart([])}
                  className="text-xs text-red-600 hover:text-red-700 font-semibold"
                >
                  Clear Cart
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  title="Cart is currently empty"
                  description="Scan a medicine barcode or use search bar above to add items to bill."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-charcoal-200 bg-cream-50 text-charcoal-600 font-semibold uppercase text-[11px]">
                      <th className="py-2.5 px-4">Medicine Item</th>
                      <th className="py-2.5 px-3">Available Stock</th>
                      <th className="py-2.5 px-3 w-28">Quantity</th>
                      <th className="py-2.5 px-3 w-32">Unit Selector</th>
                      <th className="py-2.5 px-3 text-right">Unit Price</th>
                      <th className="py-2.5 px-4 text-right">Line Total</th>
                      <th className="py-2.5 px-2 text-center w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-charcoal-100">
                    {cart.map((item, idx) => {
                      const dual = formatDualUnitStock(item.available_pieces, item.medicine.pieces_per_strip);
                      const isStockExceeded = item.required_pieces > item.available_pieces;

                      return (
                        <tr key={item.medicine.id} className={isStockExceeded ? 'bg-red-50/60' : 'hover:bg-cream-50/50'}>
                          <td className="py-3 px-4">
                            <span className="font-bold text-charcoal-900 block">{item.medicine.brand_name}</span>
                            <span className="text-[10px] text-charcoal-500">
                              {item.medicine.generic_name} ({item.medicine.pieces_per_strip} pcs/strip)
                            </span>
                          </td>

                          <td className="py-3 px-3">
                            <span className="text-xs font-medium text-charcoal-700 block">
                              {dual.display}
                            </span>
                            {isStockExceeded && (
                              <span className="text-[10px] font-bold text-red-600 block">
                                Exceeds by {item.required_pieces - item.available_pieces} pcs!
                              </span>
                            )}
                          </td>

                          {/* ONE Quantity Input */}
                          <td className="py-3 px-3">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={item.unit_quantity || ''}
                              onChange={(e) => handleQuantityChange(idx, e.target.value)}
                              className={`w-20 px-2 py-1 text-xs font-semibold rounded border focus:outline-none focus:ring-1 ${
                                isStockExceeded 
                                  ? 'border-red-400 bg-red-50 text-red-800 focus:ring-red-500' 
                                  : 'border-charcoal-300 focus:ring-brand-400'
                              }`}
                            />
                          </td>

                          {/* ONE Unit Selector (Strip / Piece) */}
                          <td className="py-3 px-3">
                            <select
                              value={item.selected_unit}
                              onChange={(e) => handleUnitChange(idx, e.target.value as 'strip' | 'piece')}
                              className="w-28 px-2 py-1 text-xs font-semibold rounded border border-charcoal-300 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400 cursor-pointer"
                            >
                              <option value="strip">Strip / Packet</option>
                              <option value="piece">Piece (Loose)</option>
                            </select>
                          </td>

                          <td className="py-3 px-3 text-right font-medium text-charcoal-700">
                            {formatCurrency(item.unit_price)}
                          </td>

                          <td className="py-3 px-4 text-right font-bold text-charcoal-900 text-sm">
                            {formatCurrency(item.item_total)}
                          </td>

                          <td className="py-3 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeItem(idx)}
                              className="p-1 text-charcoal-400 hover:text-red-600 rounded"
                              title="Remove item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Payment Method & Total Payable Checkout */}
        <div className="space-y-4">
          <Card className="p-5 bg-white space-y-5 sticky top-20">
            <div>
              <h3 className="text-xs font-bold text-charcoal-700 uppercase tracking-wider mb-2">
                4. Payment Method
              </h3>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`flex flex-col items-center justify-center p-3 rounded border text-xs font-bold transition-all ${
                    paymentMethod === 'cash'
                      ? 'bg-charcoal-800 text-brand-400 border-charcoal-900 shadow-xs'
                      : 'bg-white text-charcoal-700 border-charcoal-200 hover:bg-cream-50'
                  }`}
                >
                  <Banknote className="w-5 h-5 mb-1 text-brand-400" />
                  CASH
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('upi')}
                  className={`flex flex-col items-center justify-center p-3 rounded border text-xs font-bold transition-all ${
                    paymentMethod === 'upi'
                      ? 'bg-charcoal-800 text-brand-400 border-charcoal-900 shadow-xs'
                      : 'bg-white text-charcoal-700 border-charcoal-200 hover:bg-cream-50'
                  }`}
                >
                  <QrCode className="w-5 h-5 mb-1 text-brand-400" />
                  UPI / QR
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('card')}
                  className={`flex flex-col items-center justify-center p-3 rounded border text-xs font-bold transition-all ${
                    paymentMethod === 'card'
                      ? 'bg-charcoal-800 text-brand-400 border-charcoal-900 shadow-xs'
                      : 'bg-white text-charcoal-700 border-charcoal-200 hover:bg-cream-50'
                  }`}
                >
                  <CreditCard className="w-5 h-5 mb-1 text-brand-400" />
                  CARD
                </button>
              </div>
            </div>

            {/* Bill Summary Breakdown */}
            <div className="border-t border-charcoal-100 pt-4 space-y-2 text-xs">
              <div className="flex justify-between text-charcoal-600">
                <span>Items in Cart:</span>
                <span className="font-semibold text-charcoal-900">{totalItemsCount} medicines</span>
              </div>
              <div className="flex justify-between text-charcoal-600">
                <span>Tax Breakdown:</span>
                <span className="font-medium">Inclusive of GST</span>
              </div>
            </div>

            {/* SIMPLIFIED ACTUAL PAYABLE AMOUNT */}
            <div className="p-4 bg-cream-100/70 rounded-md border border-charcoal-200 text-center">
              <span className="text-xs font-bold text-charcoal-600 uppercase tracking-wider block mb-1">
                Total Amount Payable
              </span>
              <span className="text-3xl font-extrabold text-charcoal-900 font-sans tracking-tight">
                {formatCurrency(totalAmountPayable)}
              </span>
            </div>

            {/* Complete Bill Button */}
            <Button
              type="button"
              variant="primary"
              size="lg"
              className="w-full text-base py-3"
              disabled={cart.length === 0 || isSubmitting}
              isLoading={isSubmitting}
              onClick={handleCompleteBill}
            >
              <Receipt className="w-5 h-5 mr-2" />
              Complete Bill & Print
            </Button>

            <div className="text-[11px] text-charcoal-400 text-center leading-relaxed">
              Atomic transaction locks inventory and generates official GST invoice sequence.
            </div>
          </Card>
        </div>
      </div>

      {/* Invoice Print Modal */}
      <InvoicePrintModal
        invoice={completedInvoice}
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
      />
    </div>
  );
};
