// /js/auth.js
import { supabase } from './client.js';
import { APP_URL, AUTH_URL } from './config.js';

const form = document.getElementById('auth');
const msg  = document.getElementById('msg');
const signupBtn = document.getElementById('signup');

function cleanHash(){
  if (location.hash.includes('access_token')) {
    history.replaceState(null, '', location.pathname);
  }
}

function goApp(){ location.replace(APP_URL); }

supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    cleanHash();
    goApp();
  }
});

// If we already have a session, bounce to app
(async () => {
  const { data } = await supabase.auth.getSession();
  if (data?.session) goApp();
})();

form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  msg.textContent = "…signing in";
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { msg.textContent = error.message; return; }
  msg.textContent = "";
});

signupBtn.addEventListener('click', async ()=>{
  msg.textContent = "…creating account";
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const { error } = await supabase.auth.signUp({ email, password });
  msg.textContent = error ? error.message : "Check your email to confirm.";
});
