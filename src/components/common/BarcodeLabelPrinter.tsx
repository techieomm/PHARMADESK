import React, { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Select } from './Select';
import { generateCode128Svg } from '@/utils/code128';
import { Printer } from 'lucide-react';

export type LabelSizePreset = '50x25mm' | '38x25mm' | 'a4_sheet';

interface BarcodeLabelPrinterProps {
  isOpen: boolean;
  onClose: () => void;
  brandName: string;
  mrp: number;
  batchNumber?: string;
  expiryDate?: string;
  barcode: string;
}

export const BarcodeLabelPrinter: React.FC<BarcodeLabelPrinterProps> = ({
  isOpen,
  onClose,
  brandName,
  mrp,
  batchNumber = 'BT2026',
  expiryDate = '2027-12',
  barcode,
}) => {
  const [labelSize, setLabelSize] = useState<LabelSizePreset>('50x25mm');
  const [copies, setCopies] = useState<number>(1);

  const barcodeSvg = generateCode128Svg(barcode, 38, 1.5);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) return;

    let contentHtml = '';
    const labelHtml = `
      <div class="barcode-label size-${labelSize}">
        <div class="shop-name">BAJRANG PHARMACY</div>
        <div class="med-name">${brandName}</div>
        <div class="details">
          <span>B: ${batchNumber}</span>
          <span>Exp: ${expiryDate}</span>
          <span class="mrp">MRP: ₹${mrp.toFixed(2)}</span>
        </div>
        <div class="barcode-img">${barcodeSvg}</div>
      </div>
    `;

    if (labelSize === 'a4_sheet') {
      contentHtml = `<div class="a4-grid">${labelHtml.repeat(Math.max(1, copies))}</div>`;
    } else {
      contentHtml = `<div class="single-roll">${labelHtml.repeat(Math.max(1, copies))}</div>`;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Labels — ${brandName}</title>
          <style>
            @page { margin: 2mm; }
            body { font-family: sans-serif; margin: 0; padding: 0; }
            .barcode-label {
              box-sizing: border-box;
              border: 1px dashed #ccc;
              padding: 2mm;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: space-between;
              text-align: center;
              page-break-inside: avoid;
            }
            .size-50x25mm { width: 50mm; height: 25mm; }
            .size-38x25mm { width: 38mm; height: 25mm; }
            .shop-name { font-size: 7pt; font-weight: bold; }
            .med-name { font-size: 8pt; font-weight: bold; max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
            .details { font-size: 6pt; display: flex; justify-content: space-between; width: 100%; margin-top: 1px; }
            .mrp { font-weight: bold; }
            .barcode-img svg { max-width: 95%; height: 12mm; }
            .a4-grid { display: grid; grid-template-columns: repeat(4, 50mm); gap: 2mm; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          ${contentHtml}
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Barcode Label Printing"
      subtitle="Print Code128 pharmacy shelf and strip labels"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" leftIcon={<Printer className="w-4 h-4" />} onClick={handlePrint}>
            Print Labels
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Label Size Preset"
            value={labelSize}
            onChange={(e) => setLabelSize(e.target.value as LabelSizePreset)}
            options={[
              { value: '50x25mm', label: '50 x 25 mm (Standard Thermal Roll)' },
              { value: '38x25mm', label: '38 x 25 mm (Small Strip Label)' },
              { value: 'a4_sheet', label: 'A4 Sheet (Sheet of 40 Labels)' },
            ]}
          />
          <div>
            <label className="block text-xs font-semibold text-charcoal-700 uppercase tracking-wider mb-1.5">
              Number of Copies
            </label>
            <input
              type="number"
              min="1"
              max="200"
              value={copies}
              onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="h-10 block w-full rounded-md border border-charcoal-300 px-3 text-sm"
            />
          </div>
        </div>

        {/* Live Preview */}
        <div className="border border-charcoal-200 rounded-lg p-4 bg-cream-50 flex flex-col items-center justify-center">
          <span className="text-xs font-semibold text-charcoal-500 uppercase tracking-wider mb-2">Live Preview</span>
          <div className="w-[50mm] h-[25mm] bg-white border border-charcoal-300 rounded p-1.5 flex flex-col items-center justify-between text-center shadow-xs">
            <span className="text-[8px] font-bold text-charcoal-800 leading-none">BAJRANG PHARMACY</span>
            <span className="text-[10px] font-bold text-charcoal-900 leading-tight truncate w-full">{brandName}</span>
            <div className="flex justify-between w-full text-[7px] text-charcoal-600 leading-none">
              <span>B: {batchNumber}</span>
              <span>Exp: {expiryDate}</span>
              <span className="font-bold">MRP: ₹{mrp.toFixed(2)}</span>
            </div>
            <div className="w-full flex justify-center" dangerouslySetInnerHTML={{ __html: barcodeSvg }} />
          </div>
        </div>
      </div>
    </Modal>
  );
};
