// node tools/engine_check.mjs [--verbose]   Engine self-test + yearly table.
import { createSim } from '../src/engine/sim.js';
import { FIXTURE_US_Q } from '../src/engine/test-fixture.js';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const verbose = process.argv.includes('--verbose');
let fails = 0;
const assert = (c, m) => { if (!c) { fails++; console.log('  FAIL:', m); } };

function runAll(data, mode, takeoverAt, rate) {
  const sim = createSim({ data, mode });
  const pauses = [];
  sim.on('pause', p => pauses.push({ date: sim.snapshot().date, p }));
  while (!sim.done) {
    if (takeoverAt != null && sim.t === takeoverAt) { sim.takeover('centralBank'); sim.setDecision('centralBank', { policyRate: rate }); }
    sim.step();
  }
  return { sim, pauses };
}
function walk(o, path, f) {
  if (typeof o === 'number') f(o, path);
  else if (Array.isArray(o)) o.forEach((x, i) => walk(x, path + '[' + i + ']', f));
  else if (o && typeof o === 'object') for (const k of Object.keys(o)) walk(o[k], path + '.' + k, f);
}
const f1 = x => (x * 100).toFixed(1).padStart(6);

function check(name, data, mode) {
  console.log(`\n=== ${name} / ${mode} ===`);
  const { sim, pauses } = runAll(data, mode);
  const h = sim.history();
  assert(h.length === (mode === 'free' ? 224 : 124), 'history length ' + h.length);
  let bad = 0;
  h.forEach(s => walk(s, s.date, (v, p) => { if (!Number.isFinite(v)) { bad++; if (bad < 5) console.log('  non-finite', p); } }));
  assert(bad === 0, 'NaN/Inf count ' + bad);
  // accounting: dM = newLoans - repay + fiscalInjection - fiscalDrain + qe
  let maxErr = 0;
  for (let t = 1; t < h.length; t++) {
    const f = h[t].flows;
    const dm = h[t].money.M - h[t - 1].money.M;
    const e = dm - (f.newLoans - f.principalRepay + f.fiscalInjection - f.fiscalDrain + f.qe);
    maxErr = Math.max(maxErr, Math.abs(e));
    const sp = f.toHousing + f.toFinancial + f.toConsumption + f.toCapex + f.toCash - (f.newLoans + f.fiscalInjection + f.qe);
    maxErr = Math.max(maxErr, Math.abs(sp));
    // debt identity
    const dD = (h[t].debt.household + h[t].debt.firm) - (h[t - 1].debt.household + h[t - 1].debt.firm);
    maxErr = Math.max(maxErr, Math.abs(dD - (f.newLoans - f.principalRepay - f.writeoff)));
  }
  assert(maxErr < 1e-6, 'accounting error ' + maxErr);
  for (const s of h) {
    assert(s.rates.policy >= 0 && s.rates.policy < 0.2, 'policy range ' + s.date);
    assert(s.household.dsr > 0.02 && s.household.dsr < 0.4, `dsr range ${s.date} ${s.household.dsr}`);
    assert(s.macro.unemployment > 0.01 && s.macro.unemployment < 0.3, `u range ${s.date} ${s.macro.unemployment}`);
    assert(s.macro.inflation > -0.1 && s.macro.inflation < 0.25, `infl range ${s.date} ${s.macro.inflation}`);
    assert(s.bank.capitalRatio > 0 && s.bank.capitalRatio < 0.4, `cap range ${s.date} ${s.bank.capitalRatio}`);
    assert(s.assets.housing.price > 5 && s.assets.housing.price < 5000, `H range ${s.date} ${s.assets.housing.price}`);
    if (fails > 25) break;
  }
  // determinism
  const again = runAll(data, mode).sim.history();
  assert(JSON.stringify(again) === JSON.stringify(h), 'determinism');
  // immutability: snapshots serialisable
  JSON.parse(JSON.stringify(h[h.length - 1]));

  console.log('date     pol%  mortE%  newLoan  houseYoY%  dsr%  infl%  unemp%  stage fork  lamps(信/偿/政/估)  qe');
  for (let t = 0; t < h.length; t += 4) {
    const s = h[t], p = t >= 4 ? h[t - 4] : s;
    const L = s.lights, c = x => ({ green: 'G', yellow: 'Y', red: 'R' }[x.level]);
    console.log(`${s.date} ${f1(s.rates.policy)} ${f1(s.rates.mortgageEff)} ${s.flows.newLoans.toFixed(0).padStart(8)} ${f1(s.assets.housing.price / p.assets.housing.price - 1)}   ${f1(s.household.dsr)} ${f1(s.macro.inflation)} ${f1(s.macro.unemployment)}   ${s.ring.stage}${(s.ring.fork || '').padEnd(3)}   ${c(L.credit)}${c(L.debtService)}${c(L.policy)}${c(L.valuation)}   ${s.flows.qe > 0 ? 'QE' : ''}`);
  }
  if (verbose) pauses.forEach(x => console.log('  pause', x.date, x.p.map(q => q.code).join(',')));
  console.log('  pauses total:', pauses.length, ' by code:', JSON.stringify(pauses.flatMap(x => x.p).reduce((a, q) => (a[q.code] = (a[q.code] || 0) + 1, a), {})));
  const led = h.reduce((n, s) => n + s.ledger.length, 0);
  console.log('  ledger entries:', led, ' sample:', JSON.stringify(h.find(s => s.ledger.length && s.t > 20)?.ledger[0]));
  assert(led > 20, 'ledger populated');
  return h;
}

