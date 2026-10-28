// 传导链 block of the concept card (a visual strip of chips + arrows over the causal map, src/data/causal.js).
// DOM-free on purpose: chainHtml(id, opts) returns an HTML string, so tools/check_causal_view.mjs can render it for every concept in Node.
// The DOM side (buttons, the diagram badges, the ▶ playback) lives in src/ui/concepts.js and src/ui/causal-overlay.js.
//
//   chainHtml(id, { mode, push, open, playing, status, check, scenario, t })   the block (a string)
//       push    null | +1 | -1   which ↑推高 / ↓压低 button is pressed (the list shows ↑ when null)
//       open    Set of fold keys that are unfolded ('up-more', 'in-more', 'down-more', 'd:<node>', 'l:<n>', 'u:<n>')
//       check   null | { pending: true } | result of runCheckSync / runCheckAsync (用模拟核对)
//   highlightTargets(id, { mode, dir })  { from: [node ids], to: [node ids] }  -> links.js showConcept(id, chain)
//   pushBadges(id, { mode, dir })        Map node -> { sign, label, self? }      -> causal-overlay setBadges
//   playScript(id, { mode, dir })        [{ node, sign, label, role: 'up'|'self'|'down', repeat? }]  -> causal-overlay play
//   checkPlan(id, { mode, dir })         { valveNode, valveId, vdir } | null     which valve the simulation check turns
//   checkKey / checkGen / runCheckSync / runCheckAsync   the two-sim comparison (pure; fixed turn sizes as tools/check_causal.mjs)
import { CONCEPTS } from '../data/concepts.js';
import { EXTRA_NODES, OUTCOMES, METRIC, VALVE_OF } from '../data/causal.js';
import { propagate, chainView, pathLinks, pathSigns, isValve, allNodes } from './causal-graph.js';
import { createSim } from '../engine/sim.js';
import { US_Q } from '../data/us-quarterly.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MINUS = '−';
const LAMPS = ['lampCredit', 'lampDebtService', 'lampPolicy', 'lampValuation'];
const SHOW_DOWN = 4, SHOW_IN = 3, TO_ROUTES = 3;

/* ------------------------------------------------------------------ names */
export const nodeName = id => (CONCEPTS[id] ? CONCEPTS[id].name : EXTRA_NODES[id] ? EXTRA_NODES[id].name : id);
/** Short chip label: "DSR 偿债率" -> "DSR", "货币 M（存款）" -> "货币 M". */
export function chipName(id) {
  const n = nodeName(id).replace(/（.*?）/g, '').trim();
  const m = /^([A-Za-z][A-Za-z0-9]{1,6}) /.exec(n);
  if (m) return m[1] === 'Capacity' ? '产能' : m[1];
  return n;
}
export const isNode = id => !!(CONCEPTS[id] || EXTRA_NODES[id]);
const arrow = s => (s > 0 ? '↑' : s < 0 ? '↓' : '?');
const arrowCls = s => (s > 0 ? 'up' : s < 0 ? 'dn' : 'q');
const arrowWord = s => (s > 0 ? '上升' : s < 0 ? '下降' : '方向不定');
const ar = s => `<b class="cv-ar ${arrowCls(s)}" aria-label="${arrowWord(s)}">${arrow(s)}</b>`;

/* ------------------------------------------------------------------ pieces */
const VALVE_ICON = '<svg class="cv-vi" viewBox="-9 -9 18 18" aria-hidden="true"><path d="M-8 -5 L0 0 L-8 5 Z M8 -5 L0 0 L8 5 Z"/><path class="st" d="M0 0 V-7 M-5 -7 H5"/></svg>';

