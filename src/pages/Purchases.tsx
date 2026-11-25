import React, { useState, useEffect } from 'react';
import { repositories } from '@/data/repositories';
import { PurchaseInvoice, Supplier, Medicine } from '@/types';
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
  Drawer,
  FormField,
} from '@/components/common';
import { Plus, ShoppingCart, RefreshCw, Eye } from 'lucide-react';
import { formatCurrency, formatDate } from '@/utils/formatters';

export const Purchases: React.FC = () => {
  const { selectedBranchId } = useBranch();
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isEntryDrawerOpen, setIsEntryDrawerOpen] = useState<boolean>(false);
  const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoice | null>(null);

  // Form State for Purchase Entry
  const [supplierId, setSupplierId] = useState<string>('');
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedMedId, setSelectedMedId] = useState<string>('');
  const [batchNumber, setBatchNumber] = useState<string>('');
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(10);
  const [freeQuantity, setFreeQuantity] = useState<number>(0);
  const [purchaseRate, setPurchaseRate] = useState<number>(0);
  const [mrp, setMrp] = useState<number>(0);
  const [gstRate, setGstRate] = useState<number>(12);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [invList, suppList, medList] = await Promise.all([
        repositories.purchases.getPurchaseInvoices(selectedBranchId),
        repositories.suppliers.getSuppliers(),
        repositories.medicines.getMedicines(),
      ]);
      setInvoices(invList);
      setSuppliers(suppList);
      setMedicines(medList);
      if (suppList.length > 0) setSupplierId(suppList[0].id);
      if (medList.length > 0) {
        setSelectedMedId(medList[0].id);
        setMrp(medList[0].mrp);
        setPurchaseRate(medList[0].purchase_cost || Math.round(medList[0].mrp * 0.7));
        setGstRate(medList[0].gst_rate || 12);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedBranchId]);

  const handleMedChange = (medId: string) => {
    setSelectedMedId(medId);
    const med = medicines.find((m) => m.id === medId);
    if (med) {
      setMrp(med.mrp);
      setPurchaseRate(med.purchase_cost || Math.round(med.mrp * 0.7));
      setGstRate(med.gst_rate || 12);
    }
  };

  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId || !invoiceNumber || !selectedMedId || !batchNumber || !expiryDate) {
      alert('Please fill all mandatory fields (Supplier, Bill No, Medicine, Batch, Expiry)');
      return;
    }

    setIsSubmitting(true);
    try {
      const branchId = selectedBranchId && selectedBranchId !== 'all' 
        ? selectedBranchId 
        : 'c0000000-0000-0000-0000-000000000001';

      await repositories.purchases.createPurchaseInvoice({
        branchId,
        supplierId,
        supplierInvoiceNumber: invoiceNumber,
        invoiceDate,
        items: [
          {
            medicine_id: selectedMedId,
            batch_number: batchNumber,
            expiry_date: expiryDate,
            quantity_units: quantity,
            pieces_per_unit: 10,
            free_quantity_units: freeQuantity,
            purchase_rate: purchaseRate,
            mrp,
            gst_rate: gstRate,
            discount_percent: 0,
          },
        ],
      });

      setIsEntryDrawerOpen(false);
      setInvoiceNumber('');
      setBatchNumber('');
      setExpiryDate('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Purchase entry failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-container space-y-6">
      <PageHeader
        title="Purchase Invoices & Inward Stock"
        subtitle="Record vendor purchases, verify batch numbers, expiry dates, purchase rates, and update inventory automatically."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="md" leftIcon={<RefreshCw className="w-4 h-4" />} onClick={loadData}>
              Refresh
            </Button>
            <Button variant="primary" size="md" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setIsEntryDrawerOpen(true)}>
              New Purchase Entry
            </Button>
          </div>
        }
      />

      {/* Purchase Invoices List */}
      <Card title="Recent Purchase Invoices">
        <Table
          columns={[
            {
              key: 'supplier_invoice_number',
              header: 'Bill Number',
              render: (row) => <span className="font-mono font-bold text-charcoal-900">{row.supplier_invoice_number}</span>,
            },
            {
              key: 'supplier',
              header: 'Supplier / Distributor',
              render: (row) => <span className="font-semibold text-charcoal-800">{row.supplier?.name || 'Awadh Pharma Distributors'}</span>,
            },
            {
              key: 'invoice_date',
              header: 'Date',
              render: (row) => <span className="text-xs text-charcoal-600">{formatDate(row.invoice_date)}</span>,
            },
            {
              key: 'subtotal_taxable',
              header: 'Taxable',
              align: 'right',
              render: (row) => <span className="font-mono text-xs">{formatCurrency(row.subtotal_taxable)}</span>,
            },
            {
              key: 'total_gst',
              header: 'GST',
              align: 'right',
              render: (row) => <span className="font-mono text-xs">{formatCurrency(row.total_gst)}</span>,
            },
            {
              key: 'total_amount',
              header: 'Total Amount',
              align: 'right',
              render: (row) => <span className="font-bold text-charcoal-900">{formatCurrency(row.total_amount)}</span>,
            },
            {
              key: 'payment_status',
              header: 'Status',
              render: (row) => (
                <Badge variant={row.payment_status === 'paid' ? 'success' : 'warning'}>
                  {row.payment_status.toUpperCase()}
                </Badge>
              ),
            },
            {
              key: 'actions',
              header: 'Actions',
              align: 'right',
              render: (row) => (
                <Button size="sm" variant="ghost" leftIcon={<Eye className="w-4 h-4" />} onClick={() => setSelectedInvoice(row)}>
                  View
                </Button>
              ),
            },
          ]}
          data={invoices}
          keyExtractor={(r) => r.id}
        />
      </Card>

      {/* NEW PURCHASE ENTRY DRAWER */}
      <Drawer
        isOpen={isEntryDrawerOpen}
        onClose={() => setIsEntryDrawerOpen(false)}
        title="Inward Purchase Entry"
        subtitle="Add incoming batch stock and record purchase ledger"
        width="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsEntryDrawerOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" isLoading={isSubmitting} onClick={handleCreatePurchase}>
              Save Purchase Entry
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Supplier"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
            />
            <Input
              label="Supplier Bill No"
              placeholder="e.g. INV-9042"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              type="date"
              label="Invoice Date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
            <Select
              label="Medicine"
              value={selectedMedId}
              onChange={(e) => handleMedChange(e.target.value)}
              options={medicines.map((m) => ({ value: m.id, label: `${m.brand_name} (${m.dosage_form})` }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Batch Number"
              placeholder="e.g. BT26K04"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              required
            />
            <Input
              type="date"
              label="Expiry Date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Input
              type="number"
              label="Billed Qty (Strips)"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
            />
            <Input
              type="number"
              label="Free Qty (Scheme)"
              min="0"
              value={freeQuantity}
              onChange={(e) => setFreeQuantity(parseInt(e.target.value, 10) || 0)}
            />
            <Input
              type="number"
              label="Purchase Rate (₹/strip)"
              step="0.01"
              value={purchaseRate}
              onChange={(e) => setPurchaseRate(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              type="number"
              label="Retail MRP (₹/strip)"
              step="0.01"
              value={mrp}
              onChange={(e) => setMrp(parseFloat(e.target.value) || 0)}
            />
            <Select
              label="GST Rate"
              value={gstRate}
              onChange={(e) => setGstRate(parseFloat(e.target.value))}
              options={[
                { value: 0, label: '0% (Exempt)' },
                { value: 5, label: '5%' },
                { value: 12, label: '12% (Standard Pharma)' },
                { value: 18, label: '18%' },
              ]}
            />
          </div>

          {/* Quick Calculations Preview */}
          <div className="p-3 bg-cream-100 rounded-lg text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-charcoal-600">Total Pieces Added to Stock:</span>
              <span className="font-bold text-charcoal-900">{(quantity + freeQuantity) * 10} pieces</span>
            </div>
            <div className="flex justify-between">
              <span className="text-charcoal-600">Taxable Amount:</span>
              <span className="font-mono text-charcoal-900">{formatCurrency(quantity * purchaseRate)}</span>
            </div>
            <div className="flex justify-between font-bold border-t border-charcoal-200 pt-1">
              <span>Estimated Bill Total:</span>
              <span className="font-mono text-brand-600">{formatCurrency((quantity * purchaseRate) * (1 + gstRate / 100))}</span>
            </div>
          </div>
        </form>
      </Drawer>

      {/* VIEW INVOICE MODAL */}
      <Modal
        isOpen={Boolean(selectedInvoice)}
        onClose={() => setSelectedInvoice(null)}
        title={`Purchase Bill #${selectedInvoice?.supplier_invoice_number}`}
        subtitle={`Supplier: ${selectedInvoice?.supplier?.name || 'Distributor'}`}
        footer={<Button onClick={() => setSelectedInvoice(null)}>Close</Button>}
      >
        <div className="space-y-3 text-sm">
          <div className="flex justify-between py-1 border-b">
            <span className="text-charcoal-500">Bill Date:</span>
            <span className="font-medium">{selectedInvoice?.invoice_date}</span>
          </div>
          <div className="flex justify-between py-1 border-b">
            <span className="text-charcoal-500">Taxable Amount:</span>
            <span className="font-mono">{formatCurrency(selectedInvoice?.subtotal_taxable || 0)}</span>
          </div>
          <div className="flex justify-between py-1 border-b">
            <span className="text-charcoal-500">Total GST:</span>
            <span className="font-mono">{formatCurrency(selectedInvoice?.total_gst || 0)}</span>
          </div>
          <div className="flex justify-between py-1 border-b text-base font-bold">
            <span>Grand Total:</span>
            <span className="font-mono text-brand-600">{formatCurrency(selectedInvoice?.total_amount || 0)}</span>
          </div>
        </div>
      </Modal>
    </div>
  );
};
export default Purchases;
