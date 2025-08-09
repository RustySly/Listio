// /js/app.js
import { supabase } from './client.js';
import { AUTH_URL } from './config.js';

const authGate = document.getElementById('authGate');
const signoutBtn = document.getElementById('signout');
const boardEl = document.querySelector('.board');

let session = null;
let currentBoardId = null;

function showGate(){ authGate.style.display = 'grid'; }
function hideGate(){ authGate.style.display = 'none'; }
function toAuth(){ location.replace(AUTH_URL); }

function setUIFromSession(s){
  const inApp = !!s;
  signoutBtn.style.display = inApp ? 'inline-flex' : 'none';
  if (!inApp) { showGate(); setTimeout(toAuth, 50); }
  else { hideGate(); }
}

signoutBtn.addEventListener('click', async ()=>{
  await supabase.auth.signOut();
  toAuth();
});

// Debounce signed_out flicker
let signedOutTimer = null;
supabase.auth.onAuthStateChange(async (event, s) => {
  if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
    session = s?.session || (await supabase.auth.getSession()).data.session;
    setUIFromSession(session);
    if (session) await boot();
    return;
  }
  if (event === 'SIGNED_OUT') {
    clearTimeout(signedOutTimer);
    signedOutTimer = setTimeout(async ()=>{
      const { data } = await supabase.auth.getSession();
      session = data?.session || null;
      setUIFromSession(session);
      if (session) await boot();
    }, 250);
  }
});

// Visibility/Focus guards
document.addEventListener('visibilitychange', async ()=>{
  if (document.visibilityState === 'visible') {
    const { data } = await supabase.auth.getSession();
    session = data?.session || null;
    setUIFromSession(session);
    if (session) await boot();
  }
});
window.addEventListener('focus', async ()=>{
  const { data } = await supabase.auth.getSession();
  session = data?.session || null;
  setUIFromSession(session);
  if (session) await boot();
});

// Initial load
(async ()=>{
  const { data } = await supabase.auth.getSession();
  session = data?.session || null;
  setUIFromSession(session);
  if (session) await boot();
})();

// ===== App logic =====
async function boot(){
  // create or load board
  const { data: boards, error: bErr } = await supabase
    .from('boards').select('*').eq('owner_id', session.user.id).limit(1);
  if (bErr){ console.error(bErr); return; }

  if (!boards || boards.length === 0){
    const { data: created, error: cErr } = await supabase
      .from('boards').insert({ title: 'My Board', owner_id: session.user.id })
      .select('*').single();
    if (cErr){ console.error(cErr); return; }
    currentBoardId = created.id;
  } else {
    currentBoardId = boards[0].id;
  }

  await renderColumns();
  subscribeRealtime();
}

async function renderColumns(){
  const { data: columns, error } = await supabase
    .from('columns').select('id, title, position')
    .eq('board_id', currentBoardId).order('position', { ascending: true });
  if (error){ console.error(error); return; }

  boardEl.innerHTML = '';

  for (const col of (columns || [])){
    const el = renderColumn(col);
    boardEl.appendChild(el);

    const { data: cards, error: cErr } = await supabase
      .from('cards').select('*').eq('column_id', col.id).order('position', { ascending: true });
    if (!cErr && cards) {
      const cardsEl = el.querySelector('.cards');
      cards.forEach(card => cardsEl.appendChild(renderCard(card)));
    }
  }

  const add = document.createElement('button');
  add.className = 'btn';
  add.textContent = '+ Add Column';
  add.onclick = async ()=>{
    if (!currentBoardId) return;
    const { error } = await supabase.from('columns').insert({
      board_id: currentBoardId,
      title: 'New Column',
      owner_id: session.user.id,
      position: Math.floor(Date.now()/1000) // stays under 32‑bit
    });
    if (error) console.error(error);
  };
  boardEl.appendChild(add);
}

function renderColumn(col){
  const wrap = document.createElement('div');
  wrap.className = 'column';
  wrap.innerHTML = `
    <div class="col-header">
      <div class="col-title" contenteditable="true">${col.title}</div>
      <div class="col-actions">
        <button class="icon-btn" title="Share">🔗</button>
        <button class="icon-btn" title="Delete">🗑</button>
      </div>
    </div>
    <div class="cards"></div>
    <div class="adder">
      <input placeholder="Add a card..." />
      <button class="btn">Add</button>
    </div>
  `;

  // rename
  const title = wrap.querySelector('.col-title');
  title.addEventListener('blur', async ()=>{
    const newTitle = title.textContent.trim() || 'Untitled';
    const { error } = await supabase.from('columns').update({ title: newTitle }).eq('id', col.id);
    if (error) console.error(error);
  });

  // delete
  wrap.querySelectorAll('.icon-btn')[1].onclick = async ()=>{
    const { error } = await supabase.from('columns').delete().eq('id', col.id);
    if (error) console.error(error);
  };

  // share (manual user_id for now)
  wrap.querySelectorAll('.icon-btn')[0].onclick = ()=> openShareDialog(col.id);

  // add card
  const input = wrap.querySelector('.adder input');
  wrap.querySelector('.adder button').onclick = async ()=>{
    const text = input.value.trim(); if (!text) return;
    const { error } = await supabase.from('cards').insert({
      column_id: col.id,
      text,
      position: Math.floor(Date.now()/1000),
      created_by: session.user.id
    });
    if (!error) input.value = ''; else console.error(error);
  };

  return wrap;
}

function renderCard(card){
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = `
    <input class="checkbox" type="checkbox" ${card.checked ? 'checked' : ''}/>
    <div class="card-text" contenteditable="true">${card.text || ''}</div>
    <div class="meta"></div>
  `;
  el.querySelector('.checkbox').addEventListener('change', async (e)=>{
    const { error } = await supabase.from('cards').update({ checked: e.target.checked }).eq('id', card.id);
    if (error) console.error(error);
  });
  el.querySelector('.card-text').addEventListener('blur', async (e)=>{
    const { error } = await supabase.from('cards').update({ text: e.target.textContent }).eq('id', card.id);
    if (error) console.error(error);
  });
  return el;
}

function subscribeRealtime(){
  supabase.channel('columns-ch')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'columns' }, () => renderColumns())
    .subscribe();
  supabase.channel('cards-ch')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, () => renderColumns())
    .subscribe();
}

function openShareDialog(columnId){
  const email = prompt('Enter collaborator email (they must sign up first)');
  if (!email) return;
  const role = prompt("Role? Type 'viewer' or 'editor'", 'viewer');
  if (!role || !['viewer','editor'].includes(role)) return alert('Invalid role');
  alert('For now, paste their user_id (we’ll automate later).');
  const userId = prompt('Paste collaborator user_id');
  if (!userId) return;
  supabase.from('column_access').insert({ column_id: columnId, user_id: userId, role })
    .then(({ error }) => alert(error ? error.message : 'Shared!'));
}
