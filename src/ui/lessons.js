// Lesson runner + course menu. Driven by src/data/lessons.js (+ optional src/data/role-lessons.js).
// App contract (see app.js): initLessons(ctx) where ctx = {
//   sim():sim, real():US_Q, getSnap(), setPlaying(bool), isPlaying(), refresh(), openTerm(id), setQuiet(bool),
//   setTickMs(ms), setTab(id), country?():iso }
// and the app calls onRender() after every renderAll().
// Step types: intro watch predict experiment recap (see data/lessons.js header) + reveal + takeover.
// WORLD lessons (kind:'world'): step field map:{open,select?,year?} dispatches 'mw:map' (the map page); lesson field country:'AUS' navigates to ?country=AUS&lesson=<id>
// when COUNTRY_READY[iso]; vals/claims getters 'world:<path>@<year>' read WORLD (src/data/world.js, loaded lazily).
// TOWN lessons (L.scenario === 'town', see src/ui/lessons-town.js): the displayed sim is swapped for the town sim via ctx.setSim(sim, data)
// (ctx.setSim(null) restores the US sim) and the world is rebuilt by replay at every step. Extra step types:
//   action  { action | actions, text, question?, answerHint?, relation?, show?, quarters?, metrics? }  tap performs a townAction + water droplet
//   valve   { valve, value, text, question?, quarters, metrics?, keep? }   tap turns the valve, ripple with delay labels, plays `quarters`
//   try     { valve+slider | choices, quarters, metrics, insight }          sandbox (no state carried on)
//   chain   { links:[{text, term?, pipe?, part?}], text, next? }            final causal chain, each link tappable -> pipe glows
//   zoom    { date, until?, text, block?, next?, showAll? }                 zoomOut() animation, swap to the US sim at `date`
// PANELS (冲击 kind:'shocks', 汇率 kind:'fx', 投资者 kind:'capstone', and any step that names one): step field panel:{ id, ...options } mounts one
//   interactive panel on entering the step and unmounts it on leaving the step, on exit and before draw() rebuilds a host. The module is chosen
//   by the panel id (panelKind): 'fx-reactor' -> the FX reactor (mountFxReactor, src/ui/fx-reactor.js; spec { iso, date, dates?, forces?, hl? },
//   `dates` = date chips over the reactor), 'shk-*' -> src/ui/shock-lab.js, 'fx-*' -> src/ui/fx-lab.js, else src/ui/investor-lab.js.
//   Host per step (contract: tools/D-CONTRACT.md 「接线」): 'diagram' = div#ls-panel over the water-diagram column (covers it like the curves
//   view); 'card' = div.ls-pnl-card in the lesson card body (投资者 assetTable flashes the pools). Panel modules load lazily in startLesson.
// COURSE v3 (tools/COURSE-V3.md; contract tools/D-CONTRACT.md 「课程 v3」):
//   menu      COURSE.parts (4 parts, 8 lessons, badges 1–8) -> 「沙盒」 link (free mode) -> 旧版课程 (collapsed)
//   ending    the last step's ending:{q1,q2,q3} renders as the fixed 三问 block (.ls-end) once the step is answered; {placeholders} filled
//   drills    step field drills:[{label, panel, text, back?}] = optional drill-down buttons: the drill's panel replaces the step's (over the
//             diagram) and its text shows in the card until 「回到」; drillCta:true = the first drill is the primary button (m5 外国人 -> AUS reactor)
//   roles     step field roleCard:'bank' or roleCards:['centralBank','bank'] (m5) = those role cards under the step's first (bold) paragraph, and their valves
//             glow on the diagram (flow.js highlightRole, ROLE_VALVES of src/data/layers.js); leaving the step clears the glow
//   progress  markDone(id) of src/ui/progress.js (layer agent) when a lesson reaches its last step;
//             document event mw:lesson-active { id } on start and every step change, { id: null } on exit
// Country lessons (lesson field country:'AUS': w2, 投资者): starting one goes to ?country=AUS&lesson=<id>; exiting it goes back to the US root page.
import { createSim } from '../engine/sim.js';
import * as RULES from '../engine/rules.js';
import { VALVES } from '../engine/valves.js';
import { TOWN_DATA } from '../engine/town.js';
import { LESSONS, COURSE } from '../data/lessons.js';
import { linkify, roleCardHtml } from './concepts.js';
import { CONCEPTS as CONC } from '../data/concepts.js';
import { flash, clearFlash, ROLE_ORDER, ROLE_NAME, setAvailableRoles, isRoleLearned, markRoleLearned } from './links.js';
import { compareChart } from './tabs/_util.js';
import { pctFmt } from './chart.js';
import { pulseHeadline, closeHeadline } from './headline.js';   // lesson step field strip:true -> the 本季看点 strip pulses
import * as FLOW from './flow.js';             // feature-detected: FLOW.playValveRipple / FLOW.zoomOut may be missing in older diagrams
import { markDone } from './progress.js';      // course v3: the progressive diagram learns a lesson's layer when the lesson reaches its last step
import { replayTown, lessonPositions, tapEffects, applyOne, applyAll, runTry, fmtV, aggregate, dateT, getPath, scratchRun, buildTable, fillStep, setWorldData } from './lessons-town.js';
// 专题 lessons: outside the 8-lesson main line (not in COURSE / LESSON_ORDER, not counted); menu group 「专题」 after the 4 parts.
// 「专题：预期」 (src/data/lesson-exp.js) mounts the exp-* panels of src/ui/exp-gauge.js.
import { LESSON_EXP } from '../data/lesson-exp.js';
export const TOPIC_LESSONS = [LESSON_EXP];

const P = new URLSearchParams(location.search);
const KEY = 'mw.lessons.v1';
const TAB_IDS = ['ledger', 'cycle', 'assets', 'takeover'];
let ctx = null, menu = null, card = null;
let cur = null;            // { L, i, pos:[{from,until}] }
let ss = {};               // per-step state
let target = null;         // t index the current step is playing towards
let busy = false;          // true while we reset / fast-forward silently
let ov = { params: {}, rules: {} };   // active experiment overrides
let dirty = false;         // sim currently carries experiment overrides
const touched = new Map(); // 'rule.key' -> default value (captured before first change)

/* ---------- lesson registry (core lessons + optional role lessons) ---------- */
let ROLE_LESSONS = [];
let rolesReady = Promise.resolve();
const isAvail = L => !!L && L.available !== false && Array.isArray(L.steps) && L.steps.length > 0 && countryOk(L);
const all = () => [...LESSONS, ...ROLE_LESSONS, ...TOPIC_LESSONS];
function lookup(id) {            // numeric/string id, or 'role:<playerId>'
  if (id == null) return null;
  const s = String(id);
  if (s.startsWith('role:')) return ROLE_LESSONS.find(l => l.role === s.slice(5)) || null;
  return all().find(l => String(l.id) === s) || null;
}
function loadRoles() {
  const countries = import('../data/countries/index.js').then(m => { COUNTRY_READY = m.COUNTRY_READY || {}; }).catch(() => { COUNTRY_READY = {}; });
  rolesReady = import('../data/role-lessons.js')
    .then(m => { ROLE_LESSONS = Array.isArray(m.ROLE_LESSONS) ? m.ROLE_LESSONS.filter(Boolean) : []; })
    .catch(() => { ROLE_LESSONS = []; })
    .then(() => countries)
    .then(() => { setAvailableRoles(ROLE_LESSONS.filter(isAvail).map(l => l.role)); if (!cur && ctx) ctx.refresh(); });
}
// old lessons (COURSE.legacy) carry a 「旧版」 prefix on the card, so their 「第 N 课」 never clashes with the main line's numbers
const LEGACY = new Set((COURSE?.legacy || []).map(String));
const isLegacy = L => !!L && (LEGACY.has(String(L.id)) || (L.role && LEGACY.has('role:' + L.role)));
const lessonLabel = L => (isLegacy(L) ? '旧版 · ' : '') + (L.role ? `${ROLE_NAME[L.role] || L.role}课` : (L.label || `第 ${L.id} 课`));

/* ---------- helpers ---------- */
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rich = s => linkify(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const arr = x => (x == null ? [] : Array.isArray(x) ? x : [x]);
const lab = d => (typeof d === 'number' ? `第${d}季` : d);
const wait = ms => new Promise(r => setTimeout(r, ms));
const usBase = L => L.startDate || (cur && cur.pos.find(p => p.world === 'us')?.from) || '1995Q1';
const sim = () => ctx.sim();
// left panel: 'flow' (water diagram) | 'waves' (curves view). app.js owns the state and listens for mw:view; a step's `view` field sets it.
const setView = v => document.dispatchEvent(new CustomEvent('mw:view', { detail: { view: v } }));
const freeUrl = () => new URL('free/', location.href).href;
// the world map page (owned by another module) listens for mw:map { open, select, year }. mapOpen = the lesson itself opened it.
let mapOpen = false;
const mapEvent = detail => document.dispatchEvent(new CustomEvent('mw:map', { detail }));
function applyMap(st) {
  const m = st && st.map;
  if (m) { const open = m.open !== false; mapEvent({ open, select: open ? (m.select ?? null) : null, year: m.year }); mapOpen = open; }
  else if (mapOpen) { mapEvent({ open: false }); mapOpen = false; }   // a step without `map` is a main-screen step
}
// country views: COUNTRY_READY[iso] from src/data/countries/index.js (may not exist yet -> nothing is ready)
let COUNTRY_READY = {};
const curCountry = () => (ctx && ctx.country ? ctx.country() : null) || P.get('country') || 'USA';
const countryOk = L => !L.country || L.country === 'USA' || !!COUNTRY_READY[L.country];
// world data (annual) for 'world:' getters: loaded lazily, only when a lesson uses them
let worldTried = null;
const usesWorld = L => JSON.stringify(L).includes('"world:');
function loadWorld() {
  worldTried ||= import('../data/world.js').then(m => setWorldData(m.WORLD)).catch(() => setWorldData(null));
  return worldTried;
}

// course progress shared with the progressive diagram (src/ui/progress.js, layer agent; localStorage 'mw.course', fires mw:progress)
function markDoneShared(id) { try { markDone(id); } catch (e) { /* storage blocked: ignore */ } }
// the layer agent shows the diagram layers up to the active lesson's layer
const lessonActive = id => document.dispatchEvent(new CustomEvent('mw:lesson-active', { detail: { id: id == null ? null : String(id) } }));

function load() { try { return JSON.parse(localStorage.getItem(KEY)) || { done: {}, step: {} }; } catch (e) { return { done: {}, step: {} }; } }
function save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* ignore */ } }
function mark(fn) { const p = load(); p.done ||= {}; p.step ||= {}; fn(p); save(p); }

