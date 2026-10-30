// 专题 lesson 「专题：预期」 (?lesson=exp; user-approved design 2026-10-30). NOT part of the 8-lesson main line: not in COURSE / LESSON_ORDER,
// no layer, not counted in the menu's 「8 课」. Registered by src/ui/lessons.js (TOPIC_LESSONS) and listed in the menu under 「专题」.
// Slimmed 2026-10-30 (user-approved): the BASIC part (the ruler ▶ / ▼ / ▽, the band, 开阀 / 结账, the five places, the loop) moved into
// lesson L3 (m2, src/data/lessons.js), which mounts the same exp-* panels by id. This 专题 keeps only the advanced part, 7 steps:
//   0 intro (先学完第 3 课; recap ruler)  1 the rope toy  2 沃尔克 / 日本  3 资产池没有绳  4 汇率上的绳  5 四条规律  6 三问
// Step index = the `?lesson=exp&step=N` link target: L6 (src/data/lesson-fx.js lessonLink) points at 4 「汇率上的绳」.
// EXP_FIVE / EXP_HIST stay here (used by the L3 panels and by the 四条规律 / 三问 numbers).
// Idea: expectations need no new part. They are the LOWER end of 吸力 on one vertical gauge (src/ui/exp-gauge.js):
//   ▶ = nominal policy rate (rates.policy)   ▽ (hollow) = 大家心里的涨价速度 (macro.inflationExp = S.piE)   ▼ (filled) = 物价比一年前 (macro.inflation)
//   吸力 = ▶ − ▽ (band: blue = 存湖划算 / 抽水贵, red = the opposite)   调度线 = the target (cp.piTarget); ▽ hangs from it on a rope:
//   taut = 锚住, slack = S.dean (脱锚), thickness = the anchor param of hh_infl_deanchor (AUS ≈ 2.7 × US).
// Three rules: R1 开阀看 ▽，结账看 ▼   R2 ▽ 慢慢追 ▼ (down at half speed)   R3 只有绳拴得住 ▽ (asset pools have no rope).
//
// Step fields (src/ui/lessons.js):
//   panel { id: 'exp-*', ... }   mounts mountExpPanel (src/ui/exp-gauge.js) over the diagram column; ids: exp-ruler exp-hist exp-five exp-loop
//                                exp-rope exp-story exp-pool exp-sum
//   vals  [{ key, get, fmt, from, until }]   live engine numbers ({key} placeholders), as in src/data/lessons.js
//   derive [{ key, a, b, fmt }]   raw[key] = raw[a] − raw[b] (filled right after vals; src/ui/lessons.js)
// Never shown, only read by tools/check_lesson_exp.mjs:
//   nums  [{ t, f(D), fmt }]   every typed number / quarter in the text that is not a placeholder: f(D) recomputes it (D: see the checker)
//   facts [{ f(D), note }]     every non-numeric claim
// Wording: the banned words are listed in tools/check_lesson_exp.mjs (section 2); 比一年前 / 比上季 only; 怕 stays the lake's 浪 (not on the gauge).

// Story numbers that are NOT in the repo (well-known approximate history; the text says 约 / 大致). Everything else is computed.
export const EXP_STORY = {
  hookRate: 0.05,          // the hypothetical 5% of the opening question
  cpi1980: 0.135,          // US CPI-U, 1980 annual average (BLS): 13.5%
  volckerPolPeak: 0.19,    // effective federal funds rate, monthly peak 1981 (~19.1%)
  volckerU: 0.108,         // US unemployment peak, Nov–Dec 1982 (10.8%)
  japanExpShown: -0.002,   // Japan ▽ before 2013: drawn just below 0 (示意; no series in the repo)
  japanFrom: '1999Q1', japanUntil: '2012Q4',
};

// the US model replay the history panels scrub through
export const EXP_HIST = { from: '2020Q1', until: '2023Q4' };

// panel exp-five 「吸力一变，哪里跟着动」 (now in L3): each place lights at the first quarter, at or after the band turns blue (▶ − ▽ > 0), where its change vs a
// year ago crosses the threshold. The ORDER is computed from the engine replay (exp-gauge.js fiveTurns), never typed here.
export const EXP_FIVE = {
  from: '2021Q1', until: '2024Q4',
  places: [
    { id: 'pump', name: '银行泵', what: '新放贷比一年前', get: 'loanYoY', th: -0.10, dir: '<=', fmt: 'chg0' },
    { id: 'lake', name: '现金湖', what: '储蓄率', get: 'savD', th: 0.005, dir: '>=', fmt: 'pct', also: 'sav' },
    { id: 'pool', name: '资产池', what: '长期国债比一年前', get: 'bondYoY', th: -0.05, dir: '<=', fmt: 'chg0', also: 'eqYoY' },
    { id: 'river', name: '河断面', what: '失业率', get: 'uD', th: 0.005, dir: '>=', fmt: 'pct', also: 'u' },
  ],
};