/** One node as a chip. Concept -> tappable (opens its card); extra node -> hover/press only flashes the diagram. */
function chip(id, sign, o = {}) {
  const nm = esc(chipName(id)), full = esc(nodeName(id));
  const cls = ['cv-chip', isValve(id) ? 'cv-valve' : '', o.self ? 'cv-self' : '', o.dim ? 'cv-dim' : '', o.small ? 'cv-sm' : ''].filter(Boolean).join(' ');
  const inner = `${isValve(id) ? VALVE_ICON : ''}<span class="cv-nm">${nm}</span>${sign === undefined ? '' : ar(sign)}`;
  const aria = `${full}${sign === undefined ? '' : ' ' + arrowWord(sign)}`;
  if (o.self) return `<span class="${cls}" data-xnode="${esc(id)}" title="${full}（这张卡）" aria-label="${aria}（这张卡）">${inner}</span>`;
  if (CONCEPTS[id]) return `<button type="button" class="${cls}" data-term="${esc(id)}" data-cv-chip="${esc(id)}" title="${full}" aria-label="${aria}，点开它的卡片">${inner}</button>`;
  return `<span class="${cls} cv-x" role="button" tabindex="0" data-xnode="${esc(id)}" data-cv-chip="${esc(id)}" title="${full}" aria-label="${aria}">${inner}</span>`;
}
const lnk = (label, why) => `<span class="cv-ln"${why ? ` title="${esc(why)}"` : ''}><em>${esc(label || '')}</em><i>→</i></span>`;
const plain = '<span class="cv-ln cv-ln0"><i>→</i></span>';

/** A route as chips + arrows. o.from = first index shown, o.collapse+o.key = first … last with a tappable "…", o.selfId = chip drawn as "this card". */
function strip(path, signs, o = {}) {
  const L = pathLinks(path), from = o.from || 0;
  const idx = [];
  for (let i = from; i < path.length; i++) idx.push(i);
  const one = i => chip(path[i], signs[i], { self: o.selfId === path[i] && o.selfAt === i, dim: o.selfId === path[i] && o.selfAt !== i, small: o.small });
  let h;
  if (o.collapse && idx.length > 3) {
    h = `${one(idx[0])}<span class="cv-seg">${plain}<button type="button" class="cv-dots" data-cv-fold="${esc(o.key)}" aria-label="展开中间 ${idx.length - 2} 步" title="展开中间 ${idx.length - 2} 步">…</button></span><span class="cv-seg">${plain}${one(idx[idx.length - 1])}</span>`;
  } else {
    h = idx.map((i, k) => (k ? `<span class="cv-seg">${lnk(L[i - 1].label, L[i - 1].why)}${one(i)}</span>` : one(i))).join('');
    if (o.key && idx.length > 3) h += `<button type="button" class="cv-dots cv-fold" data-cv-fold="${esc(o.key)}" aria-label="收起">收起</button>`;
  }
  return `<div class="cv-strip${o.small ? ' cv-small' : ''}">${h}</div>`;
}
const foldBtn = (key, open, label) => `<button type="button" class="cv-more" data-cv-fold="${esc(key)}" aria-expanded="${open ? 'true' : 'false'}">${esc(label)} <i>${open ? '▴' : '▾'}</i></button>`;

/* ------------------------------------------------------------------ the model behind the block */
const routeOf = a => (a.sign === 0 && a.first ? a.first.path : a.path);

/** Downstream rows for a push of `dir` on id (chainView only does dir = +1): outcomes + lamps, '?' last. */
export function downRows(id, { mode = 'history', dir = 1 } = {}) {
  const r = propagate(id, dir, { mode });
  const targets = [...OUTCOMES, ...LAMPS];
  const down = targets.filter(t => t !== id && r[t]).map(t => ({ target: t, ...r[t] }));
  const lampRank = a => (LAMPS.includes(a.target) ? 1 : 0);   // lamps are readings: after the real outcomes
  down.sort((a, b) => lampRank(a) - lampRank(b) || (a.sign === 0) - (b.sign === 0) || a.lag - b.lag || a.path.length - b.path.length);
  return down;
}