/* ---------- sim control (rules / params / seek) ---------- */
function setParam(s, rule, key, v) {
  const k = rule + '.' + key;
  if (!touched.has(k)) touched.set(k, RULES.RULE_BY_ID?.[rule]?.params?.[key]);
  if (typeof s.setRuleParam === 'function') s.setRuleParam(rule, key, v);
  else if (RULES.RULE_BY_ID?.[rule]?.params) RULES.RULE_BY_ID[rule].params[key] = v;   // fallback before engine API lands
}
const ruleOn = (L, id) => !Array.isArray(L.rulesOn) || L.rulesOn.includes(id);          // 'all' / undefined -> every rule on
function applySetup(s, L, o) {
  for (const r of s.rules) s.setRuleEnabled(r.id, ruleOn(L, r.id));
  for (const [id, on] of Object.entries(o.rules || {})) s.setRuleEnabled(id, !!on);
  for (const [k, def] of touched) {                       // restore anything not overridden, then apply overrides
    const [rule, key] = k.split('.');
    if (!(k in (o.params || {})) && def !== undefined) setParam(s, rule, key, def);
  }
  for (const [k, v] of Object.entries(o.params || {})) { const [rule, key] = k.split('.'); setParam(s, rule, key, v); }
}
function ffTo(s, date) {
  const T = dateT(date);
  while (s.t < T && !s.done) s.step();
}
// Experiment overrides (o) are applied from `ovFrom` on (default: lesson start), so the sim before that point is the plain model.
function restart(L, o, date, ovFrom = usBase(L)) {
  const s = sim();
  busy = true;
  try {
    s.reset(L.mode || 'history');
    applySetup(s, L, { params: {}, rules: {} });
    ffTo(s, usBase(L));
    ffTo(s, ovFrom);
    applySetup(s, L, o);
    ffTo(s, date);
  } finally { busy = false; }
  dirty = !!(Object.keys(o.params || {}).length || Object.keys(o.rules || {}).length);
  ctx.refresh();
}
function seek(date) {
  const s = sim();
  if (dirty || s.t > dateT(date)) { ov = { params: {}, rules: {} }; restart(cur.L, ov, date); return; }
  busy = true; try { ffTo(s, date); } finally { busy = false; }
  ctx.refresh();
}

/* scratch simulation: compute experiment metrics without disturbing the displayed one (shared code: lessons-town.js) */
function metricsFor(L, o, step) {
  const r = scratchRun(ctx.real(), L, o, step.from, step.until);
  return step.metrics.map(m => aggregate(r.hist, m.get, r.base));
}

/* ---------- highlights (class on [data-term] in the diagram, re-applied after each render) ---------- */
let hlIds = [];
// step field mark:[...] = a steady glow (class ls-mark) on things that have no data-term: the 收入循环 ring, the four outlets, the 总目标 strip.
// Re-applied after every render (the strip rewrites its className each quarter).
const MARKS = {
  loop: '#diagram .flow-svg g.loop, #diagram .flow-svg g.loop-lbl',
  outlets: '#diagram .flow-svg [data-pipe="outC"], #diagram .flow-svg [data-pipe="outI"], #diagram .flow-svg [data-pipe="outG"], #diagram .flow-svg [data-pipe="outNX"], #diagram .flow-svg .oname, #diagram .flow-svg .gdpln',
  objective: '#objective',
};
export const MARK_IDS = Object.keys(MARKS);
function applyMarks() {
  document.querySelectorAll('.ls-mark').forEach(n => n.classList.remove('ls-mark'));
  const st = cur && cur.L.steps[cur.i];
  if (!st || !st.mark || ss.zooming) return;
  for (const m of arr(st.mark)) if (MARKS[m]) document.querySelectorAll(MARKS[m]).forEach(n => n.classList.add('ls-mark'));
}
// step field roleCard / roleCards:[...]: the step's roles; their valves glow (flow.js highlightRole: one role at a time, so the glow of each
// role is collected and put back together). Re-applied only when the step or the diagram element changes, so a tap on a role card
// (flow.js: focus that one role / clear) is not undone by the next render.
const stepRoles = st => (st ? arr(st.roleCards || st.roleCard) : []);
let roleSeen = null;
function applyRoles() {
  if (typeof FLOW.highlightRole !== 'function') return;
  const roles = cur && !ss.zooming ? stepRoles(cur.L.steps[cur.i]) : [];
  const wrap = document.querySelector('.flow-wrap'), key = roles.length ? `${cur.L.id}:${cur.i}:${roles.join()}` : '';
  if (roleSeen && roleSeen.wrap === wrap && roleSeen.key === key) return;
  const had = !!(roleSeen && roleSeen.key);
  roleSeen = { wrap, key };
  if (!roles.length) { if (had) FLOW.highlightRole(null); return; }
  const keep = [];
  for (const r of roles) { FLOW.highlightRole(r); if (wrap) wrap.querySelectorAll('.rv-on').forEach(n => keep.push(n)); }
  keep.forEach(n => n.classList.add('rv-on'));
}
function applyHl() {
  applyMarks();
  applyRoles();
  const host = document.getElementById('diagram');
  if (!host) return;
  host.querySelectorAll('.ls-hl, .ls-hl-pipe').forEach(n => n.classList.remove('ls-hl', 'ls-hl-pipe'));
  if (!cur || !hlIds.length) return;
  const svg = host.querySelector('svg');
  if (!svg) return;
  hlIds.forEach(id => svg.querySelectorAll(`[data-term="${id}"]`).forEach(n => n.classList.add('ls-hl')));
  // pipes: chip layer and pipe layer are built in the same order (flow.js build())
  const kids = [...svg.children];
  const pipes = kids[1] && [...kids[1].children], chips = kids[2] && [...kids[2].children];
  if (pipes && chips && pipes.length === chips.length) chips.forEach((c, i) => { if (c.classList.contains('ls-hl')) pipes[i].classList.add('ls-hl-pipe'); });
}
function setHl(ids) { hlIds = ids || []; applyHl(); }

/* ---------- progressive reveal: visible parts of the diagram + tabs ---------- */
let prevVis = null;
function computeVis(L, i, revealedNow) {
  if (!L.startParts) return null;                           // default: everything visible
  const s = new Set(L.startParts);
  for (let k = 0; k <= i; k++) {
    const st = L.steps[k];
    if (st.showAll) return null;                            // e.g. the zoom to the US: the whole diagram is on
    if (!st.show) continue;
    const immediate = st.type !== 'reveal' || !st.question;   // action/valve steps need their parts before the tap
    if (k < i || immediate || revealedNow) arr(st.show).forEach(p => s.add(p));
  }
  return s;
}
function applyVis(set) {
  const b = document.body;
  if (!set) { b.classList.remove('parts-on'); delete b.dataset.vis; prevVis = null; return; }
  const added = prevVis ? [...set].filter(p => !prevVis.has(p)) : [];
  b.classList.add('parts-on');
  b.dataset.vis = [...set].join(' ');
  prevVis = new Set(set);
  if (added.length) announce(added);
}
function announce(parts) {                                  // fade/pulse newly revealed parts once
  const sel = parts.map(p => `.flow-svg [data-part~="${p}"], .tabbar [data-part="${p}"]`).join(',');
  document.querySelectorAll(sel).forEach(n => n.classList.add('part-new'));
  const diag = parts.filter(p => !TAB_IDS.includes(p));
  if (diag.length) flash({ parts: diag }, 3000);
  setTimeout(() => document.querySelectorAll('.part-new').forEach(n => n.classList.remove('part-new')), 1800);
}
function syncVis() {
  applyVis(computeVis(cur.L, cur.i, !!ss.revealed));
  if (cur.L.startParts) ctx.refresh();                      // tabs may have just (un)locked
}

/* ---------- progress positions ---------- */
const positions = L => lessonPositions(L);                // [{from, until, world:'town'|'us'}]; town steps use quarter numbers

/* ---------- DOM ---------- */
function ensureDom() {
  if (menu) return;
  menu = document.createElement('div');
  menu.id = 'ls-menu'; menu.className = 'ls-menu'; menu.hidden = true;
  menu.innerHTML = '<div class="ls-backdrop" data-act="menu-close"></div><aside class="ls-sheet" role="dialog" aria-label="教学课程"><div class="ls-grab"></div><div class="ls-sheet-body"></div></aside>';
  document.body.appendChild(menu);
  menu.addEventListener('click', onMenuClick);

  card = document.createElement('section');
  card.id = 'ls-card'; card.className = 'ls-card'; card.hidden = true;
  card.setAttribute('aria-label', '教学卡片');
  (document.querySelector('.panel') || document.body).appendChild(card);
  card.addEventListener('click', onCardClick);
  card.addEventListener('input', onCardInput);
  if (window.ResizeObserver) new ResizeObserver(syncPad).observe(card);
  addEventListener('resize', syncPad);
}
function syncPad() {
  // the card lives inside .panel (below the diagram), so CSS alone docks it above the tab bar
  const tb = document.getElementById('tabbar');
  if (tb && tb.offsetHeight) document.documentElement.style.setProperty('--tb-h', tb.offsetHeight + 'px');
  const h = card && !card.hidden ? card.offsetHeight : 0;
  document.documentElement.style.setProperty('--ls-h', h + 'px');
}

/* ---------- course menu (COURSE in data/lessons.js, course v3): 4 parts × 8 lessons / 沙盒 link / 旧版课程 (collapsed) ---------- */
// the course number (1..8) of a lesson in COURSE.main (the 4 parts flattened)
const COURSE_NO = Object.fromEntries((COURSE.main || []).map((k, i) => [String(k), i + 1]));
// badge (the round number on the left) per menu key
function badgeOf(key, L) {
  const s = String(key);
  if (s.startsWith('role:')) return (ROLE_NAME[s.slice(5)] || '?').slice(0, 1);
  if (COURSE_NO[s]) return String(COURSE_NO[s]);
  if (L && L.badge) return L.badge;                          // 专题 lessons carry their own badge
  if (L && (L.kind === 'fx' || L.kind === 'capstone')) return (L.title || '?').slice(0, 1);
  if (s === '0b') return '½';
  if (s === '3b') return '3½';
  if (/^w\d+$/.test(s)) return s.replace(/^w(\d+)$/, '世$1');
  return s;
}
function menuItem(L, p, badge, key, fallbackTitle, fallbackOne, soonText) {
  const ok = isAvail(L);
  const title = L ? L.title : fallbackTitle, one = L ? L.oneLine : fallbackOne;
  const id = L ? L.id : '';
  let st;
  if (!ok) st = `<span class="ls-st soon">${soonText || (L && L.country && !COUNTRY_READY[L.country] ? '细图制作中' : '即将开放')}</span>`;
  else if (p.done[id] || (L.role && isRoleLearned(L.role))) st = '<span class="ls-st done">已完成 ✓</span>';
  else if (p.step[id] > 0) st = `<span class="ls-st doing">进行中 · 第 ${p.step[id] + 1}/${L.steps.length} 步</span>`;
  else st = '<span class="ls-st">未开始</span>';
  return `<li><button type="button" class="ls-item" data-act="start" data-id="${esc(id)}" ${ok ? '' : 'disabled'}>` +
    `<span class="ls-no">${esc(badge)}</span><span class="ls-it"><b>${esc(title)}</b><small>${esc(one)}</small>${st}</span></button></li>`;
}
const ROLE_FALLBACK_ONE = '换成这个角色的视角：它看到什么、按什么规则做、你来接管会怎样。';
function itemFor(key, p) {
  const L = lookup(key), s = String(key);
  if (s.startsWith('role:')) { const r = s.slice(5); return menuItem(L, p, badgeOf(key, L), key, `${ROLE_NAME[r] || r}课`, ROLE_FALLBACK_ONE); }
  return L ? menuItem(L, p, badgeOf(key, L), key) : '';
}
// DESIGN v3: the old site is frozen at /v2/ (static copy of a3bd76d); same relative pattern as BLIND_URL in src/ui/simple.js
const V2_URL = new URL('../../v2/', import.meta.url).href;
let oldOpen = false;                                      // the 旧版课程 group remembers whether it was opened (this page view only)
export async function openMenu() {
  ensureDom();
  await rolesReady;
  const p = load();
  const list = keys => (keys || []).map(k => itemFor(k, p)).join('');
  const parts = COURSE.parts || [];
  const total = parts.reduce((a, pt) => a + pt.ids.length, 0);
  menu.querySelector('.ls-sheet-body').innerHTML =
    `<div class="ls-head"><h2>教学</h2><button type="button" class="ls-x" data-act="menu-close" aria-label="关闭">✕</button></div>` +
    `<p class="ls-lead"><b>一条故事线，${parts.length} 部分，${total} 课。</b>每课给图加一层，学完就是历史盲测的整张图。每课最后都回答同样的三问：水的问题还是河道的问题？环上哪一步？谁赢谁输、钱放哪？</p>` +
    parts.map((pt, k) => `<h3 class="ls-sec ls-part"><i>${'一二三四五六'[k] || k + 1}</i>${esc(pt.name)}</h3><ol class="ls-list ls-main" data-part="${k + 1}">${list(pt.ids)}</ol>`).join('') +
    // 专题 group: a wrapper section and an h3 WITHOUT .ls-sec, so the menu still reads as exactly 4 parts (tools/check_d_lessons.mjs)
    (TOPIC_LESSONS.length ? `<section class="ls-topics-box"><h3 class="ls-topic-h" style="margin:14px 0 6px;font-size:14px;color:var(--accent)">专题 <small style="color:var(--muted);font-weight:400;font-size:12px;margin-left:4px">不在 ${total} 课主线里，随时可看</small></h3><ol class="ls-list ls-topics">${list(TOPIC_LESSONS.map(l => l.id))}</ol></section>` : '') +
    `<a class="ls-free-link" href="${esc(freeUrl())}" target="_blank" rel="noopener">沙盒（新窗口，自己拧阀门）↗</a>` +
    `<details class="ls-old"${oldOpen ? ' open' : ''}><summary>旧版课程 <small>小镇入门、第 0.5 课、7 个角色课、旧的周期课、Capex 与产能、世界 1 和 2；内容已并进新课</small></summary>` +
    `<a class="ls-v2-link" href="${esc(V2_URL)}" target="_blank" rel="noopener">打开旧版网站 ↗（旧图、旧课，冻结不再改）</a>` +
    `<ol class="ls-list">${list(COURSE.legacy)}</ol></details>`;
  const det = menu.querySelector('.ls-old');
  if (det) det.addEventListener('toggle', () => { oldOpen = det.open; });
  menu.hidden = false;
  requestAnimationFrame(() => menu.classList.add('open'));
}
export function closeMenu() { if (menu) { menu.classList.remove('open'); menu.hidden = true; } }
function onMenuClick(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (b.dataset.act === 'menu-close') closeMenu();
  else if (b.dataset.act === 'start' && !b.disabled) startLesson(b.dataset.id, 0);
}

