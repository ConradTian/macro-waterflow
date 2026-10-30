// 「专题：预期」 panels (src/data/lesson-exp.js): the vertical 吸力尺 and its toys. Lesson-only: the main diagram (flow.js) and the engine are
// not touched. mountExpPanel(host, spec) / unmountExpPanel() / ensureExpCss(), wired by src/ui/lessons.js (panel ids 'exp-*').
//
// Gauge symbols: ▶ = rates.policy (the only thing the central bank turns), ▽ hollow = macro.inflationExp (S.piE, 心里的涨价速度),
// ▼ filled = macro.inflation (S.piY, 物价比一年前). 吸力 = ▶ − ▽ (band: blue = 存湖划算 / 抽水贵, red = the opposite).
// 调度线 = cp.piTarget; ▽ hangs from it on a rope: slack = S.dean, thickness ∝ the anchor param of hh_infl_deanchor.
//
// DOM-free at import time: tools/check_lesson_exp.mjs imports the pure parts (replay, fiveTurns, loopInfo, toyRun, expStep, poolRun, ...).
// replay() runs the engine itself, quarter by quarter, exactly as src/engine/sim.js advance() does, so that S.dean (not in the snapshot) is
// available; the checker asserts the replay's snapshots equal createSim's.
import { seed, exogenous, decideAll, settle, buildSnapshot } from '../engine/economy.js';
import { makeRuleParams, makeRuleState, RULE_BY_ID } from '../engine/rules.js';
import { COUNTRY_PARAMS } from '../data/country-params.js';
import { US_Q } from '../data/us-quarterly.js';
import { JPN_Q } from '../data/countries/jpn-quarterly.js';
import { MICH_Q } from '../data/exp-mich.js';
import { EXP_FX } from '../data/exp-fx.js';
import { AUS_Q } from '../data/countries/aus-quarterly.js';
import { FX_SPEC } from '../data/fx-data.js';
import { EXP_STORY, EXP_HIST, EXP_FIVE, EXP_TOY, EXP_POOL, qText } from '../data/lesson-exp.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ok = v => typeof v === 'number' && Number.isFinite(v);
// same rounding as fmtV 'pct' / 'chg1' / 'pp' (src/ui/lessons-town.js), so the panel and the card text always agree
// a value that rounds to zero carries no sign (never 「−0.0」)
const z = (v, d) => +Math.abs(v * 100).toFixed(d) === 0;
export const pc = (v, d = 1) => (ok(v) ? (v < 0 && !z(v, d) ? '−' : '') + Math.abs(v * 100).toFixed(d) + '%' : '—');
export const sg = (v, d = 1) => (ok(v) ? (z(v, d) ? '' : v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(d) + '%' : '—');
const pp = (v, d = 1) => (ok(v) ? (v < 0 && !z(v, d) ? '−' : '') + Math.abs(v * 100).toFixed(d) + ' 个点' : '—');
const spp = (v, d = 1) => (ok(v) ? (z(v, d) ? '' : v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(d) + ' 个点' : '—');

/* =====================================================================================================================
   engine replay (USA by default): rows { date, p, m, e, dean, snap }
   ===================================================================================================================== */
const HIST_LAST = 123;   // 2025Q4, as src/engine/sim.js
const REPLAY = new Map();
export function replay(iso = 'USA', data = US_Q) {
  if (REPLAY.has(iso)) return REPLAY.get(iso);
  const cp = COUNTRY_PARAMS[iso];
  const params = makeRuleParams();
  for (const [id, o] of Object.entries(cp.rules || {})) if (params[id]) Object.assign(params[id], o);
  const enabled = makeRuleState();
  const sd = seed(data, { cp, mode: 'history' });
  const K = sd.K;
  let S = sd.S; S.scenario = 'us';
  const env = { mode: 'history', seed: 20251028, K, delays: true, en: id => !!enabled[id], P: id => params[id], user: null };
  const row = (snap, St) => ({ date: snap.date, t: snap.t, p: snap.rates.policy, m: snap.macro.inflation, e: snap.macro.inflationExp, dean: St.dean, snap });
  const rows = [row(buildSnapshot(S, K, null, 'model'), S)];
  while (S.t < HIST_LAST) {
    const ex = exogenous(data, S.t + 1, cp);
    const dec = decideAll(S, K, ex, env);
    const r = settle(S, K, ex, dec, env);
    S = r.S;
    rows.push(row(buildSnapshot(S, K, r.extra, 'model'), S));
  }
  REPLAY.set(iso, rows);
  return rows;
}
export const rowsBetween = (rows, from, until) => rows.filter(r => r.date >= from && r.date <= until);
const idx = (rows, d) => rows.findIndex(r => r.date === d);

// year-ago metrics of a replay row (k = index in the FULL replay)
export function metric(rows, k, key) {
  const x = rows[k]?.snap, y = rows[k - 4]?.snap;
  if (!x) return null;
  switch (key) {
    case 'loanYoY': return y ? x.flows.newLoans / y.flows.newLoans - 1 : null;
    case 'bondYoY': return y ? x.assets.bond.price / y.assets.bond.price - 1 : null;
    case 'eqYoY': return y ? x.assets.equity.price / y.assets.equity.price - 1 : null;
    case 'savD': return y ? x.household.savingRate - y.household.savingRate : null;
    case 'sav': return x.household.savingRate;
    case 'uD': return y ? x.macro.unemployment - y.macro.unemployment : null;
    case 'u': return x.macro.unemployment;
    case 'gd': return x.gov.debtGdp;
    case 'gdD': return y ? x.gov.debtGdp - y.gov.debtGdp : null;
    case 'mYoY': return y ? x.macro.inflation - y.macro.inflation : null;
    default: return null;
  }
}
const hits = (v, th, dir) => ok(v) && (dir === '<=' ? v <= th : v >= th);

// panel exp-five (L3 「吸力一变，哪里跟着动」): when each place moves. blue = first quarter in the window with ▶ − ▽ > 0; a place turns at the first quarter >= blue where its
// year-ago change crosses its threshold (EXP_FIVE). The order is sorted from these computed dates (ties = the same quarter).
export function fiveTurns(rows = replay()) {
  const { from, until, places } = EXP_FIVE;
  const win = rows.map((r, k) => ({ r, k })).filter(({ r }) => r.date >= from && r.date <= until);
  const b = win.find(({ r }) => r.p - r.e > 0);
  const blue = b ? b.r.date : null;
  const out = places.map(pl => {
    const h = b ? win.find(({ r, k }) => r.date >= blue && hits(metric(rows, k, pl.get), pl.th, pl.dir)) : null;
    return { ...pl, turn: h ? h.r.date : null, k: h ? h.k : null };
  });
  const dates = [...new Set(out.map(p => p.turn).filter(Boolean))].sort();
  out.forEach(p => { p.rank = p.turn ? dates.indexOf(p.turn) + 1 : null; });
  const groups = dates.map(d => out.filter(p => p.turn === d));
  const orderText = groups.map(g => `${g.map(p => p.name).join('、')}（${qText(g[0].turn)}）`).join(' → ');
  const lag = Object.fromEntries(out.map(p => [p.id, p.k != null && b ? p.k - b.k : null]));
  return { blue, places: out, order: groups.map(g => g.map(p => p.id)), orderText, lag };
}
// panel exp-loop (L3): the loop. firstHike = first quarter (from EXP_FIVE.from) where ▶ rose >= 0.1 point on the quarter; firstCut = the first fall after it
export function loopInfo(rows = replay()) {
  const { from, until } = EXP_FIVE;
  let firstHike = null, firstCut = null;
  for (let k = 1; k < rows.length; k++) {
    const r = rows[k]; if (r.date < from || r.date > until) continue;
    const d = r.p - rows[k - 1].p;
    if (!firstHike && d >= 0.001) firstHike = r.date;
    else if (firstHike && !firstCut && d <= -0.001) firstCut = r.date;
  }
  return { firstHike, firstCut };
}

/* =====================================================================================================================
   the ▽ rule as a toy (panel exp-rope, 专题 step 1). The same rule as src/engine/economy.js (hh_infl_deanchor branch); the rule params come from the engine's
   own tables (RULE_BY_ID + country overrides), the three literals of the dean update are copied (checker: equal to the engine's source).
   ===================================================================================================================== */
export const DEAN_K = { keep: 0.8, push: 0.2, width: 0.03 };   // S.dean = keep·dean + push·clamp((piX − pi)/width, 0, 1)
export const PRICE_K = { inertia: 0.5 };                       // S.pi = inertia·S0.pi + (1 − inertia)·(S0.piE + push)
export function ropeOf(id) {
  const iso = id === 'cut' ? 'USA' : id;
  const cp = COUNTRY_PARAMS[iso];
  const p = { ...RULE_BY_ID.hh_infl_deanchor.params, ...((cp.rules || {}).hh_infl_deanchor || {}) };
  return { id, iso, target: cp.piTarget, pi: p.pi, speed: p.speed, extra: p.extra, down: p.down, anchor: id === 'cut' ? 0 : p.anchor, cut: id === 'cut' };
}
// one quarter of ▽: st = { piE, dean } before the quarter, piX = ▼ this quarter (engine: piY, or ~core with cp.oilLookThrough)
export function expStep(st, piX, r) {
  const dean = DEAN_K.keep * st.dean + DEAN_K.push * clamp((piX - r.pi) / DEAN_K.width, 0, 1);
  const gap = piX - st.piE;
  const piE = st.piE + (r.speed + r.extra * dean) * (gap > 0 ? 1 : r.down) * gap + r.anchor * (1 - dean) * (r.target - st.piE);
  return { piE, dean };
}
const TOY = new Map();
export function toyRun(pathId, ropeId) {
  const key = pathId + '|' + ropeId;
  if (TOY.has(key)) return TOY.get(key);
  const path = EXP_TOY.paths.find(x => x.id === pathId), r = ropeOf(ropeId);
  let pi = r.target, st = { piE: r.target, dean: 0 }, q4 = [pi, pi, pi, pi];
  const rows = [];
  for (let t = 0; t < EXP_TOY.quarters; t++) {
    const push = t >= path.from && t < path.until ? path.push : 0;
    pi = PRICE_K.inertia * pi + (1 - PRICE_K.inertia) * (st.piE + push);
    q4 = [...q4.slice(1), pi];
    const m = q4.reduce((a, b) => a + b, 0) / 4;     // ▼ = 物价比一年前 ≈ the mean of the last four quarters
    st = expStep(st, m, r);
    rows.push({ q: t, m, e: st.piE, dean: st.dean, push });
  }
  const out = { path, rope: r, rows, end: rows[rows.length - 1] };
  TOY.set(key, out);
  return out;
}
export const ropeWord = (dean, cut) => (cut ? '剪断' : dean < 0.15 ? '拉紧' : dean < 0.5 ? '有点松' : '松了');
export const ropePx = anchor => anchor * RULER_STYLE.rope.pxPerAnchor;   // thickness ∝ the anchor (US 0.0364 → 1.5 px, AUS 0.0996 → 4 px)

/* panel exp-pool (专题 step 3): an asset pool with no rope (toy) */
let POOL = null;
export function poolRun() {
  if (POOL) return POOL;
  const P = EXP_POOL, rows = [];
  let ge = 0, D = 1;
  const p0 = 1 / (P.suction + P.fear);
  for (let t = 0; t < P.quarters; t++) {
    if (t === P.jumpAt) D *= 1 + P.jump;
    const den = clamp(P.suction + P.fear - ge, P.floor, P.ceil);
    const price = D / den;
    rows.push({ q: t, price: price / p0 * 100, den, ge });
    const rise = t >= 4 ? price / (rows[t - 4].price * p0 / 100) - 1 : 0;   // the pool's own ▽: its rise vs a year ago
    ge = ge + P.a * (P.b * rise - ge);
  }
  let pk = 0, tr = 0;
  rows.forEach((r, k) => { if (r.price > rows[pk].price) pk = k; });
  for (let k = pk; k < rows.length; k++) if (rows[k].price < rows[tr].price || tr < pk) tr = k;
  POOL = { rows, p0: 100, peak: rows[pk].price, peakAt: pk, trough: rows[tr].price, troughAt: tr, floorAt: rows.findIndex(r => r.den <= P.floor + 1e-12) };
  return POOL;
}

/* real-data helpers (Michigan survey, Japan) */
export const mich = {
  at: d => { const i = MICH_Q.dates.indexOf(d); return i < 0 ? null : MICH_Q.mich[i]; },
  list: (a, b) => MICH_Q.dates.map((d, i) => [d, MICH_Q.mich[i]]).filter(([d]) => d >= a && d <= b).map(x => x[1]),
  avg: (a, b) => { const v = mich.list(a, b); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; },
  max: (a, b) => Math.max(...mich.list(a, b)),
};
export const jpn = {
  series: (k, a, b) => JPN_Q.dates.map((d, i) => [d, JPN_Q.series[k][i]]).filter(([d, v]) => d >= a && d <= b && ok(v)).map(x => x[1]),
  avg: (k, a, b) => { const v = jpn.series(k, a, b); return v.reduce((x, y) => x + y, 0) / v.length; },
};
const usAvg = (k, a, b) => { const v = US_Q.dates.map((d, i) => [d, US_Q.series[k][i]]).filter(([d]) => d >= a && d <= b).map(x => x[1]); return v.reduce((x, y) => x + y, 0) / v.length; };

/* =====================================================================================================================
   SVG pieces
   ===================================================================================================================== */
// The 吸力尺 look in ONE table, so the main diagram's `// RULER SLOT` (tools/DESIGN-v3.md, parked) can import it and draw the same marks:
//   import { RULER_STYLE, rulerSign } from './exp-gauge.js'.
// Geometry is in SVG px. Colours are CSS custom properties with app.css fallbacks, so they work even where exp-gauge.css is not loaded
// (exp-gauge.css :root defines the --exg-* variables). Design (user, 2026-10-30): the staff is a thin grey line, the BAND is the thing you
// see: a wide coloured strip centred on the staff. Blue = ▶ − ▽ ≥ 0 (存湖划算、抽水贵), red = the opposite.
export const RULER_STYLE = Object.freeze({
  staff: { width: 2, color: 'var(--exg-staff, #9aa5b4)' },
  band: {
    open: { half: 12, opacity: 0.62 },             // ▶ − ▽ (开阀): 24 px wide, centred on the staff
    real: { width: 9, gap: 3, opacity: 0.42 },     // ▶ − ▼ (结账): a narrower strip right of the open band (centred on the staff when it is the only band)
    minHeight: 3, radius: 2,
  },
  tick: { len: 4, opacity: 0.55 },
  mark: { size: 6 },                               // triangle half-height in px
  p: { glyph: '▶', name: '政策利率', color: 'var(--exg-p, var(--text))', fill: true },
  m: { glyph: '▼', name: '物价比一年前', color: 'var(--exg-m, var(--c-repay))', fill: true },
  e: { glyph: '▽', name: '心里的涨价速度', color: 'var(--exg-e, var(--c-fiscal))', fill: false, stroke: 2 },
  blue: { color: 'var(--exg-blue, var(--c-pump))', word: '蓝：存湖划算、抽水贵' },
  red: { color: 'var(--exg-red, var(--c-drain))', word: '红：存湖不划算、抽水便宜' },
  target: { color: 'var(--muted)', width: 1.2, dash: '5 3', name: '调度线' },
  rope: { color: 'var(--exg-rope, #8a6a3c)', pxPerAnchor: 40 },
});
export const rulerSign = (top, bottom) => (top - bottom >= 0 ? 'blue' : 'red');   // band colour of ▶ − ▽ (or ▶ − ▼)
const tri = (x, y, dir, s = RULER_STYLE.mark.size) => (dir === 'r' ? `${x},${y} ${x - 2 * s},${y - s} ${x - 2 * s},${y + s}` : `${x},${y} ${x - s},${y - 1.7 * s} ${x + s},${y - 1.7 * s}`);
function niceTicks(lo, hi) {
  const span = hi - lo, st = span > 0.12 ? 0.05 : span > 0.06 ? 0.02 : span > 0.025 ? 0.01 : 0.005;
  const out = []; for (let v = Math.ceil(lo / st - 1e-9) * st; v <= hi + 1e-9; v += st) out.push(Math.round(v * 1e4) / 1e4);
  return out;
}
// one vertical 吸力尺. o: { W, H, lo, hi, p, m, e, target?, dean?, anchor?, cut?, band: null|'open'|'real'|'split', marks:['p','m','e'],
//   ghostE?: { v, label }, zeroLabel?, title? }
export function gaugeSvg(o) {
  const W = o.W, H = o.H, top = o.title ? 26 : 12, bot = H - 10, lo = o.lo, hi = o.hi;
  const Y = v => top + (hi - clamp(v, lo, hi)) / (hi - lo) * (bot - top);
  // columns (RULER_STYLE): tick labels | ▶ | [ wide open band on the thin staff ] [ real strip ] | ▼ | ▽ + rope | 意外
  const RS = RULER_STYLE, hb = RS.band.open.half, sz = RS.mark.size, rb = RS.band.real;
  const rx = 2 * sz + hb + 34, xr0 = rx + hb + rb.gap, xm = xr0 + rb.width + sz + 3, xe = xm + 3 * sz, M = new Set(o.marks || ['p', 'm', 'e']);
  const s = [];
  if (o.title) s.push(`<text class="exg-gt" x="${W / 2}" y="14" text-anchor="middle">${esc(o.title)}</text>`);
  for (const v of niceTicks(lo, hi)) {
    s.push(`<line class="exg-tick" x1="${rx - hb - RS.tick.len}" x2="${rx + hb}" y1="${Y(v)}" y2="${Y(v)}" stroke-opacity="${RS.tick.opacity}"/>`);
    s.push(`<text class="exg-tl" x="${rx - hb - 2 * sz - 5}" y="${Y(v) + 3.5}" text-anchor="end">${Math.round(v * 1000) / 10}%</text>`);
  }
  if (lo < 0 && hi > 0) s.push(`<line class="exg-zero" x1="${rx - hb - RS.tick.len}" x2="${W - 4}" y1="${Y(0)}" y2="${Y(0)}"/>${o.zeroLabel ? `<text class="exg-zl" x="${W - 4}" y="${Y(0) - 3}" text-anchor="end">${esc(o.zeroLabel)}</text>` : ''}`);
  s.push(`<line class="exg-rule" x1="${rx}" x2="${rx}" y1="${top}" y2="${bot}" stroke-width="${RS.staff.width}"/>`);
  // bands, drawn over the staff: the staff shows faintly through, the colour is what you see
  const band = (a, b, x0, x1, cls, op) => { if (!ok(a) || !ok(b)) return; const y0 = Math.min(Y(a), Y(b)), y1 = Math.max(Y(a), Y(b)), h = Math.max(RS.band.minHeight, y1 - y0); s.push(`<rect class="exg-band ${cls} ${rulerSign(a, b)}" x="${x0}" y="${((y0 + y1) / 2 - h / 2).toFixed(2)}" width="${x1 - x0}" height="${h.toFixed(2)}" rx="${RS.band.radius}" fill-opacity="${op}"/>`); };
  if (o.band === 'open' || o.band === 'split') band(o.p, o.e, rx - hb, rx + hb, 'open', RS.band.open.opacity);
  if (o.band === 'split') band(o.p, o.m, xr0, xr0 + rb.width, 'real', rb.opacity);
  if (o.band === 'real') band(o.p, o.m, rx - hb, rx + hb, 'real', RS.band.open.opacity);   // the only band: centred and wide like the open one
  // 调度线 + rope
  if (ok(o.target)) {
    const yt = Y(o.target);
    s.push(`<line class="exg-tgt" x1="${rx - hb - RS.tick.len}" x2="${W - 4}" y1="${yt}" y2="${yt}"/><text class="exg-tgl" x="${W - 4}" y="${yt + 11}" text-anchor="end">调度线 ${pc(o.target, o.target * 1000 % 10 ? 1 : 0)}</text>`);
    if (M.has('e') && ok(o.e)) {
      const ye = Y(o.e), above = ye < yt, y1 = above ? ye : ye - 10.2;
      const w = Math.max(0.8, ropePx(o.anchor ?? 0.0364)), d = clamp(o.dean || 0, 0, 1);
      if (o.cut) s.push(`<path class="exg-rope cut" d="M${xe},${yt} L${xe},${yt + (y1 - yt) * 0.35} M${xe},${y1} L${xe},${y1 + (yt - y1) * 0.35}" stroke-width="1.5"/><text class="exg-cut" x="${xe + 6}" y="${(yt + y1) / 2 + 4}">✂</text>`);
      else if (Math.abs(y1 - yt) > 1) s.push(`<path class="exg-rope" d="M${xe},${yt} Q${xe + 3 + d * 30},${(yt + y1) / 2} ${xe},${y1}" stroke-width="${w.toFixed(2)}"/>`);
      else s.push(`<circle class="exg-knot" cx="${xe}" cy="${yt}" r="${(w / 2 + 1).toFixed(2)}"/>`);
    }
  }
  if (o.band === 'split' && ok(o.m) && ok(o.e)) {
    const x = xe + 14, ym = Y(o.m), ye = Y(o.e);
    s.push(`<path class="exg-sur" d="M${x - 3},${ym} L${x},${ym} L${x},${ye} L${x - 3},${ye}"/><text class="exg-surl" x="${x + 3}" y="${(ym + ye) / 2 + 4}">意外</text>`);
  }
  if (o.ghostE && ok(o.ghostE.v)) s.push(`<polygon class="exg-e ghost" points="${tri(xe, Y(o.ghostE.v), 'd')}"/><text class="exg-gl" x="${xe + 9}" y="${Y(o.ghostE.v) - 2}">${esc(o.ghostE.label)}</text>`);
  if (M.has('m') && ok(o.m)) s.push(`<polygon class="exg-m" points="${tri(xm, Y(o.m), 'd')}"><title>▼ 物价比一年前 ${pc(o.m)}</title></polygon>`);
  if (M.has('e') && ok(o.e)) s.push(`<polygon class="exg-e" points="${tri(xe, Y(o.e), 'd')}"><title>▽ 心里的涨价速度 ${pc(o.e)}</title></polygon>`);
  if (M.has('p') && ok(o.p)) s.push(`<polygon class="exg-p" points="${tri(rx - hb - 1, Y(o.p), 'r')}"><title>▶ 政策利率 ${pc(o.p)}</title></polygon>`);
  return `<svg class="exg-gauge" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="吸力尺">${s.join('')}</svg>`;
}

// time strip. o: { W, H, rows:[{p,m,e,mich?}], lo, hi, cur, band, marks, target, labels:[{k,text}], ghosts:[[...e]] }
export function chartSvg(o) {
  const W = o.W, H = o.H, L = 30, R = 6, T = 8, B = H - 18, n = o.rows.length, M = new Set(o.marks || ['p', 'm', 'e']);
  const X = k => L + (n > 1 ? k * (W - L - R) / (n - 1) : 0), Y = v => T + (o.hi - clamp(v, o.lo, o.hi)) / (o.hi - o.lo) * (B - T);
  const s = [];
  for (const v of niceTicks(o.lo, o.hi)) s.push(`<line class="exg-grid${v === 0 ? ' z' : ''}" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="exg-tl" x="${L - 4}" y="${Y(v) + 3.5}" text-anchor="end">${Math.round(v * 1000) / 10}%</text>`);
  for (const l of o.labels || []) s.push(`<text class="exg-tl" x="${X(l.k)}" y="${H - 4}" text-anchor="${l.k === 0 ? 'start' : 'middle'}">${esc(l.text)}</text>`);
  if (ok(o.target)) s.push(`<line class="exg-tgt" x1="${L}" x2="${W - R}" y1="${Y(o.target)}" y2="${Y(o.target)}"/>`);
  if (o.band === 'open' || o.band === 'split') {
    for (let k = 0; k < n - 1; k++) {
      const a = o.rows[k], b = o.rows[k + 1], sgn = (a.p - a.e) + (b.p - b.e) >= 0 ? 'blue' : 'red';
      s.push(`<polygon class="exg-band open ${sgn}" points="${X(k)},${Y(a.p)} ${X(k + 1)},${Y(b.p)} ${X(k + 1)},${Y(b.e)} ${X(k)},${Y(a.e)}"/>`);
    }
  }
  const line = (key, cls) => { const pts = o.rows.map((r, k) => (ok(r[key]) ? `${X(k).toFixed(1)},${Y(r[key]).toFixed(1)}` : null)).filter(Boolean); if (pts.length > 1) s.push(`<polyline class="${cls}" points="${pts.join(' ')}"/>`); };
  (o.ghosts || []).forEach(g => line(g.key, 'exg-ln ghost'));
  if (o.mich) line('mich', 'exg-ln mich');
  if (M.has('p')) line('p', 'exg-ln p');
  if (M.has('m')) line('m', 'exg-ln m');
  if (M.has('e')) { line('e', 'exg-ln e-out'); line('e', 'exg-ln e-in'); }
  if (o.cur != null && o.cur >= 0) {
    const x = X(o.cur), r = o.rows[o.cur];
    s.push(`<line class="exg-cur" x1="${x}" x2="${x}" y1="${T}" y2="${B}"/>`);
    if (M.has('p') && ok(r.p)) s.push(`<circle class="exg-dot p" cx="${x}" cy="${Y(r.p)}" r="3"/>`);
    if (M.has('m') && ok(r.m)) s.push(`<circle class="exg-dot m" cx="${x}" cy="${Y(r.m)}" r="3.2"/>`);
    if (M.has('e') && ok(r.e)) s.push(`<circle class="exg-dot e" cx="${x}" cy="${Y(r.e)}" r="3"/>`);
  }
  s.push(`<rect class="exg-hit" x="${L}" y="0" width="${W - L - R}" height="${H}" data-n="${n}" data-l="${L}" data-w="${W - L - R}"/>`);
  return `<svg class="exg-chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${s.join('')}</svg>`;
}
const yearLabels = (rows, get = r => r.date) => rows.map((r, k) => ({ k, d: get(r) })).filter(x => /Q1$/.test(x.d)).map(x => ({ k: x.k, text: x.d.slice(0, 4) }));

const SYM = { p: '<b class="s-p">▶</b>', m: '<b class="s-m">▼</b>', e: '<b class="s-e">▽</b>' };
const legend = (marks, extra = '') => `<div class="exg-leg">${marks.includes('p') ? `<span>${SYM.p} 政策利率（央行拧的）</span>` : ''}${marks.includes('m') ? `<span>${SYM.m} 物价比一年前（量出来的）</span>` : ''}${marks.includes('e') ? `<span>${SYM.e} 心里的涨价速度</span>` : ''}${extra}</div>`;
const bandWord = v => RULER_STYLE[v >= 0 ? 'blue' : 'red'].word;

/* =====================================================================================================================
   panels
   ===================================================================================================================== */
let mounted = null;
export function ensureExpCss() {
  if (typeof document === 'undefined' || document.querySelector('link[data-css="exp-gauge.css"], link[href*="exp-gauge.css"]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.dataset.css = 'exp-gauge.css';
  l.href = new URL('../../assets/css/exp-gauge.css', import.meta.url).href; document.head.appendChild(l);
}
export function unmountExpPanel() {
  if (!mounted) return;
  if (mounted.ro) mounted.ro.disconnect();
  mounted.root.remove();
  mounted = null;
}
export function mountExpPanel(host, spec = {}) {
  unmountExpPanel();
  if (!host) return null;
  ensureExpCss();
  const root = document.createElement('div');
  root.className = 'exg'; root.dataset.panel = spec.id || 'exp-hist';
  host.appendChild(root);
  const m = mounted = { host, root, spec, st: {}, ro: null, w: 0 };
  initState(m);
  render(m);
  root.addEventListener('input', e => {
    const t = e.target;
    if (t.matches('[data-exg-k]')) { m.st.k = +t.value; render(m, true); }
    else if (t.matches('[data-exg-dep]')) { m.st.dep = +t.value / 1000; render(m, true); }   // ▽汇 slider, in 0.1 % steps
  });
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-exg]');
    if (b) { const [k, v] = b.dataset.exg.split(':'); if (k === 'date') m.st.k = m.st.rows.findIndex(r => r.date === v); else m.st[k] = v; if (k === 'path' || k === 'rope') m.st.k = null; render(m); return; }
    const hit = e.target.closest('.exg-hit');
    if (hit && m.st.rows) {
      const box = hit.getBoundingClientRect(), n = +hit.dataset.n;
      m.st.k = clamp(Math.round((e.clientX - box.left) / box.width * (n - 1)), 0, n - 1); render(m);
    }
  });
  if (typeof ResizeObserver === 'function') { m.ro = new ResizeObserver(() => { const w = root.clientWidth; if (w && Math.abs(w - m.w) > 4) render(m); }); m.ro.observe(root); }
  return root;
}
function initState(m) {
  const sp = m.spec, st = m.st;
  if (sp.id === 'exp-hist' || sp.id === 'exp-sum') {
    const all = replay(), from = idx(all, EXP_HIST.from);
    st.rows = rowsBetween(all, EXP_HIST.from, EXP_HIST.until).map(r => ({ ...r, mich: mich.at(r.date) }));
    st.from = from; st.k = Math.max(0, st.rows.findIndex(r => r.date === (sp.date || EXP_HIST.until)));
  } else if (sp.id === 'exp-five' || sp.id === 'exp-loop') {
    const all = replay();
    st.rows = rowsBetween(all, EXP_FIVE.from, EXP_FIVE.until); st.from = idx(all, EXP_FIVE.from); st.all = all;
    st.k = Math.max(0, st.rows.findIndex(r => r.date === (sp.date || EXP_FIVE.until)));
    st.five = fiveTurns(all);
  } else if (sp.id === 'exp-rope') { st.path = sp.path || 'heat'; st.rope = sp.rope || 'USA'; st.k = null; }
  else if (sp.id === 'exp-gate') { st.story = sp.story || 'aud'; st.dep = 0; }
}
const width = m => Math.max(280, Math.min(720, (m.root.clientWidth || m.host.clientWidth || 360)));
function render(m, fromSlider = false) {
  const w = m.w = width(m), id = m.spec.id;
  let html = '';
  try {
    if (id === 'exp-ruler') html = rulerHtml(m, w);
    else if (id === 'exp-hist') html = histHtml(m, w);
    else if (id === 'exp-five') html = fiveHtml(m, w);
    else if (id === 'exp-loop') html = loopHtml(m, w);
    else if (id === 'exp-rope') html = ropeHtml(m, w);
    else if (id === 'exp-story') html = storyHtml(m, w);
    else if (id === 'exp-pool') html = poolHtml(m, w);
    else if (id === 'exp-sum') html = sumHtml(m, w);
    else if (id === 'exp-gate') html = gateHtml(m, w);
    else if (id === 'exp-laws') html = lawsHtml(m, w);
  } catch (e) { console.error(e); html = '<p class="exg-note">（图没画出来）</p>'; }
  if (fromSlider) {   // keep the slider element (and its focus / drag) alive: swap everything else
    const sl = m.root.querySelector('input[type=range]');
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    const nsl = tmp.querySelector('input[type=range]');
    if (sl && nsl) { nsl.replaceWith(sl); m.root.replaceChildren(...tmp.childNodes); return; }
  }
  m.root.innerHTML = html;
}
const slider = (n, k, rows, lab = r => r.date) => `<div class="exg-sl"><input type="range" min="0" max="${n - 1}" step="1" value="${k}" data-exg-k aria-label="选一个季度"><div class="exg-slr"><span>${esc(lab(rows[0]))}</span><b>${esc(lab(rows[k]))}</b><span>${esc(lab(rows[n - 1]))}</span></div></div>`;

/* panel exp-ruler (L3): two rulers, 1980 and 2023, ▶ = 5% (the opening question) */
function rulerHtml(m, w) {
  const two = m.spec.stage >= 2, r = EXP_STORY.hookRate, gw = Math.min(170, Math.floor((w - 12) / 2)), H = 250;
  const c23 = usAvg('cpiYoY', '2023Q1', '2023Q4');
  const one = (title, mv, note) => `<div class="exg-col">${gaugeSvg({ W: gw, H, lo: -0.01, hi: 0.15, p: r, m: two ? mv : null, marks: two ? ['p', 'm'] : ['p'], band: two ? 'real' : null, title })}` +
    `<div class="exg-ro">${SYM.p} ${pc(r, 0)}${two ? `　${SYM.m} ${pc(mv)}` : ''}</div>${two ? `<div class="exg-ro sm">到手 ${SYM.p} − ${SYM.m} = <b class="${r - mv >= 0 ? 'c-blue' : 'c-red'}">${sg(r - mv)}</b></div>` : ''}<div class="exg-note">${esc(note)}</div></div>`;
  return `<div class="exg-h"><b>吸力尺</b><small>${two ? '加上 ▼：量出来的涨价' : '央行只拧 ▶'}</small></div>` +
    `<div class="exg-row two">${one('1980 年', EXP_STORY.cpi1980, two ? '▼ 约 13.5%（全年平均，大致）' : '假设 ▶ = 5%')}${one('2023 年', c23, two ? `▼ ${pc(c23)}（全年平均，真实数据）` : '假设 ▶ = 5%')}</div>` +
    legend(two ? ['p', 'm'] : ['p']) + (two ? '<p class="exg-note">实测的画实心（水文的老规矩）。▶ 和 ▼ 之间的色带 = 存钱的人到手的。</p>' : '<p class="exg-note">两把尺子一样高：只看 ▶，分不出 1980 年和 2023 年。</p>');
}

/* panel exp-hist (L3; 专题 intro): the US model 2020–2023, scrubbable */
function histHtml(m, w) {
  const sp = m.spec, st = m.st, rows = st.rows, k = st.k, r = rows[k], band = sp.band || null, marks = sp.marks || ['p', 'm', 'e'];
  const cpT = COUNTRY_PARAMS.USA.piTarget, an = ropeOf('USA').anchor;
  const narrow = w < 520, gw = 150, cw = narrow ? w - gw - 4 : Math.min(520, w - gw - 12), H = narrow ? 205 : 230;
  const g = gaugeSvg({ W: gw, H, lo: -0.01, hi: 0.07, p: r.p, m: r.m, e: r.e, target: cpT, dean: r.dean, anchor: an, band, marks });
  const c = chartSvg({ W: cw, H, rows, lo: -0.01, hi: 0.07, cur: k, band, marks, target: cpT, mich: !!sp.mich, labels: yearLabels(rows) });
  const open = r.p - r.e, real = r.p - r.m;
  let ro = `<div class="exg-ro">${SYM.p} ${pc(r.p)}　${SYM.m} ${pc(r.m)}　${SYM.e} ${pc(r.e)}<small>　绳：${ropeWord(r.dean)}</small></div>`;
  if (band === 'open') ro += `<div class="exg-ro">吸力 ${SYM.p} − ${SYM.e} = <b class="${open >= 0 ? 'c-blue' : 'c-red'}">${sg(open)}</b><small>　${bandWord(open)}</small></div>`;
  if (band === 'split') ro += `<div class="exg-ro">开阀 ${SYM.p} − ${SYM.e} = <b class="${open >= 0 ? 'c-blue' : 'c-red'}">${sg(open)}</b><small>　借钱、投资、定价看它</small></div>` +
    `<div class="exg-ro">到手 ${SYM.p} − ${SYM.m} = <b class="${real >= 0 ? 'c-blue' : 'c-red'}">${sg(real)}</b><small>　存钱的人、⑦、政策灯看它</small></div>` +
    `<div class="exg-ro">意外 ${SYM.m} − ${SYM.e} = <b>${pp(r.m - r.e)}</b><small>　${r.m > r.e ? '钱从存钱的人挪到欠债的人' : '钱从欠债的人挪到存钱的人'}</small></div>`;
  const chips = (sp.chips || []).length ? `<div class="exg-chips">${sp.chips.map(d => `<button type="button" class="exg-chip${r.date === d ? ' on' : ''}" data-exg="date:${d}">${esc(d)}</button>`).join('')}</div>` : '';
  const extra = sp.mich ? '<span><i class="exg-mich"></i> 真实的家庭调查（密歇根，未来一年）</span>' : '';
  return `<div class="exg-h"><b>吸力尺 · 美国（模型）</b><small>${esc(r.date)}</small></div>${chips}` +
    `<div class="exg-row">${g}${c}</div>${slider(rows.length, k, rows)}${ro}` + legend(marks, extra + (band ? '<span><i class="exg-sw blue"></i>蓝 <i class="exg-sw red"></i>红 = 吸力</span>' : '') + '<span><i class="exg-tgsw"></i> 调度线（目标）和绳</span>');
}

/* panel exp-five (L3): five places light up in the engine's order */
const ICON = {
  pump: '<svg viewBox="0 0 24 24"><rect x="6" y="10" width="12" height="11" rx="2"/><path d="M12 9V2M8.5 5.5 12 2l3.5 3.5"/></svg>',
  lake: '<svg viewBox="0 0 24 24"><path d="M2 9q2.5-2.5 5 0t5 0 5 0 5 0M2 14q2.5-2.5 5 0t5 0 5 0 5 0M2 19q2.5-2.5 5 0t5 0 5 0 5 0"/></svg>',
  pool: '<svg viewBox="0 0 24 24"><rect x="2" y="12" width="5" height="9" rx="1"/><rect x="9.5" y="7" width="5" height="14" rx="1"/><rect x="17" y="3" width="5" height="18" rx="1"/></svg>',
  river: '<svg viewBox="0 0 24 24"><path d="M1 5l5 15h12l5-15"/><path d="M4.5 13h15"/></svg>',
  hole: '<svg viewBox="0 0 24 24"><path d="M1 7h22"/><ellipse cx="12" cy="15" rx="8" ry="5" stroke-dasharray="3 2.5"/></svg>',
};
export function placeValue(rows, k, pl) {
  const v = metric(rows, k, pl.get);
  if (pl.id === 'pump') return { main: `新放贷比一年前 ${sg(v, 0)}`, v };
  if (pl.id === 'lake') return { main: `储蓄率 ${pc(metric(rows, k, 'sav'))}（比一年前 ${spp(v)}）`, v };
  if (pl.id === 'pool') return { main: `长期国债 ${sg(v, 0)} · 股票 ${sg(metric(rows, k, 'eqYoY'), 0)}（比一年前）`, v };
  if (pl.id === 'river') return { main: `失业率 ${pc(metric(rows, k, 'u'))}（比一年前 ${spp(v)}）`, v };
  return { main: '', v };
}
const thText = pl => `动了 = ${pl.what}${pl.dir === '<=' ? '跌过' : '升过'} ${pl.fmt === 'chg0' ? sg(pl.th, 0) : spp(pl.th)}`;
function fiveHtml(m, w) {
  const st = m.st, rows = st.rows, k = st.k, r = rows[k], K = st.from + k, all = st.all, F = st.five;
  const cpT = COUNTRY_PARAMS.USA.piTarget, an = ropeOf('USA').anchor, gw = 132, H = 270;
  const g = gaugeSvg({ W: gw, H, lo: -0.01, hi: 0.07, p: r.p, m: r.m, e: r.e, target: cpT, dean: r.dean, anchor: an, band: 'open' });
  const lit = pl => pl.turn && r.date >= pl.turn;
  const items = [...F.places].sort((a, b) => (a.rank || 9) - (b.rank || 9)).map(pl => {
    const v = placeValue(all, K, pl);
    return `<li class="exg-pl${lit(pl) ? ' lit' : ''}" data-place="${pl.id}"><i class="exg-ic">${ICON[pl.id]}</i><div><b>${esc(pl.name)}</b>` +
      `<span class="exg-rk">${pl.turn ? `第 ${pl.rank} 批 · ${esc(pl.turn)}` : '窗口里没动'}</span><small>${esc(v.main)}</small><small class="th">${esc(thText(pl))}</small></div></li>`;
  }).join('');
  const gd = metric(all, K, 'gd'), gdD = metric(all, K, 'gdD'), holeLit = r.m > r.e && ok(gdD) && gdD < 0;
  const hole = `<li class="exg-pl hole${holeLit ? ' lit' : ''}" data-place="hole"><i class="exg-ic">${ICON.hole}</i><div><b>地下的洞</b><span class="exg-rk">${holeLit ? '意外在化债' : r.m > r.e ? '意外还在' : '意外没了'}</span>` +
    `<small>政府债/GDP ${pc(gd)}（比一年前 ${spp(gdD)}）· 意外 ${SYM.m} − ${SYM.e} = ${pp(r.m - r.e)}</small><small class="th">⑦ 化债就靠这个意外</small></div></li>`;
  const open = r.p - r.e;
  return `<div class="exg-h"><b>吸力一变，哪里跟着动 · 美国（模型）</b><small>${esc(r.date)}</small></div>` +
    `<div class="exg-row">${g}<ol class="exg-five">${items}${hole}</ol></div>${slider(rows.length, k, rows)}` +
    `<div class="exg-ro">吸力 ${SYM.p} − ${SYM.e} = <b class="${open >= 0 ? 'c-blue' : 'c-red'}">${sg(open)}</b><small>　色带 ${esc(F.blue)} 转蓝；顺序：${esc(F.orderText)}</small></div>`;
}

/* panel exp-loop (L3): the loop ▼ → 央行 → ▶ → 吸力 → 五处 → 河 → ▼ */
export function loopNodes(all, K, five) {
  const r = all[K], prev = all[K - 1], tgt = COUNTRY_PARAMS.USA.piTarget, dP = r.p - prev.p, uD = metric(all, K, 'uD'), mD = metric(all, K, 'mYoY');
  const moved = five.places.filter(p => p.turn && r.date >= p.turn).length;
  return [
    { id: 'm', name: '▼ 物价', val: pc(r.m), on: r.m > tgt + 0.01, sub: r.m > tgt + 0.01 ? '高于调度线' : '回到调度线附近' },
    { id: 'cb', name: '央行', val: dP >= 0.001 ? '加息' : dP <= -0.001 ? '降息' : '不动', on: Math.abs(dP) >= 0.001, sub: '看 ▼，慢半拍' },
    { id: 'p', name: '▶ 政策利率', val: pc(r.p), on: Math.abs(dP) >= 0.001, sub: `这一季 ${spp(dP)}` },
    { id: 's', name: '吸力 ▶ − ▽', val: sg(r.p - r.e), on: r.p - r.e > 0, cls: r.p - r.e >= 0 ? 'blue' : 'red', sub: r.p - r.e >= 0 ? '蓝' : '红' },
    { id: 'f', name: '五处', val: `${moved}/${five.places.length} 动了`, on: moved > 0, sub: '池子、湖、泵、河' },
    { id: 'r', name: '河', val: `失业 ${pc(metric(all, K, 'u'))}`, on: ok(uD) && uD >= 0.005, sub: `比一年前 ${spp(uD)}` },
  ].map(n => ({ ...n, back: n.id === 'r' && ok(mD) && mD < 0 }));
}
function loopHtml(m, w) {
  const st = m.st, rows = st.rows, k = st.k, r = rows[k], K = st.from + k, all = st.all;
  const N = loopNodes(all, K, st.five), W = Math.min(w, 420), H = 300, cx = W / 2, cy = 150, R = Math.min(W / 2 - 52, 112), ry = 104;
  const ang = [-90, -30, 30, 90, 150, 210].map(a => a * Math.PI / 180), P = ang.map(a => [cx + R * Math.cos(a), cy + ry * Math.sin(a)]);
  const s = [];
  for (let i = 0; i < 6; i++) {   // arrows along the ring
    const a0 = ang[i] + 0.3, a1 = ang[(i + 1) % 6] + (i === 5 ? 2 * Math.PI : 0) - 0.3, mid = (a0 + a1) / 2;
    const p0 = [cx + R * Math.cos(a0), cy + ry * Math.sin(a0)], p1 = [cx + R * Math.cos(a1), cy + ry * Math.sin(a1)], c = [cx + R * 1.12 * Math.cos(mid), cy + ry * 1.12 * Math.sin(mid)];
    const on = i === 5 ? N[5].back : N[i].on;
    s.push(`<path class="exg-arc${on ? ' on' : ''}" d="M${p0[0].toFixed(1)},${p0[1].toFixed(1)} Q${c[0].toFixed(1)},${c[1].toFixed(1)} ${p1[0].toFixed(1)},${p1[1].toFixed(1)}" marker-end="url(#exg-ah${on ? '-on' : ''})"/>`);
  }
  N.forEach((n, i) => {
    const [x, y] = P[i], bw = 100, bh = 50;
    s.push(`<g class="exg-node${n.on ? ' on' : ''}${n.cls ? ' ' + n.cls : ''}" data-node="${n.id}"><rect x="${(x - bw / 2).toFixed(1)}" y="${(y - bh / 2).toFixed(1)}" width="${bw}" height="${bh}" rx="9"/>` +
      `<text x="${x.toFixed(1)}" y="${(y - 9).toFixed(1)}" text-anchor="middle" class="nm">${esc(n.name)}</text><text x="${x.toFixed(1)}" y="${(y + 6).toFixed(1)}" text-anchor="middle" class="vl">${esc(n.val)}</text>` +
      `<text x="${x.toFixed(1)}" y="${(y + 18).toFixed(1)}" text-anchor="middle" class="sb">${esc(n.sub)}</text></g>`);
  });
  // ▽ in the middle, on its rope to the 调度线, chasing ▼
  const tgt = COUNTRY_PARAMS.USA.piTarget, d = clamp(r.dean, 0, 1), w0 = ropePx(ropeOf('USA').anchor);
  s.push(`<g class="exg-mid"><text x="${cx}" y="${cy - 34}" text-anchor="middle" class="sb">追 ▼ ↑</text><polygon class="exg-e" points="${tri(cx, cy - 10, 'd', 7)}"/>` +
    `<text x="${cx + 11}" y="${cy - 12}" class="vl">${pc(r.e)}</text><path class="exg-rope" d="M${cx},${cy - 8} Q${cx + 3 + d * 22},${cy + 4} ${cx},${cy + 16}" stroke-width="${w0.toFixed(2)}"/>` +
    `<line class="exg-tgt" x1="${cx - 30}" x2="${cx + 30}" y1="${cy + 16}" y2="${cy + 16}"/><text x="${cx}" y="${cy + 28}" text-anchor="middle" class="sb">调度线 ${pc(tgt, 0)}</text>` +
    `<text x="${cx}" y="${cy + 39}" text-anchor="middle" class="sb">绳：${ropeWord(r.dean)}</text></g>`);
  const defs = '<defs><marker id="exg-ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8z" class="exg-ahp"/></marker><marker id="exg-ah-on" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8z" class="exg-ahp on"/></marker></defs>';
  return `<div class="exg-h"><b>绕一圈回来 = 短周期 · 美国（模型）</b><small>${esc(r.date)}</small></div>` +
    `<div class="exg-loopw"><svg class="exg-loop" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}${s.join('')}</svg></div>${slider(rows.length, k, rows)}` +
    `<p class="exg-note">亮的箭头 = 这一季正在传的那一环。</p>`;
}

/* panel exp-rope (专题 step 1; L3): the rope toy */
function ropeHtml(m, w) {
  const st = m.st, T = toyRun(st.path, st.rope), rows = T.rows, n = rows.length, k = st.k == null ? n - 1 : st.k, r = rows[k], rp = T.rope;
  const gw = 140, narrow = w < 520, cw = narrow ? w - gw - 4 : Math.min(520, w - gw - 12), H = 230;
  const ghosts = EXP_TOY.ropes.filter(x => x.id !== st.rope).map(x => ({ key: 'g_' + x.id }));
  const crows = rows.map((x, i) => { const o = { ...x }; EXP_TOY.ropes.forEach(rr => { if (rr.id !== st.rope) o['g_' + rr.id] = toyRun(st.path, rr.id).rows[i].e; }); return o; });
  const g = gaugeSvg({ W: gw, H, lo: 0, hi: 0.10, m: r.m, e: r.e, target: rp.target, dean: r.dean, anchor: rp.cut ? 0.0364 : rp.anchor, cut: rp.cut, marks: ['m', 'e'] });
  const c = chartSvg({ W: cw, H, rows: crows, lo: 0, hi: 0.10, cur: k, marks: ['m', 'e'], target: rp.target, ghosts, labels: rows.filter(x => x.q % 16 === 0).map(x => ({ k: x.q, text: x.q ? `${x.q / 4} 年` : '0' })) });
  const btn = (key, list) => `<div class="exg-chips" role="group">${list.map(x => `<button type="button" class="exg-chip${st[key] === x.id ? ' on' : ''}" data-exg="${key}:${x.id}">${esc(x.name)}</button>`).join('')}</div>`;
  const yr = q => `第 ${(q / 4).toFixed(q % 4 ? 2 : 0).replace(/\.?0+$/, '')} 年`;
  return `<div class="exg-h"><b>绳子玩具</b><small>模型里 ▽ 的规则，${esc(T.path.name)} · ${esc(rp.cut ? '剪断' : EXP_TOY.ropes.find(x => x.id === st.rope).name + '的绳')}</small></div>` +
    `<div class="exg-ctl"><span>▼ 的路</span>${btn('path', EXP_TOY.paths)}</div><div class="exg-ctl"><span>绳</span>${btn('rope', EXP_TOY.ropes)}</div>` +
    `<div class="exg-row">${g}${c}</div>${slider(n, k, rows, x => yr(x.q + 1))}` +
    `<div class="exg-ro">${SYM.m} ${pc(r.m)}　${SYM.e} ${pc(r.e)}　绳：<b>${ropeWord(r.dean, rp.cut)}</b><small>　调度线 ${pc(rp.target, 1)} · 拉力每季 ${pc(rp.anchor, 1)}</small></div>` +
    legend(['m', 'e'], '<span><i class="exg-ghost"></i> 另外两根绳下的 ▽</span>') + (T.path.note ? `<p class="exg-note">${esc(T.path.note)}</p>` : '');
}

/* panel exp-story (专题 step 2): two story readings (approximate history, not a model replay) */
export function storyNumbers() {
  return {
    vE: mich.at('1980Q1'), vE83: mich.avg('1983Q1', '1983Q4'), vP: EXP_STORY.volckerPolPeak, vM: EXP_STORY.cpi1980, vU: EXP_STORY.volckerU,
    jP: jpn.avg('policyRate', EXP_STORY.japanFrom, EXP_STORY.japanUntil), jM: jpn.avg('cpiYoY', EXP_STORY.japanFrom, EXP_STORY.japanUntil), jE: EXP_STORY.japanExpShown,
  };
}
function storyHtml(m, w) {
  const S = storyNumbers(), gw = Math.min(180, Math.floor((w - 12) / 2)), H = 260;
  const v = gaugeSvg({ W: gw, H, lo: 0, hi: 0.20, p: S.vP, m: S.vM, e: S.vE, band: 'open', title: '沃尔克 1979–1983', ghostE: { v: S.vE83, label: '1983' } });
  const j = gaugeSvg({ W: gw, H, lo: -0.015, hi: 0.015, p: S.jP, m: S.jM, e: S.jE, band: 'open', title: '日本 1999–2012', zeroLabel: '▶ 的底' });
  return `<div class="exg-h"><b>故事读法，不是模型回放</b><small>大致的历史数</small></div><div class="exg-row two">` +
    `<div class="exg-col">${v}<div class="exg-ro sm">${SYM.e} 约 ${pc(S.vE, 0)}（1980 年初）→ 约 ${pc(S.vE83, 0)}（1983）</div><div class="exg-ro sm">${SYM.p} 一度约 ${pc(S.vP, 0)}（1981）</div><div class="exg-ro sm">${SYM.m} 约 ${pc(S.vM)}（1980）</div><div class="exg-note">代价：河干，失业接近 ${pc(S.vU, 0)}（1982 年底）</div></div>` +
    `<div class="exg-col">${j}<div class="exg-ro sm">${SYM.p} 平均约 ${pc(S.jP)}</div><div class="exg-ro sm">${SYM.m} 平均约 ${pc(S.jM)}</div><div class="exg-ro sm">${SYM.e} 0 附近（示意）</div><div class="exg-note">没有调度线 → 没有绳。▶ 到底，色带还是蓝的：降不动。</div></div>` +
    `</div><p class="exg-note">${SYM.e} 沃尔克：密歇根家庭调查；${SYM.p} ${SYM.m} 日本：repo 里的日本季度数据；其余是大致的历史数。</p>`;
}

/* panel exp-pool (专题 step 3): an asset pool with no rope */
function poolHtml(m, w) {
  const P = poolRun(), rows = P.rows, n = rows.length, W = Math.min(w, 560), H1 = 170, H2 = 92, L = 34, R = 8;
  const X = k => L + k * (W - L - R) / (n - 1);
  const hi = Math.ceil(Math.max(...rows.map(r => r.price)) / 50) * 50;
  const Y1 = v => 10 + (hi - v) / hi * (H1 - 30), dHi = EXP_POOL.ceil, Y2 = v => 8 + (dHi - v) / dHi * (H2 - 26);
  const pts = rows.map((r, k) => `${X(k).toFixed(1)},${Y1(r.price).toFixed(1)}`).join(' '), dpts = rows.map((r, k) => `${X(k).toFixed(1)},${Y2(r.den).toFixed(1)}`).join(' ');
  const lab = (k, v, t, dy = -8, anchor = null, dx = 0) => `<text class="exg-ann" x="${(X(k) + dx).toFixed(1)}" y="${(Y1(v) + dy).toFixed(1)}" text-anchor="${anchor || (k > n * 0.75 ? 'end' : k < 3 ? 'start' : 'middle')}">${esc(t)}</text>`;
  const rise = rows.findIndex(r => r.price > 150), drop = rows.findIndex((r, k) => k > P.peakAt && r.price < P.peak * 0.75);
  const a = `<svg class="exg-chart" width="${W}" height="${H1}" viewBox="0 0 ${W} ${H1}">` +
    [0, 100, hi / 2, hi].filter((v, i, z) => z.indexOf(v) === i).map(v => `<line class="exg-grid" x1="${L}" x2="${W - R}" y1="${Y1(v)}" y2="${Y1(v)}"/><text class="exg-tl" x="${L - 4}" y="${Y1(v) + 3.5}" text-anchor="end">${v}</text>`).join('') +
    `<polyline class="exg-ln pool" points="${pts}"/>` + lab(rise, rows[rise].price, '涨速爬上来 →', 4, 'end', -8) + lab(P.peakAt, P.peak, '冲过头') +
    (drop > 0 ? lab(drop, rows[drop].price, '← 涨速一停，大跌', 4, 'start', 8) : '') + lab(P.troughAt, P.trough, '跌过头', 16) +
    `<text class="exg-tl" x="${L}" y="${H1 - 4}">价格（开始 = 100）</text></svg>`;
  const yF = Y2(EXP_POOL.floor);
  const b = `<svg class="exg-chart" width="${W}" height="${H2}" viewBox="0 0 ${W} ${H2}"><line class="exg-tgt" x1="${L}" x2="${W - R}" y1="${yF}" y2="${yF}"/><text class="exg-tl" x="${W - R}" y="${yF + 11}" text-anchor="end">地板 ${pc(EXP_POOL.floor)}</text>` +
    `<line class="exg-grid" x1="${L}" x2="${W - R}" y1="${Y2(EXP_POOL.suction + EXP_POOL.fear)}" y2="${Y2(EXP_POOL.suction + EXP_POOL.fear)}"/><text class="exg-tl" x="${L - 4}" y="${Y2(EXP_POOL.suction + EXP_POOL.fear) + 3.5}" text-anchor="end">${pc(EXP_POOL.suction + EXP_POOL.fear, 0)}</text>` +
    `<polyline class="exg-ln den" points="${dpts}"/><text class="exg-tl" x="${L}" y="${H2 - 4}">分母 = 吸力 + 怕 − 涨速（季度）</text></svg>`;
  return `<div class="exg-h"><b>资产池没有绳（玩具）</b><small>价格 ≈ 泉眼 ÷（吸力 + 怕 − 涨速）</small></div>` +
    `<p class="exg-note">第 ${EXP_POOL.jumpAt} 季泉眼多了 ${pc(EXP_POOL.jump, 0)}。池子自己的 ▽ = 最近一年涨了多少：越涨越以为会涨，分母往 0 挤；涨速一停，分母弹回来。</p>` +
    `<div class="exg-stack">${a}${b}</div><p class="exg-note">吸力 ${pc(EXP_POOL.suction, 0)}、怕 ${pc(EXP_POOL.fear, 0)} 不变。只看形状：涨速一停就大跌，跌过头再回来（明斯基）。</p>`;
}

/* panel exp-gate (专题 step 4 「汇率上的绳」, ?lesson=exp&step=4): the gate gauge (▶差 = rate gap, ▽汇 = expected depreciation) + three story readings from the data */
const audQ = d => { const i = AUS_Q.dates.indexOf(d); return i < 0 ? null : 1 / AUS_Q.series.fxPerUsd[i]; };
const polQ = (D, d) => { const i = D.dates.indexOf(d); return i < 0 ? null : D.series.policyRate[i]; };
export const fxAt = {
  gbp: mo => { const i = EXP_FX.gbp.months.indexOf(mo); return i < 0 ? null : EXP_FX.gbp.usdPerGbp[i]; },
  thb: mo => { const i = EXP_FX.thb.months.indexOf(mo); return i < 0 ? null : EXP_FX.thb.thbPerUsd[i]; },
};
export const audGap = d => polQ(AUS_Q, d) - polQ(US_Q, d);   // ▶差 for AUD: AUS − US policy rate (the reactor's fast pipe uses the same gap)
export function gateStory(id) {
  if (id === 'gbp') {
    const ms = EXP_FX.gbp.months.filter(x => x >= '1992-01' && x <= '1993-06');
    return { id, name: '英镑 1992', kind: 'peg', unit: '1 英镑换多少美元', ms, vals: ms.map(fxAt.gbp), mark: ms.indexOf('1992-09'), markLabel: '9 月退出',
      line: `8 月 ${fxAt.gbp('1992-08').toFixed(2)} → 11 月 ${fxAt.gbp('1992-11').toFixed(2)} 美元（${sg(fxAt.gbp('1992-11') / fxAt.gbp('1992-08') - 1, 0)}，月平均）`, f: v => v.toFixed(2) };
  }
  if (id === 'thb') {
    const ms = EXP_FX.thb.months.filter(x => x >= '1996-07' && x <= '1998-06');
    return { id, name: '泰铢 1997', kind: 'peg', unit: '1 泰铢换多少美分', ms, vals: ms.map(x => 100 / fxAt.thb(x)), mark: ms.indexOf('1997-07'), markLabel: '7 月放开',
      line: `1 美元：6 月 ${fxAt.thb('1997-06').toFixed(1)} → 1998 年 1 月 ${fxAt.thb('1998-01').toFixed(1)} 泰铢（月平均）`, f: v => v.toFixed(1) };
  }
  const ds = AUS_Q.dates.filter(d => d >= '2006Q1' && d <= '2010Q4');
  return { id: 'aud', name: '澳元 2008', kind: 'float', unit: '1 澳元换多少美元', ms: ds, vals: ds.map(audQ), mark: ds.indexOf('2008Q4'), markLabel: '2008Q4',
    line: `利差 2008Q2 ${spp(audGap('2008Q2'))}；2008Q3 ${audQ('2008Q3').toFixed(2)} → 2008Q4 ${audQ('2008Q4').toFixed(2)} 美元（季度平均）`, f: v => v.toFixed(2) };
}
function seriesSvg(S, W, H) {
  const L = 34, R = 8, T = 10, B = H - 18, n = S.vals.length, lo = Math.min(...S.vals), hi = Math.max(...S.vals), pad = (hi - lo) * 0.08;
  const X = k => L + k * (W - L - R) / (n - 1), Y = v => T + (hi + pad - v) / (hi - lo + 2 * pad) * (B - T);
  const ticks = [lo, (lo + hi) / 2, hi];
  const yrs = S.ms.map((d, k) => ({ k, y: d.slice(0, 4) })).filter((x, k, a) => !k || x.y !== a[k - 1].y);
  return `<svg class="exg-chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    ticks.map(v => `<line class="exg-grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="exg-tl" x="${L - 4}" y="${Y(v) + 3.5}" text-anchor="end">${S.f(v)}</text>`).join('') +
    yrs.map(x => `<text class="exg-tl" x="${X(x.k)}" y="${H - 4}" text-anchor="${x.k ? 'middle' : 'start'}">${x.y}</text>`).join('') +
    (S.mark >= 0 ? `<line class="exg-cur" x1="${X(S.mark)}" x2="${X(S.mark)}" y1="${T}" y2="${B}"/><text class="exg-ann" x="${X(S.mark) + 4}" y="${T + 10}">${esc(S.markLabel)}</text>` : '') +
    `<polyline class="exg-ln fx" points="${S.vals.map((v, k) => `${X(k).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}"/></svg>`;
}
function gateHtml(m, w) {
  const st = m.st, gap = audGap('2008Q2'), dep = st.dep, push = gap - dep, S = gateStory(st.story);
  const gw = 140, H = w < 520 ? 170 : 210, cw = w < 520 ? w - gw - 4 : Math.min(420, w - gw - 12);
  const g = gaugeSvg({ W: gw, H, lo: -0.02, hi: 0.12, p: gap, e: dep, marks: ['p', 'e'], band: 'open', title: '闸上的尺' });
  const chips = `<div class="exg-chips" role="group">${['gbp', 'thb', 'aud'].map(id => `<button type="button" class="exg-chip${st.story === id ? ' on' : ''}" data-exg="story:${id}">${esc(gateStory(id).name)}</button>`).join('')}</div>`;
  return `<div class="exg-h"><b>汇率上的绳</b><small>真推力 = 利差 − 预期贬值</small></div>` +
    `<div class="exg-row">${g}<div class="exg-gatebox" style="width:${cw}px"><div class="exg-ro">${SYM.p}差 澳洲 − 美国（2008Q2）= <b>${spp(gap)}</b></div>` +
    `<div class="exg-ro">${SYM.e}汇 预期贬值 = <b>${pc(dep)}</b><small>　拖下面的滑块</small></div>` +
    `<div class="exg-ro">真推力 = <b class="${push >= 0 ? 'c-blue' : 'c-red'}">${spp(push)}</b><small>　${push >= 0 ? '钱往澳元里流' : '钱往外逃'}</small></div>` +
    `<p class="exg-note">钉住 = 有绳：${SYM.e}汇 拴在官方价（0），绳的粗细 = 外汇储备 + 信誉。浮动 = 没绳。</p>` +
    `<details class="exg-tap"><summary>这条有名字吗？</summary><p>有：利率平价（interest-rate parity）。利差要拿预期的汇率变化来抵：利差 5 个点，可大家以为要贬 10%，钱照样往外走。</p></details></div></div>` +
    `<div class="exg-sl"><input type="range" min="0" max="120" step="1" value="${Math.round(dep * 1000)}" data-exg-dep aria-label="预期贬值"><div class="exg-slr"><span>0%</span><b>${SYM.e}汇 ${pc(dep)}</b><span>12%</span></div></div>` +
    `<div class="exg-h" style="margin-top:8px"><b>故事读法</b><small>真实数据（FRED、repo 的澳洲季度数据）</small></div>${chips}` +
    `<div class="exg-ro sm"><b>${esc(S.name)}</b> · ${S.kind === 'peg' ? '钉住，绳断了' : '浮动，没绳：冲过头'} · ${esc(S.unit)}</div>${seriesSvg(S, Math.min(w, 520), 150)}` +
    `<div class="exg-ro sm" data-story-line>${esc(S.line)}</div>` +
    `<p class="exg-note">加息后汇率先冲过头、再慢慢回来 = 多恩布什（1976）汇率超调。引擎里没有汇率预期；汇率闸现在用利差 + 恐慌指数代替。</p>`;
}

/* panel exp-laws (专题 step 5 「背后只有四条规律」) */
export const LAWS = () => [
  { law: '质量守恒', hydro: '水量平衡 / 连续方程', here: '抽上来 − 回灌 = 存量变化' },
  { law: '按势差流动', hydro: '达西定律：流量 ≈ 渗透系数 × 吸力差', here: '中间那根细管 = 渗透系数小 → 滞后；中国手动的闸 = 渗透系数极小' },
  { law: '一阶滞后', hydro: '线性水库演算', here: `${'▽'} 每季补上差距的 ${pc(ropeOf('USA').speed, 0)}，绳往调度线拉：峰被削平、推后` },
  { law: '带延迟的反馈控制', hydro: '水库按调度线放水 + 滞后 → 超调', here: `央行看 ▼ 拧 ▶，五处要 ${fiveTurns().lag.river} 个季度才走完（模型，2022–2024）→ 短周期` },
  { law: '人会预判', hydro: '水不会', here: '放水公告一出，水不会提前动，人会。▽ 只记得过去：央行喊话没进模型', odd: true },
];
function lawsHtml(m, w) {
  const r2 = h => FX_SPEC.r2.find(x => x.h === h).r2;
  return `<div class="exg-h"><b>背后只有四条规律</b><small>水文 ↔ 这张图</small></div><ol class="exg-laws">` +
    LAWS().map(x => `<li class="${x.odd ? 'odd' : ''}"><b>${esc(x.law)}</b><span>${esc(x.hydro)}</span><small>${esc(x.here)}</small></li>`).join('') + '</ol>' +
    `<div class="exg-h" style="margin-top:8px"><b>同样四条，用在汇率上</b></div><ul class="exg-fxl">` +
    `<li><b>水量平衡</b>贸易漏出去的水，经过湖流回来</li><li><b>按势差流动</b>资本跟着吸力差走</li>` +
    `<li><b>连通器</b>物价水平几十年才拉平：只看通胀差，1 年解释 ${pc(r2(1), 0)}，40 年 ${pc(r2(40), 0)}（${FX_SPEC.countries} 国，${FX_SPEC.from}–${FX_SPEC.to}）</li><li><b>绳</b>钉住还是浮动</li></ul>`;
}

/* panel exp-sum (专题 step 6): the summary */
function sumHtml(m, w) {
  const r = m.st.rows[m.st.k], gw = 150, H = 230;
  const g = gaugeSvg({ W: gw, H, lo: -0.01, hi: 0.07, p: r.p, m: r.m, e: r.e, target: COUNTRY_PARAMS.USA.piTarget, dean: r.dean, anchor: ropeOf('USA').anchor, band: 'split' });
  return `<div class="exg-h"><b>吸力尺 · 三条规则</b><small>美国（模型）${esc(r.date)}</small></div><div class="exg-row">${g}<ol class="exg-rules">` +
    `<li><b>开阀看 ${SYM.e}，结账看 ${SYM.m}</b><small>借钱、投资、定价：${SYM.p} − ${SYM.e} = ${sg(r.p - r.e)}；存钱到手：${SYM.p} − ${SYM.m} = ${sg(r.p - r.m)}</small></li>` +
    `<li><b>${SYM.e} 慢慢追 ${SYM.m}</b><small>往下追只用一半的劲</small></li>` +
    `<li><b>只有绳拴得住 ${SYM.e}</b><small>热得太久绳会松；资产池没有绳</small></li></ol></div>` +
    `<p class="exg-mn">口诀：短周期看河，长周期看地下水，资产看湖，角色看阀，汇率看闸，<b>预期看▽</b>。</p>`;
}