function takeoverTest(name, data) {
  console.log(`\n=== takeover divergence (${name}) ===`);
  const sim = createSim({ data, mode: 'history' });
  for (let i = 0; i < 40; i++) sim.step();
  sim.takeover('centralBank');
  const sug = sim.suggestion('centralBank');
  console.log('  suggestion:', sug.text, JSON.stringify(sug.values));
  sim.setDecision('centralBank', { policyRate: 0.0 });
  for (let i = 0; i < 20; i++) sim.step();
  const m = sim.snapshot('model'), u = sim.snapshot('user');
  assert(sim.history('user').length === 61, 'user history length');
  assert(u.rates.policy === 0 && m.rates.policy !== 0, 'user policy differs');
  assert(Math.abs(u.assets.housing.price - m.assets.housing.price) > 0.1, 'house price diverges');
  console.log(`  t=${m.date} model house ${m.assets.housing.price.toFixed(1)} user ${u.assets.housing.price.toFixed(1)}; mortEff model ${(m.rates.mortgageEff * 100).toFixed(2)} user ${(u.rates.mortgageEff * 100).toFixed(2)}`);
  // branch must not change model path
  const solo = createSim({ data, mode: 'history' });
  for (let i = 0; i < 60; i++) solo.step();
  assert(JSON.stringify(solo.snapshot('model')) === JSON.stringify(m), 'model branch unaffected by takeover');
  // rule toggle changes behaviour
  const a = createSim({ data }); a.setRuleEnabled('bank_loosen', false);
  for (let i = 0; i < 40; i++) a.step();
  const b = createSim({ data });
  for (let i = 0; i < 40; i++) b.step();
  assert(a.snapshot().bank.approval !== b.snapshot().bank.approval || a.snapshot().assets.housing.price !== b.snapshot().assets.housing.price, 'rule toggle has effect');
  for (const pl of ['centralBank', 'government', 'bank', 'household', 'firm', 'investor', 'foreign']) {
    sim.takeover(pl); const s = sim.suggestion(pl); assert(s && typeof s.text === 'string', 'suggestion ' + pl);
  }
  console.log('  rules:', sim.rules.length);
}

check('fixture', FIXTURE_US_Q, 'history');
check('fixture', FIXTURE_US_Q, 'free');
takeoverTest('fixture', FIXTURE_US_Q);
const real = join(root, 'src/data/us-quarterly.js');
if (existsSync(real)) {
  const { US_Q } = await import(pathToFileURL(real).href);
  check('real US_Q', US_Q, 'history');
  check('real US_Q', US_Q, 'free');
  takeoverTest('real', US_Q);
}
console.log(fails ? `\n${fails} FAILURES` : '\nALL CHECKS PASSED');
process.exit(fails ? 1 : 0);
