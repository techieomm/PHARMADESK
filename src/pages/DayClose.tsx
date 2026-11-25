import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { repositories } from '@/data/repositories';
import { DayCloseRecord, ExpenseRecord, DayBookSummary } from '@/types';
import { useBranch } from '@/context/BranchContext';
import {
  PageHeader,
  Card,
  Table,
  Badge,
  Button,
  Input,
  Select,
  Modal,
  StatCard,
} from '@/components/common';
import { IndianRupee, Plus, RefreshCw, CheckCircle2, AlertTriangle, Wallet, BookOpen } from 'lucide-react';
import { formatCurrency, formatDate } from '@/utils/formatters';

export const DayClose: React.FC = () => {
  const { selectedBranchId } = useBranch();
  const [dayRecords, setDayRecords] = useState<DayCloseRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [todaySummary, setTodaySummary] = useState<DayBookSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState<boolean>(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState<boolean>(false);

  // Close Day form
  const [actualCash, setActualCash] = useState<number>(0);
  const [closeNotes, setCloseNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Expense form
  const [expenseCategory, setExpenseCategory] = useState<string>('tea_snacks');
  const [expenseAmount, setExpenseAmount] = useState<number>(0);
  const [expensePayee, setExpensePayee] = useState<string>('');
  const [expenseNotes, setExpenseNotes] = useState<string>('');

  const loadData = async () => {
    setIsLoading(true);
    try {
      const branchParam = selectedBranchId !== 'all' ? selectedBranchId : undefined;
      const [closeList, expList, dayBookData] = await Promise.all([
        repositories.dayClose.getDayCloseRecords(selectedBranchId),
        repositories.dayClose.getExpenses(selectedBranchId),
        repositories.invoices.getDayBook({ branchId: branchParam }),
      ]);
      setDayRecords(closeList);
      setExpenses(expList);
      setTodaySummary(dayBookData.summary);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedBranchId]);

  const handleCloseDay = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const branchId = selectedBranchId && selectedBranchId !== 'all'
        ? selectedBranchId
        : 'c0000000-0000-0000-0000-000000000001';

      await repositories.dayClose.closeDay({
        branchId,
        actualCash,
        notes: closeNotes,
      });

      setIsCloseModalOpen(false);
      setActualCash(0);
      setCloseNotes('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Day close failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (expenseAmount <= 0) return;

    setIsSubmitting(true);
    try {
      const branchId = selectedBranchId && selectedBranchId !== 'all'
        ? selectedBranchId
        : 'c0000000-0000-0000-0000-000000000001';

      await repositories.dayClose.recordExpense({
        branchId,
        category: expenseCategory,
        amount: expenseAmount,
        payee: expensePayee,
        notes: expenseNotes,
      });

      setIsExpenseModalOpen(false);
      setExpenseAmount(0);
      setExpensePayee('');
      setExpenseNotes('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Expense recording failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalExpensesToday = expenses.reduce((acc, curr) => acc + curr.amount, 0);

  return (
    <div className="page-container space-y-6">
      <PageHeader
        title="Cash Management & Day Close"
        subtitle="Perform physical cash drawer tallying, track daily counter expenses, and reconcile shifts."
        actions={
          <div className="flex items-center gap-2">
            <Link to="/day-book">
              <Button variant="outline" size="md" leftIcon={<BookOpen className="w-4 h-4 text-brand-600" />}>
                View Day Book
              </Button>
            </Link>
            <Button variant="outline" size="md" leftIcon={<RefreshCw className="w-4 h-4" />} onClick={loadData}>
              Refresh
            </Button>
            <Button variant="outline" size="md" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setIsExpenseModalOpen(true)}>
              Record Expense
            </Button>
            <Button variant="primary" size="md" leftIcon={<Wallet className="w-4 h-4" />} onClick={() => setIsCloseModalOpen(true)}>
              Close Shift / Day
            </Button>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          label="Today's Cash Collections"
          value={formatCurrency(todaySummary?.cash_collected || 0)}
          variant="brand"
          icon={<Wallet className="w-5 h-5" />}
          subtext={`From ${todaySummary?.gross_sales_count || 0} sales bills`}
        />
        <StatCard
          label="Today's Petty Expenses"
          value={formatCurrency(totalExpensesToday)}
          variant="warning"
          icon={<IndianRupee className="w-5 h-5" />}
          subtext="Tea, snacks, couriers, cleaning"
        />
        <StatCard
          label="Closed Shifts Logged"
          value={dayRecords.length}
          variant="default"
          icon={<CheckCircle2 className="w-5 h-5" />}
          subtext="Audited closing statements"
        />
        <StatCard
          label="Register Balance"
          value={todaySummary?.is_balanced ? 'Balanced' : 'Review Needed'}
          variant={todaySummary?.is_balanced ? 'success' : 'danger'}
          icon={todaySummary?.is_balanced ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          subtext={todaySummary?.is_balanced ? '100% matched with Day Book' : `Diff: ₹${todaySummary?.reconciliation_difference.toFixed(2)}`}
        />
      </div>

      {/* Expenses Table */}
      <Card title="Petty Cash Counter Expenses">
        <Table
          columns={[
            {
              key: 'category',
              header: 'Category',
              render: (row) => <Badge variant="neutral">{row.category.replace('_', ' ').toUpperCase()}</Badge>,
            },
            {
              key: 'payee',
              header: 'Paid To',
              render: (row) => <span>{row.payee || 'Local Vendor'}</span>,
            },
            {
              key: 'notes',
              header: 'Purpose / Description',
              render: (row) => <span className="text-xs text-charcoal-600">{row.notes || '—'}</span>,
            },
            {
              key: 'created_at',
              header: 'Time',
              render: (row) => <span className="text-xs text-charcoal-500">{formatDate(row.created_at)}</span>,
            },
            {
              key: 'amount',
              header: 'Amount',
              align: 'right',
              render: (row) => <span className="font-mono font-bold text-charcoal-900">{formatCurrency(row.amount)}</span>,
            },
          ]}
          data={expenses}
          keyExtractor={(r) => r.id}
        />
      </Card>

      {/* Shift Close History Table */}
      <Card title="Day Close Audit Log">
        <Table
          columns={[
            {
              key: 'closed_at',
              header: 'Closing Time',
              render: (row) => <span className="text-xs text-charcoal-800">{row.closed_at ? formatDate(row.closed_at) : 'Open'}</span>,
            },
            {
              key: 'cash_sales',
              header: 'Cash Sales',
              align: 'right',
              render: (row) => <span className="font-mono text-xs">{formatCurrency(row.cash_sales)}</span>,
            },
            {
              key: 'upi_sales',
              header: 'UPI Sales',
              align: 'right',
              render: (row) => <span className="font-mono text-xs">{formatCurrency(row.upi_sales)}</span>,
            },
            {
              key: 'system_closing_cash',
              header: 'System Expected',
              align: 'right',
              render: (row) => <span className="font-mono font-semibold">{formatCurrency(row.system_closing_cash)}</span>,
            },
            {
              key: 'actual_closing_cash',
              header: 'Physical Cash',
              align: 'right',
              render: (row) => <span className="font-mono font-bold text-charcoal-900">{formatCurrency(row.actual_closing_cash)}</span>,
            },
            {
              key: 'difference',
              header: 'Difference',
              align: 'right',
              render: (row) => (
                <span className={`font-mono font-bold ${row.difference === 0 ? 'text-emerald-600' : row.difference > 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                  {row.difference > 0 ? `+${formatCurrency(row.difference)}` : formatCurrency(row.difference)}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (row) => (
                <Badge variant={row.difference === 0 ? 'success' : 'warning'}>
                  {row.difference === 0 ? 'BALANCED' : 'VARIANCE'}
                </Badge>
              ),
            },
          ]}
          data={dayRecords}
          keyExtractor={(r) => r.id}
        />
      </Card>

      {/* RECORD EXPENSE MODAL */}
      <Modal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        title="Record Petty Counter Expense"
        subtitle="Deduct routine shop expense from counter cash drawer"
        maxWidth="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsExpenseModalOpen(false)}>Cancel</Button>
            <Button variant="primary" isLoading={isSubmitting} onClick={handleAddExpense}>Save Expense</Button>
          </>
        }
      >
        <form className="space-y-4">
          <Select
            label="Category"
            value={expenseCategory}
            onChange={(e) => setExpenseCategory(e.target.value)}
            options={[
              { value: 'tea_snacks', label: 'Tea & Snacks / Refreshments' },
              { value: 'cleaning', label: 'Cleaning & Sanitation Supplies' },
              { value: 'courier', label: 'Medicine Courier & Parcel Delivery' },
              { value: 'stationery', label: 'POS Paper Rolls & Stationery' },
              { value: 'other', label: 'Other Operational Expense' },
            ]}
          />
          <Input
            type="number"
            label="Amount (₹)"
            step="0.01"
            value={expenseAmount}
            onChange={(e) => setExpenseAmount(parseFloat(e.target.value) || 0)}
            required
          />
          <Input
            label="Paid To (Payee)"
            placeholder="e.g. Shyam Tea Stall"
            value={expensePayee}
            onChange={(e) => setExpensePayee(e.target.value)}
          />
          <Input
            label="Notes"
            placeholder="Optional remarks..."
            value={expenseNotes}
            onChange={(e) => setExpenseNotes(e.target.value)}
          />
        </form>
      </Modal>

      {/* CLOSE DAY MODAL */}
      <Modal
        isOpen={isCloseModalOpen}
        onClose={() => setIsCloseModalOpen(false)}
        title="Daily Shift Close & Cash Tally"
        subtitle="Count physical cash in the drawer and record final shift close"
        maxWidth="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsCloseModalOpen(false)}>Cancel</Button>
            <Button variant="primary" isLoading={isSubmitting} onClick={handleCloseDay}>Submit Day Close</Button>
          </>
        }
      >
        <form className="space-y-4">
          <div className="p-3 bg-cream-100 rounded-md border border-charcoal-200 text-xs space-y-1">
            <div className="flex justify-between font-medium text-charcoal-700">
              <span>System Expected Cash:</span>
              <span className="font-bold font-mono text-charcoal-900">{formatCurrency(todaySummary?.cash_collected || 0)}</span>
            </div>
            <div className="flex justify-between font-medium text-charcoal-700">
              <span>Petty Expenses Deducted:</span>
              <span className="font-bold font-mono text-charcoal-900">-{formatCurrency(totalExpensesToday)}</span>
            </div>
            <div className="flex justify-between font-bold text-brand-700 border-t border-charcoal-200 pt-1">
              <span>Target Drawer Balance:</span>
              <span className="font-mono">{formatCurrency((todaySummary?.cash_collected || 0) - totalExpensesToday)}</span>
            </div>
          </div>

          <Input
            type="number"
            label="Physical Cash in Drawer (₹)"
            step="0.01"
            placeholder="Count actual currency notes & coins"
            value={actualCash}
            onChange={(e) => setActualCash(parseFloat(e.target.value) || 0)}
            required
          />

          {actualCash > 0 && (
            <div className="p-2.5 rounded bg-cream-50 border border-charcoal-200 text-xs flex justify-between items-center font-bold">
              <span>Drawer Variance:</span>
              <span
                className={`font-mono text-sm ${
                  Math.abs(actualCash - ((todaySummary?.cash_collected || 0) - totalExpensesToday)) < 0.05
                    ? 'text-emerald-700'
                    : actualCash > ((todaySummary?.cash_collected || 0) - totalExpensesToday)
                    ? 'text-blue-700'
                    : 'text-rose-700'
                }`}
              >
                {Math.abs(actualCash - ((todaySummary?.cash_collected || 0) - totalExpensesToday)) < 0.05
                  ? '0.00 (Exact Match)'
                  : actualCash > ((todaySummary?.cash_collected || 0) - totalExpensesToday)
                  ? `+₹${(actualCash - ((todaySummary?.cash_collected || 0) - totalExpensesToday)).toFixed(2)} (Excess)`
                  : `-₹${Math.abs(actualCash - ((todaySummary?.cash_collected || 0) - totalExpensesToday)).toFixed(2)} (Shortage)`}
              </span>
            </div>
          )}

          <Input
            label="Closing Notes / Remarks"
            placeholder="e.g. Evening shift hand-over clean"
            value={closeNotes}
            onChange={(e) => setCloseNotes(e.target.value)}
          />
        </form>
      </Modal>
    </div>
  );
};
export default DayClose;
