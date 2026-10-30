// Detection layer: lamps, Dalio ring stage (probabilities), auto-pause triggers.
// Everything here READS state; nothing here feeds back into prices or flows.
// Bands and thresholds are country params (src/data/country-params.js: lamps / cycle / pause); every function defaults to USA.
import { countryParams } from '../data/country-params.js';

const sig = x => 1 / (1 + Math.exp(-x));
const pct = x => (x * 100).toFixed(1) + '%';

export function computeLamps(v, cp = countryParams()) {
  const B = cp.lamps;
  const lv = (val, y, r, dir = 1) => {
    const x = val * dir;
    return x >= r * dir * dir ? 'red' : x >= y * dir * dir ? 'yellow' : 'green';
  };
  // credit: impulse (change in net new credit / GDP)
  const ci = v.ci;
  const [c1, c2, c3] = B.ci;
  const credit = {
    level: ci < c1 ? 'red' : (ci < c2 || ci > c3) ? 'yellow' : 'green',
    value: ci, label: '信贷脉冲', driver: `净新增信贷/GDP 变化 ${pct(ci)}（新贷款-还本）`,
    // bands/axis: colour thresholds + fixed display range for the UI gauges (src/ui/gauge.js); same units as `value`. Detection only.
    bands: [{ lo: -Infinity, hi: c1, level: 'red' }, { lo: c1, hi: c2, level: 'yellow' }, { lo: c2, hi: c3, level: 'green' }, { lo: c3, hi: Infinity, level: 'yellow' }],
    axis: [-0.04, 0.05],
  };
  const d0 = v.dsr0, [dy, dr] = B.dsr;
  const debtService = {
    level: v.dsr >= v.dsr0 + dr ? 'red' : v.dsr >= v.dsr0 + dy ? 'yellow' : 'green',
    value: v.dsr, label: 'DSR 偿债率', driver: `家庭还本付息/收入 ${pct(v.dsr)}，坏账率 ${pct(v.bad)}`,
    bands: [{ lo: -Infinity, hi: d0 + dy, level: 'green' }, { lo: d0 + dy, hi: d0 + dr, level: 'yellow' }, { lo: d0 + dr, hi: Infinity, level: 'red' }],
    axis: [d0 - 0.02, d0 + 0.06],
  };
  const rp = v.realP, [r1, r2, r3, r4] = B.realP;
  const policy = {
    level: (rp < r1 || rp > r4) ? 'red' : (rp < r2 || rp > r3) ? 'yellow' : 'green',
    value: rp, label: '实际政策利率', driver: `政策利率 ${pct(v.policy)} - 通胀 ${pct(v.piY)}`,
    bands: [{ lo: -Infinity, hi: r1, level: 'red' }, { lo: r1, hi: r2, level: 'yellow' }, { lo: r2, hi: r3, level: 'green' }, { lo: r3, hi: r4, level: 'yellow' }, { lo: r4, hi: Infinity, level: 'red' }],
    axis: [-0.04, 0.06],
  };
  const val = Math.max(v.PIrel, v.peRel);
  const houseTop = v.PIrel >= v.peRel, [vy, vr] = B.val;
  const valuation = {
    level: val >= vr ? 'red' : val >= vy ? 'yellow' : 'green',
    value: v.PI, label: '房价/收入',
    driver: `房价/收入 ${v.PI.toFixed(2)}（起点 ${cp.pi0.toFixed(2)}，相对起点 ${v.PIrel.toFixed(2)}x${houseTop ? '，决定颜色' : ''}），股票 P/E 相对起点 ${v.peRel.toFixed(2)}x${houseTop ? '' : '（决定颜色）'}`,
    parts: { house: v.PIrel, equity: v.peRel },       // level = max of the two, in multiples of the start value
    bands: [{ lo: -Infinity, hi: vy, level: 'green' }, { lo: vy, hi: vr, level: 'yellow' }, { lo: vr, hi: Infinity, level: 'red' }],   // RELATIVE units (x start), not the units of `value`
    axis: [0.7, 1.8],
  };
  return { credit, debtService, policy, valuation };
}

const STAGES = ['', '① 借钱扩张', '② 逼近吸程线（缓冲池满）', '③ 岔路口（B1/B2）', '④ 降息尝试重启信用',
  '⑤ 私人借不动、转向还债', '⑥ 政府接手、央行支持', '⑦ 化债 / 金融压制', '⑧ 偿债压力下降、资产负债表修复'];
const NEXT = {
  1: '若房价比一年前 >5% 且信贷持续增长 → 进入 ②',
  2: '若通胀 >3.5% 且政策利率上行 → B1；若房价转跌且信贷脉冲转负 → B2（均进入 ③）',
  3: '若降息后信贷仍不恢复 → ⑤；若降息重启信贷 → 回到 ①',
  4: '观察新贷款与 DSR：信贷回升 → ①；DSR 仍高、坏账上升 → ⑤',
  5: '若财政支出扩大且 QE 启动 → ⑥',
  6: '若名义增长 > 国债收益率且实际利率偏低 → ⑦',
  7: '若 DSR 回落到起点附近、坏账低 → ⑧',
  8: '若信贷重新增长 → 回到 ①',
};

