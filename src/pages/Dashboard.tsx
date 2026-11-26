import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { billingService, inventoryService, medicineService } from '@/services/api';
import { Invoice, BranchInventory, Medicine } from '@/types';
import { Card, StatCard, Button, Badge, EmptyState, PageHeader, Skeleton } from '@/components/common';
import { formatCurrency, formatDate, getStockStatus } from '@/utils/formatters';
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
  AlertTriangle,
  ShoppingBag,
  Clock
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

  // Dynamic growth percentage calculation (Requirement 7)
  const todaySalesTrend = useMemo(() => {
    const yesterday = metrics.yesterdaySales;
    const today = metrics.todaySales;

    if (yesterday === 0 && today === 0) {
      return {
        value: '0%',
        isPositive: undefined, // neutral style, no arrow
        label: 'vs yesterday',
      };
    }
    if (yesterday === 0 && today > 0) {
      return {
        value: 'New',
        isPositive: true,
        label: 'vs yesterday',
      };
    }
    const pct = Math.round(((today - yesterday) / yesterday) * 100);
    return {
      value: `${Math.abs(pct)}%`,
      isPositive: today >= yesterday,
      label: 'vs yesterday',
    };
  }, [metrics.todaySales, metrics.yesterdaySales]);

  // Stock health counts calculated consistently from medicine catalog + active batch inventory
  const { lowStockCount, outOfStockCount } = useMemo(() => {
    let low = 0;
    let out = 0;
    for (const med of medicines) {
      const totalPieces = inventory
        .filter((i) => i.medicine_id === med.id)
        .reduce((sum, row) => sum + (Number(row.stock_pieces) || 0), 0);
      const statusInfo = getStockStatus(totalPieces, med.min_stock_alert);
      if (statusInfo.isOutOfStock) out += 1;
      else if (statusInfo.isLowStock) low += 1;
    }
    return { lowStockCount: low, outOfStockCount: out };
  }, [medicines, inventory]);

  return (
    <div className="space-y-6">
      {/* Top Header (Requirement 3: inside <main>, flex, space-between, gap 16px, flex-wrap, mb-6) */}
      <div className="flex justify-between items-start gap-4 flex-wrap mb-6 pb-4 border-b border-charcoal-200">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-charcoal-900 tracking-tight font-sans">
              Executive Dashboard
            </h1>
            <Badge variant="brand" size="sm" className="uppercase font-bold tracking-wider">
              {user?.role === 'master_admin' ? 'Master Admin' : 'Branch Portal'}
            </Badge>
          </div>
          <p className="text-xs text-charcoal-500 mt-1">
            Real-time business sales, branch metrics, and inventory overview.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-charcoal-600 bg-white border border-charcoal-200 px-3 py-1.5 rounded-md font-mono h-10 shadow-xs">
            <Calendar className="w-3.5 h-3.5 text-brand-600" />
            <span>{new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full' })}</span>
          </div>

          <Button variant="primary" size="md" onClick={() => navigate('/pos')} leftIcon={<Receipt className="w-4 h-4" />}>
            Open POS
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid (Requirement 5: 4 cols desktop, 2 tablet, 1 mobile, 20-24px gap) */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-6">
          <Skeleton height={116} className="rounded-lg" />
          <Skeleton height={116} className="rounded-lg" />
          <Skeleton height={116} className="rounded-lg" />
          <Skeleton height={116} className="rounded-lg" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-6">
          <StatCard
            label="Total Business Sales"
            value={formatCurrency(metrics.totalSales)}
            icon={<TrendingUp className="w-5 h-5 text-brand-600" />}
            subtext={`Taxable: ${formatCurrency(metrics.totalTaxable)} | GST: ${formatCurrency(metrics.totalGst)}`}
            variant="default"
          />

          <StatCard
            label="Today's Sales"
            value={formatCurrency(metrics.todaySales)}
            icon={<ShoppingBag className="w-5 h-5 text-emerald-600" />}
            subtext={`Yesterday: ${formatCurrency(metrics.yesterdaySales)}`}
            trend={todaySalesTrend}
            variant="success"
          />

          <StatCard
            label="Invoices Generated"
            value={metrics.totalInvoices}
            icon={<Receipt className="w-5 h-5 text-charcoal-500" />}
            subtext={`Avg Bill: ${formatCurrency(metrics.avgBill)}`}
            variant="brand"
          />

          <StatCard
            label="Stock Depletion Alerts"
            value={lowStockCount + outOfStockCount}
            icon={<AlertTriangle className="w-5 h-5 text-amber-600" />}
            subtext={`${lowStockCount} low stock • ${outOfStockCount} out of stock`}
            variant={lowStockCount + outOfStockCount > 0 ? 'warning' : 'default'}
          />
        </div>
      )}

      {/* Branch Comparison Cards for Master Admin (Requirement 6: responsive, no overflow) */}
      {user?.role === 'master_admin' && (
        <Card className="bg-white overflow-hidden min-w-0">
          <div className="flex items-center justify-between mb-3 border-b border-charcoal-100 pb-2">
            <h3 className="text-xs font-bold text-charcoal-700 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-brand-600" />
              Branch Performance Comparison
            </h3>
            <span className="text-[11px] text-charcoal-500">{branches.length} Configured Active Branches</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5 min-w-0">
            {metrics.branchComparison.map((item, idx) => (
              <div key={item.branch.id} className="p-4 bg-cream-50 rounded-lg border border-charcoal-200 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 pr-2">
                    <span className="text-sm font-bold text-charcoal-900 block truncate">{item.branch.name}</span>
                    <span className="text-[11px] text-charcoal-500 font-mono truncate block">Code: {item.branch.branch_code} • {item.branch.city}, {item.branch.state}</span>
                  </div>
                  <Badge variant="brand" size="sm" className="shrink-0">Branch {idx + 1}</Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-charcoal-200/60">
                  <div>
                    <span className="text-[10px] font-bold text-charcoal-500 uppercase">Revenue</span>
                    <p className="text-lg font-bold text-charcoal-900 font-mono">{formatCurrency(item.revenue)}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-charcoal-500 uppercase">Total Invoices</span>
                    <p className="text-lg font-bold text-charcoal-900 font-mono">{item.invoicesCount}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Charts Section: 7-Day Trend & Payment Method (Requirement 6: responsive, no overflow) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-w-0">
        <Card className="bg-white lg:col-span-2 overflow-hidden min-w-0" header={<span className="text-xs font-bold text-charcoal-700 uppercase tracking-wider">7-Day Sales Trend</span>}>
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
                    contentStyle={{ backgroundColor: '#292929', color: '#fff', borderRadius: '6px', fontSize: '11px' }}
                  />
                  <Bar dataKey="sales" fill="#E9A66B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Payment Breakdown */}
        <Card className="bg-white" header={<span className="text-xs font-bold text-charcoal-700 uppercase tracking-wider">Payment Method Share</span>}>
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
                    contentStyle={{ backgroundColor: '#292929', color: '#fff', borderRadius: '6px', fontSize: '11px' }}
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
                <div key={idx} className="p-3.5 flex items-center justify-between text-xs hover:bg-cream-50 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-cream-100 text-charcoal-800 font-bold flex items-center justify-center text-[10px]">
                      {idx + 1}
                    </span>
                    <span className="font-bold text-charcoal-900">{med.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-charcoal-900 font-mono block">{formatCurrency(med.revenue)}</span>
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
                <div key={inv.id} className="p-3.5 flex items-center justify-between text-xs hover:bg-cream-50 transition-colors">
                  <div>
                    <span className="font-bold font-mono text-charcoal-900 block">{inv.invoice_number}</span>
                    <span className="text-[11px] text-charcoal-500">{inv.customer_name} • {inv.customer_phone}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-charcoal-900 font-mono block text-sm">{formatCurrency(inv.total_amount)}</span>
                    <Badge variant="brand" size="sm" className="uppercase font-bold">{inv.payment_method}</Badge>
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
