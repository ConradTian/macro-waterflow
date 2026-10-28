// Arrow badges + the ▶ 看一遍流向 playback on the water diagram (HTML layer over #diagram, never inside the SVG:
// flow.js depends on the SVG child order). State-driven: paint() re-applies classes and badge positions after every diagram render,
// so a re-render (the sim steps every quarter) never loses them. Node -> diagram elements: links.js nodeElements().
//
//   setBadges(Map node -> { sign, label?, self? })   static ↑ / ↓ / ? badges ("push" mode)
//   clearBadges()
//   play(steps, { stepMs, freezeAt?, motion?, onStep(i, step, n), onEnd() })   steps from causal-view playScript(); one node per hop
//   stopPlay()   isPlaying()   clearAll()   repaint()
import { nodeElements } from './links.js';
import { nodeName } from './causal-view.js';

const WORD = { 1: '上升', '-1': '下降', 0: '方向不定' };
const GLYPH = s => (s > 0 ? '↑' : s < 0 ? '↓' : '?');
const CLS = s => (s > 0 ? 'up' : s < 0 ? 'dn' : 'q');
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

let statics = new Map(), playMap = new Map(), now = new Set(), seen = new Set();
let playing = false, timers = [], endCb = null;
let layer = null, lit = new Set(), obs = null, ro = null, raf = 0, wired = false;
const badges = new Map();   // node -> element

const host = () => document.getElementById('diagram');
function layerFor(h) {
  if (!layer) { layer = document.createElement('div'); layer.className = 'cv-layer'; layer.setAttribute('aria-hidden', 'true'); }
  if (layer.parentNode !== h) h.appendChild(layer);
  return layer;
}

function ensureWired() {
  const h = host();
  if (wired || !h) return;
  wired = true;
  try {
    obs = new MutationObserver(recs => { if (!layer || recs.some(r => !layer.contains(r.target))) schedule(); });
    obs.observe(h, { childList: true, subtree: true, characterData: true });
  } catch (e) { obs = null; }
  try { ro = new ResizeObserver(schedule); ro.observe(h); } catch (e) { ro = null; }
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
}
export const repaint = () => schedule();
function schedule() { if (!raf) raf = requestAnimationFrame(paint); }

/** The visible diagram element that best stands for a node: the smallest one with a real size (a chip rather than a whole pipe). */
function anchorOf(node) {
  let best = null, area = Infinity, svgSeen = false;
  for (const el of nodeElements(node)) {
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3) continue;
    const inSvg = !!el.ownerSVGElement || el.tagName.toLowerCase() === 'svg';   // the drawing itself beats the HTML budget bar underneath it
    if (svgSeen && !inSvg) continue;
    const a = r.width * r.height;
    if ((inSvg && !svgSeen) || a < area) { area = a; best = r; svgSeen = svgSeen || inSvg; }
  }
  return best;
}

