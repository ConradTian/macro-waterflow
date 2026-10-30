// Capstone lesson 「第 9 课：现在在哪」 (?lesson=now; user-approved 2026-10-30). Reads TODAY on the whole picture with REAL data only:
// USA to realLastDate('USA') (2026Q3) and AUS to realLastDate('AUS') (2026Q2), in five places: 河 → 地下 → 湖 → 吸力尺 → 闸, then the 三问.
// A reading, not a fit: everything after 2021 is 保留样本 (display only). It ends with 「这是读图，不是预测」.
//
// Main line L9 (the last lesson; inv hands over to it): listed in LESSONS / COURSE (part 「你」) of src/data/lessons.js; adds no diagram layer
// (src/data/layers.js LESSON_LAYER.now = null: it shows all of them). Panels 'now-*' = src/ui/now-panel.js (mountNowPanel / unmountNowPanel),
// dispatched by src/ui/lessons.js (block 「lesson now (C3)」).
//
// NUMBERS: never typed. The step texts carry {key} placeholders; NOW_NUMS[key] = [f(F), fmt] reads them from the facts F = nowFacts(),
// which are computed from realSnapshot() (src/data/real/real-snapshot.js) — plus three constants that are not data: the 调度线 (cp.piTarget),
// the valuation-lamp bands (they come WITH the snapshot: lights.valuation.bands) and the FX reactor's 1996–2021 normal (FX_FIT).
// This file stays light (it is imported at start-up for the menu): the real-data module is BOUND later by now-panel.js (bindNowData),
// which loads before the lesson's first step (src/ui/lessons.js loadPanels). Step `text` / `ending` are getters that fill the placeholders.
// tools/check_lesson_now.mjs recomputes every number from realSnapshot on its own and compares.
// Wording: 比一年前 only; the 吸力尺 band in real mode is ▶ − ▼ (结账读数: inflationExp is null in real data); the rope only in words.
import { countryParams } from './country-params.js';

export const NOW_ISOS = ['USA', 'AUS'];
export const NOW_NAME = { USA: '美国', AUS: '澳洲' };
export const NOW_TRUTH = '这是读图，不是预测';

/* ---------------------------------------------------------------- binding (now-panel.js) */
let M = null, F = null;
// m = { realSnapshot, realDates, realLastDate, groundwaterDepth (src/ui/flow.js), FX_FIT (src/data/fx-fit.js) }
export function bindNowData(m) { M = m; F = null; }
export const nowBound = () => !!M;

/* ---------------------------------------------------------------- formats (one place: the panel and the card print the same strings) */
const ok = v => typeof v === 'number' && Number.isFinite(v);
const z = (v, d) => +Math.abs(v).toFixed(d) === 0;
const sgn = (v, d) => (z(v, d) ? '' : v > 0 ? '+' : '−');
export const FMT = {
  pct: v => (ok(v) ? (v < 0 && !z(v * 100, 1) ? '−' : '') + Math.abs(v * 100).toFixed(1) + '%' : '—'),
  pct0: v => (ok(v) ? (v < 0 && !z(v * 100, 0) ? '−' : '') + Math.abs(v * 100).toFixed(0) + '%' : '—'),
  tgt: v => (ok(v) ? +(v * 100).toFixed(1) + '%' : '—'),                       // 2% / 2.5% (调度线)
  chg: v => (ok(v) ? sgn(v * 100, 1) + Math.abs(v * 100).toFixed(1) + '%' : '—'),
  pts: v => (ok(v) ? sgn(v * 100, 1) + Math.abs(v * 100).toFixed(1) + ' 个点' : '—'),
  apts0: v => (ok(v) ? Math.abs(v * 100).toFixed(0) + ' 个点' : '—'),
  x2: v => (ok(v) ? v.toFixed(2) + ' 倍' : '—'),
  n1: v => (ok(v) ? v.toFixed(1) : '—'),
  n2: v => (ok(v) ? v.toFixed(2) : '—'),
  q: d => (typeof d === 'string' && /^\d{4}Q[1-4]$/.test(d) ? `${d.slice(0, 4)} 年第${'一二三四'[+d[5] - 1]}季度` : '—'),
  str: s => (s == null ? '—' : String(s)),
};
// colour words of the valuation lamp's bands (green / yellow / red)
export const VAL_WORD = { green: '不贵', yellow: '偏贵', red: '贵' };
export const bandLevel = (v, bands) => { if (!ok(v) || !Array.isArray(bands)) return null; const b = bands.find(x => (x.lo == null || v >= x.lo) && (x.hi == null || v < x.hi)); return b ? b.level : null; };
// the 吸力尺 band colour (the same rule as exp-gauge.js gaugeSvg: ≥ 0 blue)
export const bandColour = v => (ok(v) ? (v >= 0 ? '蓝' : '红') : '—');

