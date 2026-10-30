// node tools/backtest_real.mjs [--write] [--quiet]
// Walk-forward (real-time) backtest of the framework's REAL-data readings (the two cycle dials and the lamps of src/data/real/real-snapshot.js).
// Question: read each quarter t with data dated <= t only, do the readings say anything about the next 4-8 quarters beyond persistence?
// Nothing is tuned: every threshold is the one in src/data/country-params.js / src/ui/objective.js. Method and results: tools/BACKTEST.md.
//
// Vintages. For every quarter t the real data files are cut at t (every series sliced to <= t) and the UNCHANGED real-snapshot.js code is run
// on that cut copy (it is loaded as a separate module instance with the cut data injected: see timelineOn). Three vintages:
//   A  'cut'    : the files cut at t, nothing else (checks that the pipeline itself never looks ahead: A at t == the app's full-sample reading)
//   B  'rt'     : A + the two inputs whose BUILT values embed later data are rebuilt one-sided as of t (US households: annual points at Q2, linear
//                 between -> flat after the last point dated <= t; qeGdp baseline = the 2007 (US) / 2019 (AUS) mean -> 0 until that year is over)
//                 MAIN RESULTS use B.
//   C  'lag'    : B + approximate publication lags (series not yet published ~1 month after the quarter ends are blanked; the app's own
//                 carry-forward fills them, as it does live). Robustness only.
// Outcomes (what happened next) always use the final data. Evaluation sample: readings 2000Q1-2021Q4 whose outcome window ends by 2021Q4;
// 2022Q1+ is the 保留样本 (held-out), reported separately and never used to choose anything.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { USA_REAL } from '../src/data/real/usa-real.js';
import { AUS_REAL } from '../src/data/real/aus-real.js';
import { lampsAt, uStarFor } from '../src/ui/objective.js';
import { countryParams } from '../src/data/country-params.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_FILE = path.join(ROOT, 'src/data/real/backtest.js');
export const REAL = { USA: USA_REAL, AUS: AUS_REAL };
export const ISOS = ['USA', 'AUS'];
export const IN_FROM = '2000Q1', IN_TO = '2021Q4', OUT_FROM = '2022Q1';
export const TRAIN_FROM = '1999Q1';   // first vintage (the BIS DSR starts 1999Q1: earlier vintages have no DSR at all in real time)

// NBER business-cycle chronology (fixed facts; first recession quarter = the quarter of the month after the NBER peak, last = trough quarter)
// peaks: 2001-03, 2007-12, 2020-02; troughs: 2001-11, 2009-06, 2020-04. The 1990-91 recession is before the 1995 data start.
export const NBER = [{ peak: '2001Q1', from: '2001Q2', to: '2001Q4' }, { peak: '2007Q4', from: '2008Q1', to: '2009Q2' }, { peak: '2020Q1', from: '2020Q1', to: '2020Q2' }];
// Australia has no NBER-style committee; the only recession in the sample is the 2020 COVID one (real GDP fell in 2020Q1 and 2020Q2, ABS 5206.0)
export const AUS_RECESSIONS = [{ peak: '2019Q4', from: '2020Q1', to: '2020Q2' }];

// approximate publication lags in quarters, as seen ~1 month after the quarter ends (variant C only)
export const LAGS = {
  USA: { houseIndex: 1, badLoans: 1, govDebtGdp: 1, govDeficitGdp: 1, govInterestToTax: 1, govInterestGdp: 1, households: 2,
    privateCredit: 2, privateCreditGdp: 2, hhDebtGdp: 2, hhDsr: 2 },
  AUS: { gdpNominal: 1, houseIndex: 1, qeGdp: 1, population: 2, privateCredit: 2, privateCreditGdp: 2, hhDebtGdp: 2, govDebtGdp: 2, hhDsr: 2 },
};

const num = x => typeof x === 'number' && Number.isFinite(x);
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const r4 = x => (num(x) ? Math.round(x * 1e4) / 1e4 : null);

