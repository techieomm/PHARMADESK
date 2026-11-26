import React, { useState, useRef } from 'react';
import { Invoice, PrintFormat } from '@/types';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { numberToIndianWords } from '@/core';
import { Printer, Download, CheckCircle2, Share2 } from 'lucide-react';
import { exportToPdf } from '@/utils/exporter';
import { useBranding } from '@/context/BrandingContext';

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
  const { logoUrl } = useBranding();

  if (!invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  const amountInWords = numberToIndianWords(invoice.total_amount);

  const handleShareWhatsApp = () => {
    const ageStr = invoice.customer_age ? ` (Age: ${invoice.customer_age} Y)` : '';
    const addrStr = invoice.customer_address ? `\nAddress: ${invoice.customer_address}` : '';
    const text = `*Bajrang Pharmacy - Tax Invoice*\nInvoice No: ${invoice.invoice_number}\nDate: ${formatDate(invoice.invoice_date)}\nCustomer: ${invoice.customer_name}${ageStr}${addrStr}\nTotal Amount: ₹${invoice.total_amount.toFixed(2)}\nThank you for choosing Bajrang Pharmacy, Lucknow!`;
    const cleanPhone = invoice.customer_phone ? invoice.customer_phone.replace(/[^0-9]/g, '') : '';
    const phoneParam = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const url = phoneParam ? `https://wa.me/${phoneParam}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleDownloadPdf = () => {
    if (!invoice || !invoice.items) return;
    const headers = ['#', 'Medicine', 'Batch', 'Exp', 'HSN', 'Unit', 'Qty', 'Rate', 'GST%', 'Total'];
    const rows = invoice.items.map((item, idx) => [
      idx + 1,
      item.medicine_name,
      item.batch_number || '—',
      item.expiry_date || '—',
      item.hsn_code || '3004',
      item.selected_unit === 'strip' ? 'Strip' : 'Piece',
      item.unit_quantity,
      `₹${item.unit_price.toFixed(2)}`,
      `${item.gst_rate}%`,
      `₹${item.total_amount.toFixed(2)}`,
    ]);

    exportToPdf(
      `Tax Invoice #${invoice.invoice_number}`,
      headers,
      rows,
      `Invoice_${invoice.invoice_number}`,
      invoice.branch?.name || 'Bajrang Pharmacy'
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Tax Invoice — ${invoice.invoice_number}`}
      subtitle="GST compliant tax invoice for retail pharmacy"
      maxWidth="lg"
      footer={
        <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-3">
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Bill recorded atomically (FEFO applied)</span>
          </div>
          <div className="flex items-center flex-wrap gap-2">
            <Button variant="outline" size="sm" leftIcon={<Share2 className="w-3.5 h-3.5" />} onClick={handleShareWhatsApp}>
              WhatsApp
            </Button>
            <Button variant="outline" size="sm" leftIcon={<Download className="w-3.5 h-3.5" />} onClick={handleDownloadPdf}>
              PDF
            </Button>
            <Button variant="primary" size="sm" leftIcon={<Printer className="w-3.5 h-3.5" />} onClick={handlePrint}>
              Print (Enter)
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Format Selector */}
        <div className="flex items-center justify-between bg-cream-100 p-2 rounded-lg border border-charcoal-200">
          <span className="text-xs font-semibold text-charcoal-700 uppercase tracking-wide">
            Print Format:
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFormat('thermal_80mm')}
              className={`text-xs px-3 py-1.5 rounded-md font-semibold transition-all ${
                format === 'thermal_80mm'
                  ? 'bg-charcoal-900 text-white shadow-xs'
                  : 'bg-white text-charcoal-700 hover:bg-cream-50 border border-charcoal-200'
              }`}
            >
              80mm Thermal
            </button>
            <button
              onClick={() => setFormat('thermal_58mm')}
              className={`text-xs px-3 py-1.5 rounded-md font-semibold transition-all ${
                format === 'thermal_58mm'
                  ? 'bg-charcoal-900 text-white shadow-xs'
                  : 'bg-white text-charcoal-700 hover:bg-cream-50 border border-charcoal-200'
              }`}
            >
              58mm Thermal
            </button>
            <button
              onClick={() => setFormat('a4')}
              className={`text-xs px-3 py-1.5 rounded-md font-semibold transition-all ${
                format === 'a4'
                  ? 'bg-charcoal-900 text-white shadow-xs'
                  : 'bg-white text-charcoal-700 hover:bg-cream-50 border border-charcoal-200'
              }`}
            >
              A4 GST Invoice
            </button>
          </div>
        </div>

        {/* Printable Area */}
        <div className="overflow-x-auto bg-charcoal-100/50 p-4 rounded-lg border border-charcoal-200 flex justify-center">
          <div
            ref={printAreaRef}
            id="printable-invoice"
            className={`bg-white text-black font-mono shadow-sm border border-charcoal-200 p-4 transition-all ${
              format === 'thermal_58mm'
                ? 'w-[58mm] text-[10px]'
                : format === 'thermal_80mm'
                ? 'w-[80mm] text-[11px]'
                : 'w-full max-w-3xl text-xs font-sans p-8'
            }`}
          >
            {/* Business Header */}
            <div className="text-center pb-2 border-b border-dashed border-charcoal-400">
              {logoUrl && (
                <div className="flex justify-center mb-1.5">
                  <img src={logoUrl} alt="Bajrang Pharmacy Logo" className="h-10 max-w-[180px] object-contain" />
                </div>
              )}
              <h2 className="font-bold text-base tracking-wide uppercase">
                {invoice.branch?.name || 'BAJRANG PHARMACY'}
              </h2>
              <p className="text-[10px] text-charcoal-700 mt-0.5">{invoice.branch?.address || 'Shop 12-14, Hazratganj, Lucknow, UP 226001'}</p>
              <p className="text-[10px] text-charcoal-700">Phone: {invoice.branch?.phone || '+91 522 261 4001'}</p>
              <p className="text-[10px] font-bold">GSTIN: {invoice.branch?.gstin || '09CMVPM3439A1ZS'} (UP 09)</p>
              <p className="text-[9px]">D.L. No: {invoice.branch?.drug_license || 'UP-LKO-20B-10928 & UP-LKO-21B-10929'}</p>
              <div className="mt-1 pt-1 border-t border-dotted border-charcoal-300 font-bold uppercase text-[11px]">
                TAX INVOICE
              </div>
            </div>

            {/* Bill & Customer Metadata */}
            <div className="py-2 text-[10px] border-b border-dashed border-charcoal-400 space-y-0.5">
              <div className="flex justify-between">
                <span>Inv No: <b>{invoice.invoice_number}</b></span>
                <span>Date: {formatDate(invoice.invoice_date, false)}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span>
                  Customer: <b>{invoice.customer_name}</b>
                  {invoice.customer_age ? <span className="text-charcoal-600 font-mono text-[9px] ml-1">({invoice.customer_age} Yrs)</span> : null}
                </span>
                {invoice.customer_phone ? <span>Mob: {invoice.customer_phone}</span> : <span className="text-charcoal-400 text-[9px]">Walk-in</span>}
              </div>
              {invoice.customer_address && (
                <div className="text-charcoal-600 text-[9px] truncate">
                  Address: <b>{invoice.customer_address}</b>
                </div>
              )}
              {invoice.customer_gstin && (
                <div>Customer GSTIN: <b>{invoice.customer_gstin}</b></div>
              )}
              {invoice.doctor_name && (
                <div>Doctor: <b>{invoice.doctor_name}</b></div>
              )}
              <div className="flex justify-between">
                <span>Pay Mode: <b className="uppercase">{invoice.payment_method}</b></span>
                <span>Time: {new Date(invoice.invoice_date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>

            {/* Itemized Table */}
            <div className="py-2 border-b border-dashed border-charcoal-400">
              <div className="flex justify-between font-bold text-[10px] pb-1 border-b border-dotted border-charcoal-300 mb-1">
                <span className="w-5/12">Item (Batch/Exp)</span>
                <span className="w-2/12 text-center">Qty</span>
                <span className="w-2/12 text-right">Rate</span>
                <span className="w-3/12 text-right">Amount</span>
              </div>

              {invoice.items && invoice.items.map((it, idx) => (
                <div key={idx} className="flex justify-between py-1 text-[10px] leading-tight border-b border-dotted border-charcoal-100 last:border-none">
                  <div className="w-5/12 pr-1">
                    <span className="font-semibold block truncate">{it.medicine_name}</span>
                    <span className="text-[8px] text-charcoal-500 block">
                      B: {it.batch_number || 'N/A'} | Exp: {it.expiry_date || 'N/A'} | HSN: {it.hsn_code || '3004'}
                    </span>
                  </div>
                  <div className="w-2/12 text-center self-center">
                    {it.unit_quantity} {it.selected_unit === 'strip' ? 'str' : 'pc'}
                  </div>
                  <div className="w-2/12 text-right self-center">
                    ₹{it.unit_price.toFixed(2)}
                  </div>
                  <div className="w-3/12 text-right font-medium self-center">
                    ₹{it.total_amount.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            {/* Totals & Tax Breakup */}
            <div className="py-2 text-[10px] border-b border-dashed border-charcoal-400 space-y-1">
              <div className="flex justify-between">
                <span>Subtotal (Taxable):</span>
                <span>{formatCurrency(invoice.subtotal_taxable)}</span>
              </div>
              {invoice.is_interstate ? (
                <div className="flex justify-between">
                  <span>IGST:</span>
                  <span>{formatCurrency(invoice.igst_amount)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span>CGST:</span>
                    <span>{formatCurrency(invoice.cgst_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>SGST:</span>
                    <span>{formatCurrency(invoice.sgst_amount)}</span>
                  </div>
                </>
              )}
              {invoice.discount_amount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount:</span>
                  <span>-{formatCurrency(invoice.discount_amount)}</span>
                </div>
              )}
              {invoice.round_off !== undefined && invoice.round_off !== 0 && (
                <div className="flex justify-between text-charcoal-500">
                  <span>Round Off:</span>
                  <span>{invoice.round_off > 0 ? `+${invoice.round_off.toFixed(2)}` : invoice.round_off.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-xs pt-1.5 border-t border-dotted border-charcoal-400">
                <span>GRAND TOTAL:</span>
                <span className="text-sm font-sans">{formatCurrency(invoice.total_amount)}</span>
              </div>
              <div className="text-[9px] text-charcoal-600 italic pt-0.5">
                Amount in Words: {amountInWords}
              </div>
            </div>

            {/* Statutory Terms & Footer */}
            <div className="text-center pt-2 text-[8px] text-charcoal-600 leading-tight">
              <p className="font-semibold text-charcoal-800">Thank you for visiting Bajrang Pharmacy!</p>
              <p className="mt-0.5">1. Schedule H/H1 medicines dispensed against valid prescription only.</p>
              <p>2. Goods once sold cannot be returned without original cash memo within 7 days.</p>
              <p className="mt-1 font-mono text-[7px] text-charcoal-400">Authenticated system generated tax invoice.</p>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
export default InvoicePrintModal;