/* ---------------------------------------------------------------- facts: everything the lesson says, from realSnapshot */
function countryFacts(iso) {
  const dates = M.realDates(iso), date = M.realLastDate(iso), t = dates.indexOf(date);
  const S = i => M.realSnapshot(iso, i);
  const s = S(t), cp = countryParams(iso);
  const hist = []; for (let i = 0; i <= t; i++) hist.push(S(i));
  const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  // 河
  const uAll = hist.map(h => h.macro.unemployment).filter(ok);
  // 地下: private debt / GDP (= the BIS ratio: iou.bankTotal / GDP), the latest quarter that has it, vs its own mean since 1995
  const pvtOf = h => (ok(h.iou.bankTotal) && ok(h.macro.gdpNominal) && h.macro.gdpNominal > 0 ? h.iou.bankTotal / h.macro.gdpNominal : null);
  let pi = t; while (pi >= 0 && !ok(pvtOf(hist[pi]))) pi--;
  const pvtAll = hist.map(pvtOf).filter(ok);
  const long = s.cycles.long;
  const b2q = hist.filter(h => h.cycles.long.fork === 'B2').map(h => h.date);
  const pendQ = hist.filter(h => h.cycles.long.forkPending).map(h => h.date);
  const depth = typeof M.groundwaterDepth === 'function' ? M.groundwaterDepth(long) : null;
  // 湖
  const V = s.lights.valuation;
  const gold4 = S(t - 4)?.assets.gold.price;
  // 吸力尺
  const infl = s.macro.inflation, pol = s.rates.policy;
  return {
    iso, name: NOW_NAME[iso], date, t,
    infl, target: cp.piTarget, u: s.macro.unemployment, uAvg: mean(uAll), uN: uAll.length, gap: s.macro.outputGap,
    pvt: pi >= 0 ? pvtOf(hist[pi]) : null, pvtDate: pi >= 0 ? hist[pi].date : null, pvtAvg: mean(pvtAll), pvtNotYet: pi < t,
    pvtSeries: hist.map(h => ({ date: h.date, v: pvtOf(h) })),
    long: { stage: long.stage, label: long.label, fork: long.fork, pending: long.forkPending, evidence: long.forkEvidence, b1Overlay: !!long.b1Overlay, depth },
    // ⑧ 出圈 evidence 「政府债务/GDP 三年变化」 (the same row m4 第 5 步 reads)
    govUp3: (long.evidence || []).find(e => e.name === '政府债务/GDP 三年变化') || null,
    b2From: b2q[0] || null, b2To: b2q[b2q.length - 1] || null, b2N: b2q.length, pendQ,
    short: s.cycles.short.label,
    house: V.parts.house, equity: V.parts.equity, valBands: V.bands, valAxis: V.axis,
    houseLv: bandLevel(V.parts.house, V.bands), equityLv: bandLevel(V.parts.equity, V.bands),
    cape: s.assets.equity.pe, gov10y: s.rates.gov10y, bondReal: ok(s.rates.gov10y) && ok(infl) ? s.rates.gov10y - infl : null,
    goldYoY: ok(s.assets.gold.price) && ok(gold4) && gold4 > 0 ? s.assets.gold.price / gold4 - 1 : null,
    pol, band: s.rates.realPolicy, exp: s.macro.inflationExp,
    inReserved: !!s.real.inReserved, reservedFrom: s.real.reservedFrom,
  };
}
// the 闸 (AUD) at AUS's last real quarter: the needle from the data (1 澳元 in USD, 比一年前), the fast pipe's input (policy-rate gap
// AUS − US, mean of the last four quarters, as the reactor) against the reactor's 1996–2021 normal (FX_FIT), pushed by the fit's sign
function gateFacts() {
  const date = M.realLastDate('AUS'), D = M.realDates('AUS'), t = D.indexOf(date);
  const a = M.realSnapshot('AUS', t), a4 = M.realSnapshot('AUS', t - 4);
  const UD = M.realDates('USA');
  let g = 0, n = 0;
  for (let k = 0; k < 4; k++) {
    const x = M.realSnapshot('AUS', t - k), y = M.realSnapshot('USA', UD.indexOf(x.date));
    if (ok(x.rates.policy) && ok(y?.rates.policy)) { g += x.rates.policy - y.rates.policy; n++; }
  }
  const FF = M.FX_FIT && M.FX_FIT.countries.AUS;
  const gap4 = n === 4 ? g / 4 : null, mean = FF ? FF.mean.rate / 100 : null, coef = FF ? FF.coef.rate : null;
  const push = ok(gap4) && ok(mean) && ok(coef) ? coef * (gap4 - mean) * 100 : null;   // log points, the reactor's units
  const fx = a.border.fxPerUsd, fx4 = a4.border.fxPerUsd;
  return {
    date, from: a4.date, fx, fx4, audUsd: ok(fx) ? 1 / fx : null, audYoY: ok(fx) && ok(fx4) ? fx4 / fx - 1 : null,
    gap4, mean, coef, push, pushWord: !ok(push) ? '没有数据' : Math.abs(push) < 0.05 ? '几乎不推' : push > 0 ? '往强推' : '往弱推',
    reactorDate: M.FX_FIT ? M.FX_FIT.dates[M.FX_FIT.dates.length - 1] : null,
  };
}
export function nowFacts() {
  if (!M) return null;
  if (F) return F;
  F = { USA: countryFacts('USA'), AUS: countryFacts('AUS') };
  F.gate = gateFacts();
  return F;
}

