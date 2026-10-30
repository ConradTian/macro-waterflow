// 水尺 (vertical staff gauge for a concept card), 对比尺 (A-vs-B bars) and the horizontal lamp bar for the 周期 tab.
// Detection/teaching layer only: reads snapshots and a lazily-built baseline run, never touches the economy.
//   gaugeHtml(conceptId, snap, sim)  -> HTML string ('' when the concept has no gauge)
//   lampBarHtml(lampKey, snap, sim)  -> HTML string for credit | debtService | policy | valuation
//   wireGauges(container)            -> optional hook (currently a no-op)
// Importable in Node (no DOM access at import time); the stylesheet is injected only when `document` exists.

import { createSim } from '../engine/sim.js';
import { US_Q } from '../data/us-quarterly.js';
import { currentCountry, countryInfo, countryData, fmtBn } from './country-info.js';
import { GAUGES, NO_GAUGE } from '../data/gauges.js';

export { GAUGES, NO_GAUGE };

/* ------------------------------------------------------------------ css */
function ensureCss() {
  // exact file name: exp-gauge.css must not count as gauge.css
  if (typeof document === 'undefined') return;
  const f = 'gauge.css';
  if ([...document.styleSheets].some(s => (s.href || '').split(/[?#]/)[0].endsWith('/' + f)) || document.querySelector(`link[data-css="${f}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('../../assets/css/' + f, import.meta.url).href;
  l.dataset.css = f;
  document.head.appendChild(l);
}

/* ------------------------------------------------------------------ small helpers */
const ok = v => typeof v === 'number' && isFinite(v);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MINUS = '−';
const LV_TXT = { green: '绿', yellow: '黄', red: '红' };
const LV_SYM = { green: '●', yellow: '▲', red: '■' };       // shape + text, never colour only
let uid = 0;

// bands may have lost +-Infinity through JSON (null) - restore
const normBands = b => (Array.isArray(b) ? b.map(x => ({ lo: x.lo == null ? -Infinity : x.lo, hi: x.hi == null ? Infinity : x.hi, level: x.level })) : null);
export function bandLevel(bands, v) {
  if (!bands || !ok(v)) return null;
  const b = bands.find(x => v >= x.lo && v < x.hi);
  return b ? b.level : null;
}

function fnum(v, fmt, dec = 1) {
  if (!ok(v)) return '—';
  const sg = v < 0 && Math.abs(v) >= (fmt === 'pct' ? 0.5 * 10 ** -(dec + 2) : 0.005) ? MINUS : '';
  if (fmt === 'pct') return sg + Math.abs(v * 100).toFixed(dec) + '%';
  if (fmt === 'x') return sg + Math.abs(v).toFixed(2) + 'x';
  return sg + Math.abs(v).toFixed(2);
}
// band-edge numbers: no trailing zeros ("0.3%", "12.3%", "1.15x")
function fedge(v, fmt) {
  if (!ok(v)) return '';
  const sg = v < 0 ? MINUS : '';
  if (fmt === 'pct') return sg + String(+Math.abs(v * 100).toFixed(2)) + '%';
  if (fmt === 'x') return sg + String(+Math.abs(v).toFixed(2)) + 'x';
  return sg + String(+Math.abs(v).toFixed(2));
}
function fmoney(v, town, iso = 'USA') {
  if (!ok(v)) return '—';
  if (town) return (Math.abs(v) < 10 ? v.toFixed(1) : String(Math.round(v))) + ' 万元';
  return fmtBn(v, iso);      // USA: '2.10 万亿美元' / '620 十亿美元' as before; another country: its own currency
}

// push labels apart (sorted by y), keeping inside [lo, hi]
function spread(items, gap, lo, hi) {
  items.sort((a, b) => a.y - b.y);
  for (let i = 0; i < items.length; i++) {
    items[i].y = Math.max(items[i].y, lo);
    if (i) items[i].y = Math.max(items[i].y, items[i - 1].y + gap);
  }
  const n = items.length;
  if (n && items[n - 1].y > hi) {
    items[n - 1].y = hi;
    for (let i = n - 2; i >= 0; i--) items[i].y = Math.min(items[i].y, items[i + 1].y - gap);
  }
  return items;
}

/* ------------------------------------------------------------------ events (US only) */
const EVENTS = [['2000Q1', '科网泡沫顶'], ['2006Q2', '房价顶'], ['2008Q4', '金融危机'], ['2020Q2', '疫情'], ['2022Q2', '通胀顶']];
const qIndex = d => { const m = /^(\d{4})Q([1-4])$/.exec(d || ''); return m ? +m[1] * 4 + +m[2] - 1 : null; };
function eventName(date, scen, iso = 'USA') {
  if (scen === 'town' || iso !== 'USA') return '';      // the event labels are US history
  const q = qIndex(date);
  if (q == null) return '';
  let best = '', bd = 3;
  for (const [d, n] of EVENTS) { const dd = Math.abs(qIndex(d) - q); if (dd <= 2 && dd < bd) { best = n; bd = dd; } }
  return best;
}

/* ------------------------------------------------------------------ baseline runs (lazy, cached) */
const SCEN_NAME = { history: '美国 1995–2025 基线', free: '自由模式基线', town: '小镇基线' };
const scenName = (scen, iso) => (scen === 'history' && iso !== 'USA' ? `${countryInfo(iso).name} 1995–2025 基线` : SCEN_NAME[scen]);
const BASE = new Map();      // `${iso}|${scen}` -> { sim, snaps }
const SERIES = new Map();    // `${iso}|${scen}|${key}` -> { vals, dates, min, max, iMin, iMax, n }
const EMPTY = () => ({ vals: [], dates: [], min: Infinity, max: -Infinity, iMin: -1, iMax: -1, n: 0 });

function scenOf(snap, sim) {
  if (sim?.scenario === 'town' || snap?.scenario === 'town') return 'town';
  return sim?.mode === 'free' ? 'free' : 'history';
}
// iso: the country the live sim runs on. The baseline is the same engine on that country's data (app.js registers it); without the data: null (no 洪痕 range, the gauge still draws)
function baseline(scen, iso = 'USA') {
  if (scen === 'town') iso = 'USA';
  const bk = iso + '|' + scen;
  let b = BASE.get(bk);
  if (b) return b;
  const data = iso === 'USA' ? US_Q : countryData(iso);
  if (!data) return null;
  const sim = scen === 'town' ? createSim({ scenario: 'town' }) : createSim({ data, mode: scen === 'free' ? 'free' : 'history', country: iso });
  let guard = 0;
  while (!sim.done && guard++ < 400) sim.step();
  b = { sim, snaps: sim.history('model') };
  BASE.set(bk, b);
  return b;
}
function seriesOf(scen, key, fn, iso = 'USA') {
  if (scen === 'town') iso = 'USA';
  const ck = iso + '|' + scen + '|' + key;
  let s = SERIES.get(ck);
  if (s) return s;
  const bl = baseline(scen, iso);
  if (!bl) return EMPTY();
  const { sim, snaps } = bl;
  const vals = [], dates = [];
  let min = Infinity, max = -Infinity, iMin = -1, iMax = -1, n = 0;
  snaps.forEach((sn, i) => {
    let v = null;
    try { v = fn(sn, sim); } catch (e) { v = null; }
    if (!ok(v)) v = null;
    vals.push(v); dates.push(sn.date);
    if (v != null) { n++; if (v < min) { min = v; iMin = i; } if (v > max) { max = v; iMax = i; } }
  });
  s = { vals, dates, min, max, iMin, iMax, n };
  SERIES.set(ck, s);
  return s;
}
// the trail: values of the last 8 quarters BEFORE the current one, from the live sim
function trailOf(sim, snap, fn) {
  const out = [];
  if (!sim || !snap) return out;
  const br = snap.branch || 'model';
  for (let k = 8; k >= 1; k--) {
    if (snap.t - k < 0) continue;
    let v = null;
    try { const s = sim.snapshot(br, snap.t - k); v = s ? fn(s, sim) : null; } catch (e) { v = null; }
    if (ok(v)) out.push(v);
  }
  return out;
}

/* ------------------------------------------------------------------ vertical 水尺 (inline SVG) */
const W = 340, TOP = 12, HS = 150, BARX = 64, BARW = 18, LABX = 108;

function pickScale(S, cur, trail, edges) {
  let lo, hi;
  if (S && S.n > 0) { lo = S.min; hi = S.max; } else { lo = hi = ok(cur) ? cur : 0; }
  let span = hi - lo;
  if (!(span > 1e-12)) span = Math.max(Math.abs(hi) * 0.2, 0.01);
  if (!(hi - lo > 1e-12)) { lo -= span / 2; hi += span / 2; }
  const l0 = lo - 0.1 * span, h0 = hi + 0.1 * span;
  lo = l0; hi = h0;
  for (const v of [cur, ...trail]) if (ok(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (const e of edges) if (e > l0 - 0.5 * span && e < h0 + 0.5 * span) { lo = Math.min(lo, e); hi = Math.max(hi, e); }
  const pad = (hi - lo) * 0.03;
  return [lo - pad, hi + pad];
}

function verticalSvg(id, g, snap, sim) {
  const scen = scenOf(snap, sim), iso = currentCountry(sim);
  const S = seriesOf(scen, 'c:' + id, g.get, iso);
  const cur = g.get(snap, sim);
  const trail = trailOf(sim, snap, g.get);
  const bands = normBands(typeof g.bands === 'function' ? g.bands(snap) : g.bands);
  const edges = bands ? [...new Set(bands.flatMap(b => [b.lo, b.hi]).filter(isFinite))] : [];
  const [lo, hi] = pickScale(S, cur, trail, edges);
  const Y = v => TOP + (hi - v) / (hi - lo) * HS;
  const spanPct = (hi - lo) * 100;
  const dec = g.fmt === 'pct' ? (spanPct < 3 ? 2 : 1) : 2;
  const F = v => fnum(v, g.fmt, dec);
  const n = ++uid;
  const out = [];

  // ---- bar
  if (bands) {
    const seg = [];
    for (const b of bands) {
      const a = Math.max(b.lo, lo), z = Math.min(b.hi, hi);
      if (z <= a) continue;
      const y1 = Y(z), y2 = Y(a);
      seg.push(`<rect class="gg-b gg-b-${b.level}" x="${BARX}" y="${y1.toFixed(1)}" width="${BARW}" height="${(y2 - y1).toFixed(1)}"/>`);
      if (b.level !== 'green') seg.push(`<rect x="${BARX}" y="${y1.toFixed(1)}" width="${BARW}" height="${(y2 - y1).toFixed(1)}" fill="url(#gg-${b.level[0]}${n})"/>`);
      if (y2 - y1 >= 15) seg.push(`<text class="gg-bl" x="${BARX + BARW / 2}" y="${((y1 + y2) / 2 + 3.5).toFixed(1)}" text-anchor="middle">${LV_TXT[b.level]}</text>`);
    }
    out.push(`<defs><pattern id="gg-y${n}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.2" height="6" class="gg-pat"/></pattern>` +
      `<pattern id="gg-r${n}" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.2" class="gg-pat"/></pattern></defs>`);
    out.push(`<g>${seg.join('')}</g>`);
  } else {
    out.push(`<rect class="gg-neutral" x="${BARX}" y="${TOP}" width="${BARW}" height="${HS}"/>`);
    if (ok(cur)) out.push(`<rect class="gg-water" x="${BARX}" y="${Y(cur).toFixed(1)}" width="${BARW}" height="${(TOP + HS - Y(cur)).toFixed(1)}"/>`);
  }
  out.push(`<rect class="gg-frame" x="${BARX}" y="${TOP}" width="${BARW}" height="${HS}"/>`);

  // ---- left scale numbers
  const left = [];
  if (bands) { for (const e of edges) if (e > lo && e < hi) left.push({ y: Y(e), t: fedge(e, g.fmt) }); }
  else {
    // scale ends are padded, not data: round them (no "117.01%")
    const fe = v => g.fmt === 'pct' ? (v < 0 ? MINUS : '') + Math.abs(v * 100).toFixed(spanPct > 10 ? 0 : 1) + '%' : fedge(v, g.fmt);
    left.push({ y: TOP + 4, t: fe(hi) }, { y: TOP + HS, t: fe(lo) });
    if (lo < 0 && hi > 0) left.push({ y: Y(0) + 3, t: '0', zero: true });
  }
  spread(left, 11, TOP + 4, TOP + HS + 4);
  for (const l of left) out.push(`<text class="gg-sc" x="${BARX - 7}" y="${(l.y + (bands ? 3.5 : 0)).toFixed(1)}" text-anchor="end">${l.t}</text>`);
  if (bands) { for (const e of edges) if (e > lo && e < hi) out.push(`<line class="gg-tk" x1="${BARX - 4}" x2="${BARX}" y1="${Y(e).toFixed(1)}" y2="${Y(e).toFixed(1)}"/>`); }
  if (!bands && lo < 0 && hi > 0) out.push(`<line class="gg-zero" x1="${BARX - 3}" x2="${BARX + BARW}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}"/>`);

  // ---- trail dots (oldest faintest)
  const cx = BARX + BARW / 2;
  if (trail.length) {
    const pts = trail.map(v => `${cx},${Y(v).toFixed(1)}`);
    if (ok(cur)) pts.push(`${cx},${Y(cur).toFixed(1)}`);
    out.push(`<polyline class="gg-trail" points="${pts.join(' ')}"/>`);
    trail.forEach((v, i) => out.push(`<circle class="gg-dot" cx="${cx}" cy="${Y(v).toFixed(1)}" r="2.6" style="opacity:${(0.25 + 0.6 * (i + 1) / trail.length).toFixed(2)}"/>`));
  }

  // ---- marks on the right: now + 洪痕 (highest / lowest over the whole baseline)
  const marks = [];
  const lvNow = bands && ok(cur) ? bandLevel(bands, cur) : null;
  let arrow = '';
  if (ok(cur) && trail.length) { const d = cur - trail[trail.length - 1]; if (Math.abs(d) > 0.02 * (hi - lo)) arrow = d > 0 ? ' ↑' : ' ↓'; }
  if (ok(cur)) marks.push({ y: Y(cur), kind: 'now', t: `现在 ${F(cur)}${arrow}`, lv: lvNow });
  else marks.push({ y: TOP + HS / 2, kind: 'now', t: '现在 —（还没有足够的历史）', lv: null });
  const spread0 = S.n > 0 && S.max - S.min > 1e-12;
  if (spread0) {
    // the extremes span the whole baseline run (they may lie after this quarter), so say 全程; when 现在 sits on one, merge the labels
    const hiTxt = `全程最高 ${F(S.max)} · ${S.dates[S.iMax]}`, loTxt = `全程最低 ${F(S.min)} · ${S.dates[S.iMin]}`;
    const eh = eventName(S.dates[S.iMax], scen, iso), el = eventName(S.dates[S.iMin], scen, iso);
    const near = v => ok(cur) && Math.abs(Y(v) - Y(cur)) < 8;
    if (near(S.max)) marks[0].t += '（全程最高）'; else marks.push({ y: Y(S.max), kind: 'hi', t: hiTxt + (eh ? ' ' + eh : '') });
    if (near(S.min)) marks[0].t += '（全程最低）'; else marks.push({ y: Y(S.min), kind: 'lo', t: loTxt + (el ? ' ' + el : '') });
  }
  const placed = marks.map(m => ({ ...m, y0: m.y }));      // y0 = true position on the bar, y = label position after spreading
  spread(placed, 15, TOP + 6, TOP + HS + 2);
  for (const m of placed) {
    if (m.kind === 'now') continue;
    out.push(`<line class="gg-mk-l" x1="${BARX - 2}" x2="${BARX + BARW + 2}" y1="${m.y0.toFixed(1)}" y2="${m.y0.toFixed(1)}"/>`);
  }
  for (const m of placed) {
    const y0 = m.y0.toFixed(1), ty = m.y.toFixed(1);
    out.push(`<polyline class="gg-lead ${m.kind === 'now' ? 'gg-lead-now' : ''}" points="${BARX + BARW + 2},${y0} ${LABX - 8},${y0} ${LABX - 4},${ty}"/>`);
    if (m.kind === 'now') {
      out.push(`<path class="gg-now" d="M${BARX - 5},${(m.y0 - 5).toFixed(1)} L${BARX},${y0} L${BARX - 5},${(m.y0 + 5).toFixed(1)} Z"/>`);
      out.push(`<line class="gg-nowline" x1="${BARX}" x2="${BARX + BARW}" y1="${y0}" y2="${y0}"/>`);
      const lvTxt = m.lv ? `<tspan class="gg-lv gg-lv-${m.lv}" dx="6">${LV_SYM[m.lv]}${LV_TXT[m.lv]}</tspan>` : '';
      out.push(`<text class="gg-now-t" x="${LABX}" y="${(m.y + 4).toFixed(1)}">${esc(m.t)}${lvTxt}</text>`);
    } else {
      out.push(`<text class="gg-hist-t" x="${LABX}" y="${(m.y + 4).toFixed(1)}">${esc(m.t)}</text>`);
    }
  }

  const aria = `水尺：${g.label ? g.label + '，' : ''}现在 ${ok(cur) ? F(cur) : '—'}${lvNow ? '（' + LV_TXT[lvNow] + '区）' : ''}` +
    (spread0 ? `；基线最高 ${F(S.max)}（${S.dates[S.iMax]}），最低 ${F(S.min)}（${S.dates[S.iMin]}）` : '');
  const H = TOP + HS + 8;
  return { svg: `<svg class="gg-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}" preserveAspectRatio="xMinYMin meet">${out.join('')}</svg>`, scen, iso, hasBands: !!bands };
}

/* ------------------------------------------------------------------ 对比尺 */
function pairHtml(g, snap, sim) {
  if (typeof g.pair !== 'function') return '';
  let p = null;
  try { p = g.pair(snap, sim); } catch (e) { p = null; }
  if (!p || !p.a || !p.b || !ok(p.a.v) || !ok(p.b.v)) return '';
  const town = snap.scenario === 'town' || sim?.scenario === 'town';
  const iso = currentCountry(sim);
  const val = v => (p.fmt === 'bn' ? fmoney(v, town, iso) : p.fmt === 'num' ? fnum(v, 'num') : fnum(v, 'pct', 1));
  const av = p.a.v, bv = p.b.v;
  let lo = Math.min(0, av, bv), hi = Math.max(0, av, bv);
  if (p.zoom) {                                           // both values are big and close: cut the scale (marked with a break sign)
    const mn = Math.min(av, bv), mx = Math.max(av, bv);
    lo = mn - Math.max(Math.abs(av - bv) * 1.5, Math.abs(mx) * 0.02); hi = mx;
  }
  if (!(hi - lo > 1e-12)) hi = lo + 1;
  const X = v => (v - lo) / (hi - lo) * 100;
  const z = Math.max(0, Math.min(100, X(0)));
  const win = av === bv ? '' : av > bv ? 'a' : 'b';
  const row = (k, o, v) => {
    const x = X(v), l = Math.min(z, x), w = Math.abs(x - z);
    const cls = win === '' ? '' : win === k ? ' gg-win' : ' gg-lose';
    return `<div class="gg-prow gg-p-${k}${cls}"><span class="gg-plab">${esc(o.label)}</span>` +
      `<span class="gg-pbar">${p.zoom ? '<em class="gg-brk" aria-hidden="true">≈</em>' : ''}<i style="left:${l.toFixed(1)}%;width:${Math.max(w, 1.2).toFixed(1)}%"></i></span>` +
      `<b class="gg-pval">${win === k ? '▲ ' : ''}${val(v)}</b></div>`;
  };
  return `<div class="gg-pair" role="group" aria-label="对比尺"><div class="gg-ph">对比尺 <small>两根同刻度的条，长的那根赢${p.zoom ? '（刻度已截断，看差距）' : ''}</small></div>` +
    row('a', p.a, av) + row('b', p.b, bv) +
    (p.verdict ? `<div class="gg-verdict">${win ? '▶' : '＝'} ${esc(p.verdict)}</div>` : '') + '</div>';
}

/* ------------------------------------------------------------------ public: concept card gauge */
export function gaugeHtml(conceptId, snap, sim) {
  const g = GAUGES[conceptId];
  if (!g || !snap) return '';
  if (g.usOnly && currentCountry(sim) !== 'USA') return '';
  ensureCss();
  let v;
  try { v = verticalSvg(conceptId, g, snap, sim || null); } catch (e) { return ''; }
  const note = `圆点 = 近 8 季轨迹（越淡越早）；虚线 = ${scenName(v.scen, v.iso) || '基线'}里的最高 / 最低`;
  return `<div class="gg" data-gauge="${esc(conceptId)}"><div class="gg-h">水尺${g.label ? ` <small>${esc(g.label)}</small>` : ''}</div>` +
    v.svg + `<div class="gg-note">${note}${v.hasBands ? '；色带：绿 / 黄（斜纹）/ 红（点纹）' : ''}</div>` + pairHtml(g, snap, sim || null) + '</div>';
}

/* ------------------------------------------------------------------ public: horizontal lamp bar */
const LAMP_FMT = { credit: 'pct', debtService: 'pct', policy: 'pct', valuation: 'x' };

function lampValue(k, s) {
  const l = s?.lights?.[k];
  if (!l) return null;
  if (k === 'valuation') { const p = l.parts; return p && ok(p.house) && ok(p.equity) ? Math.max(p.house, p.equity) : null; }
  return l.value;
}

export function lampBarHtml(lampKey, snap, sim) {
  const L = snap?.lights?.[lampKey];
  if (!L || !L.bands || !L.axis) return '';
  ensureCss();
  const fmt = LAMP_FMT[lampKey] || 'num';
  const [a0, a1] = L.axis, span = a1 - a0;
  const bands = normBands(L.bands);
  const pos = v => Math.max(0, Math.min(100, (v - a0) / span * 100));
  const scen = scenOf(snap, sim), iso = currentCountry(sim);
  const val = v => fnum(v, fmt, fmt === 'x' ? 2 : 1);
  let S = null;
  try { S = seriesOf(scen, 'l:' + lampKey, s => lampValue(lampKey, s), iso); } catch (e) { S = null; }

  // segments (colour + texture + level text in the title)
  const segs = bands.map(b => {
    const x0 = pos(Math.max(b.lo, a0)), x1 = pos(Math.min(b.hi, a1));
    return x1 > x0 ? `<i class="lb-s lb-s-${b.level}" style="left:${x0.toFixed(2)}%;width:${(x1 - x0).toFixed(2)}%" title="${LV_TXT[b.level]}"></i>` : '';
  }).join('');
  // threshold numbers (stagger when neighbours are close)
  const edges = [...new Set(bands.flatMap(b => [b.lo, b.hi]).filter(e => isFinite(e) && e > a0 && e < a1))].sort((p, q) => p - q);
  let prev = -99, row = 0;
  const thr = edges.map(e => {
    const x = pos(e);
    row = x - prev < 17 ? (row + 1) % 2 : 0;
    prev = x;
    return `<span class="lb-t lb-t${row}" style="left:${x.toFixed(2)}%">${fedge(e, fmt)}</span>`;
  }).join('');

  // pointers
  const ptr = (v, label, row, cls, rows, extra = '') => {
    const out = v < a0 || v > a1;
    const x = pos(v), al = x < 16 ? ' lb-pl' : x > 84 ? ' lb-pr' : '';
    const txt = `${label ? label + ' ' : ''}${val(v)}${v < a0 ? ' ◀' : v > a1 ? ' ▶' : ''}${extra}`;
    return `<span class="lb-p ${cls}${al}${out ? ' lb-out' : ''}" style="left:${x.toFixed(2)}%"><b class="lb-pt" style="top:${row * 16}px">${esc(txt)}</b><u class="lb-stem" style="top:${row * 16 + 14}px"></u><s class="lb-ar">${cls.includes('lb-p2') ? '◆' : '▼'}</s></span>`;
  };
  let pointers, rowsTop = 1, dots = '';
  const tr = (fn, cls) => trailOf(sim, snap, fn).map((v, i, arr) => `<em class="lb-d ${cls}" style="left:${pos(v).toFixed(2)}%;opacity:${(0.25 + 0.6 * (i + 1) / arr.length).toFixed(2)}"></em>`).join('');
  if (lampKey === 'valuation' && L.parts) {
    const hh = L.parts.house, ee = L.parts.equity, houseTop = hh >= ee;
    rowsTop = 2;
    pointers = ptr(hh, '房价', 0, 'lb-p1' + (houseTop ? ' lb-dec' : ''), 2, houseTop ? ' 决定颜色' : '') +
      ptr(ee, '股票', 1, 'lb-p2' + (houseTop ? '' : ' lb-dec'), 2, houseTop ? '' : ' 决定颜色');
    dots = tr(s => s?.lights?.valuation?.parts?.house, 'lb-d1') + tr(s => s?.lights?.valuation?.parts?.equity, 'lb-d2');
  } else {
    const v = L.value;
    const lv = bandLevel(bands, v);
    pointers = ok(v) ? ptr(v, '', 0, 'lb-p1 lb-dec', 1, lv ? ` ${LV_SYM[lv]}${LV_TXT[lv]}` : '') : '';
    dots = tr(s => s?.lights?.[lampKey]?.value, 'lb-d1');
  }

  // baseline min / max ticks (with year)
  let hist = '', notches = '';
  if (S && S.n > 0 && S.max - S.min > 1e-12) {
    const yr = d => (scen === 'town' ? d : "’" + String(d).slice(2, 4));
    const mk = (v, d, name) => {
      const x = pos(v), al = x > 62 ? 'lb-hr' : '';
      return { notch: `<b class="lb-hm" style="left:${x.toFixed(2)}%"></b>`, lab: `<span class="lb-h ${al}" style="left:${x.toFixed(2)}%"><span>${al ? `${name} ${yr(d)}▲` : `▲${name} ${yr(d)}`}</span></span>` };
    };
    const m1 = mk(S.max, S.dates[S.iMax], '高'), m2 = mk(S.min, S.dates[S.iMin], '低');
    hist = m1.lab + m2.lab; notches = m1.notch + m2.notch;
  }
  return `<div class="lb lb-top${rowsTop}" data-lb="${lampKey}"><div class="lb-pw" style="height:${rowsTop * 16 + 6}px">${pointers}</div>` +
    `<div class="lb-bar">${segs}${dots}${notches}</div><div class="lb-tw">${thr}</div><div class="lb-hw">${hist}</div></div>`;
}

/* ------------------------------------------------------------------ public: compact threshold bar (周期 tab evidence rows) */
// A tiny ruler for ONE condition: a tick at the threshold, the side that counts as "met" tinted + textured, a dot for the current value and
// faint dots for the recent quarters. Pure HTML (spans), styled in assets/css/cycle.css (.tb*). Never throws; returns '' without a usable value/threshold.
//   value, threshold : numbers in the same unit (decimals: 0.05 = 5%)      dir: '>=' | '<='  (which side meets the condition)
//   fmt: 'pp' | 'pct' | 'x'  (only used for the aria text)                 trail: older values, oldest first (up to ~8 are drawn)
//   axis: [lo, hi] optional fixed display range (it is widened to hold the value, threshold and trail)
const tbNum = (v, fmt) => {
  if (!ok(v)) return '—';
  const sg = v < 0 && Math.abs(v) >= (fmt === 'x' ? 0.005 : 0.0005) ? MINUS : '';
  return fmt === 'x' ? sg + Math.abs(v).toFixed(2) + '×' : sg + Math.abs(v * 100).toFixed(1) + (fmt === 'pp' ? 'pp' : '%');
};
export function thresholdBarHtml({ value, threshold, dir = '>=', fmt = 'pct', trail = [], axis = null } = {}) {
  if (!ok(value) || !ok(threshold)) return '';
  const ge = dir !== '<=';
  const tr = (Array.isArray(trail) ? trail : []).filter(ok).slice(-8);
  const vals = [value, threshold, ...tr];
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (Array.isArray(axis) && ok(axis[0]) && ok(axis[1])) { lo = Math.min(lo, axis[0]); hi = Math.max(hi, axis[1]); }
  else {
    let span = hi - lo;
    if (!(span > 1e-9)) span = Math.max(Math.abs(threshold) * 0.5, 0.01);
    lo -= span * 0.2; hi += span * 0.2;
  }
  if (!(hi - lo > 1e-12)) hi = lo + 1;
  const pos = v => Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100));
  const x = pos(threshold);
  const met = ge ? value >= threshold : value <= threshold;
  const mx0 = ge ? x : 0, mw = ge ? 100 - x : x;
  const dots = tr.map((v, i) => `<em class="tb-d" style="left:${pos(v).toFixed(1)}%;opacity:${(0.3 + 0.55 * (i + 1) / tr.length).toFixed(2)}"></em>`).join('');
  const aria = `现值 ${tbNum(value, fmt)}，条件 ${ge ? '≥' : '≤'} ${tbNum(threshold, fmt)}，${met ? '已达标' : '未达标'}` +
    (tr.length ? `；近 ${tr.length} 季 ${tbNum(tr[0], fmt)} 到 ${tbNum(tr[tr.length - 1], fmt)}` : '');
  return `<span class="tb ${met ? 'tb-ok' : 'tb-no'}" role="img" aria-label="${esc(aria)}"><span class="tb-track">` +
    `<i class="tb-met" style="left:${mx0.toFixed(1)}%;width:${mw.toFixed(1)}%"></i>${dots}` +
    `<i class="tb-th" style="left:${x.toFixed(1)}%"></i><b class="tb-now" style="left:${pos(value).toFixed(1)}%"></b></span></span>`;
}

export function wireGauges(container) { /* static graphics: nothing to wire (kept for API stability) */ }