export function detectRing(v0, prevProbs) {
  const s = new Array(9).fill(0);
  const v = { ...v0, hpY: v0.hpYoY };
  const dsrHigh = sig((v.dsr - v.dsr0 - 0.02) / 0.008);
  s[1] = sig((v.pcg - 0.02) / 0.015) * sig((0.06 - v.hpY) / 0.03) * sig((v.dsr0 + 0.025 - v.dsr) / 0.01) * sig((0.035 - v.piY) / 0.01);
  s[2] = sig((v.pcg - 0.02) / 0.015) * Math.max(sig((v.hpY - 0.05) / 0.03), sig((v.PIrel - 1.15) / 0.08)) * sig((0.045 - v.piY) / 0.01);
  const b1 = sig((v.piY - 0.035) / 0.008) * sig((v.dPol4 - 0.005) / 0.007);
  const b2 = sig((-v.hpY - 0.01) / 0.02) * sig((-v.ci - 0.002) / 0.004) * sig((v.dsr - v.dsr0 - 0.01) / 0.01);
  s[3] = Math.max(b1, b2);
  s[4] = sig((-v.dPol4 - 0.01) / 0.01) * sig((0.03 - v.pcg) / 0.02) * sig((v.u - 0.05) / 0.01);
  s[5] = sig((0.01 - v.pcg) / 0.012) * Math.max(sig((v.bad - 0.035) / 0.01), dsrHigh);
  s[6] = Math.max(sig((v.adj - 0.02) / 0.01), v.qeOn ? 0.85 : 0) * sig((0.02 - v.pcg) / 0.02);
  s[7] = sig(v.gr / 0.01) * sig((0.012 - v.realP) / 0.01) * sig((-v.dDsr4 + 0.002) / 0.004) * sig((0.04 - v.piY) / 0.01);
  s[8] = sig((v.dsr0 + 0.01 - v.dsr) / 0.01) * sig((0.03 - v.bad) / 0.01) * sig((v.pcg - 0.005) / 0.01) * sig((0.04 - v.piY) / 0.01) * sig((-v.dDsr4 + 0.004) / 0.006);
  let raw = new Array(9).fill(0), tot = 0;
  for (let i = 1; i <= 8; i++) { raw[i] = Math.exp(6 * s[i]); tot += raw[i]; }
  const probs = {};
  let best = 1, bp = -1;
  for (let i = 1; i <= 8; i++) {
    const p = prevProbs ? 0.6 * (prevProbs[i] ?? 0) + 0.4 * raw[i] / tot : raw[i] / tot;
    probs[i] = p;
    if (p > bp) { bp = p; best = i; }
  }
  for (let i = 1; i <= 8; i++) probs[i] = Math.round(probs[i] * 1000) / 1000;
  let fork = null;
  if (best === 3) fork = b1 >= b2 ? 'B1' : 'B2';
  return { stage: best, fork, probs, label: STAGES[best] + (fork ? `（${fork}）` : ''), nextSignal: NEXT[best] };
}

