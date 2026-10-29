// Capstone lesson 「投资者」 as DATA (approved by the user, 2026-10-29). Same shape as a LESSONS entry in src/data/lessons.js;
// it lives in its own file because lessons.js is being restructured. Wiring it into the course menu is the integrator's job.
//
// New step field (only this lesson uses it):
//   panel: { id, ... }   the lesson card mounts an interactive panel with mountInvestorPanel(host, step.panel) from
//                        src/ui/investor-lab.js and calls unmountInvestorPanel() when the step is left. Panel ids and their
//                        fields: tools/D-CONTRACT.md, section 「投资者」.
//
// Numbers: every number typed into a text comes from repo data or the approved spec. `claims` (never shown to the learner) say
// where each one comes from; tools/check_lesson_investor.mjs recomputes them and checks that `shown` appears in the step text.
//   claim = { shown, src, ... }   src: 'blind' (card, path, fmt) | 'fx' (pair, from, until, fmt) | 'jst' (what, year?) |
//                                 'jpnq' (what) | 'spec' (no data in the repo: the handover / the user's spec says so)
// The JST series below (JPN_JST) are recomputed from ../dalio_432/data/jst_panel.csv by the same checker when that file is there.

// 资产反应表: handover_macro.md §4.3, copied cell by cell (the checker compares it with the markdown table).
// row.now: which engine state maps to this row (see investor-lab.js nowRow()); A / C are not engine states.
export const ASSET_COLS = [
  { k: 'cash', name: '现金', part: 'cash', spring: '没有泉水：持有成本 = 通胀' },
  { k: 'bond', name: '长期国债', part: 'poolBond', spring: '泉水 = 票息；利率 ↑ 价格 ↓（跷跷板）' },
  { k: 'equity', name: '股票', part: 'poolEquity', spring: '泉水 = 利润和分红' },
  { k: 'house', name: '房产', part: 'poolHousing', spring: '泉水 = 租金；也是银行的抵押品' },
  { k: 'gold', name: '黄金/实物', part: 'poolGold', spring: '没有泉水：只看实际利率和对货币的信心' },
  { k: 'fx', name: '本币', part: null, spring: '本币对外的价格：跌了，手里的外币就值钱' },
];
export const ASSET_ROWS = [
  { id: 'b1', stage: '③④ B1 加息', cells: { cash: '⬆', bond: '⬇', equity: '⬇/—', house: '⬇', gold: '—', fx: '⬆' } },
  { id: 'cut', stage: '④→① 降息捷径', cells: { cash: '⬇', bond: '⬆（最先）', equity: '⬆', house: '⬆（滞后）', gold: '—', fx: '⬇' } },
  { id: 'b2', stage: '⑤ B2 缩水', cells: { cash: '⬆', bond: '⬆⬆', equity: '⬇', house: '⬇⬇', gold: '⬆', fx: '对内⬆ 对外⬇' } },
  { id: 'l6', stage: '⑥ 接手 + 印钱', cells: { cash: '⬇', bond: '⬆', equity: '⬆', house: '慢升', gold: '⬆', fx: '⬇' } },
  { id: 'l7', stage: '⑦ 金融压制', cells: { cash: '⬇⬇', bond: '⬇（实际）', equity: '名义⬆', house: '⬆', gold: '⬆⬆', fx: '⬇' } },
  { id: 'A', stage: 'A 失去信心', cells: { cash: '—', bond: '⬇⬇', equity: '⬇', house: '—', gold: '⬆⬆', fx: '⬇⬇' } },
  { id: 'C', stage: 'C 生产率强', cells: { cash: '—', bond: '—', equity: '⬆', house: '—', gold: '—', fx: '长期⬆' } },
];