/* ---------- lesson lifecycle ---------- */
export async function startLesson(id, step = 0) {
  await rolesReady;
  const L = lookup(id);
  if (!isAvail(L)) return;
  // lessons live in one country view: a lesson with `country` goes to ?country=ISO, every other US lesson goes back to the US (no `country` param)
  const want = L.country || 'USA';
  if (L.scenario !== 'town' && !L.role && curCountry() !== want) {
    const u = new URL(location.href);
    ['country', 'lesson', 'step', 'map', 'view'].forEach(k => u.searchParams.delete(k));
    if (want !== 'USA') u.searchParams.set('country', want);
    u.searchParams.set('lesson', String(L.id)); if (step) u.searchParams.set('step', String(step));
    location.href = u.href;
    return;
  }
  if (usesWorld(L)) await loadWorld();
  await loadPanels(L);                                      // step field panel: the lesson's panel module, before the first step mounts one
  ensureDom(); closeMenu();
  const prev = cur;
  if (!prev) setView('flow');                              // a fresh lesson starts on the water diagram (its highlights live there); a step may switch with `view`
  if (cur) leaveStep();
  ctx.setPlaying(false); ctx.setQuiet(true); ctx.setTickMs(L.pace || 1000);
  const s0 = sim();
  cur = { L, i: 0, pos: positions(L), world: s0.scenario === 'town' ? 'town' : 'us',
    usT0: prev ? prev.usT0 : (s0.scenario === 'town' ? 0 : s0.t) };   // US sim position to restore on exit (town lessons borrow the diagram)
  ov = { params: {}, rules: {} };
  prevVis = null;
  if (L.scenario !== 'town') { ensureWorld('us'); restart(L, ov, L.startDate); }   // town lessons are rebuilt by replay in enterStep
  document.body.classList.add('lesson-on');
  card.hidden = false; card.classList.remove('collapsed', 'tall');
  enterStep(Math.max(0, Math.min(step, L.steps.length - 1)));
}

export function exitLesson() {
  if (!cur) return;
  leaveStep();
  setView('flow');                                         // leaving a lesson restores the water diagram
  if (mapOpen) { mapEvent({ open: false }); mapOpen = false; }   // ... and closes the map the lesson opened
  const wasTown = cur.world === 'town';
  const tBack = wasTown ? cur.usT0 : dateT(ctx.getSnap().date);
  const L = cur.L;
  // a lesson that lives in another country's view (country:'AUS': w2, 投资者) took the page there on start; leaving it goes back to the US root page
  const home = L.country && L.country !== 'USA' && curCountry() !== 'USA';
  cur = null; target = null; hlIds = []; applyHl(); clearFlash(); clearDrops();
  applyVis(null);
  ov = { params: {}, rules: {} };
  if (wasTown) ctx.setSim(null);                          // the US sim is back on the diagram
  const s = sim();
  busy = true;
  try { s.reset('history'); applySetup(s, { rulesOn: 'all' }, ov); while (s.t < tBack && !s.done) s.step(); } finally { busy = false; }
  dirty = false;
  ctx.setTickMs(1000);
  ctx.refresh(); ctx.setQuiet(false);
  card.hidden = true; document.body.classList.remove('lesson-on'); syncPad();
  lessonActive(null);
  if (home) { goHome(); return; }
  ctx.setPlaying(true);
}
function goHome() {                                         // the US root page: keep the theme, drop everything else (as app.js goCountry(''))
  const u = new URL(location.href), th = u.searchParams.get('theme');
  u.search = ''; if (th) u.searchParams.set('theme', th);
  location.href = u.href;
}

/* ---------- worlds: the lesson may run on the town sim and/or the US sim ---------- */
let townSim = null;
function ensureWorld(w) {
  if (!cur || cur.world === w) return;
  if (w === 'town') {
    if (!townSim) townSim = createSim({ scenario: 'town', delays: !!cur.L.delays });
    ctx.setSim(townSim, TOWN_DATA);
  } else { ctx.setSim(null); dirty = true; }              // back on the US sim: force a clean restart in seek()
  cur.world = w;
}
const mkTown = () => createSim({ scenario: 'town', delays: !!cur.L.delays });

// clean up whatever the step we are leaving had switched on (takeover branch, timers, droplets)
function leaveStep() {
  if (ss.tkOn) { try { const s = sim(); if (typeof s.takeover === 'function') s.takeover(null); } catch (e) { /* ignore */ } }
  ss.tkOn = false;
  (ss.timers || []).forEach(clearTimeout);
  clearDrops();
  dropPanel();
}

/* ---------- step field panel:{id,...}: one interactive panel (冲击 shock-lab, 汇率 fx-lab + the FX reactor, 投资者 investor-lab) ---------- */
// shock-lab.css is not linked by index.html: it is loaded on demand with its module (like concepts.js ensureCss)
const ensureCss = f => {
  if ([...document.styleSheets].some(s => (s.href || '').includes(f)) || document.querySelector(`link[data-css="${f}"]`)) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('../../assets/css/' + f, import.meta.url).href; l.dataset.css = f;
  document.head.appendChild(l);
};
const PANEL_MODS = {
  fx: () => import('./fx-lab.js'), inv: () => import('./investor-lab.js'),
  shocks: () => import('./shock-lab.js').then(m => { ensureCss('shock-lab.css'); return m; }),
  fxr: () => import('./fx-reactor.js').then(m => { if (typeof m.ensureFxReactorCss === 'function') m.ensureFxReactorCss(); return m; }),
  exp: () => import('./exp-gauge.js').then(m => { m.ensureExpCss(); return m; }),   // 专题：预期 (panel ids 'exp-*')
};
const panelLib = {};                                        // kind -> loaded module
const CARD_PANELS = { inv: ['assetTable'] };                // these panels go in the lesson card: their step needs the diagram (pool flashes)
// the module of a panel: by its id first (a lesson may mix kinds: 汇率 = reactor + fx-lab, m5 = one reactor drill), then by the lesson's kind
const panelKind = (L, spec) => (spec.id === 'fx-reactor' ? 'fxr' : /^exp-/.test(spec.id) ? 'exp' : /^shk-/.test(spec.id) ? 'shocks' : /^fx-/.test(spec.id) ? 'fx'
  : L.kind === 'fx' ? 'fx' : L.kind === 'shocks' ? 'shocks' : 'inv');
export const panelWhere = (L, spec) => ((CARD_PANELS[panelKind(L, spec)] || []).includes(spec.id) ? 'card' : 'diagram');
let pnl = null;                                             // the mounted panel: { kind, where, key, host }
// every panel spec of a lesson: step panels and the panels of its drill-downs
const panelSpecs = L => L.steps.flatMap(s => [s.panel, ...arr(s.drills).map(d => d.panel)]).filter(Boolean);
async function loadPanels(L) {
  const kinds = new Set(panelSpecs(L).map(sp => panelKind(L, sp)));
  await Promise.all([...kinds].filter(k => !panelLib[k]).map(k => PANEL_MODS[k]().then(m => { panelLib[k] = m; }, e => console.error(e))));
}
// the FX reactor as a lesson panel: optional date chips (spec.dates) over mountFxReactor; a chip remounts the reactor at that quarter
const qLabel = d => `${d.slice(0, 4)} 年第 ${'一二三四'[+d[5] - 1]} 季度`;
function mountReactor(m, host, spec) {
  const dates = arr(spec.dates);
  host.innerHTML = (dates.length ? `<div class="ls-fxr-dates" role="group" aria-label="选一个季度">${dates.map(d => `<button type="button" class="ls-fxr-d" data-date="${esc(d)}" title="${esc(qLabel(d))}">${esc(d)}</button>`).join('')}</div>` : '') +
    '<div class="ls-fxr-box"></div>';
  const box = host.querySelector('.ls-fxr-box');
  const go = d => {
    host.querySelectorAll('.ls-fxr-d').forEach(b => b.classList.toggle('on', b.dataset.date === d));
    host.dataset.date = d;
    Promise.resolve(m.mountFxReactor(box, { iso: spec.iso || 'AUS', date: d, forces: !!spec.forces, hl: spec.hl })).catch(e => console.error(e));
  };
  host.addEventListener('click', e => { const b = e.target.closest('.ls-fxr-d'); if (b) go(b.dataset.date); });
  go(spec.date || dates[0] || '2025Q4');
  return host;
}
function mountPanel(kind, host, spec) {
  const m = panelLib[kind];
  try {
    if (kind === 'fx') return m.mountFxPanel(host, spec);
    if (kind === 'shocks') return m.mountShockPanel(host, spec);
    if (kind === 'fxr') return mountReactor(m, host, spec);
    if (kind === 'exp') return m.mountExpPanel(host, spec);
    return m.mountInvestorPanel(host, spec);
  } catch (e) { console.error(e); return null; }
}
function dropPanel() {
  if (!pnl) return;
  const m = panelLib[pnl.kind];
  try {
    if (pnl.kind === 'fx') m.unmountFxPanel();
    else if (pnl.kind === 'shocks') m.unmountShockPanel();
    else if (pnl.kind === 'fxr') m.unmountFxReactor();
    else if (pnl.kind === 'exp') m.unmountExpPanel();
    else m.unmountInvestorPanel();
  } catch (e) { console.error(e); }
  if (pnl.where === 'diagram') { pnl.host.remove(); document.getElementById('diagram')?.classList.remove('ls-pnl-on'); }
  document.body.classList.remove('ls-panel-on');
  if (card) card.classList.remove('ls-pcard');
  pnl = null;
}
// the panel the step shows now: an open drill-down's panel, else the step's own
const curSpec = st => (st && ss.drill != null && st.drills && st.drills[ss.drill] ? st.drills[ss.drill].panel : st && st.panel);
// after every draw() (and when a render lost the diagram host): mount the step's panel into its host, or drop the one that is up
function syncPanel() {
  const st = cur && !ss.zooming ? cur.L.steps[cur.i] : null;
  const spec = curSpec(st);
  if (!spec) { dropPanel(); return; }
  const kind = panelKind(cur.L, spec), where = panelWhere(cur.L, spec), key = cur.L.id + '#' + cur.i + '#' + (ss.drill ?? '');
  if (!panelLib[kind]) return;                              // module failed to load: text only
  if (pnl && (pnl.key !== key || pnl.where !== where || !pnl.host.isConnected && where === 'diagram')) dropPanel();
  if (where === 'diagram') {
    if (pnl) return;                                        // already up: draw() never touches the diagram column
    const dia = document.getElementById('diagram'); if (!dia) return;
    const host = document.createElement('div');
    host.id = 'ls-panel'; host.className = 'ls-pnl ls-pnl-dia'; host.dataset.kind = kind; host.setAttribute('aria-label', st.title || '面板');
    dia.appendChild(host); dia.classList.add('ls-pnl-on');
    pnl = { kind, where, key, host };
    mountPanel(kind, host, spec);
  } else {
    const host = card.querySelector('.ls-pnl-card'); if (!host) return;
    pnl = { kind, where, key, host };
    card.classList.add('ls-pcard');
    mountPanel(kind, host, spec);                            // 投资者: an equal spec moves the live panel into the new host (keeps its state)
  }
  document.body.classList.add('ls-panel-on');
}

