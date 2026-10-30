// 地图 page: a schematic world (not a GIS map) laid over the whole app. Seven lumped boxes = small reservoirs with a mini 3-layer icon
// (河 = 物价, 湖吸力 = 实际利率, 地下 = 私人欠款/GDP 比自己平均 洞深 / 洞浅 N 点; the selected country's card repeats the same three
// layers in words), pipes between them in the same visual language as the main diagram (dashed, animated, width = amount),
// and the USD as "the world's big reservoir" under the USA box. Data: src/data/world.js (annual, USD bn) + countries/index.js (readiness).
// app.js owns the open/close wiring (button, ?map=1, mw:map event); this module owns the DOM inside the host element.
//   openWorldMap(host, { year, select, country, onEnter(iso), onClose() })   closeWorldMap()   selectOnMap(iso|null)   isMapOpen()
// Selecting a box (tap) only highlights it and fills the card; only the card's 「进入…」 button calls onEnter.
// Trade pipes: every named pair above a threshold (TRADE_MIN of the year's largest named flow, or TRADE_SHARE of the exporter's exports), and
//   ALL 其他国家 (ROW) pipes, grey, at their true width, drawn behind (background). Width is on one scale for all trade pipes.
// Reading the direction: every pipe ends in a big arrowhead (scaled with the width, with a floor) and carries chevrons along the way;
//   a two-way pair (A→B and B→A) is one corridor drawn as two parallel lanes, each keeping to its right; the amount sits on its own lane
//   near the exporter. Corridors are routed as gentle cubic curves that avoid the other boxes (cheapest of a few bow / S shapes).
//   Labels: with no selection only the biggest flows; with a selection all of its pipes, and every other pipe fades strongly.
// FX: a small sluice hangs under each country box: 1 美元 = x 本币 (annual mean) and the change 比一年前; the USA shows the broad dollar index.
//   Tap = the 汇率 concept card (data-term="fx", opened by src/ui/concepts.js). The card of a selected country adds the FX reactor
//   (src/ui/fx-reactor.js, last quarter of the year) or, for the USA, the dollar index.
import { WORLD, WORLD_USD_DEBT } from '../data/world.js';
import { COUNTRY_DATA, COUNTRY_READY } from '../data/countries/index.js';
import { computeFxReactor, reactorHtml, usdHtml, usdIndexYear, loadCountry, wireFxReactor, ensureFxReactorCss, installFxCardHook } from './fx-reactor.js';

const ISOS = ['USA', 'GBR', 'EA', 'CHN', 'JPN', 'AUS', 'ROW'];
const KINDS = [['all', '全部', ''], ['trade', '河·贸易', 'goods'], ['capital', '湖·资本', 'bond'], ['reserve', '储备', 'bond'], ['debt', '地下·美元债', 'debt']];
// v3: each currency = a colour of water (the box water and its layer icon use it); one-liners per country (tools/DESIGN-v3.md 「World + FX」)
const CCY_COL = { USD: '#2f6fb5', EUR: '#7a5cc4', GBP: '#c0563f', JPY: '#d0477a', CNY: '#c9302c', AUD: '#d68a1c', mixed: '#8a96a3' };
const ONE_LINER = { USA: '最大的湖。河往外漏（逆差），漏出去的水又流回它的湖。', JPN: '吸力最弱的湖；存在国外的水，一慌就回家。',
  AUS: '吸力高 + 一条卖矿的河 = 风险货币。', CHN: '顺差存进美国的湖；闸是手动的。', GBR: '一个中等的湖，信心一松水会反着流（2022）。',
  EA: '第二大的湖（欧元）。', ROW: '其他国家合并：借美元的地下水大多在这里。' };
const RES = [['USD', '美元', '--c-bond'], ['EUR', '欧元', '--c-credit'], ['JPY', '日元', '--c-repay'], ['GBP', '英镑', '--c-fiscal'],
  ['CNY', '人民币', '--c-goods'], ['AUD', '澳元', '--c-housing'], ['other', '其他', '--c-cash']];
