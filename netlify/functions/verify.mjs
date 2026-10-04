/* =====================================================================
   POST /api/verify … 古いブラウザ向けの予備。
   ケーキの画面は、ふだんはブラウザの中で署名を確かめます。
   その確かめ方に対応していない古いブラウザだけが、ここに確かめに来ます。
   ===================================================================== */
import { verifyBody } from '../lib/reveal-sign.mjs';
import { RevealToken } from '../../src/token.js';

const reply = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default async (req) => {
  if (req.method !== 'POST') return reply(405, { ok: false });
  let input;
  try { input = await req.json(); } catch { return reply(400, { ok: false }); }
  const tok = RevealToken.decode(input && input.token);
  const ok = !!(tok && tok.noadRequested && tok.sig && verifyBody(tok.body, tok.sig));
  return reply(200, { ok });
};

export const config = { path: '/api/verify' };
