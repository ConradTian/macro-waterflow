// Shared helpers for tab modules (PANELS agent).
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const pct = (v, d = 1) => (v == null || !isFinite(v) ? '—' : (v * 100).toFixed(d) + '%');
export const spct = (v, d = 1) => (v == null || !isFinite(v) ? '—' : (v >= 0 ? '+' : '') + (v * 100).toFixed(d) + '%');
export const num = (v, d = 2) => (v == null || !isFinite(v) ? '—' : v.toFixed(d));
export const PLAYERS = {
  centralBank: { name: '央行', mark: '央', color: 'var(--c-fiscal, #7b4fb0)' },
  government:  { name: '政府', mark: '政', color: 'var(--c-capex, #8a6d1d)' },
  bank:        { name: '银行', mark: '银', color: 'var(--c-credit, #2b6cb0)' },
  household:   { name: '家庭', mark: '家', color: 'var(--c-housing, #2f855a)' },
  firm:        { name: '企业', mark: '企', color: 'var(--c-goods, #b7791f)' },
  investor:    { name: '投资者', mark: '投', color: 'var(--c-financial, #0e7490)' },
  foreign:     { name: '外国', mark: '外', color: 'var(--c-cash, #718096)' },
};
export const playerOf = id => PLAYERS[id] || { name: id, mark: '?', color: 'var(--muted, #888)' };
export const LAMP = { green: '绿', yellow: '黄', red: '红' };
export const LAMP_SYMBOL = { green: '●', yellow: '▲', red: '■' };   // shape + text, never colour only
export const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

import { lineChart } from '../chart.js';
import { currentCountry, countryInfo } from '../country-info.js';
/** Known places where the model is clearly off the real world. Drawn as a small band + note on the real-vs-model charts (by realKey),
 *  once the chart's "now" has reached `from`. { key: realKey, from, to (quarters), text } */
export const MODEL_GAPS = [
  { key: 'equityIndex', from: '2001Q1', to: '2002Q4', text: '模型偏差：真实股市 2001–02 跌约 45%，模型没跌' },
  { key: 'unemployment', from: '2006Q1', to: '2008Q2', text: '模型偏差：2006–08 模型失业率 6–10%，真实约 4.5–5%' },
  { key: 'unemployment', from: '2023Q1', to: '2025Q4', text: '模型偏差：2023–25 模型里出现了一次衰退，真实没有' },
  { key: 'gdpNominal', from: '2023Q1', to: '2025Q4', text: '模型偏差：2023–25 模型里出现了一次衰退，真实没有' },
  { key: 'gdpRealGrowthYoY', from: '2023Q1', to: '2025Q4', text: '模型偏差：2023–25 模型里出现了一次衰退，真实没有' },
];
/** Real (to now) / model / user comparison chart. modelFn maps a snapshot -> number. */
/** True when the real series has at least one number (a country can lack a series: e.g. AUS has no CAPE, so its chart is hidden, not drawn empty). */
export const hasReal = (ctx, key) => { const s = ctx.real && ctx.real.series && ctx.real.series[key]; return !!s && s.some(v => v != null && isFinite(v)); };
/** One quiet line under a tab's charts saying where the 真实 line comes from. Nothing for the USA (as before). */
export function dataNoteHtml(ctx) {
  const iso = currentCountry(ctx.sim);
  return iso === 'USA' ? '' : `<p class="pn-sub pn-src">真实线 = ${esc(countryInfo(iso).realData)}；模型是同一套规则，只换了这个国家的数据和几个参数。</p>`;
}
export function compareChart(host, ctx, { title, realKey, modelFn, fmt, note, height = 150 }) {
  if (!ctx.real || (realKey && !hasReal(ctx, realKey))) { host.innerHTML = ''; host.hidden = true; return; }   // no real data for this series here: hide the chart
  host.hidden = false;
  const t = ctx.sim.t, dates = ctx.real.dates, n = dates.length;
  const pad = arr => { const o = new Array(n).fill(null); arr.forEach((v, i) => { if (i < n) o[i] = v; }); return o; };
  const series = [];
  if (realKey && ctx.real.series[realKey]) series.push({ name: '真实', style: 'real', values: ctx.real.series[realKey].map((v, i) => (i <= t ? v : null)) });
  series.push({ name: '模型', style: 'model', values: pad(ctx.sim.history('model').map(modelFn)) });
  const uh = ctx.sim.history('user');
  if (uh && uh.length) series.push({ name: '你的版本', style: 'user', values: pad(uh.map(modelFn)) });
  const bands = currentCountry(ctx.sim) === 'USA' ? MODEL_GAPS.filter(b => b.key === realKey) : [];   // the 「模型偏差」 notes were written for the US run
  lineChart(host, { series, dates, reservedFrom: ctx.real.reservedFrom, currentDate: dates[Math.min(t, n - 1)], fmt, title, note, height, bands });
}
