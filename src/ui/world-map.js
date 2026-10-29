// 地图 page: a schematic world (not a GIS map) laid over the whole app. Seven lumped boxes = small reservoirs with four readings
// (资产 / 债务 / 利率 / 大环), pipes between them in the same visual language as the main diagram (dashed, animated, width = amount),
// and the USD as "the world's big reservoir" under the USA box. Data: src/data/world.js (annual, USD bn) + countries/index.js (readiness).
// app.js owns the open/close wiring (button, ?map=1, mw:map event); this module owns the DOM inside the host element.
//   openWorldMap(host, { year, select, country, onEnter(iso), onClose() })   closeWorldMap()   selectOnMap(iso|null)   isMapOpen()
// Selecting a box (tap) only highlights it and fills the card; only the card's 「进入…」 button calls onEnter.
import { WORLD } from '../data/world.js';
import { COUNTRY_DATA, COUNTRY_READY } from '../data/countries/index.js';

const ISOS = ['USA', 'GBR', 'EA', 'CHN', 'JPN', 'AUS', 'ROW'];
const KINDS = [['all', '全部', ''], ['trade', '贸易', 'goods'], ['capital', '资本', 'bond'], ['reserve', '储备', 'bond']];
const RES = [['USD', '美元', '--c-bond'], ['EUR', '欧元', '--c-credit'], ['JPY', '日元', '--c-repay'], ['GBP', '英镑', '--c-fiscal'],
  ['CNY', '人民币', '--c-goods'], ['AUD', '澳元', '--c-housing'], ['other', '其他', '--c-cash']];
const HOLDERS = ['JPN', 'CHN', 'GBR', 'EA', 'ROW'];
// box centres as fractions of the stage: wide = iPad / desktop (roughly where they sit on a globe), tall = phone
const POS_WIDE = { USA: [.15, .36], GBR: [.37, .12], EA: [.55, .24], CHN: [.74, .42], JPN: [.92, .18], AUS: [.84, .82], ROW: [.52, .75] };
const POS_TALL = { GBR: [.25, .09], EA: [.73, .13], USA: [.27, .30], CHN: [.74, .34], JPN: [.80, .55], ROW: [.38, .77], AUS: [.78, .87] };
const YMIN = 1995, YMAX = 2025;
const TOP_TRADE = 8;          // trade pipes shown in 全部
const TOP_TRADE_ONE = 14;     // ... and when 贸易 is the only kind

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = v => (typeof v === 'number' && isFinite(v)) ? v : null;
const nameOf = iso => WORLD.countries[iso]?.name || iso;
const fmtBn = v => v == null ? '—' : v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + '万亿' : Math.round(v) + '十亿';
const fmtPct0 = v => v == null ? '—' : Math.round(v * 100) + '%';
const fmtPct1 = v => v == null ? '—' : (v * 100).toFixed(1) + '%';

const st = { host: null, opts: null, year: 2008, sel: null, kind: 'all', open: false, last: null, ro: null, cover: {} };
let els = {};

/* ---------- data access ---------- */
const yi = () => clamp(WORLD.years.indexOf(st.year), 0, WORLD.years.length - 1);
const at = arr => (Array.isArray(arr) ? num(arr[yi()]) : null);
const ser = (iso, key) => at(WORLD.countries[iso]?.[key]);
const tradeV = (a, b) => at(WORLD.trade?.[a]?.[b]);
function readings(iso) {
  const c = WORLD.countries[iso] || {};
  const pvt = ser(iso, 'pvtDebtGdp'), gov = ser(iso, 'govDebtGdp');
  return { gdp: ser(iso, 'gdpUsd'), house: ser(iso, 'houseReal'), pvt, gov, debt: pvt != null && gov != null ? pvt + gov : null,
    rate: ser(iso, 'policyRate'), stage: c.longStage || null, fx: ser(iso, 'fxPerUsd'), ccy: c.ccy };
}

