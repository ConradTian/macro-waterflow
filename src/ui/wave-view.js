// The curves view that covers the water diagram on the left (app.js: body.dataset.view = 'waves'; toggle button / mw:view event).
// Three charts stacked: (a) US long cycle 1870–2025 flattened, (b) US quarterly short cycle with the game's own short-cycle strip
// and the 推不动 stretch, (c) a thin long-cycle band of this game run. (b) and (c) share the x axis (1995Q1–2025Q4, same pixels),
// so the eye can go up and down between the small and the big cycle. Re-rendered by app.js every quarter. The chart builders live in
// tabs/_cycle-waves.js (shared with the 周期 tab).
import { WAVES } from '../data/waves.js';
import { esc } from './tabs/_util.js';
import { countrySvg, usQuarterSvg, longStripSvg, shortLegendHtml, stageLegendHtml } from './tabs/_cycle-waves.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** host = the .wvw element (already visible, so clientWidth is real); ctx = { sim, snap, real } */
export function renderWaveView(host, ctx) {
  const { sim, snap, real } = ctx;
  const keep = host.scrollTop;
  if (!real || sim.mode !== 'history' || sim.scenario === 'town' || !snap) {
    host.innerHTML = '<p class="wvw-empty">曲线对照只用美国真实季度数据，这里没有。</p>';
    return;
  }
  const hist = sim.history('model'), t = sim.t;
  const W = clamp(Math.round((host.clientWidth || 540) - 28), 300, 760);
  const roomy = (host.clientHeight || 600) >= 640 && W >= 480;       // iPad landscape / desktop: a bit taller charts
  const H = { a: roomy ? 128 : 136, b: roomy ? 168 : 172, c: 64 };

  const us = WAVES.countries.find(c => c.iso === 'USA');
  const y = +String(snap.date).slice(0, 4), q = +String(snap.date).slice(5, 6) || 1;
  const nowYear = y + (q - 1) / 4 + 0.125;

  const L = snap.cycles?.long, S = snap.cycles?.short;
  const fork = L?.fork ? `（分叉 ${L.fork}）` : '';
  const now = `<div class="wvw-now"><b>${esc(snap.date)}</b>
    <span>大周期 <b>${esc(L?.label || '—')}</b></span>
    <span>小周期 <b>${esc(S?.label || '—')}</b></span>
    ${S?.handoff === 'no' ? '<span class="wvw-np">推不动 → 交给大周期</span>' : ''}</div>`;

  host.innerHTML = `
    <div class="wvw-head"><b>曲线对照</b><small>右边的环走一季，这里的线跟着走一季</small></div>
    ${now}
    <section class="wvw-sec"><h4 class="wvw-t">大周期 · 美国 ${us.years[0]}–${us.years[us.years.length - 1]}<small>直线拉平成 0 线；粗线 = 长期债务周期</small></h4>
      ${countrySvg(us, nowYear, { W, H: H.a, nowText: snap.date })}</section>
    <section class="wvw-sec"><h4 class="wvw-t">小周期 · 季度 1995–2025<small>GDP 离趋势多远；下面的色带 = 游戏判定</small></h4>
      ${usQuarterSvg(hist, t, true, { W, H: H.b, stripH: 14, id: 'wvq' })}
      ${shortLegendHtml()}</section>
    <section class="wvw-sec"><h4 class="wvw-t">大周期 · 这一局（和上图同轴）<small>阶段颜色 = 大周期的位置${esc(fork)}</small></h4>
      ${longStripSvg(hist, t, { W, H: H.c, id: 'wvs' })}
      ${stageLegendHtml()}</section>`;
  host.scrollTop = keep;
}