// ================================================================= two dials: long-term + short-term debt cycle
// Detection only (never feeds back). State machine with hysteresis, carried in the sim (S.cyc), deterministic:
//  - every stage's evidence is evaluated each quarter; a "streak" counts consecutive quarters it holds
//  - a stage advances only to the next one (or skips at most one ahead) when that target's streak >= N
//  - on moving, all streaks restart (confirmation is measured AFTER arrival); no counter-clockwise moves
//  - mixed evidence (target's streak > 0 but < N) is shown as `between`, the current stage does not change
export const LONG_LABEL = { 1: '① 堆债', 2: '② 逼近吸程线（缓冲池满）', 5: '⑤ 降息失灵·私人去杠杆', 6: '⑥ 政府接手', 7: '⑦ 金融压制·增长化债', 8: '⑧ 修复' };
export const LONG_ORDER = [1, 2, 5, 6, 7, 8];
// Short cycle as the learner sees it (Dalio): 扩张 → 过热 → 收紧 → 降息（推得动吗？）. The top comes in two kinds:
// 物价过热 (inflation high and running up) or 资产过热 (a borrowing-driven boom that breaks: credit shrinks, house prices turn, DSR stretched).
// B1/B2 are NOT short-cycle phases: they are the long cycle's fork after ② (where the excess claims go) -> longOut.fork.
// Internally the state machine keeps two top states, hotP / hotA; outside, phase = 'hot' + top.
//
// Rules (2026-10-29 redesign: the dial follows the central bank, so it matches the real FOMC path in history mode):
//  - 收紧 (tight) = the central bank is tightening: a hiking round of >= ST.hike (0.5pp, low -> high) and no cut since
//    (holding at the high counts, for up to ST.holdMax quarters). Sub-label 收紧·衰退 when the recession evidence also holds, else 收紧（加息）.
//  - 降息 (ease) = the policy rate is >= ST.turn (0.2pp) under its 6-quarter high AND not rising this quarter, and the bank is not in a hiking round.
//  - 过热 (hot) = overheating evidence while the bank has NOT yet hiked >= ST.hike. Once it has, the phase is 收紧 and `via` keeps the kind
//    of top; a top first seen during 收紧 (e.g. 2000, 2005: hikes began while inflation was moderate) sets `via` and fires the top event there.
//    So 过热 and 收紧 never overlap on the dial; 收紧 may come first in time, the top then shows as 「收紧（接 物价过热）」.
//  - 'hiking round' / 'cut' come from a turning-point filter on the policy rate (state.cb): a move of ST.turn off the running low (high)
//    turns the bank's direction up (down). The policy rate has no noise, so tight / ease need 1 quarter (no dwell);
//    hot needs 2 quarters, expand 3 (credit back and unemployment not rising), both after a 2-quarter dwell.
//  - Moves: expand -> hot / tight / ease; hot -> tight / ease / expand (hotP -> hotA re-labels); tight -> ease (or expand once a hold at
//    the high outlasts ST.holdMax); ease -> expand (推得动, or the bank starts hiking again = recovery confirmed) or -> 过热·物价 (inflation
//    takes off while rates are still low: 2021). expand -> ease (2026-10-29): a cutting round with no tightening before it still reads
//    降息 (RBA 2011-16 and 2019-20; Fed 1998 insurance cuts); before, 'ease' could only be reached from hot / tight. From 扩张 the
//    bank must also cut in that quarter (>= ST.polFlat), so a rate left low after an easing round does not re-enter 降息.
export const SHORT_LABEL = { expand: '扩张', hot: '过热', tight: '收紧', ease: '降息（推得动吗？）' };
export const TOP_LABEL = { price: '物价过热', asset: '资产过热' };
export const KEY_LABEL = { expand: '扩张', hotP: '过热·物价', hotA: '过热·资产', tight: '收紧', ease: '降息（推得动吗？）' };
const KEY_PHASE = k => (k === 'hotP' || k === 'hotA' ? 'hot' : k);
const KEY_TOP = { hotP: 'price', hotA: 'asset' };
export const LONG_N = 6;                       // quarters of consecutive evidence to advance the long cycle
// ...except the step ⑤ -> ⑥: the policy response comes fast (TARP / QE1 2008Q4, ARRA 2009Q1), so 4 quarters (US ⑥ 2010Q1, was 2010Q3);
// every stage still lasts >= 4 quarters. ⑤ keeps 6 (with 4, AUS 2021 would enter ⑤ on the COVID GDP swing), and a skip
// (e.g. ② -> ⑥ straight, without a private deleveraging) still needs LONG_N.
export const LONG_N_TO = { 6: 4 };
const longN = (s, from) => (LONG_N_TO[s] && (from == null || LONG_ORDER.indexOf(s) === LONG_ORDER.indexOf(from) + 1) ? LONG_N_TO[s] : LONG_N);
export const SHORT_N = { hotP: 2, hotA: 2, tight: 1, ease: 1, expand: 3 };
export const WARMUP = 8;
const SHORT_DWELL = 2;                         // min quarters in a short phase before an evidence-driven move (hot / expand); policy moves skip it
const POLICY = { tight: 1, ease: 1 };
export const SHORT_NEXT = { expand: ['tight', 'ease', 'hotA', 'hotP'], hotP: ['ease', 'tight', 'hotA', 'expand'], hotA: ['ease', 'tight', 'expand'], tight: ['ease', 'expand'], ease: ['expand', 'hotP'] };
// thresholds added with the redesign (fallbacks so an older country-params file still works)
const stx = ST => ({ turn: 0.002, polFlat: 0.001, inflUp: 0.005, holdMax: 8, ...ST });
// long-cycle keys added 2026-10-30 (same fallback idea; country-params.js carries them per country):
//   gr / gov4 / realP7  ⑦ = g − r ≥ gr (nominal GDP growth over 4 quarters minus the 10y yield) AND gov debt/GDP 4-quarter change ≤ gov4;
//                        real policy rate ≤ realP7 is a supporting item only (shown, not in the gate)
//   b2N                 the B2 fork is confirmed after its three conditions hold b2N quarters in a row (shown as pending before)
const ltx = LT => ({ gr: 0, gov4: 0, realP7: 0, b2N: 3, ...LT });
const b2N = LT => ltx(LT).b2N;
const TXT_LT = new WeakMap();
const ltOf = LT => { if (!TXT_LT.has(LT)) TXT_LT.set(LT, ltx(LT)); return TXT_LT.get(LT); };

