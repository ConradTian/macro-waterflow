// REAL economy snapshots for the 「真实 / 模型」 toggle. DOM-free (Node can run it). Display only: nothing here feeds the engine.
//
//   realSnapshot(iso, t)  -> an object shaped like the engine snapshot (src/engine/economy.js buildSnapshot) for quarter t
//                            (t = index on the real file's `dates`, 0 = 1995Q1, or a 'YYYYQn' string); null outside the grid.
//                            Every field the real data cannot give is null: its dotted path is in snap.modelOnly when real data never
//                            gives it (flow splits, bank approval, capex pipeline, springs ...), in snap.notYet when the real series exists
//                            but is not published for that quarter. snap.outlets = { C, I, G, NX, discrepancy } (shares of GDP);
//                            snap.real = { lastRealDate, afterLastReal, partial (series flagged 部分), filled (lamp/dial inputs carried), proxy }.
//   realLastDate(iso)     -> 'YYYYQn': the last quarter with real policy rate, CPI, unemployment and GDP (badge 「真实数据 · 截至 …」)
//   realDates(iso)        -> the quarter labels of the real grid (1995Q1 .. the last real quarter of any series)
//   realData(iso)         -> the raw file object (USA_REAL / AUS_REAL)
//   realTimeline(iso)     -> per quarter: { date, lights, cycles, inputs, filled } (the lamps and the two cycle dials on real data)
//   REAL_ISOS             -> ['USA', 'AUS']
//
// Lamps: the SAME computeLamps as the model; cycle dials: the SAME advanceCycles, run over the real series from 1995Q1 with the
// country's own thresholds (country-params.js). Inputs that are proxies are documented in PROXY below and in tools/REAL-DATA.md.
// Input gaps (a series not yet published for the latest quarter, or not started yet, e.g. the BIS DSR before 1999) are filled for the
// lamps / dials only: carried forward from the last real value, or back-filled from the first one; snap.real.filled lists them.
import { USA_REAL } from './usa-real.js';
import { AUS_REAL } from './aus-real.js';
import { computeLamps, advanceCycles } from '../../engine/regimes.js';
import { countryParams } from '../country-params.js';

export const REAL_ISOS = ['USA', 'AUS'];
const DATA = { USA: USA_REAL, AUS: AUS_REAL };
const BAD_NEUTRAL = 0.01;   // AUS has no bank bad-loan series: the dials read a neutral 1% (below every bad-loan threshold)

// documentation of every proxy (also shown by tools/check_real_data.mjs)
export const PROXY = {
  ci: 'credit impulse: net new private non-financial credit (change in the BIS credit level, + the extension) x4 / GDP, smoothed like the engine (EMA 0.5), minus its value 2 quarters earlier',
  pcg: 'credit growth: BIS private non-financial credit level, 4-quarter growth',
  PIrel: 'house price / income relative to 1995Q1: house index / nominal GDP per household (USA, Census households) or per person (AUS, ABS population)',
  peRel: 'equity valuation relative to 1995Q1: USA = Shiller CAPE / CAPE 1995Q1; AUS = equity index / nominal GDP (market value / GDP proxy, no CAPE)',
  dsr0: 'DSR start = the first real DSR (BIS, 1999Q1); 1995-98 back-filled flat for the lamp and dials',
  bad: 'USA: FRED DRALACBS delinquency rate (all loans, commercial banks); AUS: no series, neutral 1%',
  qeGdp: 'USA: Fed total assets above the 2007 average / GDP; AUS: RBA A1 Australian dollar investments above the 2019 average / GDP',
  defGdp: 'USA: NIPA federal current deficit / GDP; AUS: no quarterly series, 0 (the ⑥ test then rests on gov debt / GDP or the zero-rate test)',
  i2t: 'USA: federal interest payments / federal current receipts (NIPA); AUS: none (null)',
  gap: 'USA: CBO output gap (GDPC1 / GDPPOT - 1); AUS: 估算 one-sided HP trend gap',
};

