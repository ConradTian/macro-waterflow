// Town-lesson state machine, shared by the UI runner (lessons.js) and tools/check_role_lessons.mjs. No DOM, no Node-only APIs.
//
// A town lesson is a list of steps. The town world is rebuilt from scratch for every step (reset + replay of all earlier steps), so
// ?step=N, "上一步" and "下一步" always show exactly the same state. Per step the replay does, in this order:
//   1. entry effects      st.do        (all step types; applied when the step is entered)
//   2. tap effects        action / actions / valve+value   (action and valve steps: applied when the learner taps; replay applies them)
//   3. st.quarters        quarters of sim.step()           (0 / undefined = none)
//   4. after effects      st.after     (replay only: undo a scenario once the step is over)
//   5. valve steps with keep:false clear their valve again
// 'try' steps are sandboxes: they never carry state into later steps.
// Effect objects: { action:{...townAction} } | { valve:id, value } | { delays:bool } | { rule:id, on:bool } | { param:'rule.key', value } | { reset:true }
import { VALVES } from '../engine/valves.js';
import { createSim } from '../engine/sim.js';
import { lampsAt } from './objective.js';      // 总目标 lamps ('lamp.<id>' getters); objective.js is DOM-free at import time

const arr = x => (x == null ? [] : Array.isArray(x) ? x : [x]);
export { arr };

export function clearValve(s, id) {
  const v = VALVES.find(x => x.id === id);
  if (!v) return;
  if (v.ruleParam) s.setValve(id, v.default); else s.setValve(id, null);
}

export function applyOne(s, d, L) {
  if (!d) return null;
  if (d.reset) { s.reset(); if (L) for (const r of s.rules) s.setRuleEnabled(r.id, ruleOnFor(L, r.id)); return null; }   // back to a fresh town (same rules, same delays)
  if (d.action) return s.townAction(d.action);
  if (d.valve) { if (d.value == null) clearValve(s, d.valve); else s.setValve(d.valve, d.value); return null; }
  if (d.delays != null) { s.setDelays(!!d.delays); return null; }
  if (d.rule) { s.setRuleEnabled(d.rule, d.on !== false); return null; }
  if (d.param) { const [r, k] = d.param.split('.'); s.setRuleParam(r, k, d.value); return null; }
  return null;
}
export const applyAll = (s, list, L) => arr(list).map(d => applyOne(s, d, L));

// what a tap performs (action / valve steps)
export function tapEffects(st) {
  if (st.type === 'action') return arr(st.actions || st.action).map(a => ({ action: a }));
  if (st.type === 'valve') return [{ valve: st.valve, value: st.value }];
  return [];
}

// positions: town steps are quarter indices (numbers); a 'zoom' step switches to the US world where steps use 'YYYYQn' strings
export function lessonPositions(L) {
  let world = L.scenario === 'town' ? 'town' : 'us';
  let end = world === 'town' ? 0 : L.startDate;
  return L.steps.map(s => {
    let from, until;
    if (s.type === 'zoom') { world = 'us'; from = s.date; until = s.until || s.date; }
    else if (world === 'town') { if (arr(s.do).some(d => d && d.reset)) end = 0; from = end; until = from + (s.type === 'try' ? 0 : (s.quarters || 0)); }
    else { from = s.from || end; until = s.until || from; }
    end = until;
    return { from, until, world };
  });
}

export function ruleOnFor(L, id) { return !Array.isArray(L.rulesOn) || L.rulesOn.includes(id); }

// rebuild the town in sim `s` as it is when step `upto` is entered (before its own entry effects)
export function replayTown(s, L, upto, pos = lessonPositions(L)) {
  s.setDelays(!!L.delays);
  s.reset();
  for (const r of s.rules) s.setRuleEnabled(r.id, ruleOnFor(L, r.id));
  for (let k = 0; k < upto; k++) {
    const st = L.steps[k];
    if (pos[k].world !== 'town' || st.type === 'try') continue;
    applyAll(s, st.do, L);
    applyAll(s, tapEffects(st), L);
    const n = (pos[k].until - pos[k].from) | 0;
    for (let q = 0; q < n && !s.done; q++) s.step();
    applyAll(s, st.after, L);
    if (st.type === 'valve' && st.keep === false) clearValve(s, st.valve);
  }
  return s;
}

