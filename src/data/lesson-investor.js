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
//                                 'jpnq' (what) | 'spec' (no data in the repo: the handover / the user's spec says so) |
//                                 'sim' (get, from, until, eq|lt|gt: an engine getter on the AUS sim, history mode; src/ui/lessons-town.js evalGet)
//   The last step's `ending` { q1, q2, q3 } (the fixed 三问 of course v3, rendered by the runner) counts as step text for `shown`.
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
// The rate on the x axis is 开阀 for assets: 10 年期利率 − ▽ (rates.gov10y − macro.inflationExp), the same as the engine's real10y
// (src/engine/economy.js: S.real10y = S.gov10y − S.piE drives bonds and gold; the P/E denominator uses gov10y − piE too). NOT the policy rate
// minus measured inflation (rates.realPolicy = 结账, what savers get). Panel 'realRate' (src/ui/investor-lab.js) shows `rateName` and puts
// its 「现在」 marker at nowRate(snap).
export const TOY = { r0: 0.01, bondYears: 10, goldYears: 20, erp: 0.05, growth: 0.015, rMin: -0.02, rMax: 0.05,
  rateName: '开阀 = 10 年期利率 − ▽', rateShort: '开阀（10 年 − ▽）' };
export const nowRate = snap => {
  const y = snap && snap.rates && snap.rates.gov10y, e = snap && snap.macro && snap.macro.inflationExp;
  return typeof y === 'number' && typeof e === 'number' && Number.isFinite(y - e) ? y - e : null;
};

