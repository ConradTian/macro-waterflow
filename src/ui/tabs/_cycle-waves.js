// 周期 tab, "真实世界的三条线": Dalio's classic picture (redrawn), five countries' real GDP split into the three lines
// (src/data/waves.js, built by tools/build_waves.py) and the US quarterly short cycle next to the game's own short-cycle calls.
// The chart builders are exported: the 周期 tab section (wavesHtml) and the left-hand curves view (src/ui/wave-view.js) share them.
import { esc } from './_util.js';
import { WAVES } from '../../data/waves.js';
import { LONG_LABEL } from '../../engine/regimes.js';

// short-cycle steps (snap.cycles.short.key) -> legend label / colour. The colours are CSS vars from cycle.css; the fallback is only a safety net.
export const SHORT_LEGEND = { expand: '扩张', hotP: '过热·物价', hotA: '过热·资产', tight: '收紧（加息/衰退）', ease: '降息（推得动吗？）' };
const P_FALLBACK = { expand: '#2a9547', hotP: '#d9a000', hotA: '#8a3fb0', tight: '#d33f3f', ease: '#1f6fc2' };
const pcol = k => `var(--cy-p-${k}, ${P_FALLBACK[k] || '#888'})`;
const skey = s => (s ? s.key || s.phase : null);
const STAGE_MARK = { 1: '①', 2: '②', 5: '⑤', 6: '⑥', 7: '⑦', 8: '⑧' };
const STAGE_ORDER = [1, 2, 5, 6, 7, 8];
const stageName = s => String(LONG_LABEL[s] || '').replace(/^\S+\s*/, '');
const f1 = n => (+n).toFixed(1);
let iso = 'USA';                       // selected country (kept across the per-step re-render); ?wv=JPN preselects
try { const p = new URLSearchParams(location.search).get('wv'); if (p) iso = p.toUpperCase(); } catch (e) { /* no location */ }
const openMap = { dalio: true };

