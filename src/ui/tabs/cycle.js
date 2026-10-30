// 周期 tab: one-line conclusion, TWO dials (大周期 / 小周期) with hysteresis evidence, trail band over the whole run,
// the four lamps (lamp -> diagram highlight) and real-vs-model charts. Reads snapshots only (snap.cycles, snap.lights).
import { esc, pct, num, LAMP, LAMP_SYMBOL, compareChart, dataNoteHtml } from './_util.js';
import { term } from '../concepts.js';
import { pctFmt } from '../chart.js';
import { flash, LAMP_LINKS } from '../links.js';
import { lampBarHtml } from '../gauge.js';
import { fmtV, nextText, evidenceList, reqMet, beginRows, initPins, applyUrlPin, wireEvidence } from './_cycle-ev.js';
import { wavesHtml, wireWaves } from './_cycle-waves.js';
import { KEY_LABEL, TOP_LABEL } from '../../engine/regimes.js';

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
// short names for the dial (cards and texts use KEY_LABEL). B1/B2 are NOT short-cycle names any more: they are the long cycle's fork after ②.
const SHORT_NAME = { expand: '扩张', hot: '过热', tight: '收紧', ease: '降息' };
const SHORT_GLYPH = { expand: '扩', hot: '热', tight: '紧', ease: '降' };
const KEY_SHORT = { expand: '扩张', hotP: '物价过热', hotA: '资产过热', tight: '收紧', ease: '降息' };
const keyPhase = k => (k === 'hotP' || k === 'hotA' ? 'hot' : k);          // internal key -> dial node
const RING_NEXT = { expand: 'hot', hot: 'tight', tight: 'ease', ease: 'expand' };

/* ---------- small helpers ---------- */
const yr = d => String(d || '').slice(0, 4);
const polar = (cx, cy, R, deg) => [cx + R * Math.cos(deg * Math.PI / 180), cy + R * Math.sin(deg * Math.PI / 180)];
const f1 = n => (+n).toFixed(1);

function arrowDir(x, y, dx, dy, cls = 'cy-arrow') {
  const deg = Math.atan2(dy, dx) * 180 / Math.PI + 90;
  return `<path d="M-4.5 4 L0 -5 L4.5 4 Z" class="${cls}" transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(deg)})"/>`;
}
function arrowAt(x1, y1, x2, y2, t = 0.55, cls = 'cy-arrow') {
  return arrowDir(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, x2 - x1, y2 - y1, cls);
}

/* ---------- dials ---------- */
function dialSvg({ id, nodes, edges, cur, between, progress, centre, aria, under = '', over = '' }) {
  // nodes: { key: {x, y, glyph, name, anchor, dx, dy, kind} }; edges: [[from, to], ...]; progress: {from, to, frac}
  // under = svg drawn after the ring edges, before the nodes (fork branches / exit arrow); over = drawn last
  let g = '';
  for (const [a, b] of edges) {
    const A = nodes[a], B = nodes[b];
    const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, r = 19;
    const x1 = A.x + ux * r, y1 = A.y + uy * r, x2 = B.x - ux * r, y2 = B.y - uy * r;
    g += `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" class="cy-edge"/>` + arrowAt(x1, y1, x2, y2);
  }
  g += under;
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
  g += centre + over;
  return `<svg viewBox="-40 0 380 270" class="cy-dial" role="img" aria-label="${esc(aria)}">${g}</svg>`;
}

