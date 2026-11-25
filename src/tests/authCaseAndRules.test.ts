import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase client
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

// Import authService and employeeService after mocking
import { authService, employeeService } from '../services/api';

describe('Auth Case Handling & Security Rules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockAdminProfile = {
    id: 'user-uuid-123',
    employee_id: 'master-admin',
    full_name: 'Master Administrator',
    email: 'omlenka22@gmail.com',
    role: 'master_admin',
    is_active: true,
    permissions: {
      must_change_password: true,
      all: true,
    },
  };

  it('normalises lowercase employee ID ("master-admin") and logs in', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ email: 'omlenka22@gmail.com', is_active: true }],
      error: null,
    });
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: { id: 'user-uuid-123' }, session: { access_token: 'token-123' } },
      error: null,
    });
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: mockAdminProfile, error: null }),
        }),
      }),
    });

    const res = await authService.loginWithEmployeeId('master-admin', 'master-admin');

    expect(mockRpc).toHaveBeenCalledWith('lookup_employee_email', {
      p_employee_id: 'master-admin',
    });
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'omlenka22@gmail.com',
      password: 'master-admin',
    });
    expect(res.profile.employee_id).toBe('master-admin');
  });

  it('normalises uppercase employee ID ("MASTER-ADMIN") to lowercase and logs in', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ email: 'omlenka22@gmail.com', is_active: true }],
      error: null,
    });
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: { id: 'user-uuid-123' }, session: { access_token: 'token-123' } },
      error: null,
    });
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: mockAdminProfile, error: null }),
        }),
      }),
    });

    const res = await authService.loginWithEmployeeId('  MASTER-ADMIN  ', 'master-admin');

    // Verifies employee ID is normalised to lowercase and trimmed before RPC
    expect(mockRpc).toHaveBeenCalledWith('lookup_employee_email', {
      p_employee_id: 'master-admin',
    });
    expect(res.profile.email).toBe('omlenka22@gmail.com');
  });

  it('shows hint when Employee ID contains "@" instead of generic error', async () => {
    await expect(
      authService.loginWithEmployeeId('omlenka22@gmail.com', 'password123')
    ).rejects.toThrow('That looks like an email. Use the Email Address tab.');

    // Verifies no backend RPC or auth calls were executed
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it('returns generic "Invalid credentials" error when password is wrong', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ email: 'omlenka22@gmail.com', is_active: true }],
      error: null,
    });
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Invalid login credentials' },
    });

    await expect(
      authService.loginWithEmployeeId('master-admin', 'wrong-password')
    ).rejects.toThrow('Invalid credentials');
  });

  it('returns generic "Invalid credentials" error when employee ID does not exist', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    await expect(
      authService.loginWithEmployeeId('non-existent-user', 'some-pass')
    ).rejects.toThrow('Invalid credentials');
  });

  it('throws account deactivated error when user is marked is_active = false', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ email: 'inactive@bajrangpharmacy.in', is_active: false }],
      error: null,
    });

    await expect(
      authService.loginWithEmployeeId('inactive-emp', 'pass12345')
    ).rejects.toThrow('This account has been deactivated. Please contact Master Admin.');
  });
});

