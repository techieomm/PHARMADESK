import React, { useState, useEffect, useMemo } from 'react';
import { useAuth, resolveEmployeeType } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { employeeService } from '@/services/api';
import {
  Profile,
  EmployeeType,
  SubAdminPermissions,
  Invoice,
  PrescriptionSlip,
} from '@/types';
import {
  Card,
  StatCard,
  Button,
  Input,
  Select,
  Checkbox,
  Badge,
  Modal,
  EmptyState,
  PageHeader,
  Skeleton,
} from '@/components/common';
import { formatCurrency, formatDate } from '@/utils/formatters';
import {
  Users,
  Plus,
  ShieldCheck,
  KeyRound,
  UserX,
  UserCheck,
  Edit3,
  Stethoscope,
  ReceiptText,
  Activity,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

const buildPermissionsForType = (
  empType: EmployeeType,
  allowInventoryForMedicine: boolean = false
): SubAdminPermissions => {
  if (empType === 'parchi_billing') {
    return {
      access_prescription_billing: true,
      view_prescription_history: true,
      access_billing: false,
      view_invoices: false,
      manage_inventory: false,
      manage_medicines: false,
      manage_doctors: false,
      view_branch_dashboard: false,
      view_branch_reports: false,
      manage_permitted_employees: false,
    };
  }
  return {
    access_billing: true,
    view_invoices: true,
    access_prescription_billing: false,
    view_prescription_history: false,
    manage_doctors: false,
    manage_inventory: allowInventoryForMedicine,
    manage_medicines: false,
    view_branch_dashboard: false,
    view_branch_reports: false,
    manage_permitted_employees: false,
  };
};

export const StaffRoles: React.FC = () => {
  const { user } = useAuth();
  const { branches } = useBranch();

  const [employees, setEmployees] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Create Sub-Admin Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedSubAdminType, setSelectedSubAdminType] = useState<'parchi_billing' | 'medicine_billing' | ''>('');
  const [formName, setFormName] = useState('');
  const [formEmpId, setFormEmpId] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formBranchId, setFormBranchId] = useState('');
  const [allowInventory, setAllowInventory] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Staff Member Modal
  const [editModalUser, setEditModalUser] = useState<Profile | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmployeeType, setEditEmployeeType] = useState<'parchi_billing' | 'medicine_billing'>('medicine_billing');
  const [editAllowInventory, setEditAllowInventory] = useState(false);
  const [editBranchId, setEditBranchId] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [isEditingSubmitting, setIsEditingSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Reset Password Modal
  const [resetPassUser, setResetPassUser] = useState<Profile | null>(null);
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [isResettingPass, setIsResettingPass] = useState(false);
  const [resetPassError, setResetPassError] = useState<string | null>(null);
  const [resetPassSuccess, setResetPassSuccess] = useState<string | null>(null);

  // Employee Activity Modal
  const [activityUser, setActivityUser] = useState<Profile | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityData, setActivityData] = useState<{
    invoices: Invoice[];
    slips: PrescriptionSlip[];
  }>({ invoices: [], slips: [] });

  const loadEmployees = async () => {
    setIsLoading(true);
    try {
      const data = await employeeService.getEmployees();
      setEmployees(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  // Ensure formBranchId defaults to first branch as soon as branches load
  useEffect(() => {
    if (!formBranchId && branches.length > 0) {
      setFormBranchId(branches[0].id);
    }
  }, [branches, formBranchId]);

  const generateNextLoginId = (prefix: string) => {
    const existingIds = new Set(employees.map((e) => e.employee_id.toLowerCase()));
    let num = 1;
    while (existingIds.has(`${prefix}${String(num).padStart(2, '0')}`)) {
      num += 1;
    }
    return `${prefix}${String(num).padStart(2, '0')}`;
  };

  const openCreateModal = () => {
    setSelectedSubAdminType('');
    setFormName('');
    setFormEmpId('');
    setFormEmail('');
    setFormPhone('');
    setFormPassword('');
    setShowPassword(false);
    setFormBranchId(branches[0]?.id || user?.primary_branch_id || '');
    setAllowInventory(false);
    setFormError(null);
    setIsCreateModalOpen(true);
  };

  const handleSelectCreateType = (type: 'parchi_billing' | 'medicine_billing') => {
    setSelectedSubAdminType(type);
    setFormError(null);
    if (!formEmpId.trim() || formEmpId.startsWith('parchi') || formEmpId.startsWith('med')) {
      setFormEmpId(generateNextLoginId(type === 'parchi_billing' ? 'parchi' : 'med'));
    }
    if (type === 'parchi_billing') {
      setAllowInventory(false);
    }
  };

  const handleCreateSubAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setCreateSuccess(null);

    if (!selectedSubAdminType) {
      setFormError('Please select an Employee Type (Doctor / Parchi Billing OR Medicine Billing).');
      return;
    }
    if (!formName.trim()) {
      setFormError('Employee full name is required.');
      return;
    }
    if (!formEmpId.trim()) {
      setFormError('Login ID (Employee ID) is required.');
      return;
    }
    if (/\s/.test(formEmpId.trim())) {
      setFormError('Login ID cannot contain spaces.');
      return;
    }
    if (!formPassword || formPassword.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }

    const resolvedBranch = formBranchId || branches[0]?.id || user?.primary_branch_id || null;
    const permissions = buildPermissionsForType(selectedSubAdminType, allowInventory);

    setIsSubmitting(true);
    try {
      const created = await employeeService.createEmployee({
        fullName: formName.trim(),
        employeeId: formEmpId.trim(),
        email: formEmail.trim() || undefined,
        phone: formPhone.trim() || undefined,
        role: 'sub_admin',
        employeeType: selectedSubAdminType,
        branchId: resolvedBranch,
        initialPassword: formPassword,
        permissions,
      });

      setIsCreateModalOpen(false);
      setCreateSuccess(
        `Created ${
          selectedSubAdminType === 'parchi_billing' ? 'Doctor / Parchi Billing' : 'Medicine Billing'
        } Sub-Admin "${created.full_name}" (Login ID: ${created.employee_id}).`
      );
      await loadEmployees();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to create Sub-Admin');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleStatus = async (emp: Profile) => {
    if (emp.role === 'master_admin' && emp.id === user?.id) {
      alert('Cannot deactivate your own Master Admin account.');
      return;
    }
    const nextStatus = !emp.is_active;
    const confirmMsg = nextStatus
      ? `Activate account for ${emp.full_name} (${emp.employee_id})?`
      : `Deactivate account for ${emp.full_name} (${emp.employee_id})? They will be immediately blocked from logging in.`;

    if (window.confirm(confirmMsg)) {
      try {
        await employeeService.toggleEmployeeStatus(emp.id, nextStatus);
        await loadEmployees();
      } catch (err: any) {
        alert('Failed to update status: ' + err.message);
      }
    }
  };

  const openEditModal = (emp: Profile) => {
    const resolvedType = resolveEmployeeType(emp);
    const subType: 'parchi_billing' | 'medicine_billing' =
      resolvedType === 'parchi_billing' ? 'parchi_billing' : 'medicine_billing';
    setEditModalUser(emp);
    setEditName(emp.full_name);
    setEditEmployeeType(subType);
    setEditAllowInventory(Boolean(emp.permissions?.manage_inventory));
    setEditBranchId(emp.primary_branch_id || branches[0]?.id || '');
    setEditPhone(emp.phone || '');
    setEditError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalUser) return;
    if (!editName.trim()) {
      setEditError('Employee name is required.');
      return;
    }

    setIsEditingSubmitting(true);
    setEditError(null);
    try {
      const nextPerms = buildPermissionsForType(
        editEmployeeType,
        editEmployeeType === 'medicine_billing' ? editAllowInventory : false
      );
      // Preserve must_change_password if it existed
      if (editModalUser.permissions?.must_change_password) {
        nextPerms.must_change_password = true;
      }

      await employeeService.updateEmployee(editModalUser.id, {
        full_name: editName.trim(),
        role: 'sub_admin',
        employee_type: editEmployeeType,
        primary_branch_id: editBranchId || branches[0]?.id || undefined,
        phone: editPhone.trim() || undefined,
        permissions: nextPerms,
      });
      setEditModalUser(null);
      await loadEmployees();
    } catch (err: any) {
      setEditError(err?.message || 'Failed to update employee');
    } finally {
      setIsEditingSubmitting(false);
    }
  };

  const openResetPassModal = (emp: Profile) => {
    setResetPassUser(emp);
    setNewStaffPassword('');
    setShowResetPassword(false);
    setResetPassError(null);
    setResetPassSuccess(null);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPassUser) return;
    if (newStaffPassword.length < 6) {
      setResetPassError('Password must be at least 6 characters.');
      return;
    }
    setIsResettingPass(true);
    setResetPassError(null);
    try {
      await employeeService.resetEmployeePassword(resetPassUser.id, newStaffPassword);
      setResetPassSuccess(`Password reset successfully for ${resetPassUser.full_name}!`);
      setTimeout(() => {
        setResetPassUser(null);
        setResetPassSuccess(null);
      }, 1400);
    } catch (err: any) {
      setResetPassError(err?.message || 'Failed to reset password');
    } finally {
      setIsResettingPass(false);
    }
  };

  const openActivityModal = async (emp: Profile) => {
    setActivityUser(emp);
    setActivityLoading(true);
    setActivityData({ invoices: [], slips: [] });
    try {
      const data = await employeeService.getEmployeeActivity(emp.id);
      setActivityData(data);
    } catch (e) {
      console.error('Failed to load employee activity:', e);
    } finally {
      setActivityLoading(false);
    }
  };

  // Partition accounts into: Doctor/Parchi Employees, Medicine Billing Employees, and Admin/Other
  const { parchiEmployees, medicineEmployees, adminAccounts } = useMemo(() => {
    const parchi: Profile[] = [];
    const medicine: Profile[] = [];
    const admins: Profile[] = [];

    for (const emp of employees) {
      if (emp.role === 'master_admin' || emp.role === 'branch_manager' || emp.role === 'inventory_manager') {
        admins.push(emp);
      } else if (resolveEmployeeType(emp) === 'parchi_billing') {
        parchi.push(emp);
      } else {
        medicine.push(emp);
      }
    }

    return { parchiEmployees: parchi, medicineEmployees: medicine, adminAccounts: admins };
  }, [employees]);

  const renderEmployeeTable = (
    list: Profile[],
    category: 'parchi' | 'medicine',
    emptyTitle: string,
    emptyDesc: string
  ) => {
    if (isLoading) {
      return (
        <div className="p-6 space-y-3">
          <Skeleton height={42} className="w-full" />
          <Skeleton height={42} className="w-full" />
        </div>
      );
    }

    if (list.length === 0) {
      return (
        <div className="p-8">
          <EmptyState
            icon={category === 'parchi' ? <Stethoscope className="w-8 h-8 text-charcoal-400" /> : <ReceiptText className="w-8 h-8 text-charcoal-400" />}
            title={emptyTitle}
            description={emptyDesc}
          />
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-charcoal-200 bg-cream-50 text-charcoal-600 font-semibold uppercase text-[11px]">
              <th className="py-3 px-4">Employee Name</th>
              <th className="py-3 px-3">Login ID</th>
              <th className="py-3 px-3">Branch &amp; Access</th>
              <th className="py-3 px-3 text-center">Status</th>
              <th className="py-3 px-3">Created Date</th>
              <th className="py-3 px-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-charcoal-100">
            {list.map((emp) => (
              <tr key={emp.id} className="hover:bg-cream-50/60 transition-colors">
                <td className="py-3 px-4">
                  <span className="font-bold text-charcoal-900 block text-sm">{emp.full_name}</span>
                  <span className="text-[11px] text-charcoal-500">{emp.phone || emp.email}</span>
                </td>

                <td className="py-3 px-3">
                  <span className="font-mono font-bold text-charcoal-900 bg-cream-100 px-2 py-0.5 rounded border border-charcoal-200">
                    {emp.employee_id}
                  </span>
                </td>

                <td className="py-3 px-3">
                  <span className="font-medium text-charcoal-800 block">
                    {emp.branch?.name || 'Assigned Branch'}
                  </span>
                  <span className="text-[10px] text-charcoal-500">
                    {category === 'parchi'
                      ? 'Parchi / Consultation Slips Only'
                      : emp.permissions?.manage_inventory
                      ? 'Medicine Billing + Inventory'
                      : 'Medicine Billing Only'}
                  </span>
                </td>

                <td className="py-3 px-3 text-center">
                  <Badge variant={emp.is_active ? 'success' : 'danger'} size="sm" className="font-semibold">
                    {emp.is_active ? 'ACTIVE' : 'DEACTIVATED'}
                  </Badge>
                </td>

                <td className="py-3 px-3 text-charcoal-600">
                  {formatDate(emp.created_at, false)}
                </td>

                <td className="py-3 px-3 text-center">
                  {user?.role === 'master_admin' && (
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => openActivityModal(emp)}
                        className="p-1.5 rounded transition-colors text-charcoal-400 hover:text-emerald-700 hover:bg-emerald-50"
                        title="View Activity & Records"
                      >
                        <Activity className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(emp)}
                        className="p-1.5 rounded transition-colors text-charcoal-400 hover:text-brand-600 hover:bg-brand-50"
                        title="Edit Employee"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openResetPassModal(emp)}
                        className="p-1.5 rounded transition-colors text-charcoal-400 hover:text-amber-600 hover:bg-amber-50"
                        title="Reset Password"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStatus(emp)}
                        className={`p-1.5 rounded transition-colors ${
                          emp.is_active
                            ? 'text-charcoal-400 hover:text-red-700 hover:bg-red-50'
                            : 'text-emerald-700 hover:bg-emerald-50'
                        }`}
                        title={emp.is_active ? 'Deactivate Account' : 'Activate Account'}
                      >
                        {emp.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff & Sub-Admin Management"
        subtitle="Create and manage Doctor / Parchi Billing employees and Medicine Billing employees with strict role separation."
        actions={
          user?.role === 'master_admin' && (
            <Button variant="primary" size="md" onClick={openCreateModal} leftIcon={<Plus className="w-4 h-4" />}>
              Create Sub-Admin
            </Button>
          )
        }
      />

      {createSuccess && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-medium flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{createSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setCreateSuccess(null)}
            className="text-emerald-700 hover:underline text-[11px] font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Doctor / Parchi Employees"
          value={parchiEmployees.length}
          icon={<Stethoscope className="w-5 h-5 text-brand-600" />}
          subtext={`${parchiEmployees.filter((e) => e.is_active).length} active`}
        />
        <StatCard
          label="Medicine Billing Employees"
          value={medicineEmployees.length}
          icon={<ReceiptText className="w-5 h-5 text-emerald-600" />}
          subtext={`${medicineEmployees.filter((e) => e.is_active).length} active`}
        />
        <StatCard
          label="Admin Accounts"
          value={adminAccounts.length}
          icon={<ShieldCheck className="w-5 h-5 text-charcoal-500" />}
          subtext="Master Admin & Managers"
        />
      </div>

      {/* Category 1: Doctor / Parchi Employees */}
      <Card
        className="bg-white overflow-hidden"
        header={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-brand-600" />
              <span className="text-xs font-bold text-charcoal-800 uppercase tracking-wider">
                Doctor / Parchi Employees ({parchiEmployees.length})
              </span>
            </div>
            <Badge variant="brand" size="sm">Consultation Slips Only</Badge>
          </div>
        }
        noPadding
      >
        {renderEmployeeTable(
          parchiEmployees,
          'parchi',
          'No Doctor / Parchi Employees yet',
          'Click "Create Sub-Admin" and choose Doctor / Parchi Billing Employee to add consultation slip staff.'
        )}
      </Card>

      {/* Category 2: Medicine Billing Employees */}
      <Card
        className="bg-white overflow-hidden"
        header={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <ReceiptText className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-bold text-charcoal-800 uppercase tracking-wider">
                Medicine Billing Employees ({medicineEmployees.length})
              </span>
            </div>
            <Badge variant="success" size="sm">Pharmacy POS Billing</Badge>
          </div>
        }
        noPadding
      >
        {renderEmployeeTable(
          medicineEmployees,
          'medicine',
          'No Medicine Billing Employees yet',
          'Click "Create Sub-Admin" and choose Medicine Billing Employee to add POS billing staff.'
        )}
      </Card>

      {/* Existing Admin Accounts */}
      {adminAccounts.length > 0 && (
        <Card
          className="bg-white overflow-hidden"
          header={
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-charcoal-500" />
              <span className="text-xs font-bold text-charcoal-700 uppercase tracking-wider">
                Administrators &amp; Managers ({adminAccounts.length})
              </span>
            </div>
          }
          noPadding
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-charcoal-200 bg-cream-50 text-charcoal-600 font-semibold uppercase text-[11px]">
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-3">Login ID</th>
                  <th className="py-3 px-3">Role</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal-100">
                {adminAccounts.map((adm) => (
                  <tr key={adm.id}>
                    <td className="py-3 px-4 font-bold text-charcoal-900">{adm.full_name}</td>
                    <td className="py-3 px-3 font-mono font-semibold text-charcoal-800">{adm.employee_id}</td>
                    <td className="py-3 px-3">
                      <Badge variant="brand" size="sm" className="uppercase">{adm.role.replace('_', ' ')}</Badge>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <Badge variant={adm.is_active ? 'success' : 'danger'} size="sm">
                        {adm.is_active ? 'ACTIVE' : 'DEACTIVATED'}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 text-charcoal-600">{formatDate(adm.created_at, false)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create Sub-Admin Modal (Mandatory 2-Type Selection) */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create Sub-Admin Account"
        subtitle="Select the Sub-Admin employee type and enter login credentials"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateSubAdmin} className="space-y-4">
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800 font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Mandatory Sub-Admin Type Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-charcoal-700 uppercase tracking-wider">
              Select Employee Type * (Mandatory)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSelectCreateType('parchi_billing')}
                className={`text-left p-3.5 rounded-lg border-2 transition-all ${
                  selectedSubAdminType === 'parchi_billing'
                    ? 'border-brand-500 bg-brand-50/70 shadow-xs'
                    : 'border-charcoal-200 bg-white hover:border-charcoal-300'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-sm text-charcoal-900">
                  <Stethoscope className="w-4 h-4 text-brand-600" />
                  <span>Doctor / Parchi Billing</span>
                </div>
                <p className="text-[11px] text-charcoal-600 mt-1 leading-relaxed">
                  Patient registration, auto serial &amp; Rx numbers, doctor selection, manual consultation fees, slip printing &amp; history.
                </p>
                <p className="text-[10px] font-semibold text-rose-700 mt-1.5">
                  Restricted: No medicine billing or inventory access
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleSelectCreateType('medicine_billing')}
                className={`text-left p-3.5 rounded-lg border-2 transition-all ${
                  selectedSubAdminType === 'medicine_billing'
                    ? 'border-emerald-600 bg-emerald-50/70 shadow-xs'
                    : 'border-charcoal-200 bg-white hover:border-charcoal-300'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-sm text-charcoal-900">
                  <ReceiptText className="w-4 h-4 text-emerald-600" />
                  <span>Medicine Billing Employee</span>
                </div>
                <p className="text-[11px] text-charcoal-600 mt-1 leading-relaxed">
                  Medicine search, real-time stock checks, POS billing, discounts, GST invoices &amp; billing history.
                </p>
                <p className="text-[10px] font-semibold text-rose-700 mt-1.5">
                  Restricted: No doctor slips or doctor management
                </p>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Employee Full Name *"
              placeholder="e.g. Anand Sharma"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
            />
            <Input
              label="Login ID (Employee ID) *"
              placeholder={selectedSubAdminType === 'parchi_billing' ? 'e.g. parchi01' : 'e.g. med01'}
              value={formEmpId}
              onChange={(e) => setFormEmpId(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Password *"
              type={showPassword ? 'text' : 'password'}
              placeholder="Minimum 6 characters"
              value={formPassword}
              onChange={(e) => setFormPassword(e.target.value)}
              rightIcon={
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-charcoal-400 hover:text-charcoal-700 p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
              required
            />
            <Select
              label="Assigned Branch *"
              value={formBranchId}
              onChange={(e) => setFormBranchId(e.target.value)}
              options={branches.map((b) => ({
                value: b.id,
                label: `${b.name} (${b.branch_code})`,
              }))}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Work Email (Optional)"
              type="email"
              placeholder="Auto-generated if left blank"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
            />
            <Input
              label="Phone Number (Optional)"
              type="tel"
              placeholder="+91 98XXXXXXXX"
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
            />
          </div>

          {selectedSubAdminType === 'medicine_billing' && (
            <div className="p-3 bg-cream-50 rounded-lg border border-charcoal-200">
              <Checkbox
                label="Grant Inventory Management Access (Optional — off by default)"
                checked={allowInventory}
                onChange={(e) => setAllowInventory(e.target.checked)}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-charcoal-100">
            <Button variant="outline" type="button" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting}>
              Create Sub-Admin
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Staff Member Modal */}
      <Modal
        isOpen={Boolean(editModalUser)}
        onClose={() => setEditModalUser(null)}
        title={`Edit Employee — ${editModalUser?.employee_id}`}
        maxWidth="md"
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          {editError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800">
              {editError}
            </div>
          )}

          <Input
            label="Full Name *"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Employee Type *"
              value={editEmployeeType}
              onChange={(e) => setEditEmployeeType(e.target.value as 'parchi_billing' | 'medicine_billing')}
              options={[
                { value: 'parchi_billing', label: 'Doctor / Parchi Billing Employee' },
                { value: 'medicine_billing', label: 'Medicine Billing Employee' },
              ]}
            />

            <Select
              label="Assigned Branch *"
              value={editBranchId}
              onChange={(e) => setEditBranchId(e.target.value)}
              options={branches.map((b) => ({
                value: b.id,
                label: `${b.name} (${b.branch_code})`,
              }))}
            />
          </div>

          <Input
            label="Phone Number"
            type="tel"
            placeholder="+91 98765 43210"
            value={editPhone}
            onChange={(e) => setEditPhone(e.target.value)}
          />

          {editEmployeeType === 'medicine_billing' && (
            <div className="p-3 bg-cream-50 rounded-lg border border-charcoal-200">
              <Checkbox
                label="Allow Inventory Management Access (Optional)"
                checked={editAllowInventory}
                onChange={(e) => setEditAllowInventory(e.target.checked)}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-charcoal-100">
            <Button variant="outline" size="sm" type="button" onClick={() => setEditModalUser(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isEditingSubmitting}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reset Staff Password Modal */}
      <Modal
        isOpen={Boolean(resetPassUser)}
        onClose={() => setResetPassUser(null)}
        title={`Reset Password — ${resetPassUser?.full_name} (${resetPassUser?.employee_id})`}
        maxWidth="sm"
      >
        <form onSubmit={handleResetPassword} className="space-y-4">
          {resetPassError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800">
              {resetPassError}
            </div>
          )}

          {resetPassSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800">
              {resetPassSuccess}
            </div>
          )}

          <p className="text-xs text-charcoal-600">
            Enter a new password for <b>{resetPassUser?.full_name}</b>. They can immediately sign in using Login ID{' '}
            <code className="font-mono font-bold">{resetPassUser?.employee_id}</code>.
          </p>

          <Input
            label="New Password *"
            type={showResetPassword ? 'text' : 'password'}
            placeholder="At least 6 characters"
            value={newStaffPassword}
            onChange={(e) => setNewStaffPassword(e.target.value)}
            rightIcon={
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowResetPassword(!showResetPassword)}
                className="text-charcoal-400 hover:text-charcoal-700 p-1"
              >
                {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
            required
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-charcoal-100">
            <Button variant="outline" size="sm" type="button" onClick={() => setResetPassUser(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isResettingPass}>
              Update Password
            </Button>
          </div>
        </form>
      </Modal>

      {/* Employee Activity & Associated Records Modal */}
      <Modal
        isOpen={Boolean(activityUser)}
        onClose={() => setActivityUser(null)}
        title={`Employee Activity — ${activityUser?.full_name}`}
        subtitle={`Login ID: ${activityUser?.employee_id} • ${
          resolveEmployeeType(activityUser) === 'parchi_billing'
            ? 'Doctor / Parchi Billing'
            : 'Medicine Billing'
        }`}
        maxWidth="lg"
        footer={<Button onClick={() => setActivityUser(null)}>Close</Button>}
      >
        {activityLoading ? (
          <div className="space-y-3">
            <Skeleton height={40} className="w-full" />
            <Skeleton height={40} className="w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-cream-50 border border-charcoal-200">
                <span className="text-[11px] font-bold uppercase text-charcoal-500 block">
                  Consultation Slips Generated
                </span>
                <span className="text-lg font-bold font-mono text-charcoal-900">
                  {activityData.slips.length} slips ({formatCurrency(activityData.slips.reduce((s, x) => s + x.consultation_fee, 0))})
                </span>
              </div>
              <div className="p-3 rounded-lg bg-cream-50 border border-charcoal-200">
                <span className="text-[11px] font-bold uppercase text-charcoal-500 block">
                  Medicine Bills Generated
                </span>
                <span className="text-lg font-bold font-mono text-charcoal-900">
                  {activityData.invoices.length} bills ({formatCurrency(activityData.invoices.reduce((s, x) => s + x.total_amount, 0))})
                </span>
              </div>
            </div>

            {activityData.slips.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-charcoal-700 mb-2">
                  Recent Consultation Slips
                </h4>
                <div className="border border-charcoal-200 rounded-lg divide-y divide-charcoal-100 max-h-56 overflow-y-auto text-xs">
                  {activityData.slips.map((s) => (
                    <div key={s.id} className="p-2.5 flex items-center justify-between">
                      <div>
                        <span className="font-mono font-bold text-brand-700">{s.serial_number}</span>
                        <span className="mx-1.5 text-charcoal-400">•</span>
                        <span className="font-semibold text-charcoal-900">{s.patient_name}</span>
                        <span className="block text-[11px] text-charcoal-500">
                          {s.doctor_name} • {formatDate(s.slip_date)}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-charcoal-900">{formatCurrency(s.consultation_fee)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activityData.invoices.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-charcoal-700 mb-2">
                  Recent Medicine Invoices
                </h4>
                <div className="border border-charcoal-200 rounded-lg divide-y divide-charcoal-100 max-h-56 overflow-y-auto text-xs">
                  {activityData.invoices.map((inv) => (
                    <div key={inv.id} className="p-2.5 flex items-center justify-between">
                      <div>
                        <span className="font-mono font-bold text-charcoal-900">{inv.invoice_number}</span>
                        <span className="mx-1.5 text-charcoal-400">•</span>
                        <span className="font-semibold text-charcoal-800">{inv.customer_name}</span>
                        <span className="block text-[11px] text-charcoal-500">{formatDate(inv.invoice_date)}</span>
                      </div>
                      <span className="font-mono font-bold text-charcoal-900">{formatCurrency(inv.total_amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activityData.slips.length === 0 && activityData.invoices.length === 0 && (
              <p className="text-xs text-charcoal-500 text-center py-4">
                No slips or invoices recorded by this employee yet.
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default StaffRoles;
