// Transmission chains (传导链) over the causal map in src/data/causal.js. Pure functions, no DOM: usable in Node checkers.
//
// propagate(src, dir, { mode }) -> { [node]: Arrival }        push src up (dir +1) or down (−1); where does it arrive, which way, when?
//   Arrival = { sign: +1 | −1 | 0, lag, label, path: [src, …, node], later?: { sign, lag, label, path }, alt?: { … } }
//     sign 0 = '?' : two routes with opposite signs arrive in the same lag bucket -> "两条路打架，看模拟"
//     later      : an opposite-signed route that arrives in a LATER bucket (and is not much weaker) -> "之后可能反过来"
//     offset     : an opposite-signed route at the same time but much weaker (strength w < half) -> "另一条路部分抵消"
//   Strength w = product of the link weights (data opts.w, default 1). '?' needs comparable strengths (ratio 0.5–2).
//   Search: cheapest route per (node, sign); cost = summed lag + a small per-link cost + extra cost for weak links.
//   A route never passes the source again and never repeats a node; at most MAX_LINKS links.
// chainView(id, { mode }) -> { up, inputs, down, loops, detected }   everything the concept card shows.
// mode 'free' turns on the central-bank rule edges (opts.only === 'free'); 'history' (and the town, whose rate is fixed) leaves them off.
import { EDGES, EXTRA_NODES, VALVE_OF, DETECTED, OUTCOMES, INDICATORS, LAG, lagLabel } from '../data/causal.js';

const MAX_LINKS = 7;
const LINK_COST = 0.05;
const WEAK_COST = 1.2;     // a w=0.5 link costs like ~0.8 quarter of extra lag

const OUT = {}, IN = {};
for (const [a, b, sign, lag, o = {}] of EDGES) {
  const e = { from: a, to: b, sign, lag, q: LAG[lag], w: o.w ?? 1, only: o.only || null, why: o.why || '' };
  (OUT[a] ||= []).push(e);
  (IN[b] ||= []).push(e);
}
const on = (e, mode) => !e.only || e.only === mode;

export const edgeOf = (a, b) => (OUT[a] || []).find(e => e.to === b) || null;
export const isValve = id => id in VALVE_OF;
export const valveOf = id => VALVE_OF[id] || null;
export const isIndicator = id => INDICATORS.includes(id);
export const isDetected = id => DETECTED.includes(id);
export const extraNode = id => EXTRA_NODES[id] || null;
export const allNodes = () => [...new Set(EDGES.flatMap(e => [e[0], e[1]]))];

const cache = new Map();
export function propagate(src, dir = 1, { mode = 'history' } = {}) {
  const key = `${src}|${dir}|${mode}`;
  if (cache.has(key)) return cache.get(key);
  // best[node][sign] = { cost, lag, path }
  const best = {};
  const queue = [{ node: src, sign: dir, lag: 0, w: 1, cost: 0, path: [src] }];
  while (queue.length) {
    let k = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].cost < queue[k].cost) k = i;
    const cur = queue.splice(k, 1)[0];
    if (cur.node !== src) {
      const slot = (best[cur.node] ||= {});
      if (slot[cur.sign]) continue;
      slot[cur.sign] = cur;
    }
    if (cur.path.length > MAX_LINKS) continue;
    for (const e of OUT[cur.node] || []) {
      if (!on(e, mode) || e.to === src || cur.path.includes(e.to)) continue;
      const s = cur.sign * e.sign;
      if (best[e.to]?.[s]) continue;
      // weak links (w < 1) cost extra, so within a lag bucket the strong route is found first
      queue.push({ node: e.to, sign: s, lag: cur.lag + e.q, w: cur.w * e.w, cost: cur.cost + e.q + LINK_COST - WEAK_COST * Math.log(e.w), path: [...cur.path, e.to] });
    }
  }
  const out = {};
  for (const [node, slot] of Object.entries(best)) {
    const p = slot[1], m = slot[-1];
    const pack = x => ({ sign: x.sign, lag: x.lag, label: lagLabel(x.lag), w: x.w, path: x.path });
    if (p && m) {
      const [e, l] = p.cost <= m.cost ? [p, m] : [m, p];
      const BK = ['立刻', '1–2 季', '2–4 季', '2–3 年'];
      const gap = BK.indexOf(lagLabel(l.lag)) - BK.indexOf(lagLabel(e.lag));
      const sameTime = gap === 0 || (gap === 1 && e.w < 0.5 * l.w), ratio = l.w / e.w;   // a weak early route next to a strong one a bucket later = noise before the main effect
      if (sameTime && ratio >= 0.5 && ratio <= 2) out[node] = { sign: 0, lag: e.lag, label: lagLabel(e.lag), w: Math.max(e.w, l.w), path: e.path, alt: pack(l), first: pack(e) };
      else if (sameTime) { const [s, k] = e.w >= l.w ? [e, l] : [l, e]; out[node] = { ...pack(s), offset: pack(k) }; }   // the weaker route only partly offsets
      else out[node] = { ...pack(e), later: ratio >= 0.5 ? pack(l) : null };
    } else out[node] = pack(p || m);
  }
  cache.set(key, out);
  return out;
}

