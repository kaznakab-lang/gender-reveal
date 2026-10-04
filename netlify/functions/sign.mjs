/* =====================================================================
   POST /api/sign … アプリで「CMなし」を買ったあとに呼ばれる。

   アプリから届くもの： { jws: App Store の購入データ, body: URLの # の後ろの本体 }
   返すもの：          { sig: 署名 }  → アプリが URL を「本体.署名」にして完成

   1. 購入データが本物の Apple のものか確かめる（netlify/lib/apple-jws.mjs）
   2. このアプリの「CMなし」商品か、返金されていないか確かめる
   3. 1回の購入で作れるURLは1つだけ（使った購入番号を Netlify Blobs に記録）
      ※ URLそのものは保存しない。照合用に、元に戻せない形（ハッシュ）だけを残す
      ※ 通信が切れて同じ購入・同じURLで再送されたときは、同じ署名を返す
   4. 署名して返す
   ===================================================================== */
import { createHash } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { verifyAppleJWS } from '../lib/apple-jws.mjs';
import { signBody } from '../lib/reveal-sign.mjs';
import { RevealToken } from '../../src/token.js';

export const BUNDLE_ID = 'com.webkuuta.reveal';
export const PRODUCT_ID = 'com.webkuuta.reveal.noad2';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};
const reply = (status, data) => {
  // Netlify のログ（Logs → Functions → sign）に結果だけ残す。購入データや署名は書かない
  if (status !== 200) console.log('sign', status, JSON.stringify(data));
  else console.log('sign 200 ok');
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS } });
};

// テストしやすいように、保存先と鍵を外から渡せる形にしている
export async function handle(req, { store, signKey, verifyOptions } = {}) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'method' });

  let input;
  try { input = await req.json(); } catch { return reply(400, { error: 'bad_request' }); }
  const { jws, body } = input || {};
  if (typeof jws !== 'string' || jws.length > 20000 || typeof body !== 'string' || body.length > 40) return reply(400, { error: 'bad_request' });

  const tok = RevealToken.decode(body);
  if (!tok || tok.sig || !tok.noadRequested || tok.body !== body) return reply(400, { error: 'bad_token' });

  let tx;
  try { tx = verifyAppleJWS(jws, verifyOptions); } catch (e) { return reply(403, { error: 'bad_purchase', why: e.message }); }
  if (tx.bundleId !== BUNDLE_ID || tx.productId !== PRODUCT_ID) return reply(403, { error: 'wrong_product' });
  if (tx.revocationDate) return reply(403, { error: 'refunded' });
  if (!tx.transactionId) return reply(403, { error: 'bad_purchase' });

  const key = 'tx-' + String(tx.transactionId).replace(/[^0-9A-Za-z_-]/g, '');
  const urlHash = createHash('sha256').update('gr1:' + body).digest('base64url');
  const record = { urlHash, environment: tx.environment || '', signedAt: new Date().toISOString() };
  const { modified } = await store.setJSON(key, record, { onlyIfNew: true });
  if (!modified) {
    const prev = await store.get(key, { type: 'json' });
    if (!prev || prev.urlHash !== urlHash) return reply(409, { error: 'already_used' });
  }

  try { return reply(200, { sig: signBody(body, signKey) }); }
  catch (e) { return reply(500, { error: 'not_configured', why: e.message }); }
}

const env = (k) => (globalThis.Netlify?.env?.get(k) ?? process.env[k]);

export default (req) => handle(req, {
  store: getStore({ name: 'noad-purchases', consistency: 'strong' }),
  signKey: env('REVEAL_SIGN_KEY'),
});

export const config = { path: '/api/sign' };
