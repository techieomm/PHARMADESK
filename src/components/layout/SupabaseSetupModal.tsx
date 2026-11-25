import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { isSupabaseConfigured, getSupabaseProjectRef } from '@/lib/supabase';
import { runHealthCheck, HealthCheckResult } from '@/lib/healthCheck';
import { Check, Copy, Database, ShieldAlert, ExternalLink, Terminal, Activity, AlertCircle, CheckCircle2 } from 'lucide-react';

interface SupabaseSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupabaseSetupModal: React.FC<SupabaseSetupModalProps> = ({ isOpen, onClose }) => {
  const isConnected = isSupabaseConfigured();
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [healthStatus, setHealthStatus] = useState<HealthCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const migrations = [
    { num: 'ALL', file: 'supabase/all_migrations.sql', desc: 'Single Consolidated File (001-009 in order for 1-click execution)' },
    { num: '001', file: 'supabase/migrations/001_initial_schema.sql', desc: 'Core schema, businesses, branches, catalog, and base RLS' },
    { num: '002', file: 'supabase/migrations/002_domain_schema.sql', desc: 'Batches, FEFO, drug schedules, H1 register, and ledgers' },
    { num: '003', file: 'supabase/migrations/003_rpcs.sql', desc: 'Atomic billing RPC, day close, returns, purchases, and GSTR-1' },
    { num: '004', file: 'supabase/migrations/004_seed_bajrang_pharmacy.sql', desc: 'Bajrang Pharmacy Lucknow branches, counters, and seed stock' },
    { num: '005', file: 'supabase/migrations/005_auth_lookup_and_bootstrap.sql', desc: 'lookup_employee_email RPC + Master Admin bootstrap template' },
    { num: '006', file: 'supabase/migrations/006_fix_login_profiles_rls.sql', desc: 'Fix RLS infinite recursion + guard trigger for profiles' },
    { num: '008', file: 'supabase/migrations/008_employee_id_case_insensitive.sql', desc: 'Case-insensitive employee ID + lower() unique index & lookup' },
    { num: '009', file: 'supabase/migrations/009_complete_password_change.sql', desc: 'complete_password_change RPC for first login setup' },
  ];

  const handleHealthCheck = async () => {
    setIsChecking(true);
    try {
      const res = await runHealthCheck();
      setHealthStatus(res);
    } catch {
      // ignore
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    if (isOpen && isConnected) {
      handleHealthCheck();
    }
  }, [isOpen, isConnected]);

