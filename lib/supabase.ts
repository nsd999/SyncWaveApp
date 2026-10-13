import { createClient } from '@supabase/supabase-js';

const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
const configuredKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || '';
const isConfigured = Boolean(configuredUrl && configuredKey);

// Use inert placeholders during local builds with missing environment variables.
// Features check isSupabaseConfigured() before using the client, so we never
// silently authenticate against an unrelated hard-coded Supabase project.
export const supabase = createClient(
  configuredUrl || 'https://configuration-required.supabase.co',
  configuredKey || 'missing-publishable-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

export function isSupabaseConfigured(): boolean {
  return isConfigured;
}
