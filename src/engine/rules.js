// Transparent rule list (data). Each rule: id, player, tpl(params) -> Chinese text, enabled, params, paramDoc, immediate, delayed.
// The Chinese rule text is GENERATED from the live params (tpl), so text can never drift from the numbers:
//   - RULE_DEFS[i].text    = text with the DEFAULT params (string, for static importers)
//   - sim.rules[i].text    = getter, text with that sim's CURRENT params
//   - ruleText(id, params) = same function, explicit
// Disabled rule = that player's neutral behaviour (see economy.js decide* / settle).
// RULE_DEFS holds the DEFAULTS. Every sim gets its own deep copy (see makeRuleParams) so that
// sim.setRuleParam(ruleId, key, value) never leaks between sims. paramDoc = one-line Chinese meaning of each param.

// ---- text helpers (numbers are formatted from params, never typed by hand)
const trim = x => String(+x.toFixed(2));
const pc = x => trim(x * 100) + '%';          // 0.035 -> 3.5%
const pp = x => trim(x * 100) + 'pp';
const n2 = x => trim(x);

const RAW = [
  // ---- 央行
  { id: 'cb_real_path', player: 'centralBank', enabled: true, tpl: () => '历史模式：政策利率沿用真实联储路径（外生输入）；关闭后改用泰勒规则',
    params: {}, paramDoc: {}, immediate: '新贷款定价改变', delayed: '存量房贷分批重定价后抬高/降低 DSR' },
  { id: 'cb_taylor', player: 'centralBank', enabled: true,
    tpl: p => `泰勒规则：政策利率目标 = 中性利率 ${pc(p.rStar)} + 通胀 + ${n2(p.wInfl)}×(通胀-${pc(p.target)}) + ${n2(p.wGap)}×失业缺口反应；每季向目标靠拢 ${pc(p.smooth)}、单季最多 ${pp(p.maxMove)}、下限 ${pc(p.floor)}；私人债务/GDP 每超出 ${pc(p.debtBase)} 的 100%，中性利率下降 ${pc(p.debtDrag)}（债务棘轮）。两条央行规则都关闭 = 利率保持不变`,
    params: { rStar: 0.01, target: 0.02, wInfl: 0.5, wGap: 0.5, smooth: 0.25, maxMove: 0.0075, floor: 0.0025, debtDrag: 0.012, debtBase: 1.2 },
    paramDoc: { rStar: '中性实际利率（债务不重时）', target: '通胀目标', wInfl: '对通胀偏离的反应系数', wGap: '对失业缺口的反应系数', smooth: '每季向目标利率靠拢的比例（利率平滑）', maxMove: '单季最大调整幅度', floor: '政策利率下限', debtDrag: '私人债务/GDP 每超出基准 100% 使中性利率下降的幅度（债务棘轮）', debtBase: '债务拖累起算的私人债务/GDP 基准' },
    immediate: '新房贷利率与国债收益率改变', delayed: '约 4-8 季度后影响信贷、房价与产出缺口' },
  { id: 'cb_qe', player: 'centralBank', enabled: true,
    tpl: p => `政策利率 ≤ ${pc(p.floorRate)}、私人信贷收缩、失业率 >${pc(p.uOn)}（或需求缺口 <-3%）且通胀 <3% → 启动 QE（每年约 ${pc(p.sizeGdp)} GDP，买入长期国债）；通胀 >${pc(p.piOff)} 或失业率 <${pc(p.uOff)} 或政策利率 >2% 则停止`,
    params: { floorRate: 0.005, uOn: 0.065, uOff: 0.055, piOff: 0.025, sizeGdp: 0.05 },
    paramDoc: { floorRate: '政策利率低于此值才考虑 QE', uOn: '失业率高于此值（或缺口深）才启动 QE', uOff: '失业率低于此值停止 QE', piOff: '通胀高于此值停止 QE', sizeGdp: 'QE 规模（年化，占 GDP 比例）' },
    immediate: '央行买债，存款 M 增加，长端收益率下降', delayed: '资产价格上升；若私人信贷不恢复则传导偏弱' },
  // ---- 政府
  { id: 'gov_stimulus', player: 'government', enabled: true,
    tpl: p => `失业率较近 2 年低点上升 >${pp(p.du)} 或需求缺口 <${pc(p.gap)} → 财政注入目标 = ${n2(p.gain)}×(缺口深度-${pc(p.gapFree)}) + 0.5×失业超出，每季最多加码 ${pc(p.ramp)}、上限 ${pc(p.max)}（占 GDP）；景气恢复后每季收回 ${pc(p.unwind)}`,
    params: { du: 0.025, gap: -0.04, ramp: 0.03, max: 0.12, unwind: 0.004, gain: 1.88, gapFree: 0.02 },
    paramDoc: { du: '失业率较近 2 年低点上升超过此值触发', gap: '产出缺口（需求压力）低于此值触发', ramp: '每季最多加码幅度（占 GDP）', max: '财政注入上限（占 GDP/年）', unwind: '景气稳定后每季收回幅度', gain: '目标注入 = gain×(缺口深度-gapFree)', gapFree: '浅于此深度的缺口不用额外加码' },
    immediate: '财政净注入增加，M 上升，需求支撑', delayed: '政府债务/GDP 与利息/税收上升；需求超过产能时推高通胀' },
  { id: 'gov_austerity', player: 'government', enabled: true,
    tpl: p => `通胀 >${pc(p.pi)} 或 利息/税收 >${pc(p.i2t)} → 每季收缩财政注入 0.5pp，下限 ${pc(p.cut)} GDP`,
    params: { pi: 0.045, i2t: 0.22, cut: -0.015 },
    paramDoc: { pi: '通胀高于此值开始紧缩', i2t: '利息/税收高于此值开始紧缩', cut: '紧缩的下限（财政注入占 GDP，负数）' },
    immediate: '政府支出下降，需求降温', delayed: '赤字收窄，利息负担增速放缓' },
  { id: 'gov_bank_recap', player: 'government', enabled: true,
    tpl: p => `银行资本充足率跌破 ${pc(p.cap)} → 政府每季补足缺口的 ${pc(p.rate)}，目标 ${pc(p.target)}（计入政府债务）；关闭则银行只能靠留存利润慢慢修复`,
    params: { cap: 0.07, target: 0.085, rate: 0.3 },
    paramDoc: { cap: '资本充足率低于此值时政府注资', target: '注资目标资本充足率', rate: '每季补足缺口的比例' },
    immediate: '银行资本上升，政府债务上升', delayed: '信贷恢复能力提高；政府利息负担上升' },
  // ---- 银行
  { id: 'bank_loosen', player: 'bank', enabled: true,
    tpl: p => `抵押品改善（房价同比 >${pc(p.hp)}）且坏账率 <${pc(p.bad)}、资本充足率 >${pc(p.cap)} → 每季放宽信贷审批 ${n2(p.step)}，审批倍数上限 ${n2(p.max)}`,
    params: { hp: 0.04, bad: 0.025, cap: 0.09, step: 0.0327, max: 1.25 },
    paramDoc: { hp: '房价同比高于此值才放宽', bad: '坏账率低于此值才放宽', cap: '资本充足率高于此值才放宽', step: '每季放宽幅度', max: '审批倍数上限' },
    immediate: '审批倍数上升，新贷款与新存款增加', delayed: '家庭 DSR 与银行住房集中度上升' },
  { id: 'bank_tighten_losses', player: 'bank', enabled: true,
    tpl: p => `坏账率 >${pc(p.bad)} 或资本充足率 <${pc(p.cap)} → 每季收紧信贷审批 ${n2(p.step)}，审批倍数下限 ${n2(p.min)}`,
    params: { bad: 0.028, cap: 0.08, step: 0.06, min: 0.5 },
    paramDoc: { bad: '坏账率高于此值收紧', cap: '资本充足率低于此值收紧', step: '每季收紧幅度', min: '审批倍数下限' },
    immediate: '审批倍数下降，新贷款减少', delayed: '借款人再融资困难，违约上升或信用收缩' },
  { id: 'bank_tighten_collateral', player: 'bank', enabled: true,
    tpl: p => `（房价同比 <${pc(p.hp)} 或较近期峰值回撤 >${pc(p.dd)}）且平均 LVR >${pc(p.lvr)} → 每季收紧住房信贷 ${n2(p.step)}；合格购房者仍保留至少 ${pc(p.floor)} 的新贷款需求`,
    params: { hp: -0.02, lvr: 0.40, step: 0.06, floor: 0.3, dd: 0.04 },
    paramDoc: { dd: '房价较近期峰值回撤超过此比例也触发收紧（持久，不因单季反弹而解除）', floor: '即使抵押品不足，合格购房者仍能获得的需求比例（新贷款下限）', hp: '房价同比低于此值触发', lvr: '平均 LVR（房贷/房价）高于此值触发（也是新增房贷的最大 LVR 基准之一）', step: '每季收紧幅度' },
    immediate: '住房新贷款减少', delayed: '购房资金减少，房价进一步承压（抵押品回路反转）' },
  { id: 'bank_rebuild_capital', player: 'bank', enabled: true,
    tpl: p => `资本充足率 <${pc(p.cap)} → 审批倍数上限 = 1 - ${n2(p.k / 100)}×(缺口 pp)，且只能每季向 1 回升差距的 ${pc(p.recovery)}（先修复资本，不随降息自动恢复）`,
    params: { cap: 0.085, k: 15, recovery: 0.012 },
    paramDoc: { cap: '目标资本充足率', k: '资本缺口每 1pp 使审批上限下降的幅度（×100）', recovery: '资本不足时审批倍数每季向 1 回升的比例（极慢）' },
    immediate: '审批上限下降', delayed: '降息也不能重启私人信贷（资产负债表修复期）' },
  { id: 'bank_lvr_cap', player: 'bank', enabled: true,
    tpl: p => `新增房贷的 LVR 上限 = ${pc(p.lvrMax)} + 0.1×(审批倍数-1)：现有房贷占房价比例超过上限后，新增住房贷款被卡住（抵押品约束；这是银行的“LVR 上限”阀门）`,
    params: { lvrMax: 0.55 },
    paramDoc: { lvrMax: '审批倍数为 1 时，房贷/房价的最大允许比例（LVR 上限）' },
    immediate: '住房新贷款上限改变', delayed: '房价与家庭借款能力随之改变（约 2-4 季）' },
  // ---- 家庭
  { id: 'hh_chase', player: 'household', enabled: true,
    tpl: p => `房价同比 >${pc(p.up)} → 外推上涨、借款需求上升；房价同比 <${pc(p.down)} → 观望、借款需求下降`,
    params: { up: 0.0446, down: -0.03 },
    paramDoc: { up: '房价同比高于此值开始追涨', down: '房价同比低于此值开始观望' },
    immediate: '住房贷款申请增加/减少', delayed: '杠杆上升，之后偿债压力上升' },
  { id: 'hh_deleverage', player: 'household', enabled: true,
    tpl: p => `DSR 高于起点 +${pc(p.dsr)} 或失业率 >${pc(p.u)} → 借款需求 ×${n2(p.borrow)}、储蓄率 +${pc(p.save)}`,
    params: { dsr: 0.03, u: 0.0968, borrow: 0.6, save: 0.02 },
    paramDoc: { dsr: 'DSR 高于起点多少 pp 触发', u: '失业率高于此值触发', borrow: '触发后借款需求乘数', save: '触发后储蓄率增加' },
    immediate: '消费下降、借款需求下降', delayed: '去杠杆；需求不足，产出缺口扩大' },
  { id: 'hh_overhang', player: 'household', enabled: true,
    tpl: p => `资产负债表衰退：LVR >${pc(p.lvr0)}、房价较峰值回撤 >${pc(p.dd)}、DSR 高于起点 +${pc(p.dsr)} 任一项积累债务悬压；满格时借款需求 -${pc(p.borrow)}、储蓄率 +${pc(p.save)}、利率传导减弱 ${pc(p.traction)}；悬压每季保留 ${pc(p.decay)}，降息难以重启`,
    params: { lvr0: 0.47, lvrW: 0.12, dd: 0.04, ddW: 0.15, dsr: 0.015, dsrW: 0.03, decay: 0.975, borrow: 0.707, save: 0.04, traction: 0.95 },
    paramDoc: { lvr0: 'LVR 超过此值开始积累悬压', lvrW: 'LVR 超出多少达到满格悬压', dd: '房价较近期峰值回撤超过此比例开始积累悬压（负资产）', ddW: '回撤再增加多少达到满格', dsr: 'DSR 高于起点多少开始积累', dsrW: 'DSR 再高多少达到满格', decay: '悬压每季保留比例（越大越持久）', borrow: '满格悬压时借款需求减少比例', save: '满格悬压时储蓄率增加', traction: '满格悬压时利率对借款需求的传导减弱比例' },
    immediate: '借款需求下降、储蓄上升', delayed: '去杠杆持续数年；利率下调传导变弱' },
  { id: 'hh_forced_sales', player: 'household', enabled: true,
    tpl: p => `LVR >${pc(p.lvr)}、房贷坏账 >${pc(p.bad)}、失业率 >${pc(p.u)} 或房价较峰值回撤 >2% → 被迫出售/止赎压低房价（年化跌幅上限 ${pc(p.cap)}），负资产螺旋`,
    params: { lvr: 0.47, kLvr: 0.35, bad: 0.02, kBad: 2.0, u: 0.07, kU: 0.15, cap: 0.04, kDD: 0.3 },
    paramDoc: { kDD: '房价较峰值回撤部分（超过 2%）对季度跌幅的系数（负资产抛压）', cap: '被迫出售造成的年化跌幅上限', lvr: 'LVR 高于此值开始出现被迫出售', kLvr: 'LVR 超出部分对房价季度跌幅的系数', bad: '房贷坏账率高于此值产生止赎抛压', kBad: '坏账超出部分的系数', u: '失业率高于此值产生失业违约抛压', kU: '失业超出部分的系数' },
    immediate: '二手房抛压，房价下跌', delayed: '抵押品价值下降，LVR 进一步上升，银行亏损' },
  { id: 'hh_infl_deanchor', player: 'household', enabled: true,
    tpl: p => `通胀持续高于 ${pc(p.pi)} → 通胀预期脱锚（追随实际通胀的速度从每季 ${pc(p.speed)} 提高到最多 ${pc(p.speed + p.extra)}）；通胀回落时只跟随 ${pc(p.down)}（下行粘性）`,
    params: { pi: 0.0371, speed: 0.08, extra: 0.08, anchor: 0.0364, down: 0.5 },
    paramDoc: { pi: '通胀高于此值开始累积脱锚', speed: '正常时预期追随实际通胀的速度（每季）', extra: '完全脱锚时额外增加的追随速度', anchor: '锚定力度：向目标回归速度（每季）', down: '通胀低于预期时的追随比例（下行粘性）' },
    immediate: '通胀预期上升', delayed: '工资-价格螺旋；央行需要更长时间的紧缩才能压下' },
  // ---- 企业
  { id: 'firm_capex_up', player: 'firm', enabled: true,
    tpl: p => `需求压力 >${pc(p.p)} 且实际融资成本 <${pc(p.rReal)} → 每季增加 Capex ${n2(p.step)}，倍数上限 ${n2(p.max)}`,
    params: { p: 0.01, rReal: 0.05, step: 0.03, max: 1.25 },
    paramDoc: { p: '需求压力高于此值才扩张', rReal: '实际融资成本低于此值才扩张', step: '每季加码幅度', max: 'Capex 倍数上限' },
    immediate: '资金流向资本开支与新增贷款', delayed: '约 6 季度后形成新增产能 Y*' },
  { id: 'firm_capex_cut', player: 'firm', enabled: true,
    tpl: p => `需求缺口 <${pc(p.p)} 或 实际融资成本 >${pc(p.rReal)} 或 企业坏账 >${pc(p.bad)} → 每季削减 Capex ${n2(p.step)}，倍数下限 ${n2(p.min)}`,
    params: { p: -0.02, rReal: 0.056, bad: 0.04, step: 0.04, min: 0.85 },
    paramDoc: { p: '需求压力低于此值削减', rReal: '实际融资成本高于此值削减', bad: '企业坏账高于此值削减', step: '每季削减幅度', min: 'Capex 倍数下限' },
    immediate: 'Capex 与企业贷款下降', delayed: '未来产能增速下降，供给更紧' },
  { id: 'firm_oil_passthrough', player: 'firm', enabled: true,
    tpl: p => `油价（外生数据）同比 100% 时价格年化推力 ${pc(p.k)}（同比截断在 ${pc(p.lo)} ~ ${pc(p.hi)}）；关闭则油价不影响通胀`,
    params: { k: 0.02, lo: -0.5, hi: 1.5 },
    paramDoc: { k: '油价同比 100% 时的年化价格推力', lo: '油价同比下限（截断）', hi: '油价同比上限（截断）' },
    immediate: '成本推动型通胀', delayed: '若央行为此加息过度，压低的是需求而非产能' },
  // ---- 投资者
  { id: 'inv_momentum', player: 'investor', enabled: true,
    tpl: p => `新增资金按近期收益追涨：配置权重 = exp(${n2(p.k)}×近一年涨幅)，房价/股价涨得多的资产获得更大份额；房价季度动量延续上季的 ${pc(p.hpMom)}（涨跌两个方向都起作用）`,
    params: { k: 3, hpMom: 0.387 },
    paramDoc: { k: '资金配置对近期涨幅的敏感度', hpMom: '房价季度动量（上季涨跌的延续比例；0 = 无动量）' },
    immediate: '资产购买资金按动量重新分配', delayed: '动量强化价格，估值抬高；下跌时同样强化' },
  { id: 'inv_riskoff', player: 'investor', enabled: true,
    tpl: p => `风险溢价 >${pc(p.rp)} 或信贷脉冲 <${pc(p.ci)} → 避险：新增资金里现金份额 ×3、房产/金融资产份额 ×0.7；金融资产内部股票份额 ×0.5，长期国债份额 ×${n2(p.tilt)}（飞向安全）；但通胀预期 >${pc(p.infl)}（通胀型危机）时国债不是避风港（份额 ×0.3），改为黄金份额 ×${n2(p.tilt)}`,
    params: { rp: 0.06, ci: -0.01, infl: 0.04, tilt: 3 },
    paramDoc: { rp: '风险溢价高于此值转向避险', ci: '信贷脉冲低于此值转向避险', infl: '通胀预期高于此值视为通胀型危机：避险资金不进国债，改进黄金', tilt: '避险时安全资产（国债；通胀型危机时为黄金）相对份额的放大倍数' },
    immediate: '现金份额上升；股票/房产的资金流入下降，国债（或黄金）上升', delayed: '估值承压；若流动性紧张则被迫出售' },
  { id: 'inv_valuation', player: 'investor', enabled: true,
    tpl: p => `房价/收入（相对起点）>×${n2(p.ceil)} → 估值锚把房价往回拉（强度 ${n2(p.k)}）；基本面价值（收入×利率×信贷可得性）每季回归 ${pc(p.revert)}`,
    params: { ceil: 1.36, k: 0.20, revert: 0.0626, incElast: 0.85, rateElast: 0.30, apprElast: 0.35, ovhEff: 0.22, incPass: 0.9 },
    paramDoc: { ceil: '房价/收入相对起点超过此倍数开始额外回拉', k: '超出部分的回拉强度（对数，每季）', revert: '基本面价值回归速度（每季）', incElast: '基本面价值对收入的弹性', rateElast: '基本面价值对实际按揭利率的弹性', apprElast: '基本面价值对银行信贷审批倍数的弹性（可得性）', incPass: '收入增长直接传导到房价的比例（其余经基本面回归缓慢传导；信贷停摆时房价不再随名义收入上涨）', ovhEff: '满格债务悬压使基本面价值下降的比例（买家资产负债表受损）' },
    immediate: '房价/收入过高时涨幅被压缩', delayed: '估值回归；高杠杆时与被迫出售叠加' },
  { id: 'inv_equity_valuation', player: 'investor', enabled: true,
    tpl: p => `股票估值（市盈率相对起点）每高出 10%，股票在新增金融资产资金中的份额 ×${n2(Math.exp(-p.k * 0.1))}（贵了少买、便宜多买）`,
    params: { k: 1.5 },
    paramDoc: { k: '股票份额对估值偏离的敏感度（exp(-k×偏离)）' },
    immediate: '股票资金份额随估值调整', delayed: '抑制估值泡沫的自我强化' },
  { id: 'inv_bond_realrate', player: 'investor', enabled: true,
    tpl: p => `国债实际收益率（10 年期-通胀预期）高于 ${pc(p.anchor)} 时国债更有吸引力：份额 = ${n2(p.base)}×exp(${n2(p.k)}×(实际收益率-${pc(p.anchor)}))；实际收益率为负时几乎无人买`,
    params: { base: 0.5, k: 25, anchor: 0.015 },
    paramDoc: { base: '实际收益率等于 anchor 时国债的相对份额（股票 = 1）', k: '国债份额对实际收益率的敏感度', anchor: '中性实际收益率' },
    immediate: '国债资金份额随实际收益率调整', delayed: '长端利率更敏感于资金流向' },
  { id: 'inv_gold_trust', player: 'investor', enabled: true,
    tpl: p => `对货币的信任下降（通胀预期上升、利息/税收偏高、QE 存量增加、实际利率为负）→ 黄金份额 = ${n2(p.base)}×exp(${n2(p.k)}×不信任度)；黄金没有现金流，只靠信任`,
    params: { base: 0.15, k: 3 },
    paramDoc: { base: '完全信任货币时黄金的相对份额（股票 = 1）', k: '黄金份额对“不信任度”的敏感度' },
    immediate: '黄金资金份额随不信任度调整', delayed: '黄金价格动量与实际利率下行叠加' },
  // ---- 外国
  { id: 'foreign_trade', player: 'foreign', enabled: true,
    tpl: p => `本国需求超过产能 → 进口增加、净出口下降；需求不足则净出口回升（敏感度 ${n2(p.k)}）`,
    params: { k: 0.35 },
    paramDoc: { k: '净出口对需求压力的敏感度' },
    immediate: '部分需求外溢到海外，缓解通胀', delayed: '经常账户逆差扩大，外国持有更多本币资产' },
  { id: 'foreign_funding', player: 'foreign', enabled: true,
    tpl: p => `财政赤字 >${pc(p.def)} GDP 且通胀 >${pc(p.pi)} → 外国债权人要求更高期限溢价 (+${pp(p.add)})`,
    params: { def: 0.05, pi: 0.03, add: 0.005 },
    paramDoc: { def: '赤字/GDP 高于此值触发', pi: '通胀高于此值触发', add: '增加的期限溢价' },
    immediate: '长端国债收益率上升', delayed: '房贷利率上升，政府利息负担加重' },
];

// RULE_DEFS: static view (text from DEFAULT params). tpl is kept so callers can re-render with other params.
export const RULE_DEFS = RAW.map(r => ({ ...r, text: r.tpl(r.params) }));
export const RULE_BY_ID = Object.fromEntries(RULE_DEFS.map(r => [r.id, r]));

// Chinese rule text for rule `id` with the given params (defaults to that rule's default params)
export function ruleText(id, params) {
  const r = RULE_BY_ID[id];
  return r ? r.tpl(params || r.params) : '';
}

export function makeRuleState() {
  const enabled = {};
  for (const r of RULE_DEFS) enabled[r.id] = r.enabled;
  return enabled;
}
// per-sim deep copy of the default params
export function makeRuleParams() {
  const p = {};
  for (const r of RULE_DEFS) p[r.id] = { ...r.params };
  return p;
}
