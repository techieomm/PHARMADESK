import React, { useState, useEffect } from 'react';
import { doctorService } from '@/services/api';
import { Doctor } from '@/types';
import {
  PageHeader,
  Card,
  Button,
  Input,
  Badge,
  Modal,
  Toolbar,
  EmptyState,
  Skeleton,
} from '@/components/common';
import { formatCurrency } from '@/utils/formatters';
import { Stethoscope, Plus, Edit3, Search, UserCheck, UserX } from 'lucide-react';

export const Doctors: React.FC = () => {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);

  const [fullName, setFullName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [qualification, setQualification] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [defaultFee, setDefaultFee] = useState('200');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadDoctors = async () => {
    setIsLoading(true);
    try {
      const list = await doctorService.getDoctors(true);
      setDoctors(list);
    } catch (e) {
      console.error('Failed to load doctors:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDoctors();
  }, []);

  const openCreateModal = () => {
    setEditingDoctor(null);
    setFullName('');
    setRegistrationNumber('');
    setQualification('');
    setSpecialization('');
    setClinicName('Bajrang Pharmacy OPD');
    setPhone('');
    setAddress('');
    setDefaultFee('200');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (doc: Doctor) => {
    setEditingDoctor(doc);
    setFullName(doc.full_name);
    setRegistrationNumber(doc.registration_number || '');
    setQualification(doc.qualification || '');
    setSpecialization(doc.specialization || '');
    setClinicName(doc.clinic_hospital_name || '');
    setPhone(doc.phone || '');
    setAddress(doc.address || '');
    setDefaultFee(String(doc.default_consultation_fee ?? 0));
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!fullName.trim()) {
      setFormError('Doctor full name is required.');
      return;
    }

    setIsSaving(true);
    try {
      const feeNum = Math.max(0, parseFloat(defaultFee) || 0);
      if (editingDoctor) {
        await doctorService.updateDoctor(editingDoctor.id, {
          full_name: fullName.trim(),
          registration_number: registrationNumber.trim() || 'REG-NA',
          qualification: qualification.trim() || undefined,
          specialization: specialization.trim() || undefined,
          clinic_hospital_name: clinicName.trim() || undefined,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
          default_consultation_fee: feeNum,
        });
      } else {
        await doctorService.createDoctor({
          fullName: fullName.trim(),
          registrationNumber: registrationNumber.trim() || undefined,
          qualification: qualification.trim() || undefined,
          specialization: specialization.trim() || undefined,
          clinicHospitalName: clinicName.trim() || undefined,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
          defaultConsultationFee: feeNum,
        });
      }
      setIsModalOpen(false);
      await loadDoctors();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save doctor');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (doc: Doctor) => {
    try {
      await doctorService.updateDoctor(doc.id, { is_active: !doc.is_active });
      await loadDoctors();
    } catch (err: any) {
      alert(err?.message || 'Failed to update doctor status');
    }
  };

  const filteredDoctors = doctors.filter((d) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.full_name.toLowerCase().includes(q) ||
      (d.qualification && d.qualification.toLowerCase().includes(q)) ||
      (d.specialization && d.specialization.toLowerCase().includes(q)) ||
      (d.registration_number && d.registration_number.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Doctors Directory & OPD Panel"
        subtitle="Manage consulting doctors available in the Prescription / Patient Slip Billing workflow."
        actions={
          <Button variant="primary" size="md" onClick={openCreateModal} leftIcon={<Plus className="w-4 h-4" />}>
            Add Doctor
          </Button>
        }
      />

      <Toolbar>
        <div className="flex-1 min-w-[240px]">
          <Input
            placeholder="Search doctors by name, qualification, specialization, or reg. no..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>
      </Toolbar>

      <Card className="bg-white overflow-hidden" noPadding>
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton height={42} className="w-full" />
            <Skeleton height={42} className="w-full" />
          </div>
        ) : filteredDoctors.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Stethoscope className="w-8 h-8 text-charcoal-400" />}
              title="No doctors registered"
              description="Add consulting doctors so prescription slip employees can select them when generating patient slips."
              actionLabel="Add First Doctor"
              onAction={openCreateModal}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-charcoal-200 bg-cream-50 text-charcoal-600 font-semibold uppercase text-[11px]">
                  <th className="py-3 px-4">Doctor Name</th>
                  <th className="py-3 px-3">Qualification &amp; Specialization</th>
                  <th className="py-3 px-3">Reg. Number</th>
                  <th className="py-3 px-3">Clinic / Contact</th>
                  <th className="py-3 px-3 text-right">Default Fee</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal-100">
                {filteredDoctors.map((doc) => (
                  <tr key={doc.id} className="hover:bg-cream-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-bold text-sm text-charcoal-900 block">{doc.full_name}</span>
                    </td>
                    <td className="py-3 px-3 text-charcoal-700">
                      <span className="font-medium block">{doc.qualification || '—'}</span>
                      <span className="text-[11px] text-charcoal-500">{doc.specialization || ''}</span>
                    </td>
                    <td className="py-3 px-3 font-mono text-charcoal-700">
                      {doc.registration_number || '—'}
                    </td>
                    <td className="py-3 px-3 text-charcoal-700">
                      <span className="block">{doc.clinic_hospital_name || '—'}</span>
                      <span className="text-[11px] font-mono text-charcoal-500">{doc.phone || ''}</span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-charcoal-900">
                      {formatCurrency(doc.default_consultation_fee || 0)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <Badge variant={doc.is_active ? 'success' : 'neutral'} size="sm">
                        {doc.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(doc)}
                          className="p-1.5 rounded text-charcoal-400 hover:text-brand-600 hover:bg-brand-50"
                          title="Edit Doctor"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActive(doc)}
                          className={`p-1.5 rounded ${
                            doc.is_active
                              ? 'text-charcoal-400 hover:text-rose-700 hover:bg-rose-50'
                              : 'text-emerald-700 hover:bg-emerald-50'
                          }`}
                          title={doc.is_active ? 'Deactivate Doctor' : 'Activate Doctor'}
                        >
                          {doc.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add / Edit Doctor Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingDoctor ? `Edit Doctor — ${editingDoctor.full_name}` : 'Add Consulting Doctor'}
        maxWidth="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Doctor Full Name *"
              placeholder="e.g. Dr. S.K. Verma"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
            <Input
              label="Registration Number"
              placeholder="e.g. MCI-54321"
              value={registrationNumber}
              onChange={(e) => setRegistrationNumber(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Qualification"
              placeholder="e.g. MBBS, MD (Medicine)"
              value={qualification}
              onChange={(e) => setQualification(e.target.value)}
            />
            <Input
              label="Specialization"
              placeholder="e.g. Physician & Diabetologist"
              value={specialization}
              onChange={(e) => setSpecialization(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Clinic / Hospital Name"
              value={clinicName}
              onChange={(e) => setClinicName(e.target.value)}
            />
            <Input
              label="Contact Phone"
              placeholder="+91 98XXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Input
              label="Default Consultation Fee (₹)"
              type="number"
              min="0"
              step="0.01"
              value={defaultFee}
              onChange={(e) => setDefaultFee(e.target.value)}
            />
          </div>

          <Input
            label="Address (Optional)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-charcoal-100">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSaving}>
              {editingDoctor ? 'Save Changes' : 'Add Doctor'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Doctors;
