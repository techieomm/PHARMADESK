import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { BranchProvider } from '@/context/BranchContext';
import { BarcodeScannerProvider } from '@/context/BarcodeScannerContext';
import { BrandingProvider } from '@/context/BrandingContext';
import { BrandLogo } from '@/components/common/BrandLogo';
import { SubAdminPermissions } from '@/types';
import { Layout } from '@/components/layout/Layout';
import { Login } from '@/pages/Login';
import { ChangePassword } from '@/pages/ChangePassword';
import { Dashboard } from '@/pages/Dashboard';
import { PosBilling } from '@/pages/PosBilling';
import { InvoiceHistory } from '@/pages/InvoiceHistory';
import { PrescriptionSlipBilling } from '@/pages/PrescriptionSlipBilling';
import { PrescriptionHistory } from '@/pages/PrescriptionHistory';
import { Doctors } from '@/pages/Doctors';
import { MedicineMaster } from '@/pages/MedicineMaster';
import { BranchInventory } from '@/pages/BranchInventory';
import { StockOperations } from '@/pages/StockOperations';
import { LowStock } from '@/pages/LowStock';
import { SalesAnalytics } from '@/pages/SalesAnalytics';
import { Reports } from '@/pages/Reports';
import { Branches } from '@/pages/Branches';
import { StaffRoles } from '@/pages/StaffRoles';
import { AuditLogs } from '@/pages/AuditLogs';
import { Settings } from '@/pages/Settings';
import { Purchases } from '@/pages/Purchases';
import { Suppliers } from '@/pages/Suppliers';
import { Customers } from '@/pages/Customers';
import { Returns } from '@/pages/Returns';
import { DayClose } from '@/pages/DayClose';
import { DayBook } from '@/pages/DayBook';
import { Discrepancies } from '@/pages/Discrepancies';
import { UiKit } from '@/pages/dev/UiKit';
import { isSupabaseConfigured } from '@/lib/supabase';
import { SupabaseNotConfiguredScreen } from '@/components/layout/SupabaseNotConfiguredScreen';

