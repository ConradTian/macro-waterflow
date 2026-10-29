// node tools/engine_check.mjs [--verbose] [--country ISO] [--score]   Engine self-test + yearly table.
//   --country USA (default): the full US suite (fixture, real US_Q, 17 calibration targets, experiments, lessons, valves, cycles, town).
//   --country AUS (...)    : generic checks on src/data/countries/<iso>-quarterly.js + that country's target table (COUNTRY_TARGETS).
//   --score                : scorecard only.
import { createSim } from '../src/engine/sim.js';
import { VALVES } from '../src/engine/valves.js';
import { probe as valveProbe, setScenario as probeScenario, measuredLabel } from './valve_probe.mjs';
import { FIXTURE_US_Q } from '../src/engine/test-fixture.js';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const verbose = process.argv.includes('--verbose');
const ci = process.argv.indexOf('--country');
const COUNTRY = (ci > 0 && process.argv[ci + 1] ? process.argv[ci + 1] : 'USA').toUpperCase();
let fails = 0;
const assert = (c, m) => { if (!c) { fails++; console.log('  FAIL:', m); } };

function runAll(data, mode, takeoverAt, rate) {
  const sim = createSim({ data, mode, country: COUNTRY });
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
  else if (o && typeof o === 'object') for (const k of Object.keys(o)) { if (k === 'bands') continue; /* lamp bands carry intentional +-Infinity ends */ walk(o[k], path + '.' + k, f); }
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
    // water budget: M_after - M_before = net (exact), M_before chains to the previous quarter, IOU = bank-held debt, sub-pools sum
    const b = h[t].budget;
    assert(Math.abs((b.M_after - b.M_before) - b.net) < 1e-9, 'budget identity ' + h[t].date);
    assert(Math.abs(b.M_before - h[t - 1].money.M) < 1e-9 && Math.abs(b.M_after - h[t].money.M) < 1e-9, 'budget M chain ' + h[t].date);
    assert(Math.abs(b.net - (f.newLoans + f.qe + f.fiscalInjection - f.principalRepay - f.govSurplusDrain - f.qt)) < 1e-9, 'budget net vs flows ' + h[t].date);
    assert(Math.abs(h[t].iou.bankTotal - (h[t].debt.household + h[t].debt.firm)) < 1e-9, 'iou = debt ' + h[t].date);
    assert(Math.abs(f.toFinancial - (f.toEquity + f.toBond + f.toGold)) < 1e-9, 'toFinancial = sum of sub-pools ' + h[t].date);
    assert(f.govSurplusDrain === f.fiscalDrain && f.rent >= 0 && f.dividends >= 0 && f.coupons >= 0 && f.toEquity >= 0 && f.toBond >= 0 && f.toGold >= 0, 'new flows sane ' + h[t].date);
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
  const sim = createSim({ data, mode: 'history', country: COUNTRY });
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
  const solo = createSim({ data, mode: 'history', country: COUNTRY });
  for (let i = 0; i < 60; i++) solo.step();
  assert(JSON.stringify(solo.snapshot('model')) === JSON.stringify(m), 'model branch unaffected by takeover');
  // rule toggle changes behaviour
  const a = createSim({ data, country: COUNTRY }); a.setRuleEnabled('bank_loosen', false);
  for (let i = 0; i < 40; i++) a.step();
  const b = createSim({ data, country: COUNTRY });
  for (let i = 0; i < 40; i++) b.step();
  assert(a.snapshot().bank.approval !== b.snapshot().bank.approval || a.snapshot().assets.housing.price !== b.snapshot().assets.housing.price, 'rule toggle has effect');
  for (const pl of ['centralBank', 'government', 'bank', 'household', 'firm', 'investor', 'foreign']) {
    sim.takeover(pl); const s = sim.suggestion(pl); assert(s && typeof s.text === 'string', 'suggestion ' + pl);
  }
  console.log('  rules:', sim.rules.length);
}

// ---------------------------------------------------------------- soft asset sanity (direction only: printed, never fails)
function assetSoftChecks(data, hist) {
  const D = data.dates, ix = d => D.indexOf(d);
  const chg = (k, a, b) => hist[ix(b)].assets[k].price / hist[ix(a)].assets[k].price - 1;
  const rows = [
    ['equity falls 2001-02', 'equity', '2000Q4', '2002Q4', x => x < 0],
    ['equity falls 2008', 'equity', '2007Q4', '2009Q1', x => x < 0],
    ['equity rises 2009-2021', 'equity', '2009Q1', '2021Q4', x => x > 0],
    ['bond price falls 2022', 'bond', '2021Q4', '2022Q4', x => x < 0],
    ['gold rises 2001-2011', 'gold', '2000Q4', '2011Q4', x => x > 0],
    ['gold rises 2019-2025', 'gold', '2018Q4', '2025Q4', x => x > 0],
  ];
  console.log('\nSOFT asset-direction checks (printed, not counted):');
  for (const [name, k, a, b, ok] of rows) {
    const x = chg(k, a, b);
    console.log('  ' + name.padEnd(28) + `${a}->${b}`.padEnd(18) + `${(x * 100).toFixed(0)}%`.padStart(7) + '  ' + (ok(x) ? 'ok' : 'SOFT-MISS'));
  }
  const s22 = hist[ix('2022Q4')], s21 = hist[ix('2021Q4')];
  console.log(`  gov10y 2021Q4 -> 2022Q4: ${(s21.rates.gov10y * 100).toFixed(2)}% -> ${(s22.rates.gov10y * 100).toFixed(2)}%  (bond price must fall as the yield rises)`);
}

