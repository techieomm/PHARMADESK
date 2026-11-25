import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { inventoryService, medicineService } from '@/services/api';
import { BranchInventory as InventoryType, Medicine } from '@/types';
import { 
  Card, 
  StatCard, 
  Button, 
  Input, 
  Select, 
  Badge, 
  Modal, 
  EmptyState, 
  PageHeader, 
  Toolbar, 
  Skeleton 
} from '@/components/common';
import { formatCurrency, formatDualUnitStock } from '@/utils/formatters';
import { exportToExcel } from '@/utils/exporter';
import { 
  Boxes, 
  Search, 
  FileSpreadsheet, 
  AlertTriangle, 
  PackageCheck, 
  SlidersHorizontal,
  Building2,
  Package
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
    exportToExcel(exportData, 'BajrangPharmacy_Branch_Inventory', 'Stock');
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title="Branch Inventory & Stock"
        subtitle="Independent stock tracking per branch using dual-unit strips and loose pieces."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="md" onClick={handleExportExcel} leftIcon={<FileSpreadsheet className="w-4 h-4 text-emerald-700" />}>
              Export Excel
            </Button>
          </div>
        }
      />

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Catalog Medicines"
          value={totalItemsCount}
          icon={<Boxes className="w-5 h-5 text-charcoal-400" />}
          variant="default"
        />

        <StatCard
          label="Low Stock Alerts"
          value={lowStockCount}
          icon={<AlertTriangle className="w-5 h-5 text-amber-600" />}
          subtext="Stock <= threshold limit"
          variant={lowStockCount > 0 ? 'warning' : 'default'}
        />

        <StatCard
          label="Out of Stock Items"
          value={outOfStockCount}
          icon={<PackageCheck className="w-5 h-5 text-red-600" />}
          subtext="Zero pieces in inventory"
          variant={outOfStockCount > 0 ? 'danger' : 'default'}
        />
      </div>

      {/* Filter Toolbar */}
      <Toolbar>
        <div className="flex-1 min-w-[240px]">
          <Input
            placeholder="Search inventory by brand name, generic composition, barcode..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {user?.role === 'master_admin' && (
            <div className="w-48">
              <Select
                size="md"
                value={selectedBranchFilter}
                onChange={(e) => setSelectedBranchFilter(e.target.value)}
                options={[
                  { value: 'all', label: 'All Branches (Consolidated)' },
                  ...branches.map(b => ({ value: b.id, label: `${b.name} (${b.branch_code})` }))
                ]}
              />
            </div>
          )}

          <div className="w-44">
            <Select
              size="md"
              value={stockStatusFilter}
              onChange={(e) => setStockStatusFilter(e.target.value as any)}
              options={[
                { value: 'all', label: 'All Stock Statuses' },
                { value: 'in_stock', label: 'In Stock Only' },
                { value: 'low_stock', label: 'Low Stock Alerts' },
                { value: 'out_of_stock', label: 'Out of Stock Only' },
              ]}
            />
          </div>
        </div>
      </Toolbar>

      {/* Inventory Table */}
      <Card className="bg-white overflow-hidden" noPadding>
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton height={42} className="w-full" />
            <Skeleton height={42} className="w-full" />
            <Skeleton height={42} className="w-full" />
            <Skeleton height={42} className="w-full" />
          </div>
        ) : filteredList.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Package className="w-8 h-8 text-charcoal-400" />}
              title="No inventory records found"
              description="No medicines match the selected filter or catalog is empty. Adjust stock or add medicines."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-charcoal-200 bg-cream-50 text-charcoal-600 font-semibold uppercase text-[11px]">
                  <th className="py-3 px-4">Medicine Item</th>
                  <th className="py-3 px-3">Dosage / Pack</th>
                  <th className="py-3 px-3">Available Stock (Dual-Unit)</th>
                  <th className="py-3 px-3 text-center">Stock Status</th>
                  <th className="py-3 px-3">Batch / Expiry</th>
                  <th className="py-3 px-3 text-right">Selling Price</th>
                  <th className="py-3 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal-100">
                {filteredList.map((item) => (
                  <tr key={item.medicine.id} className="hover:bg-cream-50/60 transition-colors">
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
                        <Badge variant="danger" size="sm" className="font-bold">OUT OF STOCK</Badge>
                      ) : item.isLow ? (
                        <Badge variant="warning" size="sm" className="font-bold">LOW STOCK</Badge>
                      ) : (
                        <Badge variant="success" size="sm">IN STOCK</Badge>
                      )}
                    </td>

                    <td className="py-3 px-3 text-[11px] text-charcoal-600">
                      <div>Batch: <span className="font-mono font-medium text-charcoal-800">{item.inventory?.batch_number || '-'}</span></div>
                      <div>Exp: <span className="font-medium text-charcoal-800">{item.inventory?.expiry_date || '-'}</span></div>
                    </td>

                    <td className="py-3 px-3 text-right">
                      <div className="font-bold text-charcoal-900 font-mono">{formatCurrency(item.medicine.strip_selling_price)} / str</div>
                      <div className="text-[10px] text-charcoal-500 font-mono">({formatCurrency(item.medicine.piece_selling_price)} / pc)</div>
                    </td>

                    <td className="py-3 px-3 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openAdjustModal(item.medicine, item.inventory)}
                        leftIcon={<SlidersHorizontal className="w-3.5 h-3.5" />}
                        title="Add or Adjust Stock"
                      >
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

          <div className="p-3.5 bg-cream-100 rounded-lg border border-charcoal-200 text-xs space-y-1">
            <p className="font-bold text-charcoal-900">{selectedItem?.medicine.brand_name} ({selectedItem?.medicine.strength || ''})</p>
            <p className="text-charcoal-600">Pack configuration: 1 strip = {selectedItem?.medicine.pieces_per_strip} pieces</p>
            <p className="font-semibold text-charcoal-800">
              Current Available Stock: {formatDualUnitStock(selectedItem?.inventory?.stock_pieces || 0, selectedItem?.medicine.pieces_per_strip).display}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Operation Type *"
              value={adjustType}
              onChange={(e) => setAdjustType(e.target.value as any)}
              options={[
                { value: 'add', label: 'Add Stock (Purchase / Restock)' },
                { value: 'subtract', label: 'Subtract Stock (Damage / Return)' },
                { value: 'set', label: 'Set Exact Total Stock' },
              ]}
            />

            <Select
              label="Stock Entry Unit *"
              value={adjustUnit}
              onChange={(e) => setAdjustUnit(e.target.value as any)}
              options={[
                { value: 'strip', label: 'Strips / Packets' },
                { value: 'piece', label: 'Loose Pieces' },
              ]}
            />
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
              <span className="font-bold text-charcoal-900 font-mono">
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