// Japan 1985-2020 from JST R6 (annual). equity = price index from eq_capgain, 1989 = 100; credit = (thh + tbus) / gdp, %;
// houseReal = hpnom / cpi, 1991 = 100; gMinusR = nominal GDP growth − ltrate, pp. Same formulas as dalio_432/closeout/scripts/japan_exit_signals.py.
export const JPN_JST = {
  from: 1985,
  equity: [39.8, 52, 76.3, 83.2, 100, 86.4, 72.6, 53.1, 59.6, 63, 53.9, 62.6, 54.1, 45.5, 54.4, 60.4, 46.7, 38.3, 36.1, 44.7, 51.1, 64.3, 65.2, 46.5, 34.1, 34.7, 32.4, 30.3, 51.3, 55.8, 61.1, 60.1, 71.7, 59.5, 68.8, 72.6],
  credit: [77.9, 90.2, 93.6, 93.3, 94.9, 94.1, 92.1, 91.8, 106.2, 100.9, 99.7, 97.6, 96.4, 96.4, 96.3, 91.8, 88.5, 85.1, 81.2, 77.9, 77, 77.4, 77.1, 80.6, 84.8, 81.1, 82.8, 83.3, 83.3, 83.7, 82.6, 84.3, 85.1, 86.8, 88.5, 98.1],
  houseReal: [73.2, 74.3, 77.5, 83.4, 86.1, 94.1, 100, 96, 90, 86.8, 85.6, 83.9, 81.2, 79.5, 77.7, 75.4, 73, 70.3, 67.1, 62.8, 59.6, 57.2, 56.3, 55.1, 52.7, 54.3, 54.9, 54.5, 55.6, 55, 55.8, 57.1, 58.3, 58.8, 59.5, 59.6],
  gMinusR: [1.1, -0.3, -0.2, 3.2, 2.7, 0.6, -0.5, -2.5, -3.1, 1.9, -0.4, 0.4, -0.2, -2.4, -3.3, -0.4, -2, -2.6, -1.1, -0.5, -0.8, -1.2, -0.9, -3.6, -7.6, 1, -2.7, -0.2, 0.9, 1.5, 3.4, 1.2, 1.5, 0.5, 0.5, -3.6],
};
// The exit signals of the B2 path (handover §5). year = the year the signal turned (trough / first of a 3-year run / first quarter of a run ≥ 2%).
export const JPN_SIGNALS = [
  { id: 'credit', year: 2005, name: '私人信贷/GDP 见底', why: '⑤ 私人还债结束', series: 'credit', src: 'JST' },
  { id: 'house', year: 2009, name: '实际房价见底', why: 'B2 不再漏水', series: 'houseReal', src: 'JST' },
  { id: 'gr', year: 2013, name: '名义增长 > 长端利率', why: '⑦ 债务开始变轻', series: 'gMinusR', zero: true, src: 'JST' },
  { id: 'cpi', year: 2022, name: '通胀确认（≥ 2% 不再掉回去）', why: '通缩结束', series: null, src: '日本季度 CPI（repo）' },
];

// the toy formulas of the real-rate panel (shown on screen next to the chart)
export const TOY = { r0: 0.01, bondYears: 10, goldYears: 20, erp: 0.05, growth: 0.015, rMin: -0.02, rMax: 0.05 };

