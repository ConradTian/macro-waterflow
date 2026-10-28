// Concept cards: bottom sheet (phone) / side card (wide). CONTRACT §5.
import { CONCEPTS, KEYWORDS } from '../data/concepts.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let opts = { getSnap: () => null, getPrev: null, sim: null };
let stack = [];
let root = null, lastDate = null, timer = null;

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

function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
function fmtVal(v, fmt) {
  if (v == null || (typeof v === 'number' && !isFinite(v))) return '—';
  if (typeof v === 'string') return v;
  switch (fmt) {
    case 'pct': return (v * 100).toFixed(2) + '%';
    case 'bn': return Math.abs(v) >= 1000 ? (v / 1000).toFixed(2) + ' 万亿' : v.toFixed(0) + ' 十亿';
    case 'idx': return v.toFixed(1);
    default: return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
  }
}
function liveOf(c, snap) {
  if (!snap) return null;
  if (c.liveFn) return c.liveFn(snap, prevOf(snap));
  return c.live ? getPath(snap, c.live) : null;
}
function prevOf(snap) {
  try {
    if (opts.getPrev) return opts.getPrev();
    if (opts.sim && snap && snap.t > 0) return opts.sim.snapshot(snap.branch || 'model', snap.t - 1);
  } catch (e) { /* ignore */ }
  return null;
}

function liveHtml(c) {
  const snap = opts.getSnap();
  if (!snap || (!c.live && !c.liveFn)) return '';
  const v = liveOf(c, snap);
  const p = prevOf(snap);
  const pv = p ? liveOf(c, p) : null;
  let arrow = '';
  if (typeof v === 'number' && typeof pv === 'number') {
    const d = v - pv;
    arrow = Math.abs(d) < 1e-9 ? '<span class="cc-arrow" title="与上季持平">→ 持平</span>'
      : `<span class="cc-arrow ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲ 上升' : '▼ 下降'}（上季 ${esc(fmtVal(pv, c.fmt))}）</span>`;
  }
  return `<div class="cc-live"><span class="cc-live-l">${esc(snap.date)} 当前值</span><b>${esc(fmtVal(v, c.fmt))}</b>${arrow}</div>`;
}

function links(label, ids) {
  const items = (ids || []).filter(i => CONCEPTS[i]).map(i => term(i)).join(' ');
  return items ? `<div class="cc-row"><span class="cc-k">${label}</span><div class="cc-links">${items}</div></div>` : '';
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
    if (e.target.closest('[data-cc-close]')) { close(); return; }
    if (e.target.closest('[data-cc-back]')) { back(); return; }
    const crumb = e.target.closest('[data-cc-crumb]');
    if (crumb) { stack = stack.slice(0, +crumb.dataset.ccCrumb + 1); draw(); }
  });
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
  r.querySelector('.cc-body').innerHTML =
    `<header class="cc-head">${stack.length > 1 ? '<button type="button" class="cc-btn" data-cc-back aria-label="返回上一张">‹ 返回</button>' : '<span></span>'}` +
    `<button type="button" class="cc-btn" data-cc-close aria-label="关闭">✕ 关闭</button></header>` +
    crumbs +
    `<h2 class="cc-title">${esc(c.name)}</h2>` +
    `<p class="cc-short">${esc(c.short)}</p>` +
    liveHtml(c) +
    `<div class="cc-row"><span class="cc-k">水的比喻</span><p>${esc(c.water)}</p></div>` +
    `<div class="cc-row"><span class="cc-k">公式</span><pre class="cc-formula">${esc(c.formula)}</pre></div>` +
    links('受谁影响（来自）', c.from) + links('影响谁（流向）', c.to) +
    `<div class="cc-row"><span class="cc-k">合理性</span><p>${esc(c.why)}</p></div>`;
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
  if (root) { root.classList.remove('open'); root.hidden = true; }
}
export function refreshConcepts() { if (root && !root.hidden && stack.length) draw(true); }

function ensureCss() {
  if (document.querySelector('link[data-panels-css]')) return;
  if ([...document.styleSheets].some(s => (s.href || '').includes('panels.css'))) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('../../assets/css/panels.css', import.meta.url).href;
  l.dataset.panelsCss = '1';
  document.head.appendChild(l);
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
      e.preventDefault(); openConcept(el.dataset.term); return;
    }
    e.preventDefault();
    openConcept(el.dataset.term);
  });
  // keep the live value fresh while the sim runs
  timer = setInterval(() => {
    const s = opts.getSnap();
    const d = s ? s.date + (s.branch || '') : null;
    if (d !== lastDate) { lastDate = d; refreshConcepts(); }
  }, 400);
}
export { CONCEPTS };
