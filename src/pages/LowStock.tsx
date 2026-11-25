import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { inventoryService, medicineService } from '@/services/api';
import { Medicine, BranchInventory } from '@/types';
import { 
  Card, 
  StatCard, 
  Button, 
  Badge, 
  EmptyState, 
  Modal, 
  Input, 
  Select, 
  PageHeader, 
  Toolbar, 
  Skeleton 
} from '@/components/common';
import { formatDualUnitStock, formatCurrency } from '@/utils/formatters';
import { exportToExcel } from '@/utils/exporter';
import { AlertTriangle, Plus, FileSpreadsheet, Building2, PackageCheck, Search } from 'lucide-react';

export const LowStock: React.FC = () => {
  const { user } = useAuth();
  const { branches, selectedBranchId } = useBranch();

  const [inventory, setInventory] = useState<BranchInventory[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>(selectedBranchId);
  const [searchQuery, setSearchQuery] = useState('');

  // Restock Modal
  const [selectedItem, setSelectedItem] = useState<{ 
    medicine: Medicine; 
    inventory?: BranchInventory; 
    dual: { display: string; strips: number; loosePieces: number };
  } | null>(null);
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

  const filteredItems = lowStockItems.filter(item => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.medicine.brand_name.toLowerCase().includes(q) ||
        item.medicine.generic_name.toLowerCase().includes(q) ||
        item.medicine.manufacturer.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const outOfStockCount = lowStockItems.filter(i => i.isOut).length;
  const criticalLowCount = lowStockItems.filter(i => i.isLow).length;

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
        notes: 'Restocked via Low Stock Quick-Action',
        performedByUserId: user?.id,
      });

      setSelectedItem(null);
      await loadData();
    } catch (err: any) {
      alert('Error updating stock: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExport = () => {
    const data = filteredItems.map(it => ({
      'Medicine': it.medicine.brand_name,
      'Generic': it.medicine.generic_name,
      'Manufacturer': it.medicine.manufacturer,
      'Available Pieces': it.stockPieces,
      'Stock Display': it.dual.display,
      'Min Alert Level': it.medicine.min_stock_alert,
      'Status': it.isOut ? 'OUT OF STOCK' : 'LOW STOCK',
      'Deficit': Math.max(0, it.medicine.min_stock_alert - it.stockPieces),
    }));
    exportToExcel(data, 'BajrangPharmacy_Low_Stock_Report', 'Low Stock');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Low Stock & Depletion Alerts"
        subtitle="Prioritized procurement list for near-zero inventory items."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="md" onClick={handleExport} leftIcon={<FileSpreadsheet className="w-4 h-4 text-emerald-700" />}>
              Export Reorder List
            </Button>
          </div>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          label="Out of Stock (Zero Inventory)"
          value={outOfStockCount}
          icon={<PackageCheck className="w-5 h-5 text-red-600" />}
          subtext="Immediate replenishment required"
          variant={outOfStockCount > 0 ? 'danger' : 'default'}
        />

        <StatCard
          label="Critical Low Stock Items"
          value={criticalLowCount}
          icon={<AlertTriangle className="w-5 h-5 text-amber-600" />}
          subtext="Stock below minimum safe threshold"
          variant={criticalLowCount > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* Filter Toolbar */}
      <Toolbar>
        <div className="flex-1 min-w-[240px]">
          <Input
            placeholder="Search low stock medicines by brand, generic, manufacturer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>

        {user?.role === 'master_admin' && (
          <div className="w-52">
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
      </Toolbar>

      {/* Table */}
      <Card className="bg-white overflow-hidden" noPadding>
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton height={42} className="w-full" />
            <Skeleton height={42} className="w-full" />
            <Skeleton height={42} className="w-full" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<AlertTriangle className="w-8 h-8 text-emerald-500" />}
              title="All inventory healthy"
              description="No medicines are currently at or below their low-stock threshold."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-charcoal-200 bg-cream-50 text-charcoal-600 font-semibold uppercase text-[11px]">
                  <th className="py-3 px-4">Medicine Item</th>
                  <th className="py-3 px-3">Manufacturer</th>
                  <th className="py-3 px-3 text-center">Alert Status</th>
                  <th className="py-3 px-3 text-right">Available Stock</th>
                  <th className="py-3 px-3 text-right">Safe Threshold</th>
                  <th className="py-3 px-3 text-right">Estimated Deficit</th>
                  <th className="py-3 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal-100">
                {filteredItems.map((item) => (
                  <tr key={item.medicine.id} className="hover:bg-cream-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-bold text-charcoal-900 block text-sm">{item.medicine.brand_name}</span>
                      <span className="text-[11px] text-charcoal-500">{item.medicine.generic_name} ({item.medicine.dosage_form})</span>
                    </td>

                    <td className="py-3 px-3 text-charcoal-700">
                      {item.medicine.manufacturer}
                    </td>

                    <td className="py-3 px-3 text-center">
                      {item.isOut ? (
                        <Badge variant="danger" size="sm" className="font-bold">OUT OF STOCK</Badge>
                      ) : (
                        <Badge variant="warning" size="sm" className="font-bold">LOW STOCK</Badge>
                      )}
                    </td>

                    <td className="py-3 px-3 text-right font-bold text-charcoal-900 font-mono">
                      {item.dual.display}
                    </td>

                    <td className="py-3 px-3 text-right text-charcoal-600 font-mono">
                      {item.medicine.min_stock_alert} pieces
                    </td>

                    <td className="py-3 px-3 text-right font-bold text-red-700 font-mono">
                      {Math.max(0, item.medicine.min_stock_alert - item.stockPieces)} pieces
                    </td>

                    <td className="py-3 px-3 text-center">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          setSelectedItem(item);
                          setRestockQty(10);
                          setRestockUnit('strip');
                        }}
                        leftIcon={<Plus className="w-3.5 h-3.5" />}
                      >
                        Restock
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Restock Quick Modal */}
      {selectedItem && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedItem(null)}
          title={`Quick Restock — ${selectedItem.medicine.brand_name}`}
          maxWidth="sm"
        >
          <form onSubmit={handleRestockSubmit} className="space-y-4">
            <div className="p-3 bg-cream-100 rounded-lg border border-charcoal-200 text-xs space-y-1">
              <p className="font-bold text-charcoal-900">{selectedItem.medicine.brand_name}</p>
              <p className="text-charcoal-600">Current Stock: {selectedItem.dual.display}</p>
              <p className="text-charcoal-600">Min Alert: {selectedItem.medicine.min_stock_alert} pieces</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Restock Quantity *"
                type="number"
                min="1"
                value={restockQty}
                onChange={(e) => setRestockQty(parseFloat(e.target.value) || 0)}
                required
              />

              <Select
                label="Unit *"
                value={restockUnit}
                onChange={(e) => setRestockUnit(e.target.value as any)}
                options={[
                  { value: 'strip', label: 'Strips' },
                  { value: 'piece', label: 'Pieces' },
                ]}
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-charcoal-100">
              <Button variant="outline" type="button" onClick={() => setSelectedItem(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" isLoading={isSubmitting}>
                Add to Stock
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