// ---------------------------------------------------------------- calibration scorecard
function scorecard(data, hist) {
  const S = data.series, D = data.dates;
  const idx = d => D.indexOf(d);
  const sl = (arr, a, b) => arr.slice(idx(a), idx(b) + 1);
  const H = hist.map(s => s.assets.housing.price);
  const rows = [];
  const add = (name, val, target, ok) => rows.push({ name, val, target, ok });
  console.log('\n=== CALIBRATION SCORECARD (real US_Q, history mode, no real outcomes fed in) ===');
  const iPk = H.indexOf(Math.max(...sl(H, '1995Q1', '2010Q4')));
  const trough = Math.min(...sl(H, '2010Q1', '2012Q4'));
  const dd = trough / H[iPk] - 1;
  add('1a house index peak date', D[iPk], '2005Q4..2007Q2', iPk >= idx('2005Q4') && iPk <= idx('2007Q2'));
  add('1b peak-to-trough by 2010-12', (dd * 100).toFixed(1) + '%', '<= -15%', dd <= -0.15);
  const U = hist.map(s => s.macro.unemployment);
  const u0910 = Math.max(...sl(U, '2009Q1', '2010Q4'));
  const u20 = Math.max(...sl(U, '2020Q1', '2020Q4'));
  add('2a unemployment peak 2009-10', (u0910 * 100).toFixed(1) + '%', '8..11%', u0910 >= 0.08 && u0910 <= 0.11);
  const uAll = Math.max(...sl(U, '2008Q1', '2016Q4'));
  add('2a2 max unemployment 2008-16', (uAll * 100).toFixed(1) + '%', '<= 12%', uAll <= 0.12);
  add('2b unemployment 2020 spike', (u20 * 100).toFixed(1) + '%', '>= 9%', u20 >= 0.09);
  const P = hist.map(s => s.macro.inflation);
  const pi2122 = Math.max(...sl(P, '2021Q1', '2022Q4'));
  add('3 inflation peak 2021-22', (pi2122 * 100).toFixed(1) + '%', '>= 6%', pi2122 >= 0.06);
  const Hend = H[H.length - 1], Hreal = S.houseIndex[D.length - 1];
  add('4a end-2025 house vs real', `${Hend.toFixed(0)} vs ${Hreal.toFixed(0)}`, 'within +-40%', Math.abs(Hend / Hreal - 1) <= 0.4);
  const hd = hist.map(s => s.debt.household / s.macro.gdpNominal);
  const iHd = hd.indexOf(Math.max(...sl(hd, '1995Q1', '2012Q4')));
  add('4b hh debt/GDP peak 2005-09, above start', `${D[iHd]} ${(hd[iHd] * 100).toFixed(0)}% (start ${(hd[0] * 100).toFixed(0)}%)`, 'peak 2005..2009, +15%', iHd >= idx('2005Q1') && iHd <= idx('2009Q4') && hd[iHd] > hd[0] * 1.15);
  add('4c hh debt/GDP 2020 below peak', `${(hd[idx('2020Q4')] * 100).toFixed(0)}% vs peak ${(hd[iHd] * 100).toFixed(0)}%`, 'fall >= 8pp', hd[iHd] - hd[idx('2020Q4')] >= 0.08);
  const CI = hist.map(s => s.extra.creditImpulse);
  const ciMin = Math.min(...sl(CI, '2008Q1', '2010Q4'));
  const ciNeg = sl(CI, '2008Q3', '2010Q4').filter(x => x < 0).length;
  add('5a credit impulse negative 2008-10', `min ${(ciMin * 100).toFixed(1)}pp, neg ${ciNeg}/10q`, 'min<0 & >=6/10q', ciMin < 0 && ciNeg >= 6);
  const DS = hist.map(s => s.household.dsr);
  const iDs = DS.indexOf(Math.max(...sl(DS, '1995Q1', '2015Q4')));
  add('5b DSR peak date', D[iDs], '2006..2008', iDs >= idx('2006Q1') && iDs <= idx('2008Q4'));
  const E = hist.map(s => s.assets.equity.price), eqChg = (a, b) => E[idx(b)] / E[idx(a)] - 1;
  const eqDD = eqChg('2007Q4', '2009Q1'), eqUp = eqChg('2009Q1', '2021Q4');
  let eqMaxQ = 0, eqMaxD = '';
  for (let t = 1; t < E.length; t++) { const q = Math.abs(E[t] / E[t - 1] - 1); if (q > eqMaxQ) { eqMaxQ = q; eqMaxD = D[t]; } }
  const eqEndR = E[E.length - 1] / S.equityIndex[E.length - 1] - 1;
  add('6a equity 2007Q4->2009Q1', (eqDD * 100).toFixed(0) + '%', '-55%..-30%', eqDD >= -0.55 && eqDD <= -0.30);
  add('6b equity 2009Q1->2021Q4', (eqUp * 100).toFixed(0) + '%', '+150%..+450%', eqUp >= 1.5 && eqUp <= 4.5);
  add('6c max single-quarter equity move', (eqMaxQ * 100).toFixed(0) + '% ' + eqMaxD, '<= 25%', eqMaxQ <= 0.25);
  add('6d end-2025 equity vs real', `${E[E.length - 1].toFixed(0)} vs ${S.equityIndex[E.length - 1].toFixed(0)}`, 'within +-50%', Math.abs(eqEndR) <= 0.5);
  const piAvg = P.slice(idx('2005Q1'), idx('2007Q4') + 1).reduce((a, b) => a + b, 0) / 12;
  add('7a CPI avg 2005-07', (piAvg * 100).toFixed(1) + '%', '<= 4.0%', piAvg <= 0.04);
  const b2 = hist.findIndex((s, i) => s.cycles.long.fork === 'B2' && (i === 0 || hist[i - 1].cycles.long.fork !== 'B2') && i >= idx('2006Q3') && i <= idx('2009Q2'));
  add('7b long cycle takes the B2 fork', b2 >= 0 ? D[b2] : 'never in window', '2006Q3..2009Q2', b2 >= 0);
  console.log('check'.padEnd(42) + 'value'.padEnd(34) + 'target'.padEnd(24) + 'result');
  for (const r of rows) console.log(r.name.padEnd(42) + String(r.val).padEnd(34) + String(r.target).padEnd(24) + (r.ok ? 'PASS' : 'FAIL'));
  console.log(`  ${rows.filter(r => r.ok).length}/${rows.length} pass`);
  assetSoftChecks(data, hist);
  const uSoft = hist.map(s => s.macro.unemployment), u03 = uSoft[idx('2003Q1')], u2325 = Math.max(...uSoft.slice(idx('2023Q1')));
  console.log(`
SOFT macro checks (printed, not counted):
  unemployment 2003Q1 ${(u03 * 100).toFixed(1)}% (real 5.9%): ${u03 <= 0.07 ? 'ok' : 'SOFT-MISS'}
  max unemployment 2023-25 ${(u2325 * 100).toFixed(1)}% (real ~4%): ${u2325 <= 0.08 ? 'ok' : 'SOFT-MISS'}`);
  console.log('\nmodel/real    house        unemp%      infl%       DSR%        hhDebt/GDP%   policy%  newLoans  ciPP');
  const g = (a, t, k = 100, d = 1) => (a[t] == null ? ' - ' : (a[t] * k).toFixed(d));
  for (let t = 0; t < hist.length; t += 8) {
    const s = hist[t];
    console.log(D[t].padEnd(10) + `${s.assets.housing.price.toFixed(0)}/${S.houseIndex[t].toFixed(0)}`.padEnd(13) + `${(U[t] * 100).toFixed(1)}/${g(S.unemployment, t)}`.padEnd(12) +
      `${(P[t] * 100).toFixed(1)}/${g(S.cpiYoY, t)}`.padEnd(12) + `${(DS[t] * 100).toFixed(1)}/${g(S.hhDsr, t)}`.padEnd(12) +
      `${(hd[t] * 100).toFixed(0)}/${g(S.hhDebtGdp, t, 100, 0)}`.padEnd(14) + `${(s.rates.policy * 100).toFixed(1)}`.padEnd(9) + `${s.flows.newLoans.toFixed(0)}`.padEnd(10) + `${(CI[t] * 100).toFixed(1)}`);
  }
  return rows;
}
function freeScore(h) {
  console.log('\n=== FREE MODE ratchet (to 2050Q4) ===');
  const pol = h.map(s => s.rates.policy), dg = h.map(s => (s.debt.household + s.debt.firm) / s.macro.gdpNominal);
  const troughs = [];
  for (let t = 8; t < pol.length - 8; t++) {
    const w = pol.slice(t - 8, t + 9);
    if (pol[t] === Math.min(...w) && pol[t] < 0.03 && (!troughs.length || t - troughs[troughs.length - 1] >= 12)) troughs.push(t);
  }
  console.log('  policy troughs:', troughs.map(t => `${h[t].date}:${(pol[t] * 100).toFixed(2)}%`).join('  ') || 'none');
  const mono = troughs.every((t, i) => i === 0 || pol[t] <= pol[troughs[i - 1]] + 0.0005);
  console.log(`  rate troughs non-increasing: ${troughs.length >= 2 && mono ? 'PASS' : 'FAIL'}`);
  console.log(`  private debt/GDP at 2000/2010/2020/2030/2040/2050: ${[20, 60, 100, 140, 180, 220].map(i => (dg[i] * 100).toFixed(0)).join(' / ')}%`);
  console.log(`  debt/GDP trending up (2050 > 2025 and 2040 > 2020): ${dg[220] > dg[120] && dg[180] > dg[100] ? 'PASS' : 'FAIL'}`);
  console.log('  house 2025/2035/2050:', [120, 160, 220].map(i => h[i].assets.housing.price.toFixed(0)).join(' / '), ' infl% 2050:', (h[220].macro.inflation * 100).toFixed(1), ' u% 2050:', (h[220].macro.unemployment * 100).toFixed(1));
}