/* ---------- geometry ---------- */
function layout(W, H, tall) {
  const s = tall ? clamp(W / 390, 1, 1.25) : clamp(Math.min(W / 900, H / 560), 0.9, 1.4);
  const sf = clamp(s, 1, 1.25);                              // text scale
  const wMin = 112 * sf, wMax = wMin + 92 * s;
  const gmax = Math.max(1, ...ISOS.map(i => ser(i, 'gdpUsd') || 0));
  const P = tall ? POS_TALL : POS_WIDE, box = {};
  for (const iso of ISOS) {
    const g = ser(iso, 'gdpUsd');
    const w = g == null ? wMin : wMin + (wMax - wMin) * Math.sqrt(g / gmax);   // area-ish: side grows with sqrt(GDP), with a floor so the text fits
    const h = Math.max(70 * sf, w * 0.6);
    const cx = clamp(P[iso][0] * W, w / 2 + 6, W - w / 2 - 6), cy = clamp(P[iso][1] * H, h / 2 + 8, H - h / 2 - 8);
    box[iso] = { iso, cx, cy, w, h, x: cx - w / 2, y: cy - h / 2 };
  }
  const u = box.USA, pw = Math.max(u.w * 1.18, 176 * sf), ph = 112 * sf;
  const pool = { x: clamp(u.cx - pw / 2, 6, W - pw - 6), y: u.y + u.h + 20 * s, w: pw, h: ph };
  pool.cx = pool.x + pw / 2; pool.cy = pool.y + ph / 2;
  return { s, sf, box, pool, fs: 11 * sf };
}
function edge(a, b, pad) {                                  // where the ray from a's centre towards b's centre leaves a's rectangle
  const dx = b.cx - a.cx, dy = b.cy - a.cy;
  const t = Math.min(dx ? (a.w / 2 + pad) / Math.abs(dx) : 1e9, dy ? (a.h / 2 + pad) / Math.abs(dy) : 1e9);
  return [a.cx + dx * t, a.cy + dy * t];
}

