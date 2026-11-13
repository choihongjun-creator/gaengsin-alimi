/* 갱신알리미 — 할 일 만들기, 서류끼리·가족 경고, 체류일 계산 (화면과 분리해서 시험 가능)
 * 기준 숫자는 RULES·PREP 에만 둔다. 법이 바뀌면 여기만 고친다.
 */
(function (g) {
  'use strict';

  /* ---------- 날짜 ---------- */
  function parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); }
  function addMonths(s, n) { const d = parse(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, last)); return ymd(d); }
  function diff(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); } // b - a (일)
  const minS = (a, b) => (a < b ? a : b), maxS = (a, b) => (a > b ? a : b);

  /* ---------- 서류별 할 일 (만료일 기준 며칠 전) ---------- */
  const RULES = {
    wp: [
      { key: 'prep', from: -60, to: -46, title: '노동허가서 연장 준비', act: '회사 인사팀에 연장 요청하고 준비물을 챙기세요.' },
      { key: 'apply', from: -45, to: -10, title: '노동허가서 연장 신청 기간', act: '만료 45일 전 ~ 10일 전 사이에만 신청할 수 있습니다.' }
    ],
    trc: [
      { key: 'prep', from: -60, to: -15, title: '체류증(TRC) 연장 준비', act: '노동허가서 연장이 끝난 뒤 신청합니다.' },
      { key: 'apply', from: -14, to: -1, title: '체류증 연장 마감 임박', act: '만료되면 연장이 안 되고 처음부터 새로 신청해야 합니다.' }
    ],
    passport: [
      { key: 'apply', from: -180, to: -31, title: '여권 재발급 신청', act: '대사관·총영사관에 신청하세요. 체류증 기간이 여권 기간에 묶입니다.' }
    ],
    visa: [{ key: 'apply', from: -60, to: -1, title: '비자 연장', act: '회사 담당자와 연장 방법을 확인하세요.' }],
    vnlicense: [{ key: 'apply', from: -60, to: -1, title: '베트남 운전면허 갱신', act: '체류증·한국 면허 기간과 함께 확인하세요.' }],
    krlicense: [{ key: 'apply', from: -90, to: -1, title: '한국 운전면허 갱신', act: '한국 방문 일정에 맞춰 갱신하세요.' }],
    _default: [{ key: 'apply', from: -30, to: -1, title: '갱신', act: '' }]
  };

  /* 서류별 연장 준비물 (조사로 확인한 것만. 나머지는 회사 안내) */
  const PREP = {
    trc: ['여권 (남은 기간 확인)', '기존 체류증', '연장된 노동허가서', '회사 보증 서류(NA6)와 신청서(NA8)', '증명사진 (규격은 회사에 확인)'],
    wp: ['여권', '기존 노동허가서', '그 밖의 서류는 회사 인사팀 안내에 따름'],
    passport: ['여권발급신청서', '여권용 사진', '기존 여권'],
    vnlicense: ['여권', '체류증', '기존 베트남 운전면허']
  };

  const DEP_TYPES = ['trc', 'visa']; // 가족 서류 중 주재원 서류에 딸린 것

  function memberName(state, id) { return (state.members.find(m => m.id === id) || { name: '?' }).name; }

  /* ---------- 서류끼리·가족 경고 ---------- */
  function docWarnings(state, d) {
    const w = [];
    const same = state.docs.filter(x => x.m === d.m && x.id !== d.id);
    const get = t => same.find(x => x.type === t);
    if (state.country === 'VN') {
      if (d.type === 'trc' || d.type === 'passport') {
        const trc = d.type === 'trc' ? d : get('trc'), pp = d.type === 'passport' ? d : get('passport');
        if (trc && pp && trc.exp > addDays(pp.exp, -30))
          w.push('여권이 체류증보다 먼저(또는 30일 안쪽으로) 끝납니다. 여권을 먼저 갱신해야 체류증이 제대로 나옵니다.');
      }
      if (d.type === 'trc' && get('wp')) w.push('체류증 연장은 노동허가서 연장이 먼저 끝나야 진행할 수 있습니다.');
      if (d.type === 'vnlicense') {
        const trc = get('trc'), kr = get('krlicense');
        if (trc && d.exp > trc.exp) w.push('베트남 운전면허 만료일이 체류증보다 늦습니다. 체류증이 끝나면 면허도 함께 확인하세요.');
        if (kr && d.exp > kr.exp) w.push('베트남 운전면허 만료일이 한국 면허보다 늦습니다. 한국 면허 갱신도 챙기세요.');
      }
    }
    // 가족: 동반가족의 체류 서류가 주재원 서류보다 늦게 끝나면
    const mem = state.members.find(m => m.id === d.m);
    if (mem && mem.dep && DEP_TYPES.includes(d.type)) {
      const main = state.docs.filter(x => x.m === mem.dep && (x.type === 'trc' || x.type === 'wp'));
      const first = main.sort((a, b) => (a.exp < b.exp ? -1 : 1))[0];
      if (first && d.exp > first.exp)
        w.push(`가족 체류 서류는 ${memberName(state, mem.dep)}의 서류에 딸려 있습니다. ${memberName(state, mem.dep)}의 서류(${first.exp} 만료)보다 늦게 끝나는 것으로 되어 있으니 실제 만료일을 확인하세요.`);
    }
    return w;
  }

  /* ---------- 할 일 목록 ---------- */
  // status: overdue(만료 지남) / now(지금 할 때) / soon(90일 안에 시작) / later
  function buildTasks(state, today, typeName) {
    const out = [];
    const name = typeName || (t => t);
    for (const d of state.docs) {
      const rules = RULES[d.type] || RULES._default;
      const nm = name(d);
      const deps = state.members.filter(m => m.dep === d.m);
      if (today > d.exp) {
        out.push({ id: `${d.id}:expired:${d.exp}`, docId: d.id, m: d.m, title: `${nm} 만료됨`, act: '만료된 서류입니다. 새로 받았으면 만료일을 고치고, 아니면 바로 확인하세요.',
          from: d.exp, to: d.exp, status: 'overdue', extra: [], warn: docWarnings(state, d) });
        continue;
      }
      rules.forEach(r => {
        const from = addDays(d.exp, r.from), to = addDays(d.exp, r.to);
        if (today > to) return; // 지난 단계는 다음 단계가 이어받음
        const status = today >= from ? 'now' : diff(today, from) <= 90 ? 'soon' : 'later';
        const extra = [];
        if ((d.type === 'trc' || d.type === 'wp') && deps.length) {
          deps.forEach(m => {
            const fd = state.docs.filter(x => x.m === m.id && DEP_TYPES.includes(x.type));
            extra.push(fd.length ? `${m.name} 체류 서류도 같이 연장 (${fd.map(x => x.exp + ' 만료').join(', ')})`
                                 : `${m.name} 체류 서류도 같이 확인 (앱에 등록 안 됨)`);
          });
        }
        out.push({ id: `${d.id}:${r.key}:${d.exp}`, docId: d.id, m: d.m, title: RULES[d.type] ? r.title : `${nm} ${r.title}`,
          act: r.act, from, to, status, extra, warn: docWarnings(state, d) });
      });
    }
    const rank = { overdue: 0, now: 1, soon: 2, later: 3 };
    return out.filter(t => !(state.done || {})[t.id])
      .sort((a, b) => rank[a.status] - rank[b.status] || (a.from < b.from ? -1 : 1));
  }

  /* ---------- 체류일 계산 ----------
   * stays: [{in:'베트남 입국일', out:'베트남 출국일'|'', to:'KR'|'ETC'(출국한 곳)}]
   * 날짜 셈: 입국일·출국일 모두 1일로 셈 (넉넉하게)
   */
  function sortStays(stays) { return [...stays].filter(s => s.in).sort((a, b) => (a.in < b.in ? -1 : 1)); }
  function overlap(a1, a2, b1, b2) { const s = maxS(a1, b1), e = minS(a2, b2); return s > e ? 0 : diff(s, e) + 1; }

  function vnDays(stays, from, to, today) {
    return sortStays(stays).reduce((n, s) => n + overlap(s.in, s.out || today, from, to), 0);
  }

  function stayReport(stays, today) {
    const ss = sortStays(stays);
    if (!ss.length) return null;
    const year = today.slice(0, 4);
    const yearDays = vnDays(ss, year + '-01-01', year + '-12-31', today);
    const first = ss[0].in;
    const firstEnd = addDays(addMonths(first, 12), -1);
    const firstDays = vnDays(ss, first, firstEnd, today);
    const last = ss[ss.length - 1];
    const inVN = !last.out || last.out > today;
    // 한국 마지막 출국일 = 한국에서 온 가장 최근 베트남 입국일 (첫 입국은 한국에서 온 것으로 봄)
    let krLeave = null, krNow = false;
    ss.forEach((s, i) => { if (i === 0 || ss[i - 1].to === 'KR') krLeave = s.in; });
    if (!inVN && last.to === 'KR') krNow = true;
    return {
      year, yearDays, resident183: yearDays >= 183, daysTo183: Math.max(0, 183 - yearDays),
      first, firstEnd, firstDays, inVN, krNow,
      krLeave, hi3: krLeave ? addMonths(krLeave, 3) : null, hi1: krLeave ? addMonths(krLeave, 1) : null
    };
  }

  const GL = { parse, ymd, addDays, addMonths, diff, RULES, PREP, docWarnings, buildTasks, vnDays, stayReport };
  g.GL = GL;
  if (typeof module !== 'undefined' && module.exports) module.exports = GL;
})(typeof window !== 'undefined' ? window : globalThis);
