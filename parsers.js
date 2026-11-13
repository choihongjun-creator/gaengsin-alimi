/* 갱신알리미 — 서류 글자에서 종류·만료일 찾기
 * 브라우저(window.GA)와 Node(module.exports) 둘 다에서 쓴다.
 * 개인정보는 돌려주지 않는다: 종류·만료일·찾은 방법만 돌려준다.
 */
(function (g) {
  'use strict';

  // 베트남어 성조 빼기 + 소문자: "đến ngày" → "den ngay"
  function norm(s) {
    return String(s || '')
      .replace(/[đĐ]/g, 'd')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')   // PDF·OCR의 여러 칸 띄어쓰기·줄바꿈을 한 칸으로
      .toLowerCase();
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function validYMD(y, m, d) {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return y + '-' + pad(m) + '-' + pad(d);
  }

  // 날짜는 베트남식 일/월/년으로 읽는다 (서류에 "day/month/year"로 적혀 있음)
  const DATE_RE = /(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{4})/g;
  function datesIn(s) {
    const out = []; let m; DATE_RE.lastIndex = 0;
    while ((m = DATE_RE.exec(s))) {
      const v = validYMD(+m[3], +m[2], +m[1]);
      if (v) out.push({ date: v, index: m.index });
    }
    return out;
  }

  /* ---------- 여권 MRZ (ICAO 9303, TD3: 44자 2줄) ---------- */
  function charVal(c) {
    if (c >= '0' && c <= '9') return +c;
    if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 55;
    return 0; // '<'
  }
  function checkDigit(s) {
    const w = [7, 3, 1]; let sum = 0;
    for (let i = 0; i < s.length; i++) sum += charVal(s[i]) * w[i % 3];
    return sum % 10;
  }
  // 숫자 자리에 OCR이 글자로 잘못 읽는 것 바로잡기
  function fixDigits(s) { return s.replace(/[OQD]/g, '0').replace(/[IL]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2'); }

  const MRZ2 = /([A-Z0-9<]{9})([0-9OQDILSBZ<])([A-Z<]{3})([0-9OQDILSBZ]{6})([0-9OQDILSBZ])([MF<])([0-9OQDILSBZ]{6})([0-9OQDILSBZ])/;
  function parseMRZ(text) {
    const lines = String(text || '').toUpperCase().replace(/[«‹]/g, '<').split(/\r?\n/)
      .map(l => l.replace(/\s+/g, ''));
    for (const line of lines) {
      if (line.length < 28) continue;
      const m = line.match(MRZ2);
      if (!m) continue;
      const exp = fixDigits(m[7]), expCd = +fixDigits(m[8]);
      const yy = +exp.slice(0, 2), mm = +exp.slice(2, 4), dd = +exp.slice(4, 6);
      const date = validYMD(2000 + yy, mm, dd); // 여권 만료는 2000년대
      if (!date) continue;
      const ok = checkDigit(exp) === expCd;
      return { type: 'passport', date, method: 'mrz', confident: ok };
    }
    return null;
  }

  /* ---------- 서류 종류 알아보기 ---------- */
  function detectType(n) {
    if (/giay phep lao dong|work\s*permit/.test(n)) return 'wp';
    if (/the tam tru|temporary resid/.test(n)) return 'trc';
    if (/giay phep lai xe|driv(ing|er'?s?)\s*licen/.test(n)) return 'vnlicense';
    if (/passport|ho chieu/.test(n) && /p<|<</.test(n)) return 'passport';
    return null;
  }

  // 만료일 앞에 오는 말 (우선순위 순)
  const KEYS = ['den ngay', 'co gia tri den', 'gia tri den', 'valid until', 'date of expiry', 'expiry date', 'expires', 'het han'];

  function findExpiry(text) {
    const mrz = parseMRZ(text);
    if (mrz) return mrz;

    const n = norm(text);
    const type = detectType(n);

    // 1) 키워드 바로 뒤 80자 안의 첫 날짜
    for (const k of KEYS) {
      let i = n.indexOf(k);
      while (i >= 0) {
        const after = n.slice(i + k.length, i + k.length + 80);
        const d = datesIn(after)[0];
        if (d) return { type, date: d.date, method: 'keyword:' + k, confident: true };
        i = n.indexOf(k, i + 1);
      }
    }
    // 2) "tu ngay A ... B" 기간 → 뒤 날짜
    const t = n.indexOf('tu ngay');
    if (t >= 0) {
      const ds = datesIn(n.slice(t, t + 120));
      if (ds.length >= 2) return { type, date: ds[1].date, method: 'range', confident: false };
    }
    // 3) 가장 늦은 날짜 (확인 꼭 받기)
    const all = datesIn(n).map(x => x.date).sort();
    if (all.length) return { type, date: all[all.length - 1], method: 'latest', confident: false };
    return { type, date: null, method: 'none', confident: false };
  }

  const GA = { norm, datesIn, checkDigit, parseMRZ, detectType, findExpiry };
  g.GA = GA;
  if (typeof module !== 'undefined' && module.exports) module.exports = GA;
})(typeof window !== 'undefined' ? window : globalThis);