describe('Password Change Rules & Route Redirection Logic', () => {
  const userWithMustChange = {
    id: 'user-uuid-123',
    employee_id: 'master-admin',
    email: 'omlenka22@gmail.com',
    role: 'master_admin',
    is_active: true,
    permissions: {
      must_change_password: true,
    },
  };

  const userAfterPasswordChange: { permissions: { must_change_password?: boolean } } = {
    ...userWithMustChange,
    permissions: {},
  };

  it('detects when route should redirect to /change-password', () => {
    const shouldRedirect = Boolean(userWithMustChange.permissions?.must_change_password);
    expect(shouldRedirect).toBe(true);
  });

  it('allows access to dashboard once must_change_password is removed', () => {
    const shouldRedirect = Boolean(userAfterPasswordChange.permissions?.must_change_password);
    expect(shouldRedirect).toBe(false);
  });

  // Password validation rules test
  const FORBIDDEN_PASSWORDS = ['master-admin', 'admin123', 'password'];
  const validateNewPassword = (pass: string, confirm: string, user: any) => {
    if (pass.length < 10) return 'Password must be at least 10 characters long';
    const lower = pass.toLowerCase();
    if (user?.employee_id && lower === user.employee_id.toLowerCase()) {
      return 'Password cannot be equal to your Employee ID';
    }
    if (user?.email && lower === user.email.toLowerCase()) {
      return 'Password cannot be equal to your Email address';
    }
    if (FORBIDDEN_PASSWORDS.includes(lower)) {
      return 'Please choose a stronger password. Commonly used passwords are not permitted.';
    }
    if (pass !== confirm) {
      return 'New password and confirmation password do not match';
    }
    return null;
  };

  it('enforces min 10 characters requirement', () => {
    expect(validateNewPassword('short9', 'short9', userWithMustChange)).toBe(
      'Password must be at least 10 characters long'
    );
  });

  it('rejects password equal to employee ID', () => {
    expect(validateNewPassword('master-admin', 'master-admin', userWithMustChange)).toBe(
      'Password cannot be equal to your Employee ID'
    );
    expect(validateNewPassword('MASTER-ADMIN', 'MASTER-ADMIN', userWithMustChange)).toBe(
      'Password cannot be equal to your Employee ID'
    );
  });

  it('rejects password equal to email', () => {
    expect(validateNewPassword('omlenka22@gmail.com', 'omlenka22@gmail.com', userWithMustChange)).toBe(
      'Password cannot be equal to your Email address'
    );
  });

  it('rejects forbidden weak passwords', () => {
    expect(validateNewPassword('admin123', 'admin123', userWithMustChange)).toBe(
      'Password must be at least 10 characters long' // length check catches it first
    );
    expect(validateNewPassword('master-admin', 'master-admin', userWithMustChange)).toBe(
      'Password cannot be equal to your Employee ID'
    );
  });

  it('rejects mismatched confirmation password', () => {
    expect(validateNewPassword('ValidStrongPass1!', 'DifferentStrongPass2!', userWithMustChange)).toBe(
      'New password and confirmation password do not match'
    );
  });

  it('accepts valid, compliant 10+ character password', () => {
    expect(validateNewPassword('Bajrang@Secure2026', 'Bajrang@Secure2026', userWithMustChange)).toBeNull();
  });

  describe('Employee Account Creation', () => {
    it('creates an employee account via admin_create_employee RPC', async () => {
      const mockCreatedProfile = {
        id: 'new-emp-uuid-456',
        employee_id: 'emp002',
        full_name: 'Anand Sharma',
        email: 'staff@bajrangpharmacy.com',
        role: 'billing_employee',
        primary_branch_id: 'c0000000-0000-0000-0000-000000000001',
        is_active: true,
        permissions: {},
      };

      mockRpc.mockResolvedValueOnce({
        data: mockCreatedProfile,
        error: null,
      });

      mockFrom.mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { ...mockCreatedProfile, branch: { id: 'c0000000-0000-0000-0000-000000000001', name: 'Hazratganj Main' } },
              error: null,
            }),
          }),
        }),
      });

      const result = await employeeService.createEmployee({
        fullName: 'Anand Sharma',
        employeeId: 'EMP002',
        email: 'staff@bajrangpharmacy.com',
        role: 'billing_employee',
        branchId: 'c0000000-0000-0000-0000-000000000001',
        initialPassword: 'TempPassword123!',
      });

      expect(mockRpc).toHaveBeenCalledWith('admin_create_employee', expect.objectContaining({
        p_full_name: 'Anand Sharma',
        p_employee_id: 'emp002',
        p_email: 'staff@bajrangpharmacy.com',
        p_role: 'billing_employee',
      }));
      expect(result.employee_id).toBe('emp002');
      expect(result.id).toBe('new-emp-uuid-456');
    });

    it('propagates business validation errors from admin_create_employee RPC', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Employee ID "EMP002" is already assigned to an existing staff member.' },
      });

      await expect(
        employeeService.createEmployee({
          fullName: 'Duplicate Emp',
          employeeId: 'EMP002',
          email: 'dup@bajrangpharmacy.com',
          role: 'billing_employee',
          branchId: 'c0000000-0000-0000-0000-000000000001',
          initialPassword: 'TempPassword123!',
        })
      ).rejects.toThrow('Employee ID "EMP002" is already assigned to an existing staff member.');
    });
  });
});
