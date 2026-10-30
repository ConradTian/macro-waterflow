// Town scenario (DESIGN v2 section 1): a tiny synthetic economy in 万元 run by the SAME engine and rules.
// 1 bank (镇银行), 5 households, 10 houses, 1 shop (小卖部), government, central bank. Quarterly.
// Aggregate node values (Dh, M, inc, HV ...) are exactly the sums of the people below.
// No Node-only APIs. Deterministic.

// ---- neutral exogenous data in US_Q shape (constants; no shocks, no oil, steady policy rate)
const N = 124;
const dates = Array.from({ length: N }, (_, t) => `${1995 + Math.floor(t / 4)}Q${(t % 4) + 1}`);
const c = v => Array.from({ length: N }, () => v);
export const TOWN_DATA = {
  dates, reservedFrom: '2999Q4',
  series: {
    policyRate: c(0.04), mortgageRate: c(0.065), gov10y: c(0.045), cpiYoY: c(0.02), coreCpiYoY: c(0.02),
    unemployment: c(0.055), gdpNominal: c(200), gdpRealGrowthYoY: c(0.022),
    houseIndex: c(100), equityIndex: c(100), cape: c(20), goldIndex: c(100), oilPrice: c(60),
    hhDsr: c(null), privateCreditGdp: c(1.2), hhDebtGdp: c(0.95), govDebtGdp: c(0.3), bankCredit: c(null),
  },
  meta: { sources: {}, notes: ['Synthetic town economy, units 万元 per year (GDP 200). Neutral constants.'] },
};

// 10 houses at 40 万元 each (HV0 = 400). Mortgages sum to 0.8*Dh = 152, other debt 38 -> Dh = 190 (= 0.95*200).
export const TOWN_HV0 = 400;
export const TOWN_HOUSES = 10;
const PEOPLE = [
  // name, deposit, debt, houses, income (万元/年)
  ['小王', 10, 30, 1, 24],
  ['老李', 35, 10, 3, 36],
  ['阿珍', 12, 43, 2, 28],
  ['大刘', 20, 75, 3, 32],
  ['小陈', 8, 32, 1, 12],
];

export function makeTown() {
  return {
    hh: PEOPLE.map(([name, deposit, debt, houses, income]) => ({ name, deposit, debt, houses, income })),
    shop: { name: '小卖部', deposit: 20 },
    bank: { name: '镇银行', pocket: 5 },   // 5 + 20 + 85 = M0 = 110
    sales: 0,                                  // shop sales this quarter (goods channel)
  };
}

const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

// public block for the snapshot (deep copy)
export function townBlock(S) {
  const T = S.town;
  const hv = S.HV / TOWN_HOUSES;
  return {
    units: '万元', housePrice: hv, houseCount: TOWN_HOUSES,
    households: T.hh.map(h => ({ name: h.name, deposit: h.deposit, debt: h.debt, house: h.houses * hv, houses: h.houses, income: h.income })),
    shop: { name: T.shop.name, deposit: T.shop.deposit, debt: S.Df, sales: T.sales },
    bank: { name: T.bank.name, pocket: T.bank.pocket, loans: S.Dh + S.Df },
  };
}

// one engine quarter -> distribute aggregates to people
export function evolveTown(S0, S, extra) {
  const T0 = S0.town;
  const nInc = S.inc / S0.inc, f = S.M / S0.M;
  const incTot = sum(T0.hh, h => h.income);
  const outShare = extra.outH / S0.Dh;
  const hh = T0.hh.map(h => ({
    ...h,
    income: h.income * nInc,
    debt: h.debt * (1 - outShare) + extra.nlH * (h.income / incTot),
    deposit: h.deposit * f,
  }));
  return {
    hh, shop: { ...T0.shop, deposit: T0.shop.deposit * f }, bank: { ...T0.bank, pocket: T0.bank.pocket * f },
    sales: (1 - S.sav) * S.inc * 0.25,
  };
}

export function zeroFlowsTown() {
  const k = ['newLoans', 'principalRepay', 'interestPaid', 'fiscalInjection', 'qe', 'toHousing', 'toFinancial', 'toEquity', 'toBond', 'toGold',
    'toConsumption', 'toCapex', 'toCash', 'wages', 'profits', 'taxes', 'spillToGoods', 'fiscalDrain', 'govSurplusDrain', 'qt', 'writeoff', 'bankRecap',
    'rent', 'dividends', 'coupons', 'govPurchases', 'transfers'];
  return Object.fromEntries(k.map(x => [x, 0]));
}

