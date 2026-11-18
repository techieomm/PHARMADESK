import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { inventoryService, medicineService } from '@/services/api';
import { BranchInventory as InventoryType, Medicine } from '@/types';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Badge } from '@/components/common/Badge';
import { Modal } from '@/components/common/Modal';
import { EmptyState } from '@/components/common/EmptyState';
import { formatCurrency, formatDualUnitStock } from '@/utils/formatters';
import { exportToExcel, exportToPdf } from '@/utils/exporter';
import { 
  Boxes, 
  Search, 
  FileSpreadsheet, 
  Download, 
  Plus, 
  AlertTriangle, 
  PackageCheck, 
  SlidersHorizontal,
  Building2
} from 'lucide-react';

export const BranchInventory: React.FC = () => {
  const { user } = useAuth();
  const { branches, selectedBranchId } = useBranch();

  const [inventory, setInventory] = useState<InventoryType[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>(selectedBranchId);
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');

  // Quick Stock Adjustment Modal
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<{ inventory?: InventoryType; medicine: Medicine } | null>(null);
  const [adjustUnit, setAdjustUnit] = useState<'strip' | 'piece'>('strip');
  const [adjustType, setAdjustType] = useState<'add' | 'subtract' | 'set'>('add');
  const [adjustQty, setAdjustQty] = useState<number>(10);
  const [adjustNotes, setAdjustNotes] = useState('');
  const [batchNum, setBatchNum] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const branchIdParam = user?.role === 'master_admin'
        ? (selectedBranchFilter === 'all' ? undefined : selectedBranchFilter)
        : (user?.primary_branch_id || undefined);

      const [invData, medData] = await Promise.all([
        inventoryService.getBranchInventory(branchIdParam),
        medicineService.getMedicines(),
      ]);
      setInventory(invData);
      setMedicines(medData);
    } catch (e) {
      console.error('Failed to load inventory:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedBranchFilter, user]);

  const openAdjustModal = (med: Medicine, inv?: InventoryType) => {
    setSelectedItem({ medicine: med, inventory: inv });
    setAdjustType('add');
    setAdjustUnit('strip');
    setAdjustQty(10);
    setAdjustNotes('');
    setBatchNum(inv?.batch_number || '');
    setExpiryDate(inv?.expiry_date || '');
    setErrorMsg(null);
    setAdjustModalOpen(true);
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    setErrorMsg(null);

    const targetBranchId = selectedBranchFilter === 'all' 
      ? (user?.primary_branch_id || branches[0]?.id || '') 
      : selectedBranchFilter;

    if (!targetBranchId) {
      setErrorMsg('Please select a specific branch for stock entry');
      return;
    }
    if (adjustQty <= 0) {
      setErrorMsg('Quantity must be greater than zero');
      return;
    }

    setIsSubmitting(true);
    try {
      await inventoryService.adjustStock({
        branchId: targetBranchId,
        medicineId: selectedItem.medicine.id,
        adjustmentType: adjustType,
        unit: adjustUnit,
        quantity: adjustQty,
        notes: adjustNotes || `Stock ${adjustType} via Inventory Panel`,
        performedByUserId: user?.id,
        batchNumber: batchNum || undefined,
        expiryDate: expiryDate || undefined,
      });

      setAdjustModalOpen(false);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to adjust stock');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Combine medicines with inventory
  const combinedList = medicines.map(med => {
    const inv = inventory.find(i => i.medicine_id === med.id);
    const stockPieces = inv ? inv.stock_pieces : 0;
    const isOut = stockPieces <= 0;
    const isLow = !isOut && stockPieces <= (med.min_stock_alert || 20);

    return {
      medicine: med,
      inventory: inv,
      stockPieces,
      isOut,
      isLow,
      dual: formatDualUnitStock(stockPieces, med.pieces_per_strip),
    };
  });

  // Filtered List
  const filteredList = combinedList.filter(item => {
    if (stockStatusFilter === 'in_stock' && item.isOut) return false;
    if (stockStatusFilter === 'low_stock' && !item.isLow) return false;
    if (stockStatusFilter === 'out_of_stock' && !item.isOut) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const m = item.medicine;
      return (
        m.brand_name.toLowerCase().includes(q) ||
        m.generic_name.toLowerCase().includes(q) ||
        (m.barcode && m.barcode.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Stats
  const totalItemsCount = combinedList.length;
  const lowStockCount = combinedList.filter(i => i.isLow).length;
  const outOfStockCount = combinedList.filter(i => i.isOut).length;

  const handleExportExcel = () => {
    const exportData = filteredList.map(it => ({
      'Medicine Name': it.medicine.brand_name,
      'Generic Name': it.medicine.generic_name,
      'Pieces Per Strip': it.medicine.pieces_per_strip,
      'Total Pieces': it.stockPieces,
      'Strips Count': it.dual.strips,
      'Loose Pieces': it.dual.loosePieces,
      'Dual Unit Display': it.dual.display,
      'Batch Number': it.inventory?.batch_number || '',
      'Expiry Date': it.inventory?.expiry_date || '',
      'Status': it.isOut ? 'Out of Stock' : it.isLow ? 'Low Stock' : 'In Stock',
    }));
    exportToExcel(exportData, 'PharmaDesk_Branch_Inventory', 'Stock');
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-charcoal-200">
        <div>
          <h1 className="text-xl font-bold text-charcoal-900 tracking-tight">Branch Inventory & Stock</h1>
          <p className="text-xs text-charcoal-500 mt-0.5">
            Independent stock tracking per branch using dual-unit strips and pieces.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {user?.role === 'master_admin' && (
            <div className="flex items-center gap-1.5 bg-white border border-charcoal-200 rounded px-2.5 py-1">
              <Building2 className="w-3.5 h-3.5 text-charcoal-500" />
              <select
                value={selectedBranchFilter}
                onChange={(e) => setSelectedBranchFilter(e.target.value)}
                className="text-xs font-semibold text-charcoal-800 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="all">All Branches (Consolidated)</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name} ({b.branch_code})</option>
                ))}
              </select>
            </div>
          )}

          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-emerald-700" />
            Excel
          </Button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 bg-white">
          <span className="text-[11px] font-bold text-charcoal-500 uppercase tracking-wider block">
            Total Catalog Medicines
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-charcoal-900">{totalItemsCount}</span>
            <Boxes className="w-5 h-5 text-charcoal-400" />
          </div>
        </Card>

        <Card className="p-4 bg-white border-l-4 border-l-amber-500">
          <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">
            Low Stock Alerts
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-amber-900">{lowStockCount}</span>
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
        </Card>

        <Card className="p-4 bg-white border-l-4 border-l-red-500">
          <span className="text-[11px] font-bold text-red-700 uppercase tracking-wider block">
            Out of Stock
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-red-900">{outOfStockCount}</span>
            <PackageCheck className="w-5 h-5 text-red-600" />
          </div>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <Card className="p-4 bg-white">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Input
              placeholder="Search inventory by brand name, generic composition, barcode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search className="w-4 h-4" />}
            />
          </div>

          <div>
            <select
              value={stockStatusFilter}
              onChange={(e) => setStockStatusFilter(e.target.value as any)}
              className="w-full text-xs font-medium border border-charcoal-200 rounded-md py-2 px-3 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
            >
              <option value="all">All Inventory Statuses</option>
              <option value="in_stock">In Stock Only</option>
              <option value="low_stock">Low Stock Alerts</option>
              <option value="out_of_stock">Out of Stock Only</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Inventory Table */}
      <Card className="bg-white overflow-hidden" noPadding>
        {isLoading ? (
          <div className="py-12 text-center text-xs text-charcoal-500">Loading branch inventory...</div>
        ) : filteredList.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No inventory records found"
              description="No medicines match the selected filter or catalog is empty. Adjust stock or add medicines."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-charcoal-200 bg-cream-50 text-charcoal-600 font-semibold uppercase text-[11px]">
                  <th className="py-2.5 px-4">Medicine Item</th>
                  <th className="py-2.5 px-3">Dosage / Pack</th>
                  <th className="py-2.5 px-3">Available Stock (Dual-Unit)</th>
                  <th className="py-2.5 px-3 text-center">Stock Status</th>
                  <th className="py-2.5 px-3">Batch / Expiry</th>
                  <th className="py-2.5 px-3 text-right">Selling Price</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal-100">
                {filteredList.map((item) => (
                  <tr key={item.medicine.id} className="hover:bg-cream-50/50 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-bold text-charcoal-900 block text-sm">{item.medicine.brand_name}</span>
                      <span className="text-[11px] text-charcoal-500">
                        {item.medicine.generic_name} • {item.medicine.manufacturer}
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      <span className="font-semibold text-charcoal-800">{item.medicine.dosage_form}</span>
                      <span className="text-[10px] text-charcoal-500 block">{item.medicine.pieces_per_strip} pcs/strip</span>
                    </td>

                    <td className="py-3 px-3">
                      <span className="font-bold text-charcoal-900 text-xs block font-sans">
                        {item.dual.display}
                      </span>
                      <span className="text-[10px] text-charcoal-500">
                        Threshold alert: {item.medicine.min_stock_alert} pcs
                      </span>
                    </td>

                    <td className="py-3 px-3 text-center">
                      {item.isOut ? (
                        <Badge variant="danger" className="font-bold text-[10px]">OUT OF STOCK</Badge>
                      ) : item.isLow ? (
                        <Badge variant="warning" className="font-bold text-[10px]">LOW STOCK</Badge>
                      ) : (
                        <Badge variant="success" className="text-[10px]">IN STOCK</Badge>
                      )}
                    </td>

                    <td className="py-3 px-3 text-[11px] text-charcoal-600">
                      <div>Batch: <span className="font-mono font-medium text-charcoal-800">{item.inventory?.batch_number || '-'}</span></div>
                      <div>Exp: <span className="font-medium text-charcoal-800">{item.inventory?.expiry_date || '-'}</span></div>
                    </td>

                    <td className="py-3 px-3 text-right">
                      <div className="font-bold text-charcoal-900">{formatCurrency(item.medicine.strip_selling_price)} / str</div>
                      <div className="text-[10px] text-charcoal-500">({formatCurrency(item.medicine.piece_selling_price)} / pc)</div>
                    </td>

                    <td className="py-3 px-3 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openAdjustModal(item.medicine, item.inventory)}
                        className="h-7 text-xs px-2"
                        title="Add or Adjust Stock"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5 mr-1" />
                        Adjust
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Stock Adjustment Modal */}
      <Modal
        isOpen={adjustModalOpen}
        onClose={() => setAdjustModalOpen(false)}
        title={`Adjust Stock — ${selectedItem?.medicine.brand_name}`}
        maxWidth="md"
      >
        <form onSubmit={handleAdjustSubmit} className="space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800 font-medium">
              {errorMsg}
            </div>
          )}

          <div className="p-3 bg-cream-100 rounded border border-charcoal-200 text-xs space-y-1">
            <p className="font-bold text-charcoal-900">{selectedItem?.medicine.brand_name} ({selectedItem?.medicine.strength || ''})</p>
            <p className="text-charcoal-600">Pack configuration: 1 strip = {selectedItem?.medicine.pieces_per_strip} pieces</p>
            <p className="font-semibold text-charcoal-800">
              Current Available Stock: {formatDualUnitStock(selectedItem?.inventory?.stock_pieces || 0, selectedItem?.medicine.pieces_per_strip).display}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-charcoal-700 uppercase tracking-wider mb-1">
                Operation Type *
              </label>
              <select
                value={adjustType}
                onChange={(e) => setAdjustType(e.target.value as any)}
                className="w-full text-xs font-medium border border-charcoal-200 rounded-md py-2 px-3 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
              >
                <option value="add">Add Stock (Purchase / Restock)</option>
                <option value="subtract">Subtract Stock (Damage / Return)</option>
                <option value="set">Set Exact Total Stock</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-charcoal-700 uppercase tracking-wider mb-1">
                Stock Entry Unit *
              </label>
              <select
                value={adjustUnit}
                onChange={(e) => setAdjustUnit(e.target.value as any)}
                className="w-full text-xs font-medium border border-charcoal-200 rounded-md py-2 px-3 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
              >
                <option value="strip">Strips / Packets</option>
                <option value="piece">Loose Pieces</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Quantity to Enter *"
              type="number"
              min="1"
              value={adjustQty}
              onChange={(e) => setAdjustQty(parseFloat(e.target.value) || 0)}
              required
            />
            <div className="flex flex-col justify-end pb-1 text-xs text-charcoal-600">
              <span>Conversion Preview:</span>
              <span className="font-bold text-charcoal-900">
                {adjustUnit === 'strip'
                  ? `${adjustQty * (selectedItem?.medicine.pieces_per_strip || 10)} total pieces`
                  : `${adjustQty} pieces`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Batch / Lot Number"
              placeholder="e.g. BATCH-2026-X"
              value={batchNum}
              onChange={(e) => setBatchNum(e.target.value)}
            />
            <Input
              label="Expiry Date"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </div>

          <Input
            label="Audit Notes / Reason"
            placeholder="e.g. Received new stock shipment from distributor"
            value={adjustNotes}
            onChange={(e) => setAdjustNotes(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-charcoal-100">
            <Button variant="outline" type="button" onClick={() => setAdjustModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting}>
              Apply Stock Adjustment
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
