import React, { useState, useEffect } from 'react';
import { repositories } from '@/data/repositories';
import { Discrepancy } from '@/types';
import {
  PageHeader,
  Card,
  Table,
  Badge,
  Button,
  Select,
  Modal,
  Textarea,
  Switch,
  StatCard,
} from '@/components/common';
import { AlertCircle, CheckCircle, RefreshCw, AlertTriangle, ShieldAlert } from 'lucide-react';
import { formatDate } from '@/utils/formatters';

export const Discrepancies: React.FC = () => {
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedDisc, setSelectedDisc] = useState<Discrepancy | null>(null);
  const [resolutionAction, setResolutionAction] = useState<string>('adjust_stock');
  const [resolutionNotes, setResolutionNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [allowNegativeStock, setAllowNegativeStock] = useState<boolean>(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await repositories.discrepancies.getDiscrepancies();
      setDiscrepancies(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleResolve = async () => {
    if (!selectedDisc) return;
    setIsSubmitting(true);
    try {
      await repositories.discrepancies.resolveDiscrepancy({
        id: selectedDisc.id,
        action: resolutionAction,
        notes: resolutionNotes,
      });
      setSelectedDisc(null);
      setResolutionNotes('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Resolution failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = discrepancies.filter((d) => {
    if (filterType !== 'all' && d.discrepancy_type !== filterType) return false;
    return true;
  });

  const openCount = discrepancies.filter((d) => d.status === 'open').length;
  const resolvedCount = discrepancies.filter((d) => d.status === 'resolved').length;

  return (
    <div className="page-container space-y-6">
      <PageHeader
        title="Discrepancies & Sync Reconciliation"
        subtitle="Review, audit, and resolve inventory variances, negative stock replays, and offline multi-counter sync conflicts."
        badge={
          <Badge variant={openCount > 0 ? 'danger' : 'success'} dot>
            {openCount > 0 ? `${openCount} Open Conflicts` : 'All Reconciled'}
          </Badge>
        }
        actions={
          <Button variant="outline" size="md" leftIcon={<RefreshCw className="w-4 h-4" />} onClick={loadData}>
            Refresh Sync Feed
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Open Discrepancies"
          value={openCount}
          variant={openCount > 0 ? 'danger' : 'success'}
          icon={<ShieldAlert className="w-5 h-5" />}
          subtext="Requires manager review"
        />
        <StatCard
          label="Resolved Conflicts"
          value={resolvedCount}
          variant="brand"
          icon={<CheckCircle className="w-5 h-5" />}
          subtext="Audit-logged resolutions"
        />
        <div className="bg-white border border-charcoal-200 rounded-lg p-5 shadow-xs flex flex-col justify-between h-[116px]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
              Offline Billing Policy
            </span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="pt-2">
            <Switch
              label="Allow negative stock sale"
              description="Default OFF online. Logs conflict on sync."
              checked={allowNegativeStock}
              onChange={setAllowNegativeStock}
              size="sm"
            />
          </div>
        </div>
      </div>

      {/* Discrepancies Table */}
      <Card
        title="Detected Inventory & Transaction Discrepancies"
        action={
          <div className="w-48">
            <Select
              size="sm"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              options={[
                { value: 'all', label: 'All Discrepancy Types' },
                { value: 'negative_stock', label: 'Negative Stock Replay' },
                { value: 'oversold_batch', label: 'Oversold Batch' },
                { value: 'price_mismatch', label: 'Price Mismatch' },
                { value: 'expired_sold', label: 'Expired Batch Sold' },
                { value: 'sequence_gap', label: 'Sequence Gap' },
              ]}
            />
          </div>
        }
      >
        <Table
          columns={[
            {
              key: 'discrepancy_type',
              header: 'Type',
              render: (row) => (
                <Badge variant={row.discrepancy_type === 'negative_stock' ? 'danger' : 'warning'}>
                  {row.discrepancy_type.replace('_', ' ')}
                </Badge>
              ),
            },
            {
              key: 'title',
              header: 'Summary',
              render: (row) => (
                <div>
                  <span className="font-semibold text-charcoal-900 block">{row.title}</span>
                  <span className="text-xs text-charcoal-500 line-clamp-1">{row.description}</span>
                </div>
              ),
            },
            {
              key: 'client_record_id',
              header: 'Reference ID',
              render: (row) => <span className="font-mono text-xs text-charcoal-700">{row.client_record_id || '—'}</span>,
            },
            {
              key: 'detected_at',
              header: 'Detected',
              render: (row) => <span className="text-xs text-charcoal-600">{formatDate(row.detected_at)}</span>,
            },
            {
              key: 'status',
              header: 'Status',
              render: (row) => (
                <Badge variant={row.status === 'open' ? 'danger' : 'success'}>
                  {row.status.toUpperCase()}
                </Badge>
              ),
            },
            {
              key: 'actions',
              header: 'Resolution',
              align: 'right',
              render: (row) =>
                row.status === 'open' ? (
                  <Button size="sm" variant="outline" onClick={() => setSelectedDisc(row)}>
                    Resolve Conflict
                  </Button>
                ) : (
                  <span className="text-xs text-charcoal-400 font-medium">Reviewed</span>
                ),
            },
          ]}
          data={filtered}
          keyExtractor={(r) => r.id}
        />
      </Card>

      {/* RESOLUTION MODAL */}
      <Modal
        isOpen={Boolean(selectedDisc)}
        onClose={() => setSelectedDisc(null)}
        title="Resolve Discrepancy Conflict"
        subtitle={selectedDisc?.title}
        maxWidth="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setSelectedDisc(null)}>
              Cancel
            </Button>
            <Button variant="primary" isLoading={isSubmitting} onClick={handleResolve}>
              Confirm Resolution
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900 leading-relaxed">
            <strong>Conflict Details:</strong> {selectedDisc?.description}
          </div>

          <Select
            label="Resolution Action"
            value={resolutionAction}
            onChange={(e) => setResolutionAction(e.target.value)}
            options={[
              { value: 'adjust_stock', label: 'Accept & Adjust Physical Stock (Stock Take)' },
              { value: 'credit_note', label: 'Issue Short-Supply / Credit Note Reversal' },
              { value: 'merge_customer', label: 'Merge Duplicate Customer Profiles' },
              { value: 'mark_reviewed', label: 'Mark as Reviewed / False Alarm' },
            ]}
          />

          <Textarea
            label="Mandatory Resolution Reason / Audit Notes"
            placeholder="Explain why this resolution was approved..."
            rows={3}
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
};
export default Discrepancies;