// thresholds: country params (cycle.LT long cycle, cycle.ST short cycle; meanings in src/data/country-params.js), quoted in the UI
// through the evidence items. The texts below are generated from them once per thresholds object.
const pp1 = x => (x * 100).toFixed(1).replace(/\.0$/, '') + 'pp';
const pc1 = x => (x * 100).toFixed(1).replace(/\.0$/, '') + '%';
const TXT = new WeakMap();
function cycleTexts(cyc) {
  if (TXT.has(cyc)) return TXT.get(cyc);
  const LT = ltOf(cyc.LT), ST = stx(cyc.ST);
  const LONG_NEXT = {
    1: `私人债务/GDP 三年升 ≥ ${pp1(LT.pvtUp)} 且房价/收入 ≥ 起点 ${LT.pi}x（连续 ${longN(2)} 季）→ ② 逼近吸程线（缓冲池满）`,
    2: `私人债务/GDP 较三年高点回落 ≥ ${pp1(-LT.pvtDown)}，且坏账率 ≥ ${pc1(LT.bad)} 或政策利率 ≤ ${pc1(LT.zb)}（降息用尽）→ ⑤`,
    5: `政府债务/GDP 三年升 ≥ ${pp1(LT.govUp)} 或赤字 ≥ ${pc1(LT.deficit)} GDP，同时 QE ≥ ${pc1(LT.qe)} GDP 或政策利率 ≤ ${pc1(LT.zb2)} → ⑥`,
    6: `名义增长（近 4 季）高于 10 年国债利率（g−r ≥ ${pp1(LT.gr)}），且政府债务/GDP 比一年前不升（≤ ${pp1(LT.gov4)}），连续 ${longN(7)} 季 → ⑦；加分项：实际政策利率 ≤ ${pc1(LT.realP7)}`,
    7: `DSR 比起点低 ≥ ${pp1(-LT.dsrLow)}、坏账率 ≤ ${pc1(LT.badLow)}、实际利率回到 ${pc1(LT.realP)} 以上、政府债务稳住 → ⑧`,
    8: `私人债务/GDP 三年升 ≥ ${pp1(LT.reUp)} 且信贷增速 ≥ ${pc1(LT.pcg)}（新一轮借钱）→ 回到 ①`,
  };
  const hikeT = `央行本轮加息 ≥ ${pp1(ST.hike)} → 收紧（加息）`, cutT = `央行比 6 季高点降 ≥ ${pp1(ST.turn)} 且本季不再加 → 降息`;
  const SHORT_NEXT_TXT = {
    expand: `${hikeT}；${cutT}；还没加息时：通胀 ≥ ${pc1(ST.infl)} 且比一年前高 ≥ ${pp1(ST.inflUp)}（央行在降息时不算）→ 过热·物价，信贷脉冲 ≤ ${pp1(ST.ci)}、房价比一年前 ≤ ${pc1(ST.hp)} 且 DSR 比起点高 ≥ ${pp1(ST.dsr)} → 过热·资产`,
    hotP: `${hikeT}；${cutT}；信贷脉冲 ≤ ${pp1(ST.ci)}、房价比一年前 ≤ ${pc1(ST.hp)} 且 DSR 比起点高 ≥ ${pp1(ST.dsr)} → 改判 过热·资产；通胀回落 → 扩张`,
    hotA: `${hikeT}；${cutT}；信贷回正且失业率不升 → 扩张`,
    tight: `${cutT}（推得动吗？）。失业率较低点升 ≥ ${pp1(ST.uRise)} 或信贷脉冲 ≤ ${pp1(ST.ciTight)} 时标「收紧·衰退」`,
    ease: `推得动：信贷脉冲回正且失业率不再上升（连续 ${SHORT_N.expand} 季），或央行重新加息 → 扩张；央行停止降息后，通胀 ≥ ${pc1(ST.infl)} 且比一年前高 ≥ ${pp1(ST.inflUp)} → 过热·物价；推不动：大周期走上 B2 → ⑤ 私人去杠杆`,
  };
  const B2_TXT = `B2 跌破吸程线（B2 岔路）：三条同时成立，连续 ${b2N(LT)} 季才确认。房价比一年前 ≤ ${pc1(LT.hpFall)}；DSR 比起点高 ≥ ${pp1(LT.dsrHi)} 或私人债务/GDP 三年升 ≥ ${pp1(LT.pvtUp)}；央行已降息 ≥ ${pp1(LT.cut)}（或近零）但信贷脉冲仍 ≤ ${pp1(LT.ciNeg)}。降息推得动（小周期回到扩张）时解除`;
  const o = { LONG_NEXT, SHORT_NEXT_TXT, B2_TXT };
  TXT.set(cyc, o);
  return o;
}

const back = (a, k) => a[Math.max(0, a.length - 1 - k)];
const item = (name, value, threshold, dir, fmt, o = {}) =>
  ({ name, value, threshold, dir, fmt, ok: dir === '>=' ? value >= threshold : value <= threshold, ...o });
// groups: ungrouped items are AND-ed, items sharing `grp` are OR-ed (one of them is enough).
// Items flagged `support` (加分项) are shown with the evidence but never count toward the gate.
const holds = items => {
  const g = {};
  for (const i of items) { if (i.support) continue; const k = i.grp || ('#' + i.name); g[k] = g[k] || i.ok; }
  return Object.values(g).every(Boolean);
};

