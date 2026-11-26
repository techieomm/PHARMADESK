import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { SubAdminPermissions } from '@/types';
import { 
  LayoutDashboard, 
  ReceiptText, 
  FileText, 
  Pill, 
  Boxes, 
  ArrowLeftRight, 
  BarChart3, 
  FileSpreadsheet, 
  Building, 
  Users, 
  ScrollText, 
  Settings,
  AlertTriangle,
  ShoppingCart,
  Truck,
  RotateCcw,
  IndianRupee,
  BookOpen,
  Layers,
  X,
  AlertCircle,
  Stethoscope,
  ClipboardList,
  UserCheck
} from 'lucide-react';

interface NavItem {
  name: string;
  path: string;
  icon: React.ReactNode;
  allowedRoles: string[];
  requiredPermission?: keyof SubAdminPermissions;
  badge?: string;
  badgeVariant?: 'brand' | 'warning' | 'danger';
}

interface NavSection {
  title: string;
  items: NavItem[];
}

interface SidebarProps {
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpenMobile = false,
  onCloseMobile,
}) => {
  const { role, hasPermission } = useAuth();

  const navSections: NavSection[] = [
    {
      title: 'Medicine Counter & Billing',
      items: [
        {
          name: 'Dashboard',
          path: '/',
          icon: <LayoutDashboard className="w-4 h-4" />,
          allowedRoles: ['master_admin', 'branch_manager'],
          requiredPermission: 'view_branch_dashboard',
        },
        {
          name: 'POS Billing',
          path: '/pos',
          icon: <ReceiptText className="w-4 h-4" />,
          allowedRoles: ['master_admin', 'branch_manager', 'billing_employee'],
          requiredPermission: 'access_billing',
          badge: 'F1-F12',
        },
        {
          name: 'Invoice History',
          path: '/invoices',
          icon: <FileText className="w-4 h-4" />,
          allowedRoles: ['master_admin', 'branch_manager', 'billing_employee'],
          requiredPermission: 'view_invoices',
        },
        {
          name: 'Sales Returns',
          path: '/returns',
          icon: <RotateCcw className="w-4 h-4" />,
          allowedRoles: ['master_admin', 'branch_manager', 'billing_employee'],
          requiredPermission: 'access_billing',
        },
        {
          name: 'Customers & Udhaar',
          path: '/customers',
          icon: <Users className="w-4 h-4" />,
          allowedRoles: ['master_admin', 'branch_manager', 'billing_employee'],
          requiredPermission: 'access_billing',
        },
      ],
    },
    {
      title: 'Prescription & Patient Slips',
      items: [
        {
          name: 'Patient Slip Billing',
          path: '/prescription-slips',
          icon: <Stethoscope className="w-4 h-4 text-brand-600" />,
          allowedRoles: ['master_admin', 'branch_manager', 'prescription_employee'],
          requiredPermission: 'access_prescription_billing',
          badge: 'PARCHI',
          badgeVariant: 'brand',
        },
        {
          name: 'Slip History & Fees',
          path: '/prescription-history',
          icon: <ClipboardList className="w-4 h-4" />,
          allowedRoles: ['master_admin', 'branch_manager', 'prescription_employee'],
          requiredPermission: 'view_prescription_history',
        },
        {
          name: 'Doctors Directory',
          path: '/doctors',
          icon: <UserCheck className="w-4 h-4" />,
          allowedRoles: ['master_admin', 'branch_manager'],
          requiredPermission: 'manage_doctors',
        },
      ],
    },
    {
      title: 'Inventory & Purchases',
      items: [
        {
          name: 'Medicine Catalog',
          path: '/medicines',
          icon: <Pill className="w-4 h-4" />,
          allowedRoles: ['master_admin', 'inventory_manager'],
          requiredPermission: 'manage_medicines',
        },
        {
          name: 'Batch Inventory',
          path: '/inventory',
          icon: <Boxes className="w-4 h-4" />,
          allowedRoles: ['master_admin', 'branch_manager', 'inventory_manager'],
          requiredPermission: 'manage_inventory',
        },
        {
          name: 'Purchase Entries',
          path: '/purchases',
          icon: <ShoppingCart className="w-4 h-4" />,
          allowedRoles: ['master_admin', 'branch_manager', 'inventory_manager'],
          requiredPermission: 'manage_inventory',
        },
        {
          name: 'Suppliers & Ledger',
          path: '/suppliers',
          icon: <Truck className="w-4 h-4" />,
          allowedRoles: ['master_admin', 'inventory_manager'],
          requiredPermission: 'manage_inventory',
        },
        {
          name: 'Stock Operations',
          path: '/stock-operations',
          icon: <ArrowLeftRight className="w-4 h-4" />,
          allowedRoles: ['master_admin', 'inventory_manager'],
          requiredPermission: 'manage_inventory',
        },
        {
          name: 'Low Stock & Expiry',
          path: '/low-stock',
          icon: <AlertTriangle className="w-4 h-4 text-amber-600" />,
          allowedRoles: ['master_admin', 'branch_manager', 'inventory_manager'],
          requiredPermission: 'manage_inventory',
        },
      ],
    },
    {
      title: 'Accounts & Reports',
      items: [
        {
          name: 'Day Book & Register',
          path: '/day-book',
          icon: <BookOpen className="w-4 h-4 text-brand-600" />,
          allowedRoles: ['master_admin', 'branch_manager'],
          requiredPermission: 'view_branch_reports',
        },
        {
          name: 'Day Close & Cash',
          path: '/day-close',
          icon: <IndianRupee className="w-4 h-4" />,
          allowedRoles: ['master_admin', 'branch_manager'],
          requiredPermission: 'view_branch_reports',
        },
        {
          name: 'Discrepancies & Sync',
          path: '/discrepancies',
          icon: <AlertCircle className="w-4 h-4 text-rose-500" />,
          allowedRoles: ['master_admin', 'branch_manager'],
          requiredPermission: 'view_branch_reports',
        },
        {
          name: 'Sales Analytics',
          path: '/analytics',
          icon: <BarChart3 className="w-4 h-4" />,
          allowedRoles: ['master_admin', 'branch_manager'],
          requiredPermission: 'view_branch_reports',
        },
        {
          name: 'GST Reports & CA',
          path: '/reports',
          icon: <FileSpreadsheet className="w-4 h-4" />,
          allowedRoles: ['master_admin', 'branch_manager'],
          requiredPermission: 'view_branch_reports',
        },
      ],
    },
    {
      title: 'Administration',
      items: [
        {
          name: 'Branches',
          path: '/branches',
          icon: <Building className="w-4 h-4" />,
          allowedRoles: ['master_admin'],
        },
        {
          name: 'Staff & Sub-Admins',
          path: '/staff',
          icon: <Users className="w-4 h-4" />,
          allowedRoles: ['master_admin'],
          requiredPermission: 'manage_permitted_employees',
        },
        {
          name: 'Audit Trail',
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
        {
          name: 'UI Kit & Design',
          path: '/dev/ui-kit',
          icon: <Layers className="w-4 h-4 text-brand-500" />,
          allowedRoles: ['master_admin'],
          badge: 'DEV',
          badgeVariant: 'brand',
        },
      ],
    },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full justify-between">
      <div className="py-4 px-3 space-y-6 overflow-y-auto flex-1">
        {navSections.map((sec) => {
          const visibleItems = sec.items.filter((item) => {
            if (!role) return false;
            if (role === 'master_admin') return true;
            if (item.requiredPermission) return hasPermission(item.requiredPermission);
            return item.allowedRoles.includes(role);
          });

          if (visibleItems.length === 0) return null;

          return (
            <div key={sec.title} className="space-y-1">
              <div className="px-3 pb-1 text-[10px] font-bold text-charcoal-400 tracking-wider uppercase">
                {sec.title}
              </div>
              {visibleItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  onClick={onCloseMobile}
                  className={({ isActive }) => `
                    flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-md transition-colors
                    ${isActive 
                      ? 'bg-cream-100 text-charcoal-900 border-l-4 border-l-brand-500 font-bold pl-2 shadow-xs' 
                      : 'text-charcoal-600 hover:text-charcoal-900 hover:bg-cream-50'
                    }
                  `}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-charcoal-500">{item.icon}</span>
                    <span>{item.name}</span>
                  </div>
                  {item.badge && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                      item.badgeVariant === 'brand' 
                        ? 'bg-brand-100 text-brand-700' 
                        : 'bg-charcoal-100 text-charcoal-600'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-charcoal-200 text-[11px] text-charcoal-500 bg-cream-50/50 shrink-0">
        <div className="flex items-center justify-between font-mono">
          <span className="font-semibold text-charcoal-700">Bajrang Pharmacy</span>
          <span className="text-[10px] bg-cream-200/60 px-1 rounded text-charcoal-600">UP 09</span>
        </div>
        <p className="text-[10px] text-charcoal-400 mt-0.5 truncate">GSTIN: 09CMVPM3439A1ZS</p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="sidebar hidden lg:flex flex-col w-[260px] bg-white border-r border-charcoal-200 select-none min-h-0 shadow-xs">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Sidebar */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="fixed inset-0 bg-charcoal-950/50 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="fixed inset-y-0 left-0 w-72 bg-white shadow-2xl z-50 flex flex-col">
            <div className="h-16 border-b border-charcoal-200 px-4 flex items-center justify-between bg-cream-50/80">
              <span className="font-bold text-charcoal-900 text-base">Navigation</span>
              <button
                type="button"
                onClick={onCloseMobile}
                className="p-1.5 text-charcoal-500 hover:text-charcoal-900 rounded-md hover:bg-charcoal-100"
                aria-label="Close sidebar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {sidebarContent}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
