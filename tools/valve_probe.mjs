// node tools/valve_probe.mjs [startQuarter e.g. 2004Q1] [scenario us|town]
// Measures what the ENGINE actually does when a valve is turned: two identical sims, one valve changed at the start quarter,
// first quarter (after the turn) where each metric departs from the baseline, and the quarter of the largest departure.
// Used to fill/verify the delayLabel of every chain link in src/engine/valves.js.
import { createSim } from '../src/engine/sim.js';
import { VALVES } from '../src/engine/valves.js';
import { US_Q } from '../src/data/us-quarterly.js';

const ARG_START = /^\d{4}Q[1-4]$/.test(process.argv[2] || '') ? process.argv[2] : null;
const start = ARG_START || '2004Q1';
export let scenario = process.argv[3] === 'town' ? 'town' : 'us';
export const setScenario = x => { scenario = x; };
export const labelOf = q => (q == null ? null : q <= 1 ? '立刻' : q <= 3 ? '1–2 季' : q <= 6 ? '2–4 季' : '2–3 年');
const t0 = () => scenario === 'town' ? 4 : US_Q.dates.indexOf(start);
const H = 16;

// [path, kind]  kind 'rate' -> abs threshold 5bp ; 'rel' -> 0.3% relative (min abs 1e-6) ; 'abs' -> abs threshold 0.003
const METRICS = [
  ['rates.policy', 'rate'], ['rates.mortgageNew', 'rate'], ['rates.mortgageEff', 'rate'], ['rates.gov10y', 'rate'],
  ['flows.newLoans', 'rel'], ['flows.principalRepay', 'rel'], ['household.dsr', 'abs'], ['household.lvr', 'abs'], ['bank.approval', 'abs'],
  ['household.savingRate', 'abs'], ['household.income', 'rel'], ['household.consumption', 'rel'],
  ['assets.housing.price', 'rel'], ['assets.equity.price', 'rel'], ['assets.bond.price', 'rel'], ['assets.gold.price', 'rel'],
  ['macro.demandPressure', 'abs'], ['macro.inflation', 'abs'], ['macro.unemployment', 'abs'], ['macro.capacityPotential', 'rel'],
  ['money.M', 'rel'], ['flows.qe', 'rel'], ['flows.fiscalInjection', 'rel'], ['flows.toCapex', 'rel'], ['firm.capex', 'rel'],
  ['flows.toBond', 'rel'], ['flows.toCash', 'rel'], ['gov.deficit', 'rel'],
];
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

// how each valve is turned (relative to what the model does at t0)
// per-valve plan: start quarter (default = argv start) and the turn. policyRate is probed in 2012Q1 where the real path is flat
// (a held rate is only comparable to the baseline while the real path does not move); lvrCap where LVR is high enough to bind.
const TURN = {
  policyRate: s => s.rates.policy + 0.015,
  qe: () => true,
  approval: s => s.bank.approval * 0.7,
  lvrCap: () => 0.30,
  borrowMult: () => 1.4,
  saveAdj: () => 0.04,
  capexMult: () => 1.3,
  fiscalInjection: () => 0.05,
};
const START = { policyRate: '2012Q1', lvrCap: '2005Q1' };

function build(valveId) {
  const sim = scenario === 'town' ? createSim({ scenario: 'town' }) : createSim({ data: US_Q, mode: 'history' });
  const tt = scenario === 'town' ? 4 : (ARG_START ? t0() : US_Q.dates.indexOf(START[valveId] || start));
  while (sim.t < tt) sim.step();
  return sim;
}

export function probe(valveId) {
  const A = build(valveId), B = build(valveId);
  const v = VALVES.find(x => x.id === valveId);
  const val = TURN[valveId](A.snapshot());
  B.setValve(valveId, val);
  const brB = v.ruleParam || scenario === 'town' ? 'model' : 'user';
  const rows = [];
  const series = METRICS.map(() => []);
  for (let k = 1; k <= H; k++) {
    A.step(); B.step();
    const a = A.snapshot('model'), b = B.snapshot(brB);
    METRICS.forEach(([p, kind], i) => series[i].push([get(a, p), get(b, p), kind]));
  }
  METRICS.forEach(([p, kind], i) => {
    const d = series[i].map(([x, y]) => y - x);
    const scale = series[i].map(([x]) => Math.max(1e-6, Math.abs(x)));
    const thr = (j, m) => m * (kind === 'rate' ? 0.0005 : kind === 'abs' ? 0.003 : Math.max(1e-6, 0.003 * scale[j]));
    const first = d.findIndex((x, j) => Math.abs(x) > thr(j, 1));          // 0.3% rel / 5bp / 0.3pp: any visible departure
    if (first < 0) return;
    const mat = d.findIndex((x, j) => Math.abs(x) > thr(j, 3.3));          // ~1% rel / 17bp / 1pp: material departure
    // half = first quarter reaching 50% of the largest departure within 12 quarters (robust against late chaotic divergence)
    const nz = d.slice(0, 12).map((x, j) => Math.abs(x) / thr(j, 1));
    const mx = Math.max(...nz);
    const half = nz.findIndex(x => x >= 0.5 * mx);
    rows.push({ p, first: first + 1, mat: mat < 0 ? null : mat + 1, half: half + 1, d1: d[first], dmx: d[nz.indexOf(mx)] });
  });
  return { valveId, val, rows };
}

// label implied by the measurement: material departure quarter (fallback: first visible departure)
export function measuredLabel(rows, term) {
  const r = rows.find(x => x.p === term);
  return r ? labelOf(r.mat ?? r.first) : null;
}

if (process.argv[1] && process.argv[1].endsWith('valve_probe.mjs') && !process.argv.includes('--labels')) {
  console.log(`valve probe: scenario=${scenario} start=${scenario === 'town' ? 'q4' : start} horizon=${H}q`);
  for (const v of VALVES) {
    const r = probe(v.id);
    console.log(`\n## ${v.id} (${v.label}) turned to ${typeof r.val === 'number' ? r.val.toFixed(4) : r.val}`);
    r.rows.sort((x, y) => (x.mat ?? 99) - (y.mat ?? 99) || x.first - y.first);
    for (const x of r.rows) console.log(`  ${x.p.padEnd(26)} first q+${String(x.first).padEnd(3)} material q+${String(x.mat ?? '-').padEnd(3)} half-of-max q+${String(x.half).padEnd(3)} d(max12)=${x.dmx.toPrecision(3).padStart(10)}`);
  }
}

if (process.argv.includes('--labels')) {
  // print the labels implied by the measurements for every term of every chain (US with delays, town without)
  const out = {};
  for (const sc of ['us', 'town']) {
    setScenario(sc);
    for (const v of VALVES) {
      const r = probe(v.id);
      for (const l of v.chain) { (out[v.id] ||= {})[l.term] ||= {}; out[v.id][l.term][sc] = measuredLabel(r.rows, l.term); }
    }
  }
  console.log(JSON.stringify(out, null, 1));
}
