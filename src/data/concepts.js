// Concept cards (CONTRACT §5). Toy-model explanations: direction & structure, not forecasts.
//
// Card fields (src/ui/concepts.js renders them in this order):
//   name, short   = 是什么 (ONE sentence)
//   why(s, p, c)  = 为什么现在是这个值: a short string computed from the live snapshot s (p = previous quarter or null, c = context helpers below).
//                   '\n' starts a new line. Must never throw and never return '' (the UI falls back to a plain line if it does).
//   water         = 水的比喻     formula = 公式     from / to = 受谁影响 / 影响谁
//   logic         = 合理性, written in ACTOR ORDER: who does what -> what flows -> what changes ('\n' = one step per line)
//   live / liveFn / fmt = the current-value row
// ctx c = { town, unit, date, money(v), pct(v,d), past(n) -> snapshot n quarters earlier | null, ago(n) -> '2 年前' | '8 季前',
//           since(fn) -> { t, date } = first quarter of the current streak in which fn(snapshot) is true }
// Scenario-aware: c.town is true for the 万元 town (dates look like 第3季); the US wording ("美国第一次是 2008-11") is only used when !c.town.

const ok = v => typeof v === 'number' && isFinite(v);
const P = (v, d = 1) => (ok(v) ? (v * 100).toFixed(d) + '%' : '—');
const PP = (v, d = 1) => (ok(v) ? (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(d) + 'pp' : '—');
const X2 = v => (ok(v) ? v.toFixed(2) : '—');
const lvl = s => ({ green: '绿', yellow: '黄', red: '红' }[s] || '—');
const upDown = (d, eps = 1e-9) => (d > eps ? 'up' : d < -eps ? 'down' : 'flat');
// "比上季多/少" without being noisy about tiny moves
const vs = (v, pv, big = 0.03) => (!ok(v) || !ok(pv) || pv === 0 ? 'flat' : upDown((v - pv) / Math.abs(pv), big));
const lampWhy = key => s => { const L = s.lights?.[key]; return L ? `现在是${lvl(L.level)}灯：${L.driver}` : '这盏灯现在没有读数。'; };

// helpers handed to every concept's why(snap, prev, ctx): units, formatting, history lookups (see the header of src/data/concepts.js)
export function makeCtx(snap, sim) {
  const town = snap.scenario === 'town' || !!snap.town;
  const br = snap.branch || 'model';
  const past = n => { try { return sim && snap.t - n >= 0 ? sim.snapshot(br, snap.t - n) : null; } catch (e) { return null; } };
  const money = v => {
    if (!(typeof v === 'number' && isFinite(v))) return '—';
    if (town) return (Math.abs(v) < 10 ? v.toFixed(1) : String(Math.round(v))) + ' 万元';
    return Math.abs(v) >= 1000 ? (v / 1000).toFixed(2) + ' 万亿美元' : Math.round(v) + ' 十亿美元';
  };
  return {
    town, unit: town ? '万元' : '十亿美元', date: snap.date, money,
    num: v => (!ok(v) ? '—' : town ? (Math.abs(v) < 10 ? v.toFixed(1) : String(Math.round(v))) : String(Math.round(v))),
    pct: (v, d = 1) => (typeof v === 'number' && isFinite(v) ? (v * 100).toFixed(d) + '%' : '—'),
    past,
    ago: n => (!town && n % 4 === 0 ? n / 4 + ' 年前' : n + ' 季前'),
    since: fn => {           // first quarter of the current unbroken streak where fn(snapshot) holds (null if it does not hold now)
      try {
        if (!sim || !fn(snap)) return null;
        let t = snap.t, hit = snap;
        while (t > 0) { const q = sim.snapshot(br, t - 1); if (!q || !fn(q)) break; t--; hit = q; }
        return { t, date: hit.date };
      } catch (e) { return null; }
    },
  };
}

// private debt (household + firm) / annual nominal GDP, and its 3-year window (the long-cycle dial reads exactly these numbers)
const pvtRatio = x => { const h = x?.debt?.household, f = x?.debt?.firm, g = x?.macro?.gdpNominal; return ok(h) && ok(f) && ok(g) && g > 0 ? (h + f) / g : null; };
const govRatio = x => (ok(x?.gov?.debtGdp) ? x.gov.debtGdp : null);
const win12 = (c, fn) => { const a = []; for (let k = 1; k <= 12; k++) { const q = c.past(k); const v = q ? fn(q) : null; if (ok(v)) a.push(v); } return a; };

export const CONCEPTS = {
  // ---------- 利率与货币 ----------
  policyRate: {
    name: '政策利率', short: '央行定的最短期借钱价格，是整个利率体系的水龙头阀门。',
    why: (s, p, c) => {
      const r = s.rates?.policy, dr = p ? r - p.rates.policy : 0, m = s.macro || {};
      const base = `通胀 ${P(m.inflation)}、产出缺口 ${P(m.outputGap)}、失业 ${P(m.unemployment)}`;
      if (r <= 0.0025) return `现在 ${P(r, 2)}，已经贴近 0：${base}。降息降到底了，再想放水只剩 QE。`;
      if (dr > 0.0005) return `现在 ${P(r, 2)}，比上季加了 ${PP(dr, 2)}：${base}，央行在收紧水闸。`;
      if (dr < -0.0005) return `现在 ${P(r, 2)}，比上季降了 ${(-dr * 100).toFixed(2)}pp：${base}，央行在放松水闸。`;
      return `现在 ${P(r, 2)}，和上季一样：${base}，央行按规则判断暂时不用动。`;
    },
    water: '总水闸的开度：调高=水位上涨变慢，调低=放水加快。但水要几个季度才流到下游。',
    formula: '规则示意：政策利率 = 中性利率 + a·(通胀 − 目标) + b·产出缺口',
    from: ['cpi', 'outputGap', 'inflationExp'], to: ['realRate', 'mortgageEff', 'discountRate', 'bondAsset', 'cashAsset'],
    logic: '央行：每季看通胀和产出缺口（只有后视镜）\n→ 通胀高、缺口正就加息，反之降息\n→ 短期借款价格先变，房贷利率要靠重定价慢慢跟（见「有效房贷利率」）\n→ 所以央行总是慢半拍；降到 0 之后降息失灵，就轮到 QE（环 ⑤→⑥）。',
    live: 'rates.policy', fmt: 'pct' },
  realRate: {
    name: '实际利率', short: '扣掉通胀后，借钱真正花多少代价。',
    why: (s) => {
      const r = s.rates?.realPolicy;
      const tail = r < -0.005 ? '为负：存钱在缩水、借钱反而赚，钱会冲向资产和实物（B1 的燃料）。' : r > 0.02 ? '明显为正：借钱偏贵，会压低信贷。' : '接近中性，对信贷不推也不拉。';
      return `现在 ${P(r, 2)} = 政策利率 ${P(s.rates?.policy, 2)} − 通胀 ${P(s.macro?.inflation)}。${tail}`;
    },
    water: '水闸标称开度减去“水自己蒸发的速度”：通胀越高，同样的名义利率实际越松。',
    formula: '实际利率 ≈ 政策利率 − 通胀（或通胀预期）',
    from: ['policyRate', 'cpi', 'inflationExp'], to: ['lampPolicy', 'discountRate', 'goldAsset', 'cashAsset'],
    logic: '借款人和投资者：看的是扣掉通胀后的利率，不是标称数字\n→ 实际利率为负，存钱亏、借钱和买资产赚，资金流向房子、股票、黄金\n→ 资产涨、通胀慢慢起来（B1 的燃料）；实际利率很高则相反，压住借款。',
    live: 'rates.realPolicy', fmt: 'pct' },
  mortgageEff: {
    name: '有效房贷利率', short: '存量房贷平均真正在付的利率，比新房贷利率慢得多。',
    why: (s) => {
      const e = s.rates?.mortgageEff, n = s.rates?.mortgageNew;
      const tail = n > e + 0.002 ? '新利率更高，老房贷还要几年才逐步重定价上来，DSR 会继续被拖高。' : n < e - 0.002 ? '新利率更低，老房贷在慢慢重定价下来，付息压力逐步减轻。' : '两者接近，付息压力基本稳定。';
      return `存量平均 ${P(e, 2)}，而今天新放的房贷利率是 ${P(n, 2)}：${tail}`;
    },
    water: '水库里的水是几年来不同批次混在一起的：新进来的水温（新利率）变了，库里的平均水温要等旧水逐步换掉才变。',
    formula: '有效利率(t) = (1−φ)·有效利率(t−1) + φ·新房贷利率(t)\nφ = 每季度被重定价的比例（固定利率多则 φ 小）',
    from: ['policyRate', 'riskPremium'], to: ['interestPaid', 'dsr', 'lampDebtService'],
    logic: '央行：改政策利率 → 银行：新房贷利率立刻跟着变\n→ 但家庭手里的老房贷只有一小部分（φ）每季重定价\n→ 平均利率慢慢爬，付息和 DSR 拖几个季度才变\n→ 这是「延迟后果」的主要来源：美国 30 年固定 φ 小，浮动利率国家冲击来得快。',
    live: 'rates.mortgageEff', fmt: 'pct' },
  M: {
    name: '货币 M（存款）', short: '银行体系里的存款总量，几乎全是贷款“创造”出来的。',
    why: (s, p, c) => {
      const b = s.budget, f = s.flows || {};
      if (!p || !b) return `现在存款总量 ${c.money(s.money?.M)}。`;
      const d = s.money.M - p.money.M;
      const parts = [['放贷', f.newLoans], ['QE', f.qe], ['财政注入', f.fiscalInjection]].filter(x => (x[1] || 0) > 1e-6).map(x => `${x[0]} +${c.money(x[1])}`);
      const outs = [['还本', f.principalRepay], ['盈余/QT', (f.govSurplusDrain || 0) + (f.qt || 0)]].filter(x => (x[1] || 0) > 1e-6).map(x => `${x[0]} −${c.money(x[1])}`);
      return `现在 ${c.money(s.money.M)}，比上季${d >= 0 ? '多' : '少'}了 ${c.money(Math.abs(d))}：${[...parts, ...outs].join('，') || '本季几乎没有新水进出'}。`;
    },
    water: '蓄水池里的水量。新贷款=从地下抽水进池，还本=把水抽回地下销毁，所以池水量=历年净借款的累积。',
    formula: 'ΔM = 新贷款 − 还本 + 财政注入 + QE',
    from: ['newLoans', 'principalRepay', 'fiscalInjection', 'qe'], to: ['assetReservoir', 'goodsChannel'],
    logic: '银行放贷、央行 QE、政府赤字：各自在账上新增存款（泵）\n→ 借款人还本、政府盈余、央行 QT：存款被销毁（排水口）\n→ 其余（工资、消费、利息、税）只是水在各人口袋间搬家\n→ 所以每一块钱都能追溯来源：钱不会凭空消失，只会改道。',
    live: 'money.M', fmt: 'bn' },

  // ---------- 信贷水流 ----------
  newLoans: {
    name: '新贷款', short: '本季度银行新放出去的贷款，是新增购买力的主水源。',
    why: (s, p, c) => {
      const nl = s.flows?.newLoans, pn = p?.flows?.newLoans;
      const t = vs(nl, pn) === 'up' ? '比上季多：银行审批更松、或借款更便宜。' : vs(nl, pn) === 'down' ? '比上季少：审批收紧、或借款人不敢借。' : '和上季差不多。';
      return `本季 ${c.money(nl)}（上季 ${c.money(pn)}）：审批倍数 ×${X2(s.bank?.approval)}，新房贷利率 ${P(s.rates?.mortgageNew, 2)}。${t}`;
    },
    water: '从地下抽上来的新水：一放贷，借款人账户立刻多一笔钱，没有任何人少钱。',
    formula: '新贷款 = 基础需求 × 银行审批倍数 × 利率敏感度 × 抵押品余量',
    from: ['bankApproval', 'mortgageEff', 'lvr', 'income'], to: ['M', 'creditImpulse', 'assetReservoir'],
    logic: '银行：审批通过一笔贷款 → 借款人账户立刻多出存款（新水）\n→ 借款人拿去买房、买股、消费或投资\n→ 资产价格和需求上升；债务也同步多出一张欠条\n→ 购买力来自新贷款，不是存款搬家，所以信贷脉冲最先反映需求（环 ①②）。',
    live: 'flows.newLoans', fmt: 'bn' },
  principalRepay: {
    name: '还本', short: '本季度借款人还掉的本金，会让存款和购买力消失。',
    why: (s, p, c) => {
      const r = s.flows?.principalRepay, nl = s.flows?.newLoans;
      return `本季还掉 ${c.money(r)}，新借 ${c.money(nl)}：${r > nl ? '还得比借得多，存款在净减少（去杠杆，环 ⑤ 的特征）。' : '借得比还得多，存款还在净增加。'}`;
    },
    water: '把水抽回地下：这部分水不是转手给别人，而是真的从池子里消失。',
    formula: '还本 = 存量债务 × 摊还率',
    from: ['hhDebt', 'dsr'], to: ['M', 'creditImpulse'],
    logic: '家庭、企业：把收入的一部分拿去还本金\n→ 银行收回本金，对应的存款和欠条一起销毁（水真的少了）\n→ 净新增购买力 = 新贷款 − 还本，债务越高每季必须还得越多\n→ 这是「看不见的紧缩」，也是进入环 ⑤ 的原因之一。',
    live: 'flows.principalRepay', fmt: 'bn' },
  interestPaid: {
    name: '付息', short: '借款人付给银行的利息，是债务的“摩擦成本”。',
    why: (s, p, c) => {
      const f = s.flows?.interestPaid, debt = (s.debt?.household || 0) + (s.debt?.firm || 0);
      return `本季付息 ${c.money(f)}：全社会私人债务 ${c.money(debt)}，平均房贷利率 ${P(s.rates?.mortgageEff, 2)}（债务越多、利率越高，付得越多）。`;
    },
    water: '管道的摩擦损耗：水从借款人流向银行和储蓄者，并不消失，但离开了消费者手里。',
    formula: '付息 = 债务存量 × 有效利率',
    from: ['mortgageEff', 'hhDebt'], to: ['dsr', 'income'],
    logic: '借款人：每季向银行付利息\n→ 钱从爱花钱的借款人手里转到储蓄多的人手里（水只搬家，不消失）\n→ 后者花得少，总需求被压低\n→ 付息占收入的比重就是 DSR 的一部分。',
    live: 'flows.interestPaid', fmt: 'bn' },
  creditImpulse: {
    name: '信贷脉冲', short: '新增信贷对需求的净贡献，看“变化”而不是“水位”。',
    why: (s, p, c) => {
      const f = s.flows || {}, net = (f.newLoans || 0) - (f.principalRepay || 0), v = s.lights?.credit?.value;
      return `现在 ${P(v, 2)}：新贷款 ${c.money(f.newLoans)} − 还本 ${c.money(f.principalRepay)} = 净增 ${net >= 0 ? '' : '−'}${c.money(Math.abs(net))}。${v < -0.003 ? '转负了：新增购买力在收缩，是进入环 ⑤ 的早信号。' : v > 0.03 ? '很高：信贷在猛烈扩张。' : '为正或接近 0：需求还没被信贷拖累。'}`;
    },
    water: '池子的进水速度减出水速度，再除以经济体量：看的是水位上升的快慢，不是水位本身。',
    formula: '脉冲 = (新贷款 − 还本) / GDP',
    from: ['newLoans', 'principalRepay'], to: ['lampCredit', 'assetReservoir', 'ringStage'],
    logic: '银行放贷、借款人还本：两股水一进一出\n→ 净进水占 GDP 的比例 = 脉冲\n→ 需求取决于「新增」购买力：债务/GDP 再高，只要脉冲为正需求仍在扩张\n→ 脉冲转负是进入环 ⑤ 的早期信号。',
    live: 'lights.credit.value', fmt: 'pct' },
  assetReservoir: {
    name: '资产缓冲池', short: '新购买力流向房产、股票等资产的那部分，水位就是资产价格。',
    why: (s, p, c) => {
      const f = s.flows || {}, a = (f.toHousing || 0) + (f.toFinancial || 0), g = f.spillToGoods || 0, tot = a + g;
      return `本季流进资产 ${c.money(a)}（房产 ${c.money(f.toHousing)} + 金融 ${c.money(f.toFinancial)}），溢向商品 ${c.money(g)}：资产占 ${tot > 0 ? P(a / tot, 0) : '—'}。${a > g ? '水主要进了资产湖，所以价格先涨、通胀不高。' : '大部分直接流向商品，通胀压力更大。'}`;
    },
    water: '河边的一个蓄洪湖：多出来的钱先涌进去抬高水位，满了才会溢出到商品和通胀（B1）。',
    formula: '资产价格 ↑ ⇐ (流入资产的购买力 − 供给增加) / 资产供给',
    from: ['M', 'newLoans', 'discountRate'], to: ['housePrice', 'equityAsset', 'goodsChannel', 'lampValuation'],
    logic: '借款人、投资者：把新增的钱拿去买房、买股、买债、买黄金\n→ 资产供给弹性小（房子盖得慢），买的人多，价格先涨\n→ 这笔钱只是换了手，不会变成新的商品供给\n→ 缓冲池越满，越容易走到环 ② 的岔路口（溢出 B1 或缩水 B2）。',
    live: null, fmt: 'bn',
    liveFn: s => (s.flows.toHousing || 0) + (s.flows.toFinancial || 0) },
  goodsChannel: {
    name: '商品渠道（溢出）', short: '购买力不进资产，而去买商品和服务，直接推高通胀。',
    why: (s, p, c) => {
      const g = s.macro?.outputGap;
      return `本季溢向商品 ${c.money(s.flows?.spillToGoods)}；产出缺口 ${P(g)}：${g > 0.01 ? '水位超过堤顶，需求大于产能，通胀被往上推。' : g < -0.01 ? '河道还没满，有闲置产能，通胀压力小。' : '水位接近堤顶，不松不紧。'}`;
    },
    water: '湖满后的溢洪道：多余的水冲向下游农田（商品市场），造成内涝（通胀）。',
    formula: '通胀压力 ∝ 溢出到商品的购买力 / 有效 Capacity',
    from: ['assetReservoir', 'capacity', 'M'], to: ['cpi', 'inflationExp', 'outputGap'],
    logic: '家庭、企业：拿到钱后去买商品和服务\n→ 商品河道水位上升，超过产能（河道宽度）就漫堤\n→ 物价上涨，通胀预期跟着抬\n→ 资产渠道满、商品渠道溢出，是 B1 的核心；水主要流向资产时，通胀可以很低而房价飙升（低通胀泡沫）。',
    live: 'flows.spillToGoods', fmt: 'bn' },
  fiscalInjection: {
    name: '财政注入', short: '政府赤字里凭空新增的那部分水：政府先花钱，再靠发国债补窟窿。',
    why: (s, p, c) => {
      const f = s.flows || {}, N = f.fiscalInjection || 0, T = f.taxes, g = s.gov || {};
      const X = ok(g.spendingGross) ? g.spendingGross / 4 : (ok(T) && ok(g.deficit) ? T + g.deficit / 4 : null), D = ok(g.deficit) ? g.deficit / 4 : (ok(X) && ok(T) ? X - T : null);
      if (!ok(X) || !ok(T)) return `本季财政注入 ${c.money(N)}。`;
      if (!(T > 0)) return `第一个季度只是起点，还没有收支数据；之后每季这里会给出「政府总支出 = 税收 T + 赤字」以及其中新增的水 N。`;
      const nn = c.num, u = c.unit;
      if (N <= 1e-6 && D != null && D < 0) return `本季政府总支出 ≈ ${nn(X)} < 税收 T ${nn(T)}（单位：${u}）：多收了 ${nn(-D)}，是盈余，从经济里抽走水（排水口「盈余」）。\n没有新增的水；企业和家庭手里的钱净减少。`;
      if (N <= 1e-6) return `本季政府总支出 ≈ ${nn(X)}（单位：${u}），几乎等于税收 T ${nn(T)}：收多少花多少，只是转了一圈，没有新增的水。`;
      const P1 = f.govPurchases, R1 = f.transfers, C1 = f.coupons;
      const split = ok(P1) && ok(R1) ? `\n钱花在哪：订单 ${nn(P1)} + 转移 ${nn(R1)}${ok(C1) ? ` + 付利息 ${nn(C1)}` : ''}。` : '';
      return `政府总支出 ≈ ${nn(X)} = 税收 T ${nn(T)} + 赤字 ${nn(D)}（单位：${u}）。\n` +
        `只有 N = ${nn(N)} 是新增的水（模型约定：赤字的一半算新水，另一半是存款人拿已有存款买国债，只换手）；T 只是从你我口袋收来又花出去，转了一圈。${split}\n` +
        `企业只是第一站，不是终点：订单 → 企业 → 工资 → 家庭 → 消费。`;
    },
    water: '政府开闸放水：赤字本身就把新水放进了池子（由国债+央行配合）；图上先分成两条支管，一条给企业下订单，一条转给家庭。',
    formula: '政府总支出 X = 税收 T + 赤字 D\n新水 N = 50% × D（只有 N 增加存款）\nT 是转一圈，D 的另一半是借已有存款',
    from: ['interestToTax', 'cpi'], to: ['govPurchases', 'transfers', 'M', 'goodsChannel', 'ringStage'],
    logic: '政府：花钱——向企业下订单（买东西）、给家庭发转移（救济、减税）\n→ 钱先到企业（订单）和家庭（转移）；企业再付工资给家庭，家庭拿去消费\n→ 同时政府收税 T：只是把家庭和企业口袋里的钱收来再花，转了一圈，水量不变\n→ 赤字靠发国债补：一半新增存款（新水 N），一半是存款人动用已有存款\n→ 私人去杠杆（环 ⑤）时政府接手赤字，能防止总水量下降——这是环 ⑥ 的特征；受「利息/税收」约束。',
    live: 'flows.fiscalInjection', fmt: 'bn' },
  govPurchases: {
    name: '政府订单（买东西）', short: '政府向企业买东西（修路、国防、采购）：钱先流进企业，再变成工资。',
    why: (s, p, c) => {
      const f = s.flows || {}, P1 = f.govPurchases, R1 = f.transfers;
      if (!ok(P1) || !ok(R1)) return '本季订单数据缺失。';
      const sh = P1 / Math.max(1e-9, P1 + R1), N = f.fiscalInjection || 0;
      return `本季政府下订单 ${c.money(P1)}，占订单+转移的 ${P(sh, 0)}。图上订单管只画其中新增水的那份 ${c.money(N * sh)}（整笔 N = ${c.money(N)} 按这个比例分给「订单」和「转移」）。\n企业是第一站，不是终点：订单 → 企业 → 工资 → 家庭 → 消费。`;
    },
    water: '给企业的一条支管：政府下订单，水先流进企业，企业再把它变成工资、利润。',
    formula: '订单 = 政府非利息支出 − 转移支付\n企业收到订单 → 付工资 → 家庭收入 → 消费',
    from: ['fiscalInjection'], to: ['income', 'cf', 'goodsChannel'],
    logic: '政府：向企业下订单（基建、国防、采购）\n→ 钱先进企业账户（第一站）\n→ 企业付工资给员工、付货款给上游，家庭收入上升\n→ 家庭消费，水流进商品河道，需求上升；订单对 GDP 的拉动比较直接。',
    live: 'flows.govPurchases', fmt: 'bn' },
  transfers: {
    name: '转移支付（给家庭）', short: '政府直接给家庭的钱（救济、补贴、减税、发支票）：钱先到家庭手里，再变成消费。',
    why: (s, p, c) => {
      const f = s.flows || {}, P1 = f.govPurchases, R1 = f.transfers;
      if (!ok(P1) || !ok(R1)) return '本季转移数据缺失。';
      const sh = R1 / Math.max(1e-9, P1 + R1), N = f.fiscalInjection || 0;
      const u = s.macro?.unemployment, pu = p?.macro?.unemployment;
      const why = !ok(u) ? '失业率数据缺失' : u > 0.06 ? `失业率 ${P(u)} 偏高${ok(pu) && u > pu + 1e-4 ? '且还在升' : ''}，失业救济等自动支出在撑着家庭` : u < 0.045 ? `失业率 ${P(u)} 很低，失业救济自动较少` : `失业率 ${P(u)} 正常，救济是基线水平`;
      return `本季转移 ${c.money(R1)}，占订单+转移的 ${P(sh, 0)}：${why}。图上转移管只画其中新增水的那份 ${c.money(N * sh)}。\n钱先到家庭手里，再变成消费；消费进商品河道，企业收入才跟着涨。`;
    },
    water: '给家庭的一条支管：钱不经过企业，直接进家庭水箱，之后才流向消费。',
    formula: '转移 = 基线福利 + 自动稳定器（失业越多越多）+ 刺激性发钱（减税、支票）',
    from: ['fiscalInjection', 'unemployment'], to: ['income', 'goodsChannel'],
    logic: '政府：发救济、补贴、支票或减税\n→ 钱直接到家庭账户（第一站是家庭）\n→ 家庭把一部分拿去消费，一部分存起来还债\n→ 消费流进商品河道，企业收入和利润才上升；危机里它是最快的托底（环 ⑥）。',
    live: 'flows.transfers', fmt: 'bn' },
  qe: {
    name: 'QE 量化宽松', short: 'QE = 央行凭空造钱买国债：钱变多 + 长期利率被压低。',
    why: (s, p, c) => {
      const f = s.flows || {}, st = s.extra?.qeStock ?? 0, rate = s.rates?.policy, gdp = s.macro?.gdpNominal;
      if ((f.qe || 0) > 1e-6) {
        const sc = c.since(x => (x.flows?.qe || 0) > 1e-6);
        return `现在在做 QE：本季买债 ${c.money(f.qe)}，累计已买 ${c.money(st)}${ok(gdp) ? `（约 GDP 的 ${P(st / gdp)}）` : ''}${sc ? `，从 ${sc.date} 起一直开着` : ''}。\n政策利率 ${P(rate, 2)}${rate <= 0.0025 ? '（已到 0，降息没空间了）' : ''}，所以靠 QE 继续放水。`;
      }
      if (st > 1e-6) return `现在 0（本季没有新买）：之前累计买了 ${c.money(st)}，还留在央行账上，没有卖回（那才是 QT）。\n政策利率 ${P(rate, 2)}。`;
      if (c.town) return `现在 0：小镇的央行还没用 QE。政策利率还有 ${P(rate, 2)}，先动利率这把阀；QE 是降息到 0 以后才用的第二把工具。`;
      return `现在 0：${rate <= 0.0025 ? `政策利率已经到 ${P(rate, 2)}，降息到底了，QE 随时可能成为下一把工具。` : `政策利率还有 ${P(rate, 2)}，央行还能先降息。`}\nQE 是降息到 0 以后才用的第二把工具；美国第一次是 2008-11。`;
    },
    water: '央行从另一个水库直接抽水注入：既增加水量，也把债券的“收益率闸门”往下压。',
    formula: 'QE：央行资产 ↑ ，银行准备金/存款 ↑ ，长债收益率 ↓',
    from: ['policyRate', 'fiscalInjection'], to: ['M', 'discountRate', 'bondAsset', 'equityAsset'],
    logic: '央行：新造准备金，买走市场上的国债\n→ 卖债的人拿到存款（水变多），债的需求大增\n→ 债价↑、长期利率↓ → 折现率↓ → 股票、房子的估值↑\n→ 这笔水主要进了资产池，流进商品河道的很少，所以 2009–19 年资产价格高、CPI 低\n→ 对应债务环 ⑥：私人还债、政府接手赤字，央行用 QE 配合支持。',
    live: 'flows.qe', fmt: 'bn' },

  // ---------- 银行 ----------
  bankApproval: {
    name: '银行审批倍数', short: '银行贷款审批的松紧：1 为中性，>1 更松，<1 更紧。',
    why: (s, p) => {
      const a = s.bank?.approval, pa = p?.bank?.approval, bad = s.bank?.badLoanRate, hy = s.extra?.houseYoY;
      const t = a < 0.9 ? '偏紧' : a > 1.05 ? '偏松' : '接近中性';
      const dir = ok(pa) ? (a > pa + 0.005 ? '，比上季放松了' : a < pa - 0.005 ? '，比上季收紧了' : '，和上季差不多') : '';
      return `现在 ×${X2(a)}（1=中性）${t}${dir}：坏账率 ${P(bad)}、房价比一年前 ${P(hy)}${hy < 0 && bad > 0.02 ? ' → 抵押品变差、银行在收紧' : hy > 0.05 ? ' → 抵押品变好、银行放得更松' : ''}。`;
    },
    water: '水泵的开度：抵押品好、资本足时开大，坏账多时关小。',
    formula: '审批 = 1 + a·(抵押品改善) + b·(资本充足) − c·(坏账率上升)',
    from: ['bankCapital', 'badLoans', 'lvr', 'housePrice'], to: ['newLoans'],
    logic: '银行：看抵押品、资本和坏账决定放多少\n→ 房价涨：抵押品好 → 放贷更松 → 买房的人更多 → 房价更涨\n→ 反转时同样放大：房价跌 → 收紧 → 房价再跌\n→ 这是顺周期回路，许多「信贷突然干涸」就是它反向（B2）。',
    live: 'bank.approval', fmt: 'num' },
  bankCapital: {
    name: '银行资本比率', short: '银行自有资本占风险资产的比例，是吸收亏损的缓冲垫。',
    why: (s, p) => {
      const r = s.bank?.capitalRatio, pr = p?.bank?.capitalRatio;
      return `现在 ${P(r)}${ok(pr) ? `（上季 ${P(pr)}）` : ''}：坏账率 ${P(s.bank?.badLoanRate)}。${ok(pr) && r < pr - 0.0003 ? '坏账在吃掉缓冲垫，银行更不敢放贷。' : ok(pr) && r > pr + 0.0003 ? '利润在慢慢把缓冲垫补回来。' : '基本稳定。'}`;
    },
    water: '堤坝的厚度：坏账是洪水，堤坝薄了银行就不敢再放水。',
    formula: '资本比率 = 资本 / 风险加权资产；资本 ← 资本 + 利润 − 坏账损失',
    from: ['badLoans', 'interestPaid'], to: ['bankApproval'],
    logic: '借款人：还不起 → 银行：坏账损失吃掉资本\n→ 资本比率下降，监管和自保都要求缩表而不是放贷\n→ 信贷收缩，这是 B2 时信贷收缩的硬机制。',
    live: 'bank.capitalRatio', fmt: 'pct' },
  badLoans: {
    name: '坏账率', short: '还不上的贷款占比，由 DSR 与抵押品共同决定。',
    why: (s, p, c) => {
      const b = s.bank?.badLoanRate, o = c.past(4);
      const ch = o ? `，比 ${c.ago(4)}${b >= o.bank.badLoanRate ? '高' : '低'} ${Math.abs((b - o.bank.badLoanRate) * 100).toFixed(1)}pp` : '';
      return `现在 ${P(b)}${ch}：DSR ${P(s.household?.dsr)}、LVR ${P(s.household?.lvr, 0)}、失业率 ${P(s.macro?.unemployment)}。${b > 0.03 ? '「还不起 + 抵押品缩水」叠在一起了。' : '还没到大面积违约的水平。'}`;
    },
    water: '管道渗漏：渗漏率越高，银行越不敢继续供水。',
    formula: '坏账率 ↑ ⇐ DSR 高且收入下降，且 LVR 高（抵押品不够覆盖）',
    from: ['dsr', 'lvr', 'unemployment'], to: ['bankCapital', 'bankApproval', 'lampDebtService', 'riskPremium'],
    logic: '家庭、企业：收入下降 + 还本付息太重 → 还不起\n→ 银行：抵押品值钱就卖掉还债；抵押品也缩水才真亏\n→ 坏账吃资本、风险溢价升、审批收紧\n→ 只有「还不起 + 抵押品缩水」叠加才会大面积出事，这就是 B2 的杀伤力。',
    live: 'bank.badLoanRate', fmt: 'pct' },

  // ---------- 家庭 ----------
  income: {
    name: '家庭收入', short: '家庭可支配收入：偿债能力的分母。',
    why: (s, p, c) => {
      const i = s.household?.income, o = c.past(4);
      const yoy = o && o.household?.income ? i / o.household.income - 1 : null;
      return `现在 ${c.money(i)}${ok(yoy) ? `（比 ${c.ago(4)} ${yoy >= 0 ? '+' : '−'}${Math.abs(yoy * 100).toFixed(1)}%）` : ''}：失业率 ${P(s.macro?.unemployment)}${s.macro?.inflation > 0.03 ? `，通胀 ${P(s.macro.inflation)} 在抬高名义收入` : ''}。`;
    },
    water: '收入河的流量：债务管道抽走多少，要和河的流量比才有意义。',
    formula: '收入 ≈ 工资(就业·工资率) + 转移 − 税',
    from: ['unemployment', 'goodsChannel'], to: ['dsr', 'priceToIncome', 'newLoans'],
    logic: '企业：雇人、付工资 → 家庭：收到工资（还有转移、扣掉税）\n→ 家庭用它还债、消费、买资产\n→ 债务有名义价值，收入决定能否承受；通胀抬高名义收入是「化债」的一种方式（环 ⑦）。',
    live: 'household.income', fmt: 'bn' },
  hhDebt: {
    name: '家庭债务', short: '家庭欠银行的存量，是新贷款累积减还本的结果。',
    why: (s, p, c) => {
      const d = s.debt?.household, o = c.past(4), g = s.macro?.gdpNominal;
      const yoy = o && o.debt?.household ? d / o.debt.household - 1 : null;
      return `现在 ${c.money(d)}${ok(g) ? `（约 GDP 的 ${P(d / g, 0)}）` : ''}${ok(yoy) ? `，比 ${c.ago(4)} ${yoy >= 0 ? '+' : '−'}${Math.abs(yoy * 100).toFixed(1)}%` : ''}：本季借 ${c.money(s.flows?.newLoans)}、还 ${c.money(s.flows?.principalRepay)}。`;
    },
    water: '地下被抽走水量的总账：欠多少不重要，重要的是每季得还多少。',
    formula: '债务(t) = 债务(t−1) + 新贷款 − 还本',
    from: ['newLoans', 'principalRepay'], to: ['interestPaid', 'dsr', 'lvr'],
    logic: '家庭：借钱买房、消费 → 欠条累积成存量债务\n→ 每季必须付息、还本，抽走一部分收入\n→ 债务越多，对利率越敏感，DSR 越高（环 ② 到 ⑤ 的主线）。',
    live: 'debt.household', fmt: 'bn' },
  pvtDebtGdp: {
    name: '私人债务/GDP', short: '家庭加企业欠的总债，相当于一年 GDP 的多少倍：大周期表盘看的就是它升得多快、从高点退了多少。',
    why: (s, p, c) => {
      const r = pvtRatio(s);
      if (!ok(r)) return '现在读不到私人债务和 GDP，这一项暂时没有数。';
      const past = win12(c, pvtRatio), r12 = c.past(12) ? pvtRatio(c.past(12)) : null;
      const hi = past.length ? Math.max(r, ...past) : null;
      let t = `现在 ${P(r, 0)}：家庭 ${c.money(s.debt.household)} + 企业 ${c.money(s.debt.firm)}，除以全年 GDP ${c.money(s.macro.gdpNominal)}。`;
      if (ok(r12)) t += `\n三年前 ${P(r12, 0)}，三年变化 ${PP(r - r12)}（大周期 ① 要 ≥ +2pp、② 要 ≥ +3pp 才算「债在堆」；⑦ 要 ≤ +2pp 才算「没再加杠杆」）。`;
      if (ok(hi)) t += `\n较三年高点 ${PP(r - hi)}（⑤ 私人去杠杆要 ≤ −5pp：债比收入先缩下来）。`;
      if (!ok(r12)) t += '\n还没有三年的历史，三年变化暂时算不出来。';
      return t;
    },
    water: '欠条箱里的水位，不是看绝对多少，而是看它相对一年的水流（GDP）有多满、涨得多快。',
    formula: '私人债务/GDP = (家庭债务 + 企业债务) / 名义 GDP；三年变化 = 今天 − 三年前；较高点 = 今天 − 近三年最高',
    from: ['hhDebt', 'newLoans', 'principalRepay'], to: ['dsr', 'longCycle'],
    logic: '银行：放贷 → 家庭和企业：欠条累积，债务增长快过收入\n→ 比值连续几年上升 = 大周期的「堆债」（环 ① ②）\n→ 还本多过借款、违约和核销让比值从高点回落 = 私人去杠杆（环 ⑤）\n→ 它比单季的信贷脉冲慢得多，所以用它来判断大周期，而不是小周期。',
    live: null, fmt: 'pct', liveFn: s => pvtRatio(s) },
  govDebtGdp: {
    name: '政府债务/GDP', short: '政府欠的总债相当于一年 GDP 的多少：私人去杠杆之后，它升得快不快，决定大周期是否进入「政府接手」。',
    why: (s, p, c) => {
      const r = govRatio(s);
      if (!ok(r)) return '现在读不到政府债务/GDP，这一项暂时没有数。';
      const o = c.past(12), r12 = o ? govRatio(o) : null;
      let t = `现在 ${P(r, 0)}（政府债务约 ${c.money(r * (s.macro?.gdpNominal ?? NaN))}）。`;
      if (ok(r12)) t += `\n三年前 ${P(r12, 0)}，三年变化 ${PP(r - r12)}：⑥ 政府接手要它 ≥ +3pp（或赤字 ≥ 5% GDP）；⑦、⑧ 要它 ≤ +1pp，也就是不再快速加债。`;
      else t += '\n还没有三年的历史，三年变化暂时算不出来。';
      return t.replace('约 —', '数额未知');
    },
    water: '政府这口大水箱的水位：私人箱子往外舀水时，政府箱子往里加水，总水量才不塌。',
    formula: '政府债务/GDP = 政府债务存量 / 名义 GDP；三年变化 = 今天 − 三年前',
    from: ['fiscalInjection', 'qe', 'gMinusR'], to: ['interestToTax', 'longCycle'],
    logic: '政府：私人部门去杠杆、税收下降 → 赤字扩大，借钱支出\n→ 政府债务/GDP 在几年里明显上升（环 ⑥）\n→ 之后增速放缓、g > r 让比值稳住甚至回落（环 ⑦ ⑧）\n→ 它是慢变量，所以只用来判断大周期。',
    live: 'gov.debtGdp', fmt: 'pct' },
  dsr: {
    name: 'DSR 偿债率', short: '每赚 100 块要拿多少去还本付息。',
    why: (s, p, c) => {
      const d = s.household?.dsr, o = c.past(8);
      if (!ok(d)) return '现在没有 DSR 读数。';
      if (!o || !ok(o.household?.dsr)) return `现在 ${P(d)}：每赚 100 块有 ${(d * 100).toFixed(1)} 块要拿去还本付息。`;
      const dd = d - o.household.dsr, m1 = s.rates?.mortgageEff, m0 = o.rates?.mortgageEff, i1 = s.household?.income, i0 = o.household?.income;
      const d1 = s.debt?.household, d0 = o.debt?.household, rate = `有效房贷利率 ${P(m0, 2)} → ${P(m1, 2)}`;
      let reason;
      if (dd >= 0) reason = m1 - m0 > 0.002 ? `房贷利率在重定价上升（${rate}）` : i1 < i0 * 0.98 ? '收入变少了，分母变小' : d1 > d0 * 1.05 ? '债务在增加' : '债务和收入大致同步';
      else reason = d1 < d0 * 0.97 ? '债务被还掉、核销了一部分（去杠杆）' : i1 > i0 * 1.05 ? '收入涨得比债务快' : m1 - m0 < -0.002 ? `房贷利率在重定价下降（${rate}）` : '债务和收入大致同步';
      return `现在 ${P(d)}，比 ${c.ago(8)}${dd >= 0 ? '高' : '低'} ${Math.abs(dd * 100).toFixed(1)}pp：${reason}。`;
    },
    water: '收入这条河里，被债务管道抽走的比例。',
    formula: 'DSR = (还本 + 付息) / 收入',
    from: ['mortgageEff', 'hhDebt', 'income', 'principalRepay', 'interestPaid'], to: ['bankApproval', 'badLoans', 'newLoans', 'lampDebtService'],
    logic: '央行加息、房贷重定价 → 家庭：每季付息变多；收入下降则分母变小\n→ DSR 升高，可花的钱变少，新借款意愿下降\n→ 银行看到 DSR 高、坏账升，收紧审批\n→ 它比「债务/GDP」更早报警，是环 ⑤ 的起点；通过重定价拖几个季度才显现。',
    live: 'household.dsr', fmt: 'pct' },
  lvr: {
    name: 'LVR 贷款价值比', short: '房贷余额占房价的比例，抵押品还剩多少安全垫。',
    why: (s, p, c) => {
      const l = s.household?.lvr, hy = s.extra?.houseYoY;
      return `现在 ${P(l, 0)}：房价比一年前 ${P(hy)}，家庭债务 ${c.money(s.debt?.household)}。${hy < -0.02 ? '房价在跌，安全垫被削薄，LVR 被动升高。' : hy > 0.05 ? '房价在涨，安全垫变厚，LVR 被动降低。' : '房价平稳，LVR 变化不大。'}`;
    },
    water: '堤岸高度与洪水的差距：房价下跌=堤岸被削低，LVR 上升。',
    formula: 'LVR = 房贷余额 / 房产价值',
    from: ['hhDebt', 'housePrice'], to: ['bankApproval', 'badLoans', 'newLoans'],
    logic: '房价下跌 → 家庭：房贷没变，房子值得少了，LVR 升\n→ 银行：抵押品不够，收紧放贷、坏账风险升\n→ 买家少，房价再跌：这是抵押品回路（B2 的核心）。',
    live: 'household.lvr', fmt: 'pct' },
  unemployment: {
    name: '失业率', short: '想工作但没工作的比例，央行的第二个目标变量。',
    why: (s, p) => {
      const u = s.macro?.unemployment, pu = p?.macro?.unemployment, g = s.macro?.outputGap;
      const t = ok(pu) ? (u > pu + 1e-4 ? '，比上季升了' : u < pu - 1e-4 ? '，比上季降了' : '，和上季一样') : '';
      return `现在 ${P(u)}${t}：产出缺口 ${P(g)}${g < -0.01 ? '，经济低于潜力，工厂水轮空转，所以人闲下来' : g > 0.01 ? '，经济高于潜力，用工紧张' : ''}。`;
    },
    water: '工厂水轮没转起来的比例：需求不足时，空转的越多。',
    formula: '失业率 ↑ ⇐ 产出缺口为负（经济低于潜力）',
    from: ['outputGap'], to: ['income', 'badLoans', 'policyRate'],
    logic: '企业：订单不足、产出低于潜力 → 裁员\n→ 家庭：失去工资，收入↓，DSR↑，还不起的变多\n→ 政府自动多发救济（转移），央行倾向降息\n→ 这是衰退传到偿债压力的路径（大周期 ⑤）。',
    live: 'macro.unemployment', fmt: 'pct' },

  // ---------- 企业 / 宏观 ----------
  capacity: {
    name: 'Capacity 产能', short: '经济在不引发通胀的前提下最多能生产多少。',
    why: (s, p, c) => {
      const cap = s.macro?.capacity, o = c.past(4), g = s.macro?.outputGap;
      const gr = o && o.macro?.capacity ? cap / o.macro.capacity - 1 : null;
      return `现在产能 ${ok(cap) ? cap.toFixed(1) : '—'}${ok(gr) ? `，比 ${c.ago(4)} ${gr >= 0 ? '+' : '−'}${Math.abs(gr * 100).toFixed(1)}%` : ''}：本季 Capex ${c.money(s.flows?.toCapex)}（过几个季度才变成产能）；产出缺口 ${P(g)}。`;
    },
    water: '河道的最大过流能力：来水超过它就漫堤（通胀）。',
    formula: 'Capacity 增长 = 资本积累(capex) + 劳动力 + 生产率',
    from: ['capex'], to: ['outputGap', 'goodsChannel', 'cpi'],
    logic: '企业：花钱建厂房、买设备（Capex）\n→ 几个季度后设备投产，河道变宽\n→ 需求比产能涨得快才会通胀；产能长得慢于购买力，水就漫出来\n→ 所以通胀本质是「需求 vs 产能」。',
    live: 'macro.capacity', fmt: 'idx' },
  capex: {
    name: 'Capex 资本开支', short: '企业投资新设备、厂房，会过几个季度才变成产能。',
    why: (s, p, c) => {
      const x = s.flows?.toCapex, px = p?.flows?.toCapex, g = s.macro?.gdpNominal;
      const t = vs(x, px, 0.05) === 'up' ? '比上季多：利润好、融资便宜，企业愿意投' : vs(x, px, 0.05) === 'down' ? '比上季少：需求弱或融资贵，企业收缩投资' : '和上季差不多';
      return `本季 ${c.money(x)}${ok(g) ? `（约占 GDP ${P(x * 4 / g)}）` : ''}：${t}；企业利润 ${c.money(s.firm?.profit)}。`;
    },
    water: '在河边修新渠：现在花钱（需求），要几个季度后才增加过流能力（供给）。',
    formula: 'Capex = f(预期利润 CF, 融资成本)；产能增量 = Σ 过去几季 capex（pipeline）',
    from: ['cf', 'discountRate', 'policyRate'], to: ['capacity', 'outputGap'],
    logic: '企业：看预期利润和融资成本决定投多少\n→ 钱先买设备、雇工人，变成别人的收入（先增加需求）\n→ 几个季度后设备投产，河道变宽（再增加供给）\n→ 这个时滞让需求冲击先造成通胀、之后又缓解。',
    live: 'firm.capex', fmt: 'bn' },
  outputGap: {
    name: '产出缺口', short: '实际产出比 Capacity 高还是低。',
    why: (s) => {
      const g = s.macro?.outputGap;
      return `现在 ${P(g)}：${g > 0.01 ? '正缺口，水位快漫过堤顶，需求大于产能，通胀预期会被抬高。' : g < -0.01 ? '负缺口，水位低于堤顶，有闲置产能，失业会上升。' : '接近 0，水位和堤顶差不多。'}失业率 ${P(s.macro?.unemployment)}、通胀 ${P(s.macro?.inflation)}。`;
    },
    water: '水位与堤顶的差：正=快漫堤（过热），负=水位不足（闲置）。',
    formula: '产出缺口 = (实际产出 − Capacity) / Capacity',
    from: ['capacity', 'goodsChannel'], to: ['cpi', 'unemployment', 'policyRate'],
    logic: '家庭、企业：需求变化 → 实际产出变化\n→ 产出超过产能：企业涨价、招人，通胀↑；不足：裁员，失业↑\n→ 央行看到缺口就调政策利率：它是央行规则最关键的输入之一。',
    live: 'macro.outputGap', fmt: 'pct' },
  cpi: {
    name: 'CPI 通胀', short: '一篮子商品服务价格的年化变化率。',
    why: (s) => {
      const i = s.macro?.inflation, e = s.macro?.inflationExp, g = s.macro?.outputGap;
      return `现在 ${P(i)}（通胀预期 ${P(e)}，产出缺口 ${P(g)}）：${i > e + 0.005 ? '比预期还高，需求或成本冲击在往上推' : i < e - 0.005 ? '比预期低，需求弱在往下拉' : '基本跟着预期走'}${i >= 0.04 ? '；已明显高于 2% 的目标，央行会倾向加息' : i < 0.01 ? '；低于 2% 的目标，有通缩风险' : ''}。`;
    },
    water: '下游农田的水位涨速：上游溢洪道（商品渠道）放得越多，涨得越快。',
    formula: '通胀 = 通胀预期 + k·产出缺口 + 冲击',
    from: ['outputGap', 'inflationExp', 'goodsChannel'], to: ['policyRate', 'realRate', 'inflationExp', 'lampPolicy'],
    logic: '家庭、企业：预期涨价 → 企业提价、工人要求涨薪\n→ 需求超过产能时再往上推\n→ 央行看到通胀高就加息（B1）；通胀有惯性，缺口回落后也不会立刻消退。',
    live: 'macro.inflation', fmt: 'pct' },
  inflationExp: {
    name: '通胀预期', short: '人们认为未来通胀会是多少，会自我实现。',
    why: (s) => {
      const e = s.macro?.inflationExp, i = s.macro?.inflation;
      return `现在 ${P(e)}，实际通胀 ${P(i)}：${e < i - 0.003 ? '预期还落在实际后面，正在被拉上来。' : e > i + 0.003 ? '预期高于实际，正在慢慢回落。' : '预期和实际基本一致。'}（预期是过去通胀的慢速平均，所以变得慢。）`;
    },
    water: '大家对水位涨速的“记忆”：记忆越高，涨价越难压下去。',
    formula: '预期(t) = (1−λ)·预期(t−1) + λ·实际通胀(t)',
    from: ['cpi'], to: ['cpi', 'realRate', 'policyRate'],
    logic: '家庭、企业：根据过去几年的物价形成预期\n→ 预期高：企业提前涨价、工人要求加薪，通胀更难压\n→ 预期一旦失锚，央行必须把实际利率抬到明显为正才能压回去（Volcker 式加息）。',
    live: 'macro.inflationExp', fmt: 'pct' },
  cf: {
    name: 'CF 现金流', short: '资产能带来的现金：企业利润、租金、利息。',
    why: (s, p, c) => {
      const pr = s.firm?.profit, o = c.past(4), g = s.macro?.gdpNominal;
      const yoy = o && o.firm?.profit ? pr / o.firm.profit - 1 : null;
      return `现在企业利润 ${c.money(pr)}${ok(g) ? `（约占 GDP ${P(pr / g)}）` : ''}${ok(yoy) ? `，比 ${c.ago(4)} ${yoy >= 0 ? '+' : '−'}${Math.abs(yoy * 100).toFixed(1)}%` : ''}：${ok(yoy) && yoy < -0.05 ? '盈利在缩水，股价和资本开支都会承压。' : ok(yoy) && yoy > 0.05 ? '盈利在增长，是资产价格的真实支撑。' : '盈利大致平稳。'}`;
    },
    water: '水库的稳定入流：资产估值的“水源”，而不是水位本身。',
    formula: '资产价值 ≈ Σ CF(t) / (1+折现率)^t',
    from: ['goodsChannel', 'income'], to: ['equityAsset', 'housePrice', 'capex'],
    logic: '家庭：消费 → 企业：收入变成利润（也包括租金、利息）\n→ 投资者：按未来现金流估价买资产\n→ 价格变化 = CF 变化 + 折现率变化 + 风险溢价变化；拆开三者，就知道涨价是「真赚钱」还是「估值膨胀」。',
    live: 'firm.profit', fmt: 'bn' },

  // ---------- 资产定价 ----------
  discountRate: {
    name: '折现率', short: '把未来现金流换成今天价格用的利率 = 无风险利率 + 风险溢价。',
    why: (s, p, c) => {
      const y = s.rates?.gov10y, rp = s.rates?.riskPremium, q = s.assets?.bond?.yieldParts?.qe;
      const qe = ok(q) && q < -0.0005 ? ` QE 已经把长债收益率压低了约 ${(-q * 100).toFixed(1)}pp。` : '';
      return `现在 10 年国债 ${P(y, 2)} + 风险溢价 ${P(rp, 2)} ≈ ${P((y || 0) + (rp || 0), 2)}。${qe}${p && ok(p.rates?.gov10y) ? (y > p.rates.gov10y + 0.0005 ? '比上季高，远水更不值钱，资产价格承压。' : y < p.rates.gov10y - 0.0005 ? '比上季低，远水更值钱，资产价格被托高。' : '') : ''}`;
    },
    water: '“远处的水”打几折才算今天的水：折现率越高，远水越不值钱。',
    formula: '折现率 = 无风险利率(10年国债) + 风险溢价',
    from: ['policyRate', 'qe', 'riskPremium', 'realRate'], to: ['bondAsset', 'equityAsset', 'housePrice', 'capex', 'rentYield'],
    logic: '央行：降息或 QE → 长期国债收益率下降\n→ 投资者：用更低的折现率给未来现金流估价\n→ 长期资产（高估值股票、房子）像长水管，折现率稍变价格变化很大\n→ 这就是「利率是资产重力」，也是 QE 时代（环 ⑥）资产涨的原因。',
    live: 'rates.gov10y', fmt: 'pct' },
  riskPremium: {
    name: '风险溢价', short: '承担风险要求的额外补偿，恐惧上升则升高。',
    why: (s, p) => {
      const r = s.rates?.riskPremium, pr = p?.rates?.riskPremium;
      const t = ok(pr) ? (r > pr + 0.0005 ? '比上季升了' : r < pr - 0.0005 ? '比上季降了' : '和上季差不多') : '';
      return `现在 ${P(r, 2)}${t ? '，' + t : ''}：坏账率 ${P(s.bank?.badLoanRate)}、信贷脉冲 ${P(s.lights?.credit?.value, 2)}、失业率 ${P(s.macro?.unemployment)}${r > 0.06 ? '，市场在恐惧，没人敢下水' : ''}。`;
    },
    water: '水面上的浪：浪高（恐慌）时没人敢下水，价格被压低。',
    formula: '风险溢价 ↑ ⇐ 坏账↑、波动↑、杠杆高、信贷收缩',
    from: ['badLoans', 'lvr', 'bankCapital'], to: ['discountRate', 'mortgageEff', 'equityAsset', 'housePrice'],
    logic: '银行：坏账升、资本薄 → 要求更高的利差\n→ 投资者：恐惧时要更高补偿才肯持有风险资产\n→ 折现率和房贷利率上升，资产价格下跌\n→ 同样的政策利率，风险溢价高时融资反而更贵，所以危机里降息也未必有效（环 ⑤）。',
    live: 'rates.riskPremium', fmt: 'pct' },
  gMinusR: {
    name: 'g − r（增长减融资成本）', short: '收入增长是否跑赢利率：负担是自动变轻还是越滚越大。',
    why: (s, p, c) => {
      const o = c.past(4), y = s.rates?.gov10y;
      if (!o || !ok(o.macro?.gdpNominal)) return `现在没有足够的历史来算增长；10 年国债 ${P(y, 2)}。`;
      const g = s.macro.gdpNominal / o.macro.gdpNominal - 1, d = g - y;
      return `名义增长 ${P(g)} − 10 年国债 ${P(y, 2)} = ${PP(d)}：${d > 0 ? '增长跑赢利率，债务相对收入在自动变轻（化债，环 ⑦ 靠它）。' : '增长跑不赢利率，债务像滚雪球越滚越重。'}`;
    },
    water: '债务是一个雪球：g > r 时雪球（相对收入）越滚越轻，g < r 时越滚越重。',
    formula: '债务/收入 的变化 ≈ (r − g)·债务/收入 + 新增赤字',
    from: ['policyRate', 'cpi', 'discountRate'], to: ['interestToTax', 'ringStage'],
    logic: '政府、央行：压低利率（金融压制）并容忍通胀\n→ 名义收入和 GDP 增长快于借款利率\n→ 债务/收入自动缩小，不需要违约\n→ 这是环 ⑦（金融压制/增长化债）的核心。',
    live: null, fmt: 'pct',
    liveFn: (s, p) => { if (!p) return null; return (s.macro.gdpNominal / p.macro.gdpNominal) ** 4 - 1 - s.rates.gov10y; } },
  interestToTax: {
    name: '利息/税收', short: '政府税收中有多少要拿去付利息，A 慢变量的指标。',
    why: (s, p) => {
      const i = s.gov?.interestToTax, d = s.gov?.debtGdp;
      return `现在 ${P(i)}：政府债务约 GDP 的 ${P(d, 0)}，10 年国债 ${P(s.rates?.gov10y, 2)}。${i > 0.25 ? '利息吃掉了四分之一以上的税收，财政已经很被动。' : i > 0.15 ? '利息占比偏高，开始约束财政空间。' : '利息负担还轻。'}${p && ok(p.gov?.interestToTax) ? (i > p.gov.interestToTax + 0.003 ? '比上季更重了。' : i < p.gov.interestToTax - 0.003 ? '比上季轻了。' : '') : ''}`;
    },
    water: '政府收入河里被债务抽走的份额：太多就没水可放给学校、道路了。',
    formula: '利息/税收 = 政府付息 / 税收',
    from: ['gMinusR', 'policyRate'], to: ['fiscalInjection', 'ringStage'],
    logic: '政府：每季先从税里拿钱付国债利息\n→ 利息占比越高，能用于支出和赤字的空间越小\n→ 太高时只能选择印钱（央行配合）或违约，A（慢变量）失去信心\n→ 这比「债务/GDP」更接近真实约束，决定环 ⑥⑦ 能走多远。',
    live: 'gov.interestToTax', fmt: 'pct' },
  housePrice: {
    name: '房价', short: '房子的价格 = 租金现金流 ÷ 折现率，再被信贷放大。',
    why: (s, p, c) => {
      const px = s.assets?.housing?.price, hy = s.extra?.houseYoY;
      return `现在指数 ${ok(px) ? px.toFixed(0) : '—'}${ok(hy) ? `，比一年前 ${hy >= 0 ? '+' : '−'}${Math.abs(hy * 100).toFixed(1)}%` : ''}：新房贷利率 ${P(s.rates?.mortgageNew, 2)}、审批 ×${X2(s.bank?.approval)}、本季流进房产 ${c.money(s.flows?.toHousing)}。`;
    },
    water: '最大的蓄水湖：受购买力涌入、利率“重力”和抵押品回路三者共同决定水位。',
    formula: '房价 ≈ 租金 / (折现率 − 租金增长)；再加信贷放大',
    from: ['assetReservoir', 'discountRate', 'mortgageEff', 'bankApproval', 'cf'], to: ['lvr', 'priceToIncome', 'rentYield', 'lampValuation', 'bankApproval'],
    logic: '银行：放贷松 → 买房的人拿到新水\n→ 房子供给慢，价格先涨，抵押品更好，银行放得更松（回路）\n→ 反转时成交先冻结、价格后下跌，而且比股票慢\n→ 房价与银行审批互为因果，上行下行都被放大（环 ②→⑤）。',
    live: 'assets.housing.price', fmt: 'idx' },
  priceToIncome: {
    name: '房价/收入', short: '买一套房要攒几年收入，是房价贵不贵的主要体检指标。',
    why: (s, p, c) => {
      const v = s.assets?.housing?.priceToIncome, o = c.past(s.t || 0);
      return `现在 ${ok(v) ? v.toFixed(2) : '—'}${o && ok(o.assets?.housing?.priceToIncome) ? `（起点 ${o.assets.housing.priceToIncome.toFixed(2)}）` : ''}：${v > 4.4 ? '比起点贵得多，要靠低利率才撑得住。' : v < 3.6 ? '比起点便宜，估值有安全垫。' : '和起点差不多。'}利率 ${P(s.rates?.mortgageNew, 2)}。`;
    },
    water: '湖水位与河流量的比：水位长期高于河的承载，就容易回落。',
    formula: '房价收入比 = 房价 / 家庭年收入',
    from: ['housePrice', 'income'], to: ['lampValuation', 'bankApproval'],
    logic: '家庭：靠收入付房贷，收入决定长期能支撑多高的房价\n→ 房价涨得比收入快，比值升高\n→ 利率低时可以维持，利率上升则变脆弱\n→ 估值灯据此亮起。',
    live: 'assets.housing.priceToIncome', fmt: 'num' },
  rentYield: {
    name: '租售比（租金收益率）', short: '一年租金占房价的比例，房子的“股息率”。',
    why: (s) => {
      const y = s.assets?.housing?.rentYield, m = s.rates?.mortgageNew;
      return `现在 ${P(y, 2)}，新房贷利率 ${P(m, 2)}：${y < m ? '租金收益低于贷款利率，买房靠预期上涨才赚钱，对利率最敏感。' : '租金能覆盖贷款利息，买房更像稳稳收租。'}`;
    },
    water: '湖里每年可取出的稳定水量占总水量的比例。',
    formula: '租售比 = 年租金 / 房价；与折现率比较：收益率 < 贷款利率 → 靠涨价才能赚钱',
    from: ['housePrice', 'discountRate'], to: ['lampValuation'],
    logic: '房东：收租金（家庭的收入转过来）\n→ 租金占房价的比例 = 租售比\n→ 低于贷款利率，买房要靠预期上涨撑着\n→ 利率一升，这种房价最先承压。',
    live: 'assets.housing.rentYield', fmt: 'pct' },

  // ---------- 四盏灯 ----------
  lampCredit: {
    name: '信贷灯', short: '新增信贷还在扩张还是已收缩（看信贷脉冲）。',
    why: lampWhy('credit'),
    water: '蓄水池进水速度的指示灯。', formula: '绿：脉冲稳定为正；黄：明显减速；红：转负',
    from: ['creditImpulse'], to: ['ringStage'],
    logic: '银行放贷、借款人还本 → 脉冲\n→ 信贷灯先转黄/红\n→ 往往领先房价和经济几个季度，是债务环转向 ⑤ 的早期信号之一。',
    live: 'lights.credit.value', fmt: 'pct' },
  lampDebtService: {
    name: '偿债灯', short: '收入被债务抽走的比例是否在上升（看 DSR）。',
    why: lampWhy('debtService'),
    water: '管道抽水比例指示灯。', formula: '绿：DSR 低于历史中位；黄：快速上升；红：高位并伴随坏账上升',
    from: ['dsr', 'badLoans'], to: ['ringStage'],
    logic: '家庭：还本付息占收入的比例上升 → 偿债灯变色\n→ 银行：看到坏账上升而收紧\n→ 偿债压力是环 ⑤ 的起点，也是「降息能不能重启信贷」的判断依据。',
    live: 'lights.debtService.value', fmt: 'pct' },
  lampPolicy: {
    name: '政策灯', short: '货币政策现在是松还是紧（看实际利率）。',
    why: lampWhy('policy'),
    water: '总水闸开度指示灯。', formula: '绿：实际利率中性；黄：偏离中性；红：深负（B1 燃料）或高位（紧缩风险）',
    from: ['realRate', 'policyRate'], to: ['ringStage'],
    logic: '央行：定政策利率 → 扣掉通胀得实际利率\n→ 实际利率深负且信贷旺盛：通胀风险（B1）；正得很高：压住偿债能力\n→ 两头都是风险，灯据此变色。',
    live: 'lights.policy.value', fmt: 'pct' },
  lampValuation: {
    name: '估值灯', short: '资产相对收入、租金是否偏贵（房价/收入、CAPE 等）。',
    why: lampWhy('valuation'),
    water: '蓄水湖水位指示灯。', formula: '绿：估值合理；黄：偏高；红：极高，需要低利率才能维持',
    from: ['priceToIncome', 'rentYield', 'housePrice', 'discountRate'], to: ['ringStage'],
    logic: '投资者：把新增的钱买进资产 → 价格相对收入越来越贵\n→ 估值灯变黄/红\n→ 红灯不意味着立刻下跌，而是「对加息和信贷收缩特别敏感」（环 ②）。',
    live: 'lights.valuation.value', fmt: 'num' },

  // ---------- 周期环 ----------
  ringStage: {
    name: '债务环 ①–⑧', short: '借钱扩张→缓冲池装满→岔路口(B1/B2)→还债→政府接手→化债→修复。',
    why: (s) => {
      const r = s.ring;
      if (!r) return '现在没有环的读数。';
      const pr = r.probs?.[r.stage];
      return `现在判断在 ${r.label}${ok(pr) ? `（把握约 ${P(pr, 0)}）` : ''}。${r.nextSignal ? `\n下一个确认信号：${r.nextSignal}` : ''}`;
    },
    water: '一年四季的水循环：借钱=涨水，还债=退水，政府接手=人工调水，化债=洪水渐渐退去。',
    formula: '位置 = 由四盏灯 + 慢变量（利息/税收、g−r…）检测出的概率分布',
    from: ['lampCredit', 'lampDebtService', 'lampPolicy', 'lampValuation', 'gMinusR', 'interestToTax', 'fiscalInjection'], to: ['B1', 'B2', 'cashAsset', 'equityAsset'],
    logic: '家庭、银行、央行、政府：各自按规则行动，四盏灯和慢变量记录结果\n→ 检测器据此给出每个阶段的概率\n→ 所以总是用概率表示，并给出「下一个确认信号」\n→ 阶段是「检测」出来的，不是预先设定。',
    live: 'ring.stage', fmt: 'num' },
  B1: {
    name: 'B1 溢出到通胀', short: '岔路口之一：需求超过 Capacity，通胀上来，央行被迫加息。',
    why: (s) => {
      const on = s.ring?.fork === 'B1', i = s.macro?.inflation, r = s.rates?.realPolicy, g = s.macro?.outputGap;
      return on ? `现在处在 B1：通胀 ${P(i)}、实际利率 ${P(r, 2)}、产出缺口 ${P(g)}，需求超过产能，央行被迫收紧。`
        : `现在没有处在 B1：通胀 ${P(i)}、产出缺口 ${P(g)}、实际利率 ${P(r, 2)}。B1 需要「需求超过产能 + 实际利率偏低」。`;
    },
    water: '湖满后水漫过堤，淹了农田（通胀）。',
    formula: 'B1：通胀↑ + 实际利率偏低 → 加息 → DSR ↑',
    from: ['goodsChannel', 'capacity', 'realRate', 'inflationExp'], to: ['policyRate', 'dsr', 'bondAsset', 'goldAsset', 'ringStage'],
    logic: '家庭、企业：钱多、实际利率低，拼命买东西\n→ 商品渠道溢出，通胀上升\n→ 央行：被迫加息 → 家庭 DSR 上升\n→ 若「降息能重启信贷」就回到 ①（软着陆）；否则转入 ⑤。债券和房产在 B1 通常承压。',
    live: null, fmt: 'txt', liveFn: s => (s.ring.fork === 'B1' ? '当前处于 B1' : '当前未处于 B1') },
  B2: {
    name: 'B2 资产与信用缩水', short: '岔路口之二：资产价格下跌，信贷收缩，通胀低甚至通缩。',
    why: (s) => {
      const on = s.ring?.fork === 'B2', hy = s.extra?.houseYoY, ci = s.lights?.credit?.value;
      return on ? `现在处在 B2：房价比一年前 ${P(hy)}、LVR ${P(s.household?.lvr, 0)}、信贷脉冲 ${P(ci, 2)}，抵押品缩水、信贷在收缩。`
        : `现在没有处在 B2：房价比一年前 ${P(hy)}、LVR ${P(s.household?.lvr, 0)}、信贷脉冲 ${P(ci, 2)}。B2 需要「房价跌 + LVR 升 + 信贷脉冲为负」。`;
    },
    water: '湖水被抽干：抵押品缩水，银行关泵，水回不来。',
    formula: 'B2：房价↓ + LVR↑ + 信贷脉冲<0 + 低通胀',
    from: ['lvr', 'badLoans', 'creditImpulse', 'bankApproval', 'housePrice'], to: ['bondAsset', 'equityAsset', 'fiscalInjection', 'ringStage'],
    logic: '房价下跌 → 家庭：LVR 升高、还不起 → 银行：抵押品缩水，关泵\n→ 信贷收缩，通胀很低甚至通缩\n→ 降息不好使（问题是「还不起 + 抵押品缩水」，不是「利息太贵」）\n→ 常需要财政接手（环 ⑥）。',
    live: null, fmt: 'txt', liveFn: s => (s.ring.fork === 'B2' ? '当前处于 B2' : '当前未处于 B2') },

  // ---------- 两个周期表盘（大周期 / 小周期）----------
  longCycle: {
    name: '大周期 · 长期债务周期', short: '几十年一轮：债务一路堆高，降息也救不动后，由政府和央行接手，慢慢化掉。',
    why: (s) => {
      const L = s.cycles?.long;
      if (!L) return '现在没有大周期的读数。';
      const pr = L.progress;
      return `现在在 ${L.label}${L.since?.date ? `（自 ${L.since.date} 起）` : ''}。${pr ? `\n朝 ${pr.label} 已累计 ${pr.have}/${pr.need} 季证据（连续满足才前进）。` : ''}${L.nextSignal ? `\n下一个信号：${L.nextSignal}` : ''}`;
    },
    water: '多年的水库淤积与清淤：每个小周期都带进一点泥沙（新债），没冲干净的越积越高；淤得太满，只能大清淤（去杠杆），再由政府和央行人工调水。',
    formula: '只看慢变量，且同一阶段要连续 6 季达标才前进：私人债务/GDP 三年变化、房价/收入、坏账率、政策利率是否到底、政府债务/GDP 与赤字、QE、实际利率、DSR',
    from: ['hhDebt', 'priceToIncome', 'badLoans', 'policyRate', 'fiscalInjection', 'qe', 'realRate', 'dsr'], to: ['shortCycle', 'ringStage'],
    logic: '家庭、企业：一轮轮借钱，债务越堆越高（环 ① ②）\n→ 降息也撑不起信贷时：私人去杠杆（⑤）\n→ 政府和央行接手：赤字 + QE（⑥），再用低利率和增长化债（⑦ ⑧）\n→ 一次衰退不等于大周期换挡（2001 年降息就把信贷重新撑起来了）；大周期只顺时针走：① ② ⑤ ⑥ ⑦ ⑧ 再回到 ①，③ ④ 是小周期里的事。',
    live: 'cycles.long.label', fmt: 'txt' },
  shortCycle: {
    name: '小周期 · 短期债务周期', short: '几年一轮：扩张 → 过热(B1) 或 缩水(B2) → 收紧·衰退 → 降息重启 → 扩张。',
    why: (s) => {
      const S = s.cycles?.short;
      if (!S) return '现在没有小周期的读数。';
      const pr = (S.progress || [])[0];
      return `现在在「${S.label}」${S.since?.date ? `（自 ${S.since.date} 起）` : ''}。${pr ? `\n朝「${pr.label}」已累计 ${pr.have}/${pr.need} 季证据。` : ''}${S.nextSignal ? `\n下一个信号：${S.nextSignal}` : ''}`;
    },
    water: '一年的季节性涨落：春耕涨水（扩张）、夏汛要么漫堤（过热 B1）要么河床抬高水却流不动（缩水 B2）、秋收关闸（收紧·衰退）、冬季放水再开泵（降息重启）。',
    formula: '看四盏灯 + 失业率：通胀与加息 → B1；信贷脉冲转负且房价不涨/DSR 升 → B2；失业率较低点上升或信贷脉冲大幅为负 → 收紧·衰退；央行降息或已近零 → 降息重启；信贷脉冲回正且失业率不再升 → 扩张。证据连续 2–3 季才前进',
    from: ['lampCredit', 'lampDebtService', 'lampPolicy', 'lampValuation', 'creditImpulse', 'unemployment', 'policyRate'], to: ['B1', 'B2', 'longCycle'],
    logic: '银行、家庭、央行：借钱扩张 → 过热或缩水 → 央行加息/衰退 → 降息重启\n→ 每隔几年重复一次\n→ 每个顶点比上一个顶点背的债更多，所以大周期是被一轮轮小周期「棘轮式」推着往前走的\n→ 大周期的位置决定了每次「降息重启」还有多大力气。',
    live: 'cycles.short.label', fmt: 'txt' },

  // ---------- 五类资产 ----------
  cashAsset: {
    name: '现金', short: '短期利率赚取的收益，实际回报=名义−通胀。',
    why: (s) => {
      const a = s.assets?.cash || {}, i = s.macro?.inflation;
      return `本季回报 ${P(a.ret, 2)}（政策利率 ${P(s.rates?.policy, 2)} ÷ 4），扣掉通胀 ${P(i)} 后实际 ${P(a.realRet, 2)}：${a.realRet < 0 ? '现金在缩水（金融压制，环 ⑦ 的特征）。' : '现金实际在增值，加息或 B2 时相对占优。'}`;
    },
    water: '放在池边不动的水：不会涨也不会冲走，但通胀会让它蒸发。',
    formula: '现金回报 ≈ 政策利率 / 4（每季）',
    from: ['policyRate', 'cpi'], to: ['ringStage'],
    logic: '央行：加息 → 现金利息上升\n→ 投资者：在加息和 B2 时转向现金\n→ 通胀高过利息时实际回报为负：金融压制（⑦）就是这样把债务负担「蒸发」掉的。',
    live: 'assets.cash.ret', fmt: 'pct' },
  bondAsset: {
    name: '长期国债', short: '价格与收益率反向：利率降→债价涨，利率升→债价跌。',
    why: (s, p) => {
      const a = s.assets?.bond || {}, y = s.rates?.gov10y, py = p?.rates?.gov10y;
      const t = ok(py) ? (y > py + 0.0003 ? `10 年收益率升了 ${PP(y - py, 2)}，债价下跌` : y < py - 0.0003 ? `10 年收益率降了 ${PP(py - y, 2)}，债价上涨` : '10 年收益率没怎么动') : `10 年收益率 ${P(y, 2)}`;
      return `本季回报 ${P(a.ret, 2)}：${t}（再加票息）。${s.flows?.qe > 1e-6 ? 'QE 正在买债，也在压低收益率。' : ''}`;
    },
    water: '长水管：折现率一变，管内的水值多少钱变化很大。',
    formula: '债价变化 ≈ − 久期 × Δ收益率 + 票息',
    from: ['discountRate', 'policyRate', 'qe', 'cpi'], to: ['ringStage'],
    logic: '央行：降息或 QE → 长期收益率下降\n→ 投资者：债价上涨（价格与收益率反向）\n→ B2 通缩时债券最强，B1 通胀时最弱；所以它是判断「通胀 vs 通缩」的赌注。',
    live: 'assets.bond.ret', fmt: 'pct' },
  equityAsset: {
    name: '股票', short: '价格 = 企业盈利 × 估值倍数，同时看盈利和折现率。',
    why: (s, p, c) => {
      const a = s.assets?.equity || {}, o = c.past(4);
      const yoy = o && o.firm?.profit ? s.firm.profit / o.firm.profit - 1 : null;
      return `本季回报 ${P(a.ret, 2)}：市盈率 ${ok(a.pe) ? a.pe.toFixed(1) : '—'}，10 年国债 ${P(s.rates?.gov10y, 2)}${ok(yoy) ? `，企业利润比 ${c.ago(4)} ${yoy >= 0 ? '+' : '−'}${Math.abs(yoy * 100).toFixed(0)}%` : ''}${s.flows?.qe > 1e-6 ? '；QE 在托高估值' : ''}。`;
    },
    water: '工厂水轮：盈利是水量，折现率是重力。',
    formula: '股价 ≈ 盈利 CF × 市盈率；市盈率 ~ 1 / (折现率 − 增长)',
    from: ['cf', 'discountRate', 'riskPremium', 'qe'], to: ['lampValuation', 'ringStage'],
    logic: '企业：赚利润 → 投资者：按盈利和折现率给股票估价\n→ 盈利下降会杀估值，QE/降息会推估值\n→ 两者同时发生时（B2 初期）股票最难判断。',
    live: 'assets.equity.ret', fmt: 'pct' },
  goldAsset: {
    name: '黄金', short: '不产生现金流的价值储存，实际利率低或失去信心时受益。',
    why: (s) => {
      const a = s.assets?.gold || {};
      return `本季回报 ${P(a.ret, 2)}：实际利率 ${P(s.rates?.realPolicy, 2)}${s.rates?.realPolicy < 0 ? '（为负，持有黄金不吃亏）' : ''}，对货币的不信任度 ${ok(a.distrust) ? a.distrust.toFixed(2) : '—'}。`;
    },
    water: '一块不会蒸发的石头：水越不值钱，石头越有价值。',
    formula: '黄金 ≈ − 实际利率 + 对货币信心的下降',
    from: ['realRate', 'fiscalInjection', 'qe'], to: ['ringStage'],
    logic: '政府、央行：赤字和 QE 让货币变多 → 投资者：对货币的信心下降\n→ 实际利率越低，持有没有利息的黄金越不吃亏\n→ 黄金没有现金流，所以对折现率最敏感；⑥⑦ 阶段的货币贬值使它表现好。',
    live: 'assets.gold.ret', fmt: 'pct' },
};

// Keyword -> concept id, used to turn plain rule text into clickable terms (longest first matters).
export const KEYWORDS = [
  ['政策利率', 'policyRate'], ['实际利率', 'realRate'], ['有效房贷利率', 'mortgageEff'], ['房贷利率', 'mortgageEff'],
  ['新贷款', 'newLoans'], ['还本', 'principalRepay'], ['付息', 'interestPaid'], ['信贷脉冲', 'creditImpulse'],
  ['私人债务/GDP', 'pvtDebtGdp'], ['政府债务/GDP', 'govDebtGdp'], ['DSR', 'dsr'], ['LVR', 'lvr'], ['审批', 'bankApproval'], ['资本比率', 'bankCapital'], ['坏账', 'badLoans'],
  ['财政注入', 'fiscalInjection'], ['QE', 'qe'], ['Capacity', 'capacity'], ['Capex', 'capex'], ['产出缺口', 'outputGap'],
  ['CPI', 'cpi'], ['通胀预期', 'inflationExp'], ['通胀', 'cpi'], ['失业率', 'unemployment'], ['折现率', 'discountRate'], ['风险溢价', 'riskPremium'],
  ['利息/税收', 'interestToTax'], ['租售比', 'rentYield'], ['房价/收入', 'priceToIncome'], ['房价', 'housePrice'], ['B1', 'B1'], ['B2', 'B2'], ['CF', 'cf'],
];
