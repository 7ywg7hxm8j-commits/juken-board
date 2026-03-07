// =============================================
//  firebase.js  — Firebase初期化 & 共通ユーティリティ
// =============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, doc,
  onSnapshot, query, orderBy, serverTimestamp,
  updateDoc, increment, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB4bxCNuztkNxwNGKBSaVnK7ciZseAuAys",
  authDomain: "juken-board.firebaseapp.com",
  projectId: "juken-board",
  storageBucket: "juken-board.firebasestorage.app",
  messagingSenderId: "886266222276",
  appId: "1:886266222276:web:759a454be0b0f3a3ed5b91"
};

export const app = initializeApp(firebaseConfig);
export const db  = getFirestore(app);

// Firestore helpers を再エクスポート（各モジュールから使いやすく）
export {
  collection, addDoc, getDocs, doc,
  onSnapshot, query, orderBy, serverTimestamp,
  updateDoc, increment, getDoc, setDoc
};

// =============================================
//  ニックネーム管理
// =============================================
export const NickManager = {
  get() {
    return localStorage.getItem('juken_nick') || '';
  },
  set(nick) {
    localStorage.setItem('juken_nick', nick);
  }
};

// =============================================
//  共通ユーティリティ
// =============================================

/** HTMLエスケープ */
export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 時刻フォーマット */
export function fmtTime(date) {
  return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
    + ' ' + (date.getMonth() + 1) + '/' + date.getDate();
}

/** ニックネームから色を生成 */
export function nickColor(s) {
  const colors = ['#C0392B','#1A5276','#117A65','#7D3C98','#A04000','#1F618D','#0E6655','#6C3483','#935116','#1A5276'];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

/** textarea 自動リサイズ */
export function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

/** パンくずリストを更新 */
export function setBreadcrumb(items) {
  const el = document.getElementById('breadcrumb');
  if (!el) return;
  if (!items.length) { el.innerHTML = ''; return; }
  el.innerHTML = items.map((item, i) => {
    const isLast = i === items.length - 1;
    const sep = i > 0 ? '<span class="bc-sep">›</span>' : '';
    if (isLast) {
      return `${sep}<span class="bc-current">${esc(item.label)}</span>`;
    }
    return `${sep}<span class="bc-item" onclick="${item.fn}">${esc(item.label)}</span>`;
  }).join('');
}

/** チャット共通：メッセージ送信 */
export async function sendChatMessage(collectionPath, nickname, text) {
  await addDoc(collection(db, ...collectionPath), {
    nick: nickname,
    text,
    createdAt: serverTimestamp()
  });
}

/** チャット共通：メッセージをリアルタイム購読 */
export function subscribeChat(collectionPath, onUpdate) {
  const q = query(
    collection(db, ...collectionPath),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(q, snap => {
    const msgs = [];
    snap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
    onUpdate(msgs);
  });
}

/** チャットメッセージのHTML生成 */
export function renderMessages(msgs, nickname) {
  if (msgs.length === 0) {
    return `<div class="empty-state">
      <div class="icon">💬</div>
      <p>まだメッセージがありません<br>最初の投稿をしてみよう！</p>
    </div>`;
  }
  return msgs.map(m => {
    const isMe = m.nick === nickname;
    const color = nickColor(m.nick);
    const time  = m.createdAt ? fmtTime(m.createdAt.toDate()) : '';
    return `
      <div class="msg">
        <div class="msg-avatar" style="background:${color}">${esc(m.nick.slice(0,1))}</div>
        <div class="msg-body">
          <div class="msg-header">
            <span class="msg-nick${isMe ? ' is-me' : ''}">${esc(m.nick)}</span>
            <span class="msg-time">${time}</span>
          </div>
          <div class="msg-text">${esc(m.text).replace(/\n/g, '<br>')}</div>
        </div>
      </div>`;
  }).join('');
}
