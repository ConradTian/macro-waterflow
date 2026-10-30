// scratch (GBR round): the two cycle dials on GBR REAL data, with the SAME advanceCycles / thresholds as the app (country-params.js GBR).
// Mirrors src/data/real/real-snapshot.js timeline() (the AUS branch: no bad-loan series -> neutral 1%, no quarterly deficit -> 0,
// no interest/tax -> null) on gbr-quarterly.js. Proxies: private credit level = BIS credit/GDP x annualised GDP; PIrel = house index /
// nominal GDP (no population series: overstates price/income by ~0.6%/yr); peRel = equity index / GDP; qeGdp = 0 (no APF series yet).
// node tools/gbr_real_dial.mjs [--model]   (--model: also print the model's dials for the same quarters)
import { computeLamps, advanceCycles } from '../src/engine/regimes.js';
import { countryParams } from '../src/data/country-params.js';
import { GBR_Q as D } from '../src/data/countries/gbr-quarterly.js';
import { createSim } from '../src/engine/sim.js';
const cp = countryParams('GBR'), S = D.series, n = D.dates.length;
const num = x => typeof x === 'number' && Number.isFinite(x);
const R = (k, t) => (S[k] && t >= 0 && t < n && num(S[k][t]) ? S[k][t] : null);
const credit = t => (num(R('privateCreditGdp', t)) && num(R('gdpNominal', t)) ? R('privateCreditGdp', t) * R('gdpNominal', t) : null);
const dsr0 = S.hhDsr.find(num), H0 = R('houseIndex', 0), inc0 = R('gdpNominal', 0), eqg0 = R('equityIndex', 0) / R('gdpNominal', 0);
let sm = null; const smH = [], rows = [];
let prevCyc = null, prev = null;
for (let t = 0; t < n; t++) {
  const C0 = credit(t), C1 = credit(t - 1), gdp = R('gdpNominal', t);
  const flow = num(C0) && num(C1) ? 4 * (C0 - C1) / gdp : null;
  if (flow != null) sm = sm == null ? flow : 0.5 * sm + 0.5 * flow;
  smH.push(flow != null ? sm : null);
  const yoy = (k, lag) => { const a = R(k, t), b = R(k, t - lag); return num(a) && num(b) && b ? a / b - 1 : null; };
  const x = {
    policy: R('policyRate', t), piY: R('cpiYoY', t), u: R('unemployment', t), dsr: R('hhDsr', t) ?? dsr0, bad: 0.01,
    ci: t >= 2 && smH[t] != null && smH[t - 2] != null ? smH[t] - smH[t - 2] : 0,
    pcg: num(C0) && num(credit(t - 4)) ? C0 / credit(t - 4) - 1 : (prev ? prev.pcg : 0.05),
    hpYoY: yoy('houseIndex', 4) ?? 0, hpQ: yoy('houseIndex', 1) ?? 0, hpQPrev: t >= 2 ? R('houseIndex', t - 1) / R('houseIndex', t - 2) - 1 : 0,
    PIrel: (R('houseIndex', t) / H0) / (gdp / inc0), peRel: (R('equityIndex', t) / gdp) / eqg0, i2t: null,
    gr: num(yoy('gdpNominal', 4)) ? yoy('gdpNominal', 4) - R('gov10y', t) : 0.04 - R('gov10y', 0),
    qeGdp: 0, pvt: R('privateCreditGdp', t), gov: R('govDebtGdp', t), defGdp: 0, gap: null,
  };
  const dsr4 = t >= 4 ? rows[t - 4].v.dsr : dsr0, pol4 = t >= 4 ? rows[t - 4].v.policy : x.policy;
  const hs = S.houseIndex.slice(Math.max(0, t - 19), t + 1).filter(num);
  const v = { ...x, dsr0, dDsr4: x.dsr - dsr4, realP: x.policy - x.piY, dPol4: x.policy - pol4, PI: cp.pi0 * x.PIrel,
    adj: null, qeOn: false, capR: null, pressure: null, dd: 1 - R('houseIndex', t) / Math.max(...hs), lvr: null, badKnown: false, badRes: null, chargeOff: null };
  computeLamps(v, cp);
  const cy = advanceCycles(prevCyc, v, t, D.dates[t], cp.cycle);
  prevCyc = cy.state; prev = x;
  rows.push({ date: D.dates[t], v, c: cy.out });
}
const runs = (arr, f) => { const o = []; arr.forEach((r, i) => { const k = f(r); if (!i || k !== f(arr[i - 1])) o.push(`${r.date}:${k}`); }); return o.join(' '); };
console.log('GBR REAL long :', runs(rows, r => r.c.long.stage + (r.c.long.fork || '')));
console.log('GBR REAL short:', runs(rows, r => r.c.short.phase));
const f5 = rows.find(r => r.c.long.stage === 5), b2 = rows.find(r => r.c.long.fork === 'B2');
console.log(`GBR REAL first ⑤: ${f5 ? f5.date : 'never'}; first B2: ${b2 ? b2.date : 'never'}`);
if (process.argv.includes('--model')) {
  const s = createSim({ data: D, mode: 'history', country: 'GBR' }); while (!s.done) s.step();
  const h = s.history().map(x => ({ date: x.date, c: x.cycles }));
  console.log('GBR MODEL long :', runs(h, r => r.c.long.stage + (r.c.long.fork || '')));
  console.log('GBR MODEL short:', runs(h, r => r.c.short.phase));
  const m5 = h.find(r => r.c.long.stage === 5), mb = h.find(r => r.c.long.fork === 'B2');
  console.log(`GBR MODEL first ⑤: ${m5 ? m5.date : 'never'}; first B2: ${mb ? mb.date : 'never'}`);
}
