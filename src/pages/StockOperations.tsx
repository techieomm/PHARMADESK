import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { inventoryService, medicineService } from '@/services/api';
import { StockMovement, Medicine } from '@/types';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Badge } from '@/components/common/Badge';
import { EmptyState } from '@/components/common/EmptyState';
import { formatDate } from '@/utils/formatters';
import { exportToExcel } from '@/utils/exporter';
import { 
  ArrowLeftRight, 
  Search, 
  FileSpreadsheet, 
  PlusCircle, 
  Building2, 
  CheckCircle2,
  Barcode
} from 'lucide-react';

export const StockOperations: React.FC = () => {
  const { user } = useAuth();
  const { branches, selectedBranchId } = useBranch();

  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>(selectedBranchId);

  // Quick Restock Form
  const [selectedMedId, setSelectedMedId] = useState('');
  const [restockQty, setRestockQty] = useState<number>(10);
  const [restockUnit, setRestockUnit] = useState<'strip' | 'piece'>('strip');
  const [batchNo, setBatchNo] = useState('');
  const [expiry, setExpiry] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const branchIdParam = user?.role === 'master_admin'
        ? (selectedBranchFilter === 'all' ? undefined : selectedBranchFilter)
        : (user?.primary_branch_id || undefined);

      const [movData, medData] = await Promise.all([
        inventoryService.getStockMovements(branchIdParam),
        medicineService.getMedicines(),
      ]);
      setMovements(movData);
      setMedicines(medData);
      if (medData.length > 0 && !selectedMedId) {
        setSelectedMedId(medData[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedBranchFilter, user]);

  const handleQuickRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    const targetBranch = selectedBranchFilter === 'all' 
      ? (user?.primary_branch_id || branches[0]?.id || '') 
      : selectedBranchFilter;

    if (!targetBranch) {
      setStatusMsg({ text: 'Please select a specific branch', error: true });
      return;
    }
    if (!selectedMedId) {
      setStatusMsg({ text: 'Please select a medicine', error: true });
      return;
    }

    setIsSubmitting(true);
    try {
      await inventoryService.adjustStock({
        branchId: targetBranch,
        medicineId: selectedMedId,
        adjustmentType: 'add',
        unit: restockUnit,
        quantity: restockQty,
        notes: notes || 'Direct Stock Inward',
        performedByUserId: user?.id,
        batchNumber: batchNo || undefined,
        expiryDate: expiry || undefined,
      });

      setStatusMsg({ text: 'Stock restock recorded successfully!' });
      setNotes('');
      setBatchNo('');
      setExpiry('');
      await loadData();
    } catch (err: any) {
      setStatusMsg({ text: err?.message || 'Failed to record stock', error: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExport = () => {
    const exportData = filteredMovements.map(m => ({
      'Date & Time': formatDate(m.created_at),
      'Medicine': m.medicine?.brand_name || '',
      'Type': m.movement_type,
      'Unit Entered': `${m.unit_quantity} ${m.unit_used}`,
      'Pieces Delta': m.quantity_pieces,
      'Balance After (Pieces)': m.balance_after_pieces,
      'Reference': m.reference_id || '',
      'Notes': m.notes || '',
    }));
    exportToExcel(exportData, 'PharmaDesk_Stock_Movements', 'Movements');
  };

  const filteredMovements = movements.filter(m => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const medName = m.medicine?.brand_name?.toLowerCase() || '';
      const notes = m.notes?.toLowerCase() || '';
      const ref = m.reference_id?.toLowerCase() || '';
      return medName.includes(q) || notes.includes(q) || ref.includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-charcoal-200">
        <div>
          <h1 className="text-xl font-bold text-charcoal-900 tracking-tight">Stock Operations & Movements</h1>
          <p className="text-xs text-charcoal-500 mt-0.5">
            Audit movements for every sale, purchase inward, and stock reconciliation.
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
            Export History
          </Button>
        </div>
      </div>

      {/* Quick Stock Inward / Restock Panel */}
      <Card className="p-5 bg-white">
        <h3 className="text-xs font-bold text-charcoal-700 uppercase tracking-wider mb-3 flex items-center gap-2">
          <PlusCircle className="w-4 h-4 text-brand-600" />
          Quick Stock Inward (Restock)
        </h3>

        {statusMsg && (
          <div className={`p-3 mb-4 rounded text-xs font-medium ${statusMsg.error ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
            {statusMsg.text}
          </div>
        )}

        <form onSubmit={handleQuickRestock} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-charcoal-700 uppercase tracking-wider mb-1">
              Select Medicine
            </label>
            <select
              value={selectedMedId}
              onChange={(e) => setSelectedMedId(e.target.value)}
              className="w-full text-xs font-medium border border-charcoal-200 rounded-md py-2 px-3 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
            >
              {medicines.map(m => (
                <option key={m.id} value={m.id}>
                  {m.brand_name} ({m.strength || m.dosage_form}) - {m.pieces_per_strip} pcs/strip
                </option>
              ))}
            </select>
          </div>

          <div>
            <Input
              label="Quantity"
              type="number"
              min="1"
              value={restockQty}
              onChange={(e) => setRestockQty(parseFloat(e.target.value) || 0)}
              required
            />
          </div>

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
              <option value="piece">Loose Pieces</option>
            </select>
          </div>

          <div>
            <Input
              label="Batch Number"
              placeholder="e.g. B-901"
              value={batchNo}
              onChange={(e) => setBatchNo(e.target.value)}
            />
          </div>

          <div>
            <Button type="submit" variant="primary" size="md" className="w-full" isLoading={isSubmitting}>
              Inward Stock
            </Button>
          </div>
        </form>
      </Card>

      {/* Movement History Table */}
      <Card className="bg-white overflow-hidden" noPadding>
        <div className="px-5 py-3 border-b border-charcoal-100 flex items-center justify-between">
          <h3 className="text-xs font-bold text-charcoal-700 uppercase tracking-wider">
            Stock Movement Audit Trail
          </h3>
          <div className="w-72">
            <Input
              placeholder="Search movements..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search className="w-4 h-4" />}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-xs text-charcoal-500">Loading audit trail...</div>
        ) : filteredMovements.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No stock movements recorded"
              description="Stock movements are logged automatically when sales are completed, stock is inwarded, or adjustments are made."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-charcoal-200 bg-cream-50 text-charcoal-600 font-semibold uppercase text-[11px]">
                  <th className="py-2.5 px-4">Date & Time</th>
                  <th className="py-2.5 px-3">Medicine Item</th>
                  <th className="py-2.5 px-3">Movement Type</th>
                  <th className="py-2.5 px-3 text-right">Unit Entered</th>
                  <th className="py-2.5 px-3 text-right">Quantity (Pieces)</th>
                  <th className="py-2.5 px-3 text-right">Balance After</th>
                  <th className="py-2.5 px-3">Reference / Notes</th>
                  <th className="py-2.5 px-3">Operator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal-100">
                {filteredMovements.map((m) => {
                  const isPositive = m.quantity_pieces > 0;
                  return (
                    <tr key={m.id} className="hover:bg-cream-50/50">
                      <td className="py-3 px-4 text-charcoal-600 font-mono text-[11px]">
                        {formatDate(m.created_at)}
                      </td>

                      <td className="py-3 px-3">
                        <span className="font-bold text-charcoal-900 block">{m.medicine?.brand_name || 'Medicine'}</span>
                        <span className="text-[10px] text-charcoal-500">{m.medicine?.generic_name}</span>
                      </td>

                      <td className="py-3 px-3">
                        <Badge 
                          variant={m.movement_type === 'sale' ? 'neutral' : isPositive ? 'success' : 'warning'}
                          className="uppercase text-[10px] font-semibold"
                        >
                          {m.movement_type}
                        </Badge>
                      </td>

                      <td className="py-3 px-3 text-right text-charcoal-700 font-medium">
                        {m.unit_quantity} {m.unit_used}
                      </td>

                      <td className="py-3 px-3 text-right font-bold font-mono">
                        <span className={isPositive ? 'text-emerald-700' : 'text-charcoal-800'}>
                          {isPositive ? `+${m.quantity_pieces}` : m.quantity_pieces} pcs
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right font-bold text-charcoal-900 font-mono">
                        {m.balance_after_pieces} pcs
                      </td>

                      <td className="py-3 px-3 text-charcoal-600">
                        {m.reference_id && <span className="font-mono font-medium block text-charcoal-800">{m.reference_id}</span>}
                        <span className="text-[11px] text-charcoal-500">{m.notes || '-'}</span>
                      </td>

                      <td className="py-3 px-3 text-charcoal-700">
                        {m.performer?.full_name || 'Staff'}
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
  );
};
