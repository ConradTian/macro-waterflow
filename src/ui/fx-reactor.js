// 汇率闸的「反应堆」(FX reactor): why a currency moved against the USD over the last year, in the language of the diagram.
//   Two pushing pipes, a needle and a line, nothing more:
//     资本管     = 利差 + 信心                 (capital pipe)
//     商品价格管 = 通胀差 + 生产率 + 贸易条件  (goods-price pipe)
//     needle     = the actual change of the home currency against the USD, 比一年前 (four quarters ago)
//     gap        = needle − (the two pipes) = 「说不清的部分」
//     anchor     = a faint PPP-only level: the cumulative inflation gap since 1995Q1 (its height set so that 1995–2021 deviate 0 on average)
//   Maths: the rounded formula of the 汇率 lesson (src/data/fx-data.js FX_SPEC.rule; dalio_432 handover §4.2, JST 1973–2020)
//     Δs ≈ 1.0·(π−π*) − 0.6·(i−i*) − 0.8·(g−g*) − k·ΔToT + RP        s = home currency per USD, s up = home weaker
//   The reactor shows everything as 「本币比一年前」 in %, + = home currency STRONGER (the lesson's 「往上 = 本币变强」), so each term is −Δs.
//   The trade balance is NOT a force here: in the JST 5-year regression the current account is ≈ 0 (FX_SPEC.fit5y.ca).
//   Inputs this repo does not have are never guessed: 生产率, 信心 (RP) and the size of 贸易条件 (k) are 「没有数据」. For Australia the
//   iron-ore price (src/data/usd-index.js) gives the DIRECTION of the terms of trade only.
//
// Exports (DOM-free part, also used by Node: tools/check_fx_reactor.mjs, src/data/concepts.js):
//   computeFxReactor(home, us, date, iso)  -> R (numbers below) | { ok:false, reason }
//   usdIndexAt(date) / usdIndexYear(y)      -> the broad dollar index (美元对一篮子货币) and its change 比一年前
//   dateOf({ t, year, date })               -> 'YYYYQn'
// DOM part:
//   reactorSvg(R, geom)        inner SVG markup (flow.js border band: compact geometry in viewBox units)
//   reactorHtml(R, opts)       the HTML block (conclusion + svg + PPP line + five-forces drill-down) for the phone popover, the map card, panels
//   mountFxReactor(host, { iso, t | year | date, forces })  lesson / standalone panel; async (loads the country data). unmountFxReactor().
//   openFxForces()             opens the five-forces drill-down of every reactor on screen (a lesson step can call it)
//   wireFxReactor(root)        tap a pipe (data-fxr-pipe) = open the drill-down with that pipe's forces highlighted (delegated, idempotent)
//   installFxCardHook()        adds the five forces + a 「去上「汇率」课」 button under the 汇率 concept card (src/ui/concepts.js renders the card)
import { FX_SPEC, FX_FORCES } from '../data/fx-data.js';
import { USD_INDEX } from '../data/usd-index.js';
import { COUNTRY_DATA } from '../data/countries/index.js';

const NAME = { AUS: '澳洲', GBR: '英国', JPN: '日本', EA: '欧元区', CHN: '中国', USA: '美国' };
const CCY = { AUS: '澳元', GBR: '英镑', JPN: '日元', EA: '欧元', CHN: '人民币', USA: '美元' };
export const FXR_BASE = '1995Q1', FXR_CALIB = ['1995Q1', '2021Q4'];
const ok = v => typeof v === 'number' && isFinite(v);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* =====================================================================================================================
   NUMBERS
   ===================================================================================================================== */
export function dateOf(o = {}) {
  if (typeof o.date === 'string' && /^\d{4}Q[1-4]$/.test(o.date)) return o.date;
  if (typeof o.t === 'string' && /^\d{4}Q[1-4]$/.test(o.t)) return o.t;
  if (ok(o.t)) { const t = Math.max(0, Math.round(o.t)); return `${1995 + Math.floor(t / 4)}Q${(t % 4) + 1}`; }   // t = quarter index, 0 = 1995Q1 (as ?t=)
  if (ok(o.year)) return `${Math.round(o.year)}Q4`;
  return '2025Q4';
}
const ser = (D, k) => (D && D.series && Array.isArray(D.series[k]) ? D.series[k] : null);
const at = (D, k, i) => { const a = ser(D, k); return a && i >= 0 && i < a.length && ok(a[i]) ? a[i] : null; };

