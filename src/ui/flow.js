// Animated water diagram (schematic SVG). renderFlow(svgHost, snap, prevSnap).
// Geometry is fixed in a 390x390 viewBox; only widths / levels / texts change per quarter.
// Widths and levels are tweened with requestAnimationFrame; dash speed is a CSS animation.

const NS = 'http://www.w3.org/2000/svg';
const VB_W = 390, VB_H = 390;

function el(name, attrs, parent) {
  const n = document.createElementNS(NS, name);
  for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

/* ---------- static layout ---------- */
// pts follow flow direction. chip = [x, y, anchor]. term = concept id (clickable).
const PIPES = [
  { k: 'qe',              cls: 'fiscal',    label: 'QE',       term: 'qe',              pts: [[70, 52], [70, 89], [135, 89]],     chip: [72, 70, 'start'] },
  { k: 'fiscalInjection', cls: 'fiscal',    label: '财政注入', term: 'fiscalInjection', pts: [[300, 52], [300, 150]],             chip: [302, 100, 'start'] },
  { k: 'taxes',           cls: 'cash',      label: '税收',                               pts: [[372, 262], [372, 52]],             chip: [370, 160, 'end'] },
  { k: 'newLoans',        cls: 'credit',    label: '新贷款',   term: 'newLoans',        pts: [[178, 112], [178, 150]],            chip: [176, 131, 'end'] },
  { k: 'interestPaid',    cls: 'repay',     label: '付息',     term: 'interestPaid',    pts: [[212, 150], [212, 112]],            chip: [214, 131, 'start'] },
  { k: 'principalRepay',  cls: 'repay',     label: '还本',     term: 'principalRepay',  pts: [[96, 172], [70, 172]],              chip: [38, 208, 'middle'] },
  { k: 'toHousing',       cls: 'housing',   label: '房产',     term: 'assetReservoir',  pts: [[108, 194], [108, 262]],            chip: [106, 232, 'end'] },
  { k: 'toFinancial',     cls: 'financial', label: '金融',     term: 'assetReservoir',  pts: [[136, 194], [136, 262]],            chip: [138, 214, 'start'] },
  { k: 'toCash',          cls: 'cash',      label: '现金',                              pts: [[191, 194], [191, 262]],            chip: [191, 308, 'middle'], chipOffTube: true },
  { k: 'toConsumption',   cls: 'goods',     label: '消费',                              pts: [[236, 194], [236, 262]],            chip: [234, 236, 'end'] },
  { k: 'wages',           cls: 'goods',     label: '工资',                              pts: [[262, 262], [262, 194]],            chip: [266, 208, 'start'] },
  { k: 'profits',         cls: 'goods',     label: '利润',                              pts: [[274, 262], [274, 194]],            chip: [278, 224, 'start'] },
  { k: 'toCapex',         cls: 'capex',     label: 'Capex',    term: 'capex', slow: true, pts: [[316, 182], [332, 182], [332, 262]], chip: [328, 244, 'end'] },
  { k: 'spillToGoods',    cls: 'goods',     label: '溢出',                              pts: [[160, 336], [226, 336]],            chip: [193, 324, 'middle'] },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const fmtBn = v => (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v).toString());
const pct = (v, d = 1) => (v * 100).toFixed(d) + '%';

// rough text width (CJK = 1em, others ~0.58em)
function estW(str, fs) {
  let w = 0;
  for (const ch of str) w += ch.charCodeAt(0) > 255 ? fs : fs * 0.58;
  return w;
}

/* ---------- value mapping ---------- */
const pipeWidth = f => (f < 0.5 ? 1 : clamp(1 + 8 * Math.sqrt(f / 700), 1, 9.5));
const dashPeriod = f => (f < 0.5 ? 0 : 15 / (14 + 46 * Math.sqrt(f / 700))); // seconds per 15px dash period

function targets(snap, st) {
  const f = snap.flows || {};
  const a = snap.assets || {};
  const mean = ((a.housing?.price ?? 100) + (a.equity?.price ?? 100)) / 2;
  const cap = snap.macro?.capacity ?? 100;
  if (st.cap0 == null || snap.t === 0) st.cap0 = cap;
  return {
    w: Object.fromEntries(PIPES.map(p => [p.k, pipeWidth(f[p.k] ?? 0)])),
    res: 0.1 + 0.85 * clamp((Math.log(mean / 100) + 0.7) / (Math.log(8) + 0.7), 0, 1),
    chLvl: clamp(0.5 + 6 * (snap.macro?.outputGap ?? 0), 0.12, 0.95),
    chW: 104 + 54 * clamp(Math.log(cap / st.cap0) / Math.log(2.5), 0, 1),
    gauge: clamp(((snap.bank?.approval ?? 1) - 0.5) / 1.0, 0, 1),
  };
}

/* ---------- build DOM once ---------- */
function node(g, x, y, w, h, cls = '') { return el('rect', { class: 'node ' + cls, x, y, width: w, height: h, rx: 10 }, g); }
function txt(g, x, y, str, cls = '', anchor = 'start') {
  const t = el('text', { x, y, class: cls, 'text-anchor': anchor }, g);
  t.textContent = str;
  return t;
}
// clickable wrapper group with generous hit area
function termGroup(parent, term, hit) {
  const g = el('g', term ? { class: 'term', 'data-term': term } : {}, parent);
  if (hit) el('rect', { class: 'hit', x: hit[0], y: hit[1], width: hit[2], height: hit[3] }, g);
  return g;
}

function build(host) {
  host.textContent = '';
  const svg = el('svg', { class: 'flow-svg', viewBox: `0 0 ${VB_W} ${VB_H}`, preserveAspectRatio: 'xMidYMid meet',
    role: 'img', 'aria-label': '宏观水流示意图：央行、银行、借款人、资产池与商品河道之间的资金流向' }, host);
  const R = { pipes: {} };

  // water bodies + node boxes (back layer)
  const back = el('g', {}, svg);
  node(back, 10, 8, 120, 44);                 // 央行
  node(back, 260, 8, 120, 44);                // 政府
  node(back, 135, 66, 120, 46);               // 银行
  node(back, 96, 150, 220, 44);               // 借款人
  el('line', { x1: 206, y1: 156, x2: 206, y2: 188, class: 'frame' }, back);
  node(back, 6, 150, 64, 44, 'soft');         // 排水口
  node(back, 10, 262, 150, 108);              // 资产池
  R.resWater = el('rect', { class: 'water', x: 10, y: 262, width: 150, height: 0 }, back);
  node(back, 172, 262, 38, 32, 'soft');       // 现金池
  el('rect', { class: 'frame', x: 226, y: 262, width: 158, height: 108, rx: 10 }, back); // 河道最大容量
  R.river = el('rect', { class: 'node soft', x: 230, y: 266, width: 150, height: 100, rx: 8 }, back);
  R.chWater = el('rect', { class: 'water goods', x: 230, y: 266, width: 150, height: 0 }, back);
  // approval gauge in bank
  el('rect', { class: 'gauge-bg', x: 145, y: 100, width: 100, height: 6, rx: 3 }, back);
  el('line', { class: 'gauge-mid', x1: 195, y1: 98, x2: 195, y2: 108 }, back);
  R.gauge = el('circle', { class: 'gauge-mark', cx: 195, cy: 103, r: 5 }, back);

  // pipes
  const pipeLayer = el('g', {}, svg);
  for (const p of PIPES) {
    const g = el('g', { class: p.cls }, pipeLayer);
    const d = 'M' + p.pts.map(q => q.join(' ')).join(' L');
    const bed = el('path', { class: 'bed', d }, g);
    const dash = el('path', { class: 'dash' + (p.slow ? ' slow' : ''), d }, g);
    const arrow = el('polygon', { class: 'arrow', points: '0,0 0,0 0,0' }, g);
    R.pipes[p.k] = { g, bed, dash, arrow, def: p };
  }

  // chips (labels) above pipes
  const chipLayer = el('g', {}, svg);
  for (const p of PIPES) {
    const g = el('g', { class: 'chip ' + p.cls + (p.term ? ' term' : '') }, chipLayer);
    if (p.term) g.setAttribute('data-term', p.term);
    const hit = el('rect', { class: 'hit', rx: 8 }, g);
    const bg = el('rect', { class: 'bg', height: 15, rx: 7.5 }, g);
    const t = el('text', { 'text-anchor': 'middle', dy: '.35em' }, g);
    Object.assign(R.pipes[p.k], { chip: g, chipBg: bg, chipHit: hit, chipText: t });
  }

  // node texts (top layer)
  const top = el('g', {}, svg);
  let g = termGroup(top, null);
  txt(g, 20, 27, '央行', 'ttl');
  g = termGroup(top, 'policyRate', [14, 30, 112, 22]);
  R.rate = txt(g, 20, 44, '', 'sub');

  txt(top, 270, 27, '政府', 'ttl');
  R.gov = txt(top, 270, 44, '', 'sub');

  txt(top, 145, 82, '银行', 'ttl');
  g = termGroup(top, 'bankApproval', [140, 70, 110, 22]);
  R.bank = txt(g, 183, 82, '', 'sub');

  txt(top, 104, 170, '家庭', 'ttl');
  R.hh = txt(top, 104, 186, '', 'sub');
  txt(top, 214, 170, '企业', 'ttl');
  R.firm = txt(top, 214, 186, '', 'sub');
  txt(top, 38, 168, '货币', 'sub', 'middle');
  txt(top, 38, 181, '注销', 'sub', 'middle');
  txt(top, 38, 191, '', 'sub', 'middle');

  g = termGroup(top, 'assetReservoir', [14, 266, 100, 24]);
  txt(g, 18, 280, '资产池', 'ttl');
  R.resH = txt(top, 18, 332, '', 'sub');
  R.resE = txt(top, 18, 346, '', 'sub');
  R.resB = txt(top, 18, 360, '', 'sub');

  g = termGroup(top, 'goodsChannel', [232, 270, 100, 24]);
  txt(g, 236, 285, '商品河道', 'ttl');
  g = termGroup(top, 'cpi', [232, 292, 90, 22]);
  R.cpi = txt(g, 236, 305, '', 'sub');
  R.px = txt(top, 236, 343, '', 'sub');
  g = termGroup(top, 'capacity', [232, 346, 100, 22]);
  R.cap = txt(g, 236, 360, '', 'sub');

  txt(top, 191, 276, '现金', 'sub', 'middle');
  txt(top, 191, 288, '', 'sub', 'middle');
  R.unit = txt(top, 384, 384, '管宽 = 本季流量（十亿美元）；点虚线下划线术语看解释', 'caption', 'end');
  R.unit.setAttribute('x', 384);
  return R;
}

/* ---------- apply (called every animation frame) ---------- */
function applyCur(R, cur) {
  for (const p of PIPES) {
    const r = R.pipes[p.k];
    const w = cur.w[p.k];
    r.bed.setAttribute('stroke-width', w.toFixed(2));
    r.dash.setAttribute('stroke-width', Math.max(1, w * 0.62).toFixed(2));
    // arrowhead at the last point, pointing along the last segment
    const [x1, y1] = p.pts[p.pts.length - 2], [x2, y2] = p.pts[p.pts.length - 1];
    const dx = Math.sign(x2 - x1), dy = Math.sign(y2 - y1);
    const L = 5 + w * 0.7, H = 3 + w * 0.65;
    const bx = x2 - dx * L, by = y2 - dy * L;
    const px = -dy * H, py = dx * H;
    r.arrow.setAttribute('points', `${x2},${y2} ${bx + px},${by + py} ${bx - px},${by - py}`);
  }
  const h = 108 * cur.res;
  R.resWater.setAttribute('y', (370 - h).toFixed(1));
  R.resWater.setAttribute('height', h.toFixed(1));
  const rw = cur.chW, rx = 305 - rw / 2;
  R.river.setAttribute('x', rx.toFixed(1)); R.river.setAttribute('width', rw.toFixed(1));
  const ch = 100 * cur.chLvl;
  R.chWater.setAttribute('x', rx.toFixed(1)); R.chWater.setAttribute('width', rw.toFixed(1));
  R.chWater.setAttribute('y', (366 - ch).toFixed(1)); R.chWater.setAttribute('height', ch.toFixed(1));
  R.gauge.setAttribute('cx', (145 + 100 * cur.gauge).toFixed(1));
}

/* ---------- texts (set immediately each quarter) ---------- */
function placeChip(r, str) {
  const [x, y, anchor] = r.def.chip;
  const w = Math.ceil(estW(str, 10)) + 10;
  const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
  r.chipBg.setAttribute('x', x0); r.chipBg.setAttribute('y', y - 7.5); r.chipBg.setAttribute('width', w);
  r.chipHit.setAttribute('x', x0 - 4); r.chipHit.setAttribute('y', y - 13); r.chipHit.setAttribute('width', w + 8);
  r.chipHit.setAttribute('height', 26);
  r.chipText.setAttribute('x', x0 + w / 2); r.chipText.setAttribute('y', y);
  r.chipText.textContent = str;
}

function setTexts(R, snap, st) {
  const f = snap.flows || {}, a = snap.assets || {}, m = snap.macro || {};
  for (const p of PIPES) {
    const v = f[p.k] ?? 0;
    placeChip(R.pipes[p.k], `${p.label} ${fmtBn(v)}`);
    const idle = v < 0.5;
    R.pipes[p.k].g.classList.toggle('idle', idle);
    if (!idle) R.pipes[p.k].dash.style.animationDuration = dashPeriod(v).toFixed(2) + 's';
  }
  R.rate.textContent = `政策利率 ${pct(snap.rates?.policy ?? 0, 2)}`;
  R.gov.textContent = `债务/GDP ${pct(snap.gov?.debtGdp ?? 0, 0)}`;
  R.bank.textContent = `审批 ×${(snap.bank?.approval ?? 1).toFixed(2)}`;
  R.hh.textContent = `DSR ${pct(snap.household?.dsr ?? 0)}`;
  R.firm.textContent = `利润 ${fmtBn(snap.firm?.profit ?? 0)}`;
  R.resH.textContent = `房产 ${Math.round(a.housing?.price ?? 0)}`;
  R.resE.textContent = `股票 ${Math.round(a.equity?.price ?? 0)}`;
  R.resB.textContent = `国债 ${Math.round(a.bond?.price ?? 0)}`;
  R.cpi.textContent = `CPI ${pct(m.inflation ?? 0)}`;
  R.px.textContent = `物价 ${Math.round(m.priceLevel ?? 0)}`;
  R.cap.textContent = `产能 ${Math.round(100 * (m.capacity ?? 100) / st.cap0)}`;
}

/* ---------- public ---------- */
export function renderFlow(host, snap, prevSnap) {
  if (!snap) return;
  let st = host._flow;
  if (!st) {
    st = host._flow = { R: build(host), cur: null, from: null, tgt: null, t0: 0, raf: 0 };
    const base = targets(prevSnap || snap, st);
    st.cur = base;
  }
  const tgt = targets(snap, st);
  setTexts(st.R, snap, st);

  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dur = reduce ? 0 : (host._flowDur ?? 700);
  cancelAnimationFrame(st.raf);
  st.from = JSON.parse(JSON.stringify(st.cur));
  st.tgt = tgt;
  st.t0 = performance.now();
  const tick = now => {
    const k = dur ? clamp((now - st.t0) / dur, 0, 1) : 1;
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // ease in-out
    const cur = { w: {}, res: lerp(st.from.res, tgt.res, e), chLvl: lerp(st.from.chLvl, tgt.chLvl, e),
      chW: lerp(st.from.chW, tgt.chW, e), gauge: lerp(st.from.gauge, tgt.gauge, e) };
    for (const p of PIPES) cur.w[p.k] = lerp(st.from.w[p.k], tgt.w[p.k], e);
    st.cur = cur;
    applyCur(st.R, cur);
    if (k < 1) st.raf = requestAnimationFrame(tick);
  };
  tick(st.t0); // applies the first frame; schedules further frames itself
}

// optional: caller can set tween length (ms) to match playback speed
export function setFlowDuration(host, ms) { host._flowDur = ms; }