// ---------------------------------------------------------------- the unchanged real-snapshot.js, run on a cut copy of the data
// real-snapshot.js binds its data at import time and has no truncation option, so its source is loaded as a fresh module instance per vintage
// with the two data imports replaced by the injected copy (no other change; the substitutions throw if the file no longer matches).
let TPL = null, NMOD = 0;
function template() {
  if (TPL) return TPL;
  let s = fs.readFileSync(path.join(ROOT, 'src/data/real/real-snapshot.js'), 'utf8');
  const fu = rel => pathToFileURL(path.join(ROOT, 'src', rel)).href;
  const rep = (a, b) => { if (!s.includes(a)) throw new Error('real-snapshot.js changed, cannot wrap it: ' + a); s = s.replace(a, b); };
  rep("import { USA_REAL } from './usa-real.js';", '');
  rep("import { AUS_REAL } from './aus-real.js';", '');
  rep("from '../../engine/regimes.js'", `from '${fu('engine/regimes.js')}'`);
  rep("from '../country-params.js'", `from '${fu('data/country-params.js')}'`);
  rep('const DATA = { USA: USA_REAL, AUS: AUS_REAL };', 'const DATA = globalThis.__BT_VINTAGE__[__ID__];');
  // export an uncached timeline so the module instance does not keep it alive
  s += '\nexport function __timelineOnce(iso) { const r = timeline(iso); delete CACHE[iso]; return r; }\n';
  return (TPL = s);
}
/** the real-snapshot.js timeline (lamps + dials per quarter) computed on the data object D (shaped like USA_REAL / AUS_REAL) */
export async function timelineOn(iso, D) {
  const id = ++NMOD, box = { [iso]: D };
  (globalThis.__BT_VINTAGE__ ||= {})[id] = box;
  const m = await import('data:text/javascript,' + encodeURIComponent(template().replace('__ID__', String(id)) + `\n// vintage ${id}`));
  const tl = m.__timelineOnce(iso);
  delete globalThis.__BT_VINTAGE__[id]; delete box[iso];
  return tl;
}

// ---------------------------------------------------------------- vintages
const isQ2 = d => d.endsWith('Q2');
/** data object as it would be built at quarter t. kind: 'cut' | 'rt' | 'lag'. mutate(series) optional (checks). */
export function vintage(iso, t, kind = 'rt', mutate = null) {
  const D = REAL[iso], n = t + 1;
  const series = {};
  for (const [k, a] of Object.entries(D.series)) series[k] = a.slice(0, n);
  if (kind === 'rt' || kind === 'lag') {
    // US households: annual points sit at Q2, linear in between. One-sided as of t: keep the values up to the last Q2 dated <= t, flat after.
    if (series.households) {
      let q2 = -1; for (let s = t; s >= 0; s--) if (isQ2(D.dates[s])) { q2 = s; break; }
      if (q2 >= 0) for (let s = q2 + 1; s <= t; s++) series.households[s] = series.households[q2];
    }
    // qeGdp: (central bank assets - mean of a base year) / GDP. The base-year mean is unknown until that year is over -> 0 before.
    const baseEnd = iso === 'USA' ? '2007Q4' : '2019Q4';
    if (t < D.dates.indexOf(baseEnd)) series.qeGdp = series.qeGdp.map(v => (num(v) ? 0 : v));
  }
  if (kind === 'lag') for (const [k, L] of Object.entries(LAGS[iso])) if (series[k]) for (let s = Math.max(0, n - L); s < n; s++) series[k][s] = null;
  if (mutate) mutate(series);
  return { ...D, dates: D.dates.slice(0, n), series };
}

// ---------------------------------------------------------------- one quarter's reading
const SHORT_CODE = { expand: 'E', hotP: 'P', hotA: 'A', tight: 'T', ease: 'C' };
export const CLASS_OF = r => (r.key === 'expand' ? '扩张' : r.key === 'hotP' || r.key === 'hotA' ? '过热' : r.key === 'tight' ? '收紧' : r.handoff === 'no' ? '推不动' : '降息');
/** the dial / lamp reading of timeline entry T at index t (b2Now and the real 湖崩 lamp exactly as real-snapshot.js build() / objective.js realBurstLamp) */
export function readingOf(T, t) {
  const L = T.cycles.long, S = T.cycles.short;
  let b2Now = false;
  if (L.forkEvidence) {
    const g = {};
    for (const i of L.forkEvidence) { if (i.support) continue; const k = i.grp || '#' + i.name; g[k] = g[k] || i.ok; }
    b2Now = t >= 8 && Object.values(g).every(Boolean);
  }
  const burst = L.fork === 'B2' || L.stage === 5 ? 'red' : b2Now || L.forkPending ? 'yellow' : 'green';
  const r = { date: T.date, key: S.key, label: S.label, handoff: S.handoff, via: S.via, stage: L.stage, fork: L.fork, pending: !!L.forkPending, b2Now, burst,
    lights: Object.fromEntries(Object.entries(T.lights).map(([k, l]) => [k, l.level])), gr: T.inputs.gr };
  r.cls = CLASS_OF(r);
  r.recessLabel = S.key === 'tight' && /衰退/.test(S.label);
  return r;
}
/** signature used to compare readings across vintages */
export const sig = r => JSON.stringify([r.key, r.label, r.handoff, r.stage, r.fork, r.pending, r.b2Now, r.burst, r.lights]);

/** walk-forward readings: R[t] = reading at t from the vintage cut at t (t from TRAIN_FROM) */
export async function walkForward(iso, kind, mutate = null) {
  const D = REAL[iso], R = new Array(D.dates.length).fill(null);
  for (let t = D.dates.indexOf(TRAIN_FROM); t < D.dates.length; t++) {
    const tl = await timelineOn(iso, vintage(iso, t, kind, mutate));
    R[t] = readingOf(tl[t], t);
  }
  return R;
}

