import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getHomeRouteForUser, resolveEmployeeType } from '@/context/AuthContext';
import { Profile, SubAdminPermissions } from '@/types';

const mockRpc = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockFrom = vi.fn();
const mockSignOut = vi.fn();

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: () => true,
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
    auth: {
      signInWithPassword: (...args: any[]) => mockSignInWithPassword(...args),
      signOut: () => mockSignOut(),
    },
    from: (...args: any[]) => mockFrom(...args),
  },
}));

import { authService, employeeService, billingService, prescriptionSlipService } from '@/services/api';

function checkFrontendPermission(user: Profile, key: keyof SubAdminPermissions): boolean {
  if (!user || !user.is_active) return false;
  if (user.role === 'master_admin') return true;
  if (user.permissions && typeof user.permissions[key] === 'boolean') {
    return Boolean(user.permissions[key]);
  }
  const empType = resolveEmployeeType(user);
  if (empType === 'parchi_billing' || user.role === 'prescription_employee') {
    return ['access_prescription_billing', 'view_prescription_history'].includes(key);
  }
  if (empType === 'medicine_billing' || user.role === 'billing_employee') {
    return ['access_billing', 'view_invoices'].includes(key);
  }
  return false;
}

describe('Sub-Admin Creation & Two-Type Employee System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const parchiEmployee: Profile = {
    id: 'parchi-uuid-01',
    employee_id: 'parchi01',
    full_name: 'Suresh Parchi',
    email: 'parchi01@staff.bajrangpharmacy.local',
    role: 'sub_admin',
    employee_type: 'parchi_billing',
    primary_branch_id: 'c0000000-0000-0000-0000-000000000001',
    is_active: true,
    permissions: {
      access_prescription_billing: true,
      view_prescription_history: true,
      access_billing: false,
      view_invoices: false,
      manage_inventory: false,
      manage_doctors: false,
    },
    created_at: '2026-11-25T10:00:00Z',
    updated_at: '2026-11-25T10:00:00Z',
  };

  const medicineEmployee: Profile = {
    id: 'med-uuid-01',
    employee_id: 'med01',
    full_name: 'Ramesh Billing',
    email: 'med01@staff.bajrangpharmacy.local',
    role: 'sub_admin',
    employee_type: 'medicine_billing',
    primary_branch_id: 'c0000000-0000-0000-0000-000000000001',
    is_active: true,
    permissions: {
      access_billing: true,
      view_invoices: true,
      access_prescription_billing: false,
      view_prescription_history: false,
      manage_inventory: false,
      manage_doctors: false,
    },
    created_at: '2026-11-25T10:00:00Z',
    updated_at: '2026-11-25T10:00:00Z',
  };

  const masterAdmin: Profile = {
    id: 'admin-uuid-01',
    employee_id: 'master-admin',
    full_name: 'Master Admin',
    email: 'admin@bajrangpharmacy.in',
    role: 'master_admin',
    employee_type: 'admin',
    primary_branch_id: 'c0000000-0000-0000-0000-000000000001',
    is_active: true,
    created_at: '2026-11-25T09:00:00Z',
    updated_at: '2026-11-25T09:00:00Z',
  };

  it('1. Admin creates a Parchi Billing Employee successfully', async () => {
    mockRpc.mockResolvedValueOnce({ data: parchiEmployee, error: null });
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: parchiEmployee, error: null }),
        }),
      }),
    });

    const created = await employeeService.createEmployee({
      fullName: 'Suresh Parchi',
      employeeId: 'parchi01',
      role: 'sub_admin',
      employeeType: 'parchi_billing',
      branchId: 'c0000000-0000-0000-0000-000000000001',
      initialPassword: 'Password123',
      permissions: parchiEmployee.permissions,
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'admin_create_employee',
      expect.objectContaining({
        p_employee_id: 'parchi01',
        p_email: 'parchi01@staff.bajrangpharmacy.local',
        p_role: 'sub_admin',
        p_employee_type: 'parchi_billing',
      })
    );
    expect(created.employee_type).toBe('parchi_billing');
  });

  it('2. Admin creates a Medicine Billing Employee successfully', async () => {
    mockRpc.mockResolvedValueOnce({ data: medicineEmployee, error: null });
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: medicineEmployee, error: null }),
        }),
      }),
    });

    const created = await employeeService.createEmployee({
      fullName: 'Ramesh Billing',
      employeeId: 'med01',
      role: 'sub_admin',
      employeeType: 'medicine_billing',
      branchId: 'c0000000-0000-0000-0000-000000000001',
      initialPassword: 'Password123',
      permissions: medicineEmployee.permissions,
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'admin_create_employee',
      expect.objectContaining({
        p_employee_id: 'med01',
        p_role: 'sub_admin',
        p_employee_type: 'medicine_billing',
      })
    );
    expect(created.employee_type).toBe('medicine_billing');
  });

  it('3. Both employees can log in via Employee ID', async () => {
    for (const emp of [parchiEmployee, medicineEmployee]) {
      mockRpc.mockResolvedValueOnce({ data: [{ email: emp.email, is_active: true }], error: null });
      mockSignInWithPassword.mockResolvedValueOnce({
        data: { user: { id: emp.id }, session: { access_token: 'tok' } },
        error: null,
      });
      mockFrom.mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: emp, error: null }),
          }),
        }),
      });

      const res = await authService.loginWithEmployeeId(emp.employee_id, 'Password123');
      expect(res.profile.id).toBe(emp.id);
      expect(res.profile.employee_type).toBe(emp.employee_type);
    }
  });

  it('4 & 5 & 10. Redirects Admin, Parchi, and Medicine employees to their exact dashboards', () => {
    expect(getHomeRouteForUser(masterAdmin)).toBe('/');
    expect(getHomeRouteForUser(parchiEmployee)).toBe('/prescription-slips');
    expect(getHomeRouteForUser(medicineEmployee)).toBe('/pos');
  });

  it('6 & 7 & 10. Enforces strict separation between Parchi, Medicine, and Admin permissions', () => {
    // Parchi employee: allowed Parchi billing & history; blocked from Medicine billing, inventory, doctors, admin
    expect(checkFrontendPermission(parchiEmployee, 'access_prescription_billing')).toBe(true);
    expect(checkFrontendPermission(parchiEmployee, 'view_prescription_history')).toBe(true);
    expect(checkFrontendPermission(parchiEmployee, 'access_billing')).toBe(false);
    expect(checkFrontendPermission(parchiEmployee, 'view_invoices')).toBe(false);
    expect(checkFrontendPermission(parchiEmployee, 'manage_inventory')).toBe(false);
    expect(checkFrontendPermission(parchiEmployee, 'manage_doctors')).toBe(false);

    // Medicine employee: allowed POS & invoices; blocked from Parchi billing, doctors, inventory (unless granted)
    expect(checkFrontendPermission(medicineEmployee, 'access_billing')).toBe(true);
    expect(checkFrontendPermission(medicineEmployee, 'view_invoices')).toBe(true);
    expect(checkFrontendPermission(medicineEmployee, 'access_prescription_billing')).toBe(false);
    expect(checkFrontendPermission(medicineEmployee, 'view_prescription_history')).toBe(false);
    expect(checkFrontendPermission(medicineEmployee, 'manage_inventory')).toBe(false);
    expect(checkFrontendPermission(medicineEmployee, 'manage_doctors')).toBe(false);

    // Master Admin: full access
    expect(checkFrontendPermission(masterAdmin, 'access_billing')).toBe(true);
    expect(checkFrontendPermission(masterAdmin, 'access_prescription_billing')).toBe(true);
    expect(checkFrontendPermission(masterAdmin, 'manage_doctors')).toBe(true);
    expect(checkFrontendPermission(masterAdmin, 'manage_inventory')).toBe(true);
  });

  it('8. Rejects unauthorized / invalid API requests cleanly', async () => {
    await expect(
      employeeService.createEmployee({
        fullName: 'Bad ID',
        employeeId: 'bad id',
        role: 'sub_admin',
        employeeType: 'parchi_billing',
        initialPassword: 'Password123',
      })
    ).rejects.toThrow('Login ID cannot contain spaces.');

    // Backend RPC permission rejection for unauthorized billing / slip calls
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Forbidden: You do not have permission to create medicine billing invoices' },
    });
    await expect(
      billingService.createInvoiceAtomic({
        branchId: 'c0000000-0000-0000-0000-000000000001',
        customerName: 'Walk-in',
        customerPhone: '',
        paymentMethod: 'cash',
        items: [],
        userId: parchiEmployee.id,
      })
    ).rejects.toThrow(/Forbidden/);

    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Forbidden: You do not have permission to generate consultation slips' },
    });
    await expect(
      prescriptionSlipService.createSlip({
        branchId: 'c0000000-0000-0000-0000-000000000001',
        patientName: 'Test',
        doctorId: 'doc-1',
        consultationFee: 200,
      })
    ).rejects.toThrow(/Forbidden/);
  });

  it('9. Admin can edit, deactivate, and block login for deactivated employees', async () => {
    const deactivated = { ...parchiEmployee, is_active: false };
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: () => ({
          select: () => ({
            single: async () => ({ data: deactivated, error: null }),
          }),
        }),
      }),
    });

    const toggled = await employeeService.toggleEmployeeStatus(parchiEmployee.id, false);
    expect(toggled.is_active).toBe(false);

    // Deactivated employee cannot log in
    mockRpc.mockResolvedValueOnce({
      data: [{ email: deactivated.email, is_active: false }],
      error: null,
    });
    await expect(authService.loginWithEmployeeId('parchi01', 'Password123')).rejects.toThrow(
      'This account has been deactivated. Please contact Master Admin.'
    );
  });
});