function enterStep(i) {
  leaveStep();
  const { L, pos } = cur;
  const st = L.steps[i];
  cur.i = i; ss = {}; target = null;
  // the course-v3 lessons end on a step with the 三问 ending (the big lessons on a reveal step): reaching it counts as done
  const last = i === L.steps.length - 1;
  const lastDone = last && (L.kind === 'fx' || L.kind === 'capstone' || L.kind === 'shocks' || !!st.ending);
  mark(p => { p.step[L.id] = i; if (st.type === 'recap' || st.type === 'chain' || lastDone) p.done[L.id] = true; });
  if (last) markDoneShared(L.id);                            // src/ui/progress.js: the progressive diagram learns this lesson's layer
  lessonActive(L.id);
  if ((st.type === 'recap' || st.type === 'chain') && L.role) markRoleLearned(L.role);
  // the zoom from the town to the US: animate first (names fade, 万元 -> 十亿美元), then swap the sim
  if (st.type === 'zoom' && cur.world === 'town' && pos[i].world === 'us' && P.get('end') !== '1' && P.get('nozoom') !== '1') {
    ss.zooming = true; setHl(null); draw();
    const host = document.getElementById('diagram');
    const go = () => { if (cur && cur.i === i && ss.zooming) { ss.zooming = false; host && host.classList.remove('ls-xfade'); continueEnter(i); } };
    if (typeof FLOW.zoomOut === 'function') Promise.race([FLOW.zoomOut({ ms: 1500 }), wait(2800)]).then(go, go);
    else { host && host.classList.add('ls-xfade'); wait(600).then(go); }
    return;
  }
  continueEnter(i);
}

function continueEnter(i) {
  const { L, pos } = cur;
  const st = L.steps[i];
  const town = pos[i].world === 'town';
  if (st.view) setView(st.view);                            // step field view: 'waves' | 'flow' (curves view only exists on the US history run)
  applyMap(st);                                             // step field map: { open, select?, year? } -> mw:map (world-map page); no field = main screen
  ensureWorld(pos[i].world);
  if (town) {
    busy = true;
    try { replayTown(sim(), L, i, pos); applyAll(sim(), st.do, L); } finally { busy = false; }
    ctx.refresh();
  } else seek(pos[i].from);
  ss.before = ctx.getSnap();                                // for the "之前 → 现在" readout (st.metrics)
  ss.tbl = null;
  if (!town && (st.vals || st.type === 'experiment')) { try { ss.tbl = buildTable(ctx.real(), L, st, pos[i], st.slider ? st.slider.def : null); } catch (e) { ss.tbl = null; } }   // live numbers {key}
  if (ss.tbl) for (const d of arr(st.derive)) {             // step field derive:[{key, a, b, fmt}]: raw[key] = raw[a] − raw[b] (专题：预期, e.g. ▶ − ▽)
    const a = ss.tbl.raw[d.a], b = ss.tbl.raw[d.b];
    ss.tbl.raw[d.key] = typeof a === 'number' && typeof b === 'number' ? a - b : null; ss.tbl.fmt[d.key] = d.fmt;
  }
  setHl(st.hl);
  if (st.glow) setTimeout(() => { if (cur && cur.i === i) flash(st.glow, 3500); }, 450);
  if (st.strip) setTimeout(() => { if (cur && cur.i === i) pulseHeadline(false); }, 700);   // point at the 本季看点 strip
  else closeHeadline();
  const endNow = P.get('end') === '1';
  if (st.type === 'reveal') {
    ss.revealed = !st.question;
    if (st.question && P.get('ans') != null && !cur.__ans) { cur.__ans = true; ss.revealed = true; }
  }
  syncVis();
  if ((st.type === 'reveal' && ss.revealed && st.tab) || (st.tab && st.type !== 'reveal')) ctx.setTab(st.tab);
  if (st.type === 'experiment') ss.val = st.slider ? st.slider.def : +(P.get('choice') || 0);   // ?choice=1 picks option 2 (screenshots)
  if (st.type === 'try') ss.val = st.slider ? st.slider.def : +(P.get('choice') || 0);
  if (st.type === 'takeover') { ss.val = st.decision.default; beginTakeover(st); }
  if (st.type === 'predict') {
    if (P.get('ans') != null && !cur.__ans) { cur.__ans = true; answer(+P.get('ans')); return; }
  } else if (st.type === 'watch' || (st.type === 'reveal' && st.until) || (st.type === 'zoom' && pos[i].until !== pos[i].from)
    || (town && st.type === 'reveal' && pos[i].until !== pos[i].from)) {
    if (endNow) { seekEnd(pos[i].until); } else playTo(pos[i].until);
  } else if (st.type === 'experiment' && P.get('run') === '1') { runExperiment(); return; }
  else if (st.type === 'takeover' && P.get('run') === '1') { runTakeover(); return; }
  else if ((st.type === 'action' || st.type === 'valve') && P.get('do') === '1') { doTap(); return; }
  else if (st.type === 'try' && P.get('run') === '1') { runTryStep(); return; }
  draw();
}
function seekEnd(date) {                                    // silent jump (screenshots: &end=1)
  if (cur.world === 'town') { busy = true; try { while (sim().t < dateT(date) && !sim().done) sim().step(); } finally { busy = false; } ctx.refresh(); }
  else seek(date);
}
function playTo(date) {
  if (dateT(date) <= sim().t) return;
  target = dateT(date);
  if (P.get('pause') !== '1') setTimeout(() => { if (cur && target != null) ctx.setPlaying(true); }, 350);
}

/* called by the app after each render */
export function onRender() {
  if (!cur || busy) return;
  syncPad();
  applyHl();
  if (curSpec(cur.L.steps[cur.i]) && (!pnl || !pnl.host.isConnected)) syncPanel();   // a render rebuilt the diagram column: put the panel back
  const snap = ctx.getSnap();
  const dEl = card.querySelector('.ls-date');
  if (dEl) dEl.textContent = snap.date;
  if (cur.L.steps[cur.i].type === 'takeover') renderTk();
  if (target != null && snap.t >= target) {
    target = null;
    ctx.setPlaying(false);
    ss.arrived = true;
    const st = cur.L.steps[cur.i];
    if (st.type === 'experiment') showResult();
    draw();
  }
}

/* ---------- step actions ---------- */
function answer(idx) {
  const st = cur.L.steps[cur.i];
  ss.picked = idx;
  setHl(st.hl);
  playTo(cur.pos[cur.i].until);
  if (P.get('end') === '1') seekEnd(cur.pos[cur.i].until);
  draw();
}
function revealNow() {
  const st = cur.L.steps[cur.i];
  ss.revealed = true;
  syncVis();
  if (st.tab) ctx.setTab(st.tab);
  draw();
}
function expOverrides() {
  const st = cur.L.steps[cur.i];
  if (st.slider) {
    const s = st.slider;
    return { params: { [s.rule + '.' + s.key]: ss.val }, rules: {} };
  }
  const c = st.choices[ss.val];
  return { params: { ...(c.set.params || {}) }, rules: { ...(c.set.rules || {}) } };
}
function runExperiment() {
  const st = cur.L.steps[cur.i];
  ov = expOverrides();
  ss.ran = true; ss.arrived = false; ss.result = null;
  restart(cur.L, ov, st.from, st.from);
  if (P.get('end') === '1' || P.get('run') === '1') { busy = true; ffTo(sim(), st.until); busy = false; ctx.refresh(); ss.arrived = true; showResult(); }
  else playTo(st.until);
  draw();
}
function showResult() {
  const st = cur.L.steps[cur.i];
  const mine = metricsFor(cur.L, ov, st);
  const base = metricsFor(cur.L, { params: {}, rules: {} }, st);
  ss.result = st.metrics.map((m, k) => ({ label: m.label, a: fmtV(base[k], m.fmt), b: fmtV(mine[k], m.fmt) }));
  try { ss.tbl = buildTable(ctx.real(), cur.L, st, cur.pos[cur.i], st.slider ? ss.val : null); } catch (e) { /* keep the previous table */ }
}

/* ---------- town steps: action / valve (tap), try (sandbox), chain (tappable links), droplets ---------- */
const ACTION_PIPES = { loan: ['newLoans'], repay: ['principalRepay'], payInterest: ['interestPaid'], spend: ['toConsumption'], buyHouse: ['toHousing'] };
const ACTION_FLASH = { loan: { parts: ['iou'] }, repay: { parts: ['iou'] }, buyHouse: { parts: ['poolHousing'] }, spend: { parts: ['channel'] }, payInterest: { parts: ['bank'] } };
// chain term (snapshot path) -> what to light when a card line is tapped (flow.js also has its own table for the ripple)
const TERM_FLASH = {
  'rates.mortgageNew': { pipes: ['newLoans'], parts: ['bank'] }, 'rates.mortgageEff': { pipes: ['interestPaid'] }, 'rates.gov10y': { parts: ['poolBond'] },
  'assets.bond.price': { parts: ['poolBond'] }, 'assets.equity.price': { parts: ['poolEquity'] }, 'assets.housing.price': { pipes: ['toHousing'], parts: ['poolHousing'] },
  'assets.gold.price': { parts: ['poolGold'] }, 'flows.newLoans': { pipes: ['newLoans'] }, 'flows.fiscalInjection': { pipes: ['fiscalInjection'] },
  'flows.qe': { pipes: ['qe'] }, 'money.M': { parts: ['budget'] }, 'household.dsr': { parts: ['household'] }, 'household.income': { pipes: ['wages'] },
  'household.lvr': { parts: ['household'] }, 'household.savingRate': { parts: ['household'] }, 'household.consumption': { pipes: ['toConsumption'] },
  'macro.demandPressure': { parts: ['channel'] }, 'macro.unemployment': { parts: ['channel'] }, 'macro.inflation': { parts: ['channel'] },
  'macro.capacityPotential': { pipes: ['toCapex'], parts: ['capex'] }, 'firm.capex': { pipes: ['toCapex'] }, 'bank.approval': { parts: ['bank'] },
};
const diagramSvg = () => document.querySelector('#diagram svg.flow-svg') || document.querySelector('#diagram svg');

