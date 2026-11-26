import React, { useState } from 'react';
import {
  Button,
  IconButton,
  Input,
  Select,
  Textarea,
  DatePicker,
  Checkbox,
  Switch,
  Card,
  StatCard,
  Modal,
  Drawer,
  Table,
  Tabs,
  Badge,
  EmptyState,
  Skeleton,
  FormField,
  PageHeader,
  Toolbar,
} from '@/components/common';
import { 
  Search, 
  Plus, 
  Trash2, 
  Settings, 
  Edit, 
  Download, 
  Calendar, 
  Boxes, 
  IndianRupee, 
  TrendingUp, 
  CheckCircle, 
  AlertTriangle 
} from 'lucide-react';

export const UiKit: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSize, setModalSize] = useState<'sm' | 'md' | 'lg' | 'xl'>('md');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [switchChecked, setSwitchChecked] = useState(true);
  const [checkboxChecked, setCheckboxChecked] = useState(true);
  const [activeTab, setActiveTab] = useState('pill1');
  const [activeUnderlineTab, setActiveUnderlineTab] = useState('tab1');
  const [density, setDensity] = useState<'compact' | 'normal'>('normal');

  const demoTableData = [
    { id: '1', name: 'Paracetamol 650mg', batch: 'BT2026A', stock: '240 pcs', mrp: '₹32.50', schedule: 'otc' as const },
    { id: '2', name: 'Amoxicillin + Clav 625', batch: 'BT2026B', stock: '45 pcs', mrp: '₹145.00', schedule: 'schedule_h' as const },
    { id: '3', name: 'Alprazolam 0.5mg', batch: 'BT2026C', stock: '12 pcs', mrp: '₹55.00', schedule: 'schedule_h1' as const },
  ];

  return (
    <div className="page-container space-y-8">
      <PageHeader
        title="Bajrang Pharmacy Design Tokens & Shared Component Kit"
        subtitle="Live verification of uniform spacing, control heights (h-8 compact, h-10 standard, h-12 large), typography, and accessible interactive states."
        badge={<Badge variant="brand">UI Kit v2.0</Badge>}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="md" leftIcon={<Download className="w-4 h-4" />}>
              Export Spec
            </Button>
            <Button variant="primary" size="md" leftIcon={<Plus className="w-4 h-4" />}>
              Add Component
            </Button>
          </div>
        }
      />

      {/* 1. BUTTONS & ICON BUTTONS */}
      <Card title="1. Buttons & Control Heights (Strict h-8, h-10, h-12)">
        <div className="space-y-6">
          <div>
            <h4 className="text-xs font-bold text-charcoal-500 uppercase tracking-wider mb-3">Sizes: Compact (h-8 / 32px), Standard (h-10 / 40px), Large (h-12 / 48px)</h4>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Button SM (h-8)</Button>
              <Button size="md">Button MD (h-10)</Button>
              <Button size="lg">Button LG (h-12)</Button>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-charcoal-500 uppercase tracking-wider mb-3">Variants (Standard h-10)</h4>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" leftIcon={<Plus className="w-4 h-4" />}>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="danger" leftIcon={<Trash2 className="w-4 h-4" />}>Danger</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="primary" isLoading>Loading State</Button>
              <Button variant="outline" disabled>Disabled</Button>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-charcoal-500 uppercase tracking-wider mb-3">Icon Buttons</h4>
            <div className="flex items-center gap-3">
              <IconButton size="sm" variant="outline" aria-label="Settings"><Settings className="w-4 h-4" /></IconButton>
              <IconButton size="md" variant="outline" aria-label="Settings"><Settings className="w-4 h-4" /></IconButton>
              <IconButton size="lg" variant="primary" aria-label="Add"><Plus className="w-5 h-5" /></IconButton>
              <IconButton size="md" variant="danger" aria-label="Delete"><Trash2 className="w-4 h-4" /></IconButton>
              <IconButton size="md" variant="ghost" aria-label="Edit"><Edit className="w-4 h-4" /></IconButton>
            </div>
          </div>
        </div>
      </Card>

      {/* 2. FORM INPUTS & SELECTS */}
      <Card title="2. Form Controls & Equal Height FormField Alignments">
        <div className="space-y-6">
          <div>
            <h4 className="text-xs font-bold text-charcoal-500 uppercase tracking-wider mb-3">Control Heights Comparison</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input size="sm" label="Compact Input (h-8)" placeholder="Compact height (32px)" />
              <Input size="md" label="Standard Input (h-10)" placeholder="Standard height (40px)" />
              <Input size="lg" label="Large Input (h-12 / POS)" placeholder="Large height (48px)" />
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-charcoal-500 uppercase tracking-wider mb-3">Inputs with Icons & Validations</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Search Medicine"
                placeholder="Scan barcode or type..."
                leftIcon={<Search className="w-4 h-4" />}
                helperText="F1 shortcut supported"
              />
              <Input
                label="GSTIN Number"
                placeholder="09CMVPM3439A1ZS"
                defaultValue="09CMVPM3439A1ZS"
                helperText="Uttar Pradesh (09) Intra-state"
              />
              <Input
                label="Invalid Entry Example"
                defaultValue="Wrong Value"
                error="Batch number format invalid"
              />
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-charcoal-500 uppercase tracking-wider mb-3">Selects, DatePicker, Textarea</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select
                label="Dosage Form"
                options={[
                  { value: 'tab', label: 'Tablet (Strip)' },
                  { value: 'cap', label: 'Capsule (Strip)' },
                  { value: 'syr', label: 'Syrup (Bottle)' },
                ]}
              />
              <DatePicker label="Expiry Date" defaultValue="2027-12-31" />
              <div className="flex flex-col gap-3 justify-center pt-2">
                <Checkbox
                  label="Requires Doctor Prescription"
                  description="Mandatory for Schedule H/H1/X drugs"
                  checked={checkboxChecked}
                  onChange={(e) => setCheckboxChecked(e.target.checked)}
                />
                <Switch
                  label="Allow Negative Stock"
                  description="Off by default for online billing"
                  checked={switchChecked}
                  onChange={setSwitchChecked}
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 3. STAT CARDS */}
      <Card title="3. Stat Cards (Equal Height, Uniform Alignment)">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Today's Revenue"
            value="₹48,250"
            subtext="From 64 completed bills"
            variant="brand"
            icon={<IndianRupee className="w-5 h-5" />}
            trend={{ value: '14.2%', isPositive: true }}
          />
          <StatCard
            label="Active Batches"
            value="1,420"
            subtext="Across 620 medicines"
            variant="default"
            icon={<Boxes className="w-5 h-5" />}
          />
          <StatCard
            label="Near-Expiry (<90d)"
            value="18"
            subtext="Action required"
            variant="warning"
            icon={<AlertTriangle className="w-5 h-5" />}
          />
          <StatCard
            label="Verified Prescriptions"
            value="32"
            subtext="Schedule H/H1 register logged"
            variant="success"
            icon={<CheckCircle className="w-5 h-5" />}
          />
        </div>
      </Card>

      {/* 4. DRUG SCHEDULE REGULATORY BADGES */}
      <Card title="4. Indian Pharmacy Regulatory Badges">
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge variant="otc" dot>OTC Item</Badge>
          <Badge variant="schedule_h" dot>Schedule H (Rx Required)</Badge>
          <Badge variant="schedule_h1" dot>Schedule H1 (Register Entry)</Badge>
          <Badge variant="schedule_x" dot>Schedule X (Special Storage)</Badge>
          <Badge variant="narcotic" dot>Narcotic (NDPS Strict)</Badge>
          <Badge variant="success">Paid</Badge>
          <Badge variant="warning">Low Stock</Badge>
          <Badge variant="danger">Expired</Badge>
          <Badge variant="info">Inter-State (IGST)</Badge>
        </div>
      </Card>

      {/* 5. TABS & TABLE WITH DENSITY */}
      <Card
        title="5. Data Table (Sticky Header, Zebra, Density Controls)"
        action={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={density === 'compact' ? 'secondary' : 'outline'}
              onClick={() => setDensity('compact')}
            >
              Compact
            </Button>
            <Button
              size="sm"
              variant={density === 'normal' ? 'secondary' : 'outline'}
              onClick={() => setDensity('normal')}
            >
              Normal
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Tabs
            tabs={[
              { id: 'pill1', label: 'All Batches', badge: 3 },
              { id: 'pill2', label: 'Near Expiry', badge: 1 },
              { id: 'pill3', label: 'Out of Stock' },
            ]}
            activeTab={activeTab}
            onChange={setActiveTab}
          />

          <Table
            density={density}
            zebra
            columns={[
              { key: 'name', header: 'Medicine Name' },
              { key: 'batch', header: 'Batch No' },
              { key: 'stock', header: 'Available' },
              { key: 'mrp', header: 'MRP', align: 'right' },
              {
                key: 'schedule',
                header: 'Schedule',
                render: (row) => <Badge variant={row.schedule}>{row.schedule.toUpperCase()}</Badge>,
              },
            ]}
            data={demoTableData}
            keyExtractor={(r) => r.id}
          />
        </div>
      </Card>

      {/* 6. MODALS & DRAWERS */}
      <Card title="6. Dialogs: Modals & Slide-Over Drawers">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => { setModalSize('md'); setModalOpen(true); }}>
            Open Standard Modal (md)
          </Button>
          <Button variant="outline" onClick={() => { setModalSize('xl'); setModalOpen(true); }}>
            Open Large Modal (xl)
          </Button>
          <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
            Open Side Drawer
          </Button>
        </div>
      </Card>

      {/* MODAL DEMO */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth={modalSize}
        title="Sample Pharmacy Modal Dialog"
        subtitle="Sticky header and sticky actions footer with scrollable body"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => setModalOpen(false)}>
              Save Changes
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm text-charcoal-700">
          <p>
            Modals have fixed width presets, scrollable body area, and sticky action buttons at the bottom.
          </p>
          <Input label="Supplier Name" placeholder="e.g. Lucknow Pharma Distributors" />
          <Input label="GSTIN" placeholder="09AABCL1234F1Z5" />
          <Textarea label="Notes & Terms" placeholder="Net 30 days payment cycle..." />
        </div>
      </Modal>

      {/* DRAWER DEMO */}
      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Quick Add Medicine Drawer"
        subtitle="Triggered upon scanning unknown barcode"
        footer={
          <>
            <Button variant="outline" onClick={() => setDrawerOpen(false)}>
              Discard
            </Button>
            <Button variant="primary" onClick={() => setDrawerOpen(false)}>
              Save & Add to Bill
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Scanned Barcode" defaultValue="8901234567890" disabled />
          <Input label="Brand Name" placeholder="e.g. Dolo 650 Tablet" />
          <Input label="Generic Name" placeholder="e.g. Paracetamol" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="MRP (₹)" placeholder="32.50" />
            <Input label="Selling Price (₹)" placeholder="30.00" />
          </div>
          <Select
            label="Drug Schedule"
            options={[
              { value: 'otc', label: 'OTC (Over The Counter)' },
              { value: 'schedule_h', label: 'Schedule H' },
              { value: 'schedule_h1', label: 'Schedule H1' },
            ]}
          />
        </div>
      </Drawer>
    </div>
  );
};
export default UiKit;
