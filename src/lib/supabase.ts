import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('https://') &&
    !supabaseUrl.includes('your-project') &&
    supabaseAnonKey.length > 20
  );
};

export const getSupabaseProjectRef = (): string => {
  try {
    if (!supabaseUrl) return 'Not Configured';
    const parsed = new URL(supabaseUrl);
    const host = parsed.hostname;
    return host.split('.')[0] || host;
  } catch {
    return 'Invalid URL';
  }
};

export const supabase = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : createClient('https://placeholder.supabase.co', 'placeholder-anon-key-placeholder-32chars', {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