function clearDrops() {
  const svg = diagramSvg();
  if (svg) svg.querySelectorAll('g.ls-drops').forEach(n => n.remove());
  if (dropRaf) cancelAnimationFrame(dropRaf);
  dropRaf = 0;
}
let dropRaf = 0;
// a few water droplets run along the pipes (in flow direction), one pipe after the other. Falls back to a glow if the pipe is missing.
function dropPipes(keys, text) {
  clearDrops();
  const svg = diagramSvg();
  if (!svg) return false;
  const paths = keys.map(k => svg.querySelector(`[data-pipe="${k}"] path.bed`) || svg.querySelector(`[data-pipe="${k}"] path`)).filter(Boolean);
  if (!paths.length) { flash({ pipes: keys }, 2500); return false; }
  const NS = 'http://www.w3.org/2000/svg';
  const layer = document.createElementNS(NS, 'g'); layer.setAttribute('class', 'ls-drops'); svg.appendChild(layer);
  const mk = tag => { const n = document.createElementNS(NS, tag); layer.appendChild(n); return n; };
  const N = 3, SEG = 1100, GAP = 170;
  const drops = [];
  paths.forEach((p, pi) => {
    let len = 0; try { len = p.getTotalLength(); } catch (e) { /* not rendered */ }
    if (!len) return;
    for (let d = 0; d < N; d++) {
      const c = mk('circle'); c.setAttribute('r', d === 0 ? 5.5 : 4); c.setAttribute('class', 'ls-drop'); c.style.opacity = 0;
      drops.push({ c, p, len, start: pi * (SEG - 250) + d * GAP });
    }
  });
  let labEl = null;
  if (text) { labEl = mk('text'); labEl.setAttribute('class', 'ls-drop-lab'); labEl.textContent = text; labEl.style.opacity = 0; }
  const t0 = performance.now(), end = (paths.length - 1) * (SEG - 250) + (N - 1) * GAP + SEG + 400;
  const place = (d, f) => {
    const pt = d.p.getPointAtLength(d.len * f);
    let x = pt.x, y = pt.y;
    try { const m = layer.getCTM().inverse().multiply(d.p.getCTM()); const q = new DOMPoint(x, y).matrixTransform(m); x = q.x; y = q.y; } catch (e) { /* identity */ }
    return [x, y];
  };
  const tick = now => {
    const t = now - t0;
    for (const d of drops) {
      const f = (t - d.start) / SEG;
      if (f < 0 || f > 1) { d.c.style.opacity = 0; continue; }
      const [x, y] = place(d, f);
      d.c.setAttribute('cx', x.toFixed(1)); d.c.setAttribute('cy', y.toFixed(1));
      d.c.style.opacity = Math.min(1, f * 6, (1 - f) * 6);
    }
    if (labEl && drops.length) {
      const d = drops[0], f = Math.min(1, Math.max(0, (t - d.start) / SEG));
      const [x, y] = place(d, f);
      labEl.setAttribute('x', (x + 9).toFixed(1)); labEl.setAttribute('y', (y - 7).toFixed(1));
      labEl.style.opacity = f > 0 && f < 1 ? 1 : 0;
    }
    if (t < end) dropRaf = requestAnimationFrame(tick); else clearDrops();
  };
  dropRaf = requestAnimationFrame(tick);
  return true;
}

function waterLine(before, after) {
  const dM = after.money.M - before.money.M, dI = after.iou.bankTotal - before.iou.bankTotal;
  const f = x => { const a = Math.abs(x); return (Math.abs(a - Math.round(a)) < 1e-6 ? a.toFixed(0) : a.toFixed(1)); };
  if (Math.abs(dM) < 1e-6) return '总水量不变（水只是换了口袋）；欠条箱不变';
  if (dM > 0) return `泵入 +${f(dM)} → 总水量 +${f(dM)}；欠条箱 ${dI > 1e-6 ? '+' + f(dI) : '不变'}`;
  return `排出 −${f(dM)} → 总水量 −${f(dM)}；欠条箱 ${dI < -1e-6 ? '−' + f(dI) : '不变'}`;
}

function doTap() {
  const st = cur.L.steps[cur.i], s = sim();
  if (ss.done) return;
  const before = ctx.getSnap();
  const results = tapEffects(st).map(d => applyOne(s, d, cur.L));
  const bad = results.find(r => r && !r.ok);
  if (bad) { ss.err = bad.reason; draw(); return; }
  ss.err = null; ss.done = true; ss.revealed = true; ss.before = before;
  ss.results = results.filter(Boolean);
  ctx.refresh();
  const after = ctx.getSnap();
  if (st.type === 'action') {
    ss.water = waterLine(before, after);
    const act0 = tapEffects(st)[0], kind = act0 && act0.action && act0.action.type;
    const pipes = st.pipes || (kind && ACTION_PIPES[kind]) || (ss.results[0] && ss.results[0].entry && ss.results[0].entry.pipes) || [];
    const dM = after.money.M - before.money.M;
    const amt = Math.abs(dM) > 1e-6 ? (dM > 0 ? '+' : '−') + Math.abs(dM).toFixed(0) : '';
    dropPipes(pipes, st.dropLabel === undefined ? amt : st.dropLabel);
    ss.timers = [setTimeout(() => { const fl = st.flash || (kind && ACTION_FLASH[kind]); if (fl) flash(fl, 2400); }, 1700)];
  } else {
    const v = VALVES.find(x => x.id === st.valve) || { chain: [] };
    ss.chain = v.chain;
    const val = v.kind === 'toggle' ? (st.value ? '打开' : '关上') : v.unit === 'pct' ? (st.value * 100).toFixed(v.step < 0.01 ? 2 : 0) + '%' : v.unit === 'pp' ? (st.value >= 0 ? '+' : '') + (st.value * 100).toFixed(1) + 'pp' : '×' + st.value;
    ss.valveText = `把「${v.label || st.valve}」拧到 ${val}。下面是水传下去的顺序和时间：`;
    if (typeof FLOW.playValveRipple === 'function') FLOW.playValveRipple(st.valve, { stepMs: 900 });
  }
  syncVis();
  draw();
  if (dateT(cur.pos[cur.i].until) > s.t) {
    if (P.get('end') === '1') { seekEnd(cur.pos[cur.i].until); draw(); } else playTo(cur.pos[cur.i].until);
  }
}

function tryEffects(st) {
  if (st.slider) return [{ valve: st.valve, value: ss.val }];
  return arr(st.choices[ss.val].do);
}
function runTryStep() {
  const st = cur.L.steps[cur.i], i = cur.i, n = st.quarters || 6, eff = tryEffects(st);
  ss.ran = true; ss.arrived = false;
  busy = true;
  try { replayTown(sim(), cur.L, i, cur.pos); applyAll(sim(), st.do, cur.L); applyAll(sim(), eff, cur.L); } finally { busy = false; }
  ctx.refresh();
  ss.tTarget = sim().t + n;
  const mine = runTry(mkTown, cur.L, i, eff, n);
  const base = runTry(mkTown, cur.L, i, st.slider ? [] : arr(st.choices[0].do), n);
  ss.result = (st.metrics || []).map(m => ({ label: m.label, a: fmtV(aggregate(base, m.get), m.fmt), b: fmtV(aggregate(mine, m.get), m.fmt) }));
  if (P.get('end') === '1' || P.get('run') === '1') { seekEnd(ss.tTarget); ss.arrived = true; } else playTo(ss.tTarget);
  draw();
}

function linkTarget(l) {
  const t = TERM_FLASH[l.term] || {};
  return { parts: [...arr(l.part), ...(l.part ? [] : t.parts || [])], pipes: [...arr(l.pipe), ...(l.pipe ? [] : t.pipes || [])] };
}
function lightLink(l, k) {
  setHl(arr(l.hl));
  flash(linkTarget(l), 2600);
  card.querySelectorAll('[data-k]').forEach(n => n.classList.toggle('on', +n.dataset.k === k));
}
function playChain(links, from = 0) {
  (ss.timers || []).forEach(clearTimeout); ss.timers = [];
  links.forEach((l, k) => { if (k >= from) ss.timers.push(setTimeout(() => lightLink(l, k), (k - from) * 1500)); });
}

/* ---------- takeover step: user plays one role for a window ---------- */
const DEFAULT_COMPARE = {
  centralBank: [{ title: '政策利率', realKey: 'policyRate', get: 'rates.policy', fmt: 'pct' }, { title: '房价指数', realKey: 'houseIndex', get: 'assets.housing.price' }],
  bank:        [{ title: '审批倍数', get: 'bank.approval' }, { title: '新贷款（十亿美元/季）', get: 'flows.newLoans' }],
  household:   [{ title: '家庭 DSR', realKey: 'hhDsr', get: 'household.dsr', fmt: 'pct' }, { title: '房价指数', realKey: 'houseIndex', get: 'assets.housing.price' }],
  firm:        [{ title: 'Capex（十亿美元/季）', get: 'flows.toCapex' }, { title: '通胀', realKey: 'cpiYoY', get: 'macro.inflation', fmt: 'pct' }],
  government:  [{ title: '政府债务/GDP', realKey: 'govDebtGdp', get: 'gov.debtGdp', fmt: 'pct' }, { title: '失业率', realKey: 'unemployment', get: 'macro.unemployment', fmt: 'pct' }],
  investor:    [{ title: '房价指数', realKey: 'houseIndex', get: 'assets.housing.price' }, { title: '股价指数', realKey: 'equityIndex', get: 'assets.equity.price' }],
  foreign:     [{ title: '通胀', realKey: 'cpiYoY', get: 'macro.inflation', fmt: 'pct' }, { title: '名义 GDP', realKey: 'gdpNominal', get: 'macro.gdpNominal' }],
};
function beginTakeover(st) {
  const s = sim();
  ss.tkOn = false;
  try {
    if (typeof s.takeover !== 'function') return;
    s.takeover(st.role);
    if (typeof s.setDecision === 'function') s.setDecision(st.role, { [st.decision.key]: ss.val });
    ss.tkOn = true;
  } catch (e) { /* unsupported role: ignore */ }
}
function runTakeover() {
  const st = cur.L.steps[cur.i];
  ss.ran = true; ss.arrived = false;
  restart(cur.L, { params: {}, rules: {} }, st.from);
  beginTakeover(st);
  if (P.get('end') === '1' || P.get('run') === '1') { busy = true; ffTo(sim(), st.until); busy = false; ctx.refresh(); ss.arrived = true; }
  else playTo(st.until);
  draw();
}
// window metrics: model branch vs user branch over from..until
function tkMetrics(st) {
  const s = sim(), T0 = dateT(cur.pos[cur.i].from), T1 = dateT(cur.pos[cur.i].until);
  const m = s.history('model').slice(T0 + 1, T1 + 1), u = s.history('user').slice(T0 + 1, T1 + 1);
  if (!u.length) return null;
  return st.metrics.map(x => ({ label: x.label, a: fmtV(aggregate(m, x.get), x.fmt), b: fmtV(aggregate(u, x.get), x.fmt) }));
}
function tkFmt(st, v) {
  const d = st.decision, f = d.fmt || (/rate/i.test(d.key) ? 'pct2' : /mult|approval|ratio/i.test(d.key) ? 'x2' : 'num');
  return f === 'num' ? (+v).toFixed(d.step && d.step < 1 ? 2 : 0) : fmtV(v, f);
}
function renderTk() {
  const st = cur.L.steps[cur.i];
  const hosts = card.querySelectorAll('.ls-tkc');
  if (!hosts.length) return;
  const s = sim(), real = ctx.real();
  const T0 = dateT(cur.pos[cur.i].from), T1 = dateT(cur.pos[cur.i].until);
  const off = Math.max(0, T0 - 8), end = Math.min(real.dates.length, T1 + 1);
  const series = {};
  for (const k of Object.keys(real.series)) series[k] = real.series[k].slice(off, end);
  const shim = {
    sim: { t: s.t - off, history: b => s.history(b).slice(off) },
    real: { dates: real.dates.slice(off, end), series, reservedFrom: real.reservedFrom },
  };
  const specs = st.compare || DEFAULT_COMPARE[st.role] || [];
  hosts.forEach((h, k) => {
    const c = specs[k]; if (!c) return;
    compareChart(h, shim, { title: c.title, realKey: c.realKey, modelFn: x => getPath(x, c.get), fmt: c.fmt === 'pct' ? pctFmt : undefined, height: 130 });
  });
}

