// 「真实 / 模型」 mode helpers (app.js owns the state; this file is DOM-free apart from the badge / toggle html strings).
//   REAL_MODE_ISOS                         countries with a real data layer (src/data/real/real-snapshot.js)
//   loadRealMod()                          -> the real-snapshot module (dynamic import, cached)
//   viewSnapshot(model, real, model0, real0) -> the snapshot the water diagram draws in 真实 mode: the REAL values on top of the model's,
//                                             with snap.valueState = { est: Set<path>, none: Set<path> } (flow.js greys `est`, writes 「—」 for `none`).
//                                             model = the model snapshot of the same quarter, or null after the model's last quarter.
//   realHint(rm, iso, t)                   -> { unemp, cpi, house } real values for the 「真实 x」 hints of 模型 mode, inside 保留样本 (2022+)
//                                             and the known US model-gap windows (MODEL_GAPS unemployment rows in tabs/_util.js)
//   badgeHtml(cn, lastRealDate)            -> the time-bar badge 「真实数据 · 截至 2026Q3」 (long) + 「真实 · 至 26Q3」 (short, 390px phones)
// Display only: nothing here feeds the engine (2022+ is never fitted on).
import { MODEL_GAPS } from './tabs/_util.js';

export const REAL_MODE_ISOS = ['USA', 'AUS'];

let modP = null;
export function loadRealMod() {
  if (!modP) modP = import('../data/real/real-snapshot.js').catch(e => { modP = null; throw e; });
  return modP;
}

const num = x => typeof x === 'number' && Number.isFinite(x);
// sub-objects copied as a whole from the real snapshot (never mixed with the model's)
const ATOMIC = new Set(['lights', 'cycles', 'real', 'causal', 'outlets', 'ledger', 'pauses', 'modelOnly', 'notYet']);

function overlay(m, r, pre, notYet) {
  const o = m && typeof m === 'object' && !Array.isArray(m) ? { ...m } : {};
  for (const [k, v] of Object.entries(r)) {
    const p = pre ? pre + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && !ATOMIC.has(p)) o[k] = overlay(m && m[k], v, p, notYet);
    else if (v !== null && v !== undefined) o[k] = v;
    else if (notYet.has(p)) o[k] = null;
    else o[k] = m && m[k] !== undefined ? m[k] : null;            // model-only field: the model's estimate (null after the model's range)
  }
  return o;
}
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

/** real values over the model's; valueState says which numbers are model estimates (est) and which have no value (none) */
export function viewSnapshot(model, real, model0, real0) {
  const notYet = new Set(real.notYet || []);
  const v = overlay(model, real, '', notYet);
  v.t = real.t; v.date = real.date; v.branch = 'real'; v.scenario = 'real';
  v.outlets = real.outlets; v.lights = real.lights; v.cycles = real.cycles; v.real = real.real;
  v.macro = { ...(v.macro || {}) };
  // 河道深度 = demand / capacity: the real output gap (CBO for the USA, the HP estimate for AUS) is the same idea
  v.macro.demandPressure = num(real.macro.outputGap) ? real.macro.outputGap : null;
  // 产能: the real potential GDP as an index on the model's first quarter (the diagram reads capacity relative to the first quarter it drew)
  const pot = real.macro.capacity, pot0 = real0 && real0.macro.capacity, c0 = model0 && model0.macro && model0.macro.capacity;
  v.macro.capacity = num(pot) && num(pot0) && num(c0) && pot0 > 0 ? c0 * pot / pot0 : null;
  // 股票的 P/E: CAPE (USA) is not on the model's scale and AUS has none: no 贵 / 便宜 band on the real equity pool
  if (v.assets && v.assets.equity) v.assets.equity = { ...v.assets.equity, pe: null };
  const est = new Set(), none = new Set(notYet);
  for (const p of real.modelOnly || []) {
    if (p === 'macro.demandPressure') continue;
    if (get(v, p) == null) none.add(p); else est.add(p);
  }
  if (v.macro.capacity == null) none.add('macro.capacity');
  if (v.macro.demandPressure == null) none.add('macro.demandPressure');
  v.valueState = { est, none, lastModel: !model };
  return v;
}

// the known US model-gap windows for unemployment (MODEL_GAPS, the same windows as the 干涸 lamp's notes in objective.js:
// 2006Q1–2008Q2, 2009Q3–2013Q4, 2024Q1–2025Q4); written for the US run only, as the chart bands are
const inGap = (iso, d) => iso === 'USA' && MODEL_GAPS.some(g => g.key === 'unemployment' && d >= g.from && d <= g.to);
/** 模型 mode: the real unemployment / CPI / house price index at quarter t, inside 保留样本 (2022+) or a known model-gap window; else null */
export function realHint(rm, iso, t) {
  if (!rm || !REAL_MODE_ISOS.includes(iso)) return null;
  const r = rm.realSnapshot(iso, t);
  if (!r || !r.real || r.real.afterLastReal || !(r.real.inReserved || inGap(iso, r.date))) return null;
  const h = { unemp: r.macro.unemployment, cpi: r.macro.inflation, house: r.assets.housing.price };
  return Object.values(h).some(num) ? h : null;
}

export const shortQ = d => String(d || '').replace(/^\d\d(\d\d)Q(\d)$/, '$1Q$2');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function badgeHtml(cn, last) {
  return (cn ? `<span class="bd-c">${esc(cn)}</span><span class="bd-sep"> · </span>` : '') +
    `<span class="bd-rl">真实数据 · 截至 ${esc(last)}</span><span class="bd-rs">真实 · 至 ${esc(shortQ(last))}</span>`;
}