// ---------------------------------------------------------------- lamps 河溢 / 河干 (objective.js lampsAt on the real CPI / unemployment)
const LEVEL_U = d => (d < 0.01 ? 'green' : d <= 0.03 ? 'yellow' : 'red');      // objective.js 河干 bands
const LEVEL_PI = d => (d < 0.01 ? 'green' : d <= 0.025 ? 'yellow' : 'red');    // objective.js 河溢 bands
function riverLamps(iso, t, pi, u) {
  const L = lampsAt({ t, macro: { inflation: pi, unemployment: u }, cycles: null, lights: null, bank: {}, gov: {} }, iso);
  const g = id => (L.find(x => x.id === id) || {}).level || null;
  return { flood: num(pi) ? g('flood') : null, drought: num(u) ? g('drought') : null };
}
export { LEVEL_U, LEVEL_PI };

// ---------------------------------------------------------------- the evaluation
const SIGN = { 扩张: { u: -1, pi: 1 }, 过热: { u: 1, pi: -1 }, 收紧: { u: 1, pi: -1 }, 降息: { u: -1, pi: -1 }, 推不动: { u: 1, pi: -1 } };
export const FRAMEWORK_SIGN = SIGN;   // pre-registered (written before any result was looked at); see BACKTEST.md
const CLASSES = ['扩张', '过热', '收紧', '降息', '推不动'];
const CLASS_TXT = { 扩张: '扩张', 过热: '过热', 收紧: '收紧', 降息: '降息（推得动/未定）', 推不动: '降息·推不动' };

export function ctx(iso, R) {
  const D = REAL[iso], S = D.series, I = d => D.dates.indexOf(d);
  const cp = countryParams(iso);
  const X = { u: S.unemployment, pi: S.cpiYoY, pvt: S.privateCreditGdp, cred: S.privateCredit, gov: S.govDebtGdp, pol: S.policyRate, y10: S.gov10y };
  // river lamps per quarter + a one-sided u* (trailing mean of unemployment over up to 40 quarters, data from 1995) for the 河干 sensitivity
  const lamps = D.dates.map((_, t) => riverLamps(iso, t, X.pi[t], X.u[t]));
  const uStarRT = D.dates.map((_, t) => mean(X.u.slice(Math.max(0, t - 39), t + 1).filter(num)));
  const droughtRT = D.dates.map((_, t) => (num(X.u[t]) ? LEVEL_U(X.u[t] - uStarRT[t]) : null));
  return { iso, D, I, X, R, cp, lamps, uStarRT, droughtRT, t0: I(TRAIN_FROM), in0: I(IN_FROM), in1: I(IN_TO), out0: I(OUT_FROM), n: D.dates.length };
}
// readings t in the sample whose outcome window [t, t+h] is available (and, in-sample, ends by 2021Q4)
function sample(C, which, h, need) {
  const ts = [];
  const [a, b] = which === 'in' ? [C.in0, C.in1 - h] : [C.out0, C.n - 1 - h];
  for (let t = a; t <= b; t++) if (C.R[t] && need.every(k => num(C.X[k][t]) && num(C.X[k][t + h]))) ts.push(t);
  return ts;
}
const d = (a, t, h) => a[t + h] - a[t];

/** the forecasts of the change in C.X[v] over t -> t+h made at t: they read X[s] and readings R[s] for s <= t only (checked by check_backtest) */
export function forecastAt(C, v, t, h = 4) {
  const X = C.X[v], tr = [];
  for (let s = C.t0; s + h <= t; s++) if (C.R[s] && num(X[s]) && num(X[s + h])) tr.push([C.R[s].cls, X[s + h] - X[s]]);
  const drift = tr.length ? mean(tr.map(x => x[1])) : 0;
  const same = tr.filter(x => x[0] === C.R[t].cls).map(x => x[1]);
  return { f: { noChange: 0, persistence: X[t] - X[t - h], drift, phaseMean: same.length >= 4 ? mean(same) : drift }, s: SIGN[C.R[t].cls][v] };
}

