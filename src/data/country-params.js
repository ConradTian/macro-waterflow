// Country parameters (WORLD-CONTRACT addendum). The engine is the SAME for every country; only these numbers differ.
// createSim({ data, mode, country }) picks COUNTRY_PARAMS[country] (default 'USA') and the engine reads it as K.cp.
// USA = the numbers the engine was calibrated with (tools/engine_check.mjs, 17 targets): it must reproduce the old engine bit for bit.
// Everything else (rule thresholds that are generic behaviour, equity-market mechanics, accounting splits) stays in src/engine.
// No Node-only APIs. Plain data, never mutated by the engine.

const USA = {
  iso: 'USA', name: '美国', ccy: 'USD',
  ccyUnit: '亿美元',          // ledger text unit (kept as the old engine text)
  cbName: '联储',             // ledger text: "真实联储路径"
  // ---- macro anchors
  ws: 0.66,                   // labour-income share of nominal GDP
  uStar: 0.055,               // natural unemployment (neutral)
  piTarget: 0.02,             // inflation target (expectations anchor)
  gT: 0.022,                  // trend growth of capacity (real)
  gBase: 0.04,                // baseline nominal demand growth (~ gT + target)
  gapSlope: 0.212,            // Phillips-curve slope when demand exceeds capacity
  okun: 0.6,                  // unemployment target rises by okun x (slack: output below capacity)
  // ---- households and housing
  mortShare: 0.8,             // mortgage share of household debt
  lvr0: 0.38,                 // starting average LVR (mortgages / housing value) -> sets the housing stock HV0
  lvrBad: 0.42,               // average LVR above which mortgage bad loans start to rise
  rentYield0: 0.05,           // starting gross rental yield
  pi0: 4.0,                   // starting house price / income (the lamp reads it as "起点")
  sav0: 0.07,                 // household saving rate at u = u*
  alphaH: 0.035,              // household principal repayment rate (only used when hhDsr is missing at the start)
  rateSens: 0.589,            // sensitivity of household borrowing demand to the real mortgage rate
  wealthMpc: 0.0192,          // consumption out of quarterly change in housing + equity wealth
  dsrRoom: 0.06,              // banks keep lending until household DSR is this far above its start
  badDsr: 0.5,                // mortgage bad loans rise by this x (DSR above its start)
  // mortgage pricing: new-loan rate = mortFixed x (10y + mortSpread) + (1 - mortFixed) x (policy + mortVarSpread)
  mortFixed: 0.75,            // share of new mortgages priced off the long rate (US: 30y fixed); the rest floats with the policy rate
  mortSpread: 0.017,          // fixed-rate mortgage spread over the 10y
  mortVarSpread: 0.035,       // floating / short-reset mortgage spread over the policy rate
  mortReprice: 0.0992,        // quarterly speed at which the effective (stock) mortgage rate converges to the new-loan rate
  // ---- firms, government, money
  capexShare0: 0.15,          // Capex / GDP at neutral
  taxGdp: 0.185,              // tax revenue / GDP at u = u*
  spendGdp: 0.185,            // primary government outlays / GDP at neutral
  moneyGdp: 0.55,             // starting deposits M / GDP
  mktCapGdp: 1,               // starting equity market cap / GDP
  eqDilution: 0,              // net new share issuance per year: earnings per share grow this much slower than aggregate profits
  bondShare: 0.75,            // share of government debt that sits in the tradable long-bond pool
  termPrem0: 0.008,           // baseline term premium of the 10y
  // ---- exogenous shock reading (lockdown-type collapse of real GDP)
  shockFloor: -0.05,          // real GDP yoy below this is a combined supply + demand shock
  shockMult: 4,               // depth beyond the floor is amplified x4 (one yoy number understates a one-quarter shutdown)
  // ---- seed fallbacks (used only when the first quarter of a data series is missing)
  seed: { gdp0: 7600, hhDebtGdp: 0.65, privateCreditGdp: 1.1, govDebtGdp: 0.5, mortgageRate: 0.0765, policyRate: 0.055,
    cpiYoY: 0.028, unemployment: 0.056, gov10y: 0.065 },
  // ---- border (国境线). borderFeedback false: snap.border reports the flows, but they do not move the macro path.
  // USA stays false: the US calibration absorbed the 1995-2006 widening of the trade deficit (-4pp of GDP) in its baseline growth;
  // switching the trade channel on moves the US house peak to 2010 and drops the scorecard from 17/17 to 4/17 (tried 2026-10-29).
  borderFeedback: false,
  nx0: -0.03,                 // net exports / GDP used by the foreign_trade rule when the border feeds nothing back (old engine level)
  tradeTrail: 16,             // trade shares from data are trailing 16-quarter means: the structural share; the cyclical import swing
                              // comes from the model's own leak (foreign_trade rule), so a recession is not offset twice
  exportsGdp: 0.105,          // free mode / missing data: exports / GDP (US ~10-12%)
  importsGdp: 0.14,           // free mode / missing data: imports / GDP (US ~13-16%)
  fxPass: 0.3,                // share of a currency move that reaches import prices within the year (x import share -> CPI push)
  kForeignYield: 0.02,        // 10y yield falls 2bp per +1pp of government debt held abroad (share vs the start), capped at 1pp
  reserveShareUsd: null,      // USD share of world FX reserves (world.js / IMF COFER fills it when present in the data)
  // ---- detection layer (lamps, cycle dials, pauses): reads state, never feeds back
  lamps: {
    ci: [-0.015, -0.003, 0.03],          // credit impulse: red < a <= yellow < b <= green < c <= yellow
    dsr: [0.02, 0.04],                   // DSR above its start: yellow, red
    realP: [-0.015, 0.002, 0.025, 0.04], // real policy rate: red < a, yellow < b, green < c, yellow < d, red
    val: [1.15, 1.35],                   // valuation (x start): yellow, red
  },
  pause: { cpiLo: 0.005, cpiHi: 0.035, capLow: 0.075, i2t: 0.25 },   // auto-pause: CPI band, bank capital, interest/tax
  cycle: {
    LT: {
      pvtUp: 0.03, pi: 1.10,                       // ②: private debt/GDP +3pp in 3y, house price/income >= 1.10x start
      pvtDown: -0.05, bad: 0.035, zb: 0.0075,      // ⑤: 5pp below the 3y high; bad loans >= 3.5% or policy <= 0.75% (cuts used up)
      govUp: 0.03, deficit: 0.05, qe: 0.01, zb2: 0.005, // ⑥: gov debt +3pp in 3y or deficit >= 5% GDP; and QE >= 1% GDP or policy <= 0.5%
      realP: -0.01, flat: 0.01, pvtFlat: 0.02,     // ⑦: real policy rate <= -1%; gov debt not rising (+1pp); private debt not re-levering (+2pp)
      dsrLow: -0.025, badLow: 0.025, i2t: 0.25,    // ⑧: DSR 2.5pp under start, bad loans <= 2.5%, interest/tax <= 25%
      reUp: 0.02, pcg: 0.03,                       // ①: private debt +2pp in 3y and credit growth >= 3%
      hpFall: 0, dsrHi: 0.01, cut: 0.01, ciNeg: -0.005, // B2 fork: house prices falling; debt/DSR high; cut >= 1pp (or near zero) yet credit still shrinking
    },
    ST: {
      infl: 0.035, hike: 0.005,                    // 过热·物价
      ci: -0.005, hp: 0.01, dsr: 0.01,             // 过热·资产 (the credit-driven top breaking)
      uRise: 0.01, ciTight: -0.015,                // 收紧·衰退
      cut: 0.01, zb: 0.005,                        // 降息重启
      ciBack: 0, uFlat: 0.001,                     // 扩张
    },
  },
  // ---- rule parameter overrides for this country (applied over RULE_DEFS defaults; sim.reset() restores them)
  rules: {},
};

