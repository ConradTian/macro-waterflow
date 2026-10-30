// Tiny dependency-free SVG line chart (CONTRACT §3).
// lineChart(host, { series:[{name, values, style:'real'|'model'|'user'}], dates, reservedFrom,
//                   currentDate, height, fmt, title, zeroLine, bands:[{from,to,text}] })
// bands = small 「模型偏差」 notes: a light band over the quarters from..to plus a one-line text; shown once currentDate has reached `from`.
const W = 360;
const STYLE = {
  real:  { color: 'var(--text, #222)',        dash: '',    w: 1.8, tag: '实线' },
  model: { color: 'var(--accent, #2b6cb0)',   dash: '6 3', w: 1.8, tag: '虚线' },
  user:  { color: 'var(--c-repay, #d9730d)',  dash: '1.5 3', w: 2.2, tag: '点线' },
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function niceTicks(lo, hi, n = 4) {
  if (!isFinite(lo) || !isFinite(hi)) return [0, 1];
  if (hi === lo) { hi = lo + 1; }
  const raw = (hi - lo) / n, p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw) || raw;
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, out = [];
  for (let v = a; v <= b + step / 2; v += step) out.push(+v.toFixed(10));
  return out;
}
const defaultFmt = v => (Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
export const pctFmt = v => (v * 100).toFixed(Math.abs(v) < 0.1 ? 1 : 0) + '%';

export function lineChart(host, opts) {
  const { series = [], dates = [], reservedFrom, currentDate, height = 170, fmt = defaultFmt, title, note, bands = [] } = opts;
  const H = height, L = 38, R = 8, T = 8, B = 22;
  const n = dates.length || Math.max(0, ...series.map(s => s.values.length));
  let lo = Infinity, hi = -Infinity;
  series.forEach(s => s.values.forEach(v => { if (v != null && isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }));
  if (!isFinite(lo)) { host.innerHTML = '<div class="pn-empty">暂无数据</div>'; return; }
  const ticks = niceTicks(lo, hi, 4);
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const X = i => L + (n <= 1 ? 0 : (i / (n - 1)) * (W - L - R));
  const Y = v => T + (1 - (v - y0) / (y1 - y0 || 1)) * (H - T - B);
  let g = '';
  // reserved shading
  const ri = reservedFrom ? dates.indexOf(reservedFrom) : -1;
  if (ri >= 0) {
    g += `<rect x="${X(ri)}" y="${T}" width="${W - R - X(ri)}" height="${H - T - B}" class="pn-reserved"/>` +
      `<text x="${(X(ri) + W - R) / 2}" y="${T + 11}" text-anchor="middle" class="pn-ch-note">保留样本·示意</text>`;
  }
  // model-gap bands (drawn under the lines)
  const bandTexts = [];
  const cIdx = currentDate ? dates.indexOf(currentDate) : -1;
  bands.forEach(b => {
    const a = dates.indexOf(b.from);
    if (a < 0 || (cIdx >= 0 && cIdx < a)) return;
    let z = dates.indexOf(b.to); if (z < 0) z = n - 1;
    g += `<rect x="${X(a)}" y="${T}" width="${Math.max(2, X(z) - X(a))}" height="${H - T - B}" fill="var(--warn, #d9730d)" opacity=".13"><title>${esc(b.text)}</title></rect>`;
    const w = [...b.text].length * 9;
    const right = X(a) + w > W - R;
    bandTexts.push(`<text x="${right ? W - R - 2 : X(a)}" y="${T + 25}" text-anchor="${right ? 'end' : 'start'}" class="pn-ch-note" style="paint-order:stroke;stroke:var(--bg, #fff);stroke-width:2.5px">${esc(b.text)}</text>`);
  });
  ticks.forEach(v => {
    g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="pn-grid"/>` +
      `<text x="${L - 4}" y="${Y(v) + 3}" text-anchor="end" class="pn-ch-axis">${esc(fmt(v))}</text>`;
  });
  // x ticks: every 5 years at Q1
  dates.forEach((d, i) => {
    if (/Q1$/.test(d) && (+d.slice(0, 4)) % 5 === 0)
      g += `<text x="${X(i)}" y="${H - 7}" text-anchor="middle" class="pn-ch-axis">${d.slice(0, 4)}</text>`;
  });
  if (currentDate) {
    const ci = dates.indexOf(currentDate);
    if (ci >= 0) g += `<line x1="${X(ci)}" x2="${X(ci)}" y1="${T}" y2="${H - B}" class="pn-now"/>` +
      `<text x="${Math.min(X(ci) + 3, W - 24)}" y="${H - B - 3}" class="pn-ch-note">现在</text>`;
  }
  series.forEach(s => {
    const st = STYLE[s.style] || STYLE.model;
    let d = '', pen = false;
    s.values.forEach((v, i) => {
      if (v == null || !isFinite(v)) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`; pen = true;
    });
    if (d) g += `<path d="${d}" fill="none" stroke="${st.color}" stroke-width="${st.w}" stroke-dasharray="${st.dash}" stroke-linejoin="round"/>`;
  });
  g += bandTexts.join('');
  const legend = series.map(s => {
    const st = STYLE[s.style] || STYLE.model;
    return `<span class="pn-lg"><svg width="26" height="8" aria-hidden="true"><line x1="1" x2="25" y1="4" y2="4" stroke="${st.color}" stroke-width="2" stroke-dasharray="${st.dash}"/></svg>${esc(s.name)}（${st.tag}）</span>`;
  }).join('');
  host.innerHTML = `<figure class="pn-chart">${title ? `<figcaption>${esc(title)}</figcaption>` : ''}` +
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title || '折线图')}" preserveAspectRatio="xMidYMid meet">${g}</svg>` +
    `<div class="pn-legend">${legend}</div>${note ? `<div class="pn-sub">${esc(note)}</div>` : ''}</figure>`;
}
