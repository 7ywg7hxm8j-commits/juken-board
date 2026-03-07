// =============================================
//  exam.js — 模試・回答共有機能
//  ※ このファイルは feature/mosshi ブランチで実装します
// =============================================

import { db, esc, setBreadcrumb } from './firebase.js';

let nickname = '';

export function setNickname(nick) { nickname = nick; }

export function initExam() {
  // feature/mosshi ブランチで実装
  renderComingSoon();
}

function renderComingSoon() {
  const el = document.getElementById('mosshi-content');
  if (!el) return;
  el.innerHTML = `
    <div class="coming-soon">
      <div class="cs-tag">COMING SOON</div>
      <div class="cs-icon">📝</div>
      <h3>模試・回答共有機能</h3>
      <p>
        模試・入試の回答を入力して<br>
        みんなと答え合わせができる機能を<br>
        開発中です。お楽しみに！
      </p>
    </div>
  `;
}