export function highlightTargets(id, { mode = 'history', dir = 1 } = {}) {
  const v = chainView(id, { mode });
  if (v.detected) return { from: [], to: [] };
  const from = new Set(), to = new Set();
  if (v.up[0]) routeOf(v.up[0]).forEach(n => n !== id && from.add(n));
  else v.inputs.forEach(i => from.add(i.from));
  if (!id.startsWith('lamp')) downRows(id, { mode, dir }).slice(0, TO_ROUTES).forEach(r => routeOf(r).forEach(n => n !== id && to.add(n)));
  return { from: [...from], to: [...to] };
}

/** Which way the valve must be turned so that this node moves in direction `dir` (valve-turn direction, +1 = turn up). */
function valveDir(up, dir) {
  const s = up.sign !== 0 ? up.sign : (up.first ? up.first.sign : 1);
  return dir * (s || 1);
}

/** Arrow badges for the diagram when ↑ / ↓ is pressed: every node the push reaches (+ the card itself). */
export function pushBadges(id, { mode = 'history', dir = 1 } = {}) {
  const out = new Map();
  if (chainView(id, { mode }).detected) return out;
  const main = new Set([...OUTCOMES, ...LAMPS]);
  for (const [node, a] of Object.entries(propagate(id, dir, { mode }))) out.set(node, { sign: a.sign, label: '', lag: a.lag, prio: main.has(node) ? 0 : 1, later: !!a.later });
  out.set(id, { sign: dir, label: '', self: true });
  return out;
}

/** The ▶ 看一遍流向 script: upstream main route, the card itself, then the first downstream routes, hop by hop. */
export function playScript(id, { mode = 'history', dir = 1 } = {}) {
  const v = chainView(id, { mode });
  const steps = [], seen = new Set();
  if (v.detected) return steps;
  const add = (node, sign, label, role) => {
    const repeat = seen.has(node);
    seen.add(node);
    steps.push({ node, sign, label: label && label !== '立刻' ? label : '', role, repeat });
  };
  if (v.up[0]) {
    const path = routeOf(v.up[0]), signs = pathSigns(path, valveDir(v.up[0], dir)), L = pathLinks(path);
    path.forEach((n, i) => { if (n !== id) add(n, signs[i], i ? L[i - 1].label : '', 'up'); });
  }
  add(id, dir, '', 'self');
  if (!id.startsWith('lamp')) {
    for (const r of downRows(id, { mode, dir }).slice(0, TO_ROUTES)) {
      const path = routeOf(r), signs = pathSigns(path, dir), L = pathLinks(path);
      for (let i = 1; i < path.length; i++) add(path[i], i === path.length - 1 && r.sign === 0 ? 0 : signs[i], L[i - 1].label, 'down');
    }
  }
  return steps;
}

/* ------------------------------------------------------------------ 用模拟核对: the two-sim comparison (pure) */
const RATE_RE = /^rates\.|inflation|unemployment|outputGap|dsr|lvr|approval|badLoan|capitalRatio|savingRate|interestToTax|rentYield|lights|\.ret$/;
const kindOf = p => (/^bank\.approval$/.test(p) ? 'rel' : RATE_RE.test(p) ? 'pp' : 'rel');
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const num = x => typeof x === 'number' && isFinite(x);

/** The valve a card is checked with (itself, or the shortest valve route into it) and the direction it is turned. */
export function checkPlan(id, { mode = 'history', dir = 1, alt = 0 } = {}) {
  if (CONCEPTS[id] === undefined && !EXTRA_NODES[id]) return null;
  const v = chainView(id, { mode });
  if (v.detected) return null;
  if (isValve(id)) return alt ? null : { valveNode: id, valveId: VALVE_OF[id], vdir: dir, self: true, route: null };
  const u = v.up[alt];
  if (!u) return null;
  return { valveNode: u.valve, valveId: u.valveId, vdir: valveDir(u, dir), self: false, route: u };   // alt = n-th valve route (when the first cannot be turned that way)
}