// path into a snapshot. 'share.toCash' (also toHousing/toEquity/toBond/toGold) = that pool's share of the quarter's new money
// Derived paths (main-line course, 2026-10-29):
//   'gdp.<path>'   a QUARTERLY flow as a share of GDP, annualised (x 4 / macro.gdpNominal: the same base as the diagram chips), e.g. gdp.flows.wages
//   'out.C|I|G|NX' the four outlets of the goods channel as shares of GDP, the same formula as outletsOf() in src/ui/flow.js (C = the residual)
//   'lamp.flood|drought|burst|overdraft'  level of a 总目标 lamp ('green'|'yellow'|'red', lampsAt of src/ui/objective.js, US view);
//   'lamps.lit'    how many of the four lamps are not green
//   '<a>/<b>'      ratio of two plain paths (annual stocks), e.g. gov.deficit/macro.gdpNominal
const GDP = o => o && o.macro && o.macro.gdpNominal;
const plain = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
export const getPath = (o, p) => {
  p = String(p);
  if (p.startsWith('share.')) {
    const f = o && o.flows; if (!f) return null;
    const tot = (f.toHousing || 0) + (f.toEquity || 0) + (f.toBond || 0) + (f.toGold || 0) + (f.toCash || 0);
    return tot > 1e-9 ? (f[p.slice(6)] || 0) / tot : null;
  }
  if (p.startsWith('gdp.')) { const v = plain(o, p.slice(4)), g = GDP(o); return typeof v === 'number' && g > 0 ? v * 4 / g : null; }
  if (p.startsWith('out.')) {
    const g = GDP(o); if (!(g > 0)) return null;
    const I = (o.firm?.capex ?? 0) / 4, G = o.flows?.govPurchases ?? 0, NX = o.border?.netExports ?? 0, C = Math.max(0, g / 4 - I - G - NX);
    const v = { C, I, G, NX }[p.slice(4)];
    return v == null ? null : v * 4 / g;
  }
  if (p.startsWith('lamp.') || p === 'lamps.lit') {
    if (!o || !o.macro || o.scenario === 'town') return null;
    const L = lampsAt(o, 'USA');
    if (p === 'lamps.lit') return L.filter(l => l.level !== 'green').length;
    const l = L.find(x => x.id === p.slice(5));
    return l ? l.level : null;
  }
  if (p.includes('/')) { const [a, b] = p.split('/'), x = plain(o, a), y = plain(o, b); return typeof x === 'number' && typeof y === 'number' && y !== 0 ? x / y : null; }
  return plain(o, p);
};

// 'try' step: run `n` quarters from the state at step i with a given set of effects; returns the snapshots of those quarters
export function runTry(makeSim, L, i, effects, n) {
  const s = makeSim();
  replayTown(s, L, i);
  applyAll(s, L.steps[i].do, L);
  applyAll(s, effects, L);
  const hist = [];
  for (let q = 0; q < n && !s.done; q++) hist.push(s.step());
  return hist;
}

/* ============================================================================================================================
 * LIVE NUMBERS for the US cycle lessons (1-7). No DOM. Used by src/ui/lessons.js AND tools/check_lessons.mjs.
 *
 * A text may contain {key} or {key.k} placeholders. They are filled from scratch simulations at run time, so the lesson text can never
 * drift from the engine:
 *   step.vals : [{ key, get, fmt, from?, until?, set? }]     window defaults to the step's own window (from..until)
 *   experiment step.metrics[].key  -> {key.0} {key.1} ... (value under choice k)   {key.base} {key.you} (slider)   {key.1-0} (|difference|)
 * `get` = 'agg:path' evaluated on the snapshots of the window:
 *   end first start(=value at `from`) max min sum avg | chg (end/start-1) dpp (end-start) dd (max drawdown, <= 0) | argmax argmin (date)
 *   | when:path=value (first date) | at:YYYYQn:path | count:path (number of changes of the value)
 * `set` = { rules:{id:bool}, params:{'rule.key':v} } applied from the window start (like experiment choices).
 * Anything that cannot be computed is shown as '—' and the checker FAILS on it.
 * ========================================================================================================================== */

export const dateT = d => (typeof d === 'number' ? d : (+d.slice(0, 4) - 1995) * 4 + (+d[5] - 1));

