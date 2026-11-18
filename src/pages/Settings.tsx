import React, { useState } from 'react';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Badge } from '@/components/common/Badge';
import { localDb } from '@/services/storage';
import { 
  Settings as SettingsIcon, 
  Printer, 
  Building2, 
  Barcode, 
  Check, 
  Save 
} from 'lucide-react';

export const Settings: React.FC = () => {
  const currentBusiness = localDb.getBusiness();

  const [name, setName] = useState(currentBusiness.name);
  const [legalName, setLegalName] = useState(currentBusiness.legal_name || '');
  const [gstin, setGstin] = useState(currentBusiness.gstin || '');
  const [pan, setPan] = useState(currentBusiness.pan || '');
  const [phone, setPhone] = useState(currentBusiness.phone || '');
  const [email, setEmail] = useState(currentBusiness.email || '');
  const [address, setAddress] = useState(currentBusiness.address || '');

  // Printer Preferences
  const [defaultFormat, setDefaultFormat] = useState('thermal_80mm');
  const [footerNote, setFooterNote] = useState('Thank you for trusting PharmaDesk. Prescribed medicines cannot be returned without original prescription.');
  const [beepEnabled, setBeepEnabled] = useState(true);
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    localDb.updateBusiness({
      name,
      legal_name: legalName,
      gstin,
      pan,
      phone,
      email,
      address,
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-charcoal-200">
        <div>
          <h1 className="text-xl font-bold text-charcoal-900 tracking-tight flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-brand-600" />
            System & Business Configuration
          </h1>
          <p className="text-xs text-charcoal-500 mt-0.5">
            Manage enterprise entity details, Indian GST rules, and hardware POS preferences.
          </p>
        </div>

        {isSaved && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-md font-semibold">
            <Check className="w-4 h-4 text-emerald-600" />
            Configuration Saved!
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Business Identity */}
        <Card className="p-5 bg-white space-y-4">
          <h3 className="text-xs font-bold text-charcoal-700 uppercase tracking-wider flex items-center gap-2">
            <Building2 className="w-4 h-4 text-brand-600" />
            Pharmacy Enterprise Identity
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Business Trade Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              label="Legal Corporate Name"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Central GSTIN"
              value={gstin}
              onChange={(e) => setGstin(e.target.value)}
            />
            <Input
              label="Permanent Account Number (PAN)"
              value={pan}
              onChange={(e) => setPan(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Corporate Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Input
              label="Official Contact Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <Input
            label="Corporate Registered Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-charcoal-100 text-xs text-charcoal-600">
            <div>
              <span className="font-semibold text-charcoal-800">System Currency:</span> Indian Rupee (INR ₹)
            </div>
            <div>
              <span className="font-semibold text-charcoal-800">Timezone:</span> Asia/Kolkata (+05:30)
            </div>
          </div>
        </Card>

        {/* POS Hardware & Printer Setup */}
        <Card className="p-5 bg-white space-y-4">
          <h3 className="text-xs font-bold text-charcoal-700 uppercase tracking-wider flex items-center gap-2">
            <Printer className="w-4 h-4 text-brand-600" />
            POS Terminal & Invoice Printing
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-charcoal-700 uppercase tracking-wider mb-1">
                Default Printer Output Format
              </label>
              <select
                value={defaultFormat}
                onChange={(e) => setDefaultFormat(e.target.value)}
                className="w-full text-xs font-medium border border-charcoal-200 rounded-md py-2 px-3 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
              >
                <option value="thermal_80mm">80mm Thermal Receipt (Standard POS)</option>
                <option value="thermal_58mm">58mm Thermal Receipt (Compact POS)</option>
                <option value="a4">A4 Full Page Standard Tax Invoice</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-charcoal-700 uppercase tracking-wider mb-1">
                Barcode Scanner Feedback
              </label>
              <label className="flex items-center gap-2 mt-2 cursor-pointer text-xs font-medium text-charcoal-800">
                <input
                  type="checkbox"
                  checked={beepEnabled}
                  onChange={(e) => setBeepEnabled(e.target.checked)}
                  className="rounded text-brand-500 focus:ring-brand-400"
                />
                Play crisp audio tone on successful barcode scan
              </label>
            </div>
          </div>

          <Input
            label="Invoice Receipt Footer Disclaimer Note"
            value={footerNote}
            onChange={(e) => setFooterNote(e.target.value)}
          />
        </Card>

        <div className="flex justify-end">
          <Button type="submit" variant="primary" size="md">
            <Save className="w-4 h-4 mr-2" />
            Save Business Configuration
          </Button>
        </div>
      </form>
    </div>
  );
};