export const LESSON_INVESTOR = {
  id: 'inv', kind: 'capstone', label: '毕业课',
  title: '投资者',
  oneLine: '把整门课收成一套动作：五个表定位置 → 查资产反应表 → 看贵不贵 → 等三个信号 → 配好四种货币 → 去历史盲测里练。',
  country: 'AUS',              // the learner is in Australia: the gauges read the AUS sim (its 汇率 gauge moves; the US one is the ruler itself)
  rulesOn: 'all',
  startDate: '2007Q4', endDate: '2009Q1', mode: 'history', available: true,
  steps: [
    { type: 'intro', title: '先说结论',
      text: [
        '**投资者只做三件事：看位置、查表、等信号。**',
        '你不用猜明天下不下雨。你要知道的是：水库现在在哪个水位，闸门往哪边开，然后决定把水存在哪个池子里。',
        '下面分 7 步：五个表 → 资产反应表 → 实际利率 → 贵不贵 → 三个信号 → 四种货币 → 盲测练习。',
      ],
      concept: ['longCycle', 'realRate'] },

    { type: 'watch', title: '第 1 步：五个表定位置', until: '2009Q1',
      panel: { id: 'gauges' },
      text: [
        '**结论：先定位，再动手。五个表各回答一个问题。**',
        '小周期走到哪一步？大周期在哪一站？水的价格（实际利率）是正是负？池子满不满（估值）？本币在涨还是在跌？',
        '按 ▶ 播放：澳洲从 2007Q4 走到 2009Q1，看五个表一起变。最下面一行告诉你：现在该查资产反应表的哪一行。',
      ],
      hl: ['policyRate'], concept: ['realRate'] },

    { type: 'reveal', title: '第 2 步：资产反应表',
      panel: { id: 'assetTable' },
      text: [
        '**结论：每个位置都有固定的赢家和输家。点一行，看谁亮。**',
        '「资产」页的五个池子（现金、长期国债、股票、房产、黄金）放在同一张表里，再加上本币。点表头，看每个池子的泉水从哪来。',
        '这张表是按历史事例整理的，**还没有用数据逐格验证**。把它当地图用，不要当定律。',
      ] },

    { type: 'reveal', title: '第 3 步：实际利率 = 水的价格',
      panel: { id: 'realRate', def: -0.01 },
      text: [
        '**结论：实际利率一动，国债、黄金、股票估值一起动，方向相同。**',
        '实际利率 = 政策利率 − 通胀，就是「把水存着不动」的回报。存水回报高，越远的池子越不值钱；存水回报为负，远处的池子就抢手。',
        '拖动滑块。图里的公式是**玩具**：只用来看方向和谁更敏感，不是预测。',
      ] },

    { type: 'reveal', title: '第 4 步：贵不贵',
      panel: { id: 'priced', cards: ['JPN-1989', 'JPN-2012'], extra: 'JPN-2008' },
      text: [
        '**结论：位置告诉你方向，贵不贵告诉你价格里已经装了多少水。**',
        '日本 1989：股价是股息的 223 倍，在自己的历史里排 100 分位（最高）。下一年股票（换成澳元、扣掉通胀）−37%。',
        '日本 2012：股价是股息的 46 倍，只排 3 分位。下一年 +47%。',
        '便宜不等于马上涨：2008 年日本也在 ⑥、估值 0 分位，下一年还跌了 18%。什么时候动，看下一步的信号。',
      ],
      claims: [
        { shown: '223 倍', src: 'blind', card: 'JPN-1989', path: 'view.levels.equityVal', fmt: 'x0' },
        { shown: '100 分位', src: 'blind', card: 'JPN-1989', path: 'view.pct.equityVal', fmt: 'pctile' },
        { shown: '−37%', src: 'blind', card: 'JPN-1989', path: 'reveal.ret1.equity', fmt: 'spct0' },
        { shown: '46 倍', src: 'blind', card: 'JPN-2012', path: 'view.levels.equityVal', fmt: 'x0' },
        { shown: '3 分位', src: 'blind', card: 'JPN-2012', path: 'view.pct.equityVal', fmt: 'pctile' },
        { shown: '+47%', src: 'blind', card: 'JPN-2012', path: 'reveal.ret1.equity', fmt: 'spct0' },
        { shown: '⑥', src: 'blind', card: 'JPN-2008', path: 'view.call.long', fmt: 'raw' },
        { shown: '0 分位', src: 'blind', card: 'JPN-2008', path: 'view.pct.equityVal', fmt: 'pctile' },
        { shown: '18%', src: 'blind', card: 'JPN-2008', path: 'reveal.ret1.equity', fmt: 'apct0', note: '跌了 18%' },
      ] },

    { type: 'reveal', title: '第 5 步：市场先走，亮三个信号再动',
      panel: { id: 'timeline', year: 2013 },
      text: [
        '**结论：股价在官方确认之前好几年就开始走。只亮一个信号不算数，至少亮三个再动。**',
        '日本走出 B2 的顺序：私人信贷/GDP 2005 年见底 → 实际房价 2009 年见底 → 名义增长 > 长端利率 2013 年 → 通胀确认 2022 年。',
        '股价（1989 = 100）2012 年见底，只剩 30；2020 年回到 73。2003–07 年是个假起点：只亮了一个信号，股价涨上去又跌回来。',
        '等到 2022 年通胀确认，股价已经是 2012 年低点的 2.6 倍（季度数据）。等官方确认，大部分涨幅已经兑现。拖时间轴，数每一年亮了几个信号。',
      ],
      claims: [
        { shown: '2005', src: 'jst', what: 'creditTrough' },
        { shown: '2009', src: 'jst', what: 'houseTrough' },
        { shown: '2013', src: 'jst', what: 'grRun' },
        { shown: '2022', src: 'jpnq', what: 'cpiConfirm' },
        { shown: '2012', src: 'jst', what: 'equityTroughYear' },
        { shown: '30', src: 'jst', what: 'equityAt', year: 2012 },
        { shown: '73', src: 'jst', what: 'equityAt', year: 2020 },
        { shown: '2003–07', src: 'jst', what: 'falseStart' },
        { shown: '2.6 倍', src: 'jpnq', what: 'equityMultiple' },
      ] },

    { type: 'reveal', title: '第 6 步：你的四种货币',
      panel: { id: 'fx', from: '2007Q1', until: '2010Q4', base: '2008Q2' },
      text: [
        '**结论：对澳洲人，美元和日元是危机保险。出事时澳元跌，手里的外币能换回更多澳元。**',
        '2008 年按季度平均：1 澳元从 2008Q2 的 0.94 美元跌到 2009Q1 的 0.66 美元，跌了 30%。常说的「约 35%」是按每天的最高到最低算的，这里只有季度平均。对日元跌得更多，37%；人民币当时跟着美元走，31%。',
        '保险要在火灾前买：站在 2008 年底才换美元，2009 年澳元反弹，这份美元（换回澳元、扣掉通胀）亏了 24%。',
        '你的四种货币：澳元（工资、房子、账单都在这里）、美元和日元（危机保险）、人民币（2008 年跟着美元走）。',
      ],
      claims: [
        { shown: '0.94 美元', src: 'fx', what: 'audUsd', at: '2008Q2', fmt: 'n2' },
        { shown: '0.66 美元', src: 'fx', what: 'audUsd', at: '2009Q1', fmt: 'n2' },
        { shown: '30%', src: 'fx', what: 'fall', pair: 'USD', from: '2008Q2', until: '2009Q1', fmt: 'apct0' },
        { shown: '约 35%', src: 'spec', note: '用户 spec：「The AUD fell about 35% against the USD in 2008」；repo 只有季度平均，没有日数据' },
        { shown: '37%', src: 'fx', what: 'fall', pair: 'JPY', from: '2008Q2', until: '2009Q1', fmt: 'apct0' },
        { shown: '31%', src: 'fx', what: 'fall', pair: 'CNY', from: '2008Q2', until: '2009Q1', fmt: 'apct0' },
        { shown: '24%', src: 'blind', card: 'AUS-2008', path: 'reveal.ret1.fxUSD', fmt: 'apct0', note: '亏了 24%' },
      ] },

    { type: 'reveal', title: '第 7 步：去历史盲测里练',
      panel: { id: 'blind', cards: ['USA-2006', 'USA-2009', 'AUS-2015'] },
      text: [
        '**结论：先用三张练习卡把前六步走一遍，再进历史盲测玩整副牌。**',
        '每张卡只给你那一年年底能看到的数据。按顺序做：定位置 → 查表 → 看贵不贵 → 数信号 → 配货币。三张卡正好是三种：危机前夜、转折点、平常年份。',
        '这三张没有在这一课里出现过，不会剧透。盲测页面目前没有专门的教学模式，三张就是普通卡，直接打开。',
      ] },
  ],
};