// ---- single-action demos. Mutates S in place (S = model branch state). Returns { ok, kind, who, text, flows, pumped, drained, reason }
// Action list: loan / buyHouse / repay / payInterest / spend  (plus riskOff / saving handled in sim.js as decisions)
export function applyTownAction(S, K, a) {
  const T = S.town;
  const kind = a && a.type;
  const person = n => T.hh.find(h => h.name === n);
  const fail = reason => ({ ok: false, kind, who: a && a.who, reason, flows: {}, pumped: 0, drained: 0, text: reason });
  const me = person(a && a.who);
  if (!me) return fail(`没有这个人：${a && a.who}`);
  const f = zeroFlowsTown();
  const refresh = () => { S.lvr = 0.8 * S.Dh / S.HV; S.dsr = (S.mortEff + K.alphaH) * S.Dh / S.inc; };
  let pumped = 0, drained = 0, text = '';

  if (kind === 'loan') {
    const amt = Number(a.amount);
    if (!(amt > 0)) return fail('贷款金额必须大于 0');
    me.debt += amt; me.deposit += amt; S.Dh += amt; S.M += amt;
    f.newLoans = amt; f.toCash = amt; pumped = amt;
    text = `${me.name}向镇银行借款 ${amt} 万元：存款 +${amt}（凭空新增的水），同时欠款 +${amt}（地下的洞深了）`;
  } else if (kind === 'repay') {
    const amt = Math.min(Number(a.amount), me.debt, me.deposit);
    if (!(amt > 0)) return fail(me.deposit <= 0 ? `${me.name}账上没有存款可还` : `${me.name}没有债务可还`);
    me.debt -= amt; me.deposit -= amt; S.Dh -= amt; S.M -= amt;
    f.principalRepay = amt; drained = amt;
    text = `${me.name}还本 ${amt} 万元：存款 -${amt}（回灌：水被销毁），欠款 -${amt}（地下的洞浅了）`;
  } else if (kind === 'payInterest') {
    const amt = Math.min(Number(a.amount), me.deposit);
    if (!(amt > 0)) return fail(`${me.name}账上没有存款付息`);
    me.deposit -= amt; T.bank.pocket += amt;
    f.interestPaid = amt;
    text = `${me.name}付利息 ${amt} 万元：水从${me.name}流到镇银行（水量不变，只是换了口袋）`;
  } else if (kind === 'spend') {
    const amt = Math.min(Number(a.amount), me.deposit);
    if (!(amt > 0)) return fail(`${me.name}账上没有存款可花`);
    me.deposit -= amt; T.shop.deposit += amt; T.sales += amt;
    f.toConsumption = amt;
    text = `${me.name}在小卖部花 ${amt} 万元：水流进商品渠道（小卖部），水量不变`;
  } else if (kind === 'buyHouse') {
    const seller = person(a.from);
    if (!seller) return fail(`没有这个卖家：${a.from}`);
    if (seller === me) return fail('买家和卖家不能是同一个人');
    if (seller.houses < 1) return fail(`${seller.name}没有房子可卖`);
    const price = a.price != null ? Number(a.price) : S.HV / TOWN_HOUSES;
    const loan = Number(a.loan) || 0;
    if (loan > 0) {
      me.debt += loan; me.deposit += loan; S.Dh += loan; S.M += loan;
      f.newLoans += loan; pumped += loan;
    }
    if (me.deposit < price - 1e-9) {
      // roll back the loan, nothing happened
      if (loan > 0) { me.debt -= loan; me.deposit -= loan; S.Dh -= loan; S.M -= loan; }
      return fail(`${me.name}存款 ${me.deposit.toFixed(1)} 万元不够付房款 ${price.toFixed(1)} 万元（可以先贷款）`);
    }
    me.deposit -= price; seller.deposit += price; me.houses += 1; seller.houses -= 1;
    f.toHousing = price;
    // buying an existing asset bids up the housing pool level, but moves water only (no new goods capacity)
    const lnH = 0.4 * price / S.HV;
    S.H *= Math.exp(lnH); S.Hret = Math.exp(lnH) - 1; S.Hh[S.Hh.length - 1] = S.H; S.Hpk = Math.max(S.Hpk, S.H);
    S.HV = K.HV0 * S.H / 100;
    text = `${me.name}向${seller.name}买房，房款 ${price.toFixed(1)} 万元${loan > 0 ? `（其中新借 ${loan} 万元）` : ''}：水从${me.name}流到${seller.name}，房价水位 +${(lnH * 100).toFixed(1)}%`;
  } else return fail(`未知操作：${kind}`);

  refresh();
  // accumulate into this quarter's flows
  S.flows = S.flows || zeroFlowsTown();
  for (const k of Object.keys(f)) S.flows[k] = (S.flows[k] || 0) + f[k];
  S.flows.toFinancial = S.flows.toEquity + S.flows.toBond + S.flows.toGold;
  return { ok: true, kind, who: me.name, from: a.from, flows: f, pumped, drained, text, pipes: Object.keys(f).filter(k => f[k] > 0) };
}