// step 1 toy (panel exp-rope): the ▼ paths (push = the 河溢 / oil part added to ▽ in the engine's price equation, per quarter, from..until) and the ropes
export const EXP_TOY = {
  quarters: 64,
  paths: [
    { id: 'calm', name: '平稳', push: 0, from: 0, until: 0 },
    { id: 'oil', name: '油价冲击', push: 0.05, from: 4, until: 8 },
    { id: 'heat', name: '多年过热', push: 0.015, from: 4, until: 44, note: '像 1966–1980：十年河溢' },
  ],
  ropes: [
    { id: 'USA', name: '美国' },
    { id: 'AUS', name: '澳洲' },
    { id: 'cut', name: '剪断', base: 'USA' },
  ],
};

// step 3 toy (panel exp-pool): an asset pool with no rope. price = 泉眼 ÷ max(floor, 吸力 + 怕 − 涨速); 涨速 chases b × (price vs a year ago) at speed a.
export const EXP_POOL = { quarters: 24, suction: 0.03, fear: 0.03, jumpAt: 4, jump: 0.05, b: 0.1, a: 0.5, floor: 0.025, ceil: 0.15 };

const Q = d => `${d.slice(0, 4)} 年第${'一二三四'[+d[5] - 1]}季度`;
export const qText = Q;
const W = { from: '2019Q4', until: '2023Q4' };   // vals window: base 2019Q4, history 2020Q1..2023Q4
const at = (d, path, key, fmt = 'pct') => ({ key, get: `at:${d}:${path}`, fmt, ...W });

