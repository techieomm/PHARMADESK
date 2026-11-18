import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { billingService, inventoryService, medicineService } from '@/services/api';
import { Invoice, BranchInventory, Medicine } from '@/types';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { EmptyState } from '@/components/common/EmptyState';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { 
  TrendingUp, 
  Receipt, 
  Boxes, 
  Calendar, 
  Building2, 
  CreditCard, 
  Pill, 
  ArrowUpRight,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { branches, selectedBranchId } = useBranch();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [inventory, setInventory] = useState<BranchInventory[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      const branchIdParam = user?.role === 'master_admin' 
        ? (selectedBranchId === 'all' ? undefined : selectedBranchId)
        : (user?.primary_branch_id || undefined);

      const [invData, stockData, medData] = await Promise.all([
        billingService.getInvoices(branchIdParam),
        inventoryService.getBranchInventory(branchIdParam),
        medicineService.getMedicines(),
      ]);

      setInvoices(invData);
      setInventory(stockData);
      setMedicines(medData);
    } catch (e) {
      console.error('Failed to load dashboard metrics:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [selectedBranchId, user]);

  // Dynamic calculations from actual DB records
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const sevenDaysAgo = todayStart - (7 * 86400000);
  const thirtyDaysAgo = todayStart - (30 * 86400000);

  const metrics = useMemo(() => {
    let totalSales = 0;
    let todaySales = 0;
    let yesterdaySales = 0;
    let weekSales = 0;
    let monthSales = 0;
    let totalTaxable = 0;
    let totalGst = 0;
    let cashSales = 0;
    let upiSales = 0;
    let cardSales = 0;

    const medSalesMap: Record<string, { name: string; quantity: number; revenue: number }> = {};

    for (const inv of invoices) {
      const time = new Date(inv.invoice_date).getTime();
      const amt = inv.total_amount;

      totalSales += amt;
      totalTaxable += inv.subtotal_taxable;
      totalGst += inv.total_gst;

      if (time >= todayStart) todaySales += amt;
      if (time >= yesterdayStart && time < todayStart) yesterdaySales += amt;
      if (time >= sevenDaysAgo) weekSales += amt;
      if (time >= thirtyDaysAgo) monthSales += amt;

      if (inv.payment_method === 'cash') cashSales += amt;
      else if (inv.payment_method === 'upi') upiSales += amt;
      else if (inv.payment_method === 'card') cardSales += amt;

      // Medicine stats
      if (inv.items) {
        for (const item of inv.items) {
          if (!medSalesMap[item.medicine_id]) {
            medSalesMap[item.medicine_id] = { name: item.medicine_name, quantity: 0, revenue: 0 };
          }
          medSalesMap[item.medicine_id].quantity += item.unit_quantity;
          medSalesMap[item.medicine_id].revenue += item.total_amount;
        }
      }
    }

    const topMedicines = Object.values(medSalesMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const avgBill = invoices.length > 0 ? totalSales / invoices.length : 0;

    // 7-day trend
    const last7DaysMap: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const label = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
      last7DaysMap[label] = 0;
    }

    for (const inv of invoices) {
      const d = new Date(inv.invoice_date);
      const label = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
      if (last7DaysMap[label] !== undefined) {
        last7DaysMap[label] += inv.total_amount;
      }
    }

    const trendData = Object.entries(last7DaysMap).map(([day, sales]) => ({ day, sales }));

    // Branch comparisons (for Master Admin)
    const branchComparison = branches.map(br => {
      const brInvoices = invoices.filter(inv => inv.branch_id === br.id);
      const brRevenue = brInvoices.reduce((sum, i) => sum + i.total_amount, 0);
      return {
        branch: br,
        invoicesCount: brInvoices.length,
        revenue: brRevenue,
      };
    });

    return {
      totalSales,
      todaySales,
      yesterdaySales,
      weekSales,
      monthSales,
      totalInvoices: invoices.length,
      avgBill,
      totalTaxable,
      totalGst,
      cashSales,
      upiSales,
      cardSales,
      topMedicines,
      trendData,
      branchComparison,
    };
  }, [invoices, branches]);

  // Payment Breakdown Pie Chart Data
  const paymentChartData = [
    { name: 'Cash', value: metrics.cashSales, color: '#292929' },
    { name: 'UPI / QR', value: metrics.upiSales, color: '#E9A66B' },
    { name: 'Card', value: metrics.cardSales, color: '#737373' },
  ].filter(d => d.value > 0);

  // Stock health counts
  const lowStockCount = inventory.filter(i => i.stock_pieces > 0 && i.stock_pieces <= 20).length;
  const outOfStockCount = inventory.filter(i => i.stock_pieces === 0).length;

  return (
    <div className="space-y-6">
      {/* Dashboard Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-charcoal-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-charcoal-900 tracking-tight">Executive Dashboard</h1>
            <Badge variant="brand" className="text-[10px] uppercase font-bold">
              {user?.role === 'master_admin' ? 'Master Admin' : 'Branch Portal'}
            </Badge>
          </div>
          <p className="text-xs text-charcoal-500 mt-0.5">
            Real-time business sales, branch metrics, and inventory overview.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-charcoal-600 bg-white border border-charcoal-200 px-3 py-1.5 rounded-md font-mono">
            <Calendar className="w-3.5 h-3.5 text-brand-600" />
            <span>{new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full' })}</span>
          </div>

          <Button variant="primary" size="sm" onClick={() => navigate('/pos')}>
            <Receipt className="w-3.5 h-3.5 mr-1" />
            Open POS
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Sales */}
        <Card className="p-4 bg-white border-l-4 border-l-charcoal-800">
          <span className="text-[11px] font-bold text-charcoal-500 uppercase tracking-wider block">
            Total Business Sales
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-charcoal-900 font-sans">
              {formatCurrency(metrics.totalSales)}
            </span>
            <TrendingUp className="w-5 h-5 text-brand-500" />
          </div>
          <span className="text-[10px] text-charcoal-500 mt-1 block">
            Taxable: {formatCurrency(metrics.totalTaxable)} | GST: {formatCurrency(metrics.totalGst)}
          </span>
        </Card>

        {/* Today's Sales */}
        <Card className="p-4 bg-white border-l-4 border-l-brand-400">
          <span className="text-[11px] font-bold text-charcoal-500 uppercase tracking-wider block">
            Today's Sales
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-charcoal-900 font-sans">
              {formatCurrency(metrics.todaySales)}
            </span>
            <span className="text-xs font-semibold text-charcoal-600">Today</span>
          </div>
          <span className="text-[10px] text-charcoal-500 mt-1 block">
            Yesterday: {formatCurrency(metrics.yesterdaySales)}
          </span>
        </Card>

        {/* Invoices Count */}
        <Card className="p-4 bg-white border-l-4 border-l-charcoal-600">
          <span className="text-[11px] font-bold text-charcoal-500 uppercase tracking-wider block">
            Invoices Generated
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-charcoal-900 font-sans">
              {metrics.totalInvoices}
            </span>
            <Receipt className="w-5 h-5 text-charcoal-400" />
          </div>
          <span className="text-[10px] text-charcoal-500 mt-1 block">
            Avg Bill: {formatCurrency(metrics.avgBill)}
          </span>
        </Card>

        {/* Inventory Status */}
        <Card className="p-4 bg-white border-l-4 border-l-amber-500">
          <span className="text-[11px] font-bold text-charcoal-500 uppercase tracking-wider block">
            Stock Depletion Alerts
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-amber-800 font-sans">
              {lowStockCount + outOfStockCount}
            </span>
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <span className="text-[10px] text-charcoal-500 mt-1 block">
            {lowStockCount} low stock | {outOfStockCount} out of stock
          </span>
        </Card>
      </div>

      {/* Branch Comparison Cards for Master Admin */}
      {user?.role === 'master_admin' && (
        <Card className="p-4 bg-white">
          <div className="flex items-center justify-between mb-3 border-b border-charcoal-100 pb-2">
            <h3 className="text-xs font-bold text-charcoal-700 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-brand-600" />
              Branch Performance Comparison
            </h3>
            <span className="text-[11px] text-charcoal-500">2 Configured Active Branches</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {metrics.branchComparison.map((item, idx) => (
              <div key={item.branch.id} className="p-4 bg-cream-50 rounded-md border border-charcoal-200">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-charcoal-900 block">{item.branch.name}</span>
                    <span className="text-[11px] text-charcoal-500">Code: {item.branch.branch_code} • {item.branch.city}</span>
                  </div>
                  <Badge variant="brand" className="text-[10px]">Branch {idx + 1}</Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-charcoal-200/60">
                  <div>
                    <span className="text-[10px] font-bold text-charcoal-500 uppercase">Revenue</span>
                    <p className="text-lg font-bold text-charcoal-900">{formatCurrency(item.revenue)}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-charcoal-500 uppercase">Total Invoices</span>
                    <p className="text-lg font-bold text-charcoal-900">{item.invoicesCount}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Charts Section: 7-Day Trend & Payment Method */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-4 bg-white lg:col-span-2" header={<span className="text-xs font-bold text-charcoal-700 uppercase tracking-wider">7-Day Sales Trend</span>}>
          {metrics.totalSales === 0 ? (
            <div className="h-60 flex items-center justify-center">
              <EmptyState
                title="No sales recorded yet"
                description="Once bills are generated in POS terminal, daily sales revenue trend will be graphed here."
              />
            </div>
          ) : (
            <div className="h-60 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.trendData}>
                  <XAxis dataKey="day" stroke="#737373" fontSize={11} tickLine={false} />
                  <YAxis stroke="#737373" fontSize={11} tickLine={false} tickFormatter={(val) => `₹${val}`} />
                  <Tooltip 
                    formatter={(val: any) => [`₹${Number(val).toFixed(2)}`, 'Sales']}
                    contentStyle={{ backgroundColor: '#292929', color: '#fff', borderRadius: '4px', fontSize: '11px' }}
                  />
                  <Bar dataKey="sales" fill="#E9A66B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Payment Breakdown */}
        <Card className="p-4 bg-white" header={<span className="text-xs font-bold text-charcoal-700 uppercase tracking-wider">Payment Method Share</span>}>
          {paymentChartData.length === 0 ? (
            <div className="h-60 flex items-center justify-center">
              <EmptyState
                title="No payments yet"
                description="Payment methods (Cash, UPI, Card) will appear here as bills are created."
              />
            </div>
          ) : (
            <div className="h-60 flex flex-col items-center justify-center">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={paymentChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {paymentChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(val: any) => [`₹${Number(val).toFixed(2)}`, 'Amount']}
                    contentStyle={{ backgroundColor: '#292929', color: '#fff', borderRadius: '4px', fontSize: '11px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex gap-4 text-xs mt-2">
                {paymentChartData.map(p => (
                  <div key={p.name} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="text-charcoal-700 font-medium">{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Bottom Grid: Top Selling Medicines & Recent Invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Selling Medicines */}
        <Card className="bg-white overflow-hidden" header={<span className="text-xs font-bold text-charcoal-700 uppercase tracking-wider">Top Selling Medicines</span>} noPadding>
          {metrics.topMedicines.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No medicine sales data"
                description="Top performers will be tracked dynamically from line items sold in POS."
              />
            </div>
          ) : (
            <div className="divide-y divide-charcoal-100">
              {metrics.topMedicines.map((med, idx) => (
                <div key={idx} className="p-3.5 flex items-center justify-between text-xs hover:bg-cream-50">
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-cream-100 text-charcoal-800 font-bold flex items-center justify-center text-[10px]">
                      {idx + 1}
                    </span>
                    <span className="font-bold text-charcoal-900">{med.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-charcoal-900 block">{formatCurrency(med.revenue)}</span>
                    <span className="text-[10px] text-charcoal-500">{med.quantity} units sold</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent Invoices */}
        <Card 
          className="bg-white overflow-hidden" 
          header={
            <div className="flex items-center justify-between w-full">
              <span className="text-xs font-bold text-charcoal-700 uppercase tracking-wider">Recent Invoices</span>
              <button 
                onClick={() => navigate('/invoices')} 
                className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-0.5"
              >
                View All <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          } 
          noPadding
        >
          {invoices.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No invoices generated"
                description="Recent invoices will be listed here after checkout."
              />
            </div>
          ) : (
            <div className="divide-y divide-charcoal-100">
              {invoices.slice(0, 5).map((inv) => (
                <div key={inv.id} className="p-3.5 flex items-center justify-between text-xs hover:bg-cream-50">
                  <div>
                    <span className="font-bold font-mono text-charcoal-900 block">{inv.invoice_number}</span>
                    <span className="text-[11px] text-charcoal-500">{inv.customer_name} • {inv.customer_phone}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-charcoal-900 block text-sm">{formatCurrency(inv.total_amount)}</span>
                    <Badge variant="brand" className="text-[9px] uppercase font-bold py-0">{inv.payment_method}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
