// =============================================
//  board.js — 入試掲示板機能
//  ※ このファイルは feature/nyushi ブランチで実装します
// =============================================

import {
  db, esc, fmtTime, nickColor, autoResize,
  setBreadcrumb, subscribeChat, renderMessages,
  sendChatMessage, collection, addDoc, getDocs,
  onSnapshot, query, orderBy, serverTimestamp,
  updateDoc, increment, doc
} from './firebase.js';

// =============================================
//  状態管理
// =============================================
let nickname   = '';
let allRooms   = [];
let currentUniv   = null;
let currentRoomId = null;
let unsubMessages = null;

export function setNickname(nick) { nickname = nick; }

// =============================================
//  初期化
// =============================================
export async function initBoard() {
  await loadRooms();
  renderUnivList();
}

// =============================================
//  データ取得
// =============================================
async function loadRooms() {
  const snap = await getDocs(collection(db, 'rooms'));
  allRooms = [];
  snap.forEach(d => allRooms.push({ id: d.id, ...d.data() }));
}

// =============================================
//  大学一覧 画面
// =============================================
export function renderUnivList(searchQuery = '') {
  const q = searchQuery.toLowerCase();

  // 大学ごとにグルーピング
  const univMap = {};
  allRooms.forEach(r => {
    if (q && !r.univ.toLowerCase().includes(q)) return;
    if (!univMap[r.univ]) univMap[r.univ] = { deptCount: 0, totalMsgs: 0 };
    univMap[r.univ].deptCount++;
    univMap[r.univ].totalMsgs += (r.msgCount || 0);
  });

  const univs = Object.entries(univMap)
    .sort((a, b) => b[1].totalMsgs - a[1].totalMsgs);

  const countEl = document.getElementById('nyushi-univ-count');
  const gridEl  = document.getElementById('nyushi-univ-grid');
  if (!gridEl) return;

  if (countEl) countEl.textContent = univs.length + '大学';

  if (univs.length === 0) {
    gridEl.innerHTML = `<div class="empty-state">
      <div class="icon">🔍</div>
      <p>該当する大学がありません<br>「部屋を作る」から追加できます</p>
    </div>`;
    return;
  }

  gridEl.innerHTML = univs.map(([univ, info]) => `
    <div class="card" onclick="Board.enterUniv('${esc(univ)}')">
      <div class="card-icon">🏫</div>
      <div class="card-title">${esc(univ)}</div>
      <div class="card-meta">
        <span>📚 ${info.deptCount}学部</span>
        <span>💬 ${info.totalMsgs}件</span>
      </div>
      <div class="card-arrow">›</div>
    </div>
  `).join('');
}

// =============================================
//  学部一覧 画面
// =============================================
export function enterUniv(univ) {
  currentUniv = univ;

  const depts = allRooms
    .filter(r => r.univ === univ)
    .sort((a, b) => (b.msgCount || 0) - (a.msgCount || 0));

  showView('nyushi-view-dept');
  setBreadcrumb([
    { label: 'トップ', fn: "switchTab('nyushi')" },
    { label: univ }
  ]);

  const titleEl = document.getElementById('nyushi-dept-univ-title');
  const countEl = document.getElementById('nyushi-dept-count');
  const gridEl  = document.getElementById('nyushi-dept-grid');
  if (titleEl) titleEl.textContent = univ;
  if (countEl) countEl.textContent = depts.length + '学部';

  if (!gridEl) return;

  if (depts.length === 0) {
    gridEl.innerHTML = `<div class="empty-state">
      <div class="icon">📭</div>
      <p>学部がまだありません<br>下のボタンから追加できます</p>
    </div>`;
  } else {
    gridEl.innerHTML = depts.map(r => `
      <div class="list-card" onclick="Board.enterRoom('${r.id}','${esc(r.univ)}','${esc(r.dept)}')">
        <div>
          <div class="list-card-title">${esc(r.dept)}</div>
          <div class="list-card-sub">💬 ${r.msgCount || 0}件の投稿</div>
        </div>
        <div class="list-card-chevron">›</div>
      </div>
    `).join('');
  }
}

// =============================================
//  チャット部屋
// =============================================
export function enterRoom(roomId, univ, dept) {
  currentRoomId = roomId;

  showView('nyushi-view-room');
  setBreadcrumb([
    { label: 'トップ', fn: "switchTab('nyushi')" },
    { label: univ, fn: `Board.enterUniv('${esc(univ)}')` },
    { label: dept }
  ]);

  const univEl = document.getElementById('nyushi-room-univ');
  const deptEl = document.getElementById('nyushi-room-dept');
  if (univEl) univEl.textContent = univ;
  if (deptEl) deptEl.textContent = dept;

  const area = document.getElementById('nyushi-messages');
  if (area) area.innerHTML = '<div class="loading">読み込み中...</div>';

  if (unsubMessages) unsubMessages();
  unsubMessages = subscribeChat(
    ['rooms', roomId, 'messages'],
    msgs => {
      const area = document.getElementById('nyushi-messages');
      if (!area) return;
      const atBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 80;
      const countEl  = document.getElementById('nyushi-msg-count');
      if (countEl) countEl.textContent = msgs.length;
      area.innerHTML = renderMessages(msgs, nickname);
      if (atBottom) area.scrollTop = area.scrollHeight;
    }
  );
}

// =============================================
//  メッセージ送信
// =============================================
export async function sendMessage() {
  const input = document.getElementById('nyushi-chat-input');
  const btn   = document.getElementById('nyushi-send-btn');
  if (!input || !btn) return;
  const text = input.value.trim();
  if (!text || !currentRoomId) return;

  input.value = '';
  autoResize(input);
  btn.disabled = true;

  try {
    await sendChatMessage(['rooms', currentRoomId, 'messages'], nickname, text);
    await updateDoc(doc(db, 'rooms', currentRoomId), { msgCount: increment(1) });
  } finally {
    btn.disabled = false;
    input.focus();
  }
}

// =============================================
//  部屋の作成
// =============================================
export async function createRoom(univ, dept) {
  const dup = allRooms.find(r => r.univ === univ && r.dept === dept);
  if (dup) {
    enterRoom(dup.id, dup.univ, dup.dept);
    return;
  }
  const ref = await addDoc(collection(db, 'rooms'), {
    univ, dept, msgCount: 0, createdAt: serverTimestamp()
  });
  await loadRooms();
  enterRoom(ref.id, univ, dept);
}

// =============================================
//  トップに戻る
// =============================================
export function resetToTop() {
  if (unsubMessages) { unsubMessages(); unsubMessages = null; }
  currentRoomId = null;
  currentUniv   = null;
  showView('nyushi-view-list');
  setBreadcrumb([]);
  loadRooms().then(() => renderUnivList());
}

// =============================================
//  ビュー切り替え（入試タブ内）
// =============================================
function showView(id) {
  document.querySelectorAll('.nyushi-view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
}
