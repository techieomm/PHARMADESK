import React, { useState } from 'react';
import { useBranch } from '@/context/BranchContext';
import { branchService } from '@/services/api';
import { Branch } from '@/types';
import { Card, Button, Input, Badge, Modal, PageHeader } from '@/components/common';
import { Building2, Plus, Edit2, CheckCircle2, ShieldCheck } from 'lucide-react';

export const Branches: React.FC = () => {
  const { branches, refreshBranches } = useBranch();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [formData, setFormData] = useState({
    branch_code: '',
    name: '',
    address: '',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    pincode: '226001',
    phone: '',
    email: '',
    gstin: '09CMVPM3439A1ZS',
    drug_license: 'UP-LKO-20B-10928 & UP-LKO-21B-10929',
    invoice_prefix: 'LKO',
    is_active: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const openCreateModal = () => {
    setEditingBranch(null);
    setFormData({
      branch_code: `LKO${branches.length + 1}`,
      name: '',
      address: '',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      pincode: '226001',
      phone: '',
      email: '',
      gstin: '09CMVPM3439A1ZS',
      drug_license: 'UP-LKO-20B-10928 & UP-LKO-21B-10929',
      invoice_prefix: `LKO${branches.length + 1}`,
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
      city: b.city || 'Lucknow',
      state: b.state || 'Uttar Pradesh',
      pincode: b.pincode || '226001',
      phone: b.phone,
      email: b.email || '',
      gstin: b.gstin || '09CMVPM3439A1ZS',
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
      <PageHeader
        title="Branch Management"
        subtitle="Manage Bajrang Pharmacy physical dispensaries, drug licenses, GSTIN, and POS billing prefixes."
        actions={
          <Button variant="primary" size="md" onClick={openCreateModal} leftIcon={<Plus className="w-4 h-4" />}>
            Add Pharmacy Branch
          </Button>
        }
      />

      {/* Branches Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {branches.map((b) => (
          <Card key={b.id} className="bg-white p-5 space-y-4">
            <div className="flex items-start justify-between pb-3 border-b border-charcoal-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-cream-100 flex items-center justify-center text-charcoal-800 font-bold border border-charcoal-200 font-mono">
                  {b.branch_code}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-charcoal-900">{b.name}</h3>
                  <p className="text-[11px] text-charcoal-500 font-mono">Prefix: {b.invoice_prefix}-</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant={b.is_active ? 'success' : 'neutral'} size="sm">
                  {b.is_active ? 'Active' : 'Inactive'}
                </Badge>
                <button
                  onClick={() => openEditModal(b)}
                  className="p-1.5 text-charcoal-500 hover:text-charcoal-800 rounded hover:bg-cream-100 transition-colors"
                  title="Edit branch details"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-2 text-xs text-charcoal-700">
              <div>
                <span className="font-bold text-charcoal-500 uppercase text-[10px] block">Dispensary Address</span>
                <p className="font-medium">{b.address}, {b.city}, {b.state} - {b.pincode}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="font-bold text-charcoal-500 uppercase text-[10px] block">Contact Phone</span>
                  <p className="font-medium font-mono">{b.phone}</p>
                </div>
                <div>
                  <span className="font-bold text-charcoal-500 uppercase text-[10px] block">Contact Email</span>
                  <p className="font-medium">{b.email || '-'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-charcoal-100">
                <div>
                  <span className="font-bold text-charcoal-500 uppercase text-[10px] block">GSTIN</span>
                  <p className="font-mono font-medium">{b.gstin || '09CMVPM3439A1ZS'}</p>
                </div>
                <div>
                  <span className="font-bold text-charcoal-500 uppercase text-[10px] block">Drug Licence No.</span>
                  <p className="font-mono font-medium text-charcoal-900">{b.drug_license}</p>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-charcoal-100 flex justify-between items-center text-[11px] text-charcoal-500">
              <span>Next Sequential Bill: <b className="font-mono">{b.invoice_prefix}-{b.invoice_sequence}</b></span>
              <span className="text-emerald-700 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Independent Stock & Sequences
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
              placeholder="e.g. LKO3"
              value={formData.branch_code}
              onChange={(e) => setFormData({ ...formData, branch_code: e.target.value.toUpperCase() })}
              required
            />
            <div className="sm:col-span-2">
              <Input
                label="Branch Display Name *"
                placeholder="e.g. Bajrang Pharmacy — Alambagh Branch"
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
              placeholder="+91 94150 XXXXX"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              required
            />
            <Input
              label="Contact Email"
              type="email"
              placeholder="branch@bajrangpharmacy.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Branch Drug Licence No. *"
              placeholder="UP-LKO-20B-XXXXX & UP-LKO-21B-XXXXX"
              value={formData.drug_license}
              onChange={(e) => setFormData({ ...formData, drug_license: e.target.value })}
              required
            />
            <Input
              label="Branch GSTIN"
              placeholder="09CMVPM3439A1ZS"
              value={formData.gstin}
              onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Invoice Number Prefix *"
              placeholder="e.g. LKO3"
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
