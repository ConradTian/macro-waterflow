// Concept cards (CONTRACT §5). Toy-model explanations: direction & structure, not forecasts.
// Optional extra field: liveFn(snap, prev) -> number|string, used when a plain path is not enough.
export const CONCEPTS = {
  // ---------- 利率与货币 ----------
  policyRate: {
    name: '政策利率', short: '央行定的最短期借钱价格，是整个利率体系的水龙头阀门',
    water: '总水闸的开度：调高=水位上涨变慢，调低=放水加快。但水要几个季度才流到下游。',
    formula: '规则示意：政策利率 = 中性利率 + a·(通胀 − 目标) + b·产出缺口',
    from: ['cpi', 'outputGap', 'inflationExp'], to: ['realRate', 'mortgageEff', 'discountRate', 'bondAsset', 'cashAsset'],
    why: '央行看不到“未来”，只能看通胀和产出缺口这两个后视镜，所以加息总是慢半拍。它不直接决定房贷利率，而是通过重定价慢慢传导（见有效房贷利率）。',
    live: 'rates.policy', fmt: 'pct' },
  realRate: {
    name: '实际利率', short: '扣掉通胀后，借钱真正花多少代价',
    water: '水闸标称开度减去“水自己蒸发的速度”：通胀越高，同样的名义利率实际越松。',
    formula: '实际利率 ≈ 政策利率 − 通胀（或通胀预期）',
    from: ['policyRate', 'cpi', 'inflationExp'], to: ['lampPolicy', 'discountRate', 'goldAsset', 'cashAsset'],
    why: '决策者对“实际”利率反应，而不是标称。实际利率为负时，存钱亏、借钱赚，资金会冲向资产和实物（B1 的燃料）。',
    live: 'rates.realPolicy', fmt: 'pct' },
  mortgageEff: {
    name: '有效房贷利率', short: '存量房贷平均真正在付的利率，比新房贷利率慢得多',
    water: '水库里的水是几年来不同批次混在一起的：新进来的水温（新利率）变了，库里的平均水温要等旧水逐步换掉才变。',
    formula: '有效利率(t) = (1−φ)·有效利率(t−1) + φ·新房贷利率(t)\nφ = 每季度被重定价的比例（固定利率多则 φ 小）',
    from: ['policyRate', 'riskPremium'], to: ['interestPaid', 'dsr', 'lampDebtService'],
    why: 'φ 解释了为什么加息后 DSR 要拖几个季度才恶化：美国 30 年固定房贷 φ 很小，浮动利率国家 φ 大、冲击来得快。这是“延迟后果”的主要来源。',
    live: 'rates.mortgageEff', fmt: 'pct' },
  M: {
    name: '货币 M（存款）', short: '银行体系里的存款总量，几乎全是贷款“创造”出来的',
    water: '蓄水池里的水量。新贷款=从地下抽水进池，还本=把水抽回地下销毁，所以池水量=历年净借款的累积。',
    formula: 'ΔM = 新贷款 − 还本 + 财政注入 + QE',
    from: ['newLoans', 'principalRepay', 'fiscalInjection', 'qe'], to: ['assetReservoir', 'goodsChannel'],
    why: '这是水流模型的“质量守恒”：每一块钱流入哪里都能追溯来源，所以钱不会凭空消失，只会改道。',
    live: 'money.M', fmt: 'bn' },

  // ---------- 信贷水流 ----------
  newLoans: {
    name: '新贷款', short: '本季度银行新放出去的贷款，是新增购买力的主水源',
    water: '从地下抽上来的新水：一放贷，借款人账户立刻多一笔钱，没有任何人少钱。',
    formula: '新贷款 = 基础需求 × 银行审批倍数 × 利率敏感度 × 抵押品余量',
    from: ['bankApproval', 'mortgageEff', 'lvr', 'income'], to: ['M', 'creditImpulse', 'assetReservoir'],
    why: '购买力来自新贷款，不是来自“存款搬家”。所以信贷脉冲比任何存量指标更先反映需求。',
    live: 'flows.newLoans', fmt: 'bn' },
  principalRepay: {
    name: '还本', short: '本季度借款人还掉的本金，会让存款和购买力消失',
    water: '把水抽回地下：这部分水不是转手给别人，而是真的从池子里消失。',
    formula: '还本 = 存量债务 × 摊还率',
    from: ['hhDebt', 'dsr'], to: ['M', 'creditImpulse'],
    why: '还本是“看不见的紧缩”：债务越高，每季度必须还的越多，净新增购买力就越少。',
    live: 'flows.principalRepay', fmt: 'bn' },
  interestPaid: {
    name: '付息', short: '借款人付给银行的利息，是债务的“摩擦成本”',
    water: '管道的摩擦损耗：水从借款人流向银行和储蓄者，并不消失，但离开了消费者手里。',
    formula: '付息 = 债务存量 × 有效利率',
    from: ['mortgageEff', 'hhDebt'], to: ['dsr', 'income'],
    why: '付息从有钱要花的人手里转到储蓄多的人手里，通常压低总需求，因为后者花钱倾向更低。',
    live: 'flows.interestPaid', fmt: 'bn' },
  creditImpulse: {
    name: '信贷脉冲', short: '新增信贷对需求的净贡献，看“变化”而不是“水位”',
    water: '池子的进水速度减出水速度，再除以经济体量：看的是水位上升的快慢，不是水位本身。',
    formula: '脉冲 = (新贷款 − 还本) / GDP',
    from: ['newLoans', 'principalRepay'], to: ['lampCredit', 'assetReservoir', 'ringStage'],
    why: '需求取决于“新增”购买力。即使债务/GDP 很高，只要脉冲为正，需求仍在扩张；脉冲转负是进入 ⑤ 的早期信号之一。',
    live: 'lights.credit.value', fmt: 'pct' },
  assetReservoir: {
    name: '资产缓冲池', short: '新购买力流向房产、股票等资产的那部分，水位就是资产价格',
    water: '河边的一个蓄洪湖：多出来的钱先涌进去抬高水位，满了才会溢出到商品和通胀（B1）。',
    formula: '资产价格 ↑ ⇐ (流入资产的购买力 − 供给增加) / 资产供给',
    from: ['M', 'newLoans', 'discountRate'], to: ['housePrice', 'equityAsset', 'goodsChannel', 'lampValuation'],
    why: '资产供给弹性小（房子盖得慢），所以信贷涌入首先体现为价格，而不是数量。缓冲池越满，越容易走到 ② 的岔路口。',
    live: null, fmt: 'bn',
    liveFn: s => (s.flows.toHousing || 0) + (s.flows.toFinancial || 0) },
  goodsChannel: {
    name: '商品渠道（溢出）', short: '购买力不进资产，而去买商品和服务，直接推高通胀',
    water: '湖满后的溢洪道：多余的水冲向下游农田（商品市场），造成内涝（通胀）。',
    formula: '通胀压力 ∝ 溢出到商品的购买力 / 有效 Capacity',
    from: ['assetReservoir', 'capacity', 'M'], to: ['cpi', 'inflationExp', 'outputGap'],
    why: '资产渠道满、商品渠道溢出，是 B1 的核心。若水主要流向资产，通胀可以很低而房价飙升——这就是低通胀泡沫。',
    live: 'flows.spillToGoods', fmt: 'bn' },
  fiscalInjection: {
    name: '财政注入', short: '政府赤字支出向经济注入的购买力',
    water: '政府开闸放水：不用先借走别人的水，赤字本身就把新水放进了池子（由国债+央行配合）。',
    formula: '注入 = 政府支出 − 税收（赤字）',
    from: ['interestToTax', 'cpi'], to: ['M', 'goodsChannel', 'ringStage'],
    why: '私人部门还债（⑤）时，政府接手赤字能防止总水量下降——这是 ⑥ 的特征。受 利息/税收 约束。',
    live: 'flows.fiscalInjection', fmt: 'bn' },
  qe: {
    name: 'QE 量化宽松', short: '央行买入债券，直接新造存款和压低长期利率',
    water: '央行从另一个水库直接抽水注入：既增加水量，也把债券的“收益率闸门”往下压。',
    formula: 'QE：央行资产 ↑ ，银行准备金/存款 ↑ ，长债收益率 ↓',
    from: ['policyRate', 'fiscalInjection'], to: ['M', 'discountRate', 'bondAsset', 'equityAsset'],
    why: '当降息到底（接近 0）水闸不能再开大时，QE 是第二把工具。主要通过压低折现率抬高资产价格，而不是直接推高商品价格。',
    live: 'flows.qe', fmt: 'bn' },

  // ---------- 银行 ----------
  bankApproval: {
    name: '银行审批倍数', short: '银行贷款审批的松紧：1 为中性，>1 更松，<1 更紧',
    water: '水泵的开度：抵押品好、资本足时开大，坏账多时关小。',
    formula: '审批 = 1 + a·(抵押品改善) + b·(资本充足) − c·(坏账率上升)',
    from: ['bankCapital', 'badLoans', 'lvr', 'housePrice'], to: ['newLoans'],
    why: '这是顺周期回路：房价涨→抵押品好→放贷松→房价更涨；反转时同样放大。许多“信贷突然干涸”其实是这个回路反向。',
    live: 'bank.approval', fmt: 'num' },
  bankCapital: {
    name: '银行资本比率', short: '银行自有资本占风险资产的比例，是吸收亏损的缓冲垫',
    water: '堤坝的厚度：坏账是洪水，堤坝薄了银行就不敢再放水。',
    formula: '资本比率 = 资本 / 风险加权资产；资本 ← 资本 + 利润 − 坏账损失',
    from: ['badLoans', 'interestPaid'], to: ['bankApproval'],
    why: '资本约束让银行在亏损时必须缩表而不是放贷，这是 B2 时信贷收缩的硬机制。',
    live: 'bank.capitalRatio', fmt: 'pct' },
  badLoans: {
    name: '坏账率', short: '还不上的贷款占比，由 DSR 与抵押品共同决定',
    water: '管道渗漏：渗漏率越高，银行越不敢继续供水。',
    formula: '坏账率 ↑ ⇐ DSR 高且收入下降，且 LVR 高（抵押品不够覆盖）',
    from: ['dsr', 'lvr', 'unemployment'], to: ['bankCapital', 'bankApproval', 'lampDebtService', 'riskPremium'],
    why: '光有 DSR 高不一定违约，抵押品值钱、能卖掉还债；只有“还不起 + 抵押品缩水”叠加才会大面积出事，这就是 B2 的杀伤力。',
    live: 'bank.badLoanRate', fmt: 'pct' },

  // ---------- 家庭 ----------
  income: {
    name: '家庭收入', short: '家庭可支配收入：偿债能力的分母',
    water: '收入河的流量：债务管道抽走多少，要和河的流量比才有意义。',
    formula: '收入 ≈ 工资(就业·工资率) + 转移 − 税',
    from: ['unemployment', 'goodsChannel'], to: ['dsr', 'priceToIncome', 'newLoans'],
    why: '债务有名义价值，收入决定能否承受。通胀抬高名义收入，是“化债”的一种方式。',
    live: 'household.income', fmt: 'bn' },
  hhDebt: {
    name: '家庭债务', short: '家庭欠银行的存量，是新贷款累积减还本的结果',
    water: '地下被抽走水量的总账：欠多少不重要，重要的是每季得还多少。',
    formula: '债务(t) = 债务(t−1) + 新贷款 − 还本',
    from: ['newLoans', 'principalRepay'], to: ['interestPaid', 'dsr', 'lvr'],
    why: '存量债务决定未来现金流被拿走多少，所以债务越多，对利率越敏感。',
    live: 'debt.household', fmt: 'bn' },
  dsr: {
    name: 'DSR 偿债率', short: '每赚 100 块要拿多少去还本付息',
    water: '收入这条河里，被债务管道抽走的比例。',
    formula: 'DSR = (还本 + 付息) / 收入',
    from: ['mortgageEff', 'hhDebt', 'income', 'principalRepay', 'interestPaid'], to: ['bankApproval', 'badLoans', 'newLoans', 'lampDebtService'],
    why: '它比“债务/GDP”更早报警：债务/GDP 是水位，DSR 是抽水速度。利率上升或收入下降都会抬高它，且通过重定价拖几个季度才显现。',
    live: 'household.dsr', fmt: 'pct' },
  lvr: {
    name: 'LVR 贷款价值比', short: '房贷余额占房价的比例，抵押品还剩多少安全垫',
    water: '堤岸高度与洪水的差距：房价下跌=堤岸被削低，LVR 上升。',
    formula: 'LVR = 房贷余额 / 房产价值',
    from: ['hhDebt', 'housePrice'], to: ['bankApproval', 'badLoans', 'newLoans'],
    why: 'LVR 把房价、债务绑在一起：房价↓ → LVR↑ → 银行收紧 → 买家少 → 房价再↓，这是抵押品回路。',
    live: 'household.lvr', fmt: 'pct' },
  unemployment: {
    name: '失业率', short: '想工作但没工作的比例，央行的第二个目标变量',
    water: '工厂水轮没转起来的比例：需求不足时，空转的越多。',
    formula: '失业率 ↑ ⇐ 产出缺口为负（经济低于潜力）',
    from: ['outputGap'], to: ['income', 'badLoans', 'policyRate'],
    why: '失业与产出缺口大致反向（奥肯定律）。失业升高→收入↓→DSR↑，是衰退传到偿债压力的路径。',
    live: 'macro.unemployment', fmt: 'pct' },

  // ---------- 企业 / 宏观 ----------
  capacity: {
    name: 'Capacity 产能', short: '经济在不引发通胀的前提下最多能生产多少',
    water: '河道的最大过流能力：来水超过它就漫堤（通胀）。',
    formula: 'Capacity 增长 = 资本积累(capex) + 劳动力 + 生产率',
    from: ['capex'], to: ['outputGap', 'goodsChannel', 'cpi'],
    why: '通胀本质是需求 vs Capacity。产能长得慢于购买力，才会出现通胀；capex 多则河道变宽。',
    live: 'macro.capacity', fmt: 'idx' },
  capex: {
    name: 'Capex 资本开支', short: '企业投资新设备、厂房，会过几个季度才变成产能',
    water: '在河边修新渠：现在花钱（需求），要几个季度后才增加过流能力（供给）。',
    formula: 'Capex = f(预期利润 CF, 融资成本)；产能增量 = Σ 过去几季 capex（pipeline）',
    from: ['cf', 'discountRate', 'policyRate'], to: ['capacity', 'outputGap'],
    why: 'capex 先增加需求、后增加供给，这个时滞是需求冲击能先造成通胀、之后又缓解的原因。',
    live: 'firm.capex', fmt: 'bn' },
  outputGap: {
    name: '产出缺口', short: '实际产出比 Capacity 高还是低',
    water: '水位与堤顶的差：正=快漫堤（过热），负=水位不足（闲置）。',
    formula: '产出缺口 = (实际产出 − Capacity) / Capacity',
    from: ['capacity', 'goodsChannel'], to: ['cpi', 'unemployment', 'policyRate'],
    why: '缺口为正推高通胀预期，缺口为负让失业上升；它是央行规则最关键的输入之一。',
    live: 'macro.outputGap', fmt: 'pct' },
  cpi: {
    name: 'CPI 通胀', short: '一篮子商品服务价格的年化变化率',
    water: '下游农田的水位涨速：上游溢洪道（商品渠道）放得越多，涨得越快。',
    formula: '通胀 = 通胀预期 + k·产出缺口 + 冲击',
    from: ['outputGap', 'inflationExp', 'goodsChannel'], to: ['policyRate', 'realRate', 'inflationExp', 'lampPolicy'],
    why: '通胀有惯性（预期）加需求拉动（缺口）两部分，所以即使缺口回落，通胀也不会立刻消退。',
    live: 'macro.inflation', fmt: 'pct' },
  inflationExp: {
    name: '通胀预期', short: '人们认为未来通胀会是多少，会自我实现',
    water: '大家对水位涨速的“记忆”：记忆越高，涨价越难压下去。',
    formula: '预期(t) = (1−λ)·预期(t−1) + λ·实际通胀(t)',
    from: ['cpi'], to: ['cpi', 'realRate', 'policyRate'],
    why: '预期一旦失锚，央行需要把实际利率抬到明显为正才能压回去——这就是 Volcker 式加息的逻辑。',
    live: 'macro.inflationExp', fmt: 'pct' },
  cf: {
    name: 'CF 现金流', short: '资产能带来的现金：企业利润、租金、利息',
    water: '水库的稳定入流：资产估值的“水源”，而不是水位本身。',
    formula: '资产价值 ≈ Σ CF(t) / (1+折现率)^t',
    from: ['goodsChannel', 'income'], to: ['equityAsset', 'housePrice', 'capex'],
    why: '价格变化 = CF 变化 + 折现率变化 + 风险溢价变化。拆开三者，就能知道涨价是“真赚钱”还是“估值膨胀”。',
    live: 'firm.profit', fmt: 'bn' },

  // ---------- 资产定价 ----------
  discountRate: {
    name: '折现率', short: '把未来现金流换成今天价格用的利率 = 无风险利率 + 风险溢价',
    water: '“远处的水”打几折才算今天的水：折现率越高，远水越不值钱。',
    formula: '折现率 = 无风险利率(10年国债) + 风险溢价',
    from: ['policyRate', 'qe', 'riskPremium', 'realRate'], to: ['bondAsset', 'equityAsset', 'housePrice', 'capex', 'rentYield'],
    why: '长期资产（高估值股票、房子）像长水管，折现率稍变，价格变化很大。这就是“利率是资产重力”。',
    live: 'rates.gov10y', fmt: 'pct' },
  riskPremium: {
    name: '风险溢价', short: '承担风险要求的额外补偿，恐惧上升则升高',
    water: '水面上的浪：浪高（恐慌）时没人敢下水，价格被压低。',
    formula: '风险溢价 ↑ ⇐ 坏账↑、波动↑、杠杆高、信贷收缩',
    from: ['badLoans', 'lvr', 'bankCapital'], to: ['discountRate', 'mortgageEff', 'equityAsset', 'housePrice'],
    why: '同样的政策利率，风险溢价高时融资成本却更贵，所以危机里降息也未必有效。',
    live: 'rates.riskPremium', fmt: 'pct' },
  gMinusR: {
    name: 'g − r（增长减融资成本）', short: '收入增长是否跑赢利率：负担是自动变轻还是越滚越大',
    water: '债务是一个雪球：g > r 时雪球（相对收入）越滚越轻，g < r 时越滚越重。',
    formula: '债务/收入 的变化 ≈ (r − g)·债务/收入 + 新增赤字',
    from: ['policyRate', 'cpi', 'discountRate'], to: ['interestToTax', 'ringStage'],
    why: '这是金融压制/化债（⑦）的核心：让名义增长高于融资成本，债务相对收入自动缩小，不需要违约。',
    live: null, fmt: 'pct',
    liveFn: (s, p) => { if (!p) return null; return (s.macro.gdpNominal / p.macro.gdpNominal) ** 4 - 1 - s.rates.gov10y; } },
  interestToTax: {
    name: '利息/税收', short: '政府税收中有多少要拿去付利息，A 慢变量的指标',
    water: '政府收入河里被债务抽走的份额：太多就没水可放给学校、道路了。',
    formula: '利息/税收 = 政府付息 / 税收',
    from: ['gMinusR', 'policyRate'], to: ['fiscalInjection', 'ringStage'],
    why: '这比“债务/GDP”更接近真实约束：利息吃掉越多，政府越容易被迫选择印钱或违约（A 失去信心）。',
    live: 'gov.interestToTax', fmt: 'pct' },
  housePrice: {
    name: '房价', short: '房子的价格 = 租金现金流 ÷ 折现率，再被信贷放大',
    water: '最大的蓄水湖：受购买力涌入、利率“重力”和抵押品回路三者共同决定水位。',
    formula: '房价 ≈ 租金 / (折现率 − 租金增长)；再加信贷放大',
    from: ['assetReservoir', 'discountRate', 'mortgageEff', 'bankApproval', 'cf'], to: ['lvr', 'priceToIncome', 'rentYield', 'lampValuation', 'bankApproval'],
    why: '房价与银行审批互为因果（抵押品回路），所以上行下行都被放大，而且比股票慢：房子卖不快，成交先冻结，价格后下跌。',
    live: 'assets.housing.price', fmt: 'idx' },
  priceToIncome: {
    name: '房价/收入', short: '买一套房要攒几年收入，是房价贵不贵的主要体检指标',
    water: '湖水位与河流量的比：水位长期高于河的承载，就容易回落。',
    formula: '房价收入比 = 房价 / 家庭年收入',
    from: ['housePrice', 'income'], to: ['lampValuation', 'bankApproval'],
    why: '收入决定长期能支撑多高的房价；比值偏高但利率低可以维持，利率上升则脆弱。',
    live: 'assets.housing.priceToIncome', fmt: 'num' },
  rentYield: {
    name: '租售比（租金收益率）', short: '一年租金占房价的比例，房子的“股息率”',
    water: '湖里每年可取出的稳定水量占总水量的比例。',
    formula: '租售比 = 年租金 / 房价；与折现率比较：收益率 < 贷款利率 → 靠涨价才能赚钱',
    from: ['housePrice', 'discountRate'], to: ['lampValuation'],
    why: '租售比低于贷款利率说明买房靠“预期上涨”撑着，对利率上升最敏感。',
    live: 'assets.housing.rentYield', fmt: 'pct' },

  // ---------- 四盏灯 ----------
  lampCredit: {
    name: '信贷灯', short: '新增信贷还在扩张还是已收缩（看信贷脉冲）',
    water: '蓄水池进水速度的指示灯。', formula: '绿：脉冲稳定为正；黄：明显减速；红：转负',
    from: ['creditImpulse'], to: ['ringStage'],
    why: '它回答“水还在不在往池里加”。信贷灯先转黄/红，往往领先房价和经济几个季度。',
    live: 'lights.credit.value', fmt: 'pct' },
  lampDebtService: {
    name: '偿债灯', short: '收入被债务抽走的比例是否在上升（看 DSR）',
    water: '管道抽水比例指示灯。', formula: '绿：DSR 低于历史中位；黄：快速上升；红：高位并伴随坏账上升',
    from: ['dsr', 'badLoans'], to: ['ringStage'],
    why: '偿债压力是 ⑤ 的起点，也是“降息能不能重启信贷”的判断依据。',
    live: 'lights.debtService.value', fmt: 'pct' },
  lampPolicy: {
    name: '政策灯', short: '货币政策现在是松还是紧（看实际利率）',
    water: '总水闸开度指示灯。', formula: '绿：实际利率中性；黄：偏离中性；红：深负（B1 燃料）或高位（紧缩风险）',
    from: ['realRate', 'policyRate'], to: ['ringStage'],
    why: '实际利率为负且信贷旺盛时是通胀风险，正得很高则压住偿债能力，两头都是风险。',
    live: 'lights.policy.value', fmt: 'pct' },
  lampValuation: {
    name: '估值灯', short: '资产相对收入、租金是否偏贵（房价/收入、CAPE 等）',
    water: '蓄水湖水位指示灯。', formula: '绿：估值合理；黄：偏高；红：极高，需要低利率才能维持',
    from: ['priceToIncome', 'rentYield', 'housePrice', 'discountRate'], to: ['ringStage'],
    why: '估值灯红不意味着立刻下跌，而是“对加息和信贷收缩特别敏感”。',
    live: 'lights.valuation.value', fmt: 'num' },

  // ---------- 周期环 ----------
  ringStage: {
    name: '债务环 ①–⑧', short: '借钱扩张→缓冲池装满→岔路口(B1/B2)→还债→政府接手→化债→修复',
    water: '一年四季的水循环：借钱=涨水，还债=退水，政府接手=人工调水，化债=洪水渐渐退去。',
    formula: '位置 = 由四盏灯 + 慢变量（利息/税收、g−r…）检测出的概率分布',
    from: ['lampCredit', 'lampDebtService', 'lampPolicy', 'lampValuation', 'gMinusR', 'interestToTax', 'fiscalInjection'], to: ['B1', 'B2', 'cashAsset', 'equityAsset'],
    why: '阶段是“检测”出来的，不是预先设定。所以总是用概率表示，并给出“下一个确认信号”。',
    live: 'ring.stage', fmt: 'num' },
  B1: {
    name: 'B1 溢出到通胀', short: '岔路口之一：需求超过 Capacity，通胀上来，央行被迫加息',
    water: '湖满后水漫过堤，淹了农田（通胀）。',
    formula: 'B1：通胀↑ + 实际利率偏低 → 加息 → DSR ↑',
    from: ['goodsChannel', 'capacity', 'realRate', 'inflationExp'], to: ['policyRate', 'dsr', 'bondAsset', 'goldAsset', 'ringStage'],
    why: '加息后若“降息能重启信贷”就回到 ①（软着陆）；否则转入 ⑤。债券和房产在 B1 通常承压。',
    live: null, fmt: 'txt', liveFn: s => (s.ring.fork === 'B1' ? '当前处于 B1' : '当前未处于 B1') },
  B2: {
    name: 'B2 资产与信用缩水', short: '岔路口之二：资产价格下跌，信贷收缩，通胀低甚至通缩',
    water: '湖水被抽干：抵押品缩水，银行关泵，水回不来。',
    formula: 'B2：房价↓ + LVR↑ + 信贷脉冲<0 + 低通胀',
    from: ['lvr', 'badLoans', 'creditImpulse', 'bankApproval', 'housePrice'], to: ['bondAsset', 'equityAsset', 'fiscalInjection', 'ringStage'],
    why: 'B2 时降息不好使，因为问题是“还不起+抵押品缩水”，而不是“利息太贵”，常需要财政接手(⑥)。',
    live: null, fmt: 'txt', liveFn: s => (s.ring.fork === 'B2' ? '当前处于 B2' : '当前未处于 B2') },

  // ---------- 两个周期表盘（大周期 / 小周期）----------
  longCycle: {
    name: '大周期 · 长期债务周期', short: '几十年一轮：债务一路堆高，降息也救不动后，由政府和央行接手，慢慢化掉',
    water: '多年的水库淤积与清淤：每个小周期都带进一点泥沙（新债），没冲干净的越积越高；淤得太满，只能大清淤（去杠杆），再由政府和央行人工调水。',
    formula: '只看慢变量，且同一阶段要连续 6 季达标才前进：私人债务/GDP 三年变化、房价/收入、坏账率、政策利率是否到底、政府债务/GDP 与赤字、QE、实际利率、DSR',
    from: ['hhDebt', 'priceToIncome', 'badLoans', 'policyRate', 'fiscalInjection', 'qe', 'realRate', 'dsr'], to: ['shortCycle', 'ringStage'],
    why: '为什么要把它和小周期分开？一次衰退不等于大周期换挡：2001 年那次降息就把信贷重新撑起来了。大周期只有在“降息也撑不起信贷、债务要靠还和政府接手”这类慢信号连续出现多年时才前进，而且只顺时针走：① ② ⑤ ⑥ ⑦ ⑧ 再回到 ①。③ ④（岔路与降息重启）是小周期里的事。',
    live: 'cycles.long.label', fmt: 'txt' },
  shortCycle: {
    name: '小周期 · 短期债务周期', short: '几年一轮：扩张 → 过热(B1) 或 缩水(B2) → 收紧·衰退 → 降息重启 → 扩张',
    water: '一年的季节性涨落：春耕涨水（扩张）、夏汛要么漫堤（过热 B1）要么河床抬高水却流不动（缩水 B2）、秋收关闸（收紧·衰退）、冬季放水再开泵（降息重启）。',
    formula: '看四盏灯 + 失业率：通胀与加息 → B1；信贷脉冲转负且房价不涨/DSR 升 → B2；失业率较低点上升或信贷脉冲大幅为负 → 收紧·衰退；央行降息或已近零 → 降息重启；信贷脉冲回正且失业率不再升 → 扩张。证据连续 2–3 季才前进',
    from: ['lampCredit', 'lampDebtService', 'lampPolicy', 'lampValuation', 'creditImpulse', 'unemployment', 'policyRate'], to: ['B1', 'B2', 'longCycle'],
    why: '小周期每隔几年就重复一次，大周期的位置决定了每次“降息重启”还有多大力气。小周期里每个顶点比上一个顶点背的债更多，所以大周期是被一轮轮小周期“棘轮式”推着往前走的。',
    live: 'cycles.short.label', fmt: 'txt' },

  // ---------- 五类资产 ----------
  cashAsset: {
    name: '现金', short: '短期利率赚取的收益，实际回报=名义−通胀',
    water: '放在池边不动的水：不会涨也不会冲走，但通胀会让它蒸发。',
    formula: '现金回报 ≈ 政策利率 / 4（每季）',
    from: ['policyRate', 'cpi'], to: ['ringStage'],
    why: '加息和 B2 时现金相对占优；金融压制(⑦)时实际回报为负。',
    live: 'assets.cash.ret', fmt: 'pct' },
  bondAsset: {
    name: '长期国债', short: '价格与收益率反向：利率降→债价涨，利率升→债价跌',
    water: '长水管：折现率一变，管内的水值多少钱变化很大。',
    formula: '债价变化 ≈ − 久期 × Δ收益率 + 票息',
    from: ['discountRate', 'policyRate', 'qe', 'cpi'], to: ['ringStage'],
    why: 'B2 通缩时债券最强，B1 通胀时最弱；所以它是判断“通胀 vs 通缩”的赌注。',
    live: 'assets.bond.ret', fmt: 'pct' },
  equityAsset: {
    name: '股票', short: '价格 = 企业盈利 × 估值倍数，同时看盈利和折现率',
    water: '工厂水轮：盈利是水量，折现率是重力。',
    formula: '股价 ≈ 盈利 CF × 市盈率；市盈率 ~ 1 / (折现率 − 增长)',
    from: ['cf', 'discountRate', 'riskPremium', 'qe'], to: ['lampValuation', 'ringStage'],
    why: '盈利下降会杀估值，QE/降息会推估值；两者同时发生时（B2 初期）股票最难判断。',
    live: 'assets.equity.ret', fmt: 'pct' },
  goldAsset: {
    name: '黄金', short: '不产生现金流的价值储存，实际利率低或失去信心时受益',
    water: '一块不会蒸发的石头：水越不值钱，石头越有价值。',
    formula: '黄金 ≈ − 实际利率 + 对货币信心的下降',
    from: ['realRate', 'fiscalInjection', 'qe'], to: ['ringStage'],
    why: '没有现金流，所以对折现率最敏感；⑥⑦ 阶段的货币贬值使它表现好。',
    live: 'assets.gold.ret', fmt: 'pct' },
};