const num = x => typeof x === 'number' && Number.isFinite(x);
const idxOf = (D, t) => (typeof t === 'number' ? t : D.dates.indexOf(t));

export function realData(iso) { return DATA[iso] || null; }
export function realDates(iso) { return DATA[iso] ? DATA[iso].dates.slice() : []; }
export function realLastDate(iso) { return DATA[iso] ? DATA[iso].lastRealDate : null; }

const raw = (D, k, t) => (D.series[k] && t >= 0 && t < D.dates.length && num(D.series[k][t]) ? D.series[k][t] : null);
const first = (D, k) => { const a = D.series[k] || []; const i = a.findIndex(num); return i < 0 ? null : a[i]; };

// ---------------------------------------------------------------- the lamp / dial inputs for every quarter
// Pass 1 computes every input from REAL values only (null when a component is missing). Pass 2 fills the gaps for the lamps / dials:
// a missing input takes its own previous quarter's value ('carried'; e.g. the latest quarter before BIS publishes it), or, before a
// series starts, its first real value ('backfilled'; e.g. the BIS DSR before 1999). Inputs are carried, never the levels behind them,
// so a missing credit level does not fake a zero credit flow.
const INPUTS = ['policy', 'piY', 'u', 'dsr', 'bad', 'ci', 'pcg', 'hpYoY', 'hpQ', 'hpQPrev', 'PIrel', 'peRel', 'i2t', 'gr', 'qeGdp', 'pvt', 'gov', 'defGdp', 'gap'];
const CACHE = {};
function timeline(iso) {
  if (CACHE[iso]) return CACHE[iso];
  const D = DATA[iso];
  const cp = countryParams(iso);
  const n = D.dates.length;
  const R = (k, t) => raw(D, k, t);
  const per = iso === 'USA' ? 'households' : 'population';
  const inc0 = R('gdpNominal', 0) / R(per, 0), H0 = R('houseIndex', 0), cape0 = R('cape', 0), eqg0 = R('equityIndex', 0) / R('gdpNominal', 0);
  const dsr0 = first(D, 'hhDsr');
  const ratio = (a, b) => (num(a) && num(b) && b !== 0 ? a / b : null);
  // ---- pass 1: real-only inputs
  const raw1 = [];
  let sm = null;
  const smH = [];
  for (let t = 0; t < n; t++) {
    const C0 = R('privateCredit', t), C1 = R('privateCredit', t - 1), gdp = R('gdpNominal', t);
    const flow = num(C0) && num(C1) && num(gdp) ? 4 * (C0 - C1) / gdp : null;
    if (flow != null) sm = sm == null ? flow : 0.5 * sm + 0.5 * flow;
    smH.push(flow != null ? sm : null);
    const H = R('houseIndex', t);
    const yoy = (k, lag) => { const a = R(k, t), b = R(k, t - lag); return num(a) && num(b) && b !== 0 ? a / b - 1 : null; };
    const inc = ratio(gdp, R(per, t));
    raw1.push({
      policy: R('policyRate', t), piY: R('cpiYoY', t), u: R('unemployment', t), dsr: R('hhDsr', t),
      bad: iso === 'USA' ? R('badLoans', t) : BAD_NEUTRAL,
      ci: t >= 2 && smH[t] != null && smH[t - 2] != null ? smH[t] - smH[t - 2] : null,
      pcg: yoy('privateCredit', 4), hpYoY: yoy('houseIndex', 4), hpQ: yoy('houseIndex', 1),
      hpQPrev: t >= 1 ? (num(R('houseIndex', t - 1)) && num(R('houseIndex', t - 2)) ? R('houseIndex', t - 1) / R('houseIndex', t - 2) - 1 : null) : null,
      PIrel: num(H) && num(inc) ? (H / H0) / (inc / inc0) : null,
      peRel: iso === 'USA' ? ratio(R('cape', t), cape0) : ratio(ratio(R('equityIndex', t), gdp), eqg0),
      i2t: iso === 'USA' ? R('govInterestToTax', t) : null,
      gr: num(yoy('gdpNominal', 4)) && num(R('gov10y', t)) ? yoy('gdpNominal', 4) - R('gov10y', t) : null,
      qeGdp: R('qeGdp', t), pvt: R('privateCreditGdp', t), gov: R('govDebtGdp', t), defGdp: iso === 'USA' ? R('govDeficitGdp', t) : 0, gap: R('outputGap', t),
      netNewCredit: flow != null ? flow * gdp / 4 : null,
    });
  }
  // first real value of each input (for the back-fill before a series starts); start-of-sample defaults as in the engine's first year
  const START = { ci: 0, hpYoY: 0, hpQ: 0, hpQPrev: 0, gr: 0.04 - (R('gov10y', 0) ?? 0) };
  const firstIn = {};
  for (const k of INPUTS) { const r = raw1.find(x => num(x[k])); firstIn[k] = r ? r[k] : null; }
  // ---- pass 2: fill, lamps, dials
  const out = [];
  let prevCyc = null, prev = null;
  const how = {};
  for (let t = 0; t < n; t++) {
    const x = {}, filled = [];
    for (const k of INPUTS) {
      const v = raw1[t][k];
      if (num(v) || (v === null && k === 'i2t' && iso !== 'USA')) { x[k] = v; how[k] = 'real'; continue; }
      if (prev && num(prev[k])) { x[k] = prev[k]; how[k] = how[k] === 'real' || how[k] === 'carried' ? 'carried' : how[k]; }
      else if (k in START && t < 5) { x[k] = START[k]; how[k] = 'start'; }
      else { x[k] = firstIn[k]; how[k] = 'backfilled'; }
      filled.push(`${k}:${how[k]}`);
    }
    const dsr4 = t >= 4 ? out[t - 4].inputs.dsr : dsr0, pol4 = t >= 4 ? out[t - 4].inputs.policy : x.policy;
    const v = {
      ...x, dsr0, dDsr4: x.dsr - dsr4, realP: x.policy - x.piY, dPol4: x.policy - pol4, PI: cp.pi0 * x.PIrel,
      adj: null, qeOn: x.qeGdp > 0.005, capR: null, pressure: null,
    };
    const lights = computeLamps(v, cp);
    if (iso !== 'USA') lights.debtService.driver = lights.debtService.driver.replace(/，坏账率.*$/, '，坏账率 无数据');
    const cy = advanceCycles(prevCyc, v, t, D.dates[t], cp.cycle);
    prevCyc = cy.state; prev = x;
    out.push({ date: D.dates[t], lights, cycles: cy.out, events: cy.events, inputs: v, filled, netNewCredit: raw1[t].netNewCredit });
  }
  CACHE[iso] = out;
  return out;
}
export function realTimeline(iso) { return DATA[iso] ? timeline(iso) : null; }

