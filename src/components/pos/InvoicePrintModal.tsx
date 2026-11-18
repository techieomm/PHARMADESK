import React, { useState, useRef } from 'react';
import { Invoice, PrintFormat } from '@/types';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { Printer, Download, CheckCircle2 } from 'lucide-react';
import { exportToPdf } from '@/utils/exporter';

interface InvoicePrintModalProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
}

export const InvoicePrintModal: React.FC<InvoicePrintModalProps> = ({
  invoice,
  isOpen,
  onClose,
}) => {
  const [format, setFormat] = useState<PrintFormat>('thermal_80mm');
  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    if (!invoice || !invoice.items) return;
    const headers = ['#', 'Medicine', 'Unit', 'Qty', 'Unit Price', 'GST %', 'Taxable', 'Total'];
    const rows = invoice.items.map((item, idx) => [
      idx + 1,
      item.medicine_name,
      item.selected_unit === 'strip' ? 'Strip' : 'Piece',
      item.unit_quantity,
      `₹${item.unit_price.toFixed(2)}`,
      `${item.gst_rate}%`,
      `₹${item.taxable_amount.toFixed(2)}`,
      `₹${item.total_amount.toFixed(2)}`,
    ]);

    exportToPdf(
      `Tax Invoice #${invoice.invoice_number}`,
      headers,
      rows,
      `Invoice_${invoice.invoice_number}`,
      invoice.branch?.name || 'PharmaDesk Healthcare'
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Tax Invoice — ${invoice.invoice_number}`}
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Bill recorded atomically in database</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
              <Download className="w-3.5 h-3.5 mr-1" />
              Download PDF
            </Button>
            <Button variant="primary" size="sm" onClick={handlePrint}>
              <Printer className="w-3.5 h-3.5 mr-1" />
              Print Receipt
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Format Selector */}
        <div className="flex items-center justify-between bg-cream-100 p-2 rounded border border-charcoal-200">
          <span className="text-xs font-semibold text-charcoal-700 uppercase tracking-wide">
            Select Output Format:
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFormat('thermal_80mm')}
              className={`text-xs px-2.5 py-1 rounded font-semibold transition-colors ${
                format === 'thermal_80mm'
                  ? 'bg-charcoal-800 text-white shadow-xs'
                  : 'bg-white text-charcoal-700 hover:bg-cream-50 border border-charcoal-200'
              }`}
            >
              80mm Thermal POS
            </button>
            <button
              onClick={() => setFormat('thermal_58mm')}
              className={`text-xs px-2.5 py-1 rounded font-semibold transition-colors ${
                format === 'thermal_58mm'
                  ? 'bg-charcoal-800 text-white shadow-xs'
                  : 'bg-white text-charcoal-700 hover:bg-cream-50 border border-charcoal-200'
              }`}
            >
              58mm Thermal
            </button>
            <button
              onClick={() => setFormat('a4')}
              className={`text-xs px-2.5 py-1 rounded font-semibold transition-colors ${
                format === 'a4'
                  ? 'bg-charcoal-800 text-white shadow-xs'
                  : 'bg-white text-charcoal-700 hover:bg-cream-50 border border-charcoal-200'
              }`}
            >
              A4 Full Page
            </button>
          </div>
        </div>

        {/* Invoice Preview Container (Print Target) */}
        <div className="overflow-x-auto bg-gray-50 p-4 rounded border border-charcoal-200 flex justify-center">
          <div
            ref={printAreaRef}
            id="printable-invoice"
            className={`bg-white text-black font-mono shadow-sm border border-gray-300 p-4 transition-all ${
              format === 'thermal_58mm'
                ? 'w-[58mm] text-[10px]'
                : format === 'thermal_80mm'
                ? 'w-[80mm] text-[11px]'
                : 'w-full max-w-2xl text-xs font-sans p-8'
            }`}
          >
            {/* Business / Branch Header */}
            <div className="text-center pb-2 border-b border-dashed border-gray-400">
              <h2 className="font-bold text-sm tracking-wide uppercase">
                {invoice.branch?.name || 'PharmaDesk Central'}
              </h2>
              <p className="text-[10px] text-gray-700 mt-0.5">{invoice.branch?.address}</p>
              <p className="text-[10px] text-gray-700">Phone: {invoice.branch?.phone}</p>
              {invoice.branch?.gstin && (
                <p className="text-[10px] font-bold">GSTIN: {invoice.branch.gstin}</p>
              )}
              {invoice.branch?.drug_license && (
                <p className="text-[10px]">D.L. No: {invoice.branch.drug_license}</p>
              )}
              <div className="mt-1 pt-1 border-t border-dotted border-gray-300 font-bold uppercase text-[11px]">
                RETAIL TAX INVOICE
              </div>
            </div>

            {/* Bill & Customer Metadata */}
            <div className="py-2 text-[10px] border-b border-dashed border-gray-400 space-y-0.5">
              <div className="flex justify-between">
                <span>Inv No: <b>{invoice.invoice_number}</b></span>
                <span>Date: {formatDate(invoice.invoice_date, false)}</span>
              </div>
              <div className="flex justify-between">
                <span>Customer: {invoice.customer_name}</span>
                <span>Phone: {invoice.customer_phone}</span>
              </div>
              <div className="flex justify-between">
                <span>Pay Mode: <b className="uppercase">{invoice.payment_method}</b></span>
                <span>Time: {new Date(invoice.invoice_date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>

            {/* Itemized Table */}
            <div className="py-2 border-b border-dashed border-gray-400">
              <div className="flex justify-between font-bold text-[10px] pb-1 border-b border-dotted border-gray-300 mb-1">
                <span className="w-6/12">Item</span>
                <span className="w-2/12 text-center">Unit/Qty</span>
                <span className="w-2/12 text-right">Price</span>
                <span className="w-2/12 text-right">Total</span>
              </div>

              {invoice.items && invoice.items.map((it, idx) => (
                <div key={idx} className="flex justify-between py-0.5 text-[10px] leading-tight">
                  <div className="w-6/12 truncate pr-1">
                    <span className="font-semibold">{it.medicine_name}</span>
                    <span className="text-[9px] text-gray-500 block">GST {it.gst_rate}%</span>
                  </div>
                  <div className="w-2/12 text-center">
                    {it.unit_quantity} {it.selected_unit === 'strip' ? 'str' : 'pc'}
                  </div>
                  <div className="w-2/12 text-right">
                    ₹{it.unit_price.toFixed(2)}
                  </div>
                  <div className="w-2/12 text-right font-medium">
                    ₹{it.total_amount.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            {/* Totals & GST Summary */}
            <div className="py-2 text-[10px] border-b border-dashed border-gray-400 space-y-1">
              <div className="flex justify-between">
                <span>Taxable Amount:</span>
                <span>{formatCurrency(invoice.subtotal_taxable)}</span>
              </div>
              <div className="flex justify-between">
                <span>CGST:</span>
                <span>{formatCurrency(invoice.cgst_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span>SGST:</span>
                <span>{formatCurrency(invoice.sgst_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total GST:</span>
                <span>{formatCurrency(invoice.total_gst)}</span>
              </div>
              <div className="flex justify-between font-bold text-xs pt-1 border-t border-dotted border-gray-400">
                <span>NET PAYABLE:</span>
                <span className="text-sm">{formatCurrency(invoice.total_amount)}</span>
              </div>
            </div>

            {/* Footer / Legal Notes */}
            <div className="text-center pt-2 text-[9px] text-gray-600 leading-tight">
              <p className="font-medium">Thank you for visiting PharmaDesk!</p>
              <p>Prescribed medicines cannot be returned without prescription & bill.</p>
              <p className="mt-1 font-mono text-[8px]">System-generated authenticated invoice.</p>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
