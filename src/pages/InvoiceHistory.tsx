import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { billingService } from '@/services/api';
import { Invoice, PaymentMethod } from '@/types';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Badge } from '@/components/common/Badge';
import { EmptyState } from '@/components/common/EmptyState';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { exportToExcel, exportToPdf } from '@/utils/exporter';
import { InvoicePrintModal } from '@/components/pos/InvoicePrintModal';
import { 
  Search, 
  Printer, 
  Download, 
  FileSpreadsheet, 
  Calendar, 
  Receipt,
  Filter
} from 'lucide-react';

export const InvoiceHistory: React.FC = () => {
  const { user } = useAuth();
  const { branches, selectedBranchId } = useBranch();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>(selectedBranchId);
  const [selectedPaymentFilter, setSelectedPaymentFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | '7days' | '30days'>('all');

  // Preview modal
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  const fetchInvoices = async () => {
    setIsLoading(true);
    try {
      const branchIdParam = user?.role === 'master_admin' 
        ? (selectedBranchFilter === 'all' ? undefined : selectedBranchFilter)
        : (user?.primary_branch_id || undefined);
      
      const data = await billingService.getInvoices(branchIdParam);
      setInvoices(data);
    } catch (e) {
      console.error('Failed to load invoices:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [selectedBranchFilter, user]);

  // Apply in-memory client filters for search, payment, and date
  const filteredInvoices = invoices.filter(inv => {
    // Search query filter (Invoice number, customer name, customer phone)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match = 
        inv.invoice_number.toLowerCase().includes(q) ||
        inv.customer_name.toLowerCase().includes(q) ||
        inv.customer_phone.toLowerCase().includes(q);
      if (!match) return false;
    }

    // Payment method filter
    if (selectedPaymentFilter !== 'all' && inv.payment_method !== selectedPaymentFilter) {
      return false;
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

  const handleOpenPrint = (inv: Invoice) => {
    setPreviewInvoice(inv);
    setShowPrintModal(true);
  };

  const handleExportExcel = () => {
    const exportData = filteredInvoices.map(inv => ({
      'Invoice Number': inv.invoice_number,
      'Date': formatDate(inv.invoice_date),
      'Branch': inv.branch?.name || '',
      'Customer Name': inv.customer_name,
      'Customer Phone': inv.customer_phone,
      'Payment Method': inv.payment_method.toUpperCase(),
      'Taxable Amount (₹)': inv.subtotal_taxable,
      'Total GST (₹)': inv.total_gst,
      'Total Bill Amount (₹)': inv.total_amount,
    }));
    exportToExcel(exportData, 'PharmaDesk_Invoices', 'Invoices');
  };

  const handleExportPdf = () => {
    const headers = ['Inv #', 'Date', 'Branch', 'Customer', 'Phone', 'Payment', 'Total (₹)'];
    const rows = filteredInvoices.map(inv => [
      inv.invoice_number,
      formatDate(inv.invoice_date, false),
      inv.branch?.branch_code || '',
      inv.customer_name,
      inv.customer_phone,
      inv.payment_method.toUpperCase(),
      `₹${inv.total_amount.toFixed(2)}`,
    ]);
    exportToPdf('Sales Invoices Register', headers, rows, 'PharmaDesk_Invoice_Register');
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-charcoal-200">
        <div>
          <h1 className="text-xl font-bold text-charcoal-900 tracking-tight">Invoice History & Receipts</h1>
          <p className="text-xs text-charcoal-500 mt-0.5">
            Audit tax invoices, customer billing records, and reprint receipts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-emerald-700" />
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf}>
            <Download className="w-3.5 h-3.5 mr-1" />
            PDF
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <Card className="p-4 bg-white space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Input
            placeholder="Search invoice number, customer name, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
          />

          {user?.role === 'master_admin' && (
            <div>
              <select
                value={selectedBranchFilter}
                onChange={(e) => setSelectedBranchFilter(e.target.value)}
                className="w-full text-xs font-medium border border-charcoal-200 rounded-md py-2 px-3 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
              >
                <option value="all">All Branches (Consolidated)</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name} ({b.branch_code})</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <select
              value={selectedPaymentFilter}
              onChange={(e) => setSelectedPaymentFilter(e.target.value)}
              className="w-full text-xs font-medium border border-charcoal-200 rounded-md py-2 px-3 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
            >
              <option value="all">All Payment Methods</option>
              <option value="cash">Cash</option>
              <option value="upi">UPI / QR</option>
              <option value="card">Card</option>
            </select>
          </div>

          <div>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className="w-full text-xs font-medium border border-charcoal-200 rounded-md py-2 px-3 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
            >
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Invoice Table */}
      <Card className="bg-white overflow-hidden" noPadding>
        {isLoading ? (
          <div className="py-12 text-center text-xs text-charcoal-500">Loading invoice history...</div>
        ) : filteredInvoices.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No invoices found"
              description="No billing invoices match the active filter criteria or no invoices have been generated yet."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-charcoal-200 bg-cream-50 text-charcoal-600 font-semibold uppercase text-[11px]">
                  <th className="py-2.5 px-4">Invoice #</th>
                  <th className="py-2.5 px-3">Date & Time</th>
                  <th className="py-2.5 px-3">Branch</th>
                  <th className="py-2.5 px-3">Customer Details</th>
                  <th className="py-2.5 px-3">Payment</th>
                  <th className="py-2.5 px-3 text-right">Taxable</th>
                  <th className="py-2.5 px-3 text-right">GST</th>
                  <th className="py-2.5 px-4 text-right">Total Amount</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal-100">
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-cream-50/50 transition-colors">
                    <td className="py-3 px-4 font-bold text-charcoal-900 font-mono">
                      {inv.invoice_number}
                    </td>

                    <td className="py-3 px-3 text-charcoal-600">
                      {formatDate(inv.invoice_date)}
                    </td>

                    <td className="py-3 px-3 text-charcoal-800">
                      <span className="font-semibold block">{inv.branch?.branch_code || 'BR'}</span>
                      <span className="text-[10px] text-charcoal-500">{inv.branch?.name}</span>
                    </td>

                    <td className="py-3 px-3">
                      <span className="font-semibold text-charcoal-900 block">{inv.customer_name}</span>
                      <span className="text-[10px] text-charcoal-500">{inv.customer_phone}</span>
                    </td>

                    <td className="py-3 px-3">
                      <Badge variant="brand" className="uppercase font-bold text-[10px]">
                        {inv.payment_method}
                      </Badge>
                    </td>

                    <td className="py-3 px-3 text-right font-medium text-charcoal-700">
                      {formatCurrency(inv.subtotal_taxable)}
                    </td>

                    <td className="py-3 px-3 text-right font-medium text-charcoal-700">
                      {formatCurrency(inv.total_gst)}
                    </td>

                    <td className="py-3 px-4 text-right font-bold text-charcoal-900 text-sm">
                      {formatCurrency(inv.total_amount)}
                    </td>

                    <td className="py-3 px-3 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenPrint(inv)}
                        className="h-7 text-xs px-2"
                        title="View & Print Invoice"
                      >
                        <Printer className="w-3.5 h-3.5 mr-1" />
                        Print
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Invoice Print & Preview Modal */}
      <InvoicePrintModal
        invoice={previewInvoice}
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
      />
    </div>
  );
};