// fixed turn sizes (same as tools/check_causal.mjs); cur = value now in force; null = cannot be turned that way
const pp = x => (x * 100).toFixed(1);
const TURN = {
  policyRate: (c, d) => (d > 0 ? { v: c + 0.015, text: '政策利率 +1.5pp' }
    : c < 0.004 ? { no: '政策利率已经接近 0，压不下去了' } : { v: Math.max(0, c - 0.015), text: `政策利率 ${MINUS}${pp(c - Math.max(0, c - 0.015))}pp` }),
  qe: (c, d) => (d > 0 ? (c ? { no: 'QE 已经开着了，没法再打开' } : { v: true, text: '打开 QE' })
    : (c ? { v: false, text: '关掉 QE' } : { no: 'QE 本来就是关的，没法再关' })),
  approval: (c, d) => (d < 0 ? (c <= 0.31 ? { no: '审批已经收到最紧了' } : { v: Math.max(0.3, c * 0.7), text: '审批倍数 ×0.7（收紧）' })
    : (c >= 1.39 ? { no: '审批已经放到最松了' } : { v: Math.min(1.4, c * 1.3), text: '审批倍数 ×1.3（放松）' })),
  lvrCap: (c, d) => (d < 0 ? (c <= 0.31 ? { no: 'LVR 上限已经在最低' } : { v: 0.30, text: 'LVR 上限降到 30%' })
    : (c >= 0.89 ? { no: 'LVR 上限已经在最高' } : { v: Math.min(0.9, c + 0.2), text: `LVR 上限提到 ${Math.round(Math.min(0.9, c + 0.2) * 100)}%` })),
  borrowMult: (c, d) => ({ v: d > 0 ? 1.4 : 0.7, text: d > 0 ? '借款意愿 ×1.4' : '借款意愿 ×0.7' }),
  saveAdj: (c, d) => ({ v: d > 0 ? 0.04 : -0.03, text: d > 0 ? '储蓄率 +4pp' : `储蓄率 ${MINUS}3pp` }),
  capexMult: (c, d) => ({ v: d > 0 ? 1.3 : 0.7, text: d > 0 ? 'Capex ×1.3' : 'Capex ×0.7' }),
  fiscalInjection: (c, d) => ({ v: d > 0 ? 0.05 : -0.03, text: d > 0 ? '财政注入 +5% GDP' : `财政注入 ${MINUS}3% GDP` }),
};

export const checkKey = p => [p.valveId, p.vdir, p.t, p.scenario, p.mode].join('|');
const H1 = 4, H2 = 8;

/** Generator: yields between chunks of quarters (so a caller can use setTimeout), returns the result. */
export function* checkGen(p) {
  const town = p.scenario === 'town';
  const mk = () => (town ? createSim({ scenario: 'town' }) : createSim({ data: US_Q, mode: p.mode }));
  const A = mk(), B = mk();
  let n = 0;
  while (A.t < p.t && !A.done) { A.step(); B.step(); if (++n % 8 === 0) yield; }
  const base = { scenario: p.scenario, mode: p.mode, t: p.t, valveId: p.valveId, valveNode: p.valveNode, vdir: p.vdir };
  const v = A.valves.find(x => x.id === p.valveId);
  const turn = v && TURN[p.valveId] ? TURN[p.valveId](typeof v.value === 'boolean' ? +v.value : v.value, p.vdir) : { no: '这个阀门这里还不能核对' };
  const date = A.snapshot('model', Math.min(A.t, p.t))?.date || '';
  if (turn.no) return { ...base, status: 'impossible', reason: turn.no, date };
  B.setValve(p.valveId, turn.v);
  const br = (v.ruleParam || town) ? 'model' : 'user';
  const rec = { [H1]: {}, [H2]: {} };
  let steps = 0;
  for (let k = 1; k <= H2; k++) {
    if (A.done || B.done) break;
    A.step(); B.step(); steps = k;
    if (k === H1 || k === H2) {
      const a = A.snapshot('model'), b = B.snapshot(br);
      for (const [node, path] of Object.entries(METRIC)) rec[k][node] = [get(a, path), get(b, path)];
      yield;
    }
  }
  const metrics = {};
  for (const [node, path] of Object.entries(METRIC)) {
    const a = rec[H1][node], b = rec[H2][node];
    if (!a && !b) continue;
    metrics[node] = { kind: kindOf(path), y1: a || null, y2: b || null };
  }
  return { ...base, status: steps ? 'ok' : 'impossible', reason: steps ? '' : '模拟已经到头了，没有后面的季度可以看', turn: turn.text, date, steps, metrics };
}
export function runCheckSync(p) { const g = checkGen(p); let r; do { r = g.next(); } while (!r.done); return r.value; }