// feedback loops through `id`: a push on id comes back to id. kind 'reinforce' (放大) | 'balance' (刹车)
export function loopsOf(id, { mode = 'history' } = {}) {
  const r = propagate(id, 1, { mode }), out = [];
  for (const e of IN[id] || []) {
    if (!on(e, mode) || !r[e.from]) continue;
    const a = r[e.from];
    for (const x of [a.sign === 0 ? a.first : a, a.later, a.alt].filter(Boolean)) {
      const s = x.sign * e.sign;
      out.push({ kind: s > 0 ? 'reinforce' : 'balance', lag: x.lag + e.q, label: lagLabel(x.lag + e.q), path: [...x.path, id] });
    }
  }
  out.sort((a, b) => a.path.length - b.path.length || a.lag - b.lag);
  const seen = new Set();
  return out.filter(l => { const k = l.path.join('>'); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 3);
}

/** Everything a concept card shows about its place in the chains. */
export function chainView(id, { mode = 'history' } = {}) {
  if (isDetected(id)) return { id, detected: true, up: [], inputs: [], down: [], loops: [] };
  const inputs = (IN[id] || []).filter(e => on(e, mode)).map(e => ({ from: e.from, sign: e.sign, label: e.lag, why: e.why }));
  // upstream: every valve that reaches id, shortest route first
  const up = [];
  for (const v of Object.keys(VALVE_OF)) {
    if (v === id) continue;
    const a = propagate(v, 1, { mode })[id];
    if (a) up.push({ valve: v, valveId: VALVE_OF[v], ...a });
  }
  up.sort((a, b) => a.path.length - b.path.length || a.lag - b.lag);
  // downstream: the outcomes a push on id reaches (lamps too, when id is not itself a lamp)
  const r = propagate(id, 1, { mode });
  const targets = [...OUTCOMES, 'lampCredit', 'lampDebtService', 'lampPolicy', 'lampValuation'];
  const down = targets.filter(t => t !== id && r[t]).map(t => ({ target: t, ...r[t] }));
  down.sort((a, b) => (a.sign === 0) - (b.sign === 0) || a.lag - b.lag || a.path.length - b.path.length);
  return { id, detected: false, valve: valveOf(id), up, inputs, down, loops: loopsOf(id, { mode }) };
}

/** The links of a path with their sign / lag / reason, for drawing a chain strip. */
export function pathLinks(path) {
  const out = [];
  for (let i = 1; i < path.length; i++) {
    const e = edgeOf(path[i - 1], path[i]);
    out.push({ from: path[i - 1], to: path[i], sign: e?.sign ?? 1, label: e?.lag ?? '', why: e?.why ?? '' });
  }
  return out;
}

/** Arrow per node along a path for a push `dir` on path[0]: [+1|-1, …] (same length as path). */
export function pathSigns(path, dir = 1) {
  const s = [dir];
  for (const l of pathLinks(path)) s.push(s[s.length - 1] * l.sign);
  return s;
}
