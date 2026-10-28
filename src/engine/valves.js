// VALVES (DESIGN v2 section 3): the knobs a player can turn, and the causal chain the ENGINE actually runs for each.
// Water LEVELS (house price, equity, inflation, unemployment ...) are outcomes and are never valves.
//
// Entry: { id, player, label (中文), decisionKey | ruleParam:{rule,key}, kind:'range'|'toggle', min, max, step, default, unit,
//          chainWhen (which way the chain texts describe turning the valve), read(snapshot) -> value currently in force,
//          chain:[{ term, delayLabel, delayLabelTown, text }] }
//   term           = snapshot path ('rates.mortgageNew', 'flows.newLoans', 'assets.housing.price', ...): which pipe / level lights up
//   delayLabel     = '立刻' | '1–2 季' | '2–4 季' | '2–3 年'   US scenario (delays on)
//   delayLabelTown = same, town scenario with delays:false (almost everything is '立刻'; Capex capacity keeps a short visible lag)
//   decisionKey valves are applied through sim.setValve(id, value) (= sim.setDecision on the user branch, or the model branch in the town);
//   ruleParam valves through sim.setRuleParam (the param is shared by model and user branch). sim.valves returns this table + { value, userSet }.
// No Node-only APIs here.
//
// MEASURED LAGS. tools/valve_probe.mjs runs two identical sims, turns ONE valve in one of them (US: 2004Q1, except policyRate 2012Q1 where the
// real rate path is flat, and lvrCap 2005Q1 where LVR binds; town: quarter 4) and records for every metric the first quarter after the turn
// where it departs from the baseline by a MATERIAL amount (~1% relative / 17bp / 1pp). q+1 = the very quarter the valve is turned.
// Mapping: q+1 -> 立刻 ; q+2..3 -> 1–2 季 ; q+4..6 -> 2–4 季 ; q+7.. -> 2–3 年.  engine_check re-measures and asserts the labels (deterministic).
//   US  policyRate +1.5pp : mortgageNew q+1 | gov10y, bond, equity, newLoans q+2 | housing q+3 | mortgageEff q+4 (50% by q+6) | DSR first q+10
//   US  qe on             : M, gov10y, bond q+1 | equity, newLoans q+2..3 | housing q+4 | demand pressure q+6 | inflation first q+7
//   US  approval x0.7     : mortgageNew, newLoans, housing(-1%) q+1 | M q+2 | lvr q+3 | DSR q+10 | income q+12 (fiscal stabilisers offset)
//   US  lvrCap 0.30       : newLoans q+1 | lvr q+2 | housing q+4 | DSR q+6 | income q+4 | approval feedback q+9
//   US  borrowMult x1.4   : newLoans q+1 | M q+4 | housing q+8 (first visible q+4) | DSR q+14 | approval q+11
//   US  saveAdj +4pp      : savingRate, consumption, demand pressure q+1 | newLoans q+3 | housing q+5 | income q+7 | unemployment q+12
//   US  capexMult x1.3    : capex, demand pressure q+1 (demand FIRST) | income q+7 | capacity q+9 (6q pipeline + build-up)
//   US  fiscal +5% GDP    : injection, demand pressure, M q+1 | income, inflation q+2 | gov10y q+2 | DSR q+12 | capacity q+16
//   Town (delays:false): rates, DSR, income reprice in the same quarter; Capex capacity appears after the 2-quarter lag (demand first).