export function fmtV(v, f) {
  if (v == null || (typeof v === 'number' && !Number.isFinite(v))) return '—';
  if (typeof v === 'string') return f === 'lamp' ? ({ green: '绿灯', yellow: '黄灯', red: '红灯' }[v] || v) : v;
  switch (f) {
    case 'pct': return (v * 100).toFixed(1) + '%';
    case 'pct0': return (v * 100).toFixed(0) + '%';
    case 'pct2': return (v * 100).toFixed(2) + '%';
    case 'pp': return (v * 100).toFixed(1) + '个点';
    case 'chg': return (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(0) + '%';
    case 'chg1': return (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1) + '%';
    case 'x2': return '×' + v.toFixed(2);
    case 'idx': return v.toFixed(0);
    case 'n1': return v.toFixed(1);
    case 'n2': return v.toFixed(2);
    case 'n3': return v.toFixed(3);
    case 'rate': return (v * 100).toFixed(2) + '%';
    case 'tn': return (v / 1000).toFixed(1) + ' 万亿美元';
    case 'bn': return Math.round(v).toLocaleString('en-US') + ' 十亿美元';   // input USD bn (same unit as the map labels)
    case 'ppa': return Math.abs(v * 100).toFixed(1) + '个点';   // size of a change in points, no sign (the text says 升了/降了)
    case 'apct0': return Math.abs(v * 100).toFixed(0) + '%';
    case 'apct1': return Math.abs(v * 100).toFixed(1) + '%';
    case 'aud': return Math.round(v).toLocaleString('en-US') + ' 十亿澳元';   // input local-currency bn (AUS model flows, per quarter)
    default: return Math.round(v).toLocaleString('en-US');
  }
}

// one aggregate over a window. hist = snapshots after the start; base = the snapshot AT the start (needed by start/chg/dpp/dd)
export function aggregate(hist, spec, base = null) {
  const m = /^(at):(\d{4}Q\d):(.+)$/.exec(spec);
  if (m) { const h = (base ? [base, ...hist] : hist).find(x => x.date === m[2]); return h ? getPath(h, m[3]) : null; }
  const i = spec.indexOf(':'), agg = spec.slice(0, i), path = spec.slice(i + 1);
  if (agg === 'when') { const [p, val] = path.split('='); const h = hist.find(x => String(getPath(x, p)) === val); return h ? h.date : null; }
  const rows = base && ['chg', 'dpp', 'dd', 'start', 'count'].includes(agg) ? [base, ...hist] : hist;
  if (agg === 'qcount') { const [p, val] = path.split('='); return rows.filter(h => String(getPath(h, p)) === val).length; }   // number of quarters where path == value
  if (agg === 'count') { let n = 0; for (let k = 1; k < rows.length; k++) if (String(getPath(rows[k], path)) !== String(getPath(rows[k - 1], path))) n++; return n; }
  if (agg === 'start') return base ? getPath(base, path) : null;
  const raw = rows.map(h => getPath(h, path));
  if (agg === 'end' || agg === 'first') { const d = raw.filter(v => v != null); return d.length ? d[agg === 'end' ? d.length - 1 : 0] : null; }
  const vals = raw.filter(v => typeof v === 'number' && Number.isFinite(v));
  if (!vals.length) return null;
  if (agg === 'max') return Math.max(...vals);
  if (agg === 'min') return Math.min(...vals);
  if (agg === 'sum') return vals.reduce((a, b) => a + b, 0);
  if (agg === 'avg') return vals.reduce((a, b) => a + b, 0) / vals.length;
  if (agg === 'chg') return vals[vals.length - 1] / vals[0] - 1;
  if (agg === 'dpp') return vals[vals.length - 1] - vals[0];
  if (agg === 'dd') { let pk = -Infinity, w = 0; for (const v of vals) { pk = Math.max(pk, v); w = Math.min(w, v / pk - 1); } return w; }
  if (agg === 'argmax' || agg === 'argmin') { const t = agg === 'argmax' ? Math.max(...vals) : Math.min(...vals); const h = hist.find(x => getPath(x, path) === t); return h ? h.date : null; }
  return null;
}

// scratch simulation of a window: overrides `set` are applied from `from` on. Cached (the engine is deterministic).
const RUNS = new Map();
export function clearRunCache() { RUNS.clear(); }
export function scratchRun(data, L, set, from, until) {
  const key = `${L.id}|${L.mode || ''}|${JSON.stringify(set || {})}|${from}|${until}`;
  if (RUNS.has(key)) return RUNS.get(key);
  const s = createSim({ data, mode: L.mode === 'free' ? 'free' : 'history', country: L.country || 'USA' });   // a country lesson runs on that country's sim
  for (const r of s.rules) s.setRuleEnabled(r.id, ruleOnFor(L, r.id));
  const ff = d => { const T = dateT(d); while (s.t < T && !s.done) s.step(); };
  ff(from);
  for (const [id, on] of Object.entries((set && set.rules) || {})) s.setRuleEnabled(id, !!on);
  for (const [k, v] of Object.entries((set && set.params) || {})) { const [r, p] = k.split('.'); s.setRuleParam(r, p, v); }
  const t0 = s.t; ff(until);
  const h = s.history(), out = { base: h[t0], hist: h.slice(t0 + 1) };
  RUNS.set(key, out);
  return out;
}
// WORLD getters: 'world:<path in WORLD>@<year|last>'. WORLD (src/data/world.js, annual) is injected by the caller (the UI loads it lazily, the checker
// imports it) so that this module never depends on a file another agent is still writing.
let WORLD = null;
export function setWorldData(W) { WORLD = W || null; }
export const hasWorldData = () => !!WORLD;
export const isWorldGet = g => typeof g === 'string' && g.startsWith('world:');
// 'world:<path>@<year>' = the value; 'world:<path>@<y0>><y1>' = the change y1 / y0 - 1 (e.g. world:countries.USA.houseReal@2006>2012)
export function evalWorld(spec) {
  const m = /^world:([\w.]+)@(\d{4}|last)(?:>(\d{4}))?$/.exec(spec);
  if (!WORLD || !m || !Array.isArray(WORLD.years)) return null;
  const a = getPath(WORLD, m[1]);
  if (!Array.isArray(a)) return null;
  const at = y => {
    let v;
    if (y === 'last') { for (let k = a.length - 1; k >= 0 && v == null; k--) v = a[k]; }
    else { const k = WORLD.years.indexOf(+y); v = k < 0 ? null : a[k]; }
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  if (m[3]) { const v0 = at(m[2]), v1 = at(m[3]); return v0 && v1 != null ? v1 / v0 - 1 : null; }
  return at(m[2]);
}
// REAL data getters: 'real:<agg>:<series>' (also 'real:at:YYYYQn:<series>') aggregates the country's real quarterly series (data.series)
// over the same window as the model getters (from..until; base = value at from). No simulation: it is the data the model is compared with.
export const isRealGet = g => typeof g === 'string' && g.startsWith('real:');
export function evalReal(data, spec, from, until) {
  const rest = spec.slice(5), key = rest.split(':').pop();
  const S = data && data.series && data.series[key];
  if (!Array.isArray(S) || !data.dates) return null;
  const t0 = dateT(from), t1 = dateT(until);
  const row = t => ({ date: data.dates[t], [key]: S[t] });
  const hist = []; for (let t = t0 + 1; t <= t1 && t < data.dates.length; t++) hist.push(row(t));
  return aggregate(hist, rest, row(t0));
}

export function evalGet(data, L, g, win) {
  if (isWorldGet(g.get)) return evalWorld(g.get);
  if (isRealGet(g.get)) return evalReal(data, g.get, g.from || win.from, g.until || win.until);
  const r = scratchRun(data, L, g.set, g.from || win.from, g.until || win.until);
  return aggregate(r.hist, g.get, r.base);
}

// table of raw values for one step: { raw:{token:value}, fmt:{key:fmt} }
export function buildTable(data, L, st, win, you = null) {
  const tbl = { raw: {}, fmt: {} };
  for (const v of st.vals || []) { tbl.raw[v.key] = evalGet(data, L, v, win); tbl.fmt[v.key] = v.fmt; }
  if (st.type === 'experiment' && (st.metrics || []).some(m => m.key)) {
    const from = st.from, until = st.until;
    const sets = st.slider ? [['base', {}], ['you', { params: { [st.slider.rule + '.' + st.slider.key]: you ?? st.slider.def } }]]
      : st.choices.map((c, k) => [String(k), c.set || {}]);
    for (const m of st.metrics) {
      if (!m.key) continue;
      tbl.fmt[m.key] = m.fmt;
      for (const [k, set] of sets) tbl.raw[m.key + '.' + k] = evalGet(data, L, { get: m.get, set, from, until }, win);
    }
  }
  return tbl;
}
const TOKEN = /\{([A-Za-z_]\w*(?:\.\w+(?:-\w+)?)?)\}/g;
export function fillTpl(str, tbl, miss) {
  if (typeof str !== 'string' || !str.includes('{')) return str;
  return str.replace(TOKEN, (all, tok) => {
    const key = tok.split('.')[0], sub = tok.split('.')[1] || '';
    const f = tbl && tbl.fmt[key];
    let out;
    const dm = /^(\w+)-(\w+)$/.exec(sub);
    if (dm) {
      const a = tbl.raw[key + '.' + dm[1]], b = tbl.raw[key + '.' + dm[2]];
      out = typeof a === 'number' && typeof b === 'number' ? fmtV(Math.abs(a - b), ['pct', 'pct0', 'chg', 'chg1'].includes(f) ? 'pp' : f) : '—';
    } else {
      const v = tbl && tbl.raw[tok];
      out = v === undefined ? '—' : fmtV(v, f);
    }
    if (out === '—' && miss) miss.push(all);
    return out;
  });
}
const TEXT_FIELDS = ['text', 'q', 'explain', 'answerHint', 'relation', 'insight', 'question', 'tryIt', 'lines'];
export function fillStep(st, tbl, miss) {
  if (!tbl) return st;
  const F = x => (Array.isArray(x) ? x.map(F) : fillTpl(x, tbl, miss));
  const o = { ...st };
  for (const k of TEXT_FIELDS) if (o[k] != null) o[k] = F(o[k]);
  if (o.options) o.options = o.options.map(x => ({ ...x, t: F(x.t) }));
  if (o.links) o.links = o.links.map(x => ({ ...x, text: F(x.text) }));
  return o;
}