const cache = new Map(), inflight = new Set();
export const cachedCheck = p => cache.get(checkKey(p)) || null;
/** Run (or fetch from the cache) a check without freezing the UI: cb(result) once. Returns true when it was already cached. */
export function runCheckAsync(p, cb) {
  const key = checkKey(p);
  if (cache.has(key)) { cb(cache.get(key)); return true; }
  if (inflight.has(key)) return false;
  inflight.add(key);
  let g;
  try { g = checkGen(p); } catch (e) { inflight.delete(key); cb({ status: 'impossible', reason: '模拟没能启动', date: '' }); return false; }
  const pump = () => {
    let r;
    try { r = g.next(); } catch (e) { inflight.delete(key); const res = { ...p, status: 'impossible', reason: '模拟出错了', date: '' }; cache.set(key, res); cb(res); return; }
    if (r.done) { inflight.delete(key); cache.set(key, r.value); cb(r.value); } else setTimeout(pump, 0);
  };
  setTimeout(pump, 0);
  return false;
}

/** Format one measured change. kind 'pp' (rates, ratios: percentage points) | 'rel' (levels: percent). */
export function fmtChange(kind, x, y) {
  if (!num(x) || !num(y)) return null;
  const d = y - x;
  if (kind === 'pp') {
    const v = Math.abs(d * 100), sign = Math.abs(d) < 0.0005 ? 0 : Math.sign(d);
    return { sign, text: `${d < 0 && v >= 0.005 ? MINUS : '+'}${v.toFixed(v < 1 ? 2 : 1)}pp` };
  }
  if (Math.abs(x) < 1e-9) return Math.abs(y) < 1e-9 ? { sign: 0, text: '0' } : { sign: Math.sign(y), text: '新增' };
  const r = d / Math.abs(x), v = Math.abs(r * 100);
  return { sign: Math.abs(r) < 0.003 ? 0 : Math.sign(r), text: `${r < 0 && v >= 0.05 ? MINUS : '+'}${v.toFixed(v >= 100 ? 0 : 1)}%` };
}
/** Compare the engine with a graph arrival. -> { y1, y2, sign (engine), mark: '✓' | '≈' | '✗' | '?', alt?: true, won?: route } */
export function judge(m, arrival) {
  if (!m) return null;
  const c1 = m.y1 && fmtChange(m.kind, m.y1[0], m.y1[1]), c2 = m.y2 && fmtChange(m.kind, m.y2[0], m.y2[1]);
  const order = (arrival.lag ?? 0) >= 6 ? [c2, c1] : [c1, c2];
  const first = order.find(c => c && c.sign !== 0);
  const sign = first ? first.sign : 0;
  const o = { y1: c1, y2: c2, sign };
  if (sign === 0) return { ...o, mark: '≈' };
  if (arrival.sign === 0) {
    const w = [arrival.first, arrival.alt].filter(Boolean).find(r => r.sign === sign);
    return { ...o, mark: '?', won: w || null };
  }
  if (sign === arrival.sign) return { ...o, mark: '✓' };
  if ((arrival.later && arrival.later.sign === sign) || (arrival.offset && arrival.offset.sign === sign)) return { ...o, mark: '✓', alt: true };
  return { ...o, mark: '✗' };
}
const markCls = { '✓': 'ok', '≈': 'eq', '✗': 'bad', '?': 'q' };
function simLine(node, arrival, check) {
  const m = check && check.metrics && check.metrics[node];
  const j = m && judge(m, arrival);
  if (!j) return '';
  const part = (c, lab) => (c ? `<span class="cv-n">${esc(c.text)}<small>(${lab})</small></span>` : '');
  let tail = `<i class="cv-mk ${markCls[j.mark]}" aria-label="${j.mark === '✓' ? '与传导图一致' : j.mark === '✗' ? '与传导图相反' : j.mark === '≈' ? '几乎没动' : '两条路打架'}">${j.mark}</i>`;
  if (j.mark === '✓' && j.alt) tail += '<small class="cv-won">走了另一条路</small>';
  if (j.mark === '?') tail += j.won ? `<small class="cv-won">${arrow(j.won.sign)} 那条路赢：经「${esc(chipName(j.won.path[1]))}」</small>` : '';
  return `<div class="cv-sim"><span class="cv-sk">模拟</span> ${j.mark === '≈' ? '<b class="cv-ar q0">≈</b>' : ar(j.sign)} ${part(j.y1, '1年')}${part(j.y2, '2年')}${tail}</div>`;
}