// Route Guard Component
const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  allowedRoles?: string[];
  requiredPermission?: keyof SubAdminPermissions;
}> = ({
  children,
  allowedRoles,
  requiredPermission,
}) => {
  const { user, isAuthenticated, isLoading, hasPermission } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <BrandLogo variant="icon" size="lg" className="animate-pulse" />
          <span className="text-xs font-semibold text-charcoal-600">Loading Bajrang Pharmacy...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // Mandatory password change enforcement:
  // When must_change_password is true, redirect every authenticated route to /change-password
  if (user.permissions?.must_change_password) {
    return <Navigate to="/change-password" replace />;
  }

  const isRoleAllowed = !allowedRoles || allowedRoles.includes(user.role);
  const isPermAllowed = requiredPermission ? hasPermission(requiredPermission) : false;

  if ((allowedRoles || requiredPermission) && !isRoleAllowed && !isPermAllowed) {
    // If user's role isn't allowed on this specific route, navigate to their primary landing page
    if (user.role === 'prescription_employee') return <Navigate to="/prescription-slips" replace />;
    if (user.role === 'billing_employee') return <Navigate to="/pos" replace />;
    if (user.role === 'inventory_manager') return <Navigate to="/inventory" replace />;
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

// Guard for the /change-password route: requires authentication and must_change_password
const ChangePasswordRoute: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <BrandLogo variant="icon" size="lg" className="animate-pulse" />
          <span className="text-xs font-semibold text-charcoal-600">Loading Bajrang Pharmacy...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // If password change is not required, redirect to home
  if (!user.permissions?.must_change_password) {
    return <Navigate to="/" replace />;
  }

  return <ChangePassword />;
};

export const App: React.FC = () => {
  const isDemo = import.meta.env.VITE_DEMO_MODE === 'true';
  const isConfigured = isSupabaseConfigured();

  // If in production build (PROD) or when VITE_DEMO_MODE=false:
  // If Supabase is unconfigured, strictly block and display setup guide (never silent localDb fallback)
  if ((import.meta.env.PROD || !isDemo) && !isConfigured) {
    return <SupabaseNotConfiguredScreen />;
  }

  return (
    <BrowserRouter>
      <BrandingProvider>
        <AuthProvider>
          <BranchProvider>
            <BarcodeScannerProvider>
              <Routes>
            {/* Public Auth Route */}
            <Route path="/login" element={<Login />} />

            {/* Mandatory First-Login Password Change Route */}
            <Route path="/change-password" element={<ChangePasswordRoute />} />

            {/* Protected App Routes inside Layout */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route
                index
                element={
                  <ProtectedRoute allowedRoles={['master_admin', 'sub_admin', 'branch_manager']}>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="pos"
                element={
                  <ProtectedRoute
                    allowedRoles={['master_admin', 'sub_admin', 'branch_manager', 'billing_employee']}
                    requiredPermission="access_billing"
                  >
                    <PosBilling />
                  </ProtectedRoute>
                }
              />
              <Route
                path="invoices"
                element={
                  <ProtectedRoute
                    allowedRoles={['master_admin', 'sub_admin', 'branch_manager', 'billing_employee']}
                    requiredPermission="view_invoices"
                  >
                    <InvoiceHistory />
                  </ProtectedRoute>
                }
              />
              <Route
                path="returns"
                element={
                  <ProtectedRoute
                    allowedRoles={['master_admin', 'sub_admin', 'branch_manager', 'billing_employee']}
                    requiredPermission="access_billing"
                  >
                    <Returns />
                  </ProtectedRoute>
                }
              />
              <Route
                path="customers"
                element={
                  <ProtectedRoute
                    allowedRoles={['master_admin', 'sub_admin', 'branch_manager', 'billing_employee']}
                    requiredPermission="access_billing"
                  >
                    <Customers />
                  </ProtectedRoute>
                }
              />
              <Route
                path="prescription-slips"
                element={
                  <ProtectedRoute
                    allowedRoles={['master_admin', 'sub_admin', 'branch_manager', 'prescription_employee']}
                    requiredPermission="access_prescription_billing"
                  >
                    <PrescriptionSlipBilling />
                  </ProtectedRoute>
                }
              />
              <Route
                path="prescription-history"
                element={
                  <ProtectedRoute
                    allowedRoles={['master_admin', 'sub_admin', 'branch_manager', 'prescription_employee']}
                    requiredPermission="view_prescription_history"
                  >
                    <PrescriptionHistory />
                  </ProtectedRoute>
                }
              />
              <Route
                path="doctors"
                element={
                  <ProtectedRoute
                    allowedRoles={['master_admin', 'sub_admin', 'branch_manager']}
                    requiredPermission="manage_doctors"
                  >
                    <Doctors />
                  </ProtectedRoute>
                }
              />
              <Route
                path="medicines"
                element={
                  <ProtectedRoute allowedRoles={['master_admin', 'sub_admin', 'inventory_manager']}>
                    <MedicineMaster />
                  </ProtectedRoute>
                }
              />
              <Route
                path="inventory"
                element={
                  <ProtectedRoute allowedRoles={['master_admin', 'sub_admin', 'branch_manager', 'inventory_manager']}>
                    <BranchInventory />
                  </ProtectedRoute>
                }
              />
              <Route
                path="purchases"
                element={
                  <ProtectedRoute allowedRoles={['master_admin', 'sub_admin', 'branch_manager', 'inventory_manager']}>
                    <Purchases />
                  </ProtectedRoute>
                }
              />
              <Route
                path="suppliers"
                element={
                  <ProtectedRoute allowedRoles={['master_admin', 'sub_admin', 'inventory_manager']}>
                    <Suppliers />
                  </ProtectedRoute>
                }
              />
              <Route
                path="stock-operations"
                element={
                  <ProtectedRoute allowedRoles={['master_admin', 'sub_admin', 'inventory_manager']}>
                    <StockOperations />
                  </ProtectedRoute>
                }
              />
              <Route
                path="low-stock"
                element={
                  <ProtectedRoute allowedRoles={['master_admin', 'sub_admin', 'branch_manager', 'inventory_manager']}>
                    <LowStock />
                  </ProtectedRoute>
                }
              />
              <Route
                path="day-book"
                element={
                  <ProtectedRoute allowedRoles={['master_admin', 'sub_admin', 'branch_manager']}>
                    <DayBook />
                  </ProtectedRoute>
                }
              />
              <Route
                path="day-close"
                element={
                  <ProtectedRoute allowedRoles={['master_admin', 'sub_admin', 'branch_manager']}>
                    <DayClose />
                  </ProtectedRoute>
                }
              />
              <Route
                path="discrepancies"
                element={
                  <ProtectedRoute allowedRoles={['master_admin', 'sub_admin', 'branch_manager']}>
                    <Discrepancies />
                  </ProtectedRoute>
                }
              />
              <Route
                path="analytics"
                element={
                  <ProtectedRoute allowedRoles={['master_admin', 'sub_admin', 'branch_manager']}>
                    <SalesAnalytics />
                  </ProtectedRoute>
                }
              />
              <Route
                path="reports"
                element={
                  <ProtectedRoute allowedRoles={['master_admin', 'sub_admin', 'branch_manager']}>
                    <Reports />
                  </ProtectedRoute>
                }
              />

              {/* Master Admin specific routes */}
              <Route
                path="branches"
                element={
                  <ProtectedRoute allowedRoles={['master_admin']}>
                    <Branches />
                  </ProtectedRoute>
                }
              />
              <Route
                path="staff"
                element={
                  <ProtectedRoute allowedRoles={['master_admin', 'sub_admin']}>
                    <StaffRoles />
                  </ProtectedRoute>
                }
              />
              <Route
                path="audit-logs"
                element={
                  <ProtectedRoute allowedRoles={['master_admin']}>
                    <AuditLogs />
                  </ProtectedRoute>
                }
              />
              <Route
                path="settings"
                element={
                  <ProtectedRoute allowedRoles={['master_admin']}>
                    <Settings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="dev/ui-kit"
                element={
                  <ProtectedRoute allowedRoles={['master_admin']}>
                    <UiKit />
                  </ProtectedRoute>
                }
              />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BarcodeScannerProvider>
      </BranchProvider>
    </AuthProvider>
    </BrandingProvider>
    </BrowserRouter>
  );
};

export default App;
