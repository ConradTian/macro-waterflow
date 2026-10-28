// Town-lesson state machine, shared by the UI runner (lessons.js) and tools/check_role_lessons.mjs. No DOM, no Node-only APIs.
//
// A town lesson is a list of steps. The town world is rebuilt from scratch for every step (reset + replay of all earlier steps), so
// ?step=N, "上一步" and "下一步" always show exactly the same state. Per step the replay does, in this order:
//   1. entry effects      st.do        (all step types; applied when the step is entered)
//   2. tap effects        action / actions / valve+value   (action and valve steps: applied when the learner taps; replay applies them)
//   3. st.quarters        quarters of sim.step()           (0 / undefined = none)
//   4. after effects      st.after     (replay only: undo a scenario once the step is over)
//   5. valve steps with keep:false clear their valve again
// 'try' steps are sandboxes: they never carry state into later steps.
// Effect objects: { action:{...townAction} } | { valve:id, value } | { delays:bool } | { rule:id, on:bool } | { param:'rule.key', value } | { reset:true }
import { VALVES } from '../engine/valves.js';

const arr = x => (x == null ? [] : Array.isArray(x) ? x : [x]);
export { arr };

export function clearValve(s, id) {
  const v = VALVES.find(x => x.id === id);
  if (!v) return;
  if (v.ruleParam) s.setValve(id, v.default); else s.setValve(id, null);
}

export function applyOne(s, d, L) {
  if (!d) return null;
  if (d.reset) { s.reset(); if (L) for (const r of s.rules) s.setRuleEnabled(r.id, ruleOnFor(L, r.id)); return null; }   // back to a fresh town (same rules, same delays)
  if (d.action) return s.townAction(d.action);
  if (d.valve) { if (d.value == null) clearValve(s, d.valve); else s.setValve(d.valve, d.value); return null; }
  if (d.delays != null) { s.setDelays(!!d.delays); return null; }
  if (d.rule) { s.setRuleEnabled(d.rule, d.on !== false); return null; }
  if (d.param) { const [r, k] = d.param.split('.'); s.setRuleParam(r, k, d.value); return null; }
  return null;
}
export const applyAll = (s, list, L) => arr(list).map(d => applyOne(s, d, L));

// what a tap performs (action / valve steps)
export function tapEffects(st) {
  if (st.type === 'action') return arr(st.actions || st.action).map(a => ({ action: a }));
  if (st.type === 'valve') return [{ valve: st.valve, value: st.value }];
  return [];
}

// positions: town steps are quarter indices (numbers); a 'zoom' step switches to the US world where steps use 'YYYYQn' strings
export function lessonPositions(L) {
  let world = L.scenario === 'town' ? 'town' : 'us';
  let end = world === 'town' ? 0 : L.startDate;
  return L.steps.map(s => {
    let from, until;
    if (s.type === 'zoom') { world = 'us'; from = s.date; until = s.until || s.date; }
    else if (world === 'town') { if (arr(s.do).some(d => d && d.reset)) end = 0; from = end; until = from + (s.type === 'try' ? 0 : (s.quarters || 0)); }
    else { from = s.from || end; until = s.until || from; }
    end = until;
    return { from, until, world };
  });
}

export function ruleOnFor(L, id) { return !Array.isArray(L.rulesOn) || L.rulesOn.includes(id); }

// rebuild the town in sim `s` as it is when step `upto` is entered (before its own entry effects)
export function replayTown(s, L, upto, pos = lessonPositions(L)) {
  s.setDelays(!!L.delays);
  s.reset();
  for (const r of s.rules) s.setRuleEnabled(r.id, ruleOnFor(L, r.id));
  for (let k = 0; k < upto; k++) {
    const st = L.steps[k];
    if (pos[k].world !== 'town' || st.type === 'try') continue;
    applyAll(s, st.do, L);
    applyAll(s, tapEffects(st), L);
    const n = (pos[k].until - pos[k].from) | 0;
    for (let q = 0; q < n && !s.done; q++) s.step();
    applyAll(s, st.after, L);
    if (st.type === 'valve' && st.keep === false) clearValve(s, st.valve);
  }
  return s;
}

// numbers behind a metric spec like 'end:macro.inflation' over a list of snapshots
export const getPath = (o, p) => String(p).split('.').reduce((a, k) => (a == null ? a : a[k]), o);
export function aggregate(hist, spec) {
  const [agg, path] = spec.split(':');
  const vals = hist.map(h => getPath(h, path)).filter(v => typeof v === 'number');
  if (!vals.length) return null;
  return agg === 'end' ? vals[vals.length - 1] : agg === 'max' ? Math.max(...vals) : agg === 'min' ? Math.min(...vals) : vals.reduce((a, b) => a + b, 0);
}

// 'try' step: run `n` quarters from the state at step i with a given set of effects; returns the snapshots of those quarters
export function runTry(makeSim, L, i, effects, n) {
  const s = makeSim();
  replayTown(s, L, i);
  applyAll(s, L.steps[i].do, L);
  applyAll(s, effects, L);
  const hist = [];
  for (let q = 0; q < n && !s.done; q++) hist.push(s.step());
  return hist;
}
