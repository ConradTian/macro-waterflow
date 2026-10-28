// Detection layer: lamps, Dalio ring stage (probabilities), auto-pause triggers.
// Everything here READS state; nothing here feeds back into prices or flows.

const sig = x => 1 / (1 + Math.exp(-x));
const pct = x => (x * 100).toFixed(1) + '%';

export function computeLamps(v) {
  const lv = (val, y, r, dir = 1) => {
    const x = val * dir;
    return x >= r * dir * dir ? 'red' : x >= y * dir * dir ? 'yellow' : 'green';
  };
  // credit: impulse (change in net new credit / GDP)
  const ci = v.ci;
  const credit = {
    level: ci < -0.015 ? 'red' : (ci < -0.003 || ci > 0.03) ? 'yellow' : 'green',
    value: ci, label: '信贷脉冲', driver: `净新增信贷/GDP 变化 ${pct(ci)}（新贷款-还本）`,
  };
  const debtService = {
    level: v.dsr >= v.dsr0 + 0.04 ? 'red' : v.dsr >= v.dsr0 + 0.02 ? 'yellow' : 'green',
    value: v.dsr, label: 'DSR 偿债率', driver: `家庭还本付息/收入 ${pct(v.dsr)}，坏账率 ${pct(v.bad)}`,
  };
  const rp = v.realP;
  const policy = {
    level: (rp < -0.015 || rp > 0.04) ? 'red' : (rp < 0.002 || rp > 0.025) ? 'yellow' : 'green',
    value: rp, label: '实际政策利率', driver: `政策利率 ${pct(v.policy)} - 通胀 ${pct(v.piY)}`,
  };
  const val = Math.max(v.PIrel, v.peRel);
  const valuation = {
    level: val >= 1.35 ? 'red' : val >= 1.15 ? 'yellow' : 'green',
    value: v.PI, label: '房价/收入', driver: `房价/收入 ${v.PI.toFixed(2)}（起点 4.00），股票 P/E 相对起点 ${v.peRel.toFixed(2)}x`,
  };
  return { credit, debtService, policy, valuation };
}

const STAGES = ['', '① 借钱扩张', '② 资产缓冲池装满', '③ 岔路口（B1/B2）', '④ 降息尝试重启信用',
  '⑤ 私人借不动、转向还债', '⑥ 政府接手、央行支持', '⑦ 化债 / 金融压制', '⑧ 偿债压力下降、资产负债表修复'];