/** The PPP anchor path for a country (local currency per USD), cached per data object. */
const anchorCache = new WeakMap();
function anchorPath(home, us) {
  let c = anchorCache.get(home);
  if (c && c.us === us) return c.path;
  const n = home.dates.length, ui = d => us.dates.indexOf(d);
  const raw = new Array(n).fill(null);
  let acc = 0, started = false, i0 = home.dates.indexOf(FXR_BASE);
  for (let i = Math.max(0, i0); i < n; i++) {
    const ph = at(home, 'cpiYoY', i), pu = at(us, 'cpiYoY', ui(home.dates[i]));
    if (!started) { if (!ok(at(home, 'fxPerUsd', i))) continue; started = true; raw[i] = 0; continue; }
    if (!ok(ph) || !ok(pu)) { raw[i] = null; continue; }
    acc += Math.log((1 + ph) / (1 + pu)) / 4;            // one quarter of the yearly inflation gap (CPI 比一年前 / 4): the cumulative gap, smooth
    raw[i] = acc;
  }
  // height: mean of ln(fx) − raw over the calibration window (1995–2021, before the 2022+ hold-out) = 0
  const a = home.dates.indexOf(FXR_CALIB[0]), b = home.dates.indexOf(FXR_CALIB[1]);
  let s = 0, m = 0;
  for (let i = Math.max(0, a); i <= b; i++) { const f = at(home, 'fxPerUsd', i); if (ok(f) && ok(raw[i])) { s += Math.log(f) - raw[i]; m++; } }
  const k = m ? s / m : 0;
  const path = raw.map(v => (ok(v) ? Math.exp(v + k) : null));
  anchorCache.set(home, { us, path });
  return path;
}

/**
 * The reactor's numbers for one country at one quarter. home, us = quarterly data objects (shape of US_Q). All % values are
 * 「本币比一年前」 in percent, + = home currency stronger against the USD.
 * R = { ok, iso, date, from, fx, fx4, actual, model, unexplained,
 *       forces: { infl, rate, prod, tot, conf } each { key, name, input (pp | %), c (% or null), have, note },
 *       pipes: { cap: { c, parts:['rate','conf'], missing }, goods: { c, parts:['infl','prod','tot'], missing, totDir } },
 *       anchor: { level, value (+ = home 偏贵), word, pos (on the same % axis as the needle) } }
 */
