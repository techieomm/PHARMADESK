import React, { useState } from 'react';
import { PrescriptionSlip, PrintFormat } from '@/types';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { numberToIndianWords } from '@/core';
import { useBranding } from '@/context/BrandingContext';
import { exportToPdf } from '@/utils/exporter';
import { Printer, Download, CheckCircle2, Stethoscope } from 'lucide-react';

interface PrescriptionSlipPrintModalProps {
  slip: PrescriptionSlip | null;
  isOpen: boolean;
  onClose: () => void;
}

export const PrescriptionSlipPrintModal: React.FC<PrescriptionSlipPrintModalProps> = ({
  slip,
  isOpen,
  onClose,
}) => {
  const [format, setFormat] = useState<PrintFormat>('thermal_80mm');
  const { logoUrl } = useBranding();

  if (!slip) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    const headers = ['Field', 'Details'];
    const rows = [
      ['Serial Number', slip.serial_number],
      ['Prescription Number', slip.prescription_number],
      ['Date & Time', formatDate(slip.slip_date)],
      ['Patient Name', slip.patient_name],
      ['Patient Phone', slip.patient_phone || '—'],
      ['Age / Gender', `${slip.patient_age ? `${slip.patient_age} Yrs` : '—'} / ${slip.patient_gender || '—'}`],
      ['Address', slip.patient_address || '—'],
      ['Consulting Doctor', `${slip.doctor_name}${slip.doctor_qualification ? ` (${slip.doctor_qualification})` : ''}`],
      ['Doctor Reg. No.', slip.doctor_registration_number || '—'],
      ['Consultation Fee', formatCurrency(slip.consultation_fee)],
      ['Payment Mode', slip.payment_method.toUpperCase()],
      ['Issued By', slip.created_by_name || 'Counter Staff'],
    ];

    exportToPdf(
      `Consultation Slip — ${slip.prescription_number}`,
      headers,
      rows,
      `PrescriptionSlip_${slip.prescription_number}`,
      slip.branch?.name || 'Bajrang Pharmacy'
    );
  };

  const amountInWords = numberToIndianWords(slip.consultation_fee);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Consultation Slip — ${slip.prescription_number}`}
      subtitle={`Patient Serial No: ${slip.serial_number}`}
      maxWidth="lg"
      footer={
        <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-3">
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Slip saved (No medicine inventory deducted)</span>
          </div>
          <div className="flex items-center flex-wrap gap-2">
            <Button variant="outline" size="sm" leftIcon={<Download className="w-3.5 h-3.5" />} onClick={handleDownloadPdf}>
              Download PDF
            </Button>
            <Button variant="primary" size="sm" leftIcon={<Printer className="w-3.5 h-3.5" />} onClick={handlePrint}>
              Print Slip
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Format Selector */}
        <div className="flex items-center justify-between bg-cream-100 p-2 rounded-lg border border-charcoal-200">
          <span className="text-xs font-semibold text-charcoal-700 uppercase tracking-wide">
            Slip Format:
          </span>
          <div className="flex items-center gap-1.5">
            {([
              { id: 'thermal_80mm', label: '80mm Thermal' },
              { id: 'thermal_58mm', label: '58mm Thermal' },
              { id: 'a4', label: 'A4 Consultation Slip' },
            ] as const).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFormat(opt.id)}
                className={`text-xs px-3 py-1.5 rounded-md font-semibold transition-all ${
                  format === opt.id
                    ? 'bg-charcoal-900 text-white shadow-xs'
                    : 'bg-white text-charcoal-700 hover:bg-cream-50 border border-charcoal-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Printable Slip */}
        <div className="overflow-x-auto bg-charcoal-100/50 p-4 rounded-lg border border-charcoal-200 flex justify-center">
          <div
            id="printable-prescription-slip"
            className={`bg-white text-black font-mono shadow-sm border border-charcoal-200 p-4 transition-all ${
              format === 'thermal_58mm'
                ? 'w-[58mm] text-[10px]'
                : format === 'thermal_80mm'
                ? 'w-[80mm] text-[11px]'
                : 'w-full max-w-3xl text-xs font-sans p-8'
            }`}
          >
            {/* Header */}
            <div className="text-center pb-2 border-b border-dashed border-charcoal-400">
              {logoUrl && (
                <div className="flex justify-center mb-1.5">
                  <img src={logoUrl} alt="Bajrang Pharmacy Logo" className="h-10 max-w-[120px] object-contain" />
                </div>
              )}
              <h2 className="font-bold text-base tracking-wide uppercase">
                {slip.branch?.name || 'BAJRANG PHARMACY'}
              </h2>
              <p className="text-[10px] text-charcoal-700 mt-0.5">
                {slip.branch?.address || 'Ambedkar Nagar Chainpur Chauraha, Uttar Pradesh'}
              </p>
              <p className="text-[10px] text-charcoal-700">
                Phone: {slip.branch?.phone || '+91 9455008480'}
              </p>
              <div className="mt-1.5 pt-1 border-t border-dotted border-charcoal-300 font-bold uppercase text-[11px] flex items-center justify-center gap-1">
                <Stethoscope className="w-3.5 h-3.5 inline" />
                <span>PATIENT CONSULTATION SLIP (OPD)</span>
              </div>
            </div>

            {/* Numbers & Date */}
            <div className="py-2 text-[10px] border-b border-dashed border-charcoal-400 space-y-1">
              <div className="flex justify-between items-center">
                <span>Serial No: <b className="text-xs">{slip.serial_number}</b></span>
                <span>Date: {formatDate(slip.slip_date, false)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Rx No: <b className="text-xs">{slip.prescription_number}</b></span>
                <span>Time: {new Date(slip.slip_date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>

            {/* Patient & Doctor Details */}
            <div className="py-2.5 text-[11px] border-b border-dashed border-charcoal-400 space-y-1.5">
              <div>
                <span className="text-[9px] uppercase text-charcoal-500 block">Patient Details</span>
                <p className="font-bold text-charcoal-900">
                  {slip.patient_name}
                  {slip.patient_age ? <span className="font-normal text-charcoal-700"> ({slip.patient_age} Yrs{slip.patient_gender ? `, ${slip.patient_gender}` : ''})</span> : slip.patient_gender ? <span className="font-normal text-charcoal-700"> ({slip.patient_gender})</span> : null}
                </p>
                {slip.patient_phone && <p className="text-[10px] text-charcoal-700">Phone: {slip.patient_phone}</p>}
                {slip.patient_address && <p className="text-[10px] text-charcoal-700">Address: {slip.patient_address}</p>}
              </div>

              <div className="pt-1 border-t border-dotted border-charcoal-300">
                <span className="text-[9px] uppercase text-charcoal-500 block">Consulting Doctor</span>
                <p className="font-bold text-charcoal-900">{slip.doctor_name}</p>
                {(slip.doctor_qualification || slip.doctor_registration_number) && (
                  <p className="text-[10px] text-charcoal-700">
                    {[slip.doctor_qualification, slip.doctor_registration_number ? `Reg: ${slip.doctor_registration_number}` : '']
                      .filter(Boolean)
                      .join(' • ')}
                  </p>
                )}
              </div>

              {slip.notes && (
                <div className="pt-1 border-t border-dotted border-charcoal-300">
                  <span className="text-[9px] uppercase text-charcoal-500 block">Notes</span>
                  <p className="text-[10px] text-charcoal-800">{slip.notes}</p>
                </div>
              )}
            </div>

            {/* Consultation Fee Box */}
            <div className="py-2.5 border-b border-dashed border-charcoal-400 space-y-1">
              <div className="flex justify-between items-center font-bold text-xs">
                <span>CONSULTATION FEE:</span>
                <span className="text-sm font-sans">{formatCurrency(slip.consultation_fee)}</span>
              </div>
              <div className="flex justify-between text-[10px] text-charcoal-700">
                <span>Payment Mode: <b className="uppercase">{slip.payment_method}</b></span>
                <span>Status: <b className="uppercase">{slip.payment_status}</b></span>
              </div>
              <p className="text-[9px] text-charcoal-600 italic">
                In Words: {amountInWords}
              </p>
            </div>

            {/* Extra Rx Writing Space for A4 consultation sheet */}
            {format === 'a4' && (
              <div className="py-6 my-3 border border-charcoal-200 rounded min-h-[220px] p-4">
                <span className="font-serif italic font-bold text-base text-charcoal-700">Rx / Clinical Notes</span>
              </div>
            )}

            {/* Footer */}
            <div className="text-center pt-2 text-[9px] text-charcoal-600 leading-tight space-y-0.5">
              <p className="font-semibold text-charcoal-800">Bajrang Pharmacy — Patient Consultation Receipt</p>
              {slip.created_by_name && <p>Issued by: {slip.created_by_name}</p>}
              <p className="text-[8px] text-charcoal-400">Valid for consultation visit. Not a medicine tax invoice.</p>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
export default PrescriptionSlipPrintModal;