function paint() {
  raf = 0;
  const h = host();
  if (!h) return;
  const want = new Map();
  for (const n of seen) for (const el of nodeElements(n)) want.set(el, 'cv-seen');
  for (const n of now) for (const el of nodeElements(n)) want.set(el, 'cv-now');
  for (const el of lit) if (!want.has(el)) el.classList.remove('cv-now', 'cv-seen');
  for (const [el, c] of want) { el.classList.remove(c === 'cv-now' ? 'cv-seen' : 'cv-now'); el.classList.add(c); }
  lit = new Set(want.keys());

  const L = layerFor(h);
  const map = playing ? playMap : statics;
  for (const [n, el] of badges) if (!map.has(n)) { el.remove(); badges.delete(n); }
  const hr = h.getBoundingClientRect();
  const placed = [];
  // several nodes can share one diagram element (assetReservoir / housePrice -> the 房产 tank): static badges keep one per element,
  // the one with the best claim (the card itself, then outcomes, then the earliest arrival); the ▶ playback shows every hop
  const anchors = new Map();
  for (const n of map.keys()) anchors.set(n, anchorOf(n));
  const skip = new Set();
  if (!playing) {
    const best = new Map();
    const rank = b => [b.self ? 0 : 1, b.prio ?? 1, b.lag ?? 0];
    const less = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
    for (const [n, b] of map) {
      const r = anchors.get(n);
      if (!r) continue;
      const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
      const cur = best.get(key);
      if (!cur) best.set(key, n);
      else if (less(rank(b), rank(map.get(cur)))) { skip.add(cur); best.set(key, n); } else skip.add(n);
    }
  }
  const order = [...map.entries()].sort((a, b) => (b[1].self ? 1 : 0) - (a[1].self ? 1 : 0));   // the card's own badge gets the best spot
  for (const [n, b] of order) {
    let el = badges.get(n);
    const cls = `cv-bd ${CLS(b.sign)}${b.self ? ' self' : ''}${b.later ? ' later' : ''}`;
    const html = `${b.self ? '<span class="cv-bd-k">推</span>' : ''}${GLYPH(b.sign)}${b.label && b.label !== '立刻' ? `<small>${b.label}</small>` : ''}`;
    if (!el) { el = document.createElement('span'); badges.set(n, el); L.appendChild(el); el.dataset.pop = '1'; }
    if (el.className.replace(' pop', '') !== cls) el.className = cls + (el.dataset.pop ? ' pop' : '');
    if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
    el.title = `${nodeName(n)} ${WORD[b.sign]}${b.label ? ' · ' + b.label : ''}`;
    const r = anchors.get(n);
    if (!r || skip.has(n)) { el.style.display = 'none'; continue; }
    el.style.display = '';
    const w = el.offsetWidth || 24, ht = el.offsetHeight || 20;
    const cx = r.right - hr.left, cy = r.top - hr.top;
    const cand = [[-6, -ht + 4], [-w - r.width + 6, -ht + 4], [-6, r.height - 4], [-w - r.width + 6, r.height - 4], [4, -ht / 2 + r.height / 2], [-w - r.width - 4, -ht / 2 + r.height / 2]];
    for (let k = 1; k <= 3; k++) cand.push([-6 + k * (w + 3), -ht + 4], [-6, -ht + 4 - k * (ht + 2)]);
    let pos = null;
    for (const [dx, dy] of cand) {
      const x = Math.min(Math.max(cx + dx, 2), hr.width - w - 2), y = Math.min(Math.max(cy + dy, 2), hr.height - ht - 2);
      if (!placed.some(p => x < p.x + p.w + 1 && x + w + 1 > p.x && y < p.y + p.h + 1 && y + ht + 1 > p.y)) { pos = { x, y, w, h: ht }; break; }
    }
    if (!pos) pos = { x: Math.min(Math.max(cx - 6, 2), hr.width - w - 2), y: Math.min(Math.max(cy - ht + 4, 2), hr.height - ht - 2), w, h: ht };
    placed.push(pos);
    el.style.left = pos.x.toFixed(0) + 'px';
    el.style.top = pos.y.toFixed(0) + 'px';
  }
}

/* ---------- static badges (↑ 推高 / ↓ 压低) ---------- */
function sameMap(a, b) {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) { const w = b.get(k); if (!w || w.sign !== v.sign || w.prio !== v.prio || !!w.self !== !!v.self) return false; }
  return true;
}
export function setBadges(map) {
  ensureWired();
  if (sameMap(statics, map)) { schedule(); return; }   // the card redraws every quarter: keep the badges (and their pop-in) untouched
  statics = new Map(map);
  paint();
}
export function clearBadges() { if (!statics.size) return; statics = new Map(); schedule(); }

/* ---------- ▶ playback ---------- */
export const isPlaying = () => playing;
function reset() { timers.forEach(clearTimeout); timers = []; playing = false; playMap = new Map(); now = new Set(); seen = new Set(); }
export function stopPlay() {
  if (!playing && !timers.length) return;
  reset();
  const f = endCb; endCb = null;
  paint();
  if (f) f();
}
export function play(steps, o = {}) {
  ensureWired();
  reset();
  endCb = o.onEnd || null;
  if (!steps.length) { const f = endCb; endCb = null; if (f) f(); return; }
  const ms = o.stepMs ?? 550, n = steps.length;
  playing = true;
  const finish = hold => timers.push(setTimeout(() => { const f = endCb; endCb = null; reset(); paint(); if (f) f(); }, hold));
  if (reduced() && !o.motion) {   // no animation: every badge at once, held until the learner stops it (■)
    for (const s of steps) { if (!playMap.has(s.node)) playMap.set(s.node, { sign: s.sign, label: s.label, self: s.role === 'self' }); seen.add(s.node); }
    paint();
    if (o.onStep) o.onStep(n - 1, steps[n - 1], n);
    return;
  }
  let i = 0;
  const tick = () => {
    if (i >= n) { for (const x of now) seen.add(x); now = new Set(); paint(); finish(2200); return; }
    const s = steps[i];
    for (const x of now) seen.add(x);
    now = new Set([s.node]);
    if (!playMap.has(s.node)) playMap.set(s.node, { sign: s.sign, label: s.label, self: s.role === 'self' });
    const visible = nodeElements(s.node).length > 0;
    paint();
    if (o.onStep) o.onStep(i, s, n);
    i++;
    if (o.freezeAt != null && i > o.freezeAt) return;   // screenshots: hold mid-animation
    timers.push(setTimeout(tick, visible && !s.repeat ? ms : Math.min(ms, 220)));
  };
  tick();
}

export function clearAll() {
  const f = endCb; endCb = null;
  reset();
  statics = new Map();
  paint();
  if (f) f();
}
