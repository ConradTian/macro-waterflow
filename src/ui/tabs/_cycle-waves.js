// 周期 tab, "真实世界的三条线": Dalio's classic picture (redrawn), five countries' real GDP split into the three lines
// (src/data/waves.js, built by tools/build_waves.py) and the US quarterly short cycle next to the game's own short-cycle calls.
import { esc } from './_util.js';
import { WAVES } from '../../data/waves.js';

const SHORT_NAME = { expand: '扩张', B1: '过热 B1', B2: '缩水 B2', tight: '收紧·衰退', ease: '降息重启' };
const f1 = n => (+n).toFixed(1);
let iso = 'USA';                       // selected country (kept across the per-step re-render); ?wv=JPN preselects
try { const p = new URLSearchParams(location.search).get('wv'); if (p) iso = p.toUpperCase(); } catch (e) { /* no location */ }
const openMap = { dalio: true };

/* Dalio's picture, our own drawing: straight line + long S wave + short waves riding on it */
function classicSvg() {
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
function countrySvg(c, nowYear) {
  const W = 360, H = 176, X0 = 30, X1 = 352, T = 12, B = 150;
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
    g += `<line x1="${f1(x)}" x2="${f1(x)}" y1="${T}" y2="${B}" class="cy-now-l"/><text x="${f1(Math.min(x + 4, X1))}" y="${B + 25}" text-anchor="end" class="cy-nowt">现在 ${nowYear} ▲</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" class="wv-svg" role="img" aria-label="${esc(c.name)} ${a}–${b} 实际 GDP 高于或低于长期趋势的百分比">${g}</svg>`;
}

/* US quarters 1995–2025: real GDP gap from its trend (the short cycle) + the game's own short-cycle calls underneath */
function usQuarterSvg(hist, t, live) {
  const Q = WAVES.usQ, n = Q.dates.length;
  const W = 360, H = 150, X0 = 8, X1 = 352, T = 14, B = 102, sT = 112, sB = 122;
  const X = i => X0 + i / (n - 1) * (X1 - X0), qw = (X1 - X0) / (n - 1);
  const lo = -9, hi = 3, Y = v => B - (v - lo) / (hi - lo) * (B - T);
  const qi = d => Q.dates.indexOf(d);
  let g = '';
  for (const [p, q] of Q.recessions) g += `<rect x="${f1(X(qi(p)) - qw / 2)}" y="${T}" width="${f1((qi(q) - qi(p) + 1) * qw)}" height="${B - T}" class="wv-rec"/>`;
  const r0 = qi('2022Q1');
  g += `<rect x="${f1(X(r0) - qw / 2)}" y="${T}" width="${f1(X1 - X(r0) + qw / 2)}" height="${B - T}" class="wv-hold"/><text x="${X1 - 2}" y="${T + 9}" text-anchor="end" class="wv-ax">2022+ 保留样本</text>`;
  for (const v of [-6, -3, 0, 3]) g += `<line x1="${X0}" x2="${X1}" y1="${f1(Y(v))}" y2="${f1(Y(v))}" class="${v ? 'wv-grid' : 'wv-zero'}"/><text x="${X0 + 2}" y="${f1(Y(v) - 2)}" class="wv-ax">${v > 0 ? '+' : ''}${v}%</text>`;
  const cut = live ? t : n - 1;
  const seg = (a, b) => Q.gap.slice(a, b + 1).map((v, k) => `${k ? 'L' : 'M'}${f1(X(a + k))} ${f1(Y(v))}`).join('');
  g += `<path d="${seg(0, cut)}" class="wv-q"/>`;
  if (cut < n - 1) g += `<path d="${seg(cut, n - 1)}" class="wv-q wv-later"/>`;
  // the game's short-cycle call per quarter
  if (live) {
    g += `<text x="${X0}" y="${sT - 2}" class="wv-ax">游戏判定的小周期</text>`;
    for (let i = 0; i <= t && i < hist.length; i++) {
      const p = hist[i].cycles?.short?.phase;
      if (p) g += `<rect x="${f1(X(i) - qw / 2)}" y="${sT}" width="${f1(qw + 0.3)}" height="${sB - sT}" fill="var(--cy-p-${p})"/>`;
    }
    g += `<line x1="${f1(X(t))}" x2="${f1(X(t))}" y1="${T}" y2="${sB}" class="cy-now-l"/>`;
  }
  Q.dates.forEach((d, i) => { if (/Q1$/.test(d) && +d.slice(0, 4) % 5 === 0) g += `<text x="${f1(X(i))}" y="${sB + 13}" text-anchor="middle" class="wv-ax">${d.slice(0, 4)}</text>`; });
  return `<svg viewBox="0 0 ${W} ${H}" class="wv-svg" role="img" aria-label="美国 1995–2025 实际 GDP 离趋势多远（季度），灰色 = 官方衰退期">${g}</svg>`;
}

export function wavesHtml(ctx) {
  const c = WAVES.countries.find(x => x.iso === iso) || WAVES.countries[0];
  const live = ctx.sim.mode === 'history' && !!ctx.real;
  const nowYear = live && c.iso === 'USA' ? +String(ctx.snap.date || '').slice(0, 4) || null : null;
  const chips = WAVES.countries.map(x => `<button type="button" class="wv-chip" data-iso="${x.iso}" aria-pressed="${x.iso === c.iso}">${esc(x.name)}</button>`).join('');
  const usq = c.iso === 'USA' ? `<div class="wv-qb"><div class="wv-sub"><b>美国小周期（季度）</b>：GDP 离自己的趋势多远。灰色 = 官方认定的衰退。${live ? '下面的色带是游戏每季的判定，可以直接对照。' : ''}</div>
      ${usQuarterSvg(ctx.sim.history('model'), ctx.sim.t, live)}
      ${live ? `<div class="wv-keys">${Object.entries(SHORT_NAME).map(([k, v]) => `<span class="wv-k"><i class="wv-sw" style="background:var(--cy-p-${k})"></i>${v}</span>`).join('')}</div>` : ''}
      <p class="wv-src">${esc(WAVES.usQ.src)}</p></div>` : '';
  return `<div class="wv"><div class="wv-cols">
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
}
