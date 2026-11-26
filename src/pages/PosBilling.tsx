import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { useBarcodeScanner } from '@/context/BarcodeScannerContext';
import { repositories } from '@/data/repositories';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  Medicine,
  BranchInventory,
  InventoryBatch,
  CartItem,
  PaymentMethod,
  PaymentSplit,
  Invoice,
  Customer,
} from '@/types';
import {
  Button,
  Input,
  Badge,
  Card,
  Modal,
  Drawer,
  EmptyState,
  Select,
  CameraScannerModal,
} from '@/components/common';
import {
  formatCurrency,
  formatDualUnitStock,
  calculatePieces,
  getStockStatus,
} from '@/utils/formatters';
import {
  allocateFefoStock,
  getDaysUntilExpiry,
  calculateInvoiceTotals,
  calculateLineGst,
  generateIdempotencyKey,
} from '@/core';
import { InvoicePrintModal } from '@/components/pos/InvoicePrintModal';
import {
  Search,
  Trash2,
  Receipt,
  CreditCard,
  Banknote,
  QrCode,
  AlertTriangle,
  Camera,
  PauseCircle,
  PlayCircle,
  User,
  Phone,
  Calendar,
  MapPin,
  RotateCcw,
  CheckCircle2,
  UserPlus,
  RefreshCw,
  Plus,
  Minus,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';

export const PosBilling: React.FC = () => {
  const { user } = useAuth();
  const { branches, selectedBranchId } = useBranch();
  const { registerScanHandler, setActiveScreenContext } = useBarcodeScanner();

  // Active Billing Branch & Counter
  const billingBranchId =
    selectedBranchId === 'all'
      ? user?.primary_branch_id || branches[0]?.id || 'c0000000-0000-0000-0000-000000000001'
      : selectedBranchId;
  const currentBranch = branches.find((b) => b.id === billingBranchId);

  // Customer State
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAge, setCustomerAge] = useState<string>('');
  const [customerAddress, setCustomerAddress] = useState<string>('');
  const [customerId, setCustomerId] = useState<string | undefined>(undefined);
  const [customerGstin, setCustomerGstin] = useState<string>('');
  const [customerDue, setCustomerDue] = useState<number>(0);
  const [customerLimit, setCustomerLimit] = useState<number>(5000);
  const [doctorName, setDoctorName] = useState<string>('');
  const [doctorRegNo, setDoctorRegNo] = useState<string>('');

  const resetCustomer = () => {
    setCustomerName('Walk-in Customer');
    setCustomerPhone('');
    setCustomerAge('');
    setCustomerAddress('');
    setCustomerId(undefined);
    setCustomerGstin('');
    setCustomerDue(0);
    setCustomerLimit(5000);
    setDoctorName('');
    setDoctorRegNo('');
  };

  // Payment State
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cashTendered, setCashTendered] = useState<number | ''>('');
  const [paymentRefNumber, setPaymentRefNumber] = useState<string>('');
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([]);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [splitCash, setSplitCash] = useState<number>(0);
  const [splitUpi, setSplitUpi] = useState<number>(0);
  const [splitCard, setSplitCard] = useState<number>(0);
  const [splitCredit, setSplitCredit] = useState<number>(0);

  // Search & Cart
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Medicine[]>([]);
  const [allMedicines, setAllMedicines] = useState<Medicine[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [heldCarts, setHeldCarts] = useState<
    Array<{
      id: string;
      name: string;
      items: CartItem[];
      customer: string;
      phone?: string;
      age?: string;
      address?: string;
    }>
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals & Camera Scanner
  const [completedInvoice, setCompletedInvoice] = useState<Invoice | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [showSubstituteModal, setShowSubstituteModal] = useState(false);
  const [substituteOptions, setSubstituteOptions] = useState<Medicine[]>([]);
  const [selectedMedForSub, setSelectedMedForSub] = useState<Medicine | null>(null);
  const [showQuickCustomerModal, setShowQuickCustomerModal] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Set Barcode Scanner context to 'pos'
  useEffect(() => {
    setActiveScreenContext('pos');
  }, [setActiveScreenContext]);

  // Load Inventory Batches & Medicines
  const loadData = async () => {
    try {
      const [batchList, medList] = await Promise.all([
        repositories.inventory.getInventoryBatches(billingBranchId),
        repositories.medicines.getMedicines(),
      ]);
      setBatches(batchList);
      setAllMedicines(medList);
    } catch (err) {
      console.error('POS data load error:', err);
    }
  };

  useEffect(() => {
    loadData();

    if (!isSupabaseConfigured()) return;
    const channel = supabase
      .channel(`realtime_pos_batches_${billingBranchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_batches' },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [billingBranchId]);

  // Barcode Scan Handler
  useEffect(() => {
    const unregister = registerScanHandler('pos', async (scan) => {
      const code = scan.code;
      // 1. Check if barcode matches any medicine
      const found = await repositories.medicines.getMedicineByBarcode(code);
      if (found) {
        addMedicineToCart(found, scan.parsedGs1.batchNumber);
        return true;
      } else {
        setErrorMessage(`Barcode "${code}" not registered. Use 'Quick Add' in Medicine Master.`);
        setTimeout(() => setErrorMessage(null), 4000);
        return false;
      }
    });

    return () => unregister();
  }, [registerScanHandler, batches, allMedicines]);

  // Keyboard Shortcuts (F1, F2, F4, F7, F8, F9)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        handleHoldCart();
      } else if (e.key === 'F7') {
        e.preventDefault();
        setShowQuickCustomerModal(true);
      } else if (e.key === 'F8') {
        e.preventDefault();
        setIsSplitModalOpen(true);
      } else if (e.key === 'F9') {
        e.preventDefault();
        if (!isSubmitting) {
          setPaymentMethod('cash');
          handleCheckout('cash');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, customerName, customerPhone, paymentMethod, isSubmitting]);

  // Debounced Medicine Search
  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      setIsSearching(true);
      const timer = setTimeout(async () => {
        try {
          const res = await repositories.medicines.searchMedicines(searchQuery);
          setSearchResults(res);
        } catch (e) {
          console.error(e);
        } finally {
          setIsSearching(false);
        }
      }, 150);
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  // Customer Phone lookup
  const handlePhoneLookup = async (phone: string) => {
    setCustomerPhone(phone);
    const cleanDigits = phone.replace(/[^0-9]/g, '');
    if (cleanDigits.length === 10) {
      try {
        const cust = await repositories.customers.getCustomerByPhone(cleanDigits);
        if (cust) {
          setCustomerId(cust.id);
          setCustomerName(cust.name);
          if (cust.age) setCustomerAge(String(cust.age));
          if (cust.address) setCustomerAddress(cust.address);
          setCustomerGstin(cust.gstin || '');
          setCustomerDue(cust.outstanding_balance);
          setCustomerLimit(cust.credit_limit);
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const getSellableBatches = (medicineId: string) => {
    return batches.filter(
      (b) =>
        b.medicine_id === medicineId &&
        b.is_active &&
        b.stock_pieces > 0 &&
        (!b.expiry_date || getDaysUntilExpiry(b.expiry_date) > 0)
    );
  };

  // Add item to cart with FEFO batch selection & expiry checks
  const addMedicineToCart = (med: Medicine, preferredBatchNumber?: string) => {
    setErrorMessage(null);
    const medBatches = getSellableBatches(med.id);
    const totalAvailablePieces = medBatches.reduce((sum, b) => sum + b.stock_pieces, 0);

    if (medBatches.length === 0 || totalAvailablePieces <= 0) {
      setErrorMessage(`No sellable stock for "${med.brand_name}". Batches empty or expired.`);
      return;
    }

    const piecesPerStrip = Math.max(1, med.pieces_per_strip || 1);
    const primaryBatch = preferredBatchNumber
      ? medBatches.find((b) => b.batch_number === preferredBatchNumber) || medBatches[0]
      : medBatches[0];

    setCart((prev) => {
      const idx = prev.findIndex((i) => i.medicine.id === med.id);
      if (idx >= 0) {
        const existing = prev[idx];
        const nextQty = existing.unit_quantity + 1;
        const totalPieces = calculatePieces(nextQty, existing.selected_unit, piecesPerStrip);

        const checkAlloc = allocateFefoStock(medBatches, totalPieces);
        if (!checkAlloc.isFullyAllocated) {
          setErrorMessage(`Cannot add more "${med.brand_name}". Available: ${checkAlloc.totalAllocatedPieces} pieces.`);
          return prev;
        }

        const updated = [...prev];
        updated[idx] = {
          ...existing,
          unit_quantity: nextQty,
          item_total: Number((existing.unit_price * nextQty).toFixed(2)),
          available_pieces: totalAvailablePieces,
          required_pieces: totalPieces,
        };
        return updated;
      } else {
        // If strip price is valid AND at least 1 full strip is available, default to strip; otherwise piece
        const canDefaultStrip = med.strip_selling_price > 0 && totalAvailablePieces >= piecesPerStrip;
        const defaultUnit: 'strip' | 'piece' = canDefaultStrip ? 'strip' : 'piece';
        const fallbackPiecePrice =
          med.piece_selling_price > 0
            ? med.piece_selling_price
            : Number(((med.strip_selling_price || med.mrp || 0) / piecesPerStrip).toFixed(2));
        const price = defaultUnit === 'strip' ? med.strip_selling_price : fallbackPiecePrice;
        const reqPieces = calculatePieces(1, defaultUnit, piecesPerStrip);

        const fefoAlloc = allocateFefoStock(medBatches, reqPieces);
        if (!fefoAlloc.isFullyAllocated) {
          setErrorMessage(`Insufficient pieces for "${med.brand_name}". Sellable: ${fefoAlloc.totalAllocatedPieces} pcs.`);
          return prev;
        }

        const isNearExpiry = fefoAlloc.warnings.length > 0;

        return [
          ...prev,
          {
            medicine: med,
            selectedBatch: primaryBatch,
            selected_unit: defaultUnit,
            unit_quantity: 1,
            unit_price: price,
            item_total: price,
            available_pieces: totalAvailablePieces,
            required_pieces: reqPieces,
            warning: isNearExpiry ? 'Expires in <90 days' : undefined,
          },
        ];
      }
    });

    setSearchQuery('');
    setSearchResults([]);
    searchInputRef.current?.focus();
  };

  // Find Generic Substitutes (Same composition & strength)
  const handleFindSubstitutes = (med: Medicine) => {
    setSelectedMedForSub(med);
    if (!med.composition) {
      setSubstituteOptions([]);
      setShowSubstituteModal(true);
      return;
    }

    const matches = allMedicines.filter(
      (m) =>
        m.id !== med.id &&
        m.composition?.toLowerCase().trim() === med.composition?.toLowerCase().trim()
    );
    setSubstituteOptions(matches);
    setShowSubstituteModal(true);
  };

  // Cart Calculations with Indian GST Engine
  const totals = useMemo(() => {
    const lines = cart.map((it) =>
      calculateLineGst({
        unitPrice: it.unit_price,
        quantity: it.unit_quantity,
        gstRate: it.medicine.gst_rate || 12,
        isPriceInclusiveGst: true,
        isInterState: customerGstin ? !customerGstin.startsWith('09') : false,
      })
    );
    return calculateInvoiceTotals(lines);
  }, [cart, customerGstin]);

  // Hold & Resume Carts
  const handleHoldCart = () => {
    if (cart.length === 0) return;
    const newCart = {
      id: `cart-${Date.now()}`,
      name: `Held Bill (${customerName})`,
      items: cart,
      customer: customerName,
      phone: customerPhone,
      age: customerAge,
      address: customerAddress,
    };
    setHeldCarts((prev) => [...prev, newCart]);
    setCart([]);
    resetCustomer();
  };

  const handleResumeCart = (heldId: string) => {
    const found = heldCarts.find((c) => c.id === heldId);
    if (found) {
      setCart(found.items);
      setCustomerName(found.customer);
      setCustomerPhone(found.phone || '');
      setCustomerAge(found.age || '');
      setCustomerAddress(found.address || '');
      setHeldCarts((prev) => prev.filter((c) => c.id !== heldId));
    }
  };

  // Atomic Checkout
  const handleCheckout = async (chosenPaymentMethod: PaymentMethod = paymentMethod) => {
    if (isSubmitting) return; // Prevent double-submit
    if (cart.length === 0) {
      setErrorMessage('Cart is empty. Scan medicines to bill.');
      return;
    }

    // Check Schedule H / H1 / X requirements
    const hasControlledMed = cart.some(
      (it) => it.medicine.drug_schedule && it.medicine.drug_schedule !== 'otc'
    );
    if (hasControlledMed && (!customerName || customerName === 'Walk-in Customer')) {
      alert('Patient and doctor information is required for Schedule H/H1/X drugs by law.');
      return;
    }

    // Determine payment splits and reference numbers
    let finalSplits = chosenPaymentMethod === 'split' ? paymentSplits : undefined;
    if ((chosenPaymentMethod === 'card' || chosenPaymentMethod === 'upi') && paymentRefNumber.trim()) {
      finalSplits = [
        {
          method: chosenPaymentMethod,
          amount: totals.grandTotal,
          reference: paymentRefNumber.trim(),
        },
      ];
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const idempotencyKey = generateIdempotencyKey('pos');
      const counterId = 'd0000000-0000-0000-0000-000000000001';

      const result = await repositories.invoices.createInvoiceAtomic({
        branchId: billingBranchId,
        counterId,
        customerName: customerName.trim() || 'Walk-in Customer',
        customerPhone: customerPhone.trim() || undefined,
        customerAge: customerAge.trim() ? parseInt(customerAge.trim(), 10) : undefined,
        customerAddress: customerAddress.trim() || undefined,
        customerId,
        customerGstin: customerGstin || undefined,
        customerStateCode: customerGstin ? customerGstin.substring(0, 2) : '09',
        doctorName: doctorName || undefined,
        doctorRegNo: doctorRegNo || undefined,
        paymentMethod: chosenPaymentMethod,
        paymentSplits: finalSplits,
        items: cart,
        idempotencyKey,
      });

      // Fetch saved invoice for complete print rendering
      const savedInvoice = await repositories.invoices.getInvoiceById(result.invoice_id);
      setCompletedInvoice(savedInvoice);
      setShowPrintModal(true);

      // Clear Cart & Reset Form
      setCart([]);
      resetCustomer();
      setPaymentSplits([]);
      setCashTendered('');
      setPaymentRefNumber('');
      await loadData();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Invoice creation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-cream-50 overflow-hidden font-sans select-none">
      {/* POS Top Control Bar */}
      <div className="bg-white border-b border-charcoal-200 px-4 py-2 flex items-center justify-between gap-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <Badge variant="brand" size="md">
            Counter: C1 (POS)
          </Badge>
          <span className="text-xs font-semibold text-charcoal-700 hidden sm:inline">
            {currentBranch?.name || 'Main Dispensary'}
          </span>
          {heldCarts.length > 0 && (
            <div className="flex items-center gap-1.5">
              {heldCarts.map((hc, idx) => (
                <button
                  key={hc.id}
                  onClick={() => handleResumeCart(hc.id)}
                  className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded font-medium flex items-center gap-1"
                >
                  <PlayCircle className="w-3 h-3 text-amber-600" />
                  Cart {idx + 1} ({hc.items.length})
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw className="w-3.5 h-3.5 text-charcoal-600" />}
            onClick={loadData}
            title="Refresh live stock from inventory"
          >
            Sync Stock
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<PauseCircle className="w-3.5 h-3.5 text-amber-600" />}
            onClick={handleHoldCart}
            disabled={cart.length === 0}
            title="Hold current cart (F4)"
          >
            Hold Bill (F4)
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Camera className="w-3.5 h-3.5 text-brand-500" />}
            onClick={() => setShowCameraModal(true)}
            title="Scan with phone/web camera"
          >
            Camera Scan
          </Button>
        </div>
      </div>

      {/* Main POS 2-Column Split: Left Cart & Billing | Right Search & Catalog */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* LEFT COLUMN: Items in Cart & Totals (60% width on desktop) */}
        <div className="flex-1 lg:w-7/12 flex flex-col border-r border-charcoal-200 bg-white overflow-hidden">
          {/* Customer & Patient Bar */}
          <div className="p-3 border-b border-charcoal-200 bg-cream-50/70 shrink-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono font-bold text-[11px] bg-brand-50 text-brand-700 border border-brand-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
                  COUNTER: C1 (POS)
                </span>
                <span className="text-charcoal-600 font-medium text-[11px] truncate max-w-[220px]">
                  {currentBranch?.name || 'Main Dispensary'}
                </span>
                {customerId ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Linked Patient
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-charcoal-100 text-charcoal-600">
                    Walk-in Patient
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {customerDue > 0 && (
                  <span className="text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                    Udhaar: {formatCurrency(customerDue)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={resetCustomer}
                  className="px-2 py-1 text-[11px] font-medium text-charcoal-500 hover:text-charcoal-800 rounded hover:bg-cream-200/60 transition-colors flex items-center gap-1"
                  title="Reset to Walk-in Customer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => setShowQuickCustomerModal(true)}
                  className="px-2 py-1 text-[11px] font-semibold text-brand-700 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 rounded border border-brand-200 transition-colors flex items-center gap-1"
                  title="Patient & Doctor Details (F7)"
                >
                  <UserPlus className="w-3.5 h-3.5 text-brand-600" />
                  Details (F7)
                </button>
              </div>
            </div>

            {/* Inputs: Customer Name, Phone (Optional), Age, Address */}
            <div className="grid grid-cols-12 gap-2 items-center">
              {/* Name */}
              <div className="col-span-12 sm:col-span-4 relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-charcoal-400">
                  <User className="w-3.5 h-3.5" />
                </div>
                <input
                  type="text"
                  placeholder="Customer / Patient Name..."
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full h-8 pl-8 pr-2.5 text-xs rounded border border-charcoal-300 bg-white font-semibold text-charcoal-900 placeholder:text-charcoal-400 placeholder:font-normal focus:outline-none focus:ring-1 focus:ring-brand-500 transition-shadow"
                />
              </div>

              {/* Phone (Optional) */}
              <div className="col-span-6 sm:col-span-3 relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-charcoal-400">
                  <Phone className="w-3.5 h-3.5" />
                </div>
                <input
                  type="tel"
                  placeholder="Phone (Optional)..."
                  value={customerPhone}
                  onChange={(e) => handlePhoneLookup(e.target.value)}
                  maxLength={15}
                  className="w-full h-8 pl-8 pr-2.5 text-xs rounded border border-charcoal-300 font-mono bg-white text-charcoal-800 placeholder:text-charcoal-400 placeholder:font-sans focus:outline-none focus:ring-1 focus:ring-brand-500 transition-shadow"
                />
              </div>

              {/* Age (Optional) */}
              <div className="col-span-6 sm:col-span-2 relative">
                <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none text-charcoal-400">
                  <Calendar className="w-3 h-3" />
                </div>
                <input
                  type="number"
                  placeholder="Age (Yrs)"
                  min={0}
                  max={125}
                  value={customerAge}
                  onChange={(e) => setCustomerAge(e.target.value)}
                  className="w-full h-8 pl-6 pr-2 text-xs rounded border border-charcoal-300 bg-white text-charcoal-800 placeholder:text-charcoal-400 focus:outline-none focus:ring-1 focus:ring-brand-500 transition-shadow"
                />
              </div>

              {/* Address (Optional) */}
              <div className="col-span-12 sm:col-span-3 relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-charcoal-400">
                  <MapPin className="w-3.5 h-3.5" />
                </div>
                <input
                  type="text"
                  placeholder="Address / Locality (Optional)..."
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  className="w-full h-8 pl-8 pr-2.5 text-xs rounded border border-charcoal-300 bg-white text-charcoal-800 placeholder:text-charcoal-400 focus:outline-none focus:ring-1 focus:ring-brand-500 transition-shadow"
                />
              </div>
            </div>
          </div>

          {/* Cart Items Scrollable Table */}
          <div className="flex-1 overflow-y-auto p-2">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-charcoal-400">
                <Receipt className="w-12 h-12 mb-3 text-charcoal-300 stroke-1" />
                <p className="font-semibold text-charcoal-700">Billing Cart is Empty</p>
                <p className="text-xs text-charcoal-400 mt-1 max-w-xs">
                  Scan barcode with USB scanner, or press <b>F1</b> to search medicines by brand, generic, or composition.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-cream-100 text-charcoal-700 sticky top-0 z-10">
                  <tr className="border-b border-charcoal-200">
                    <th className="p-2 font-bold">Item Description</th>
                    <th className="p-2 font-bold text-center">Batch / Exp</th>
                    <th className="p-2 font-bold text-center">Unit</th>
                    <th className="p-2 font-bold text-center">Qty</th>
                    <th className="p-2 font-bold text-right">Price</th>
                    <th className="p-2 font-bold text-right">Total</th>
                    <th className="p-2 text-center w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-charcoal-100">
                  {cart.map((item, index) => {
                    const isScheduleH = item.medicine.drug_schedule !== 'otc';
                    return (
                      <tr key={item.medicine.id} className="hover:bg-cream-50/60 transition-colors">
                        <td className="p-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-charcoal-900">{item.medicine.brand_name}</span>
                            {item.medicine.drug_schedule && item.medicine.drug_schedule !== 'otc' && (
                              <Badge variant={item.medicine.drug_schedule} size="sm">
                                {item.medicine.drug_schedule.replace('_', ' ').toUpperCase()}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-charcoal-500 mt-0.5">
                            <span>{item.medicine.generic_name}</span>
                            <span>•</span>
                            <button
                              type="button"
                              onClick={() => handleFindSubstitutes(item.medicine)}
                              className="text-brand-600 hover:underline flex items-center gap-0.5 font-semibold"
                            >
                              <Sparkles className="w-3 h-3" />
                              Subs
                            </button>
                          </div>
                          {item.warning && (
                            <span className="inline-block text-[10px] text-amber-700 bg-amber-50 px-1 rounded border border-amber-200 mt-0.5">
                              {item.warning}
                            </span>
                          )}
                        </td>

                        {/* Batch & Expiry */}
                        <td className="p-2 text-center">
                          <span className="font-mono font-semibold text-charcoal-800 block">
                            {item.selectedBatch?.batch_number || 'AUTO-FEFO'}
                          </span>
                          <span className="text-[10px] text-charcoal-500 block">
                            Exp: {item.selectedBatch?.expiry_date || '—'}
                          </span>
                        </td>

                        {/* Unit Toggle: Strip / Piece */}
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setErrorMessage(null);
                              const newUnit = item.selected_unit === 'strip' ? 'piece' : 'strip';
                              const medBatches = getSellableBatches(item.medicine.id);
                              const pps = Math.max(1, item.medicine.pieces_per_strip || 1);
                              const reqPieces = calculatePieces(item.unit_quantity, newUnit, pps);
                              const checkAlloc = allocateFefoStock(medBatches, reqPieces);
                              if (!checkAlloc.isFullyAllocated) {
                                setErrorMessage(
                                  `Cannot switch "${item.medicine.brand_name}" to ${newUnit}. Available: ${checkAlloc.totalAllocatedPieces} pieces.`
                                );
                                return;
                              }
                              const newPrice =
                                newUnit === 'strip'
                                  ? item.medicine.strip_selling_price
                                  : item.medicine.piece_selling_price > 0
                                  ? item.medicine.piece_selling_price
                                  : Number(((item.medicine.strip_selling_price || item.medicine.mrp || 0) / pps).toFixed(2));
                              const updated = [...cart];
                              updated[index] = {
                                ...item,
                                selected_unit: newUnit,
                                unit_price: newPrice,
                                item_total: Number((newPrice * item.unit_quantity).toFixed(2)),
                                required_pieces: reqPieces,
                              };
                              setCart(updated);
                            }}
                            className="px-2 py-0.5 text-[11px] font-bold rounded border border-charcoal-300 hover:border-brand-500 bg-white shadow-xs uppercase tracking-wider"
                            title="Toggle Unit (F2)"
                          >
                            {item.selected_unit}
                          </button>
                        </td>

                        {/* Quantity Counter */}
                        <td className="p-2 text-center">
                          <div className="inline-flex items-center border border-charcoal-300 rounded bg-white shadow-xs">
                            <button
                              type="button"
                              onClick={() => {
                                setErrorMessage(null);
                                if (item.unit_quantity > 1) {
                                  const nextQty = item.unit_quantity - 1;
                                  const reqPieces = calculatePieces(nextQty, item.selected_unit, item.medicine.pieces_per_strip);
                                  const updated = [...cart];
                                  updated[index] = {
                                    ...item,
                                    unit_quantity: nextQty,
                                    item_total: Number((item.unit_price * nextQty).toFixed(2)),
                                    required_pieces: reqPieces,
                                  };
                                  setCart(updated);
                                }
                              }}
                              className="px-1.5 py-1 text-charcoal-600 hover:bg-cream-100"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="px-2 font-bold font-mono text-charcoal-900 min-w-[24px]">
                              {item.unit_quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setErrorMessage(null);
                                const nextQty = item.unit_quantity + 1;
                                const reqPieces = calculatePieces(nextQty, item.selected_unit, item.medicine.pieces_per_strip);
                                const medBatches = getSellableBatches(item.medicine.id);
                                const checkAlloc = allocateFefoStock(medBatches, reqPieces);
                                if (!checkAlloc.isFullyAllocated) {
                                  setErrorMessage(
                                    `Cannot add more "${item.medicine.brand_name}". Available: ${checkAlloc.totalAllocatedPieces} pieces.`
                                  );
                                  return;
                                }
                                const updated = [...cart];
                                updated[index] = {
                                  ...item,
                                  unit_quantity: nextQty,
                                  item_total: Number((item.unit_price * nextQty).toFixed(2)),
                                  required_pieces: reqPieces,
                                };
                                setCart(updated);
                              }}
                              className="px-1.5 py-1 text-charcoal-600 hover:bg-cream-100"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </td>

                        {/* Unit Price */}
                        <td className="p-2 text-right font-mono text-charcoal-700">
                          ₹{item.unit_price.toFixed(2)}
                        </td>

                        {/* Line Total */}
                        <td className="p-2 text-right font-mono font-bold text-charcoal-900">
                          ₹{item.item_total.toFixed(2)}
                        </td>

                        {/* Delete Row */}
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => setCart((prev) => prev.filter((_, i) => i !== index))}
                            className="text-charcoal-400 hover:text-rose-600 p-1 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Bottom Totals & Payment Bar */}
          <div className="border-t border-charcoal-200 bg-cream-50/80 p-4 shrink-0 space-y-3">
            {errorMessage && (
              <div className="p-2 rounded bg-rose-50 border border-rose-300 text-rose-800 text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-charcoal-600 border-b border-charcoal-200 pb-2">
              <div>
                <span>Taxable: <b>{formatCurrency(totals.subtotalTaxable)}</b></span>
                <span className="mx-2">•</span>
                <span>GST: <b>{formatCurrency(totals.totalGst)}</b></span>
                {totals.roundOff !== 0 && (
                  <>
                    <span className="mx-2">•</span>
                    <span>Round-off: <b>{totals.roundOff > 0 ? `+${totals.roundOff}` : totals.roundOff}</b></span>
                  </>
                )}
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-charcoal-900">
                  Payable: <span className="text-xl text-brand-600 font-mono">{formatCurrency(totals.grandTotal)}</span>
                </span>
              </div>
            </div>

            {/* Cash Tender & Change Return Display */}
            {paymentMethod === 'cash' && (
              <div className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-md border border-charcoal-200 shadow-2xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-charcoal-700">Cash Received:</span>
                  <input
                    type="number"
                    step="1"
                    placeholder="e.g. 500"
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="h-8 w-28 px-2.5 text-xs font-mono font-bold bg-cream-50 border border-charcoal-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <div className="flex items-center gap-1">
                    {[100, 200, 500].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setCashTendered(amt)}
                        className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-cream-100 hover:bg-cream-200 text-charcoal-700 border border-charcoal-200"
                      >
                        ₹{amt}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCashTendered(totals.grandTotal)}
                      className="px-2 py-0.5 text-[10px] font-semibold rounded bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200"
                    >
                      Exact
                    </button>
                  </div>
                </div>

                {cashTendered !== '' && (
                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-charcoal-500 block leading-none">Change to Return:</span>
                    <span
                      className={`text-sm font-mono font-bold ${
                        cashTendered >= totals.grandTotal ? 'text-emerald-700' : 'text-rose-600'
                      }`}
                    >
                      {cashTendered >= totals.grandTotal
                        ? formatCurrency(cashTendered - totals.grandTotal)
                        : `Short: -${formatCurrency(totals.grandTotal - cashTendered)}`}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* UPI & Card Reference Number Input */}
            {(paymentMethod === 'card' || paymentMethod === 'upi') && (
              <div className="flex items-center gap-2 bg-white p-2.5 rounded-md border border-charcoal-200 shadow-2xs">
                <span className="text-xs font-semibold text-charcoal-700 shrink-0">
                  {paymentMethod === 'card' ? 'Card Slip / Auth Ref:' : 'UPI UTR / Trans ID:'}
                </span>
                <input
                  type="text"
                  placeholder={paymentMethod === 'card' ? 'e.g. SLIP-904128' : 'e.g. UTR-301928412'}
                  value={paymentRefNumber}
                  onChange={(e) => setPaymentRefNumber(e.target.value)}
                  className="h-8 flex-1 px-2.5 text-xs font-mono bg-cream-50 border border-charcoal-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            )}

            {/* Payment Mode Selector & Instant Checkout */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <div className="flex rounded-md border border-charcoal-300 p-0.5 bg-white shadow-xs shrink-0">
                {(['cash', 'upi', 'card', 'credit'] as PaymentMethod[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPaymentMethod(mode)}
                    className={`px-3 py-1.5 text-xs font-bold rounded uppercase tracking-wider transition-all ${
                      paymentMethod === mode
                        ? 'bg-brand-500 text-white shadow-xs'
                        : 'text-charcoal-600 hover:text-charcoal-900'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              <Button
                variant="outline"
                size="md"
                onClick={() => setIsSplitModalOpen(true)}
                className="text-xs"
              >
                Split (F8)
              </Button>

              <Button
                variant="primary"
                size="lg"
                isLoading={isSubmitting}
                disabled={cart.length === 0}
                onClick={() => handleCheckout()}
                className="flex-1 font-bold tracking-wide"
              >
                Charge {formatCurrency(totals.grandTotal)} (F9)
              </Button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Search Bar & Fast Medicine Browser (40% width) */}
        <div className="lg:w-5/12 bg-white flex flex-col overflow-hidden">
          {/* F1 Quick Search Bar */}
          <div className="p-3 border-b border-charcoal-200 bg-cream-50/40">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-charcoal-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search Medicine (Brand, Generic, Salt, Barcode)... [F1]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-scanner-input="true"
                className="h-10 w-full rounded-md border border-charcoal-300 pl-9 pr-4 text-sm text-charcoal-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 shadow-xs"
              />
            </div>
          </div>

          {/* Search Results / Fast Selection Catalog */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {(searchResults.length > 0 ? searchResults : allMedicines.slice(0, 20)).map((med) => {
              const medBatches = getSellableBatches(med.id);
              const totalStockPieces = medBatches.reduce((acc, curr) => acc + curr.stock_pieces, 0);
              const stockStatus = getStockStatus(totalStockPieces, med.min_stock_alert);

              return (
                <div
                  key={med.id}
                  onClick={() => addMedicineToCart(med)}
                  className="p-3 border border-charcoal-200 hover:border-brand-400 rounded-lg bg-white hover:bg-cream-50/50 cursor-pointer transition-all shadow-xs flex items-center justify-between gap-3 group"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-charcoal-900 group-hover:text-brand-600 truncate">
                        {med.brand_name}
                      </span>
                      {med.drug_schedule && med.drug_schedule !== 'otc' && (
                        <Badge variant={med.drug_schedule} size="sm">
                          {med.drug_schedule.replace('_', ' ').toUpperCase()}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-charcoal-500 truncate mt-0.5">
                      {med.generic_name} • {med.packaging_label}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-mono font-bold text-sm text-charcoal-900 block">
                      ₹{med.strip_selling_price.toFixed(2)}
                    </span>
                    <span
                      className={`text-[11px] font-semibold ${
                        stockStatus.status === 'in_stock'
                          ? 'text-emerald-700'
                          : stockStatus.status === 'low_stock'
                          ? 'text-amber-700'
                          : 'text-rose-600'
                      }`}
                    >
                      {stockStatus.isAvailable
                        ? `${totalStockPieces} pcs (${stockStatus.label})`
                        : 'Out of Stock'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* GENERIC SUBSTITUTES DRAWER */}
      <Drawer
        isOpen={showSubstituteModal}
        onClose={() => setShowSubstituteModal(false)}
        title="Generic Medicine Substitutes"
        subtitle={`Alternative brands for ${selectedMedForSub?.brand_name} (Same salt & strength)`}
        width="md"
        footer={<Button onClick={() => setShowSubstituteModal(false)}>Close</Button>}
      >
        <div className="space-y-3">
          <div className="p-3 bg-cream-100 rounded-lg text-xs">
            <span className="text-charcoal-500 block">Active Composition:</span>
            <span className="font-bold text-charcoal-900">{selectedMedForSub?.composition || 'No composition registered'}</span>
          </div>

          {substituteOptions.length === 0 ? (
            <div className="text-center py-8 text-charcoal-500 text-xs">
              No direct generic substitutes found with identical composition.
            </div>
          ) : (
            substituteOptions.map((sub) => {
              const diff = sub.strip_selling_price - (selectedMedForSub?.strip_selling_price || 0);
              return (
                <div
                  key={sub.id}
                  onClick={() => {
                    addMedicineToCart(sub);
                    setShowSubstituteModal(false);
                  }}
                  className="p-3 border border-charcoal-200 rounded-lg bg-white hover:border-brand-400 cursor-pointer flex items-center justify-between"
                >
                  <div>
                    <span className="font-bold text-sm text-charcoal-900">{sub.brand_name}</span>
                    <span className="text-xs text-charcoal-500 block">{sub.manufacturer}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-sm block">₹{sub.strip_selling_price.toFixed(2)}</span>
                    <span className={`text-[10px] font-bold ${diff < 0 ? 'text-emerald-600' : 'text-charcoal-500'}`}>
                      {diff < 0 ? `Saves ₹${Math.abs(diff).toFixed(2)}` : diff === 0 ? 'Same price' : `+₹${diff.toFixed(2)}`}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Drawer>

      {/* QUICK CUSTOMER ADD MODAL */}
      <Modal
        isOpen={showQuickCustomerModal}
        onClose={() => setShowQuickCustomerModal(false)}
        title="Patient & Customer Details"
        subtitle="Save contact, age, address, and credit information"
        maxWidth="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowQuickCustomerModal(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (customerName && customerName.trim() && customerName !== 'Walk-in Customer') {
                  try {
                    const cust = await repositories.customers.createCustomer({
                      name: customerName.trim(),
                      phone: customerPhone.trim() || undefined,
                      age: customerAge.trim() ? parseInt(customerAge.trim(), 10) : undefined,
                      address: customerAddress.trim() || undefined,
                      gstin: customerGstin.trim() || undefined,
                      credit_limit: customerLimit,
                      outstanding_balance: 0,
                      loyalty_points: 0,
                      is_active: true,
                    });
                    setCustomerId(cust.id);
                    setShowQuickCustomerModal(false);
                  } catch (e) {
                    setShowQuickCustomerModal(false);
                  }
                } else {
                  setShowQuickCustomerModal(false);
                }
              }}
            >
              Save & Link
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="Customer / Patient Full Name *" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Phone Number (Optional)" placeholder="10-digit mobile" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            <Input type="number" label="Age (Years, Optional)" placeholder="e.g. 35" min={0} max={125} value={customerAge} onChange={(e) => setCustomerAge(e.target.value)} />
          </div>
          <Input label="Address / Locality (Optional)" placeholder="e.g. 14/B Park Road, Hazratganj, Lucknow" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input type="number" label="Credit Limit (₹)" value={customerLimit} onChange={(e) => setCustomerLimit(parseFloat(e.target.value) || 0)} />
            <Input label="Customer GSTIN (Optional)" placeholder="e.g. 09ABCDE1234F1Z5" value={customerGstin} onChange={(e) => setCustomerGstin(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Doctor Name (Optional)" placeholder="e.g. Dr. S.K. Srivastava" value={doctorName} onChange={(e) => setDoctorName(e.target.value)} />
            <Input label="Doctor Reg No (Optional)" placeholder="e.g. MCI-12345" value={doctorRegNo} onChange={(e) => setDoctorRegNo(e.target.value)} />
          </div>
        </div>
      </Modal>

      {/* SPLIT PAYMENT MODAL */}
      {(() => {
        const splitAllocated = Number((splitCash + splitUpi + splitCard + splitCredit).toFixed(2));
        const splitDiff = Number((totals.grandTotal - splitAllocated).toFixed(2));
        const isSplitValid = Math.abs(splitDiff) < 0.05 && splitAllocated > 0;

        return (
          <Modal
            isOpen={isSplitModalOpen}
            onClose={() => setIsSplitModalOpen(false)}
            title="Split Payment (Multiple Modes)"
            subtitle={`Total bill amount: ${formatCurrency(totals.grandTotal)}`}
            maxWidth="sm"
            footer={
              <>
                <Button variant="outline" onClick={() => setIsSplitModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  disabled={!isSplitValid}
                  onClick={() => {
                    const splits: PaymentSplit[] = [];
                    if (splitCash > 0) splits.push({ method: 'cash', amount: splitCash });
                    if (splitUpi > 0) splits.push({ method: 'upi', amount: splitUpi });
                    if (splitCard > 0) splits.push({ method: 'card', amount: splitCard });
                    if (splitCredit > 0) splits.push({ method: 'credit', amount: splitCredit });

                    setPaymentSplits(splits);
                    setPaymentMethod('split');
                    setIsSplitModalOpen(false);
                    handleCheckout('split');
                  }}
                >
                  Confirm Split & Charge
                </Button>
              </>
            }
          >
            <div className="space-y-3">
              <Input
                type="number"
                label="Cash Amount (₹)"
                value={splitCash}
                onChange={(e) => setSplitCash(parseFloat(e.target.value) || 0)}
              />
              <Input
                type="number"
                label="UPI / QR Amount (₹)"
                value={splitUpi}
                onChange={(e) => setSplitUpi(parseFloat(e.target.value) || 0)}
              />
              <Input
                type="number"
                label="Card Amount (₹)"
                value={splitCard}
                onChange={(e) => setSplitCard(parseFloat(e.target.value) || 0)}
              />
              <Input
                type="number"
                label="Credit / Udhaar Amount (₹)"
                value={splitCredit}
                onChange={(e) => setSplitCredit(parseFloat(e.target.value) || 0)}
              />

              <div
                className={`p-2.5 rounded text-xs flex justify-between font-bold border transition-colors ${
                  isSplitValid
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-rose-50 text-rose-800 border-rose-300'
                }`}
              >
                <span>Allocated: {formatCurrency(splitAllocated)}</span>
                <span>
                  {isSplitValid
                    ? 'Target 100% Matched'
                    : splitDiff > 0
                    ? `Remaining: ${formatCurrency(splitDiff)}`
                    : `Excess: ${formatCurrency(Math.abs(splitDiff))}`}
                </span>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* CAMERA BARCODE SCANNER MODAL */}
      <CameraScannerModal
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onScan={async (barcode) => {
          const med = await repositories.medicines.getMedicineByBarcode(barcode);
          if (med) {
            addMedicineToCart(med);
          } else {
            setErrorMessage(`Barcode "${barcode}" not recognized.`);
            setTimeout(() => setErrorMessage(null), 3000);
          }
        }}
      />

      {/* INVOICE PRINT MODAL */}
      <InvoicePrintModal
        invoice={completedInvoice}
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
      />
    </div>
  );
};
export default PosBilling;
