import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { billingService } from '@/services/api';
import { supabase } from '@/lib/supabase';
import { Invoice } from '@/types';
import {
  Card,
  Button,
  Input,
  Select,
  Badge,
  EmptyState,
  PageHeader,
  Toolbar,
  Skeleton,
  Modal,
} from '@/components/common';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { exportToExcel, exportToPdf } from '@/utils/exporter';
import { InvoicePrintModal } from '@/components/pos/InvoicePrintModal';
import {
  Search,
  Printer,
  Download,
  FileSpreadsheet,
  Receipt,
  RefreshCw,
  Ban,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';

export const InvoiceHistory: React.FC = () => {
  const { user } = useAuth();
  const { branches, selectedBranchId } = useBranch();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>(selectedBranchId);
  const [selectedPaymentFilter, setSelectedPaymentFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | '7days' | '30days'>('all');

  // Sync when top navbar branch changes
  useEffect(() => {
    setSelectedBranchFilter(selectedBranchId);
  }, [selectedBranchId]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 15;

  // Preview modal
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Cancel modal
  const [cancelModalInvoice, setCancelModalInvoice] = useState<Invoice | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const fetchInvoices = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const branchIdParam =
        user?.role === 'master_admin'
          ? selectedBranchFilter === 'all'
            ? undefined
            : selectedBranchFilter
          : user?.primary_branch_id || undefined;

      const data = await billingService.getInvoices(branchIdParam);
      setInvoices(data);
    } catch (e: any) {
      console.error('Failed to load invoices:', e);
      setFetchError(e.message || 'Failed to retrieve invoices');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();

    // Live Sync Subscription
    const channel = supabase
      .channel('realtime_invoices_channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoices' },
        () => {
          fetchInvoices();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedBranchFilter, user]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedBranchFilter, selectedPaymentFilter, selectedStatusFilter, dateFilter]);

  // Apply in-memory client filters for search, payment, status, and date
  const filteredInvoices = invoices.filter((inv) => {
    // Search query filter (Invoice number, customer name, customer phone)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        inv.invoice_number.toLowerCase().includes(q) ||
        inv.customer_name.toLowerCase().includes(q) ||
        (inv.customer_phone ? inv.customer_phone.toLowerCase().includes(q) : false);
      if (!match) return false;
    }

    // Payment method filter
    if (selectedPaymentFilter !== 'all' && inv.payment_method !== selectedPaymentFilter) {
      return false;
    }

    // Status filter (Paid vs Cancelled)
    if (selectedStatusFilter !== 'all') {
      if (selectedStatusFilter === 'cancelled' && inv.payment_status !== 'cancelled') return false;
      if (selectedStatusFilter === 'paid' && inv.payment_status === 'cancelled') return false;
    }

    // Date filter
    if (dateFilter !== 'all') {
      const invDate = new Date(inv.invoice_date);
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      if (dateFilter === 'today') {
        if (invDate < todayStart) return false;
      } else if (dateFilter === 'yesterday') {
        const yesterdayStart = new Date(todayStart);
        yesterdayStart.setDate(yesterdayStart.getDate() - 1);
        if (invDate < yesterdayStart || invDate >= todayStart) return false;
      } else if (dateFilter === '7days') {
        const sevenDaysAgo = new Date(todayStart);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        if (invDate < sevenDaysAgo) return false;
      } else if (dateFilter === '30days') {
        const thirtyDaysAgo = new Date(todayStart);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        if (invDate < thirtyDaysAgo) return false;
      }
    }

    return true;
  });

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize));
  const paginatedInvoices = filteredInvoices.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleOpenPrint = (inv: Invoice) => {
    setPreviewInvoice(inv);
    setShowPrintModal(true);
  };

  const handleOpenCancelModal = (inv: Invoice) => {
    setCancelModalInvoice(inv);
    setCancelReason('');
    setCancelError(null);
  };

  const handleConfirmCancel = async () => {
    if (!cancelModalInvoice) return;
    if (!cancelReason.trim()) {
      setCancelError('Please enter a cancellation reason.');
      return;
    }

    setIsCancelling(true);
    setCancelError(null);
    try {
      await billingService.cancelInvoice(cancelModalInvoice.id, cancelReason.trim());
      setCancelModalInvoice(null);
      await fetchInvoices();
    } catch (err: any) {
      console.error(err);
      setCancelError(err.message || 'Invoice cancellation failed');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleExportExcel = () => {
    const exportData = filteredInvoices.map((inv) => ({
      'Invoice Number': inv.invoice_number,
      'Date': formatDate(inv.invoice_date),
      'Status': inv.payment_status.toUpperCase(),
      'Branch': inv.branch?.name || '',
      'Customer Name': inv.customer_name,
      'Customer Phone': inv.customer_phone || '',
      'Payment Method': inv.payment_method.toUpperCase(),
      'Taxable Amount (₹)': inv.subtotal_taxable,
      'Total GST (₹)': inv.total_gst,
      'Total Bill Amount (₹)': inv.total_amount,
      'Cancellation Reason': inv.cancelled_reason || '',
    }));
    exportToExcel(exportData, 'BajrangPharmacy_Invoices', 'Invoices');
  };

  const handleExportPdf = () => {
    const headers = ['Inv #', 'Date', 'Status', 'Customer', 'Payment', 'Total (₹)'];
    const rows = filteredInvoices.map((inv) => [
      inv.invoice_number,
      formatDate(inv.invoice_date, false),
      inv.payment_status.toUpperCase(),
      inv.customer_name,
      inv.payment_method.toUpperCase(),
      `₹${inv.total_amount.toFixed(2)}`,
    ]);
    exportToPdf(
      'Bajrang Pharmacy - Sales Invoices Register',
      headers,
      rows,
      'BajrangPharmacy_Invoice_Register'
    );
  };

  const canCancelInvoices =
    user?.role === 'master_admin' ||
    user?.role === 'sub_admin' ||
    user?.role === 'branch_manager';

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title="Invoice History & Receipts"
        subtitle="Audit tax invoices, reprint receipts, track live billing, and manage sales cancellations."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="md"
              onClick={fetchInvoices}
              isLoading={isLoading}
              leftIcon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
            >
              Refresh
            </Button>
            <Button
              variant="outline"
              size="md"
              onClick={handleExportExcel}
              leftIcon={<FileSpreadsheet className="w-4 h-4 text-emerald-700" />}
            >
              Export Excel
            </Button>
            <Button
              variant="outline"
              size="md"
              onClick={handleExportPdf}
              leftIcon={<Download className="w-4 h-4 text-brand-600" />}
            >
              Export PDF
            </Button>
          </div>
        }
      />

      {/* Filter Toolbar */}
      <Toolbar>
        <div className="flex-1 min-w-[240px]">
          <Input
            placeholder="Search by invoice number, customer name, phone..."
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
                  ...branches.map((b) => ({ value: b.id, label: `${b.name} (${b.branch_code})` })),
                ]}
              />
            </div>
          )}

          <div className="w-36">
            <Select
              size="md"
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Statuses' },
                { value: 'paid', label: 'Paid Active' },
                { value: 'cancelled', label: 'Cancelled / Void' },
              ]}
            />
          </div>

          <div className="w-36">
            <Select
              size="md"
              value={selectedPaymentFilter}
              onChange={(e) => setSelectedPaymentFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Payments' },
                { value: 'cash', label: 'Cash' },
                { value: 'upi', label: 'UPI / QR' },
                { value: 'card', label: 'Card' },
                { value: 'credit', label: 'Credit (Udhaar)' },
                { value: 'split', label: 'Split Payment' },
              ]}
            />
          </div>

          <div className="w-36">
            <Select
              size="md"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              options={[
                { value: 'all', label: 'All Dates' },
                { value: 'today', label: 'Today' },
                { value: 'yesterday', label: 'Yesterday' },
                { value: '7days', label: 'Last 7 Days' },
                { value: '30days', label: 'Last 30 Days' },
              ]}
            />
          </div>
        </div>
      </Toolbar>

      {/* Invoice Table */}
      {fetchError && (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-300 text-rose-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>Error loading invoices: {fetchError}</span>
          </div>
          <Button size="sm" variant="outline" onClick={fetchInvoices}>
            Retry
          </Button>
        </div>
      )}

      <Card className="bg-white overflow-hidden" noPadding>
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton height={40} className="w-full" />
            <Skeleton height={40} className="w-full" />
            <Skeleton height={40} className="w-full" />
            <Skeleton height={40} className="w-full" />
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Receipt className="w-8 h-8 text-charcoal-400" />}
              title="No invoices found"
              description="No billing invoices match the active filter criteria or no invoices have been generated yet."
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-charcoal-200 bg-cream-50 text-charcoal-600 font-semibold uppercase text-[11px]">
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-3">Date & Time</th>
                    <th className="py-3 px-3">Branch</th>
                    <th className="py-3 px-3">Customer Details</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Payment</th>
                    <th className="py-3 px-3 text-right">Taxable</th>
                    <th className="py-3 px-3 text-right">GST</th>
                    <th className="py-3 px-4 text-right">Total Amount</th>
                    <th className="py-3 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-charcoal-100">
                  {paginatedInvoices.map((inv) => {
                    const isCancelled = inv.payment_status === 'cancelled';

                    return (
                      <tr
                        key={inv.id}
                        className={`transition-colors ${
                          isCancelled ? 'bg-rose-50/40 hover:bg-rose-50/60' : 'hover:bg-cream-50/60'
                        }`}
                      >
                        <td className="py-3 px-4 font-bold font-mono">
                          <span className={isCancelled ? 'line-through text-rose-700' : 'text-charcoal-900'}>
                            {inv.invoice_number}
                          </span>
                        </td>

                        <td className="py-3 px-3 text-charcoal-600 font-mono">
                          {formatDate(inv.invoice_date)}
                        </td>

                        <td className="py-3 px-3 text-charcoal-800">
                          <span className="font-semibold block font-mono">{inv.branch?.branch_code || 'MAIN'}</span>
                          <span className="text-[10px] text-charcoal-500">{inv.branch?.name}</span>
                        </td>

                        <td className="py-3 px-3">
                          <span className="font-semibold text-charcoal-900 block">{inv.customer_name}</span>
                          {inv.customer_phone && (
                            <span className="text-[10px] text-charcoal-500 font-mono">{inv.customer_phone}</span>
                          )}
                        </td>

                        <td className="py-3 px-3">
                          <Badge
                            variant={isCancelled ? 'danger' : 'success'}
                            size="sm"
                            className="uppercase font-bold"
                          >
                            {isCancelled ? 'Void' : 'Paid'}
                          </Badge>
                        </td>

                        <td className="py-3 px-3">
                          <Badge
                            variant={inv.payment_method === 'credit' ? 'warning' : 'brand'}
                            size="sm"
                            className="uppercase font-bold"
                          >
                            {inv.payment_method}
                          </Badge>
                        </td>

                        <td className="py-3 px-3 text-right font-medium text-charcoal-700 font-mono">
                          {formatCurrency(inv.subtotal_taxable)}
                        </td>

                        <td className="py-3 px-3 text-right font-medium text-charcoal-700 font-mono">
                          {formatCurrency(inv.total_gst)}
                        </td>

                        <td className="py-3 px-4 text-right font-bold font-mono text-sm">
                          <span className={isCancelled ? 'text-rose-700 line-through' : 'text-charcoal-900'}>
                            {formatCurrency(inv.total_amount)}
                          </span>
                        </td>

                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenPrint(inv)}
                              leftIcon={<Printer className="w-3.5 h-3.5" />}
                              title="View & Print Invoice"
                            >
                              Print
                            </Button>

                            {!isCancelled && canCancelInvoices && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenCancelModal(inv)}
                                className="text-rose-600 hover:text-rose-700 hover:border-rose-300"
                                leftIcon={<Ban className="w-3.5 h-3.5" />}
                                title="Cancel and Restock Bill"
                              >
                                Cancel
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-3 border-t border-charcoal-200 bg-cream-50/60 flex items-center justify-between text-xs text-charcoal-600">
              <span>
                Showing <b>{Math.min(filteredInvoices.length, (currentPage - 1) * pageSize + 1)}</b> to{' '}
                <b>{Math.min(filteredInvoices.length, currentPage * pageSize)}</b> of{' '}
                <b>{filteredInvoices.length}</b> invoices
              </span>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
                >
                  Previous
                </Button>
                <span className="font-mono font-bold px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Invoice Print & Preview Modal */}
      <InvoicePrintModal
        invoice={previewInvoice}
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
      />

      {/* Cancel Invoice Confirmation Modal */}
      <Modal
        isOpen={!!cancelModalInvoice}
        onClose={() => setCancelModalInvoice(null)}
        title={`Cancel Invoice #${cancelModalInvoice?.invoice_number}`}
        subtitle="Restores inventory stock pieces and logs an audit trail event"
        maxWidth="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelModalInvoice(null)}>
              Abort
            </Button>
            <Button
              variant="primary"
              className="bg-rose-600 hover:bg-rose-700 text-white"
              isLoading={isCancelling}
              onClick={handleConfirmCancel}
            >
              Confirm Cancellation
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-1">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span>Permanent Cancellation Warning</span>
            </div>
            <p>
              This will void invoice <b>{cancelModalInvoice?.invoice_number}</b> (Amount:{' '}
              <b>₹{cancelModalInvoice?.total_amount.toFixed(2)}</b>). All sold medicine units will be restocked
              back into their batches, and the cash register will adjust.
            </p>
          </div>

          {cancelError && (
            <div className="p-2 rounded bg-rose-100 text-rose-900 text-xs font-semibold">
              {cancelError}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-charcoal-700 mb-1">
              Cancellation Reason (Mandatory) *
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Customer changed mind / Billing error / Doctor altered prescription..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full text-xs p-2.5 rounded border border-charcoal-300 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 bg-white"
              required
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
