import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { BranchProvider } from '@/context/BranchContext';
import { Layout } from '@/components/layout/Layout';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { PosBilling } from '@/pages/PosBilling';
import { InvoiceHistory } from '@/pages/InvoiceHistory';
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

// Route Guard Component
const ProtectedRoute: React.FC<{ children: React.ReactNode; allowedRoles?: string[] }> = ({
  children,
  allowedRoles,
}) => {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded bg-charcoal-800 flex items-center justify-center text-brand-400 font-bold text-lg animate-pulse">
            PD
          </div>
          <span className="text-xs font-semibold text-charcoal-600">Loading PharmaDesk...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // If user's role isn't allowed on this specific route, navigate to their primary landing page
    if (user.role === 'billing_employee') return <Navigate to="/pos" replace />;
    if (user.role === 'inventory_manager') return <Navigate to="/inventory" replace />;
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <BranchProvider>
          <Routes>
            {/* Public Auth Route */}
            <Route path="/login" element={<Login />} />

            {/* Protected App Routes inside Layout */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="pos" element={<PosBilling />} />
              <Route path="invoices" element={<InvoiceHistory />} />
              <Route path="medicines" element={<MedicineMaster />} />
              <Route path="inventory" element={<BranchInventory />} />
              <Route path="stock-operations" element={<StockOperations />} />
              <Route path="low-stock" element={<LowStock />} />
              <Route path="analytics" element={<SalesAnalytics />} />
              <Route path="reports" element={<Reports />} />

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
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BranchProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