export function computeFxReactor(home, us, date, iso) {
  const name = NAME[iso] || iso, ccy = CCY[iso] || '本币';
  if (!home || !us || !Array.isArray(home.dates)) return { ok: false, iso, date, reason: '没有这个国家的数据' };
  if (iso === 'USA') return { ok: false, iso, date, reason: '美国是基准：美元对美元没有汇率，看美元指数' };
  const i = home.dates.indexOf(date), j = us.dates.indexOf(date);
  if (i < 4 || j < 4) return { ok: false, iso, date, reason: '这一季之前不满一年，算不了比一年前' };
  const fx = at(home, 'fxPerUsd', i), fx4 = at(home, 'fxPerUsd', i - 4);
  if (!ok(fx) || !ok(fx4)) return { ok: false, iso, date, reason: '没有汇率数据' };
  const R = FX_SPEC.rule;
  // the needle: the home currency's value in USD, now vs four quarters ago
  const actual = (fx4 / fx - 1) * 100;
  // 通胀差: CPI 比一年前, home − USA (pp). Δs = +1.0·gap  ->  strength = −1.0·gap
  const ph = at(home, 'cpiYoY', i), pu = at(us, 'cpiYoY', j);
  const inflIn = ok(ph) && ok(pu) ? (ph - pu) * 100 : null;
  // 利差: policy-rate gap, mean of the last four quarters (pp). Δs = −0.6·gap  ->  strength = +0.6·gap
  let gs = 0, gn = 0;
  for (let k = 0; k < 4; k++) { const a = at(home, 'policyRate', i - k), b = at(us, 'policyRate', j - k); if (ok(a) && ok(b)) { gs += a - b; gn++; } }
  const rateIn = gn === 4 ? (gs / 4) * 100 : null;
  // 贸易条件: Australia only, direction from the iron-ore price 比一年前 (k is not fitted, so no size)
  let totIn = null, totDir = 0;
  if (iso === 'AUS') {
    const ui = USD_INDEX.dates.indexOf(date), o = ui >= 4 ? USD_INDEX.ironOre[ui] : null, o4 = ui >= 4 ? USD_INDEX.ironOre[ui - 4] : null;
    if (ok(o) && ok(o4)) { totIn = (o / o4 - 1) * 100; totDir = totIn > 2 ? 1 : totIn < -2 ? -1 : 0; }
  }
  const f = (key, input, c, have, note) => ({ key, name: FX_FORCES.find(x => x.key === key).name, input, c, have, note });
  const forces = {
    infl: f('infl', inflIn, ok(inflIn) ? -R.infl * inflIn : null, ok(inflIn),
      ok(inflIn) ? `${name}物价比一年前 ${pc1(ph * 100)}，美方 ${pc1(pu * 100)}：差 ${sg1(inflIn)} 个点 × ${R.infl.toFixed(1)}` : '没有数据'),
    rate: f('rate', rateIn, ok(rateIn) ? R.rate * rateIn : null, ok(rateIn),
      ok(rateIn) ? `政策利率差（${name} − 美方，近四季平均）${sg1(rateIn)} 个点 × ${R.rate.toFixed(1)}` : '没有数据'),
    prod: f('prod', null, null, false, '没有数据：这里没有生产率序列（实际 GDP 增长含人口增长，不能直接当生产率）'),
    tot: f('tot', totIn, null, false, iso === 'AUS'
      ? (ok(totIn) ? `铁矿石价格比一年前 ${sg1(totIn)}%：方向${totDir > 0 ? '推强' : totDir < 0 ? '推弱' : '不明显'}；大小没有数据（系数 k 没有拟合）` : '没有数据')
      : '没有数据：这里没有这个国家的贸易条件序列'),
    conf: f('conf', null, null, false, '没有数据：信心（风险溢价）测不到，它多半藏在「说不清的部分」里'),
  };
  forces.tot.dir = totDir;
  const sum = ks => ks.reduce((a, k) => a + (ok(forces[k].c) ? forces[k].c : 0), 0);
  const pipes = {
    cap: { key: 'cap', name: '资本管', parts: ['rate', 'conf'], c: sum(['rate', 'conf']), missing: ['rate', 'conf'].filter(k => !ok(forces[k].c)) },
    goods: { key: 'goods', name: '商品价格管', parts: ['infl', 'prod', 'tot'], c: sum(['infl', 'prod', 'tot']), missing: ['infl', 'prod', 'tot'].filter(k => !ok(forces[k].c)), totDir },
  };
  const model = pipes.cap.c + pipes.goods.c;
  // PPP anchor: level (local per USD); value = how dear the home currency is vs the anchor (+ = 偏贵); pos = where the anchor sits on the needle's axis
  const A = anchorPath(home, us)[i];
  const anchor = ok(A) ? { level: A, value: (A / fx - 1) * 100, pos: (fx4 / A - 1) * 100 } : null;
  if (anchor) anchor.word = Math.abs(anchor.value) < 5 ? '差不多' : anchor.value > 0 ? '偏贵' : '偏便宜';
  return { ok: true, iso, name, ccy, date, from: home.dates[i - 4], fx, fx4, actual, model, unexplained: actual - model, forces, pipes, anchor };
}

/** broad dollar index (美元对一篮子货币): level + change 比一年前 in % (+ = dollar stronger). Quarterly (date) or annual mean (year). */
export function usdIndexAt(date) {
  const i = USD_INDEX.dates.indexOf(date), v = i >= 0 ? USD_INDEX.broad[i] : null, v4 = i >= 4 ? USD_INDEX.broad[i - 4] : null;
  return { date, level: ok(v) ? v : null, chg: ok(v) && ok(v4) ? (v / v4 - 1) * 100 : null };
}
export function usdIndexYear(y) {
  const m = yy => { const a = [1, 2, 3, 4].map(q => USD_INDEX.broad[USD_INDEX.dates.indexOf(`${yy}Q${q}`)]).filter(ok); return a.length === 4 ? a.reduce((s, x) => s + x, 0) / 4 : null; };
  const v = m(y), v1 = m(y - 1);
  return { year: y, level: v, chg: ok(v) && ok(v1) ? (v / v1 - 1) * 100 : null };
}