/* ---------------------------------------------------------------- words (computed from the facts, never typed per quarter) */
const riverWord = c => (c.infl > c.target && c.u < c.uAvg ? '偏满：物价比一年前高过调度线，失业率低于自己的平均'
  : c.infl > c.target ? '物价高过调度线，失业率不低于平均' : c.u < c.uAvg ? '物价不高，人手紧' : '物价不高，失业率也不低');
const pvtCmp = c => (!ok(c.pvt) || !ok(c.pvtAvg) ? '没有数据' : `${c.pvt >= c.pvtAvg ? '高' : '低'} ${FMT.apts0(c.pvt - c.pvtAvg)}`);
const holeWord = c => (!ok(c.pvt) || !ok(c.pvtAvg) ? '没有数据' : c.pvt >= c.pvtAvg ? '比平常深' : '比平常浅');
export function liftWord(c) {
  const L = c.long;
  if (L.fork === 'B2' || L.stage === 5) return '已跌破吸程线（B2）';
  if (L.pending) return `贴着吸程线：B2 待确认（${L.pending.have}/${L.pending.need} 季）`;
  if (ok(L.depth)) return `离吸程线还有 ${Math.round((1 - L.depth) * 100)}%`;
  return '没跌破吸程线；这一段长周期不读 B2 证据（B2 只在 ① ② 段判断），B2 没确认，也不在待确认';
}
const lakeWord = c => {
  const parts = [['股票', c.equityLv], ['房子', c.houseLv]].filter(([, l]) => l);
  return parts.map(([n, l]) => `${n}${VAL_WORD[l]}`).join('、');
};
const both = (Fx, word, same, diff) => { const u = word(Fx.USA), a = word(Fx.AUS); return u === a ? same(u) : diff(u, a); };
const bandWord = v => (!ok(v) ? '—' : `${bandColour(v)}${Math.abs(v) < 0.005 ? '，贴着 0' : ''}`);