function onCardInput(e) {
  if (e.target.matches('[data-slider]')) {
    ss.val = parseFloat(e.target.value);
    const st = cur.L.steps[cur.i];
    const out = card.querySelector('.ls-val'); if (out) out.textContent = fmtV(ss.val, st.slider.fmt);
  } else if (e.target.matches('[data-tk]')) {
    const st = cur.L.steps[cur.i];
    ss.val = parseFloat(e.target.value);
    const out = card.querySelector('.ls-val'); if (out) out.textContent = tkFmt(st, ss.val);
    try { const s = sim(); if (ss.tkOn && typeof s.setDecision === 'function') s.setDecision(st.role, { [st.decision.key]: ss.val }); } catch (err) { /* ignore */ }
  }
}
function onCardClick(e) {
  const b = e.target.closest('[data-act]'); if (!b || !cur) return;
  const a = b.dataset.act, { L } = cur, st = L.steps[cur.i];
  if (a === 'collapse') { card.classList.toggle('collapsed'); syncPad(); }
  else if (a === 'expand') { card.classList.toggle('tall'); b.textContent = card.classList.contains('tall') ? '⤡' : '⤢'; syncPad(); }
  else if (a === 'exit') exitLesson();
  else if (a === 'menu') { openMenu(); }
  else if (a === 'prev') { if (cur.i > 0) enterStep(cur.i - 1); }
  else if (a === 'next') { if (cur.i < L.steps.length - 1) enterStep(cur.i + 1); }
  else if (a === 'pick') { if (ss.picked == null) answer(+b.dataset.i); }
  else if (a === 'reveal') revealNow();
  else if (a === 'choice') { ss.val = +b.dataset.i; draw(); }
  else if (a === 'run') runExperiment();
  else if (a === 'do') doTap();
  else if (a === 'trun') runTryStep();
  else if (a === 'link') lightLink(st.links[+b.dataset.k], +b.dataset.k);
  else if (a === 'chainplay') playChain(st.links);
  else if (a === 'rip') { const l = (ss.chain || [])[+b.dataset.k]; if (l) { flash(TERM_FLASH[l.term] || {}, 2400); card.querySelectorAll('[data-act=rip]').forEach(n => n.classList.toggle('on', n === b)); } }
  else if (a === 'tkrun') runTakeover();
  else if (a === 'play') { if (ctx.isPlaying()) ctx.setPlaying(false); else { if (target == null) { target = dateT(cur.pos[cur.i].until); } ctx.setPlaying(true); } draw(); }
  else if (a === 'replay') { const i = cur.i, keep = ss.revealed; enterStep(i); if (keep && !ss.revealed) revealNow(); }
  else if (a === 'nextlesson') { const n = lookup(st.next); if (isAvail(n)) startLesson(n.id, 0); else { exitLesson(); openMenu(); } }
  else if (a === 'drill') {                                  // open / close a drill-down (its panel replaces the step's panel over the diagram)
    const k = +b.dataset.k;
    ss.drill = k >= 0 && st.drills && st.drills[k] && ss.drill !== k ? k : null;
    if (st.drills) dropPanel();
    draw();
    const nb = card.querySelector('.ls-body'), dt = nb && nb.querySelector(ss.drill != null ? '.ls-drill-txt' : '.ls-drills');
    if (dt) dt.scrollIntoView({ block: 'nearest' });
  }
}

/* ---------- card rendering ---------- */
function chips(ids) {
  const list = (ids || []).filter(id => CONC[id]);
  if (!list.length) return '';
  return `<div class="ls-read"><span>看概念卡</span>${list.map(id => `<button type="button" class="term" data-term="${esc(id)}">${esc(CONC[id].name)}</button>`).join(' ')}</div>`;
}
const SRC_LABEL = [[/BIS/, 'BIS'], [/Case-Shiller/, 'Case-Shiller'], [/Freddie/, 'Freddie Mac'], [/Shiller/, 'Shiller'], [/gold/i, '公开金价'], [/FRED|FEDFUNDS|DGS10|CPI|UNRATE|GDP|TOTBKCR|DCOIL|GFDEGDQ/, 'FRED']];
const REAL_SERIES = [['policyRate', '政策利率'], ['mortgageRate', '房贷利率'], ['cpiYoY', '通胀'], ['unemployment', '失业率'], ['houseIndex', '房价指数'], ['hhDsr', '家庭 DSR'], ['gdpNominal', '名义 GDP']];
function sourcesBlock() {
  const meta = ctx.real()?.meta?.sources || {};
  const rows = REAL_SERIES.map(([k, name]) => {
    const t = meta[k] || '';
    const lab = (SRC_LABEL.find(([re]) => re.test(t)) || [0, '公开数据'])[1];
    return `<span class="ls-src"><b>${esc(name)}</b> ${esc(lab)}</span>`;
  }).join('');
  const sw = (dash, w) => `<svg width="30" height="8" aria-hidden="true"><line x1="1" x2="29" y1="4" y2="4" stroke="currentColor" stroke-width="${w}" stroke-dasharray="${dash}"/></svg>`;
  return `<div class="ls-tbl"><div class="ls-tblh">真实数据（来自哪里）</div><div class="ls-srcs">${rows}</div>` +
    `<div class="ls-tblh">模型算出来的</div><div class="ls-srcs"><span class="ls-src">新贷款、还本、付息等各条水管</span><span class="ls-src">模型房价、审批倍数、各角色的行动</span></div>` +
    `<div class="ls-tblh">图表怎么区分</div><div class="ls-legend"><span>${sw('', 1.8)} 实线 = 真实</span><span>${sw('6 3', 1.8)} 虚线 = 模型</span><span>${sw('1.5 3', 2.2)} 点线 = 你的版本</span><span class="ls-grey">灰色区 = 2022 后·保留样本·示意</span></div></div>`;
}

// 「下一课」 button (primary, pulled into the nav bar by draw). A lesson of the 选学 group says so.
function nextLessonBtn(next) {
  const nx = lookup(next);
  if (!isAvail(nx)) return `<button type="button" class="btn primary ls-run" data-act="nextlesson">回到课程菜单</button>`;
  const adv = (COURSE.advanced || []).some(k => String(k) === String(nx.id));
  return `<button type="button" class="btn primary ls-run" data-act="nextlesson">${adv ? '选学' : '下一课'}：${esc(nx.title)} →</button>`;
}

// course v3: the fixed 三问 ending of every lesson (last step field ending:{q1,q2,q3}; each string starts with its question, which the block
// prints itself). {placeholders} are filled from the step's live table, like the step text.
export const END_QUESTIONS = ['水的问题还是河道的问题？', '环上哪一步？', '谁赢谁输、钱放哪？'];
function endingHtml(e) {
  const raw = [e.q1, e.q2, e.q3];
  const filled = ss.tbl ? fillStep({ text: raw }, ss.tbl).text : raw;
  return `<section class="ls-end" aria-label="三问"><div class="ls-end-h"><b>三问</b><small>每课都用这三问收尾；历史盲测的卡也问这三个</small></div><ol>` +
    filled.map((s, k) => {
      const q = END_QUESTIONS[k], a = String(s ?? '').startsWith(q) ? String(s).slice(q.length) : String(s ?? '');
      return `<li><i>${'①②③'[k]}</i><div><b>${esc(q)}</b><span>${rich(a)}</span></div></li>`;
    }).join('') + '</ol></section>';
}
// step field drills:[{ label, panel, text, back? }]: optional drill-down buttons; an open drill shows its text (and its panel over the diagram)
function drillsHtml(st) {
  const ds = arr(st.drills);
  if (!ds.length) return '';
  const d = ss.drill != null ? ds[ss.drill] : null;
  if (d) {
    const back = d.back || (st.panel && st.panel.id === 'fx-reactor' ? '回到汇率闸' : '回到上一张图');
    const others = st.drillCta ? '' : ds.map((x, k) => (k === ss.drill ? '' : `<button type="button" class="ls-drill" data-act="drill" data-k="${k}">${esc(x.label)} ›</button>`)).join('');
    return `<div class="ls-drill-txt"><div class="ls-drill-h"><b>${esc(d.label)}</b></div>${arr(d.text).map(t => `<p>${rich(t)}</p>`).join('')}</div>` +
      `<button type="button" class="btn ${st.drillCta ? 'primary ls-run' : 'ls-drill-back'}" data-act="drill" data-k="-1">‹ ${esc(back)}</button>` +
      (others ? `<div class="ls-drills"><span>再看一股</span>${others}</div>` : '');
  }
  if (st.drillCta) return `<button type="button" class="btn primary ls-run" data-act="drill" data-k="0">${esc(ds[0].label)} →</button>`;
  return `<div class="ls-drills"><span>看证据（可选）</span>${ds.map((x, k) => `<button type="button" class="ls-drill" data-act="drill" data-k="${k}">${esc(x.label)} ›</button>`).join('')}</div>`;
}

