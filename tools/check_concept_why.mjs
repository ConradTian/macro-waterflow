// node tools/check_concept_why.mjs [--show]   every concept card's why(snap, prev, ctx) must return a non-empty string and never throw
// (US history at several quarters, the town at several quarters, and a stripped snapshot with most fields missing).
import { createSim } from '../src/engine/sim.js';
import { US_Q } from '../src/data/us-quarterly.js';
import { CONCEPTS, makeCtx } from '../src/data/concepts.js';

const show = process.argv.includes('--show');
let fails = 0, n = 0;
const bad = m => { fails++; console.log('FAIL:', m); };

function runCase(label, sim, snap, prev) {
  const ctx = makeCtx(snap, sim);
  for (const [id, c] of Object.entries(CONCEPTS)) {
    n++;
    if (typeof c.why !== 'function') { bad(`${label} ${id}: no why()`); continue; }
    if (!c.short || !c.logic || !c.water || !c.formula) bad(`${id}: missing short/logic/water/formula`);
    let out;
    try { out = c.why(snap, prev, ctx); } catch (e) { bad(`${label} ${id}: threw ${e.message}`); continue; }
    if (typeof out !== 'string' || !out.trim()) bad(`${label} ${id}: empty`);
    else if (/undefined|NaN|\[object/.test(out)) bad(`${label} ${id}: bad text -> ${out}`);
    else if (show && ['qe', 'fiscalInjection', 'govPurchases', 'transfers', 'dsr', 'policyRate', 'ringStage', 'longCycle'].includes(id)) console.log(`[${label}] ${id}: ${out.replace(/\n/g, ' ⏎ ')}`);
  }
}

const us = createSim({ data: US_Q, mode: 'history' });
while (!us.done) us.step();
const uh = us.history();
for (const t of [0, 27, 56, 59, 100, 123]) runCase('US ' + uh[t].date, us, uh[t], t ? uh[t - 1] : null);

const town = createSim({ scenario: 'town', delays: false });
for (let i = 0; i < 12; i++) town.step();
const th = town.history();
for (const t of [0, 1, 4, 8, 11]) runCase('town ' + th[t].date, town, th[t], t ? th[t - 1] : null);
// town with the fiscal valve open (lesson 0 step 8)
try { const t2 = createSim({ scenario: 'town', delays: false }); t2.setValve && t2.setValve('fiscalInjection', 0.08); for (let i = 0; i < 4; i++) t2.step(); const h2 = t2.history(); runCase('town+fiscal ' + h2[3].date, t2, h2[3], h2[2]); } catch (e) { console.log('(skip town+fiscal:', e.message, ')'); }

// robustness: a snapshot that only has the bare minimum, no prev, no sim
const bare = { t: 5, date: '2000Q1', scenario: 'us', macro: {}, rates: {}, flows: {}, gov: {}, household: {}, bank: {}, firm: {}, assets: {}, debt: {}, money: {}, lights: {}, extra: {} };
runCase('bare', null, bare, null);
const bare2 = { t: 0, date: '第0季', scenario: 'town' };
runCase('bare2', null, bare2, null);

console.log(`\n${n} why() calls, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
