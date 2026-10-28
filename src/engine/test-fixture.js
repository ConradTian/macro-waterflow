// Small synthetic US_Q-shaped object for engine tests only (NOT real data).
const N = 124;
const dates = Array.from({ length: N }, (_, t) => `${1995 + Math.floor(t / 4)}Q${(t % 4) + 1}`);
// piecewise-linear interpolation through [quarterIndex, value] anchors
const pl = anchors => Array.from({ length: N }, (_, t) => {
  let i = 0;
  while (i < anchors.length - 2 && t > anchors[i + 1][0]) i++;
  const [t0, v0] = anchors[i], [t1, v1] = anchors[i + 1];
  return v0 + (v1 - v0) * Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
});
const policy = pl([[0, 0.055], [24, 0.06], [32, 0.01], [44, 0.0525], [56, 0.0025], [76, 0.002], [92, 0.025], [100, 0.001], [108, 0.001], [112, 0.053], [123, 0.04]]);
const gdpG = pl([[0, 0.03], [40, 0.03], [56, -0.025], [64, 0.02], [92, 0.025], [98, -0.09], [100, -0.02], [104, 0.05], [108, 0.02], [123, 0.025]]);
const oil = pl([[0, 18], [40, 35], [54, 130], [58, 45], [64, 80], [80, 100], [90, 30], [96, 30], [104, 75], [108, 95], [123, 70]]);
export const FIXTURE_US_Q = {
  dates, reservedFrom: '2022Q1',
  series: {
    policyRate: policy,
    mortgageRate: policy.map(p => 0.0765 - 0.0005 * 0 + (p - 0.055) * 0.5 - 0.01),
    gov10y: policy.map(p => 0.04 + 0.35 * (p - 0.03)),
    cpiYoY: pl([[0, 0.028], [40, 0.025], [54, 0.05], [58, -0.01], [70, 0.02], [96, 0.015], [104, 0.07], [112, 0.04], [123, 0.028]]),
    coreCpiYoY: pl([[0, 0.03], [123, 0.028]]),
    unemployment: pl([[0, 0.056], [30, 0.06], [48, 0.045], [60, 0.10], [90, 0.036], [98, 0.13], [104, 0.04], [123, 0.04]]),
    gdpNominal: pl([[0, 7600], [123, 30000]]),
    gdpRealGrowthYoY: gdpG,
    houseIndex: pl([[0, 100], [46, 250], [66, 170], [100, 300], [123, 420]]),
    equityIndex: pl([[0, 100], [123, 1200]]),
    cape: pl([[0, 15], [123, 33]]),
    goldIndex: pl([[0, 100], [123, 700]]),
    oilPrice: oil,
    hhDsr: pl([[0, 0.108], [48, 0.133], [80, 0.10], [123, 0.098]]),
    privateCreditGdp: pl([[0, 1.15], [60, 1.7], [123, 1.5]]),
    hhDebtGdp: pl([[0, 0.62], [56, 0.99], [123, 0.72]]),
    govDebtGdp: pl([[0, 0.5], [123, 1.0]]),
    bankCredit: pl([[0, 3000], [123, 20000]]),
  },
  meta: { sources: {}, notes: ['synthetic test fixture'] },
};