// ---------------------------------------------------------------- rule-experiment checks (lessons rely on these)
function experiments(data) {
  console.log('=== RULE EXPERIMENTS (real data) ===');
  const run = (cfg, upto = 123) => {
    const sim = createSim({ data, mode: 'history' });
    cfg(sim);
    while (sim.t < upto) sim.step();
    return sim;
  };
  const at = (sim, d) => sim.snapshot('model', data.dates.indexOf(d));
  // 1. neutral central bank
  const hold = run(sim => { sim.setRuleEnabled('cb_real_path', false); sim.setRuleEnabled('cb_taylor', false); }, 80);
  const p0 = hold.snapshot('model', 0).rates.policy;
  assert(hold.history().every(x => x.rates.policy === p0), 'cb neutral: policy rate must stay constant');
  console.log('  cb_real_path+cb_taylor off -> policy constant at ' + (p0 * 100).toFixed(2) + '%: PASS');
  // 2. setRuleParam
  const r = createSim({ data });
  assert(r.setRuleParam('bank_loosen', 'max', 1.4) === true && r.rules.find(x => x.id === 'bank_loosen').params.max === 1.4, 'setRuleParam');
  assert(r.setRuleParam('nope', 'x', 1) === false, 'setRuleParam unknown');
  r.reset(); assert(r.rules.find(x => x.id === 'bank_loosen').params.max === 1.25, 'reset restores params');
  // 3. bank_loosen.max sweep
  const rows = [1.0, 1.25, 1.5].map(m => {
    const sm = run(sim => sim.setRuleParam('bank_loosen', 'max', m), 123);
    const a = at(sm, '2006Q2'), b = at(sm, '2005Q4');
    return { m, h: a.assets.housing.price, dsr: a.household.dsr, ap: a.bank.approval, nl: b.flows.newLoans, hd: a.debt.household / a.macro.gdpNominal };
  });
  console.log('  bank_loosen.max   house@2006Q2   approval   newLoans@2005Q4   hhDebt/GDP@2006Q2');
  rows.forEach(x => console.log('   ' + String(x.m).padEnd(15) + x.h.toFixed(0).padEnd(15) + x.ap.toFixed(2).padEnd(11) + x.nl.toFixed(0).padEnd(18) + (x.hd * 100).toFixed(0) + '%'));
  const spread = (rows[2].h - rows[0].h) / rows[1].h;
  console.log('  house spread max1.5 vs max1.0: ' + (spread * 100).toFixed(1) + '%  (want >= 3%): ' + (spread >= 0.03 ? 'PASS' : 'FAIL'));
  // 4. bank tightening on/off
  const mk = off => run(sim => { if (off) for (const id of ['bank_tighten_losses', 'bank_tighten_collateral', 'bank_rebuild_capital']) sim.setRuleEnabled(id, false); }, 123);
  const on = mk(false), off = mk(true);
  const tr = sm => Math.min(...sm.history().slice(data.dates.indexOf('2007Q1'), data.dates.indexOf('2012Q4') + 1).map(x => x.assets.housing.price));
  const pk = sm => Math.max(...sm.history().slice(0, data.dates.indexOf('2008Q1')).map(x => x.assets.housing.price));
  const dd = sm => tr(sm) / pk(sm) - 1;
  console.log(`  bank tightening ON : peak ${pk(on).toFixed(0)} trough 2007-12 ${tr(on).toFixed(0)} (${(dd(on) * 100).toFixed(1)}%), newLoans 2009Q1 ${at(on, '2009Q1').flows.newLoans.toFixed(0)}, unemp max ${(Math.max(...on.history().slice(48, 72).map(x => x.macro.unemployment)) * 100).toFixed(1)}%`);
  console.log(`  bank tightening OFF: peak ${pk(off).toFixed(0)} trough 2007-12 ${tr(off).toFixed(0)} (${(dd(off) * 100).toFixed(1)}%), newLoans 2009Q1 ${at(off, '2009Q1').flows.newLoans.toFixed(0)}, unemp max ${(Math.max(...off.history().slice(48, 72).map(x => x.macro.unemployment)) * 100).toFixed(1)}%`);
  console.log('  tightening makes the fall deeper by >= 5pp: ' + (dd(on) - dd(off) <= -0.05 ? 'PASS' : 'FAIL'));
  // 5. household behaviour off -> shallower
  const hhOff = run(sim => { for (const id of ['hh_overhang', 'hh_forced_sales', 'hh_deleverage', 'hh_chase']) sim.setRuleEnabled(id, false); }, 123);
  console.log(`  household rules OFF: trough 2007-12 ${(dd(hhOff) * 100).toFixed(1)}% (vs ON ${(dd(on) * 100).toFixed(1)}%)`);
}

// ---------------------------------------------------------------- numbers quoted in the cycle lessons (src/data/lessons.js 1-3)
// Same protocol as the UI experiment step: baseline sim to `from`, apply the setup, run to `until`, metrics over the quarters after `from`.
function lessonNumbers(US_Q) {
  console.log('\n=== LESSON NUMBERS (quoted in src/data/lessons.js cycle lessons 1-3; update the lesson text when these move) ===');
  const T = d => US_Q.dates.indexOf(d);
  const exp = (from, until, setup) => {
    const sim = createSim({ data: US_Q, mode: 'history' });
    while (sim.t < T(from)) sim.step();
    setup(sim);
    while (sim.t < T(until)) sim.step();
    return sim.history().slice(T(from) + 1, T(until) + 1);
  };
  const mx = (h, f) => Math.max(...h.map(f)), mn = (h, f) => Math.min(...h.map(f)), end = (h, f) => f(h[h.length - 1]);
  const H = x => x.assets.housing.price;
  const maxDD = h => { let pk = -Infinity, dd = 0; for (const x of h) { pk = Math.max(pk, H(x)); dd = Math.min(dd, H(x) / pk - 1); } return dd; };
  // lesson 1: 1997Q1 -> 2006Q2, bank_loosen.max 1.0 / 1.25 (default) / 1.5
  const l1 = [1.0, 1.25, 1.5].map(m => exp('1997Q1', '2006Q2', sim => sim.setRuleParam('bank_loosen', 'max', m)));
  console.log('  lesson 1 (1997Q1->2006Q2)  bank_loosen.max 1.0 | 1.25 | 1.5:   house idx ' + l1.map(h => end(h, H).toFixed(0)).join(' | ') +
    '   (text: ~185 | ~210 | ~196)   DSR ' + l1.map(h => (end(h, x => x.household.dsr) * 100).toFixed(1) + '%').join(' | '));
  // lesson 2: 2003Q1 -> 2008Q1, real path vs frozen rate
  const l2 = [() => {}, sim => { sim.setRuleEnabled('cb_real_path', false); sim.setRuleEnabled('cb_taylor', false); }].map(f => exp('2003Q1', '2008Q1', f));
  console.log('  lesson 2 (2003Q1->2008Q1)  real | frozen:   house peak ' + l2.map(h => mx(h, H).toFixed(0)).join(' | ') + '   end house ' + l2.map(h => end(h, H).toFixed(0)).join(' | ') +
    '   end mortgageEff ' + l2.map(h => (end(h, x => x.rates.mortgageEff) * 100).toFixed(1) + '%').join(' | ') + '   (text: peak ~210 | ~233, mortgage ~7.2% | ~5.8%, ~-8% 2006Q2->2008Q1 real)');
  const r2 = l2[0], i06 = r2.findIndex(x => x.date === '2006Q2');
  console.log('      real path: house 2006Q2 -> 2008Q1 ' + ((H(r2[r2.length - 1]) / H(r2[i06]) - 1) * 100).toFixed(1) + '%');
  // lesson 3: 2006Q1 -> 2010Q4, bank tightening on / off
  const l3 = [() => {}, sim => { sim.setRuleEnabled('bank_tighten_collateral', false); sim.setRuleEnabled('bank_tighten_losses', false); }].map(f => exp('2006Q1', '2010Q4', f));
  console.log('  lesson 3 (2006Q1->2010Q4)  tightening ON | OFF:   max drawdown ' + l3.map(h => (maxDD(h) * 100).toFixed(1) + '%').join(' | ') + '   newLoans 2009Q1 ' + l3.map(h => h.find(x => x.date === '2009Q1').flows.newLoans.toFixed(0)).join(' | ') +
    '   end house ' + l3.map(h => end(h, H).toFixed(0)).join(' | ') + '   min approval ' + l3.map(h => mn(h, x => x.bank.approval).toFixed(2)).join(' | ') + '   end DSR ' + l3.map(h => (end(h, x => x.household.dsr) * 100).toFixed(1) + '%').join(' | ') +
    '   (text: dd ~-17% | ~-6%, newLoans ~116 | ~192)');
}