/* ---------- pipes ---------- */
function collectPipes(L) {
  const out = [], kind = st.kind;
  if (kind === 'all' || kind === 'trade') {
    const all = [];
    for (const a of ISOS) for (const b of ISOS) {
      if (a === b) continue;
      const v = tradeV(a, b);
      if (v != null && v > 0) all.push({ k: 'trade', from: a, to: b, v });
    }
    all.sort((p, q) => q.v - p.v);
    const keep = new Set(all.slice(0, kind === 'trade' ? TOP_TRADE_ONE : TOP_TRADE));
    if (st.sel) all.filter(p => p.from === st.sel || p.to === st.sel).slice(0, 6).forEach(p => keep.add(p));
    out.push(...all.filter(p => keep.has(p)));
  }
  if (kind === 'all' || kind === 'capital') {
    for (const h of HOLDERS) {
      const v = at(WORLD.ustForeign?.[h]);
      if (v != null && v > 0) out.push({ k: 'cap', from: h, to: 'POOL', v });
    }
  }
  const mx = { trade: 1, cap: 1 };
  for (const p of out) mx[p.k] = Math.max(mx[p.k], p.v);
  for (const p of out) {
    const A = L.box[p.from], B = p.to === 'POOL' ? L.pool : L.box[p.to];
    const [x0, y0] = edge(A, B, 3), [x1, y1] = edge(B, A, 4);
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const k = Math.max(p.k === 'cap' ? 0.1 * len : 0.11 * len, 46), nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
    p.c = [(x0 + x1) / 2 + nx * k, (y0 + y1) / 2 + ny * k]; p.p0 = [x0, y0]; p.p1 = [x1, y1];
    p.f = Math.sqrt(p.v / mx[p.k]);                           // 0..1; width and speed follow sqrt so a 100x range stays drawable
    p.w = 1.6 + 11 * p.f * Math.min(1.25, L.s);
    p.hl = !!st.sel && (p.from === st.sel || p.to === st.sel || (p.to === 'POOL' && st.sel === 'USA'));
  }
  return out;
}
function pipeSvg(p) {
  const [x0, y0] = p.p0, [x1, y1] = p.p1, [cx, cy] = p.c;
  const d = `M${x0.toFixed(1)} ${y0.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  let ux = x1 - cx, uy = y1 - cy; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
  const Ln = 5 + p.w * 0.7, Hh = 3 + p.w * 0.65, bx = x1 - ux * Ln, by = y1 - uy * Ln;
  const arrow = `${x1.toFixed(1)},${y1.toFixed(1)} ${(bx - uy * Hh).toFixed(1)},${(by + ux * Hh).toFixed(1)} ${(bx + uy * Hh).toFixed(1)},${(by - ux * Hh).toFixed(1)}`;
  const dur = (15 / (14 + 46 * p.f)).toFixed(2);
  const cls = p.k === 'cap' ? 'bond' : 'goods';
  const mx = 0.25 * x0 + 0.5 * cx + 0.25 * x1, my = 0.25 * y0 + 0.5 * cy + 0.25 * y1;
  const lab = fmtBn(p.v), cw = lab.length * 6.4 + 10;
  const chip = (p.hl || p.f > 0.62) ? `<g class="wm-chip ${cls}" transform="translate(${mx.toFixed(1)} ${my.toFixed(1)})"><rect x="${-cw / 2}" y="-9" width="${cw}" height="17" rx="8.5"/><text y="3.5" text-anchor="middle">${lab}</text></g>` : '';
  const what = p.k === 'cap' ? `${nameOf(p.from)}持有美债 ${lab}美元` : `${nameOf(p.from)} → ${nameOf(p.to)} 出口 ${lab}美元`;
  return `<g class="wm-pipe ${cls}${p.hl ? ' hl' : ''}" data-k="${p.k}" data-from="${p.from}" data-to="${p.to}"><title>${esc(what)}</title>
    <path class="wm-bed" d="${d}" stroke-width="${p.w.toFixed(2)}"/><path class="wm-dash" d="${d}" stroke-width="${Math.max(1, p.w * 0.62).toFixed(2)}" style="animation-duration:${dur}s"/>
    <polygon class="wm-arrow" points="${arrow}"/>${chip}</g>`;
}

/* ---------- boxes + pool ---------- */
function boxSvg(b, L) {
  const r = readings(b.iso), sel = st.sel === b.iso, f = L.fs;
  const lvl = r.debt == null ? 0 : clamp(r.debt / 4.5, 0.06, 1);
  const wy = b.y + b.h * (1 - lvl);
  const col2 = b.x + b.w / 2 + 2, col1 = b.x + 9;
  const gdp = r.gdp == null ? '' : `<text class="wm-g" x="${(b.x + b.w - 8).toFixed(1)}" y="${(b.y + f + 7).toFixed(1)}" text-anchor="end">GDP ${fmtBn(r.gdp)}</text>`;
  const y1 = b.y + f * 1.3 + 22, y2 = y1 + f * 1.55 + 2;
  const cell = (x, y, k, v) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}"><tspan class="wm-k">${k} </tspan><tspan class="wm-v">${v}</tspan></text>`;
  const stage = r.stage?.mark ? esc(r.stage.mark) : '—';
  return `<g class="wm-box${sel ? ' sel' : ''}" data-iso="${b.iso}" tabindex="0" role="button" aria-pressed="${sel}" aria-label="${esc(nameOf(b.iso))}">
    <clipPath id="wmc-${b.iso}"><rect x="${b.x.toFixed(1)}" y="${b.y.toFixed(1)}" width="${b.w.toFixed(1)}" height="${b.h.toFixed(1)}" rx="10"/></clipPath>
    <rect class="wm-rect" x="${b.x.toFixed(1)}" y="${b.y.toFixed(1)}" width="${b.w.toFixed(1)}" height="${b.h.toFixed(1)}" rx="10"/>
    <rect class="wm-water" clip-path="url(#wmc-${b.iso})" x="${b.x.toFixed(1)}" y="${wy.toFixed(1)}" width="${b.w.toFixed(1)}" height="${(b.y + b.h - wy).toFixed(1)}"/>
    <text class="wm-n" x="${col1.toFixed(1)}" y="${(b.y + f + 7).toFixed(1)}">${esc(nameOf(b.iso))}</text>${gdp}
    ${cell(col1, b.y + f + 7 + f * 1.55 + 3, '资产', r.house == null ? '—' : Math.round(r.house))}
    ${cell(col2, b.y + f + 7 + f * 1.55 + 3, '债务', fmtPct0(r.debt))}
    ${cell(col1, b.y + f + 7 + (f * 1.55 + 3) * 2, '利率', fmtPct1(r.rate))}
    ${cell(col2, b.y + f + 7 + (f * 1.55 + 3) * 2, '大环', stage)}
  </g>`;
}
function poolSvg(L) {
  const p = L.pool, f = L.fs, ri = yi();
  const usd = at(WORLD.reserves?.USD);
  const segs = RES.map(([k, nm, tok]) => [k, nm, tok, at(WORLD.reserves?.[k])]);
  const bw = p.w - 16, by = p.y + p.h - 34 * L.sf;
  let x = p.x + 8, bar = '';
  for (const [k, , tok, v] of segs) {
    if (v == null || v <= 0) continue;
    const w = bw * v;
    bar += `<rect x="${x.toFixed(1)}" y="${by.toFixed(1)}" width="${Math.max(0.5, w).toFixed(1)}" height="8" style="fill:var(${tok})"/>`;
    x += w;
  }
  const legend = segs.filter(s => s[3] != null && s[3] > 0.004).map(([, nm, tok, v], i) => {
    const per = 3, cw = bw / per;
    return `<g transform="translate(${(p.x + 8 + (i % per) * cw).toFixed(1)} ${(by + 18 + Math.floor(i / per) * (f + 3)).toFixed(1)})"><rect y="-7" width="7" height="7" rx="1.5" style="fill:var(${tok})"/><text x="10" class="wm-lg">${nm} ${Math.round(v * 100)}%</text></g>`;
  }).join('');
  const ttl = usd == null ? '世界储备水库' : `世界储备水库 · 美元占 ${Math.round(usd * 100)}%`;
  const lvl = usd == null ? 0.5 : clamp(usd, 0.1, 1);
  const ih = p.h - 34 * L.sf - 18;                          // water inside the upper part
  return `<g class="wm-pool${st.kind === 'trade' ? ' dim' : ''}${st.kind === 'reserve' ? ' hl' : ''}">
    <title>${esc('各国央行外汇储备：美元份额（IMF COFER）')}</title>
    <clipPath id="wmc-pool"><rect x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" width="${p.w.toFixed(1)}" height="${p.h.toFixed(1)}" rx="12"/></clipPath>
    <rect class="wm-prect" x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" width="${p.w.toFixed(1)}" height="${p.h.toFixed(1)}" rx="12"/>
    <rect class="wm-pwater" clip-path="url(#wmc-pool)" x="${p.x.toFixed(1)}" y="${(p.y + 20 + ih * (1 - lvl)).toFixed(1)}" width="${p.w.toFixed(1)}" height="${(ih * lvl + 2).toFixed(1)}"/>
    <text class="wm-pt" x="${(p.x + 8).toFixed(1)}" y="${(p.y + f + 4).toFixed(1)}">${esc(ttl)}</text>
    <text class="wm-ps" x="${(p.x + 8).toFixed(1)}" y="${(p.y + f + 4 + f * 1.3).toFixed(1)}">美国国债池 · 外国人买美债的水从上面流进来</text>
    ${bar}${legend}</g>`;
}

