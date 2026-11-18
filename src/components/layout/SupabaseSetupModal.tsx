import React, { useState } from 'react';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { isSupabaseConfigured } from '@/lib/supabase';
import { Check, Copy, Database, ShieldAlert, ExternalLink } from 'lucide-react';

interface SupabaseSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupabaseSetupModal: React.FC<SupabaseSetupModalProps> = ({ isOpen, onClose }) => {
  const isConnected = isSupabaseConfigured();
  const [copied, setCopied] = useState(false);

  const copyMigrationSql = async () => {
    try {
      // In production/dev this can read from migration file or embed the SQL
      const sqlText = `-- PHARMADESK COMPLETE DATABASE MIGRATION SCRIPT
-- Open your Supabase Dashboard -> SQL Editor, paste this script, and click Run.
-- Refer to supabase/migrations/001_initial_schema.sql in project root.`;
      await navigator.clipboard.writeText(sqlText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Supabase Database Connection & Architecture"
      maxWidth="lg"
      footer={
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-5 text-sm text-charcoal-700">
        <div className="flex items-center justify-between p-3.5 bg-cream-50 rounded border border-charcoal-200">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded ${isConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
              <Database className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-charcoal-900">
                Connection Status: {isConnected ? 'Live Supabase Connected' : 'Local Architecture Mode'}
              </p>
              <p className="text-xs text-charcoal-500">
                {isConnected 
                  ? 'All operations, Auth & RLS are connecting directly to your Supabase PostgreSQL database.'
                  : 'Operating with complete PostgreSQL-modeled local storage & atomic procedures until credentials are provided.'}
              </p>
            </div>
          </div>
          <Badge variant={isConnected ? 'success' : 'warning'}>
            {isConnected ? 'ONLINE' : 'SETUP MODE'}
          </Badge>
        </div>

        {!isConnected && (
          <div className="p-4 bg-amber-50/70 border border-amber-200 rounded text-xs text-amber-900 space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-amber-950">
              <ShieldAlert className="w-4 h-4 text-amber-700" />
              <span>To connect your live Supabase cloud project:</span>
            </div>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Log into your Supabase Dashboard at <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="underline font-semibold text-amber-950 inline-flex items-center gap-0.5">supabase.com <ExternalLink className="w-3 h-3" /></a></li>
              <li>Go to <b>Project Settings → API</b> and copy your <b>Project URL</b> and <b>anon/public key</b>.</li>
              <li>Add them to your <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">.env</code> file:
                <pre className="bg-charcoal-900 text-amber-100 p-2.5 rounded mt-1.5 font-mono text-[11px] select-all overflow-x-auto">
{`VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`}
                </pre>
              </li>
              <li>Go to <b>SQL Editor</b> in your Supabase Dashboard and run the SQL migration located at:
                <div className="mt-1 font-mono font-medium text-charcoal-800">
                  supabase/migrations/001_initial_schema.sql
                </div>
              </li>
            </ol>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-charcoal-800">Schema File Reference</span>
            <Button variant="outline" size="sm" onClick={copyMigrationSql} className="text-xs h-7">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
              {copied ? 'Copied Reference' : 'Copy File Path'}
            </Button>
          </div>
          <div className="p-2.5 bg-charcoal-900 text-charcoal-200 rounded text-xs font-mono">
            supabase/migrations/001_initial_schema.sql
          </div>
        </div>

        <div className="border-t border-charcoal-200 pt-3">
          <h4 className="font-semibold text-charcoal-900 mb-1">Architecture Summary</h4>
          <ul className="grid grid-cols-2 gap-2 text-xs text-charcoal-600">
            <li className="flex items-center gap-1.5">✓ 2 Preconfigured Branches</li>
            <li className="flex items-center gap-1.5">✓ Centralized Medicine Master</li>
            <li className="flex items-center gap-1.5">✓ Dual-Unit Inventory (Strips & Pieces)</li>
            <li className="flex items-center gap-1.5">✓ Atomic Procedure for Billing</li>
            <li className="flex items-center gap-1.5">✓ Hardware Barcode Scanner Listener</li>
            <li className="flex items-center gap-1.5">✓ Row Level Security (RLS) Rules</li>
          </ul>
        </div>
      </div>
    </Modal>
  );
};
