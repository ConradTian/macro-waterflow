// CAUSAL MAP (传导链): a signed, lagged, directed graph over the concept ids of src/data/concepts.js (+ a few extra nodes).
// It is a QUALITATIVE companion of the engine: it says which way a push travels and roughly when it arrives,
// so a learner can judge direction without reading the simulation. Magnitudes come from the sim ("用模拟核对").
// tools/check_causal.mjs turns every valve in the engine and compares the measured direction with propagate() below.
//
// Edge: [from, to, sign, lag, opts?]
//   sign  +1 = same direction (from↑ → to↑), −1 = opposite
//   lag   '立刻' | '1–2 季' | '2–4 季' | '2–3 年'   (how long until the move is visible; same buckets as src/engine/valves.js)
//   opts  { only: 'free' }  edge exists only when the central bank follows its rule (free-run mode); in history mode
//                           the policy rate / QE follow the real US path, so nothing feeds back into them.
//         { why: '…' }      short reason shown when the learner taps the link (keep it to ~12 characters)

export const LAG = { '立刻': 0, '1–2 季': 1.5, '2–4 季': 3, '2–3 年': 9 };
export const lagLabel = q => (q < 0.75 ? '立刻' : q <= 2.25 ? '1–2 季' : q <= 6 ? '2–4 季' : '2–3 年');

// Nodes that are not concept cards. specs = diagram targets (same syntax as src/ui/links.js CONCEPT_TARGETS).
export const EXTRA_NODES = {
  mortgageNew: { name: '新房贷利率', specs: ['n:bank', 'p:newLoans'] },
  borrowWill:  { name: '借款意愿',   specs: ['v:borrowMult', 'n:household'] },
  saving:      { name: '储蓄率',     specs: ['v:saveAdj', 'n:household'] },
  consumption: { name: '消费',       specs: ['p:toConsumption'] },
  lvrCap:      { name: 'LVR 上限',   specs: ['v:lvrCap'] },
};

// node -> valve id in src/engine/valves.js (the knobs the learner can actually turn)
export const VALVE_OF = {
  policyRate: 'policyRate', qe: 'qe', bankApproval: 'approval', lvrCap: 'lvrCap',
  borrowWill: 'borrowMult', saving: 'saveAdj', capex: 'capexMult', fiscalInjection: 'fiscalInjection',
};

// Indicator nodes: readings ("读数"), not forces. Their only outgoing edges go to a lamp.
export const INDICATORS = ['lampCredit', 'lampDebtService', 'lampPolicy', 'lampValuation', 'creditImpulse', 'priceToIncome', 'rentYield'];
// Detection results: not on any chain (their cards say so).
export const DETECTED = ['ringStage', 'B1', 'B2', 'longCycle', 'shortCycle'];
// End points a chain is worth following to (the "water levels" a learner cares about)
export const OUTCOMES = ['housePrice', 'equityAsset', 'bondAsset', 'goldAsset', 'cashAsset', 'cpi', 'unemployment', 'income', 'dsr', 'badLoans', 'M', 'capacity', 'interestToTax', 'pvtDebtGdp', 'govDebtGdp'];

