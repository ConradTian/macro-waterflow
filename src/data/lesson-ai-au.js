// 专题 lesson 「专题：AI 抗冲击（澳洲家庭）」 (?lesson=ai-au; user request via the peer 2026-10-30, tools/HANDOVER.md §3 item 0b, RESTRUCTURE + CORRECTION).
// NOT part of the 9-lesson main line: registered in src/ui/lessons.js TOPIC_LESSONS, listed under 「专题」.
// Steps (one idea each, conclusion first, parts glow on the main diagram: ids from src/data/layers.js only):
//   M1 问题与结论  M2 分水堰  M3 河道与物价  M4 吸力  M5 估值  M6 地下和闸  M7 三阶段  M8 澳洲视角   (≈ 80% macro)
//   A1 诚实的一页  A2 一个假设的例子 (panel ai-alloc)                                                (≈ 20% allocation)
//   END 三问 + 「这是用框架演示的样板，不是个人建议」
// Panels 'ai-*' (src/ui/ai-au-panel.js) sit in the lesson card, so the diagram stays visible: ai-k (M2, the K by place), ai-alloc (A2 table + buttons).
//
// NUMBERS: never typed in a step text. A text carries {key} placeholders, resolved from exactly one of
//   AI_NUMS[key]  = [f(F), fmt]   computed from the repo's real data (src/data/real/*, src/data/countries/jpn-quarterly.js) or the example's
//                                 own parameters (AI_ALLOC, hypothetical) — F = aiFacts(), bound by ai-au-panel.js (bindAiData)
//   AI_FACTS[key] = { v, src, date }  a cited, dated fact that is not in the repo (papers, SITU-AWARE reports, China / Simandou facts)
// tools/check_lesson_ai_au.mjs recomputes every AI_NUMS key from the raw data on its own, checks every AI_FACTS entry has a source and a
// date, and that no ASCII digit is left in a raw text outside a placeholder (whitelist: the step ids M1..A2 in titles, the regimes B1 / B2).
// Wording: 比一年前 only (never the two banned year/quarter words); this lesson describes, it does not forecast.
import { countryParams } from './country-params.js';

export const AI_NO_ADVICE = '这是用框架演示的样板，不是个人建议';
// A1: the SITU-AWARE v2 correction, verbatim from the spec (tools/HANDOVER.md §3 item 0b)
export const AI_HONEST = '我们用公开数据做的卡点雷达和行业动量，回测里扣掉成本后都没有稳定跑赢大盘：市场比公开数据快。所以卡点只当背景，不当择时信号';
// A2: the label of the two risk-control buttons ({nTight} = AI_FACTS.nTight)
export const AI_RISK_LABEL_RAW = '风险控制，不是赚钱信号；历史上只有 {nTight} 次收紧，证据不足';
export const AI_STEP_IDS = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'A1', 'A2', 'END'];