const NEXT = {
  1: '若房价同比 >5% 且信贷持续增长 → 进入 ②',
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
export const LONG_LABEL = { 1: '① 堆债', 2: '② 缓冲池满', 5: '⑤ 降息失灵·私人去杠杆', 6: '⑥ 政府接手', 7: '⑦ 金融压制·增长化债', 8: '⑧ 修复' };
export const LONG_ORDER = [1, 2, 5, 6, 7, 8];
export const SHORT_LABEL = { expand: '扩张', B1: '过热 B1', B2: '缩水 B2', tight: '收紧·衰退', ease: '降息重启' };
export const LONG_N = 6;                       // quarters of consecutive evidence to advance the long cycle
export const SHORT_N = { B1: 2, B2: 2, tight: 2, ease: 2, expand: 3 };
export const WARMUP = 8;
const SHORT_DWELL = 2;                         // min quarters in a short phase before it may move on
const SHORT_NEXT = { expand: ['B2', 'B1', 'tight'], B1: ['tight', 'ease', 'expand'], B2: ['tight', 'ease', 'expand'], tight: ['ease', 'expand'], ease: ['expand'] };

// thresholds (one place, quoted in the UI through the evidence items)
const LT = {
  pvtUp: 0.03, pi: 1.10,                       // ②: private debt/GDP +3pp in 3y, house price/income >= 1.10x start
  pvtDown: -0.05, bad: 0.035, zb: 0.0075,      // ⑤: 5pp below the 3y high; bad loans >= 3.5% or policy <= 0.75% (cuts used up)
  govUp: 0.03, deficit: 0.05, qe: 0.01, zb2: 0.005, // ⑥: gov debt +3pp in 3y or deficit >= 5% GDP; and QE >= 1% GDP or policy <= 0.5%
  realP: -0.01, flat: 0.01, pvtFlat: 0.02,     // ⑦: real policy rate <= -1%; gov debt not rising (+1pp); private debt not re-levering (+2pp)
  dsrLow: -0.025, badLow: 0.025, i2t: 0.25,    // ⑧: DSR 2.5pp under start, bad loans <= 2.5%, interest/tax <= 25%
  reUp: 0.02, pcg: 0.03,                       // ①: private debt +2pp in 3y and credit growth >= 3%
};
const ST = {
  infl: 0.035, hike: 0.005,                    // B1
  ci: -0.005, hp: 0.01, dsr: 0.01,             // B2
  uRise: 0.01, ciTight: -0.015, // 收紧·衰退
  cut: 0.01, zb: 0.005,                        // 降息重启
  ciBack: 0, uFlat: 0.001,                     // 扩张
};
const pp1 = x => (x * 100).toFixed(1).replace(/\.0$/, '') + 'pp';
const pc1 = x => (x * 100).toFixed(1).replace(/\.0$/, '') + '%';
const LONG_NEXT = {
  1: `私人债务/GDP 三年升 ≥ ${pp1(LT.pvtUp)} 且房价/收入 ≥ 起点 ${LT.pi}x（连续 ${LONG_N} 季）→ ② 缓冲池满`,
  2: `私人债务/GDP 较三年高点回落 ≥ ${pp1(-LT.pvtDown)}，且坏账率 ≥ ${pc1(LT.bad)} 或政策利率 ≤ ${pc1(LT.zb)}（降息用尽）→ ⑤`,
  5: `政府债务/GDP 三年升 ≥ ${pp1(LT.govUp)} 或赤字 ≥ ${pc1(LT.deficit)} GDP，同时 QE ≥ ${pc1(LT.qe)} GDP 或政策利率 ≤ ${pc1(LT.zb2)} → ⑥`,
  6: `实际政策利率 ≤ ${pc1(LT.realP)}，政府与私人债务/GDP 都不再上升 → ⑦`,
  7: `DSR 比起点低 ≥ ${pp1(-LT.dsrLow)}、坏账率 ≤ ${pc1(LT.badLow)}、实际利率回到 ${pc1(LT.realP)} 以上、政府债务稳住 → ⑧`,
  8: `私人债务/GDP 三年升 ≥ ${pp1(LT.reUp)} 且信贷增速 ≥ ${pc1(LT.pcg)}（新一轮借钱）→ 回到 ①`,
};
const SHORT_NEXT_TXT = {
  expand: `通胀 ≥ ${pc1(ST.infl)} 且加息 → B1；信贷脉冲 ≤ ${pp1(ST.ci)} → B2；失业率较低点升 ≥ ${pp1(ST.uRise)} → 收紧·衰退`,
  B1: `失业率较低点升 ≥ ${pp1(ST.uRise)} 或信贷脉冲 ≤ ${pp1(ST.ciTight)} → 收紧·衰退；若通胀回落则回到扩张`,
  B2: `失业率较低点升 ≥ ${pp1(ST.uRise)} 或信贷脉冲 ≤ ${pp1(ST.ciTight)} → 收紧·衰退`,
  tight: `央行较高点降息 ≥ ${pp1(ST.cut)}（或已近零）→ 降息重启`,
  ease: `信贷脉冲回正且失业率不再上升 → 扩张`,
};

const back = (a, k) => a[Math.max(0, a.length - 1 - k)];
const item = (name, value, threshold, dir, fmt, o = {}) =>
  ({ name, value, threshold, dir, fmt, ok: dir === '>=' ? value >= threshold : value <= threshold, ...o });
// groups: ungrouped items are AND-ed, items sharing `grp` are OR-ed (one of them is enough)
const holds = items => {
  const g = {};
  for (const i of items) { const k = i.grp || ('#' + i.name); g[k] = g[k] || i.ok; }
  return Object.values(g).every(Boolean);
};

function longEvidence(f) {
  return {
    1: [item('私人债务/GDP 三年变化', f.pvtD12, LT.reUp, '>=', 'pp'), item('信贷增速', f.pcg, LT.pcg, '>=', 'pct', { term: 'creditImpulse' })],
    2: [item('私人债务/GDP 三年变化', f.pvtD12, LT.pvtUp, '>=', 'pp'), item('房价/收入（起点=1）', f.PIrel, LT.pi, '>=', 'x', { term: 'priceToIncome' })],
    5: [item('私人债务/GDP 较三年高点', f.pvtDD, LT.pvtDown, '<=', 'pp'),
      item('银行坏账率', f.bad, LT.bad, '>=', 'pct', { term: 'badLoans', grp: 'a' }),
      item('政策利率（降息空间）', f.pol, LT.zb, '<=', 'pct', { term: 'policyRate', grp: 'a' })],
    6: [item('政府债务/GDP 三年变化', f.govD12, LT.govUp, '>=', 'pp', { grp: 'a' }),
      item('财政赤字/GDP', f.defGdp, LT.deficit, '>=', 'pct', { term: 'fiscalInjection', grp: 'a' }),
      item('QE 存量/GDP', f.qeGdp, LT.qe, '>=', 'pct', { term: 'qe', grp: 'b' }),
      item('政策利率（零利率）', f.pol, LT.zb2, '<=', 'pct', { term: 'policyRate', grp: 'b' })],
    7: [item('实际政策利率', f.realP, LT.realP, '<=', 'pct', { term: 'realRate' }),
      item('政府债务/GDP 三年变化', f.govD12, LT.flat, '<=', 'pp'),
      item('私人债务/GDP 三年变化', f.pvtD12, LT.pvtFlat, '<=', 'pp')],
    8: [item('DSR 相对起点', f.dsrRel, LT.dsrLow, '<=', 'pp', { term: 'dsr' }),
      item('银行坏账率', f.bad, LT.badLow, '<=', 'pct', { term: 'badLoans' }),
      item('实际政策利率（压制结束）', f.realP, LT.realP, '>=', 'pct', { term: 'realRate' }),
      item('政府债务/GDP 三年变化', f.govD12, LT.flat, '<=', 'pp'),
      item('政府利息/税收', f.i2t, LT.i2t, '<=', 'pct', { term: 'interestToTax' })],
  };
}
function shortEvidence(f) {
  const recess = [item('失业率较 4 季低点', f.uRise, ST.uRise, '>=', 'pp', { term: 'unemployment', grp: 'a' }),
    item('信贷脉冲', f.ci, ST.ciTight, '<=', 'pp', { term: 'creditImpulse', grp: 'a' })];
  return {
    B1: [item('通胀', f.piY, ST.infl, '>=', 'pct', { term: 'cpi' }), item('政策利率 4 季变化', f.dPol4, ST.hike, '>=', 'pp', { term: 'policyRate' })],
    B2: [item('信贷脉冲', f.ci, ST.ci, '<=', 'pp', { term: 'creditImpulse' }),
      item('房价同比', f.hpYoY, ST.hp, '<=', 'pct', { term: 'housePrice', grp: 'a' }),
      item('DSR 相对起点', f.dsrRel, ST.dsr, '>=', 'pp', { term: 'dsr', grp: 'a' })],
    tight: recess,
    ease: [item('央行较 5 季高点降息', f.polDrop, ST.cut, '>=', 'pp', { term: 'policyRate', grp: 'a' }),
      item('政策利率（近零）', f.pol, ST.zb, '<=', 'pct', { term: 'policyRate', grp: 'a' })],
    expand: [item('信贷脉冲', f.ci, ST.ciBack, '>=', 'pp', { term: 'creditImpulse' }), item('失业率 4 季变化', f.uD4, ST.uFlat, '<=', 'pp', { term: 'unemployment' })],
  };
}

const HK = ['pvt', 'gov', 'pol', 'u'];
// prev: S.cyc (or null at t=0). x: inputs for this quarter. Returns { state, out:{long, short}, events }. Never mutates prev.
export function advanceCycles(prev, x0, t, date) {
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
  };
  const events = [];
  const now = { t, date };

  // ---------------- long cycle
  let L = prev ? prev.long : { stage: 1, since: now, streak: {} };
  const lev = longEvidence(f), lok = {};
  const streak = {};
  for (const s of LONG_ORDER) { lok[s] = holds(lev[s]); streak[s] = lok[s] && !warm ? (L.streak[s] || 0) + 1 : 0; }
  const li = LONG_ORDER.indexOf(L.stage);
  const lcand = [LONG_ORDER[(li + 1) % 6], LONG_ORDER[(li + 2) % 6]].filter((s, i) => i === 0 || s !== 1);   // may skip one stage, but ① is only entered from ⑧
  let lstage = L.stage, lsince = L.since, lstreak = streak;
  const hit = lcand.find(s => streak[s] >= LONG_N);
  if (hit != null) { events.push({ kind: 'long', from: L.stage, to: hit }); lstage = hit; lsince = now; lstreak = {}; }
  const lnext = LONG_ORDER[(LONG_ORDER.indexOf(lstage) + 1) % 6];
  let lbetween = null;
  if (hit == null) {
    const m = lcand.reduce((a, s) => (streak[s] > (streak[a] || 0) ? s : a), lcand[0]);
    if (streak[m] >= Math.ceil(LONG_N / 2)) lbetween = [L.stage, m];
  }
  const longOut = {
    stage: lstage, label: LONG_LABEL[lstage], between: lbetween,
    evidence: lev[lnext].map(i => ({ ...i, target: LONG_LABEL[lnext] })), met: holds(lev[lnext]),
    progress: { target: lnext, label: LONG_LABEL[lnext], have: lstreak[lnext] || 0, need: LONG_N },
    nextSignal: LONG_NEXT[lstage], since: lsince,
  };

  // ---------------- short cycle
  let S = prev ? prev.short : { phase: 'expand', via: null, since: now, dwell: 0, streak: {} };
  const sev = shortEvidence(f), sstreak = {};
  for (const p of Object.keys(sev)) sstreak[p] = holds(sev[p]) && !warm ? (S.streak[p] || 0) + 1 : 0;
  let phase = S.phase, via = S.via, ssince = S.since, dwell = S.dwell + 1, sst = sstreak;
  const scand = SHORT_NEXT[S.phase];
  let sbetween = null;
  if (dwell > SHORT_DWELL) {
    // soft landing out of a fork is only believed once the fork's own evidence is gone
    const sh = scand.find(p => sstreak[p] >= SHORT_N[p] && !(p === 'expand' && (S.phase === 'B1' || S.phase === 'B2') && sstreak[S.phase] > 0));
    if (sh != null) {
      phase = sh; ssince = now; dwell = 0; sst = {};
      if (sh === 'B1' || sh === 'B2') { via = sh; events.push({ kind: 'fork', to: sh }); }
      else if (sh === 'expand') via = null;
    }
  }
  if (phase === S.phase) {
    const m = scand.reduce((a, p) => (sstreak[p] > (sstreak[a] || 0) ? p : a), scand[0]);
    if (sstreak[m] >= 1 && sstreak[m] < SHORT_N[m]) sbetween = [S.phase, m];
  }
  const cands = SHORT_NEXT[phase];
  const shortOut = {
    phase, label: SHORT_LABEL[phase] + (via && phase !== 'B1' && phase !== 'B2' && phase !== 'expand' ? `（经 ${via}）` : ''),
    fork: phase === 'B1' || phase === 'B2' ? phase : null, via, between: sbetween,
    evidence: cands.flatMap(p => sev[p].map(i => ({ ...i, target: SHORT_LABEL[p], targetId: p }))),
    progress: cands.map(p => ({ target: p, label: SHORT_LABEL[p], have: (phase === S.phase ? sstreak[p] : 0), need: SHORT_N[p], met: holds(sev[p]) })),
    nextSignal: SHORT_NEXT_TXT[phase], since: ssince,
  };
  const state = { h, long: { stage: lstage, since: lsince, streak: lstreak }, short: { phase, via, since: ssince, dwell, streak: sst } };
  return { state, out: { long: longOut, short: shortOut }, events };
}

