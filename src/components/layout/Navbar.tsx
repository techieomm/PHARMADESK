import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { isSupabaseConfigured } from '@/lib/supabase';
import { SupabaseSetupModal } from './SupabaseSetupModal';
import { Badge } from '@/components/common/Badge';
import { 
  Building2, 
  LogOut, 
  Database, 
  ShieldCheck, 
  User as UserIcon,
  ChevronDown
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const { branches, selectedBranchId, setSelectedBranchId } = useBranch();
  const [showSetupModal, setShowSetupModal] = useState(false);
  const isConnected = isSupabaseConfigured();

  const getRoleDisplayName = (role?: string) => {
    switch (role) {
      case 'master_admin': return 'Master Admin';
      case 'sub_admin': return 'Sub Admin';
      case 'branch_manager': return 'Branch Manager';
      case 'inventory_manager': return 'Inventory Manager';
      case 'billing_employee': return 'Billing Staff';
      default: return 'Staff';
    }
  };

  return (
    <header className="h-16 bg-white border-b border-charcoal-200 sticky top-0 z-30 flex items-center justify-between px-6">
      {/* Left: Branding & Tag */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded bg-charcoal-800 flex items-center justify-center text-brand-400 font-bold text-lg tracking-wider border border-charcoal-700">
            PD
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-charcoal-900 text-base tracking-tight font-sans">
                PHARMA<span className="text-brand-500">DESK</span>
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cream-100 text-charcoal-700 border border-charcoal-200 font-semibold tracking-wider uppercase">
                Enterprise
              </span>
            </div>
            <p className="text-[11px] text-charcoal-500 -mt-0.5">Multi-Branch Pharmacy System</p>
          </div>
        </div>

        {/* Branch Selector for Master Admin / Indicator for Branch Users */}
        <div className="hidden md:flex items-center gap-2 pl-4 border-l border-charcoal-200">
          <Building2 className="w-4 h-4 text-charcoal-500" />
          <span className="text-xs font-semibold text-charcoal-600">Branch:</span>
          {user?.role === 'master_admin' ? (
            <div className="relative">
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="text-xs font-medium bg-cream-50 text-charcoal-800 border border-charcoal-200 rounded px-2.5 py-1 pr-7 focus:outline-none focus:ring-1 focus:ring-brand-400 cursor-pointer appearance-none"
              >
                <option value="all">All Branches (Consolidated)</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.branch_code})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-charcoal-500 absolute right-2 top-2 pointer-events-none" />
            </div>
          ) : (
            <span className="text-xs font-semibold text-charcoal-800 bg-cream-50 px-2 py-0.5 rounded border border-charcoal-200">
              {branches.find(b => b.id === user?.primary_branch_id)?.name || 'Assigned Branch'}
            </span>
          )}
        </div>
      </div>

      {/* Right: Supabase status, User info, Logout */}
      <div className="flex items-center gap-3">
        {/* Supabase Connection Status Pill */}
        <button
          onClick={() => setShowSetupModal(true)}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-colors cursor-pointer ${
            isConnected
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
              : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
          }`}
          title="Click to view Supabase architecture and connection status"
        >
          <Database className="w-3.5 h-3.5" />
          <span className="font-semibold">{isConnected ? 'Supabase: Connected' : 'Supabase: Setup Mode'}</span>
        </button>

        {/* User Profile Info */}
        <div className="hidden sm:flex items-center gap-2.5 pl-3 border-l border-charcoal-200">
          <div className="w-8 h-8 rounded-full bg-cream-100 border border-charcoal-200 flex items-center justify-center text-charcoal-700">
            <UserIcon className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-charcoal-900">{user?.full_name}</span>
              <Badge variant="brand" className="text-[10px] py-0 px-1.5 font-bold uppercase">
                {user?.employee_id}
              </Badge>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-charcoal-500">
              <ShieldCheck className="w-3 h-3 text-brand-600" />
              <span>{getRoleDisplayName(user?.role)}</span>
            </div>
          </div>
        </div>

        {/* Logout button */}
        <button
          onClick={logout}
          className="p-2 text-charcoal-600 hover:text-red-700 hover:bg-red-50 rounded border border-transparent hover:border-red-200 transition-colors ml-1"
          title="Sign out of PharmaDesk"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      <SupabaseSetupModal
        isOpen={showSetupModal}
        onClose={() => setShowSetupModal(false)}
      />
    </header>
  );
};
