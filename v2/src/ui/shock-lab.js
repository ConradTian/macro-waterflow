// Shock lesson panels (L2 「水的问题，还是河道的问题」, src/data/lesson-shocks.js). Contract: tools/D-CONTRACT.md, section 「冲击」.
//   mountShockPanel(host, spec)  spec = step.panel = { id, ...options }; appends one div.skp[data-panel=id] to `host`. Returns it, or null for an
//                                unknown id. One panel at a time: mounting again unmounts the previous one first.
//   unmountShockPanel()          removes it (listeners, ResizeObserver). Safe to call twice.
// Panels: shk-rule (the four corners + the six parts), shk-quad (the event quadrant; spec.group 'modern'|'war', spec.select = event id),
//         shk-lines (三条线: Japan's straight line bends = permanent; the US waves = water), shk-parts (event x part table, all judgement).
// Every panel opens an event card (cardHtml) on tap. The panels never touch the sim, the diagram or the URL: they read only
// src/data/shock-events.js (generated from the raw data), src/data/lesson-shocks.js (cards) and src/data/waves.js.
// Colours: water (demand) = --c-credit, channel (supply) = --c-housing (river-bank earth), both = --c-fiscal; one colour per part in the table.
import { SHOCK_EVENTS, SHOCK_META } from '../data/shock-events.js';
import { SHOCK_CARDS, SHOCK_PARTS, SHOCK_CORNERS, SHOCK_GROUPS } from '../data/lesson-shocks.js';
import { WAVES } from '../data/waves.js';

export const SHOCK_PANELS = ['shk-rule', 'shk-quad', 'shk-lines', 'shk-parts'];
export const eventById = id => SHOCK_EVENTS.find(e => e.id === id) || null;
export const cardById = id => SHOCK_CARDS.find(c => c.id === id) || null;
// short names on the chart
export const SHORT = { ww1: '一战', gd: '大萧条', r37: '1937 收水', ww2: '二战', b1: 'B1 溢出', oil73: '1973 石油', oil79: '1979 石油', volcker: '沃尔克',
  net: '互联网', gfc: '2008', covid: '疫情', ukr: '德国 2022', chn: '中国' };
const KIND = { water: { name: '水的问题', col: 'var(--c-credit)' }, channel: { name: '河道的问题', col: 'var(--c-housing)' }, both: { name: '两样都有', col: 'var(--c-fiscal)' } };
const PART_COL = { width: 'var(--c-housing)', water: 'var(--c-credit)', pool: 'var(--c-financial)', debt: 'var(--c-bond)', border: 'var(--c-goods)', mood: 'var(--c-gold)' };

/* ---------- helpers ---------- */
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
const sgn = v => (v > 0.04 ? '+' : v < -0.04 ? '−' : '') + f1(Math.abs(v));
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (parent) parent.appendChild(e); return e; };
const txt = (parent, x, y, s, cls, anchor = 'start') => { const t = svgEl('text', { x, y, class: cls, 'text-anchor': anchor }, parent); t.textContent = s; return t; };
const lerp = (d0, d1, r0, r1) => v => r0 + (v - d0) / (d1 - d0) * (r1 - r0);
function niceTicks(lo, hi, n = 5) {
  const span = hi - lo || 1, raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(k => k * p).find(s => span / s <= n + 0.5) || 10 * p;
  const t = []; for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) t.push(+v.toFixed(10));
  return t;
}
const head = (title, sub) => `<h4 class="skp-h">${esc(title)}</h4>${sub ? `<p class="skp-sub">${sub}</p>` : ''}`;

let cur = null;   // { host, root, id, spec, ro, redraw, offs:[], w }

export function mountShockPanel(host, spec) {
  unmountShockPanel();
  const id = spec && spec.id;
  if (!host || !PANEL[id]) return null;
  const root = document.createElement('div');
  root.className = 'skp';
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

export function unmountShockPanel() {
  if (!cur) return;
  if (cur.ro) cur.ro.disconnect();
  cur.offs.forEach(fn => { try { fn(); } catch (e) { /* ignore */ } });
  cur.root.remove();
  cur = null;
}
const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); cur.offs.push(() => el.removeEventListener(ev, fn, opt)); };

