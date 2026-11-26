import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { billingService } from '@/services/api';
import { DayBookData, DayBookInvoiceItem, Invoice } from '@/types';
import {
  PageHeader,
  Card,
  Button,
  Input,
  Select,
  Badge,
  EmptyState,
  Skeleton,
} from '@/components/common';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { exportToExcel, exportToPdf } from '@/utils/exporter';
import { InvoicePrintModal } from '@/components/pos/InvoicePrintModal';
import {
  Calendar,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FileSpreadsheet,
  Download,
  Receipt,
  RotateCcw,
  Ban,
  Wallet,
  CreditCard,
  QrCode,
  DollarSign,
  ArrowRight,
  Printer,
  TrendingUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Returns today's calendar date in IST (Asia/Kolkata) as YYYY-MM-DD
 */
const getTodayIstString = (): string => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
};

export const DayBook: React.FC = () => {
  const { user } = useAuth();
  const { branches, selectedBranchId } = useBranch();

  // Filter state
  const [selectedDate, setSelectedDate] = useState<string>(getTodayIstString());
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>(selectedBranchId);
  const [activeTab, setActiveTab] = useState<'invoices' | 'returns' | 'cancelled' | 'udhaar' | 'payments'>('invoices');

  // Data state
  const [dayBook, setDayBook] = useState<DayBookData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Print modal state
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);

  const fetchDayBook = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const branchParam =
        user?.role === 'master_admin'
          ? selectedBranchFilter === 'all'
            ? undefined
            : selectedBranchFilter
          : user?.primary_branch_id || undefined;

      const data = await billingService.getDayBook({
        branchId: branchParam,
        date: selectedDate,
      });
      setDayBook(data);
    } catch (err: any) {
      console.error('Failed to load Day Book:', err);
      setError(err.message || 'Failed to load Day Book data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDayBook();
  }, [selectedDate, selectedBranchFilter]);

  const handleQuickDate = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const dateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
    setSelectedDate(dateStr);
  };

  const handleViewInvoice = async (invoiceId: string) => {
    try {
      const inv = await billingService.getInvoiceById(invoiceId);
      if (inv) {
        setPrintInvoice(inv);
        setShowPrintModal(true);
      }
    } catch (e) {
      console.error('Error fetching invoice for print:', e);
    }
  };

  const handleExportExcel = () => {
    if (!dayBook) return;

    const summaryData = [
      { Metric: 'Target Date (IST)', Value: dayBook.date },
      { Metric: 'Gross Sales (₹)', Value: dayBook.summary.gross_sales_amount },
      { Metric: 'Invoice Count', Value: dayBook.summary.gross_sales_count },
      { Metric: 'Net Sales (₹)', Value: dayBook.summary.net_sales_amount },
      { Metric: 'Cash Collected (₹)', Value: dayBook.summary.cash_collected },
      { Metric: 'UPI / QR Received (₹)', Value: dayBook.summary.upi_collected },
      { Metric: 'Card Received (₹)', Value: dayBook.summary.card_collected },
      { Metric: 'Credit / Udhaar Given (₹)', Value: dayBook.summary.credit_given },
      { Metric: 'Udhaar Recovered (₹)', Value: dayBook.summary.credit_recovered },
      { Metric: 'Total GST (₹)', Value: dayBook.summary.total_gst },
      { Metric: 'Returns Amount (₹)', Value: dayBook.summary.returns_amount },
      { Metric: 'Cancelled Amount (₹)', Value: dayBook.summary.cancelled_amount },
      { Metric: 'Reconciliation Status', Value: dayBook.summary.is_balanced ? 'BALANCED' : 'DISCREPANCY' },
    ];

    const invoiceData = dayBook.invoices.map((inv) => ({
      'Invoice #': inv.invoice_number,
      'Time (IST)': formatDate(inv.invoice_date),
      'Customer': inv.customer_name,
      'Phone': inv.customer_phone || '',
      'Payment Mode': inv.payment_method.toUpperCase(),
      'Taxable (₹)': inv.subtotal_taxable,
      'GST (₹)': inv.total_gst,
      'Total (₹)': inv.total_amount,
      'Cashier': inv.cashier_name || '',
      'Branch': inv.branch_name || '',
    }));

    exportToExcel(
      [...summaryData, { Metric: '---', Value: '---' }, ...invoiceData],
      `BajrangPharmacy_DayBook_${dayBook.date}`,
      'Day_Book'
    );
  };

  const handleExportPdf = () => {
    if (!dayBook) return;

    const headers = ['Inv #', 'Customer', 'Mode', 'Taxable (₹)', 'GST (₹)', 'Total (₹)'];
    const rows = dayBook.invoices.map((inv) => [
      inv.invoice_number,
      inv.customer_name,
      inv.payment_method.toUpperCase(),
      `₹${inv.subtotal_taxable.toFixed(2)}`,
      `₹${inv.total_gst.toFixed(2)}`,
      `₹${inv.total_amount.toFixed(2)}`,
    ]);

    exportToPdf(
      `Bajrang Pharmacy Day Book — ${dayBook.date} (IST)`,
      headers,
      rows,
      `BajrangPharmacy_DayBook_${dayBook.date}`,
      `Gross: ₹${dayBook.summary.gross_sales_amount.toFixed(2)} | Net: ₹${dayBook.summary.net_sales_amount.toFixed(2)} | Cash: ₹${dayBook.summary.cash_collected.toFixed(2)}`
    );
  };

  const summary = dayBook?.summary;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Day Book & Reconciliation"
        subtitle="Daily statutory accounting register, GST collections, and cash drawer reconciliation in IST."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="md"
              onClick={fetchDayBook}
              isLoading={isLoading}
              leftIcon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
            >
              Refresh
            </Button>
            <Button
              variant="outline"
              size="md"
              onClick={handleExportExcel}
              disabled={!dayBook}
              leftIcon={<FileSpreadsheet className="w-4 h-4 text-emerald-700" />}
            >
              Excel
            </Button>
            <Button
              variant="outline"
              size="md"
              onClick={handleExportPdf}
              disabled={!dayBook}
              leftIcon={<Download className="w-4 h-4 text-brand-600" />}
            >
              PDF
            </Button>
            <Link to="/day-close">
              <Button
                variant="primary"
                size="md"
                leftIcon={<ArrowRight className="w-4 h-4" />}
              >
                Close Day Register
              </Button>
            </Link>
          </div>
        }
      />

      {/* Date & Branch Controls Toolbar */}
      <Card className="bg-white border-charcoal-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-charcoal-700 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-brand-600" />
              Audit Date (IST):
            </span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-9 px-3 py-1 bg-cream-50 border border-charcoal-300 rounded-md text-xs font-mono font-bold text-charcoal-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
            <div className="inline-flex rounded-md shadow-xs border border-charcoal-200 overflow-hidden">
              <button
                type="button"
                onClick={() => handleQuickDate(0)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedDate === getTodayIstString()
                    ? 'bg-brand-500 text-white font-bold'
                    : 'bg-white text-charcoal-700 hover:bg-cream-100'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => handleQuickDate(1)}
                className="px-3 py-1.5 text-xs font-medium bg-white text-charcoal-700 hover:bg-cream-100 border-l border-charcoal-200"
              >
                Yesterday
              </button>
            </div>
          </div>

          {user?.role === 'master_admin' && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-charcoal-600">Dispensary:</span>
              <div className="w-60">
                <Select
                  size="sm"
                  value={selectedBranchFilter}
                  onChange={(e) => setSelectedBranchFilter(e.target.value)}
                  options={[
                    { value: 'all', label: 'All Branches (Consolidated)' },
                    ...branches.map((b) => ({ value: b.id, label: `${b.name} (${b.branch_code})` })),
                  ]}
                />
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Reconciliation Alert Banner */}
      {summary && (
        <div
          className={`p-4 rounded-lg border flex items-center justify-between gap-4 transition-all ${
            summary.is_balanced
              ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
              : 'bg-rose-50 border-rose-300 text-rose-950'
          }`}
        >
          <div className="flex items-center gap-3">
            {summary.is_balanced ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0" />
            )}
            <div>
              <h4 className="font-bold text-sm">
                {summary.is_balanced
                  ? 'Cash Drawer & Books Balanced'
                  : 'Reconciliation Discrepancy Detected'}
              </h4>
              <p className="text-xs opacity-90 mt-0.5">
                {summary.is_balanced
                  ? `All sales receipts (Gross ₹${summary.gross_sales_amount.toFixed(2)}) reconcile with drawer collections (Cash: ₹${summary.cash_collected.toFixed(2)}, UPI: ₹${summary.upi_collected.toFixed(2)}, Card: ₹${summary.card_collected.toFixed(2)}, Credit: ₹${summary.credit_given.toFixed(2)}).`
                  : `Discrepancy of ₹${Math.abs(summary.reconciliation_difference).toFixed(2)} between active sales and collected tenders. Check unallocated invoices or payment records.`}
              </p>
            </div>
          </div>

          <Badge variant={summary.is_balanced ? 'success' : 'danger'} size="md" className="font-mono uppercase font-bold shrink-0">
            {summary.is_balanced ? '100% Balanced' : `Diff: ₹${summary.reconciliation_difference.toFixed(2)}`}
          </Badge>
        </div>
      )}

      {/* KPI Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="p-4 bg-white">
              <Skeleton height={20} className="w-24 mb-2" />
              <Skeleton height={32} className="w-36" />
            </Card>
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Gross Sales */}
          <Card className="p-4 bg-white border-charcoal-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-charcoal-600">Gross Sales</span>
              <Receipt className="w-4 h-4 text-brand-600" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-mono font-bold text-charcoal-900">
                {formatCurrency(summary.gross_sales_amount)}
              </span>
              <span className="text-xs text-charcoal-500 font-medium">
                {summary.gross_sales_count} bills
              </span>
            </div>
            <p className="text-[11px] text-charcoal-500 mt-1 truncate">
              Taxable: {formatCurrency(summary.taxable_amount)}
            </p>
          </Card>

          {/* 2. Net Sales */}
          <Card className="p-4 bg-white border-charcoal-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-charcoal-600">Net Sales</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-2">
              <span className="text-2xl font-mono font-bold text-emerald-700">
                {formatCurrency(summary.net_sales_amount)}
              </span>
            </div>
            <p className="text-[11px] text-charcoal-500 mt-1 truncate">
              After returns & cancellations
            </p>
          </Card>

          {/* 3. Cash In Drawer */}
          <Card className="p-4 bg-white border-charcoal-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-charcoal-600">Cash in Drawer</span>
              <Wallet className="w-4 h-4 text-amber-600" />
            </div>
            <div className="mt-2">
              <span className="text-2xl font-mono font-bold text-charcoal-900">
                {formatCurrency(summary.cash_collected)}
              </span>
            </div>
            <p className="text-[11px] text-charcoal-500 mt-1 truncate">
              Physical cash tendered
            </p>
          </Card>

          {/* 4. Digital UPI */}
          <Card className="p-4 bg-white border-charcoal-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-charcoal-600">UPI / QR Payments</span>
              <QrCode className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="mt-2">
              <span className="text-2xl font-mono font-bold text-charcoal-900">
                {formatCurrency(summary.upi_collected)}
              </span>
            </div>
            <p className="text-[11px] text-charcoal-500 mt-1 truncate">
              Bank settled digital UPI
            </p>
          </Card>

          {/* 5. Card / POS */}
          <Card className="p-4 bg-white border-charcoal-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-charcoal-600">Card / POS</span>
              <CreditCard className="w-4 h-4 text-blue-600" />
            </div>
            <div className="mt-2">
              <span className="text-2xl font-mono font-bold text-charcoal-900">
                {formatCurrency(summary.card_collected)}
              </span>
            </div>
            <p className="text-[11px] text-charcoal-500 mt-1 truncate">
              Debit & credit card slips
            </p>
          </Card>

          {/* 6. Credit (Udhaar) Sales */}
          <Card className="p-4 bg-white border-charcoal-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-charcoal-600">Udhaar (Credit Sales)</span>
              <DollarSign className="w-4 h-4 text-purple-600" />
            </div>
            <div className="mt-2">
              <span className="text-2xl font-mono font-bold text-purple-700">
                {formatCurrency(summary.credit_given)}
              </span>
            </div>
            <p className="text-[11px] text-charcoal-500 mt-1 truncate">
              Ledger debit to customers
            </p>
          </Card>

          {/* 7. Total GST Collected */}
          <Card className="p-4 bg-white border-charcoal-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-charcoal-600">GST Collected</span>
              <Badge variant="brand" size="sm">GST</Badge>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-mono font-bold text-charcoal-900">
                {formatCurrency(summary.total_gst)}
              </span>
            </div>
            <p className="text-[10px] text-charcoal-500 mt-1 font-mono">
              CGST: {formatCurrency(summary.cgst_amount)} | SGST: {formatCurrency(summary.sgst_amount)}
            </p>
          </Card>

          {/* 8. Returns & Cancellations */}
          <Card className="p-4 bg-white border-charcoal-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-charcoal-600">Returns & Cancelled</span>
              <RotateCcw className="w-4 h-4 text-rose-600" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-mono font-bold text-rose-700">
                {formatCurrency(summary.returns_amount + summary.cancelled_amount)}
              </span>
              <span className="text-[11px] text-rose-600 font-semibold">
                {summary.returns_count} ret / {summary.cancelled_count} can
              </span>
            </div>
            <p className="text-[10px] text-charcoal-500 mt-1 truncate font-mono">
              CN: {formatCurrency(summary.returns_amount)} | Void: {formatCurrency(summary.cancelled_amount)}
            </p>
          </Card>
        </div>
      ) : null}

      {/* Tabs Navigation */}
      <div className="border-b border-charcoal-200 flex items-center gap-1 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('invoices')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'invoices'
              ? 'border-brand-500 text-brand-600 bg-brand-50/40'
              : 'border-transparent text-charcoal-600 hover:text-charcoal-900 hover:border-charcoal-300'
          }`}
        >
          <Receipt className="w-3.5 h-3.5" />
          Sales Invoices ({dayBook?.invoices.length || 0})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('returns')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'returns'
              ? 'border-brand-500 text-brand-600 bg-brand-50/40'
              : 'border-transparent text-charcoal-600 hover:text-charcoal-900 hover:border-charcoal-300'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Returns & Credit Notes ({dayBook?.returns.length || 0})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('cancelled')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'cancelled'
              ? 'border-brand-500 text-brand-600 bg-brand-50/40'
              : 'border-transparent text-charcoal-600 hover:text-charcoal-900 hover:border-charcoal-300'
          }`}
        >
          <Ban className="w-3.5 h-3.5" />
          Cancelled Bills ({dayBook?.cancelled_invoices.length || 0})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('udhaar')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'udhaar'
              ? 'border-brand-500 text-brand-600 bg-brand-50/40'
              : 'border-transparent text-charcoal-600 hover:text-charcoal-900 hover:border-charcoal-300'
          }`}
        >
          <Wallet className="w-3.5 h-3.5" />
          Udhaar Vasooli ({dayBook?.customer_payments.length || 0})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('payments')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'payments'
              ? 'border-brand-500 text-brand-600 bg-brand-50/40'
              : 'border-transparent text-charcoal-600 hover:text-charcoal-900 hover:border-charcoal-300'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          Payment Records ({dayBook?.payment_records.length || 0})
        </button>
      </div>

      {/* Tab Panels */}
      <Card className="bg-white overflow-hidden" noPadding>
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton height={40} className="w-full" />
            <Skeleton height={40} className="w-full" />
            <Skeleton height={40} className="w-full" />
          </div>
        ) : activeTab === 'invoices' ? (
          dayBook && dayBook.invoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-charcoal-200 bg-cream-50 text-charcoal-600 font-semibold uppercase text-[11px]">
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-3">Time</th>
                    <th className="py-3 px-3">Customer</th>
                    <th className="py-3 px-3">Payment</th>
                    <th className="py-3 px-3 text-right">Taxable</th>
                    <th className="py-3 px-3 text-right">GST</th>
                    <th className="py-3 px-4 text-right">Total Amount</th>
                    <th className="py-3 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-charcoal-100">
                  {dayBook.invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-cream-50/60 transition-colors">
                      <td className="py-3 px-4 font-bold text-charcoal-900 font-mono">
                        {inv.invoice_number}
                      </td>
                      <td className="py-3 px-3 text-charcoal-600 font-mono">
                        {formatDate(inv.invoice_date)}
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-semibold text-charcoal-900 block">{inv.customer_name}</span>
                        {inv.customer_phone && (
                          <span className="text-[10px] text-charcoal-500 font-mono">{inv.customer_phone}</span>
                        )}
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
                      <td className="py-3 px-3 text-right font-mono text-charcoal-700">
                        {formatCurrency(inv.subtotal_taxable)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-charcoal-700">
                        {formatCurrency(inv.total_gst)}
                      </td>
                      <td className="py-3 px-4 text-right font-bold font-mono text-charcoal-900 text-sm">
                        {formatCurrency(inv.total_amount)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewInvoice(inv.id)}
                          leftIcon={<Printer className="w-3.5 h-3.5" />}
                        >
                          Print
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8">
              <EmptyState
                icon={<Receipt className="w-8 h-8 text-charcoal-400" />}
                title="No active invoices on this date"
                description={`No billing transactions were recorded on ${selectedDate}.`}
              />
            </div>
          )
        ) : activeTab === 'returns' ? (
          dayBook && dayBook.returns.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-charcoal-200 bg-cream-50 text-charcoal-600 font-semibold uppercase text-[11px]">
                    <th className="py-3 px-4">Credit Note #</th>
                    <th className="py-3 px-3">Customer</th>
                    <th className="py-3 px-3">Refund Method</th>
                    <th className="py-3 px-3">Reason</th>
                    <th className="py-3 px-4 text-right">Refund Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-charcoal-100">
                  {dayBook.returns.map((ret) => (
                    <tr key={ret.id} className="hover:bg-cream-50/60">
                      <td className="py-3 px-4 font-bold font-mono text-charcoal-900">{ret.credit_note_number}</td>
                      <td className="py-3 px-3 font-semibold text-charcoal-900">{ret.customer_name}</td>
                      <td className="py-3 px-3 uppercase font-mono text-xs text-charcoal-700">{ret.refund_method}</td>
                      <td className="py-3 px-3 text-charcoal-600">{ret.reason || '—'}</td>
                      <td className="py-3 px-4 text-right font-bold font-mono text-rose-700 text-sm">
                        {formatCurrency(ret.total_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8">
              <EmptyState
                icon={<RotateCcw className="w-8 h-8 text-charcoal-400" />}
                title="No sales returns"
                description="Zero returns or credit notes were issued on this date."
              />
            </div>
          )
        ) : activeTab === 'cancelled' ? (
          dayBook && dayBook.cancelled_invoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-charcoal-200 bg-cream-50 text-charcoal-600 font-semibold uppercase text-[11px]">
                    <th className="py-3 px-4">Void Invoice #</th>
                    <th className="py-3 px-3">Customer</th>
                    <th className="py-3 px-3">Cancelled Reason</th>
                    <th className="py-3 px-3">Cashier</th>
                    <th className="py-3 px-4 text-right">Void Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-charcoal-100">
                  {dayBook.cancelled_invoices.map((can) => (
                    <tr key={can.id} className="hover:bg-cream-50/60 bg-rose-50/30">
                      <td className="py-3 px-4 font-bold font-mono text-rose-800 line-through">
                        {can.invoice_number}
                      </td>
                      <td className="py-3 px-3 text-charcoal-700">{can.customer_name}</td>
                      <td className="py-3 px-3 font-medium text-rose-900">{can.cancelled_reason}</td>
                      <td className="py-3 px-3 text-charcoal-600">{can.cashier_name || 'Staff'}</td>
                      <td className="py-3 px-4 text-right font-bold font-mono text-rose-700">
                        {formatCurrency(can.total_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8">
              <EmptyState
                icon={<Ban className="w-8 h-8 text-charcoal-400" />}
                title="No cancelled invoices"
                description="Zero void or cancelled transactions on this date."
              />
            </div>
          )
        ) : activeTab === 'udhaar' ? (
          dayBook && dayBook.customer_payments.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-charcoal-200 bg-cream-50 text-charcoal-600 font-semibold uppercase text-[11px]">
                    <th className="py-3 px-4">Customer Name</th>
                    <th className="py-3 px-3">Payment Mode</th>
                    <th className="py-3 px-3">Notes</th>
                    <th className="py-3 px-3 text-right">Balance After</th>
                    <th className="py-3 px-4 text-right">Amount Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-charcoal-100">
                  {dayBook.customer_payments.map((cp) => (
                    <tr key={cp.id} className="hover:bg-cream-50/60">
                      <td className="py-3 px-4 font-bold text-charcoal-900">{cp.customer_name}</td>
                      <td className="py-3 px-3 uppercase font-mono">{cp.payment_method || 'CASH'}</td>
                      <td className="py-3 px-3 text-charcoal-600">{cp.notes || 'Udhaar payment'}</td>
                      <td className="py-3 px-3 text-right font-mono text-charcoal-700">
                        {formatCurrency(cp.balance_after)}
                      </td>
                      <td className="py-3 px-4 text-right font-bold font-mono text-emerald-700 text-sm">
                        +{formatCurrency(cp.credit_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8">
              <EmptyState
                icon={<Wallet className="w-8 h-8 text-charcoal-400" />}
                title="No Udhaar payments received"
                description="No customer debt payments recorded on this date."
              />
            </div>
          )
        ) : activeTab === 'payments' ? (
          dayBook && dayBook.payment_records.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-charcoal-200 bg-cream-50 text-charcoal-600 font-semibold uppercase text-[11px]">
                    <th className="py-3 px-4">Payment Method</th>
                    <th className="py-3 px-3">Reference / Slip #</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Timestamp</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-charcoal-100">
                  {dayBook.payment_records.map((pr) => (
                    <tr key={pr.id} className="hover:bg-cream-50/60 font-mono">
                      <td className="py-3 px-4 uppercase font-bold text-charcoal-900">{pr.payment_method}</td>
                      <td className="py-3 px-3 text-charcoal-600">{pr.transaction_reference || '—'}</td>
                      <td className="py-3 px-3">
                        <Badge
                          variant={pr.status === 'success' ? 'success' : 'danger'}
                          size="sm"
                        >
                          {pr.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-charcoal-600">{formatDate(pr.created_at)}</td>
                      <td className="py-3 px-4 text-right font-bold text-charcoal-900">
                        {formatCurrency(pr.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8">
              <EmptyState
                icon={<CreditCard className="w-8 h-8 text-charcoal-400" />}
                title="No payment records"
                description="Zero payment transactions logged on this date."
              />
            </div>
          )
        ) : null}
      </Card>

      {/* Invoice Print & Preview Modal */}
      <InvoicePrintModal
        invoice={printInvoice}
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
      />
    </div>
  );
};