export const EDGES = [
  // ---- 央行 ----
  ['policyRate', 'mortgageNew', +1, '立刻', { why: '新贷款按新利率定价' }],
  ['policyRate', 'discountRate', +1, '1–2 季', { why: '长端跟着预期利率走' }],
  ['policyRate', 'realRate', +1, '立刻'],
  ['policyRate', 'cashAsset', +1, '立刻', { why: '存款利息跟着变' }],
  ['qe', 'M', +1, '立刻', { why: '央行买债造出新水' }],
  ['qe', 'discountRate', -1, '立刻', { why: '买债压低长端利率' }],
  ['qe', 'bondAsset', +1, '立刻', { why: '央行在买，债价上涨' }],
  ['qe', 'goldAsset', +1, '1–2 季', { w: 0.5, why: '对货币的信心下降' }],
  // the rule the central bank follows in free-run mode
  ['cpi', 'policyRate', +1, '1–2 季', { only: 'free', why: '通胀高就加息' }],
  ['outputGap', 'policyRate', +1, '1–2 季', { only: 'free', why: '过热就加息' }],

  // ---- 利率传到借贷 ----
  ['mortgageNew', 'newLoans', -1, '1–2 季', { why: '借钱变贵，借的人少' }],
  ['mortgageNew', 'mortgageEff', +1, '2–4 季', { why: '老房贷分批重定价' }],
  ['mortgageEff', 'interestPaid', +1, '立刻'],
  ['policyRate', 'interestPaid', +1, '1–2 季', { why: '浮动利率的贷款先变' }],
  ['interestPaid', 'dsr', +1, '立刻'],
  ['principalRepay', 'dsr', +1, '立刻'],
  ['income', 'dsr', -1, '立刻', { why: '分母变大' }],
  ['dsr', 'newLoans', -1, '1–2 季', { why: '还款重，不敢再借' }],
  ['dsr', 'badLoans', +1, '2–4 季', { why: '还不起的人变多' }],
  ['dsr', 'consumption', -1, '立刻', { w: 0.5, why: '还完贷款剩得少' }],

  // ---- 银行 ----
  ['bankApproval', 'newLoans', +1, '立刻', { why: '审批松，放得多' }],
  ['bankApproval', 'mortgageNew', -1, '立刻', { w: 0.5, why: '审批紧时加价' }],
  ['lvrCap', 'newLoans', +1, '立刻', { why: '上限高，能借得多' }],
  ['badLoans', 'bankCapital', -1, '立刻', { why: '坏账吃掉资本' }],
  ['badLoans', 'bankApproval', -1, '立刻', { why: '坏账多就收紧' }],
  ['badLoans', 'riskPremium', +1, '立刻', { w: 0.5, why: '恐惧上升' }],
  ['bankCapital', 'bankApproval', +1, '1–2 季', { why: '缓冲垫厚才敢放' }],
  ['riskPremium', 'discountRate', +1, '立刻', { w: 0.5 }],
  ['discountRate', 'mortgageNew', +1, '立刻', { w: 0.7, why: '房贷利率跟着长端走' }],
  ['hhDebt', 'riskPremium', +1, '2–4 季', { w: 0.5, why: '杠杆高，要更多补偿' }],
  ['newLoans', 'bankCapital', -1, '1–2 季', { w: 0.7, why: '放贷多，资本被摊薄' }],
  ['riskPremium', 'mortgageNew', +1, '立刻', { w: 0.5, why: '银行要更高利差' }],
  ['lvr', 'bankApproval', -1, '1–2 季', { w: 0.6, why: '抵押品不够就收紧' }],
  ['lvr', 'badLoans', +1, '2–4 季', { w: 0.5, why: '房子不够抵债' }],

  // ---- 家庭借钱 ----
  ['borrowWill', 'newLoans', +1, '立刻'],
  ['income', 'newLoans', +1, '1–2 季', { w: 0.5, why: '收入高，借得起' }],
  ['newLoans', 'M', +1, '立刻', { why: '放贷 = 造新水' }],
  ['newLoans', 'creditImpulse', +1, '立刻'],
  ['newLoans', 'assetReservoir', +1, '立刻', { why: '新水先去买房买股' }],
  ['newLoans', 'goodsChannel', +1, '立刻', { w: 0.6, why: '借来的钱一部分直接花掉' }],
  ['newLoans', 'hhDebt', +1, '立刻', { why: '借了就欠着' }],
  ['principalRepay', 'M', -1, '立刻', { why: '还本 = 销毁水' }],
  ['principalRepay', 'creditImpulse', -1, '立刻'],
  ['hhDebt', 'principalRepay', +1, '立刻', { w: 0.4, why: '欠得多，每季还得多' }],
  ['hhDebt', 'interestPaid', +1, '立刻', { w: 0.4 }],
  ['hhDebt', 'lvr', +1, '立刻', { why: '欠得多，贷款占房价比例高' }],
  ['newLoans', 'pvtDebtGdp', +1, '立刻', { why: '借了就欠着' }],
  ['principalRepay', 'pvtDebtGdp', -1, '立刻', { why: '还掉就少了' }],
  ['goodsChannel', 'pvtDebtGdp', -1, '2–4 季', { w: 0.5, why: 'GDP 变大，比例变小' }],
  ['cpi', 'pvtDebtGdp', -1, '1–2 季', { w: 0.5, why: '通胀撑大分母' }],

  // ---- 资产池 ----
  ['M', 'assetReservoir', +1, '1–2 季', { w: 0.5 }],
  ['assetReservoir', 'housePrice', +1, '立刻', { why: '买的人多，水位涨' }],
  ['assetReservoir', 'equityAsset', +1, '立刻'],
  ['discountRate', 'bondAsset', -1, '立刻', { why: '利率与债价跷跷板' }],
  ['discountRate', 'equityAsset', -1, '立刻', { why: '远水打折更狠' }],
  ['discountRate', 'housePrice', -1, '2–4 季', { w: 0.7 }],
  ['discountRate', 'capex', -1, '1–2 季', { w: 0.5, why: '融资贵，少投资' }],
  ['discountRate', 'gMinusR', -1, '立刻'],
  ['discountRate', 'interestToTax', +1, '2–3 年', { w: 0.7, why: '国债滚动换成高息' }],
  ['realRate', 'goldAsset', -1, '立刻', { why: '持有黄金不吃亏' }],
  ['housePrice', 'lvr', -1, '立刻', { w: 0.45, why: '房子值钱，安全垫厚' }],
  ['housePrice', 'bankApproval', +1, '1–2 季', { w: 0.7, why: '抵押品好，放更松' }],
  ['housePrice', 'priceToIncome', +1, '立刻'],
  ['housePrice', 'rentYield', -1, '立刻'],
  ['cf', 'equityAsset', +1, '立刻', { why: '盈利是股价的水源' }],
  ['income', 'housePrice', +1, '立刻', { w: 0.7, why: '收入撑起房价' }],

  // ---- 商品河道、收入、就业 ----
  ['saving', 'consumption', -1, '立刻'],
  ['income', 'consumption', +1, '立刻'],
  ['consumption', 'goodsChannel', +1, '立刻'],
  ['M', 'goodsChannel', +1, '1–2 季', { w: 0.5 }],
  ['goodsChannel', 'outputGap', +1, '立刻', { why: '需求抬高水位' }],
  ['goodsChannel', 'cf', +1, '立刻', { why: '卖得多，赚得多' }],
  ['goodsChannel', 'income', +1, '立刻', { why: '卖得多，工资多' }],
  ['outputGap', 'cpi', +1, '1–2 季', { why: '漫堤 = 涨价' }],
  ['outputGap', 'unemployment', -1, '1–2 季', { why: '开工足，要人' }],
  ['unemployment', 'income', -1, '立刻', { why: '没工资' }],
  ['unemployment', 'transfers', +1, '立刻', { w: 0.3, why: '救济自动增加' }],
  ['unemployment', 'badLoans', +1, '1–2 季', { w: 0.7 }],
  ['capacity', 'outputGap', -1, '立刻', { w: 0.6, why: '断面变宽，水位相对变低' }],
  ['capex', 'goodsChannel', +1, '立刻', { why: '先是需求' }],
  ['capex', 'newLoans', +1, '立刻', { w: 0.6, why: '企业借钱扩产' }],
  ['capex', 'capacity', +1, '2–3 年', { why: '建成才是产能' }],
  ['cf', 'capex', +1, '1–2 季', { w: 0.6, why: '赚钱才扩产' }],
  ['cpi', 'realRate', -1, '立刻'],
  ['cpi', 'inflationExp', +1, '2–4 季', { why: '慢慢记住涨价' }],
  ['inflationExp', 'cpi', +1, '1–2 季', { why: '预期会自我实现' }],
  ['cpi', 'discountRate', +1, '1–2 季', { w: 0.5, why: '通胀溢价' }],
  ['cpi', 'gMinusR', +1, '1–2 季', { w: 0.5, why: '名义增长变快' }],
  ['cpi', 'income', +1, '1–2 季', { w: 0.5, why: '名义工资跟涨' }],

  // ---- 政府 ----
  ['fiscalInjection', 'govPurchases', +1, '立刻'],
  ['fiscalInjection', 'transfers', +1, '立刻'],
  ['fiscalInjection', 'M', +1, '立刻', { why: '赤字放出新水' }],
  ['fiscalInjection', 'discountRate', +1, '1–2 季', { w: 0.4, why: '发债多，长端上行' }],
  ['fiscalInjection', 'govDebtGdp', +1, '1–2 季', { why: '赤字靠发债补' }],
  ['govDebtGdp', 'interestToTax', +1, '2–3 年', { why: '债越多，利息越多' }],
  ['goodsChannel', 'govDebtGdp', -1, '2–4 季', { w: 0.5, why: 'GDP 变大，比例变小' }],
  ['cpi', 'govDebtGdp', -1, '1–2 季', { w: 0.5, why: '通胀撑大分母' }],
  ['fiscalInjection', 'goldAsset', +1, '2–4 季', { w: 0.5, why: '对货币的信心下降' }],
  ['govPurchases', 'goodsChannel', +1, '立刻', { why: '订单直接是需求' }],
  ['transfers', 'income', +1, '立刻', { why: '钱直接到家庭' }],
  ['gMinusR', 'govDebtGdp', -1, '2–3 年', { w: 0.5, why: '增长跑赢利率，债变轻' }],

  // ---- 国境线（出口 / 进口 / 汇率 / 外国人买国债 / 储备货币）。fx 的数字 = 每美元换多少本币：变大 = 本币变弱 ----
  ['exports', 'goodsChannel', +1, '立刻', { why: '外国人的订单是额外需求' }],
  ['exports', 'income', +1, '立刻', { w: 0.7, why: '卖出去的货变成工资' }],
  ['exports', 'cf', +1, '立刻', { w: 0.6, why: '卖得多，赚得多' }],
  ['imports', 'goodsChannel', -1, '立刻', { why: '需求漏到国外' }],
  ['goodsChannel', 'imports', +1, '立刻', { w: 0.5, why: '国内旺，买外国货也多' }],
  ['fx', 'cpi', +1, '1–2 季', { why: '本币弱，进口货变贵' }],
  ['fx', 'exports', +1, '1–2 季', { why: '本币便宜，外国人更爱买' }],
  ['policyRate', 'fx', -1, '1–2 季', { why: '利率高，水往这里流，本币变强' }],
  ['foreignBonds', 'discountRate', -1, '立刻', { why: '多一个买家，长端利率被压低' }],
  ['reserveCurrency', 'foreignBonds', +1, '立刻', { w: 0.7, why: '全世界都想存美元债' }],

  // ---- 读数（指示灯）----
  ['creditImpulse', 'lampCredit', +1, '立刻'],
  ['dsr', 'lampDebtService', +1, '立刻'],
  ['realRate', 'lampPolicy', +1, '立刻'],
  ['priceToIncome', 'lampValuation', +1, '立刻'],
  ['equityAsset', 'lampValuation', +1, '立刻', { why: '股价高，P/E 高' }],
  ['income', 'priceToIncome', -1, '立刻'],
];