/* ---------- the event card ---------- */
export function cardHtml(id) {
  const c = cardById(id); if (!c) return '';
  const ev = eventById(id), k = KIND[c.kind];
  const parts = SHOCK_PARTS.map(p => {
    const h = c.hit.find(x => x.k === p.k);
    if (!h) return `<tr class="off"><th>${esc(p.name)}</th><td colspan="2">—</td></tr>`;
    return `<tr><th><i class="skp-sw" style="background:${PART_COL[p.k]}"></i>${esc(p.name)}</th>` +
      `<td><span class="skp-tag" style="--pc:${PART_COL[p.k]}">${h.s > 0 ? '▲' : '▼'} ${esc(h.lab)}</span><span class="skp-w" aria-label="轻重 ${h.w}/3">${'●'.repeat(h.w)}${'○'.repeat(3 - h.w)}</span></td>` +
      `<td>${esc(h.t)}</td></tr>`;
  }).join('');
  const trend = ev ? `旧趋势 = ${ev.trend[0]}–${ev.trend[1]} 年平均每年 ${f1(ev.g)}%（${esc(ev.country)}）` : '';
  return `<div class="skp-card" data-card="${esc(id)}" style="--kc:${k.col}">` +
    `<div class="skp-ch"><b>${esc(c.name)}</b><span>${esc(c.when)} · ${esc(c.where)}</span><span class="skp-kind">${esc(k.name)}</span></div>` +
    `<p class="skp-one">${esc(c.one)}</p>` +
    (c.data ? `<p class="skp-data"><b>数据：</b>${esc(c.data)}${trend ? `<br><small>${trend}</small>` : ''}</p>` : `<p class="skp-data muted">没有画在图上：年度数据里看不出干净的信号，这一张只有判断。</p>`) +
    `<h5>打中了哪几样 <small>（判断）</small></h5><div class="skp-tblw"><table class="skp-hits">${parts}</table></div>` +
    `<p class="skp-row"><b>央行 / 政府怎么做：</b>${esc(c.policy)}</p>` +
    `<p class="skp-row"><b>环上哪一步：</b>${esc(c.ring)} <small class="muted">（判断；两个环见「周期」页）</small></p></div>`;
}
// put a card into `box` and bring it into view inside the panel
function showCard(root, box, id, scroll = true) {
  box.innerHTML = cardHtml(id);
  root.querySelectorAll('[data-ev]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ev === id)));
  if (scroll && box.firstChild) {
    const r = root.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (b.top > r.bottom - 60 || b.top < r.top) root.scrollTop += b.top - r.top - 8;
  }
}

/* ======================================================================================================== panels */
const PANEL = {};

/* ---------- 0. the rule: four corners + six parts ---------- */
PANEL['shk-rule'] = (root) => {
  const ex = { ru: ['b1', 'covid'], ld: ['gfc', 'gd', 'volcker'], lu: ['oil73', 'oil79', 'ukr'], rd: ['net', 'wto'] };
  root.innerHTML = head('流量和水位：同向 = 水，反向 = 河道', '横轴 = 流量（GDP 比旧趋势多还是少），竖轴 = 水位（通胀变高还是变低）。点一个角，看例子。') +
    `<div class="skp-chart" data-c="rule"></div>` +
    `<div class="skp-ex" data-o="ex"></div>` +
    `<h5 class="skp-h5">一次冲击可能打中的六样</h5><div class="skp-parts">${SHOCK_PARTS.map(p => `<div><i class="skp-sw" style="background:${PART_COL[p.k]}"></i><b>${esc(p.name)}</b><small>${esc(p.sub)}</small></div>`).join('')}</div>` +
    `<div data-o="card"></div>`;
  const exBox = root.querySelector('[data-o="ex"]'), cardBox = root.querySelector('[data-o="card"]');
  let corner = 'lu';
  const showEx = k => {
    corner = k;
    const c = SHOCK_CORNERS[k];
    exBox.innerHTML = `<p><b style="color:${KIND[c.kind].col}">${esc(c.name)}</b>：${esc(c.note)}。例子：</p><div class="skp-chips">` +
      ex[k].map(id => `<button type="button" data-ev="${id}" style="--kc:${KIND[cardById(id).kind].col}"><i></i>${esc(cardById(id).name)}</button>`).join('') + '</div>';
    root.querySelectorAll('[data-corner]').forEach(g => g.classList.toggle('on', g.dataset.corner === k));
  };
  on(exBox, 'click', e => { const b = e.target.closest('[data-ev]'); if (b) showCard(root, cardBox, b.dataset.ev); });
  const draw = () => {
    const box = root.querySelector('[data-c="rule"]');
    box.innerHTML = '';
    const W = Math.max(280, box.clientWidth || 320), H = Math.round(Math.min(W * 0.78, 330)), m = { l: 22, r: 10, t: 10, b: 24 };
    const cx = (m.l + W - m.r) / 2, cy = (m.t + H - m.b) / 2, qw = (W - m.r - m.l) / 2, qh = (H - m.b - m.t) / 2;
    const svg = svgEl('svg', { width: W, height: H, class: 'skp-svg', role: 'img', 'aria-label': '四格图：右上水多，左下水少，左上河道变窄，右下河道变宽' }, box);
    const cells = { lu: [m.l, m.t], ru: [cx, m.t], ld: [m.l, cy], rd: [cx, cy] };
    for (const [k, [x, y]] of Object.entries(cells)) {
      const c = SHOCK_CORNERS[k], g = svgEl('g', { 'data-corner': k, class: 'skp-corner', tabindex: 0, role: 'button', 'aria-label': c.name }, svg);
      svgEl('rect', { x, y, width: qw, height: qh, class: 'skp-qbg', style: `fill:${KIND[c.kind].col}` }, g);
      // a small channel cross-section: water corners change the water, channel corners change the banks
      const ix = x + qw / 2, iy = y + qh * 0.42, s = Math.min(qw, qh) / 120;
      const wide = k === 'rd' ? 1.35 : k === 'lu' ? 0.62 : 1, lvl = k === 'ru' ? 0.85 : k === 'ld' ? 0.3 : 0.6;
      const bw = 70 * s * wide, bh = 34 * s;
      svgEl('path', { d: `M${ix - bw / 2 - 10 * s},${iy - bh / 2} L${ix - bw / 2},${iy + bh / 2} L${ix + bw / 2},${iy + bh / 2} L${ix + bw / 2 + 10 * s},${iy - bh / 2}`, class: 'skp-bank' }, g);
      const wy = iy + bh / 2 - bh * lvl;
      svgEl('path', { d: `M${ix - bw / 2 - 10 * s * lvl},${wy} L${ix + bw / 2 + 10 * s * lvl},${wy} L${ix + bw / 2},${iy + bh / 2} L${ix - bw / 2},${iy + bh / 2}Z`, class: 'skp-water' }, g);
      txt(g, ix, y + qh * 0.42 + bh / 2 + 22 * Math.max(0.8, s), c.name, 'skp-qlab', 'middle').style.fill = KIND[c.kind].col;
      txt(g, ix, y + qh * 0.42 + bh / 2 + 22 * Math.max(0.8, s) + 15, KIND[c.kind].name, 'skp-ax', 'middle');
      on(g, 'click', () => showEx(k));
      on(g, 'keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showEx(k); } });
    }
    svgEl('line', { x1: m.l, x2: W - m.r, y1: cy, y2: cy, class: 'skp-axis' }, svg);
    svgEl('line', { x1: cx, x2: cx, y1: m.t, y2: H - m.b, class: 'skp-axis' }, svg);
    txt(svg, W - m.r, H - 6, 'GDP 比旧趋势多 →', 'skp-ax', 'end');
    txt(svg, m.l, H - 6, '← 少', 'skp-ax');
    const yl = txt(svg, 12, cy, '通胀变高 ↑', 'skp-ax', 'middle'); yl.setAttribute('transform', `rotate(-90 12 ${cy})`);
    showEx(corner);
  };
  cur.redraw = draw; draw();
};

/* ---------- 1. the event quadrant ---------- */
function quadExtent(evs) {
  const xs = evs.flatMap(e => e.pts.map(p => p.x)).concat(0), ys = evs.flatMap(e => e.pts.map(p => p.dy)).concat(0);
  const pad = (a, b, k) => [a - (b - a) * k, b + (b - a) * k];
  return { x: pad(Math.min(...xs), Math.max(...xs), 0.06), y: pad(Math.min(...ys), Math.max(...ys), 0.08) };
}
PANEL['shk-quad'] = (root, spec) => {
  const st = { group: SHOCK_GROUPS[spec.group] ? spec.group : 'modern', sel: spec.select || null };
  if (st.sel && eventById(st.sel) && eventById(st.sel).group !== st.group) st.group = eventById(st.sel).group;
  const build = () => {
    const evs = SHOCK_EVENTS.filter(e => e.group === st.group);
    if (!st.sel || !evs.some(e => e.id === st.sel)) st.sel = evs[evs.length - 1].id;
    root.innerHTML = head('每次冲击往哪个角走', '横轴：GDP 比旧趋势线多（+）少（−）几 %。竖轴：通胀比起点那年高几个点。每条线从 (0, 0) 出发，一年一个点。') +
      `<div class="skp-seg" role="group" aria-label="哪一组">${Object.entries(SHOCK_GROUPS).map(([k, n]) => `<button type="button" data-group="${k}" aria-pressed="${k === st.group}">${esc(n)}</button>`).join('')}</div>` +
      `<div class="skp-chart" data-c="quad"></div>` +
      `<div class="skp-legend"><span><i class="skp-ln" style="background:${KIND.water.col}"></i>水的问题</span><span><i class="skp-ln" style="background:${KIND.channel.col}"></i>河道的问题</span><span><i class="skp-ln" style="background:${KIND.both.col}"></i>两样都有</span><span><i class="skp-ring"></i>保留样本（2022 年起）</span></div>` +
      `<div class="skp-chips">${evs.map(e => `<button type="button" data-ev="${e.id}" aria-pressed="${e.id === st.sel}" style="--kc:${KIND[cardById(e.id).kind].col}"><i></i>${esc(SHORT[e.id])}</button>`).join('')}</div>` +
      `<div data-o="card"></div>` +
      `<details class="skp-tbl"><summary>数据表</summary><div class="skp-tblw" data-o="tbl"></div></details>` +
      `<p class="skp-src">横轴：${esc(SHOCK_META.x)}竖轴：${esc(SHOCK_META.y)}${esc(SHOCK_META.method)} 来源：${esc([...new Set(evs.map(e => e.src))].join('；'))}。</p>`;
    on(root.querySelector('.skp-seg'), 'click', e => { const b = e.target.closest('[data-group]'); if (b && b.dataset.group !== st.group) { st.group = b.dataset.group; st.sel = null; build(); } });
    on(root.querySelector('.skp-chips'), 'click', e => { const b = e.target.closest('[data-ev]'); if (b) select(b.dataset.ev, true); });
    draw();
    select(st.sel, false);
  };
  const select = (id, scroll) => {
    st.sel = id;
    root.querySelectorAll('.skp-traj').forEach(g => g.classList.toggle('sel', g.dataset.ev === id));
    const g = root.querySelector(`.skp-traj[data-ev="${id}"]`); if (g) g.parentNode.appendChild(g);   // selected on top
    showCard(root, root.querySelector('[data-o="card"]'), id, scroll);
    const ev = eventById(id);
    root.querySelector('[data-o="tbl"]').innerHTML = `<table><tr><th>年</th><th>GDP 比旧趋势 %</th><th>通胀比基准年（个点）</th><th>GDP 增速 %</th><th>通胀 %</th><th>失业率 %</th></tr>` +
      ev.pts.map(p => `<tr${p.hold ? ' class="hold"' : ''}><td>${p.y}${p.hold ? '*' : ''}</td><td>${sgn(p.x)}</td><td>${sgn(p.dy)}</td><td>${sgn(p.gr)}</td><td>${f1(p.pi)}</td><td>${p.u == null ? '—' : f1(p.u)}</td></tr>`).join('') +
      `</table><small>${esc(ev.country)}，基准年 ${ev.base}；* = 保留样本</small>`;
  };
  const draw = () => {
    const box = root.querySelector('[data-c="quad"]'); if (!box) return;
    box.innerHTML = '';
    const evs = SHOCK_EVENTS.filter(e => e.group === st.group), ext = quadExtent(evs);
    const W = Math.max(280, box.clientWidth || 320), H = Math.round(Math.max(300, Math.min(W * 0.92, 470))), m = { l: 36, r: 12, t: 12, b: 26 };
    const X = lerp(ext.x[0], ext.x[1], m.l, W - m.r), Y = lerp(ext.y[0], ext.y[1], H - m.b, m.t);
    const svg = svgEl('svg', { width: W, height: H, class: 'skp-svg', role: 'img', 'aria-label': '事件四格图：每个事件从基准年 (0,0) 出发，一年一个点' }, box);
    const x0 = X(0), y0 = Y(0);
    const quad = (k, x, y, w, h, ax, ay, anchor) => {
      const c = SHOCK_CORNERS[k];
      svgEl('rect', { x, y, width: Math.max(0, w), height: Math.max(0, h), class: 'skp-qbg', style: `fill:${KIND[c.kind].col}` }, svg);
      txt(svg, ax, ay, c.name, 'skp-qtag', anchor).style.fill = KIND[c.kind].col;
    };
    quad('lu', m.l, m.t, x0 - m.l, y0 - m.t, m.l + 4, m.t + 13, 'start');
    quad('ru', x0, m.t, W - m.r - x0, y0 - m.t, W - m.r - 4, m.t + 13, 'end');
    quad('ld', m.l, y0, x0 - m.l, H - m.b - y0, m.l + 4, H - m.b - 6, 'start');
    quad('rd', x0, y0, W - m.r - x0, H - m.b - y0, W - m.r - 4, H - m.b - 6, 'end');
    for (const v of niceTicks(ext.y[0], ext.y[1], 6)) { svgEl('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: v === 0 ? 'skp-axis' : 'skp-grid' }, svg); txt(svg, m.l - 5, Y(v) + 4, (v > 0 ? '+' : '') + v, 'skp-ax', 'end'); }
    for (const v of niceTicks(ext.x[0], ext.x[1], W < 420 ? 5 : 8)) { svgEl('line', { x1: X(v), x2: X(v), y1: m.t, y2: H - m.b, class: v === 0 ? 'skp-axis' : 'skp-grid' }, svg); txt(svg, X(v), H - 9, (v > 0 ? '+' : '') + v + (v === 0 ? '' : '%'), 'skp-ax', 'middle'); }
    const labs = [];
    for (const e of evs) {
      const col = KIND[cardById(e.id).kind].col;
      const g = svgEl('g', { class: 'skp-traj', 'data-ev': e.id, style: `--kc:${col}` }, svg);
      const P = e.pts.map(p => [X(p.x), Y(p.dy)]);
      const d = P.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
      svgEl('path', { d, class: 'skp-hit' }, g);                     // wide transparent tap target
      svgEl('path', { d, class: 'skp-tline' }, g);
      for (let i = 1; i < P.length; i++) {                          // arrowhead on each year's segment
        const [ax, ay] = P[i - 1], [bx, by] = P[i], L = Math.hypot(bx - ax, by - ay); if (L < 6) continue;
        const ux = (bx - ax) / L, uy = (by - ay) / L, s = 7;
        svgEl('path', { d: `M${bx},${by} L${bx - s * ux - s * 0.55 * uy},${by - s * uy + s * 0.55 * ux} L${bx - s * ux + s * 0.55 * uy},${by - s * uy - s * 0.55 * ux}Z`, class: 'skp-arrow' }, g);
      }
      e.pts.forEach((p, i) => { svgEl('circle', { cx: P[i][0], cy: P[i][1], r: i ? 3.6 : 3, class: 'skp-pt' + (p.hold ? ' hold' : '') }, g); });
      // year labels (shown on the selected one only, by CSS)
      e.pts.forEach((p, i) => { if (i === 0 || i === e.pts.length - 1 || e.pts.length <= 5 || i % 2 === 0) { const t = txt(g, P[i][0] + 6, P[i][1] - 6, String(p.y), 'skp-ylab'); if (P[i][0] > W - 40) { t.setAttribute('x', P[i][0] - 6); t.setAttribute('text-anchor', 'end'); } } });
      const end = P[P.length - 1];
      labs.push({ g, x: end[0], y: end[1], s: SHORT[e.id], id: e.id });
      on(g, 'click', () => select(e.id, true));
    }
    // event names at the end points, nudged apart vertically
    labs.sort((a, b) => a.y - b.y);
    const placed = [];
    for (const l of labs) {
      const w = l.s.length * 12 + 4, right = l.x + 8 + w < W - m.r;
      const x0l = right ? l.x + 8 : l.x - 8 - w;
      let y = l.y + 4;
      for (let k = 0; k < 8; k++) { const hit = placed.find(p => Math.abs(p.y - y) < 14 && p.x0 < x0l + w && x0l < p.x0 + p.w); if (!hit) break; y = hit.y + 14; }
      y = Math.min(H - m.b - 2, Math.max(m.t + 10, y));
      placed.push({ x0: x0l, w, y });
      txt(l.g, right ? l.x + 8 : l.x - 8, y, l.s, 'skp-elab', right ? 'start' : 'end');
    }
    // keep the selection
    root.querySelectorAll('.skp-traj').forEach(g => g.classList.toggle('sel', g.dataset.ev === st.sel));
    const g = root.querySelector(`.skp-traj[data-ev="${st.sel}"]`); if (g) g.parentNode.appendChild(g);
  };
  cur.redraw = draw;
  build();
};

/* ---------- 2. 三条线: temporary vs permanent ---------- */
// log real GDP rebuilt from waves.js (deviation from the straight line + the line itself), and the average growth between two years
const wavesC = iso => WAVES.countries.find(c => c.iso === iso);
export function wavesLevel(iso) {
  const c = wavesC(iso);
  return c.years.map((y, i) => Math.log(1 + c.dev[i] / 100) + (y - c.years[0]) * Math.log(1 + c.trend / 100));
}
export function wavesAvg(iso, a, b) {
  const c = wavesC(iso), L = wavesLevel(iso), at = y => L[c.years.indexOf(y)];
  return (Math.exp((at(b) - at(a)) / (b - a)) - 1) * 100;
}
PANEL['shk-lines'] = (root, spec) => {
  const st = { iso: spec.iso === 'USA' ? 'USA' : 'JPN' };
  const SEG = [[1956, 1973], [1973, 1990], [1990, 2022]];
  const build = () => {
    const isJ = st.iso === 'JPN';
    root.innerHTML = head('直线 = 河道宽度，波浪 = 水', isJ
      ? '日本实际 GDP（1956 年 = 100，对数刻度）。虚线 = 每一段的平均增速：<b>直线一次次变平 = 河道永久变窄</b>。'
      : '美国实际 GDP 离那条长直线多远（%）。直线放平成 0：<b>波浪 = 水</b>。疫情的坑两年就填回去；2008 年的坑没填回去。') +
      `<div class="skp-seg" role="group" aria-label="国家"><button type="button" data-iso="JPN" aria-pressed="${isJ}">日本：永久</button><button type="button" data-iso="USA" aria-pressed="${!isJ}">美国：临时</button></div>` +
      `<div class="skp-chart" data-c="lines"></div>` +
      `<div class="skp-chips">${(isJ ? ['jpn'] : ['covid', 'gfc']).map(id => `<button type="button" data-ev="${id}" style="--kc:${KIND[cardById(id).kind].col}"><i></i>${esc(cardById(id).name)}</button>`).join('')}</div>` +
      `<p class="skp-note">「周期」页往下翻到「真实世界的三条线」，五个国家都能看。</p>` +
      `<div data-o="card"></div>` +
      `<p class="skp-src">${esc(wavesC(st.iso).src)}。${esc(WAVES.method)}</p>`;
    on(root.querySelector('.skp-seg'), 'click', e => { const b = e.target.closest('[data-iso]'); if (b && b.dataset.iso !== st.iso) { st.iso = b.dataset.iso; build(); } });
    on(root.querySelector('.skp-chips'), 'click', e => { const b = e.target.closest('[data-ev]'); if (b) showCard(root, root.querySelector('[data-o="card"]'), b.dataset.ev); });
    draw();
  };
  const draw = () => {
    const box = root.querySelector('[data-c="lines"]'); if (!box) return;
    box.innerHTML = '';
    const c = wavesC(st.iso), W = Math.max(280, box.clientWidth || 320), H = Math.round(Math.min(Math.max(240, W * 0.62), 340)), m = { l: 40, r: 12, t: 14, b: 26 };
    const svg = svgEl('svg', { width: W, height: H, class: 'skp-svg', role: 'img' }, box);
    if (st.iso === 'JPN') {
      const L = wavesLevel('JPN'), ys = c.years, i0 = ys.indexOf(1956), base = L[i0];
      const xs = ys.slice(i0), v = L.slice(i0).map(x => (x - base) / Math.LN10);   // log10 of index/100
      const X = lerp(1956, xs[xs.length - 1], m.l, W - m.r), lo = Math.min(...v), hi = Math.max(...v), Y = lerp(lo - 0.05, hi + 0.08, H - m.b, m.t);
      svg.setAttribute('aria-label', '日本实际 GDP，对数刻度，三段平均增速：' + SEG.map(([a, b]) => `${a}–${b} ${f1(wavesAvg('JPN', a, b))}%`).join('，'));
      for (const k of [100, 200, 500, 1000, 2000]) { const lv = Math.log10(k / 100); if (lv < lo - 0.05 || lv > hi + 0.08) continue; svgEl('line', { x1: m.l, x2: W - m.r, y1: Y(lv), y2: Y(lv), class: 'skp-grid' }, svg); txt(svg, m.l - 5, Y(lv) + 4, String(k), 'skp-ax', 'end'); }
      for (const y of [1960, 1970, 1980, 1990, 2000, 2010, 2020]) txt(svg, X(y), H - 8, String(y), 'skp-ax', 'middle');
      svgEl('path', { d: xs.map((y, i) => (i ? 'L' : 'M') + X(y).toFixed(1) + ',' + Y(v[i]).toFixed(1)).join(''), class: 'skp-gdp' }, svg);
      SEG.forEach(([a, b], k) => {
        const va = v[xs.indexOf(a)], vb = v[xs.indexOf(b)];
        svgEl('line', { x1: X(a), y1: Y(va), x2: X(b), y2: Y(vb), class: 'skp-trend' }, svg);
        const t = txt(svg, X((a + b) / 2), Y((va + vb) / 2) + (k === 2 ? 22 : 20), `每年 ${f1(wavesAvg('JPN', a, b))}%`, 'skp-tlab', 'middle');
        if (k === 0) t.setAttribute('x', X((a + b) / 2) + 18);
      });
      txt(svg, m.l + 4, m.t + 10, '对数刻度：直线 = 每年同样的增速', 'skp-ax');
    } else {
      const ys = c.years, i0 = ys.indexOf(1990), xs = ys.slice(i0), v = c.dev.slice(i0);
      const X = lerp(1990, xs[xs.length - 1], m.l, W - m.r), lo = Math.min(...v, 0), hi = Math.max(...v, 0), Y = lerp(lo - 2, hi + 3, H - m.b, m.t);
      svg.setAttribute('aria-label', '美国实际 GDP 离长直线的距离，1990 年起');
      for (const t of niceTicks(lo - 2, hi + 3, 5)) { svgEl('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), class: t === 0 ? 'skp-axis' : 'skp-grid' }, svg); txt(svg, m.l - 5, Y(t) + 4, (t > 0 ? '+' : '') + t + '%', 'skp-ax', 'end'); }
      for (const y of [1990, 2000, 2010, 2020]) txt(svg, X(y), H - 8, String(y), 'skp-ax', 'middle');
      txt(svg, W - m.r, Y(0) - 5, '长直线 = 河道宽度的趋势', 'skp-tlab', 'end');
      svgEl('path', { d: xs.map((y, i) => (i ? 'L' : 'M') + X(y).toFixed(1) + ',' + Y(v[i]).toFixed(1)).join(''), class: 'skp-gdp' }, svg);
      const mark = (y, id, lab, dy) => { const i = xs.indexOf(y); if (i < 0) return; const g = svgEl('g', { class: 'skp-mk', 'data-ev': id }, svg); svgEl('circle', { cx: X(y), cy: Y(v[i]), r: 5, class: 'skp-mkdot', style: `fill:${KIND[cardById(id).kind].col}` }, g); txt(g, X(y), Y(v[i]) + dy, lab, 'skp-elab', 'middle'); on(g, 'click', () => showCard(root, root.querySelector('[data-o="card"]'), id)); };
      mark(2009, 'gfc', '2008：坑没填回去', 18);
      mark(2020, 'covid', '疫情：两年填回', 18);
    }
  };
  cur.redraw = draw;
  build();
};

/* ---------- 3. which parts each event hit (judgement) ---------- */
PANEL['shk-parts'] = (root, spec) => {
  const order = ['ww1', 'gd', 'r37', 'ww2', 'b1', 'oil73', 'oil79', 'volcker', 'net', 'wto', 'mining', 'gfc', 'covid', 'ukr', 'tariff', 'mig', 'jpn', 'ai', 'chn'];
  const cards = order.map(cardById).filter(Boolean);
  root.innerHTML = head('打中哪两样，哪样更重', '每一行 = 一次冲击，每一列 = 六样之一。颜色越深 = 打得越重；▲ 变多/变宽，▼ 变少/变窄。<b>全部是判断</b>。点一行看卡片。') +
    `<div class="skp-tblw skp-mx-w"><table class="skp-mx"><thead><tr><th>冲击</th>${SHOCK_PARTS.map(p => `<th><i class="skp-sw" style="background:${PART_COL[p.k]}"></i>${esc(p.name)}</th>`).join('')}</tr></thead><tbody>` +
    cards.map(c => `<tr data-ev="${c.id}" tabindex="0" role="button" aria-pressed="false"><th><i class="skp-dot" style="background:${KIND[c.kind].col}"></i>${esc(c.name)}<small>${esc(c.when)}</small></th>` +
      SHOCK_PARTS.map(p => { const h = c.hit.find(x => x.k === p.k); return h ? `<td class="w${h.w}" style="--pc:${PART_COL[p.k]}" title="${esc(h.t)}">${h.s > 0 ? '▲' : '▼'}${esc(h.lab)}</td>` : '<td></td>'; }).join('') + '</tr>').join('') +
    `</tbody></table></div><div class="skp-legend"><span><i class="skp-dot" style="background:${KIND.water.col}"></i>水的问题</span><span><i class="skp-dot" style="background:${KIND.channel.col}"></i>河道的问题</span><span><i class="skp-dot" style="background:${KIND.both.col}"></i>两样都有</span></div>` +
    `<div data-o="card"></div>`;
  const cardBox = root.querySelector('[data-o="card"]');
  const pick = tr => { if (tr) showCard(root, cardBox, tr.dataset.ev); };
  const tb = root.querySelector('tbody');
  on(tb, 'click', e => pick(e.target.closest('tr[data-ev]')));
  on(tb, 'keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(e.target.closest('tr[data-ev]')); } });
  if (spec.select) showCard(root, cardBox, spec.select, false);
  cur.redraw = null;
};
