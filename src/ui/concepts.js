// Concept cards: bottom sheet (phone) / side card (wide). CONTRACT §5.
import { CONCEPTS, KEYWORDS, MNEMONIC, makeCtx as mkCtx } from '../data/concepts.js';
import { showConcept, clearConcept, flashConcept, unflashConcept, conceptNote } from './links.js';   // diagram highlight while a card is open
import { currentSim } from './flow.js';       // the sim that is on screen (US or town), for 'N quarters ago' lookups
import { chainHtml, highlightTargets, pushBadges, playScript, checkPlan, cachedCheck, runCheckAsync, stepStatus, chipName } from './causal-view.js';   // 传导链 block (pure)
import { currentCountry, fmtBnShort, localizeText } from './country-info.js';
import * as overlay from './causal-overlay.js';                // arrow badges + ▶ playback on the diagram
import { roleCard, roleOfConcept, ROLE_KEYWORDS } from '../data/role-cards.js';   // 角色卡 (AB-CONTRACT A1)

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let opts = { getSnap: () => null, getPrev: null, sim: null };
let stack = [];
let root = null, lastDate = null, lastSnapObj = null, timer = null, navTimer = 0;
let moreOpen = null;   // the user's choice for the collapsed 公式/合理性 block (null = default: closed on phone, open on wide screens)
let gaugeMod = null;   // 水尺 (src/ui/gauge.js, written separately): loaded lazily, the card works without it
import('./gauge.js').then(m => { gaugeMod = m; refreshConcepts(); }).catch(() => { gaugeMod = null; });

// 传导链 UI state. Survives the redraw that happens every quarter; reset when the card shows another concept.
//   push  null | +1 | -1   which of ↑推高 / ↓压低 is pressed (badges on the diagram)     open  unfolded folds
//   check null | {t, scenario, mode}  用模拟核对 is on (frozen at the quarter it was pressed)   peek  phone: compact card
const cv = { id: null, push: null, open: new Set(), check: null, peek: false, status: '', token: 0, ptok: 0 };   // token: concept/check generation, ptok: ▶ generation
let cvMs = 550;        // ms per hop of the ▶ playback (?cvms= overrides, for screenshots)
let cvMotion = false;  // ?cvmotion=1 plays the animation even when the browser says prefers-reduced-motion (headless Edge does)
let cvFreeze = null;   // ?cvfreeze=N holds the playback after hop N (a mid-animation screenshot)

export function term(id, label) {
  const c = CONCEPTS[id];
  if (!c) return esc(label || id);
  return `<button type="button" class="term" data-term="${id}">${esc(label || c.name)}</button>`;
}