export function longDial(L) {
  const cx = 150, cy = 135, R = 76, nodes = {};
  LONG_ORDER.forEach((s, i) => {
    const [x, y] = polar(cx, cy, R, -90 + i * 60), c = Math.cos((-90 + i * 60) * Math.PI / 180), sn = Math.sin((-90 + i * 60) * Math.PI / 180);
    nodes[s] = { x, y, glyph: LONG_MARK[s], name: LONG_NODE[s], anchor: Math.abs(c) < 0.3 ? 'middle' : c > 0 ? 'start' : 'end',
      dx: Math.abs(c) < 0.3 ? 0 : c > 0 ? 28 : -28, dy: Math.abs(c) < 0.3 ? (sn < 0 ? -26 : 36) : 4 };
  });
  const edges = LONG_ORDER.map((s, i) => [s, LONG_ORDER[(i + 1) % 6]]);
  const nxt = L.progress ? L.progress.target : LONG_ORDER[(LONG_ORDER.indexOf(L.stage) + 1) % 6];
  const n1 = nodes[1], n2 = nodes[2], n5 = nodes[5];
  // the fork after ②: B2 sits on the ② -> ⑤ edge (asset prices fall, debts stay -> 降息失灵); B1 spills into prices and goes back to the short cycle (-> ①)
  const b1On = L.fork === 'B1', b2On = L.fork === 'B2', b2Pend = !b2On && !!L.forkPending;   // pending = the three conditions hold, not yet b2N quarters
  const sx = n2.x + 10, sy = n2.y - 17, qx = n2.x + 34, qy = n1.y - 31, ex = n1.x + 17, ey = n1.y - 8;
  const midY = (n2.y + n5.y) / 2, by1 = n2.y + 19, by2 = n5.y - 19;
  const under =
    `<g class="cy-fk cy-fk1${b1On ? ' on' : ''}"><path d="M${f1(sx)} ${f1(sy)} Q${f1(qx)} ${f1(qy)} ${f1(ex)} ${f1(ey)}" class="cy-fk-l"/>` +
    arrowDir(ex, ey, ex - qx, ey - qy, 'cy-fk-a') +
    `<text x="${f1(n2.x + 26)}" y="${f1(n1.y - 13)}" class="cy-fk-t">B1 溢出（通胀）</text><text x="${f1(n2.x + 26)}" y="${f1(n1.y)}" class="cy-fk-s">交给小周期，回 ①</text></g>` +
    `<g class="cy-fk cy-fk2${b2On ? ' on' : b2Pend ? ' pend' : ''}"><line x1="${f1(n2.x)}" y1="${f1(by1)}" x2="${f1(n5.x)}" y2="${f1(by2)}" class="cy-fk-l"/>` +
    arrowDir(n5.x, by2 - 8, 0, 1, 'cy-fk-a') +
    `<text x="${f1(n2.x + 9)}" y="${f1(midY - 3)}" class="cy-fk-t">B2 跌破吸程线</text><text x="${f1(n2.x + 9)}" y="${f1(midY + 10)}" class="cy-fk-s">降息推不动 → ⑤</text></g>`;
  const cur = nodes[L.stage];
  const over = L.b1Overlay ? `<g class="cy-b1badge"><circle cx="${f1(cur.x + 15)}" cy="${f1(cur.y - 15)}" r="9"/><text x="${f1(cur.x + 15)}" y="${f1(cur.y - 12)}" text-anchor="middle">B1</text></g>` : '';
  const c3 = L.b1Overlay ? '叠着 B1 溢出' : L.fork ? (L.fork === 'B2' ? 'B2：跌破吸程线' : '岔路：B1 溢出') : b2Pend ? `B2 待确认 ${L.forkPending.have}/${L.forkPending.need} 季` : '';
  const centre = `<text x="${cx}" y="${cy - 6}" text-anchor="middle" class="cy-c1">${LONG_MARK[L.stage]} ${esc(LONG_NAME[L.stage].split('·')[0])}</text>` +
    `<text x="${cx}" y="${cy + 12}" text-anchor="middle" class="cy-c2">${L.between ? `在 ${LONG_MARK[L.between[0]]} 与 ${LONG_MARK[L.between[1]]} 之间` : '慢变量·以年计'}</text>` +
    (c3 ? `<text x="${cx}" y="${cy + 28}" text-anchor="middle" class="cy-c3${L.b1Overlay ? ' b1' : ''}">${esc(c3)}</text>` : '');
  return dialSvg({ id: 'L', nodes, edges, cur: L.stage, between: L.between, centre, under, over,
    progress: { from: L.stage, to: nxt, frac: L.progress ? L.progress.have / L.progress.need : 0 },
    aria: `大周期，当前 ${L.label}${L.between ? `，在 ${LONG_MARK[L.between[0]]} 与 ${LONG_MARK[L.between[1]]} 之间` : ''}${L.fork ? (L.fork === 'B2' ? '，地下水位跌破吸程线（B2）' : `，岔路 ${L.fork}`) : b2Pend ? '，B2 待确认' : ''}${L.b1Overlay ? '，叠着 B1 溢出' : ''}` });
}

