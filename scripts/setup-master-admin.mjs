#!/usr/bin/env node

/**
 * PharmaDesk — Master Administrator Backend Provisioning Script
 * 
 * Configures the master admin user in Supabase Auth & public.profiles
 * using the Supabase Admin API (service role).
 *
 * Credentials loaded from process.env ONLY:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * 
 * Optional file: scripts/.env.local (gitignored)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// 1. Load scripts/.env.local if present (NEVER read VITE_* variables)
const envLocalPath = resolve(process.cwd(), 'scripts', '.env.local');
if (existsSync(envLocalPath)) {
  try {
    const rawContent = readFileSync(envLocalPath, 'utf8');
    for (const line of rawContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([\w_]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1];
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        // ONLY accept SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (ignore any VITE_* keys)
        if ((key === 'SUPABASE_URL' || key === 'SUPABASE_SERVICE_ROLE_KEY') && !process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  } catch (err) {
    console.error('Failed to read scripts/.env.local:', err.message);
  }
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('\n[ERROR] Missing required environment variables:');
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  console.error('\nPlease create scripts/.env.local (gitignored) with:');
  console.error('SUPABASE_URL=https://<your-project-ref>.supabase.co');
  console.error('SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>\n');
  process.exit(1);
}

const ADMIN_EMAIL = process.env.MASTER_ADMIN_EMAIL || 'omlenka22@gmail.com';
const ADMIN_EMPLOYEE_ID = process.env.MASTER_ADMIN_EMPLOYEE_ID || 'master-admin';
const ADMIN_TEMP_PASS = process.env.MASTER_ADMIN_PASSWORD || process.env.ADMIN_TEMP_PASS;

if (!ADMIN_TEMP_PASS) {
  console.error('\n[ERROR] MASTER_ADMIN_PASSWORD environment variable must be set.');
  process.exit(1);
}

async function setupMasterAdmin() {
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // 1. Locate auth user by email via pagination
  let targetUser = null;
  let page = 1;
  const perPage = 50;

  while (!targetUser) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`);
    }
    const users = data?.users || [];
    targetUser = users.find(u => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase());

    if (users.length < perPage || !users.length) {
      break;
    }
    page++;
  }

  // 2. Create or Update user in Supabase Auth
  if (!targetUser) {
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_TEMP_PASS,
      email_confirm: true,
      user_metadata: {
        full_name: 'Master Administrator',
        employee_id: ADMIN_EMPLOYEE_ID,
        role: 'master_admin',
      },
    });

    if (createErr) {
      throw new Error(`Failed to create auth user: ${createErr.message}`);
    }
    targetUser = created.user;
  } else {
    const { data: updated, error: updateErr } = await supabase.auth.admin.updateUserById(targetUser.id, {
      password: ADMIN_TEMP_PASS,
      email_confirm: true,
      user_metadata: {
        full_name: 'Master Administrator',
        employee_id: ADMIN_EMPLOYEE_ID,
        role: 'master_admin',
      },
    });

    if (updateErr) {
      throw new Error(`Failed to update auth user: ${updateErr.message}`);
    }
    targetUser = updated.user;
  }

  if (!targetUser?.id) {
    throw new Error('Target user could not be established');
  }

  // 3. Resolve primary branch and business
  const { data: businessData } = await supabase
    .from('businesses')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1);

  const businessId = businessData?.[0]?.id || 'b0000000-0000-0000-0000-000000000001';

  const { data: branchData } = await supabase
    .from('branches')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1);

  const branchId = branchData?.[0]?.id || 'c0000000-0000-0000-0000-000000000001';

  // 4. Delete any clashing profile rows that clash on employee_id or email with a different user id
  await supabase
    .from('profiles')
    .delete()
    .neq('id', targetUser.id)
    .or(`employee_id.eq.${ADMIN_EMPLOYEE_ID},email.eq.${ADMIN_EMAIL}`);

  // 5. Upsert profile with must_change_password = true
  const profilePayload = {
    id: targetUser.id,
    business_id: businessId,
    employee_id: ADMIN_EMPLOYEE_ID,
    full_name: 'Master Administrator',
    email: ADMIN_EMAIL,
    phone: '+91 522 261 4001',
    role: 'master_admin',
    primary_branch_id: branchId,
    is_active: true,
    permissions: {
      must_change_password: true,
      all: true,
      view_branch_dashboard: true,
      manage_medicines: true,
      manage_inventory: true,
      view_invoices: true,
      access_billing: true,
      view_branch_reports: true,
      manage_permitted_employees: true,
    },
    updated_at: new Date().toISOString(),
  };

  const { error: profileErr } = await supabase
    .from('profiles')
    .upsert(profilePayload, { onConflict: 'id' });

  if (profileErr) {
    throw new Error(`Failed to upsert master admin profile: ${profileErr.message}`);
  }

  // 6. Print required confirmation line ONLY
  console.log(`Master admin ready: ${ADMIN_EMPLOYEE_ID} / ${ADMIN_EMAIL}`);
}

setupMasterAdmin().catch((err) => {
  console.error('\nSetup failed:', err.message);
  process.exit(1);
});
