// common.js
// Shared Supabase setup & helper functions

const SUPABASE_URL = 'https://xqxuccpotbdmqqhxisdf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxeHVjY3BvdGJkbXFxaHhpc2RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3NTg5MjYsImV4cCI6MjA3MDMzNDkyNn0.Jb3LaflzKGT6di_t14FLbGdexQ2lTKQ-dIt5Ve9aP-8';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function requireAuth(redirectTo = 'auth.html') {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = redirectTo;
    return null;
  }
  return session;
}