/* ---------- card ---------- */
function topPartners(iso) {
  const out = [];
  for (const j of ISOS) {
    if (j === iso) continue;
    const ex = tradeV(iso, j), im = tradeV(j, iso);
    if (ex == null && im == null) continue;
    out.push({ j, ex, im, tot: (ex || 0) + (im || 0) });
  }
  return out.sort((a, b) => b.tot - a.tot).slice(0, 3);
}
function cardHtml() {
  const iso = st.sel;
  if (!iso) {
    return `<div class="wm-hint"><b>点一个框，看它的情况</b>
      <p class="wm-more">框里四个读数：<b>资产</b>（实际房价指数）、<b>债务</b>（私人 + 政府，占 GDP）、<b>利率</b>（政策利率）、<b>大环</b>（长周期位置，现在的）。</p>
      <p class="wm-more">框越大，GDP 越大。水位越高，债务越多。</p>
      <p><i class="wm-sw goods"></i> 绿管 = 贸易（出口，只画最大的几条）<br><i class="wm-sw bond"></i> 蓝紫管 = 外国人买美债，流进美国的国债池<br>管越宽，水量越大。</p>
      <p class="wm-mut wm-more">只有卡片里的「进入」按钮才会打开那个国家的水流图。</p></div>`;
  }
  const r = readings(iso), nm = nameOf(iso);
  const parts = topPartners(iso).map(p => `<li><b>${esc(nameOf(p.j))}</b> 合计 ${fmtBn(p.tot)}美元<small>出口 ${fmtBn(p.ex)} · 进口 ${fmtBn(p.im)}</small></li>`).join('');
  const fx = iso === 'USA' ? '本币就是美元' : r.fx == null || !r.ccy || r.ccy === 'mixed' ? '—' : `1 美元 = ${r.fx >= 100 ? r.fx.toFixed(0) : r.fx.toFixed(2)} ${esc(r.ccy)}`;
  const ready = !!COUNTRY_READY[iso];
  const here = st.opts?.country || 'USA';
  const label = ready ? `进入 ${esc(nm)} 的水流图 →` : iso === 'ROW' ? '合并项，没有单独的水流图' : '细图制作中';
  const cov = ready ? '' : `<p class="wm-cover" data-cover="${iso}">${esc(st.cover[iso] || '')}</p>`;
  const res = st.year >= (WORLD.reservedFrom || 2022) ? ' <span class="wm-res">保留样本</span>' : '';
  return `<div class="wm-cardin" data-iso="${iso}">
    <h3>${esc(nm)}<small>${esc(iso)} · ${st.year}${res}</small></h3>
    <dl class="wm-rd">
      <div><dt>资产</dt><dd>${r.house == null ? '—' : Math.round(r.house)}<small>实际房价，2010 = 100</small></dd></div>
      <div><dt>债务</dt><dd>${fmtPct0(r.debt)}<small>占 GDP：私人 ${fmtPct0(r.pvt)} + 政府 ${fmtPct0(r.gov)}</small></dd></div>
      <div><dt>利率</dt><dd>${fmtPct1(r.rate)}<small>政策利率</small></dd></div>
      <div><dt>大环</dt><dd>${r.stage?.mark ? esc(r.stage.mark) : '—'}<small>${r.stage?.text ? esc(r.stage.text) : '这个国家的大环位置还没标'}</small></dd></div>
    </dl>
    <p class="wm-mut wm-note">大环是「现在」的位置，不跟着年份动。</p>
    <p class="wm-line"><b>GDP</b> ${fmtBn(r.gdp)}美元 · <b>汇率</b> ${fx}</p>
    ${parts ? `<div class="wm-partners"><b>贸易对手前三</b><ol>${parts}</ol></div>` : '<p class="wm-mut">这一年没有贸易数据。</p>'}
    <div class="wm-act"><button type="button" class="btn primary wm-enter" data-act="enter" data-iso="${iso}"${ready ? '' : ' disabled'}>${label}</button>
    ${cov}</div>${iso === 'USA' && here === 'USA' ? '<p class="wm-mut wm-note">美国就是主屏上的水流图，点进入会回到它。</p>' : ''}
  </div>`;
}
async function loadCoverage(iso) {                         // cheap: share of non-null cells in the country data file, if it exists yet
  if (st.cover[iso] != null && st.cover[iso] !== '…') return;
  st.cover[iso] = '…';
  let msg;
  try {
    const d = await COUNTRY_DATA[iso]();
    let tot = 0, got = 0, n = 0;
    for (const k of Object.keys(d)) {
      const a = d[k];
      if (Array.isArray(a) && a.length > 20 && typeof a[0] !== 'string' && k !== 'dates') { n++; tot += a.length; got += a.filter(v => v != null).length; }
    }
    msg = n ? `数据文件已有：${n} 条序列，覆盖 ${Math.round(100 * got / tot)}%` : '数据文件已有，还没读到序列';
  } catch (e) { msg = iso === 'ROW' ? '' : '数据文件还没生成'; }
  st.cover[iso] = msg;
  const p = els.card && els.card.querySelector(`[data-cover="${iso}"]`);
  if (p) p.textContent = msg;
}