/* ------------------------------------------------------------------ html */
function upHtml(id, v, o) {
  const open = o.open;
  let h = '';
  const routeStrip = a => {
    const path = routeOf(a), s = pathSigns(path, 1);
    if (a.sign === 0) s[s.length - 1] = 0;
    return strip(path, s, { selfId: id, selfAt: path.length - 1 });
  };
  if (v.valve) {
    h += `<div class="cv-note cv-isvalve">${VALVE_ICON}<span>它是阀门，可以直接拧</span></div>`;
    if (v.inputs.length) {
      const k = 'in-more', shown = open.has(k) ? v.inputs : v.inputs.slice(0, SHOW_IN);
      h += `<div class="cv-k">它看什么来调</div>` + shown.map(i => strip([i.from, id], [1, i.sign], { selfId: id, selfAt: 1 })).join('');
      if (v.inputs.length > SHOW_IN) h += foldBtn(k, open.has(k), open.has(k) ? '收起' : `还有 ${v.inputs.length - SHOW_IN} 项`);
    }
    if (o.mode === 'history' && (id === 'policyRate' || id === 'qe')) h += `<div class="cv-note cv-hist">历史模式：央行按真实${id === 'qe' ? 'QE' : '利率'}走，没有别的东西能反过来管它</div>`;
  }
  if (v.up.length) {
    const first = v.up[0], more = v.up.slice(1);
    h += `<div class="cv-k">${v.valve ? '别的阀门也能拧到它' : '从哪个阀门来'}<small>拧高阀门时</small></div>`;
    h += v.valve ? '' : routeStrip(first);
    const list = v.valve ? v.up : more;
    if (list.length) {
      const k = 'up-more';
      const label = v.valve ? `${list.length} 个阀门` : `另有 ${list.length} 个阀门也能拧到它`;
      h += foldBtn(k, open.has(k), open.has(k) ? '收起' : label);
      if (open.has(k)) h += `<div class="cv-fold">${list.map(a => routeStrip(a)).join('')}</div>`;
    }
  } else if (!v.valve) h += `<div class="cv-note">没有阀门能直接拧到它：它是读数或结果，要看上面的来源</div>`;
  return `<div class="cv-sec cv-up"><div class="cv-sech">上游</div>${h}</div>`;
}