const KW_RE = new RegExp(KEYWORDS.map(k => k[0].replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|'), 'g');
const KW_MAP = Object.fromEntries(KEYWORDS);
/** Escape plain text and wrap known keywords as term buttons. */
export function linkify(text) {
  const t = String(text ?? '');
  let out = '', last = 0, m;
  KW_RE.lastIndex = 0;
  while ((m = KW_RE.exec(t))) {
    out += esc(t.slice(last, m.index)) + term(KW_MAP[m[0]], m[0]);
    last = m.index + m[0].length;
  }
  return out + esc(t.slice(last));
}

// role cards: the same keyword links, plus a few words that are only linked inside a card (ROLE_KEYWORDS); longest first
const RK = [...KEYWORDS, ...ROLE_KEYWORDS].sort((a, b) => b[0].length - a[0].length);
const RK_RE = new RegExp(RK.map(k => k[0].replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|'), 'g');
const RK_MAP = Object.fromEntries(RK);
function linkifyRole(text) {
  const t = String(text ?? '');
  let out = '', last = 0, m;
  RK_RE.lastIndex = 0;
  while ((m = RK_RE.exec(t))) {
    out += esc(t.slice(last, m.index)) + term(RK_MAP[m[0]], m[0]);
    last = m.index + m[0].length;
  }
  return out + esc(t.slice(last));
}

/**
 * The compact 4-line role card as HTML (a <section class="rc">), every known term a clickable concept link.
 *   role: 'centralBank' | 'bank' | 'household' | 'firm' | 'government' | 'investor' | 'foreign' | 'economy' (整个经济, the 8th card)
 *   iso : country ('USA' | 'AUS' ...), default = the country on screen. Returns '' for an unknown role.
 * Styles: assets/css/roles.css (loaded by initConcepts). Links open through the document-level [data-term] click handler of initConcepts().
 */
export function roleCardHtml(role, iso) {
  const c = roleCard(role, iso || currentCountry(opts.sim));
  if (!c) return '';
  return `<section class="rc rc-${esc(role)}" data-role="${esc(role)}" aria-label="${esc(c.title)}的角色卡">` +
    `<h3 class="rc-h"><span class="rc-mark" aria-hidden="true">${esc(c.mark)}</span><span class="rc-t">${esc(c.title)}</span>` +
    `<span class="rc-s">${esc(c.sub || '角色卡')}</span></h3>` +
    `<dl class="rc-rows">${c.rows.map(r => `<div class="rc-row"><dt>${esc(r.k)}</dt><dd>${linkifyRole(r.v)}</dd></div>`).join('')}</dl></section>`;
}
// the card that belongs on top of concept card `id` ('' when it has none; the 外国人 card only where the country has a border block)
function roleOnTop(id, snap) {
  const role = roleOfConcept(id);
  if (!role || (role === 'foreign' && !(snap && snap.border))) return '';
  return roleCardHtml(role, isoOf(snap));
}

function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
function fmtVal(v, fmt, town, iso = 'USA') {
  if (v == null || (typeof v === 'number' && !isFinite(v))) return '—';
  if (typeof v === 'string') return v;
  switch (fmt) {
    case 'pct': return (v * 100).toFixed(2) + '%';
    case 'bn': if (town) return (Math.abs(v) < 10 ? v.toFixed(1) : v.toFixed(0)) + ' 万元';
      return fmtBnShort(v, iso);      // USA: '2.10 万亿' / '620 十亿' (as before); another country adds its currency: '620 十亿澳元'
    case 'idx': return v.toFixed(1);
    default: return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
  }
}
function liveOf(c, snap) {
  if (!snap) return null;
  if (c.liveFn) return c.liveFn(snap, prevOf(snap));
  return c.live ? getPath(snap, c.live) : null;
}
// the sim that produced this snapshot (a town lesson swaps the town sim in, but initConcepts only knows the main sim)
function simOf(snap) {
  const s = currentSim() || opts.sim;
  return s && (s.scenario || 'us') === (snap?.scenario || 'us') ? s : null;
}
function prevOf(snap) {
  try {
    if (opts.getPrev) return opts.getPrev();
    const sim = simOf(snap);
    if (sim && snap && snap.t > 0) return sim.snapshot(snap.branch || 'model', snap.t - 1);
  } catch (e) { /* ignore */ }
  return null;
}
function whyHtml(c, snap) {
  let txt = '';
  try { txt = c.why ? String(c.why(snap, prevOf(snap), mkCtx(snap, simOf(snap))) || '') : ''; } catch (e) { txt = ''; }
  if (!txt) txt = '这一季还没有足够的数据来解释它。';
  txt = localizeText(txt, isoOf(snap));
  return `<div class="cc-why"><span class="cc-k">为什么现在是这个值 · ${esc(snap.date)}</span>${txt.split('\n').map(l => `<p>${esc(l)}</p>`).join('')}</div>`;
}
function logicHtml(text) {
  const lines = String(text || '').split('\n').map(l => l.replace(/^→\s*/, '')).filter(Boolean);
  if (lines.length < 2) return `<p>${esc(lines[0] || '')}</p>`;
  return `<ol class="cc-steps">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ol>`;
}
const isPhoneNow = () => { try { return matchMedia('(max-width: 767.98px)').matches; } catch (e) { return false; } };
const isTownSnap = snap => !!snap && (snap.scenario === 'town' || !!snap.town);
const isoOf = snap => (isTownSnap(snap) ? 'USA' : currentCountry(simOf(snap) || opts.sim));   // the country of the card's snapshot (the town is the USA)
// central-bank rule edges of the causal map exist only in free-run mode
function modeOf(snap) {
  const sim = simOf(snap) || opts.sim;
  return !isTownSnap(snap) && sim && sim.mode === 'free' ? 'free' : 'history';
}
function gaugeOf(id, snap) {
  if (!gaugeMod || !snap) return '';
  try { return gaugeMod.gaugeHtml ? String(gaugeMod.gaugeHtml(id, snap, simOf(snap) || opts.sim) || '') : ''; } catch (e) { return ''; }
}

/* ---------- 传导链: state, actions ---------- */
function resetChain() {
  cv.token++; cv.ptok++;
  overlay.clearAll();
  cv.push = null; cv.open = new Set(); cv.check = null; cv.status = '';
  if (root) root.classList.remove('cv-peek');
}
function checkOf(id, snap) {
  if (!cv.check) return null;
  const tok = cv.token;
  let last = null;
  // the first valve route cannot always be turned that way (the rate is already ~0): fall through to the next valve that reaches the card
  for (let alt = 0; alt < 8; alt++) {
    const plan = checkPlan(id, { mode: cv.check.mode, dir: cv.push ?? 1, alt });
    if (!plan) break;
    const p = { valveNode: plan.valveNode, valveId: plan.valveId, vdir: plan.vdir, t: cv.check.t, scenario: cv.check.scenario, mode: cv.check.mode, country: cv.check.country };
    let hit = cachedCheck(p);
    if (!hit) { runCheckAsync(p, () => { if (tok === cv.token) refreshConcepts(); }); return { pending: true }; }
    if (hit.status === 'ok') return hit;
    last = hit;
  }
  return last;
}
function startCheck(snap) {
  if (!snap) return;
  cv.check = { t: snap.t, scenario: isTownSnap(snap) ? 'town' : 'us', mode: modeOf(snap), country: isoOf(snap) };
}
function startPlay(id, snap) {
  const steps = playScript(id, { mode: modeOf(snap), dir: cv.push ?? 1 });
  if (!steps.length) return;
  const tok = ++cv.ptok;
  cv.status = '';
  overlay.play(steps, {
    stepMs: cvMs, freezeAt: cvFreeze, motion: cvMotion,
    onStep: (i, st, n) => {
      if (tok !== cv.ptok) return;
      cv.status = stepStatus(st, i, n);
      const el = root && root.querySelector('[data-cv-status]');
      if (el) el.innerHTML = cv.status;
    },
    onEnd: () => { if (tok !== cv.ptok) return; cv.status = ''; refreshConcepts(); },
  });
  draw(true);
  scrollToChain();
}
function scrollToChain(sel = '[data-cv]') {
  const body = root && root.querySelector('.cc-body'), sec = body && body.querySelector(sel);
  if (!sec) return;
  const head = body.querySelector('.cc-head');
  body.scrollTop = Math.max(0, sec.offsetTop - ((head && head.offsetHeight) || 0) - 6);
}
function chainClick(e) {
  const fold = e.target.closest('[data-cv-fold]');
  if (fold) { const k = fold.dataset.cvFold; if (cv.open.has(k)) cv.open.delete(k); else cv.open.add(k); draw(true); return true; }
  const pb = e.target.closest('[data-cv-push]');
  if (pb) {
    const d = +pb.dataset.cvPush;
    cv.push = cv.push === d ? null : d;
    if (cv.push && isPhoneNow()) cv.peek = true;   // phone: shrink the sheet so the arrows on the diagram show (多看图 / 展开卡片 still toggles)
    if (overlay.isPlaying()) { cv.ptok++; overlay.stopPlay(); cv.status = ''; }
    draw(true);
    return true;
  }
  const act = e.target.closest('[data-cv-act]');
  if (act) {
    const id = stack[stack.length - 1], snap = opts.getSnap();
    if (act.dataset.cvAct === 'play') { if (overlay.isPlaying()) { cv.ptok++; overlay.stopPlay(); cv.status = ''; draw(true); } else startPlay(id, snap); }
    else if (act.dataset.cvAct === 'check') { if (cv.check) cv.check = null; else startCheck(snap); draw(true); }
    else if (act.dataset.cvAct === 'peek') { cv.peek = !cv.peek; draw(true); }
    return true;
  }
  const x = e.target.closest('[data-xnode]');
  if (x) { flashConcept(x.dataset.xnode, 1600); return true; }
  return false;
}

function liveHtml(c) {
  const snap = opts.getSnap();
  if (!snap || (!c.live && !c.liveFn)) return '';
  const town = snap.scenario === 'town' || !!snap.town;
  const v = liveOf(c, snap);
  const p = prevOf(snap);
  const pv = p ? liveOf(c, p) : null;
  let arrow = '';
  if (typeof v === 'number' && typeof pv === 'number') {
    const d = v - pv;
    arrow = Math.abs(d) < 1e-9 ? '<span class="cc-arrow" title="与上季持平">→ 持平</span>'
      : `<span class="cc-arrow ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲ 上升' : '▼ 下降'}（上季 ${esc(fmtVal(pv, c.fmt, town, isoOf(snap)))}）</span>`;
  }
  return `<div class="cc-live"><span class="cc-live-l">${esc(snap.date)} 当前值</span><b>${esc(fmtVal(v, c.fmt, town, isoOf(snap)))}</b>${arrow}</div>`;
}

function links(label, ids, role) {
  const items = (ids || []).filter(i => CONCEPTS[i]).map(i => term(i)).join(' ');
  return items ? `<div class="cc-row cc-r-${role}"><span class="cc-k">${label}</span><div class="cc-links">${items}</div></div>` : '';
}

// "where is this on the left diagram" block: optional note (no own part) + the 3-style legend
function whereHtml(id, n) {
  const note = conceptNote(id);
  const any = n.self + n.from + n.to > 0;
  if (!note && !any) return '';
  const lg = (cls, t) => `<span class="cc-lg"><i class="cc-sw ${cls}" aria-hidden="true"></i>${t}</span>`;
  return `<div class="cc-where">` +
    (note ? `<div class="cc-note">图上没有单独的部件，它体现在 ${esc(note)}</div>` : '') +
    (any ? `<div class="cc-legend"><span class="cc-lg-k">左图：</span>${lg('self', '实线=它本身')}<b>·</b>${lg('from', '虚线=来源')}<b>·</b>${lg('to', '点线=去向')}</div>` : '') +
    `</div>`;
}

function ensure() {
  if (root) return root;
  root = document.createElement('div');
  root.id = 'concept-root';
  root.className = 'cc-root';
  root.hidden = true;
  root.innerHTML = '<div class="cc-backdrop" data-cc-close></div><aside class="cc-card" role="dialog" aria-modal="false" aria-label="概念卡片"><div class="cc-grab" aria-hidden="true"></div><div class="cc-body"></div></aside>';
  document.body.appendChild(root);
  root.addEventListener('click', e => {
    if (chainClick(e)) return;
    if (e.target.closest('[data-cc-close]')) { close(); return; }
    if (e.target.closest('[data-cc-back]')) { back(); return; }
    const crumb = e.target.closest('[data-cc-crumb]');
    if (crumb) { stack = stack.slice(0, +crumb.dataset.ccCrumb + 1); draw(); }
  });
  // remember whether the user opened / closed the 更多 block (the card is redrawn every quarter)
  root.addEventListener('toggle', e => { if (e.target && e.target.classList && e.target.classList.contains('cc-more')) moreOpen = e.target.open; }, true);
  // hovering / pressing a from/to link flashes just that target in the diagram
  // (the chips of the 传导链 block do the same, extra nodes without a card included)
  const lk = e => (e.target.closest ? e.target.closest('.cc-links .term, [data-cv-chip], .cv-chip[data-xnode]') : null);
  const lkId = b => b.dataset.term || b.dataset.xnode || b.dataset.cvChip;
  root.addEventListener('pointerover', e => { const b = lk(e); if (b) flashConcept(lkId(b), 1600); });
  root.addEventListener('pointerout', e => { const b = lk(e); if (b && !b.contains(e.relatedTarget)) unflashConcept(); });
  root.addEventListener('focusin', e => { const b = lk(e); if (b) flashConcept(lkId(b), 1600); });
  // swipe down on the grab handle / header to close
  const card = root.querySelector('.cc-card');
  let y0 = null;
  card.addEventListener('touchstart', e => {
    const body = card.querySelector('.cc-body');
    if (e.target.closest('.cc-grab, .cc-head') || body.scrollTop <= 0) y0 = e.touches[0].clientY; else y0 = null;
  }, { passive: true });
  card.addEventListener('touchmove', e => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0;
    if (dy > 0) card.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  card.addEventListener('touchend', e => {
    if (y0 == null) return;
    const dy = e.changedTouches[0].clientY - y0;
    card.style.transform = '';
    if (dy > 90) close();
    y0 = null;
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && root && !root.hidden) close(); });
  return root;
}

function draw(keep) {
  const r = ensure();
  const sc = keep ? r.querySelector('.cc-body').scrollTop : 0;
  const id = stack[stack.length - 1];
  const c = CONCEPTS[id];
  if (!c) { close(); return; }
  const crumbs = stack.length > 1
    ? `<nav class="cc-crumbs" aria-label="路径">${stack.map((s, i) => i === stack.length - 1
      ? `<span aria-current="true">${esc(CONCEPTS[s]?.name || s)}</span>`
      : `<button type="button" data-cc-crumb="${i}">${esc(CONCEPTS[s]?.name || s)}</button>`).join('<i>›</i>')}</nav>` : '';
  if (cv.id !== id) { resetChain(); cv.id = id; }
  const snap = opts.getSnap(), mode = modeOf(snap);
  const L = t => localizeText(t, isoOf(snap));      // country view: US-only words (联储, 美国 30 年固定 …) swapped for the country's
  const ht = highlightTargets(id, { mode, dir: cv.push ?? 1 });
  const hl = showConcept(id, ht.from.length || ht.to.length ? ht : undefined);     // mark SELF / FROM / TO (the main chain) in the left diagram
  const dirNow = cv.push ?? 1;
  if (cv.push != null) overlay.setBadges(pushBadges(id, { mode, dir: dirNow })); else overlay.clearBadges();
  const chain = chainHtml(id, { mode, push: cv.push, open: cv.open, playing: overlay.isPlaying(), status: cv.status, check: checkOf(id, snap), peek: cv.peek });
  r.classList.toggle('cv-peek', isPhoneNow() && (cv.peek || overlay.isPlaying()));
  r.querySelector('.cc-body').innerHTML =
    `<header class="cc-head">${stack.length > 1 ? '<button type="button" class="cc-btn" data-cc-back aria-label="返回上一张">‹ 返回</button>' : '<span></span>'}` +
    `<button type="button" class="cc-btn" data-cc-close aria-label="关闭">✕ 关闭</button></header>` +
    crumbs +
    `<h2 class="cc-title">${esc(c.name)}</h2>` +
    roleOnTop(id, snap) +
    // 是什么 -> 当前值 -> 水尺 -> 传导链 -> 为什么现在是这个值 -> 水的比喻 -> 更多
    `<p class="cc-short"><span class="cc-tag">是什么</span>${esc(L(c.short))}</p>` +
    liveHtml(c) +
    gaugeOf(id, snap) +
    chain +
    whereHtml(id, hl) +
    whyHtml(c, snap) +
    `<div class="cc-row"><span class="cc-k">水的比喻</span><p>${esc(L(c.water))}</p></div>` +
    `<details class="cc-more"${(moreOpen == null ? !isPhoneNow() : moreOpen) ? ' open' : ''}><summary>更多：受谁影响 · 公式 · 合理性</summary>` +
    links('受谁影响（来自）', c.from, 'from') + links('影响谁（流向）', c.to, 'to') +
    `<div class="cc-row"><span class="cc-k">公式</span><pre class="cc-formula">${esc(L(c.formula))}</pre></div>` +
    `<div class="cc-row"><span class="cc-k">合理性（谁做什么 → 什么流动 → 什么变化）</span>${logicHtml(L(c.logic))}</div></details>` +
    `<p class="cc-mn" style="margin:10px 0 0;font-size:12px;color:#5b6b7a">口诀：${esc(MNEMONIC)}</p>`;
  try { if (gaugeMod && gaugeMod.wireGauges) gaugeMod.wireGauges(r.querySelector('.cc-body')); } catch (e) { /* ignore */ }
  r.hidden = false;
  r.classList.add('open');
  r.querySelector('.cc-body').scrollTop = sc;
}

export function openConcept(id) {
  if (!CONCEPTS[id]) return;
  if (stack[stack.length - 1] !== id) stack.push(id);
  if (stack.length > 12) stack.shift();
  draw();
}
function back() { stack.pop(); if (stack.length) draw(); else close(); }
export function close() {
  stack = [];
  clearTimeout(navTimer); navTimer = 0;
  cv.id = null; cv.peek = false; resetChain();
  clearConcept();
  if (root) { root.classList.remove('open'); root.hidden = true; }
}
export function refreshConcepts() { if (root && !root.hidden && stack.length) draw(true); }

function ensureCss() {
  for (const f of ['panels.css', 'concept-hl.css', 'causal.css', 'roles.css']) {
    if ([...document.styleSheets].some(s => (s.href || '').split(/[?#]/)[0].endsWith('/' + f)) || document.querySelector(`link[data-css="${f}"]`)) continue;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = new URL('../../assets/css/' + f, import.meta.url).href;
    l.dataset.css = f;
    document.head.appendChild(l);
  }
}

let installed = false;
export function initConcepts({ getSnap, getPrev, sim } = {}) {
  opts = { getSnap: getSnap || (() => null), getPrev: getPrev || null, sim: sim || null };
  ensureCss();
  if (installed) return;
  installed = true;
  document.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('[data-term]');
    if (!el) return;
    if (el.closest('.cc-root')) {
      e.preventDefault();
      const id = el.dataset.term;
      // a from/to link: flash its target in the diagram first, then navigate
      if (el.closest('.cc-links, .cv-chip') && flashConcept(id, 700) > 0) {   // (reduced motion: the flash is static emphasis, CSS drops the pulse)
        clearTimeout(navTimer);
        navTimer = setTimeout(() => { navTimer = 0; openConcept(id); }, 380);
        return;
      }
      openConcept(id); return;
    }
    e.preventDefault();
    openConcept(el.dataset.term);
  });
  // screenshot helper: ?term=<concept id> opens that card after boot (lessons.js does the same via openTerm; opening the same card twice is a no-op)
  // &push=up|down shows the arrow badges, &chainplay=1 starts ▶ (&cvms=<ms per hop>, &cvfreeze=<hop> stops after that hop), &simcheck=1 runs 用模拟核对
  try {
    const q = new URLSearchParams(location.search), qt = q.get('term');
    if (+q.get('cvms') > 0) cvMs = +q.get('cvms');
    cvMotion = q.get('cvmotion') === '1';
    if (q.get('cvfreeze') != null) cvFreeze = +q.get('cvfreeze');
    if (qt) setTimeout(() => {
      openConcept(qt);
      const snap = opts.getSnap();
      if (q.get('push') === 'up') cv.push = 1; else if (q.get('push') === 'down') cv.push = -1;
      if (q.get('simcheck') === '1') startCheck(snap);
      if (q.get('peek') === '1') cv.peek = true;
      draw(true);
      if (q.get('scroll') === 'chain') scrollToChain();   // &scroll=check scrolls to the 用模拟核对 block (screenshots)
      if (q.get('scroll') === 'check') setTimeout(() => scrollToChain('.cv-check'), 400);
      if (q.get('chainplay') === '1') setTimeout(() => startPlay(qt, opts.getSnap()), 250);
    }, 900);
  } catch (e) { /* ignore */ }
  // keep the live value fresh while the sim runs
  timer = setInterval(() => {
    const s = opts.getSnap();
    const d = s ? s.date + (s.branch || '') : null;
    if (d !== lastDate || s !== lastSnapObj) { lastDate = d; lastSnapObj = s; refreshConcepts(); }   // (a valve turned in place rebuilds the snapshot without changing the date)
  }, 400);
}
export { CONCEPTS };
