import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { isSupabaseConfigured } from '@/lib/supabase';
import { SupabaseSetupModal } from './SupabaseSetupModal';
import { Badge } from '@/components/common/Badge';
import { BrandLogo } from '@/components/common/BrandLogo';
import { 
  Building2, 
  LogOut, 
  Database, 
  ShieldCheck, 
  User as UserIcon,
  ChevronDown,
  Menu,
  Wifi,
  WifiOff
} from 'lucide-react';

interface NavbarProps {
  onToggleMobileSidebar?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleMobileSidebar }) => {
  const { user, logout } = useAuth();
  const { branches, selectedBranchId, setSelectedBranchId } = useBranch();
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const isConnected = isSupabaseConfigured();

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const getRoleDisplayName = (role?: string) => {
    switch (role) {
      case 'master_admin': return 'Master Admin';
      case 'sub_admin': return 'Sub Admin';
      case 'branch_manager': return 'Branch Manager';
      case 'inventory_manager': return 'Inventory Manager';
      case 'billing_employee': return 'Billing Staff';
      case 'prescription_employee': return 'Prescription Slip Staff';
      default: return 'Staff';
    }
  };

  return (
    <header className="app-header bg-white border-b border-charcoal-200 sticky top-0 z-50 flex items-center justify-between shadow-xs">
      {/* Left: Mobile Toggle & Brand */}
      <div className="flex items-center gap-3 sm:gap-6">
        {onToggleMobileSidebar && (
          <button
            type="button"
            onClick={onToggleMobileSidebar}
            className="lg:hidden p-2 text-charcoal-600 hover:text-charcoal-900 hover:bg-cream-100 rounded-md transition-colors"
            aria-label="Toggle navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <div className="flex items-center gap-2.5">
          <BrandLogo variant="full" size="md" />
        </div>

        {/* Branch Selector for Master Admin / Indicator for Branch Users */}
        <div className="hidden md:flex items-center gap-2 pl-4 border-l border-charcoal-200">
          <Building2 className="w-4 h-4 text-charcoal-500 shrink-0" />
          <span className="text-xs font-semibold text-charcoal-600">Branch:</span>
          {user?.role === 'master_admin' ? (
            <div className="relative">
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="h-8 text-xs font-medium bg-cream-50 text-charcoal-800 border border-charcoal-300 rounded-md px-2.5 pr-7 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 cursor-pointer appearance-none shadow-xs"
              >
                <option value="all">All Branches (Consolidated)</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.branch_code})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-charcoal-500 absolute right-2 top-2.5 pointer-events-none" />
            </div>
          ) : (
            <span className="text-xs font-semibold text-charcoal-800 bg-cream-50 px-2 py-1 rounded-md border border-charcoal-200">
              {branches.find(b => b.id === user?.primary_branch_id)?.name || 'Assigned Branch'}
            </span>
          )}
        </div>
      </div>

      {/* Right: Network indicator, Supabase status, User info, Logout */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Network Online/Offline Indicator */}
        <div
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border font-medium ${
            isOnline
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-300 font-bold animate-pulse'
          }`}
          title={isOnline ? 'Internet connection active' : 'Offline: Queued transactions enabled'}
        >
          {isOnline ? <Wifi className="w-3.5 h-3.5 text-emerald-600" /> : <WifiOff className="w-3.5 h-3.5 text-rose-600" />}
          <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline Mode'}</span>
        </div>

        {/* Supabase Connection Status Pill */}
        <button
          type="button"
          onClick={() => setShowSetupModal(true)}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-colors cursor-pointer shadow-xs ${
            isConnected
              ? 'bg-cream-100 text-charcoal-800 border-charcoal-300 hover:bg-cream-200'
              : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
          }`}
          title="Click to view Supabase architecture and connection status"
        >
          <Database className="w-3.5 h-3.5 text-charcoal-600" />
          <span className="font-semibold hidden sm:inline">{isConnected ? 'Supabase Connected' : 'Setup Required'}</span>
        </button>

        {/* User Profile Info */}
        <div className="hidden sm:flex items-center gap-2.5 pl-3 border-l border-charcoal-200">
          <div className="w-8 h-8 rounded-full bg-cream-100 border border-charcoal-300 flex items-center justify-center text-charcoal-700">
            <UserIcon className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-charcoal-900 leading-tight">{user?.full_name}</span>
              <Badge variant="brand" size="sm">
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
          type="button"
          onClick={logout}
          className="p-2 text-charcoal-600 hover:text-rose-700 hover:bg-rose-50 rounded-md border border-transparent hover:border-rose-200 transition-colors ml-1"
          title="Sign out of Bajrang Pharmacy"
          aria-label="Sign out"
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
