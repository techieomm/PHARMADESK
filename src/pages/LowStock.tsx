import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { inventoryService, medicineService } from '@/services/api';
import { Medicine, BranchInventory } from '@/types';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { EmptyState } from '@/components/common/EmptyState';
import { Modal } from '@/components/common/Modal';
import { Input } from '@/components/common/Input';
import { formatDualUnitStock, formatCurrency } from '@/utils/formatters';
import { exportToExcel } from '@/utils/exporter';
import { AlertTriangle, Plus, FileSpreadsheet, Building2, PackageCheck } from 'lucide-react';

export const LowStock: React.FC = () => {
  const { user } = useAuth();
  const { branches, selectedBranchId } = useBranch();

  const [inventory, setInventory] = useState<BranchInventory[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>(selectedBranchId);

  // Restock Modal
  const [selectedItem, setSelectedItem] = useState<{ medicine: Medicine; inventory?: BranchInventory } | null>(null);
  const [restockQty, setRestockQty] = useState<number>(10);
  const [restockUnit, setRestockUnit] = useState<'strip' | 'piece'>('strip');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedBranchFilter, user]);

  const lowStockItems = medicines.map(med => {
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
  }).filter(item => item.isOut || item.isLow);

  const handleRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    const targetBranch = selectedBranchFilter === 'all' 
      ? (user?.primary_branch_id || branches[0]?.id || '') 
      : selectedBranchFilter;

    setIsSubmitting(true);
    try {
      await inventoryService.adjustStock({
        branchId: targetBranch,
        medicineId: selectedItem.medicine.id,
        adjustmentType: 'add',
        unit: restockUnit,
        quantity: restockQty,
        notes: 'Restocked from Low Stock Alert Panel',
        performedByUserId: user?.id,
      });

      setSelectedItem(null);
      await loadData();
    } catch (err: any) {
      alert('Failed to restock: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExport = () => {
    const exportData = lowStockItems.map(it => ({
      'Medicine': it.medicine.brand_name,
      'Generic': it.medicine.generic_name,
      'Manufacturer': it.medicine.manufacturer,
      'Available Stock': it.dual.display,
      'Alert Threshold (Pieces)': it.medicine.min_stock_alert,
      'Status': it.isOut ? 'OUT OF STOCK' : 'LOW STOCK',
    }));
    exportToExcel(exportData, 'PharmaDesk_Low_Stock_Report', 'LowStock');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-charcoal-200">
        <div>
          <h1 className="text-xl font-bold text-charcoal-900 tracking-tight flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            Low Stock & Depleted Inventory Alerts
          </h1>
          <p className="text-xs text-charcoal-500 mt-0.5">
            Real-time threshold alerts across branches to prevent stockouts of critical medicines.
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
                <option value="all">All Branches</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name} ({b.branch_code})</option>
                ))}
              </select>
            </div>
          )}

          <Button variant="outline" size="sm" onClick={handleExport}>
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-emerald-700" />
            Export Alert List
          </Button>
        </div>
      </div>

      <Card className="bg-white overflow-hidden" noPadding>
        {isLoading ? (
          <div className="py-12 text-center text-xs text-charcoal-500">Checking inventory levels...</div>
        ) : lowStockItems.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<PackageCheck className="w-6 h-6 text-emerald-600" />}
              title="All medicine stocks are healthy!"
              description="No medicines currently breach their minimum threshold alerts or are out of stock in this branch."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-charcoal-200 bg-cream-50 text-charcoal-600 font-semibold uppercase text-[11px]">
                  <th className="py-2.5 px-4">Medicine Item</th>
                  <th className="py-2.5 px-3">Manufacturer</th>
                  <th className="py-2.5 px-3">Available Stock</th>
                  <th className="py-2.5 px-3">Threshold Alert</th>
                  <th className="py-2.5 px-3 text-center">Deficit Status</th>
                  <th className="py-2.5 px-3 text-right">Selling Price</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal-100">
                {lowStockItems.map((item) => (
                  <tr key={item.medicine.id} className="hover:bg-cream-50/50">
                    <td className="py-3 px-4">
                      <span className="font-bold text-charcoal-900 block">{item.medicine.brand_name}</span>
                      <span className="text-[10px] text-charcoal-500">{item.medicine.generic_name}</span>
                    </td>

                    <td className="py-3 px-3 text-charcoal-700">
                      {item.medicine.manufacturer}
                    </td>

                    <td className="py-3 px-3">
                      <span className="font-bold text-charcoal-900 block font-sans">
                        {item.dual.display}
                      </span>
                    </td>

                    <td className="py-3 px-3 font-semibold text-charcoal-600">
                      {item.medicine.min_stock_alert} pieces
                    </td>

                    <td className="py-3 px-3 text-center">
                      {item.isOut ? (
                        <Badge variant="danger" className="font-bold text-[10px]">OUT OF STOCK</Badge>
                      ) : (
                        <Badge variant="warning" className="font-bold text-[10px]">LOW STOCK</Badge>
                      )}
                    </td>

                    <td className="py-3 px-3 text-right">
                      <div className="font-bold text-charcoal-900">{formatCurrency(item.medicine.strip_selling_price)} / str</div>
                    </td>

                    <td className="py-3 px-3 text-center">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setSelectedItem({ medicine: item.medicine, inventory: item.inventory })}
                        className="h-7 text-xs px-2.5"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Restock Now
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Restock Modal */}
      <Modal
        isOpen={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        title={`Restock — ${selectedItem?.medicine.brand_name}`}
        maxWidth="sm"
      >
        <form onSubmit={handleRestockSubmit} className="space-y-4">
          <div className="p-3 bg-cream-50 rounded border border-charcoal-200 text-xs">
            <p className="font-semibold text-charcoal-900">{selectedItem?.medicine.brand_name}</p>
            <p className="text-charcoal-600">1 strip = {selectedItem?.medicine.pieces_per_strip} pieces</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Quantity"
              type="number"
              min="1"
              value={restockQty}
              onChange={(e) => setRestockQty(parseFloat(e.target.value) || 0)}
              required
            />
            <div>
              <label className="block text-xs font-semibold text-charcoal-700 uppercase tracking-wider mb-1">
                Unit
              </label>
              <select
                value={restockUnit}
                onChange={(e) => setRestockUnit(e.target.value as any)}
                className="w-full text-xs font-medium border border-charcoal-200 rounded-md py-2 px-3 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
              >
                <option value="strip">Strips</option>
                <option value="piece">Pieces</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setSelectedItem(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>
              Inward Stock
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
