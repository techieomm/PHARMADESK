import React, { useState } from 'react';
import { Database, ShieldCheck, Key, RefreshCw, FileCode, ExternalLink } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { SupabaseSetupModal } from '@/components/layout/SupabaseSetupModal';

export const SupabaseNotConfiguredScreen: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-cream-50 flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 selection:bg-brand-200">
      <div className="w-full max-w-2xl bg-white border border-charcoal-200 rounded-xl shadow-md overflow-hidden">
        {/* Header Banner */}
        <div className="bg-charcoal-900 text-white p-6 sm:p-8 flex items-start gap-4 border-b border-charcoal-800">
          <div className="p-2 rounded-lg bg-white border border-charcoal-700 shrink-0">
            <img src="/bajrang-icon.png" alt="Bajrang Pharmacy" className="w-9 h-9 object-contain" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-red-400 bg-red-950/60 px-2 py-0.5 rounded border border-red-800">
                Connection Required
              </span>
              <span className="text-xs font-semibold text-charcoal-400">
                Production Mode (VITE_DEMO_MODE=false)
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold font-sans text-white">
              Supabase Project Connection Missing
            </h1>
            <p className="text-xs sm:text-sm text-charcoal-300 mt-1 leading-relaxed">
              Bajrang Pharmacy is running in live production mode. To prevent negative stock, protect financial ledgers, and maintain strict Indian GST audit compliance, <b>local storage fallback is strictly disabled</b>.
            </p>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-3">
            <Database className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-950">Why is this blocking screen displayed?</p>
              <p className="text-amber-800 leading-relaxed">
                Your environment variables (<code className="font-mono font-bold bg-amber-100 px-1 py-0.5 rounded">VITE_SUPABASE_URL</code> or <code className="font-mono font-bold bg-amber-100 px-1 py-0.5 rounded">VITE_SUPABASE_ANON_KEY</code>) are either missing or contain placeholder values. In production mode, silent fallback to browser memory is prevented.
              </p>
            </div>
          </div>

          {/* Quick Steps */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-charcoal-700 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Quick Resolution Steps:
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-cream-50 border border-charcoal-200 rounded-lg space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-charcoal-800">
                  <Key className="w-4 h-4 text-brand-600" />
                  <span>1. Configure .env Credentials</span>
                </div>
                <p className="text-charcoal-500 text-[11px] leading-relaxed">
                  Open your <code className="font-mono bg-white px-1 py-0.5 border rounded">.env</code> file (or your Vercel/Netlify dashboard) and supply your real Supabase Project URL and Anon Key.
                </p>
              </div>

              <div className="p-3 bg-cream-50 border border-charcoal-200 rounded-lg space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-charcoal-800">
                  <FileCode className="w-4 h-4 text-brand-600" />
                  <span>2. Run 5 SQL Migrations</span>
                </div>
                <p className="text-charcoal-500 text-[11px] leading-relaxed">
                  Execute migrations <code className="font-mono">001</code> to <code className="font-mono">005</code> in your Supabase SQL Editor to initialize schemas, atomic RPCs, and seed data.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-center justify-between gap-3 pt-4 border-t border-charcoal-200">
            <Button
              variant="primary"
              size="md"
              onClick={() => setIsModalOpen(true)}
              leftIcon={<Database className="w-4 h-4" />}
              className="w-full sm:w-auto whitespace-nowrap shrink-0"
            >
              Open Supabase Migration &amp; Setup Guide
            </Button>
            <div className="flex items-center flex-wrap gap-2 w-full sm:w-auto justify-end shrink-0">
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 h-10 text-xs font-semibold text-charcoal-600 hover:text-charcoal-900 border border-charcoal-300 px-3 rounded-md hover:bg-cream-100 transition-colors whitespace-nowrap"
              >
                <span>Supabase Dashboard</span>
                <ExternalLink className="w-3.5 h-3.5 text-charcoal-400" />
              </a>
              <Button
                variant="outline"
                size="md"
                onClick={() => window.location.reload()}
                leftIcon={<RefreshCw className="w-4 h-4" />}
                className="whitespace-nowrap"
              >
                Retry Connection
              </Button>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="bg-cream-100 px-6 py-3 border-t border-charcoal-200 text-[11px] text-charcoal-500 flex items-center justify-between">
          <span>Bajrang Pharmacy • Lucknow, UP (GSTIN: 09CMVPM3439A1ZS)</span>
          <span>To enable offline demo mode: set <code className="font-mono font-semibold">VITE_DEMO_MODE=true</code></span>
        </div>
      </div>

      {/* Migration & Setup Guide Modal */}
      <SupabaseSetupModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};