/* ---------------------------------------------------------------- cited, dated facts (not in the repo) */
const SITU = 'SITU-AWARE（Evoquant/5_situ_aware）reports/';
export const AI_FACTS = {
  nberWp:   { v: '34423', src: 'Restrepo, P., "We Won\'t Be Missed: Work and Growth in the Era of AGI", NBER Working Paper 34423', date: '2025-10' },
  nberDate: { v: '2025 年 10 月', src: 'NBER Working Paper 34423 (Restrepo), issue date', date: '2025-10' },
  msYear:   { v: '2020', src: 'Mian, Straub & Sufi, "The Saving Glut of the Rich", NBER Working Paper 26941', date: '2020-04' },
  steelPk:  { v: '2020', src: 'worldsteel / 国家统计局：中国粗钢产量 2020 年见顶，之后没有再超过', date: '2025-01' },
  startsDn: { v: '一半', src: '国家统计局：房屋新开工面积，2024 年比 2021 年高峰少一半以上', date: '2025-01' },
  simandou: { v: '2025 年底', src: 'Rio Tinto / Simandou 项目公告：首批矿石发运', date: '2025-11' },
  situDate: { v: '2026 年 10 月 31 日版', src: SITU + 'MORNING.md（标题「早安摘要（SITU-AWARE，2026-10-31）」）', date: '2026-10-31' },
  situMonth:{ v: '2026 年 10 月', src: SITU + 'NOW.md（财报到 2026 年第二季，价格到 2026-10-02）', date: '2026-10-02' },
  radarPre: { v: '17%', src: SITU + 'MORNING.md v1 第 1 条：亮灯前 12 个月平均跑赢大盘 17%', date: '2026-10-31' },
  radarPost:{ v: '1.2%', src: SITU + 'MORNING.md v1 第 1 条：亮灯后 12 个月只多赚 1.2%', date: '2026-10-31' },
  momFrom:  { v: '2011', src: SITU + 'MORNING.md v2 第 2 条：2011 年以后', date: '2026-10-31' },
  momPost:  { v: '13.5%', src: SITU + 'MORNING.md v2 第 2 条：动量 2011 年以后 13.5%（未扣成本）', date: '2026-10-31' },
  spyPost:  { v: '14.2%', src: SITU + 'MORNING.md v2 第 2 条：SPY 2011 年以后 14.2%', date: '2026-10-31' },
  nTight:   { v: '4', src: SITU + 'MORNING.md v2 第 5 条：游戏的「收紧」规则，美国只有 4 段收紧期', date: '2026-10-31' },
  gevPp:    { v: '255', src: SITU + 'MORNING.md v1 第 7 条 / NOW.md：GE Vernova 24 个月跑赢标普 255 个百分点', date: '2026-10-02' },
  gevWin:   { v: '24 个月', src: SITU + 'NOW.md：24 个月窗口', date: '2026-10-02' },
  pipeLo:   { v: '+13%', src: SITU + 'MORNING.md v1 第 7 条：数据中心 REIT 和天然气管道 12 个月多数 +13% 到 +18%', date: '2026-10-02' },
  pipeHi:   { v: '+18%', src: SITU + 'MORNING.md v1 第 7 条', date: '2026-10-02' },
  spy12:    { v: '+16%', src: SITU + 'MORNING.md v1 第 7 条 / NOW.md：SPY 12 个月 +16.2%', date: '2026-10-02' },
};

/* ---------------------------------------------------------------- the hypothetical example (A2): NO real user data */
// Percentages in points of the liquid money. tilt = the fixed 信念仓位 (0..10 points by conviction, default 10), rebalanced yearly, NOT rotated;
// what is not in the tilt goes back to the core (global equity ex-AU, unhedged).
export const AI_ALLOC = {
  house: 700000, liquid: 300000, mortgage: 0,
  tiltOptions: [0, 5, 10], tiltDefault: 10,
  blocks: [
    { id: 'eq', name: '全球股票（不含澳洲，不对冲）' },
    { id: 'tilt', name: '信念仓位（固定，每年再平衡）' },
    { id: 'cash', name: '现金 / 短债（含应急金）' },
    { id: 'bond', name: '全球债券（对冲成澳元）' },
    { id: 'gold', name: '实物黄金' },
  ],
  coreTotal: 70, cash: 10, bond: 10, gold: 10,
  excluded: ['澳洲银行股', '澳洲 REIT'],
  emergencyMonths: 6, stagedMonths: 9, driftPp: 5, eqCut: 5,   // eqCut: the points the core gives up when a button is on
  // the two risk-control buttons (no 「卡点」-move button: removed by the SITU-AWARE v2 correction)
  triggers: [
    { id: 'tight', name: '收紧', rule: '信念仓位减半，全球股票减 {cut} 个点，都放进现金', when: '游戏的「收紧」规则亮起（央行在收紧，吸力往上）' },
    { id: 'credit', name: 'AI 信用压力', rule: '信念仓位清零、放进全球债券（对冲）；全球股票减 {cut} 个点，放进现金', when: 'AI 资本开支的借款出事：数据中心开发商、私募信贷违约变多（情景 B）' },
  ],
};
const r1 = x => Math.round(x * 10) / 10;
/** the A2 table: { eq, tilt, cash, bond, gold } in points of the liquid money (sum 100) for a tilt (0..10) and a trigger (null | 'tight' | 'credit') */
export function aiAllocTable(tilt = AI_ALLOC.tiltDefault, trig = null) {
  const A = AI_ALLOC;
  const t = { eq: A.coreTotal - tilt, tilt, cash: A.cash, bond: A.bond, gold: A.gold };
  if (trig === 'tight') { const h = tilt / 2; t.tilt = h; t.eq -= A.eqCut; t.cash += h + A.eqCut; }
  else if (trig === 'credit') { t.bond += tilt; t.tilt = 0; t.eq -= A.eqCut; t.cash += A.eqCut; }
  for (const k of Object.keys(t)) t[k] = r1(t[k]);
  return t;
}
export const audK = v => 'A$' + (Math.round(v / 100) / 10) + 'k';            // 180000 -> A$180k, 7500 -> A$7.5k

