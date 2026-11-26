import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { doctorService, prescriptionSlipService } from '@/services/api';
import { Doctor, PrescriptionSlip, SlipSequencePreview } from '@/types';
import {
  PageHeader,
  Card,
  Button,
  Input,
  Select,
  Badge,
  Modal,
  EmptyState,
  Skeleton,
} from '@/components/common';
import { PrescriptionSlipPrintModal } from '@/components/pos/PrescriptionSlipPrintModal';
import { formatCurrency, formatDate } from '@/utils/formatters';
import {
  Stethoscope,
  UserPlus,
  Printer,
  RotateCcw,
  CheckCircle2,
  Hash,
  FileText,
  IndianRupee,
  AlertCircle,
  Plus,
} from 'lucide-react';

export const PrescriptionSlipBilling: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const { branches, selectedBranchId } = useBranch();

  const activeBranchId =
    selectedBranchId === 'all'
      ? user?.primary_branch_id || branches[0]?.id || 'c0000000-0000-0000-0000-000000000001'
      : selectedBranchId;

  const [targetBranchId, setTargetBranchId] = useState<string>(activeBranchId);
  useEffect(() => {
    setTargetBranchId(activeBranchId);
  }, [activeBranchId]);

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [recentSlips, setRecentSlips] = useState<PrescriptionSlip[]>([]);
  const [seqPreview, setSeqPreview] = useState<SlipSequencePreview | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Form Fields
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientGender, setPatientGender] = useState('');
  const [patientAddress, setPatientAddress] = useState('');
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [consultationFee, setConsultationFee] = useState<string>('200');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'card'>('cash');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Print modal
  const [activeSlip, setActiveSlip] = useState<PrescriptionSlip | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Quick Add Doctor modal (for authorized admins/managers)
  const canManageDoctors = hasPermission('manage_doctors');
  const [showAddDoctorModal, setShowAddDoctorModal] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  const [newDocQual, setNewDocQual] = useState('');
  const [newDocSpec, setNewDocSpec] = useState('');
  const [newDocReg, setNewDocReg] = useState('');
  const [newDocFee, setNewDocFee] = useState('200');
  const [isAddingDoc, setIsAddingDoc] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [docList, preview, slipsList] = await Promise.all([
        doctorService.getDoctors(false),
        prescriptionSlipService.getNextSequencePreview(targetBranchId),
        prescriptionSlipService.getSlips(targetBranchId),
      ]);

      setDoctors(docList);
      setSeqPreview(preview);
      setRecentSlips(slipsList);

      if (docList.length > 0 && !selectedDoctorId) {
        const firstDoc = docList[0];
        setSelectedDoctorId(firstDoc.id);
        if (firstDoc.default_consultation_fee && firstDoc.default_consultation_fee > 0) {
          setConsultationFee(String(firstDoc.default_consultation_fee));
        }
      }
    } catch (err: any) {
      console.error('Failed to load slip billing data:', err);
      setErrorMsg(err?.message || 'Failed to load prescription slip data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (targetBranchId) {
      loadData();
    }
  }, [targetBranchId]);

  const handleDoctorChange = (doctorId: string) => {
    setSelectedDoctorId(doctorId);
    const doc = doctors.find((d) => d.id === doctorId);
    if (doc && doc.default_consultation_fee !== undefined && doc.default_consultation_fee > 0) {
      setConsultationFee(String(doc.default_consultation_fee));
    }
  };

  const resetForm = () => {
    setPatientName('');
    setPatientPhone('');
    setPatientAge('');
    setPatientGender('');
    setPatientAddress('');
    setNotes('');
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!patientName.trim()) {
      setErrorMsg('Patient Name is required.');
      return;
    }
    if (!selectedDoctorId) {
      setErrorMsg('Please select a Doctor. Ask Admin to add a doctor if the list is empty.');
      return;
    }

    const parsedFee = parseFloat(consultationFee);
    if (isNaN(parsedFee) || parsedFee < 0) {
      setErrorMsg('Please enter a valid consultation fee (0 or higher).');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await prescriptionSlipService.createSlip({
        branchId: targetBranchId,
        patientName: patientName.trim(),
        doctorId: selectedDoctorId,
        consultationFee: parsedFee,
        patientPhone: patientPhone.trim() || undefined,
        patientAge: patientAge.trim() ? parseInt(patientAge.trim(), 10) : undefined,
        patientGender: patientGender || undefined,
        patientAddress: patientAddress.trim() || undefined,
        paymentMethod,
        notes: notes.trim() || undefined,
        userId: user?.id,
        userName: user?.full_name,
      });

      setActiveSlip(created);
      setShowPrintModal(true);
      setSuccessMsg(`Generated Slip ${created.prescription_number} (Serial ${created.serial_number}) for ${created.patient_name}`);
      resetForm();
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to generate prescription slip');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickAddDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocName.trim()) return;
    setIsAddingDoc(true);
    try {
      const created = await doctorService.createDoctor({
        fullName: newDocName.trim(),
        qualification: newDocQual.trim() || undefined,
        specialization: newDocSpec.trim() || undefined,
        registrationNumber: newDocReg.trim() || undefined,
        defaultConsultationFee: parseFloat(newDocFee) || 0,
      });
      setDoctors((prev) => [...prev, created].sort((a, b) => a.full_name.localeCompare(b.full_name)));
      setSelectedDoctorId(created.id);
      if (created.default_consultation_fee && created.default_consultation_fee > 0) {
        setConsultationFee(String(created.default_consultation_fee));
      }
      setShowAddDoctorModal(false);
      setNewDocName('');
      setNewDocQual('');
      setNewDocSpec('');
      setNewDocReg('');
      setNewDocFee('200');
    } catch (err: any) {
      alert(err?.message || 'Failed to add doctor');
    } finally {
      setIsAddingDoc(false);
    }
  };

  const todayIst = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }, []);

  const todaySlips = useMemo(() => {
    return recentSlips.filter((s) => {
      const d = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(s.slip_date));
      return d === todayIst;
    });
  }, [recentSlips, todayIst]);

  const todayFeeTotal = useMemo(
    () => todaySlips.reduce((sum, s) => sum + (Number(s.consultation_fee) || 0), 0),
    [todaySlips]
  );

  const selectedDoctor = doctors.find((d) => d.id === selectedDoctorId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prescription / Patient Slip Billing"
        subtitle="Generate patient registration & doctor consultation slips (पर्ची काटना). Separate from medicine sales & inventory."
        badge={<Badge variant="brand">OPD Consultation Counter</Badge>}
        actions={
          user?.role === 'master_admin' && branches.length > 0 ? (
            <div className="w-64">
              <Select
                size="md"
                value={targetBranchId}
                onChange={(e) => setTargetBranchId(e.target.value)}
                options={branches.map((b) => ({
                  value: b.id,
                  label: `${b.name} (${b.branch_code})`,
                }))}
              />
            </div>
          ) : undefined
        }
      />

      {/* Sequence & Isolation Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-charcoal-500 block">
                Next Patient Serial No.
              </span>
              <span className="text-lg font-bold font-mono text-charcoal-900 mt-0.5 block">
                {seqPreview?.serial_number || 'Generating...'}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-cream-100 text-brand-600 border border-charcoal-200">
              <Hash className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[11px] text-charcoal-500 mt-1">Auto-incremented sequentially on save</p>
        </Card>

        <Card className="bg-white">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-charcoal-500 block">
                Next Prescription No.
              </span>
              <span className="text-lg font-bold font-mono text-brand-700 mt-0.5 block">
                {seqPreview?.prescription_number || 'Generating...'}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-brand-50 text-brand-600 border border-brand-200">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[11px] text-charcoal-500 mt-1">Independent from medicine invoice numbers</p>
        </Card>

        <Card className="bg-white">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-charcoal-500 block">
                Today&apos;s Slips &amp; Fee Collection
              </span>
              <span className="text-lg font-bold font-mono text-emerald-700 mt-0.5 block">
                {todaySlips.length} slips • {formatCurrency(todayFeeTotal)}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
              <IndianRupee className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[11px] text-charcoal-500 mt-1">Does not deduct medicine stock</p>
        </Card>
      </div>

      {/* Main Split: Left Slip Entry Form | Right Today's Slips */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Entry Form */}
        <Card className="lg:col-span-7 bg-white" title="New Patient Consultation Slip">
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Patient Information */}
            <div className="space-y-3">
              <Input
                label="Patient Full Name *"
                placeholder="Enter patient name (required)"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                required
                autoFocus
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  label="Mobile Number (Optional)"
                  placeholder="10-digit mobile"
                  value={patientPhone}
                  onChange={(e) => setPatientPhone(e.target.value)}
                  maxLength={15}
                />
                <Input
                  label="Age (Years)"
                  type="number"
                  min={0}
                  max={125}
                  placeholder="e.g. 34"
                  value={patientAge}
                  onChange={(e) => setPatientAge(e.target.value)}
                />
                <Select
                  label="Gender"
                  value={patientGender}
                  onChange={(e) => setPatientGender(e.target.value)}
                  options={[
                    { value: '', label: 'Select (Optional)' },
                    { value: 'Male', label: 'Male' },
                    { value: 'Female', label: 'Female' },
                    { value: 'Other', label: 'Other' },
                  ]}
                />
              </div>

              <Input
                label="Address / Locality (Optional)"
                placeholder="Village / Mohalla / Street"
                value={patientAddress}
                onChange={(e) => setPatientAddress(e.target.value)}
              />
            </div>

            {/* Doctor Selection & Fee */}
            <div className="pt-3 border-t border-charcoal-100 space-y-3">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Select
                    label="Select Consulting Doctor *"
                    value={selectedDoctorId}
                    onChange={(e) => handleDoctorChange(e.target.value)}
                    options={
                      doctors.length === 0
                        ? [{ value: '', label: 'No doctors configured — Admin must add a doctor' }]
                        : doctors.map((d) => ({
                            value: d.id,
                            label: `${d.full_name}${d.qualification ? ` (${d.qualification})` : ''}${d.specialization ? ` — ${d.specialization}` : ''}`,
                          }))
                    }
                  />
                </div>
                {canManageDoctors && (
                  <Button
                    type="button"
                    variant="outline"
                    size="md"
                    onClick={() => setShowAddDoctorModal(true)}
                    leftIcon={<Plus className="w-4 h-4" />}
                    title="Quick Add Doctor"
                  >
                    Add Doctor
                  </Button>
                )}
              </div>

              {selectedDoctor && (
                <div className="p-2.5 rounded-md bg-cream-50 border border-charcoal-200 text-xs text-charcoal-700 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Stethoscope className="w-4 h-4 text-brand-600" />
                    <span className="font-semibold text-charcoal-900">{selectedDoctor.full_name}</span>
                    {selectedDoctor.clinic_hospital_name && (
                      <span className="text-charcoal-500">• {selectedDoctor.clinic_hospital_name}</span>
                    )}
                  </div>
                  <span className="font-mono text-[11px] text-charcoal-500">
                    Reg: {selectedDoctor.registration_number || 'N/A'}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Input
                    label="Doctor Consultation Fee (₹) *"
                    type="number"
                    min="0"
                    step="0.01"
                    value={consultationFee}
                    onChange={(e) => setConsultationFee(e.target.value)}
                    required
                  />
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {[0, 100, 200, 300, 500].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setConsultationFee(String(amt))}
                        className="px-2 py-0.5 text-[11px] font-mono font-semibold rounded bg-cream-100 hover:bg-cream-200 text-charcoal-700 border border-charcoal-200"
                      >
                        {formatCurrency(amt)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-charcoal-700 uppercase tracking-wider mb-1.5">
                    Payment Mode *
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 p-1 bg-cream-100 rounded-md border border-charcoal-200">
                    {(['cash', 'upi', 'card'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setPaymentMethod(mode)}
                        className={`py-2 text-xs font-bold uppercase rounded transition-all ${
                          paymentMethod === mode
                            ? 'bg-brand-500 text-white shadow-xs'
                            : 'text-charcoal-600 hover:text-charcoal-900'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-charcoal-500 mt-1.5">
                    Payable Fee: <b className="font-mono text-charcoal-900">{formatCurrency(parseFloat(consultationFee) || 0)}</b>
                  </p>
                </div>
              </div>

              <Input
                label="Visit Notes / Remarks (Optional)"
                placeholder="e.g. Fever, Follow-up checkup"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-3 border-t border-charcoal-200">
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={resetForm}
                leftIcon={<RotateCcw className="w-4 h-4" />}
              >
                Clear Form
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={isSubmitting}
                leftIcon={<UserPlus className="w-4 h-4" />}
              >
                Generate &amp; Save Slip ({formatCurrency(parseFloat(consultationFee) || 0)})
              </Button>
            </div>
          </form>
        </Card>

        {/* Right: Today's Generated Slips */}
        <Card className="lg:col-span-5 bg-white" title="Today's Consultation Slips" noPadding>
          {isLoading ? (
            <div className="p-4 space-y-3">
              <Skeleton height={48} className="w-full" />
              <Skeleton height={48} className="w-full" />
              <Skeleton height={48} className="w-full" />
            </div>
          ) : todaySlips.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={<Stethoscope className="w-8 h-8 text-charcoal-400" />}
                title="No slips generated today"
                description="Enter patient details and select a doctor on the left to generate the first consultation slip."
              />
            </div>
          ) : (
            <div className="divide-y divide-charcoal-100 max-h-[540px] overflow-y-auto">
              {todaySlips.slice(0, 15).map((slip) => (
                <div
                  key={slip.id}
                  className="p-3.5 hover:bg-cream-50/70 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-xs text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded border border-brand-200">
                        {slip.serial_number}
                      </span>
                      <span className="font-mono text-[11px] text-charcoal-600">
                        {slip.prescription_number}
                      </span>
                    </div>
                    <p className="font-bold text-sm text-charcoal-900 mt-1 truncate">
                      {slip.patient_name}
                    </p>
                    <p className="text-[11px] text-charcoal-500 truncate">
                      {slip.doctor_name} • {formatDate(slip.slip_date)}
                    </p>
                  </div>

                  <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                    <span className="font-mono font-bold text-sm text-charcoal-900">
                      {formatCurrency(slip.consultation_fee)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Printer className="w-3.5 h-3.5" />}
                      onClick={() => {
                        setActiveSlip(slip);
                        setShowPrintModal(true);
                      }}
                    >
                      Print
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Print / PDF Slip Modal */}
      <PrescriptionSlipPrintModal
        slip={activeSlip}
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
      />

      {/* Quick Add Doctor Modal (for authorized Admin/Manager) */}
      <Modal
        isOpen={showAddDoctorModal}
        onClose={() => setShowAddDoctorModal(false)}
        title="Quick Add Consulting Doctor"
        maxWidth="md"
      >
        <form onSubmit={handleQuickAddDoctor} className="space-y-3">
          <Input
            label="Doctor Full Name *"
            placeholder="e.g. Dr. R.K. Mishra"
            value={newDocName}
            onChange={(e) => setNewDocName(e.target.value)}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Qualification"
              placeholder="e.g. MBBS, MD"
              value={newDocQual}
              onChange={(e) => setNewDocQual(e.target.value)}
            />
            <Input
              label="Specialization"
              placeholder="e.g. General Physician"
              value={newDocSpec}
              onChange={(e) => setNewDocSpec(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Registration No."
              placeholder="e.g. MCI-45210"
              value={newDocReg}
              onChange={(e) => setNewDocReg(e.target.value)}
            />
            <Input
              label="Default Consultation Fee (₹)"
              type="number"
              min="0"
              value={newDocFee}
              onChange={(e) => setNewDocFee(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-charcoal-100">
            <Button type="button" variant="outline" onClick={() => setShowAddDoctorModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isAddingDoc}>
              Save Doctor
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default PrescriptionSlipBilling;