/* ---------- render ---------- */
function stageSize() {
  const W = Math.max(300, els.stage.clientWidth || 360);
  const tall = W < 640;
  const side = getComputedStyle(els.body).display === 'grid';   // card is a side column: stage height is fixed by the page
  const H = tall ? clamp(Math.round(W * 1.55), 580, 760) : side ? Math.max(480, els.stage.clientHeight || 600) : Math.max(520, Math.round(W * 0.72));
  return { W, H, tall };
}
function renderMap() {
  if (!st.open) return;
  const { W, H, tall } = stageSize();
  const L = layout(W, H, tall);
  const pipes = collectPipes(L);
  const nb = new Set(); for (const p of pipes) if (p.hl) { nb.add(p.from); if (p.to !== 'POOL') nb.add(p.to); }
  els.svg.setAttribute('width', W); els.svg.setAttribute('height', H); els.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  els.svg.style.setProperty('--wm-fs', L.fs.toFixed(1) + 'px');
  els.svg.classList.toggle('has-sel', !!st.sel);
  els.svg.dataset.kind = st.kind;
  const stateBox = iso => (st.sel && iso !== st.sel && nb.has(iso)) ? ' nb' : '';
  els.svg.innerHTML = `<rect class="wm-bg" x="0" y="0" width="${W}" height="${H}"/>
    <g class="wm-pipes">${pipes.sort((a, b) => a.hl - b.hl).map(pipeSvg).join('')}</g>
    ${poolSvg(L)}
    <g class="wm-boxes">${ISOS.map(i => boxSvg(L.box[i], L).replace('class="wm-box', `class="wm-box${stateBox(i)}`)).join('')}</g>`;
  st.last = { W, H };
  els.svg.dataset.pipes = pipes.length;
}
function renderCard() {
  els.card.innerHTML = cardHtml();
  els.card.dataset.sel = st.sel || '';
  if (st.sel && !COUNTRY_READY[st.sel]) loadCoverage(st.sel);
}
function renderCtl() {
  els.yv.textContent = st.year;
  els.slider.value = st.year;
  const res = st.year >= (WORLD.reservedFrom || 2022);
  els.res.hidden = !res;
  els.seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.kind === st.kind)));
}
function renderAll() { renderCtl(); renderMap(); renderCard(); }