/* ---------------------------------------------------------------- binding (ai-au-panel.js) */
let M = null, F = null;
// m = { USA_REAL, AUS_REAL, JPN_Q, realSnapshot, realLastDate }
export function bindAiData(m) { M = m; F = null; }
export const aiBound = () => !!M;

const ok = v => typeof v === 'number' && Number.isFinite(v);
const z = (v, d) => +Math.abs(v).toFixed(d) === 0;
const sgn = (v, d) => (z(v, d) ? '' : v > 0 ? '+' : '−');
export const AI_FMT = {
  pct0: v => (ok(v) ? Math.abs(v * 100).toFixed(0) + '%' : '—'),
  pct1: v => (ok(v) ? (v < 0 && !z(v * 100, 1) ? '−' : '') + Math.abs(v * 100).toFixed(1) + '%' : '—'),
  pct2: v => (ok(v) ? Math.abs(v * 100).toFixed(2) + '%' : '—'),
  spct0: v => (ok(v) ? sgn(v * 100, 0) + Math.abs(v * 100).toFixed(0) + '%' : '—'),
  tgt: v => (ok(v) ? +(v * 100).toFixed(1) + '%' : '—'),
  pts: v => (ok(v) ? sgn(v * 100, 1) + Math.abs(v * 100).toFixed(1) + ' 个点' : '—'),
  n1: v => (ok(v) ? v.toFixed(1) : '—'),
  int: v => (ok(v) ? String(v) : '—'),
  pp: v => (ok(v) ? r1(v) + '%' : '—'),
  aud: v => (ok(v) ? audK(v) : '—'),
  q: d => (typeof d === 'string' && /^\d{4}Q[1-4]$/.test(d) ? `${d.slice(0, 4)} 年第${'一二三四'[+d[5] - 1]}季度` : '—'),
  str: s => (s == null ? '—' : String(s)),
};

// the latest quarter of a series that has a number (each series has its own last quarter: market rates come out before GDP)
function latest(D, k) { const a = D.series[k] || []; for (let i = a.length - 1; i >= 0; i--) if (ok(a[i])) return { v: a[i], date: D.dates[i], i }; return { v: null, date: null, i: -1 }; }
const at = (D, k, d) => { const i = D.dates.indexOf(d), v = i >= 0 ? D.series[k][i] : null; return ok(v) ? v : null; };
const span = (D, k, from, until) => { const i0 = D.dates.indexOf(from), i1 = until ? D.dates.indexOf(until) : D.dates.length - 1; const out = []; for (let i = i0; i <= i1; i++) if (ok(D.series[k][i])) out.push({ v: D.series[k][i], date: D.dates[i] }); return out; };
const qMinus = (d, n) => { let y = +d.slice(0, 4), q = +d[5] - n; while (q < 1) { q += 4; y--; } return `${y}Q${q}`; };
const firstMax = a => a.reduce((b, x) => (x.v > b.v ? x : b), a[0]);
const firstMin = a => a.reduce((b, x) => (x.v < b.v ? x : b), a[0]);