// Keyword -> concept id, used to turn plain rule text into clickable terms (longest first matters).
export const KEYWORDS = [
  ['政策利率', 'policyRate'], ['实际利率', 'realRate'], ['有效房贷利率', 'mortgageEff'], ['房贷利率', 'mortgageEff'],
  ['新贷款', 'newLoans'], ['还本', 'principalRepay'], ['付息', 'interestPaid'], ['信贷脉冲', 'creditImpulse'],
  ['DSR', 'dsr'], ['LVR', 'lvr'], ['审批', 'bankApproval'], ['资本比率', 'bankCapital'], ['坏账', 'badLoans'],
  ['财政注入', 'fiscalInjection'], ['QE', 'qe'], ['Capacity', 'capacity'], ['Capex', 'capex'], ['产出缺口', 'outputGap'],
  ['CPI', 'cpi'], ['通胀预期', 'inflationExp'], ['通胀', 'cpi'], ['失业率', 'unemployment'], ['折现率', 'discountRate'], ['风险溢价', 'riskPremium'],
  ['利息/税收', 'interestToTax'], ['租售比', 'rentYield'], ['房价/收入', 'priceToIncome'], ['房价', 'housePrice'], ['B1', 'B1'], ['B2', 'B2'], ['CF', 'cf'],
];