// ---------------------------------------------------------------- rule text generated from live params
function ruleTextChecks(data) {
  console.log('\n=== RULE TEXT vs PARAMS ===');
  const sim = createSim({ data });
  const r = sim.rules.find(x => x.id === 'bank_tighten_losses');
  const before = r.text;
  assert(before.includes('2.8%') && before.includes('8%'), 'rule text quotes live params: ' + before);
  sim.setRuleParam('bank_tighten_losses', 'bad', 0.041);
  assert(r.text.includes('4.1%') && r.text !== before, 'rule text follows setRuleParam: ' + r.text);
  sim.reset(); assert(r.text === before, 'rule text restored by reset');
  // ledger entries quote the live params too
  const s2 = createSim({ data }); s2.setRuleParam('bank_tighten_losses', 'bad', 0.0123);
  while (s2.t < 100) s2.step();
  const e = s2.history().flatMap(x => x.ledger).find(x => x.player === 'bank' && /坏账率 >/.test(x.rule || ''));
  assert(!e || /1\.23%/.test(e.rule), 'ledger rule text quotes live param: ' + (e && e.rule));
  console.log('  PASS: rule text follows params (sim.rules getter + ledger)');
}

// ---------------------------------------------------------------- valves (table, setValve, measured lags)
function valveTableChecks(US_Q) {
  console.log('\n=== VALVES (table + measured lags) ===');
  const sim = createSim({ data: US_Q });
  const LAB = ['立刻', '1–2 季', '2–4 季', '2–3 年'];
  const vs = sim.valves;
  assert(vs.length === 8 && vs.every(v => v.chain.length >= 4 && v.chain.every(l => l.term && l.text && LAB.includes(l.delayLabel) && LAB.includes(l.delayLabelTown))), 'valves: 8 valves with labelled chains');
  assert(vs.every(v => v.value != null && v.min < v.max && v.step > 0 && v.label), 'valves: ranges and current values');
  assert(sim.setValve('saveAdj', 0.03) && sim.valves.find(v => v.id === 'saveAdj').value === 0.03 && sim.valves.find(v => v.id === 'saveAdj').userSet, 'setValve -> valves value');
  assert(sim.setValve('capexMult', 1.2), 'second valve');
  sim.step();
  assert(sim.snapshot('user').extra.capexMult === 1.2 && Math.abs(sim.snapshot('user').household.savingRate - sim.snapshot('model').household.savingRate) > 1e-4, 'valves of two players act together on the user branch');
  for (const sc of ['us', 'town']) {
    probeScenario(sc);
    let ok = 0, bad = 0;
    for (const v of VALVES) {
      const pr = valveProbe(v.id);
      for (const l of v.chain) {
        const m = measuredLabel(pr.rows, l.term), want = sc === 'us' ? l.delayLabel : l.delayLabelTown;
        if (m === want) ok++; else { bad++; assert(false, `valve ${v.id} ${sc} ${l.term}: label ${want} but measured ${m}`); }
      }
    }
    console.log(`  ${sc}: ${ok} chain labels match the measured lag, ${bad} mismatches`);
  }
  probeScenario('us');
}

// ---------------------------------------------------------------- town scenario
function townChecks() {
  console.log('\n=== TOWN scenario (万元) ===');
  const sum = (a, f) => a.reduce((x, y) => x + f(y), 0);
  const chk = (sim, tag) => {
    const s = sim.snapshot(), T = s.town;
    assert(Math.abs(sum(T.households, h => h.debt) - s.debt.household) < 1e-6, tag + ': sum(debt) = Dh');
    assert(Math.abs(sum(T.households, h => h.deposit) + T.shop.deposit + T.bank.pocket - s.money.M) < 1e-6, tag + ': sum(deposits) = M');
    assert(Math.abs(sum(T.households, h => h.house) - s.assets.housing.level) < 1e-6, tag + ': sum(house) = housing level');
    assert(Math.abs(sum(T.households, h => h.income) - s.household.income) < 1e-6, tag + ': sum(income) = household income');
    assert(sum(T.households, h => h.houses) === 10, tag + ': 10 houses');
    assert(Math.abs((s.budget.M_after - s.budget.M_before) - s.budget.net) < 1e-9, tag + ': budget identity');
    assert(Math.abs(s.iou.bankTotal - (s.debt.household + s.debt.firm)) < 1e-9, tag + ': iou = debt');
    return s;
  };
  const sim = createSim({ scenario: 'town' });
  assert(sim.scenario === 'town' && sim.delays === false, 'town defaults: delays off');
  const s0 = chk(sim, 'start');
  assert(s0.town.households.map(h => h.name).join() === '小王,老李,阿珍,大刘,小陈', 'five names');
  const act = a => { const before = sim.snapshot(); const r = sim.townAction(a); const after = sim.snapshot(); return { r, before, after }; };
  let { r, before, after } = act({ type: 'loan', who: '小王', amount: 50 });
  assert(r.ok && Math.abs(after.money.M - before.money.M - 50) < 1e-9 && after.debt.household - before.debt.household === 50 && after.budget.pumpedIn.loans === 50 && after.budget.net === 50, 'loan: pump +50 water, +50 IOU');
  assert(after.iou.household - before.iou.household === 50, 'loan: IOU tank +50');
  assert(after.town.households[0].deposit - before.town.households[0].deposit === 50 && after.town.households[0].debt - before.town.households[0].debt === 50, 'loan: borrower deposit and debt +50');
  chk(sim, 'after loan');
  ({ r, before, after } = act({ type: 'buyHouse', who: '小王', from: '老李' }));
  assert(r.ok && Math.abs(after.money.M - before.money.M) < 1e-9, 'buyHouse: water total unchanged');
  assert(after.assets.housing.level > before.assets.housing.level && after.assets.housing.price > before.assets.housing.price, 'buyHouse: housing pool level up');
  assert(after.town.households[0].deposit < before.town.households[0].deposit && after.town.households[1].deposit > before.town.households[1].deposit, 'buyHouse: water moves buyer -> seller');
  assert(after.town.households[0].houses === 2 && after.town.households[1].houses === 2, 'buyHouse: ownership moves');
  assert(after.flows.toHousing > 0 && after.budget.net === before.budget.net, 'buyHouse: toHousing pipe, budget net unchanged');
  chk(sim, 'after buyHouse');
  ({ r, before, after } = act({ type: 'repay', who: '小王', amount: 20 }));
  assert(r.ok && Math.abs((before.money.M - after.money.M) - 20) < 1e-9 && Math.abs((before.iou.household - after.iou.household) - 20) < 1e-9 && after.budget.drainedOut.repay === 20, 'repay: drain: water -20 and IOU -20');
  chk(sim, 'after repay');
  ({ r, before, after } = act({ type: 'payInterest', who: '大刘', amount: 2 }));
  assert(r.ok && Math.abs(after.money.M - before.money.M) < 1e-9 && after.town.bank.pocket - before.town.bank.pocket === 2 && after.town.households[3].deposit - before.town.households[3].deposit === -2 && after.flows.interestPaid === 2, 'payInterest: transfer to bank, M unchanged');
  ({ r, before, after } = act({ type: 'spend', who: '老李', amount: 5 }));
  assert(r.ok && Math.abs(after.money.M - before.money.M) < 1e-9 && after.town.shop.deposit - before.town.shop.deposit === 5 && after.flows.toConsumption === 5, 'spend: to shop / goods channel, M unchanged');
  chk(sim, 'after spend');
  ({ r } = act({ type: 'buyHouse', who: '小陈', from: '老李' }));
  assert(r.ok === false && r.reason, 'buyHouse with insufficient deposit is refused with a reason');
  assert(sim.snapshot().ledger.length >= 5 && sim.snapshot().ledger.every(e => e.kind), 'town ledger entry for each action');
  // the engine keeps running after actions; determinism
  for (let i = 0; i < 6; i++) { sim.step(); chk(sim, 'step ' + i); }
  const sim2 = createSim({ scenario: 'town' });
  for (const a of [{ type: 'loan', who: '小王', amount: 50 }, { type: 'buyHouse', who: '小王', from: '老李' }, { type: 'repay', who: '小王', amount: 20 }, { type: 'payInterest', who: '大刘', amount: 2 }, { type: 'spend', who: '老李', amount: 5 }]) sim2.townAction(a);
  for (let i = 0; i < 6; i++) sim2.step();
  assert(JSON.stringify(sim.history()) === JSON.stringify(sim2.history()), 'town determinism');
  // neutral town stays sane for 3 years
  const calm = createSim({ scenario: 'town' }); for (let i = 0; i < 12; i++) calm.step();
  const c = calm.snapshot();
  assert(c.macro.unemployment > 0.04 && c.macro.unemployment < 0.08 && Math.abs(c.macro.inflation - 0.02) < 0.01, 'neutral town sane after 12q');
  // delays off = instant repricing, on = lagged
  const mk = d => { const x = createSim({ scenario: 'town', delays: d }); for (let i = 0; i < 2; i++) x.step(); x.setValve('policyRate', 0.07); x.step(); return x.snapshot(); };
  const off = mk(false), on = mk(true);
  assert(Math.abs(off.rates.mortgageEff - off.rates.mortgageNew) < 1e-9 && on.rates.mortgageEff < on.rates.mortgageNew - 0.005, 'delays:false = instant repricing, delays:true = lagged');
  // paradox of thrift: everyone saves more -> shop sales and incomes fall at once
  const run = (setup, n = 4) => { const x = createSim({ scenario: 'town' }); setup(x); const o = []; for (let i = 0; i < n; i++) o.push(x.step()); return o; };
  const base = run(() => {}), thr = run(x => x.townAction({ type: 'saving', adj: 0.05 }));
  assert(thr[0].town.shop.sales < base[0].town.shop.sales * 0.97 && thr[0].household.income < base[0].household.income && thr[1].macro.unemployment > base[1].macro.unemployment, 'paradox of thrift: sales, income down, unemployment up');
  console.log(`  thrift (+5pp saving): q1 shop sales ${thr[0].town.shop.sales.toFixed(1)} vs ${base[0].town.shop.sales.toFixed(1)}, income ${thr[0].household.income.toFixed(1)} vs ${base[0].household.income.toFixed(1)}, unemployment q2 ${(thr[1].macro.unemployment * 100).toFixed(1)}% vs ${(base[1].macro.unemployment * 100).toFixed(1)}%`);
  // Capex: demand pressure first, capacity after a visible (2q) lag
  const base5 = run(() => {}, 5);
  const cx = run(x => x.setValve('capexMult', 1.3), 5);
  assert(cx[0].macro.demandPressure > base5[0].macro.demandPressure + 0.02 && Math.abs(cx[0].macro.capacityPotential - base5[0].macro.capacityPotential) < 1e-9 && cx[2].macro.capacityPotential > base5[2].macro.capacityPotential + 0.5, 'capex: demand pressure at q1, capacity only from q3');
  console.log(`  capex x1.3: pressure q1 ${(cx[0].macro.demandPressure * 100).toFixed(1)}% vs ${(base5[0].macro.demandPressure * 100).toFixed(1)}%; capacity gain q1/q2/q3 +${[0, 1, 2].map(i => (cx[i].macro.capacityPotential - base5[i].macro.capacityPotential).toFixed(1)).join('/')}`);
  // investor risk-off raises the cash share of new money
  const share = x => x.flows.toCash / (x.flows.toCash + x.flows.toFinancial + x.flows.toHousing);
  const ro = run(x => x.townAction({ type: 'riskOff', on: true }), 3);
  assert(share(ro[1]) > share(base[1]) * 1.4 && ro[1].flows.toBond / ro[1].flows.toFinancial > base[1].flows.toBond / base[1].flows.toFinancial, 'risk-off: cash share of new money up, bonds up within financial');
  console.log(`  risk-off: cash share of new money ${(share(base[1]) * 100).toFixed(1)}% -> ${(share(ro[1]) * 100).toFixed(1)}%`);
  console.log('  TOWN checks done');
}