// windows the M-steps read (dates, not numbers in the text)
export const AI_WIN = { rbaFrom: '2023Q1', rbaLowFrom: '2025Q1', hhFrom: '2021Q1', hhTo: '2023Q4', hh25: '2025Q4', fxFrom: '2007Q4', fxTo: '2008Q4' };

export function aiFacts() {
  if (!M) return null;
  if (F) return F;
  const U = M.USA_REAL, A = M.AUS_REAL, J = M.JPN_Q, W = AI_WIN;
  const uC = latest(U, 'cpiYoY'), aC = latest(A, 'cpiYoY'), u10 = latest(U, 'gov10y'), a10 = latest(A, 'gov10y');
  const uP = latest(U, 'policyRate'), aP = latest(A, 'policyRate');
  // RBA path: the low since 2025Q1, the first quarter at the high before it (from 2023Q1), the latest
  const lo = firstMin(span(A, 'policyRate', W.rbaLowFrom)), loI = A.dates.indexOf(lo.date);
  const hi = firstMax(span(A, 'policyRate', W.rbaFrom, A.dates[loI]));
  // CAPE (USA): latest and its mean since the first quarter it has
  const capeAll = span(U, 'cape', U.dates[0]), cape = latest(U, 'cape');
  // AU household debt / GDP: the 2021–23 high and low, 2025Q4, the latest
  const hh = span(A, 'hhDebtGdp', W.hhFrom, W.hhTo), hhPk = firstMax(hh), hhLo = firstMin(hh), hhNow = latest(A, 'hhDebtGdp');
  // the AUD and the yen, 2007Q4 -> 2008Q4 (L6's numbers: currency per USD, so the currency's own change = before / after − 1)
  const aud08 = at(A, 'fxPerUsd', W.fxFrom) / at(A, 'fxPerUsd', W.fxTo) - 1, jpy08 = at(J, 'fxPerUsd', W.fxFrom) / at(J, 'fxPerUsd', W.fxTo) - 1;
  // the long cycle at each country's last real quarter (L9's reading)
  const long = iso => { const s = M.realSnapshot(iso, M.realLastDate(iso)); return s ? s.cycles.long : null; };
  F = {
    uCpi: uC, aCpi: aC, uTgt: countryParams('USA').piTarget, aTgt: countryParams('AUS').piTarget,
    u10, a10, u10d: u10.v - at(U, 'gov10y', qMinus(u10.date, 4)), a10d: a10.v - at(A, 'gov10y', qMinus(a10.date, 4)),
    uP, aP, rba: { hi, lo, now: aP },
    cape, capeFrom: capeAll[0] ? capeAll[0].date : null, capeAvg: capeAll.length ? capeAll.reduce((s, x) => s + x.v, 0) / capeAll.length : null,
    hhPk, hhLo, hh25: { v: at(A, 'hhDebtGdp', W.hh25), date: W.hh25 }, hhNow,
    aud08, jpy08,
    uLong: long('USA'), aLong: long('AUS'),
  };
  return F;
}

