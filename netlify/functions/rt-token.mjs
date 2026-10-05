/* =====================================================================
   GET /api/rt-token … 「いっしょに発表」の中継役（Ably）につなぐための、その場限りの合い言葉を出す。

   Ably の API キー（ABLY_API_KEY）は Netlify の環境変数にだけ置きます。アプリにも GitHub にも入れません。
   スマホに渡すのは、キーで署名した「トークンリクエスト」だけ（1時間で使えなくなる）。
   スマホはそれを Ably に見せて、1つのルームにだけ入れる鍵を受け取ります。

   ?secret=xxx … 主役（パパ・ママ）。secret から部屋番号を計算し、ID の頭に "host:" を付ける
   ?room=xxx   … 招待された人。ID の頭は "g:"
   Ably はメッセージに送り主の ID を必ず付ける（なりすまし不可）ので、
   「はじめる」「切る人の指名」は "host:" からのものだけを受け付ける。
   ===================================================================== */
import { createHash, createHmac, randomBytes } from 'node:crypto';

export const roomFromSecret = (secret) =>
  createHash('sha256').update('gr-room:' + secret).digest('base64url').slice(0, 12);

const ROOM_RE = /^[A-Za-z0-9_-]{12}$/;
const SECRET_RE = /^[A-Za-z0-9_-]{16,64}$/;
const TTL = 60 * 60 * 1000;

const reply = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

// Ably の仕様（トークンリクエストの署名）どおりに作る
export function tokenRequest(apiKey, clientId, room, now = Date.now()) {
  const i = apiKey.indexOf(':');
  if (i < 1) throw new Error('bad_key');
  const keyName = apiKey.slice(0, i), secret = apiKey.slice(i + 1);
  const capability = JSON.stringify({ ['room:' + room]: ['publish', 'subscribe', 'presence'] });
  const nonce = randomBytes(16).toString('hex');
  const ttl = TTL, timestamp = now;
  const text = [keyName, ttl, capability, clientId, timestamp, nonce].join('\n') + '\n';
  const mac = createHmac('sha256', secret).update(text).digest('base64');
  return { keyName, ttl, capability, clientId, timestamp, nonce, mac };
}

export async function handle(req, { apiKey } = {}) {
  if (req.method !== 'GET') return reply(405, { error: 'method' });
  const q = new URL(req.url).searchParams;
  const secret = q.get('secret'), roomQ = q.get('room');
  let room, clientId;
  if (secret) {
    if (!SECRET_RE.test(secret)) return reply(400, { error: 'bad_secret' });
    room = roomFromSecret(secret);
    clientId = 'host:' + randomBytes(5).toString('hex');
  } else {
    if (!roomQ || !ROOM_RE.test(roomQ)) return reply(400, { error: 'bad_room' });
    room = roomQ;
    clientId = 'g:' + randomBytes(6).toString('hex');
  }
  if (!apiKey) return reply(503, { error: 'not_configured' });
  try { return reply(200, tokenRequest(apiKey, clientId, room)); }
  catch { return reply(500, { error: 'bad_key' }); }
}

const env = (k) => (globalThis.Netlify?.env?.get(k) ?? process.env[k]);
export default (req) => handle(req, { apiKey: env('ABLY_API_KEY') });
export const config = { path: '/api/rt-token' };