// ---------------------------------------------------------------- two cycle dials (long + short): timeline, hysteresis, pauses
function cycleChecks(US_Q) {
  console.log('\n=== CYCLE DIALS: long (大周期) + short (小周期), timeline ===');
  const LORD = [1, 2, 5, 6, 7, 8];
  // allowed short moves (regimes.js 2026-10-29 redesign): hot -> ease / tight -> ease directly when the bank cuts; ease -> 过热·物价 skips 扩张 (2021)
  // expand -> ease (2026-10-29): a cutting round without a tightening round before it (Fed 1998, RBA 2011-16 / 2019-20) reads 降息
  const SNEXT = { expand: ['hotP', 'hotA', 'tight', 'ease'], hotP: ['hotA', 'tight', 'ease', 'expand'], hotA: ['tight', 'ease', 'expand'], tight: ['ease', 'expand'], ease: ['expand', 'hotP'] };
  const isTop = k => k === 'hotP' || k === 'hotA';
  // a short-cycle top: entering 过热, or 收紧 picking up the kind of top it is in (`via` set / re-labelled while the bank is already hiking)
  const topAt = (h, i) => { const a = h[i].cycles.short, b = i > 0 ? h[i - 1].cycles.short : null;
    return !!b && ((isTop(a.key) && a.key !== b.key) || (a.key === 'tight' && !!a.via && a.via !== b.via && !isTop(b.key))); };
  for (const mode of ['history', 'free']) {
    const h = runAll(US_Q, mode).sim.history();
    const lc = [], sc = [];
    h.forEach((s, i) => {
      const L = s.cycles.long, S = s.cycles.short;
      if (i === 0 || L.stage !== h[i - 1].cycles.long.stage) lc.push({ i, date: s.date, stage: L.stage, label: L.label });
      if (i === 0 || S.key !== h[i - 1].cycles.short.key) sc.push({ i, date: s.date, phase: S.key, label: S.label });
    });
    // clockwise only (long may wrap 8 -> 1 and skip at most one stage; short moves along SNEXT)
    let cw = true;
    for (let k = 1; k < lc.length; k++) { const a = LORD.indexOf(lc[k - 1].stage), b = LORD.indexOf(lc[k].stage); if (!(b === (a + 1) % 6 || b === (a + 2) % 6)) cw = false; }
    for (let k = 1; k < sc.length; k++) if (!SNEXT[sc[k - 1].phase].includes(sc[k].phase)) cw = false;
    assert(cw, mode + ': cycle stages only move clockwise');
    const span = arr => arr.map((x, j) => `${x.date} ${x.label}${j + 1 < arr.length ? ' (' + (arr[j + 1].i - x.i) + 'q)' : ' (…end)'}`).join('\n      ');
    console.log(`  [${mode}] LONG stage changes: ${lc.length - 1}\n      ${span(lc)}`);
    const tops = h.map((x, i) => (topAt(h, i) ? `${x.date} ${x.cycles.short.top || x.cycles.short.via}` : null)).filter(Boolean);
    console.log(`  [${mode}] SHORT phase changes: ${sc.length - 1}  (tops: ${tops.join(', ') || 'none'})`);
    const pz = h.flatMap(s => s.pauses.map(q => q.code));
    assert(!pz.includes('RING_STAGE'), mode + ': no RING_STAGE pause any more');
    assert(pz.filter(c => c === 'LONG_STAGE').length === lc.length - 1, mode + ': one LONG_STAGE pause per long change');
    assert(!pz.includes('SHORT_FORK'), mode + ': no SHORT_FORK pause any more (B1/B2 belong to the long cycle)');
    assert(pz.filter(c => c === 'SHORT_TOP').length === tops.length, mode + `: one SHORT_TOP pause per short-cycle top (${pz.filter(c => c === 'SHORT_TOP').length} vs ${tops.length})`);
    const forks = h.filter((x, i) => x.cycles.long.fork === 'B2' && (i === 0 || h[i - 1].cycles.long.fork !== 'B2')).length;
    assert(pz.filter(c => c === 'LONG_FORK').length === forks, mode + ': one LONG_FORK pause per B2 fork entry');
    assert(h.every(x => ['expand', 'hot', 'tight', 'ease'].includes(x.cycles.short.phase)), mode + ': short phase is one of the 4 Dalio steps');
    if (mode === 'history') {
      console.log('      ' + span(sc));
      assert(lc.length - 1 <= 6, 'history: long stage changes <= 6, got ' + (lc.length - 1));
      assert(sc.length - 1 <= 20, 'history: short phase changes <= 20, got ' + (sc.length - 1));
      const at = d => h[US_Q.dates.indexOf(d)].cycles.long.stage;
      assert([1, 2].includes(at('2006Q4')), 'history: long stage 2006Q4 is 1 or 2: ' + at('2006Q4'));
      assert([5, 6, 7].includes(at('2012Q4')), 'history: long stage 2012Q4 is 5/6/7: ' + at('2012Q4'));
      // >= 4 (was 6): entering ⑥ from ⑤ needs 4 quarters now (LONG_N_TO), every other move still 6
      const minDwell = Math.min(...lc.slice(0, -1).map((x, j) => lc[j + 1].i - x.i));
      assert(lc.length < 2 || minDwell >= 4, 'history: every long stage lasts >= 4 quarters, min ' + minDwell);
      assert(tops.length > 0, 'history: the short cycle reaches a top');
      const I = d => US_Q.dates.indexOf(d), win = (a, b) => h.slice(I(a), I(b) + 1);
      const first = (pred, a, b) => { const k = win(a, b).findIndex(pred); return k < 0 ? null : US_Q.dates[I(a) + k]; };
      const f01 = win('2000Q1', '2003Q4');
      assert(!f01.some(x => x.cycles.long.fork === 'B2'), 'history: 2000-03 easing works (no B2 fork)');
      const back01 = first(x => x.cycles.short.phase === 'expand', '2001Q1', '2005Q4');
      assert(back01 && I(back01) <= I('2004Q2'), 'history: 2001-03 推得动, back to 扩张 by 2004Q2: ' + back01);
      assert(h[I('2008Q4')].cycles.short.handoff === 'no', 'history: 2008Q4 easing does not restart credit (handoff no)');
      const no0812 = win('2008Q1', '2011Q4').filter(x => x.cycles.short.phase === 'ease' && (x.cycles.long.fork === 'B2' || [5, 6].includes(x.cycles.long.stage)));
      // >= 10 (was 12): since 2026-10-30 B2 needs 3 quarters in a row to be confirmed, so 2008Q1-Q2 read 'B2 pending', not 推不动 yet
      assert(no0812.length >= 10 && no0812.every(x => x.cycles.short.handoff === 'no'), `history: 2008-12 推不动 (handoff 'no' in every ease quarter on B2 / ⑤ / ⑥: ${no0812.length} quarters)`);
      const b2at = first(x => x.cycles.long.fork === 'B2', '1995Q1', '2025Q4'), s5 = first(x => x.cycles.long.stage === 5, '1995Q1', '2025Q4'), s6 = first(x => x.cycles.long.stage === 6, '1995Q1', '2025Q4');
      assert(b2at && I(b2at) >= I('2007Q3') && I(b2at) <= I('2008Q4'), 'history: B2 fork in 2007Q3..2008Q4: ' + b2at);
      assert(s5 && I(s5) >= I('2008Q3') && I(s5) <= I('2009Q4'), 'history: ⑤ entered in 2008Q3..2009Q4: ' + s5);
      assert(s6 && I(s6) <= I('2010Q2'), 'history: ⑥ entered by 2010Q2 (TARP/QE1 2008Q4, ARRA 2009Q1; was 2010Q3 with N=6): ' + s6);
      // the short dial against the real FOMC path (policy rate = cb_real_path in history mode; quarterly averages, so +-1 quarter)
      const POL = h.map(x => x.rates.policy);
      const HIKES = [['1999Q3', '2000Q2'], ['2004Q3', '2006Q2'], ['2016Q1', '2018Q4'], ['2022Q2', '2023Q3']];
      const CUTS = [['2001Q1', '2003Q2'], ['2007Q4', '2008Q4'], ['2019Q3', '2020Q1'], ['2024Q4', null]];
      for (const [a, b] of HIKES) {
        assert(POL[I(b)] - POL[I(a) - 1] >= 0.005, `history: data check, policy rate rises ${a}->${b}`);
        // +-1 quarter: a hiking quarter counts when the dial reads 收紧 then or one quarter later
        const n = I(b) - I(a) + 1;
        let hit = 0; for (let k = I(a); k <= I(b); k++) if (h[k].cycles.short.phase === 'tight' || h[k + 1].cycles.short.phase === 'tight') hit++;
        assert(hit * 2 > n, `history: hiking ${a}->${b} reads 收紧 in most quarters (${hit}/${n})`);
      }
      for (const [a, b] of CUTS) {
        assert(POL[I(a)] < POL[I(a) - 1] - 0.0005 || POL[I(a) + 1] < POL[I(a)] - 0.002, `history: data check, a cut at ${a}`);
        const e = first(x => x.cycles.short.phase === 'ease', a, b || '2025Q4');
        assert(e && I(e) <= I(a) + 1, `history: cutting from ${a}: 降息 within 1 quarter (${e})`);
      }
      const bad = h.map((x, k) => (k >= 2 && x.cycles.short.phase === 'ease' && (POL[k] - POL[k - 1] >= 0.001 || POL[k - 1] - POL[k - 2] >= 0.001) ? x.date : null)).filter(Boolean);
      assert(bad.length === 0, 'history: no 降息 while the policy rate rose (>= 0.1pp) in the last 2 quarters: ' + (bad.join(',') || 'none'));
      // 2026-10-30: no 过热·物价 while the bank is cutting (>= 0.1pp this quarter or over the last 2 quarters)
      const hotCut = h.map((x, k) => (k >= 2 && x.cycles.short.key === 'hotP' && Math.min(POL[k] - POL[k - 1], POL[k] - POL[k - 2]) <= -0.001 ? x.date : null)).filter(Boolean);
      assert(hotCut.length === 0, 'history: no 过热·物价 while the bank cuts: ' + (hotCut.join(',') || 'none'));
      assert(h.every(x => x.cycles.short.phase !== 'tight' || /^收紧(·衰退|（加息）)/.test(x.cycles.short.label)), 'history: 收紧 label is 收紧·衰退 or 收紧（加息）');
      assert(h.some(x => x.cycles.short.label.startsWith('收紧·衰退')) && h.some(x => x.cycles.short.label.startsWith('收紧（加息）')), 'history: both 收紧 sub-labels occur');
      console.log('      FOMC check: hikes ' + HIKES.map(([a, b]) => a + '->' + b).join(', ') + ' | cuts from ' + CUTS.map(c => c[0]).join(', ') + ' | ease starts ' +
        CUTS.map(([a, b]) => first(x => x.cycles.short.phase === 'ease', a, b || '2025Q4')).join(', '));
    }
    const s = h[h.length - 1];
    assert(s.cycles.long.evidence.length > 0 && s.cycles.short.evidence.length > 0 && s.cycles.long.since && s.cycles.short.nextSignal, mode + ': evidence / since / nextSignal present');
  }
}