/* ---------------------------------------------------------------- placeholders: key -> [f(F), fmt] */
const AL = AI_ALLOC;
export const AI_NUMS = {
  uCpi: [f => f.uCpi.v, 'pct1'], uCpiQ: [f => f.uCpi.date, 'q'], aCpi: [f => f.aCpi.v, 'pct1'], aCpiQ: [f => f.aCpi.date, 'q'],
  uTgt: [f => f.uTgt, 'tgt'], aTgt: [f => f.aTgt, 'tgt'],
  u10: [f => f.u10.v, 'pct1'], u10Q: [f => f.u10.date, 'q'], a10: [f => f.a10.v, 'pct1'], a10Q: [f => f.a10.date, 'q'],
  u10d: [f => f.u10d, 'pts'], a10d: [f => f.a10d, 'pts'],
  uPol: [f => f.uP.v, 'pct2'], uPolQ: [f => f.uP.date, 'q'],
  rbaHi: [f => f.rba.hi.v, 'pct2'], rbaHiQ: [f => f.rba.hi.date, 'q'], rbaLo: [f => f.rba.lo.v, 'pct2'], rbaLoQ: [f => f.rba.lo.date, 'q'],
  rbaNow: [f => f.rba.now.v, 'pct2'], rbaNowQ: [f => f.rba.now.date, 'q'],
  uCape: [f => f.cape.v, 'n1'], uCapeQ: [f => f.cape.date, 'q'], uCapeAvg: [f => f.capeAvg, 'n1'], capeFrom: [f => f.capeFrom, 'q'],
  aHhPk: [f => f.hhPk.v, 'pct0'], aHhPkQ: [f => f.hhPk.date, 'q'], aHhLo: [f => f.hhLo.v, 'pct0'], aHhLoQ: [f => f.hhLo.date, 'q'],
  aHh25: [f => f.hh25.v, 'pct0'], aHh25Q: [f => f.hh25.date, 'q'], aHhNow: [f => f.hhNow.v, 'pct0'], aHhNowQ: [f => f.hhNow.date, 'q'],
  aud08: [f => f.aud08, 'spct0'], jpy08: [f => f.jpy08, 'spct0'], fxQ: [() => AI_WIN.fxTo, 'q'],
  uLong: [f => (f.uLong ? f.uLong.label : null), 'str'], aLong: [f => (f.aLong ? f.aLong.label : null), 'str'],
  // the hypothetical example's own parameters (AI_ALLOC; not data)
  house: [() => AL.house, 'aud'], liquid: [() => AL.liquid, 'aud'],
  eqPct: [() => aiAllocTable(AL.tiltDefault).eq / 100, 'pct0'], tiltMax: [() => Math.max(...AL.tiltOptions) / 100, 'pct0'],
  tiltMin: [() => Math.min(...AL.tiltOptions) / 100, 'pct0'],
  cashPct: [() => AL.cash / 100, 'pct0'], bondPct: [() => AL.bond / 100, 'pct0'], goldPct: [() => AL.gold / 100, 'pct0'],
  emerg: [() => AL.emergencyMonths, 'int'], stage: [() => AL.stagedMonths, 'int'], drift: [() => AL.driftPp, 'int'],
};
export function aiValue(key) { const Fx = aiFacts(), d = AI_NUMS[key]; return Fx && d ? d[0](Fx) : null; }
export function aiText(key) {
  if (AI_FACTS[key]) return AI_FACTS[key].v;
  const d = AI_NUMS[key]; return d ? AI_FMT[d[1]](aiValue(key)) : '—';
}
const TOKEN = /\{(\w+)\}/g;
export function fillAi(s) {
  if (typeof s !== 'string' || !s.includes('{')) return s;
  return s.replace(TOKEN, (all, k) => (AI_FACTS[k] ? AI_FACTS[k].v : AI_NUMS[k] ? (M ? aiText(k) : '…') : all));
}
export const aiRiskLabel = () => fillAi(AI_RISK_LABEL_RAW);

/* ---------------------------------------------------------------- the lesson */
// a step whose title / text / ending are filled on read (getters), so the card never shows a typed number
function step(o) {
  const { text, ending, ...rest } = o;
  const st = { ...rest, rawText: text };
  Object.defineProperty(st, 'text', { enumerable: true, get: () => text.map(fillAi) });
  if (ending) {
    st.rawEnding = ending;
    Object.defineProperty(st, 'ending', { enumerable: true, get: () => Object.fromEntries(Object.entries(ending).map(([k, v]) => [k, fillAi(v)])) });
  }
  return st;
}

