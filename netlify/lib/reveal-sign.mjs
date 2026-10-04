/* =====================================================================
   「CMなし」の署名を作る・確かめる。

   署名の対象は「gr1:」+ URLの # の後ろの本体（約10文字）。
   秘密の鍵（REVEAL_SIGN_KEY）は Netlify の環境変数にだけ置きます。アプリにも GitHub にも入れません。
   公開鍵はケーキの画面（site/r/index.html）にも同じものが入っています。
   ===================================================================== */
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';

export const SIGN_PUBLIC_KEY = 'mpHtoAouTbO7mWVnfMkBI9pZOomL7Q2szmxJ5N-FNkA';
const message = (body) => Buffer.from('gr1:' + body, 'utf8');

export function signBody(body, privateKeyBase64) {
  if (!privateKeyBase64) throw new Error('no_sign_key');
  const key = createPrivateKey({ key: Buffer.from(privateKeyBase64, 'base64'), format: 'der', type: 'pkcs8' });
  return sign(null, message(body), key).toString('base64url');
}

const publicKey = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: SIGN_PUBLIC_KEY }, format: 'jwk' });
export function verifyBody(body, sig) {
  try { return verify(null, message(body), publicKey, Buffer.from(sig, 'base64url')); } catch { return false; }
}
