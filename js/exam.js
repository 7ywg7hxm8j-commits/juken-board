// =============================================
//  exam.js — 模試・回答共有機能
//  feature/mosshi ブランチ
// =============================================

import {
db, esc, autoResize, setBreadcrumb,
subscribeChat, renderMessages, sendChatMessage,
collection, addDoc, getDocs, doc,
onSnapshot, query, orderBy, serverTimestamp,
updateDoc, increment, getDoc, setDoc
} from ‘./firebase.js’;

// =============================================
//  定数
// =============================================
const EXAM_SERIES = [
{ id: ‘zento-kyotsu’,        name: ‘全統共通テスト模試’,                   icon: ‘📘’, org: ‘河合塾’ },
{ id: ‘zento-kijutsu’,       name: ‘全統記述模試’,                         icon: ‘📘’, org: ‘河合塾’ },
{ id: ‘zento-pre-kyotsu’,    name: ‘全統プレ共通テスト’,                   icon: ‘📘’, org: ‘河合塾’ },
{ id: ‘shinken-kijutsu’,     name: ‘進研模試 総合学力記述模試’,             icon: ‘📗’, org: ‘ベネッセ’ },
{ id: ‘shinken-kyotsu’,      name: ‘進研模試 大学入学共通テスト模試’,       icon: ‘📗’, org: ‘ベネッセ’ },
{ id: ‘benesse-sundai-kyotsu’, name: ‘ベネッセ・駿台 大学入学共通テスト模試’, icon: ‘📙’, org: ‘ベネッセ・駿台’ },
{ id: ‘benesse-sundai-kijutsu’, name: ‘ベネッセ・駿台記述模試’,             icon: ‘📙’, org: ‘ベネッセ・駿台’ },
{ id: ‘sundai-zenkoku’,      name: ‘駿台全国模試’,                         icon: ‘📕’, org: ‘駿台’ },
{ id: ‘sundai-atama-kyotsu’, name: ‘駿台atama＋共通テスト模試’,            icon: ‘📕’, org: ‘駿台’ },
{ id: ‘sundai-atama-pre’,    name: ‘駿台atama＋プレ共通テスト’,            icon: ‘📕’, org: ‘駿台’ },
{ id: ‘toshin-kyotsu’,       name: ‘共通テスト本番レベル模試’,              icon: ‘📓’, org: ‘東進’ },
{ id: ‘toshin-zenkoku’,      name: ‘全国統一高校生テスト’,                  icon: ‘📓’, org: ‘東進’ },
];

const CHOICE_FORMATS = [‘1,2,3,4,5’, ‘a,b,c,d,e’, ‘ア,イ,ウ,エ,オ’, ‘A,B,C,D,E’];

