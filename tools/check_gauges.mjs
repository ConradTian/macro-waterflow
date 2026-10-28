// Checks the 水尺 / 对比尺 / lamp-bar module (src/ui/gauge.js, src/data/gauges.js) over every quarter of the US history, free and town runs:
//  1. every CONCEPTS key has a gauge entry or is listed in NO_GAUGE
//  2. gaugeHtml never throws / returns '' / leaks NaN|undefined|Infinity for any concept and quarter; pair() never throws
//  3. lampBarHtml works for the four lamps; lamp bands reproduce the lamp level (valuation: max(parts) in relative units) every quarter
// usage: node tools/check_gauges.mjs
import { createSim } from '../src/engine/sim.js';
import { US_Q } from '../src/data/us-quarterly.js';
import { CONCEPTS } from '../src/data/concepts.js';
import { gaugeHtml, lampBarHtml, bandLevel, GAUGES, NO_GAUGE } from '../src/ui/gauge.js';

let fails = 0, calls = 0;
const fail = m => { fails++; if (fails <= 25) console.log('  FAIL:', m); };
const LAMPS = ['credit', 'debtService', 'policy', 'valuation'];
const BAD = /NaN|undefined|Infinity|\[object/;

// 1. coverage
for (const id of Object.keys(CONCEPTS)) if (!GAUGES[id] && !NO_GAUGE.includes(id)) fail(`concept ${id} has neither a gauge nor a NO_GAUGE entry`);
for (const id of Object.keys(GAUGES)) if (!CONCEPTS[id]) fail(`gauge ${id} is not a concept`);
console.log(`coverage: ${Object.keys(GAUGES).length} gauges, ${NO_GAUGE.length} without, ${Object.keys(GAUGES).filter(k => GAUGES[k].pair).length} with a 对比尺`);

function run(name, opts, stop) {
  const t0 = Date.now();
  const sim = createSim(opts);
  let q = 0, pairs = 0;
  const check = () => {
    const snap = sim.snapshot('model');
    for (const id of Object.keys(CONCEPTS)) {
      calls++;
      const h = gaugeHtml(id, snap, sim);
      if (GAUGES[id]) {
        if (typeof h !== 'string' || !h) fail(`${name} ${snap.date} gaugeHtml(${id}) empty (a throw is swallowed to '')`);
        else if (BAD.test(h)) fail(`${name} ${snap.date} gaugeHtml(${id}) leaks ${h.match(BAD)[0]}`);
        const g = GAUGES[id];
        if (g.pair) { try { const p = g.pair(snap, sim); if (p) pairs++; if (p && BAD.test(JSON.stringify(p))) fail(`${name} ${snap.date} pair(${id}) bad number`); } catch (e) { fail(`${name} ${snap.date} pair(${id}) threw ${e.message}`); } }
      } else if (h !== '') fail(`${name} gaugeHtml(${id}) should be '' for a concept without gauge`);
    }
    // sim = null must also render
    for (const id of ['dsr', 'gMinusR', 'rentYield', 'capacity']) { const h = gaugeHtml(id, snap, null); if (!h || BAD.test(h)) fail(`${name} ${snap.date} gaugeHtml(${id}, null) -> '${String(h).slice(0, 40)}'`); }
    for (const k of LAMPS) {
      const L = snap.lights[k], html = lampBarHtml(k, snap, sim);
      if (!html || BAD.test(html)) fail(`${name} ${snap.date} lampBarHtml(${k}) bad`);
      if (!Array.isArray(L.bands) || !Array.isArray(L.axis) || L.axis.length !== 2) { fail(`${name} ${snap.date} lamp ${k} lacks bands/axis`); continue; }
      const v = k === 'valuation' ? Math.max(L.parts.house, L.parts.equity) : L.value;
      const lv = bandLevel(L.bands, v);
      if (lv !== L.level) fail(`${name} ${snap.date} lamp ${k}: bands say ${lv} at ${v}, lamp level is ${L.level}`);
      if (L.axis[0] >= L.axis[1]) fail(`${name} lamp ${k} axis inverted`);
      if (k === 'valuation' && !/决定颜色/.test(L.driver)) fail(`${name} ${snap.date} valuation driver does not name the deciding part`);
    }
    q++;
  };
  check();
  while (!sim.done && q < 400) { sim.step(); check(); }
  console.log(`${name}: ${q} quarters, ${pairs} pair() results, ${Date.now() - t0} ms`);
}
run('US history', { data: US_Q, mode: 'history' });
run('town', { scenario: 'town' });
run('free', { data: US_Q, mode: 'free' });

// sample output for a human
{
  const sim = createSim({ data: US_Q, mode: 'history' });
  while (sim.t < 56) sim.step();
  const txt = gaugeHtml('dsr', sim.snapshot(), sim).match(/<text[^>]*>[^<]*(?:<tspan[^>]*>[^<]*<\/tspan>)?<\/text>/g).map(s => s.replace(/<[^>]+>/g, '')).join(' | ');
  console.log('sample dsr @2009Q1 texts:', txt);
}
console.log(`\n${calls} gaugeHtml calls, ${fails} FAIL`);
if (fails) process.exit(1);
console.log('ALL GAUGE CHECKS PASSED');