  const copyPath = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Supabase Database Configuration & Migration Guide"
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button
            variant="outline"
            size="sm"
            onClick={handleHealthCheck}
            isLoading={isChecking}
            leftIcon={<Activity className="w-4 h-4 text-brand-600" />}
          >
            Run Schema Diagnostic Check
          </Button>
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="space-y-5 text-sm text-charcoal-700">
        {/* Connection Status Card */}
        <div className="flex items-center justify-between p-3.5 bg-cream-50 rounded-lg border border-charcoal-200">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-md ${isConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
              <Database className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-charcoal-900">
                Connection Status: {isConnected ? `Live Supabase Connected (${getSupabaseProjectRef()})` : 'Configuration Missing'}
              </p>
              <p className="text-xs text-charcoal-500">
                {isConnected 
                  ? 'Production mode active: all operations, transactions & RLS execute directly on live Postgres.'
                  : 'Live Supabase credentials are required. Local storage fallback is disabled in production mode.'}
              </p>
            </div>
          </div>
          <Badge variant={isConnected ? 'success' : 'warning'}>
            {isConnected ? 'ONLINE' : 'SETUP REQUIRED'}
          </Badge>
        </div>

        {/* Live Diagnostics Card */}
        {healthStatus && (
          <div className={`p-3.5 rounded-lg border text-xs space-y-2 ${
            healthStatus.ok ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900' : 'bg-red-50/80 border-red-200 text-red-900'
          }`}>
            <div className="flex items-center justify-between font-bold">
              <span className="flex items-center gap-1.5">
                {healthStatus.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
                Live Schema Diagnostics ({healthStatus.ok ? 'All Core Components Active' : 'Missing Schema / Migration Detected'})
              </span>
              <span className="text-[10px] font-mono text-charcoal-500 font-normal">
                {new Date(healthStatus.timestamp).toLocaleTimeString()}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
              <div className={`p-2 rounded border flex items-center justify-between ${
                healthStatus.checks.profilesTable.status === 'pass' ? 'bg-emerald-100/50 border-emerald-200' : 'bg-red-100/50 border-red-200'
              }`}>
                <span>public.profiles</span>
                <span className="font-bold">{healthStatus.checks.profilesTable.status === 'pass' ? 'OK' : 'MISSING'}</span>
              </div>
              <div className={`p-2 rounded border flex items-center justify-between ${
                healthStatus.checks.lookupEmailRpc.status === 'pass' ? 'bg-emerald-100/50 border-emerald-200' : 'bg-red-100/50 border-red-200'
              }`}>
                <span>lookup_employee</span>
                <span className="font-bold">{healthStatus.checks.lookupEmailRpc.status === 'pass' ? 'OK' : 'MISSING'}</span>
              </div>
              <div className={`p-2 rounded border flex items-center justify-between ${
                healthStatus.checks.createInvoiceRpc.status === 'pass' ? 'bg-emerald-100/50 border-emerald-200' : 'bg-red-100/50 border-red-200'
              }`}>
                <span>create_invoice_rpc</span>
                <span className="font-bold">{healthStatus.checks.createInvoiceRpc.status === 'pass' ? 'OK' : 'MISSING'}</span>
              </div>
            </div>

            {healthStatus.missingMigrations.length > 0 && (
              <div className="mt-2 p-2 bg-white rounded border border-red-200 text-[11px] text-red-800 space-y-1">
                <p className="font-bold">Action Required: Apply the following migration(s) in Supabase SQL Editor:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {healthStatus.missingMigrations.map((m, idx) => (
                    <li key={idx} className="font-mono">{m}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Migration Scripts Checklist */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-charcoal-700 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-brand-600" />
              <span>SQL Migrations (Run in Supabase SQL Editor):</span>
            </h4>
            <span className="text-[11px] text-charcoal-400">Run all_migrations.sql for 1-click setup</span>
          </div>

          <div className="border border-charcoal-200 rounded-lg overflow-hidden divide-y divide-charcoal-200">
            {migrations.map((m, idx) => (
              <div key={m.num} className={`p-3 flex items-center justify-between gap-3 text-xs ${m.num === 'ALL' ? 'bg-brand-50/50' : 'hover:bg-cream-50'}`}>
                <div className="flex items-center gap-2.5">
                  <span className={`w-10 text-center py-0.5 rounded font-mono font-bold text-[11px] ${
                    m.num === 'ALL' ? 'bg-brand-600 text-white' : 'bg-charcoal-200 text-charcoal-800'
                  }`}>
                    {m.num}
                  </span>
                  <div>
                    <p className="font-semibold text-charcoal-900 font-mono text-[11px]">{m.file}</p>
                    <p className="text-[11px] text-charcoal-500">{m.desc}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => copyPath(m.file, idx)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:text-brand-700 bg-white border border-charcoal-200 hover:border-brand-300 px-2.5 py-1 rounded transition-colors shadow-2xs"
                >
                  {copiedIndex === idx ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Path</span>
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Initial Master Admin Setup Instructions */}
        <div className="p-3.5 bg-cream-100/70 border border-charcoal-200 rounded-lg text-xs space-y-2">
          <p className="font-bold text-charcoal-900">How to create the first Master Admin user:</p>
          <ol className="list-decimal pl-4 space-y-1 text-charcoal-600 text-[11px]">
            <li>In Supabase Dashboard &rarr; <b>Authentication</b> &rarr; <b>Users</b> &rarr; Click <b>Add User</b>.</li>
            <li>Email: <code className="font-mono font-bold bg-white px-1 border rounded">admin@bajrangpharmacy.in</code> | Password: <code className="font-mono font-bold bg-white px-1 border rounded">admin123</code> (Auto confirm: Yes).</li>
            <li>Run migration <code className="font-mono bg-white px-1 border rounded">005_auth_lookup_and_bootstrap.sql</code> to link it into <code className="font-mono">public.profiles</code> as <code className="font-mono font-bold">EMP001</code>.</li>
            <li>Log in using Employee ID <b>EMP001</b>.</li>
          </ol>
        </div>
      </div>
    </Modal>
  );
};