// ---------------------------------------------------------------- the snapshot
const FLOW_KEYS = ['newLoans', 'principalRepay', 'interestPaid', 'fiscalInjection', 'qe', 'toHousing', 'toFinancial', 'toEquity', 'toBond', 'toGold',
  'toConsumption', 'toCapex', 'toCash', 'wages', 'profits', 'taxes', 'spillToGoods', 'fiscalDrain', 'govSurplusDrain', 'qt', 'writeoff', 'bankRecap',
  'rent', 'dividends', 'coupons', 'govPurchases', 'transfers'];

function nullPaths(o, pre, acc) {
  for (const [k, v] of Object.entries(o)) {
    const p = pre ? pre + '.' + k : k;
    if (v === null) acc.push(p);
    else if (v && typeof v === 'object' && !Array.isArray(v) && !['lights', 'cycles', 'real', 'causal'].includes(p)) nullPaths(v, p, acc);
  }
  return acc;
}

// null paths that are null in EVERY quarter of a country's grid: the fields real data never gives (model-only)
const ALWAYS = {};
function alwaysNull(iso) {
  if (ALWAYS[iso]) return ALWAYS[iso];
  let s = null;
  for (let t = 0; t < DATA[iso].dates.length; t++) {
    const p = new Set(nullPaths(build(iso, t), '', []));
    s = s ? new Set([...s].filter(x => p.has(x))) : p;
  }
  return (ALWAYS[iso] = s);
}

