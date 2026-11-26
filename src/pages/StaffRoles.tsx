import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { employeeService } from '@/services/api';
import { Profile, AppRole, SubAdminPermissions } from '@/types';
import { 
  Card, 
  Button, 
  Input, 
  Select, 
  Checkbox, 
  Badge, 
  Modal, 
  EmptyState, 
  PageHeader, 
  Skeleton 
} from '@/components/common';
import { formatDate } from '@/utils/formatters';
import { 
  Users, 
  Plus, 
  ShieldCheck, 
  KeyRound, 
  UserX, 
  UserCheck, 
  Edit3, 
  Building2 
} from 'lucide-react';

const DEFAULT_SUBADMIN_PERMISSIONS: SubAdminPermissions = {
  view_branch_dashboard: true,
  manage_medicines: false,
  manage_inventory: true,
  view_invoices: true,
  access_billing: true,
  access_prescription_billing: true,
  view_prescription_history: true,
  manage_doctors: true,
  view_branch_reports: false,
  manage_permitted_employees: false,
};

const getDefaultPermissionsForRole = (role: AppRole): Partial<SubAdminPermissions> => {
  switch (role) {
    case 'prescription_employee':
      return {
        access_prescription_billing: true,
        view_prescription_history: true,
        access_billing: false,
        view_invoices: false,
        manage_doctors: false,
      };
    case 'billing_employee':
      return {
        access_billing: true,
        view_invoices: true,
        access_prescription_billing: false,
        view_prescription_history: false,
      };
    case 'sub_admin':
      return { ...DEFAULT_SUBADMIN_PERMISSIONS };
    default:
      return {};
  }
};

const PERMISSION_LABELS: Array<{ key: keyof SubAdminPermissions; label: string }> = [
  { key: 'access_billing', label: 'Regular Medicine POS Billing' },
  { key: 'view_invoices', label: 'View Medicine Invoice History' },
  { key: 'access_prescription_billing', label: 'Prescription / Patient Slip Billing' },
  { key: 'view_prescription_history', label: 'View Prescription / Slip History' },
  { key: 'manage_doctors', label: 'Add & Manage Doctors' },
  { key: 'manage_inventory', label: 'Manage Branch Inventory' },
  { key: 'manage_medicines', label: 'Manage Medicine Master Catalog' },
  { key: 'view_branch_dashboard', label: 'View Branch Dashboard' },
  { key: 'view_branch_reports', label: 'View Branch Financial Reports' },
  { key: 'manage_permitted_employees', label: 'Manage Branch Employees' },
];

