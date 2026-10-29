// FX lesson panels (「汇率」, src/data/lesson-fx.js). Contract: tools/D-CONTRACT.md, section 「FX」.
//   mountFxPanel(host, spec)  spec = step.panel = { id, ...options }; fills `host` (any block element) with one panel. Returns the root element,
//                             or null for an unknown id. Mounting again replaces the panel that is up (one panel at a time).
//   unmountFxPanel()          removes it (listeners, ResizeObserver, tooltip). Safe to call when nothing is mounted.
// Panels: fx-frame (the map of the five forces), fx-anchor (R² by horizon), fx-pipe (AUD vs the rate gap 2001–2011), fx-prod (JPY 1980–2000),
//         fx-tot (AUD/CNY + rate gap 2001–2025), fx-conf (UK 2022: gilt yield and GBP), fx-calc (the formula calculator; spec.preset 'usdcny'|'audcny').
// Charts are drawn at the host's real pixel width (re-drawn on resize), so labels keep their size on a phone. Colours: one per force (--fx-* in
// assets/css/fx-lab.css); the currency itself is always ink. Every exchange-rate line reads 「往上 = 本币变强」.
import { AUS_Q } from '../data/countries/aus-quarterly.js';
import { CHN_Q } from '../data/countries/chn-quarterly.js';
import { US_Q } from '../data/us-quarterly.js';
import { FX_SPEC, JPY_ANNUAL, UK_MONTHLY, FX_FORCES } from '../data/fx-data.js';

export const FX_PANELS = ['fx-frame', 'fx-anchor', 'fx-pipe', 'fx-prod', 'fx-tot', 'fx-conf', 'fx-calc'];

/* ---------- data helpers (exported for tools/check_lesson_fx.mjs) ---------- */
const QD = { AUS: AUS_Q, CHN: CHN_Q, USA: US_Q };
export const qv = (iso, s, d) => { const D = QD[iso], i = D.dates.indexOf(d); return i < 0 ? null : D.series[s][i]; };
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const qs = y => [1, 2, 3, 4].map(k => `${y}Q${k}`);
export const yearMean = (iso, s, y) => mean(qs(y).map(d => qv(iso, s, d)).filter(v => v != null));
// CNY per AUD = (CNY per USD) / (AUD per USD), quarterly, then the calendar-year mean
export const audcnyYear = y => mean(qs(y).map(d => qv('CHN', 'fxPerUsd', d) / qv('AUS', 'fxPerUsd', d)).filter(Number.isFinite));
const qRange = (from, until) => AUS_Q.dates.slice(AUS_Q.dates.indexOf(from), AUS_Q.dates.indexOf(until) + 1);
const qx = d => +d.slice(0, 4) + (+d[5] - 1) / 4 + 0.125;              // quarter -> decimal year (mid-quarter)
const qLab = d => `${d.slice(0, 4)} 年第 ${'一二三四'[+d[5] - 1]} 季度`;

/* ---------- calculator model ---------- */
// Δs per year (%, + = home currency weaker) = 1.0·dπ − 0.6·di − 0.8·c·dg − tot + rp ; rate after H years = spot·exp(H·Δs/100)
export const CALC_PRESETS = {
  usdcny: { name: '美元/人民币', home: '人民币', foreign: '美国', fccy: '美元', unit: '元人民币', ...FX_SPEC.scen.usdcny,
    def: { infl: -1.2, rate: -1.0, prod: 2.0, tot: 0, conf: 0 }, peer: 'USA' },
  audcny: { name: '澳元/人民币', home: '人民币', foreign: '澳洲', fccy: '澳元', unit: '元人民币', ...FX_SPEC.scen.audcny,
    def: { infl: -1.1, rate: -1.0, prod: 2.0, tot: 0.5, conf: 0 }, peer: 'AUS' },
};
export function fxCalc(p, v, catchUp = true) {
  const R = FX_SPEC.rule, c = catchUp ? FX_SPEC.catchUpG : 1;
  const parts = { infl: R.infl * v.infl, rate: -R.rate * v.rate, prod: -R.prod * c * v.prod, tot: -v.tot, conf: v.conf };
  const perYear = Object.values(parts).reduce((a, b) => a + b, 0);
  return { parts, perYear, rate: p.spot * Math.exp(FX_SPEC.horizon * perYear / 100) };
}
// today's readings next to the sliders (data, not assumptions): 2025 mean CPI, 2025Q4 policy rate, in points
export function todayReadings(peer) {
  return {
    infl: (yearMean('CHN', 'cpiYoY', 2025) - yearMean(peer, 'cpiYoY', 2025)) * 100,
    rate: (qv('CHN', 'policyRate', '2025Q4') - qv(peer, 'policyRate', '2025Q4')) * 100,
  };
}

/* ---------- small DOM / format helpers ---------- */
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = v => (Math.round(v * 10) / 10).toFixed(1), f2 = v => v.toFixed(2);
const sgn = (v, f = f1) => (v > 0.0001 ? '+' : v < -0.0001 ? '−' : '') + f(Math.abs(v));
const NS = 'http://www.w3.org/2000/svg';
const COL = k => `var(--fx-${k})`;
const force = k => FX_FORCES.find(x => x.key === k);

let cur = null;   // { host, root, id, spec, ro, redraw, offs:[] }