/* ---------------------------------------------------------------- placeholders: key -> [f(F), fmt] */
const U = f => Fx => f(Fx.USA), A = f => Fx => f(Fx.AUS), G = f => Fx => f(Fx.gate);
export const NOW_NUMS = {
  dU: [U(c => c.date), 'q'], dA: [A(c => c.date), 'q'],
  uInfl: [U(c => c.infl), 'pct'], aInfl: [A(c => c.infl), 'pct'], uTgt: [U(c => c.target), 'tgt'], aTgt: [A(c => c.target), 'tgt'],
  uU: [U(c => c.u), 'pct'], aU: [A(c => c.u), 'pct'], uUavg: [U(c => c.uAvg), 'pct'], aUavg: [A(c => c.uAvg), 'pct'],
  uGap: [U(c => c.gap), 'chg'], aGap: [A(c => c.gap), 'chg'],
  uRiver: [U(riverWord), 'str'], aRiver: [A(riverWord), 'str'],
  uPvt: [U(c => c.pvt), 'pct0'], aPvt: [A(c => c.pvt), 'pct0'], uPvtAvg: [U(c => c.pvtAvg), 'pct0'], aPvtAvg: [A(c => c.pvtAvg), 'pct0'],
  uPvtDate: [U(c => c.pvtDate), 'q'], aPvtDate: [A(c => c.pvtDate), 'q'], uPvtCmp: [U(pvtCmp), 'str'], aPvtCmp: [A(pvtCmp), 'str'],
  uHole: [U(holeWord), 'str'], aHole: [A(holeWord), 'str'],
  uPvtNote: [U(c => (c.pvtNotYet ? `${FMT.q(c.date)}的数还没发布，` : '')), 'str'], aPvtNote: [A(c => (c.pvtNotYet ? `${FMT.q(c.date)}的数还没发布，` : '')), 'str'],
  uLong: [U(c => c.long.label), 'str'], aLong: [A(c => c.long.label), 'str'], uLift: [U(liftWord), 'str'], aLift: [A(liftWord), 'str'],
  uB2: [U(c => (c.b2From ? `${FMT.q(c.b2From)}到 ${FMT.q(c.b2To)}` : '1995 年以来没有')), 'str'],
  aB2: [A(c => (c.b2From ? `${FMT.q(c.b2From)}到 ${FMT.q(c.b2To)}` : `1995 年以来没跌破过，只有 ${c.pendQ.length} 季「待确认」`)), 'str'],
  uShort: [U(c => c.short), 'str'], aShort: [A(c => c.short), 'str'],
  // one sentence for both countries when they read the same, else one per country
  riverCon: [Fx => both(Fx, riverWord, w => `两国的河都${w}`, (u, a) => `美国的河${u}；澳洲的河${a}`), 'str'],
  liftCon: [Fx => both(Fx, liftWord, w => `两国都${w}`, (u, a) => `美国：${u}。澳洲：${a}`), 'str'],
  longCon: [Fx => both(Fx, c => c.long.label, w => `两国都是 ${w}`, (u, a) => `美国 ${u}，澳洲 ${a}`), 'str'],
  vY: [U(c => c.valBands[1].lo), 'n2'], vR: [U(c => c.valBands[2].lo), 'n2'],
  uHouse: [U(c => c.house), 'x2'], aHouse: [A(c => c.house), 'x2'], uEq: [U(c => c.equity), 'x2'], aEq: [A(c => c.equity), 'x2'],
  uHouseW: [U(c => VAL_WORD[c.houseLv]), 'str'], aHouseW: [A(c => VAL_WORD[c.houseLv]), 'str'],
  uEqW: [U(c => VAL_WORD[c.equityLv]), 'str'], aEqW: [A(c => VAL_WORD[c.equityLv]), 'str'],
  uLake: [U(lakeWord), 'str'], aLake: [A(lakeWord), 'str'],
  uCape: [U(c => c.cape), 'n1'], uBondR: [U(c => c.bondReal), 'pts'], aBondR: [A(c => c.bondReal), 'pts'],
  uGold: [U(c => c.goldYoY), 'chg'], aGold: [A(c => c.goldYoY), 'chg'],
  uPol: [U(c => c.pol), 'pct'], aPol: [A(c => c.pol), 'pct'], uBand: [U(c => c.band), 'chg'], aBand: [A(c => c.band), 'chg'],
  uBandW: [U(c => bandWord(c.band)), 'str'], aBandW: [A(c => bandWord(c.band)), 'str'],
  audUsd: [G(g => g.audUsd), 'n2'], audYoY: [G(g => g.audYoY), 'chg'], audFrom: [G(g => g.from), 'q'],
  gap4: [G(g => g.gap4), 'pts'], gapMean: [G(g => g.mean), 'pts'], pushW: [G(g => g.pushWord), 'str'], fxrDate: [G(g => g.reactorDate), 'q'],
  audMoved: [G(g => (!ok(g.audYoY) ? '没有数据' : Math.abs(g.audYoY) < 0.005 ? '基本没变' : g.audYoY > 0 ? '变强' : '变弱')), 'str'],
};
export function nowValue(key) { const Fx = nowFacts(), d = NOW_NUMS[key]; return Fx && d ? d[0](Fx) : null; }
export function nowText(key) { const d = NOW_NUMS[key]; return d ? FMT[d[1]](nowValue(key)) : '—'; }
const TOKEN = /\{(\w+)\}/g;
export function fillNow(s) {
  if (typeof s !== 'string' || !s.includes('{')) return s;
  if (!M) return s.replace(TOKEN, '…');
  return s.replace(TOKEN, (all, k) => (NOW_NUMS[k] ? nowText(k) : all));
}

