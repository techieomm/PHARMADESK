import React, { useState, useEffect } from 'react';
import { repositories } from '@/data/repositories';
import { Invoice, SalesReturn } from '@/types';
import { useBranch } from '@/context/BranchContext';
import {
  PageHeader,
  Card,
  Table,
  Badge,
  Button,
  Input,
  Modal,
  Select,
  Textarea,
  Checkbox,
} from '@/components/common';
import { RotateCcw, Search, RefreshCw, FileText, CheckCircle } from 'lucide-react';
import { formatCurrency, formatDate } from '@/utils/formatters';

export const Returns: React.FC = () => {
  const { selectedBranchId } = useBranch();
  const [salesReturns, setSalesReturns] = useState<SalesReturn[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState<boolean>(false);

  // Search original bill
  const [searchInvoiceNo, setSearchInvoiceNo] = useState<string>('');
  const [foundInvoice, setFoundInvoice] = useState<Invoice | null>(null);
  const [returnItems, setReturnItems] = useState<Array<{
    invoice_item_id: string;
    medicine_name: string;
    pieces_count: number;
    pieces_returned: number;
    unit_price: number;
    restock: boolean;
  }>>([]);
  const [reason, setReason] = useState<string>('');
  const [refundMethod, setRefundMethod] = useState<'cash' | 'upi' | 'card' | 'store_credit'>('cash');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await repositories.invoices.getSalesReturns(selectedBranchId);
      setSalesReturns(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedBranchId]);

  const handleSearchInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInvoiceNo.trim()) return;

    try {
      const allInvoices = await repositories.invoices.getInvoices(selectedBranchId);
      const matched = allInvoices.find(
        (inv) => inv.invoice_number.toLowerCase() === searchInvoiceNo.trim().toLowerCase()
      );

      if (!matched) {
        alert('Invoice number not found in records.');
        setFoundInvoice(null);
        return;
      }

      setFoundInvoice(matched);
      if (matched.items) {
        setReturnItems(
          matched.items.map((it) => ({
            invoice_item_id: it.id,
            medicine_name: it.medicine_name,
            pieces_count: it.pieces_count,
            pieces_returned: 0,
            unit_price: it.unit_price,
            restock: true,
          }))
        );
      }
    } catch (err: any) {
      alert(err.message || 'Search failed');
    }
  };

  const handleProcessReturn = async () => {
    if (!foundInvoice || !reason.trim()) {
      alert('Return reason is mandatory');
      return;
    }

    const itemsToReturn = returnItems.filter((i) => i.pieces_returned > 0);
    if (itemsToReturn.length === 0) {
      alert('Select at least one medicine and quantity to return');
      return;
    }

    setIsSubmitting(true);
    try {
      const branchId = selectedBranchId && selectedBranchId !== 'all'
        ? selectedBranchId
        : foundInvoice.branch_id;

      await repositories.invoices.createSalesReturn({
        branchId,
        originalInvoiceId: foundInvoice.id,
        reason,
        refundMethod,
        items: itemsToReturn.map((it) => ({
          invoice_item_id: it.invoice_item_id,
          pieces_returned: it.pieces_returned,
          restock: it.restock,
        })),
      });

      setIsReturnModalOpen(false);
      setFoundInvoice(null);
      setSearchInvoiceNo('');
      setReason('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Sales return processing failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-container space-y-6">
      <PageHeader
        title="Sales Returns & Credit Notes"
        subtitle="Issue GST credit notes against original tax invoices, reverse CGST/SGST/IGST, and quarantine or restock sellable batches."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="md" leftIcon={<RefreshCw className="w-4 h-4" />} onClick={loadData}>
              Refresh
            </Button>
            <Button variant="primary" size="md" leftIcon={<RotateCcw className="w-4 h-4" />} onClick={() => setIsReturnModalOpen(true)}>
              New Sales Return
            </Button>
          </div>
        }
      />

      <Card title="Issued Credit Notes & Restocked Items">
        <Table
          columns={[
            {
              key: 'credit_note_number',
              header: 'Credit Note #',
              render: (row) => <span className="font-mono font-bold text-charcoal-900">{row.credit_note_number}</span>,
            },
            {
              key: 'return_date',
              header: 'Date',
              render: (row) => <span className="text-xs text-charcoal-600">{formatDate(row.return_date)}</span>,
            },
            {
              key: 'customer_name',
              header: 'Customer',
              render: (row) => <span>{row.customer_name}</span>,
            },
            {
              key: 'subtotal_taxable',
              header: 'Taxable Rev.',
              align: 'right',
              render: (row) => <span className="font-mono text-xs">{formatCurrency(row.subtotal_taxable)}</span>,
            },
            {
              key: 'total_gst',
              header: 'GST Rev.',
              align: 'right',
              render: (row) => <span className="font-mono text-xs text-amber-600">-{formatCurrency(row.total_gst)}</span>,
            },
            {
              key: 'total_amount',
              header: 'Refund Amount',
              align: 'right',
              render: (row) => <span className="font-mono font-bold text-rose-600">-{formatCurrency(row.total_amount)}</span>,
            },
            {
              key: 'refund_method',
              header: 'Refund Mode',
              render: (row) => <Badge variant="neutral">{row.refund_method.toUpperCase()}</Badge>,
            },
            {
              key: 'is_stock_restocked',
              header: 'Restocked',
              render: (row) => (
                <Badge variant={row.is_stock_restocked ? 'success' : 'warning'}>
                  {row.is_stock_restocked ? 'Restocked' : 'Quarantined'}
                </Badge>
              ),
            },
          ]}
          data={salesReturns}
          keyExtractor={(r) => r.id}
        />
      </Card>

      {/* SALES RETURN MODAL */}
      <Modal
        isOpen={isReturnModalOpen}
        onClose={() => setIsReturnModalOpen(false)}
        title="Create Sales Return / Credit Note"
        subtitle="Lookup original invoice, specify return quantities, and choose restock action"
        maxWidth="xl"
        footer={
          foundInvoice && (
            <>
              <Button variant="outline" onClick={() => setIsReturnModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" isLoading={isSubmitting} onClick={handleProcessReturn}>
                Issue Credit Note & Restock
              </Button>
            </>
          )
        }
      >
        <div className="space-y-4">
          {/* Bill Search Form */}
          <form onSubmit={handleSearchInvoice} className="flex gap-2">
            <Input
              label="Original Invoice Number / Barcode"
              placeholder="e.g. LKO1-C1-2627-000001"
              value={searchInvoiceNo}
              onChange={(e) => setSearchInvoiceNo(e.target.value)}
              className="font-mono"
              required
            />
            <div className="pt-6">
              <Button type="submit" variant="primary" leftIcon={<Search className="w-4 h-4" />}>
                Find Bill
              </Button>
            </div>
          </form>

          {foundInvoice && (
            <div className="space-y-4 pt-2 border-t border-charcoal-200">
              <div className="p-3 bg-cream-100 rounded-lg text-xs flex justify-between">
                <div>
                  <span className="font-bold text-charcoal-900 block">Original Bill: {foundInvoice.invoice_number}</span>
                  <span className="text-charcoal-600">{foundInvoice.customer_name} ({foundInvoice.customer_phone})</span>
                </div>
                <div className="text-right">
                  <span className="text-charcoal-500 block">{formatDate(foundInvoice.invoice_date)}</span>
                  <span className="font-bold text-charcoal-900 font-mono">Billed Total: {formatCurrency(foundInvoice.total_amount)}</span>
                </div>
              </div>

              {/* Items Table with Quantity Selector */}
              <div>
                <h4 className="text-xs font-bold text-charcoal-700 uppercase tracking-wider mb-2">
                  Select Medicines to Return
                </h4>
                <div className="border border-charcoal-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-cream-100 text-charcoal-700">
                      <tr>
                        <th className="p-2.5 text-left">Medicine</th>
                        <th className="p-2.5 text-center">Billed Qty</th>
                        <th className="p-2.5 text-center">Return Qty</th>
                        <th className="p-2.5 text-center">Restock Batch</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-charcoal-100">
                      {returnItems.map((item, idx) => (
                        <tr key={item.invoice_item_id} className="hover:bg-cream-50">
                          <td className="p-2.5 font-semibold text-charcoal-900">{item.medicine_name}</td>
                          <td className="p-2.5 text-center text-charcoal-600">{item.pieces_count} pcs</td>
                          <td className="p-2.5 text-center">
                            <input
                              type="number"
                              min="0"
                              max={item.pieces_count}
                              value={item.pieces_returned}
                              onChange={(e) => {
                                const val = Math.min(item.pieces_count, Math.max(0, parseInt(e.target.value, 10) || 0));
                                const updated = [...returnItems];
                                updated[idx].pieces_returned = val;
                                setReturnItems(updated);
                              }}
                              className="h-8 w-20 text-center rounded border border-charcoal-300 font-bold"
                            />
                          </td>
                          <td className="p-2.5 text-center">
                            <Checkbox
                              checked={item.restock}
                              onChange={(e) => {
                                const updated = [...returnItems];
                                updated[idx].restock = e.target.checked;
                                setReturnItems(updated);
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="Refund Method"
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value as any)}
                  options={[
                    { value: 'cash', label: 'Cash Refund at Counter' },
                    { value: 'upi', label: 'UPI Instant Refund' },
                    { value: 'store_credit', label: 'Store Credit / Adjust Udhaar' },
                  ]}
                />
                <Input
                  label="Mandatory Return Reason"
                  placeholder="e.g. Unopened, doctor changed prescription..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                />
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
export default Returns;