function downHtml(id, v, o) {
  const dir = o.push ?? 1, open = o.open;
  const rows = downRows(id, { mode: o.mode, dir });
  if (!rows.length && !v.loops.length) return '';
  const btn = (d, t) => `<button type="button" class="cv-pb ${arrowCls(d)}${o.push === d ? ' on' : ''}" data-cv-push="${d}" aria-pressed="${o.push === d ? 'true' : 'false'}">${t}</button>`;
  let h = `<div class="cv-sech">推它一下会怎样</div><div class="cv-push" role="group" aria-label="推高或压低">${btn(1, '↑ 推高')}${btn(-1, '↓ 压低')}<span class="cv-pn">${o.push ? '图上标出箭头' : '点一下，在图上标箭头'}</span></div>`;
  const rowHtml = r => {
    const key = 'd:' + r.target;
    const head = `<div class="cv-rh">${chip(r.target, r.sign)}<span class="cv-lag">${esc(r.sign === 0 ? '两条路打架' : r.label)}</span>${r.offset ? `<span class="cv-off" title="另一条路部分抵消">另一条路部分抵消 ${ar(r.offset.sign)}</span>` : ''}</div>`;
    let body = '';
    // the route, without its two ends (this card and the target): collapsed to first … last, tap the dots to see every step
    const mid = (route, k) => {
      const path = route.path;
      if (path.length <= 2) return '';
      return `<div class="cv-via"><span class="cv-vk">经</span>${strip(path.slice(0, -1), pathSigns(path, dir).slice(0, -1), { from: 1, key: k, collapse: !open.has(k), small: true })}</div>`;
    };
    if (r.sign === 0) {
      body += [r.first, r.alt].filter(Boolean).map((rt, i) => `<div class="cv-rt">${ar(rt.sign)}${mid(rt, key + ':' + i)}</div>`).join('');
    } else body += mid(r, key);
    if (r.later) body += `<div class="cv-sub">之后可能反过来 ${ar(r.later.sign)} <span class="cv-lag">${esc(r.later.label)}</span></div>`;
    return `<div class="cv-row">${head}${body}${simLine(r.target, r, o.check && o.check.status === 'ok' ? o.check : null)}</div>`;
  };
  const shown = open.has('down-more') ? rows : rows.slice(0, SHOW_DOWN);
  h += shown.map(rowHtml).join('');
  if (rows.length > SHOW_DOWN) h += foldBtn('down-more', open.has('down-more'), open.has('down-more') ? '收起' : `还有 ${rows.length - SHOW_DOWN} 项`);
  if (v.loops.length) {
    h += v.loops.map((l, i) => {
      const k = 'l:' + i;
      return `<div class="cv-loop ${l.kind === 'reinforce' ? 'rf' : 'bl'}"><span class="cv-lt">↺ ${l.kind === 'reinforce' ? '放大回路' : '刹车回路'}<small>${esc(l.label)}</small></span>${strip(l.path, pathSigns(l.path, 1), { selfId: id, selfAt: 0, key: k, collapse: !open.has(k), small: true, from: 0 })}</div>`;
    }).join('');
  }
  return `<div class="cv-sec cv-down">${h}</div>`;
}

