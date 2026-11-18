import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { 
  LayoutDashboard, 
  ReceiptText, 
  History, 
  Pill, 
  Boxes, 
  ArrowLeftRight, 
  BarChart3, 
  FileSpreadsheet, 
  Building, 
  Users, 
  ScrollText, 
  Settings,
  AlertTriangle
} from 'lucide-react';

interface NavItem {
  name: string;
  path: string;
  icon: React.ReactNode;
  allowedRoles: string[];
  permissionKey?: string;
}

export const Sidebar: React.FC = () => {
  const { user, role, hasPermission } = useAuth();

  const navItems: NavItem[] = [
    {
      name: 'Dashboard',
      path: '/',
      icon: <LayoutDashboard className="w-4 h-4" />,
      allowedRoles: ['master_admin', 'sub_admin', 'branch_manager'],
    },
    {
      name: 'POS Billing',
      path: '/pos',
      icon: <ReceiptText className="w-4 h-4" />,
      allowedRoles: ['master_admin', 'sub_admin', 'branch_manager', 'billing_employee'],
    },
    {
      name: 'Invoice History',
      path: '/invoices',
      icon: <History className="w-4 h-4" />,
      allowedRoles: ['master_admin', 'sub_admin', 'branch_manager', 'billing_employee'],
    },
    {
      name: 'Medicine Master',
      path: '/medicines',
      icon: <Pill className="w-4 h-4" />,
      allowedRoles: ['master_admin', 'sub_admin', 'inventory_manager'],
    },
    {
      name: 'Branch Inventory',
      path: '/inventory',
      icon: <Boxes className="w-4 h-4" />,
      allowedRoles: ['master_admin', 'sub_admin', 'branch_manager', 'inventory_manager'],
    },
    {
      name: 'Stock Operations',
      path: '/stock-operations',
      icon: <ArrowLeftRight className="w-4 h-4" />,
      allowedRoles: ['master_admin', 'sub_admin', 'inventory_manager'],
    },
    {
      name: 'Low Stock Alerts',
      path: '/low-stock',
      icon: <AlertTriangle className="w-4 h-4 text-amber-600" />,
      allowedRoles: ['master_admin', 'sub_admin', 'branch_manager', 'inventory_manager'],
    },
    {
      name: 'Sales Analytics',
      path: '/analytics',
      icon: <BarChart3 className="w-4 h-4" />,
      allowedRoles: ['master_admin', 'sub_admin', 'branch_manager'],
    },
    {
      name: 'Reports & Exports',
      path: '/reports',
      icon: <FileSpreadsheet className="w-4 h-4" />,
      allowedRoles: ['master_admin', 'sub_admin', 'branch_manager'],
    },
    {
      name: 'Branches',
      path: '/branches',
      icon: <Building className="w-4 h-4" />,
      allowedRoles: ['master_admin'],
    },
    {
      name: 'Staff & Roles',
      path: '/staff',
      icon: <Users className="w-4 h-4" />,
      allowedRoles: ['master_admin', 'sub_admin'],
    },
    {
      name: 'Audit Logs',
      path: '/audit-logs',
      icon: <ScrollText className="w-4 h-4" />,
      allowedRoles: ['master_admin'],
    },
    {
      name: 'Settings',
      path: '/settings',
      icon: <Settings className="w-4 h-4" />,
      allowedRoles: ['master_admin'],
    },
  ];

  // Filter items visible for user
  const visibleItems = navItems.filter(item => {
    if (!role) return false;
    if (role === 'master_admin') return true;
    if (role === 'sub_admin') {
      if (item.path === '/' && hasPermission('view_branch_dashboard')) return true;
      if (item.path === '/pos' && hasPermission('access_billing')) return true;
      if (item.path === '/invoices' && hasPermission('view_invoices')) return true;
      if (item.path === '/medicines' && hasPermission('manage_medicines')) return true;
      if (item.path === '/inventory' && hasPermission('manage_inventory')) return true;
      if (item.path === '/stock-operations' && hasPermission('manage_inventory')) return true;
      if (item.path === '/low-stock' && hasPermission('manage_inventory')) return true;
      if (item.path === '/analytics' && hasPermission('view_branch_reports')) return true;
      if (item.path === '/reports' && hasPermission('view_branch_reports')) return true;
      if (item.path === '/staff' && hasPermission('manage_permitted_employees')) return true;
      return false;
    }
    return item.allowedRoles.includes(role);
  });

  return (
    <aside className="w-60 bg-white border-r border-charcoal-200 flex flex-col justify-between h-[calc(100vh-4rem)] sticky top-16 select-none">
      <div className="py-4 px-3 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-bold text-charcoal-400 tracking-wider uppercase">
          Navigation
        </div>
        {visibleItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) => `
              flex items-center gap-3 px-3 py-2 text-xs font-semibold rounded-md transition-colors
              ${isActive 
                ? 'bg-cream-100 text-charcoal-900 border-l-4 border-l-brand-400 font-bold pl-2 shadow-xs' 
                : 'text-charcoal-600 hover:text-charcoal-900 hover:bg-cream-50'
              }
            `}
          >
            <span className="text-charcoal-500">{item.icon}</span>
            <span>{item.name}</span>
          </NavLink>
        ))}
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-charcoal-100 text-[11px] text-charcoal-400 bg-cream-50/50">
        <div className="flex items-center justify-between">
          <span>PharmaDesk v1.0</span>
          <span className="font-mono text-[10px] text-charcoal-500">Asia/Kolkata</span>
        </div>
      </div>
    </aside>
  );
};