function longEvidence(f, LT) {
  return {
    1: [item('私人债务/GDP 三年变化', f.pvtD12, LT.reUp, '>=', 'pp', { term: 'pvtDebtGdp' }), item('信贷增速', f.pcg, LT.pcg, '>=', 'pct', { term: 'creditImpulse' })],
    2: [item('私人债务/GDP 三年变化', f.pvtD12, LT.pvtUp, '>=', 'pp', { term: 'pvtDebtGdp' }), item('房价/收入（起点=1）', f.PIrel, LT.pi, '>=', 'x', { term: 'priceToIncome' })],
    5: [item('私人债务/GDP 较三年高点', f.pvtDD, LT.pvtDown, '<=', 'pp', { term: 'pvtDebtGdp' }),
      item('银行坏账率', f.bad, LT.bad, '>=', 'pct', { term: 'badLoans', grp: 'a' }),
      item('政策利率（降息空间）', f.pol, LT.zb, '<=', 'pct', { term: 'policyRate', grp: 'a' })],
    6: [item('政府债务/GDP 三年变化', f.govD12, LT.govUp, '>=', 'pp', { term: 'govDebtGdp', grp: 'a' }),
      item('财政赤字/GDP', f.defGdp, LT.deficit, '>=', 'pct', { term: 'fiscalInjection', grp: 'a' }),
      item('QE 存量/GDP', f.qeGdp, LT.qe, '>=', 'pct', { term: 'qe', grp: 'b' }),
      item('政策利率（零利率）', f.pol, LT.zb2, '<=', 'pct', { term: 'policyRate', grp: 'b' })],
    // ⑦ (2026-10-30): growth outruns the interest rate (g − r > 0) while the government stops piling up debt; a negative real
    // policy rate (financial repression) often comes with it, but is a supporting item only (shown, not in the gate)
    7: [item('名义增长 − 10 年国债利率（g−r）', f.gr, LT.gr, '>=', 'pp', { term: 'gMinusR' }),
      item('政府债务/GDP 比一年前', f.govD4, LT.gov4, '<=', 'pp', { term: 'govDebtGdp' }),
      item('实际政策利率', f.realP, LT.realP7, '<=', 'pct', { term: 'realRate', support: true })],
    8: [item('DSR 相对起点', f.dsrRel, LT.dsrLow, '<=', 'pp', { term: 'dsr' }),
      item('银行坏账率', f.bad, LT.badLow, '<=', 'pct', { term: 'badLoans' }),
      item('实际政策利率（压制结束）', f.realP, LT.realP, '>=', 'pct', { term: 'realRate' }),
      item('政府债务/GDP 三年变化', f.govD12, LT.flat, '<=', 'pp', { term: 'govDebtGdp' }),
      item('政府利息/税收', f.i2t, LT.i2t, '<=', 'pct', { term: 'interestToTax' })],
  };
}
function shortEvidence(f, ST) {
  return {
    // 2026-10-30: no 物价过热 while the bank is cutting (a cut this quarter, or >= polFlat over the last 2 quarters: US 2008Q3, oil-driven CPI)
    hotP: [item('通胀', f.piY, ST.infl, '>=', 'pct', { term: 'cpi' }), item('通胀比一年前', f.piUp, ST.inflUp, '>=', 'pp', { term: 'cpi' }),
      item('政策利率近 2 季变化（没在降息）', f.polCut2, -ST.polFlat + 1e-9, '>=', 'pp', { term: 'policyRate' })],
    // a borrowing-driven boom that breaks: credit shrinks first and house prices turn, while the debt burden (DSR) is stretched.
    // (all three: in 2023-24 credit and house prices dipped too, but with DSR far below its start that was the price top's tightening, not an asset bust)
    hotA: [item('信贷脉冲', f.ci, ST.ci, '<=', 'pp', { term: 'creditImpulse' }),
      item('房价比一年前', f.hpYoY, ST.hp, '<=', 'pct', { term: 'housePrice' }),
      item('DSR 相对起点', f.dsrRel, ST.dsr, '>=', 'pp', { term: 'dsr' })],
    // the central bank is tightening: a hiking round of >= hike (low -> high), no cut off the high yet
    tight: [item('央行本轮加息（低点→高点）', f.round, ST.hike, '>=', 'pp', { term: 'policyRate' }),
      item('政策利率较本轮高点', f.fromHi, ST.turn, '<=', 'pp', { term: 'policyRate' })],
    ease: [item('央行较 6 季高点降息', f.polDrop6, ST.turn, '>=', 'pp', { term: 'policyRate' }),
      item('政策利率比上季', f.dPol1, ST.polFlat, '<=', 'pp', { term: 'policyRate' })],
    expand: [item('信贷脉冲', f.ci, ST.ciBack, '>=', 'pp', { term: 'creditImpulse' }), item('失业率 4 季变化', f.uD4, ST.uFlat, '<=', 'pp', { term: 'unemployment' })],
    // not a phase: turns the 收紧 label into 收紧·衰退
    recess: [item('失业率较 4 季低点', f.uRise, ST.uRise, '>=', 'pp', { term: 'unemployment', grp: 'a' }),
      item('信贷脉冲', f.ci, ST.ciTight, '<=', 'pp', { term: 'creditImpulse', grp: 'a' })],
  };
}

// the central bank's direction: a turning-point filter on the policy rate (no noise, so no smoothing needed).
// A move of `turn` off the running low turns it 'up' (a hiking round starts at that low); `turn` off the running high turns it 'down'.
function cbDirection(prev, pol, t, turn) {
  const c = prev ? { ...prev } : { dir: null, lo: pol, hi: pol, hiT: t };
  if (c.dir !== 'up') c.lo = Math.min(c.lo, pol);
  if (c.dir !== 'down' && pol > c.hi) { c.hi = pol; c.hiT = t; }
  if (c.dir !== 'up' && pol - c.lo >= turn - 1e-12) { c.dir = 'up'; c.hi = pol; c.hiT = t; }
  else if (c.dir !== 'down' && c.hi - pol >= turn - 1e-12) { c.dir = 'down'; c.lo = pol; }
  return c;
}