const HOLDERS = ['JPN', 'CHN', 'GBR', 'EA', 'ROW'];
// box centres as fractions of the stage. A schematic of lumped basins, not a globe: the heavy pairs sit next to each other
// (USA–EA, EA–GBR, EA–CHN, CHN–USA, CHN–JPN/AUS), the USA has the world reserve reservoir (POOL) beside it, and 其他国家 (ROW)
// sits in the middle, so its grey spokes stay short. Europe top-left, Asia–Pacific down the right, USA left with the reservoir under it.
// The numbers came from a hill-climb (fewest crossings, no pipe through a box, 1995–2025, with and without a selection); boxes are
// then pushed apart in layout() if a year's GDP makes two touch. wide = iPad / desktop, tall = phone.
const POS_WIDE = { GBR: [.19, .10], EA: [.45, .04], JPN: [.89, .17], ROW: [.53, .44], USA: [.21, .48], CHN: [.81, .59], POOL: [.43, .83], AUS: [.89, .87] };
const POS_TALL = { GBR: [.33, .06], EA: [.77, .06], USA: [.32, .34], CHN: [.74, .26], ROW: [.43, .45], POOL: [.23, .70], JPN: [.81, .61], AUS: [.69, .82] };
const YMIN = 1995, YMAX = 2025;
const TRADE_MIN = 0.08;       // a named pair is drawn if its exports >= 8% of the year's largest named-pair flow ...
const TRADE_SHARE = 0.15;     // ... or >= 15% of the exporter's total exports (so a small economy's main buyers show: AUS -> CHN, AUS -> JPN)
const CCY_CN = { AUD: '澳元', GBP: '英镑', JPY: '日元', EUR: '欧元', CNY: '人民币', USD: '美元' };
const SHORT = { USA: '美', JPN: '日', AUS: '澳', CHN: '中', GBR: '英', EA: '欧', ROW: '其他', POOL: '美' };   // amount labels say who → whom

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = v => (typeof v === 'number' && isFinite(v)) ? v : null;
const nameOf = iso => WORLD.countries[iso]?.name || iso;
const fmtBn = v => v == null ? '—' : v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + '万亿' : Math.round(v) + '十亿';
const fmtPct0 = v => v == null ? '—' : Math.round(v * 100) + '%';
const fmtPct1 = v => v == null ? '—' : (v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(1) + '%';
// 地下: private debt/GDP minus the country's own average over all its years in WORLD (1995–2025; 欧元区 from 1999).
// + = more debt than usual = the hole is DEEPER (洞深). Within ±5 points = 平常.
const GW_FLAT = 0.05;
const gwWord = gw => gw == null ? '—' : gw > GW_FLAT ? `洞深 +${Math.round(gw * 100)}点` : gw < -GW_FLAT ? `洞浅 −${Math.round(-gw * 100)}点` : '平常';
const gwDef = span => `地下 = 私人欠款占 GDP，比自己 ${span} 平均高（洞更深）或低多少个百分点`;
const SPAN_ALL = () => `${WORLD.years[0]}–${WORLD.years[WORLD.years.length - 1]}`;

const st = { host: null, opts: null, year: 2008, sel: null, kind: 'all', open: false, last: null, ro: null, cover: {}, tip: null };
let els = {};

/* ---------- data access ---------- */
const yi = () => clamp(WORLD.years.indexOf(st.year), 0, WORLD.years.length - 1);
const at = arr => (Array.isArray(arr) ? num(arr[yi()]) : null);
const ser = (iso, key) => at(WORLD.countries[iso]?.[key]);
const tradeV = (a, b) => at(WORLD.trade?.[a]?.[b]);
function readings(iso) {
  const c = WORLD.countries[iso] || {};
  const pvt = ser(iso, 'pvtDebtGdp'), gov = ser(iso, 'govDebtGdp');
  return { gdp: ser(iso, 'gdpUsd'), pvt, gov, debt: pvt != null && gov != null ? pvt + gov : null,
    rate: ser(iso, 'policyRate'), fx: ser(iso, 'fxPerUsd'), ccy: c.ccy };
}

/* ---------- geometry ---------- */
function layout(W, H, tall) {
  const s = tall ? clamp(W / 390, 1, 1.25) : clamp(Math.min(W / 900, H / 560), 0.9, 1.4);
  const sf = clamp(s, 1, 1.25);                              // text scale
  const wMin = 112 * sf, wMax = wMin + (tall ? 40 : 92) * s;  // phone: smaller spread, so two boxes fit side by side with a channel between
  const gmax = Math.max(1, ...ISOS.map(i => ser(i, 'gdpUsd') || 0));
  const P = tall ? POS_TALL : POS_WIDE, box = {}, ext = 9 * sf; // ext: the FX sluice hangs this far under a box
  const put = (o, fx, fy) => {
    o.cx = clamp(fx * W, o.w / 2 + 6, W - o.w / 2 - 6); o.cy = clamp(fy * H, o.h / 2 + 8, H - o.h / 2 - 8 - (o.ext || 0));
  };
  for (const iso of ISOS) {
    const g = ser(iso, 'gdpUsd');
    const w = g == null ? wMin : wMin + (wMax - wMin) * Math.sqrt(g / gmax);   // area-ish: side grows with sqrt(GDP), with a floor so the text fits
    const h = Math.max(70 * sf, w * 0.6);
    box[iso] = { iso, w, h, ext: iso === 'ROW' ? 0 : ext };
    put(box[iso], P[iso][0], P[iso][1]);
  }
  const pool = { iso: 'POOL', w: tall ? 172 * sf : Math.max(box.USA.w * 1.1, 196 * sf), h: (tall ? 104 : 112) * sf, ext: 0 };
  put(pool, P.POOL[0], P.POOL[1]);
  // keep a clear gap between every pair of rectangles (boxes change size with GDP every year): a few rounds of pushing apart
  const all = [...ISOS.map(i => box[i]), pool], gap = 28 * s;   // room for an arrowhead + a bit of pipe between two neighbours
  for (let it = 0; it < 80; it++) {
    let moved = false;
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      const ox = (a.w + b.w) / 2 + gap - Math.abs(a.cx - b.cx);
      const oy = (a.h + a.ext + b.h + b.ext) / 2 + gap - Math.abs((a.cy + a.ext / 2) - (b.cy + b.ext / 2));
      if (ox <= 0 || oy <= 0) continue;
      moved = true;
      if (ox < oy) { const d = (ox / 2 + 0.5) * Math.sign(a.cx - b.cx || 1); a.cx += d; b.cx -= d; }
      else { const d = (oy / 2 + 0.5) * Math.sign(a.cy - b.cy || 1); a.cy += d; b.cy -= d; }
      for (const o of [a, b]) put(o, o.cx / W, o.cy / H);
    }
    if (!moved) break;
  }
  for (const o of all) { o.x = o.cx - o.w / 2; o.y = o.cy - o.h / 2; }
  const ob = {};                                             // obstacles for the pipes: box + its sluice, and the pool
  for (const o of all) ob[o.iso] = { x: o.x, y: o.y, w: o.w, h: o.h + o.ext, cx: o.cx, cy: o.cy };
  return { W, H, s, sf, box, pool, ob, fs: 11 * sf };
}

/* ---------- pipe geometry: a corridor is a cubic curve P = [p0, c1, c2, p1]; a lane is a sampled parallel of it ---------- */
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const cpt = (P, t) => { const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t; return [a * P[0][0] + b * P[1][0] + c * P[2][0] + d * P[3][0], a * P[0][1] + b * P[1][1] + c * P[2][1] + d * P[3][1]]; };
const ctan = (P, t) => {
  const u = 1 - t, x = 3 * u * u * (P[1][0] - P[0][0]) + 6 * u * t * (P[2][0] - P[1][0]) + 3 * t * t * (P[3][0] - P[2][0]);
  const y = 3 * u * u * (P[1][1] - P[0][1]) + 6 * u * t * (P[2][1] - P[1][1]) + 3 * t * t * (P[3][1] - P[2][1]), l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};