// (a) short dial phase vs the change in unemployment / CPI over t -> t+4
function evalShort(C, which, h = 4) {
  const out = { classes: {}, forecasts: {} };
  for (const v of ['u', 'pi']) {
    const X = C.X[v], ts = sample(C, which, h, [v]).filter(t => num(X[t - h]));
    const by = {};
    for (const t of ts) (by[C.R[t].cls] ||= []).push(t);
    out.classes[v] = CLASSES.map(c => {
      const a = (by[c] || []).map(t => d(X, t, h));
      const p = (by[c] || []).map(t => X[t] - X[t - h]);
      return { cls: c, n: a.length, mean: r4(mean(a)), up: a.length ? r4(a.filter(x => x > 0).length / a.length) : null, prior: r4(mean(p)) };
    });
    // forecasts made at t with data <= t: no change, persistence (last h quarters' change continues), drift (mean of all realised changes so far),
    // phase mean (mean of realised changes after quarters in the same dial class so far; < 4 such quarters -> drift), framework sign (direction only)
    const rows = ts.map(t => ({ t, a: d(X, t, h), ...forecastAt(C, v, t, h) }));
    const up = x => x > 0;
    const res = {};
    for (const k of ['noChange', 'persistence', 'drift', 'phaseMean']) {
      res[k] = { n: rows.length, mae: r4(mean(rows.map(r => Math.abs(r.a - r.f[k])))), hit: rows.length ? r4(rows.filter(r => up(r.f[k]) === up(r.a)).length / rows.length) : null };
    }
    res.framework = { n: rows.length, mae: null, hit: rows.length ? r4(rows.filter(r => (r.s > 0) === up(r.a)).length / rows.length) : null };
    out.forecasts[v] = res;
    // the same class table over 8 quarters (description only, no forecast)
    const t8 = sample(C, which, 8, [v]);
    out.classes8 ||= {};
    out.classes8[v] = CLASSES.map(c => { const a = t8.filter(t => C.R[t].cls === c).map(t => d(X, t, 8)); return { cls: c, n: a.length, mean: r4(mean(a)), up: a.length ? r4(a.filter(x => x > 0).length / a.length) : null }; });
  }
  return out;
}

// (b) long dial: B2 / 湖崩 vs unemployment and credit over t -> t+8; ⑦ vs government debt / GDP
function evalLong(C, which) {
  const h = 8, ts = sample(C, which, h, ['u', 'pvt', 'cred']).filter(t => num(C.X.u[t - h]));
  const X = C.X;
  const grp = (name, f) => {
    const g = ts.filter(t => f(C.R[t]));
    return { name, n: g.length, du8: r4(mean(g.map(t => d(X.u, t, h)))), uUp: g.length ? r4(g.filter(t => d(X.u, t, h) > 0).length / g.length) : null,
      prior8: r4(mean(g.map(t => X.u[t] - X.u[t - h]))), dpvt8: r4(mean(g.map(t => d(X.pvt, t, h)))), priorPvt8: r4(mean(g.map(t => X.pvt[t] - X.pvt[t - h]))), cred8: r4(mean(g.map(t => X.cred[t + h] / X.cred[t] - 1))),
      quarters: g.length <= 12 ? g.map(t => C.D.dates[t]) : null };
  };
  const b2 = [grp('B2 已确认', r => r.fork === 'B2'), grp('湖崩 红（B2 或 ⑤）', r => r.burst === 'red'), grp('湖崩 黄（B2 证据成立/待确认）', r => r.burst === 'yellow'),
    grp('湖崩 绿', r => r.burst === 'green'), grp('全部', () => true)];
  // ⑦: g − r >= 0 and gov debt/GDP not up vs a year ago, 6 quarters in a row -> stage 7. Outcome: gov debt/GDP over the next 4 / 8 quarters.
  const g4 = sample(C, which, 4, ['gov']).filter(t => num(X.gov[t - 4]));
  const s7 = (name, f) => {
    const g = g4.filter(f), g8 = g.filter(t => num(X.gov[t + 8]) && (which === 'out' || t + 8 <= C.in1));
    return { name, n: g.length, dgov4: r4(mean(g.map(t => d(X.gov, t, 4)))), fall4: g.length ? r4(g.filter(t => d(X.gov, t, 4) <= 0).length / g.length) : null,
      n8: g8.length, dgov8: r4(mean(g8.map(t => d(X.gov, t, 8)))), fall8: g8.length ? r4(g8.filter(t => d(X.gov, t, 8) <= 0).length / g8.length) : null };
  };
  const gate = t => num(C.R[t].gr) && C.R[t].gr >= 0 && X.gov[t] - X.gov[t - 4] <= 0;
  const seven = [s7('⑦ 阶段', t => C.R[t].stage === 7), s7('⑦ 的条件本季成立（g−r≥0 且 债务/GDP 一年不升）', gate),
    s7('只看持续：债务/GDP 一年不升', t => X.gov[t] - X.gov[t - 4] <= 0), s7('只看持续：债务/GDP 一年在升', t => X.gov[t] - X.gov[t - 4] > 0), s7('全部', () => true)];
  return { b2, seven };
}