// modelOnly: fields the real data never gives for this country (always null); notYet: real series that exist but are not
// published for this quarter yet (or had not started yet, e.g. the BIS DSR before 1999).
export function realSnapshot(iso, t0) {
  const D = DATA[iso];
  if (!D) return null;
  const t = idxOf(D, t0);
  if (!(t >= 0 && t < D.dates.length)) return null;
  const snap = build(iso, t);
  const nulls = nullPaths(snap, '', []), always = alwaysNull(iso);
  snap.modelOnly = nulls.filter(p => always.has(p));
  snap.notYet = nulls.filter(p => !always.has(p));
  return snap;
}

function build(iso, t) {
  const D = DATA[iso];
  const T = timeline(iso)[t];
  const r = k => raw(D, k, t), rp = (k, k2 = 1) => raw(D, k, t - k2);
  const gdp = r('gdpNominal'), infl = r('cpiYoY'), pol = r('policyRate');
  const mul = (a, b) => (num(a) && num(b) ? a * b : null);
  const ratio = (a, b) => (num(a) && num(b) && b !== 0 ? a / b : null);
  const ret = k => { const a = r(k), b = rp(k); return num(a) && num(b) && b > 0 ? a / b - 1 : null; };
  const cpiQ = ret('cpiIndex');
  const realRet = x => (num(x) && num(cpiQ) ? (1 + x) / (1 + cpiQ) - 1 : null);
  const hh = mul(r('hhDebtGdp'), gdp), pvt = mul(r('privateCreditGdp'), gdp);
  const firm = num(hh) && num(pvt) ? pvt - hh : null, gov = mul(r('govDebtGdp'), gdp);
  const i2t = iso === 'USA' ? r('govInterestToTax') : null;
  const interest = iso === 'USA' ? mul(r('govInterestGdp'), gdp) : null;
  const taxes = ratio(interest, i2t);
  const deficit = iso === 'USA' ? mul(r('govDeficitGdp'), gdp) : null;
  const M = r('money');
  const fx = r('fxPerUsd'), fx4 = rp('fxPerUsd', 4);
  const out = { C: r('outC'), I: r('outI'), G: r('outG'), NX: r('outNX'), discrepancy: iso === 'USA' ? (num(r('outC')) ? 0 : null) : r('outDiscrepancy') };
  const eqRet = ret('equityIndex'), hRet = ret('houseIndex'), gRet = ret('goldIndex');
  const piHouse = T.inputs.PIrel != null ? countryParams(iso).pi0 * T.inputs.PIrel : null;
  const flows = Object.fromEntries(FLOW_KEYS.map(k => [k, null]));
  flows.govPurchases = num(out.G) && num(gdp) ? out.G * gdp / 4 : null;
  if (iso === 'USA') { flows.taxes = num(taxes) ? taxes / 4 : null; flows.coupons = num(interest) ? interest / 4 : null; }
  const snap = {
    t, date: D.dates[t], branch: 'real',
    macro: { gdpNominal: gdp, realOutput: r('gdpReal'), capacity: r('gdpPotential'), outputGap: r('outputGap'), priceLevel: r('cpiIndex'),
      inflation: infl, inflationExp: null, unemployment: r('unemployment'), demandPressure: null, capacityPotential: r('gdpPotential') },
    rates: { policy: pol, mortgageEff: iso === 'AUS' ? r('mortgageRate') : null, mortgageNew: r('mortgageRate'), gov10y: r('gov10y'), riskPremium: null,
      realPolicy: num(pol) && num(infl) ? pol - infl : null },
    money: { M },
    debt: { household: hh, firm, government: gov },
    bank: { capitalRatio: null, approval: null, badLoanRate: iso === 'USA' ? r('badLoans') : null },
    household: { income: null, dsr: r('hhDsr'), lvr: null, consumption: mul(out.C, gdp), savingRate: null },
    firm: { profit: null, capex: null, capexPipeline: null },
    gov: { spending: null, spendingGross: null, taxes, deficit, interest, interestToTax: i2t, debtGdp: r('govDebtGdp') },
    assets: {
      cash: { price: null, ret: null, realRet: null, level: M },
      bond: { price: null, ret: null, realRet: null, yield: r('gov10y'), level: null, totalReturnIndex: null, yieldParts: null },
      equity: { price: r('equityIndex'), ret: eqRet, realRet: realRet(eqRet), pe: iso === 'USA' ? r('cape') : null, level: null },
      housing: { price: r('houseIndex'), ret: hRet, realRet: realRet(hRet), priceToIncome: piHouse, rentYield: null, level: null },
      gold: { price: r('goldIndex'), ret: gRet, realRet: realRet(gRet), level: null, distrust: null },
    },
    flows,
    border: { exports: num(r('exportsGdp')) && num(gdp) ? r('exportsGdp') * gdp / 4 : null, imports: num(r('importsGdp')) && num(gdp) ? r('importsGdp') * gdp / 4 : null,
      netExports: null, fxPerUsd: fx, fxChg4q: num(fx) && num(fx4) && fx4 > 0 ? fx / fx4 - 1 : null, foreignBondBuy: null,
      foreignBondShare: r('foreignGovHoldShare'), reserveShareUsd: null, feedback: null, foreignYield: null, fxInflation: null },
    budget: { pumpedIn: { loans: null, qe: null, deficit: null }, drainedOut: { repay: null, surplus: null, qt: null }, net: null, M_before: num(rp('money')) ? rp('money') : null,
      M_after: M, iouChange: T.netNewCredit, writeoff: null },
    iou: { household: hh, firm, bankTotal: pvt },
    scenario: 'real',
    lights: T.lights,
    ring: null,
    cycles: T.cycles,
    ledger: [], pauses: [], causal: {},
    extra: { creditImpulse: T.inputs.ci, qeStock: mul(r('qeGdp'), gdp), qeOn: num(r('qeGdp')) ? r('qeGdp') > 0.005 : null, fiscalAdj: null, capacityLoss: null,
      houseYoY: T.inputs.hpYoY, creditGrowth: T.inputs.pcg, distrust: null, alloc: null, riskoff: null, capexMult: null, borrowMult: null, saveAdj: null },
    outlets: out,
  };
  if (num(snap.border.exports) && num(snap.border.imports)) snap.border.netExports = snap.border.exports - snap.border.imports;
  const partial = Object.entries(D.meta.partial || {}).filter(([, ds]) => ds.includes(D.dates[t])).map(([k]) => k);
  // b2Now: the B2 evidence holds THIS quarter (advanceCycles latches fork 'B2' until the long stage moves; on real AUS data that
  // keeps B2 on from 2008Q4 to 2021Q2). Same AND / OR-group rule as regimes.js `holds`.
  const fe = T.cycles.long.forkEvidence;
  let b2Now = null;
  if (fe) { const g = {}; for (const i of fe) { const k = i.grp || '#' + i.name; g[k] = g[k] || i.ok; } b2Now = t >= 8 && Object.values(g).every(Boolean); }
  snap.real = { iso, lastRealDate: D.lastRealDate, afterLastReal: t > D.dates.indexOf(D.lastRealDate), partial, filled: T.filled, b2Now,
    reservedFrom: D.reservedFrom, inReserved: t >= D.dates.indexOf(D.reservedFrom), proxy: PROXY };
  return snap;
}