// Australia: same engine. What differs: mostly VARIABLE-rate mortgages (the cash rate reaches DSR within a few quarters), a lower
// starting LVR, households that carried a DSR rising ~7pp (1999-2007) without a bust, commodity exports with the border ON,
// a 2-3% inflation target, faster trend growth. Tuned only on the AUS targets (tools/engine_check.mjs --country AUS), never on USA.
// 2026-10-29 retune (engine agent, round 2): robustness-aware search on the AUS scorecard + fit terms (u 2023-25, u/CPI RMSE, gov debt/GDP,
// no fictitious fiscal stimulus in 2001-08 / 2023-25), scored also on +-10% one-at-a-time perturbations of every AUS param: flagged 35/100 -> 11/100.
// The numbers below carry 3-4 digits on purpose: the model is chaotic near the 2021 cycle fork, and rounding moves the robustness count.
const AUS = {
  ...USA,
  iso: 'AUS', name: '澳大利亚', ccy: 'AUD', ccyUnit: '十亿澳元', cbName: '澳储行',
  ws: 0.60,                   // compensation + mixed income share is lower than in the US
  uStar: 0.0473,              // RBA NAIRU estimates ~4.5-5% over the 2010s-2020s (was 0.05)
  piTarget: 0.025, gT: 0.0305, gBase: 0.0555,   // RBA 2-3% target; ~3% trend growth (population + mining capacity); gBase = gT + target
  gapSlope: 0.189,            // flatter Phillips curve than the US 0.212 (inflation targeting since 1993)
  okun: 0.4,                  // unemployment reacts less to slack (labour hoarding; JobKeeper in 2020)
  mortShare: 0.85, lvr0: 0.2207, lvrBad: 0.3031, rentYield0: 0.045, pi0: 4.5, sav0: 0.06,
  mortFixed: 0.1,             // ~90% of new mortgages float with the cash rate (US: 25%)
  mortVarSpread: 0.0268,      // standard variable rate ~ cash + 2.5-3pp over 1995-2025
  mortReprice: 0.6369,        // the stock reprices within ~2 quarters (US 0.099: 30y fixed)
  dsrRoom: 0.10, badDsr: 0.15,   // DSR rose from ~10% to ~17% (BIS) with low arrears: banks and borrowers carry a higher DSR
  wealthMpc: 0.022,           // housing-wealth effect a little stronger than the US 0.0192 (higher home ownership, more housing in wealth)
  capexShare0: 0.1637,        // business + public investment share; also caps the excess capex boom (clamp 0.20) when real rates fall far
                              // below the high 1995 starting real rate (the boom would otherwise add too much capacity, 2010-15 and 2021-23)
  taxGdp: 0.25, spendGdp: 0.2481,   // a small primary surplus at neutral (AUS ran surpluses 1998-2008); gov debt/GDP RMSE 32pp -> 23pp
  mktCapGdp: 0.7, termPrem0: 0.004,
  eqDilution: 0.025,          // ASX is price-only with high payout + dividend reinvestment / capital raisings: EPS lags aggregate profit
  shockFloor: -0.03,          // AUS had no yoy fall below -1% from 1992 to 2019: -3% already marks a lockdown-type quarter
  seed: { gdp0: 480, hhDebtGdp: 0.6, privateCreditGdp: 1.0, govDebtGdp: 0.4, mortgageRate: 0.105, policyRate: 0.075,
    cpiYoY: 0.045, unemployment: 0.085, gov10y: 0.09 },
  borderFeedback: true,       // trade (trailing structural shares), FX pass-through and foreign bond holdings move the AUS path
  nx0: 0, exportsGdp: 0.2, importsGdp: 0.21,
  fxPass: 0.1,                // RBA: a 10% depreciation adds ~0.2-0.3pp to CPI over a year -> 0.1 x import share ~0.2
  reserveShareUsd: null,
  rules: {
    inv_valuation: { ceil: 2.0 },          // price/income doubled from 1995 without a bust: the valuation pull starts later
    cb_taylor: { target: 0.025, debtBase: 1.6 },
    hh_forced_sales: { u: 0.09 },          // u was 8.5% in 1995: forced sales start above that, not at 7%
    hh_deleverage: { dsr: 0.08 },          // deleveraging starts 8pp above the starting DSR (US 3pp)
    hh_overhang: { dsr: 0.06, dsrW: 0.04 },
    hh_infl_deanchor: { anchor: 0.06 },    // inflation targeting since 1993: expectations pulled to target faster
    bank_loosen: { max: 1.42 },            // the 1995-2007 credit expansion (household debt/GDP 52% -> 109%)
    // 2020: JobKeeper-size response (general-government deficit ~8% of GDP in FY2020-21) comes faster than the US-calibrated 3pp/quarter,
    // and a shallower demand hole already counts (gap -3%); the slightly faster unwind ends it by 2022 (budget near balance 2022-23)
    gov_stimulus: { ramp: 0.0459, gap: -0.03, unwind: 0.0049 },
    firm_capex_up: { rReal: 0.0431 },      // capex expands only when the real funding cost is clearly low (AUS real rates start ~7% in 1995)
  },
};

export const COUNTRY_PARAMS = { USA, AUS };

// a country's params: COUNTRY_PARAMS[iso], or USA when that country has no params yet (fallback flagged by the caller)
export function countryParams(iso = 'USA') {
  return COUNTRY_PARAMS[iso] || COUNTRY_PARAMS.USA;
}