export const LESSON_EXP = {
  id: 'exp', kind: 'topic', label: '专题', badge: '预',
  title: '专题：预期',
  question: '▽ 什么时候拴得住，拴不住会怎样？',
  oneLine: '先学完第 3 课。进阶：只有绳拴得住 ▽；绳松了，涨价拖很多年；资产池和浮动汇率没有绳，会冲过头。不在 8 课主线里，随时可看。',
  rulesOn: 'all',
  startDate: '2023Q4', endDate: '2023Q4', mode: 'history', available: true,
  steps: [
    { type: 'intro', title: '问题：▽ 什么时候拴得住？', panel: { id: 'exp-hist', marks: ['p', 'm', 'e'], band: 'split', date: '2022Q4' },
      vals: [
        at('2022Q4', 'rates.policy', 'p22'), at('2022Q4', 'macro.inflation', 'm22'), at('2022Q4', 'macro.inflationExp', 'e22'),
        at('2022Q4', 'rates.realPolicy', 'real22', 'chg1'),
      ],
      derive: [{ key: 'open22', a: 'p22', b: 'e22', fmt: 'chg1' }, { key: 'sur22', a: 'm22', b: 'e22', fmt: 'pp' }],
      text: [
        '**先学完第 3 课。**吸力尺（▶ ▼ ▽）、色带、开阀和结账、五处跟着动、绕一圈，都在第 3 课里。这个专题只讲进阶。',
        '**结论：只有绳拴得住 ▽。绳松了，涨价拖很多年；资产池和浮动汇率没有绳，会冲过头。**',
        '先复习一眼尺子（模型里的美国，2022 年第四季度）：开阀 ▶ − ▽ = {open22}，色带已经蓝了；结账 ▶ − ▼ = {real22}，存钱的人还在亏；中间那截意外 ▼ − ▽ = {sur22}。',
        '下面分 6 步：绳子 → 两段历史 → 资产池没有绳 → 汇率上的绳 → 四条规律 → 三问。',
      ],
      facts: [{ f: D => { const r = D.row('2022Q4'); return r.p - r.e > 0 && r.p - r.m < 0 && r.m > r.e; }, note: '2022Q4：开阀蓝、到手红、有意外' }],
      concept: ['inflationExp', 'realRate'] },

    { type: 'reveal', title: '第 1 步：绳子：只有绳拴得住 ▽', panel: { id: 'exp-rope', path: 'heat', rope: 'USA' },
      text: [
        '**结论：▽ 慢慢追 ▼，往下追只用一半的劲；只有绳把它往调度线拉。热得太久，绳会被磨松。**',
        '玩具用的是模型里 ▽ 的同一条规则、同一组数：▽ 每季追上 ▼ 和它差距的 8%；▼ 比一年前超过 3.0%（美国）后，绳开始变松。绳的粗细 = 每季往调度线拉回的力：美国 3.6%，澳洲 10%，约 3 倍。',
        '选一条 ▼ 的路，再选一根绳，看 ▽。**绳拴住 → 一次河溢（B1），小周期就过去；绳松了 → 拖成 ⑦ + B1。**',
        '玩具里 ▽ 也会把 ▼ 往上带（模型里同样的式子：这一季的涨价 = 一半上一季 + 一半（▽ + 河溢的推力））。绳一松，▽ 推 ▼、▼ 再推 ▽：工资和物价互相追，越追越高。',
        '**绳紧：▽ 不跟涨，▶ 加一点就有吸力；绳松：▽ 跟着涨，▶ 要加很多。**下一步就是绳松了的样子（沃尔克）。',
      ],
      nums: [
        { t: '8%', f: D => D.rule('USA', 'speed'), fmt: 'pct0' },
        { t: '3.0%', f: D => D.rule('USA', 'pi'), fmt: 'pct1' },
        { t: '3.6%', f: D => D.rule('USA', 'anchor'), fmt: 'pct1' },
        { t: '10%', f: D => D.rule('AUS', 'anchor'), fmt: 'pct0' },
        { t: '约 3 倍', f: D => D.rule('AUS', 'anchor') / D.rule('USA', 'anchor'), fmt: 'about3' },
      ],
      facts: [
        { f: D => D.rule('USA', 'down') === 0.5 && D.rule('AUS', 'down') === 0.5, note: '往下追只用一半（down = 0.5）' },
        { f: D => /S\.pi = 0\.5 \* S0\.pi \+ 0\.5 \* raw/.test(D.eco) && /const raw = S0\.piE \+ gapTerm/.test(D.eco), note: '引擎的物价式：一半上一季 + 一半（▽ + 推力）' },
        { f: D => { const a = D.toy('oil', 'USA'), c = D.toy('oil', 'cut'); return a.end.e < c.end.e - 0.005; }, note: '油价冲击：有绳的 ▽ 回落，剪断的停在高处' },
        { f: D => { const u = D.toy('heat', 'USA'), a = D.toy('heat', 'AUS'); return u.end.dean > 0.9 && a.end.dean < u.end.dean && a.end.e < u.end.e; }, note: '多年过热：美国绳磨松（dean > 0.9），澳洲粗绳拉得回' },
      ],
      concept: ['inflationExp'] },

    { type: 'reveal', title: '第 2 步：两段历史：沃尔克和日本', panel: { id: 'exp-story' },
      text: [
        '**故事读法，不是模型回放。**数字是大致的历史数。',
        '**沃尔克（美国 1979–1983）：**▽ 到了约 10%（1980 年初，家庭调查）。▶ 要拉到 15–20%，色带才蓝、才把 ▽ 拖回来；到 1983 年 ▽ 回到约 3%。代价是河干：失业率冲到接近 11%（1982 年底）。',
        '**日本（2013 年以前）：**没有调度线，就没有绳。1999–2012 年 ▶ 平均约 0.2%，贴着 0；▼ 平均约 −0.3%。▽ 跟着 ▼ 掉到 0 附近，有时在 0 以下。▶ 已经到底，▶ − ▽ 还是正的，色带是蓝的：降息推不动。',
        '这是一半；另一半是吸程线（资产负债表衰退）。',
      ],
      nums: [
        { t: '约 10%（1980 年初', f: D => D.mich.at('1980Q1'), fmt: 'about10' },
        { t: '15–20%', f: D => D.story.volckerPolPeak, fmt: 'in15to20' },
        { t: '约 3%', f: D => D.mich.avg('1983Q1', '1983Q4'), fmt: 'pct0' },
        { t: '接近 11%（1982', f: D => D.story.volckerU, fmt: 'near11' },
        { t: '约 0.2%', f: D => D.jpn.avg('policyRate', D.story.japanFrom, D.story.japanUntil), fmt: 'pct1' },
        { t: '约 −0.3%', f: D => D.jpn.avg('cpiYoY', D.story.japanFrom, D.story.japanUntil), fmt: 'pct1' },
      ],
      facts: [
        { f: D => D.mich.at('1980Q1') > D.mich.avg('1983Q1', '1983Q4') + 0.05, note: '1980 年初到 1983 年，家庭调查的 ▽ 掉了 5 个点以上' },
        { f: D => { const j = D.jpn.series('cpiYoY', D.story.japanFrom, D.story.japanUntil); return j.filter(v => v < 0).length > j.length / 2; }, note: '日本 1999–2012 年过半的季度 ▼ < 0' },
        { f: D => Math.max(...D.jpn.series('policyRate', D.story.japanFrom, D.story.japanUntil)) <= 0.005, note: '日本 ▶ 一直 ≤ 0.5%（贴着 0）' },
      ],
      concept: ['B2'] },

    { type: 'reveal', title: '第 3 步：资产池没有绳', panel: { id: 'exp-pool' },
      text: [
        '**结论：资产池也有自己的 ▽：最近涨了多少，就以为还会涨多少。它没有绳，所以两头都会冲过头。**',
        '价格 ≈ 泉眼 ÷（吸力 + 怕 − 涨速）。涨速越爬越高，分母就往 0 挤，价格冲过头；涨速一停，分母弹回来，价格大跌，还会跌过头（明斯基）。',
        '怕 是湖里的浪，不在吸力尺上。图是玩具：只看形状，不是预测。',
      ],
      facts: [
        { f: D => { const p = D.pool(); return p.peak > p.p0 * 1.8 && p.trough < p.p0 * 0.7 && p.peakAt < p.troughAt; }, note: '玩具：先冲过头（> 1.8 倍），再跌过头（< 0.7 倍）' },
      ],
      concept: ['equityAsset'] },

    { type: 'reveal', title: '第 4 步：汇率上的绳', panel: { id: 'exp-gate', story: 'aud' },
      text: [
        '**结论：闸上也有一把吸力尺。▶差 = 两边的利率差；▽汇 = 大家心里以为汇率会变多少。真正推资本的是：利差 − 预期贬值。**',
        '钉住汇率 = **有绳**：▽汇 被拴在官方价上，绳的粗细 = 外汇储备 + 信誉。绳一断，▽汇 一下子跳过去，货币就崩。',
        '**故事读法：**英镑 1992：8 月 1 英镑约换 1.94 美元；9 月退出欧洲汇率机制，到 11 月只换 1.53 美元，跌了约 21%。泰铢 1997：6 月 1 美元约换 24.5 泰铢；7 月放开，到 1998 年 1 月要 53.0 泰铢，泰铢只剩一半不到（都是月平均）。',
        '浮动 = **没绳**，像资产池，会冲过头。澳元 2008：澳洲利率一度比美国高 5.2 个点，大家借美元、日元去买澳元资产，默认闸不会动；▽汇 一翻，澳元一个季度从 0.88 跌到 0.67 美元（季度平均）。',
        '加息后汇率先冲过头、再慢慢回来，叫多恩布什（1976）汇率超调。',
        '老实说：引擎里没有汇率预期；汇率闸现在用利差 + 恐慌指数代替。',
      ],
      nums: [
        { t: '1.94', f: D => D.fx.gbp('1992-08'), fmt: 'n2' }, { t: '1.53', f: D => D.fx.gbp('1992-11'), fmt: 'n2' },
        { t: '约 21%', f: D => 1 - D.fx.gbp('1992-11') / D.fx.gbp('1992-08'), fmt: 'pct0' },
        { t: '24.5', f: D => D.fx.thb('1997-06'), fmt: 'n1' }, { t: '53.0', f: D => D.fx.thb('1998-01'), fmt: 'n1' },
        { t: '5.2 个点', f: D => D.q('AUS', 'policyRate', '2008Q2') - D.q('USA', 'policyRate', '2008Q2'), fmt: 'pts1' },
        { t: '0.88', f: D => 1 / D.q('AUS', 'fxPerUsd', '2008Q3'), fmt: 'n2' }, { t: '0.67', f: D => 1 / D.q('AUS', 'fxPerUsd', '2008Q4'), fmt: 'n2' },
      ],
      facts: [
        { f: D => D.fx.thb('1998-01') / D.fx.thb('1997-06') > 2, note: '泰铢只剩一半不到：1998-01 每美元的泰铢 > 1997-06 的 2 倍' },
        { f: D => ['1992-01', '1992-02', '1992-03', '1992-04', '1992-05', '1992-06', '1992-07', '1992-08'].every(m => D.fx.gbp(m) > 1.7) && D.fx.gbp('1992-11') < 1.55, note: '英镑 1992 年 1–8 月都在 1.7 美元以上，11 月跌到 1.55 以下' },
        { f: D => D.q('AUS', 'policyRate', '2008Q2') > D.q('USA', 'policyRate', '2008Q2') + 0.04, note: '澳洲利率比美国高 4 个点以上（利差交易）' },
        { f: D => /fx: last\('fxPerUsd', t\)/.test(D.eco) && D.fxForces.map(x => x.key).join() === 'infl,rate,prod,tot,conf', note: '引擎的汇率直接读数据（没有汇率预期）；汇率闸的力只有通胀差、利差、生产率、贸易条件、信心（恐慌指数）' },
      ],
      concept: ['fx'] },

    { type: 'reveal', title: '第 5 步：背后只有四条规律', panel: { id: 'exp-laws' },
      text: [
        '**结论：整张图背后只有四条水文规律：水量平衡、按势差流动、一阶滞后、带延迟的反馈。只有一件事水不会做：预判。**',
        '表在图上。最后一行是唯一不像水的地方：放水公告一出，水不会提前动，人会。这一课的 ▽ 只记得过去，所以没有模拟央行喊话。',
        '同样四条用在汇率上：水量平衡：贸易漏出去的水，经过湖流回来；按势差流动：资本跟着吸力差走；连通器：两国物价水平要几十年才拉平（只看通胀差，看 1 年只能解释 5%，看 40 年能解释 86%；17 个国家，1973–2020 年）；绳：钉住还是浮动。',
      ],
      nums: [
        { t: '5%', f: D => D.fxSpec.r2.find(x => x.h === 1).r2, fmt: 'pct0' }, { t: '86%', f: D => D.fxSpec.r2.find(x => x.h === 40).r2, fmt: 'pct0' },
        { t: '17 个国家', f: D => D.fxSpec.countries, fmt: 'cnt' },
      ],
      facts: [{ f: D => D.fxSpec.from === 1973 && D.fxSpec.to === 2020, note: 'R² 的样本：1973–2020（FX_SPEC，和第 6 课同一组数）' }],
      concept: ['fx', 'realRate'] },

    { type: 'reveal', title: '第 6 步：三问', panel: { id: 'exp-sum', date: '2022Q4' },
      vals: [at('2022Q4', 'rates.realPolicy', 'real22', 'chg1')],
      text: [
        '**结论：预期不是新零件，是吸力的下面那一头。三条规则：开阀看 ▽，结账看 ▼；▽ 慢慢追 ▼；只有绳拴得住 ▽。**',
        '口诀再加一句：**预期看▽。**',
        '这一课没讲两件事：央行喊话（前瞻指引）：这里的 ▽ 只记得过去，听不见喊话；还有，模型里所有人共用一个 ▽，现实里每个人心里的数都不一样。',
      ],
      // the fixed 三问 (tools/COURSE-V3.md), answered for this lesson's example: the US model 2021–2023
      ending: {
        q1: '水的问题还是河道的问题？▼ 冲上去是河溢（水多、河道窄）；这一课看的是第三件事：▽ 有没有跟着走。2021–2023 年绳拴住了，▽ 只挪了一点，所以这是一次河溢，不是 1970 年代那样的长病。',
        q2: '环上哪一步？小周期在加息：▶ 追过 ▽ 那一季（2022 年第四季度）色带才转蓝，五处依次跟着动，▼ 往下走。',
        q3: '谁赢谁输、钱放哪？意外那几年欠债的赢、存钱的输：2022 年第四季度存钱到手 {real22}。钱放哪：先看 ▽ 有没有脱锚。绳拴住，涨价是一阵子，等 ▶ 追上来，存钱又划算；绳松了，涨价会拖很多年，现金和长期债券吃亏（判断）。',
      },
      nums: [{ t: '2022 年第四季度', f: D => D.five().blue, fmt: 'q' }],
      facts: [
        { f: D => { const h = D.hist(); return Math.max(...h.map(r => r.dean)) < 0.5; }, note: '三问①：2020–2023 年美国绳没松（dean < 0.5）' },
        { f: D => D.row('2022Q4').p > D.row('2021Q4').p + 0.02, note: '三问②：在加息' },
      ],
      concept: ['inflationExp', 'realRate'] },
  ],
};

export default LESSON_EXP;