// Course v3 (tools/DESIGN-v3.md): one question 「钱放哪？」, one new piece (the 湖 zoom, panel 'lake'), one example (2009: 债 → 股 → 房),
// at most 6 steps, the 三问 ending. The panels priced / timeline / fx stay in investor-lab.js (demo page, 旧版课程 at /v2/) but this
// lesson no longer uses them.
export const LESSON_INVESTOR = {
  id: 'inv', kind: 'capstone', label: '第 8 课',
  title: '投资者',
  question: '钱放哪？',
  oneLine: '钱放哪？先定位置，再看湖：水从哪根管子落进湖，哪个池子先涨。2009 年的顺序：债 → 股 → 房。',
  country: 'AUS',              // the learner is in Australia: the gauges read the AUS sim (its 汇率 gauge moves; the US one is the ruler itself)
  rulesOn: 'all',
  startDate: '2007Q4', endDate: '2009Q1', mode: 'history', available: true,
  steps: [
    { type: 'intro', title: '钱放哪？',
      text: [
        '**钱放哪？结论：看水从哪根管子落进湖。落在哪个池子，哪个池子先涨。**',
        '2009 年，钱先进国债，再进股票，最后才进房子：债 → 股 → 房。这一课看为什么是这个顺序。',
        '下面分 5 步：五个表定位置 → 查资产反应表 → 看湖 → 吸力 → 盲测练习。',
      ],
      concept: ['longCycle', 'realRate'] },

    { type: 'watch', title: '第 1 步：五个表定位置', until: '2009Q1',
      panel: { id: 'gauges' },
      text: [
        '**结论：先定位，再动手。五个表各回答一个问题。**',
        '小周期走到哪一步？大周期在哪一站？吸力（实际利率）是正是负？池子满不满（估值）？本币在涨还是在跌？',
        '按 ▶ 播放：澳洲从 2007Q4 走到 2009Q1，看五个表一起变。最下面一行告诉你：现在该查资产反应表的哪一行。',
      ],
      hl: ['policyRate'], concept: ['realRate'] },

    { type: 'reveal', title: '第 2 步：资产反应表',
      panel: { id: 'assetTable', select: 'cut' },
      text: [
        '**结论：降息那一行，国债最先涨，股票跟上，房子滞后：债 → 股 → 房。**',
        '点「④→① 降息捷径」那一行，看谁亮。点表头，看每个池子的泉眼从哪来。',
        '这张表是按历史事例整理的，**还没有用数据逐格验证**。把它当地图用，不要当定律。',
      ] },

    { type: 'reveal', title: '第 3 步：看湖',
      panel: { id: 'lake' },
      text: [
        '**结论：水从哪根管子落进湖，哪个池子就先涨。**',
        '先看图：现金湖带着吸力泵，旁边是国债、股票、房子，黄金在一边。利息、分红、租金是泉眼，从分水堰接过来。',
        '2009 年的美国：央行泵（QE）只往湖里灌，落在国债池，国债先涨；吸力低了，中间那根细管往右漂，股票跟上；银行抽水恢复得最慢，房子最后。',
        '屏幕上是**澳洲**，顺序不一样：房子比一年前还在涨。因为澳洲的地下水没跌破吸程线，降息后银行照样抽水，水直接落进房子池。顺序取决于抽水管还通不通。',
        '点「股票」：左边看吸力（稳股、成长股），右边看水量（周期股）。窄池子跳得多。',
      ] },

    // assets read 开阀 = 10 年期利率 − ▽ (L3), not 结账 = 政策利率 − ▼. Numbers: the AUS sim (lesson country), vals + derive (src/ui/lessons.js);
    // the slider starts at the same number (def = 开阀 2009Q1 on the slider's 0.25-point grid; tools/check_lesson_investor.mjs recomputes it).
    { type: 'reveal', title: '第 4 步：吸力 = 开阀（10 年期 − ▽）',
      panel: { id: 'realRate', def: 0.025 },
      vals: [
        { key: 'y10', get: 'at:2009Q1:rates.gov10y', fmt: 'pct', from: '2008Q4', until: '2009Q1' },
        { key: 'e09', get: 'at:2009Q1:macro.inflationExp', fmt: 'pct', from: '2008Q4', until: '2009Q1' },
        { key: 'real09', get: 'at:2009Q1:rates.realPolicy', fmt: 'chg1', from: '2008Q4', until: '2009Q1' },
      ],
      derive: [{ key: 'open09', a: 'y10', b: 'e09', fmt: 'chg1' }],
      text: [
        '**结论：资产看开阀：10 年期利率 − ▽。它一动，国债、黄金、股票估值一起动，方向相同。**',
        '第 3 课的规矩：开阀看 ▽，结账看 ▼。国债、黄金、股票的泉眼都在很远的将来，所以看长期的那一头：10 年期利率减 ▽（大家心里的涨价速度）。开阀大，存在湖里划算，越远的泉眼越不值钱；开阀为负，远处的池子就抢手。',
        '模型里的澳洲，2009 年第一季度：10 年期 {y10}，▽ {e09}，开阀 = {open09}。同一季政策利率 − ▼ 只有 {real09}：那是存钱的人到手的（结账），资产不看它。',
        '拖动滑块，横轴就是开阀。图里的公式是**玩具**：只用来看方向和谁更敏感，不是预测。',
      ] },

    { type: 'reveal', title: '第 5 步：去历史盲测里练',
      panel: { id: 'blind', cards: ['USA-2006', 'USA-2009', 'AUS-2015'] },
      text: [
        '**结论：先用三张练习卡把前四步走一遍，再进历史盲测玩整副牌。**',
        '每张卡只给你那一年年底能看到的数据。按顺序做：定位置 → 查表 → 看湖 → 看吸力。三张卡正好是三种：危机前夜、转折点、平常年份。',
        '这三张没有在这一课里出现过，不会剧透。盲测页面目前没有专门的教学模式，三张就是普通卡，直接打开。盲测卡问的，正是下面这三问。',
      ],
      // the fixed 三问 ending (tools/COURSE-V3.md), answered for this lesson's example: Australia 2007Q4 → 2009Q1
      ending: {
        q1: '水的问题还是河道的问题？水的问题，而且是外面的水：全世界一慌，钱先逃回美元；澳洲自己的河道没坏。',
        q2: '环上哪一步？澳洲小周期在「降息」，大周期没有走上 B2：中国的刺激加上澳联储很快降息，接住了。',
        q3: '谁赢谁输、钱放哪？手里有美元、日元的澳洲人赢：澳元对美元跌了 30%；只有澳元资产的人输。钱放哪：降息时按 债 → 股 → 房 的顺序看，平时配一份外币当保险。',
      },
      next: 'now',   // course v3: L8 hands over to L9 现在在哪 (src/data/lesson-now.js), the end of the line

      claims: [
        { shown: '30%', src: 'fx', what: 'fall', pair: 'USD', from: '2008Q2', until: '2009Q1', fmt: 'apct0' },
        { shown: '「降息」', src: 'sim', get: 'start:cycles.short.phase', from: '2009Q1', until: '2009Q1', eq: 'ease', note: '2009Q1 澳洲小周期在降息' },
        { shown: '没有走上 B2', src: 'sim', get: 'qcount:cycles.long.fork=B2', from: '2007Q4', until: '2010Q4', lt: 0.5, note: '2007Q4–2010Q4 澳洲模型没有 B2' },
      ] },
  ],
};