export const StaffRoles: React.FC = () => {
  const { user } = useAuth();
  const { branches } = useBranch();

  const [employees, setEmployees] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Create Employee Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmpId, setFormEmpId] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<AppRole>('billing_employee');
  const [formBranchId, setFormBranchId] = useState(branches[0]?.id || '');
  const [formPermissions, setFormPermissions] = useState<SubAdminPermissions>(DEFAULT_SUBADMIN_PERMISSIONS);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // SubAdmin Permissions Edit Modal
  const [permModalUser, setPermModalUser] = useState<Profile | null>(null);

  // Edit Staff Member Modal
  const [editModalUser, setEditModalUser] = useState<Profile | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<AppRole>('billing_employee');
  const [editBranchId, setEditBranchId] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [isEditingSubmitting, setIsEditingSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Reset Password Modal
  const [resetPassUser, setResetPassUser] = useState<Profile | null>(null);
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [isResettingPass, setIsResettingPass] = useState(false);
  const [resetPassError, setResetPassError] = useState<string | null>(null);
  const [resetPassSuccess, setResetPassSuccess] = useState<string | null>(null);

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

  const openCreateModal = () => {
    setFormName('');
    setFormEmpId(`EMP00${employees.length + 1}`);
    setFormEmail('');
    setFormPhone('');
    setFormPassword('');
    setFormRole('billing_employee');
    setFormBranchId(branches[0]?.id || '');
    setFormPermissions(DEFAULT_SUBADMIN_PERMISSIONS);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formName.trim() || !formEmpId.trim() || !formEmail.trim() || !formPassword.trim()) {
      setFormError('Please fill in all mandatory fields');
      return;
    }

    setIsSubmitting(true);
    try {
      await employeeService.createEmployee({
        fullName: formName.trim(),
        employeeId: formEmpId.trim(),
        email: formEmail.trim(),
        phone: formPhone.trim() || undefined,
        role: formRole,
        branchId: formBranchId,
        initialPassword: formPassword,
        permissions:
          formRole === 'sub_admin' || formRole === 'billing_employee' || formRole === 'prescription_employee'
            ? formPermissions
            : undefined,
      });

      setIsModalOpen(false);
      await loadEmployees();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to create employee');
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
      ? `Activate employee account for ${emp.full_name}?`
      : `Deactivate employee account for ${emp.full_name}? They will be blocked from logging in.`;

    if (window.confirm(confirmMsg)) {
      try {
        await employeeService.toggleEmployeeStatus(emp.id, nextStatus);
        await loadEmployees();
      } catch (err: any) {
        alert('Failed to update status: ' + err.message);
      }
    }
  };

  const handleSavePermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permModalUser) return;
    try {
      await employeeService.updateEmployee(permModalUser.id, {
        permissions: permModalUser.permissions,
      });
      setPermModalUser(null);
      await loadEmployees();
    } catch (err: any) {
      alert('Failed to update permissions: ' + err.message);
    }
  };

  const openEditModal = (emp: Profile) => {
    setEditModalUser(emp);
    setEditName(emp.full_name);
    setEditRole(emp.role);
    setEditBranchId(emp.primary_branch_id || branches[0]?.id || '');
    setEditPhone(emp.phone || '');
    setEditError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalUser) return;
    if (!editName.trim()) {
      setEditError('Name is required');
      return;
    }
    setIsEditingSubmitting(true);
    setEditError(null);
    try {
      await employeeService.updateEmployee(editModalUser.id, {
        full_name: editName.trim(),
        role: editRole,
        primary_branch_id: editBranchId,
        phone: editPhone.trim() || undefined,
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
    setResetPassError(null);
    setResetPassSuccess(null);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPassUser) return;
    if (newStaffPassword.length < 6) {
      setResetPassError('Password must be at least 6 characters');
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
      }, 1500);
    } catch (err: any) {
      setResetPassError(err?.message || 'Failed to reset password');
    } finally {
      setIsResettingPass(false);
    }
  };

  const getRoleBadgeVariant = (role: AppRole) => {
    switch (role) {
      case 'master_admin': return 'brand';
      case 'sub_admin': return 'warning';
      case 'prescription_employee': return 'brand';
      case 'branch_manager': return 'neutral';
      case 'inventory_manager': return 'neutral';
      default: return 'default';
    }
  };

  const getRoleDisplay = (role: AppRole) => {
    switch (role) {
      case 'master_admin': return 'Master Admin';
      case 'sub_admin': return 'Sub Admin';
      case 'branch_manager': return 'Branch Manager';
      case 'inventory_manager': return 'Inventory Manager';
      case 'billing_employee': return 'Regular Billing Employee';
      case 'prescription_employee': return 'Prescription / Slip Employee';
      default: return role;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff & Role Administration"
        subtitle="Role-based authorization, Employee ID login credentials, and granular Sub Admin access matrix."
        actions={
          user?.role === 'master_admin' && (
            <Button variant="primary" size="md" onClick={openCreateModal} leftIcon={<Plus className="w-4 h-4" />}>
              Create Staff Account
            </Button>
          )
        }
      />

      {/* Staff Table */}
      <Card className="bg-white overflow-hidden" noPadding>
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton height={42} className="w-full" />
            <Skeleton height={42} className="w-full" />
            <Skeleton height={42} className="w-full" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-charcoal-200 bg-cream-50 text-charcoal-600 font-semibold uppercase text-[11px]">
                  <th className="py-3 px-4">Employee Details</th>
                  <th className="py-3 px-3">Employee ID</th>
                  <th className="py-3 px-3">System Role</th>
                  <th className="py-3 px-3">Assigned Branch</th>
                  <th className="py-3 px-3">Contact Email & Phone</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal-100">
                {employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-cream-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-bold text-charcoal-900 block text-sm">{emp.full_name}</span>
                      <span className="text-[10px] text-charcoal-500">Registered: {formatDate(emp.created_at, false)}</span>
                    </td>

                    <td className="py-3 px-3">
                      <span className="font-mono font-bold text-charcoal-900 bg-cream-100 px-2 py-0.5 rounded border border-charcoal-200">
                        {emp.employee_id}
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      <Badge variant={getRoleBadgeVariant(emp.role) as any} size="sm" className="uppercase font-bold">
                        {getRoleDisplay(emp.role)}
                      </Badge>
                      {user?.role === 'master_admin' && emp.role !== 'master_admin' && (
                        <button
                          onClick={() =>
                            setPermModalUser({
                              ...emp,
                              permissions: {
                                ...getDefaultPermissionsForRole(emp.role),
                                ...(emp.permissions || {}),
                              },
                            })
                          }
                          className="text-[10px] text-brand-600 hover:underline block mt-0.5 font-semibold"
                        >
                          Configure Permissions
                        </button>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <span className="font-medium text-charcoal-800">
                        {emp.role === 'master_admin' ? 'All Branches (Consolidated)' : emp.branch?.name || 'Assigned Branch'}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-charcoal-700">
                      <div>{emp.email}</div>
                      <div className="text-[10px] text-charcoal-500 font-mono">{emp.phone || '-'}</div>
                    </td>

                    <td className="py-3 px-3 text-center">
                      <Badge variant={emp.is_active ? 'success' : 'danger'} size="sm" className="font-semibold">
                        {emp.is_active ? 'ACTIVE' : 'DEACTIVATED'}
                      </Badge>
                    </td>

                    <td className="py-3 px-3 text-center">
                      {user?.role === 'master_admin' && emp.role !== 'master_admin' && (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEditModal(emp)}
                            className="p-1.5 rounded transition-colors text-charcoal-400 hover:text-brand-600 hover:bg-brand-50"
                            title="Edit Staff Details & Role"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openResetPassModal(emp)}
                            className="p-1.5 rounded transition-colors text-charcoal-400 hover:text-amber-600 hover:bg-amber-50"
                            title="Reset Staff Password"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                          <button
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
        )}
      </Card>

      {/* Create Employee Account Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create New Employee Account"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateEmployee} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Full Name *"
              placeholder="e.g. Anand Sharma"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
            />
            <Input
              label="Assigned Employee ID *"
              placeholder="e.g. emp002"
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
              label="Registered Email Address *"
              type="email"
              placeholder="staff@bajrangpharmacy.com"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              required
            />
            <Input
              label="Initial Password *"
              type="password"
              placeholder="At least 6 characters"
              value={formPassword}
              onChange={(e) => setFormPassword(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Employee Type / System Role *"
              value={formRole}
              onChange={(e) => {
                const nextRole = e.target.value as AppRole;
                setFormRole(nextRole);
                setFormPermissions({
                  ...DEFAULT_SUBADMIN_PERMISSIONS,
                  ...getDefaultPermissionsForRole(nextRole),
                } as SubAdminPermissions);
              }}
              options={[
                { value: 'billing_employee', label: 'Regular Billing Employee (Medicine POS)' },
                { value: 'prescription_employee', label: 'Prescription / Slip Billing Employee (OPD Slips)' },
                { value: 'inventory_manager', label: 'Inventory Manager (Stock & Catalog)' },
                { value: 'branch_manager', label: 'Branch Manager (Full Branch Access)' },
                { value: 'sub_admin', label: 'Sub Admin (Custom Permission Matrix)' },
              ]}
            />

            <Select
              label="Assigned Branch *"
              value={formBranchId}
              onChange={(e) => setFormBranchId(e.target.value)}
              options={branches.map(b => ({
                value: b.id,
                label: `${b.name} (${b.branch_code})`
              }))}
            />
          </div>

          {/* Granular Permissions Matrix */}
          {(formRole === 'sub_admin' || formRole === 'billing_employee' || formRole === 'prescription_employee') && (
            <div className="p-4 bg-cream-50 rounded-lg border border-charcoal-200 space-y-2">
              <span className="text-xs font-bold text-charcoal-900 uppercase tracking-wider block">
                Employee Permissions Matrix
              </span>
              <p className="text-[11px] text-charcoal-500 mb-2">
                Customize access to Regular Medicine Billing, Prescription Slip Billing, History, and Doctors.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {PERMISSION_LABELS.map(({ key, label }) => (
                  <Checkbox
                    key={key}
                    label={label}
                    checked={Boolean(formPermissions[key])}
                    onChange={(checked) => setFormPermissions({
                      ...formPermissions,
                      [key]: checked,
                    })}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-charcoal-100">
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting}>
              Create Account
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Permissions Modal for existing Sub Admin */}
      <Modal
        isOpen={Boolean(permModalUser)}
        onClose={() => setPermModalUser(null)}
        title={`Permissions Matrix — ${permModalUser?.full_name}`}
        maxWidth="md"
      >
        <form onSubmit={handleSavePermissions} className="space-y-4">
          <p className="text-xs text-charcoal-600">
            Select allowed permissions for {permModalUser?.full_name} ({permModalUser?.employee_id}).
          </p>

          <div className="space-y-2 text-xs p-3.5 bg-cream-50 rounded-lg border border-charcoal-200">
            {PERMISSION_LABELS.map(({ key, label }) => (
              <Checkbox
                key={key}
                label={label}
                checked={Boolean(permModalUser?.permissions?.[key])}
                onChange={(checked) => {
                  if (!permModalUser) return;
                  setPermModalUser({
                    ...permModalUser,
                    permissions: {
                      ...permModalUser.permissions,
                      [key]: checked,
                    },
                  });
                }}
              />
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setPermModalUser(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit">
              Save Permissions
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Staff Member Modal */}
      <Modal
        isOpen={Boolean(editModalUser)}
        onClose={() => setEditModalUser(null)}
        title={`Edit Staff Member — ${editModalUser?.employee_id}`}
        maxWidth="md"
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          {editError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800">
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
              label="System Role *"
              value={editRole}
              onChange={(e) => setEditRole(e.target.value as AppRole)}
            >
              <option value="billing_employee">Regular Billing Employee (Medicine POS)</option>
              <option value="prescription_employee">Prescription / Slip Employee (OPD Slips)</option>
              <option value="inventory_manager">Inventory &amp; Purchases Manager</option>
              <option value="branch_manager">Branch Manager</option>
              <option value="sub_admin">Sub Admin (Configurable Matrix)</option>
            </Select>

            <Select
              label="Assigned Branch *"
              value={editBranchId}
              onChange={(e) => setEditBranchId(e.target.value)}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>

          <Input
            label="Phone Number"
            type="tel"
            placeholder="+91 98765 43210"
            value={editPhone}
            onChange={(e) => setEditPhone(e.target.value)}
          />

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
            <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800">
              {resetPassError}
            </div>
          )}

          {resetPassSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800">
              {resetPassSuccess}
            </div>
          )}

          <p className="text-xs text-charcoal-600">
            Enter a new password for {resetPassUser?.full_name}. They will be able to log in immediately with their Employee ID and this new password.
          </p>

          <Input
            label="New Password *"
            type="password"
            placeholder="At least 6 characters"
            value={newStaffPassword}
            onChange={(e) => setNewStaffPassword(e.target.value)}
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
    </div>
  );
};