export function shortDial(S) {
  // four steps on a ring: 扩张 -> 过热 -> 收紧（央行加息；带衰退证据时标「收紧·衰退」）-> 降息（推得动吗？）; from 降息 two ways out: 推得动 -> 扩张 (ring edge) or 推不动 -> 大周期 B2 -> ⑤ (dashed exit)
  const cx = 150, cy = 128;
  const nodes = {
    expand: { x: cx, y: cy - 75, glyph: SHORT_GLYPH.expand, name: SHORT_NAME.expand, dy: -26 },
    hot: { x: cx + 100, y: cy, glyph: SHORT_GLYPH.hot, name: SHORT_NAME.hot, anchor: 'start', dx: 26, dy: 0 },
    tight: { x: cx, y: cy + 75, glyph: SHORT_GLYPH.tight, name: SHORT_NAME.tight, dy: 38 },
    ease: { x: cx - 100, y: cy, glyph: SHORT_GLYPH.ease, name: SHORT_NAME.ease, anchor: 'end', dx: -26, dy: -2 },
  };
  const edges = [['expand', 'hot'], ['hot', 'tight'], ['tight', 'ease'], ['ease', 'expand']];
  const ph = S.phase, no = S.handoff === 'no';
  const E = nodes.ease, H = nodes.hot;
  // kind of top, small, under 过热 (top while hot; via = which kind this round came from, kept during tight / ease)
  const topTxt = S.top ? TOP_LABEL[S.top] : S.via ? `接${TOP_LABEL[S.via]}` : '物价或资产';
  const hotSub = `<text x="${f1(H.x + 26)}" y="${f1(H.y + 17)}" class="cy-sub${S.top ? ' top' : S.via ? '' : ' dim'}">${esc(topTxt)}</text>`;
  // 收紧 = the bank is hiking; the sub-text 加息 / 衰退 is read from the engine label (「收紧（加息）」 or 「收紧·衰退」)
  const tightKind = /收紧·衰退/.test(S.label || '') ? '衰退' : '加息';
  const T = nodes.tight;
  const tightSub = `<text x="${f1(T.x)}" y="${f1(T.y + 52)}" text-anchor="middle" class="cy-sub${ph === 'tight' ? ' top' : ' dim'}">${ph === 'tight' ? tightKind : '加息 / 衰退'}</text>`;
  const easeSub = `<text x="${f1(E.x - 26)}" y="${f1(E.y + 13)}" text-anchor="end" class="cy-sub${ph === 'ease' ? ' top' : ''}">推得动吗？</text>`;
  // exit towards the long cycle (dashed, ⑤ colour; solid + filled when handoff === 'no') and the label of the normal edge back
  const exit = `<g class="cy-exit${no ? ' on' : ''}"><line x1="${f1(E.x - 3)}" y1="${f1(E.y + 21)}" x2="${f1(E.x - 12)}" y2="${f1(E.y + 76)}" class="cy-exit-l"/>` +
    arrowDir(E.x - 12.6, E.y + 80, -0.14, 1, 'cy-exit-a') +
    `<text x="${f1(E.x + 2)}" y="${f1(E.y + 52)}" class="cy-exit-t">推不动</text>` +
    `<rect x="-36" y="${f1(E.y + 88)}" width="148" height="44" rx="9" class="cy-exit-box"/>` +
    `<text x="38" y="${f1(E.y + 107)}" text-anchor="middle" class="cy-exit-b">大周期 B2 → ⑤</text>` +
    `<text x="38" y="${f1(E.y + 123)}" text-anchor="middle" class="cy-exit-s">私人去杠杆</text></g>`;
  const back = `<text x="${f1((E.x + nodes.expand.x) / 2 - 8)}" y="${f1((E.y + nodes.expand.y) / 2 - 6)}" text-anchor="end" class="cy-back">推得动 → 扩张</text>`;
  const bk = (S.between || []).map(keyPhase);
  const between = bk.length === 2 && bk[0] !== bk[1] && RING_NEXT[bk[0]] === bk[1] ? bk : null;
  const cand = (S.progress || []).filter(p => RING_NEXT[ph] === keyPhase(p.target) && p.have > 0).sort((a, b) => b.have / b.need - a.have / a.need)[0];
  const c1 = ph === 'hot' && S.top ? TOP_LABEL[S.top] : ph === 'tight' ? `收紧（${tightKind}）` : SHORT_NAME[ph];
  const nm = S.between ? S.between.map(k => KEY_SHORT[k] || k) : null;
  const c2 = no ? '推不动 → 交给大周期' : nm ? null : '随四盏灯·以季计';
  const centre = `<text x="${cx}" y="${cy - 6}" text-anchor="middle" class="cy-c1">${esc(c1)}</text>` +
    (c2 ? `<text x="${cx}" y="${cy + 12}" text-anchor="middle" class="cy-c2${no ? ' no' : ''}">${esc(c2)}</text>`
      : `<text x="${cx}" y="${cy + 12}" text-anchor="middle" class="cy-c2">介于 ${esc(nm[0])}</text><text x="${cx}" y="${cy + 27}" text-anchor="middle" class="cy-c2">与 ${esc(nm[1])} 之间</text>`);
  return dialSvg({ id: 'S', nodes, edges, cur: ph, between, centre, under: exit + back, over: hotSub + tightSub + easeSub,
    progress: cand ? { from: ph, to: RING_NEXT[ph], frac: cand.have / cand.need } : null,
    aria: `小周期，当前 ${S.label}${S.between ? `，在 ${nm[0]} 与 ${nm[1]} 之间` : ''}${no ? '，降息推不动，交给大周期 B2 到 ⑤' : ''}` });
}