// ---------------------------------------------------------------- border block (snap.border, WORLD-CONTRACT addendum)
const BORDER_KEYS = ['exports', 'imports', 'netExports', 'fxPerUsd', 'fxChg4q', 'foreignBondBuy', 'foreignBondShare', 'reserveShareUsd'];
function borderChecks(name, hist, cp) {
  let bad = 0;
  for (const s of hist) {
    const b = s.border;
    if (!b || !BORDER_KEYS.every(k => k in b)) { bad++; continue; }
    if (Math.abs(b.netExports - (b.exports - b.imports)) > 1e-9 || !(b.exports >= 0) || !(b.imports >= 0) || !Number.isFinite(b.fxChg4q) || !Number.isFinite(b.foreignBondBuy)) bad++;
    if (b.feedback !== !!cp.borderFeedback) bad++;
    if (cp.iso === 'USA' && b.fxPerUsd !== 1) bad++;
  }
  assert(bad === 0, `${name}: snap.border present with contract keys and netExports = exports - imports (${bad} bad quarters)`);
  const nx = hist.map(s => (s.border ? 4 * s.border.netExports / s.macro.gdpNominal : null));
  const f0 = hist[0].border?.foreignBondShare, f1 = hist[hist.length - 1].border?.foreignBondShare;
  console.log(`  border: feedback ${cp.borderFeedback ? 'ON' : 'off (flows reported only)'}; net exports/GDP start ${(nx[0] * 100).toFixed(1)}%, end ${(nx[nx.length - 1] * 100).toFixed(1)}%; foreign share of gov debt ${f0 ?? '-'} -> ${f1 ?? '-'}`);
}

