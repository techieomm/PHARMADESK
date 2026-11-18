import React, { useState } from 'react';
import { useBranch } from '@/context/BranchContext';
import { branchService } from '@/services/api';
import { Branch } from '@/types';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Badge } from '@/components/common/Badge';
import { Modal } from '@/components/common/Modal';
import { Building2, Plus, Edit2, CheckCircle2, ShieldCheck } from 'lucide-react';

export const Branches: React.FC = () => {
  const { branches, refreshBranches } = useBranch();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [formData, setFormData] = useState({
    branch_code: '',
    name: '',
    address: '',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
    phone: '',
    email: '',
    gstin: '',
    drug_license: '',
    invoice_prefix: 'BR',
    is_active: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const openCreateModal = () => {
    setEditingBranch(null);
    setFormData({
      branch_code: `BR0${branches.length + 1}`,
      name: '',
      address: '',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      phone: '',
      email: '',
      gstin: '27AABCP1234F1Z5',
      drug_license: 'MH-MZ2-XXXXXX',
      invoice_prefix: `BR0${branches.length + 1}`,
      is_active: true,
    });
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const openEditModal = (b: Branch) => {
    setEditingBranch(b);
    setFormData({
      branch_code: b.branch_code,
      name: b.name,
      address: b.address,
      city: b.city || 'Mumbai',
      state: b.state || 'Maharashtra',
      pincode: b.pincode || '400001',
      phone: b.phone,
      email: b.email || '',
      gstin: b.gstin || '',
      drug_license: b.drug_license,
      invoice_prefix: b.invoice_prefix,
      is_active: b.is_active,
    });
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!formData.name.trim()) {
      setErrorMsg('Branch name is required');
      return;
    }
    if (!formData.drug_license.trim()) {
      setErrorMsg('Drug licence number is mandatory for pharmacy compliance');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingBranch) {
        await branchService.updateBranch(editingBranch.id, formData);
      } else {
        await branchService.createBranch({
          ...formData,
          business_id: branches[0]?.business_id || 'b0000000-0000-0000-0000-000000000001',
        });
      }
      setIsModalOpen(false);
      await refreshBranches();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save branch');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-charcoal-200">
        <div>
          <h1 className="text-xl font-bold text-charcoal-900 tracking-tight">Branch Management</h1>
          <p className="text-xs text-charcoal-500 mt-0.5">
            Configure physical pharmacy dispensaries, drug licenses, GSTIN, and POS billing prefixes.
          </p>
        </div>

        <Button variant="primary" size="sm" onClick={openCreateModal}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add Pharmacy Branch
        </Button>
      </div>

      {/* Branches Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {branches.map((b, idx) => (
          <Card key={b.id} className="bg-white p-5 space-y-4">
            <div className="flex items-start justify-between pb-3 border-b border-charcoal-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-cream-100 flex items-center justify-center text-charcoal-800 font-bold border border-charcoal-200">
                  {b.branch_code}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-charcoal-900">{b.name}</h3>
                  <p className="text-[11px] text-charcoal-500 font-mono">Invoice Prefix: {b.invoice_prefix}-</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant={b.is_active ? 'success' : 'neutral'}>
                  {b.is_active ? 'Active' : 'Inactive'}
                </Badge>
                <button
                  onClick={() => openEditModal(b)}
                  className="p-1 text-charcoal-500 hover:text-charcoal-800 rounded hover:bg-cream-100"
                  title="Edit branch details"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="space-y-2 text-xs text-charcoal-700">
              <div>
                <span className="font-bold text-charcoal-500 uppercase text-[10px] block">Address</span>
                <p className="font-medium">{b.address}, {b.city}, {b.state} - {b.pincode}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="font-bold text-charcoal-500 uppercase text-[10px] block">Contact Phone</span>
                  <p className="font-medium">{b.phone}</p>
                </div>
                <div>
                  <span className="font-bold text-charcoal-500 uppercase text-[10px] block">Contact Email</span>
                  <p className="font-medium">{b.email || '-'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-charcoal-100">
                <div>
                  <span className="font-bold text-charcoal-500 uppercase text-[10px] block">GSTIN</span>
                  <p className="font-mono font-medium">{b.gstin || 'Unregistered'}</p>
                </div>
                <div>
                  <span className="font-bold text-charcoal-500 uppercase text-[10px] block">Drug Licence No.</span>
                  <p className="font-mono font-medium text-charcoal-900">{b.drug_license}</p>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-charcoal-100 flex justify-between items-center text-[11px] text-charcoal-500">
              <span>Next Sequential Bill: <b>{b.invoice_prefix}-{b.invoice_sequence}</b></span>
              <span className="text-emerald-700 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Independent Stock & Sales
              </span>
            </div>
          </Card>
        ))}
      </div>

      {/* Add / Edit Branch Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingBranch ? `Edit Branch — ${editingBranch.name}` : 'Register New Pharmacy Branch'}
        maxWidth="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Branch Code *"
              placeholder="e.g. BR03"
              value={formData.branch_code}
              onChange={(e) => setFormData({ ...formData, branch_code: e.target.value.toUpperCase() })}
              required
            />
            <div className="sm:col-span-2">
              <Input
                label="Branch Display Name *"
                placeholder="e.g. PharmaDesk — Suburban Clinic Branch"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
          </div>

          <Input
            label="Street Address *"
            placeholder="Shop / Unit number, building, road"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="City"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
            />
            <Input
              label="State"
              value={formData.state}
              onChange={(e) => setFormData({ ...formData, state: e.target.value })}
            />
            <Input
              label="Pincode"
              value={formData.pincode}
              onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Contact Phone *"
              placeholder="+91 98200 XXXXX"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              required
            />
            <Input
              label="Contact Email"
              type="email"
              placeholder="branch@pharmadesk.local"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Branch Drug Licence No. *"
              placeholder="e.g. MH-MZ2-654321"
              value={formData.drug_license}
              onChange={(e) => setFormData({ ...formData, drug_license: e.target.value })}
              required
            />
            <Input
              label="Branch GSTIN"
              placeholder="27AABCP1234F1Z5"
              value={formData.gstin}
              onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Invoice Number Prefix *"
              placeholder="e.g. BR03"
              value={formData.invoice_prefix}
              onChange={(e) => setFormData({ ...formData, invoice_prefix: e.target.value.toUpperCase() })}
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-charcoal-100">
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting}>
              {editingBranch ? 'Update Branch' : 'Create Branch'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