// Auto-pause triggers with edge detection + cooldown. `mem` is mutated (it lives in branch state).
export function detectPauses(v, mem, t, events = []) {
  const out = [];
  const fire = (code, message, cooldown) => {
    if (t < 8) return;
    if (mem.last[code] != null && t - mem.last[code] < cooldown) return;
    mem.last[code] = t;
    out.push({ code, message });
  };
  const outBand = v.piY > 0.035 || v.piY < 0.005;
  if (outBand && !mem.outBand) fire('CPI_BAND', `通胀 ${pct(v.piY)} 突破目标区间 [0.5%, 3.5%]`, 6);
  mem.outBand = outBand;
  const sgn = Math.abs(v.ci) > 0.004 ? Math.sign(v.ci) : 0;
  if (sgn !== 0) {
    if (mem.ciSign !== 0 && mem.ciSign !== sgn) fire('CREDIT_IMPULSE_FLIP', `信贷脉冲转${sgn < 0 ? '负' : '正'}（${pct(v.ci)}）`, 6);
    mem.ciSign = sgn;
  }
  const falling = v.hpQ < 0 && v.hpQPrev < 0;
  if (falling && !mem.falling) fire('HOUSE_FALLING', `房价连续两个季度下跌（本季 ${pct(v.hpQ)}）`, 8);
  mem.falling = falling;
  const dsrRed = v.dsr >= v.dsr0 + 0.04;
  if (dsrRed && !mem.dsrRed) fire('DSR_HIGH', `家庭 DSR ${pct(v.dsr)} 超过警戒线（起点+4pp）`, 8);
  mem.dsrRed = dsrRed;
  const capLow = v.capR < 0.075;
  if (capLow && !mem.capLow) fire('BANK_CAPITAL_LOW', `银行资本充足率 ${pct(v.capR)} 接近监管下限`, 8);
  mem.capLow = capLow;
  const i2t = v.i2t > 0.25;
  if (i2t && !mem.i2t) fire('GOV_INTEREST', `政府利息/税收 ${pct(v.i2t)} 偏高`, 8);
  mem.i2t = i2t;
  // cycle dials: pause only on a real long-stage change or on entering the B1/B2 fork of the short cycle
  for (const e of events) {
    if (e.kind === 'long') fire('LONG_STAGE', `大周期进入 ${LONG_LABEL[e.to]}（此前：${LONG_LABEL[e.from]}）`, 0);
    else if (e.kind === 'fork') fire('SHORT_FORK', `小周期进入岔路 ${e.to === 'B1' ? 'B1 过热（通胀 + 加息）' : 'B2 缩水（信贷与资产收缩）'}`, 4);
  }
  return out;
}
export { STAGES };