// ---------------------------------------------------------------- per-country target tables (non-US). Same protocol as the US
// scorecard: history mode, real policy path exogenous, no real outcomes fed in. Rows marked soft are printed, not counted.
function scorecardAUS(data, hist) {
  const S = data.series, D = data.dates, idx = d => D.indexOf(d);
  const sl = (arr, a, b) => arr.slice(idx(a), idx(b) + 1);
  const rows = [];
  const add = (name, val, target, ok, soft = false) => rows.push({ name, val, target, ok, soft });
  const maxDD = arr => { let pk = -Infinity, dd = 0; for (const x of arr) { pk = Math.max(pk, x); dd = Math.min(dd, x / pk - 1); } return dd; };
  console.log('\n=== AUS CALIBRATION SCORECARD (real AUS_Q, history mode, no real outcomes fed in) ===');
  const H = hist.map(s => s.assets.housing.price);
  const dd08 = maxDD(sl(H, '2007Q1', '2009Q4'));
  add('A1a no 2008 house bust (max dd 2007-09)', (dd08 * 100).toFixed(1) + '%', '>= -10%', dd08 >= -0.10);
  const up = H[idx('2007Q4')] / H[0] - 1;
  add('A1b house 1995->2007 rises', (up * 100).toFixed(0) + '%', '>= +80%', up >= 0.8);
  const dd17 = maxDD(sl(H, '2017Q1', '2019Q4'));
  add('A1c 2017-19 house dip', (dd17 * 100).toFixed(1) + '%', '-15%..-2%', dd17 <= -0.02 && dd17 >= -0.15);
  if (S.houseIndex && S.houseIndex[D.length - 1] != null) {
    const r = H[H.length - 1] / S.houseIndex[D.length - 1] - 1;
    add('A1d end-2025 house vs real', `${H[H.length - 1].toFixed(0)} vs ${S.houseIndex[D.length - 1].toFixed(0)}`, 'within +-40%', Math.abs(r) <= 0.4);
  }
  const U = hist.map(s => s.macro.unemployment);
  const u20 = Math.max(...sl(U, '2020Q1', '2021Q2'));
  add('A2a unemployment 2020 spike', (u20 * 100).toFixed(1) + '%', '6.5..8.5% (real ~7.5%)', u20 >= 0.065 && u20 <= 0.085);
  const u09 = Math.max(...sl(U, '2008Q3', '2010Q4'));
  add('A2b unemployment peak 2009-10', (u09 * 100).toFixed(1) + '%', '5..6.8% (real 5.8%)', u09 >= 0.05 && u09 <= 0.068);
  const uMid = Math.max(...sl(U, '2008Q1', '2016Q4'));
  add('A2c max unemployment 2008-16', (uMid * 100).toFixed(1) + '%', '<= 7.0%', uMid <= 0.07);
  const avg = a => a.reduce((p, q) => p + q, 0) / a.length;
  const u2325 = avg(sl(U, '2023Q1', '2025Q4')), u2325r = S.unemployment ? avg(sl(S.unemployment, '2023Q1', '2025Q4')) : null;
  add('A2d unemployment avg 2023-25', `${(u2325 * 100).toFixed(1)}%${u2325r != null ? ` (real ${(u2325r * 100).toFixed(1)}%)` : ''}`, '<= 6.0%', u2325 <= 0.06, true);
  const P = hist.map(s => s.macro.inflation);
  const pi23 = Math.max(...sl(P, '2021Q1', '2023Q4')), iPi = idx('2021Q1') + sl(P, '2021Q1', '2023Q4').indexOf(pi23);
  add('A3a inflation peak 2021-23', `${(pi23 * 100).toFixed(1)}% ${D[iPi]}`, '6..9.5% (real 7.8%)', pi23 >= 0.06 && pi23 <= 0.095);
  const piAvg = sl(P, '2005Q1', '2007Q4').reduce((a, b) => a + b, 0) / 12;
  add('A3b CPI avg 2005-07', (piAvg * 100).toFixed(1) + '%', '<= 4.0%', piAvg <= 0.04);
  const hd = hist.map(s => s.debt.household / s.macro.gdpNominal);
  const hdMax = Math.max(...sl(hd, '2015Q1', '2025Q4'));
  add('A4a hh debt/GDP rises to ~120%', `max 2015-25 ${(hdMax * 100).toFixed(0)}% (start ${(hd[0] * 100).toFixed(0)}%)`, '105..135%', hdMax >= 1.05 && hdMax <= 1.35);
  add('A4b hh debt/GDP 2007 above start', `${(hd[idx('2007Q4')] * 100).toFixed(0)}%`, '>= start + 20pp', hd[idx('2007Q4')] >= hd[0] + 0.2);
  // government debt stays in the real range (no fictitious fiscal stimulus fills a model-made demand hole)
  const gd = hist.map(s => s.gov.debtGdp), gdMax = Math.max(...gd);
  const gdReal = S.govDebtGdp ? Math.max(...S.govDebtGdp.filter(x => x != null)) : null;
  add('A4c gov debt/GDP max 1995-2025', `${(gdMax * 100).toFixed(0)}%${gdReal != null ? ` (real max ${(gdReal * 100).toFixed(0)}%)` : ''}`, '<= 60%', gdMax <= 0.6, true);
  const DS = hist.map(s => s.household.dsr);
  const dDs = DS[idx('2023Q4')] - DS[idx('2022Q2')];
  add('A5a DSR 2022Q2->2023Q4 (variable rates)', `${(dDs * 100).toFixed(1)}pp`, '>= +2pp', dDs >= 0.02);
  const dDs2 = DS[idx('2008Q3')] - DS[idx('2006Q1')];
  add('A5b DSR 2006Q1->2008Q3 (hikes reach DSR)', `${(dDs2 * 100).toFixed(1)}pp`, '>= +1pp', dDs2 >= 0.01);
  const CI = hist.map(s => s.extra.creditImpulse);
  const ciMin = Math.min(...sl(CI, '2008Q1', '2010Q4'));
  add('A5c credit impulse dips 2008-10', `min ${(ciMin * 100).toFixed(1)}pp`, 'min < 0', ciMin < 0);
  const L = hist.map(s => s.cycles.long);
  const five = L.findIndex(x => x.stage === 5), b2 = L.findIndex(x => x.fork === 'B2');
  add('A6 no long-cycle ⑤ in 1995-2025', five >= 0 ? `⑤ at ${D[five]}` : 'never', 'never', five < 0);
  add('A6b no B2 fork in 1995-2025', b2 >= 0 ? `B2 at ${D[b2]}` : 'never', 'never', b2 < 0, true);
  if (S.equityIndex && S.equityIndex[0] != null) {
    const E = hist.map(s => s.assets.equity.price), ch = (a, b) => E[idx(b)] / E[idx(a)] - 1;
    let mq = 0; for (let t = 1; t < E.length; t++) mq = Math.max(mq, Math.abs(E[t] / E[t - 1] - 1));
    add('A7a equity 2007Q4->2009Q1', (ch('2007Q4', '2009Q1') * 100).toFixed(0) + '%', '-55%..-25% (ASX ~-45%)', ch('2007Q4', '2009Q1') >= -0.55 && ch('2007Q4', '2009Q1') <= -0.25);
    add('A7b max single-quarter equity move', (mq * 100).toFixed(0) + '%', '<= 25%', mq <= 0.25);
    const er = E[E.length - 1] / S.equityIndex[D.length - 1] - 1;
    add('A7c end-2025 equity vs real', `${E[E.length - 1].toFixed(0)} vs ${S.equityIndex[D.length - 1].toFixed(0)}`, 'within +-50%', Math.abs(er) <= 0.5);
  }
  // the cash-rate path is an INPUT in history mode: its shape is checked on the data (sanity), and the Taylor rule against it (soft)
  const pr = S.policyRate, prMin = Math.min(...pr.filter(x => x != null)), prEnd = Math.max(...sl(pr, '2022Q1', '2025Q4'));
  add('A8a data: cash 7.5% -> 0.1% -> peak 4.35%', `${(pr[0] * 100).toFixed(2)}% -> ${(prMin * 100).toFixed(2)}% -> ${(prEnd * 100).toFixed(2)}%`, 'input shape', pr[0] >= 0.07 && prMin <= 0.002 && prEnd >= 0.035, true);
  const tay = (() => { const sim = createSim({ data, mode: 'history', country: COUNTRY }); sim.setRuleEnabled('cb_real_path', false); while (!sim.done) sim.step(); return sim.history().map(s => s.rates.policy); })();
  const xs = pr.map((x, i) => [x, tay[i]]).filter(([x]) => x != null), mx = a => a.reduce((p, q) => p + q, 0) / a.length;
  const ma = mx(xs.map(q => q[0])), mb = mx(xs.map(q => q[1]));
  const corr = xs.reduce((p, [a, b]) => p + (a - ma) * (b - mb), 0) / Math.sqrt(xs.reduce((p, [a]) => p + (a - ma) ** 2, 0) * xs.reduce((p, [, b]) => p + (b - mb) ** 2, 0));
  add('A8b Taylor path vs RBA cash rate (corr)', corr.toFixed(2), '>= 0.6', corr >= 0.6, true);
  console.log('check'.padEnd(42) + 'value'.padEnd(34) + 'target'.padEnd(24) + 'result');
  for (const r of rows) console.log(r.name.padEnd(42) + String(r.val).padEnd(34) + String(r.target).padEnd(24) + (r.ok ? 'PASS' : 'FAIL') + (r.soft ? ' (soft)' : ''));
  const hard = rows.filter(r => !r.soft);
  console.log(`  ${hard.filter(r => r.ok).length}/${hard.length} pass (soft rows not counted)`);
  console.log('\nmodel/real    house        unemp%      infl%       DSR%        hhDebt/GDP%   policy%  10y%   nx/GDP%');
  const g = (a, t, k = 100, d = 1) => (!a || a[t] == null ? ' - ' : (a[t] * k).toFixed(d));
  for (let t = 0; t < hist.length; t += 8) {
    const s = hist[t];
    console.log(D[t].padEnd(10) + `${s.assets.housing.price.toFixed(0)}/${S.houseIndex?.[t] != null ? S.houseIndex[t].toFixed(0) : '-'}`.padEnd(13) + `${(U[t] * 100).toFixed(1)}/${g(S.unemployment, t)}`.padEnd(12) +
      `${(P[t] * 100).toFixed(1)}/${g(S.cpiYoY, t)}`.padEnd(12) + `${(DS[t] * 100).toFixed(1)}/${g(S.hhDsr, t)}`.padEnd(12) +
      `${(hd[t] * 100).toFixed(0)}/${g(S.hhDebtGdp, t, 100, 0)}`.padEnd(14) + `${(s.rates.policy * 100).toFixed(1)}`.padEnd(9) + `${(s.rates.gov10y * 100).toFixed(1)}`.padEnd(7) + `${(4 * s.border.netExports / s.macro.gdpNominal * 100).toFixed(1)}`);
  }
  return rows;
}
const COUNTRY_TARGETS = { AUS: scorecardAUS };

