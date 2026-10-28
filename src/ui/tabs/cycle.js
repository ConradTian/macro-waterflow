// 周期 tab: one-line conclusion, TWO dials (大周期 / 小周期) with hysteresis evidence, trail band over the whole run,
// the four lamps (lamp -> diagram highlight) and real-vs-model charts. Reads snapshots only (snap.cycles, snap.lights).
import { esc, pct, num, LAMP, LAMP_SYMBOL, compareChart } from './_util.js';
import { term } from '../concepts.js';
import { pctFmt } from '../chart.js';
import { flash, LAMP_LINKS } from '../links.js';
import { lampBarHtml } from '../gauge.js';
import { fmtV, nextText, evidenceList, beginRows, initPins, applyUrlPin, wireEvidence } from './_cycle-ev.js';

// own stylesheet (index.html links it too; this keeps free/ and any other host working)
try {
  if (typeof document !== 'undefined' && !document.querySelector('link[href$="cycle.css"]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = new URL('../../../assets/css/cycle.css', import.meta.url).href;
    document.head.appendChild(l);
  }
} catch (e) { /* ignore */ }

const LAMPS = [
  ['credit', '信贷', 'lampCredit', v => pct(v, 1)],
  ['debtService', '偿债', 'lampDebtService', v => pct(v, 1)],
  ['policy', '政策', 'lampPolicy', v => pct(v, 1)],
  ['valuation', '估值', 'lampValuation', v => num(v, 2)],
];
const LONG_ORDER = [1, 2, 5, 6, 7, 8];
const LONG_MARK = { 1: '①', 2: '②', 5: '⑤', 6: '⑥', 7: '⑦', 8: '⑧' };
const LONG_NAME = { 1: '堆债', 2: '缓冲池满', 5: '降息失灵·私人去杠杆', 6: '政府接手', 7: '金融压制·增长化债', 8: '修复' };
const LONG_NODE = { 1: '堆债', 2: '缓冲池满', 5: '私人去杠杆', 6: '政府接手', 7: '压制化债', 8: '修复' };
const SHORT_NAME = { expand: '扩张', B1: '过热 B1', B2: '缩水 B2', tight: '收紧·衰退', ease: '降息重启' };
const SHORT_GLYPH = { expand: '扩', B1: 'B1', B2: 'B2', tight: '紧', ease: '降' };

/* ---------- small helpers ---------- */
const yr = d => String(d || '').slice(0, 4);
const polar = (cx, cy, R, deg) => [cx + R * Math.cos(deg * Math.PI / 180), cy + R * Math.sin(deg * Math.PI / 180)];
const f1 = n => (+n).toFixed(1);

function arrowAt(x1, y1, x2, y2, t = 0.55, cls = 'cy-arrow') {
  const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t, deg = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI + 90;
  return `<path d="M-4.5 4 L0 -5 L4.5 4 Z" class="${cls}" transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(deg)})"/>`;
}

/* ---------- dials ---------- */
function dialSvg({ id, nodes, edges, cur, between, progress, centre, aria }) {
  // nodes: { key: {x, y, glyph, name, anchor, dx, dy, kind} }; edges: [[from, to], ...]; progress: {from, to, frac}
  let g = '';
  for (const [a, b] of edges) {
    const A = nodes[a], B = nodes[b];
    const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, r = 19;
    const x1 = A.x + ux * r, y1 = A.y + uy * r, x2 = B.x - ux * r, y2 = B.y - uy * r;
    g += `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" class="cy-edge"/>` + arrowAt(x1, y1, x2, y2);
  }
  if (progress && nodes[progress.from] && nodes[progress.to]) {
    const A = nodes[progress.from], B = nodes[progress.to];
    const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, r = 19;
    const x1 = A.x + ux * r, y1 = A.y + uy * r, x2 = B.x - ux * r, y2 = B.y - uy * r;
    const f = Math.max(0, Math.min(1, progress.frac));
    if (f > 0) g += `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x1 + (x2 - x1) * f)}" y2="${f1(y1 + (y2 - y1) * f)}" class="cy-prog"/>`;
  }
  if (between) {
    const A = nodes[between[0]], B = nodes[between[1]];
    if (A && B) {
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      g += `<path d="M${f1(mx)} ${f1(my - 8)} L${f1(mx + 8)} ${f1(my)} L${f1(mx)} ${f1(my + 8)} L${f1(mx - 8)} ${f1(my)} Z" class="cy-between"/>`;
    }
  }
  for (const [k, n] of Object.entries(nodes)) {
    const isCur = String(k) === String(cur), isB = between && between.map(String).includes(String(k)) && !isCur;
    g += `<g class="cy-node${isCur ? ' cur' : ''}${isB ? ' tgt' : ''}${n.kind ? ' ' + n.kind : ''}">` +
      `<circle cx="${f1(n.x)}" cy="${f1(n.y)}" r="${isCur ? 20 : 17}"/>` +
      `<text x="${f1(n.x)}" y="${f1(n.y + 5)}" text-anchor="middle" class="cy-glyph">${esc(n.glyph)}</text></g>` +
      `<text x="${f1(n.x + (n.dx || 0))}" y="${f1(n.y + (n.dy || 0))}" text-anchor="${n.anchor || 'middle'}" class="cy-nm${isCur ? ' cur' : ''}">${esc(n.name)}</text>`;
  }
  g += centre;
  return `<svg viewBox="-40 0 380 270" class="cy-dial" role="img" aria-label="${esc(aria)}">${g}</svg>`;
}

function longDial(L) {
  const cx = 150, cy = 135, R = 76, nodes = {};
  LONG_ORDER.forEach((s, i) => {
    const [x, y] = polar(cx, cy, R, -90 + i * 60), c = Math.cos((-90 + i * 60) * Math.PI / 180), sn = Math.sin((-90 + i * 60) * Math.PI / 180);
    nodes[s] = { x, y, glyph: LONG_MARK[s], name: LONG_NODE[s], anchor: Math.abs(c) < 0.3 ? 'middle' : c > 0 ? 'start' : 'end',
      dx: Math.abs(c) < 0.3 ? 0 : c > 0 ? 28 : -28, dy: Math.abs(c) < 0.3 ? (sn < 0 ? -26 : 36) : 4 };
  });
  const edges = LONG_ORDER.map((s, i) => [s, LONG_ORDER[(i + 1) % 6]]);
  const nxt = L.progress ? L.progress.target : LONG_ORDER[(LONG_ORDER.indexOf(L.stage) + 1) % 6];
  const centre = `<text x="${cx}" y="${cy - 6}" text-anchor="middle" class="cy-c1">${LONG_MARK[L.stage]} ${esc(LONG_NAME[L.stage].split('·')[0])}</text>` +
    `<text x="${cx}" y="${cy + 12}" text-anchor="middle" class="cy-c2">${L.between ? `在 ${LONG_MARK[L.between[0]]} 与 ${LONG_MARK[L.between[1]]} 之间` : '慢变量·以年计'}</text>`;
  return dialSvg({ id: 'L', nodes, edges, cur: L.stage, between: L.between, centre,
    progress: { from: L.stage, to: nxt, frac: L.progress ? L.progress.have / L.progress.need : 0 },
    aria: `大周期，当前 ${L.label}${L.between ? `，在 ${LONG_MARK[L.between[0]]} 与 ${LONG_MARK[L.between[1]]} 之间` : ''}` });
}

function shortDial(S) {
  const cx = 150, cy = 135, R = 80;
  const P = (deg) => polar(cx, cy, R, deg);
  const mk = (key, deg, o = {}) => { const [x, y] = P(deg); return { x, y, glyph: SHORT_GLYPH[key], name: SHORT_NAME[key], ...o }; };
  const nodes = {
    expand: mk('expand', -90, { dy: -25 }),
    B1: mk('B1', -32, { anchor: 'start', dx: 33, dy: 4, kind: 'fork' }),
    B2: mk('B2', 32, { anchor: 'start', dx: 33, dy: 4, kind: 'fork' }),
    tight: mk('tight', 90, { dy: 36 }),
    ease: mk('ease', 180, { anchor: 'end', dx: -28, dy: 4 }),
  };
  const edges = [['expand', 'B1'], ['expand', 'B2'], ['B1', 'tight'], ['B2', 'tight'], ['tight', 'ease'], ['ease', 'expand']];
  const bx = nodes.B1.x + 24;
  const bracket = `<path d="M${f1(bx)} ${f1(nodes.B1.y)} h7 V${f1(nodes.B2.y)} h-7" class="cy-bracket"/>` +
    `<text x="${f1(bx + 11)}" y="${f1((nodes.B1.y + nodes.B2.y) / 2 + 4)}" class="cy-or">二选一</text>`;
  const cand = (S.progress || []).slice().sort((a, b) => b.have - a.have)[0];
  const centre = bracket + `<text x="${cx - 14}" y="${cy - 6}" text-anchor="middle" class="cy-c1">${esc(SHORT_NAME[S.phase])}</text>` +
    `<text x="${cx - 14}" y="${cy + 12}" text-anchor="middle" class="cy-c2">${S.between ? `在 ${SHORT_NAME[S.between[0]]} 与 ${SHORT_NAME[S.between[1]]} 之间` : '随四盏灯·以季计'}</text>`;
  return dialSvg({ id: 'S', nodes, edges, cur: S.phase, between: S.between, centre,
    progress: cand && cand.have > 0 ? { from: S.phase, to: cand.target, frac: cand.have / cand.need } : null,
    aria: `小周期，当前 ${S.label}${S.between ? `，在 ${SHORT_NAME[S.between[0]]} 与 ${SHORT_NAME[S.between[1]]} 之间` : ''}` });
}

/* ---------- evidence (rows live in ./_cycle-ev.js: ruler + where to look + 盯住) ---------- */
function pips(have, need) {
  let h = '';
  for (let i = 0; i < need; i++) h += `<i class="${i < have ? 'on' : ''}"></i>`;
  return `<span class="cy-pips" aria-hidden="true">${h}</span><span class="cy-pt">连续达标 ${have}/${need} 季</span>`;
}

const headLong = k => `${LONG_MARK[k]} ${LONG_NODE[k]}`;
const headShort = k => SHORT_NAME[k];
function card(kind, snapSide, t, ctx) {
  const isLong = kind === 'long';
  const C = snapSide;
  const since = C.since || { t: 0, date: '' };
  const len = t - since.t + 1;
  const betw = C.between
    ? `<div class="cy-between-note">◆ 在 ${isLong ? LONG_MARK[C.between[0]] : SHORT_NAME[C.between[0]]} 与 ${isLong ? LONG_MARK[C.between[1]] : SHORT_NAME[C.between[1]]} 之间：证据混合，还没连续达标，先不前进</div>` : '';
  let ev;
  if (isLong) {
    ev = `<div class="cy-evh">要进入 <b>${esc(C.progress.label)}</b> 需要：${pips(C.progress.have, C.progress.need)}</div>${evidenceList(C.evidence, { kind, ctx, mark: LONG_MARK[C.progress.target] })}`;
  } else {
    const groups = C.progress.map(p => {
      const items = C.evidence.filter(e => e.targetId === p.target);
      return `<div class="cy-evh">→ <b>${esc(p.label)}</b>${pips(p.have, p.need)}</div>${evidenceList(items, { kind, ctx, mark: SHORT_NAME[p.target] })}`;
    }).join('');
    ev = groups;
  }
  const dial = isLong ? longDial(C) : shortDial(C);
  const tid = isLong ? 'longCycle' : 'shortCycle';
  return `<article class="cy-card cy-${kind}">
    <h3 class="cy-ct">${term(tid, isLong ? '大周期' : '小周期')} <small>${isLong ? '长期债务周期 · 以年计 · 只看慢变量' : '短期债务周期 · 以季计 · 看四盏灯'}</small></h3>
    ${dial}
    <p class="cy-now"><b>${esc(C.label)}</b><span class="cy-since">自 ${esc(since.date)} 起 · 已 ${len} 季</span></p>
    ${betw}
    <details class="cy-ev-wrap" data-k="ev-${kind}"><summary>证据：现值 · 离门槛多远 · 去图里哪里看</summary><p class="cy-evhint">点任意一行：图里亮出它的位置，并打开说明卡。「盯住」：它达标时暂停提醒你。</p>${ev}</details>
    <p class="cy-next">${esc(nextText(kind, C, isLong ? headLong : headShort).text || '—')}</p>
  </article>`;
}

/* ---------- trail band ---------- */
function segments(hist, keyOf, upTo) {
  const out = [];
  for (let i = 0; i <= upTo && i < hist.length; i++) {
    const k = keyOf(hist[i]);
    if (out.length && out[out.length - 1].key === k) out[out.length - 1].to = i;
    else out.push({ key: k, from: i, to: i, label: null });
  }
  return out;
}
const openMap = { 'ev-long': true, 'ev-short': true, list: false };   // remembered across the per-step re-render
let selQ = null;            // selected quarter (kept across re-renders)
let selFor = null;

function trailSvg(hist, t, total, dates, mode) {
  const W = 360, H = 206, L = 8, R = 8, X0 = L, X1 = W - R;
  const X = i => X0 + (i / (total - 1)) * (X1 - X0);
  const qw = (X1 - X0) / (total - 1);
  const top = 20, bandB = 168, waveB = 160, waveH = 70;
  const lsegs = segments(hist, h => h.cycles.long.stage, t);
  const ssegs = segments(hist, h => h.cycles.short.phase, t);
  let g = `<defs>
    <pattern id="cy-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="var(--cy-p-tight)"/><line x1="0" y1="0" x2="0" y2="5" stroke="var(--cy-hatch)" stroke-width="2.2"/></pattern>
    <pattern id="cy-dots" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="var(--cy-p-ease)"/><circle cx="2.5" cy="2.5" r="1" fill="var(--cy-hatch)"/></pattern>
    <pattern id="cy-fut" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="var(--pn-border, #ccc)" stroke-width="1"/></pattern>
  </defs>`;
  // long band (background, full height) -- colour changes slowly by stage
  for (const s of lsegs) {
    const x = X(s.from) - qw / 2 + (s.from === 0 ? qw / 2 : 0), w = (s.to - s.from + 1) * qw - (s.from === 0 ? qw / 2 : 0);
    g += `<rect x="${f1(x)}" y="${top}" width="${f1(w)}" height="${bandB - top}" class="cy-lb cy-s${s.key}"/>`;
    if (w >= 11) g += `<text x="${f1(x + w / 2)}" y="${top + 13}" text-anchor="middle" class="cy-lbl">${LONG_MARK[s.key]}</text>`;
    if (w >= 58) g += `<text x="${f1(x + w / 2)}" y="${top + 26}" text-anchor="middle" class="cy-lbl2">${esc(LONG_NODE[s.key])}</text>`;
  }
  // future
  if (t < total - 1) {
    const x = X(t) + qw / 2;
    g += `<rect x="${f1(x)}" y="${top}" width="${f1(X1 - x)}" height="${bandB - top}" fill="url(#cy-fut)" class="cy-future"/>` +
      `<text x="${f1((x + X1) / 2)}" y="${top + 40}" text-anchor="middle" class="cy-lbl2">尚未发生</text>`;
  }
  // short cycle: waves riding inside the band. height = where in the short cycle we are (peak = fork B1/B2, trough = 收紧·衰退)
  const LV = { expand: 0.5, B1: 0.95, B2: 0.95, tight: 0.06, ease: 0.28 };
  const raw = hist.slice(0, t + 1).map(h => LV[h.cycles.short.phase]);
  const sm = raw.map((_, i) => { let a = 0, n = 0; for (let k = i - 1; k <= i + 1; k++) if (k >= 0 && k < raw.length) { a += raw[k]; n++; } return a / n; });
  const Y = v => waveB - v * waveH;
  const fillOf = p => (p === 'tight' ? 'url(#cy-hatch)' : p === 'ease' ? 'url(#cy-dots)' : `var(--cy-p-${p})`);
  for (const s of ssegs) {
    let d = `M${f1(X(s.from))} ${waveB}`;
    for (let i = s.from; i <= s.to; i++) d += ` L${f1(X(i))} ${f1(Y(sm[i]))}`;
    d += ` L${f1(X(s.to))} ${waveB} Z`;
    g += `<path d="${d}" fill="${fillOf(s.key)}" class="cy-wv"/>`;
    if ((s.key === 'B1' || s.key === 'B2')) g += `<text x="${f1((X(s.from) + X(s.to)) / 2)}" y="${f1(Y(0.95) - 4)}" text-anchor="middle" class="cy-fk">${s.key}</text>`;
  }
  let line = '';
  sm.forEach((v, i) => { line += `${i ? 'L' : 'M'}${f1(X(i))} ${f1(Y(v))}`; });
  g += `<path d="${line}" class="cy-wline"/><line x1="${X0}" x2="${X1}" y1="${waveB}" y2="${waveB}" class="cy-base"/>`;
  g += `<text x="${X0 + 2}" y="${top - 7}" class="cy-rowl">大周期（宽带）</text><text x="${X1}" y="${top - 7}" text-anchor="end" class="cy-rowl">小周期（带内的波）</text>`;
  // year ticks
  const step = mode === 'free' ? 10 : 5;
  dates.forEach((d, i) => { if (i < total && /Q1$/.test(d) && (+d.slice(0, 4)) % step === 0)
    g += `<line x1="${f1(X(i))}" x2="${f1(X(i))}" y1="${bandB}" y2="${bandB + 4}" class="cy-tick"/><text x="${f1(X(i))}" y="${bandB + 16}" text-anchor="middle" class="cy-yr">${d.slice(0, 4)}</text>`; });
  // now + selection
  g += `<line x1="${f1(X(t))}" x2="${f1(X(t))}" y1="${top - 4}" y2="${bandB}" class="cy-now-l"/>` +
    `<text x="${f1(Math.min(X(t), W - 22))}" y="${bandB + 30}" text-anchor="${X(t) > W - 30 ? 'end' : 'middle'}" class="cy-nowt">▲ 现在</text>`;
  if (selQ != null && selQ <= t) g += `<line x1="${f1(X(selQ))}" x2="${f1(X(selQ))}" y1="${top - 4}" y2="${bandB}" class="cy-sel-l"/>`;
  return { svg: `<svg viewBox="0 0 ${W} ${H}" class="cy-trail-svg" role="img" aria-label="时间轨迹：宽带是大周期，带内的波是小周期，点任意位置查看">${g}</svg>`, X0, X1, W, total };
}

function legend() {
  const sw = (cls, txt, pat) => `<span class="cy-lg"><i class="cy-sw ${cls}${pat ? ' ' + pat : ''}"></i>${txt}</span>`;
  return `<div class="cy-legend">
    <div class="cy-lgrow"><b>大周期</b>${LONG_ORDER.map(s => `<span class="cy-lg"><i class="cy-sw cy-s${s}"></i>${LONG_MARK[s]}${LONG_NODE[s]}</span>`).join('')}</div>
    <div class="cy-lgrow"><b>小周期</b>${sw('p-expand', '扩张')}${sw('p-B1', 'B1 过热（波峰）')}${sw('p-B2', 'B2 缩水（波峰）')}${sw('p-tight', '收紧·衰退（斜纹·波谷）', 'hatch')}${sw('p-ease', '降息重启（点纹）', 'dots')}</div>
  </div>`;
}

function rangeText(hist, seg) {
  const a = hist[seg.from].date, b = hist[seg.to].date, n = seg.to - seg.from + 1;
  return a === b ? a : `${a} – ${b}（${n} 季）`;
}
function detailHtml(hist, q, t) {
  const h = hist[q];
  const ls = segments(hist, x => x.cycles.long.stage, t).find(s => q >= s.from && q <= s.to);
  const ss = segments(hist, x => x.cycles.short.phase, t).find(s => q >= s.from && q <= s.to);
  return `<b>${esc(h.date)}</b>　大周期 <b>${esc(h.cycles.long.label)}</b>（${esc(rangeText(hist, ls))}）；小周期 <b>${esc(h.cycles.short.label)}</b>（${esc(rangeText(hist, ss))}）`;
}

function trailBlock(ctx) {
  const t = ctx.sim.t, hist = ctx.sim.history('model');
  const mode = ctx.sim.mode;
  const total = mode === 'free' ? 224 : (ctx.real?.dates?.length || 124);
  const dates = mode === 'free' ? Array.from({ length: 224 }, (_, i) => `${1995 + Math.floor(i / 4)}Q${(i % 4) + 1}`) : ctx.real.dates;
  if (selFor !== mode || (selQ != null && selQ > t)) { selQ = null; selFor = mode; }
  const tr = trailSvg(hist, t, total, dates, mode);
  const lsegs = segments(hist, h => h.cycles.long.stage, t), ssegs = segments(hist, h => h.cycles.short.phase, t);
  const listBtn = (kind, s) => `<button type="button" class="cy-seg" data-q="${s.from}">${kind === 'long' ? esc(LONG_MARK[s.key] + ' ' + LONG_NODE[s.key]) : esc(SHORT_NAME[s.key])}<small>${esc(hist[s.from].date)}${s.to > s.from ? '–' + esc(hist[s.to].date) : ''}</small></button>`;
  const html = `<div class="cy-trail" data-total="${total}">
    <div class="cy-trail-wrap">${tr.svg}</div>
    <p class="cy-detail" aria-live="polite">${selQ != null ? detailHtml(hist, selQ, t) : '点图上任意位置：看那一季属于大周期哪一段、小周期哪一段。'}</p>
    ${legend()}
    <details class="cy-textlist" data-k="list"><summary>文字版时间线（可逐段点选）</summary>
      <div class="cy-segs"><b>大周期</b>${lsegs.map(s => listBtn('long', s)).join('')}</div>
      <div class="cy-segs"><b>小周期</b>${ssegs.map(s => listBtn('short', s)).join('')}</div>
    </details></div>`;
  return { html, geo: tr, hist, t };
}

function wireTrail(container, ctx, tb) {
  const box = container.querySelector('.cy-trail');
  if (!box) return;
  const svg = box.querySelector('svg'), det = box.querySelector('.cy-detail');
  const pick = q => {
    selQ = Math.max(0, Math.min(tb.t, q));
    det.innerHTML = detailHtml(tb.hist, selQ, tb.t);
    const old = svg.querySelector('.cy-sel-l'); if (old) old.remove();
    const x = tb.geo.X0 + (selQ / (tb.geo.total - 1)) * (tb.geo.X1 - tb.geo.X0);
    const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    ln.setAttribute('class', 'cy-sel-l'); ln.setAttribute('x1', x); ln.setAttribute('x2', x); ln.setAttribute('y1', 16); ln.setAttribute('y2', 168);
    svg.appendChild(ln);
  };
  svg.addEventListener('click', ev => {
    const r = svg.getBoundingClientRect();
    const vx = (ev.clientX - r.left) / r.width * tb.geo.W;
    pick(Math.round((vx - tb.geo.X0) / (tb.geo.X1 - tb.geo.X0) * (tb.geo.total - 1)));
  });
  box.querySelectorAll('.cy-seg').forEach(b => b.addEventListener('click', () => pick(+b.dataset.q)));
}

/* ---------- render ---------- */
function lead(s) {
  const c = s.cycles;
  if (!c) return `现在大概在 <b>${esc((s.ring || {}).label || '—')}</b>，下一个确认信号：<b>${esc((s.ring || {}).nextSignal || '—')}</b>`;
  const L = c.long, S = c.short;
  const lt = L.between ? `在 ${LONG_MARK[L.between[0]]} 与 ${LONG_MARK[L.between[1]]} 之间` : `${esc(L.label)}`;
  const ln = nextText('long', L, headLong).text, sn = nextText('short', S, headShort).text;
  return `<div class="cy-lead1"><b>大周期</b> ${lt}（${esc(yr(L.since.date))} 起）<span class="cy-lnext">${esc(ln)}</span></div>` +
    `<div class="cy-lead1"><b>小周期</b> ${esc(S.label)}${S.between ? `（在 ${SHORT_NAME[S.between[0]]} 与 ${SHORT_NAME[S.between[1]]} 之间）` : ''}<span class="cy-lnext">${esc(sn)}</span></div>`;
}

export function render(container, ctx) {
  const s = ctx.snap, L = s.lights || {};
  const lamps = LAMPS.map(([k, name, tid, f]) => {
    const l = L[k] || {};
    return `<div class="lp lp-${l.level}" data-lamp="${k}" tabindex="0"><div class="lp-top"><span class="lp-sym" aria-hidden="true">${LAMP_SYMBOL[l.level] || '○'}</span>` +
      `${term(tid, name + '灯')}<b class="lp-lv">${LAMP[l.level] || '—'}</b></div>` +
      `<div class="lp-val">${esc(l.label || '')} ${f(l.value)}</div><div class="lp-drv">驱动：${esc(l.driver || '—')}</div>${lampBarHtml(k, s, ctx.sim)}</div>`;
  }).join('');
  let dials = '', trail = null;
  if (s.cycles) {
    initPins(ctx); beginRows();
    const mk = () => `<div class="cy-dials">${card('long', s.cycles.long, s.t, ctx)}${card('short', s.cycles.short, s.t, ctx)}</div>`;
    dials = mk();
    if (applyUrlPin(ctx)) { beginRows(); dials = mk(); }      // ?pin=... pinned a row after the first pass: draw it as pinned
    trail = trailBlock(ctx);
  } else dials = '<p class="pn-empty">（此版本引擎没有双周期检测）</p>';
  container.innerHTML = `<section class="pn-tab pn-cycle">
    <div class="pn-lead cy-lead">${lead(s)}</div>
    ${dials}
    ${trail ? `<h3 class="pn-h">轨迹带 <small>宽带 = 大周期（慢慢换色）；带里的波 = 一轮轮小周期；黑线 = 现在</small></h3>${trail.html}` : ''}
    <h3 class="pn-h">四盏灯 <small>形状 + 文字 + 颜色同时表示；点灯，看图里哪些水管在喂它</small></h3>
    <div class="lp-grid">${lamps}</div>
    <h3 class="pn-h">真实 vs 模型 <small>模型偏离真实本来就正常：它是玩具</small></h3>
    <div class="pn-charts"><div id="cy-c1"></div><div id="cy-c2"></div><div id="cy-c3"></div></div>
  </section>`;
  container.querySelectorAll('details[data-k]').forEach(d => {
    d.open = openMap[d.dataset.k] !== false && (openMap[d.dataset.k] || false);
    d.addEventListener('toggle', () => { openMap[d.dataset.k] = d.open; });
  });
  if (trail) wireTrail(container, ctx, trail);
  if (s.cycles) wireEvidence(container, ctx);
  container.querySelectorAll('.lp[data-lamp]').forEach(lp => {
    const go = ev => {
      if (ev.target.closest('.term')) return;
      container.querySelectorAll('.lp-sel').forEach(c => c.classList.remove('lp-sel'));
      lp.classList.add('lp-sel');
      flash(LAMP_LINKS[lp.dataset.lamp], 3000, () => lp.classList.remove('lp-sel'));
    };
    lp.addEventListener('click', go);
    lp.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(ev); } });
  });
  compareChart(container.querySelector('#cy-c1'), ctx, { title: '政策利率', realKey: 'policyRate', modelFn: x => x.rates.policy, fmt: pctFmt });
  compareChart(container.querySelector('#cy-c2'), ctx, { title: '房价指数 (1995Q1=100)', realKey: 'houseIndex', modelFn: x => x.assets.housing.price });
  compareChart(container.querySelector('#cy-c3'), ctx, { title: '家庭 DSR', realKey: 'hhDsr', modelFn: x => x.household.dsr, fmt: pctFmt });
}
