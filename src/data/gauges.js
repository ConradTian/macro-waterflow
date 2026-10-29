// 水尺 / 对比尺 table (read by src/ui/gauge.js). Concept ids = keys of CONCEPTS in src/data/concepts.js.
//
// GAUGES[conceptId] = {
//   get(snap, sim?) -> number | null     value to put on the gauge (sim is optional; used for year-on-year numbers)
//   fmt: 'pct' | 'num' | 'x'             how the number is printed
//   label: '占 GDP' | '比一年前' | ''         what the number is a share/change OF
//   bands?: [{lo,hi,level}] | (snap)=>bands   green/yellow/red colour bands (absolute numbers in the gauge's units); absent = neutral gauge
//   pair?(snap, sim?) -> { a:{label,v}, b:{label,v}, fmt:'pct'|'bn'|'num', verdict, zoom? } | null     "A vs B" comparison under the gauge
// }
// NO_GAUGE lists the concepts that have no number to gauge (cycle stages / forks).
// Detection/teaching layer only: nothing here feeds back into the economy.

const ok = v => typeof v === 'number' && isFinite(v);
const I = Infinity;

// snapshot n quarters earlier on the same branch (null if not available)
export function pastSnap(sim, snap, n) {
  try { return sim && snap && snap.t - n >= 0 ? sim.snapshot(snap.branch || 'model', snap.t - n) : null; } catch (e) { return null; }
}
const gdp = s => s.macro?.gdpNominal;
const perGdp = pick => s => { const v = pick(s), g = gdp(s); return ok(v) && ok(g) && g > 0 ? v / g : null; };
const perGdpQ = pick => s => { const v = pick(s), g = gdp(s); return ok(v) && ok(g) && g > 0 ? v / (g / 4) : null; };
const yoy = pick => (s, sim) => { const o = pastSnap(sim, s, 4), a = pick(s), b = o && pick(o); return ok(a) && ok(b) && b !== 0 ? a / b - 1 : null; };
const lamp = k => s => s.lights?.[k]?.bands || null;

const BAND_INFL = [{ lo: -I, hi: 0, level: 'red' }, { lo: 0, hi: 0.01, level: 'yellow' }, { lo: 0.01, hi: 0.03, level: 'green' }, { lo: 0.03, hi: 0.05, level: 'yellow' }, { lo: 0.05, hi: I, level: 'red' }];
const BAND_U = [{ lo: -I, hi: 0.05, level: 'green' }, { lo: 0.05, hi: 0.07, level: 'yellow' }, { lo: 0.07, hi: I, level: 'red' }];
const BAND_GAP = [{ lo: -I, hi: -0.03, level: 'red' }, { lo: -0.03, hi: -0.01, level: 'yellow' }, { lo: -0.01, hi: 0.01, level: 'green' }, { lo: 0.01, hi: 0.03, level: 'yellow' }, { lo: 0.03, hi: I, level: 'red' }];
const BAND_I2T = [{ lo: -I, hi: 0.15, level: 'green' }, { lo: 0.15, hi: 0.25, level: 'yellow' }, { lo: 0.25, hi: I, level: 'red' }];
const BAND_BAD = [{ lo: -I, hi: 0.02, level: 'green' }, { lo: 0.02, hi: 0.035, level: 'yellow' }, { lo: 0.035, hi: I, level: 'red' }];
const BAND_RP = [{ lo: -I, hi: 0.045, level: 'green' }, { lo: 0.045, hi: 0.06, level: 'yellow' }, { lo: 0.06, hi: I, level: 'red' }];

// priceToIncome: the valuation lamp's house bands are in multiples of the start value; start P/I = priceToIncome / PIrel
const piBands = s => {
  const b = s.lights?.valuation?.bands, rel = s.lights?.valuation?.parts?.house, pi = s.assets?.housing?.priceToIncome;
  if (!b || !ok(rel) || !ok(pi) || rel <= 0) return null;
  const p0 = pi / rel;
  return b.map(x => ({ lo: x.lo * p0, hi: x.hi * p0, level: x.level }));
};