function checkHtml(id, o, v) {
  const c = o.check;
  if (!c) return '';
  if (c.pending) return `<div class="cv-sec cv-check"><div class="cv-sech">用模拟核对</div><div class="cv-note cv-wait"><i class="cv-spin" aria-hidden="true"></i>模拟在后台算两遍，对比拧不拧…</div></div>`;
  const head = `<div class="cv-sech">用模拟核对</div>`;
  if (c.status !== 'ok') return `<div class="cv-sec cv-check">${head}<div class="cv-note">${esc(c.reason || '这里核对不了')}</div></div>`;
  const where = c.scenario === 'town' ? '从当前季度、默认设定出发' : `从 ${esc(c.date)} 起`;
  let rows = '';
  const self = isValve(id), route = self ? null : v.up.find(u => u.valve === c.valveNode);
  if (route) {
    const path = routeOf(route), s = pathSigns(path, c.vdir), reach = propagate(c.valveNode, 1, { mode: o.mode });
    for (let i = 1; i < path.length; i++) {
      const node = path[i], line = simLine(node, { sign: s[i], lag: reach[node] ? reach[node].lag : 0 }, c);
      if (line) rows += `<div class="cv-cr">${chip(node, s[i], { self: node === id, small: true })}${line}</div>`;
    }
  } else if (self) {
    const line = simLine(id, { sign: c.vdir, lag: 0 }, c);
    if (line) rows += `<div class="cv-cr">${chip(id, c.vdir, { self: true, small: true })}${line}</div>`;
  }
  const sc = c.scenario === 'town' ? '小镇' : '美国';
  return `<div class="cv-sec cv-check">${head}<div class="cv-what">拧动 <b>${esc(c.turn)}</b>，${where}<small>（${sc}${c.mode === 'free' ? '·自由模式' : ''}，两份一样的模拟，只差这一下，各走 ${c.steps} 个季度）</small></div>${rows}<div class="cv-legend"><i class="cv-mk ok">✓</i>和图一致 <i class="cv-mk eq">≈</i>几乎没动 <i class="cv-mk bad">✗</i>和图相反</div></div>`;
}

export function chainHtml(id, opts = {}) {
  const o = { mode: 'history', push: null, open: new Set(), playing: false, status: '', check: null, ...opts };
  if (!isNode(id)) return '';
  const v = chainView(id, { mode: o.mode });
  if (!v.detected && !allNodes().includes(id)) return `<section class="cv cv-det" data-cv><div class="cv-det-t"><b>它还没有画进传导链</b><span>先看下面的「为什么现在是这个值」</span></div></section>`;
  if (v.detected) return `<section class="cv cv-det" data-cv><div class="cv-det-t"><b>它是检测结果，不在传导链上</b><span>看「周期」标签页</span></div></section>`;
  const plan = checkPlan(id, { mode: o.mode, dir: o.push ?? 1 });
  const lamp = id.startsWith('lamp');
  const bar = `<div class="cv-tb"><button type="button" class="cv-btn play${o.playing ? ' on' : ''}" data-cv-act="play">${o.playing ? '■ 停止' : '▶ 看一遍流向'}</button>` +
    `<button type="button" class="cv-btn peek" data-cv-act="peek" aria-pressed="${o.peek ? 'true' : 'false'}" title="把卡片压矮，多看一点上面的图">${o.peek ? '↕ 展开卡片' : '↕ 多看图'}</button></div>`;
  const status = `<div class="cv-status" data-cv-status aria-live="polite">${o.status || ''}</div>`;
  const checkBtn = plan ? `<div class="cv-btns"><button type="button" class="cv-btn${o.check ? ' on' : ''}" data-cv-act="check" aria-pressed="${o.check ? 'true' : 'false'}">用模拟核对</button><span class="cv-pn">拧一下阀门，看模拟和这张图一不一样</span></div>` : '';
  return `<section class="cv" data-cv><div class="cv-top"><h3 class="cv-h">传导链<small>水从哪来，往哪去</small></h3>${bar}</div>${status}` +
    upHtml(id, v, o) + (lamp ? '' : downHtml(id, v, o)) + checkBtn + checkHtml(id, o, v) + `</section>`;
}

/** The status line shown while ▶ plays (also built here so the string stays in one place). */
export function stepStatus(step, i, n) {
  if (!step) return '';
  return `<span class="cv-pg">${i + 1}/${n}</span> ${chip(step.node, step.sign, { small: true })}${step.label ? `<span class="cv-lag">${esc(step.label)}</span>` : ''}`;
}