// (c) lamps 河溢 / 河干 at t vs t+4: persistence (= the lamp itself), always green, trend (the gap moved on by its last 4-quarter change)
function evalLamps(C, which, h = 4) {
  const X = C.X, tgt = C.cp.piTarget, out = {};
  const defs = {
    flood: { v: 'pi', lvl: t => C.lamps[t].flood, dev: (x, t) => Math.abs(x - tgt), band: LEVEL_PI, trendX: t => 2 * X.pi[t] - X.pi[t - h] },
    drought: { v: 'u', lvl: t => C.lamps[t].drought, dev: (x, t) => x - uStarOf(C, t), band: LEVEL_U, trendX: t => 2 * X.u[t] - X.u[t - h] },
    droughtRT: { v: 'u', lvl: t => C.droughtRT[t], dev: (x, t) => x - C.uStarRT[t], band: LEVEL_U, trendX: t => 2 * X.u[t] - X.u[t - h] },
  };
  for (const [id, L] of Object.entries(defs)) {
    const ts = sample(C, which, h, [L.v]).filter(t => num(X[L.v][t - h]));
    const rows = ts.map(t => ({ t, now: L.lvl(t), next: L.lvl(t + h), dDev: L.dev(X[L.v][t + h], t + h) - L.dev(X[L.v][t], t), trend: L.band(L.dev(L.trendX(t), t)) }));   // trend forecast: u* / target as known at t
    const by = ['green', 'yellow', 'red'].map(lv => {
      const g = rows.filter(r => r.now === lv);
      return { level: lv, n: g.length, same: g.length ? r4(g.filter(r => r.next === lv).length / g.length) : null,
        nextGreen: g.length ? r4(g.filter(r => r.next === 'green').length / g.length) : null, dDev: r4(mean(g.map(r => r.dDev))) };
    });
    const hit = f => (rows.length ? r4(rows.filter(r => f(r) === r.next).length / rows.length) : null);
    out[id] = { n: rows.length, by, persistence: hit(r => r.now), alwaysGreen: hit(() => 'green'), trend: hit(r => r.trend) };
  }
  return out;
}
export const uStarOf = (C, t) => uStarFor(C.cp, t);   // the same u* as objective.js lampsAt

// (d) recessions: readings 0-4 quarters before the first recession quarter; precision vs the base rate
export const SIGNALS = {
  '收紧（任何）': r => r.key === 'tight',
  '收紧·衰退': r => r.recessLabel,
  '降息·推不动': r => r.handoff === 'no',
  '收紧 或 推不动': r => r.key === 'tight' || r.handoff === 'no',
  '降息（任何）': r => r.key === 'ease',
};
function evalRecessions(C, which, list) {
  const I = C.I, inRec = new Set(), onsets = list.map(x => I(x.from));
  for (const x of list) for (let t = I(x.from); t <= I(x.to); t++) inRec.add(t);
  const [a, b] = which === 'in' ? [C.in0, C.in1] : [C.out0, C.n - 1];
  const ref = { ...SIGNALS, '参照：收益率倒挂（10 年 < 政策利率）': (r, t) => num(C.X.y10[t]) && num(C.X.pol[t]) && C.X.y10[t] < C.X.pol[t] };
  // a reading can only be scored when its 4-quarter window is observed (in-sample: ends by 2021Q4)
  const last = which === 'in' ? C.in1 - 4 : C.n - 1 - 4;
  const ts = []; for (let t = a; t <= Math.min(b, last); t++) if (C.R[t] && !inRec.has(t)) ts.push(t);
  const hitAt = t => onsets.some(o => o >= t && o <= t + 4);
  const base = ts.length ? ts.filter(hitAt).length / ts.length : null;
  const table = Object.entries(ref).map(([name, f]) => {
    const on = ts.filter(t => f(C.R[t], t)), hits = on.filter(hitAt);
    const caught = list.filter(x => { const o = I(x.from); if (o < a || o > b) return false; for (let t = o - 4; t <= o; t++) if (C.R[t] && f(C.R[t], t)) return true; return false; });
    const lead = list.map(x => { const o = I(x.from); if (o < a || o > b) return null; for (let t = o - 4; t <= o; t++) if (C.R[t] && f(C.R[t], t)) return o - t; return '—'; }).filter(x => x !== null);
    return { name, on: on.length, hits: hits.length, precision: on.length ? r4(hits.length / on.length) : null, caught: caught.length, lead };
  });
  const episodes = list.filter(x => I(x.from) >= a && I(x.from) <= b).map(x => {
    const o = I(x.from), w = [];
    for (let t = o - 4; t <= o; t++) w.push(`${C.D.dates[t]} ${C.R[t] ? C.R[t].label + (C.R[t].handoff === 'no' ? '·推不动' : '') : '—'}`);
    return { from: x.from, window: w };
  });
  return { n: ts.length, base: r4(base), table, episodes, recessionsInSample: episodes.length };
}