export const LESSON_AI_AU = {
  id: 'ai-au', kind: 'topic', label: '专题', badge: 'AI',
  title: '专题：AI 抗冲击（澳洲家庭）',
  question: 'AI 的冲击从哪几处进来？一个澳洲家庭怎么不被一次打穿？',
  oneLine: '八步宏观：AI 怎么改分水堰、河道、吸力、估值、地下和闸，冲击分三段；两步配置：诚实的回测结果和一个假设的例子。不是个人建议。',
  rulesOn: 'all',
  startDate: '2025Q4', endDate: '2025Q4', mode: 'history', available: true,
  steps: [
    step({ sid: 'M1', type: 'intro', title: 'M1 问题与结论',
      glow: { parts: ['weir', 'household', 'channel', 'border'], pipes: ['wages', 'profits'] },
      text: [
        '**结论先说：AI 把河道拓宽，可分水堰往「卡点的主人」那边斜；冲击分三段来。一个澳洲家庭的房子、工作和澳元在同一条河上，所以能动的钱先离开这条河，分散出去。**',
        '图上亮的是：分水堰（工资和利润在这里分开）、家庭、河道、国境线（澳元的闸）。',
        '先讲八步宏观，再讲两步配置，最后三问。',
      ],
      concept: ['weir'] }),

    step({ sid: 'M2', type: 'reveal', title: 'M2 分水堰：份额缩，不是水平缩', panel: { id: 'ai-k' },
      glow: { parts: ['weir', 'household', 'firm', 'poolHousing', 'poolEquity'], pipes: ['wages', 'profits', 'rent'] },
      text: [
        '**结论：AI 让工资在总收入里的份额变小，可工资水平不一定变低。痛的是「相对变穷」。**',
        'Restrepo（NBER 工作论文 {nberWp}，{nberDate}）：到了通用 AI 的极限，劳动份额趋近零，工资被「用算力复制这份工作的成本」封顶；可河变宽了，工资水平仍可能比今天高。',
        '相对变穷痛在三处：① 库容固定的稀缺资产（好地段的房子、学区）由最上面的人定价；② 富人的储蓄过剩（Mian–Straub–Sufi，{msYear}）：水停在湖里，家庭只好借钱，地下的洞变深；③ 政治：在分水堰收税、再分配（达利欧说的国内秩序）。',
        '下面的小图按地方画 K：上臂流向卡点的主人和湖，下臂是工资份额。',
      ],
      concept: ['weir', 'pvtDebtGdp'] }),

    step({ sid: 'M3', type: 'reveal', title: 'M3 河道与物价：两种速度',
      glow: { parts: ['channel', 'capex'], pipes: ['toCapex'] },
      text: [
        '**结论：现在，物理卡点（电、铜、芯片）把河道收窄，物价偏高，偏向 B1；以后，便宜的 AI 服务会把物价往下压。**',
        '读数：物价比一年前，美国 {uCpi}（{uCpiQ}，调度线 {uTgt}），澳洲 {aCpi}（{aCpiQ}，调度线 {aTgt}）。两国都在调度线上面。',
        '用测流断面分辨：物价涨、产量也涨 = 水多；物价涨、产量不涨 = 河道窄。AI 的卡点属于后一种：加息治不好，要等扩产。',
      ],
      facts: [{ f: F => F.uCpi.v > F.uTgt && F.aCpi.v > F.aTgt, note: '两国物价比一年前都高过调度线' }],
      concept: ['cpi', 'outputGap', 'B1'] }),

    step({ sid: 'M4', type: 'reveal', title: 'M4 吸力：现在往上',
      glow: { parts: ['suction', 'centralBank', 'poolBond'] },
      text: [
        '**结论：吸力两股力量拉扯：AI 资本开支和财政赤字往上推，富人的储蓄过剩往下压。现在是往上：长期利率比一年前高。**',
        '十年国债：美国 {u10}（{u10Q}，比一年前 {u10d}），澳洲 {a10}（{a10Q}，比一年前 {a10d}）。',
        '澳洲央行：{rbaHiQ}是 {rbaHi}，降到 {rbaLo}（{rbaLoQ}），又加回 {rbaNow}（{rbaNowQ}）。',
        '怕吸力往上的：长期债券，和窄的池子（少数几只大股票撑起来的湖）。',
      ],
      facts: [
        { f: F => F.u10d > 0 && F.a10d > 0, note: '两国十年国债都比一年前高' },
        { f: F => F.rba.lo.v < F.rba.hi.v && F.rba.now.v > F.rba.lo.v, note: '澳洲央行先降后加' },
      ],
      concept: ['suction', 'realRate'] }),

    step({ sid: 'M5', type: 'reveal', title: 'M5 估值：好消息已经在价格里',
      glow: { parts: ['poolEquity', 'pool', 'springs'] },
      text: [
        '**结论：AI 利润的大幅增长，价格里已经算进去了。以后赚多少，看「比预期好多少」；一旦失望，越窄的池子跌得越多。**',
        '读数：美国股票 CAPE {uCape}（{uCapeQ}），{capeFrom}以来平均 {uCapeAvg}。',
        '估值灯只说贵不贵，不说什么时候跌：贵的湖可以再贵很多年。',
      ],
      facts: [{ f: F => F.cape.v > F.capeAvg, note: 'CAPE 高过它自己的平均' }],
      concept: ['lampValuation', 'equityAsset'] }),

    step({ sid: 'M6', type: 'reveal', title: 'M6 地下和闸：借钱建的，破了是信用事件',
      glow: { parts: ['groundwater', 'iou', 'liftLine', 'border'], pipes: ['newLoans', 'foreignBonds'] },
      text: [
        '**结论：AI 资本开支越来越靠借钱（公司债、私募信贷、数据中心开发商）。一旦破，是一次信用事件（情景 B），不只是股价下跌。**',
        '借来的钱记在地下：欠得越多，洞越深；收入一断，「贵」就变成「还不起」。',
        '一慌，水往最大的湖（美元）跑：澳元变弱，不对冲的海外资产换回澳元时少跌一些。',
      ],
      concept: ['groundwater', 'B2', 'fx'] }),

    step({ sid: 'M7', type: 'reveal', title: 'M7 三阶段：最怕换段时颠簸',
      glow: { parts: ['government', 'deepPump', 'weir'], pipes: ['taxes', 'transfers', 'fiscalInjection'] },
      text: [
        '**结论：投资期 → 扩散期 → 分配期。最大的风险是换段时颠簸：资本开支先断，或者再分配来得更快。**',
        '投资期（现在）：钱涌向卡点：电、芯片、数据中心。扩散期：AI 用到各行各业，便宜的服务压物价。',
        '分配期：K 字形变成政治问题：算力和资本被征税，用深井泵发全民收入；如果靠印钱发，就回到 B1（涨价）。',
      ],
      concept: ['deepPump', 'B1'] }),

    step({ sid: 'M8', type: 'reveal', title: 'M8 澳洲视角：同一条河',
      glow: { parts: ['border', 'poolHousing', 'bank', 'household'], pipes: ['exports', 'collateral'] },
      text: [
        '**结论：同一条河。ASX 几乎没有算力公司；澳洲银行就是房贷风险；铁矿石不再是可靠的顺风；澳元是减震器。**',
        '铁矿石：中国钢产量 {steelPk} 年见顶，房屋新开工比高峰少了{startsDn}以上，西芒杜（Simandou）{simandou}开始供货。上一次的意外之财很难重来：那时家庭债务/GDP 从 {aHhPk}（{aHhPkQ}）降到 {aHhLo}（{aHhLoQ}），后来又升回 {aHh25}（{aHh25Q}）。',
        '再要降，只能靠名义 GDP 增长和放慢信贷（澳洲审慎监管局 APRA 管着房贷的阀门）。',
        '澳元是减震器：{fxQ}，澳元比一年前 {aud08}，同一季日元 {jpy08}（第 6 课的同一组数）。澳洲出事时，海外资产换回澳元会变多。',
        '澳洲的工作哪些是卡点、哪些是容易被替代的辅助任务？还没有澳洲本地的证据，这里只能说不知道。',
      ],
      facts: [
        { f: F => F.hhPk.v > F.hhLo.v && F.hh25.v > F.hhLo.v && F.hhNow.v >= F.hh25.v, note: '家庭债务/GDP 先降后升' },
        { f: F => F.aud08 < -0.15 && F.jpy08 > 0.1, note: '2008：澳元大跌、日元大涨' },
      ],
      concept: ['fx', 'gate', 'pvtDebtGdp'] }),

    step({ sid: 'A1', type: 'reveal', title: 'A1 诚实的一页：没有择时信号',
      glow: { parts: ['pool', 'poolEquity', 'springs'] },
      text: [
        '**结论：' + AI_HONEST + '。**',
        '证据（SITU-AWARE 报告，{situDate}）：卡点雷达亮灯前一年平均跑赢大盘 {radarPre}，亮灯后一年只多 {radarPost}；行业动量 {momFrom} 年以后年化 {momPost}，大盘（SPY）{spyPost}；「收紧」开关历史上只有 {nTight} 次。',
        '{situMonth}读数，描述不是预测：电力设备和铜已经涨在前面（GE Vernova {gevWin}跑赢大盘 {gevPp} 个百分点）；天然气管道和数据中心 REIT 紧但没涨过头（一年 {pipeLo} 到 {pipeHi}，大盘 {spy12}）；核电读不出（多数还没有收入）。雷达比价格晚亮。',
        '所以：核心仓位做大部分的事，信念仓位可有可无。',
      ],
      concept: ['lampValuation'] }),

    step({ sid: 'A2', type: 'reveal', title: 'A2 一个假设的例子', panel: { id: 'ai-alloc' },
      glow: { parts: ['pool', 'poolEquity', 'poolBond', 'poolGold', 'cash'] },
      text: [
        '**结论：核心（全球股票，不含澳洲，不对冲）做大部分的事；信念仓位固定在 {tiltMin} 到 {tiltMax}，每年再平衡，不轮动。两个按钮是风险控制，不是赚钱信号。**',
        '假设（不是任何真人的数据）：房子 {house}，没有房贷；能投资的钱 {liquid}。下面的表按 {liquid} 分。不买澳洲银行股和澳洲 REIT：它们和房子、工作、澳元在同一条河上。',
        '怎么进场：分 {stage} 个月分批买；某一块偏离目标超过 {drift} 个点才再平衡。现金里含 {emerg} 个月的应急金。',
        'offset 账户只在欠房贷时有用：放进去的现金等于拿到房贷利率，而且不交税。这里没有房贷，现金放高息账户或短债。',
        '该问谁：在 ASIC 注册、只收咨询费（fee-only）的顾问；问税、super、持有结构，不问什么时候买卖。',
      ] }),

    step({ sid: 'END', type: 'reveal', title: '三问：样板，不是个人建议',
      glow: { parts: ['weir', 'channel', 'suction', 'border'] },
      text: [
        '**结论：' + AI_NO_ADVICE + '。**',
        '框架给的是地图：冲击从哪几处进来、哪些东西在同一条河上。具体怎么做，取决于你的税、super、工作和家庭。',
      ],
      ending: {
        q1: '水的问题还是河道的问题？两样都有：现在是河道窄（电、铜、芯片的卡点），水也偏多（物价比一年前：美国 {uCpi}，澳洲 {aCpi}，都高过调度线）；以后便宜的 AI 服务会把河道拓宽。',
        q2: '环上哪一步？大周期：美国 {uLong}，澳洲 {aLong}（第 9 课「现在在哪」）。AI 在投资期：资本开支在涨，吸力往上。',
        q3: '谁赢谁输、钱放哪？赢：卡点的主人、湖里的资产；输：工资份额，和借钱买稀缺资产的人。钱：先离开房子、工作、澳元这条河；核心放全球股票，信念仓位可有可无。' + AI_NO_ADVICE + '。',
      },
      facts: [{ f: F => F.uCpi.v > F.uTgt && F.aCpi.v > F.aTgt, note: '三问 ①：两国物价都高过调度线' }],
      concept: ['longCycle'] }),
  ],
};

export default LESSON_AI_AU;
