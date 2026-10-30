// 历史盲测: HTML / SVG builders (strings only). Same visual language as the main diagram (tanks with water, the cycle dials),
// drawn here because annual data has LEVELS only (no flows) and flow.js is the quarterly simulator.
import { LONG_ORDER, LONG_NAME, SHORT_ORDER, SHORT_NAME, SHORT_SIGNALS } from './model.js';

export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ok = v => typeof v === 'number' && isFinite(v);
const f1 = n => (+n).toFixed(1);
export const P = (v, d = 1) => (ok(v) ? (v * 100).toFixed(d) + '%' : '—');
export const SP = (v, d = 1) => (ok(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(d) + '%' : '—');   // signed percent
const clamp01 = x => Math.max(0, Math.min(1, x));

/** a clickable term: data-term = a concept card of src/data/concepts.js, data-bterm = a blind-only explainer (./concept.js) */
export const term = (id, label, local = false) => `<button type="button" class="term" ${local ? 'data-bterm' : 'data-term'}="${esc(id)}">${esc(label)}</button>`;

/* ---------- the water diagram: five tanks, levels only ---------- */
// one tank: viewBox 60 × 112, tank y 6..106. lines = [{ v (0..1 of full), label, cls }]
function tankSvg(fill, cls, lines = [], over = false) {
  const top = 6, H = 100, x = 8, W = 44;
  const f = clamp01(fill ?? 0), y = top + H * (1 - f);
  let s = `<rect class="bl-tank-box" x="${x}" y="${top}" width="${W}" height="${H}" rx="5"/>`;
  if (fill != null) s += `<rect class="bl-water ${cls}" x="${x + 1}" y="${f1(y)}" width="${W - 2}" height="${f1(Math.max(0, top + H - y - 1))}" rx="3"/>`;
  if (fill != null && f > 0.02) s += `<path class="bl-wave ${cls}" d="M${x + 1} ${f1(y)} q5.5 -2.4 11 0 t11 0 t11 0 t9 0"/>`;
  if (over) s += `<path class="bl-spill ${cls}" d="M${x + W - 2} ${top + 1} q8 2 10 14 M${x + 2} ${top + 1} q-8 2 -10 14"/>`;
  for (const L of lines) {
    const ly = top + H * (1 - clamp01(L.v));
    s += `<line class="bl-tline ${L.cls || ''}" x1="${x - 4}" y1="${f1(ly)}" x2="${x + W + 4}" y2="${f1(ly)}"/>`;
    if (L.label) s += `<text class="bl-tlab ${L.cls || ''}" x="${x + W - 2}" y="${f1(ly - 2.5)}" text-anchor="end">${esc(L.label)}</text>`;
  }
  if (fill == null) s += `<text class="bl-tlab" x="30" y="60" text-anchor="middle">没有数据</text>`;
  return `<svg class="bl-tsvg" viewBox="0 0 60 112" aria-hidden="true">${s}</svg>`;
}
function tankCell({ termId, name, value, svg, sub }) {
  return `<div class="bl-tank" data-term="${termId}" role="button" tabindex="0" aria-label="${esc(name)} ${esc(value)}">` +
    `<div class="bl-tv">${esc(value)}</div>${svg}<div class="bl-tn">${name}</div>${sub ? `<div class="bl-ts">${esc(sub)}</div>` : ''}</div>`;
}
export function tanksHtml(card) {
  const L = card.view.levels;
  const GDP = 2.5;   // 私人 / 政府债务 share one scale: full at 250% of GDP
  const gl = [{ v: 1 / GDP, label: '100%' }, { v: 2 / GDP, label: '200%' }];
  const eqMax = 100, rMax = 0.16;
  const cpiLine = ok(L.cpiYoY) ? [{ v: Math.max(0, L.cpiYoY) / rMax, label: L.cpiYoY < 0 ? '通胀<0' : '通胀', cls: 'cpi' }] : [];
  const cells = [
    tankCell({ termId: 'pvtDebtGdp', name: '私人债务<br>/GDP', value: P(L.creditGdp, 0),
      svg: tankSvg(ok(L.creditGdp) ? L.creditGdp / GDP : null, 'credit', gl, L.creditGdp > GDP) }),
    tankCell({ termId: 'govDebtGdp', name: '政府债务<br>/GDP', value: P(L.govDebtGdp, 0),
      svg: tankSvg(ok(L.govDebtGdp) ? L.govDebtGdp / GDP : null, 'gov', gl, L.govDebtGdp > GDP) }),
    tankCell({ termId: 'priceToIncome', name: '房价<br>/收入', value: ok(L.houseToIncome) ? L.houseToIncome.toFixed(2) + '×' : '—', sub: '1× = 近 30 年平均',
      svg: tankSvg(ok(L.houseToIncome) ? L.houseToIncome / 2 : null, 'house', [{ v: 0.5, label: '平均', cls: 'avg' }], L.houseToIncome > 2) }),
    tankCell({ termId: 'equityAsset', name: '股票<br>估值', value: ok(L.equityVal) ? Math.round(L.equityVal) + ' 倍' : '—', sub: '股价 ÷ 股息',
      svg: tankSvg(ok(L.equityVal) ? L.equityVal / eqMax : null, 'equity', [{ v: 0.5, label: '50' }], L.equityVal > eqMax) }),
    tankCell({ termId: 'policyRate', name: '短期<br>利率', value: P(L.policyRate), sub: ok(L.cpiYoY) ? `虚线 = 通胀 ${P(L.cpiYoY)}` : '',
      svg: tankSvg(ok(L.policyRate) ? Math.max(0, L.policyRate) / rMax : null, 'rate', cpiLine, L.policyRate > rMax) }),
  ];
  return `<div class="bl-tanks">${cells.join('')}</div>`;
}

/** 其他读数: 通胀 / 实际利率 / 失业率 / 汇率 */
export function readingsHtml(card) {
  const L = card.view.levels;
  const it = [
    [term('cpi', '通胀'), P(L.cpiYoY)],
    [term('realRate', '实际利率'), SP(L.realRate)],
    [term('unemployment', '失业率'), P(L.unemployment)],
  ];
  if (card.iso !== 'USA' && ok(L.fxPerUsd)) it.push([term('fx', '汇率'), `1 美元 = ${L.fxPerUsd >= 20 ? Math.round(L.fxPerUsd) : L.fxPerUsd.toFixed(2)} ${{ JPN: '日元', AUS: '澳元', CHN: '人民币' }[card.iso] || ''}`]);
  return `<div class="bl-reads">${it.map(([k, v]) => `<span class="bl-read">${k} <b>${esc(v)}</b></span>`).join('')}</div>`;
}

/** GDP 离趋势: a centred bar, −12% .. +6% */
export function gapHtml(card) {
  const g = card.view.gdpGap;
  if (!ok(g)) return '';
  const lo = -0.12, hi = 0.06, pos = v => (clamp01((v - lo) / (hi - lo)) * 100).toFixed(1);
  const z = pos(0), p = pos(g);
  const left = Math.min(+z, +p), width = Math.abs(+p - +z);
  const txt = Math.abs(g) < 0.005 ? '贴着趋势' : g > 0 ? `比趋势高 ${P(g)}（偏热）` : `比趋势低 ${P(-g)}（有闲置）`;
  return `<div class="bl-gap"><div class="bl-gap-h">${term('outputGap', 'GDP 离趋势')} <b>${esc(txt)}</b></div>` +
    `<div class="bl-gap-bar" aria-hidden="true"><i class="bl-gap-z" style="left:${z}%"></i><i class="bl-gap-f ${g < 0 ? 'neg' : 'pos'}" style="left:${left}%;width:${width.toFixed(1)}%"></i>` +
    `<i class="bl-gap-dot" style="left:${p}%"></i></div><div class="bl-gap-ax"><span>−12%</span><span>0</span><span>+6%</span></div></div>`;
}

/** 相对历史位置: 4 percentile bars (own history up to that year) */
export function pctHtml(card) {
  const pc = card.view.pct, L = card.view.levels;
  const rows = [
    ['creditGdp', term('pvtDebtGdp', '私人债务/GDP'), P(L.creditGdp, 0), '全部历史'],
    ['houseToIncome', term('priceToIncome', '房价/收入'), ok(L.houseToIncome) ? L.houseToIncome.toFixed(2) + '×' : '—', '近 30 年'],
    ['equityVal', term('equityAsset', '股票估值'), ok(L.equityVal) ? Math.round(L.equityVal) + ' 倍' : '—', '近 30 年'],
    ['realRate', term('realRate', '实际利率'), SP(L.realRate), '全部历史'],
  ];
  const word = v => (v >= 0.8 ? '偏高' : v <= 0.2 ? '偏低' : '中间');
  return `<div class="bl-pct">${rows.map(([k, nm, lv, span]) => {
    const v = pc[k];
    if (!ok(v)) return `<div class="bl-prow off"><div class="bl-pk">${nm} <small>${esc(lv)}</small></div><div class="bl-pnone">历史太短，不显示</div></div>`;
    return `<div class="bl-prow" data-k="${k}"><div class="bl-pk">${nm} <small>${esc(lv)}</small><span class="bl-pv">${Math.round(v * 100)} 分位 · ${word(v)}</span></div>` +
      `<div class="bl-pbar" aria-hidden="true"><i class="bl-plo"></i><i class="bl-phi"></i><i class="bl-pdot ${v >= 0.8 ? 'hi' : v <= 0.2 ? 'lo' : ''}" style="left:${(v * 100).toFixed(1)}%"></i></div>` +
      `<div class="bl-pax"><span>历史最低</span><span>${esc(span)}</span><span>最高</span></div></div>`;
  }).join('')}</div>`;
}

/* ---------- dials (the framework's call hidden until the reveal) ---------- */
const polar = (cx, cy, R, deg) => [cx + R * Math.cos(deg * Math.PI / 180), cy + R * Math.sin(deg * Math.PI / 180)];
function arrowDir(x, y, dx, dy, cls = 'bl-arrow') {
  const deg = Math.atan2(dy, dx) * 180 / Math.PI + 90;
  return `<path d="M-4.5 4 L0 -5 L4.5 4 Z" class="${cls}" transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(deg)})"/>`;
}
function edge(A, B, r = 20) {
  const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
  const x1 = A.x + ux * r, y1 = A.y + uy * r, x2 = B.x - ux * r, y2 = B.y - uy * r;
  return `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" class="bl-edge"/>` + arrowDir(x1 + (x2 - x1) * 0.55, y1 + (y2 - y1) * 0.55, dx, dy);
}
function nodeSvg(n, attr, isPick, isCall) {
  return `<g class="bl-node${isPick ? ' pick' : ''}${isCall ? ' call' : ''}" ${attr} role="button" tabindex="0" aria-label="${esc(n.aria)}">` +
    `<circle class="bl-hit" cx="${f1(n.x)}" cy="${f1(n.y)}" r="26"/>` +
    `<circle cx="${f1(n.x)}" cy="${f1(n.y)}" r="${isCall ? 20 : 17}"/>` +
    `<text x="${f1(n.x)}" y="${f1(n.y + 5)}" text-anchor="middle" class="bl-glyph">${esc(n.glyph)}</text>` +
    (isPick ? `<text x="${f1(n.x + 17)}" y="${f1(n.y - 15)}" class="bl-you" text-anchor="middle">你</text>` : '') + `</g>` +
    `<text x="${f1(n.x + (n.dx || 0))}" y="${f1(n.y + (n.dy || 0))}" text-anchor="${n.anchor || 'middle'}" class="bl-nm${isCall ? ' call' : ''}">${esc(n.name)}</text>`;
}

/** 大周期 dial. pick = { long, fork } of the player (may be partial); call = framework call (only after the reveal) */
export function longDialSvg(pick = {}, call = null) {
  const cx = 150, cy = 135, R = 76, N = {};
  LONG_ORDER.forEach((s, i) => {
    const a = -90 + i * 60, [x, y] = polar(cx, cy, R, a), c = Math.cos(a * Math.PI / 180), sn = Math.sin(a * Math.PI / 180);
    N[s] = { x, y, glyph: s, name: LONG_NAME[s], aria: `大周期 ${s} ${LONG_NAME[s]}`, anchor: Math.abs(c) < 0.3 ? 'middle' : c > 0 ? 'start' : 'end',
      dx: Math.abs(c) < 0.3 ? 0 : c > 0 ? 28 : -28, dy: Math.abs(c) < 0.3 ? (sn < 0 ? -28 : 38) : 4 };
  });
  let g = LONG_ORDER.map((s, i) => edge(N[s], N[LONG_ORDER[(i + 1) % 6]])).join('');
  const n1 = N['①'], n2 = N['②'], n5 = N['⑤'];
  const fk = (k) => `${pick.fork === k ? ' pick' : ''}${call && call.fork === k ? ' call' : ''}`;
  const sx = n2.x + 10, sy = n2.y - 17, qx = n2.x + 34, qy = n1.y - 31, ex = n1.x + 17, ey = n1.y - 8;
  const midY = (n2.y + n5.y) / 2;
  g += `<g class="bl-fk bl-fk1${fk('B1')}" data-pick-fork="B1" role="button" tabindex="0" aria-label="岔路 B1 溢出（通胀）">` +
    `<path d="M${f1(sx)} ${f1(sy)} Q${f1(qx)} ${f1(qy)} ${f1(ex)} ${f1(ey)}" class="bl-fk-l"/>${arrowDir(ex, ey, ex - qx, ey - qy, 'bl-fk-a')}` +
    `<text x="${f1(n2.x + 26)}" y="${f1(n1.y - 13)}" class="bl-fk-t">B1 溢出（通胀）</text></g>` +
    `<g class="bl-fk bl-fk2${fk('B2')}" data-pick-fork="B2" role="button" tabindex="0" aria-label="岔路 B2 跌破吸程线（缩水，通缩）">` +
    `<line x1="${f1(n2.x)}" y1="${f1(n2.y + 20)}" x2="${f1(n5.x)}" y2="${f1(n5.y - 20)}" class="bl-fk-l"/>${arrowDir(n5.x, n5.y - 28, 0, 1, 'bl-fk-a')}` +
    `<text x="${f1(n2.x + 9)}" y="${f1(midY + 4)}" class="bl-fk-t">B2 跌破吸程线</text></g>`;
  for (const s of LONG_ORDER) g += nodeSvg(N[s], `data-pick-long="${s}"`, pick.long === s, call && call.long === s);
  const c1 = call ? `${call.long} ${LONG_NAME[call.long] || ''}` : pick.long ? `${pick.long} ${LONG_NAME[pick.long]}` : '？';
  const c2 = call ? `框架的判断${call.fork ? ' + ' + call.fork : ''}` : pick.long ? `你选的${pick.fork && pick.fork !== 'none' ? ' + ' + pick.fork : ''}` : '点一个圈';
  g += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" class="bl-c1">${esc(c1)}</text><text x="${cx}" y="${cy + 14}" text-anchor="middle" class="bl-c2">${esc(c2)}</text>`;
  return `<svg viewBox="-40 0 380 270" class="bl-dial" role="group" aria-label="大周期表盘">${g}</svg>`;
}

/** 小周期 dial: 扩张 → 过热 → 收紧 → 降息 */
export function shortDialSvg(pick = {}, call = null) {
  const cx = 150, cy = 120;
  const N = {
    expand: { x: cx, y: cy - 75, dy: -28 }, hot: { x: cx + 100, y: cy, anchor: 'start', dx: 26, dy: 5 },
    tight: { x: cx, y: cy + 75, dy: 40 }, ease: { x: cx - 100, y: cy, anchor: 'end', dx: -26, dy: 5 },
  };
  for (const k of SHORT_ORDER) Object.assign(N[k], { glyph: SHORT_NAME[k][0], name: SHORT_NAME[k], aria: `小周期 ${SHORT_NAME[k]}` });
  let g = SHORT_ORDER.map((k, i) => edge(N[k], N[SHORT_ORDER[(i + 1) % 4]])).join('');
  for (const k of SHORT_ORDER) g += nodeSvg(N[k], `data-pick-short="${k}"`, pick.short === k, call && call.short === k);
  const c1 = call ? (SHORT_NAME[call.short] || '') : pick.short ? SHORT_NAME[pick.short] : '？';
  const c2 = call ? (/推不动/.test(call.labels?.short || '') ? '框架 · 推不动' : '框架的判断') : pick.short ? '你选的' : '点一个圈';
  g += `<text x="${cx}" y="${cy - 2}" text-anchor="middle" class="bl-c1">${esc(c1)}</text><text x="${cx}" y="${cy + 16}" text-anchor="middle" class="bl-c2">${esc(c2)}</text>`;
  return `<svg viewBox="-40 0 380 250" class="bl-dial" role="group" aria-label="小周期表盘">${g}</svg>`;
}

/** the framework's signals as readings (before the reveal: neutral; after: ● lit / ○ not lit) */
export function signalsHtml(card, kind, revealed) {
  const sig = (card.view.call.signals || []).filter(s => (kind === 'short') === SHORT_SIGNALS.has(s.id));
  if (!sig.length) return '';
  const cls = s => (revealed ? (s.lit ? ' lit' : ' off') : '');
  const mark = s => (revealed ? (s.lit ? '●' : '○') : '·');
  const n = revealed ? sig.filter(s => s.lit).length : 0;
  return `<details class="bl-sigs" data-sigs="${kind}"${revealed ? ' open' : ''}><summary>${revealed ? `框架看的 ${sig.length} 条读数（亮 ${n} 条）` : `规则会看的 ${sig.length} 条读数`}</summary>` +
    `<ul>${sig.map(s => `<li class="bl-sig${cls(s)}"><i aria-hidden="true">${mark(s)}</i>${esc(s.text)}</li>`).join('')}</ul></details>`;
}
