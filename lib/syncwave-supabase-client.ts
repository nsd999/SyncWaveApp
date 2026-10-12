import { createClient } from '@supabase/supabase-js';

// Unique client module path forces deployment bundles to compile the current configuration logic.
const SYNCWAVE_CLIENT_CONFIG_REVISION = '2026-10-12-no-fallback-v2';
void SYNCWAVE_CLIENT_CONFIG_REVISION;

const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
const configuredSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  '';

/**
 * SyncWave must never silently send production requests to a fallback project.
 * The reserved .invalid domain lets the client be constructed while forms show
 * a clear configuration error instead of issuing requests to the wrong database.
 */
const supabaseUrl = configuredSupabaseUrl || 'https://missing-supabase-config.invalid';
const supabaseKey = configuredSupabaseKey || 'missing-supabase-publishable-key';

export const supabase = createClient(supabaseUrl, supabaseKey);

export const SUPABASE_CONFIGURATION_MESSAGE =
  'SyncWave is not connected to its database yet. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in Vercel for Preview and Production, then redeploy.';

export function isSupabaseConfigured(): boolean {
  if (!configuredSupabaseUrl || !configuredSupabaseKey) return false;

  try {
    const url = new URL(configuredSupabaseUrl);
    return url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}
