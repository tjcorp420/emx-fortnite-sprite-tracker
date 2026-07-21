import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);
export const supabase = isSupabaseConfigured ? createClient(url!, anonKey!, {
  // Password-recovery emails can be opened in a phone's installed PWA, a mail
  // browser, or a different device. The implicit browser flow carries the
  // short-lived recovery session in the link itself; PKCE needs a verifier
  // stored by the original browser and therefore cannot reliably cross that
  // handoff.
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
}) : null;