// ---------------------------------------------------------------- run everything
export async function runBacktest({ variants = ['cut', 'rt', 'lag'] } = {}) {
  const res = { countries: {} };
  for (const iso of ISOS) {
    const RV = {};
    for (const k of variants) RV[k] = await walkForward(iso, k);
    const C = ctx(iso, RV.rt);
    const recList = iso === 'USA' ? NBER : AUS_RECESSIONS;
    const ev = which => ({ short: evalShort(C, which), short8: evalShort(C, which, 8), long: evalLong(C, which), lamps: evalLamps(C, which), recess: evalRecessions(C, which, recList) });
    const r = { in: ev('in'), out: ev('out') };
    // robustness: the same short-dial and recession tables on the publication-lag vintage C
    if (RV.lag) { const CL = ctx(iso, RV.lag); r.lag = { in: { short: evalShort(CL, 'in'), recess: evalRecessions(CL, 'in', recList) }, out: { short: evalShort(CL, 'out'), recess: evalRecessions(CL, 'out', recList) } }; }
    // how much the vintages differ (t >= 2000Q1)
    const diff = (a, b) => { const q = []; for (let t = C.in0; t < C.n; t++) if (a[t] && b[t] && sig(a[t]) !== sig(b[t])) q.push(C.D.dates[t]); return q; };
    r.vintageDiff = { cutVsRt: RV.cut ? diff(RV.cut, RV.rt) : null, rtVsLag: RV.lag ? diff(RV.rt, RV.lag) : null,
      lagShortDiff: RV.lag ? (() => { let k = 0; for (let t = C.in0; t < C.n; t++) if (RV.lag[t].key !== RV.rt[t].key || RV.lag[t].handoff !== RV.rt[t].handoff) k++; return k; })() : null,
      lagLongDiff: RV.lag ? (() => { let k = 0; for (let t = C.in0; t < C.n; t++) if (RV.lag[t].stage !== RV.rt[t].stage || RV.lag[t].fork !== RV.rt[t].fork || RV.lag[t].burst !== RV.rt[t].burst) k++; return k; })() : null,
      b2: Object.fromEntries(Object.entries(RV).map(([k, R]) => [k, R.map((x, t) => (x && t >= C.in0 && x.fork === 'B2' ? C.D.dates[t] : null)).filter(Boolean)])),
      stage7From: Object.fromEntries(Object.entries(RV).map(([k, R]) => [k, (R.find((x, t) => x && t >= C.in0 && x.stage === 7) || {}).date || null])) };
    // compact per-quarter readings (vintage B) from 2000Q1
    const from = C.in0, R = RV.rt, L1 = { green: 'g', yellow: 'y', red: 'r' };
    r.readings = {
      from: C.D.dates[from], to: C.D.dates[C.n - 1],
      short: R.slice(from).map(x => SHORT_CODE[x.key]).join(''),
      handoff: R.slice(from).map(x => (x.handoff === 'no' ? 'n' : '.')).join(''),
      recess: R.slice(from).map(x => (x.recessLabel ? 'r' : '.')).join(''),
      long: R.slice(from).map(x => String(x.stage)).join(''),
      fork: R.slice(from).map(x => (x.fork === 'B2' ? 'b' : x.fork === 'B1' ? 'p' : x.pending ? '?' : '.')).join(''),
      burst: R.slice(from).map(x => L1[x.burst]).join(''),
      flood: C.lamps.slice(from).map(x => (x.flood ? L1[x.flood] : '-')).join(''),
      drought: C.lamps.slice(from).map(x => (x.drought ? L1[x.drought] : '-')).join(''),
      droughtRT: C.droughtRT.slice(from).map(x => (x ? L1[x] : '-')).join(''),
    };
    res.countries[iso] = r;
    res.countries[iso].__R = RV;   // full readings for the checker (not written to the file)
  }
  return res;
}