/* ---------------------------------------------------------------- the lesson */
// a step whose text / ending are filled on read (getters), so the card never shows a typed number
function step(o) {
  const { text, ending, ...rest } = o;
  const st = { ...rest, rawText: text };
  Object.defineProperty(st, 'text', { enumerable: true, get: () => text.map(fillNow) });
  if (ending) {
    st.rawEnding = ending;
    Object.defineProperty(st, 'ending', { enumerable: true, get: () => Object.fromEntries(Object.entries(ending).map(([k, v]) => [k, fillNow(v)])) });
  }
  return st;
}

export const LESSON_NOW = {
  id: 'now', kind: 'now', label: '第 9 课',
  title: '现在在哪',
  question: '用整张图读今天：现在在哪？',
  oneLine: '用最新的真实数据，把整张图读一遍：河、地下、湖、吸力尺、闸，最后回答今天的三问。读图，不是预测。',
  rulesOn: 'all',
  startDate: '2025Q4', endDate: '2025Q4', mode: 'history', available: true,
  steps: [
    step({ type: 'intro', title: '问题：现在在哪？', panel: { id: 'now-map' },
      text: [
        '**结论先说：用前 8 课的整张图读今天。美国读到 {dU}，澳洲读到 {dA}，都是最新的真实数据。' + NOW_TRUTH + '。**',
        '图上是五个地方的速读：河、地下、湖、吸力尺、闸。先看每一格的颜色，下面一步拆开一格。',
        '下面分 6 步：河 → 地下 → 湖 → 吸力尺 → 闸 → 三问。2022 年起都是保留样本：模型没拿它们拟合，这里只拿来读。',
      ],
      concept: ['ringStage'] }),

    step({ type: 'reveal', title: '第 1 步：河：物价和人手', panel: { id: 'now-river' },
      text: [
        '**结论：{riverCon}。**',
        '美国（{dU}）：物价比一年前 {uInfl}，调度线 {uTgt}；失业率 {uU}，1995 年以来平均 {uUavg}。',
        '澳洲（{dA}）：物价比一年前 {aInfl}，调度线 {aTgt}；失业率 {aU}，1995 年以来平均 {aUavg}。',
        '断面装得多满（产出缺口）：美国 {uGap}（美国国会预算办公室的估计）；澳洲 {aGap}（估算：只用到当季为止的趋势线）。',
      ],
      concept: ['cpi', 'unemployment', 'outputGap'] }),

    step({ type: 'reveal', title: '第 2 步：地下：洞多深，离吸程线多远', panel: { id: 'now-ground' },
      text: [
        '**结论：美国的洞{uHole}，澳洲的洞{aHole}；两国都在 ⑦，地下水位都没跌破吸程线。**',
        '洞多深 = 私人债务占 GDP（家庭 + 企业），跟它自己 1995 年以来的平均比。美国 {uPvt}（{uPvtNote}用 {uPvtDate}的），平均 {uPvtAvg}，{uPvtCmp}。澳洲 {aPvt}（{aPvtDate}），平均 {aPvtAvg}，{aPvtCmp}。',
        '离吸程线多远，只读 B2 的证据。{liftCon}。',
        '对照：美国上一次跌破吸程线是 {uB2}；澳洲 {aB2}。',
      ],
      facts: [{ f: Fx => NOW_ISOS.every(i => Fx[i].long.stage === 7 && Fx[i].long.fork !== 'B2'), note: '两国都在 ⑦，没跌破吸程线' }],
      concept: ['pvtDebtGdp', 'groundwater', 'B2'] }),

    step({ type: 'reveal', title: '第 3 步：湖：哪个池子贵', panel: { id: 'now-lake' },
      text: [
        '**结论：美国{uLake}；澳洲{aLake}。**',
        '贵不贵只跟自己的起点比（1995 年第一季度 = 1 倍），用估值灯的同一把尺：{vY} 倍以下不贵，{vR} 倍以上贵，中间偏贵。',
        '房子（房价 ÷ 收入）：美国 {uHouse}，澳洲 {aHouse}。股票：美国看市盈率（CAPE {uCape}），{uEq}；澳洲没有市盈率，用股价 ÷ GDP 代替，{aEq}（代理）。',
        '没有估值尺的池子：国债（真实数据里没有债券价格），只看 10 年利息比物价高多少：美国 {uBondR}，澳洲 {aBondR}。黄金比一年前：美国 {uGold}（美元计），澳洲 {aGold}（澳元计）。现金看下一步的吸力尺。',
      ],
      concept: ['priceToIncome', 'equityAsset', 'lampValuation'] }),

    step({ type: 'reveal', title: '第 4 步：吸力尺：存钱的人到手多少（结账读数）', panel: { id: 'now-ruler' },
      text: [
        '**结论：两国的色带都很窄：美国 {uBand}（{uBandW}），澳洲 {aBand}（{aBandW}）。存现金的人到手大致打平。**',
        '▶ 政策利率：美国 {uPol}，澳洲 {aPol}。▼ 物价比一年前：美国 {uInfl}，澳洲 {aInfl}。',
        '这把尺本来用 ▶ − ▽（心里的涨价速度）。真实数据里没有 ▽，所以色带用 ▶ − ▼，叫**结账读数**：存钱的人到手多少。',
        '绳：两国的 ▼ 都在调度线上面。绳有没有被磨松要看 ▽；这里没有真实的 ▽，只能说：▼ 在调度线上面待得越久，绳越容易松。',
      ],
      facts: [
        { f: Fx => NOW_ISOS.every(i => Math.abs(Fx[i].band) < 0.005), note: '两国色带都很窄（|▶ − ▼| < 0.5 个点）' },
        { f: Fx => NOW_ISOS.every(i => Fx[i].exp === null), note: '真实数据里没有 ▽（inflationExp = null）' },
        { f: Fx => NOW_ISOS.every(i => Fx[i].infl > Fx[i].target), note: '两国的 ▼ 都在调度线上面' },
      ],
      concept: ['realRate', 'suction'] }),

    step({ type: 'reveal', title: '第 5 步：闸：澳元被往哪边推', panel: { id: 'now-gate' },
      text: [
        '**结论：吸力差把澳元{pushW}，可澳元比一年前反而{audMoved}（{audYoY}）：这一年，说不清的部分很大。**',
        '澳洲 {dA}：1 澳元换 {audUsd} 美元，比一年前（{audFrom}）{audYoY}。',
        '吸力差：澳洲减美国的政策利率（近四季平均）{gap4}；1996–2021 年平常是 {gapMean}。按汇率闸的同一条式子，比平常小就{pushW}。怕（恐慌指数）：没有这一季的数。',
        '下面是汇率闸本身（第 6 课的同一张图），它的拟合只到 {fxrDate}。',
      ],
      facts: [
        { f: Fx => (Fx.gate.push < 0) === /弱/.test(Fx.gate.pushWord) && (Fx.gate.audYoY > 0) === (Fx.gate.push < 0), note: '「反而」：吸力差推的方向和澳元实际走的方向相反' },
        { f: Fx => Fx.gate.gap4 < Fx.gate.mean, note: '「比平常小」：利差低于 1996–2021 的平常' },
      ],
      concept: ['fx', 'gate'] }),

    step({ type: 'reveal', title: '第 6 步：三问：今天的答案', panel: { id: 'now-sum' },
      text: [
        '**结论：两国都在 ⑦（靠增长化债）；河偏满，结账读数（▶ − ▼）贴着 0，湖里有贵的池子。' + NOW_TRUTH + '。**',
        '数据会更新，答案也会跟着变：下一季的数一发布，这一课的每个数都会重算。',
      ],
      // the fixed 三问, answered for today (USA {dU}, AUS {dA})
      ending: {
        q1: '水的问题还是河道的问题？读图像水偏多：两国物价都高过调度线（美国 {uInfl}，澳洲 {aInfl}），失业率又低于自己的平均（{uU}、{aU}）。河道变窄（油价、供给）这里不单独拆。',
        q2: '环上哪一步？大周期：{longCon}，地下水位都没跌破吸程线。小周期：美国 {uShort}，澳洲 {aShort}。',
        q3: '谁赢谁输、钱放哪？结账读数（▶ − ▼）贴着 0（美国 {uBand}，澳洲 {aBand}）：存现金的人大致打平；政府的债：⑦ 的帮手（名义增长）还在，可政府债务/GDP 这三年又升了，所以还出不了圈（见第五课「⑧ 出圈」）。湖：美国{uLake}，澳洲{aLake}。这一课只读哪个池子贵，不给买卖建议：' + NOW_TRUTH + '。',
      },
      facts: [
        { f: Fx => NOW_ISOS.every(i => Fx[i].long.stage === 7), note: '两国都在 ⑦' },
        { f: Fx => NOW_ISOS.every(i => Fx[i].infl > Fx[i].target && Fx[i].u < Fx[i].uAvg), note: '河偏满：物价高过调度线、失业率低于平均（两国）' },
        { f: Fx => NOW_ISOS.every(i => Math.abs(Fx[i].band) < 0.005), note: '结账读数贴着 0' },
        { f: Fx => NOW_ISOS.every(i => Fx[i].long.stage === 7 && Fx[i].govUp3 && Fx[i].govUp3.ok === false && Fx[i].govUp3.value > 0), note: '政府债务/GDP 三年又升了（出圈这一条不满足，两国）' },
        { f: Fx => NOW_ISOS.some(i => Fx[i].houseLv === 'red' || Fx[i].equityLv === 'red'), note: '湖里有贵的池子' },
      ],
      concept: ['longCycle', 'shortCycle'] }),
  ],
};

export default LESSON_NOW;
