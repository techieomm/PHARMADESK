import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { Profile, AppRole, SubAdminPermissions } from '@/types';
import { authService } from '@/services/api';

interface AuthContextType {
  user: Profile | null;
  role: AppRole | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  loginWithEmployeeId: (employeeId: string, pass: string) => Promise<Profile>;
  loginWithEmail: (email: string, pass: string) => Promise<Profile>;
  logout: () => Promise<void>;
  hasPermission: (key: keyof SubAdminPermissions) => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshUser = async () => {
    try {
      const current = await authService.getCurrentUser();
      setUser(current);
    } catch (e) {
      console.error('Failed to restore user session:', e);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const loginWithEmployeeId = async (employeeId: string, pass: string): Promise<Profile> => {
    setIsLoading(true);
    try {
      const res = await authService.loginWithEmployeeId(employeeId, pass);
      setUser(res.profile);
      return res.profile;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithEmail = async (email: string, pass: string): Promise<Profile> => {
    setIsLoading(true);
    try {
      const res = await authService.loginWithEmail(email, pass);
      setUser(res.profile);
      return res.profile;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await authService.logout();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const hasPermission = (key: keyof SubAdminPermissions): boolean => {
    if (!user) return false;
    if (user.role === 'master_admin') return true;

    // Explicit permission override if set on user profile
    if (user.permissions && typeof user.permissions[key] === 'boolean') {
      return Boolean(user.permissions[key]);
    }

    if (user.role === 'branch_manager') {
      return [
        'view_branch_dashboard',
        'manage_inventory',
        'view_invoices',
        'access_billing',
        'access_prescription_billing',
        'view_prescription_history',
        'manage_doctors',
        'view_branch_reports',
      ].includes(key);
    }
    if (user.role === 'inventory_manager') {
      return ['manage_medicines', 'manage_inventory'].includes(key);
    }
    if (user.role === 'billing_employee') {
      return ['access_billing', 'view_invoices'].includes(key);
    }
    if (user.role === 'prescription_employee') {
      return ['access_prescription_billing', 'view_prescription_history'].includes(key);
    }
    if (user.role === 'sub_admin') {
      return Boolean(user.permissions && user.permissions[key]);
    }
    return false;
  };

  const value = useMemo(() => ({
    user,
    role: user?.role || null,
    isLoading,
    isAuthenticated: Boolean(user),
    loginWithEmployeeId,
    loginWithEmail,
    logout,
    hasPermission,
    refreshUser,
  }), [user, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
