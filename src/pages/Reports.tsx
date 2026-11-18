import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { billingService, inventoryService, medicineService, employeeService } from '@/services/api';
import { Invoice, Medicine, BranchInventory, Profile } from '@/types';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { exportToExcel, exportToPdf } from '@/utils/exporter';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { 
  FileSpreadsheet, 
  Download, 
  Calendar, 
  Building2, 
  Receipt, 
  Boxes, 
  Users, 
  CreditCard 
} from 'lucide-react';

export const Reports: React.FC = () => {
  const { user } = useAuth();
  const { branches, selectedBranchId } = useBranch();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [inventory, setInventory] = useState<BranchInventory[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'sales' | 'branch' | 'medicines' | 'payments' | 'inventory' | 'employees'>('sales');

  useEffect(() => {
    const loadAll = async () => {
      setIsLoading(true);
      try {
        const branchParam = user?.role === 'master_admin'
          ? (selectedBranchId === 'all' ? undefined : selectedBranchId)
          : (user?.primary_branch_id || undefined);

        const [invData, medData, stockData, empData] = await Promise.all([
          billingService.getInvoices(branchParam),
          medicineService.getMedicines(),
          inventoryService.getBranchInventory(branchParam),
          employeeService.getEmployees(),
        ]);

        setInvoices(invData);
        setMedicines(medData);
        setInventory(stockData);
        setEmployees(empData);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    loadAll();
  }, [selectedBranchId, user]);

  // Tab 1: Overall Sales Data
  const exportOverallSales = (format: 'excel' | 'pdf') => {
    if (format === 'excel') {
      const data = invoices.map(i => ({
        'Invoice Number': i.invoice_number,
        'Date': formatDate(i.invoice_date),
        'Branch': i.branch?.name || '',
        'Customer Name': i.customer_name,
        'Customer Phone': i.customer_phone,
        'Payment Mode': i.payment_method.toUpperCase(),
        'Taxable (₹)': i.subtotal_taxable,
        'Total GST (₹)': i.total_gst,
        'Total Bill (₹)': i.total_amount,
      }));
      exportToExcel(data, 'PharmaDesk_Overall_Sales_Report', 'Sales');
    } else {
      const headers = ['Inv #', 'Date', 'Branch', 'Customer', 'Mode', 'Taxable', 'GST', 'Total'];
      const rows = invoices.map(i => [
        i.invoice_number,
        formatDate(i.invoice_date, false),
        i.branch?.branch_code || '',
        i.customer_name,
        i.payment_method.toUpperCase(),
        `₹${i.subtotal_taxable.toFixed(2)}`,
        `₹${i.total_gst.toFixed(2)}`,
        `₹${i.total_amount.toFixed(2)}`,
      ]);
      exportToPdf('Overall Business Sales Report', headers, rows, 'PharmaDesk_Overall_Sales_Report');
    }
  };

  // Tab 2: Branch-wise Sales
  const branchSummary = branches.map(b => {
    const branchInvoices = invoices.filter(i => i.branch_id === b.id);
    const revenue = branchInvoices.reduce((sum, i) => sum + i.total_amount, 0);
    const gst = branchInvoices.reduce((sum, i) => sum + i.total_gst, 0);
    return {
      branch: b,
      count: branchInvoices.length,
      revenue,
      gst,
    };
  });

  const exportBranchReport = (format: 'excel' | 'pdf') => {
    if (format === 'excel') {
      const data = branchSummary.map(s => ({
        'Branch Code': s.branch.branch_code,
        'Branch Name': s.branch.name,
        'Total Invoices': s.count,
        'Total Revenue (₹)': s.revenue,
        'GST Collected (₹)': s.gst,
      }));
      exportToExcel(data, 'PharmaDesk_Branch_Sales_Report', 'Branches');
    } else {
      const headers = ['Branch Code', 'Branch Name', 'Invoices', 'Revenue (₹)', 'GST (₹)'];
      const rows = branchSummary.map(s => [
        s.branch.branch_code,
        s.branch.name,
        s.count,
        `₹${s.revenue.toFixed(2)}`,
        `₹${s.gst.toFixed(2)}`,
      ]);
      exportToPdf('Branch-wise Sales Performance Report', headers, rows, 'PharmaDesk_Branch_Sales_Report');
    }
  };

  // Tab 3: Medicine-wise Report
  const medicineSummary = medicines.map(m => {
    let qty = 0;
    let rev = 0;
    for (const inv of invoices) {
      if (inv.items) {
        for (const it of inv.items) {
          if (it.medicine_id === m.id) {
            qty += it.unit_quantity;
            rev += it.total_amount;
          }
        }
      }
    }
    return { medicine: m, qty, rev };
  });

  const exportMedicineReport = (format: 'excel' | 'pdf') => {
    if (format === 'excel') {
      const data = medicineSummary.map(s => ({
        'Brand Name': s.medicine.brand_name,
        'Generic Name': s.medicine.generic_name,
        'Dosage': s.medicine.dosage_form,
        'Units Sold': s.qty,
        'Revenue Generated (₹)': s.rev,
      }));
      exportToExcel(data, 'PharmaDesk_Medicine_Sales_Report', 'Medicines');
    } else {
      const headers = ['Brand Name', 'Generic', 'Form', 'Units Sold', 'Revenue (₹)'];
      const rows = medicineSummary.map(s => [
        s.medicine.brand_name,
        s.medicine.generic_name,
        s.medicine.dosage_form,
        s.qty,
        `₹${s.rev.toFixed(2)}`,
      ]);
      exportToPdf('Medicine-wise Sales Report', headers, rows, 'PharmaDesk_Medicine_Sales_Report');
    }
  };

  // Tab 4: Inventory Report
  const exportInventoryReport = (format: 'excel' | 'pdf') => {
    const data = inventory.map(it => ({
      'Medicine': it.medicine?.brand_name || '',
      'Generic': it.medicine?.generic_name || '',
      'Pieces Available': it.stock_pieces,
      'Batch': it.batch_number || '',
      'Expiry': it.expiry_date || '',
    }));
    if (format === 'excel') {
      exportToExcel(data, 'PharmaDesk_Stock_Inventory_Report', 'Inventory');
    } else {
      const headers = ['Medicine', 'Generic', 'Stock Pieces', 'Batch', 'Expiry'];
      const rows = data.map(d => [d.Medicine, d.Generic, d['Pieces Available'], d.Batch, d.Expiry]);
      exportToPdf('Branch Inventory Report', headers, rows, 'PharmaDesk_Stock_Inventory_Report');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-charcoal-200">
        <div>
          <h1 className="text-xl font-bold text-charcoal-900 tracking-tight">Financial & Operational Reports</h1>
          <p className="text-xs text-charcoal-500 mt-0.5">
            Audit-grade business reports with instant Excel (.xlsx) and PDF document generation.
          </p>
        </div>
      </div>

      {/* Report Categories Tabs */}
      <div className="flex items-center gap-2 border-b border-charcoal-200 overflow-x-auto pb-1 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('sales')}
          className={`px-3 py-2 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'sales'
              ? 'border-brand-500 text-charcoal-900 font-bold'
              : 'border-transparent text-charcoal-500 hover:text-charcoal-800'
          }`}
        >
          <Receipt className="w-4 h-4" />
          Overall Sales Report
        </button>

        <button
          onClick={() => setActiveTab('branch')}
          className={`px-3 py-2 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'branch'
              ? 'border-brand-500 text-charcoal-900 font-bold'
              : 'border-transparent text-charcoal-500 hover:text-charcoal-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Branch-wise Performance
        </button>

        <button
          onClick={() => setActiveTab('medicines')}
          className={`px-3 py-2 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'medicines'
              ? 'border-brand-500 text-charcoal-900 font-bold'
              : 'border-transparent text-charcoal-500 hover:text-charcoal-800'
          }`}
        >
          <Boxes className="w-4 h-4" />
          Medicine-wise Volume
        </button>

        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-3 py-2 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'inventory'
              ? 'border-brand-500 text-charcoal-900 font-bold'
              : 'border-transparent text-charcoal-500 hover:text-charcoal-800'
          }`}
        >
          <Boxes className="w-4 h-4" />
          Inventory Stock Report
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'sales' && (
        <Card className="p-5 bg-white space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-charcoal-100">
            <div>
              <h3 className="font-bold text-sm text-charcoal-900">Overall Sales & GST Register</h3>
              <p className="text-xs text-charcoal-500">Every tax invoice record with subtotal, CGST, SGST and total amount.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => exportOverallSales('excel')}>
                <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-emerald-700" />
                Export to Excel
              </Button>
              <Button variant="primary" size="sm" onClick={() => exportOverallSales('pdf')}>
                <Download className="w-3.5 h-3.5 mr-1" />
                Export to PDF
              </Button>
            </div>
          </div>
          <div className="text-xs text-charcoal-600">
            Total records ready for export: <b>{invoices.length} invoices</b> (Total revenue: <b>{formatCurrency(invoices.reduce((s, i) => s + i.total_amount, 0))}</b>).
          </div>
        </Card>
      )}

      {activeTab === 'branch' && (
        <Card className="p-5 bg-white space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-charcoal-100">
            <div>
              <h3 className="font-bold text-sm text-charcoal-900">Branch-wise Sales Performance</h3>
              <p className="text-xs text-charcoal-500">Comparative revenue, tax liability, and volume between configured branches.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => exportBranchReport('excel')}>
                <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-emerald-700" />
                Export to Excel
              </Button>
              <Button variant="primary" size="sm" onClick={() => exportBranchReport('pdf')}>
                <Download className="w-3.5 h-3.5 mr-1" />
                Export to PDF
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {branchSummary.map(s => (
              <div key={s.branch.id} className="p-4 bg-cream-50 rounded border border-charcoal-200">
                <span className="font-bold text-xs text-charcoal-900 block">{s.branch.name}</span>
                <span className="text-[11px] text-charcoal-500">{s.branch.address}</span>
                <div className="mt-3 pt-2 border-t border-charcoal-200 flex justify-between text-xs">
                  <div>Invoices: <b>{s.count}</b></div>
                  <div>Revenue: <b>{formatCurrency(s.revenue)}</b></div>
                  <div>GST: <b>{formatCurrency(s.gst)}</b></div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {activeTab === 'medicines' && (
        <Card className="p-5 bg-white space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-charcoal-100">
            <div>
              <h3 className="font-bold text-sm text-charcoal-900">Medicine-wise Sales Breakdown</h3>
              <p className="text-xs text-charcoal-500">Total units sold and revenue per medicine item.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => exportMedicineReport('excel')}>
                <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-emerald-700" />
                Export to Excel
              </Button>
              <Button variant="primary" size="sm" onClick={() => exportMedicineReport('pdf')}>
                <Download className="w-3.5 h-3.5 mr-1" />
                Export to PDF
              </Button>
            </div>
          </div>
          <p className="text-xs text-charcoal-600">Total medicines tracked: <b>{medicines.length}</b></p>
        </Card>
      )}

      {activeTab === 'inventory' && (
        <Card className="p-5 bg-white space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-charcoal-100">
            <div>
              <h3 className="font-bold text-sm text-charcoal-900">Branch Stock Valuation & Inventory Audit</h3>
              <p className="text-xs text-charcoal-500">Current available stock pieces, batch numbers, and expiry status.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => exportInventoryReport('excel')}>
                <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-emerald-700" />
                Export to Excel
              </Button>
              <Button variant="primary" size="sm" onClick={() => exportInventoryReport('pdf')}>
                <Download className="w-3.5 h-3.5 mr-1" />
                Export to PDF
              </Button>
            </div>
          </div>
          <p className="text-xs text-charcoal-600">Inventory items tracked: <b>{inventory.length}</b></p>
        </Card>
      )}
    </div>
  );
};