// price year-on-year of an asset (null while there is no history yet)
const assetYoY = k => yoy(s => s.assets?.[k]?.price);
// nominal growth, annualised from the last quarter (the same logic as the gMinusR card's liveFn)
const gAnn = (s, sim) => {
  const o = pastSnap(sim, s, 1);
  if (!o || !ok(gdp(s)) || !ok(gdp(o)) || gdp(o) <= 0) return null;
  return (gdp(s) / gdp(o)) ** 4 - 1;
};

const bn = (a, b, verdict, extra = {}) => ({ a, b, fmt: 'bn', verdict, ...extra });
const both = (a, b) => ok(a.v) && ok(b.v);

const bdShare = k => s => { const v = s.border?.[k], g = gdp(s); return ok(v) && ok(g) && g > 0 ? v / (g / 4) : null; };

export const GAUGES = {
  // ---------- rates ----------
  policyRate: { get: s => s.rates?.policy, fmt: 'pct', label: '' },
  realRate: {
    get: s => s.rates?.realPolicy, fmt: 'pct', label: '', bands: lamp('policy'),
    pair: s => {
      const a = { label: '政策利率', v: s.rates?.policy }, b = { label: '通胀', v: s.macro?.inflation };
      return both(a, b) ? { a, b, fmt: 'pct', verdict: a.v >= b.v ? '利率跑赢通胀：实际利率为正，偏紧' : '通胀跑赢利率：实际利率为负，偏松' } : null;
    },
  },
  mortgageEff: { get: s => s.rates?.mortgageEff, fmt: 'pct', label: '' },
  discountRate: { get: s => s.rates?.gov10y, fmt: 'pct', label: '10 年国债' },
  riskPremium: { get: s => s.rates?.riskPremium, fmt: 'pct', label: '', bands: BAND_RP },
  gMinusR: {
    get: (s, sim) => { const g = gAnn(s, sim); return ok(g) && ok(s.rates?.gov10y) ? g - s.rates.gov10y : null; },
    fmt: 'pct', label: 'g − r',
    pair: (s, sim) => {
      const a = { label: '名义增长 g', v: gAnn(s, sim) }, b = { label: '10 年国债 r', v: s.rates?.gov10y };
      return both(a, b) ? { a, b, fmt: 'pct', verdict: a.v > b.v ? '雪球变轻（g > r）' : '雪球变重（g < r）' } : null;
    },
  },

  // ---------- money & credit flows (per-quarter flows are shown as a share of one quarter of GDP) ----------
  M: { get: perGdp(s => s.money?.M), fmt: 'pct', label: '占 GDP' },
  newLoans: {
    get: perGdpQ(s => s.flows?.newLoans), fmt: 'pct', label: '占 GDP',
    pair: s => { const a = { label: '新贷款', v: s.flows?.newLoans }, b = { label: '还本', v: s.flows?.principalRepay }; return both(a, b) ? bn(a, b, a.v >= b.v ? '借得比还得多：水在变多' : '还得比借得多：水在变少') : null; },
  },
  principalRepay: { get: perGdpQ(s => s.flows?.principalRepay), fmt: 'pct', label: '占 GDP' },
  interestPaid: { get: perGdpQ(s => s.flows?.interestPaid), fmt: 'pct', label: '占 GDP' },
  creditImpulse: {
    get: s => s.lights?.credit?.value, fmt: 'pct', label: '占 GDP', bands: lamp('credit'),
    pair: s => { const a = { label: '新贷款', v: s.flows?.newLoans }, b = { label: '还本', v: s.flows?.principalRepay }; return both(a, b) ? bn(a, b, a.v >= b.v ? '借得比还得多：脉冲为正' : '还得比借得多：脉冲为负') : null; },
  },
  assetReservoir: { get: perGdpQ(s => (s.flows?.toHousing || 0) + (s.flows?.toFinancial || 0)), fmt: 'pct', label: '占 GDP' },
  goodsChannel: { get: perGdpQ(s => s.flows?.spillToGoods), fmt: 'pct', label: '占 GDP' },
  fiscalInjection: {
    get: perGdpQ(s => s.flows?.fiscalInjection), fmt: 'pct', label: '占 GDP',
    pair: s => {
      const g = s.gov || {}, T = s.flows?.taxes;
      const X = ok(g.spendingGross) ? g.spendingGross / 4 : (ok(T) && ok(g.deficit) ? T + g.deficit / 4 : null);
      const a = { label: '政府总支出', v: X }, b = { label: '税收', v: T };
      return both(a, b) ? bn(a, b, a.v >= b.v ? '花得比收得多：赤字，有新水注入' : '收得比花得多：盈余，水被抽走') : null;
    },
  },
  govPurchases: { get: perGdpQ(s => s.flows?.govPurchases), fmt: 'pct', label: '占 GDP' },
  transfers: { get: perGdpQ(s => s.flows?.transfers), fmt: 'pct', label: '占 GDP' },
  qe: { get: perGdpQ(s => s.flows?.qe), fmt: 'pct', label: '占 GDP' },

  // ---------- bank ----------
  bankApproval: { get: s => s.bank?.approval, fmt: 'num', label: '1 = 中性' },
  bankCapital: { get: s => s.bank?.capitalRatio, fmt: 'pct', label: '' },
  badLoans: { get: s => s.bank?.badLoanRate, fmt: 'pct', label: '', bands: BAND_BAD },

  // ---------- household / firm / macro ----------
  income: { get: perGdp(s => s.household?.income), fmt: 'pct', label: '占 GDP' },
  hhDebt: { get: perGdp(s => s.debt?.household), fmt: 'pct', label: '占 GDP' },
  pvtDebtGdp: { get: s => (ok(s.debt?.household) && ok(s.debt?.firm) ? perGdp(x => x.debt.household + x.debt.firm)(s) : null), fmt: 'pct', label: '占 GDP' },
  govDebtGdp: { get: s => (ok(s.gov?.debtGdp) ? s.gov.debtGdp : null), fmt: 'pct', label: '占 GDP' },
  dsr: { get: s => s.household?.dsr, fmt: 'pct', label: '占收入', bands: lamp('debtService') },
  lvr: { get: s => s.household?.lvr, fmt: 'pct', label: '' },
  unemployment: { get: s => s.macro?.unemployment, fmt: 'pct', label: '', bands: BAND_U },
  capacity: { get: yoy(s => s.macro?.capacity), fmt: 'pct', label: '比一年前' },
  capex: { get: perGdpQ(s => s.flows?.toCapex), fmt: 'pct', label: '占 GDP' },
  cf: { get: perGdp(s => s.firm?.profit), fmt: 'pct', label: '占 GDP' },
  outputGap: {
    get: s => s.macro?.outputGap, fmt: 'pct', label: '', bands: BAND_GAP,
    pair: s => {
      const a = { label: '需求（实际产出）', v: s.macro?.realOutput }, b = { label: '产能', v: s.macro?.capacity };
      return both(a, b) ? bn(a, b, a.v > b.v ? '需求超过产能：水位漫过堤顶' : '需求低于产能：河道没装满', { zoom: true }) : null;
    },
  },
  cpi: {
    get: s => s.macro?.inflation, fmt: 'pct', label: '年化', bands: BAND_INFL,
    pair: s => {
      const a = { label: '通胀', v: s.macro?.inflation }, b = { label: '目标', v: 0.02 };
      const d = a.v - b.v;
      return ok(a.v) ? { a, b, fmt: 'pct', verdict: Math.abs(d) < 0.005 ? '贴近 2% 目标' : d > 0 ? '高于 2% 目标' : '低于 2% 目标' } : null;
    },
  },
  inflationExp: { get: s => s.macro?.inflationExp, fmt: 'pct', label: '', bands: BAND_INFL },
  interestToTax: { get: s => s.gov?.interestToTax, fmt: 'pct', label: '', bands: BAND_I2T },

  // ---------- housing / valuation ----------
  housePrice: { get: s => s.extra?.houseYoY, fmt: 'pct', label: '比一年前' },
  priceToIncome: { get: s => s.assets?.housing?.priceToIncome, fmt: 'num', label: '房价 ÷ 年收入', bands: piBands },
  rentYield: {
    get: s => s.assets?.housing?.rentYield, fmt: 'pct', label: '租金 ÷ 房价',
    pair: s => {
      const a = { label: '租售比', v: s.assets?.housing?.rentYield }, b = { label: '新房贷利率', v: s.rates?.mortgageNew };
      return both(a, b) ? { a, b, fmt: 'pct', verdict: a.v >= b.v ? '租金盖得住利息' : '靠涨价才赚钱' } : null;
    },
  },

  // ---------- 国境线 (null while a view has no snap.border: the gauge then has no number and shows its empty state) ----------
  exports: {
    get: bdShare('exports'), fmt: 'pct', label: '占 GDP',
    pair: s => { const a = { label: '出口', v: s.border?.exports }, b = { label: '进口', v: s.border?.imports }; return both(a, b) ? bn(a, b, a.v >= b.v ? '卖出去的比买进来的多：水在净流入' : '买进来的比卖出去的多：水在净流出') : null; },
  },
  imports: {
    get: bdShare('imports'), fmt: 'pct', label: '占 GDP',
    pair: s => { const a = { label: '出口', v: s.border?.exports }, b = { label: '进口', v: s.border?.imports }; return both(a, b) ? bn(a, b, a.v >= b.v ? '卖出去的比买进来的多：水在净流入' : '买进来的比卖出去的多：水在净流出') : null; },
  },
  fx: { get: s => s.border?.fxPerUsd, fmt: 'num', label: '本币 / 美元（变大 = 本币变弱）' },
  foreignBonds: { get: bdShare('foreignBondBuy'), fmt: 'pct', label: '占 GDP' },
  reserveCurrency: { get: s => s.border?.reserveShareUsd, fmt: 'pct', label: '美元占世界外储' },

  // ---------- the four lamps ----------
  lampCredit: { get: s => s.lights?.credit?.value, fmt: 'pct', label: '占 GDP', bands: lamp('credit') },
  lampDebtService: { get: s => s.lights?.debtService?.value, fmt: 'pct', label: '占收入', bands: lamp('debtService') },
  lampPolicy: { get: s => s.lights?.policy?.value, fmt: 'pct', label: '', bands: lamp('policy') },
  // the valuation lamp is decided by max(house P/I, equity P/E), both relative to the start: gauge that number (x start)
  lampValuation: {
    get: s => { const p = s.lights?.valuation?.parts; return p && ok(p.house) && ok(p.equity) ? Math.max(p.house, p.equity) : null; },
    fmt: 'x', label: '相对起点', bands: lamp('valuation'),
  },

  // ---------- asset returns: price change over the last 4 quarters ----------
  cashAsset: { get: assetYoY('cash'), fmt: 'pct', label: '比一年前' },
  bondAsset: { get: assetYoY('bond'), fmt: 'pct', label: '比一年前' },
  equityAsset: {
    get: assetYoY('equity'), fmt: 'pct', label: '比一年前',
    pair: s => {
      const pe = s.assets?.equity?.pe;
      const a = { label: '盈利收益率 1/PE', v: ok(pe) && pe > 0 ? 1 / pe : null }, b = { label: '10 年国债', v: s.rates?.gov10y };
      return both(a, b) ? { a, b, fmt: 'pct', verdict: a.v >= b.v ? '股票的盈利收益率不输国债' : '盈利收益率低于国债：靠增长撑价格' } : null;
    },
  },
  goldAsset: { get: assetYoY('gold'), fmt: 'pct', label: '比一年前' },
};

// concepts with nothing numeric to put on a gauge
export const NO_GAUGE = ['ringStage', 'B1', 'B2', 'longCycle', 'shortCycle'];
