import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { doctorService, prescriptionSlipService } from '@/services/api';
import { Doctor, PrescriptionSlip } from '@/types';
import {
  PageHeader,
  Card,
  StatCard,
  Button,
  Input,
  Select,
  Badge,
  Toolbar,
  EmptyState,
  Skeleton,
} from '@/components/common';
import { PrescriptionSlipPrintModal } from '@/components/pos/PrescriptionSlipPrintModal';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { exportToExcel, exportToPdf } from '@/utils/exporter';
import {
  Search,
  Printer,
  FileSpreadsheet,
  Download,
  RefreshCw,
  Stethoscope,
  IndianRupee,
  FileText,
  Users,
} from 'lucide-react';

export const PrescriptionHistory: React.FC = () => {
  const { user } = useAuth();
  const { branches, selectedBranchId } = useBranch();

  const [slips, setSlips] = useState<PrescriptionSlip[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState<string>('all');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>(selectedBranchId);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [datePreset, setDatePreset] = useState<'all' | 'today' | 'yesterday' | '7days' | 'custom'>('all');

  const [previewSlip, setPreviewSlip] = useState<PrescriptionSlip | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  useEffect(() => {
    setSelectedBranchFilter(selectedBranchId);
  }, [selectedBranchId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const branchParam =
        user?.role === 'master_admin'
          ? selectedBranchFilter === 'all'
            ? undefined
            : selectedBranchFilter
          : user?.primary_branch_id || undefined;

      const [slipList, docList] = await Promise.all([
        prescriptionSlipService.getSlips(branchParam),
        doctorService.getDoctors(true),
      ]);
      setSlips(slipList);
      setDoctors(docList);
    } catch (e) {
      console.error('Failed to load prescription slip history:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedBranchFilter, user]);

  const toIstDate = (iso: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso));

  const filteredSlips = useMemo(() => {
    const todayStr = toIstDate(new Date().toISOString());
    const yestDate = new Date();
    yestDate.setDate(yestDate.getDate() - 1);
    const yesterdayStr = toIstDate(yestDate.toISOString());
    const sevenDaysAgo = Date.now() - 7 * 86400000;

    return slips.filter((s) => {
      if (selectedDoctorFilter !== 'all' && s.doctor_id !== selectedDoctorFilter) {
        return false;
      }

      if (datePreset === 'today') {
        if (toIstDate(s.slip_date) !== todayStr) return false;
      } else if (datePreset === 'yesterday') {
        if (toIstDate(s.slip_date) !== yesterdayStr) return false;
      } else if (datePreset === '7days') {
        if (new Date(s.slip_date).getTime() < sevenDaysAgo) return false;
      } else if (datePreset === 'custom' && selectedDate) {
        if (toIstDate(s.slip_date) !== selectedDate) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const match =
          s.patient_name.toLowerCase().includes(q) ||
          s.serial_number.toLowerCase().includes(q) ||
          s.prescription_number.toLowerCase().includes(q) ||
          (s.patient_phone && s.patient_phone.toLowerCase().includes(q)) ||
          s.doctor_name.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [slips, selectedDoctorFilter, datePreset, selectedDate, searchQuery]);

  const totalFees = useMemo(
    () => filteredSlips.reduce((sum, s) => sum + (Number(s.consultation_fee) || 0), 0),
    [filteredSlips]
  );

  const uniqueDoctorsCount = useMemo(
    () => new Set(filteredSlips.map((s) => s.doctor_id)).size,
    [filteredSlips]
  );

  const handleExportExcel = () => {
    const data = filteredSlips.map((s) => ({
      'Serial No.': s.serial_number,
      'Prescription No.': s.prescription_number,
      'Date & Time': formatDate(s.slip_date),
      'Patient Name': s.patient_name,
      'Patient Phone': s.patient_phone || '',
      'Age': s.patient_age || '',
      'Doctor': s.doctor_name,
      'Consultation Fee (₹)': s.consultation_fee,
      'Payment Mode': s.payment_method.toUpperCase(),
      'Issued By': s.created_by_name || '',
    }));
    exportToExcel(data, 'BajrangPharmacy_Prescription_Slips', 'Slips');
  };

  const handleExportPdf = () => {
    const headers = ['Serial #', 'Rx #', 'Date', 'Patient', 'Doctor', 'Mode', 'Fee (₹)'];
    const rows = filteredSlips.map((s) => [
      s.serial_number,
      s.prescription_number,
      formatDate(s.slip_date, false),
      s.patient_name,
      s.doctor_name,
      s.payment_method.toUpperCase(),
      `₹${s.consultation_fee.toFixed(2)}`,
    ]);
    exportToPdf(
      'Bajrang Pharmacy - Consultation Slips Register',
      headers,
      rows,
      'BajrangPharmacy_Consultation_Slips'
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prescription / Slip History & Fee Register"
        subtitle="Search consultation slips by patient name, serial number, prescription number, doctor, or date."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="md" onClick={loadData} leftIcon={<RefreshCw className="w-4 h-4" />}>
              Refresh
            </Button>
            <Button variant="outline" size="md" onClick={handleExportExcel} leftIcon={<FileSpreadsheet className="w-4 h-4 text-emerald-700" />}>
              Export Excel
            </Button>
            <Button variant="outline" size="md" onClick={handleExportPdf} leftIcon={<Download className="w-4 h-4 text-brand-600" />}>
              Export PDF
            </Button>
          </div>
        }
      />

      {/* KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Matching Slips"
          value={filteredSlips.length}
          icon={<FileText className="w-5 h-5 text-brand-600" />}
          subtext="Patient consultation records"
        />
        <StatCard
          label="Total Consultation Fees"
          value={formatCurrency(totalFees)}
          icon={<IndianRupee className="w-5 h-5 text-emerald-600" />}
          subtext="Separate from medicine sales"
          variant="success"
        />
        <StatCard
          label="Doctors Consulted"
          value={uniqueDoctorsCount}
          icon={<Users className="w-5 h-5 text-charcoal-500" />}
          subtext="Active in filtered results"
        />
      </div>

      {/* Filters Toolbar */}
      <Toolbar>
        <div className="flex-1 min-w-[240px]">
          <Input
            placeholder="Search by patient name, serial no., prescription no., or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="w-48">
            <Select
              size="md"
              value={selectedDoctorFilter}
              onChange={(e) => setSelectedDoctorFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Doctors' },
                ...doctors.map((d) => ({ value: d.id, label: d.full_name })),
              ]}
            />
          </div>

          <div className="w-40">
            <Select
              size="md"
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as any)}
              options={[
                { value: 'all', label: 'All Dates' },
                { value: 'today', label: 'Today' },
                { value: 'yesterday', label: 'Yesterday' },
                { value: '7days', label: 'Last 7 Days' },
                { value: 'custom', label: 'Specific Date' },
              ]}
            />
          </div>

          {datePreset === 'custom' && (
            <div className="w-40">
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
          )}

          {user?.role === 'master_admin' && (
            <div className="w-48">
              <Select
                size="md"
                value={selectedBranchFilter}
                onChange={(e) => setSelectedBranchFilter(e.target.value)}
                options={[
                  { value: 'all', label: 'All Branches' },
                  ...branches.map((b) => ({ value: b.id, label: `${b.name} (${b.branch_code})` })),
                ]}
              />
            </div>
          )}
        </div>
      </Toolbar>

      {/* Slips Table */}
      <Card className="bg-white overflow-hidden" noPadding>
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton height={42} className="w-full" />
            <Skeleton height={42} className="w-full" />
            <Skeleton height={42} className="w-full" />
          </div>
        ) : filteredSlips.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Stethoscope className="w-8 h-8 text-charcoal-400" />}
              title="No consultation slips found"
              description="Adjust your search query, doctor filter, or date filter to view consultation records."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-charcoal-200 bg-cream-50 text-charcoal-600 font-semibold uppercase text-[11px]">
                  <th className="py-3 px-4">Serial / Rx No.</th>
                  <th className="py-3 px-3">Date &amp; Time</th>
                  <th className="py-3 px-3">Patient</th>
                  <th className="py-3 px-3">Consulting Doctor</th>
                  <th className="py-3 px-3 text-center">Payment</th>
                  <th className="py-3 px-3 text-right">Consultation Fee</th>
                  <th className="py-3 px-3">Issued By</th>
                  <th className="py-3 px-3 text-center">Slip</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal-100">
                {filteredSlips.map((slip) => (
                  <tr key={slip.id} className="hover:bg-cream-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-mono font-bold text-brand-700 block">{slip.serial_number}</span>
                      <span className="font-mono text-[11px] text-charcoal-500">{slip.prescription_number}</span>
                    </td>
                    <td className="py-3 px-3 text-charcoal-600">
                      {formatDate(slip.slip_date)}
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-bold text-charcoal-900 block text-sm">{slip.patient_name}</span>
                      <span className="text-[11px] text-charcoal-500">
                        {[
                          slip.patient_phone,
                          slip.patient_age ? `${slip.patient_age}y` : null,
                          slip.patient_gender,
                        ]
                          .filter(Boolean)
                          .join(' • ') || 'Walk-in'}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-semibold text-charcoal-900 block">{slip.doctor_name}</span>
                      {slip.doctor_qualification && (
                        <span className="text-[11px] text-charcoal-500">{slip.doctor_qualification}</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <Badge variant="neutral" size="sm" className="uppercase font-bold">
                        {slip.payment_method}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-charcoal-900 text-sm">
                      {formatCurrency(slip.consultation_fee)}
                    </td>
                    <td className="py-3 px-3 text-charcoal-600">
                      {slip.created_by_name || 'Staff'}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<Printer className="w-3.5 h-3.5" />}
                        onClick={() => {
                          setPreviewSlip(slip);
                          setShowPrintModal(true);
                        }}
                      >
                        View / Print
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <PrescriptionSlipPrintModal
        slip={previewSlip}
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
      />
    </div>
  );
};

export default PrescriptionHistory;