export function mountFxPanel(host, spec) {
  unmountFxPanel();
  const id = spec && spec.id;
  if (!host || !PANEL[id]) return null;
  const root = document.createElement('div');
  root.className = 'fxp';
  root.dataset.panel = id;
  host.appendChild(root);
  cur = { host, root, id, spec: spec || {}, ro: null, redraw: null, offs: [], w: 0 };
  PANEL[id](root, cur.spec);
  if (typeof ResizeObserver === 'function') {
    cur.w = root.clientWidth;
    cur.ro = new ResizeObserver(() => { if (cur && Math.abs(root.clientWidth - cur.w) > 2) { cur.w = root.clientWidth; cur.redraw && cur.redraw(); } });
    cur.ro.observe(root);
  }
  return root;
}

export function unmountFxPanel() {
  if (!cur) return;
  if (cur.ro) cur.ro.disconnect();
  cur.offs.forEach(fn => { try { fn(); } catch (e) { /* ignore */ } });
  cur.root.remove();
  cur = null;
}

const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); cur.offs.push(() => el.removeEventListener(ev, fn, opt)); };
const head = (title, sub) => `<h4 class="fxp-h">${esc(title)}</h4>${sub ? `<p class="fxp-sub">${sub}</p>` : ''}`;
const src = t => `<p class="fxp-src">${esc(t)}</p>`;
const svgEl = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (parent) parent.appendChild(e); return e; };
const txt = (parent, x, y, s, cls, anchor = 'start') => { const t = svgEl('text', { x, y, class: cls, 'text-anchor': anchor }, parent); t.textContent = s; return t; };
const lerp = (d0, d1, r0, r1) => v => r0 + (v - d0) / (d1 - d0) * (r1 - r0);

function niceTicks(lo, hi, n = 4) {
  const span = hi - lo || 1, raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(k => k * p).find(s => span / s <= n + 0.5) || 10 * p;
  const t = []; for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) t.push(+v.toFixed(10));
  return t;
}

// table view under a chart (accessibility; dataviz rule: a table exists)
function tableView(cols, rows) {
  return `<details class="fxp-tbl"><summary>数据表</summary><div class="fxp-tblw"><table><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr>` +
    rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') + '</table></div></details>';
}

