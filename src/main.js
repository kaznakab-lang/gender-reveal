import './style.css';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Browser } from '@capacitor/browser';
import { RevealToken } from './token.js';

// 受け取る人が開くサイト（Netlify）
const SITE = 'https://webkuuta.com';

const $ = (s) => document.querySelector(s);
const st = { step: 1, sex: null, plan: null, url: '' };
const pressed = (ids, on) => ids.forEach((id) => $(id).setAttribute('aria-pressed', String(id === on)));
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 1800);
}
const revealUrl = (sex) => `${SITE}/r#${RevealToken.encode(sex, false)}`;

// サイトを開く：アプリの中ではアプリ内ブラウザ（全画面）、ブラウザで試すときは新しいタブ
async function openSite(url) {
  // 全画面で開く（下から出るシート型だと、ケーキを下へなぞったときに画面ごと動いてしまう）
  if (Capacitor.isNativePlatform()) await Browser.open({ url, presentationStyle: 'fullscreen' });
  else window.open(url, '_blank', 'noopener');
}

function render() {
  for (let i = 1; i <= 4; i++) { $('#step' + i).hidden = st.step !== i; $('#s' + i).classList.toggle('on', i <= st.step); }
  const next = $('#btnNext');
  next.hidden = st.step === 4;
  next.disabled = (st.step === 1 && !st.sex) || (st.step === 3 && !st.plan);
  next.textContent = st.step === 2 ? 'わかりました' : st.step === 3 ? 'URLをつくる' : '次へ';
  $('#btnBack').hidden = st.step === 1 || st.step === 4;
  $('#btnShare').hidden = st.step !== 4;
  window.scrollTo({ top: 0 });
}

function finish() {
  st.url = revealUrl(st.sex);
  $('#url').textContent = st.url;
  $('#sumSex').textContent = (st.sex === 'boy' ? '男の子' : '女の子') + '（受け取った人にはひみつ）';
  $('#sumPlan').textContent = st.plan === 'paid' ? 'なし（購入済み）' : 'あり（無料）';
  st.step = 4; render();
}

$('#optBoy').onclick = () => { st.sex = 'boy'; pressed(['#optBoy', '#optGirl'], '#optBoy'); render(); };
$('#optGirl').onclick = () => { st.sex = 'girl'; pressed(['#optBoy', '#optGirl'], '#optGirl'); render(); };
$('#optFree').onclick = () => { st.plan = 'free'; pressed(['#optFree', '#optPaid'], '#optFree'); render(); };
$('#optPaid').onclick = () => { st.plan = 'paid'; pressed(['#optFree', '#optPaid'], '#optPaid'); render(); };

// サンプル体験と送信前プレビュー：選んだ性別で、受け取る人と同じ画面を開く
$('#sample').onclick = (e) => { e.preventDefault(); openSite(revealUrl(st.sex || 'boy')); };
$('#preview').onclick = (e) => { e.preventDefault(); openSite(st.url); };

$('#btnNext').onclick = () => {
  if (st.step === 3) { finish(); return; }
  st.step += 1; render();
};
$('#btnBack').onclick = () => { st.step = Math.max(1, st.step - 1); render(); };

$('#btnCopy').onclick = async () => {
  try { await navigator.clipboard.writeText(st.url); toast('コピーしました'); }
  catch (_) {
    const r = document.createRange(); r.selectNodeContents($('#url'));
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast('選択しました。長押しでコピーしてね');
  }
};

// 共有：iPhone標準の共有画面（LINE・メッセージ・メールなど、入っているアプリから選べる）
$('#btnShare').onclick = async () => {
  const data = { title: 'ジェンダーリビールが届きました', text: '赤ちゃんは男の子？女の子？ ケーキを切って確かめてね', url: st.url };
  try {
    if (Capacitor.isNativePlatform()) await Share.share({ ...data, dialogTitle: '共有する' });
    else if (navigator.share) await navigator.share(data);
    else { await navigator.clipboard.writeText(st.url); toast('URLをコピーしました'); }
  } catch (_) { /* 共有画面を閉じただけ */ }
};

render();