/* =====================================================================================================================
   TEXT
   ===================================================================================================================== */
function pc1(v) { return ok(v) ? v.toFixed(1) + '%' : '—'; }
function sg1(v) { return ok(v) ? (v > 0.05 ? '+' : v < -0.05 ? '−' : '') + Math.abs(v).toFixed(1) : '—'; }
const sgp = v => sg1(v) + '%';
const sg0 = v => (ok(v) ? (v >= 0.5 ? '+' : v <= -0.5 ? '−' : '') + Math.abs(v).toFixed(0) + '%' : '—');
const push = c => (!ok(c) || Math.abs(c) < 0.05 ? '几乎不推' : c > 0 ? `推强 ${Math.abs(c).toFixed(1)}%` : `推弱 ${Math.abs(c).toFixed(1)}%`);
const moved = (ccy, v) => (!ok(v) ? '—' : Math.abs(v) < 0.5 ? `${ccy}比一年前基本没变` : `${ccy}比一年前${v > 0 ? '变强' : '变弱'} ${Math.abs(v).toFixed(0)}%`);
/** the conclusion line: what happened, how much the formula explains, what is left */
export function reactorLine(R) {
  if (!R || !R.ok) return R?.reason || '没有数据';
  return `${moved(R.ccy, R.actual)}。公式两根管合计 ${sgp(R.model)}，剩下 ${sgp(R.unexplained)} 是说不清的部分。`;
}
export function anchorLine(R) {
  if (!R?.anchor) return 'PPP 锚：没有数据';
  const a = R.anchor;
  return `比 PPP 锚${a.word === '差不多' ? '差不多' : `${a.word} ${Math.abs(a.value).toFixed(0)}%`}（只按通胀差算的「合理」水平；偏离可以持续十年以上）`;
}

/* =====================================================================================================================
   SVG (shared by the border band and the HTML blocks)
   geom = { x0, x1 (track ends), rows:[y1, y2], top, bot (needle), gapY, sumY, lab (label x, anchored end), fs, range (± %), compact }
   ===================================================================================================================== */