/* ---------- line chart with a crosshair; charts in one group share it ---------- */
// o = { x:[decimal], series:[{ vals, color, label, fmt, area?, dash? }], h, yFmt, yPad, zero?, bands:[{x0,x1,label}], dots:[{x,y,label,hollow?,dx?,dy?,anchor?}],
//       xTicks:[v], xFmt, xMin?, xMax?, yMin?, yMax?, ariaLabel }
function lineChart(box, o) {
  box.innerHTML = '';
  const W = Math.max(260, box.clientWidth || 320), H = o.h || 160;
  const m = { l: 40, r: 14, t: o.title ? 24 : 10, b: 24 };
  const xs = o.x, xMin = o.xMin ?? xs[0], xMax = o.xMax ?? xs[xs.length - 1];
  const all = o.series.flatMap(s => s.vals).concat((o.dots || []).map(d => d.y)).filter(v => v != null && Number.isFinite(v));
  let yLo = o.yMin ?? Math.min(...all), yHi = o.yMax ?? Math.max(...all);
  if (o.zero) { yLo = Math.min(yLo, 0); yHi = Math.max(yHi, 0); }
  const pad = (yHi - yLo) * (o.yPad ?? 0.08); yLo -= o.yMin != null ? 0 : pad; yHi += o.yMax != null ? 0 : pad;
  const X = lerp(xMin, xMax, m.l, W - m.r), Y = lerp(yLo, yHi, H - m.b, m.t);
  const svg = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'fxp-svg', role: 'img', 'aria-label': o.ariaLabel || '' }, box);
  if (o.title) txt(svg, 4, 13, o.title, 'fxp-ctitle');
  for (const b of o.bands || []) {
    svgEl('rect', { x: X(b.x0), y: m.t, width: Math.max(2, X(b.x1) - X(b.x0)), height: H - m.b - m.t, class: 'fxp-band' + (b.soft ? ' soft' : ''), style: b.color ? `fill:${b.color}` : '' }, svg);
    if (b.label) txt(svg, X(b.x0) + 3, m.t + 12, b.label, 'fxp-bandlab');
  }
  for (const v of niceTicks(yLo, yHi, o.yTicks || 4)) {
    svgEl('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: v === 0 && o.zero ? 'fxp-zero' : 'fxp-grid' }, svg);
    txt(svg, m.l - 6, Y(v) + 4, (o.yFmt || f1)(v), 'fxp-ax', 'end');
  }
  for (const v of o.xTicks || []) {
    if (v < xMin || v > xMax) continue;
    svgEl('line', { x1: X(v), x2: X(v), y1: H - m.b, y2: H - m.b + 4, class: 'fxp-tick' }, svg);
    txt(svg, X(v), H - 6, (o.xFmt || String)(v), 'fxp-ax', 'middle');
  }
  svgEl('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: 'fxp-base' }, svg);
  for (const s of o.series) {
    const pts = s.vals.map((v, i) => (v == null ? null : [X(xs[i]), Y(v)]));
    let d = '', open = false;
    pts.forEach(p => { if (!p) { open = false; return; } d += (open ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1); open = true; });
    if (s.area) {
      const f = pts.filter(Boolean);
      const y0 = Y(Math.max(yLo, Math.min(yHi, 0)));
      svgEl('path', { d: `M${f[0][0]},${y0}` + f.map(p => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('') + `L${f[f.length - 1][0]},${y0}Z`, class: 'fxp-area', style: `fill:${s.color}` }, svg);
    }
    svgEl('path', { d, class: 'fxp-line' + (s.dash ? ' dash' : ''), style: `stroke:${s.color}` }, svg);
  }
  for (const dt of o.dots || []) {
    svgEl('circle', { cx: X(dt.x), cy: Y(dt.y), r: 4.5, class: 'fxp-dot' + (dt.hollow ? ' hollow' : ''), style: `${dt.hollow ? 'stroke' : 'fill'}:${dt.color || 'var(--text)'}` }, svg);
    if (dt.label) {
      let x = X(dt.x) + (dt.dx ?? 0), anchor = dt.anchor || 'middle';
      if (anchor === 'middle') { const half = dt.label.length * 3.6; x = Math.max(m.l + half, Math.min(W - m.r - half, x)); }
      txt(svg, x, Y(dt.y) + (dt.dy ?? -9), dt.label, 'fxp-lab', anchor);
    }
  }
  const cross = svgEl('g', { class: 'fxp-cross', display: 'none' }, svg);
  const vline = svgEl('line', { y1: m.t, y2: H - m.b, class: 'fxp-vline' }, cross);
  const marks = o.series.map(s => svgEl('circle', { r: 4, class: 'fxp-mark', style: `fill:${s.color}` }, cross));
  return {
    svg, o,
    idxAt(clientX) {
      const r = svg.getBoundingClientRect(), px = clientX - r.left;
      let best = 0, bd = 1e9; xs.forEach((x, i) => { const dd = Math.abs(X(x) - px); if (dd < bd) { bd = dd; best = i; } });
      return best;
    },
    showAt(i) {
      cross.setAttribute('display', 'inline');
      vline.setAttribute('x1', X(xs[i])); vline.setAttribute('x2', X(xs[i]));
      o.series.forEach((s, k) => { const v = s.vals[i]; marks[k].setAttribute('display', v == null ? 'none' : 'inline'); if (v != null) { marks[k].setAttribute('cx', X(xs[i])); marks[k].setAttribute('cy', Y(v)); } });
    },
    hide() { cross.setAttribute('display', 'none'); },
  };
}

// one tooltip per panel; `rows(i)` -> [{ color, label, value }]
function hoverGroup(root, charts, title, rows) {
  let tip = root.querySelector('.fxp-tip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'fxp-tip'; tip.hidden = true; root.appendChild(tip); }
  const show = (e, i) => {
    charts.forEach(c => c.showAt(i));
    tip.innerHTML = `<b>${esc(title(i))}</b>` + rows(i).map(r => `<div><i style="background:${r.color}"></i>${esc(r.label)} <b>${esc(r.value)}</b></div>`).join('');
    tip.hidden = false;
    const rr = root.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = e.clientX - rr.left + 14, y = e.clientY - rr.top + root.scrollTop - th - 12;
    if (x + tw > rr.width - 4) x = e.clientX - rr.left - tw - 14;
    if (y < root.scrollTop + 2) y = e.clientY - rr.top + root.scrollTop + 16;
    tip.style.left = Math.max(4, x) + 'px'; tip.style.top = y + 'px';
  };
  const hide = () => { charts.forEach(c => c.hide()); tip.hidden = true; };
  charts.forEach(c => {
    on(c.svg, 'pointermove', e => show(e, c.idxAt(e.clientX)));
    on(c.svg, 'pointerdown', e => show(e, c.idxAt(e.clientX)));
    on(c.svg, 'pointerleave', e => { if (e.pointerType === 'mouse') hide(); });
  });
  return hide;
}

// shared layout: a panel = header + chart boxes + source; charts drawn by `draw()` (again on resize)
function chartPanel(root, html, draw) {
  root.innerHTML = html;
  const run = () => { root.querySelectorAll('.fxp-tip').forEach(t => { t.hidden = true; }); draw(); };
  cur.redraw = run;
  run();
}

/* ======================================================================================================== panels */
const PANEL = {};

/* ---------- 0. the map: five forces, their direction, strength, time scale ---------- */
PANEL['fx-frame'] = (root) => {
  const coef = { infl: '+1.46（公式取 1.0）', rate: '−0.62（取 0.6）', prod: '−0.82（取 0.8；中国再 ×0.3）', tot: '没拟合（k）', conf: '没拟合（RP）' };
  root.innerHTML = head('五根水管推一道闸', '汇率 = 国境线上的闸。谁推、往哪推、推多大劲、多久见效：') +
    `<div class="fxp-formula">Δs ≈ <span style="color:${COL('infl')}">1.0·(π−π*)</span> − <span style="color:${COL('rate')}">0.6·(i−i*)</span> − <span style="color:${COL('prod')}">0.8·(g−g*)</span> − <span style="color:${COL('tot')}">k·ΔToT</span> + <span style="color:${COL('conf')}">RP</span><small>s 变大 = 本币变弱；带 * 的是外国；每项按每年算</small></div>` +
    `<div class="fxp-tblw"><table class="fxp-map"><tr><th>水管</th><th>往哪边推</th><th>劲多大（5 年拟合）</th><th>多久见效</th></tr>` +
    FX_FORCES.map(f => `<tr><td><i class="fxp-sw" style="background:${COL(f.key)}"></i><b>${esc(f.name)}</b> <span class="fxp-sym">${esc(f.sym)}</span><span class="fxp-step">第 ${f.step} 步</span></td><td>${esc(f.push)}</td><td>${esc(coef[f.key])}</td><td>${esc(f.when)}</td></tr>`).join('') +
    `</table></div><div class="fxp-scale" aria-label="时间尺：谁在哪个时间尺度上管用"></div>` +
    `<p class="fxp-note">经常账户（进出口差）在回归里几乎没作用（系数 ≈ 0）。储备货币（第 6 步）= 美元的 RP 特别低。</p>` +
    src(FX_SPEC.source + '；5 年模型 R² ' + FX_SPEC.r2Full5y);
  const box = root.querySelector('.fxp-scale');
  const draw = () => {
    box.innerHTML = '';
    const W = Math.max(260, box.clientWidth || 320), H = 108, l = 12, r = W - 12;
    const svg = svgEl('svg', { width: W, height: H, class: 'fxp-svg' }, box);
    const ticks = ['几周', '几个季度', '几年', '十年', '几十年'];
    const X = k => l + k / (ticks.length - 1) * (r - l);
    svgEl('line', { x1: l, x2: r, y1: 62, y2: 62, class: 'fxp-base' }, svg);
    ticks.forEach((t, k) => { svgEl('line', { x1: X(k), x2: X(k), y1: 58, y2: 66, class: 'fxp-tick' }, svg); txt(svg, X(k), 82, t, 'fxp-ax', k === 0 ? 'start' : k === ticks.length - 1 ? 'end' : 'middle'); });
    // position on the time scale (0..4) and label row
    const pos = { conf: [0, 0], rate: [1.3, 1], tot: [2, 0], prod: [3, 1], infl: [4, 0] };
    FX_FORCES.forEach(f => {
      const [k, row] = pos[f.key], x = X(k), y = row ? 40 : 18;
      svgEl('line', { x1: x, x2: x, y1: y + 4, y2: 62, class: 'fxp-stem', style: `stroke:${COL(f.key)}` }, svg);
      svgEl('circle', { cx: x, cy: 62, r: 5, class: 'fxp-dot', style: `fill:${COL(f.key)}` }, svg);
      txt(svg, x, y, f.name, 'fxp-lab', k === 0 ? 'start' : k === 4 ? 'end' : 'middle');
    });
    txt(svg, (l + r) / 2, 102, '← 短期　　见效的时间　　长期 →', 'fxp-ax', 'middle');
  };
  cur.redraw = draw; draw();
};

/* ---------- 1. the anchor: R² of the inflation gap by horizon ---------- */
PANEL['fx-anchor'] = (root) => {
  const R = FX_SPEC.r2;
  chartPanel(root,
    head('看得越长，汇率越听通胀差的', `R² = 通胀差能解释汇率变化的比例。<b>1 年 ${f2(R[0].r2)}</b>，<b>40 年 ${f2(R[5].r2)}</b>。`) +
    `<div class="fxp-chart" data-c="bars"></div>` +
    `<div class="fxp-res" aria-label="两个漏水的水库"></div>` +
    tableView(['看多长', 'R²'], R.map(x => [`${x.h} 年`, f2(x.r2)])) +
    src(FX_SPEC.source + '；每段时间不重叠'),
    () => {
      const box = root.querySelector('[data-c="bars"]');
      box.innerHTML = '';
      const W = Math.max(260, box.clientWidth || 320), H = 200, m = { l: 34, r: 8, t: 30, b: 26 };
      const svg = svgEl('svg', { width: W, height: H, class: 'fxp-svg', role: 'img', 'aria-label': 'R² 按时间长度：' + R.map(x => `${x.h}年 ${x.r2}`).join('，') }, box);
      const Y = lerp(0, 1, H - m.b, m.t), slot = (W - m.l - m.r) / R.length, bw = Math.min(56, slot * 0.62);
      [0, 0.25, 0.5, 0.75, 1].forEach(v => { svgEl('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: 'fxp-grid' }, svg); txt(svg, m.l - 6, Y(v) + 4, v.toFixed(2).replace(/0$/, ''), 'fxp-ax', 'end'); });
      const bars = [];
      R.forEach((x, k) => {
        const cx = m.l + slot * (k + 0.5), y = Y(x.r2), h = Y(0) - y, rr = Math.min(4, h / 2);
        const p = svgEl('path', { d: `M${cx - bw / 2},${Y(0)}V${y + rr}Q${cx - bw / 2},${y} ${cx - bw / 2 + rr},${y}H${cx + bw / 2 - rr}Q${cx + bw / 2},${y} ${cx + bw / 2},${y + rr}V${Y(0)}Z`, class: 'fxp-bar', style: `fill:${COL('infl')}` }, svg);
        txt(svg, cx, y - 5, f2(x.r2), 'fxp-lab', 'middle');
        txt(svg, cx, H - 8, `${x.h} 年`, 'fxp-ax', 'middle');
        bars.push(p);
      });
      svgEl('line', { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), class: 'fxp-base' }, svg);
      txt(svg, m.l + slot, 12, '← 短期：几乎不管用', 'fxp-bandlab', 'middle');
      txt(svg, m.l + slot * 5, 12, '长期：锚 →', 'fxp-bandlab', 'middle');
      // hover: per-bar tooltip
      let tip = root.querySelector('.fxp-tip'); if (!tip) { tip = document.createElement('div'); tip.className = 'fxp-tip'; tip.hidden = true; root.appendChild(tip); }
      bars.forEach((p, k) => {
        const showTip = e => { const rr = root.getBoundingClientRect(); tip.innerHTML = `<b>看 ${R[k].h} 年的变化</b><div><i style="background:${COL('infl')}"></i>通胀差能解释 <b>${Math.round(R[k].r2 * 100)}%</b></div>`; tip.hidden = false; tip.style.left = Math.min(rr.width - tip.offsetWidth - 4, Math.max(4, e.clientX - rr.left + 12)) + 'px'; tip.style.top = (e.clientY - rr.top + root.scrollTop - tip.offsetHeight - 10) + 'px'; bars.forEach((b, j) => b.classList.toggle('dim', j !== k)); };
        on(p, 'pointermove', showTip); on(p, 'pointerdown', showTip);
        on(p, 'pointerleave', () => { tip.hidden = true; bars.forEach(b => b.classList.remove('dim')); });
      });
      drawReservoirs(root.querySelector('.fxp-res'));
    });
};

// two reservoirs leaking at different rates: water = what one unit of money buys; the level ratio is where the exchange rate is anchored
function drawReservoirs(box) {
  box.innerHTML = '';
  const W = Math.max(260, box.clientWidth || 320), H = 172, tw = Math.min(120, W * 0.3);
  const svg = svgEl('svg', { width: W, height: H, class: 'fxp-svg' }, box);
  const tank = (cx, lvl, drops, name, sub) => {
    const x = cx - tw / 2, top = 22, bot = 104;
    svgEl('rect', { x, y: top + (bot - top) * (1 - lvl), width: tw, height: (bot - top) * lvl, class: 'fxp-water' }, svg);
    svgEl('path', { d: `M${x},${top}V${bot}H${x + tw}V${top}`, class: 'fxp-tank' }, svg);
    for (let k = 0; k < drops; k++) svgEl('path', { d: `M${cx - 2 + k * 9 - (drops - 1) * 4.5},${bot + 6 + k % 2 * 6} q2,4 0,6 q-2,-2 0,-6z`, class: 'fxp-drop', style: `fill:${COL('infl')}` }, svg);
    txt(svg, cx, 15, name, 'fxp-lab', 'middle');
    txt(svg, cx, 138, sub, 'fxp-ax', 'middle');
  };
  tank(W * 0.27, 0.38, 4, '通胀高的国家', '漏得快 → 钱越来越不值钱');
  tank(W * 0.73, 0.78, 1, '通胀低的国家', '漏得慢');
  txt(svg, W / 2, H - 6, '水位 = 一块钱能买多少东西；两边水位之比 ≈ 长期汇率', 'fxp-ax', 'middle');
}

/* ---------- 2. the capital pipe: AUD vs the rate gap, 2001–2011 ---------- */
PANEL['fx-pipe'] = (root, spec) => {
  const dates = qRange(spec.from || '2001Q1', spec.until || '2011Q4'), x = dates.map(qx);
  const aud = dates.map(d => 1 / qv('AUS', 'fxPerUsd', d));
  const gap = dates.map(d => (qv('AUS', 'policyRate', d) - qv('USA', 'policyRate', d)) * 100);
  const lo = dates.indexOf('2001Q3'), hi = dates.indexOf('2011Q2'), q8 = dates.indexOf('2008Q4');
  const years = []; for (let y = Math.ceil(x[0]); y <= x[x.length - 1]; y += 2) years.push(y);
  chartPanel(root,
    head('利差这根水管，把澳元推上去', '上：1 澳元换多少美元（往上 = 澳元强）。下：利差，澳洲政策利率减美国。') +
    `<div class="fxp-chart" data-c="a"></div><div class="fxp-chart" data-c="b"></div>` +
    tableView(['季度', '1 澳元换美元', '利差（个点）'], dates.map((d, i) => [d, f2(aud[i]), f1(gap[i])])) +
    src('澳元/美元：FRED（季度平均）；政策利率：澳联储（BIS）、美国联邦基金利率（季度平均）'),
    () => {
      const a = lineChart(root.querySelector('[data-c="a"]'), { x, h: 220, title: '1 澳元换多少美元', series: [{ vals: aud, color: 'var(--text)', label: '1 澳元换美元' }], yFmt: f1, xTicks: years,
        bands: q8 >= 0 ? [{ x0: x[q8] - 0.125, x1: x[q8] + 0.125, label: '恐慌' }] : [],
        dots: [lo >= 0 && { x: x[lo], y: aud[lo], label: f2(aud[lo]), dy: 4, dx: 9, anchor: 'start' }, hi >= 0 && { x: x[hi], y: aud[hi], label: f2(aud[hi]), dy: -9, anchor: 'end', dx: -6 }].filter(Boolean),
        ariaLabel: '1 澳元换多少美元，2001–2011 年' });
      const b = lineChart(root.querySelector('[data-c="b"]'), { x, h: 150, title: '利差：澳洲 − 美国（个点）', zero: true, series: [{ vals: gap, color: COL('rate'), label: '利差', area: true }], yFmt: v => f1(v).replace('.0', ''), xTicks: years,
        bands: q8 >= 0 ? [{ x0: x[q8] - 0.125, x1: x[q8] + 0.125 }] : [], ariaLabel: '澳洲减美国的政策利率差，个点' });
      hoverGroup(root, [a, b], i => qLab(dates[i]), i => [
        { color: 'var(--text)', label: '1 澳元 =', value: f2(aud[i]) + ' 美元' },
        { color: COL('rate'), label: '利差', value: sgn(gap[i]) + ' 个点' }]);
    });
};

/* ---------- 3. productivity: JPY 1980–2000 ---------- */
PANEL['fx-prod'] = (root) => {
  const ys = JPY_ANNUAL.years, v = JPY_ANNUAL.jpyPerUsd.map(j => 100 / j);
  const i85 = ys.indexOf(1985), i95 = ys.indexOf(1995);
  chartPanel(root,
    head(`日元十年变成 ${(JPY_ANNUAL.jpyPerUsd[i85] / JPY_ANNUAL.jpyPerUsd[i95]).toFixed(1)} 倍`, '100 日元换多少美元（年平均；往上 = 日元强）。绿色一段：1985–1995。') +
    `<div class="fxp-chart" data-c="a"></div>` +
    `<p class="fxp-note"><i class="fxp-sw" style="background:${COL('prod')}"></i>这一段日本工厂的效率涨得比美国快；1985 年 9 月的广场协议和更低的通胀也在推。</p>` +
    tableView(['年', '1 美元换日元', '100 日元换美元'], ys.map((y, i) => [y, JPY_ANNUAL.jpyPerUsd[i].toFixed(0), f2(v[i])])) +
    src(JPY_ANNUAL.source),
    () => {
      const a = lineChart(root.querySelector('[data-c="a"]'), { x: ys, h: 240, title: '100 日元换多少美元', series: [{ vals: v, color: 'var(--text)', label: '100 日元换美元' }], yFmt: f1, yMin: 0, xTicks: [1980, 1985, 1990, 1995, 2000],
        bands: [{ x0: 1985, x1: 1995, color: COL('prod'), soft: true }],
        dots: [{ x: 1985, y: v[i85], label: `1985：1 美元 = ${JPY_ANNUAL.jpyPerUsd[i85].toFixed(0)} 日元`, dy: 20, anchor: 'start', dx: 4 }, { x: 1995, y: v[i95], label: `1995：${JPY_ANNUAL.jpyPerUsd[i95].toFixed(0)} 日元`, dy: -12 }],
        ariaLabel: '100 日元换多少美元，1980–2000 年' });
      hoverGroup(root, [a], i => `${ys[i]} 年（全年平均）`, i => [
        { color: 'var(--text)', label: '100 日元 =', value: f2(v[i]) + ' 美元' },
        { color: 'var(--muted)', label: '1 美元 =', value: JPY_ANNUAL.jpyPerUsd[i].toFixed(0) + ' 日元' }]);
    });
};

/* ---------- 4. terms of trade: AUD/CNY 2001–2025 (+ spec reference values) and the rate gap ---------- */
PANEL['fx-tot'] = (root) => {
  const ys = []; for (let y = 2001; y <= 2025; y++) ys.push(y);
  const ac = ys.map(audcnyYear), gap = ys.map(y => (yearMean('AUS', 'policyRate', y) - yearMean('USA', 'policyRate', y)) * 100);
  const xs = ys.map(y => y + 0.5);
  chartPanel(root,
    head('铁矿石贵，澳元就强', '上：1 澳元换多少人民币（年平均；往上 = 澳元强）。线 = 数据算的，圆圈 = 本课设定的参照值。下：利差，澳洲减美国。') +
    `<div class="fxp-legend"><span><i class="fxp-ln"></i>数据算的（澳元兑美元 × 美元兑人民币）</span><span><i class="fxp-ring" style="border-color:${COL('tot')}"></i>设定值</span></div>` +
    `<div class="fxp-chart" data-c="a"></div><div class="fxp-chart" data-c="b"></div>` +
    tableView(['年', '1 澳元换人民币', '利差（个点）'], ys.map((y, i) => [y, f2(ac[i]), f1(gap[i])])) +
    src('澳元/美元、人民币/美元：FRED（季度平均 → 年平均）；设定值：本课 spec（2026-10）；铁矿石价格不在本项目数据里'),
    () => {
      const ticks = [2001, 2006, 2011, 2016, 2021, 2026];
      const a = lineChart(root.querySelector('[data-c="a"]'), { x: xs, xMin: 2001, xMax: 2027.2, h: 210, title: '1 澳元换多少人民币', series: [{ vals: ac, color: 'var(--text)', label: '1 澳元换人民币' }], yFmt: f1, xTicks: ticks,
        dots: FX_SPEC.audcnyRef.map((r, k) => ({ x: r.at + (k < 2 ? 0.5 : 0), y: r.v, hollow: true, color: COL('tot'), label: r.label, dy: k === 0 ? 20 : -10, anchor: k === 2 ? 'end' : 'middle', dx: k === 2 ? 4 : 0 })),
        ariaLabel: '1 澳元换多少人民币，2001–2025 年，年平均' });
      const b = lineChart(root.querySelector('[data-c="b"]'), { x: xs, xMin: 2001, xMax: 2027.2, h: 140, title: '利差：澳洲 − 美国（个点）', zero: true, series: [{ vals: gap, color: COL('rate'), label: '利差', area: true }], yFmt: v => f1(v).replace('.0', ''), xTicks: ticks, ariaLabel: '利差，澳洲减美国，个点' });
      hoverGroup(root, [a, b], i => `${ys[i]} 年（全年平均）`, i => [
        { color: 'var(--text)', label: '1 澳元 =', value: f2(ac[i]) + ' 元人民币' },
        { color: COL('rate'), label: '利差', value: sgn(gap[i]) + ' 个点' }]);
    });
};

/* ---------- 5. confidence: UK 2022 ---------- */
PANEL['fx-conf'] = (root) => {
  const M = UK_MONTHLY, x = M.months.map(m => +m.slice(0, 4) + (+m.slice(5) - 1) / 12);
  const mx = m => x[M.months.indexOf(m)];
  const ticks = [2021.5, 2022, 2022.5, 2023, 2023.5];
  const tfmt = v => (v % 1 ? `${Math.floor(v)}-07` : `${v}-01`);
  const i8 = M.months.indexOf('2022-08'), i9 = M.months.indexOf('2022-09');
  chartPanel(root,
    head('利率跳涨，英镑反而急跌：信心漏了', '上：英国 10 年期国债利率（%）。下：1 英镑换多少美元（往上 = 英镑强）。月平均。') +
    `<div class="fxp-chart" data-c="a"></div><div class="fxp-chart" data-c="b"></div>` +
    `<p class="fxp-note"><b>读法</b>：浅色一段（2022 上半年）利率慢慢涨、英镑慢慢弱 → 多半是利差（美国加息更快）。深色一段（2022 年 9–10 月）利率跳涨、英镑同时急跌 → 信心。</p>` +
    tableView(['月', '10 年期国债利率 %', '1 英镑换美元'], M.months.map((m, i) => [m, f2(M.gilt10y[i]), f2(M.usdPerGbp[i])])) +
    src(M.source),
    () => {
      const bands = [{ x0: mx('2022-01'), x1: mx('2022-06') + 1 / 12, color: COL('rate'), soft: true, label: '利差' }, { x0: mx('2022-09'), x1: mx('2022-10') + 1 / 12, color: COL('conf'), label: '减税预算' }];
      const a = lineChart(root.querySelector('[data-c="a"]'), { x, h: 190, title: '英国 10 年期国债利率', series: [{ vals: M.gilt10y, color: COL('conf'), label: '10 年期国债利率' }], yFmt: v => v.toFixed(0) + '%', yMin: 0, xTicks: ticks, xFmt: tfmt, bands,
        dots: [{ x: x[i8], y: M.gilt10y[i8], label: f1(M.gilt10y[i8]) + '%', dy: 16, color: COL('conf') }, { x: x[i9], y: M.gilt10y[i9], label: f1(M.gilt10y[i9]) + '%', dx: -7, anchor: 'end', dy: -2, color: COL('conf') }],
        ariaLabel: '英国 10 年期国债利率，月平均' });
      const b = lineChart(root.querySelector('[data-c="b"]'), { x, h: 170, title: '1 英镑换多少美元', series: [{ vals: M.usdPerGbp, color: 'var(--text)', label: '1 英镑换美元' }], yFmt: f2, xTicks: ticks, xFmt: tfmt, bands: bands.map(bb => ({ ...bb, label: '' })),
        dots: [{ x: x[i8], y: M.usdPerGbp[i8], label: f2(M.usdPerGbp[i8]), dy: -9 }, { x: x[i9], y: M.usdPerGbp[i9], label: f2(M.usdPerGbp[i9]), dy: 18 }],
        ariaLabel: '1 英镑换多少美元，月平均' });
      hoverGroup(root, [a, b], i => M.months[i], i => [
        { color: COL('conf'), label: '10 年期国债', value: f2(M.gilt10y[i]) + '%' },
        { color: 'var(--text)', label: '1 英镑 =', value: f2(M.usdPerGbp[i]) + ' 美元' }]);
    });
};

/* ---------- 6. the calculator ---------- */
const SLIDERS = [
  { key: 'infl', min: -4, max: 4, step: 0.1, lab: p => `通胀：中国比${p.foreign}高`, unit: '个点/年' },
  { key: 'rate', min: -5, max: 5, step: 0.1, lab: p => `政策利率：中国比${p.foreign}高`, unit: '个点' },
  { key: 'prod', min: -3, max: 5, step: 0.1, lab: p => `生产率增长：中国比${p.foreign}快`, unit: '个点/年' },
  { key: 'tot', min: -3, max: 3, step: 0.1, lab: p => `贸易条件：对人民币有利（k·ΔToT）${p.peer === 'AUS' ? '；铁矿石变便宜 → 往右' : ''}`, unit: '%/年' },
  { key: 'conf', min: -3, max: 3, step: 0.1, lab: () => '信心：对人民币没信心（RP）', unit: '%/年' },
];
PANEL['fx-calc'] = (root, spec) => {
  const st = { preset: CALC_PRESETS[spec.preset] ? spec.preset : 'usdcny', v: null, catchUp: true };
  const load = k => { st.preset = k; st.v = { ...CALC_PRESETS[k].def }; };
  load(st.preset);
  const build = () => {
    const p = CALC_PRESETS[st.preset], today = todayReadings(p.peer);
    root.innerHTML = head('计算器：10 年后的汇率', `本币 = 人民币。拖滑块，看每根水管推多少。<b>默认值是假设</b>，让结果落在研究的基准附近。`) +
      `<div class="fxp-seg" role="group" aria-label="情景">${Object.entries(CALC_PRESETS).map(([k, q]) => `<button type="button" data-preset="${k}" aria-pressed="${k === st.preset}">${esc(q.name)}</button>`).join('')}</div>` +
      `<div class="fxp-out"><div class="fxp-big">10 年后：1 ${esc(p.fccy)} ≈ <b data-o="rate"></b> ${esc(p.unit)}</div><div class="fxp-per" data-o="per"></div><div class="fxp-chart" data-c="scale"></div></div>` +
      `<div class="fxp-sliders">${SLIDERS.map(s => {
        const f = force(s.key), td = today[s.key];
        return `<div class="fxp-sl" data-k="${s.key}"><div class="fxp-sl-top"><i class="fxp-sw" style="background:${COL(s.key)}"></i><label for="fxs-${s.key}">${esc(f.name)} <span class="fxp-sym">${esc(f.sym)}</span><br><small>${esc(s.lab(p))}</small></label><b data-o="v-${s.key}"></b></div>` +
          `<input id="fxs-${s.key}" type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${st.v[s.key]}" data-s="${s.key}">` +
          `<div class="fxp-sl-bot"><span>${td != null ? `今天的读数 ${sgn(td)}` : s.key === 'prod' ? '没有数据，只能假设' : '没拟合，直接拖效果'}</span><span class="fxp-ctr"><span class="fxp-ctr-bar"><i data-o="bar-${s.key}" style="background:${COL(s.key)}"></i></span><span data-o="c-${s.key}"></span></span></div></div>`;
      }).join('')}</div>` +
      `<label class="fxp-chk"><input type="checkbox" data-catch ${st.catchUp ? 'checked' : ''}> 追赶型经济（中国）：g 的系数 × ${FX_SPEC.catchUpG}</label>` +
      `<p class="fxp-note">每行右边 = 这根水管每年推多少：<b>往左 = 人民币变强</b>，往右 = 变弱。</p>` +
      `<p class="fxp-warn"><b>粗算。</b>系数 1.0 / 0.6 / 0.8 是 5 年回归（${sgn(FX_SPEC.fit5y.infl, f2)} / ${sgn(FX_SPEC.fit5y.rate, f2)} / ${sgn(FX_SPEC.fit5y.prod, f2)}）的取整；全部放进去 R² 也只有 ${FX_SPEC.r2Full5y}，看 1 年通胀差只解释 ${FX_SPEC.r2[0].r2}。看方向和量级，别当预测。</p>` +
      `<p class="fxp-src">今天的读数：通胀 = 2025 年平均 CPI 比一年前的涨幅之差；利率 = 2025 年第四季度政策利率之差（中国用央行贷款基准利率）。情景：研究 ${esc(FX_SPEC.asOf)}。</p>`;
    on(root.querySelector('.fxp-seg'), 'click', e => { const b = e.target.closest('[data-preset]'); if (b && b.dataset.preset !== st.preset) { load(b.dataset.preset); build(); } });
    root.querySelectorAll('input[data-s]').forEach(inp => on(inp, 'input', () => { st.v[inp.dataset.s] = +inp.value; update(); }));
    on(root.querySelector('[data-catch]'), 'change', e => { st.catchUp = e.target.checked; update(); });
    update();
  };
  const update = () => {
    const p = CALC_PRESETS[st.preset], r = fxCalc(p, st.v, st.catchUp);
    const set = (k, s) => { const el = root.querySelector(`[data-o="${k}"]`); if (el) el.textContent = s; };
    set('rate', f2(r.rate));
    const total = (Math.exp(FX_SPEC.horizon * r.perYear / 100) - 1) * 100;
    set('per', Math.abs(r.perYear) < 0.05 ? '人民币基本不动' : `人民币每年${r.perYear < 0 ? '变强' : '变弱'} ${f1(Math.abs(r.perYear))}%（10 年合计 ${sgn(total)}%：${esc(p.fccy)}${r.perYear < 0 ? '能换的人民币变少' : '能换的人民币变多'}）`);
    const maxAbs = 2.5;
    for (const s of SLIDERS) {
      set('v-' + s.key, sgn(st.v[s.key]) + ' ' + s.unit);
      const c = r.parts[s.key];
      set('c-' + s.key, `${sgn(c)}%/年`);
      const bar = root.querySelector(`[data-o="bar-${s.key}"]`);
      if (bar) { const w = Math.min(50, Math.abs(c) / maxAbs * 50); bar.style.width = w + '%'; bar.style.left = (c < 0 ? 50 - w : 50) + '%'; }
    }
    drawScale(root.querySelector('[data-c="scale"]'), p, r.rate);
  };
  cur.redraw = () => update();
  build();
};

// the result on one axis: research range (band), research mid, today's spot, your result. Smaller number = stronger CNY.
function drawScale(box, p, res) {
  if (!box) return;
  box.innerHTML = '';
  const W = Math.max(260, box.clientWidth || 320), H = 96, l = 16, r = W - 16;
  const lo = Math.min(p.lo, p.spot, res), hi = Math.max(p.hi, p.spot, res), pad = (hi - lo) * 0.1;
  const X = lerp(lo - pad, hi + pad, l, r);
  const svg = svgEl('svg', { width: W, height: H, class: 'fxp-svg', role: 'img', 'aria-label': `研究区间 ${p.lo}–${p.hi}，基准 ${p.mid}，现在 ${p.spot}，你的结果 ${res.toFixed(2)}` }, box);
  svgEl('rect', { x: X(p.lo), y: 26, width: X(p.hi) - X(p.lo), height: 12, rx: 4, class: 'fxp-range' }, svg);
  for (const v of [p.lo, p.hi]) if (Math.abs(X(v) - X(p.spot)) > 24) txt(svg, X(v), 52, f1(v), 'fxp-ax', 'middle');   // a range end right under the spot marker is dropped
  svgEl('line', { x1: X(p.mid), x2: X(p.mid), y1: 22, y2: 42, class: 'fxp-midtick' }, svg);
  txt(svg, X(p.mid), 15, `研究基准 ${f1(p.mid)}`, 'fxp-ax', 'middle');
  svgEl('path', { d: `M${X(p.spot)},42 l-5,9 h10z`, class: 'fxp-spot' }, svg);
  const sx = X(p.spot), right = sx > (l + r) / 2;
  txt(svg, sx + (right ? -8 : 8), 66, `现在 ${f2(p.spot)}`, 'fxp-ax', right ? 'end' : 'start');
  svgEl('circle', { cx: X(res), cy: 32, r: 7, class: 'fxp-res-dot' }, svg);
  txt(svg, l, 90, '← 人民币强', 'fxp-ax'); txt(svg, r, 90, '人民币弱 →', 'fxp-ax', 'end');
  txt(svg, (l + r) / 2, 90, '● 你的结果', 'fxp-ax', 'middle');
}
