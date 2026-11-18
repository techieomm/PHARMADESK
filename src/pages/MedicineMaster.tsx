import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { medicineService } from '@/services/api';
import { Medicine } from '@/types';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Badge } from '@/components/common/Badge';
import { Modal } from '@/components/common/Modal';
import { EmptyState } from '@/components/common/EmptyState';
import { formatCurrency } from '@/utils/formatters';
import { exportToExcel } from '@/utils/exporter';
import { 
  Plus, 
  Search, 
  Pill, 
  FileSpreadsheet, 
  Edit2, 
  Check, 
  X, 
  Barcode, 
  Upload
} from 'lucide-react';
import * as XLSX from 'xlsx';

export const MedicineMaster: React.FC = () => {
  const { user } = useAuth();
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDosage, setSelectedDosage] = useState<string>('all');

  // Add / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMedicine, setEditingMedicine] = useState<Medicine | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    brand_name: '',
    generic_name: '',
    composition: '',
    strength: '',
    dosage_form: 'Tablet',
    manufacturer: '',
    barcode: '',
    packaging_label: '10 tablets per strip',
    pieces_per_strip: 10,
    mrp: 0,
    strip_selling_price: 0,
    piece_selling_price: 0,
    purchase_cost: 0,
    gst_rate: 12,
    hsn_code: '3004',
    min_stock_alert: 20,
    is_active: true,
  });

  const loadMedicines = async () => {
    setIsLoading(true);
    try {
      const data = await medicineService.getMedicines();
      setMedicines(data);
    } catch (e) {
      console.error('Failed to load medicines:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMedicines();
  }, []);

  const openCreateModal = () => {
    setEditingMedicine(null);
    setFormData({
      brand_name: '',
      generic_name: '',
      composition: '',
      strength: '',
      dosage_form: 'Tablet',
      manufacturer: '',
      barcode: '',
      packaging_label: '10 tablets per strip',
      pieces_per_strip: 10,
      mrp: 0,
      strip_selling_price: 0,
      piece_selling_price: 0,
      purchase_cost: 0,
      gst_rate: 12,
      hsn_code: '3004',
      min_stock_alert: 20,
      is_active: true,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (med: Medicine) => {
    setEditingMedicine(med);
    setFormData({
      brand_name: med.brand_name,
      generic_name: med.generic_name,
      composition: med.composition || '',
      strength: med.strength || '',
      dosage_form: med.dosage_form,
      manufacturer: med.manufacturer,
      barcode: med.barcode || '',
      packaging_label: med.packaging_label,
      pieces_per_strip: med.pieces_per_strip,
      mrp: med.mrp,
      strip_selling_price: med.strip_selling_price,
      piece_selling_price: med.piece_selling_price,
      purchase_cost: med.purchase_cost || 0,
      gst_rate: med.gst_rate,
      hsn_code: med.hsn_code || '3004',
      min_stock_alert: med.min_stock_alert,
      is_active: med.is_active,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  // Auto calculate piece price when strip price changes
  const handleStripPriceChange = (val: number) => {
    const pps = Math.max(1, formData.pieces_per_strip || 10);
    const suggestedPiece = Number((val / pps).toFixed(2));
    setFormData(prev => ({
      ...prev,
      strip_selling_price: val,
      piece_selling_price: suggestedPiece,
    }));
  };

  const handleSaveMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.brand_name.trim()) {
      setFormError('Brand name is required');
      return;
    }
    if (!formData.generic_name.trim()) {
      setFormError('Generic name is required');
      return;
    }
    if (formData.pieces_per_strip <= 0) {
      setFormError('Pieces per strip must be at least 1');
      return;
    }

    setIsSaving(true);
    try {
      if (editingMedicine) {
        await medicineService.updateMedicine(editingMedicine.id, formData);
      } else {
        await medicineService.createMedicine(formData);
      }
      setIsModalOpen(false);
      await loadMedicines();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save medicine');
    } finally {
      setIsSaving(false);
    }
  };

  // CSV / Excel Import
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json<any>(ws);

        if (data && data.length > 0) {
          let importedCount = 0;
          for (const row of data) {
            const brand = row['Brand Name'] || row['brand_name'] || row['Name'];
            const generic = row['Generic Name'] || row['generic_name'] || 'Generic';
            if (brand) {
              await medicineService.createMedicine({
                brand_name: String(brand).trim(),
                generic_name: String(generic).trim(),
                composition: row['Composition'] || '',
                strength: row['Strength'] || '',
                dosage_form: row['Dosage Form'] || 'Tablet',
                manufacturer: row['Manufacturer'] || 'Standard Labs',
                barcode: row['Barcode'] ? String(row['Barcode']).trim() : undefined,
                packaging_label: row['Packaging'] || '10 tablets per strip',
                pieces_per_strip: Number(row['Pieces Per Strip']) || 10,
                mrp: Number(row['MRP']) || 50,
                strip_selling_price: Number(row['Strip Price']) || 45,
                piece_selling_price: Number(row['Piece Price']) || 4.5,
                gst_rate: Number(row['GST Rate']) || 12,
                min_stock_alert: 20,
                is_active: true,
              });
              importedCount++;
            }
          }
          alert(`Successfully imported ${importedCount} medicines into master catalog.`);
          await loadMedicines();
        }
      } catch (err: any) {
        alert('Failed to parse file: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  // Export
  const handleExport = () => {
    const exportData = filteredMedicines.map(m => ({
      'Barcode': m.barcode || '',
      'Brand Name': m.brand_name,
      'Generic Name': m.generic_name,
      'Dosage Form': m.dosage_form,
      'Strength': m.strength || '',
      'Manufacturer': m.manufacturer,
      'Pieces Per Strip': m.pieces_per_strip,
      'MRP (₹)': m.mrp,
      'Strip Selling Price (₹)': m.strip_selling_price,
      'Piece Selling Price (₹)': m.piece_selling_price,
      'GST Rate (%)': m.gst_rate,
      'Active': m.is_active ? 'Yes' : 'No',
    }));
    exportToExcel(exportData, 'PharmaDesk_Medicine_Catalog', 'Medicines');
  };

  // Filter medicines
  const filteredMedicines = medicines.filter(m => {
    if (selectedDosage !== 'all' && m.dosage_form.toLowerCase() !== selectedDosage.toLowerCase()) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        m.brand_name.toLowerCase().includes(q) ||
        m.generic_name.toLowerCase().includes(q) ||
        (m.composition && m.composition.toLowerCase().includes(q)) ||
        (m.manufacturer && m.manufacturer.toLowerCase().includes(q)) ||
        (m.barcode && m.barcode.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-charcoal-200">
        <div>
          <h1 className="text-xl font-bold text-charcoal-900 tracking-tight">Medicine Master Catalog</h1>
          <p className="text-xs text-charcoal-500 mt-0.5">
            Centralized pharmaceutical master with dual-unit prices, barcode mapping & GST tax rates.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="cursor-pointer">
            <span className="inline-flex items-center justify-center font-medium transition-colors bg-white text-charcoal-800 border border-charcoal-200 hover:bg-cream-50 rounded-md text-xs px-2.5 py-1.5 gap-1.5 shadow-xs">
              <Upload className="w-3.5 h-3.5 text-charcoal-500" />
              Import CSV
            </span>
            <input type="file" accept=".csv, .xlsx, .xls" onChange={handleImportFile} className="hidden" />
          </label>

          <Button variant="outline" size="sm" onClick={handleExport}>
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-emerald-700" />
            Export
          </Button>

          <Button variant="primary" size="sm" onClick={openCreateModal}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Medicine
          </Button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <Card className="p-4 bg-white">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Input
              placeholder="Search by Brand Name, Generic Composition, Barcode, Manufacturer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search className="w-4 h-4" />}
            />
          </div>

          <div>
            <select
              value={selectedDosage}
              onChange={(e) => setSelectedDosage(e.target.value)}
              className="w-full text-xs font-medium border border-charcoal-200 rounded-md py-2 px-3 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
            >
              <option value="all">All Dosage Forms</option>
              <option value="Tablet">Tablet</option>
              <option value="Capsule">Capsule</option>
              <option value="Syrup">Syrup</option>
              <option value="Injection">Injection</option>
              <option value="Ointment">Ointment / Cream</option>
              <option value="Drops">Drops</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="bg-white overflow-hidden" noPadding>
        {isLoading ? (
          <div className="py-12 text-center text-xs text-charcoal-500">Loading catalog...</div>
        ) : filteredMedicines.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Pill className="w-6 h-6" />}
              title="No medicines found in catalog"
              description="The centralized medicine master is empty or no items match your search. Add medicines or import a CSV catalog."
              actionLabel="Add First Medicine"
              onAction={openCreateModal}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-charcoal-200 bg-cream-50 text-charcoal-600 font-semibold uppercase text-[11px]">
                  <th className="py-2.5 px-4">Brand / Generic</th>
                  <th className="py-2.5 px-3">Form & Strength</th>
                  <th className="py-2.5 px-3">Manufacturer</th>
                  <th className="py-2.5 px-3 font-mono">Barcode</th>
                  <th className="py-2.5 px-3">Strip Pack</th>
                  <th className="py-2.5 px-3 text-right">MRP</th>
                  <th className="py-2.5 px-3 text-right">Strip Price</th>
                  <th className="py-2.5 px-3 text-right">Piece Price</th>
                  <th className="py-2.5 px-3 text-center">GST</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal-100">
                {filteredMedicines.map((med) => (
                  <tr key={med.id} className="hover:bg-cream-50/50 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-bold text-charcoal-900 block text-sm">{med.brand_name}</span>
                      <span className="text-[11px] text-charcoal-500">{med.generic_name}</span>
                    </td>

                    <td className="py-3 px-3">
                      <Badge variant="neutral" className="text-[10px] py-0 mr-1.5 font-medium">
                        {med.dosage_form}
                      </Badge>
                      <span className="text-charcoal-700">{med.strength || '-'}</span>
                    </td>

                    <td className="py-3 px-3 text-charcoal-700">
                      {med.manufacturer}
                    </td>

                    <td className="py-3 px-3 font-mono text-[11px] text-charcoal-600">
                      {med.barcode || <span className="text-gray-300">-</span>}
                    </td>

                    <td className="py-3 px-3 text-charcoal-700">
                      {med.pieces_per_strip} pcs/strip
                    </td>

                    <td className="py-3 px-3 text-right font-medium text-charcoal-700">
                      {formatCurrency(med.mrp)}
                    </td>

                    <td className="py-3 px-3 text-right font-bold text-charcoal-900">
                      {formatCurrency(med.strip_selling_price)}
                    </td>

                    <td className="py-3 px-3 text-right font-bold text-brand-600">
                      {formatCurrency(med.piece_selling_price)}
                    </td>

                    <td className="py-3 px-3 text-center font-semibold text-charcoal-700">
                      {med.gst_rate}%
                    </td>

                    <td className="py-3 px-3 text-center">
                      <Badge variant={med.is_active ? 'success' : 'neutral'} className="text-[10px]">
                        {med.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>

                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => openEditModal(med)}
                        className="p-1.5 text-charcoal-600 hover:text-brand-600 hover:bg-cream-100 rounded"
                        title="Edit medicine details"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add / Edit Medicine Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingMedicine ? `Edit Medicine — ${editingMedicine.brand_name}` : 'Add New Medicine to Master'}
        maxWidth="xl"
      >
        <form onSubmit={handleSaveMedicine} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Brand Name *"
              placeholder="e.g. Dolo 650"
              value={formData.brand_name}
              onChange={(e) => setFormData({ ...formData, brand_name: e.target.value })}
              required
            />
            <Input
              label="Generic Name *"
              placeholder="e.g. Paracetamol"
              value={formData.generic_name}
              onChange={(e) => setFormData({ ...formData, generic_name: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-charcoal-700 uppercase tracking-wider mb-1">
                Dosage Form *
              </label>
              <select
                value={formData.dosage_form}
                onChange={(e) => setFormData({ ...formData, dosage_form: e.target.value })}
                className="w-full text-xs font-medium border border-charcoal-200 rounded-md py-2 px-3 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
              >
                <option value="Tablet">Tablet</option>
                <option value="Capsule">Capsule</option>
                <option value="Syrup">Syrup</option>
                <option value="Injection">Injection</option>
                <option value="Ointment">Ointment / Cream</option>
                <option value="Drops">Drops</option>
                <option value="Inhaler">Inhaler</option>
              </select>
            </div>

            <Input
              label="Strength"
              placeholder="e.g. 650 mg / 500 mg"
              value={formData.strength}
              onChange={(e) => setFormData({ ...formData, strength: e.target.value })}
            />

            <Input
              label="Manufacturer *"
              placeholder="e.g. Micro Labs Ltd."
              value={formData.manufacturer}
              onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Barcode / GTIN / EAN-13"
              placeholder="Scan or enter 1D/2D barcode"
              value={formData.barcode}
              onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
              leftIcon={<Barcode className="w-4 h-4" />}
            />
            <Input
              label="Packaging Label"
              placeholder="e.g. 15 tablets per strip"
              value={formData.packaging_label}
              onChange={(e) => setFormData({ ...formData, packaging_label: e.target.value })}
            />
          </div>

          {/* DUAL UNIT & PRICING SECTION */}
          <div className="p-3.5 bg-cream-50 rounded-md border border-charcoal-200 space-y-3">
            <span className="text-xs font-bold text-charcoal-800 uppercase tracking-wider block">
              Dual-Unit Configuration & Selling Prices
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Input
                label="Pieces per Strip *"
                type="number"
                min="1"
                value={formData.pieces_per_strip}
                onChange={(e) => setFormData({ ...formData, pieces_per_strip: parseInt(e.target.value, 10) || 1 })}
                required
              />

              <Input
                label="Maximum Retail Price (₹) *"
                type="number"
                step="0.01"
                min="0"
                value={formData.mrp}
                onChange={(e) => setFormData({ ...formData, mrp: parseFloat(e.target.value) || 0 })}
                required
              />

              <Input
                label="Strip Selling Price (₹) *"
                type="number"
                step="0.01"
                min="0"
                value={formData.strip_selling_price}
                onChange={(e) => handleStripPriceChange(parseFloat(e.target.value) || 0)}
                required
              />

              <Input
                label="Piece Selling Price (₹) *"
                type="number"
                step="0.01"
                min="0"
                value={formData.piece_selling_price}
                onChange={(e) => setFormData({ ...formData, piece_selling_price: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div>
                <label className="block text-xs font-semibold text-charcoal-700 uppercase tracking-wider mb-1">
                  GST Rate (%) *
                </label>
                <select
                  value={formData.gst_rate}
                  onChange={(e) => setFormData({ ...formData, gst_rate: parseFloat(e.target.value) })}
                  className="w-full text-xs font-medium border border-charcoal-200 rounded-md py-2 px-3 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
                >
                  <option value={0}>0% (Exempt)</option>
                  <option value={5}>5%</option>
                  <option value={12}>12% (Standard Medicines)</option>
                  <option value={18}>18%</option>
                  <option value={28}>28%</option>
                </select>
              </div>

              <Input
                label="HSN Code"
                value={formData.hsn_code}
                onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value })}
              />

              <Input
                label="Low Stock Alert (in pieces)"
                type="number"
                min="0"
                value={formData.min_stock_alert}
                onChange={(e) => setFormData({ ...formData, min_stock_alert: parseInt(e.target.value, 10) || 0 })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-charcoal-100">
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSaving}>
              {editingMedicine ? 'Update Medicine' : 'Save to Catalog'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