const PIPE_COL = { cap: 'var(--fxr-cap)', goods: 'var(--fxr-goods)' };
export function reactorSvg(R, g) {
  if (!R || !R.ok) return '';
  const cx = (g.x0 + g.x1) / 2, half = (g.x1 - g.x0) / 2, rg = g.range || 25;
  const X = v => cx + Math.max(-1, Math.min(1, v / rg)) * half;
  const off = v => Math.abs(v) > rg;
  const fs = g.fs || 9, out = [];
  out.push(`<g class="fxr">`);
  // track: 弱 ← 0 → 强
  out.push(`<path class="fxr-track" d="M${g.x0} ${g.bot} H${g.x1}"/><path class="fxr-zero" d="M${cx} ${g.top + 1} V${g.bot + 2}"/>`);
  // the ends: under the track (panels) / one character on the top edge (the compact band, where the bottom holds the 说不清 bracket)
  const ey = g.compact ? g.top + 0.5 : g.bot + fs + 1, efs = fs * (g.compact ? 0.85 : 0.9);
  out.push(`<text class="fxr-end" x="${g.x0}" y="${ey}" style="font-size:${efs}px">${g.compact ? '弱' : '← 弱'}</text><text class="fxr-end" x="${g.x1}" y="${ey}" text-anchor="end" style="font-size:${efs}px">${g.compact ? '强' : '强 →'}</text>`);
  // anchor (faint dashed line, under everything else); its label on the top edge, beside the line
  if (R.anchor) {
    const ax = X(R.anchor.pos), o = off(R.anchor.pos), right = R.anchor.pos > 0;
    const ty = g.compact ? g.top + 0.5 : g.bot - 1.5;
    out.push(`<g class="fxr-anchor"><title>${esc(anchorLine(R))}</title><path d="M${ax.toFixed(1)} ${g.top} V${g.bot}"/>` +
      `<text x="${(ax + (right ? -2 : 2)).toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${right ? 'end' : 'start'}" style="font-size:${fs * 0.85}px">${o ? (right ? '锚 →' : '← 锚') : (g.compact ? '锚' : 'PPP 锚')}</text></g>`);
  }
  // the two pipes push the gate from the zero line: direction = the sign of their contribution, THICKNESS = its size (a fixed length, so a
  // 1–3% push stays readable next to a 20% needle); where they would land on the axis is the 公式 tick (their sum)
  ['cap', 'goods'].forEach((k, r) => {
    const p = R.pipes[k], y = g.rows[r], c = p.c;
    const wMax = g.compact ? 6.5 : 13, w = Math.max(1.4, Math.min(wMax, wMax * Math.sqrt(Math.min(1, Math.abs(c) / 4))));   // 4% or more = full width
    const dir = c >= 0 ? 1 : -1, x1 = cx + dir * half * (Math.abs(c) < 0.05 ? 0 : 0.42), len = Math.abs(x1 - cx), ah = Math.min(len, w * 0.8 + 3);
    const body = len < 1 ? '' : `<path class="fxr-bed" d="M${cx} ${y} H${(x1 - dir * ah).toFixed(1)}" style="stroke-width:${w.toFixed(1)}"/>` +
      `<path class="fxr-arrow" d="M${x1.toFixed(1)} ${y} L${(x1 - dir * ah).toFixed(1)} ${(y - w / 2 - 1.5).toFixed(1)} L${(x1 - dir * ah).toFixed(1)} ${(y + w / 2 + 1.5).toFixed(1)} Z"/>`;
    const nm = g.compact ? (k === 'cap' ? '资本' : '商品') : p.name;
    const sub = k === 'goods' && p.totDir ? `<tspan class="fxr-totl">铁矿石${p.totDir > 0 ? '↑' : '↓'}</tspan> 只有方向` : p.missing.length === p.parts.length ? '没有数据' : '部分没有数据';
    const miss = p.missing.length && !g.compact ? `<tspan class="fxr-miss" x="${g.lab}" dy="${(fs * 1.05).toFixed(1)}" style="font-size:${(fs * 0.8).toFixed(1)}px">${sub}</tspan>` : '';
    // ToT direction only (AUS): a hollow chevron after the arrow, pointing the way iron ore pushes
    const bx = x1 + dir * 7;
    const tot = k === 'goods' && p.totDir ? `<path class="fxr-tot" d="M${(bx - p.totDir * 2.5).toFixed(1)} ${(y - 3.5).toFixed(1)} L${(bx + p.totDir * 2.5).toFixed(1)} ${y} L${(bx - p.totDir * 2.5).toFixed(1)} ${(y + 3.5).toFixed(1)}"><title>铁矿石（贸易条件）方向：${p.totDir > 0 ? '推强' : '推弱'}，大小没有数据</title></path>` : '';
    out.push(`<g class="fxr-pipe ${k}" data-fxr-pipe="${k}" role="button" tabindex="0" aria-label="${esc(p.name)}：${esc(push(c))}" style="--pc:${PIPE_COL[k]}">` +
      `<rect class="fxr-hit" x="${g.lab - (g.compact ? 18 : 80)}" y="${(y - (g.compact ? 3.6 : 8)).toFixed(1)}" width="${(g.x1 - g.lab + (g.compact ? 18 : 80)).toFixed(1)}" height="${g.compact ? 7.2 : 16}"/>` +
      `<text class="fxr-name" x="${g.lab}" y="${(y + fs * 0.35).toFixed(1)}" text-anchor="end" style="font-size:${fs}px">${esc(nm)}${miss}</text>${body}${tot}` +
      (g.compact ? '' : `<text class="fxr-val" x="${(c >= 0 ? Math.min(x1 + 4 + (p.totDir ? 10 : 0), g.x1 - 2) : Math.max(x1 - 4 - (p.totDir ? 10 : 0), g.x0 + 2)).toFixed(1)}" y="${(y - w / 2 - 2).toFixed(1)}" text-anchor="${c >= 0 ? 'start' : 'end'}" style="font-size:${fs * 0.9}px">${sgp(c)}</text>`) +
      `<title>${esc(p.name)}：${esc(push(c))}</title></g>`);
  });
  // sum of the two pipes (公式) and the needle (实际); the gap between them = 说不清的部分
  const sx = X(R.model), nx = X(R.actual), no = off(R.actual);
  // panels: 「实际」 over the needle and 「公式」 over the sum tick, each on its own side (away from the other), flipped at the edges
  const tw = s => { let n = 0; for (const ch of s) n += ch.charCodeAt(0) > 255 ? fs : fs * 0.6; return n; };
  const side = (x, other, s) => { let right = x >= other; const w = tw(s) + 5; if (right && x + w > g.x1 + 6) right = false; if (!right && x - w < g.x0 - 6) right = true; return right; };
  const nTxt = `实际 ${sgp(R.actual)}${no ? (R.actual > 0 ? ' →' : ' ←') : ''}`, sTxt = `公式 ${sgp(R.model)}`;
  const nR = side(nx, sx, nTxt), sR = side(sx, nx + (nx === sx ? 1 : 0), sTxt);
  out.push(`<path class="fxr-sum" d="M${sx.toFixed(1)} ${(g.compact ? g.bot - 3 : g.top + 2).toFixed(1)} V${g.gapY.toFixed(1)}"/>`);
  if (!g.compact) out.push(`<text class="fxr-end" x="${(sx + (sR ? 4 : -4)).toFixed(1)}" y="${(g.top - 1.5).toFixed(1)}" text-anchor="${sR ? 'start' : 'end'}" style="font-size:${fs * 0.85}px">${sTxt}</text>`);
  if (Math.abs(nx - sx) > 2) {
    const ly = g.gapY, lx = (sx + nx) / 2;
    out.push(`<g class="fxr-gap"><path d="M${sx.toFixed(1)} ${ly} H${nx.toFixed(1)}"/><path d="M${sx.toFixed(1)} ${ly - 2} V${ly + 2} M${nx.toFixed(1)} ${ly - 2} V${ly + 2}"/>` +
      `<text x="${Math.max(g.x0 + (g.compact ? 22 : 44), Math.min(g.x1 - (g.compact ? 22 : 44), lx)).toFixed(1)}" y="${(ly + fs + 0.5).toFixed(1)}" text-anchor="middle" style="font-size:${fs * 0.9}px">说不清 ${g.compact ? sg0(R.unexplained) : sgp(R.unexplained)}</text></g>`);
  }
  // the needle; its value only in the panels (the band shows it in the readings column next to the reactor)
  out.push(`<g class="fxr-needle${no ? ' off' : ''}"><title>实际：${esc(moved(R.ccy, R.actual))}</title><path class="fxr-nl" d="M${nx.toFixed(1)} ${g.top} V${g.bot}"/>` +
    `<path class="fxr-nh" d="M${nx.toFixed(1)} ${g.top + 4} l-3.2 -4.5 h6.4 Z"/>` +
    (g.compact ? '' : `<text x="${(nx + (nR ? 5 : -5)).toFixed(1)}" y="${(g.top - 1.5).toFixed(1)}" text-anchor="${nR ? 'start' : 'end'}" style="font-size:${fs * 0.95}px">${nTxt}</text>`) + `</g>`);
  out.push('</g>');
  return out.join('');
}

