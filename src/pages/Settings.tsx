
import React, { useState, useEffect } from 'react';
import { repositories } from '@/data/repositories';
import { Counter } from '@/types';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Badge } from '@/components/common/Badge';
import { Select } from '@/components/common/Select';
import { Switch } from '@/components/common/Switch';
import { Modal } from '@/components/common/Modal';
import { validateGstin } from '@/core';
import { useBarcodeScanner } from '@/context/BarcodeScannerContext';
import { useBranding } from '@/context/BrandingContext';
import { BrandLogo } from '@/components/common/BrandLogo';
import {
  Settings as SettingsIcon,
  Check,
  Save,
  Plus,
  Monitor,
  Trash2,
  Upload,
  Image as ImageIcon,
  X
} from 'lucide-react';

export const Settings: React.FC = () => {
  const {
    beepEnabled,
    setBeepEnabled,
    interKeyThresholdMs,
    setInterKeyThresholdMs
  } = useBarcodeScanner();

  const { logoUrl, updateLogo, isSavingLogo } = useBranding();
  const [logoStatus, setLogoStatus] = useState<{ text: string; isError?: boolean } | null>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoStatus(null);

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setLogoStatus({ text: 'Please upload a PNG, JPG, SVG, or WebP image file.', isError: true });
      return;
    }

    if (file.size > 512 * 1024) {
      setLogoStatus({ text: 'Logo file size must be 512 KB or smaller.', isError: true });
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const result = typeof reader.result === 'string' ? reader.result : null;
        if (!result) throw new Error('Failed to read image file');
        await updateLogo(result);
        setLogoStatus({ text: 'Bajrang Pharmacy logo updated and saved.' });
      } catch (err: any) {
        setLogoStatus({ text: err?.message || 'Failed to save logo', isError: true });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveLogo = async () => {
    setLogoStatus(null);
    try {
      await updateLogo(null);
      setLogoStatus({ text: 'Custom logo removed. Using default BP monogram.' });
    } catch (err: any) {
      setLogoStatus({ text: err?.message || 'Failed to remove logo', isError: true });
    }
  };

  // ==========================================
  // DEVELOPER-CONTROLLED BUSINESS CONFIGURATION
  // Change these values ONLY from source code.
  // Business identity fields are locked in UI.
  // ==========================================

  const name = 'Bajrang Pharmacy';
  const legalName = 'Bajrang Pharmacy Retail LLP';
  const gstin = '09CMVPM3439A1ZS';
  const pan = 'CMVPM3439A';
  const phone = '+91 9455008480';
  const email = 'bajrangpharma80@gmail.com';
  const address = 'Ambedkar Nagar Chainpur Chauraha, Uttar Pradesh';
  const drugLicense = ' ';
  const bankUpi = ' ';

  // ==========================================
  // PRINTER PREFERENCES
  // ==========================================

  const [defaultFormat, setDefaultFormat] = useState('thermal_80mm');

  const [footerNote, setFooterNote] = useState(
    'Thank you for trusting Bajrang Pharmacy. Prescribed medicines cannot be returned without original prescription.'
  );

  const [isSaved, setIsSaved] = useState(false);
  const [isCacheCleared, setIsCacheCleared] = useState(false);

  const handleClearLocalCache = () => {
    try {
      if (typeof localStorage !== 'undefined') {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('pharmadesk_') || key.includes('cart') || key.includes('held'))) {
            if (!key.startsWith('sb-') && key !== 'pharmadesk_auth_user') {
              keysToRemove.push(key);
            }
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
      }
      setIsCacheCleared(true);
      setTimeout(() => setIsCacheCleared(false), 3000);
    } catch (e) {
      console.error('Failed to clear cache:', e);
    }
  };

  // ==========================================
  // COUNTER MANAGEMENT
  // ==========================================

  const [counters, setCounters] = useState<Counter[]>([]);
  const [isCounterModalOpen, setIsCounterModalOpen] = useState(false);
  const [counterCode, setCounterCode] = useState('');
  const [counterName, setCounterName] = useState('');

  // ==========================================
  // LOAD COUNTERS ONLY
  // Business details are never loaded from DB.
  // ==========================================

  const loadData = async () => {
    try {
      const cntrs = await repositories.business.getCounters();
      setCounters(cntrs);
    } catch (e) {
      console.error('Failed to load counters:', e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // ==========================================
  // SAVE FIXED BUSINESS CONFIGURATION
  // ==========================================

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await repositories.business.updateBusiness({
        name,
        legal_name: legalName,
        gstin,
        pan,
        phone,
        email,
        address,
        drug_license: drugLicense,
      });

      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);

    } catch (err: any) {
      alert(err.message || 'Save failed');
    }
  };

  // ==========================================
  // ADD BILLING COUNTER
  // ==========================================

  const handleAddCounter = async () => {
    if (!counterCode.trim() || !counterName.trim()) {
      alert('Please enter both Counter Code and Counter Name.');
      return;
    }

    try {
      await repositories.business.createCounter({
        branch_id: 'c0000000-0000-0000-0000-000000000001',
        counter_code: counterCode.toUpperCase().trim(),
        counter_name: counterName.trim(),
        invoice_prefix: 'LKO1',
        current_sequence: 1,
        is_active: true,
      });

      setIsCounterModalOpen(false);
      setCounterCode('');
      setCounterName('');

      await loadData();

    } catch (err: any) {
      alert(err.message || 'Failed to add counter');
    }
  };

  const gstinStatus = validateGstin(gstin);

  return (
    <div className="page-container space-y-6">

      {/* PAGE HEADER */}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-charcoal-200">

        <div>
          <h1 className="text-xl font-bold text-charcoal-900 tracking-tight flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-brand-600" />
            System & Business Configuration
          </h1>

          <p className="text-xs text-charcoal-500 mt-0.5">
            Manage Bajrang Pharmacy entity profile, Drug License numbers (Form 20/21), Indian GST rules, and hardware POS preferences.
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

        {/* =====================================
            ADMIN LOGO UPLOAD & BRANDING
        ====================================== */}

        <Card title="Bajrang Pharmacy Logo & Branding">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <BrandLogo size="lg" />
              <div>
                <h4 className="text-sm font-bold text-charcoal-900">
                  Official Pharmacy Logo
                </h4>
                <p className="text-xs text-charcoal-500 mt-0.5 max-w-md">
                  Upload Bajrang Pharmacy&apos;s official logo (PNG, JPG, SVG, or WebP, max 512 KB). It appears across the login portal, navigation header, tax invoices, and patient consultation slips.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <label className="cursor-pointer">
                <span className="inline-flex items-center justify-center font-medium transition-colors bg-charcoal-900 text-white hover:bg-charcoal-800 rounded-md text-xs px-3.5 h-9 gap-1.5 shadow-xs">
                  <Upload className="w-3.5 h-3.5" />
                  {isSavingLogo ? 'Saving...' : logoUrl ? 'Replace Logo' : 'Upload Logo'}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={handleLogoUpload}
                  className="hidden"
                  disabled={isSavingLogo}
                />
              </label>

              {logoUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  leftIcon={<X className="w-3.5 h-3.5 text-rose-600" />}
                  onClick={handleRemoveLogo}
                  disabled={isSavingLogo}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>

          {logoStatus && (
            <div
              className={`mt-3 p-2.5 rounded text-xs font-medium flex items-center gap-2 ${
                logoStatus.isError
                  ? 'bg-rose-50 text-rose-800 border border-rose-200'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
            >
              <ImageIcon className="w-4 h-4 shrink-0" />
              <span>{logoStatus.text}</span>
            </div>
          )}
        </Card>

        {/* =====================================
            LOCKED BUSINESS IDENTITY
            Developer can change values in code.
            UI editing is disabled.
        ====================================== */}

        <Card title="Pharmacy Enterprise Identity (Uttar Pradesh)">

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            <Input
              label="Business Trade Name"
              value={name}
              disabled
            />

            <Input
              label="Legal Registered Name"
              value={legalName}
              disabled
            />

            <div>
              <Input
                label="GSTIN (Goods & Services Tax No.)"
                value={gstin}
                disabled
                helperText={
                  gstinStatus.isValid
                    ? `State: ${gstinStatus.stateName} (Intra-state CGST+SGST)`
                    : gstinStatus.error
                }
                className="font-mono uppercase font-bold"
              />
            </div>

            <Input
              label="PAN (Derived from GSTIN)"
              value={pan}
              disabled
              className="font-mono uppercase font-bold"
            />

            <Input
              label="Drug Licence Numbers (Form 20 / Form 21)"
              value={drugLicense}
              disabled
              helperText="Clearly marked Form 20/21 Drug Licence No."
            />

            <Input
              label="Counter UPI ID (QR Code Payment)"
              value={bankUpi}
              disabled
              helperText="Printed on receipts for customer UPI scanning"
            />

            <Input
              label="Phone Number"
              value={phone}
              disabled
            />

            <Input
              label="Email Address"
              value={email}
              disabled
            />

          </div>

          <div className="mt-4">

            <Input
              label="Registered Shop / Dispensary Address"
              value={address}
              disabled
            />

          </div>

          <p className="text-[11px] text-charcoal-500 mt-3">
            Business identity details are developer-controlled and cannot be modified from this panel.
          </p>

        </Card>

        {/* =====================================
            REGISTERED BILLING COUNTERS
        ====================================== */}

        <Card
          title="Registered Multi-Counter Terminals"
          action={
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setIsCounterModalOpen(true)}
            >
              Register Counter
            </Button>
          }
        >

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

            {counters.length === 0 && (
              <p className="text-sm text-charcoal-500 col-span-full">
                No billing counters registered yet.
              </p>
            )}

            {counters.map((cntr) => (
              <div
                key={cntr.id}
                className="p-3 border border-charcoal-200 rounded-lg bg-cream-50/50 flex items-center justify-between"
              >

                <div className="flex items-center gap-2.5">

                  <Monitor className="w-5 h-5 text-brand-600" />

                  <div>
                    <span className="font-bold text-xs text-charcoal-900 block">
                      {cntr.counter_name}
                    </span>

                    <span className="font-mono text-[10px] text-charcoal-500">
                      Code: {cntr.counter_code} | Seq: #{cntr.current_sequence}
                    </span>
                  </div>

                </div>

                <Badge
                  variant={cntr.is_active ? 'success' : 'neutral'}
                  size="sm"
                >
                  {cntr.is_active ? 'ACTIVE' : 'OFFLINE'}
                </Badge>

              </div>
            ))}

          </div>

        </Card>

        {/* =====================================
            BARCODE SCANNER PREFERENCES
        ====================================== */}

        <Card title="Hardware Barcode Scanner Preferences">

          <div className="space-y-4">

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <Input
                type="number"
                label="Inter-Key Latency Threshold (ms)"
                value={interKeyThresholdMs}
                onChange={(e) =>
                  setInterKeyThresholdMs(
                    parseInt(e.target.value, 10) || 35
                  )
                }
                helperText="<35 ms avg between chars distinguishes scanner from human keyboard"
              />

              <div className="flex flex-col justify-center">

                <Switch
                  label="Audio Beep on Scan"
                  description="Emits clean POS terminal tone upon barcode detection"
                  checked={beepEnabled}
                  onChange={setBeepEnabled}
                />

              </div>

            </div>

          </div>

        </Card>

        {/* =====================================
            RECEIPT & INVOICE PREFERENCES
        ====================================== */}

        <Card title="POS Receipt & Invoice Preferences">

          <div className="space-y-4">

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <Select
                label="Default Output Format"
                value={defaultFormat}
                onChange={(e) => setDefaultFormat(e.target.value)}
                options={[
                  {
                    value: 'thermal_80mm',
                    label: '80mm Thermal Receipt (Standard Counter)'
                  },
                  {
                    value: 'thermal_58mm',
                    label: '58mm Thermal Roll (Mini POS)'
                  },
                  {
                    value: 'a4',
                    label: 'A4 GST Tax Invoice (Full Sheet)'
                  },
                ]}
              />

            </div>

            <Input
              label="Invoice Footer Note"
              value={footerNote}
              onChange={(e) => setFooterNote(e.target.value)}
              helperText="Printed on bottom of every issued tax receipt"
            />

          </div>

        </Card>

        {/* =====================================
            TERMINAL CACHE & CLEAN HANDOVER
        ====================================== */}

        <Card title="Terminal Cache & Local Clean-Slate">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-lg bg-cream-50 border border-charcoal-200">
            <div>
              <h4 className="text-sm font-bold text-charcoal-900">
                Reset Local Browser & Offline Storage
              </h4>
              <p className="text-xs text-charcoal-600 mt-1 max-w-xl">
                Clears all locally cached demo datasets, held POS carts, and terminal temporary records on this machine. Does not delete remote Supabase database tables or log out your active session.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<Trash2 className="w-4 h-4 text-red-600" />}
              className="border-red-200 text-red-700 hover:bg-red-50 flex-shrink-0"
              onClick={handleClearLocalCache}
            >
              {isCacheCleared ? 'Cache Purged!' : 'Purge Local Cache'}
            </Button>
          </div>
        </Card>

        {/* SAVE BUTTON */}

        <div className="flex justify-end pt-2">

          <Button
            type="submit"
            variant="primary"
            size="lg"
            leftIcon={<Save className="w-5 h-5" />}
          >
            Save All Configurations
          </Button>

        </div>

      </form>

      {/* =====================================
          REGISTER COUNTER MODAL
      ====================================== */}

      <Modal
        isOpen={isCounterModalOpen}
        onClose={() => setIsCounterModalOpen(false)}
        title="Register Billing Counter PC"
        subtitle="Assign counter code for gap-free offline-safe series (e.g. C1, C2)"
        maxWidth="sm"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setIsCounterModalOpen(false)}
            >
              Cancel
            </Button>

            <Button
              variant="primary"
              onClick={handleAddCounter}
            >
              Register
            </Button>
          </>
        }
      >

        <div className="space-y-3">

          <Input
            label="Counter Code (e.g. C1, C2, C3)"
            placeholder="C2"
            value={counterCode}
            onChange={(e) => setCounterCode(e.target.value)}
            required
          />

          <Input
            label="Counter Name"
            placeholder="e.g. Counter 2 (Express Checkout)"
            value={counterName}
            onChange={(e) => setCounterName(e.target.value)}
            required
          />

        </div>

      </Modal>

    </div>
  );
};

export default Settings;