const Q_TYPE = {
choice:  { label: ‘選択’,    color: ‘#1A5276’ },
extract: { label: ‘抜き出し’, color: ‘#117A65’ },
essay:   { label: ‘記述’,    color: ‘#7D3C98’ },
};

// =============================================
//  状態
// =============================================
let nickname       = ‘’;
let currentSeries  = null;
let currentRoom    = null;
let currentSubject = null;
let unsubMessages  = null;
let tempSchema     = [];
const pendingAnswers = {};

export function setNickname(nick) { nickname = nick; }

// =============================================
//  初期化
// =============================================
export function initExam() {
renderSeriesList();
}

// =============================================
//  模試シリーズ一覧
// =============================================
function renderSeriesList() {
showView(‘mosshi-view-series’);
setBreadcrumb([]);
const el = document.getElementById(‘mosshi-series-grid’);
if (!el) return;

// 主催団体でグループ化
const groups = {};
EXAM_SERIES.forEach(s => {
if (!groups[s.org]) groups[s.org] = [];
groups[s.org].push(s);
});

let html = ‘’;
Object.entries(groups).forEach(([org, series]) => {
html += `<div style="margin-bottom:28px;"> <div style="font-family:'Zen Kaku Gothic New',sans-serif;font-weight:900; font-size:0.9rem;color:var(--ink-light);letter-spacing:0.05em; margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border);"> ${org} </div> <div style="display:flex;flex-direction:column;gap:8px;"> ${series.map(s =>`
<div class="list-card" onclick="Exam.enterSeries('${s.id}','${s.name}')">
<div>
<div class="list-card-title">${s.icon} ${s.name}</div>
</div>
<div class="list-card-chevron">›</div>
</div>`).join("")} </div> </div>`;
});

el.innerHTML = html;
}

// =============================================
//  回（実施日）一覧
// =============================================
export async function enterSeries(seriesId, seriesName) {
currentSeries = { id: seriesId, name: seriesName };
showView(‘mosshi-view-rooms’);
setBreadcrumb([
{ label: ‘トップ’, fn: “Exam.backToSeries()” },
{ label: seriesName }
]);
const t = document.getElementById(‘mosshi-rooms-title’);
if (t) t.textContent = seriesName;
await loadRooms();
}

async function loadRooms() {
const grid = document.getElementById(‘mosshi-rooms-grid’);
if (!grid) return;
grid.innerHTML = ‘<div class="loading">読み込み中…</div>’;
const snap = await getDocs(collection(db, ‘mosshi_series’, currentSeries.id, ‘rooms’));
const rooms = [];
snap.forEach(d => rooms.push({ id: d.id, …d.data() }));
rooms.sort((a,b) => (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
const cnt = document.getElementById(‘mosshi-rooms-count’);
if (cnt) cnt.textContent = rooms.length + ‘回’;
if (rooms.length === 0) {
grid.innerHTML = `<div class="empty-state"><div class="icon">📭</div> <p>まだ部屋がありません<br>「＋ 回を追加する」から作れます</p></div>`;
return;
}
grid.innerHTML = rooms.map(r => ` <div class="card" onclick="Exam.enterRoom('${r.id}','${esc(r.name)}')"> <div class="card-icon">📅</div> <div class="card-title">${esc(r.name)}</div> <div class="card-meta"><span>💬 ${r.msgCount||0}件</span><span>📝 ${r.subjectCount||0}教科</span></div> <div class="card-arrow">›</div> </div>`).join(’’);
}

// =============================================
//  部屋（実施回）
// =============================================
export async function enterRoom(roomId, roomName) {
currentRoom = { id: roomId, name: roomName, seriesId: currentSeries.id };
showView(‘mosshi-view-room’);
setBreadcrumb([
{ label: ‘トップ’, fn: “Exam.backToSeries()” },
{ label: currentSeries.name, fn: `Exam.enterSeries('${currentSeries.id}','${esc(currentSeries.name)}')` },
{ label: roomName }
]);
const t = document.getElementById(‘mosshi-room-title’);
const s = document.getElementById(‘mosshi-room-sup’);
if (t) t.textContent = roomName;
if (s) s.textContent = currentSeries.name;
await loadSubjects();
startRoomChat();
}

async function loadSubjects() {
const grid = document.getElementById(‘mosshi-subject-grid’);
if (!grid) return;
const snap = await getDocs(
collection(db,‘mosshi_series’,currentRoom.seriesId,‘rooms’,currentRoom.id,‘subjects’));
const subjects = [];
snap.forEach(d => subjects.push({ id: d.id, …d.data() }));
if (subjects.length === 0) {
grid.innerHTML = `<div style="font-size:0.84rem;color:#bbb;padding:12px 0"> まだ教科がありません。下のボタンから追加してください。</div>`;
return;
}
grid.innerHTML = subjects.map(s => ` <div class="list-card" onclick="Exam.enterSubject('${s.id}','${esc(s.name)}')"> <div> <div class="list-card-title">${esc(s.name)}</div> <div class="list-card-sub">回答 ${s.answerCount||0}件</div> </div> <div class="list-card-chevron">›</div> </div>`).join(’’);
}

function startRoomChat() {
if (unsubMessages) unsubMessages();
const area = document.getElementById(‘mosshi-room-messages’);
if (area) area.innerHTML = ‘<div class="loading">読み込み中…</div>’;
unsubMessages = subscribeChat(
[‘mosshi_series’, currentRoom.seriesId, ‘rooms’, currentRoom.id, ‘messages’],
msgs => {
const a = document.getElementById(‘mosshi-room-messages’);
if (!a) return;
const atBot = a.scrollHeight - a.scrollTop - a.clientHeight < 80;
const cnt = document.getElementById(‘mosshi-room-msg-count’);
if (cnt) cnt.textContent = msgs.length;
a.innerHTML = renderMessages(msgs, nickname);
if (atBot) a.scrollTop = a.scrollHeight;
}
);
}

export async function sendRoomMessage() {
const input = document.getElementById(‘mosshi-room-chat-input’);
const btn   = document.getElementById(‘mosshi-room-send-btn’);
if (!input || !btn) return;
const text = input.value.trim();
if (!text || !currentRoom) return;
input.value = ‘’;
autoResize(input);
btn.disabled = true;
try {
await sendChatMessage(
[‘mosshi_series’, currentRoom.seriesId, ‘rooms’, currentRoom.id, ‘messages’],
nickname, text);
await updateDoc(
doc(db,‘mosshi_series’,currentRoom.seriesId,‘rooms’,currentRoom.id),
{ msgCount: increment(1) });
} finally { btn.disabled = false; input.focus(); }
}

// =============================================
//  教科 → 回答共有
// =============================================
export async function enterSubject(subjectId, subjectName) {
currentSubject = { id: subjectId, name: subjectName };
showView(‘mosshi-view-subject’);
setBreadcrumb([
{ label: ‘トップ’, fn: “Exam.backToSeries()” },
{ label: currentSeries.name, fn: `Exam.enterSeries('${currentSeries.id}','${esc(currentSeries.name)}')` },
{ label: currentRoom.name, fn: `Exam.enterRoom('${currentRoom.id}','${esc(currentRoom.name)}')` },
{ label: subjectName }
]);
const t = document.getElementById(‘mosshi-subject-title’);
const s = document.getElementById(‘mosshi-subject-sup’);
if (t) t.textContent = subjectName;
if (s) s.textContent = currentRoom.name;
await loadAnswerForm();
}

async function loadAnswerForm() {
const container = document.getElementById(‘mosshi-answer-container’);
if (!container) return;
container.innerHTML = ‘<div class="loading">読み込み中…</div>’;

const schemaRef = doc(db,‘mosshi_series’,currentRoom.seriesId,
‘rooms’,currentRoom.id,‘subjects’,currentSubject.id);
const schemaSnap = await getDoc(schemaRef);
const schema = schemaSnap.exists() ? (schemaSnap.data().schema || []) : [];

const myRef = doc(db,‘mosshi_series’,currentRoom.seriesId,
‘rooms’,currentRoom.id,‘subjects’,currentSubject.id,
‘answers’, nickname || ‘**guest**’);
const mySnap = await getDoc(myRef);
const myAnswers = mySnap.exists() ? (mySnap.data().answers || {}) : {};

const allSnap = await getDocs(collection(db,‘mosshi_series’,currentRoom.seriesId,
‘rooms’,currentRoom.id,‘subjects’,currentSubject.id,‘answers’));
const allAnswers = [];
allSnap.forEach(d => allAnswers.push(d.data()));

if (schema.length === 0) {
container.innerHTML = ` <div class="empty-state"><div class="icon">📋</div> <p>まだ問題の型が作られていません<br>最初の人が型を作成してください</p></div> <button class="btn-primary" style="margin-top:16px;width:100%" onclick="Exam.showSchemaModal()">＋ 問題の型を作成する</button>`;
return;
}

container.innerHTML = buildAnswerFormHTML(schema, myAnswers, allAnswers);
// pending をリセット
Object.keys(pendingAnswers).forEach(k => delete pendingAnswers[k]);
Object.assign(pendingAnswers, myAnswers);
}

function buildAnswerFormHTML(schema, myAnswers, allAnswers) {
const total = allAnswers.length;
let html = ` <div style="display:flex;justify-content:space-between;align-items:center; margin-bottom:20px;flex-wrap:wrap;gap:8px;"> <div style="font-size:0.82rem;color:#999">${total}人が回答済み</div> <button class="btn-ghost" style="font-size:0.78rem;padding:6px 12px" onclick="Exam.showSchemaModal()">型を編集</button> </div>`;

schema.forEach((daimo, di) => {
html += `<div style="margin-bottom:28px;"> <div style="font-family:'Zen Kaku Gothic New',sans-serif;font-weight:900;font-size:1rem; color:var(--ink);margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid var(--border);"> 大問 ${di+1}</div>`;

```
daimo.questions.forEach((q, qi) => {
  const key = `${di}-${qi}`;
  const myAns = myAnswers[key] || '';
  const ti = Q_TYPE[q.type];

  // 集計
  const counts = {};
  let ttl = 0;
  allAnswers.forEach(a => {
    const v = (a.answers||{})[key];
    if (v) { counts[v]=(counts[v]||0)+1; ttl++; }
  });

  html += `<div style="background:white;border:1.5px solid var(--border);border-radius:6px;
    padding:14px 16px;margin-bottom:10px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span style="font-size:0.73rem;font-weight:700;color:white;background:${ti.color};
        padding:2px 7px;border-radius:3px;">${ti.label}</span>
      <span style="font-weight:700;font-size:0.9rem;">問${qi+1}</span>
    </div>`;

  if (q.type === 'choice') {
    const opts = choiceOpts(q.format, q.count);
    html += `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">`;
    opts.forEach(opt => {
      const sel = myAns === opt;
      html += `<button onclick="Exam.selectChoice('${key}','${opt}')"
        data-choice-key="${key}" data-choice-val="${opt}"
        style="padding:8px 18px;border-radius:4px;font-family:inherit;font-size:0.9rem;
          font-weight:700;cursor:pointer;transition:all 0.15s;
          background:${sel?'var(--red)':'white'};
          color:${sel?'white':'var(--ink)'};
          border:2px solid ${sel?'var(--red)':'var(--border)'}">
        ${opt}</button>`;
    });
    html += `</div>`;
    if (ttl > 0) {
      html += `<div>`;
      opts.forEach(opt => {
        const cnt = counts[opt]||0;
        const pct = Math.round(cnt/ttl*100);
        html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;font-size:0.78rem;">
          <span style="width:22px;font-weight:700;color:var(--ink-light)">${opt}</span>
          <div style="flex:1;background:#f0ebe0;border-radius:3px;height:18px;position:relative;">
            <div style="width:${pct}%;background:var(--red);height:100%;border-radius:3px;opacity:0.65;"></div>
            <span style="position:absolute;left:8px;top:50%;transform:translateY(-50%);
              font-size:0.73rem;font-weight:700;">${pct}% (${cnt}人)</span>
          </div></div>`;
      });
      html += `</div>`;
    }
  } else if (q.type === 'extract') {
    html += `<input class="input-field" type="text" placeholder="抜き出した言葉を入力..."
      value="${esc(myAns)}" onchange="Exam.saveExtract('${key}',this.value)"
      style="margin-bottom:8px;">`;
    if (ttl > 0) {
      const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5);
      html += `<div style="font-size:0.78rem;color:#999;margin-top:4px;">みんなの回答：`;
      sorted.forEach(([val, cnt]) => {
        html += `<span style="background:var(--paper);border:1px solid var(--border);
          padding:2px 8px;border-radius:12px;margin:0 4px 4px 0;display:inline-block;">
          ${esc(val)} <strong>${cnt}人</strong></span>`;
      });
      html += `</div>`;
    }
  } else {
    html += `<div style="background:var(--paper);border:1px dashed var(--border);
      border-radius:4px;padding:10px;font-size:0.82rem;color:#bbb;text-align:center;">
      記述問題は入力できません</div>`;
  }

  html += `</div>`;
});
html += `</div>`;
```

});

html += `<button class="btn-primary" style="width:100%;margin-top:8px" onclick="Exam.saveAllAnswers()">回答を保存する</button>`;
return html;
}

function choiceOpts(format, count) {
const map = {
‘1,2,3,4,5’: [‘1’,‘2’,‘3’,‘4’,‘5’],
‘a,b,c,d,e’: [‘a’,‘b’,‘c’,‘d’,‘e’],
‘ア,イ,ウ,エ,オ’: [‘ア’,‘イ’,‘ウ’,‘エ’,‘オ’],
‘A,B,C,D,E’: [‘A’,‘B’,‘C’,‘D’,‘E’],
};
return (map[format] || [‘1’,‘2’,‘3’,‘4’,‘5’]).slice(0, count||4);
}

// =============================================
//  回答操作
// =============================================
export function selectChoice(key, val) {
pendingAnswers[key] = val;
document.querySelectorAll(`[data-choice-key="${key}"]`).forEach(btn => {
const sel = btn.dataset.choiceVal === val;
btn.style.background  = sel ? ‘var(–red)’ : ‘white’;
btn.style.color       = sel ? ‘white’ : ‘var(–ink)’;
btn.style.borderColor = sel ? ‘var(–red)’ : ‘var(–border)’;
});
}

export function saveExtract(key, val) {
pendingAnswers[key] = val;
}

export async function saveAllAnswers() {
if (!nickname) { alert(‘ニックネームを入力してください’); return; }
if (!Object.keys(pendingAnswers).length) { alert(‘回答を入力してください’); return; }
const ref = doc(db,‘mosshi_series’,currentRoom.seriesId,
‘rooms’,currentRoom.id,‘subjects’,currentSubject.id,‘answers’,nickname);
const ex = await getDoc(ref);
const merged = { …(ex.exists()?ex.data().answers:{}), …pendingAnswers };
await setDoc(ref, { answers: merged, nick: nickname, updatedAt: serverTimestamp() });
if (!ex.exists()) {
await updateDoc(doc(db,‘mosshi_series’,currentRoom.seriesId,
‘rooms’,currentRoom.id,‘subjects’,currentSubject.id),
{ answerCount: increment(1) });
}
await loadAnswerForm();
alert(‘回答を保存しました！’);
}

// =============================================
//  型（スキーマ）作成
// =============================================
export function showSchemaModal() {
if (!nickname) { alert(‘ニックネームを入力してください’); return; }
tempSchema = [{ questions: [] }];
renderSchemaEditor();
document.getElementById(‘schemaOverlay’).style.display = ‘flex’;
}

export function closeSchemaModal() {
document.getElementById(‘schemaOverlay’).style.display = ‘none’;
}

export function addDaimo() {
tempSchema.push({ questions: [] });
renderSchemaEditor();
}

export function addQuestion(di) {
tempSchema[di].questions.push({ type: ‘choice’, format: ‘1,2,3,4,5’, count: 4 });
renderSchemaEditor();
}

export function removeQuestion(di, qi) {
tempSchema[di].questions.splice(qi, 1);
renderSchemaEditor();
}

export function updateQuestion(di, qi, field, value) {
tempSchema[di].questions[qi][field] = field === ‘count’ ? parseInt(value) : value;
renderSchemaEditor();
}

function renderSchemaEditor() {
const el = document.getElementById(‘schema-editor’);
if (!el) return;
let html = ‘’;
tempSchema.forEach((daimo, di) => {
html += `<div style="background:var(--paper);border:1px solid var(--border); border-radius:6px;padding:14px;margin-bottom:14px;"> <div style="font-family:'Zen Kaku Gothic New',sans-serif;font-weight:900; font-size:0.95rem;margin-bottom:10px;">大問 ${di+1}</div>`;
daimo.questions.forEach((q, qi) => {
html += `<div style="background:white;border:1px solid var(--border); border-radius:4px;padding:10px 12px;margin-bottom:8px;"> <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;"> <span style="font-size:0.8rem;font-weight:700;color:var(--ink-light);min-width:36px;">問${qi+1}</span> <select onchange="Exam.updateQuestion(${di},${qi},'type',this.value)" style="padding:5px 8px;border:1.5px solid var(--border);border-radius:4px; font-family:inherit;font-size:0.8rem;background:white;outline:none;"> <option value="choice"  ${q.type==='choice' ?'selected':''}>選択</option> <option value="extract" ${q.type==='extract'?'selected':''}>抜き出し</option> <option value="essay"   ${q.type==='essay'  ?'selected':''}>記述</option> </select>`;
if (q.type === ‘choice’) {
html += ` <select onchange="Exam.updateQuestion(${di},${qi},'format',this.value)" style="padding:5px 8px;border:1.5px solid var(--border);border-radius:4px; font-family:inherit;font-size:0.8rem;background:white;outline:none;"> ${CHOICE_FORMATS.map(f=>`<option value=”${f}” ${q.format===f?‘selected’:’’}>${f.split(’,’).join(’/’)}</option>`).join('')} </select> <select onchange="Exam.updateQuestion(${di},${qi},'count',this.value)" style="padding:5px 8px;border:1.5px solid var(--border);border-radius:4px; font-family:inherit;font-size:0.8rem;background:white;outline:none;"> ${[2,3,4,5].map(n=>`<option value=”${n}” ${q.count===n?‘selected’:’’}>${n}択</option>`).join('')} </select>`;
}
html += ` <button onclick="Exam.removeQuestion(${di},${qi})" style="margin-left:auto;padding:3px 10px;background:none; border:1px solid #ddd;border-radius:4px;cursor:pointer; font-size:0.74rem;color:#999;font-family:inherit;">削除</button> </div></div>`;
});
html += `<button onclick="Exam.addQuestion(${di})" style="width:100%;padding:8px;background:none;border:1px dashed var(--border); border-radius:4px;color:var(--ink-light);font-family:inherit;font-size:0.8rem;cursor:pointer;"> ＋ 問題を追加</button></div>`;
});
el.innerHTML = html;
}

export async function saveSchema() {
const totalQ = tempSchema.reduce((s,d)=>s+d.questions.length,0);
if (totalQ === 0) { alert(‘問題を1つ以上追加してください’); return; }
await updateDoc(
doc(db,‘mosshi_series’,currentRoom.seriesId,‘rooms’,currentRoom.id,‘subjects’,currentSubject.id),
{ schema: tempSchema });
closeSchemaModal();
await loadAnswerForm();
}

// =============================================
//  部屋追加
// =============================================
export function showAddRoomModal() {
if (!nickname) { alert(‘ニックネームを入力してください’); return; }
document.getElementById(‘addRoomOverlay’).style.display = ‘flex’;
}
export function closeAddRoomModal() {
document.getElementById(‘addRoomOverlay’).style.display = ‘none’;
}
export async function submitAddRoom() {
const name = document.getElementById(‘newRoomName’).value.trim();
if (!name || !currentSeries) { alert(‘名前を入力してください’); return; }
await addDoc(collection(db,‘mosshi_series’,currentSeries.id,‘rooms’),
{ name, msgCount:0, subjectCount:0, createdAt: serverTimestamp() });
closeAddRoomModal();
document.getElementById(‘newRoomName’).value = ‘’;
await loadRooms();
}

// =============================================
//  教科追加
// =============================================
export function showAddSubjectModal() {
if (!nickname) { alert(‘ニックネームを入力してください’); return; }
document.getElementById(‘addSubjectOverlay’).style.display = ‘flex’;
}
export function closeAddSubjectModal() {
document.getElementById(‘addSubjectOverlay’).style.display = ‘none’;
}
export async function submitAddSubject() {
const name = document.getElementById(‘newSubjectName’).value.trim();
if (!name || !currentRoom) { alert(‘教科名を入力してください’); return; }
const snap = await getDocs(collection(db,‘mosshi_series’,currentRoom.seriesId,
‘rooms’,currentRoom.id,‘subjects’));
let exists = false;
snap.forEach(d => { if (d.data().name === name) exists = true; });
if (exists && !confirm(‘既に同じ教科名が存在します。よろしいですか？’)) return;
await addDoc(collection(db,‘mosshi_series’,currentRoom.seriesId,‘rooms’,currentRoom.id,‘subjects’),
{ name, answerCount:0, schema:[], createdAt: serverTimestamp() });
await updateDoc(doc(db,‘mosshi_series’,currentRoom.seriesId,‘rooms’,currentRoom.id),
{ subjectCount: increment(1) });
closeAddSubjectModal();
document.getElementById(‘newSubjectName’).value = ‘’;
await loadSubjects();
}

// =============================================
//  ナビゲーション
// =============================================
export function backToSeries() {
if (unsubMessages) { unsubMessages(); unsubMessages = null; }
currentRoom = null; currentSubject = null;
renderSeriesList();
}
export function backToRoom() {
currentSubject = null;
enterRoom(currentRoom.id, currentRoom.name);
}

function showView(id) {
document.querySelectorAll(’.mosshi-view’).forEach(v => v.classList.remove(‘active’));
const el = document.getElementById(id);
if (el) el.classList.add(‘active’);
window.scrollTo(0,0);
}
