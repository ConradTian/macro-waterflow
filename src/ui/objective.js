// 总目标 strip (A4): one line + four penalty lamps, just above the 本季看点 strip.
//   objectiveState(sim, snap, iso?) -> { score, level, yoy, perPerson, lamps:[{id,name,level,reason}] } | null     DOM-free (Node can run it)
//   renderObjective(el, ctx)        paints the strip; ctx = { sim, snap, openTerm, setTab }
// Score = 每人真实消费: cumulative (household consumption / price level / population) since the first quarter, first quarter = 100.
//   Population = World Bank annual (src/data/world.js), put at mid-year, linear in between, last year held flat.
// Lamps (green / yellow / red; the engine's own colours): 泛滥 |inflation - target|, 干涸 unemployment - u*, 溃坝 long cycle B2 or ⑤ / bad loans,
//   透支 the worse of the DSR lamp and the 利息/税收 gauge. Reads snapshots only; it never touches the economy.
// Progressive diagram: the strip is part of L-water, the 4 lamps carry data-layer="L-gov" (hidden by app.css until that layer is shown).
// Tapping the text opens the 整个经济 role card in a drop-down under the strip (roleCardHtml('economy') of concepts.js, with the live lamp reasons below it;
// the 4 lines of tools/AB-CONTRACT.md inline if that module is missing); tapping a lamp shows its reason.
import { WORLD } from '../data/world.js';
import { GAUGES } from '../data/gauges.js';
import { countryParams } from '../data/country-params.js';
import { currentCountry } from './country-info.js';

