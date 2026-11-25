import React, { useState, useEffect } from 'react';
import { repositories } from '@/data/repositories';
import { Customer, CustomerLedgerEntry } from '@/types';
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
import { Plus, Users, IndianRupee, RefreshCw, FileText, Phone, Award } from 'lucide-react';
import { formatCurrency, formatDate } from '@/utils/formatters';

export const Customers: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<CustomerLedgerEntry[]>([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);

  // New Customer Form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [creditLimit, setCreditLimit] = useState<number>(5000);

  // Payment Collection Form
  const [collectionAmount, setCollectionAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [paymentRef, setPaymentRef] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await repositories.customers.getCustomers();
      setCustomers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenLedger = async (cust: Customer) => {
    setSelectedCustomer(cust);
    try {
      const entries = await repositories.customers.getCustomerLedger(cust.id);
      setLedgerEntries(entries);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Customer name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const parsedAge = age.trim() ? parseInt(age.trim(), 10) : undefined;
      await repositories.customers.createCustomer({
        name: name.trim(),
        phone: phone.trim() || undefined,
        age: parsedAge && !isNaN(parsedAge) ? parsedAge : undefined,
        address: address.trim() || undefined,
        gstin: gstin.trim() || undefined,
        credit_limit: creditLimit,
        outstanding_balance: 0,
        loyalty_points: 0,
        is_active: true,
      });
      setIsAddModalOpen(false);
      setName('');
      setPhone('');
      setAge('');
      setAddress('');
      setGstin('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Customer creation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || collectionAmount <= 0) return;

    setIsSubmitting(true);
    try {
      await repositories.customers.recordCustomerPayment({
        customerId: selectedCustomer.id,
        amount: collectionAmount,
        paymentMethod,
        reference: paymentRef,
        notes: `Udhaar collection from ${selectedCustomer.name}`,
      });
      setIsPaymentModalOpen(false);
      setCollectionAmount(0);
      setPaymentRef('');
      await loadData();
      if (selectedCustomer) {
        const entries = await repositories.customers.getCustomerLedger(selectedCustomer.id);
        setLedgerEntries(entries);
      }
    } catch (err: any) {
      alert(err.message || 'Payment collection failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-container space-y-6">
      <PageHeader
        title="Customers & Credit (Udhaar) Ledger"
        subtitle="Track customer credit accounts, collect outstanding dues, manage loyalty rewards, and review chronic refill histories."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="md" leftIcon={<RefreshCw className="w-4 h-4" />} onClick={loadData}>
              Refresh
            </Button>
            <Button variant="primary" size="md" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setIsAddModalOpen(true)}>
              Quick Add Customer
            </Button>
          </div>
        }
      />

      <Card title="Customer Accounts & Due Balances">
        <Table
          columns={[
            {
              key: 'name',
              header: 'Customer Name',
              render: (row) => (
                <div>
                  <span className="font-bold text-charcoal-900 block">{row.name}</span>
                  <div className="flex items-center gap-2 text-xs text-charcoal-500">
                    {row.age ? <span className="font-medium text-brand-700 bg-brand-50 px-1.5 py-0.2 rounded border border-brand-200">Age: {row.age} yrs</span> : null}
                    {row.address ? <span>{row.address}</span> : <span className="text-charcoal-400">Lucknow, UP</span>}
                  </div>
                </div>
              ),
            },
            {
              key: 'phone',
              header: 'Phone Number',
              render: (row) => (
                <div className="flex items-center gap-1.5 font-mono text-xs">
                  <Phone className="w-3.5 h-3.5 text-charcoal-400" />
                  <span>{row.phone || <span className="text-charcoal-400 italic">Optional</span>}</span>
                </div>
              ),
            },
            {
              key: 'credit_limit',
              header: 'Credit Limit',
              align: 'right',
              render: (row) => <span className="font-mono text-xs">{formatCurrency(row.credit_limit)}</span>,
            },
            {
              key: 'outstanding_balance',
              header: 'Udhaar Due',
              align: 'right',
              render: (row) => (
                <span className={`font-mono font-bold ${row.outstanding_balance > 0 ? 'text-rose-600' : 'text-charcoal-700'}`}>
                  {formatCurrency(row.outstanding_balance)}
                </span>
              ),
            },
            {
              key: 'loyalty_points',
              header: 'Points',
              render: (row) => (
                <Badge variant="brand" size="sm">
                  <Award className="w-3 h-3 mr-1 inline" />
                  {row.loyalty_points} pts
                </Badge>
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
                    disabled={row.outstanding_balance <= 0}
                    leftIcon={<IndianRupee className="w-3.5 h-3.5" />}
                    onClick={() => {
                      setSelectedCustomer(row);
                      setCollectionAmount(row.outstanding_balance);
                      setIsPaymentModalOpen(true);
                    }}
                  >
                    Collect
                  </Button>
                </div>
              ),
            },
          ]}
          data={customers}
          keyExtractor={(r) => r.id}
        />
      </Card>

      {/* QUICK ADD CUSTOMER MODAL */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Customer Profile"
        subtitle="Create customer account with credit limit and phone number"
        maxWidth="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
            <Button variant="primary" isLoading={isSubmitting} onClick={handleCreateCustomer}>Save Customer</Button>
          </>
        }
      >
        <form className="space-y-4">
          <Input label="Customer Full Name *" placeholder="e.g. Ramesh Chandra" value={name} onChange={(e) => setName(e.target.value)} required />
          <div className="grid grid-cols-3 gap-3">
            <Input label="Phone (Optional)" placeholder="10-digit mobile" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Input type="number" label="Age (Years)" placeholder="e.g. 45" value={age} onChange={(e) => setAge(e.target.value)} />
            <Input type="number" label="Credit Limit (₹)" value={creditLimit} onChange={(e) => setCreditLimit(parseFloat(e.target.value) || 0)} />
          </div>
          <Input label="Customer GSTIN (Optional B2B)" placeholder="09XXXXX..." value={gstin} onChange={(e) => setGstin(e.target.value)} />
          <Input label="Address / Colony (Optional)" placeholder="e.g. Alambagh, Lucknow" value={address} onChange={(e) => setAddress(e.target.value)} />
        </form>
      </Modal>

      {/* CUSTOMER LEDGER DRAWER */}
      <Drawer
        isOpen={Boolean(selectedCustomer) && !isPaymentModalOpen}
        onClose={() => setSelectedCustomer(null)}
        title={`${selectedCustomer?.name} — Udhaar Statement`}
        subtitle={`Current Due: ${formatCurrency(selectedCustomer?.outstanding_balance || 0)} | Credit Limit: ${formatCurrency(selectedCustomer?.credit_limit || 0)}`}
        width="lg"
        footer={<Button onClick={() => setSelectedCustomer(null)}>Close</Button>}
      >
        <div className="space-y-4">
          <div className="flex justify-between items-center p-3 bg-cream-100 rounded-lg text-xs">
            <span><strong>Phone:</strong> {selectedCustomer?.phone}</span>
            <span><strong>Loyalty Points:</strong> {selectedCustomer?.loyalty_points}</span>
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
                render: (row) => <Badge variant={row.entry_type === 'sale_credit' ? 'warning' : 'success'}>{row.entry_type.replace('_', ' ').toUpperCase()}</Badge>,
              },
              {
                key: 'debit_amount',
                header: 'Bill Due (Dr)',
                align: 'right',
                render: (row) => <span className="font-mono text-xs text-rose-600">{row.debit_amount > 0 ? formatCurrency(row.debit_amount) : '—'}</span>,
              },
              {
                key: 'credit_amount',
                header: 'Paid (Cr)',
                align: 'right',
                render: (row) => <span className="font-mono text-xs text-emerald-600">{row.credit_amount > 0 ? formatCurrency(row.credit_amount) : '—'}</span>,
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

      {/* COLLECT PAYMENT MODAL */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title={`Collect Udhaar Payment — ${selectedCustomer?.name}`}
        subtitle={`Outstanding balance: ${formatCurrency(selectedCustomer?.outstanding_balance || 0)}`}
        maxWidth="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsPaymentModalOpen(false)}>Cancel</Button>
            <Button variant="primary" isLoading={isSubmitting} onClick={handleRecordCollection}>Collect Payment</Button>
          </>
        }
      >
        <form className="space-y-4">
          <Input
            type="number"
            label="Collection Amount (₹)"
            step="0.01"
            value={collectionAmount}
            onChange={(e) => setCollectionAmount(parseFloat(e.target.value) || 0)}
            required
          />
          <Select
            label="Payment Mode"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            options={[
              { value: 'cash', label: 'Cash at Counter' },
              { value: 'upi', label: 'UPI / QR Code Scan' },
              { value: 'card', label: 'Credit / Debit Card' },
            ]}
          />
          <Input
            label="UPI Ref / Cheque No"
            placeholder="e.g. UPI-349018471"
            value={paymentRef}
            onChange={(e) => setPaymentRef(e.target.value)}
          />
        </form>
      </Modal>
    </div>
  );
};
export default Customers;