/* =====================================================================================================================
   HTML block: conclusion, svg, PPP line, five forces (drill-down)
   ===================================================================================================================== */
function forcesHtml(R, open, hl) {
  const row = (k, pipe) => {
    const f = R.forces[k];
    const val = ok(f.c) ? `<b class="${f.c >= 0 ? 'up' : 'dn'}">${push(f.c)}</b>` : `<b class="na">${k === 'tot' && f.dir ? (f.dir > 0 ? '方向：推强' : '方向：推弱') : '没有数据'}</b>`;
    return `<li class="fxr-f${hl === pipe ? ' hl' : ''}" data-force="${k}"><i style="background:var(--fxr-${k})"></i><span><b>${esc(f.name)}</b>${val}<small>${esc(f.note)}</small></span></li>`;
  };
  const grp = (pk, label) => `<div class="fxr-grp${hl === pk ? ' hl' : ''}" data-grp="${pk}"><div class="fxr-gh"><b>${label}</b> 合计 ${push(R.pipes[pk].c)}</div><ul>${R.pipes[pk].parts.map(k => row(k, pk)).join('')}</ul></div>`;
  return `<details class="fxr-forces"${open ? ' open' : ''}><summary>五股力明细（点管子也能打开）</summary>` +
    grp('cap', '资本管 = 利差 + 信心') + grp('goods', '商品价格管 = 通胀差 + 生产率 + 贸易条件') +
    `<p class="fxr-note">公式（「汇率」课）：Δs ≈ 1.0·通胀差 − 0.6·利差 − 0.8·生产率差 − k·贸易条件 + 信心。这里改成「本币变强为正」。贸易差额不算一股力：数据里它几乎推不动汇率。</p></details>`;
}
/** opts = { w (px), open (drill-down open), hl ('cap'|'goods'), title (bool), compact (phone popover) } */
export function reactorHtml(R, opts = {}) {
  if (!R || !R.ok) return `<div class="fxr-box fxr-na"><p class="fxr-con">${esc(R?.reason || '没有数据')}</p></div>`;
  const W = Math.max(260, Math.round(opts.w || 320)), small = W < 330, fs = small ? 11 : 12;
  const lab = small ? 78 : 96, H = 102;
  const g = { x0: lab + 8, x1: W - 8, rows: [30, 56], top: 16, bot: 72, gapY: 85, lab, fs, range: 25 };
  const svg = `<svg class="fxr-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(reactorLine(R))}">${reactorSvg(R, g)}</svg>`;
  const head = opts.title === false ? '' : `<div class="fxr-h"><b>汇率闸 · ${esc(R.name)}</b><small>${esc(R.ccy)}/美元 · ${esc(R.from)} → ${esc(R.date)}</small></div>`;
  return `<div class="fxr-box" data-iso="${esc(R.iso)}" data-date="${esc(R.date)}">${head}<p class="fxr-con">${esc(reactorLine(R))}</p>${svg}` +
    `<p class="fxr-ppp"><i></i>${esc(anchorLine(R))}</p>${forcesHtml(R, !!opts.open, opts.hl)}</div>`;
}
export function usdHtml(date, opts = {}) {
  const u = ok(opts.year) ? usdIndexYear(opts.year) : usdIndexAt(date);
  const when = ok(opts.year) ? `${opts.year} 年平均` : date;
  if (!ok(u.level)) return `<div class="fxr-box fxr-na"><p class="fxr-con">美元指数：没有数据</p></div>`;
  const ch = ok(u.chg) ? (Math.abs(u.chg) < 0.5 ? '比一年前基本没变' : `比一年前${u.chg > 0 ? '变强' : '变弱'} ${Math.abs(u.chg).toFixed(0)}%`) : '';
  return `<div class="fxr-box fxr-usd"><div class="fxr-h"><b>美元指数（美元对一篮子货币）</b><small>${esc(when)}</small></div>` +
    `<p class="fxr-con">美元指数 ${Math.round(u.level)}，${esc(ch)}。数字越大，美元越强（和别国「1 美元换多少本币」方向相反）。</p>` +
    `<p class="fxr-note">美国是汇率的基准，所以不画两根推力管。别国的汇率闸都拿美元比。来源：美联储 广义美元指数（2006 年 1 月 = 100，之前接旧指数）。</p></div>`;
}