// snapshot reading for each node (tools/check_causal.mjs compares directions in the engine)
export const METRIC = {
  policyRate: 'rates.policy', mortgageNew: 'rates.mortgageNew', mortgageEff: 'rates.mortgageEff', discountRate: 'rates.gov10y',
  realRate: 'rates.realPolicy', riskPremium: 'rates.riskPremium', newLoans: 'flows.newLoans', principalRepay: 'flows.principalRepay',
  interestPaid: 'flows.interestPaid', M: 'money.M', hhDebt: 'debt.household', dsr: 'household.dsr', lvr: 'household.lvr',
  bankApproval: 'bank.approval', badLoans: 'bank.badLoanRate', bankCapital: 'bank.capitalRatio', housePrice: 'assets.housing.price',
  equityAsset: 'assets.equity.price', bondAsset: 'assets.bond.price', goldAsset: 'assets.gold.price', income: 'household.income',
  consumption: 'household.consumption', saving: 'household.savingRate', cpi: 'macro.inflation', inflationExp: 'macro.inflationExp',
  outputGap: 'macro.outputGap', unemployment: 'macro.unemployment', capacity: 'macro.capacityPotential', capex: 'flows.toCapex',
  cf: 'firm.profit', fiscalInjection: 'flows.fiscalInjection', transfers: 'flows.transfers', govPurchases: 'flows.govPurchases',
  goodsChannel: 'macro.demandPressure', creditImpulse: 'lights.credit.value', priceToIncome: 'assets.housing.priceToIncome',
  rentYield: 'assets.housing.rentYield', interestToTax: 'gov.interestToTax', govDebtGdp: 'gov.debtGdp', cashAsset: 'assets.cash.ret', qe: 'flows.qe',
  // 国境线 (snap.border; null / missing in the US history and the town, so check_causal skips them there)
  exports: 'border.exports', imports: 'border.imports', fx: 'border.fxPerUsd', foreignBonds: 'border.foreignBondBuy',
};
