/* ================= share token =================
   URLの # の後ろに付ける短い文字列。見ても性別は分かりません（ただの目隠しで、暗号ではありません）。
   形式: [salt][version, flags, random×4] を XOR で混ぜて base64url にしたもの（約11文字）。
   flags: bit0 = 女の子, bit1 = CMなし（CMなしは、のちほどサーバーの署名 ".xxxx" が付いたときだけ有効）,
          bit2 = サンプル（アプリの「CMなし版を見てみる」用。画面に「サンプル」と出る。署名はもらえない）,
          bit3 = いっしょに発表（300円。署名つきのときだけ、みんなの画面をそろえる部屋が開ける） */
const RevealToken = (() => {
  const KEY = [107, 117, 116, 97, 108, 97, 98, 111, 45, 114, 101, 118, 101, 97, 108];
  const mask = (bytes, salt) => bytes.map((b, i) => b ^ KEY[(i + salt) % KEY.length] ^ ((salt * 31 + i * 17) & 255));
  const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Array.from(atob(s), (c) => c.charCodeAt(0)); };
  function encode(sex, noad, sample, together) {
    const rnd = Array.from(crypto.getRandomValues(new Uint8Array(5)));
    const salt = rnd[0];
    const data = [1, (sex === 'girl' ? 1 : 0) | (noad ? 2 : 0) | (sample ? 4 : 0) | (together ? 8 : 0), rnd[1], rnd[2], rnd[3], rnd[4]];
    return b64u([salt, ...mask(data, salt)]);
  }
  function decode(str) {
    try {
      const [body, sig] = String(str || '').split('.');
      const bytes = unb64u(body);
      if (bytes.length !== 7) return null;
      const data = mask(bytes.slice(1), bytes[0]);
      if (data[0] !== 1) return null;
      return { sex: data[1] & 1 ? 'girl' : 'boy', noadRequested: !!(data[1] & 2), sample: !!(data[1] & 4), together: !!(data[1] & 8), body, sig: sig || null };
    } catch (e) { return null; }
  }
  return { encode, decode };
})();
export { RevealToken };