/* ---------- selection ---------- */
export function selectOnMap(iso, scroll = true) {
  st.sel = iso && ISOS.includes(iso) ? iso : null;
  if (st.open) {
    renderMap(); renderCard();
    if (st.sel && scroll) {                                  // phone: the card sits under the stage, keep the selected box in view above it
      const g = els.svg.querySelector(`.wm-box[data-iso="${st.sel}"]`);
      if (g) { const r = g.getBoundingClientRect(), s = els.stage.getBoundingClientRect(); if (r.top < s.top + 4 || r.bottom > s.bottom - 4) els.stage.scrollTop += (r.top + r.bottom) / 2 - (s.top + s.bottom) / 2; }
    }
  }
  document.dispatchEvent(new CustomEvent('mw:map-select', { detail: { iso: st.sel } }));
}

/* ---------- open / close ---------- */
function buildDom(host) {
  const home = st.opts.country && st.opts.country !== 'USA' ? `${nameOf(st.opts.country)}水流图` : '美国水流图';
  host.innerHTML = `
    <div class="wm-top">
      <button type="button" class="wm-back" data-act="back">← 回到${esc(home)}</button>
      <h2 class="wm-title">🌍 世界地图<small>七个水库，管子 = 钱和货怎么流</small></h2>
      <div class="wm-seg" role="group" aria-label="管子种类">${KINDS.map(([k, nm, c]) => `<button type="button" data-kind="${k}" aria-pressed="false">${c ? `<i class="wm-sw ${c}"></i>` : ''}${nm}</button>`).join('')}</div>
    </div>
    <div class="wm-ctl">
      <label class="wm-year"><span class="wm-yl">年份 <b class="wm-yv"></b><i class="wm-res" hidden>保留样本</i></span>
        <input type="range" class="wm-slider" min="${YMIN}" max="${YMAX}" step="1" aria-label="年份"></label>
    </div>
    <div class="wm-body"><div class="wm-stage"><svg class="wm-svg" role="img" aria-label="世界地图：七个水库和它们之间的管子"></svg></div><aside class="wm-card" aria-live="polite"></aside></div>`;
  els = { host, stage: host.querySelector('.wm-stage'), svg: host.querySelector('.wm-svg'), card: host.querySelector('.wm-card'), body: host.querySelector('.wm-body'),
    slider: host.querySelector('.wm-slider'), yv: host.querySelector('.wm-yv'), res: host.querySelector('.wm-res'), seg: host.querySelector('.wm-seg') };
  host.onclick = onClick;
  els.slider.oninput = () => { st.year = clamp(+els.slider.value, YMIN, YMAX); renderAll(); };
  els.svg.addEventListener('keydown', e => {
    const g = e.target.closest && e.target.closest('.wm-box');
    if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectOnMap(g.dataset.iso); }
  });
}
function onClick(e) {
  const t = e.target;
  const act = t.closest && t.closest('[data-act]');
  if (act && act.dataset.act === 'back') return close(true);
  if (act && act.dataset.act === 'enter') { if (!act.disabled && st.opts.onEnter) st.opts.onEnter(act.dataset.iso); return; }
  const kb = t.closest && t.closest('.wm-seg button');
  if (kb) { st.kind = kb.dataset.kind; renderCtl(); renderMap(); return; }
  if (t.closest && t.closest('.wm-svg')) {
    const g = t.closest('.wm-box');
    if (g) selectOnMap(g.dataset.iso); else if (st.sel) selectOnMap(null);     // tapping empty space deselects
  }
}
function onKey(e) { if (e.key === 'Escape' && st.open && !document.querySelector('.sheet.open')) close(true); }

