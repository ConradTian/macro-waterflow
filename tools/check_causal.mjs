// node tools/check_causal.mjs [--verbose]
// Does the causal map (src/data/causal.js) point the same way as the engine?
// For every valve: two identical sims, the valve turned in one (same turns and start quarters as tools/valve_probe.mjs),
// and for every node with a METRIC the sign of the FIRST material departure from the baseline is compared with propagate().
// Graph '?' (two routes fight) is never a failure. A node the engine does not move materially is reported as "quiet".
// Exit 1 when a strong graph arrow (no '?', no offset) disagrees with the engine in BOTH scenarios.
import { createSim } from '../src/engine/sim.js';
import { VALVES } from '../src/engine/valves.js';
import { US_Q } from '../src/data/us-quarterly.js';
import { METRIC, VALVE_OF, EDGES } from '../src/data/causal.js';
import { CONCEPTS } from '../src/data/concepts.js';
import { propagate, allNodes, chainView } from '../src/ui/causal-graph.js';

const VERBOSE = process.argv.includes('--verbose');
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const TURN = {   // [value(snapshot), direction of the push in graph terms]
  policyRate: [s => s.rates.policy + 0.015, +1], qe: [() => true, +1], approval: [s => s.bank.approval * 0.7, -1],
  lvrCap: [() => 0.30, -1], borrowMult: [() => 1.4, +1], saveAdj: [() => 0.04, +1], capexMult: [() => 1.3, +1], fiscalInjection: [() => 0.05, +1],
};
const START = { policyRate: '2012Q1', lvrCap: '2005Q1' };
const H = 16;

function build(sc, vid) {
  const sim = sc === 'town' ? createSim({ scenario: 'town' }) : createSim({ data: US_Q, mode: 'history' });
  const tt = sc === 'town' ? 4 : US_Q.dates.indexOf(START[vid] || '2004Q1');
  while (sim.t < tt) sim.step();
  return sim;
}
function measure(sc, vid) {
  const A = build(sc, vid), B = build(sc, vid);
  const v = VALVES.find(x => x.id === vid);
  B.setValve(vid, TURN[vid][0](A.snapshot()));
  const br = v.ruleParam || sc === 'town' ? 'model' : 'user';
  const d = {};
  for (let k = 1; k <= H; k++) {
    A.step(); B.step();
    const a = A.snapshot('model'), b = B.snapshot(br);
    for (const [node, p] of Object.entries(METRIC)) {
      const x = get(a, p), y = get(b, p);
      if (typeof x !== 'number' || typeof y !== 'number' || d[node]) continue;
      const rate = /^rates\.|inflation|unemployment|outputGap|dsr|lvr|approval|badLoan|capitalRatio|savingRate|interestToTax|rentYield|lights|\.ret$/.test(p);
      const thr = rate ? 0.0017 : Math.max(1e-6, 0.01 * Math.abs(x));
      if (Math.abs(y - x) > thr) d[node] = { sign: Math.sign(y - x), q: k };
    }
  }
  return d;
}

const A = s => (s > 0 ? '↑' : s < 0 ? '↓' : '?');
let hard = 0, soft = 0, agree = 0, quiet = 0;
const fails = [];
for (const [node, vid] of Object.entries(VALVE_OF)) {
  const dir = TURN[vid][1];
  const g = propagate(node, dir, { mode: 'history' });
  const res = { us: measure('us', vid), town: measure('town', vid) };
  if (VERBOSE) console.log(`\n## ${node} (${vid}) ${A(dir)}`);
  for (const [n, a] of Object.entries(g)) {
    if (!METRIC[n]) continue;
    const u = res.us[n], t = res.town[n];
    const tag = x => (x ? `${A(x.sign)}q${x.q}` : '·');
    // timing: an engine move that first becomes material more than one lag bucket after the graph's arrival means the
    // graph's early effect is too small to see; then the engine sign is compared with the graph's LATER route (if any)
    const BK = ['立刻', '1–2 季', '2–4 季', '2–3 年'];
    const bucketOfQ = q => (q <= 1 ? 0 : q <= 3 ? 1 : q <= 6 ? 2 : 3);
    const late = x => x && bucketOfQ(x.q) > BK.indexOf(a.label) + 1;
    const ok = x => !x || a.sign === 0 || x.sign === a.sign || (late(x) && (!a.later || a.later.sign === x.sign)) || (a.offset && a.offset.sign === x.sign);
    const strong = a.sign !== 0 && !a.offset;
    if (!u && !t) { quiet++; if (VERBOSE) console.log(`   quiet  ${n.padEnd(15)} graph ${A(a.sign)} ${a.label}`); continue; }
    if (ok(u) && ok(t)) { agree++; if (VERBOSE) console.log(`   ok     ${n.padEnd(15)} graph ${A(a.sign)} ${a.label.padEnd(6)} us ${tag(u).padEnd(6)} town ${tag(t)}`); continue; }
    const bad = strong && !ok(u) && !ok(t);
    if (bad) hard++; else soft++;
    const line = `${bad ? 'FAIL' : 'warn'}  ${node}${A(dir)} -> ${n}: graph ${A(a.sign)} ${a.label} via ${a.path.join('>')} | engine us ${tag(u)} town ${tag(t)}`;
    fails.push(line);
    if (VERBOSE) console.log('   ' + line);
  }
}
// structure: every node is a concept or an extra node; every concept (except detected ones) sits on the map
const nodes = new Set(allNodes());
// v3 picture places (tools/DESIGN-v3.md): cards for parts of the drawing, not variables, so they have no edges of their own
const PICTURE_ONLY = new Set(['suction', 'weir', 'groundwater', 'deepPump', 'gate']);
const missing = Object.keys(CONCEPTS).filter(id => !nodes.has(id) && !chainView(id).detected && !PICTURE_ONLY.has(id));
console.log(`\ncausal map: ${EDGES.length} edges, ${nodes.size} nodes; concepts not on the map: ${missing.length ? missing.join(', ') : 'none'}`);
console.log(`valve directions vs engine: ${agree} agree, ${quiet} quiet (engine barely moves), ${soft} warn, ${hard} FAIL`);
for (const f of fails) console.log('  ' + f);
process.exit(hard || missing.length ? 1 : 0);
