// Course progress per viewer + the progressive-diagram layers (tools/COURSE-V3.md 「Progressive diagram」, table in src/data/layers.js).
//   getProgress()      -> { done: [lessonId…] }            localStorage 'mw.course' (every access in try/catch; a private window keeps it in memory)
//   markDone(id)       the course runner calls it when a lesson reaches its last step; fires document 'mw:progress' { done, layers } on a change
//   learnedLayers()    -> Set of L-* ids: L-water always, then every layer up to the deepest one of a finished main-line lesson
//   lessonLayers(id)   -> Set of L-* ids a running lesson shows (its own layer + the earlier ones), or null = everything (not a main-line lesson)
//   getShowAll() / setShowAll(on)   the 「显示全部」 toggle, localStorage 'mw.layers.all' ('1' / '0')
//   layerShown(id)     reads the page state app.js writes: body.layers-on + body[data-layers]; true when layers are off
// app.js decides which set is on screen (simple / lesson / full / town) and writes the body attributes; flow.js, simple.js and objective.js only read them.
import { LAYER_IDS, LESSON_LAYER, lessonDepth, layersUpTo } from '../data/layers.js';

const KEY = 'mw.course', ALL_KEY = 'mw.layers.all';
let mem = null;                    // in-memory copy (also the fallback when localStorage throws)

function read() {
  if (mem) return mem;
  let o = null;
  try { o = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { o = null; }
  mem = { done: o && Array.isArray(o.done) ? o.done.map(String) : [] };
  return mem;
}
// another window finished a lesson: drop the cached copy
try { window.addEventListener('storage', e => { if (e.key === KEY || e.key === null) { mem = null; fire(); } }); } catch (e) { /* ignore */ }

export function getProgress() { return { done: [...read().done] }; }

export function markDone(id) {
  if (id == null) return false;
  id = String(id);
  const p = read();
  if (p.done.includes(id)) return false;
  p.done.push(id);
  try { localStorage.setItem(KEY, JSON.stringify({ done: p.done })); } catch (e) { /* private window: memory only */ }
  fire();
  return true;
}

export function learnedLayers() {
  let d = 0;
  for (const id of read().done) d = Math.max(d, lessonDepth(id));
  return new Set(layersUpTo(d));
}

export function lessonLayers(id) {
  const d = lessonDepth(id);
  return d < 0 ? null : new Set(layersUpTo(d));
}

export function getShowAll() { try { return localStorage.getItem(ALL_KEY) === '1'; } catch (e) { return false; } }
export function setShowAll(on) { try { localStorage.setItem(ALL_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ } }

export function layerShown(id) {
  const b = typeof document !== 'undefined' && document.body;
  if (!b || !b.classList.contains('layers-on')) return true;
  return (' ' + (b.dataset.layers || '') + ' ').includes(' ' + id + ' ');
}

function fire() {
  try { document.dispatchEvent(new CustomEvent('mw:progress', { detail: { done: getProgress().done, layers: [...learnedLayers()] } })); } catch (e) { /* ignore */ }
}

export { LAYER_IDS, LESSON_LAYER };
