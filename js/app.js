// /js/app.js
import { supabase } from './client.js';
import { AUTH_URL } from './config.js';

const authGate = document.getElementById('authGate');
const signoutBtn = document.getElementById('signout');
const boardEl = document.querySelector('.board');

let session = null;
let currentBoardId = null;

// --- tiny debug banner ---
function dbg(msg){
  let el = document.getElementById('dbg');
  if (!el){
    el = document.createElement('div');
    el.id = 'dbg';
    el.style.cssText = 'position:fixed;right:12px;bottom:12px;max-width:520px;padding:10px 12px;background:#fff3cd;border:1px solid #ffe08a;border-radius:8px;font:12px system-ui;color:#533f03;z-index:9999;white-space:pre-wrap';
    document.body.appendChild(el);
  }
  el.textContent = msg;
}

function showGate(){ authGate.style.display = 'grid'; }
function hideGate(){ authGate.style.display = 'none'; }
function toAuth(){ location.replace(AUTH_URL); }
function setUIFromSession(s){
  const inApp = !!s;
  signoutBtn.style.display = inApp ? 'inline-flex' : 'none';
  if (!inApp) { showGate(); setTimeout(toAuth, 50); } else { hideGate(); }
}

signoutBtn.addEventListener('click', async ()=>{
  await supabase.auth.signOut();
  toAuth();
});

// debounce SIGNED_OUT flicker
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

document.addEventListener('visibilitychange', recheck);
window.addEventListener('focus', recheck);
async function recheck(){
  if (document.visibilityState && document.visibilityState !== 'visible') return;
  const { data } = await supabase.auth.getSession();
  session = data?.session || null;
  setUIFromSession(session);
  if (session) await boot();
}

// initial
(async ()=>{
  const { data } = await supabase.auth.getSession();
  session = data?.session || null;
  setUIFromSession(session);
  if (session) await boot();
})();

// ===== App logic =====
async function boot(){
  boardEl.innerHTML = '';
  // Try to load a board for this user
  const { data: boards, error: bErr, status } = await supabase
    .from('boards').select('*').eq('owner_id', session.user.id).limit(1);

  if (bErr){
    dbg(`Load boards error (${status}): ${bErr.message}`);
    // Fallback UI so we can keep going
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = 'Create a Board';
    btn.onclick = createBoard;
    boardEl.appendChild(btn);
    return;
  }

  if (!boards || boards.length === 0){
    await createBoard();
  } else {
    currentBoardId = boards[0].id;
  }

  await renderColumns();
  subscribeRealtime();
}

async function createBoard(){
  const { data: created, error: cErr, status } = await supabase
    .from('boards').insert({ title: 'My Board', owner_id: session.user.id })
    .select('*').single();
  if (cErr){
    dbg(`Create board error (${status}): ${cErr.message}`);
    return;
  }
  currentBoardId = created.id;
}

async function renderColumns(){
  const { data: columns, error, status } = await supabase
    .from('columns').select('id, title, position')
    .eq('board_id', currentBoardId).order('position', { ascending: true });
  if (error){
    dbg(`Load columns error (${status}): ${error.message}`);
    return;
  }

  boardEl.innerHTML = '';

  for (const col of (columns || [])){
    const el = renderColumn(col);
    boardEl.appendChild(el);

    const { data: cards, error: cErr, status: cStatus } = await supabase
      .from('cards').select('*').eq('column_id', col.id).order('position', { ascending: true });
    if (cErr) dbg(`Load cards error (${cStatus}): ${cErr.message}`);
    const cardsEl = el.querySelector('.cards');
    (cards || []).forEach(card => cardsEl.appendChild(renderCard(card)));
  }

  const add = document.createElement('button');
  add.className = 'btn';
  add.textContent = '+ Add Column';
  add.onclick = async ()=>{
    if (!currentBoardId) return dbg('No board id.');
    const { error: iErr, status: iStatus } = await supabase.from('columns').insert({
      board_id: currentBoardId,
      title: 'New Column',
      owner_id: session.user.id,
      position: Math.floor(Date.now()/1000)
    });
    if (iErr) dbg(`Insert column failed (${iStatus}): ${iErr.message}`);
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

  wrap.querySelector('.col-title').addEventListener('blur', async ()=>{
    const newTitle = wrap.querySelector('.col-title').textContent.trim() || 'Untitled';
    const { error, status } = await supabase.from('columns').update({ title: newTitle }).eq('id', col.id);
    if (error) dbg(`Rename column failed (${status}): ${error.message}`);
  });

  // delete
  wrap.querySelectorAll('.icon-btn')[1].onclick = async ()=>{
    const { error, status } = await supabase.from('columns').delete().eq('id', col.id);
    if (error) dbg(`Delete column failed (${status}): ${error.message}`);
  };

  // share (manual user_id now)
  wrap.querySelectorAll('.icon-btn')[0].onclick = ()=> openShareDialog(col.id);

  // add card
  const input = wrap.querySelector('.adder input');
  wrap.querySelector('.adder button').onclick = async ()=>{
    const text = input.value.trim(); if (!text) return;
    const { error, status } = await supabase.from('cards').insert({
      column_id: col.id, text, position: Math.floor(Date.now()/1000), created_by: session.user.id
    });
    if (error) dbg(`Add card failed (${status}): ${error.message}`);
    else input.value = '';
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
    const { error, status } = await supabase.from('cards').update({ checked: e.target.checked }).eq('id', card.id);
    if (error) dbg(`Toggle card failed (${status}): ${error.message}`);
  });
  el.querySelector('.card-text').addEventListener('blur', async (e)=>{
    const { error, status } = await supabase.from('cards').update({ text: e.target.textContent }).eq('id', card.id);
    if (error) dbg(`Edit card failed (${status}): ${error.message}`);
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
    .then(({ error, status }) => alert(error ? `Share failed (${status}): ${error.message}` : 'Shared!'));
}