// the long cycle's B2 fork after ②: excess claims shrink instead of spilling into prices (balance-sheet recession ahead)
function b2Evidence(f, LT) {
  return [item('房价比一年前', f.hpYoY, LT.hpFall, '<=', 'pct', { term: 'housePrice' }),
    item('DSR 相对起点', f.dsrRel, LT.dsrHi, '>=', 'pp', { term: 'dsr', grp: 'a' }),
    item('私人债务/GDP 三年变化', f.pvtD12, LT.pvtUp, '>=', 'pp', { term: 'pvtDebtGdp', grp: 'a' }),
    item('央行较 5 季高点降息', f.polDrop, LT.cut, '>=', 'pp', { term: 'policyRate', grp: 'b' }),
    item('政策利率（近零）', f.pol, LT.zb, '<=', 'pct', { term: 'policyRate', grp: 'b' }),
    item('降息后信贷脉冲', f.ci, LT.ciNeg, '<=', 'pp', { term: 'creditImpulse' })];
}

const HK = ['pvt', 'gov', 'pol', 'u', 'piY'];
// prev: S.cyc (or null at t=0). x: inputs for this quarter. Returns { state, out:{long, short}, events }. Never mutates prev.
export function advanceCycles(prev, x0, t, date, cyc = countryParams().cycle) {
  const LT = ltOf(cyc.LT), ST = stx(cyc.ST), { LONG_NEXT, SHORT_NEXT_TXT, B2_TXT } = cycleTexts(cyc);
  const x = { ...x0, pol: x0.policy };
  const warm = t < WARMUP;                 // the toy model needs ~2 years to settle: windows are not full yet, so no evidence counts
  const h = {};
  for (const k of HK) h[k] = ((prev && prev.h[k]) || []).concat([x[k]]).slice(-13);
  const f = {
    pvt: x.pvt, pvtD12: x.pvt - h.pvt[0], pvtDD: x.pvt - Math.max(...h.pvt),
    govD12: x.gov - h.gov[0], defGdp: x.defGdp, qeGdp: x.qeGdp, pol: x.policy, realP: x.realP, i2t: x.i2t,
    dsrRel: x.dsr - x.dsr0, bad: x.bad, pcg: x.pcg, PIrel: x.PIrel,
    ci: x.ci, hpYoY: x.hpYoY, piY: x.piY, dPol4: x.dPol4, gap: x.gap, u: x.u,
    uRise: x.u - Math.min(...h.u.slice(-5)), uD4: x.u - back(h.u, 4),
    polDrop: Math.max(...h.pol.slice(-5)) - x.policy,
    polDrop6: Math.max(...h.pol.slice(-6)) - x.policy, dPol1: x.policy - back(h.pol, 1), piUp: x.piY - back(h.piY, 4),
    govD4: x.gov - back(h.gov, 4), gr: x.gr,
  };
  // the larger recent cut: this quarter's change or the change over 2 quarters (<= -polFlat = the bank is cutting)
  f.polCut2 = Math.min(f.dPol1, x.policy - back(h.pol, 2));
  const events = [];
  const now = { t, date };

  // ---------------- long cycle
  let L = prev ? prev.long : { stage: 1, since: now, streak: {} };
  const lev = longEvidence(f, LT), lok = {};
  const streak = {};
  for (const s of LONG_ORDER) { lok[s] = holds(lev[s]); streak[s] = lok[s] && !warm ? (L.streak[s] || 0) + 1 : 0; }
  const li = LONG_ORDER.indexOf(L.stage);
  const lcand = [LONG_ORDER[(li + 1) % 6], LONG_ORDER[(li + 2) % 6]].filter((s, i) => i === 0 || s !== 1);   // may skip one stage, but ① is only entered from ⑧
  let lstage = L.stage, lsince = L.since, lstreak = streak;
  const hit = lcand.find(s => streak[s] >= longN(s, L.stage));
  if (hit != null) { events.push({ kind: 'long', from: L.stage, to: hit }); lstage = hit; lsince = now; lstreak = {}; }
  const lnext = LONG_ORDER[(LONG_ORDER.indexOf(lstage) + 1) % 6];
  let lbetween = null;
  if (hit == null) {
    const m = lcand.reduce((a, s) => (streak[s] > (streak[a] || 0) ? s : a), lcand[0]);
    if (streak[m] >= Math.ceil(longN(m, L.stage) / 2)) lbetween = [L.stage, m];
  }
  const longOut = {
    stage: lstage, label: LONG_LABEL[lstage], between: lbetween,
    evidence: lev[lnext].map(i => ({ ...i, target: LONG_LABEL[lnext] })), met: holds(lev[lnext]),
    progress: { target: lnext, label: LONG_LABEL[lnext], have: lstreak[lnext] || 0, need: longN(lnext, lstage) },
    nextSignal: LONG_NEXT[lstage], since: lsince,
  };

  // ---------------- short cycle
  let S = prev ? prev.short : { phase: 'expand', via: null, since: now, dwell: 0, streak: {} };   // S.phase is the internal key (hotP / hotA / ...)
  const cb = cbDirection(prev && prev.cb, x.policy, t, ST.turn);
  f.round = cb.dir === 'up' ? cb.hi - cb.lo : 0;                            // size of the current hiking round (0 when not hiking)
  f.fromHi = cb.hi - x.policy;
  const sev = shortEvidence(f, ST), smet = {}, sok = {}, sstreak = {};
  for (const p of Object.keys(sev)) smet[p] = holds(sev[p]);
  smet.tight = smet.tight && cb.dir === 'up' && t - cb.hiT <= ST.holdMax;   // still rising, or holding at the high (not for ever)
  smet.ease = smet.ease && cb.dir !== 'up';
  for (const p of Object.keys(sev)) sok[p] = smet[p] && !warm;
  for (const p of Object.keys(sev)) sstreak[p] = sok[p] ? (S.streak[p] || 0) + 1 : 0;
  let phase = S.phase, via = S.via, ssince = S.since, dwell = S.dwell + 1, sst = sstreak;
  const scand = SHORT_NEXT[S.phase];
  let sbetween = null;
  const liftoff = S.phase === 'ease' && cb.dir === 'up';                    // the bank hikes again: the easing round is over (推得动)
  const ready = p => {
    if (p === 'expand' && liftoff) return true;
    if (sstreak[p] < SHORT_N[p] || (!POLICY[p] && dwell <= SHORT_DWELL)) return false;
    // 扩张 -> 降息 needs a cut THIS quarter (>= polFlat): a rate still under its 6-quarter high after an easing round ended is not a new one
    if (p === 'ease' && S.phase === 'expand') return f.dPol1 <= -ST.polFlat;
    // the soft landing out of a top / a hold is only believed once their own evidence is gone; 推得动 is not called in a quarter the bank still cuts
    if (p === 'expand') return !(KEY_TOP[S.phase] && sok[S.phase]) && !(S.phase === 'tight' && sok.tight) && !(S.phase === 'ease' && f.dPol1 <= -ST.turn);
    return true;
  };
  // policy moves first (they are observed without noise), then the evidence moves in SHORT_NEXT order; out of 降息, 过热·物价 before 扩张
  const order = [...scand.filter(p => POLICY[p]), ...(S.phase === 'ease' ? ['hotP', 'expand'] : scand.filter(p => !POLICY[p]))];
  const sh = order.find(ready);
  if (sh != null) {
    if (S.phase === 'ease' && sh === 'expand') events.push({ kind: 'restart' });   // 降息推得动
    phase = sh; ssince = now; dwell = 0; sst = {};
    if (KEY_TOP[sh]) { via = sh; events.push({ kind: 'top', to: KEY_TOP[sh] }); }
    else if (sh === 'expand') via = null;
  }
  // a top first seen while the bank is already hiking (2000, 2005): 收紧 remembers it (asset may re-label price, as hotP -> hotA does)
  if (phase === 'tight') {
    const seen = via !== 'hotA' && sstreak.hotA >= SHORT_N.hotA ? 'hotA' : !via && sstreak.hotP >= SHORT_N.hotP ? 'hotP' : null;
    if (seen) { via = seen; events.push({ kind: 'top', to: KEY_TOP[seen] }); }
  }
  if (phase === S.phase) {
    const m = scand.reduce((a, p) => (sstreak[p] > (sstreak[a] || 0) ? p : a), scand[0]);
    if (sstreak[m] >= 1 && sstreak[m] < SHORT_N[m]) sbetween = [S.phase, m];
  }
  // ---------------- the long cycle's fork after ②, and the hand-off between the dials
  // B2 hysteresis (2026-10-30): the three conditions must hold b2N quarters in a row (pending before, like `between`); once confirmed,
  // B2 stays until the long stage moves OR easing restarts credit (the short cycle's 'restart' = 推得动, back to 扩张). Before, B2 was
  // confirmed in one quarter and only the stage move cleared it: real AUS read B2 from 2008Q4 to 2021Q2 on 3 quarters of evidence.
  const b2ev = b2Evidence(f, LT), b2now = holds(b2ev) && !warm;
  const early = lstage === 1 || lstage === 2;
  const restart = events.some(e => e.kind === 'restart');
  const b2streak = b2now && !restart ? ((L.b2s || 0) + 1) : 0;
  const b2was = lstage === L.stage && !!L.b2 && !restart;
  const b2 = early && (b2was || b2streak >= LT.b2N);
  if (b2 && !b2was) events.push({ kind: 'longFork', to: 'B2' });
  // 物价过热 is live: the price top itself, or 收紧 after a price top while inflation is still above the line
  const priceTop = phase === 'hotP' || (phase === 'tight' && via === 'hotP' && f.piY >= ST.infl);
  longOut.fork = b2 ? 'B2' : early && priceTop ? 'B1' : null;               // B1 = excess spills into prices, handed to the short cycle
  longOut.b1Overlay = !early && priceTop;                                   // e.g. ⑦ with B1 on top (US 2022-23)
  longOut.forkEvidence = early ? b2ev : null;
  longOut.forkSignal = B2_TXT;
  // B2 being confirmed: { have, need } while the streak builds (shown like `between`), else null
  longOut.forkPending = early && !b2 && b2streak > 0 ? { have: b2streak, need: LT.b2N } : null;
  // display-only 加分项 on the B2 card (never in the gate): how much negative equity, how hurt the banks are. null = no data.
  // Model: average LVR, house price vs its recent peak, bad loans / bank capital. Real data: what the series give (real-snapshot.js).
  const nb = v => (typeof v === 'number' && isFinite(v) ? v : null);
  const badOk = x.badKnown !== false;
  longOut.forkExtra = early ? {
    lvr: nb(x.lvr), hpDraw: nb(x.dd) != null ? -x.dd : null,
    bad: badOk ? nb(x.bad) : null, badCap: badOk && nb(x.bad) != null && nb(x.capR) ? x.bad / x.capR : null,
    badRes: nb(x.badRes), chargeOff: nb(x.chargeOff),
  } : null;
  // 降息推得动吗？ 'no' when the long cycle took over (B2 path / ⑤ / ⑥); a 'restart' event when easing restarted credit (back to 扩张)
  const sPhase = KEY_PHASE(phase), top = KEY_TOP[phase] || null;
  const handoff = sPhase === 'ease' && (b2 || lstage === 5 || lstage === 6) ? 'no' : null;
  const cands = SHORT_NEXT[phase];
  const viaTxt = via && !top && phase !== 'expand' ? `（接 ${TOP_LABEL[KEY_TOP[via]]}）` : '';
  const name = phase === 'tight' ? (smet.recess ? '收紧·衰退' : '收紧（加息）') : KEY_LABEL[phase];
  const shortOut = {
    phase: sPhase, key: phase, top, label: name + viaTxt, via: via ? KEY_TOP[via] : null, between: sbetween,
    handoff, handoffText: handoff === 'no' ? '推不动 → 交给大周期（B2 → ⑤ 私人去杠杆）' : null,
    evidence: cands.flatMap(p => sev[p].map(i => ({ ...i, target: KEY_LABEL[p], targetId: p }))),
    progress: cands.map(p => ({ target: p, label: KEY_LABEL[p], have: (phase === S.phase ? sstreak[p] : 0), need: SHORT_N[p], met: smet[p] })),
    nextSignal: SHORT_NEXT_TXT[phase], since: ssince,
  };
  const state = { h, cb, long: { stage: lstage, since: lsince, streak: lstreak, b2, b2s: b2streak }, short: { phase, via, since: ssince, dwell, streak: sst } };
  return { state, out: { long: longOut, short: shortOut }, events };
}