export function openWorldMap(host, opts = {}) {
  st.host = host; st.opts = opts; st.open = true;
  st.year = clamp(Math.round(opts.year || 2025), YMIN, YMAX);
  st.sel = opts.select && ISOS.includes(opts.select) ? opts.select : null;
  st.kind = KINDS.some(k => k[0] === opts.kind) ? opts.kind : 'all';
  if (!document.querySelector('link[href*="world.css"]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('../../assets/css/world.css', import.meta.url).href; document.head.appendChild(l);
  }
  buildDom(host);
  host.hidden = false;
  document.body.dataset.map = '1';
  document.addEventListener('keydown', onKey);
  renderAll();
  if (st.sel) selectOnMap(st.sel);
  if (typeof ResizeObserver === 'function') {
    st.ro = new ResizeObserver(() => {
      if (!st.open) return;
      const { W, H } = stageSize();
      if (!st.last || Math.abs(W - st.last.W) > 2 || Math.abs(H - st.last.H) > 2) renderMap();
    });
    st.ro.observe(els.stage);
  }
}
function close(notify) {
  if (!st.open) return;
  st.open = false;
  if (st.ro) { st.ro.disconnect(); st.ro = null; }
  document.removeEventListener('keydown', onKey);
  st.host.hidden = true; st.host.innerHTML = '';
  delete document.body.dataset.map;
  if (notify && st.opts.onClose) st.opts.onClose();
}
export function closeWorldMap() { close(false); }
export const isMapOpen = () => st.open;
export const MAP_COUNTRIES = ISOS;
