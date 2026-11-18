import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { Branch } from '@/types';
import { branchService } from '@/services/api';
import { useAuth } from './AuthContext';

interface BranchContextType {
  branches: Branch[];
  selectedBranchId: string; // branch ID or 'all'
  selectedBranch: Branch | null;
  setSelectedBranchId: (id: string) => void;
  refreshBranches: () => Promise<void>;
  isLoadingBranches: boolean;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

export const BranchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchIdState] = useState<string>('all');
  const [isLoadingBranches, setIsLoadingBranches] = useState<boolean>(true);

  const refreshBranches = async () => {
    try {
      const data = await branchService.getBranches();
      setBranches(data);
    } catch (e) {
      console.error('Failed to load branches:', e);
    } finally {
      setIsLoadingBranches(false);
    }
  };

  useEffect(() => {
    refreshBranches();
  }, []);

  // When user logs in or changes, adjust branch selection according to role
  useEffect(() => {
    if (user) {
      if (user.role === 'master_admin') {
        // Master Admin defaults to first branch if 'all' is not set, or can pick 'all'
        const saved = localStorage.getItem('pharmadesk_pref_branch_id');
        if (saved && (saved === 'all' || branches.some(b => b.id === saved))) {
          setSelectedBranchIdState(saved);
        } else if (branches.length > 0) {
          setSelectedBranchIdState('all');
        }
      } else if (user.primary_branch_id) {
        // Other roles are locked to their primary branch
        setSelectedBranchIdState(user.primary_branch_id);
      }
    }
  }, [user, branches]);

  const setSelectedBranchId = (id: string) => {
    if (user?.role !== 'master_admin' && id === 'all') {
      return; // only master admin can see 'all'
    }
    setSelectedBranchIdState(id);
    localStorage.setItem('pharmadesk_pref_branch_id', id);
  };

  const selectedBranch = useMemo(() => {
    if (selectedBranchId === 'all') return null;
    return branches.find(b => b.id === selectedBranchId) || null;
  }, [branches, selectedBranchId]);

  const value = useMemo(() => ({
    branches,
    selectedBranchId,
    selectedBranch,
    setSelectedBranchId,
    refreshBranches,
    isLoadingBranches,
  }), [branches, selectedBranchId, selectedBranch, isLoadingBranches]);

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
};

export const useBranch = (): BranchContextType => {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error('useBranch must be used within a BranchProvider');
  }
  return context;
};