// Auto-pause triggers with edge detection + cooldown. `mem` is mutated (it lives in branch state).
export function detectPauses(v, mem, t, events = [], cp = countryParams()) {
  const z = cp.pause, dsrRedAt = cp.lamps.dsr[1];
  const out = [];
  const fire = (code, message, cooldown) => {
    if (t < 8) return;
    if (mem.last[code] != null && t - mem.last[code] < cooldown) return;
    mem.last[code] = t;
    out.push({ code, message });
  };
  const outBand = v.piY > z.cpiHi || v.piY < z.cpiLo;
  if (outBand && !mem.outBand) fire('CPI_BAND', `通胀 ${pct(v.piY)} 突破目标区间 [${pct(z.cpiLo)}, ${pct(z.cpiHi)}]`, 6);
  mem.outBand = outBand;
  const sgn = Math.abs(v.ci) > 0.004 ? Math.sign(v.ci) : 0;
  if (sgn !== 0) {
    if (mem.ciSign !== 0 && mem.ciSign !== sgn) fire('CREDIT_IMPULSE_FLIP', `信贷脉冲转${sgn < 0 ? '负' : '正'}（${pct(v.ci)}）`, 6);
    mem.ciSign = sgn;
  }
  const falling = v.hpQ < 0 && v.hpQPrev < 0;
  if (falling && !mem.falling) fire('HOUSE_FALLING', `房价连续两个季度下跌（本季 ${pct(v.hpQ)}）`, 8);
  mem.falling = falling;
  const dsrRed = v.dsr >= v.dsr0 + dsrRedAt;
  if (dsrRed && !mem.dsrRed) fire('DSR_HIGH', `家庭 DSR ${pct(v.dsr)} 超过警戒线（起点+${+(dsrRedAt * 100).toFixed(2)}pp）`, 8);
  mem.dsrRed = dsrRed;
  const capLow = v.capR < z.capLow;
  if (capLow && !mem.capLow) fire('BANK_CAPITAL_LOW', `银行资本充足率 ${pct(v.capR)} 接近监管下限`, 8);
  mem.capLow = capLow;
  const i2t = v.i2t > z.i2t;
  if (i2t && !mem.i2t) fire('GOV_INTEREST', `政府利息/税收 ${pct(v.i2t)} 偏高`, 8);
  mem.i2t = i2t;
  // cycle dials: pause on a real long-stage change, on the long cycle taking the B2 fork, and on the short cycle reaching its top
  for (const e of events) {
    if (e.kind === 'long') fire('LONG_STAGE', `大周期进入 ${LONG_LABEL[e.to]}（此前：${LONG_LABEL[e.from]}）`, 0);
    else if (e.kind === 'longFork') fire('LONG_FORK', '大周期 B2：地下水位跌破吸程线（B2 岔路）。房价在跌、债务高、降了息信贷还在缩（降息推不动，资产负债表衰退的入口）', 0);
    else if (e.kind === 'top') fire('SHORT_TOP', `小周期到顶：${e.to === 'price' ? '物价过热（通胀高、还在升）' : '资产过热见顶（信贷先缩、房价转弱、偿债吃紧）'}`, 4);
  }
  return out;
}
export { STAGES };
