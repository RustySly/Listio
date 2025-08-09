// /js/client.js
import { SUPABASE_URL, SUPABASE_ANON_KEY, STORAGE_KEY } from './config.js';

// Use the global loaded by the script tag
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: STORAGE_KEY
  }
});
