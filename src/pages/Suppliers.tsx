import React, { useState, useEffect } from 'react';
import { repositories } from '@/data/repositories';
import { Supplier, SupplierLedgerEntry } from '@/types';
import {
  PageHeader,
  Card,
  Table,
  Badge,
  Button,
  Input,
  Modal,
  Drawer,
  Select,
} from '@/components/common';
import { Plus, Truck, IndianRupee, RefreshCw, FileText } from 'lucide-react';
import { formatCurrency, formatDate } from '@/utils/formatters';

export const Suppliers: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<SupplierLedgerEntry[]>([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);

  // New Supplier Form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [gstin, setGstin] = useState('');
  const [dl20, setDl20] = useState('');
  const [address, setAddress] = useState('');
  const [paymentDays, setPaymentDays] = useState(30);

  // Payment Form
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>('bank_transfer');
  const [paymentRef, setPaymentRef] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await repositories.suppliers.getSuppliers();
      setSuppliers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenLedger = async (supp: Supplier) => {
    setSelectedSupplier(supp);
    try {
      const entries = await repositories.suppliers.getSupplierLedger(supp.id);
      setLedgerEntries(entries);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) {
      alert('Name and phone are required');
      return;
    }

    setIsSubmitting(true);
    try {
      await repositories.suppliers.createSupplier({
        name,
        phone,
        gstin,
        dl_number_20: dl20,
        address,
        payment_terms_days: paymentDays,
        opening_balance: 0,
        current_balance: 0,
        is_active: true,
      });
      setIsAddModalOpen(false);
      setName('');
      setPhone('');
      setGstin('');
      setDl20('');
      setAddress('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to create supplier');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier || paymentAmount <= 0) return;

    setIsSubmitting(true);
    try {
      await repositories.suppliers.recordSupplierPayment({
        supplierId: selectedSupplier.id,
        amount: paymentAmount,
        paymentMethod,
        reference: paymentRef,
      });
      setIsPaymentModalOpen(false);
      setPaymentAmount(0);
      setPaymentRef('');
      await loadData();
      if (selectedSupplier) {
        const entries = await repositories.suppliers.getSupplierLedger(selectedSupplier.id);
        setLedgerEntries(entries);
      }
    } catch (err: any) {
      alert(err.message || 'Payment recording failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-container space-y-6">
      <PageHeader
        title="Suppliers & Distributor Ledgers"
        subtitle="Manage pharmaceutical vendors, drug licenses (Form 20/21), credit terms, and purchase payout balances."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="md" leftIcon={<RefreshCw className="w-4 h-4" />} onClick={loadData}>
              Refresh
            </Button>
            <Button variant="primary" size="md" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setIsAddModalOpen(true)}>
              Add Supplier
            </Button>
          </div>
        }
      />

      <Card title="Registered Medicine Distributors">
        <Table
          columns={[
            {
              key: 'name',
              header: 'Supplier Name',
              render: (row) => (
                <div>
                  <span className="font-bold text-charcoal-900 block">{row.name}</span>
                  <span className="text-xs text-charcoal-500">{row.address || 'Lucknow, UP'}</span>
                </div>
              ),
            },
            {
              key: 'phone',
              header: 'Contact',
              render: (row) => <span className="font-mono text-xs">{row.phone}</span>,
            },
            {
              key: 'gstin',
              header: 'GSTIN',
              render: (row) => <span className="font-mono text-xs">{row.gstin || 'Unregistered'}</span>,
            },
            {
              key: 'payment_terms_days',
              header: 'Credit Terms',
              render: (row) => <Badge variant="neutral">{row.payment_terms_days} Days</Badge>,
            },
            {
              key: 'current_balance',
              header: 'Payable Due',
              align: 'right',
              render: (row) => (
                <span className={`font-mono font-bold ${row.current_balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {formatCurrency(row.current_balance)}
                </span>
              ),
            },
            {
              key: 'actions',
              header: 'Actions',
              align: 'right',
              render: (row) => (
                <div className="flex items-center justify-end gap-2">
                  <Button size="sm" variant="outline" leftIcon={<FileText className="w-3.5 h-3.5" />} onClick={() => handleOpenLedger(row)}>
                    Ledger
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    leftIcon={<IndianRupee className="w-3.5 h-3.5" />}
                    onClick={() => {
                      setSelectedSupplier(row);
                      setPaymentAmount(row.current_balance > 0 ? row.current_balance : 0);
                      setIsPaymentModalOpen(true);
                    }}
                  >
                    Pay
                  </Button>
                </div>
              ),
            },
          ]}
          data={suppliers}
          keyExtractor={(r) => r.id}
        />
      </Card>

      {/* ADD SUPPLIER MODAL */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Medicine Distributor"
        subtitle="Record vendor details, GSTIN, and Drug License Form 20/21"
        maxWidth="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
            <Button variant="primary" isLoading={isSubmitting} onClick={handleCreateSupplier}>Save Supplier</Button>
          </>
        }
      >
        <form className="space-y-4">
          <Input label="Supplier Trade Name" placeholder="e.g. Awadh Pharma Distributors" value={name} onChange={(e) => setName(e.target.value)} required />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Phone Number" placeholder="+91 522 220 8910" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            <Input label="GSTIN" placeholder="09AABCA1234F1Z1" value={gstin} onChange={(e) => setGstin(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Drug License (Form 20B/21B)" placeholder="UP-LKO-20B-XXXX" value={dl20} onChange={(e) => setDl20(e.target.value)} />
            <Input type="number" label="Credit Terms (Days)" value={paymentDays} onChange={(e) => setPaymentDays(parseInt(e.target.value, 10) || 30)} />
          </div>
          <Input label="Address" placeholder="Market address, Lucknow, UP" value={address} onChange={(e) => setAddress(e.target.value)} />
        </form>
      </Modal>

      {/* SUPPLIER LEDGER DRAWER */}
      <Drawer
        isOpen={Boolean(selectedSupplier) && !isPaymentModalOpen}
        onClose={() => setSelectedSupplier(null)}
        title={`${selectedSupplier?.name} — Statement of Account`}
        subtitle={`Current Payable Balance: ${formatCurrency(selectedSupplier?.current_balance || 0)}`}
        width="lg"
        footer={<Button onClick={() => setSelectedSupplier(null)}>Close</Button>}
      >
        <div className="space-y-4">
          <div className="flex justify-between items-center p-3 bg-cream-100 rounded-lg text-xs">
            <span><strong>GSTIN:</strong> {selectedSupplier?.gstin || 'Unregistered'}</span>
            <span><strong>Phone:</strong> {selectedSupplier?.phone}</span>
          </div>

          <Table
            columns={[
              {
                key: 'created_at',
                header: 'Date',
                render: (row) => <span className="text-xs text-charcoal-600">{formatDate(row.created_at)}</span>,
              },
              {
                key: 'entry_type',
                header: 'Type',
                render: (row) => <Badge variant={row.entry_type === 'purchase' ? 'brand' : 'success'}>{row.entry_type.toUpperCase()}</Badge>,
              },
              {
                key: 'credit_amount',
                header: 'Billed (Cr)',
                align: 'right',
                render: (row) => <span className="font-mono text-xs">{row.credit_amount > 0 ? formatCurrency(row.credit_amount) : '—'}</span>,
              },
              {
                key: 'debit_amount',
                header: 'Paid (Dr)',
                align: 'right',
                render: (row) => <span className="font-mono text-xs text-emerald-600">{row.debit_amount > 0 ? formatCurrency(row.debit_amount) : '—'}</span>,
              },
              {
                key: 'balance_after',
                header: 'Balance',
                align: 'right',
                render: (row) => <span className="font-mono font-bold text-xs">{formatCurrency(row.balance_after)}</span>,
              },
            ]}
            data={ledgerEntries}
            keyExtractor={(r) => r.id}
          />
        </div>
      </Drawer>

      {/* RECORD PAYMENT MODAL */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title={`Record Payment to ${selectedSupplier?.name}`}
        subtitle="Disburse vendor payment and record in ledger"
        maxWidth="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsPaymentModalOpen(false)}>Cancel</Button>
            <Button variant="primary" isLoading={isSubmitting} onClick={handleRecordPayment}>Record Payment</Button>
          </>
        }
      >
        <form className="space-y-4">
          <Input
            type="number"
            label="Payment Amount (₹)"
            step="0.01"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
            required
          />
          <Select
            label="Payment Method"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            options={[
              { value: 'bank_transfer', label: 'NEFT / RTGS / IMPS Bank Transfer' },
              { value: 'upi', label: 'UPI / QR Payment' },
              { value: 'cheque', label: 'Cheque' },
              { value: 'cash', label: 'Cash' },
            ]}
          />
          <Input
            label="Transaction Reference / UTR"
            placeholder="e.g. UTR-904128549"
            value={paymentRef}
            onChange={(e) => setPaymentRef(e.target.value)}
          />
        </form>
      </Modal>
    </div>
  );
};
export default Suppliers;
