import './style.css';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Browser } from '@capacitor/browser';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import { RevealToken } from './token.js';

// 受け取る人が開くサイト（Netlify）
const SITE = 'https://webkuuta.com';
// 「CMなし」の商品（App Store Connect で作る「消耗型」の App 内課金。URL1つにつき1回）
const PRODUCT_ID = 'com.webkuuta.reveal.noad';
// 購入のあと、CMなしの署名をもらう所（netlify/functions/sign.mjs）
const SIGN_API = `${SITE}/api/sign`;
// 購入は済んだのに署名をもらう前に通信が切れたとき、やり直せるように覚えておく
const PENDING_KEY = 'gr-pending-noad';

const $ = (s) => document.querySelector(s);
const st = { step: 1, sex: null, plan: null, url: '', paid: null, working: false };
const pressed = (ids, on) => ids.forEach((id) => $(id).setAttribute('aria-pressed', String(id === on)));
const sexName = (sex) => (sex === 'boy' ? '男の子' : '女の子');
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), Math.max(1800, msg.length * 90));
}
function busy(msg) {
  $('#busy').hidden = !msg;
  if (msg) $('#busyText').textContent = msg;
}
const freeUrl = (sex) => `${SITE}/r#${RevealToken.encode(sex, false)}`;
const paidUrl = (body, sig) => `${SITE}/r#${body}.${sig}`;

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
  $('#btnBack').hidden = st.step === 1; // できあがり画面からも、CMの選択に戻れる
  $('#btnShare').hidden = st.step !== 4;
  window.scrollTo({ top: 0 });
}

function showDone() {
  $('#url').textContent = st.url;
  $('#sumSex').textContent = sexName(st.sex) + '（受け取った人にはひみつ）';
  $('#sumPlan').textContent = st.plan === 'paid' ? 'なし（購入済み）' : 'あり（無料）';
  st.step = 4; render();
}

async function finish() {
  if (st.working) return;
  if (st.plan !== 'paid') { st.url = freeUrl(st.sex); showDone(); return; }
  // 同じ性別で買ったURLがあれば、それを出す（戻って押し直しても、二重に払わない）
  if (st.paid && st.paid.sex === st.sex) { st.url = st.paid.url; showDone(); return; }
  st.working = true;
  try {
    const url = await buyNoad(st.sex);
    if (url) { st.paid = { sex: st.sex, url }; st.url = url; showDone(); }
  } finally { st.working = false; busy(false); }
}

/* ================= CMなし（100円） =================
   1. URLの本体（CMなしの印つき）を作る
   2. App Store で購入する → Apple の署名つき購入データ（JWS）が届く
   3. 購入データと本体を Netlify に送る → Apple の本物と確かめて、署名を返してくれる
   4. 「本体.署名」をURLにする。受け取る側の画面が署名を確かめて、CMを流さない */
async function buyNoad(sex) {
  if (!Capacitor.isNativePlatform()) { toast('購入はiPhoneアプリで行えます'); return null; }

  // 前回、購入は済んだのにURLを作る前に止まっていたら、その続きから（追加の支払いはなし）
  const pending = loadPending();
  if (pending) {
    if (pending.sex !== sex) {
      st.sex = pending.sex; pressed(['#optBoy', '#optGirl'], pending.sex === 'boy' ? '#optBoy' : '#optGirl');
      toast(`お支払い済みの「${sexName(pending.sex)}」のURLを作ります`);
    }
    return redeem(pending);
  }

  const body = RevealToken.encode(sex, true);
  busy('App Store に接続しています…');
  let tx;
  try {
    tx = await NativePurchases.purchaseProduct({ productIdentifier: PRODUCT_ID, productType: PURCHASE_TYPE.INAPP, quantity: 1 });
  } catch (e) {
    busy(false);
    const msg = String((e && (e.message || e.errorMessage)) || e);
    if (/cancel/i.test(msg)) toast('購入をキャンセルしました');
    else if (/pending/i.test(msg)) toast('購入の承認待ちです。承認されたら、もう一度「URLをつくる」を押してください');
    else toast('購入できませんでした。時間をおいて、もう一度お試しください');
    return null;
  }
  if (!tx || !tx.jwsRepresentation) { busy(false); toast('購入の確認ができませんでした。時間をおいてお試しください'); return null; }

  const p = { jws: tx.jwsRepresentation, body, sex, at: Date.now() };
  savePending(p);
  return redeem(p);
}

async function redeem(p) {
  busy('購入を確認しています…');
  try {
    const r = await fetch(SIGN_API, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jws: p.jws, body: p.body }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.sig) { clearPending(); st.sex = p.sex; return paidUrl(p.body, j.sig); }
    if (r.status === 409) { clearPending(); toast('この購入は、すでに別のURLに使われています'); return null; }
    throw new Error('sign ' + r.status + ' ' + (j.error || ''));
  } catch (e) {
    console.warn(e);
    toast('通信できませんでした。電波のよい所で、もう一度「URLをつくる」を押してください（追加の料金はかかりません）');
    return null;
  } finally { busy(false); }
}

function loadPending() {
  try { const p = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); return p && p.jws && p.body ? p : null; } catch (_) { return null; }
}
function savePending(p) { try { localStorage.setItem(PENDING_KEY, JSON.stringify(p)); } catch (_) { /* ignore */ } }
function clearPending() { try { localStorage.removeItem(PENDING_KEY); } catch (_) { /* ignore */ } }

// App Store の値段（国や地域で表示が変わる）を、選ぶ画面に出す
async function loadPrice() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { products } = await NativePurchases.getProducts({ productIdentifiers: [PRODUCT_ID], productType: PURCHASE_TYPE.INAPP });
    const p = products && products[0];
    if (p && p.priceString) $('#paidPrice').textContent = p.priceString;
  } catch (_) { /* 取れなければ「100円」のまま */ }
}

/* ================= 画面の操作 ================= */
$('#optBoy').onclick = () => { st.sex = 'boy'; pressed(['#optBoy', '#optGirl'], '#optBoy'); render(); };
$('#optGirl').onclick = () => { st.sex = 'girl'; pressed(['#optBoy', '#optGirl'], '#optGirl'); render(); };
$('#optFree').onclick = () => { st.plan = 'free'; pressed(['#optFree', '#optPaid'], '#optFree'); render(); };
$('#optPaid').onclick = () => { st.plan = 'paid'; pressed(['#optFree', '#optPaid'], '#optPaid'); render(); };

// サンプル体験と送信前プレビュー：選んだ性別で、受け取る人と同じ画面を開く
$('#sample').onclick = (e) => { e.preventDefault(); openSite(freeUrl(st.sex || 'boy')); };
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
loadPrice();

// 前回、お支払いのあとURLを作る前に止まっていたら、CMの選択画面から続きができるようにする
(() => {
  const p = loadPending();
  if (!p) return;
  st.sex = p.sex; st.plan = 'paid'; st.step = 3;
  pressed(['#optBoy', '#optGirl'], p.sex === 'boy' ? '#optBoy' : '#optGirl');
  pressed(['#optFree', '#optPaid'], '#optPaid');
  render();
  toast('お支払い済みのURLがまだできていません。「URLをつくる」を押すと続きから作れます（追加の料金はかかりません）');
})();
