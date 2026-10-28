// Transparent rule list (data). Each rule: id, player, text (Chinese), enabled, params, immediate, delayed.
// Disabled rule = that player's neutral behaviour (see economy.js decide* functions).

export const RULE_DEFS = [
  // ---- 央行
  { id: 'cb_real_path', player: 'centralBank', enabled: true, text: '历史模式：政策利率沿用真实联储路径（外生输入）；关闭后改用泰勒规则',
    params: {}, immediate: '新贷款定价改变', delayed: '存量房贷分批重定价后抬高/降低 DSR' },
  { id: 'cb_taylor', player: 'centralBank', enabled: true, text: '泰勒规则：政策利率 = 1% + 通胀 + 0.5×(通胀-2%) + 失业缺口反应（平滑、下限 0.25%）',
    params: { rStar: 0.01, target: 0.02, wInfl: 0.5, wGap: 0.5, smooth: 0.25, maxMove: 0.0075, floor: 0.0025 },
    immediate: '新房贷利率与国债收益率改变', delayed: '约 4-8 季度后影响信贷、房价与产出缺口' },
  { id: 'cb_qe', player: 'centralBank', enabled: true, text: '政策利率触底且私人信贷收缩、失业高企 → 启动 QE；通胀回到 2.5% 以上或失业回落则停止',
    params: { floorRate: 0.005, uOn: 0.065, uOff: 0.055, piOff: 0.025, sizeGdp: 0.05 },
    immediate: '央行买债，存款 M 增加，长端收益率下降', delayed: '资产价格上升；若私人信贷不恢复则传导偏弱' },
  // ---- 政府
  { id: 'gov_stimulus', player: 'government', enabled: true, text: '失业较低点上升 >2.5pp 或产出缺口 <-4% → 逐季加大财政支出（占 GDP），景气恢复后逐步收回',
    params: { du: 0.025, gap: -0.04, ramp: 0.02, max: 0.08, unwind: 0.004 },
    immediate: '财政净注入增加，M 上升，需求支撑', delayed: '政府债务/GDP 与利息/税收上升；需求超过产能时推高通胀' },
  { id: 'gov_austerity', player: 'government', enabled: true, text: '通胀 >4.5% 或 利息/税收 >22% → 收缩财政（占 GDP -1.5%）',
    params: { pi: 0.045, i2t: 0.22, cut: -0.015 },
    immediate: '政府支出下降，需求降温', delayed: '赤字收窄，利息负担增速放缓' },
  // ---- 银行
  { id: 'bank_loosen', player: 'bank', enabled: true, text: '抵押品改善（房价同比 >4%）且坏账低、资本充足 → 放宽信贷审批',
    params: { hp: 0.04, bad: 0.025, cap: 0.095, step: 0.02, max: 1.2 },
    immediate: '审批倍数上升，新贷款与新存款增加', delayed: '家庭 DSR 与银行住房集中度上升' },
  { id: 'bank_tighten_losses', player: 'bank', enabled: true, text: '坏账率 >3.5% 或资本充足率 <9.5% → 收紧信贷审批',
    params: { bad: 0.035, cap: 0.085, step: 0.08, min: 0.4 },
    immediate: '审批倍数下降，新贷款减少', delayed: '借款人再融资困难，违约上升或信用收缩' },
  { id: 'bank_tighten_collateral', player: 'bank', enabled: true, text: '房价同比 <-2% 且平均 LVR >42% → 收紧住房信贷',
    params: { hp: -0.02, lvr: 0.42, step: 0.06 },
    immediate: '住房新贷款减少', delayed: '购房资金减少，房价进一步承压（抵押品回路反转）' },
  // ---- 家庭
  { id: 'hh_chase', player: 'household', enabled: true, text: '房价同比 >5% → 外推上涨、借款需求上升；房价同比 <-3% → 观望、借款需求下降',
    params: { up: 0.05, down: -0.03 },
    immediate: '住房贷款申请增加/减少', delayed: '杠杆上升，之后偿债压力上升' },
  { id: 'hh_deleverage', player: 'household', enabled: true, text: 'DSR 高于起点 +3pp 或失业率 >7.5% → 减少借款、提高储蓄',
    params: { dsr: 0.03, u: 0.075, borrow: 0.6, save: 0.02 },
    immediate: '消费下降、借款需求下降', delayed: '去杠杆；需求不足，产出缺口扩大' },
  // ---- 企业
  { id: 'firm_capex_up', player: 'firm', enabled: true, text: '需求超过产能且实际融资成本不高 → 增加 Capex',
    params: { p: 0.01, rReal: 0.05, step: 0.03, max: 1.15 },
    immediate: '资金流向资本开支与新增贷款', delayed: '约 6 季度后形成新增产能 Y*' },
  { id: 'firm_capex_cut', player: 'firm', enabled: true, text: '需求缺口 <-2% 或 实际融资成本 >5.5% 或 坏账 >4% → 削减 Capex',
    params: { p: -0.02, rReal: 0.055, bad: 0.04, step: 0.04, min: 0.85 },
    immediate: 'Capex 与企业贷款下降', delayed: '未来产能增速下降，供给更紧' },
  // ---- 投资者
  { id: 'inv_momentum', player: 'investor', enabled: true, text: '新增资金按近期收益追涨：房价/股价动量高的资产获得更大份额',
    params: { k: 3 },
    immediate: '资产购买资金按动量重新分配', delayed: '动量强化价格，估值抬高' },
  { id: 'inv_riskoff', player: 'investor', enabled: true, text: '风险溢价升高或信贷脉冲转负 → 资金转向现金/债券',
    params: { rp: 0.06, ci: -0.01 },
    immediate: '股票/房产的资金流入下降', delayed: '估值承压；若流动性紧张则被迫出售' },
  // ---- 外国
  { id: 'foreign_trade', player: 'foreign', enabled: true, text: '本国需求超过产能 → 进口增加、净出口下降；需求不足则净出口回升',
    params: { k: 0.15 },
    immediate: '部分需求外溢到海外，缓解通胀', delayed: '经常账户逆差扩大，外国持有更多本币资产' },
  { id: 'foreign_funding', player: 'foreign', enabled: true, text: '财政赤字 >5% GDP 且通胀 >3% → 外国债权人要求更高期限溢价 (+0.5pp)',
    params: { def: 0.05, pi: 0.03, add: 0.005 },
    immediate: '长端国债收益率上升', delayed: '房贷利率上升，政府利息负担加重' },
];

export function makeRuleState() {
  const enabled = {};
  for (const r of RULE_DEFS) enabled[r.id] = r.enabled;
  return enabled;
}
export const RULE_BY_ID = Object.fromEntries(RULE_DEFS.map(r => [r.id, r]));