function draw() {
  if (!cur) return;
  const { L, i, pos } = cur, n = L.steps.length;
  const st = fillStep(L.steps[i], ss.tbl);                   // {key} placeholders -> live numbers
  const snap = ctx.getSnap();
  const dots = L.steps.map((_, k) => `<i class="${k === i ? 'on' : k < i ? 'done' : ''}"></i>`).join('');
  let body = `<h3 class="ls-stitle">${esc(st.title || '')}</h3>`;
  const drillOpen = ss.drill != null && !!(st.drills && st.drills[ss.drill]);
  const roles = !ss.zooming && !drillOpen ? stepRoles(st) : [];
  const lead = roles.length && st.type === 'reveal' && !st.question;   // a role step: its bold conclusion first, then the role card(s), then the rest
  const paras = arr(st.text).slice(lead ? 1 : 0).map(t => `<p>${rich(t)}</p>`).join('');
  const playLine = () => {
    const playing = ctx.isPlaying();
    return `<div class="ls-status">${ss.arrived || snap.t >= dateT(pos[i].until) ? `已播放到 ${lab(pos[i].until)}` : `${playing ? '播放中' : '已暂停'} → ${lab(pos[i].until)}`}` +
      `<span class="ls-mini"><button type="button" class="btn" data-act="play">${playing ? '⏸ 暂停' : '▶ 播放'}</button><button type="button" class="btn" data-act="replay">↺ 重播</button></span></div>`;
  };
  let canNext = i < n - 1;
  if (lead) body += `<p>${rich(arr(st.text)[0])}</p>`;
  for (const r of roles) { try { body += `<div class="ls-rc">${roleCardHtml(r)}</div>`; } catch (e) { /* roles module missing: text only */ } }
  if (drillOpen) {                                           // a drill-down is open: its text replaces the step's text until 「回到」
    body += drillsHtml(st);
  } else if (st.type === 'zoom' && ss.zooming) {             // the live numbers are not filled yet while the zoom animates
    body += `<p class="ls-status">放大看……小镇的名字淡出，万元换成十亿美元。</p>`;
  } else if (st.type === 'intro') {
    body += paras + chips(st.concept);
  } else if (st.type === 'watch') {
    body += paras + chips(st.concept) + readout(st, snap) + (st.block ? blockHtml(st.block, snap) : '') + playLine();
  } else if (st.type === 'reveal') {
    body += paras;
    if (st.question) body += `<p class="ls-q">${rich(st.question)}</p>`;
    if (st.question && !ss.revealed) {
      body += `<button type="button" class="btn primary ls-run" data-act="reveal">想好了，揭晓</button>`;
    } else {
      if (st.answerHint) body += `<div class="ls-explain"><b class="g">答案</b> ${arr(st.answerHint).map(t => rich(t)).join(' ')}</div>`;
      if (st.relation) body += `<p class="ls-insight"><b>和前面的关系</b>　${arr(st.relation).map(t => rich(t)).join(' ')}</p>`;
      if (st.block === 'sources') body += sourcesBlock();
      if (st.block) body += blockHtml(st.block, snap);
      if (st.tryIt) body += `<p class="ls-try"><b>试一试</b>　${rich(st.tryIt)}</p>`;
      body += chips(st.concept);
    }
    if (pos[i].until !== pos[i].from) body += readout(st, snap) + playLine();
  } else if (st.type === 'action' || st.type === 'valve') {
    const r = tapBody(st, snap, paras, playLine);
    body += r.html; canNext = canNext && r.canNext;
  } else if (st.type === 'try') {
    body += paras;
    if (st.slider) {
      const s = st.slider;
      body += `<div class="ls-ctl"><label>${esc(s.label)} <b class="ls-val">${fmtV(ss.val, s.fmt)}</b></label>` +
        `<input type="range" data-slider min="${s.min}" max="${s.max}" step="${s.step}" value="${ss.val}"><div class="ls-range"><span>${fmtV(s.min, s.fmt)}</span><span>${s.def != null && s.baseText ? esc(s.baseText) : ''}</span><span>${fmtV(s.max, s.fmt)}</span></div></div>`;
    } else {
      body += '<div class="ls-opts">' + st.choices.map((c, k) => `<button type="button" class="ls-opt${ss.val === k ? ' sel' : ''}" data-act="choice" data-i="${k}">${esc(c.label)}${k === 0 ? ' <small>（对照）</small>' : ''}</button>`).join('') + '</div>';
    }
    body += `<button type="button" class="btn primary ls-run" data-act="trun">${ss.ran ? '↺ 再跑一次' : `▶ 跑 ${st.quarters || 6} 季看看`}</button>`;
    if (ss.ran && !(ss.arrived || snap.t >= (ss.tTarget ?? 1e9))) body += `<div class="ls-status">播放中…</div>`;
    if (ss.result && (ss.arrived || snap.t >= (ss.tTarget ?? 1e9))) {
      body += `<table class="tbl ls-res"><tr><th></th><th>${esc(st.baseLabel || '不拧（按规则）')}</th><th>你的设置</th></tr>` +
        ss.result.map(r => `<tr><td>${esc(r.label)}</td><td>${r.a}</td><td><b>${r.b}</b></td></tr>`).join('') + '</table>' +
        (st.insight ? `<p class="ls-insight">${rich(st.insight)}</p>` : '');
    }
  } else if (st.type === 'chain') {
    body += paras;
    body += `<ol class="ls-chain">${st.links.map((l, k) => `<li><button type="button" class="ls-link" data-act="link" data-k="${k}"><i>${k + 1}</i><span>${rich(l.text).replace(/<\/?button[^>]*>/g, '')}</span></button></li>`).join('')}</ol>` +
      `<div class="ls-chain-hint">点任何一环，图里对应的水管就会亮。<button type="button" class="btn" data-act="chainplay">▶ 依次点亮</button></div>`;
    if (st.next) { const nx = lookup(st.next); body += `<button type="button" class="btn primary ls-run" data-act="nextlesson">${isAvail(nx) ? `下一课：${esc(nx.title)} →` : '回到课程菜单'}</button>`; }
    else if (L.id === 7) body += `<button type="button" class="btn primary ls-run" data-act="nextlesson">回到课程菜单</button>`;
  } else if (st.type === 'zoom') {
    body += paras;
    if (ss.zooming) body += `<p class="ls-status">放大看……小镇的名字淡出，万元换成十亿美元。</p>`;
    else {
      if (st.question && !ss.revealed) body += `<p class="ls-q">${rich(st.question)}</p>`;
      if (st.block === 'sources') body += sourcesBlock();
      if (pos[i].until !== pos[i].from) body += playLine();
      if (st.relation) body += `<p class="ls-insight"><b>和前面的关系</b>　${arr(st.relation).map(t => rich(t)).join(' ')}</p>`;
      body += chips(st.concept);
      if (st.next) { const nx = lookup(st.next); body += `<button type="button" class="btn primary ls-run" data-act="nextlesson">${isAvail(nx) ? `下一课：${esc(nx.title)} →` : '回到课程菜单'}</button>`; }
    }
  } else if (st.type === 'takeover') {
    const d = st.decision;
    body += paras +
      `<div class="ls-ctl"><label>${esc(d.label || '你的决定')} <b class="ls-val">${tkFmt(st, ss.val)}</b></label>` +
      `<input type="range" data-tk min="${d.min}" max="${d.max}" step="${d.step}" value="${ss.val}"><div class="ls-range"><span>${tkFmt(st, d.min)}</span><span>默认 ${tkFmt(st, d.default)}</span><span>${tkFmt(st, d.max)}</span></div></div>` +
      `<button type="button" class="btn primary ls-run" data-act="tkrun">${ss.ran ? '↺ 再跑一次' : `▶ 用我的决定跑 ${pos[i].from} → ${lab(pos[i].until)}`}</button>` +
      (ss.ran ? `<div class="ls-status">${ss.arrived || snap.t >= dateT(pos[i].until) ? `已播放到 ${lab(pos[i].until)}` : `播放中 → ${lab(pos[i].until)}`}</div>` : '') +
      `<div class="ls-tkcs">${(st.compare || DEFAULT_COMPARE[st.role] || []).map(() => '<div class="ls-tkc"></div>').join('')}</div>`;
    if (ss.ran && (ss.arrived || snap.t >= dateT(pos[i].until)) && st.metrics) {
      const rows = tkMetrics(st);
      if (rows) body += `<table class="tbl ls-res"><tr><th></th><th>模型（按规则）</th><th>你的版本</th></tr>` +
        rows.map(r => `<tr><td>${esc(r.label)}</td><td>${r.a}</td><td><b>${r.b}</b></td></tr>`).join('') + '</table>' +
        (st.insight ? `<p class="ls-insight">${rich(st.insight)}</p>` : '');
    }
  } else if (st.type === 'predict') {
    body += `<p class="ls-q">${rich(st.q)}</p><div class="ls-opts">` +
      st.options.map((o, k) => {
        const cls = ss.picked == null ? '' : o.ok ? ' ok' : k === ss.picked ? ' bad' : ' dim';
        const mk = ss.picked == null ? '' : o.ok ? '<em>✓</em>' : k === ss.picked ? '<em>✗</em>' : '';
        return `<button type="button" class="ls-opt${cls}" data-act="pick" data-i="${k}" ${ss.picked != null ? 'disabled' : ''}>${esc(o.t)}${mk}</button>`;
      }).join('') + '</div>';
    if (ss.picked != null) {
      body += `<div class="ls-explain">${st.options[ss.picked].ok ? '<b class="g">猜对了。</b>' : '<b class="r">差一点。</b>'}${st.explain.map(t => `<p>${rich(t)}</p>`).join('')}</div>` + readout(st, snap) + (st.block ? blockHtml(st.block, snap) : '') +
        (pos[i].until === pos[i].from ? '' : `<div class="ls-status">${snap.t >= dateT(pos[i].until) ? `已播放到 ${lab(pos[i].until)}` : `${ctx.isPlaying() ? '播放中' : '已暂停'} → ${lab(pos[i].until)}，看结果`}</div>`);
    } else canNext = false;
  } else if (st.type === 'experiment') {
    body += paras;
    if (st.slider) {
      const s = st.slider;
      body += `<div class="ls-ctl"><label>${esc(s.label)} <b class="ls-val">${fmtV(ss.val, s.fmt)}</b></label>` +
        `<input type="range" data-slider min="${s.min}" max="${s.max}" step="${s.step}" value="${ss.val}"><div class="ls-range"><span>${fmtV(s.min, s.fmt)}</span><span>默认 ${fmtV(s.def, s.fmt)}</span><span>${fmtV(s.max, s.fmt)}</span></div></div>`;
    } else {
      body += '<div class="ls-opts">' + st.choices.map((c, k) => `<button type="button" class="ls-opt${ss.val === k ? ' sel' : ''}" data-act="choice" data-i="${k}">${esc(c.label)}${k === 0 ? ' <small>（默认）</small>' : ''}</button>`).join('') + '</div>';
    }
    body += `<button type="button" class="btn primary ls-run" data-act="run">${ss.ran ? '↺ 再跑一次' : '▶ 用这个设置重跑'}</button>`;
    if (ss.ran && !ss.result) body += `<div class="ls-status">播放中 → ${lab(pos[i].until)}</div>`;
    if (ss.result) {
      if (st.compareAll && ss.tbl && st.metrics.every(m => m.key)) {
        body += `<table class="tbl ls-res ls-all"><tr><th></th>${st.choices.map((c, k) => `<th class="${k === ss.val ? 'me' : ''}">${esc(c.short || c.label)}</th>`).join('')}</tr>` +
          st.metrics.map(m => `<tr><td>${esc(m.label)}</td>${st.choices.map((c, k) => `<td class="${k === ss.val ? 'me' : ''}">${k === ss.val ? '<b>' : ''}${fmtV(ss.tbl.raw[m.key + '.' + k], m.fmt)}${k === ss.val ? '</b>' : ''}</td>`).join('')}</tr>`).join('') + '</table>';
      } else {
        body += `<table class="tbl ls-res"><tr><th></th><th>默认</th><th>你的设置</th></tr>` +
          ss.result.map(r => `<tr><td>${esc(r.label)}</td><td>${r.a}</td><td><b>${r.b}</b></td></tr>`).join('') + '</table>';
      }
      body += arr(st.insight).map(t => `<p class="ls-insight">${rich(t)}</p>`).join('');
    }
  } else if (st.type === 'recap') {
    body += `<ol class="ls-lines">${arr(st.lines).map(t => `<li>${rich(t)}</li>`).join('')}</ol>` + chips(st.concepts);
    const nx = lookup(st.next);
    body += `<button type="button" class="btn primary ls-run" data-act="nextlesson">${isAvail(nx) ? `下一课：${esc(nx.title)} →` : '回到课程菜单'}</button>`;
  }
  // the step's question (if any) is answered: drill-downs, the 三问 ending and the 下一课 button may show
  const answered = !ss.zooming && !(st.type === 'reveal' && st.question && !ss.revealed) && !(st.type === 'predict' && ss.picked == null)
    && !((st.type === 'action' || st.type === 'valve') && !ss.done);
  if (!drillOpen && answered && st.drills) body += drillsHtml(st);
  if (!drillOpen && answered && i === n - 1 && st.ending) body += endingHtml(st.ending);   // course v3: the fixed 三问 block
  // handover: the LAST step of any other type with `next` gets the 下一课 button too (main line), once its question is answered
  if (i === n - 1 && st.next != null && !['chain', 'zoom', 'recap'].includes(st.type) && answered && !drillOpen) body += nextLessonBtn(st.next);
  if (st.freeLink) body += `<a class="btn ls-freebtn" href="${esc(freeUrl())}" target="_blank" rel="noopener">打开沙盒 ↗（新窗口，自己拧阀门）</a>`;
  if (st.lessonLink && !drillOpen) {                         // step field lessonLink:{ id, step?, label }: a pointer to another lesson (opens ?lesson=id&step=N)
    const ll = st.lessonLink, u = new URL(location.href);
    ['country', 'lesson', 'step', 'map', 'view', 'menu'].forEach(k => u.searchParams.delete(k));
    u.searchParams.set('lesson', String(ll.id)); if (ll.step) u.searchParams.set('step', String(ll.step));
    body += `<a class="btn ls-freebtn ls-lessonlink" href="${esc(u.href)}">${esc(ll.label)}</a>`;
  }
  const pSpec = curSpec(st);
  const pCard = pSpec && !ss.zooming && panelWhere(L, pSpec) === 'card';
  if (pCard) body += '<div class="ls-pnl ls-pnl-card"></div>';        // host of a card panel (filled by syncPanel below)
  if (pnl && pnl.where === 'card' && pnl.kind === 'fx') dropPanel();   // an FX panel cannot be moved: unmount before the host is rebuilt
  // the primary button (揭晓 / 做做看 / 拧一拧 / 跑 N 季 / 下一课) is pulled out of the scrolling body so it is always visible
  let cta = '';
  { const m = body.match(/<button type="button" class="btn primary ls-run"[^>]*>[\s\S]*?<\/button>/); if (m) { body = body.replace(m[0], ''); cta = m[0]; } }
  const oldBody = card.querySelector('.ls-body');
  const keepTop = oldBody && card.dataset.step === String(i) && card.dataset.lesson === String(L.id) ? oldBody.scrollTop : 0;
  card.dataset.step = String(i); card.dataset.lesson = String(L.id);
  card.innerHTML =
    `<div class="ls-top"><button type="button" class="ls-col" data-act="collapse" aria-label="折叠/展开">${card.classList.contains('collapsed') ? '▴' : '▾'}</button>` +
    `<button type="button" class="ls-ttl" data-act="menu">${L.label && String(L.title).startsWith(L.label) ? esc(L.title) : `${esc(lessonLabel(L))} · ${esc(L.title)}`}</button><span class="ls-date">${snap.date}</span>` +
    `<button type="button" class="ls-exp" data-act="expand" aria-label="放大/缩小教学卡">${card.classList.contains('tall') ? '⤡' : '⤢'}</button>` +
    `<a class="ls-free" href="${esc(freeUrl())}" target="_blank" rel="noopener">↗ 沙盒</a>` +
    `<button type="button" class="ls-exit" data-act="exit">退出教学</button></div>` +
    `<div class="ls-body">${body}</div>` +
    `<div class="ls-nav"><button type="button" class="btn" data-act="prev" ${i === 0 ? 'disabled' : ''}>‹ 上一步</button>` +
    (cta || `<span class="ls-dots" aria-label="第 ${i + 1}/${n} 步">${dots}</span>`) +
    `<button type="button" class="btn primary" data-act="next" ${canNext ? '' : 'disabled'}>下一步 ›</button></div>`;
  syncPanel();                                               // step field panel: mount / re-attach / drop (before restoring the scroll position)
  const nb = card.querySelector('.ls-body'); if (nb && keepTop) nb.scrollTop = keepTop;
  if (nb && (st.type === 'try' || st.type === 'experiment' || st.type === 'takeover') && (ss.result || ss.arrived)) { const tb = nb.querySelector('.ls-res'); if (tb) tb.scrollIntoView({ block: 'nearest' }); }
  if (st.type === 'takeover') renderTk();
  syncPad(); requestAnimationFrame(syncPad);
}

