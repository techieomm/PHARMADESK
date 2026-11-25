import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface HealthCheckResult {
  ok: boolean;
  timestamp: string;
  checks: {
    profilesTable: { status: 'pass' | 'fail'; error?: string };
    lookupEmailRpc: { status: 'pass' | 'fail'; error?: string };
    createInvoiceRpc: { status: 'pass' | 'fail'; error?: string };
  };
  missingMigrations: string[];
}

/**
 * Runs active diagnostic checks against the connected Supabase instance:
 * 1. profiles table existence (Migration 001)
 * 2. lookup_employee_email RPC callable by anon (Migration 005)
 * 3. create_invoice_atomic RPC existence (Migration 003)
 */
export async function runHealthCheck(): Promise<HealthCheckResult> {
  const timestamp = new Date().toISOString();
  const missingMigrations: string[] = [];

  const checks: HealthCheckResult['checks'] = {
    profilesTable: { status: 'pass' },
    lookupEmailRpc: { status: 'pass' },
    createInvoiceRpc: { status: 'pass' },
  };

  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      timestamp,
      checks: {
        profilesTable: { status: 'fail', error: 'Supabase URL/Key missing or placeholder' },
        lookupEmailRpc: { status: 'fail', error: 'Supabase URL/Key missing or placeholder' },
        createInvoiceRpc: { status: 'fail', error: 'Supabase URL/Key missing or placeholder' },
      },
      missingMigrations: ['Credentials configuration missing in .env'],
    };
  }

  // 1. Check profiles table existence (Migration 001)
  try {
    const { error: profileErr } = await supabase
      .from('profiles')
      .select('id', { head: true, count: 'exact' });

    if (profileErr) {
      const msg = profileErr.message || '';
      if (
        msg.includes('does not exist') ||
        msg.includes('relation "public.profiles" does not exist') ||
        (profileErr as any).code === '42P01' ||
        (profileErr as any).code === 'PGRST204'
      ) {
        checks.profilesTable = {
          status: 'fail',
          error: 'Migration 001 not applied: public.profiles table does not exist',
        };
        missingMigrations.push('Migration 001 (001_initial_schema.sql)');
      }
    }
  } catch (err: any) {
    checks.profilesTable = { status: 'fail', error: err?.message || 'Failed to query profiles table' };
  }

  // 2. Check lookup_employee_email RPC (Migration 005)
  try {
    const { error: rpcErr } = await supabase.rpc('lookup_employee_email', {
      p_employee_id: '__HEALTH_PING__',
    });

    if (rpcErr) {
      const msg = rpcErr.message || '';
      if (
        msg.includes('Could not find the function') ||
        msg.includes('function public.lookup_employee_email') ||
        msg.includes('does not exist') ||
        (rpcErr as any).code === '42883' ||
        (rpcErr as any).code === 'PGRST202'
      ) {
        checks.lookupEmailRpc = {
          status: 'fail',
          error: 'Migration 005 not applied: lookup_employee_email RPC missing or parameter mismatch',
        };
        missingMigrations.push('Migration 005 (005_auth_lookup_and_bootstrap.sql)');
      }
    }
  } catch (err: any) {
    checks.lookupEmailRpc = { status: 'fail', error: err?.message || 'Failed to test lookup RPC' };
  }

  // 3. Check create_invoice_atomic RPC existence (Migration 003)
  try {
    // Calling with an empty dummy UUID to test if function is present in schema cache
    const { error: invoiceRpcErr } = await supabase.rpc('create_invoice_atomic', {
      p_branch_id: '00000000-0000-0000-0000-000000000000',
    } as any);

    if (invoiceRpcErr) {
      const msg = invoiceRpcErr.message || '';
      if (
        msg.includes('Could not find the function public.create_invoice_atomic') ||
        msg.includes('function public.create_invoice_atomic') ||
        (invoiceRpcErr as any).code === '42883' ||
        (invoiceRpcErr as any).code === 'PGRST202'
      ) {
        checks.createInvoiceRpc = {
          status: 'fail',
          error: 'Migration 003 not applied: create_invoice_atomic RPC missing in database',
        };
        missingMigrations.push('Migration 003 (003_rpcs.sql)');
      }
      // If error is related to branch validation or missing counter, the function is present!
    }
  } catch (err: any) {
    checks.createInvoiceRpc = { status: 'fail', error: err?.message || 'Failed to test billing RPC' };
  }

  const ok = Object.values(checks).every(c => c.status === 'pass');

  return {
    ok,
    timestamp,
    checks,
    missingMigrations,
  };
}