export const VALVES = [
  {
    id: 'policyRate', chainWhen: '调高（加息）', player: 'centralBank', label: '央行：政策利率', decisionKey: 'policyRate', kind: 'range',
    min: 0, max: 0.12, step: 0.0025, default: 0.03, unit: 'pct', read: s => s.rates.policy,
    chain: [
      { term: 'rates.mortgageNew', delayLabel: '立刻', delayLabelTown: '立刻', text: '新房贷利率随政策利率上调（新贷款按新利率定价）' },
      { term: 'rates.gov10y', delayLabel: '1–2 季', delayLabelTown: '立刻', text: '长端国债收益率跟着预期政策路径上移' },
      { term: 'assets.bond.price', delayLabel: '1–2 季', delayLabelTown: '立刻', text: '收益率上升 → 长期国债价格下跌（久期约 8）' },
      { term: 'assets.equity.price', delayLabel: '1–2 季', delayLabelTown: '立刻', text: '贴现率上升 → 股票估值回落' },
      { term: 'flows.newLoans', delayLabel: '1–2 季', delayLabelTown: '立刻', text: '借款成本上升 → 新增贷款（泵）减少' },
      { term: 'assets.housing.price', delayLabel: '1–2 季', delayLabelTown: '立刻', text: '新增购房资金减少 + 实际按揭利率上升 → 房价水位下降' },
      { term: 'rates.mortgageEff', delayLabel: '2–4 季', delayLabelTown: '立刻', text: '存量房贷分批重定价（每季约 10%），平均房贷利率慢慢上行' },
      { term: 'household.dsr', delayLabel: '2–3 年', delayLabelTown: '立刻', text: '平均房贷利率上行 → 偿债率 DSR 上升' },
    ],
  },
  {
    id: 'qe', chainWhen: '打开', player: 'centralBank', label: '央行：QE 开关', decisionKey: 'qe', kind: 'toggle',
    min: 0, max: 1, step: 1, default: 0, unit: 'onoff', read: s => (s.extra.qeOn ? 1 : 0),
    chain: [
      { term: 'money.M', delayLabel: '立刻', delayLabelTown: '立刻', text: '央行买入长期国债，创造新水（QE 泵），存款 M 立刻增加' },
      { term: 'rates.gov10y', delayLabel: '立刻', delayLabelTown: '立刻', text: '买债压低长端收益率' },
      { term: 'assets.bond.price', delayLabel: '立刻', delayLabelTown: '立刻', text: '收益率下降 + QE 资金流入 → 长期国债价格上升' },
      { term: 'assets.equity.price', delayLabel: '1–2 季', delayLabelTown: '1–2 季', text: '贴现率下降、资金外溢 → 股票估值上升' },
      { term: 'flows.newLoans', delayLabel: '1–2 季', delayLabelTown: '1–2 季', text: '房贷利率下降 → 新增贷款增加' },
      { term: 'assets.housing.price', delayLabel: '2–4 季', delayLabelTown: '2–4 季', text: '更便宜的房贷 + 更多购房资金 → 房价水位上升' },
      { term: 'macro.demandPressure', delayLabel: '2–4 季', delayLabelTown: '2–3 年', text: '资产价格与信贷回升 → 需求压力上升' },
    ],
  },
  {
    id: 'approval', chainWhen: '调低（收紧）', player: 'bank', label: '银行：审批松紧', decisionKey: 'approval', kind: 'range',
    min: 0.3, max: 1.4, step: 0.05, default: 1, unit: 'x', read: s => s.bank.approval,
    chain: [
      { term: 'rates.mortgageNew', delayLabel: '立刻', delayLabelTown: '立刻', text: '审批收紧时银行要求更高的风险溢价，新房贷利率上浮' },
      { term: 'flows.newLoans', delayLabel: '立刻', delayLabelTown: '立刻', text: '审批倍数下降 → 新增贷款（泵）按比例减少' },
      { term: 'money.M', delayLabel: '1–2 季', delayLabelTown: '立刻', text: '新水少了，存款 M 的增长放缓甚至下降' },
      { term: 'assets.housing.price', delayLabel: '立刻', delayLabelTown: '立刻', text: '购房资金减少 → 房价水位下降' },
      { term: 'household.income', delayLabel: '2–3 年', delayLabelTown: '立刻', text: '信贷、Capex 收缩 → 需求与收入下降' },
    ],
  },
  {
    id: 'lvrCap', chainWhen: '调低（收紧）', player: 'bank', label: '银行：LVR 上限', ruleParam: { rule: 'bank_lvr_cap', key: 'lvrMax' }, kind: 'range',
    min: 0.3, max: 0.9, step: 0.05, default: 0.55, unit: 'pct', read: s => s.household.lvr,
    chain: [
      { term: 'flows.newLoans', delayLabel: '立刻', delayLabelTown: '立刻', text: '贷款/房价上限降低 → 新增住房贷款被卡住' },
      { term: 'household.lvr', delayLabel: '1–2 季', delayLabelTown: '1–2 季', text: '新增房贷变少 → 平均 LVR 下降' },
      { term: 'assets.housing.price', delayLabel: '2–4 季', delayLabelTown: '1–2 季', text: '购房资金减少 → 房价水位下降' },
      { term: 'household.dsr', delayLabel: '2–4 季', delayLabelTown: '2–4 季', text: '债务增速放缓 → 偿债率 DSR 下降' },
      { term: 'household.income', delayLabel: '2–4 季', delayLabelTown: '立刻', text: '信贷减少 → 需求与收入下降' },
    ],
  },
  {
    id: 'borrowMult', chainWhen: '调高', player: 'household', label: '家庭：借款意愿', decisionKey: 'borrowMult', kind: 'range',
    min: 0.3, max: 1.8, step: 0.05, default: 1, unit: 'x', read: s => s.extra.borrowMult,
    chain: [
      { term: 'flows.newLoans', delayLabel: '立刻', delayLabelTown: '立刻', text: '借款需求上升 → 新增贷款（泵）增加' },
      { term: 'money.M', delayLabel: '2–4 季', delayLabelTown: '立刻', text: '新水增加，存款 M 上升' },
      { term: 'assets.housing.price', delayLabel: '2–3 年', delayLabelTown: '2–3 年', text: '更多购房资金 → 房价水位上升' },
      { term: 'household.dsr', delayLabel: '2–3 年', delayLabelTown: '2–3 年', text: '债务累积 → 偿债率 DSR 上升' },
      { term: 'bank.approval', delayLabel: '2–3 年', delayLabelTown: '2–3 年', text: 'DSR/LVR 走高、坏账上升 → 银行收紧审批（反馈）' },
    ],
  },
  {
    id: 'saveAdj', chainWhen: '调高（多存钱）', player: 'household', label: '家庭：储蓄率调整', decisionKey: 'saveAdj', kind: 'range',
    min: -0.05, max: 0.1, step: 0.005, default: 0, unit: 'pp', read: s => s.extra.saveAdj,
    chain: [
      { term: 'household.savingRate', delayLabel: '立刻', delayLabelTown: '立刻', text: '储蓄率上升（存款留在账上，不再流向商品渠道）' },
      { term: 'household.consumption', delayLabel: '立刻', delayLabelTown: '立刻', text: '消费下降 → 商品渠道的水变少' },
      { term: 'macro.demandPressure', delayLabel: '立刻', delayLabelTown: '立刻', text: '总需求下降 → 需求压力下降、通胀回落' },
      { term: 'household.income', delayLabel: '2–3 年', delayLabelTown: '立刻', text: '销售下降 → 企业收入与工资下降（节俭悖论）' },
      { term: 'macro.unemployment', delayLabel: '2–3 年', delayLabelTown: '1–2 季', text: '需求不足 → 失业率上升' },
    ],
  },
  {
    id: 'capexMult', chainWhen: '调高', player: 'firm', label: '企业：Capex 力度', decisionKey: 'capexMult', kind: 'range',
    min: 0.6, max: 1.4, step: 0.05, default: 1, unit: 'x', read: s => s.extra.capexMult,
    chain: [
      { term: 'firm.capex', delayLabel: '立刻', delayLabelTown: '立刻', text: '企业加大资本开支（Capex）' },
      { term: 'macro.demandPressure', delayLabel: '立刻', delayLabelTown: '立刻', text: 'Capex 先是需求：花出去的钱推高总需求，需求压力上升' },
      { term: 'household.income', delayLabel: '2–3 年', delayLabelTown: '1–2 季', text: '需求扩张 → 工资与收入上升' },
      { term: 'macro.capacityPotential', delayLabel: '2–3 年', delayLabelTown: '2–4 季', text: 'Capex 经过建设期才变成产能（供给），之后需求压力回落' },
    ],
  },
  {
    id: 'fiscalInjection', chainWhen: '调高（加大赤字支出）', player: 'government', label: '政府：财政注入', decisionKey: 'fiscalInjection', kind: 'range',
    min: -0.05, max: 0.15, step: 0.005, default: 0, unit: 'pct', read: s => s.extra.fiscalAdj,
    chain: [
      { term: 'flows.fiscalInjection', delayLabel: '立刻', delayLabelTown: '立刻', text: '政府赤字支出（泵）增加，新水进入经济' },
      { term: 'macro.demandPressure', delayLabel: '立刻', delayLabelTown: '立刻', text: '政府采购直接推高总需求' },
      { term: 'household.income', delayLabel: '1–2 季', delayLabelTown: '1–2 季', text: '需求扩张 → 工资与收入上升' },
      { term: 'macro.inflation', delayLabel: '1–2 季', delayLabelTown: '1–2 季', text: '需求超过产能的部分转为物价上涨' },
      { term: 'rates.gov10y', delayLabel: '1–2 季', delayLabelTown: '2–4 季', text: '赤字与债务上升 → 利息/税收升高，长端收益率上行' },
      { term: 'household.dsr', delayLabel: '2–3 年', delayLabelTown: '2–3 年', text: '利率上行后存量房贷慢慢重定价 → 偿债率 DSR 上升' },
    ],
  },
];
export const VALVE_BY_ID = Object.fromEntries(VALVES.map(v => [v.id, v]));
