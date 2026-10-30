// Read-only stock sub-indices 稳股 / 成长股 / 周期股 for the asset page (src/ui/asset-lake.js). DESIGN-v3 「Asset page (A4)」.
// They re-run the ENGINE's equity formula (src/engine/economy.js §11 "equity, bond, gold, cash") on the sim's snapshots, with two
// params per style. Nothing here feeds back into the engine: the engine's own equity pool is untouched.
//
// Engine formula (copied; the constants below are the engine's, keep them in sync with economy.js):
//   earnIdx_t = (1 − EARN_EMA)·earnIdx_{t−1} + EARN_EMA · profit_t / profit_0
//   erp       = ERP0 + ERP_RP·(rp − 4.5%) + ERP_BAD·max(0, bad − 1.5%)
//   peF       = 1 / max(PE_FLOOR_DEN, gov10y + erp − (piE_{t−1} + 2%))
//   pe_t      = clamp(pe + clamp(PE_REV·(peF − pe) + PE_MOM·(pe − pePrev), ±PE_STEP·pe), PE_LO, PE_HI)
//   price     = 100 · earnIdx · pe / pe_0
// Style params:
//   beta  = spring beta to river flow: the style's profit follows (profit_t / profit_0)^beta (cyclicals > 1, stable < 1)
//   dist  = spring distance: the style's growth is dist higher, so its P/E is longer-dated (the floor and the range shift with it)
// Not modelled per style (engine-only terms): the new-money flow term (peFlow), the seeded noise, the share-dilution term.
const EARN_EMA = 0.102;
const ERP0 = 0.045, ERP_RP = 0.2, ERP_BAD = 0.171;
const PE_FLOOR_DEN = 0.0375, PE_REV = 0.08, PE_MOM = 0.6, PE_STEP = 0.17, PE_LO = 8, PE_HI = 40;

export const STYLES = [
  { k: 'growth', name: '成长股', side: 'far', beta: 0.8, dist: 0.015, narrow: true,
    why: '泉眼很远：利润在很远的将来。吸力一动，跳得最多。' },
  { k: 'stable', name: '稳股', side: 'left', beta: 0.4, dist: 0, narrow: false,
    why: '泉眼稳：水费、电费、日用品。河的水量变，它变得少；主要看吸力。' },
  { k: 'cyclical', name: '周期股', side: 'right', beta: 2, dist: -0.01, narrow: false,
    why: '泉眼跟着河的水量走：矿、钢、银行（银行就是抽水泵）。' },
];

const ok = v => typeof v === 'number' && isFinite(v);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v, d) => (ok(v) ? v : d);

// the inputs of the formula from one snapshot (same shape as sim.snapshot())
function inputs(s) {
  return {
    profit: s?.firm?.profit, y: s?.rates?.gov10y, rp: num(s?.rates?.riskPremium, 0.045),
    bad: num(s?.bank?.badLoanRate, 0.015), piE: num(s?.macro?.inflationExp, num(s?.macro?.inflation, 0.02)),
  };
}
function peFund(x, piEPrev, dist) {
  const erp = ERP0 + ERP_RP * (x.rp - 0.045) + ERP_BAD * Math.max(0, x.bad - 0.015);
  const floor = Math.max(0.015, PE_FLOOR_DEN - dist);
  return 1 / Math.max(floor, x.y + erp - (piEPrev + 0.02) - dist);
}
const peRange = dist => [PE_LO * PE_FLOOR_DEN / Math.max(0.015, PE_FLOOR_DEN - dist) * 0.5, PE_HI * PE_FLOOR_DEN / Math.max(0.015, PE_FLOOR_DEN - dist)];

// one style over a run of snapshots -> [{ date, price, pe, earn }] (price: first snapshot = 100). Empty when the inputs are missing.
export function subIndexSeries(snaps, style) {
  const S = (snaps || []).filter(s => ok(s?.firm?.profit) && ok(s?.rates?.gov10y));
  if (!S.length) return [];
  const x0 = inputs(S[0]), p0 = Math.abs(x0.profit) || 1, [lo, hi] = peRange(style.dist);
  let pe = clamp(peFund(x0, x0.piE, style.dist), lo, hi), pePrev = pe, earn = 1, piEPrev = x0.piE;
  const pe0 = pe, out = [{ date: S[0].date, price: 100, pe, earn }];
  for (let i = 1; i < S.length; i++) {
    const x = inputs(S[i]);
    const rel = Math.max(0.05, x.profit / p0);
    earn = (1 - EARN_EMA) * earn + EARN_EMA * rel ** style.beta;
    const peF = peFund(x, piEPrev, style.dist);
    const step = clamp(PE_REV * (peF - pe) + PE_MOM * (pe - pePrev), -PE_STEP * pe, PE_STEP * pe);
    pePrev = pe; pe = clamp(pe + step, lo, hi); piEPrev = x.piE;
    out.push({ date: S[i].date, price: 100 * earn * pe / pe0, pe, earn });
  }
  return out;
}

// all three, plus each one's change vs a year ago (4 quarters back) at the last snapshot
export function subIndices(snaps) {
  return STYLES.map(st => {
    const s = subIndexSeries(snaps, st), n = s.length;
    const last = n ? s[n - 1] : null, yr = n > 4 ? s[n - 5] : null;
    return { ...st, series: s, price: last?.price ?? null, pe: last?.pe ?? null, chg4q: last && yr ? last.price / yr.price - 1 : null };
  });
}
