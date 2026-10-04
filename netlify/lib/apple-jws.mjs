/* =====================================================================
   App Store の購入データ（JWS）が、本当に Apple が出したものかを確かめる。

   購入すると、iPhone の StoreKit が「署名つきの購入データ」をくれます。
   その署名を、データに付いている証明書の鎖（3枚）でたどって、
   いちばん上が Apple のルート証明書（Apple Root CA - G3）であることを確かめます。
   Apple の API キーは使いません（こちらに秘密の鍵を置かずに済む方式）。

   確かめること
     1. 3枚の証明書が、いま有効期限内であること
     2. 下の証明書が、すぐ上の証明書に署名されていること（葉 ← 中間 ← ルート）
     3. ルートが Apple Root CA - G3 そのものであること（指紋で照合）
     4. 葉と中間が「App Store の購入データ用」の証明書であること（Apple が付ける印 OID で照合）
     5. 購入データ本体の署名（ES256）が、葉の証明書の鍵で正しいこと
   ===================================================================== */
import { X509Certificate, verify as cryptoVerify } from 'node:crypto';

// Apple Root CA - G3 の SHA-256 指紋（https://www.apple.com/certificateauthority/）
export const APPLE_ROOT_CA_G3_SHA256 =
  '63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79';
const OID_RECEIPT_SIGNING = '1.2.840.113635.100.6.11.1'; // 葉：App Store の購入データに署名する証明書
const OID_WWDR_INTERMEDIATE = '1.2.840.113635.100.6.2.1'; // 中間：Apple Worldwide Developer Relations

const unb64u = (s) => Buffer.from(s, 'base64url');

export function verifyAppleJWS(jws, { rootFingerprint = APPLE_ROOT_CA_G3_SHA256, now = new Date() } = {}) {
  const parts = String(jws || '').split('.');
  if (parts.length !== 3) throw new Error('jws_format');
  const header = JSON.parse(unb64u(parts[0]).toString('utf8'));
  if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length !== 3) throw new Error('jws_header');

  const [leaf, inter, root] = header.x5c.map((c) => new X509Certificate(Buffer.from(c, 'base64')));
  for (const c of [leaf, inter, root]) {
    if (!(new Date(c.validFrom) <= now && now <= new Date(c.validTo))) throw new Error('cert_expired');
  }
  if (root.fingerprint256 !== rootFingerprint) throw new Error('cert_root');
  if (!root.verify(root.publicKey)) throw new Error('cert_root_sig');
  if (!inter.checkIssued(root) || !inter.verify(root.publicKey)) throw new Error('cert_chain');
  if (!leaf.checkIssued(inter) || !leaf.verify(inter.publicKey)) throw new Error('cert_chain');
  if (!extensionOids(leaf.raw).includes(OID_RECEIPT_SIGNING)) throw new Error('cert_leaf_oid');
  if (!extensionOids(inter.raw).includes(OID_WWDR_INTERMEDIATE)) throw new Error('cert_intermediate_oid');

  const ok = cryptoVerify('sha256', Buffer.from(parts[0] + '.' + parts[1]),
    { key: leaf.publicKey, dsaEncoding: 'ieee-p1363' }, unb64u(parts[2]));
  if (!ok) throw new Error('jws_signature');
  return JSON.parse(unb64u(parts[1]).toString('utf8'));
}

/* ---- 証明書（DER）の「拡張」に並んでいる OID を読み出す（必要なところだけの小さな読み取り） ---- */
function tlv(buf, pos) {
  let len = buf[pos + 1], hdr = 2;
  if (len & 0x80) {
    const n = len & 0x7f; len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[pos + 2 + i];
    hdr = 2 + n;
  }
  if (pos + hdr + len > buf.length) throw new Error('der');
  return { tag: buf[pos], start: pos + hdr, end: pos + hdr + len };
}
function children(buf, node) {
  const out = []; let p = node.start;
  while (p < node.end) { const c = tlv(buf, p); out.push(c); p = c.end; }
  return out;
}
function oidString(b) {
  const arcs = [Math.min(2, Math.floor(b[0] / 40)), b[0] - Math.min(2, Math.floor(b[0] / 40)) * 40];
  let v = 0;
  for (let i = 1; i < b.length; i++) { v = v * 128 + (b[i] & 0x7f); if (!(b[i] & 0x80)) { arcs.push(v); v = 0; } }
  return arcs.join('.');
}
export function extensionOids(der) {
  const cert = tlv(der, 0);
  const tbs = children(der, cert)[0];
  const ext = children(der, tbs).find((c) => c.tag === 0xa3); // [3] extensions
  if (!ext) return [];
  const list = children(der, ext)[0];
  return children(der, list).map((e) => { const o = children(der, e)[0]; return oidString(der.subarray(o.start, o.end)); });
}
