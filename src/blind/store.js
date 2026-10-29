// 历史盲测: per-viewer progress in localStorage. Every access is wrapped: in a private window / blocked storage the game
// still works, it just forgets on reload.
//   state = { v: 1, plays: [{ id, long, fork, short, w: { cash: 3, ... } (tenths), at }], survivorSeen: bool, draft: { id, long, fork, short, w } | null }
const KEY = 'mwf-blind-v1';
const fresh = () => ({ v: 1, plays: [], survivorSeen: false, draft: null });

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const s = JSON.parse(raw);
    if (!s || s.v !== 1 || !Array.isArray(s.plays)) return fresh();
    return { ...fresh(), ...s };
  } catch (e) { return fresh(); }
}
export function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { return false; }
}
export function wipe() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  return fresh();
}