// ---------------------------------------------------------------- output
const pct = (x, dgt = 0) => (num(x) ? (x * 100).toFixed(dgt) + '%' : '—');
const pp = (x, dgt = 2) => (num(x) ? (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(dgt) + 'pp' : '—');
const md = (head, rows) => ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|', ...rows.map(r => '| ' + r.join(' | ') + ' |')].join('\n');
const SAMPLE_TXT = { in: '2000–2021（评估样本）', out: '2022+（保留样本，只报告）' };
const F_TXT = { noChange: '不变（0）', persistence: '持续（过去 h 季的变化再来一次）', drift: '平均漂移（到 t 为止全部已实现变化的均值）', phaseMean: '表盘分组均值（同一档位到 t 为止已实现变化的均值）', framework: '框架方向（预先写定的方向表）' };

export function tables(res) {
  const L = [];
  for (const iso of ISOS) {
    const r = res.countries[iso];
    for (const w of ['in', 'out']) {
      const S = r[w];
      L.push(`\n### ${iso} · ${SAMPLE_TXT[w]}\n`);
      L.push('**(a) 小周期表盘档位 → 之后 4 季的变化**（失业率 u、CPI 通胀 π；「之前 4 季」= 读数之前 4 季的变化，看档位是不是只是在重复已有的趋势）\n');
      L.push(md(['档位', 'n', 'Δu 4 季', 'u 上升占比', '之前 4 季 Δu', 'Δπ 4 季', 'π 上升占比', '之前 4 季 Δπ', 'n(8 季)', 'Δu 8 季（上升占比）', 'Δπ 8 季（上升占比）'],
        CLASSES.map((c, i) => { const a = S.short.classes.u[i], b = S.short.classes.pi[i], a8 = S.short.classes8.u[i], b8 = S.short.classes8.pi[i];
          return [CLASS_TXT[c], a.n, pp(a.mean), pct(a.up), pp(a.prior), pp(b.mean), pct(b.up), pp(b.prior), a8.n, a8.n ? `${pp(a8.mean)}（${pct(a8.up)}）` : '—', b8.n ? `${pp(b8.mean)}（${pct(b8.up)}）` : '—']; })));
      L.push('');
      const fc = (F, k, v) => [F[v][k].mae == null ? '—' : pp(F[v][k].mae).slice(1), pct(F[v][k].hit)];
      L.push(md(['预测（在 t 时只用 ≤ t 的数据）', 'h=4：u 误差', 'u 方向命中', 'π 误差', 'π 方向命中', 'h=8：u 误差', 'u 方向命中', 'π 误差', 'π 方向命中'],
        ['noChange', 'persistence', 'drift', 'phaseMean', 'framework'].map(k => [F_TXT[k], ...fc(S.short.forecasts, k, 'u'), ...fc(S.short.forecasts, k, 'pi'),
          ...fc(S.short8.forecasts, k, 'u'), ...fc(S.short8.forecasts, k, 'pi')])));
      L.push(`\nn = ${S.short.forecasts.u.persistence.n} 季（h=4）/ ${S.short8.forecasts.u.persistence.n} 季（h=8）。误差 = 平均绝对误差；方向命中 = 预测「上升」/「不升」与实际一致的占比；「不变」= 永远猜「不升」。`);
      L.push('\n**(b) 大周期：B2 / 湖崩 → 之后 8 季**\n');
      L.push(md(['读数', 'n', 'Δu 8 季', 'u 上升占比', '之前 8 季 Δu', 'Δ私人债务/GDP 8 季', '之前 8 季 Δ私人债务/GDP', '信贷存量 8 季增长', '季度'],
        S.long.b2.map(g => [g.name, g.n, pp(g.du8, 1), pct(g.uUp), pp(g.prior8, 1), pp(g.dpvt8, 1), pp(g.priorPvt8, 1), pct(g.cred8, 1), g.quarters ? g.quarters.join(' ') || '—' : '（多）'])));
      L.push('\n**(b) ⑦ → 政府债务/GDP 之后 4 / 8 季**\n');
      L.push(md(['读数', 'n', 'Δ债务/GDP 4 季', '4 季不升占比', 'n(8 季)', 'Δ债务/GDP 8 季', '8 季不升占比'],
        S.long.seven.map(g => [g.name, g.n, pp(g.dgov4, 1), pct(g.fall4), g.n8, pp(g.dgov8, 1), pct(g.fall8)])));
      L.push('\n**(c) 灯：现在的颜色 → 4 季后的颜色**（命中率 = 猜中 4 季后颜色的占比）\n');
      const LN = { flood: '河溢（通胀离目标多远）', drought: '河干（失业率 − u*，app 的 u*）', droughtRT: '河干（u* = 过去 10 年失业率均值，单边）' };
      L.push(md(['灯', 'n', '持续（= 灯本身）', '永远绿', '趋势外推', '绿→仍绿', '黄→仍黄', '红→仍红', '红 之后偏离变化'],
        Object.entries(S.lamps).map(([id, x]) => [LN[id], x.n, pct(x.persistence), pct(x.alwaysGreen), pct(x.trend),
          ...x.by.map(b => (b.n ? `${pct(b.same)} (n=${b.n})` : '—')), pp(x.by[2].dDev, 1)])));
      L.push(`\n**(d) 衰退（${iso === 'USA' ? 'NBER' : 'ABS 2020 两季负增长'}）：读数之后 0–4 季内开始衰退**（不计已在衰退中的季度；基准 = 任意一季之后 0–4 季内开始衰退的比例 ${pct(S.recess.base)}，n = ${S.recess.n}）\n`);
      L.push(md(['信号', '亮的季数', '其中 0–4 季内衰退开始', '准确率', `抓到的衰退（共 ${S.recess.recessionsInSample}）`, '最早提前几季'],
        S.recess.table.map(x => [x.name, x.on, x.hits, pct(x.precision), x.caught, x.lead.join(' / ') || '—'])));
      for (const e of S.recess.episodes) L.push(`\n- 衰退 ${e.from}：之前 4 季到当季的读数：${e.window.join('；')}`);
      if (r.lag) {
        const G = r.lag[w];
        L.push(`\n*稳健性（发布滞后版本 C）：* u 平均误差 持续 ${pp(G.short.forecasts.u.persistence.mae).slice(1)} / 分组均值 ${pp(G.short.forecasts.u.phaseMean.mae).slice(1)}，方向命中 持续 ${pct(G.short.forecasts.u.persistence.hit)} / 框架 ${pct(G.short.forecasts.u.framework.hit)}；` +
          `π 平均误差 持续 ${pp(G.short.forecasts.pi.persistence.mae).slice(1)} / 分组均值 ${pp(G.short.forecasts.pi.phaseMean.mae).slice(1)}，方向命中 持续 ${pct(G.short.forecasts.pi.persistence.hit)} / 框架 ${pct(G.short.forecasts.pi.framework.hit)}；` +
          `衰退信号「收紧 或 推不动」亮 ${G.recess.table[3].on} 季、准确率 ${pct(G.recess.table[3].precision)}、抓到 ${G.recess.table[3].caught}/${G.recess.recessionsInSample}。`);
      }
    }
    const vd = r.vintageDiff;
    L.push(`\n**${iso} 版本差异（2000Q1 起）**：A（只截断）vs B（单边修正）读数不同的季度：${vd.cutVsRt ? (vd.cutVsRt.join(' ') || '无') : '—'}；B vs C（发布滞后）读数（含灯）不同 ${vd.rtVsLag ? vd.rtVsLag.length : '—'} 季，其中小周期档位不同 ${vd.lagShortDiff ?? '—'} 季、大周期阶段/岔路/湖崩灯不同 ${vd.lagLongDiff ?? '—'} 季。` +
      ` B2 已确认的季度：${Object.entries(vd.b2).map(([k, q]) => `${k} ${q.length ? q[0] + '–' + q.at(-1) + `（${q.length} 季）` : '无'}`).join('；')}。进入 ⑦：${Object.entries(vd.stage7From).map(([k, q]) => `${k} ${q || '无'}`).join('；')}。`);
  }
  return L.join('\n');
}

/** the generated file (deterministic) */
export function fileText(res) {
  const strip = r => { const { __R, ...o } = r; return o; };
  const o = { generatedBy: 'tools/backtest_real.mjs --write', method: 'tools/BACKTEST.md', vintage: 'B (rt): data cut at t, US households and qeGdp baselines one-sided',
    inSample: `${IN_FROM}..${IN_TO} (outcome window ends by ${IN_TO})`, heldOut: `${OUT_FROM}+`, nber: NBER, ausRecessions: AUS_RECESSIONS,
    codes: { short: 'E 扩张, P 过热·物价, A 过热·资产, T 收紧, C 降息', handoff: 'n = 推不动', recess: 'r = 收紧·衰退', long: 'stage digit', fork: 'b B2, p B1, ? B2 待确认', lamps: 'g/y/r' },
    countries: Object.fromEntries(ISOS.map(iso => [iso, strip(res.countries[iso])])) };
  return '// GENERATED by tools/backtest_real.mjs --write: walk-forward backtest of the real-data dials and lamps. Do not edit; method in tools/BACKTEST.md.\n' +
    '// tools/check_backtest.mjs checks that this file matches the script and that the pipeline never looks ahead.\n' +
    'export const BACKTEST = ' + JSON.stringify(o) + ';\n';
}

// tools/BACKTEST.md carries the tables between these two markers (refreshed by --write, checked by check_backtest.mjs)
export const DOC_FILE = path.join(ROOT, 'tools/BACKTEST.md');
export const DOC_BEGIN = '<!-- BEGIN GENERATED TABLES (node tools/backtest_real.mjs --write) -->', DOC_END = '<!-- END GENERATED TABLES -->';
export function docSection(doc) { const a = doc.indexOf(DOC_BEGIN), b = doc.indexOf(DOC_END); return a < 0 || b < a ? null : doc.slice(a + DOC_BEGIN.length, b); }
export const docTables = res => '\n' + tables(res).trim() + '\n';

// ---------------------------------------------------------------- main
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const t0 = Date.now();
  const res = await runBacktest();
  if (!process.argv.includes('--quiet')) console.log(tables(res));
  if (process.argv.includes('--write')) {
    fs.writeFileSync(OUT_FILE, fileText(res)); console.log(`\nwrote ${path.relative(ROOT, OUT_FILE)} (${fs.statSync(OUT_FILE).size} bytes)`);
    if (fs.existsSync(DOC_FILE)) {
      const doc = fs.readFileSync(DOC_FILE, 'utf8'), old = docSection(doc);
      if (old == null) console.log(`(${path.relative(ROOT, DOC_FILE)} has no table markers: not touched)`);
      else { fs.writeFileSync(DOC_FILE, doc.replace(DOC_BEGIN + old + DOC_END, DOC_BEGIN + docTables(res) + DOC_END)); console.log(`refreshed the tables in ${path.relative(ROOT, DOC_FILE)}`); }
    }
  }
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