/* Dalio's picture, our own drawing: straight line + long S wave + short waves riding on it */
export function classicSvg() {
  const W = 360, H = 160, X0 = 14, X1 = 346, Yb = 146, Yt = 26, n = 240;
  const line = x => Yb - (Yb - Yt) * x;
  const long = x => line(x) - 30 * Math.tanh(4 * Math.sin(2 * Math.PI * x)) / Math.tanh(4);
  const short = x => long(x) - 6.5 * Math.sin(2 * Math.PI * 9 * x) * (x < 0.04 ? x / 0.04 : 1);
  const path = fn => Array.from({ length: n + 1 }, (_, i) => { const x = i / n; return `${i ? 'L' : 'M'}${f1(X0 + (X1 - X0) * x)} ${f1(fn(x))}`; }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="wv-svg" role="img" aria-label="达利欧示意图：直线是 GDP 长期趋势，粗线是长期债务周期，细线是实际 GDP（带短期债务周期）">
    <line x1="${X0}" y1="6" x2="${X0}" y2="${Yb + 6}" class="wv-axis"/><line x1="${X0}" y1="${Yb + 6}" x2="${X1}" y2="${Yb + 6}" class="wv-axis"/>
    <path d="${path(short)}" class="wv-dev"/><path d="${path(long)}" class="wv-long"/><path d="${path(line)}" class="wv-trend"/>
    <text x="${X1}" y="${Yb + 2}" text-anchor="end" class="wv-ax">时间 →</text></svg>`;
}

function key3() {
  const sw = (cls, txt) => `<span class="wv-k"><i class="wv-sw ${cls}"></i>${txt}</span>`;
  return `<div class="wv-keys col">${sw('trend', '<b>直线</b> = GDP 长期趋势（由生产率决定）')}${sw('long', '<b>粗线</b> = 长期债务周期（50–75 年）')}${sw('dev', '<b>细线</b> = 实际 GDP，多出来的小波浪 = 短期债务周期（5–10 年）')}</div>`;
}

/* one country's real data, the straight line flattened to 0 */
export function countrySvg(c, nowYear, o = {}) {
  const W = o.W || 360, H = o.H || 176, X0 = 30, X1 = W - 8, T = 12, B = H - 26;
  const a = c.years[0], b = c.years[c.years.length - 1];
  const all = [...c.dev, ...c.long];
  const step = Math.max(...all.map(Math.abs)) > 30 ? 20 : 10;
  const lo = Math.floor(Math.min(...all) / step) * step, hi = Math.ceil(Math.max(...all) / step) * step;
  const X = y => X0 + (y - a) / (b - a) * (X1 - X0), Y = v => B - (v - lo) / (hi - lo) * (B - T);
  const path = arr => arr.map((v, i) => `${i ? 'L' : 'M'}${f1(X(c.years[i]))} ${f1(Y(v))}`).join('');
  let g = '';
  for (let v = lo; v <= hi; v += step) g += `<line x1="${X0}" x2="${X1}" y1="${f1(Y(v))}" y2="${f1(Y(v))}" class="wv-grid"/><text x="${X0 - 3}" y="${f1(Y(v) + 3)}" text-anchor="end" class="wv-ax">${v > 0 ? '+' : ''}${v}%</text>`;
  if (nowYear != null) g += `<rect x="${f1(X(1995))}" y="${T}" width="${f1(X(Math.min(2025, b)) - X(1995))}" height="${B - T}" class="wv-game"/>` +
    `<text x="${f1((X(1995) + X(Math.min(2025, b))) / 2)}" y="${T + 9}" text-anchor="middle" class="wv-ax">游戏范围</text>`;
  for (const y of c.crises) g += `<line x1="${f1(X(y))}" x2="${f1(X(y))}" y1="${T}" y2="${B}" class="wv-crisis"/>`;
  g += `<line x1="${X0}" x2="${X1}" y1="${f1(Y(0))}" y2="${f1(Y(0))}" class="wv-zero"/>`;
  g += `<path d="${path(c.dev)}" class="wv-dev"/><path d="${path(c.long)}" class="wv-long"/>`;
  const span = b - a, tick = span > 100 ? 20 : 10;
  for (let y = Math.ceil(a / tick) * tick; y <= b; y += tick) g += `<text x="${f1(X(y))}" y="${B + 13}" text-anchor="middle" class="wv-ax">${y}</text>`;
  if (nowYear != null && nowYear >= a && nowYear <= b) {
    const x = X(nowYear);
    g += `<line x1="${f1(x)}" x2="${f1(x)}" y1="${T}" y2="${B}" class="cy-now-l"/><text x="${f1(Math.min(x + 4, X1))}" y="${B + 25}" text-anchor="end" class="cy-nowt">${esc(o.nowText || '现在 ' + nowYear)} ▲</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" class="wv-svg" role="img" aria-label="${esc(c.name)} ${a}–${b} 实际 GDP 高于或低于长期趋势的百分比">${g}</svg>`;
}

/* runs of equal values: [{key, from, to}] over hist[0..upTo] */
function runs(hist, keyOf, upTo) {
  const out = [];
  for (let i = 0; i <= upTo && i < hist.length; i++) {
    const k = keyOf(hist[i]);
    if (out.length && out[out.length - 1].key === k) out[out.length - 1].to = i;
    else out.push({ key: k, from: i, to: i });
  }
  return out;
}
/* the x axis shared by the quarterly chart and the long-cycle strip: quarter i of 1995Q1..2025Q4 -> x. Same W = same pixels. */
export function qAxis(W) {
  const n = WAVES.usQ.dates.length, X0 = 8, X1 = W - 8;
  return { n, X0, X1, X: i => X0 + i / (n - 1) * (X1 - X0), qw: (X1 - X0) / (n - 1) };
}
function yearTicks(W, yBase, o = {}) {
  const { X } = qAxis(W);
  let g = '';
  WAVES.usQ.dates.forEach((d, i) => { if (/Q1$/.test(d) && +d.slice(0, 4) % 5 === 0) {
    if (o.grid) g += `<line x1="${f1(X(i))}" x2="${f1(X(i))}" y1="${o.grid[0]}" y2="${o.grid[1]}" class="wv-vg"/>`;
    g += `<text x="${f1(X(i))}" y="${yBase}" text-anchor="middle" class="wv-ax">${d.slice(0, 4)}</text>`;
  } });
  return g;
}

/* US quarters 1995–2025: real GDP gap from its trend (the short cycle) + the game's own short-cycle calls underneath.
   o: { W, H, stripH, id }  (id keeps the pattern ids unique when two of these are on the page) */
export function usQuarterSvg(hist, t, live, o = {}) {
  const Q = WAVES.usQ;
  const W = o.W || 360, H = o.H || 150, id = o.id || 'q';
  const { n, X0, X1, X, qw } = qAxis(W);
  const T = 14, sH = o.stripH || 10, sB = H - 28, sT = sB - sH, B = sT - 10;
  const lo = -9, hi = 3, Y = v => B - (v - lo) / (hi - lo) * (B - T);
  const qi = d => Q.dates.indexOf(d);
  let g = live ? `<defs>
    <pattern id="${id}-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="${pcol('tight')}"/><line x1="0" y1="0" x2="0" y2="5" stroke="var(--cy-hatch, #fff)" stroke-width="2.2"/></pattern>
    <pattern id="${id}-dots" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="${pcol('ease')}"/><circle cx="2.5" cy="2.5" r="1" fill="var(--cy-hatch, #fff)"/></pattern></defs>` : '';
  for (const [p, q] of Q.recessions) g += `<rect x="${f1(X(qi(p)) - qw / 2)}" y="${T}" width="${f1((qi(q) - qi(p) + 1) * qw)}" height="${B - T}" class="wv-rec"/>`;
  const r0 = qi('2022Q1');
  g += `<rect x="${f1(X(r0) - qw / 2)}" y="${T}" width="${f1(X1 - X(r0) + qw / 2)}" height="${B - T}" class="wv-hold"/><text x="${X1 - 2}" y="${T + 9}" text-anchor="end" class="wv-ax">2022+ 保留样本</text>`;
  g += yearTicks(W, sB + 13, { grid: [T, sB] });
  for (const v of [-6, -3, 0, 3]) g += `<line x1="${X0}" x2="${X1}" y1="${f1(Y(v))}" y2="${f1(Y(v))}" class="${v ? 'wv-grid' : 'wv-zero'}"/><text x="${X0 + 2}" y="${f1(Y(v) - 2)}" class="wv-ax">${v > 0 ? '+' : ''}${v}%</text>`;
  const cut = live ? t : n - 1;
  const seg = (a, b) => Q.gap.slice(a, b + 1).map((v, k) => `${k ? 'L' : 'M'}${f1(X(a + k))} ${f1(Y(v))}`).join('');
  g += `<path d="${seg(0, cut)}" class="wv-q"/>`;
  if (cut < n - 1) g += `<path d="${seg(cut, n - 1)}" class="wv-q wv-later"/>`;
  if (live) {
    // 推不动 stretch: the short cycle sits at 降息 but the credit does not restart, so the long cycle takes over
    for (const r of runs(hist, h => h.cycles?.short?.handoff === 'no', t)) {
      if (!r.key) continue;
      const x = X(r.from) - qw / 2, w = (r.to - r.from + 1) * qw;
      g += `<rect x="${f1(x)}" y="${T}" width="${f1(w)}" height="${sB - T}" class="wv-nopush"/><text x="${f1(x + w / 2)}" y="${T + 9}" text-anchor="middle" class="wv-nopt">推不动</text>`;
    }
    // the game's short-cycle call per quarter
    g += `<text x="${X0}" y="${sT - 2}" class="wv-ax">游戏判定的小周期</text>`;
    for (const r of runs(hist, h => skey(h.cycles?.short), t)) {
      if (!r.key) continue;
      const fill = r.key === 'tight' ? `url(#${id}-hatch)` : r.key === 'ease' ? `url(#${id}-dots)` : pcol(r.key);
      g += `<rect x="${f1(X(r.from) - qw / 2)}" y="${sT}" width="${f1((r.to - r.from + 1) * qw + 0.3)}" height="${sH}" fill="${fill}"/>`;
    }
    g += `<line x1="${f1(X(t))}" x2="${f1(X(t))}" y1="${T}" y2="${sB}" class="cy-now-l"/>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" class="wv-svg wvw-chart" role="img" aria-label="美国 1995–2025 实际 GDP 离趋势多远（季度），灰色 = 官方衰退期，下面的色带 = 游戏判定的小周期">${g}</svg>`;
}

/* the long cycle of the game run as a thin band (coloured by long.stage), on the SAME x axis as usQuarterSvg, with a marker where
   long.fork turns B2 (the fork after ②: excess claims shrink instead of spilling into prices). o: { W, H, id } */
export function longStripSvg(hist, t, o = {}) {
  const W = o.W || 360, H = o.H || 66, id = o.id || 's';
  const { n, X0, X1, X, qw } = qAxis(W);
  const top = 18, bandB = top + 26;
  let g = `<defs><pattern id="${id}-fut" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="var(--pn-border, #ccc)" stroke-width="1"/></pattern></defs>`;
  g += yearTicks(W, bandB + 14, { grid: [top, bandB] });
  g += `<text x="${X0}" y="${top - 6}" class="wv-ax">大周期（按阶段着色）</text>`;
  for (const r of runs(hist, h => h.cycles?.long?.stage, t)) {
    if (r.key == null) continue;
    const x = Math.max(X0, X(r.from) - qw / 2), x2 = Math.min(X1, X(r.to) + qw / 2), w = x2 - x;
    g += `<rect x="${f1(x)}" y="${top}" width="${f1(w)}" height="${bandB - top}" class="cy-lb cy-s${r.key}"/>`;
    if (w >= 13) g += `<text x="${f1(x + w / 2)}" y="${top + 12}" text-anchor="middle" class="cy-lbl">${STAGE_MARK[r.key] || r.key}</text>`;
    if (w >= 66) g += `<text x="${f1(x + w / 2)}" y="${top + 22}" text-anchor="middle" class="cy-lbl2">${esc(stageName(r.key))}</text>`;
  }
  if (t < n - 1) {
    const x = X(t) + qw / 2;
    g += `<rect x="${f1(x)}" y="${top}" width="${f1(X1 - x)}" height="${bandB - top}" fill="url(#${id}-fut)" class="cy-future"/>`;
  }
  // B2 fork: a bar under the band while the fork is B2, and a marker where it first turns B2
  let prev = null;
  for (let i = 0; i <= t && i < hist.length; i++) {
    const f = hist[i].cycles?.long?.fork || null;
    if (f === 'B2') g += `<rect x="${f1(X(i) - qw / 2)}" y="${bandB}" width="${f1(qw + 0.3)}" height="3" class="wv-b2bar"/>`;
    if (f === 'B2' && prev !== 'B2') {
      const x = X(i), right = x > W * 0.62;
      g += `<line x1="${f1(x)}" x2="${f1(x)}" y1="${top - 3}" y2="${bandB + 3}" class="wv-b2l"/><path d="M${f1(x - 4)} ${top - 9}L${f1(x + 4)} ${top - 9}L${f1(x)} ${top - 2}Z" class="wv-b2m"/>` +
        `<text x="${f1(x + (right ? -6 : 6))}" y="${top - 3}" text-anchor="${right ? 'end' : 'start'}" class="wv-b2t">${esc(hist[i].date)} B2 分叉</text>`;
    }
    prev = f;
  }
  g += `<line x1="${f1(X(t))}" x2="${f1(X(t))}" y1="${top - 3}" y2="${bandB}" class="cy-now-l"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="wv-svg wvw-chart" role="img" aria-label="大周期色带，与上图同一条时间轴；竖线标出大周期在 ② 之后第一次走向 B2 缩水的地方">${g}</svg>`;
}

/* legends */
export function shortLegendHtml(noPush = true) {
  const sty = {
    tight: `background:repeating-linear-gradient(135deg, ${pcol('tight')} 0 3px, var(--cy-hatch, #fff) 3px 5px)`,
    ease: `background:radial-gradient(var(--cy-hatch, #fff) 1px, ${pcol('ease')} 1.4px);background-size:5px 5px`,
  };
  const sw = k => `<span class="wv-k"><i class="wv-sw" style="${sty[k] || 'background:' + pcol(k)}"></i>${SHORT_LEGEND[k]}</span>`;
  return `<div class="wv-keys">${Object.keys(SHORT_LEGEND).map(sw).join('')}${noPush ? '<span class="wv-k"><i class="wv-sw np"></i>推不动 = 降息了，信贷仍不重启</span>' : ''}</div>`;
}
export function stageLegendHtml() {
  return `<div class="wv-keys">${STAGE_ORDER.map(s => `<span class="wv-k"><i class="cy-sw cy-s${s}"></i>${STAGE_MARK[s]}${esc(stageName(s))}</span>`).join('')}<span class="wv-k"><i class="wv-sw b2"></i>B2 缩水分叉</span></div>`;
}

export function wavesHtml(ctx) {
  const c = WAVES.countries.find(x => x.iso === iso) || WAVES.countries[0];
  const live = ctx.sim.mode === 'history' && !!ctx.real;
  const nowYear = live && c.iso === 'USA' ? +String(ctx.snap.date || '').slice(0, 4) || null : null;
  const chips = WAVES.countries.map(x => `<button type="button" class="wv-chip" data-iso="${x.iso}" aria-pressed="${x.iso === c.iso}">${esc(x.name)}</button>`).join('');
  const usq = c.iso === 'USA' ? `<div class="wv-qb"><div class="wv-sub"><b>美国小周期（季度）</b>：GDP 离自己的趋势多远。灰色 = 官方认定的衰退。${live ? '下面的色带是游戏每季的判定，可以直接对照。' : ''}</div>
      ${usQuarterSvg(ctx.sim.history('model'), ctx.sim.t, live, { id: 'tq' })}
      ${live ? shortLegendHtml() : ''}
      <p class="wv-src">${esc(WAVES.usQ.src)}</p></div>` : '';
  // buttons: compare on the left (history only), second window + follow (only where BroadcastChannel exists)
  const sync = typeof BroadcastChannel === 'function';
  const acts = [
    live ? `<button type="button" class="wv-btn" data-act="wv-left" aria-label="把曲线放到左边，盖住水流图，和右边的环对照"><span class="a">放到左边对照</span><span class="b">收回水流图</span></button>` : '',
    sync ? `<button type="button" class="wv-btn" data-act="wv-win" aria-label="在新窗口打开，随这个窗口同步">⧉ 第二个窗口</button>` : '',
    sync ? `<button type="button" class="wv-btn" data-act="wv-follow" aria-pressed="${document.body.dataset.follow === '1'}" aria-label="跟随另一个窗口的季度">跟随另一窗口</button>` : '',
  ].join('');
  return `<div class="wv">${acts ? `<div class="wv-act">${acts}</div>` : ''}<div class="wv-cols">
    <details class="wv-classic" data-wv="dalio"><summary>达利欧原图：三条线各是什么（参考）</summary>${classicSvg()}${key3()}
      <p class="wv-src">参考达利欧《经济机器是怎样运行的》里的示意图，这里是重画的。</p></details>
    <div class="wv-c2">
    <div class="wv-chips" role="group" aria-label="选国家">${chips}</div>
    <div class="wv-sub"><b>${esc(c.name)} ${c.years[0]}–${c.years[c.years.length - 1]}</b>：把直线拉平成 0 线（GDP 长期趋势，年均 ${c.trend}%）。${c.crises.length ? '红虚线 = 银行危机。' : ''}</div>
    ${countrySvg(c, nowYear)}
    <div class="wv-keys"><span class="wv-k"><i class="wv-sw long"></i>粗线 = 长期债务周期</span><span class="wv-k"><i class="wv-sw dev"></i>细线 = 实际 GDP</span><span class="wv-k"><i class="wv-sw zero"></i>0 线 = GDP 长期趋势</span></div>
    <p class="wv-now"><b>${esc(WAVES.asOf)} 在环上：</b>${esc(c.now.mark === '小' ? '' : c.now.mark + ' ')}${esc(c.now.text)}<small>（事后判断，示意）</small></p>
    <p class="wv-src">${esc(c.src)}。${esc(WAVES.method)}${!live ? ' 自由模式的游戏时间不对应真实历史，所以不画「现在」。' : c.iso !== 'USA' ? ' 游戏只用美国数据，所以别国不画「现在」。' : ''}</p>
    </div></div>
    ${usq}
  </div>`;
}

const fire = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }));

export function wireWaves(container, ctx) {
  const box = container.querySelector('.wv');
  if (!box) return;
  box.querySelectorAll('details[data-wv]').forEach(d => {
    d.open = openMap[d.dataset.wv] !== false;
    d.addEventListener('toggle', () => { openMap[d.dataset.wv] = d.open; });
  });
  box.querySelectorAll('.wv-chip').forEach(b => b.addEventListener('click', () => {
    iso = b.dataset.iso;
    const fresh = document.createElement('div');
    fresh.innerHTML = wavesHtml(ctx);
    box.replaceWith(fresh.firstElementChild);
    wireWaves(container, ctx);
  }));
  // app.js owns the state (body.dataset.view / .follow) and listens for these events
  box.querySelector('[data-act="wv-left"]')?.addEventListener('click', () => fire('mw:view', { view: document.body.dataset.view === 'waves' ? 'flow' : 'waves' }));
  box.querySelector('[data-act="wv-win"]')?.addEventListener('click', () => { window.open(location.pathname + '?follow=1&view=waves&tab=cycle', '_blank'); });
  box.querySelector('[data-act="wv-follow"]')?.addEventListener('click', () => fire('mw:follow', { on: document.body.dataset.follow !== '1' }));
}
