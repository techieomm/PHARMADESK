import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { inventoryService, medicineService } from '@/services/api';
import { StockMovement, Medicine } from '@/types';
import { 
  Card, 
  Button, 
  Input, 
  Select, 
  Badge, 
  EmptyState, 
  PageHeader, 
  Toolbar, 
  Skeleton 
} from '@/components/common';
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
    exportToExcel(exportData, 'BajrangPharmacy_Stock_Movements', 'Movements');
  };

  const filteredMovements = movements.filter(m => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const medName = m.medicine?.brand_name?.toLowerCase() || '';
      const n = m.notes?.toLowerCase() || '';
      const ref = m.reference_id?.toLowerCase() || '';
      return medName.includes(q) || n.includes(q) || ref.includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Operations & Movements"
        subtitle="Audit stock movements for every sale, purchase inward, and reconciliation."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="md" onClick={handleExport} leftIcon={<FileSpreadsheet className="w-4 h-4 text-emerald-700" />}>
              Export History
            </Button>
          </div>
        }
      />

      {/* Quick Stock Inward / Restock Panel */}
      <Card className="bg-white">
        <h3 className="text-xs font-bold text-charcoal-700 uppercase tracking-wider mb-3 flex items-center gap-2">
          <PlusCircle className="w-4 h-4 text-brand-600" />
          Quick Stock Inward (Restock Entry)
        </h3>

        {statusMsg && (
          <div className={`p-3 mb-4 rounded-md text-xs font-medium ${statusMsg.error ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
            {statusMsg.text}
          </div>
        )}

        <form onSubmit={handleQuickRestock} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
          <div className="lg:col-span-2">
            <Select
              label="Select Medicine *"
              value={selectedMedId}
              onChange={(e) => setSelectedMedId(e.target.value)}
              options={medicines.map(m => ({
                value: m.id,
                label: `${m.brand_name} (${m.strength || m.dosage_form}) - ${m.pieces_per_strip} pcs/strip`
              }))}
            />
          </div>

          <div>
            <Input
              label="Quantity *"
              type="number"
              min="1"
              value={restockQty}
              onChange={(e) => setRestockQty(parseFloat(e.target.value) || 0)}
              required
            />
          </div>

          <div>
            <Select
              label="Unit *"
              value={restockUnit}
              onChange={(e) => setRestockUnit(e.target.value as any)}
              options={[
                { value: 'strip', label: 'Strips / Packs' },
                { value: 'piece', label: 'Loose Pieces' },
              ]}
            />
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

      {/* Filter Toolbar */}
      <Toolbar>
        <div className="flex-1 min-w-[240px]">
          <Input
            placeholder="Search movement audit log by medicine name, reference ID, notes..."
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

      {/* Movement History Table */}
      <Card className="bg-white overflow-hidden" noPadding>
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton height={42} className="w-full" />
            <Skeleton height={42} className="w-full" />
            <Skeleton height={42} className="w-full" />
          </div>
        ) : filteredMovements.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<ArrowLeftRight className="w-8 h-8 text-charcoal-400" />}
              title="No stock movements recorded"
              description="Every stock movement (sale deduction, return restocking, adjustment) will be audited here."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-charcoal-200 bg-cream-50 text-charcoal-600 font-semibold uppercase text-[11px]">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-3">Medicine</th>
                  <th className="py-3 px-3 text-center">Type</th>
                  <th className="py-3 px-3 text-right">Unit Qty</th>
                  <th className="py-3 px-3 text-right">Delta Pieces</th>
                  <th className="py-3 px-3 text-right">Balance Pieces</th>
                  <th className="py-3 px-3">Reference / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal-100">
                {filteredMovements.map((m) => (
                  <tr key={m.id} className="hover:bg-cream-50/60 transition-colors">
                    <td className="py-3 px-4 text-charcoal-600 font-mono">
                      {formatDate(m.created_at)}
                    </td>

                    <td className="py-3 px-3 font-bold text-charcoal-900">
                      {m.medicine?.brand_name || 'Medicine'}
                    </td>

                    <td className="py-3 px-3 text-center">
                      <Badge 
                        variant={m.quantity_pieces >= 0 ? 'success' : 'danger'} 
                        size="sm"
                        className="uppercase font-bold"
                      >
                        {m.movement_type}
                      </Badge>
                    </td>

                    <td className="py-3 px-3 text-right font-medium text-charcoal-800">
                      {m.unit_quantity} {m.unit_used}
                    </td>

                    <td className={`py-3 px-3 text-right font-bold font-mono ${m.quantity_pieces >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {m.quantity_pieces >= 0 ? `+${m.quantity_pieces}` : m.quantity_pieces}
                    </td>

                    <td className="py-3 px-3 text-right font-bold text-charcoal-900 font-mono">
                      {m.balance_after_pieces} pcs
                    </td>

                    <td className="py-3 px-3 text-charcoal-600">
                      <span className="font-mono text-[11px] block">{m.reference_id || '-'}</span>
                      <span className="text-[10px] text-charcoal-500">{m.notes}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