/* ---------- evidence (rows live in ./_cycle-ev.js: ruler + where to look + 盯住) ---------- */
function pips(have, need) {
  let h = '';
  for (let i = 0; i < need; i++) h += `<i class="${i < have ? 'on' : ''}"></i>`;
  return `<span class="cy-pips" aria-hidden="true">${h}</span><span class="cy-pt">连续达标 ${have}/${need} 季</span>`;
}

const headLong = k => `${LONG_MARK[k]} ${LONG_NODE[k]}`;
const headShort = k => KEY_LABEL[k] || k;
/** the long card's B2 fork: three conditions at once (房价在跌 / 债务重 / 降了息信贷还在缩), each with its rows */
function forkBlock(L, ctx) {
  const fe = L.forkEvidence;
  if (!fe || !fe.length || (L.stage !== 1 && L.stage !== 2)) return '';
  const c1 = fe.filter(e => !e.grp && e.term === 'housePrice'), c2 = fe.filter(e => e.grp === 'a');
  const c3 = fe.filter(e => !c1.includes(e) && !c2.includes(e));
  const parts = [['房价比一年前在跌', c1], ['债务够重（DSR 或 私人债务/GDP）', c2], ['降了息、信贷还在缩', c3]].filter(([, it]) => it.length);
  const nOk = parts.filter(([, it]) => reqMet(it)).length;
  const o = { kind: 'long', ctx, mark: 'B2 跌破吸程线', src: 'fork' };
  // confirmation: b2N quarters in a row (pips), then B2 holds until the stage moves or easing restarts credit (推得动)
  const pend = L.forkPending, need = pend ? pend.need : 3;
  const state = L.fork === 'B2' ? '<span class="cy-pt">已确认：B2</span>'
    : pend ? `<span class="cy-fkpend">待确认</span>${pips(pend.have, pend.need)}` : `<span class="cy-pt">现在成立 ${nOk}/${parts.length}</span>`;
  return `<div class="cy-fkb"><div class="cy-evh cy-fkh">地下水位跌破吸程线（B2）：${parts.length === 3 ? '三条' : '这几条'}同时成立、连续 ${need} 季才算${state}</div>` +
    `<p class="cy-fkn">成立 = 降息推不动：小周期降了息，信贷还是缩 → 大周期走 B2 → ⑤。降息推得动（回到扩张）就解除。（没成立时，超额的债多半溢出成通胀，走 B1，交给小周期。）</p>` +
    parts.map(([nm, it], i) => `<div class="cy-fkc ${reqMet(it) ? 'ok' : 'no'}"><b>${i + 1}. ${nm}</b> ${reqMet(it) ? '✔' : '✖'}</div>${evidenceList(it, o)}`).join('') +
    bonusBlock(L.forkExtra) + `</div>`;
}
/** 加分项 on the B2 card (display only, never in the threshold): how much negative equity, how hurt the banks are */
function bonusBlock(x) {
  if (!x) return '';
  const ok = v => typeof v === 'number' && isFinite(v);
  const P = (v, d = 1) => (ok(v) ? (v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(d) + '%' : '—');
  const neg = `${ok(x.lvr) ? `平均 LVR ${P(x.lvr, 0)}` : 'LVR 没有数据'} · 房价比近年高点 ${ok(x.hpDraw) ? (x.hpDraw > -0.0005 ? '没跌' : P(x.hpDraw)) : '—'}`;
  const bank = ok(x.badCap) ? `坏账 ≈ 银行资本的 ${P(x.badCap, 0)}（坏账率 ${P(x.bad)}）`
    : ok(x.badRes) || ok(x.bad) ? `房贷拖欠率 ${P(x.badRes)} · 全部贷款拖欠 ${P(x.bad)} · 核销率 ${P(x.chargeOff)}（没有资本数据）`
    : '没有数据';
  return `<div class="cy-bonus"><div class="cy-orcap">加分项（不计入门槛，只帮你看 B2 会有多重）</div>` +
    `<div class="cy-bonus-r"><b>${term('lvr', '负资产范围')}</b><span>${esc(neg)}</span></div>` +
    `<div class="cy-bonus-r"><b>${term('badLoans', '银行受伤程度')}</b><span>${esc(bank)}</span></div>` +
    `<p class="cy-fkn">负资产多、并且伤到银行，B2 才可能来；最后要看降息推不推得动。</p></div>`;
}
// the one line under both dials (tap = the B2 concept card with the full sentence)
const B2_LINE = 'B2 怎么来的：借钱买的资产跌了 → 家底变负、债还在 → 大家拼命还债、银行收紧 → 降息也推不动（负资产要多、并且伤到银行才算）。';
const b2Line = () => `<p class="cy-b2line">${term('B2', B2_LINE)}</p>`;
function card(kind, snapSide, t, ctx, other) {
  const isLong = kind === 'long';
  const C = snapSide;
  const since = C.since || { t: 0, date: '' };
  const len = t - since.t + 1;
  const betw = C.between
    ? `<div class="cy-between-note">◆ 在 ${isLong ? LONG_MARK[C.between[0]] : KEY_LABEL[C.between[0]]} 与 ${isLong ? LONG_MARK[C.between[1]] : KEY_LABEL[C.between[1]]} 之间：证据混合，还没连续达标，先不前进</div>` : '';
  const pendB2 = isLong && C.forkPending
    ? `<div class="cy-between-note">◆ B2 待确认：三条已同时成立 ${C.forkPending.have}/${C.forkPending.need} 季，连续 ${C.forkPending.need} 季才算 B2</div>` : '';
  let ev;
  if (isLong) {
    ev = `<div class="cy-evh">要进入 <b>${esc(C.progress.label)}</b> 需要：${pips(C.progress.have, C.progress.need)}</div>${evidenceList(C.evidence, { kind, ctx, mark: LONG_MARK[C.progress.target] })}${forkBlock(C, ctx)}`;
  } else {
    const groups = C.progress.map(p => {
      const items = C.evidence.filter(e => e.targetId === p.target);
      return `<div class="cy-evh">→ <b>${esc(p.label)}</b>${pips(p.have, p.need)}</div>${evidenceList(items, { kind, ctx, mark: KEY_LABEL[p.target] })}`;
    }).join('');
    ev = groups;
  }
  // 真实 mode (ctx.realMode): C is the REAL dial; the model's dial of the same quarter sits beside it (模型 | 真实)
  const dial = ctx.realMode ? twinHtml(kind, C, ctx) : isLong ? longDial(C) : shortDial(C);
  // the link between the two dials: 降息推得动吗？ 推不动 -> 大周期 B2 -> ⑤ (told on both cards)
  const link = !isLong
    ? (C.handoff === 'no' ? `<div class="cy-handoff">${esc(C.handoffText || '推不动 → 交给大周期')}</div>`
      : C.phase === 'ease' ? '<div class="cy-handoff q">降了息，信贷能重新动起来吗？能 → 回扩张；不能 → 交给大周期（B2 → ⑤）</div>' : '')
    : (other && other.handoff === 'no' ? '<div class="cy-handoff in">小周期那边：降息推不动，已交给这里（B2 → ⑤ 私人去杠杆）</div>' : '');
  const tid = isLong ? 'longCycle' : 'shortCycle';
  return `<article class="cy-card cy-${kind}">
    <h3 class="cy-ct">${term(tid, isLong ? '大周期' : '小周期')} <small>${isLong ? '长期债务周期 · 以年计 · 只看慢变量' : '短期债务周期 · 以季计 · 看四盏灯'}</small></h3>
    ${dial}${b2Line()}
    <p class="cy-now">${ctx.realMode ? '<span class="cy-src cy-src-real">真实</span>' : ''}<b>${esc(C.label)}</b><span class="cy-since">自 ${esc(since.date)} 起 · 已 ${len} 季</span></p>
    ${betw}${pendB2}${link}
    <details class="cy-ev-wrap" data-k="ev-${kind}"><summary>证据：现值 · 离门槛多远 · 去图里哪里看</summary><p class="cy-evhint">点任意一行：图里亮出它的位置，并打开说明卡。「盯住」：它达标时暂停提醒你。</p>${ev}</details>
    <p class="cy-next">${esc(nextText(kind, C, isLong ? headLong : headShort).text || '—')}</p>
  </article>`;
}

/** 真实 mode: the model dial and the real dial of one cycle side by side (phone: still two columns, each ~170px) */
function twinHtml(kind, C, ctx) {
  const isLong = kind === 'long', M = ctx.modelSnap && ctx.modelSnap.cycles ? ctx.modelSnap.cycles[kind] : null;
  const draw = X => (isLong ? longDial(X) : shortDial(X));
  const fig = (src, X, body) => `<figure class="cy-tw cy-tw-${src}"><figcaption><span class="cy-src cy-src-${src}">${src === 'real' ? '真实' : '模型'}</span>` +
    `<b>${esc(X ? X.label : '—')}</b></figcaption>${body}</figure>`;
  const model = M ? draw(M) : `<div class="cy-tw-none">模型只算到 ${esc(ctx.modelLastDate || '')}</div>`;
  return `<div class="cy-twin">${fig('model', M, model)}${fig('real', C, draw(C))}</div>`;
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
// short segments by internal key (物价过热 / 资产过热 differ); ':no' = 降息推不动 stretch
const shortKeyOf = h => h.cycles.short.key + (h.cycles.short.handoff === 'no' ? ':no' : '');
const keyOfSeg = k => String(k).split(':')[0];
const openMap = { 'ev-long': true, 'ev-short': true, list: false };   // remembered across the per-step re-render
let selQ = null;            // selected quarter (kept across re-renders)
let selFor = null;

function trailSvg(hist, t, total, dates, mode) {
  const W = 360, H = 206, L = 8, R = 8, X0 = L, X1 = W - R;
  const X = i => X0 + (i / (total - 1)) * (X1 - X0);
  const qw = (X1 - X0) / (total - 1);
  const top = 20, bandB = 168, waveB = 160, waveH = 70;
  const lsegs = segments(hist, h => h.cycles.long.stage, t);
  const ssegs = segments(hist, shortKeyOf, t);
  let g = `<defs>
    <pattern id="cy-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="var(--cy-p-tight)"/><line x1="0" y1="0" x2="0" y2="5" stroke="var(--cy-hatch)" stroke-width="2.2"/></pattern>
    <pattern id="cy-dots" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="var(--cy-p-ease)"/><circle cx="2.5" cy="2.5" r="1" fill="var(--cy-hatch)"/></pattern>
    <pattern id="cy-no" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="5" height="5" fill="var(--cy-s5)"/><line x1="0" y1="0" x2="0" y2="5" stroke="var(--cy-hatch)" stroke-width="1.8"/></pattern>
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
  // short cycle: waves riding inside the band. height = where in the short cycle we are (peak = 过热 物价/资产, trough = 收紧)
  const LV = { expand: 0.5, hotP: 0.95, hotA: 0.95, tight: 0.06, ease: 0.28 };
  const raw = hist.slice(0, t + 1).map(h => LV[h.cycles.short.key]);
  const sm = raw.map((_, i) => { let a = 0, n = 0; for (let k = i - 1; k <= i + 1; k++) if (k >= 0 && k < raw.length) { a += raw[k]; n++; } return a / n; });
  const Y = v => waveB - v * waveH;
  const fillOf = p => (p === 'tight' ? 'url(#cy-hatch)' : p === 'ease' ? 'url(#cy-dots)' : `var(--cy-p-${p})`);
  const noEase = [];
  let prevSeg = null;
  for (const s of ssegs) {
    let d = `M${f1(X(s.from))} ${waveB}`;
    for (let i = s.from; i <= s.to; i++) d += ` L${f1(X(i))} ${f1(Y(sm[i]))}`;
    d += ` L${f1(X(s.to))} ${waveB} Z`;
    const k = keyOfSeg(s.key);
    g += `<path d="${d}" fill="${fillOf(k)}" class="cy-wv"/>`;
    if (k === 'hotP' || k === 'hotA') g += `<text x="${f1((X(s.from) + X(s.to)) / 2)}" y="${f1(Y(0.95) - 4 - (prevSeg && prevSeg.to + 1 === s.from && (keyOfSeg(prevSeg.key) === 'hotP' || keyOfSeg(prevSeg.key) === 'hotA') ? 9 : 0))}" text-anchor="middle" class="cy-fk">${k === 'hotP' ? '物价' : '资产'}</text>`;
    if (s.key.endsWith(':no')) noEase.push(s);
    prevSeg = s;
  }
  // 推不动 stretch: orange strip along the baseline + label (the hand-off to the long cycle's B2 -> ⑤)
  for (const s of noEase) {
    const x0 = X(s.from) - qw / 2, w = (s.to - s.from + 1) * qw;
    g += `<rect x="${f1(x0)}" y="${waveB - 7}" width="${f1(w)}" height="7" fill="url(#cy-no)" class="cy-no"/>`;
    if (w >= 30) g += `<text x="${f1(x0 + w / 2)}" y="${f1(Y(0.28) - 4)}" text-anchor="middle" class="cy-nolbl">推不动</text>`;
  }
  // the long cycle's fork turning B2 (first quarter of each B2 run): marker on top of the band
  hist.slice(0, t + 1).forEach((h, i) => {
    if (h.cycles.long.fork === 'B2' && (i === 0 || hist[i - 1].cycles.long.fork !== 'B2' || hist[i - 1].cycles.long.stage !== h.cycles.long.stage))
      g += `<path d="M${f1(X(i) - 4)} ${top - 9} L${f1(X(i) + 4)} ${top - 9} L${f1(X(i))} ${top - 1} Z" class="cy-fkmark"/><text x="${f1(X(i))}" y="${top - 12}" text-anchor="middle" class="cy-fkmt">B2</text>`;
  });
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
    <div class="cy-lgrow"><b>小周期</b>${sw('p-expand', '扩张')}${sw('p-hotP', '物价过热（波峰）')}${sw('p-hotA', '资产过热（波峰）')}${sw('p-tight', '收紧（加息 / 衰退，斜纹·波谷）', 'hatch')}${sw('p-ease', '降息（点纹）', 'dots')}${sw('p-no', '推不动 → 交给大周期（橙斜纹）')}</div>
    <div class="cy-lgrow cy-lgfork"><span class="cy-lg"><i class="cy-fkmk"></i>B2 = 地下水位跌破吸程线（带上方的 ▼）：降了息信贷还在缩，之后接 ⑤ 私人去杠杆</span></div>
  </div>`;
}

function rangeText(hist, seg) {
  const a = hist[seg.from].date, b = hist[seg.to].date, n = seg.to - seg.from + 1;
  return a === b ? a : `${a} – ${b}（${n} 季）`;
}
function detailHtml(hist, q, t) {
  const h = hist[q];
  const ls = segments(hist, x => x.cycles.long.stage, t).find(s => q >= s.from && q <= s.to);
  const ss = segments(hist, shortKeyOf, t).find(s => q >= s.from && q <= s.to);
  const L = h.cycles.long, S = h.cycles.short;
  const fk = L.fork ? (L.fork === 'B2' ? '，<b>B2 跌破吸程线</b>' : '，岔路 <b>B1 溢出</b>') : L.b1Overlay ? '，叠着 <b>B1 溢出</b>' : L.forkPending ? '，B2 待确认' : '';
  const no = S.handoff === 'no' ? '，<b>降息推不动 → 交给大周期</b>' : '';
  return `<b>${esc(h.date)}</b>　大周期 <b>${esc(L.label)}</b>${fk}（${esc(rangeText(hist, ls))}）；小周期 <b>${esc(S.label)}</b>${no}（${esc(rangeText(hist, ss))}）`;
}

function trailBlock(ctx) {
  // 真实 mode: the band is the dial run on REAL data (ctx.realHist = realTimeline: { date, cycles } per quarter), up to lastRealDate
  const RM = !!(ctx.realMode && Array.isArray(ctx.realHist));
  const t = RM ? ctx.realT : ctx.sim.t, hist = RM ? ctx.realHist.slice(0, ctx.realLast + 1) : ctx.sim.history('model');
  const mode = RM ? 'real' : ctx.sim.mode;
  const total = RM ? ctx.realLast + 1 : mode === 'free' ? 224 : (ctx.real?.dates?.length || 124);
  const dates = RM ? ctx.realDates : mode === 'free' ? Array.from({ length: 224 }, (_, i) => `${1995 + Math.floor(i / 4)}Q${(i % 4) + 1}`) : ctx.real.dates;
  if (selFor !== mode || (selQ != null && selQ > t)) { selQ = null; selFor = mode; }
  const tr = trailSvg(hist, t, total, dates, mode);
  const lsegs = segments(hist, h => h.cycles.long.stage, t), ssegs = segments(hist, shortKeyOf, t);
  const listBtn = (kind, s) => `<button type="button" class="cy-seg" data-q="${s.from}">${kind === 'long' ? esc(LONG_MARK[s.key] + ' ' + LONG_NODE[s.key]) : esc((KEY_LABEL[keyOfSeg(s.key)] || s.key) + (s.key.endsWith(':no') ? ' · 推不动' : ''))}<small>${esc(hist[s.from].date)}${s.to > s.from ? '–' + esc(hist[s.to].date) : ''}</small></button>`;
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
  const fk = L.fork === 'B2' ? ' · B2 跌破吸程线' : L.fork === 'B1' ? ' · 岔路 B1 溢出（交给小周期）' : L.b1Overlay ? ' · 叠着 B1 溢出'
    : L.forkPending ? ` · B2 待确认 ${L.forkPending.have}/${L.forkPending.need} 季` : '';
  return `<div class="cy-lead1"><b>大周期</b> ${lt}${fk}（${esc(yr(L.since.date))} 起）<span class="cy-lnext">${esc(ln)}</span></div>` +
    `<div class="cy-lead1"><b>小周期</b> ${esc(S.label)}${S.between ? `（在 ${KEY_LABEL[S.between[0]]} 与 ${KEY_LABEL[S.between[1]]} 之间）` : ''}` +
    `${S.handoff === 'no' ? '<span class="cy-lnext cy-hand">降息推不动 → 交给大周期（B2 → ⑤）</span>' : ''}<span class="cy-lnext">${esc(sn)}</span></div>`;
}

export function render(container, ctx) {
  // 真实 mode (app.js realCtx): lead, dials, B2 card, trail and lamps read the REAL snapshot; the model's dial sits beside the real one
  const RM = !!(ctx.realMode && ctx.realSnap && ctx.realSnap.cycles), ctx0 = ctx;   // ctx0: the model's (三条线, 真实 vs 模型 charts)
  if (RM) ctx = { ...ctx, snap: ctx.realSnap };
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
    const mk = () => `<div class="cy-dials${RM ? ' cy-dials-twin' : ''}">${card('long', s.cycles.long, s.t, ctx, s.cycles.short)}${card('short', s.cycles.short, s.t, ctx, s.cycles.long)}</div>`;
    dials = mk();
    if (applyUrlPin(ctx)) { beginRows(); dials = mk(); }      // ?pin=... pinned a row after the first pass: draw it as pinned
    trail = trailBlock(ctx);
  } else dials = '<p class="pn-empty">（此版本引擎没有双周期检测）</p>';
  container.innerHTML = `<section class="pn-tab pn-cycle">
    <div class="pn-lead cy-lead">${lead(s)}</div>
    ${dials}
    ${trail ? `<h3 class="pn-h">轨迹带${RM ? '（真实数据）' : ''} <small>宽带 = 大周期（慢慢换色）；带里的波 = 一轮轮小周期；黑线 = 现在</small></h3>${trail.html}` : ''}
    <h3 class="pn-h">真实世界的三条线 <small>五国真实 GDP 拆成达利欧的三条线；直线 = GDP 长期趋势（由生产率决定）</small></h3>
    ${wavesHtml(ctx0)}
    <h3 class="pn-h">四盏灯${RM ? '（真实数据）' : ''} <small>形状 + 文字 + 颜色同时表示；点灯，看图里哪些水管在喂它</small></h3>
    <div class="lp-grid">${lamps}</div>
    <h3 class="pn-h">真实 vs 模型 <small>模型偏离真实本来就正常：它是玩具</small></h3>
    <div class="pn-charts"><div id="cy-c1"></div><div id="cy-c2"></div><div id="cy-c3"></div></div>
    ${dataNoteHtml(ctx0)}
  </section>`;
  container.querySelectorAll('details[data-k]').forEach(d => {
    d.open = openMap[d.dataset.k] !== false && (openMap[d.dataset.k] || false);
    d.addEventListener('toggle', () => { openMap[d.dataset.k] = d.open; });
  });
  if (trail) wireTrail(container, ctx, trail);
  wireWaves(container, ctx0);
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
  compareChart(container.querySelector('#cy-c1'), ctx0, { title: '政策利率', realKey: 'policyRate', modelFn: x => x.rates.policy, fmt: pctFmt });
  compareChart(container.querySelector('#cy-c2'), ctx0, { title: '房价指数 (1995Q1=100)', realKey: 'houseIndex', modelFn: x => x.assets.housing.price });
  compareChart(container.querySelector('#cy-c3'), ctx0, { title: '家庭 DSR', realKey: 'hhDsr', modelFn: x => x.household.dsr, fmt: pctFmt });
}
