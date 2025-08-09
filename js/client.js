// /js/client.js
import { SUPABASE_URL, SUPABASE_ANON_KEY, STORAGE_KEY } from './config.js';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: STORAGE_KEY
  }
});

// Expose the client so we can inspect it in the console
window.supabaseClient = supabase;