const inRect = (r, x, y, m) => x > r.x - m && x < r.x + r.w + m && y > r.y - m && y < r.y + r.h + m;
const cross3 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const segX = (a, b, c, d) => ((cross3(c, d, a) > 0) !== (cross3(c, d, b) > 0)) && ((cross3(a, b, c) > 0) !== (cross3(a, b, d) > 0));
function polyX(P, Q) {                                      // number of crossings between two sampled curves
  let n = 0;
  for (let i = 1; i < P.length; i++) for (let j = 1; j < Q.length; j++) if (segX(P[i - 1], P[i], Q[j - 1], Q[j])) n++;
  return n;
}
// candidate shapes [k1, k2]: sideways offsets of the two cubic control points (at 1/3 and 2/3 of the chord), as a share of its length.
// Equal = a gentle bow (C), opposite = an S, one zero = a bow pushed to one end. The gentlest clear one wins.
const BOWS = [];
for (const k of [0.06, 0.13, 0.22, 0.33, 0.46, 0.62, 0.8]) BOWS.push([k, k], [-k, -k]);
for (const k of [0.15, 0.3, 0.45]) BOWS.push([k, -k], [-k, k]);
for (const k of [0.3, 0.55, 0.8]) BOWS.push([k, 0], [0, k], [-k, 0], [0, -k]);
const NS = 26;
// one corridor = one unordered pair (or holder → pool): pick the shape whose curve stays clear of the other boxes, the stage edge and the
// heavier corridors routed before it. Each lane is the corridor curve shifted sideways (keep right), cut to the two box edges.
// ports: the corridors leaving one box through the same side are spread along that side (ordered by where they head), so their ends
// and arrowheads do not pile up on one spot. Returns the shifted origin of every corridor end.
function ports(L, cors) {
  const at = {};
  for (const c of cors) for (const end of ['a', 'b']) (at[c[end]] = at[c[end]] || []).push({ c, end, o: L.ob[c[end === 'a' ? 'b' : 'a']] });
  for (const id in at) {
    const r = L.ob[id], side = {};
    for (const e of at[id]) {
      const vx = e.o.cx - r.cx, vy = e.o.cy - r.cy, hz = Math.abs(vx) * r.h > Math.abs(vy) * r.w;
      e.k = hz ? (vx > 0 ? 'R' : 'L') : (vy > 0 ? 'B' : 'T'); e.s = hz ? vy / Math.abs(vx) : vx / Math.abs(vy);
      (side[e.k] = side[e.k] || []).push(e);
    }
    for (const k in side) {
      const g = side[k].sort((p, q) => p.s - q.s), hz = k === 'L' || k === 'R', span = (hz ? r.h : r.w) * 0.7;
      const tot = g.reduce((n, e) => n + e.c.hw * 2, 0), room = Math.max(0, span - tot), step = g.length > 1 ? room / (g.length - 1) : 0;
      let pos = g.length > 1 ? -span / 2 : -tot / 2;
      for (const e of g) {
        const m = clamp(pos + e.c.hw, -(hz ? r.h : r.w) / 2 + 8, (hz ? r.h : r.w) / 2 - 8); pos += e.c.hw * 2 + step;
        e.c['o' + e.end.toUpperCase()] = hz ? [r.cx, r.cy + m] : [r.cx + m, r.cy];
      }
    }
  }
}
function routeAll(L, cors) {
  const done = [], wt = Math.max(1, ...cors.map(c => c.v));
  ports(L, cors);
  for (const c of cors) {
    const cand = shapes(L, c, false);
    let best = null;                                          // crossings only matter among the shapes that are clear of the boxes
    for (const cd of cand.slice(0, 8)) {
      let cost = cd.cost;
      for (const d of done) { const nx = polyX(cd.pts, d.pts); if (nx) cost += nx * (c.row || d.row ? 1.5 : 3 + 6 * Math.min(c.v, d.v) / wt); }
      if (!best || cost < best.cost) best = { ...cd, cost };
    }
    c.segs = best.segs; c.pts = best.pts; c.cand = cand;
    done.push(c);
  }
}
// the candidate shapes of one corridor, cheapest first. A single cubic (bow / S / one-sided), and when none of those gets through
// (or `via` is set) also two joined cubics through one free point of a grid.
function shapes(L, c, via) {
  const oA = c.oA, oB = c.oB;
  const dx = oB[0] - oA[0], dy = oB[1] - oA[1], len = Math.hypot(dx, dy) || 1, n = [-dy / len, dx / len];
  c.n = n;
  const hw = c.hw + 5 * L.s, eb = c.hw + 2;
  const cand = [];
  const score = (segs, base) => {                          // the parts inside A and B are cut off later; only other boxes count
    const pts = sampleSegs(segs, NS).map(s => s[0]);
    let cost = base;
    pts.forEach(([x, y], i) => {
      if (i === 0 || i === pts.length - 1) return;
      for (const id in L.ob) {                               // inside a box / a lane would touch it / only the clearance margin
        if (id === c.a || id === c.b || !inRect(L.ob[id], x, y, hw)) continue;
        cost += inRect(L.ob[id], x, y, 0) ? 400 : inRect(L.ob[id], x, y, c.hw) ? 260 : 50;
      }
      if (x < eb || x > L.W - eb || y < eb || y > L.H - eb) cost += 150;   // the whole pipe stays on the stage
    });
    cand.push({ cost, segs, pts });
  };
  for (const [k1, k2] of BOWS) {
    const c1 = [oA[0] + dx / 3 + n[0] * k1 * len, oA[1] + dy / 3 + n[1] * k1 * len], c2 = [oA[0] + dx * 2 / 3 + n[0] * k2 * len, oA[1] + dy * 2 / 3 + n[1] * k2 * len];
    score([[oA, c1, c2, oB]], (Math.abs(k1) + Math.abs(k2)) * 11 + (k1 * k2 < 0 ? 3 : 0) + (k1 + k2 < 0 ? 0.3 : 0));
  }
  cand.sort((p, q) => p.cost - q.cost);
  if (via || cand[0].cost >= 100) {                         // no single curve gets through: go round via one free point (two joined curves)
    const gx = 14, gy = Math.round(14 * L.H / L.W) + 2;
    for (let i = 1; i < gx; i++) for (let j = 1; j < gy; j++) {
      const w = [L.W * i / gx, L.H * j / gy];
      if (Object.values(L.ob).some(o => inRect(o, w[0], w[1], eb))) continue;
      const u = [oB[0] - oA[0], oB[1] - oA[1]], ul = Math.hypot(u[0], u[1]) || 1, d1 = Math.hypot(w[0] - oA[0], w[1] - oA[1]), d2 = Math.hypot(oB[0] - w[0], oB[1] - w[1]);
      const tw = [u[0] / ul, u[1] / ul];                       // the curve passes the point heading straight from A to B: smooth join
      const s1 = [oA, lerp(oA, w, 1 / 3), [w[0] - tw[0] * d1 / 3, w[1] - tw[1] * d1 / 3], w], s2 = [w, [w[0] + tw[0] * d2 / 3, w[1] + tw[1] * d2 / 3], lerp(oB, w, 1 / 3), oB];
      score([s1, s2], 20 + ((d1 + d2) / len - 1) * 40);
    }
    cand.sort((p, q) => p.cost - q.cost);
  }
  return cand;
}
// repair: the router samples the corridor's centre line; a lane (shifted sideways) can still clip a box corner. Check the drawn lanes
// and, if one clips, take the next shape that keeps every lane clear (waypoint shapes included); else the one that clips least.
function segInRect(a, b, r, m) {                            // does segment a–b enter rectangle r grown by m (Liang–Barsky)
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - (r.x - m)], [dx, r.x + r.w + m - a[0]], [-dy, a[1] - (r.y - m)], [dy, r.y + r.h + m - a[1]]]) {
    if (Math.abs(p) < 1e-9) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t0 < t1;
}
function laneHits(L, c) {
  let n = 0;
  for (const p of c.pipes) for (let k = 1; k < p.bed.length; k++)
    for (const id in L.ob) if (id !== c.a && id !== c.b && segInRect(p.bed[k - 1], p.bed[k], L.ob[id], 1.5)) n++;
  return n;
}
function repair(L, c) {
  if (!laneHits(L, c)) return;
  let best = { n: laneHits(L, c), segs: c.segs };
  for (const pass of [c.cand, shapes(L, c, true)]) {
    for (const cd of pass.slice(0, 120)) {
      c.segs = cd.segs; lanes(L, c);
      const n = laneHits(L, c);
      if (!n) return;
      if (n < best.n) best = { n, segs: cd.segs };
    }
  }
  c.segs = best.segs; lanes(L, c);
}
function sampleSegs(segs, n) {                               // n samples per segment: [point, unit tangent]
  const out = [];
  segs.forEach((P, si) => { for (let i = si ? 1 : 0; i <= n; i++) out.push([cpt(P, i / n), ctan(P, i / n)]); });
  return out;
}
function lanes(L, c) {                                      // place each pipe of a corridor on its own lane
  const gap = 3 * L.s, two = c.pipes.length === 2;
  const lim = Math.min(L.ob[c.a].w, L.ob[c.a].h, L.ob[c.b].w, L.ob[c.b].h) / 2 - 4;
  const full = sampleSegs(c.segs, Math.round(64 / c.segs.length));   // the corridor from box centre to box centre (ports included)
  for (const p of c.pipes) {
    const fwd = p.from === c.a, sgn = fwd ? 1 : -1;          // the right-hand side of this pipe's own direction
    const off = two ? Math.min(lim, p.w / 2 + gap / 2) * sgn : 0;
    // a true parallel lane: every sample of the corridor moved along its own normal (a plain sideways shift would pinch the
    // two lanes together where the corridor bends), then cut where it leaves the exporter's box and where it meets the buyer's
    let pts = full.map(([q, [tx, ty]]) => [q[0] - ty * off, q[1] + tx * off]);
    if (!fwd) pts.reverse();
    const A = L.ob[p.from], B = L.ob[p.to];
    let i0 = 0; while (i0 < pts.length - 2 && inRect(A, pts[i0 + 1][0], pts[i0 + 1][1], 3)) i0++;
    let i1 = pts.length - 1; while (i1 > i0 + 1 && inRect(B, pts[i1 - 1][0], pts[i1 - 1][1], 4)) i1--;
    const cut = (inP, outP, r, pad) => { let lo = 0, hi = 1; for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2, q = lerp(inP, outP, m); if (inRect(r, q[0], q[1], pad)) lo = m; else hi = m; } return lerp(inP, outP, hi); };
    pts = [cut(pts[i0], pts[i0 + 1], A, 3), ...pts.slice(i0 + 1, i1), cut(pts[i1], pts[i1 - 1], B, 4)];
    p.p0 = pts[0]; p.p1 = pts[pts.length - 1]; p.lane = off;
    // arrowhead: scaled with the width, with a clear floor. The bed stops at the arrow's base.
    p.Ln = Math.max(14 * L.sf, 8 + p.w * 1.05); p.Hh = Math.max(8 * L.sf, 5 + p.w * 0.62);
    let j = pts.length - 1; while (j > 1 && Math.hypot(pts[j - 1][0] - p.p1[0], pts[j - 1][1] - p.p1[1]) <= p.Ln) j--;
    const a = pts[j - 1], b = pts[j];                          // the arrow's base lies on segment a–b at distance Ln from the tip
    let lo = 0, hi = 1; for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2, q = lerp(a, b, m); if (Math.hypot(q[0] - p.p1[0], q[1] - p.p1[1]) > p.Ln) lo = m; else hi = m; }
    p.bed = [...pts.slice(0, j), lerp(a, b, lo)]; p.e = p.bed[p.bed.length - 1];
    p.cum = [0]; for (let k = 1; k < p.bed.length; k++) p.cum.push(p.cum[k - 1] + Math.hypot(p.bed[k][0] - p.bed[k - 1][0], p.bed[k][1] - p.bed[k - 1][1]));
    p.len = p.cum[p.cum.length - 1];
  }
}
function along(p, f) {                                       // point + unit tangent at fraction f of the bed's length
  const s = clamp(f, 0, 1) * p.len, C = p.cum, B = p.bed;
  let k = 1; while (k < C.length - 1 && C[k] < s) k++;
  const a = B[k - 1], b = B[k], l = (C[k] - C[k - 1]) || 1, m = (s - C[k - 1]) / l;
  return [lerp(a, b, clamp(m, 0, 1)), [(b[0] - a[0]) / l, (b[1] - a[1]) / l]];
}