if (COUNTRY !== 'USA') {
  // ---- any other country: generic engine checks on its data + its target table
  const { COUNTRY_PARAMS } = await import(pathToFileURL(join(root, 'src/data/country-params.js')).href);
  const file = join(root, `src/data/countries/${COUNTRY.toLowerCase()}-quarterly.js`);
  if (!existsSync(file)) { console.log(`no data yet: ${file}`); process.exit(2); }
  const mod = await import(pathToFileURL(file).href), data = mod[`${COUNTRY}_Q`];
  assert(!!data && data.dates.length === 124, `${COUNTRY}_Q exported with 124 quarters`);
  assert(!!COUNTRY_PARAMS[COUNTRY], `COUNTRY_PARAMS.${COUNTRY} exists (otherwise the engine falls back to USA params)`);
  const cp = COUNTRY_PARAMS[COUNTRY] || COUNTRY_PARAMS.USA;
  const seedKeys = ['gdpNominal', 'hhDebtGdp', 'privateCreditGdp', 'govDebtGdp', 'mortgageRate', 'policyRate', 'cpiYoY', 'unemployment', 'gov10y'];
  const miss = seedKeys.filter(k => !data.series[k] || data.series[k][0] == null);
  console.log(`seed series missing at t=0 (engine falls back to ${COUNTRY} seed defaults): ${miss.join(', ') || 'none'}`);
  assert(createSim({ data, country: COUNTRY }).country === COUNTRY, 'sim.country');
  if (process.argv.includes('--score')) {
    (COUNTRY_TARGETS[COUNTRY] || (() => console.log('no target table for ' + COUNTRY)))(data, runAll(data, 'history').sim.history());
    process.exit(0);
  }
  const h = check(`real ${COUNTRY}_Q`, data, 'history');
  borderChecks(`${COUNTRY} history`, h, cp);
  if (COUNTRY === 'AUS') {
    // the short dial against the RBA cutting rounds (no tightening round before them, so they need the expand -> ease move)
    const I = d => data.dates.indexOf(d);
    for (const [a, b] of [['2011Q4', '2016Q3'], ['2019Q2', '2020Q2']]) {
      const w = h.slice(I(a), I(b) + 1), n = w.filter(x => x.cycles.short.phase === 'ease').length;
      console.log(`  RBA cuts ${a}->${b}: dial reads 降息 in ${n}/${w.length} quarters`);
      assert(n * 2 > w.length, `AUS: RBA cutting ${a}->${b} reads 降息 in most quarters (${n}/${w.length})`);
    }
  }
  if (COUNTRY_TARGETS[COUNTRY]) COUNTRY_TARGETS[COUNTRY](data, h);
  const hf = check(`real ${COUNTRY}_Q`, data, 'free');
  borderChecks(`${COUNTRY} free`, hf, cp);
  freeScore(hf);
  takeoverTest(`real ${COUNTRY}`, data);
  console.log(fails ? `\n${fails} FAILURES` : '\nALL CHECKS PASSED');
  process.exit(fails ? 1 : 0);
}

if (process.argv.includes('--score')) {
  const { US_Q } = await import(pathToFileURL(join(root, 'src/data/us-quarterly.js')).href);
  scorecard(US_Q, runAll(US_Q, 'history').sim.history());
  experiments(US_Q);
  lessonNumbers(US_Q);
  if (!process.argv.includes('--nofree')) freeScore(runAll(US_Q, 'free').sim.history());
  process.exit(0);
}
check('fixture', FIXTURE_US_Q, 'history');
check('fixture', FIXTURE_US_Q, 'free');
takeoverTest('fixture', FIXTURE_US_Q);
const real = join(root, 'src/data/us-quarterly.js');
if (existsSync(real)) {
  const { US_Q } = await import(pathToFileURL(real).href);
  const { COUNTRY_PARAMS } = await import(pathToFileURL(join(root, 'src/data/country-params.js')).href);
  const hUS = check('real US_Q', US_Q, 'history');
  borderChecks('US history', hUS, COUNTRY_PARAMS.USA);
  scorecard(US_Q, hUS);
  freeScore(check('real US_Q', US_Q, 'free'));
  experiments(US_Q);
  lessonNumbers(US_Q);
  takeoverTest('real', US_Q);
  ruleTextChecks(US_Q);
  valveTableChecks(US_Q);
  cycleChecks(US_Q);
}
townChecks();
console.log(fails ? `\n${fails} FAILURES` : '\nALL CHECKS PASSED');
process.exit(fails ? 1 : 0);