const num = x => typeof x === 'number' && Number.isFinite(x);
const RANK = { green: 0, yellow: 1, red: 2 };
const worse = (a, b) => (RANK[b] > RANK[a] ? b : a);
const LV = { green: '绿', yellow: '黄', red: '红' };
const pp = (v, d = 1) => (v * 100).toFixed(d) + 'pp';
const pc = (v, d = 1) => (v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(d) + '%';
const sgn = (v, d = 1) => (v < 0 ? '−' : '+') + Math.abs(v * 100).toFixed(d) + '%';

/* ------------------------------------------------------------------ population (annual -> quarter) */
/** persons in millions at quarter index t (0 = 1995Q1): mid-year points, linear between, flat outside. null if the country has no series. */
export function populationAt(iso, t) {
  const c = WORLD.countries[iso], p = c && c.population, ys = WORLD.years;
  if (!Array.isArray(p) || !p.length) return null;
  const x = 1995 + t / 4 + 0.125 - 0.5;                    // quarter centre, in "years since the mid-year of year 0"
  const i = x - ys[0];
  if (i <= 0) return p[0];
  if (i >= p.length - 1) return p[p.length - 1];           // last year held flat
  const k = Math.floor(i), f = i - k;
  return p[k] + (p[k + 1] - p[k]) * f;
}

/* ------------------------------------------------------------------ natural unemployment (same rule as uStarAt in the engine) */
const qIdx = d => (Number(d.slice(0, 4)) - 1995) * 4 + Number(d.slice(5)) - 1;
export function uStarFor(cp, t) {
  const path = cp.uStarPath && cp.uStarPath.length ? cp.uStarPath.map(([d, o]) => [typeof d === 'number' ? d : qIdx(d), o]).sort((a, b) => a[0] - b[0]) : null;
  if (!path) return cp.uStar;
  if (t <= path[0][0]) return cp.uStar + path[0][1];
  for (let i = 1; i < path.length; i++) {
    if (t <= path[i][0]) { const [t0, a] = path[i - 1], [t1, b] = path[i]; return cp.uStar + a + (b - a) * (t - t0) / (t1 - t0); }
  }
  return cp.uStar + path[path.length - 1][1];
}

/* ------------------------------------------------------------------ the score */
const realCons = s => {
  const c = s?.household?.consumption, p = s?.macro?.priceLevel;
  return num(c) && num(p) && p > 0 ? c / (p / 100) : null;
};
/** { score, level, yoy, perPerson } at snap.t. score = cumulative real consumption per person (first quarter = 100); level = current quarter on the same scale;
 *  yoy = this quarter's real consumption per person vs four quarters earlier (null before a year has passed). */
export function scoreAt(sim, snap, iso) {
  const branch = sim.takenOver ? 'user' : 'model';
  const per = t => {
    const s = sim.snapshot(branch, t) || sim.snapshot('model', t), r = realCons(s), pop = populationAt(iso, t);
    return r == null ? null : r / (pop == null ? 1 : pop);
  };
  const first = per(0);
  if (first == null || first <= 0) return null;
  let cum = 0;
  for (let t = 0; t <= snap.t; t++) { const v = per(t); if (v != null) cum += v; }
  const now = per(snap.t), ago = snap.t >= 4 ? per(snap.t - 4) : null;
  return { score: 100 * cum / first, level: now == null ? null : 100 * now / first, yoy: now != null && ago ? now / ago - 1 : null, perPerson: populationAt(iso, snap.t) != null };
}

/* ------------------------------------------------------------------ the four lamps */
function bandLevel(bands, v) {
  const b = (bands || []).find(x => v >= x.lo && v < x.hi);
  return b ? b.level : 'green';
}
export function lampsAt(snap, iso) {
  const cp = countryParams(iso), m = snap.macro || {};
  const out = [];
  // 泛滥: inflation away from the target (either direction)
  if (num(m.inflation)) {
    const d = Math.abs(m.inflation - cp.piTarget);
    const level = d < 0.01 ? 'green' : d <= 0.025 ? 'yellow' : 'red';
    out.push({ id: 'flood', name: '泛滥', level, reason: `通胀 ${pc(m.inflation)}，目标 ${pc(cp.piTarget, 1).replace('.0', '')}，偏离 ${pp(d)}（<1pp 绿，1–2.5pp 黄，>2.5pp 红）。水涌出河岸：价格涨得太快或跌太多。` });
  }
  // 干涸: unemployment above its normal rate
  if (num(m.unemployment)) {
    const us = uStarFor(cp, snap.t), d = m.unemployment - us;
    const level = d < 0.01 ? 'green' : d <= 0.03 ? 'yellow' : 'red';
    // known US unemployment gaps (MODEL_GAPS in tabs/_util.js): say so on the lamp itself.
    // 2006Q1–2008Q2 = t 44–53, 2009Q3–2013Q4 = t 58–75, 2024Q1–2025Q4 = t 116–123 (US recalibration 2026-10-29, real fiscal path)
    const GAP_NOTE = [[44, 53, '2006–08 模型失业率偏高（6–9%），真实约 4.5–5%'], [58, 75, '2009–13 模型失业率回落太快，真实更高（约 9–10%，2013 年还有 7–8%）'],
      [116, 123, '2024–25 模型失业率升到约 7%（增长几乎停住），真实约 4%']];
    const gn = iso === 'USA' ? GAP_NOTE.find(([a, b]) => snap.t >= a && snap.t <= b) : null, gap = !!gn;
    out.push({ id: 'drought', name: '干涸', level, gap, reason: `失业率 ${pc(m.unemployment)}，正常水平 ${pc(us)}，高出 ${d < 0 ? '−' : ''}${pp(Math.abs(d))}（<1pp 绿，1–3pp 黄，>3pp 红）。河道闲着：人和工厂没活干。` +
      (gap ? `【模型偏差：${gn[2]}】` : '') });
  }
  // 溃坝: long cycle on the B2 fork or in ⑤; amber when bad loans are above their band
  {
    const L = snap.cycles?.long, bad = snap.bank?.badLoanRate;
    const badLv = num(bad) ? bandLevel(GAUGES.badLoans?.bands, bad) : 'green';
    const stage5 = L && (L.stage === 5 || /^⑤/.test(String(L.label || '')));
    let level = 'green', reason;
    if (L && L.fork === 'B2') { level = 'red'; reason = '大周期走上了 B2 岔路（降息推不动，债务压垮）。堤坝要垮。'; }
    else if (stage5) { level = 'red'; reason = '大周期在 ⑤ 降息失灵·私人去杠杆。堤坝已经垮了。'; }
    else if (badLv !== 'green') { level = 'yellow'; reason = `银行坏账率 ${pc(bad)}，超过正常区间（2%）。堤坝出现裂缝。`; }
    else reason = `大周期${L ? ' ' + String(L.label || '').split(' ')[0] : ''}，没走 B2，坏账率${num(bad) ? ' ' + pc(bad) : ''}在正常区间。堤坝稳。`;
    out.push({ id: 'burst', name: '溃坝', level, reason });
  }
  // 透支: the worse of the DSR lamp and the 利息/税收 gauge
  {
    const ds = snap.lights?.debtService, i2t = snap.gov?.interestToTax;
    const a = ds?.level || 'green', b = num(i2t) ? bandLevel(GAUGES.interestToTax?.bands, i2t) : 'green';
    const level = worse(a, b);
    const parts = [];
    if (ds) parts.push(`家庭还本付息/收入 ${pc(ds.value)}（偿债灯${LV[a]}）`);
    if (num(i2t)) parts.push(`政府利息/税收 ${pc(i2t)}（${LV[b]}：<15% 绿，15–25% 黄，>25% 红）`);
    const note90s = iso === 'USA' && snap.t < 24 && b !== 'green' ? '1990 年代初美国利息负担确实偏高，后来靠增长和财政盈余化解。' : '';
    out.push({ id: 'overdraft', name: '透支', level, reason: parts.join('；') + '。借来的水太多，利息吃掉收入。' + note90s });
  }
  return out;
}

export function objectiveState(sim, snap, iso) {
  if (!sim || !snap || sim.scenario === 'town') return null;
  iso = iso || currentCountry(sim);
  const sc = scoreAt(sim, snap, iso);
  return { ...(sc || { score: null, level: null, yoy: null, perPerson: false }), lamps: lampsAt(snap, iso), iso };
}

/* ------------------------------------------------------------------ the 整个经济 card, inline fallback (tools/AB-CONTRACT.md A1) */
export const ECONOMY_CARD = [
  ['想要什么', '长期运出最多的真实东西给人用（累计真实消费）'],
  ['盯着什么', '四个扣分项：泛滥（通胀偏离目标）、干涸（失业、产能闲置）、溃坝（金融危机 / B2）、透支（债务/收入过高）'],
  ['能拧什么', '不直接拧：央行、政府、银行、家庭、企业、投资者、外国人各拧自己的阀门，合起来的结果就是这个分数'],
  ['常犯的错', '每个角色只顾自己的目标，加在一起就让某个扣分项爆掉：繁荣时一起借，萧条时一起省'],
];

/* ------------------------------------------------------------------ DOM */
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtScore = v => Math.round(v).toLocaleString('en-US');
let host = null, last = null, pop = null;                 // pop = { kind: 'lamp'|'card', id? } : which overlay is open

export function renderObjective(el, ctx) {
  if (!el) return;
  host = el; last = ctx;
  const { sim, snap } = ctx;
  let st = null;
  try { st = objectiveState(sim, snap); } catch (e) { console.error(e); }
  if (!st) { el.hidden = true; pop = null; return; }
  el.hidden = false;
  last.state = st;
  const pp1 = st.perPerson ? '每人' : '';
  const yoy = st.yoy == null ? '' : `<span class="ob-yoy ${st.yoy < 0 ? 'neg' : 'pos'}" title="这一季的${pp1}真实消费比一年前${sgn(st.yoy)}"><span class="ob-yl">比一年前 </span>${st.yoy < 0 ? '▼' : '▲'}${pc(Math.abs(st.yoy))}</span>`;
  const lamps = st.lamps.map(l => `<button type="button" class="ob-lamp" data-lamp="${l.id}" data-level="${l.level}"${l.gap ? ' data-gap="1"' : ''} aria-expanded="${pop && pop.id === l.id}" ` +
    `title="${esc(l.name)}：${LV[l.level]}。${esc(l.reason)}" aria-label="${esc(l.name)}${LV[l.level]}灯，点开看原因"><i class="ob-dot" aria-hidden="true"></i><span>${l.name}</span></button>`).join('');
  // headline = this quarter's level (first quarter = 100): a beginner reads 134 as "比起点多 34%". The cumulative total (the area under the curve,
  // which is what the goal maximises) goes in the tooltip and the card.
  const score = st.level == null ? '—' : fmtScore(st.level);
  const tip = st.level == null ? '' : `这一季的${pp1}真实消费，第一季 = 100。总目标是把它长期累计得最多：累计 ${fmtScore(st.score)}（每季加一次）。点开看这张「整个经济」卡片。`;
  el.className = 'objective' + (pop ? ' open' : '');
  el.innerHTML = `<div class="ob-bar"><button type="button" class="ob-main" data-act="card" aria-label="总目标，点开整个经济卡片" title="${esc(tip)}">` +
    `<span class="ob-lab"><span class="ob-long">总目标：长期运出最多的真实东西给人用 — </span><span class="ob-short">总目标 · </span></span>` +
    `<b class="ob-sc">${pp1}真实消费 <span class="ob-n">${score}</span></b>${yoy}</button>` +
    `<span class="ob-lamps" role="group" aria-label="四个扣分项" data-layer="L-gov">${lamps}</span></div>` + popHtml(st);
  if (wiredEl !== el) { wiredEl = el; el.addEventListener('click', onClick); document.addEventListener('click', onOutside); document.addEventListener('keydown', onKey); }
}

function popHtml(st) {
  if (!pop) return '<div class="ob-pop" hidden></div>';
  if (pop.kind === 'lamp') {
    const l = st.lamps.find(x => x.id === pop.id);
    if (!l) return '<div class="ob-pop" hidden></div>';
    return `<div class="ob-pop" role="status"><div class="ob-pop-h"><i class="ob-dot" data-level="${l.level}" aria-hidden="true"></i><b>${l.name} · ${LV[l.level]}</b></div>` +
      `<p>${esc(l.reason)}</p><button type="button" class="ob-link" data-act="card">整个经济卡片 ›</button></div>`;
  }
  const rows = pop.html || ECONOMY_CARD.map(([k, v]) => `<div class="ob-row"><b>${k}</b><span>${esc(v)}</span></div>`).join('');
  const ls = st.lamps.map(l => `<li><i class="ob-dot" data-level="${l.level}" aria-hidden="true"></i><b>${l.name}</b> ${LV[l.level]}　<span class="muted">${esc(l.reason)}</span></li>`).join('');
  const note = st.level == null ? '' : `<p class="muted ob-note">条上的数 = 这一季的${st.perPerson ? '每人' : ''}真实消费（家庭消费 ÷ 物价 ÷ 人口），第一季 = 100，现在 ${Math.round(st.level)}。总目标看的是它长期累计的量：衰退少掉的那几季，以后补不回来。累计到现在：${fmtScore(st.score)}。</p>`;
  return `<div class="ob-pop ob-card" role="dialog" aria-label="整个经济"><div class="ob-pop-h">${pop.html ? '' : '<b>整个经济</b>'}<button type="button" class="ob-x" data-act="close" aria-label="关闭">×</button></div>` +
    `${rows}${note}<ul class="ob-ls">${ls}</ul></div>`;
}

let wiredEl = null;
function repaint() { if (host && last) renderObjective(host, last); }
function setPop(p) { pop = p; repaint(); }
// composedPath, not contains(target): the strip repaints itself on a tap, so by now the tapped node is detached
function onOutside(e) { if (pop && host && !(e.composedPath ? e.composedPath() : []).includes(host)) setPop(null); }
function onKey(e) { if (e.key === 'Escape' && pop) setPop(null); }
async function openCard() {
  if (pop && pop.kind === 'card') return setPop(null);
  let html = '';
  try { html = (await import('./concepts.js')).roleCardHtml('economy', last && last.state ? last.state.iso : undefined) || ''; } catch (e) { /* roles module missing: inline lines */ }
  setPop({ kind: 'card', html });
}
function onClick(e) {
  const lamp = e.target.closest('.ob-lamp');
  if (lamp) { const id = lamp.dataset.lamp; setPop(pop && pop.id === id ? null : { kind: 'lamp', id }); return; }
  const act = e.target.closest('[data-act]');
  if (!act) { if (e.target.closest('[data-term]')) setTimeout(() => setPop(null), 0); return; }   // a term inside the card opens its concept card: get out of the way
  if (act.dataset.act === 'close') setPop(null);
  else if (act.dataset.act === 'card') openCard();
}

/** lessons / tests: close any open overlay */
export function closeObjective() { if (pop) setPop(null); }