/* ---------- pipes ---------- */
function collectPipes(L) {
  const out = [];
  const all = [];                                           // trade: always collected so the routes stay put when the tab changes
  for (const a of ISOS) for (const b of ISOS) {
    if (a === b) continue;
    const v = tradeV(a, b);
    if (v != null && v > 0) all.push({ k: 'trade', from: a, to: b, v, row: a === 'ROW' || b === 'ROW' });
  }
  const named = all.filter(p => !p.row), big = Math.max(1, ...named.map(p => p.v));
  const exp = {}; for (const p of all) exp[p.from] = (exp[p.from] || 0) + p.v;     // the exporter's total exports (to the six others + ROW)
  const keep = p => p.row || p.v >= TRADE_MIN * big || p.v >= TRADE_SHARE * exp[p.from] || (!!st.sel && (p.from === st.sel || p.to === st.sel));
  out.push(...all.filter(keep));
  for (const h of HOLDERS) {
    const v = at(WORLD.ustForeign?.[h]);
    if (v != null && v > 0) out.push({ k: 'cap', from: h, to: 'POOL', v, row: false });
  }
  const di = WORLD.years.indexOf(st.year), dOut = num(WORLD_USD_DEBT?.outsideUs?.[di]), dChn = num(WORLD_USD_DEBT?.CHN?.[di]);
  if (dChn != null && dChn > 0) out.push({ k: 'debt', from: 'USA', to: 'CHN', v: dChn, row: false });
  if (dOut != null && dOut > 0) out.push({ k: 'debt', from: 'USA', to: 'ROW', v: dOut - (dChn || 0), row: false });
  const mx = { trade: 1, cap: 1, debt: 1 };
  for (const p of out) mx[p.k] = Math.max(mx[p.k], p.v);
  for (const p of out) {
    p.f = Math.sqrt(p.v / mx[p.k]);                           // 0..1; width and speed follow sqrt so a 100x range stays drawable
    p.w = 1.6 + 11 * p.f * Math.min(1.25, L.s);
    p.hl = !!st.sel && (p.from === st.sel || p.to === st.sel || (p.to === 'POOL' && st.sel === 'USA'));
  }
  // corridors: a two-way pair shares one route and gets two lanes
  const cm = new Map();
  for (const p of out) {
    const [a, b] = p.to === 'POOL' ? [p.from, 'POOL'] : [p.from, p.to].sort();
    const key = p.k + ':' + a + ':' + b;
    if (!cm.has(key)) cm.set(key, { a, b, k: p.k, row: p.row, pipes: [], v: 0, hw: 0 });
    const c = cm.get(key); c.pipes.push(p); c.v += p.v; c.hw += p.w / 2 + 2 * L.s;
  }
  const cors = [...cm.values()].sort((x, y) => (x.row - y.row) || (y.v - x.v));   // named heavy first, the grey ROW background last
  routeAll(L, cors);
  for (const c of cors) { lanes(L, c); repair(L, c); }
  const kind = st.kind, vis = p => (kind === 'all' && p.k !== 'debt') || (kind === 'trade' && p.k === 'trade') || (kind === 'capital' && p.k === 'cap') || (kind === 'debt' && p.k === 'debt');
  return out.filter(vis).sort((p, q) => (q.row - p.row) || (p.v - q.v));          // ROW (grey background) first, then small to big
}
const f1 = v => v.toFixed(1);
function pipeSvg(p, L) {
  const d = 'M' + p.bed.map(q => f1(q[0]) + ' ' + f1(q[1])).join('L');
  const [x1, y1] = p.p1;
  let ux = x1 - p.e[0], uy = y1 - p.e[1]; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
  const bx = p.e[0] + ux * 0.6, by = p.e[1] + uy * 0.6, Hh = p.Hh;   // base a hair inside the bed's end, so no seam
  const arrow = `${f1(x1)},${f1(y1)} ${f1(bx - uy * Hh)},${f1(by + ux * Hh)} ${f1(bx - ux * p.Ln * 0.18)},${f1(by - uy * p.Ln * 0.18)} ${f1(bx + uy * Hh)},${f1(by - ux * Hh)}`;
  const dur = (15 / (14 + 46 * p.f)).toFixed(2);
  const cls = p.k === 'cap' ? 'bond' : p.k === 'debt' ? 'debt' : p.row ? 'goods row' : 'goods';
  // chevrons along the way: one per ~110px, clear of the label zone near the source and of the arrowhead
  const nC = Math.max(1, Math.min(4, Math.round(p.len / (120 * L.s)))), cb = Math.max(5 * L.sf, p.w * 0.62 + 2.5), ca = cb * 0.85;
  const sw = clamp(p.w * 0.28, 1.8, 3.6);
  let chev = '';
  for (let i = 0; i < nC; i++) {
    const t = nC === 1 ? 0.58 : 0.42 + (0.4 * i) / (nC - 1);
    const [[x, y], [tx, ty]] = along(p, t);
    const a = Math.atan2(ty, tx) * 180 / Math.PI;
    const dd = `M${f1(-ca / 2)} ${f1(-cb)} L${f1(ca / 2)} 0 L${f1(-ca / 2)} ${f1(cb)}`;
    chev += `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${a.toFixed(1)})"><path class="wm-chev-h" d="${dd}" stroke-width="${f1(sw + 2.6)}"/><path class="wm-chev" d="${dd}" stroke-width="${f1(sw)}"/></g>`;
  }
  const lab = fmtBn(p.v);
  const what = p.k === 'debt' ? `地下连地下：${nameOf(p.to)}的非银行借的美元债 ${lab}美元（BIS）` : p.k === 'cap' ? `${nameOf(p.from)}持有美债 ${lab}美元` : `${nameOf(p.from)} → ${nameOf(p.to)} 出口 ${lab}美元${p.row ? '（灰管 = 其他国家，背景）' : ''}`;
  return `<g class="wm-pipe ${cls}${p.hl ? ' hl' : ''}" data-k="${p.k}" data-from="${p.from}" data-to="${p.to}" data-v="${p.v}" data-w="${p.w.toFixed(3)}" data-lane="${p.lane.toFixed(2)}" data-ah="${f1(Math.min(p.Ln, 2 * Hh))}"${p.row ? ' data-row="1"' : ''}><title>${esc(what)}</title>
    <path class="wm-bed" d="${d}" stroke-width="${p.w.toFixed(2)}"/><path class="wm-dash" d="${d}" stroke-width="${Math.max(1, p.w * 0.62).toFixed(2)}" style="animation-duration:${dur}s"/>
    <g class="wm-chevs">${chev}</g><polygon class="wm-arrow" points="${arrow}"/></g>`;
}
// amount labels: on the pipe's own lane, near the exporter (the source end), pushed to the lane's outer side; never on a box or another label.
// No selection: only the biggest flows. A selection: every pipe of the selected country.
function chipsSvg(pipes, L) {
  const kind = st.kind;
  let pick;
  if (st.sel) pick = pipes.filter(p => p.hl);
  else {
    const named = pipes.filter(p => p.k === 'trade' && !p.row).sort((a, b) => b.v - a.v), cap = pipes.filter(p => p.k === 'cap').sort((a, b) => b.v - a.v);
    pick = [...named.slice(0, kind === 'trade' ? 8 : 5), ...cap.slice(0, kind === 'capital' ? 9 : 3), ...pipes.filter(p => p.k === 'debt')];
  }
  pick.sort((a, b) => b.v - a.v);
  const f = L.fs * 0.9, ch = Math.round(L.fs * 1.6), placed = [];
  const tw = w => { let n = 0; for (const c of w) n += c.charCodeAt(0) > 255 ? f : f * 0.6; return n; };
  const hits = r => placed.some(q => r.x < q.x + q.w + 2 && r.x + r.w + 2 > q.x && r.y < q.y + q.h + 2 && r.y + r.h + 2 > q.y)
    || Object.values(L.ob).some(o => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y)
    || r.x < 2 || r.y < 2 || r.x + r.w > L.W - 2 || r.y + r.h > L.H - 2;
  let out = '';
  for (const p of pick) {
    const s = iso => SHORT[iso] || iso;
    const lab = (p.k === 'cap' ? `${s(p.from)}持美债 ` : p.k === 'debt' ? `${s(p.to)}借美元 ` : `${s(p.from)}→${s(p.to)} `) + fmtBn(p.v), cw = tw(lab) + 12;
    let spot = null;
    for (const t of [0.2, 0.28, 0.13, 0.36, 0.45, 0.55]) {
      const [[x, y], [tx, ty]] = along(p, t);
      const rx = -ty, ry = tx;                              // right of the flow = the lane's outer side when two lanes share a corridor
      const side = Math.abs(rx) * cw / 2 + Math.abs(ry) * ch / 2 + p.w / 2 + 2;
      for (const sd of p.lane ? [1, 1.8] : [1, -1, 1.8, -1.8]) {
        const cx = x + rx * side * sd, cy = y + ry * side * sd, r = { x: cx - cw / 2, y: cy - ch / 2, w: cw, h: ch };
        if (!hits(r)) { spot = r; break; }
      }
      if (spot) break;
    }
    if (!spot) {
      if (!st.sel) continue;                                  // unselected: skip a label that has no room
      const [[x, y]] = along(p, 0.22); spot = { x: x - cw / 2, y: y - ch / 2, w: cw, h: ch };
    }
    placed.push(spot);
    const cls = p.k === 'cap' ? 'bond' : p.k === 'debt' ? 'debt' : p.row ? 'goods row' : 'goods';
    out += `<g class="wm-chip ${cls}" data-from="${p.from}" data-to="${p.to}" transform="translate(${f1(spot.x + cw / 2)} ${f1(spot.y + ch / 2)})"><rect x="${f1(-cw / 2)}" y="${f1(-ch / 2)}" width="${f1(cw)}" height="${ch}" rx="${ch / 2}"/><text y="${f1(f * 0.36)}" text-anchor="middle">${lab}</text></g>`;
  }
  return out;
}