// small live tables used by reveal steps (st.block)
const n1 = x => (+x).toFixed(1);
function blockHtml(name, snap) {
  if (name === 'households' && snap.town) {
    const T = snap.town;
    return `<table class="tbl ls-res ls-ro"><tr><th>谁</th><th>存款</th><th>欠条</th><th>房子</th></tr>${T.households.map(h => `<tr><td>${esc(h.name)}</td><td>${n1(h.deposit)}</td><td>${n1(h.debt)}</td><td>${h.houses} 套</td></tr>`).join('')}` +
      `<tr><td>${esc(T.shop.name)}</td><td>${n1(T.shop.deposit)}</td><td>${n1(T.shop.debt)}</td><td>—</td></tr></table><p class="ls-note">单位：万元。几户的存款加上小卖部和银行口袋，就是小镇总水量 ${n1(snap.money.M)}。</p>`;
  }
  if (name === 'budget') {
    const b = snap.budget, u = snap.scenario === 'town' ? '万元' : '十亿美元';
    if (!b) return '';
    const P = b.pumpedIn, D = b.drainedOut, net = b.net;
    return `<div class="ls-bud"><div><b>泵入</b> 放贷 ${n1(P.loans)} + QE ${n1(P.qe)} + 赤字 ${n1(P.deficit)} = ${n1(P.loans + P.qe + P.deficit)}</div>` +
      `<div><b>排出</b> 还本 ${n1(D.repay)} + 盈余 ${n1(D.surplus)} + QT ${n1(D.qt)} = ${n1(D.repay + D.surplus + D.qt)}</div>` +
      `<div class="net">本季总水量变化 = <b>${net >= 0 ? '+' : '−'}${n1(Math.abs(net))}</b> ${u}　（${n1(b.M_before)} → ${n1(b.M_after)}）</div></div>`;
  }
  if (name.startsWith('ripple:')) {
    const v = VALVES.find(x => x.id === name.slice(7)); if (!v) return '';
    ss.chain = v.chain;
    return `<div class="ls-note">${esc(v.label)}（${esc(v.chainWhen || '')}）：水按这个顺序往下传，每一环标着要等多久。点一环，图里对应处会亮。</div><ol class="ls-rip">${v.chain.map((l, k) => `<li><button type="button" data-act="rip" data-k="${k}"><i class="dl">${esc(l.delayLabel)}</i><span>${esc(l.text)}</span></button></li>`).join('')}</ol>`;
  }
  if (name === 'alloc') {
    const f = snap.flows || {}, tot = (f.toHousing || 0) + (f.toEquity || 0) + (f.toBond || 0) + (f.toGold || 0) + (f.toCash || 0);
    if (tot < 1e-6) return '<p class="ls-note">（这一季还没有新增资金流动，播放一两个季度就有了。）</p>';
    const sh = [['房产', f.toHousing], ['股票', f.toEquity], ['国债', f.toBond], ['黄金', f.toGold], ['现金', f.toCash]];
    return `<div class="ls-alloc"><div class="ls-note">本季新增资金的去向（占比）</div><div class="ls-srcs">${sh.map(([n, v]) => `<span class="ls-src"><b>${n}</b> ${(100 * (v || 0) / tot).toFixed(0)}%</span>`).join('')}</div></div>`;
  }
  if (name === 'b2cases') {
    // 负资产 ≠ B2 (course L4): four real cases (history, not the model), then the four questions in order
    const R = [
      ['美国 2008', '多（约四分之一房贷户）', '重伤', '推不动', '是'],
      ['日本 1990', '多（土地、股票大跌）', '重伤', '推不动', '是'],
      ['英国 1990 年代初', '多（上百万户）', '轻伤', '推得动', '不是'],
      ['澳洲 2008', '少（房价小跌）', '没伤', '推得动', '不是'],
    ];
    return `<table class="tbl ls-res ls-ro ls-b2c"><tr><th></th><th>负资产</th><th>银行</th><th>降息</th><th>B2？</th></tr>` +
      R.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td><td><b>${esc(r[4])}</b></td></tr>`).join('') + '</table>' +
      '<p class="ls-note">判断 B2，按顺序问四句。前三句回答「B2 有没有可能来」，第四句才确认：</p>' +
      '<ol class="ls-b2q"><li>借钱买的资产跌了吗？</li><li>负资产多不多？</li><li>银行伤了吗？</li><li><b>降息推不推得动？</b>（推不动，才是 B2）</li></ol>';
  }
  if (name === 'valves') {
    const li = a => a.map(x => `<li>${esc(x)}</li>`).join('');
    return `<div class="ls-two"><div><h4>能拧的：阀门</h4><ul>${li(VALVES.map(v => v.label.replace(/^.*：/, '') + '（' + (v.label.split('：')[0]) + '）'))}</ul></div>` +
      `<div><h4>只能看的：水位</h4><ul>${li(['房价（房产水位）', '股价（股票水位）', '国债价格', '金价', '物价（商品河道水位）', '失业率', '房贷利率（平均）'])}</ul></div></div>`;
  }
  return '';
}

// before -> now table for the numbers a step is about (st.metrics: [{label, get:'path', fmt}])
function readout(st, snap) {
  if (!st.metrics || !ss.before || st.type === 'try' || st.type === 'takeover' || st.type === 'experiment') return '';
  const rows = st.metrics.map(m => `<tr><td>${esc(m.label)}</td><td>${fmtV(getPath(ss.before, m.get), m.fmt)}</td><td><b>${fmtV(getPath(snap, m.get), m.fmt)}</b></td></tr>`).join('');
  return `<table class="tbl ls-res ls-ro"><tr><th></th><th>${esc(ss.beforeLabel || '之前')}</th><th>现在</th></tr>${rows}</table>`;
}
const rippleLabel = l => (sim().scenario === 'town' && !sim().delays ? l.delayLabelTown : l.delayLabel);
function tapBody(st, snap, paras, playLine) {
  let html = paras, canNext = true;
  if (st.question) html += `<p class="ls-q">${rich(st.question)}</p>`;
  if (!ss.done) {
    html += `<button type="button" class="btn primary ls-run" data-act="do">${esc(st.button || (st.type === 'valve' ? '拧一拧' : '做做看'))}</button>`;
    if (ss.err) html += `<div class="ls-explain"><b class="r">做不成：</b>${esc(ss.err)}</div>`;
    return { html, canNext: false };
  }
  if (st.type === 'action') {
    html += `<div class="ls-explain"><b class="g">流水账</b> ${ss.results.map(r => esc(r.entry ? r.entry.action : '')).join('；')}</div>` +
      `<div class="ls-water">${esc(ss.water)}</div>`;
  } else {
    html += `<div class="ls-explain"><b class="g">已拧</b> ${esc(st.valveText || '')}</div>` +
      `<ol class="ls-rip">${(ss.chain || []).map((l, k) => `<li><button type="button" data-act="rip" data-k="${k}"><i class="dl">${esc(rippleLabel(l))}</i><span>${esc(l.text)}</span></button></li>`).join('')}</ol>`;
  }
  if (st.answerHint) html += `<div class="ls-explain"><b class="g">答案</b> ${arr(st.answerHint).map(t => rich(t)).join(' ')}</div>`;
  html += readout(st, snap) + (st.block ? blockHtml(st.block, snap) : '');
  if (st.relation) html += `<p class="ls-insight"><b>和前面的关系</b>　${arr(st.relation).map(t => rich(t)).join(' ')}</p>`;
  html += chips(st.concept);
  if (dateT(cur.pos[cur.i].until) > dateT(cur.pos[cur.i].from)) html += playLine();
  return { html, canNext };
}

/* ---------- entry ---------- */
export function initLessons(c) {
  ctx = c;
  ensureDom();
  loadRoles();
  if (P.has('lesson')) {
    const raw = P.get('lesson');
    startLesson(/^\d+$/.test(raw) ? +raw : raw, parseInt(P.get('step') || '0', 10));
  }
  if (P.get('menu') === '1') openMenu();                 // screenshot helpers: ?menu=1, &term=dsr
  if (P.get('term')) setTimeout(() => ctx.openTerm(P.get('term')), 300);
}
