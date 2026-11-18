import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { billingService, medicineService } from '@/services/api';
import { Invoice, Medicine } from '@/types';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Badge } from '@/components/common/Badge';
import { EmptyState } from '@/components/common/EmptyState';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { exportToExcel, exportToPdf } from '@/utils/exporter';
import { 
  BarChart3, 
  Search, 
  FileSpreadsheet, 
  Download, 
  Calendar, 
  Building2, 
  TrendingUp, 
  Percent,
  CheckCircle2
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

export const SalesAnalytics: React.FC = () => {
  const { user } = useAuth();
  const { branches, selectedBranchId } = useBranch();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>(selectedBranchId);
  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | '7days' | '30days' | 'this_month' | 'prev_month' | 'this_year' | 'all'>('30days');
  const [selectedPayment, setSelectedPayment] = useState<string>('all');
  const [medicineSearch, setMedicineSearch] = useState('');

  const loadData = async () => {
    setIsLoading(true);
    try {
      const branchIdParam = user?.role === 'master_admin'
        ? (selectedBranchFilter === 'all' ? undefined : selectedBranchFilter)
        : (user?.primary_branch_id || undefined);

      const [invData, medData] = await Promise.all([
        billingService.getInvoices(branchIdParam),
        medicineService.getMedicines(),
      ]);

      setInvoices(invData);
      setMedicines(medData);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedBranchFilter, user]);

  // Apply filters
  const filteredInvoices = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    return invoices.filter(inv => {
      // Payment filter
      if (selectedPayment !== 'all' && inv.payment_method !== selectedPayment) return false;

      // Date range filter
      if (dateRange !== 'all') {
        const invTime = new Date(inv.invoice_date).getTime();

        if (dateRange === 'today') {
          if (invTime < todayStart) return false;
        } else if (dateRange === 'yesterday') {
          const yesterdayStart = todayStart - 86400000;
          if (invTime < yesterdayStart || invTime >= todayStart) return false;
        } else if (dateRange === '7days') {
          if (invTime < todayStart - 7 * 86400000) return false;
        } else if (dateRange === '30days') {
          if (invTime < todayStart - 30 * 86400000) return false;
        } else if (dateRange === 'this_month') {
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
          if (invTime < monthStart) return false;
        } else if (dateRange === 'prev_month') {
          const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
          const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).getTime();
          if (invTime < prevMonthStart || invTime > prevMonthEnd) return false;
        } else if (dateRange === 'this_year') {
          const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
          if (invTime < yearStart) return false;
        }
      }

      return true;
    });
  }, [invoices, selectedPayment, dateRange]);

  // Aggregate Medicine Sales
  const medicinePerformance = useMemo(() => {
    const map: Record<string, {
      id: string;
      brandName: string;
      genericName: string;
      quantitySold: number;
      revenue: number;
      purchaseCost: number;
      hasPurchaseCost: boolean;
      grossProfit: number;
    }> = {};

    for (const inv of filteredInvoices) {
      if (inv.items) {
        for (const it of inv.items) {
          const med = medicines.find(m => m.id === it.medicine_id);
          const pCostPerPiece = med?.purchase_cost || 0;
          const hasCost = Boolean(pCostPerPiece && pCostPerPiece > 0);
          const totalCost = hasCost ? Number((pCostPerPiece * it.pieces_count).toFixed(2)) : 0;

          if (!map[it.medicine_id]) {
            map[it.medicine_id] = {
              id: it.medicine_id,
              brandName: it.medicine_name,
              genericName: med?.generic_name || '',
              quantitySold: 0,
              revenue: 0,
              purchaseCost: 0,
              hasPurchaseCost: hasCost,
              grossProfit: 0,
            };
          }

          map[it.medicine_id].quantitySold += it.unit_quantity;
          map[it.medicine_id].revenue += it.total_amount;
          if (hasCost) {
            map[it.medicine_id].purchaseCost += totalCost;
            map[it.medicine_id].grossProfit += (it.total_amount - totalCost);
          }
        }
      }
    }

    let list = Object.values(map);
    if (medicineSearch.trim()) {
      const q = medicineSearch.toLowerCase();
      list = list.filter(m => m.brandName.toLowerCase().includes(q) || m.genericName.toLowerCase().includes(q));
    }

    return list.sort((a, b) => b.revenue - a.revenue);
  }, [filteredInvoices, medicines, medicineSearch]);

  // Summary Metrics
  const totalRevenue = filteredInvoices.reduce((sum, i) => sum + i.total_amount, 0);
  const totalTaxable = filteredInvoices.reduce((sum, i) => sum + i.subtotal_taxable, 0);
  const totalGst = filteredInvoices.reduce((sum, i) => sum + i.total_gst, 0);
  const totalInvoices = filteredInvoices.length;
  const avgBill = totalInvoices > 0 ? totalRevenue / totalInvoices : 0;

  const handleExport = () => {
    const exportData = medicinePerformance.map(m => ({
      'Medicine Name': m.brandName,
      'Generic Name': m.genericName,
      'Units Sold': m.quantitySold,
      'Total Revenue (₹)': m.revenue,
      'Purchase Cost (₹)': m.hasPurchaseCost ? m.purchaseCost : 'Not Recorded',
      'Gross Profit (₹)': m.hasPurchaseCost ? m.grossProfit : 'N/A',
    }));
    exportToExcel(exportData, 'PharmaDesk_Sales_Analytics', 'Medicine_Sales');
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-charcoal-200">
        <div>
          <h1 className="text-xl font-bold text-charcoal-900 tracking-tight">Sales Analytics & Profitability</h1>
          <p className="text-xs text-charcoal-500 mt-0.5">
            Deep dive financial metrics, medicine volume, and verifiable gross profit calculation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-emerald-700" />
            Excel Export
          </Button>
        </div>
      </div>

      {/* Advanced Filters */}
      <Card className="p-4 bg-white">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-charcoal-600 uppercase mb-1">Date Interval</label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as any)}
              className="w-full text-xs font-medium border border-charcoal-200 rounded-md py-2 px-3 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="this_month">This Month</option>
              <option value="prev_month">Previous Month</option>
              <option value="this_year">This Financial Year</option>
              <option value="all">All Time Records</option>
            </select>
          </div>

          {user?.role === 'master_admin' && (
            <div>
              <label className="block text-[11px] font-bold text-charcoal-600 uppercase mb-1">Branch</label>
              <select
                value={selectedBranchFilter}
                onChange={(e) => setSelectedBranchFilter(e.target.value)}
                className="w-full text-xs font-medium border border-charcoal-200 rounded-md py-2 px-3 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
              >
                <option value="all">All Branches (Consolidated)</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name} ({b.branch_code})</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-charcoal-600 uppercase mb-1">Payment Method</label>
            <select
              value={selectedPayment}
              onChange={(e) => setSelectedPayment(e.target.value)}
              className="w-full text-xs font-medium border border-charcoal-200 rounded-md py-2 px-3 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
            >
              <option value="all">All Modes (Cash, UPI, Card)</option>
              <option value="cash">Cash Only</option>
              <option value="upi">UPI / QR Only</option>
              <option value="card">Card Only</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-charcoal-600 uppercase mb-1">Filter Medicine</label>
            <Input
              placeholder="Search medicine name..."
              value={medicineSearch}
              onChange={(e) => setMedicineSearch(e.target.value)}
              leftIcon={<Search className="w-3.5 h-3.5" />}
            />
          </div>
        </div>
      </Card>

      {/* Financial Metrics Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 bg-white">
          <span className="text-[11px] font-bold text-charcoal-500 uppercase tracking-wider block">Filtered Sales Revenue</span>
          <p className="text-2xl font-bold text-charcoal-900 mt-1 font-sans">{formatCurrency(totalRevenue)}</p>
          <span className="text-[10px] text-charcoal-500 mt-0.5 block">{totalInvoices} invoices in selection</span>
        </Card>

        <Card className="p-4 bg-white">
          <span className="text-[11px] font-bold text-charcoal-500 uppercase tracking-wider block">Taxable Subtotal</span>
          <p className="text-2xl font-bold text-charcoal-900 mt-1 font-sans">{formatCurrency(totalTaxable)}</p>
          <span className="text-[10px] text-charcoal-500 mt-0.5 block">Excluding GST liability</span>
        </Card>

        <Card className="p-4 bg-white">
          <span className="text-[11px] font-bold text-charcoal-500 uppercase tracking-wider block">Collected GST</span>
          <p className="text-2xl font-bold text-charcoal-900 mt-1 font-sans">{formatCurrency(totalGst)}</p>
          <span className="text-[10px] text-charcoal-500 mt-0.5 block">CGST + SGST tax output</span>
        </Card>

        <Card className="p-4 bg-white">
          <span className="text-[11px] font-bold text-charcoal-500 uppercase tracking-wider block">Average Ticket Size</span>
          <p className="text-2xl font-bold text-charcoal-900 mt-1 font-sans">{formatCurrency(avgBill)}</p>
          <span className="text-[10px] text-charcoal-500 mt-0.5 block">Revenue per invoice</span>
        </Card>
      </div>

      {/* Medicine Performance Table */}
      <Card className="bg-white overflow-hidden" noPadding>
        <div className="px-5 py-3 border-b border-charcoal-100 bg-cream-50/50 flex items-center justify-between">
          <h3 className="text-xs font-bold text-charcoal-700 uppercase tracking-wider">
            Medicine Volume & Revenue Breakdown ({medicinePerformance.length} items)
          </h3>
          <span className="text-[11px] text-charcoal-500">Sorted by revenue generated</span>
        </div>

        {medicinePerformance.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No sales in selected period"
              description="Adjust the date filter or generate bills in POS to see revenue analytics."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-charcoal-200 bg-cream-50 text-charcoal-600 font-semibold uppercase text-[11px]">
                  <th className="py-2.5 px-4">#</th>
                  <th className="py-2.5 px-3">Medicine Item</th>
                  <th className="py-2.5 px-3 text-right">Units Sold</th>
                  <th className="py-2.5 px-3 text-right">Revenue Generated</th>
                  <th className="py-2.5 px-3 text-right">Recorded Cost</th>
                  <th className="py-2.5 px-4 text-right">Gross Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal-100">
                {medicinePerformance.map((med, idx) => (
                  <tr key={med.id} className="hover:bg-cream-50/50">
                    <td className="py-3 px-4 font-bold text-charcoal-400">{idx + 1}</td>

                    <td className="py-3 px-3">
                      <span className="font-bold text-charcoal-900 block">{med.brandName}</span>
                      <span className="text-[10px] text-charcoal-500">{med.genericName}</span>
                    </td>

                    <td className="py-3 px-3 text-right font-medium text-charcoal-800">
                      {med.quantitySold} units
                    </td>

                    <td className="py-3 px-3 text-right font-bold text-charcoal-900 text-sm">
                      {formatCurrency(med.revenue)}
                    </td>

                    <td className="py-3 px-3 text-right text-charcoal-600">
                      {med.hasPurchaseCost ? formatCurrency(med.purchaseCost) : <span className="text-charcoal-400 italic">Not set</span>}
                    </td>

                    <td className="py-3 px-4 text-right">
                      {med.hasPurchaseCost ? (
                        <span className={`font-bold ${med.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                          {formatCurrency(med.grossProfit)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-charcoal-400">Requires cost data</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