/* ---------- boxes + pool ---------- */
function boxSvg(b, L) {
  const r = readings(b.iso), sel = st.sel === b.iso, f = L.fs, col = CCY_COL[r.ccy] || CCY_COL.mixed;
  const col2 = b.x + b.w / 2 + 2, col1 = b.x + 9;
  const gdp = r.gdp == null ? '' : `<text class="wm-g" x="${(b.x + b.w - 8).toFixed(1)}" y="${(b.y + f + 7).toFixed(1)}" text-anchor="end">GDP ${fmtBn(r.gdp)}</text>`;
  const y1 = b.y + f * 1.3 + 22, y2 = y1 + f * 1.55 + 2;
  const cell = (x, y, k, v) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}"><tspan class="wm-k">${k} </tspan><tspan class="wm-v">${v}</tspan></text>`;
  const stage = r.stage?.mark ? esc(r.stage.mark) : '—';
  return `<g class="wm-box${sel ? ' sel' : ''}" data-iso="${b.iso}" tabindex="0" role="button" aria-pressed="${sel}" aria-label="${esc(nameOf(b.iso))}">
    <rect class="wm-rect" x="${b.x.toFixed(1)}" y="${b.y.toFixed(1)}" width="${b.w.toFixed(1)}" height="${b.h.toFixed(1)}" rx="10"/>
    <text class="wm-n" x="${col1.toFixed(1)}" y="${(b.y + f + 7).toFixed(1)}">${esc(nameOf(b.iso))}</text>${gdp}
    ${layersSvg(b, L, r, col)}
  </g>`;
}
// the mini 3-layer icon: 河 (inflation), 湖 (suction = REAL policy rate), 地下 (private debt/GDP vs its own average over all its years)
export function layersIcon(iso, year = st.year) {
  const k = clamp(WORLD.years.indexOf(year), 0, WORLD.years.length - 1), C = WORLD.countries[iso] || {};
  const g = key => (Array.isArray(C[key]) ? num(C[key][k]) : null);
  const infl = g('cpiYoY'), rate = g('policyRate'), pvt = g('pvtDebtGdp');
  const real = rate != null && infl != null ? rate - infl : null;
  const yrs = (C.pvtDebtGdp || []).map((v, i) => (num(v) == null ? null : WORLD.years[i])).filter(y => y != null);
  const a = (C.pvtDebtGdp || []).filter(v => num(v) != null), avg = a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const gw = pvt != null && avg != null ? pvt - avg : null;     // + = more debt than usual = the hole is DEEPER (the table is lower)
  const span = yrs.length ? `${yrs[0]}–${yrs[yrs.length - 1]}` : SPAN_ALL();   // the baseline window of this country's average
  return { infl, real, rate, gw, pvt, avg, span };
}
function layersSvg(b, L, r, col) {
  const k = layersIcon(b.iso), f = L.fs * 0.9, x = b.x + 8, w = b.w - 16, top = b.y + L.fs + 13, rh = Math.max(9, (b.h - (top - b.y) - 12 * L.sf) / 3);
  const pct = fmtPct1;
  const rows = [
    ['wm-l-river', '河', k.infl == null ? '—' : '通胀 ' + pct(k.infl), k.infl == null ? 0.3 : clamp(0.25 + k.infl * 8, 0.1, 1)],
    ['wm-l-lake', '湖', k.real == null ? '—' : '吸力 ' + pct(k.real), k.real == null ? 0.3 : clamp(0.5 + k.real * 10, 0.08, 1)],
    ['wm-l-ground', '地下', gwWord(k.gw), k.gw == null ? 0.5 : clamp(0.5 - k.gw * 1.2, 0.08, 1)],   // bar = the water table: a deeper hole = lower
  ];
  const tips = ['河水位 = 通胀（物价比一年前）', '湖吸力 = 实际利率（政策利率 − 通胀）', gwDef(k.span) + '。点这一行看说明'];
  return '<g class="wm-layers">' + rows.map(([c, nm, v, lv], i) => {
    const y = top + i * rh, bw = Math.max(14, Math.min(28 * L.sf, w * 0.22));
    // the 地下 row carries a transparent hit strip: tapping it selects the box AND shows the one-line definition (st.tip)
    const hit = i === 2 ? `<rect class="wm-l-hit" data-def="gw" x="${(x - 3).toFixed(1)}" y="${(y - 1).toFixed(1)}" width="${(w + 6).toFixed(1)}" height="${rh.toFixed(1)}"/>` : '';
    return `<g class="${c}"><title>${esc(tips[i] + '：' + v)}</title><rect class="wm-l-bg" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${(rh - 2).toFixed(1)}" rx="2"/>` +
      `<rect class="wm-l-fill" x="${x.toFixed(1)}" y="${(y + (rh - 2) * (1 - lv)).toFixed(1)}" width="${bw.toFixed(1)}" height="${((rh - 2) * lv).toFixed(1)}" rx="2" style="fill:${i === 2 ? '#9a7b4f' : col}"/>` +
      `<text x="${(x + bw + 4).toFixed(1)}" y="${(y + rh / 2 + f * 0.33).toFixed(1)}" style="font-size:${f.toFixed(1)}px"><tspan class="wm-k">${nm} </tspan><tspan class="wm-v">${esc(v)}</tspan></text>${hit}</g>`;   // hit strip on top of the bar
  }).join('') + '</g>';
}
// FX sluice under a box: 本币 per USD (annual mean) + 本币比一年前 (+ = stronger); USA: the broad dollar index. Tap = the 汇率 card.
export function sluiceInfo(iso, year) {
  if (iso === 'ROW') return null;
  if (iso === 'USA') {
    const u = usdIndexYear(year);
    if (u.level == null) return null;
    return { usd: true, level: u.level, chg: u.chg, txt: `美元指数 ${Math.round(u.level)}`,
      tip: `美元指数（美元对一篮子货币）${year} 年平均 ${Math.round(u.level)}${u.chg == null ? '' : `，美元比一年前${Math.abs(u.chg) < 0.5 ? '基本没变' : (u.chg > 0 ? '变强 ' : '变弱 ') + Math.abs(u.chg).toFixed(0) + '%'}`}` };
  }
  const a = WORLD.countries[iso]?.fxPerUsd, k = WORLD.years.indexOf(year);
  const fx = Array.isArray(a) ? num(a[k]) : null, f0 = Array.isArray(a) && k > 0 ? num(a[k - 1]) : null;
  if (fx == null) return null;
  const ccy = CCY_CN[WORLD.countries[iso].ccy] || WORLD.countries[iso].ccy, chg = f0 == null ? null : (f0 / fx - 1) * 100;
  const v = fx >= 100 ? fx.toFixed(0) : fx >= 10 ? fx.toFixed(1) : fx.toFixed(2);
  return { usd: false, fx, chg, ccy, txt: `${v}${ccy}`,
    tip: `1 美元 = ${v} ${ccy}（${year} 年平均）${chg == null ? '' : `；${ccy}比一年前${Math.abs(chg) < 0.5 ? '基本没变' : (chg > 0 ? '变强 ' : '变弱 ') + Math.abs(chg).toFixed(0) + '%'}`}` };
}
function sluiceSvg(b, L) {
  const s = sluiceInfo(b.iso, st.year);
  if (!s) return '';
  const f = L.fs * 0.86, h = 15 * L.sf;
  const ch = s.chg == null ? '' : Math.abs(s.chg) < 0.5 ? '持平' : `${s.chg > 0 ? '↑' : '↓'}${Math.abs(s.chg).toFixed(0)}%`;
  const cls = s.chg == null || Math.abs(s.chg) < 0.5 ? 'flat' : s.chg > 0 ? 'up' : 'dn';
  const tw = w => { let n = 0; for (const c of w) n += c.charCodeAt(0) > 255 ? f : f * 0.6; return n; };
  const gw = 13 * L.sf, w = 8 + gw + 4 + tw(s.txt) + (ch ? 5 + tw(ch) : 0) + 8;
  const x = clamp(b.x + b.w - w - 6, b.x + 4, b.x + b.w - w), y = b.y + b.h - h / 2 + 1;
  const gx = x + 8, gy = y + (h - 9 * L.sf) / 2, gh = 9 * L.sf;
  return `<g class="wm-sluice${s.usd ? ' usd' : ''}" data-term="fx" data-iso="${b.iso}" role="button" tabindex="0" aria-label="${esc(s.tip)}"><title>${esc(s.tip + '。点开看「汇率」')}</title>
    <rect class="wm-sl-bg" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(h / 2).toFixed(1)}"/>
    <rect class="wm-sl-gate" x="${gx.toFixed(1)}" y="${gy.toFixed(1)}" width="${gw.toFixed(1)}" height="${gh.toFixed(1)}" rx="2"/>
    <path class="wm-sl-slat" d="M${(gx + gw * 0.3).toFixed(1)} ${(gy + 2).toFixed(1)} v${(gh - 4).toFixed(1)} M${(gx + gw * 0.5).toFixed(1)} ${(gy + 2).toFixed(1)} v${(gh - 4).toFixed(1)} M${(gx + gw * 0.7).toFixed(1)} ${(gy + 2).toFixed(1)} v${(gh - 4).toFixed(1)}"/>
    <text x="${(gx + gw + 4).toFixed(1)}" y="${(y + h / 2 + f * 0.36).toFixed(1)}" style="font-size:${f.toFixed(1)}px"><tspan class="wm-sl-v">${esc(s.txt)}</tspan>${ch ? `<tspan class="wm-sl-c ${cls}" dx="5">${ch}</tspan>` : ''}</text></g>`;
}
function poolSvg(L) {
  const p = L.pool, f = L.fs, ri = yi();
  const usd = at(WORLD.reserves?.USD);
  const segs = RES.map(([k, nm, tok]) => [k, nm, tok, at(WORLD.reserves?.[k])]);
  const bw = p.w - 16, nLg = segs.filter(s => s[3] != null && s[3] > 0.004).length, per = bw / 4 >= 62 * L.sf ? 4 : 3;
  const by = p.y + p.h - 22 - (Math.max(1, Math.ceil(nLg / per)) - 1) * (f + 3);   // bar + legend rows fit inside the reservoir
  let x = p.x + 8, bar = '';
  for (const [k, , tok, v] of segs) {
    if (v == null || v <= 0) continue;
    const w = bw * v;
    bar += `<rect x="${x.toFixed(1)}" y="${by.toFixed(1)}" width="${Math.max(0.5, w).toFixed(1)}" height="8" style="fill:var(${tok})"/>`;
    x += w;
  }
  const legend = segs.filter(s => s[3] != null && s[3] > 0.004).map(([, nm, tok, v], i) => {
    const cw = bw / per;
    return `<g transform="translate(${(p.x + 8 + (i % per) * cw).toFixed(1)} ${(by + 18 + Math.floor(i / per) * (f + 3)).toFixed(1)})"><rect y="-7" width="7" height="7" rx="1.5" style="fill:var(${tok})"/><text x="10" class="wm-lg">${nm} ${Math.round(v * 100)}%</text></g>`;
  }).join('');
  const ttl = usd == null ? '最大的湖：美元' : `最大的湖：美元 · 储备占 ${Math.round(usd * 100)}%`;
  const lvl = usd == null ? 0.5 : clamp(usd, 0.1, 1);
  const ih = Math.max(10, by - p.y - 24);                   // water inside the upper part
  return `<g class="wm-pool${st.kind === 'trade' ? ' dim' : ''}${st.kind === 'reserve' ? ' hl' : ''}">
    <title>${esc('各国央行外汇储备：美元份额（IMF COFER）')}</title>
    <clipPath id="wmc-pool"><rect x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" width="${p.w.toFixed(1)}" height="${p.h.toFixed(1)}" rx="12"/></clipPath>
    <rect class="wm-prect" x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" width="${p.w.toFixed(1)}" height="${p.h.toFixed(1)}" rx="12"/>
    <rect class="wm-pwater" clip-path="url(#wmc-pool)" x="${p.x.toFixed(1)}" y="${(p.y + 20 + ih * (1 - lvl)).toFixed(1)}" width="${p.w.toFixed(1)}" height="${(ih * lvl + 2).toFixed(1)}"/>
    <text class="wm-pt" x="${(p.x + 8).toFixed(1)}" y="${(p.y + f + 4).toFixed(1)}">${esc(ttl)}</text>
    <text class="wm-ps" x="${(p.x + 8).toFixed(1)}" y="${(p.y + f + 4 + f * 1.3).toFixed(1)}">美联储加息 = 最大的湖吸力变大，全世界的水往美国跑</text>
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
      <p class="wm-more">每个国家的水一种颜色。框里三层：<b>河</b>（通胀）、<b>湖</b>（吸力 = 实际利率）、<b>地下</b>（洞深 / 洞浅 N 点 / 平常）。框下面是闸。</p>
      <p class="wm-def" data-def="gw">${esc(gwDef(SPAN_ALL()))}。洞越深，以后要还的越多。</p>
      <p class="wm-more">框越大，GDP 越大。</p>
      <p><i class="wm-sw goods"></i> 绿管 = 贸易（出口，小的不画）<br><i class="wm-sw row"></i> 灰管 = 和「其他国家」的贸易（背景，宽度照实）<br><i class="wm-sw bond"></i> 蓝紫管 = 湖连湖：外国人买美债，流进最大的湖<br><i class="wm-sw debt"></i> 棕管（地下·美元债）= 地下连地下：美国以外借的美元债（BIS）<br>管越宽，水量越大。</p>
      <p><b>箭头 = 水往哪流。</b>两国互相出口 = 两条并排的管，各靠右走；数字贴在出口国那一头。点一个框，只看它的管子。</p>
      <p class="wm-more"><i class="wm-sw sl"></i> 框下面的小闸 = 汇率：1 美元换多少本币，箭头 = 本币比一年前变强（↑）还是变弱（↓）。美国的闸是美元指数。点闸看「汇率」。</p>
      <p class="wm-mut wm-more">只有卡片里的「进入」按钮才会打开那个国家的水流图。</p></div>`;
  }
  const r = readings(iso), nm = nameOf(iso);
  const parts = topPartners(iso).map(p => `<li><b>${esc(nameOf(p.j))}</b> 合计 ${fmtBn(p.tot)}美元<small>出口 ${fmtBn(p.ex)} · 进口 ${fmtBn(p.im)}</small></li>`).join('');
  const fx = iso === 'USA' ? '本币就是美元' : r.fx == null || !r.ccy || r.ccy === 'mixed' ? '—' : `1 美元 = ${r.fx >= 100 ? r.fx.toFixed(0) : r.fx.toFixed(2)} ${esc(CCY_CN[r.ccy] || '')}（${esc(r.ccy)}）`;
  const k = layersIcon(iso), col = CCY_COL[r.ccy] || CCY_COL.mixed;
  // the same three layers as the box icon, in words (DESIGN-v3 「World + FX」): 河 / 湖吸力 / 地下
  const gwSub = k.pvt == null ? '没有私人欠款数据' : `私人欠款占 GDP ${fmtPct0(k.pvt)}，自己 ${k.span} 平均 ${fmtPct0(k.avg)}`;
  const lay = (cls, nm, v, sub, extra = '') => `<div class="wm-ly ${cls}"><b class="wm-ly-k">${nm}</b><div class="wm-ly-b"><span class="wm-ly-v">${v}</span><small>${sub}</small>${extra}</div></div>`;
  const layers = `<div class="wm-lys" style="--ly-c:${col}">
      ${lay('river', '河', k.infl == null ? '—' : `物价比一年前 ${fmtPct1(k.infl)}`, `GDP ${fmtBn(r.gdp)}美元`)}
      ${lay('lake', '湖吸力', k.real == null ? '—' : `实际利率 ${fmtPct1(k.real)}`, k.rate == null ? '政策利率：没有数据' : `政策利率 ${fmtPct1(k.rate)}${k.infl == null ? '' : ` − 物价涨幅 ${fmtPct1(k.infl)}`}`)}
      ${lay('ground', '地下', gwWord(k.gw), esc(gwSub), `<p class="wm-def" data-def="gw">${esc(gwDef(k.span))}</p>`)}
    </div>`;
  const ready = !!COUNTRY_READY[iso];
  const here = st.opts?.country || 'USA';
  const label = ready ? `进入 ${esc(nm)} 的水流图 →` : iso === 'ROW' ? '合并项，没有单独的水流图' : '细图制作中';
  const cov = ready ? '' : `<p class="wm-cover" data-cover="${iso}">${esc(st.cover[iso] || '')}</p>`;
  const res = st.year >= (WORLD.reservedFrom || 2022) ? ' <span class="wm-res">保留样本</span>' : '';
  return `<div class="wm-cardin" data-iso="${iso}">
    <h3>${esc(nm)}<small>${esc(iso)} · ${st.year}${res}</small></h3>
    <p class="wm-one" data-one="${iso}">${esc(ONE_LINER[iso] || '')}</p>
    ${layers}
    <p class="wm-line"><b>汇率</b> ${fx}</p>
    ${iso === 'ROW' ? '' : `<div class="wm-fx" data-fx="${iso}" data-year="${st.year}">${iso === 'USA' ? usdHtml(null, { year: st.year }) : '<p class="wm-mut">汇率闸：读数据…</p>'}</div>`}
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
  const H = tall ? clamp(Math.round(W * 2.4), 760, 1000) : side ? Math.max(480, els.stage.clientHeight || 600) : Math.max(520, Math.round(W * 0.72));
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
    <g class="wm-pipes">${pipes.sort((a, b) => a.hl - b.hl).map(p => pipeSvg(p, L)).join('')}</g>
    ${poolSvg(L)}
    <g class="wm-boxes">${ISOS.map(i => boxSvg(L.box[i], L).replace('class="wm-box', `class="wm-box${stateBox(i)}`)).join('')}</g>
    <g class="wm-sluices">${ISOS.map(i => sluiceSvg(L.box[i], L).replace('class="wm-sluice', `class="wm-sluice${st.sel === i ? ' sel' : stateBox(i)}`)).join('')}</g>
    <g class="wm-chips">${chipsSvg(pipes, L)}</g>`;
  st.last = { W, H };
  els.svg.dataset.pipes = pipes.length;
  placeTip();
}
// the 地下 definition, shown under the tapped box's 地下 row (st.tip = that iso); any other tap hides it
function placeTip() {
  const t = els.tip;
  if (!t) return;
  const hit = st.tip && els.svg.querySelector(`.wm-box[data-iso="${st.tip}"] .wm-l-hit`);
  if (!hit) { t.hidden = true; t.dataset.iso = ''; return; }
  const k = layersIcon(st.tip), W = +els.svg.getAttribute('width'), H = +els.svg.getAttribute('height');
  const now = k.gw == null ? '没有数据' : gwWord(k.gw) + (k.pvt == null ? '' : `（私人欠款占 GDP ${fmtPct0(k.pvt)}，平均 ${fmtPct0(k.avg)}）`);
  t.innerHTML = `<b>${esc(nameOf(st.tip))} ${st.year} 地下：${esc(now)}</b><span data-def="gw">${esc(gwDef(k.span))}</span>`;
  t.dataset.iso = st.tip; t.hidden = false;
  const b = hit.getBBox(), tw = Math.min(300, W - 16);
  t.style.maxWidth = tw + 'px';
  const w = t.offsetWidth, h = t.offsetHeight;
  const x = clamp(b.x + b.width / 2 - w / 2, 8, W - w - 8);
  const y = b.y + b.height + 6 + h > H - 4 ? b.y - h - 6 : b.y + b.height + 6;   // below the row, or above it near the bottom
  // svg elements have no offsetLeft: the svg's place inside the (scrolling, position: relative) stage, from the two rects
  const sr = els.stage.getBoundingClientRect(), vr = els.svg.getBoundingClientRect();
  const ox = vr.left - sr.left + els.stage.scrollLeft - els.stage.clientLeft, oy = vr.top - sr.top + els.stage.scrollTop - els.stage.clientTop;
  t.style.left = Math.round(ox + x) + 'px'; t.style.top = Math.round(oy + y) + 'px';
}
function renderCard() {
  els.card.innerHTML = cardHtml();
  els.card.dataset.sel = st.sel || '';
  if (st.sel && !COUNTRY_READY[st.sel]) loadCoverage(st.sel);
  if (st.sel && st.sel !== 'USA' && st.sel !== 'ROW') fillReactor(st.sel, st.year);
}
// the FX reactor of the selected country at the last quarter of the map's year (async: loads its quarterly data and the US one)
async function fillReactor(iso, year) {
  let html;
  try {
    const [home, us] = await Promise.all([loadCountry(iso), loadCountry('USA')]);
    const date = `${Math.min(year, 2025)}Q4`;
    const box = els.card && els.card.querySelector(`.wm-fx[data-fx="${iso}"][data-year="${year}"]`);
    if (!box) return;                                  // selection or year changed meanwhile
    html = reactorHtml(computeFxReactor(home, us, date, iso), { w: Math.max(260, Math.min(420, box.clientWidth - 4 || 320)) });
    box.innerHTML = html;
  } catch (e) {
    const box = els.card && els.card.querySelector(`.wm-fx[data-fx="${iso}"]`);
    if (box) box.innerHTML = '<p class="wm-mut">汇率闸：没有数据</p>';
  }
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
  if (st.tip && st.tip !== st.sel) st.tip = null;
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
    <div class="wm-body"><div class="wm-stage"><svg class="wm-svg" role="img" aria-label="世界地图：七个水库和它们之间的管子"></svg><div class="wm-tip" role="note" hidden></div></div><aside class="wm-card" aria-live="polite"></aside></div>`;
  els = { host, stage: host.querySelector('.wm-stage'), svg: host.querySelector('.wm-svg'), card: host.querySelector('.wm-card'), body: host.querySelector('.wm-body'), tip: host.querySelector('.wm-tip'),
    slider: host.querySelector('.wm-slider'), yv: host.querySelector('.wm-yv'), res: host.querySelector('.wm-res'), seg: host.querySelector('.wm-seg') };
  host.onclick = onClick;
  els.slider.oninput = () => { st.year = clamp(+els.slider.value, YMIN, YMAX); renderAll(); };
  els.svg.addEventListener('keydown', e => {
    const sl = e.target.closest && e.target.closest('.wm-sluice');
    if (sl && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); sl.dispatchEvent(new MouseEvent('click', { bubbles: true })); return; }
    const g = e.target.closest && e.target.closest('.wm-box');
    if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectOnMap(g.dataset.iso); }
  });
  wireFxReactor(els.card);                           // tap a reactor pipe in the card = its five forces
}
function onClick(e) {
  const t = e.target;
  const act = t.closest && t.closest('[data-act]');
  if (act && act.dataset.act === 'back') return close(true);
  if (act && act.dataset.act === 'enter') { if (!act.disabled && st.opts.onEnter) st.opts.onEnter(act.dataset.iso); return; }
  const kb = t.closest && t.closest('.wm-seg button');
  if (kb) { st.kind = kb.dataset.kind; renderCtl(); renderMap(); return; }
  if (t.closest && t.closest('.wm-tip')) { st.tip = null; placeTip(); return; }   // tapping the definition closes it
  if (t.closest && t.closest('.wm-svg')) {
    if (t.closest('.wm-sluice')) return;            // the FX sluice: the document-level [data-term] delegate opens the 汇率 card; no (de)selection
    const g = t.closest('.wm-box');
    st.tip = g && t.closest('.wm-l-hit') ? g.dataset.iso : null;   // the 地下 row: select + show its one-line definition
    if (g) selectOnMap(g.dataset.iso); else if (st.sel) selectOnMap(null); else placeTip();     // tapping empty space deselects
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
  ensureFxReactorCss();
  installFxCardHook();
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