/* =====================================================================================================================
   interaction: tap a pipe = open the five forces with that group highlighted (delegated per root, idempotent)
   ===================================================================================================================== */
export function openForcesIn(box, hl, scroll = true) {
  if (!box) return;
  const d = box.querySelector('.fxr-forces');
  if (!d) return;
  d.open = true;
  box.querySelectorAll('.fxr-grp').forEach(x => x.classList.toggle('hl', !!hl && x.dataset.grp === hl));
  if (scroll) try { d.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* ignore */ }
}
export function wireFxReactor(root) {
  if (!root || root._fxrWired) return;
  root._fxrWired = true;
  const go = e => {
    const p = e.target.closest && e.target.closest('.fxr-box [data-fxr-pipe]');
    if (!p) return;
    e.preventDefault(); e.stopPropagation();
    openForcesIn(p.closest('.fxr-box'), p.dataset.fxrPipe);
  };
  root.addEventListener('click', go);
  root.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') go(e); });
}
export function openFxForces(hl) { document.querySelectorAll('.fxr-box').forEach(b => openForcesIn(b, hl)); }

/* =====================================================================================================================
   panel for lessons / standalone: mountFxReactor(host, { iso, t | year | date, forces })
   ===================================================================================================================== */
const dataCache = {};
export function loadCountry(iso) {
  if (!dataCache[iso]) dataCache[iso] = COUNTRY_DATA[iso] ? COUNTRY_DATA[iso]() : Promise.reject(new Error('no data'));
  return dataCache[iso];
}
let mounted = null;
export function ensureFxReactorCss() {
  if (typeof document === 'undefined' || document.querySelector('link[href*="fx-reactor.css"]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('../../assets/css/fx-reactor.css', import.meta.url).href; document.head.appendChild(l);
}
export async function mountFxReactor(host, o = {}) {
  unmountFxReactor();
  if (!host) return null;
  ensureFxReactorCss();
  const iso = String(o.iso || 'AUS').toUpperCase(), date = dateOf(o);
  const root = document.createElement('div');
  root.className = 'fxr-panel'; root.dataset.iso = iso; root.dataset.date = date;
  host.appendChild(root);
  const tok = mounted = { host, root, ro: null };
  let R = null;
  if (iso !== 'USA') {
    try { const [home, us] = await Promise.all([loadCountry(iso), loadCountry('USA')]); R = computeFxReactor(home, us, date, iso); } catch (e) { R = { ok: false, reason: '数据加载失败' }; }
  }
  if (mounted !== tok) return null;
  const draw = () => { root.innerHTML = iso === 'USA' ? usdHtml(date) : reactorHtml(R, { w: Math.min(520, (root.clientWidth || host.clientWidth || 340) - 2), open: !!o.forces, hl: o.hl }); };
  draw();
  wireFxReactor(root);
  if (typeof ResizeObserver === 'function') {
    let w = root.clientWidth;
    tok.ro = new ResizeObserver(() => { if (Math.abs(root.clientWidth - w) > 4) { w = root.clientWidth; const op = root.querySelector('.fxr-forces')?.open; draw(); if (op) openForcesIn(root.querySelector('.fxr-box')); } });
    tok.ro.observe(root);
  }
  root._fxr = R;
  return root;
}
export function unmountFxReactor() {
  if (!mounted) return;
  if (mounted.ro) mounted.ro.disconnect();
  mounted.root.remove();
  mounted = null;
}

/* =====================================================================================================================
   the 汇率 concept card: five forces + a button into the 汇率 lesson (src/ui/concepts.js owns the card; this only adds a block)
   ===================================================================================================================== */
let cardHook = false;
export function installFxCardHook(cardName = '汇率') {
  if (cardHook || typeof document === 'undefined' || typeof MutationObserver !== 'function') return;
  cardHook = true;
  ensureFxReactorCss();
  const block = `<div class="fxr-card" data-fxr-card="1"><span class="cc-k">推这道闸的五股力（「汇率」课）</span><ul>` +
    FX_FORCES.map(f => `<li><i style="background:var(--fxr-${f.key})"></i><b>${esc(f.name)}</b><span>${esc(f.push)}</span><small>${esc(f.when)}</small></li>`).join('') +
    `</ul><p class="fxr-note">按「资本管 = 利差 + 信心」「商品价格管 = 通胀差 + 生产率 + 贸易条件」分两根管。贸易差额几乎推不动汇率。</p>` +
    `<button type="button" class="btn primary fxr-go" data-fxr-lesson="fx">去上「汇率」课 →</button></div>`;
  const patch = body => {
    const t = body.querySelector('.cc-title');
    if (!t || t.textContent.trim() !== cardName || body.querySelector('[data-fxr-card]')) return;
    const at = body.querySelector('.cc-short') || t;
    at.insertAdjacentHTML('afterend', block);
  };
  const watchRoot = r => {
    const body = r.querySelector('.cc-body');
    if (!body || body._fxrObs) return;
    body._fxrObs = true;
    new MutationObserver(() => patch(body)).observe(body, { childList: true });
    patch(body);
    r.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-fxr-lesson]');
      if (!b) return;
      e.preventDefault();
      const x = r.querySelector('[data-cc-close]'); if (x) x.click();
      if (document.body.dataset.map === '1') document.dispatchEvent(new CustomEvent('mw:map', { detail: { open: false } }));
      document.dispatchEvent(new CustomEvent('mw:lesson', { detail: { id: b.dataset.fxrLesson } }));
    });
  };
  const r0 = document.getElementById('concept-root');
  if (r0) watchRoot(r0);
  else {
    const mo = new MutationObserver(() => { const r = document.getElementById('concept-root'); if (r) { mo.disconnect(); watchRoot(r); } });
    mo.observe(document.body, { childList: true });
  }
}
