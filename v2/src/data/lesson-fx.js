// Course v3 L6 「汇率和国境线」 (rebuilt 2026-10-29, tools/COURSE-V3.md): after 第 5 课 政府接手, before 第 7 课 八个视角 (m5).
// Australia is the worked example (it absorbs the FX part of 世界 2 and 世界 1's border / reserve steps). Order: the FX reactor (2 pipes +
// needle + anchor) -> tap through to the five forces -> trade pipes (why the trade balance barely moves FX) -> reserve currency -> the AUD
// case 2003 / 2008 / 2011 / 2025 on the reactor -> the calculator. The five fx-lab panels of the first version are optional drill-downs.
// Shape = the entries of LESSONS in src/data/lessons.js (registered there; do not import lessons.js from here).
//
// Extra fields used here (contract: tools/D-CONTRACT.md, sections 「FX」 and 「课程 v3」):
//   kind:'fx'                   own checker (tools/check_lesson_fx.mjs); numbers are typed in the text, verified by `nums`
//   step.panel { id, ... }      fx-lab panels (mountFxPanel, src/ui/fx-lab.js) or id 'fx-reactor' = the FX reactor (mountFxReactor,
//                               src/ui/fx-reactor.js): { iso, date, dates?:[...] (date chips over the reactor), forces? (drill-down open) }
//   step.drills [{ label, panel, text, nums?, facts? }]   optional drill-down buttons in the card: the panel replaces the step's panel
//                               over the diagram and the text shows in the card, until 「回到」 (src/ui/lessons.js)
//   step.map                    as in the world lessons (opens the world map with a country selected)
//   last step `ending`          the fixed 三问 block { q1, q2, q3 }, answered for the AUD case
// Never shown to the learner, only read by tools/check_lesson_fx.mjs:
//   step.nums / drill.nums [{ t, f, fmt }]   every number typed in the text (and in a drill's text, and in the ending): f(D) recomputes
//                               it from the repo's data (or the spec), formatted with fmt, must equal t. Allowed without an entry: years
//                               (19xx/20xx), quarters (2008Q3), months (N 月), step / lesson numbers.
//   step.facts / drill.facts [{ f, note }]   every non-numeric factual claim: f(D) must be true.
//   D = { q(iso,series,date), qy(iso,series,year), qavg(iso,series,from,until), audcny(year), uk(series,month), ukCsv, jpy(year),
//         w(path,year), spec, fxr(date) (computeFxReactor for AUS vs USA), fxrOf(iso,date) (the same for JPN), fit (FX_FIT, src/data/fx-fit.js),
//         usd(date) (usdIndexAt), ore(date) (iron ore), sim(iso, get, from, until?) (engine getter of src/ui/lessons-town.js evalGet, history
//         mode, that country's sim) }   (implemented in the checker)
// The reactor (AUS, JPN) reads the 1-year quarterly fit (「1 年尺度拟合，探索性」, tools/D-CONTRACT.md 「FX 1 年拟合」): 信心 = VIX, 贸易条件 =
// the ABS index (forces.tot.input; iron ore stays as forces.tot.ore), 生产率 不计入. The 2022+ hold-out does worse than 「不变」: the steps say so.
// fmt: n0 n1 n2 (decimals), pct0 pct1 (x100), pp1 (x100, 1 decimal), int, x1 (ratio, 1 decimal).

const gap = (D, d) => D.q('AUS', 'policyRate', d) - D.q('USA', 'policyRate', d);
const gapY = (D, y) => D.qy('AUS', 'policyRate', y) - D.qy('USA', 'policyRate', y);

/* ---------- drill-downs: the five forces, each with its historical example (the fx-lab panels of the first version) ---------- */
const DRILL_ANCHOR = { label: '通胀差：锚', panel: { id: 'fx-anchor' },
  text: [
    '**通胀高的国家，货币长期一定变弱。看得越长，这条规律越准。**',
    '像两个水库在漏水：通胀就是漏水。漏得快的那个，一块钱能买的东西掉得快，它的钱在国境线上也就越来越不值钱。',
    '证据（1973–2020 年，17 个国家对美元）：通胀差能解释汇率变化的比例（R²），看 1 年只有 0.05，看 5 年 0.22，看 20 年 0.75，看 40 年 0.86。',
    '所以它是**锚**：长期一定被拉回来；一两年内，汇率几乎不听它的。反应堆上那条虚线（PPP 锚）就是它。',
  ],
  nums: [
    { t: '17', f: D => D.spec.countries, fmt: 'int' },
    { t: '1', f: D => D.spec.r2[0].h, fmt: 'int' }, { t: '0.05', f: D => D.spec.r2[0].r2, fmt: 'n2' },
    { t: '5', f: D => D.spec.r2[2].h, fmt: 'int' }, { t: '0.22', f: D => D.spec.r2[2].r2, fmt: 'n2' },
    { t: '20', f: D => D.spec.r2[4].h, fmt: 'int' }, { t: '0.75', f: D => D.spec.r2[4].r2, fmt: 'n2' },
    { t: '40', f: D => D.spec.r2[5].h, fmt: 'int' }, { t: '0.86', f: D => D.spec.r2[5].r2, fmt: 'n2' },
  ],
  facts: [{ f: D => D.spec.r2.every((x, k, a) => !k || x.r2 >= a[k - 1].r2), note: 'R² 随时间单调上升（看得越长越准）' }] };

const DRILL_PIPE = { label: '利差：澳元 2001–2011', panel: { id: 'fx-pipe' },
  text: [
    '**短期里，利差是一根资本水管：哪边利率高，钱往哪边流，那边的货币变强。**',
    '2001 年第三季度，1 澳元只换 0.51 美元；2011 年第二季度换到 1.06 美元，翻了一倍。同期利差（澳洲政策利率减美国）：2001 年第一季度只有 0.2 个点，2003 年平均 3.7 个点，2011 年第二季度 4.7 个点。',
    '这些年澳洲的通胀平均每年还比美国高 0.6 个点：按锚，澳元该变弱，结果反而翻倍。**短期，水管比锚有劲。**',
    '公式里这一项是 −0.6×利差：利差每高 1 个点，货币平均每年强约 0.6%。',
  ],
  nums: [
    { t: '1', f: () => 1, fmt: 'int' },
    { t: '0.51', f: D => 1 / D.q('AUS', 'fxPerUsd', '2001Q3'), fmt: 'n2' },
    { t: '1.06', f: D => 1 / D.q('AUS', 'fxPerUsd', '2011Q2'), fmt: 'n2' },
    { t: '0.2', f: D => gap(D, '2001Q1'), fmt: 'pp1' },
    { t: '3.7', f: D => gapY(D, 2003), fmt: 'pp1' },
    { t: '4.7', f: D => gap(D, '2011Q2'), fmt: 'pp1' },
    { t: '0.6', f: D => D.qavg('AUS', 'cpiYoY', '2001Q1', '2011Q4') - D.qavg('USA', 'cpiYoY', '2001Q1', '2011Q4'), fmt: 'pp1' },
    { t: '0.6', f: D => D.spec.rule.rate, fmt: 'n1' },
  ],
  facts: [
    { f: D => D.q('AUS', 'fxPerUsd', '2001Q3') / D.q('AUS', 'fxPerUsd', '2011Q2') >= 2, note: '澳元 2001Q3 → 2011Q2 翻了一倍（≥ ×2）' },
    { f: D => ['2001Q1', '2001Q2', '2001Q3', '2001Q4', '2002Q1', '2002Q2'].every(d => 1 / D.q('AUS', 'fxPerUsd', d) >= 1 / D.q('AUS', 'fxPerUsd', '2001Q3') - 0.002), note: '2001Q3 是 2001–2002 年澳元的底部（±0.002）' },
  ] };

const DRILL_PROD = { label: '生产率：日元 1985–1995', panel: { id: 'fx-prod' },
  text: [
    '**一个国家做东西的效率涨得比别人快，它的货币长期变强。**',
    '1985 年，1 美元平均换 238 日元；1995 年只换 94 日元。十年里，日元值钱到原来的 2.5 倍。日本的工厂越做越快、越做越好，外国人要买日本货，先得换日元。',
    '要说清楚：1985 年 9 月的广场协议（几个大国政府联手压美元）推了头两年一把；日本的通胀也比美国低（锚）。几股力叠在一起，这一段分不开。',
    '回归里这一项是 −0.8×生产率差：生产率每年比对方快 1 个点，货币平均每年强约 0.8%。',
  ],
  nums: [
    { t: '1', f: () => 1, fmt: 'int' },
    { t: '238', f: D => D.jpy(1985), fmt: 'n0' }, { t: '94', f: D => D.jpy(1995), fmt: 'n0' },
    { t: '2.5', f: D => D.jpy(1985) / D.jpy(1995), fmt: 'x1' },
    { t: '0.8', f: D => D.spec.rule.prod, fmt: 'n1' },
  ],
  facts: [{ f: D => Math.abs(D.spec.fit5y.prod + D.spec.rule.prod) < 0.05, note: '公式的 0.8 = 拟合的 −0.82 取整' }] };

const DRILL_TOT = { label: '贸易条件：铁矿石和澳元', panel: { id: 'fx-tot' },
  text: [
    '**卖的东西变贵（贸易条件变好），外国人要先买你的货币，货币就强；卖的东西变便宜，货币就弱。**',
    '中国盖房修路那些年，铁矿石抢手，澳元对人民币也强：2006 年 1 澳元约换 6.0 元人民币，2011 年约 6.7 元，是全年平均最高的一年。',
    '后来中国房地产放慢，铁矿石从高位回落：2025 年平均 4.63 元，2026 年 10 月约 4.65 元（本课设定的参照值）。利差那根水管也关上了：从 2011 年的 4.7 个点缩到 2025 年底的负数。',
    '铁矿石价格本身只看方向。计算器里的 k 没有拟合，你自己拖；汇率闸上的贸易条件用 ABS 贸易条件指数（整篮出口价比进口价），有拟合出来的大小。',
  ],
  nums: [
    { t: '1', f: () => 1, fmt: 'int' },
    { t: '6.0', f: D => D.audcny(2006), fmt: 'n1' }, { t: '6.7', f: D => D.audcny(2011), fmt: 'n1' },
    { t: '4.63', f: D => D.audcny(2025), fmt: 'n2' },
    { t: '4.65', f: D => D.spec.scen.audcny.spot, fmt: 'n2' },
    { t: '4.7', f: D => gap(D, '2011Q2'), fmt: 'pp1' },
  ],
  facts: [
    { f: D => [2006, 2011].every(y => Math.abs(D.audcny(y) - D.spec.audcnyRef.find(r => r.at === y).v) < 0.05), note: '数据算出的 2006 / 2011 年平均与设定值 6.0 / 6.7 相差 < 0.05' },
    { f: D => { for (let y = 2001; y <= 2025; y++) if (D.audcny(y) > D.audcny(2011) + 1e-9) return false; return true; }, note: '2011 年是 2001–2025 年澳元/人民币全年平均最高的一年' },
    { f: D => gap(D, '2025Q4') < 0, note: '2025 年底利差（澳洲 − 美国）为负' },
  ] };

const DRILL_CONF = { label: '信心：英国 2022', panel: { id: 'fx-conf' },
  text: [
    '**平时利率高 → 货币强。没了信心就反过来：国债和货币一起被卖，利率涨、货币反而跌。这就是公式里的 RP（风险溢价）。**',
    '2022 年 9 月，英国新政府宣布大规模减税，却没说钱从哪来。市场抛英国国债：10 年期国债利率从 8 月的 2.3% 跳到 9 月的 3.5%、10 月的 4.1%（月平均）。一个月跳 1.2 个点，是 1980 年以来最大的单月跳涨。',
    '按利差，英镑该变强。结果相反：1 英镑从 8 月的 1.20 美元跌到 9 月的 1.13 美元。英国央行出手买国债，首相下台，到 12 月英镑回到 1.22 美元。',
    '像坝上出了裂缝：库里水位（利率）再高，人们也先往外撤。**利率一下子跳上去、货币同时急跌**，多半是信心在漏。',
  ],
  nums: [
    { t: '10', f: () => 10, fmt: 'int' },
    { t: '2.3', f: D => D.uk('gilt10y', '2022-08'), fmt: 'n1' }, { t: '3.5', f: D => D.uk('gilt10y', '2022-09'), fmt: 'n1' },
    { t: '4.1', f: D => D.uk('gilt10y', '2022-10'), fmt: 'n1' },
    { t: '1.2', f: D => D.uk('gilt10y', '2022-09') - D.uk('gilt10y', '2022-08'), fmt: 'n1' },
    { t: '1', f: () => 1, fmt: 'int' },
    { t: '1.20', f: D => D.uk('usdPerGbp', '2022-08'), fmt: 'n2' }, { t: '1.13', f: D => D.uk('usdPerGbp', '2022-09'), fmt: 'n2' },
    { t: '1.22', f: D => D.uk('usdPerGbp', '2022-12'), fmt: 'n2' },
  ],
  facts: [
    { f: D => { const r = D.ukCsv('IRLTLT01GBM156N.csv').filter(x => x[0] >= '1980-01'); let best = null, m = -1e9; for (let k = 1; k < r.length; k++) { const d = r[k][1] - r[k - 1][1]; if (d > m) { m = d; best = r[k][0]; } } return best === '2022-09'; }, note: '2022-09 是 1980 年以来英国 10 年期国债利率最大的单月跳涨' },
  ] };

export const FX_DRILLS = { anchor: DRILL_ANCHOR, pipe: DRILL_PIPE, prod: DRILL_PROD, tot: DRILL_TOT, conf: DRILL_CONF };

const AUS = 'AUS';
export const LESSON_FX = {
  id: 'fx', kind: 'fx', label: '第 6 课',
  title: '汇率和国境线',
  oneLine: '汇率是国境线上的一道闸：短期被资本管（利差 + 信心）推着走，长期被锚（通胀差）拉回来；贸易差额本身几乎推不动它。例子：澳元 2003 → 2011 → 2025。',
  rulesOn: 'all',
  startDate: '2025Q4', endDate: '2025Q4', mode: 'history', available: true,
  steps: [
    { type: 'intro', title: '先说结论', view: 'flow', hl: ['fx'],
      text: [
        '**结论：汇率是国境线上的一道闸。短期被资本管（利差 + 信心）推着走，长期被锚（通胀差）拉回来。贸易差额本身几乎推不动它。**',
        '前五课都在一个国家里面；这一课出国境。图右边那条虚线就是国境线，线上的「汇率」就是这道闸。',
        '例子用澳洲：一个卖原料（大头卖给中国）、利率常比美国高、房贷多是浮动利率的国家。几股力在它身上都看得清。',
        '下面分 6 步：汇率闸 → 五股力 → 贸易水管 → 储备货币 → 澳元三段 → 计算器。',
        '读图统一：**往右 / 往上 = 本币变强**（同样多的本币换到更多外币）。',
      ],
      concept: ['fx'] },

    { type: 'reveal', title: '第 1 步：汇率闸，两根管和一根指针', panel: { id: 'fx-reactor', iso: AUS, date: '2025Q4' }, hl: ['fx'],
      text: [
        '**结论：汇率闸被两根管推着：资本管（利差 + 信心）和商品价格管（通胀差 + 生产率 + 贸易条件）。指针是实际变了多少；两根管推不到的那一段，叫「说不清」。**',
        '图上是澳洲 2025 年第四季度：澳元对美元比一年前变强约 1%（指针）。每股力都拿 1996–2021 年的「平常」比，多出来的才算推力。',
        '资本管推弱 4.6%：澳洲利率比美国低 0.4 个点（近四季平均），平常却是高 1.7 个点；信心（VIX 恐慌指数）和平常差不多，几乎不推。商品价格管推弱 3.8%：澳洲物价多涨 1.0 个点，卖出去的东西也便宜了一点（贸易条件变差）。',
        '两根管合计推弱 8.4%，指针却在强的一边：差的 9.1% 说不清。',
        '图上标着「1 年尺度拟合，探索性」：力度是拿 1996–2021 年的季度数据拟合的。2022 年起的季度没参与拟合（保留样本，这一季就是），在那上面它猜得还不如「汇率不变」（误差 ±7% 对 ±5%）。所以它帮你读图，不做预测。',
        '虚线是 **PPP 锚**：只按两国通胀差算出的「合理」水平。今天澳元比锚便宜 11%。锚像水库的平均水位：长期会被拉回来，几年里可以离它很远。',
        '美国是基准：美元对美元没有汇率，所以澳洲是我们的例子。',
      ],
      nums: [
        { t: '1', f: D => D.fxr('2025Q4').actual, fmt: 'n0' },
        { t: '4.6', f: D => -D.fxr('2025Q4').pipes.cap.c, fmt: 'n1' },
        { t: '0.4', f: D => -D.fxr('2025Q4').forces.rate.input / 100, fmt: 'pp1' },
        { t: '1.7', f: D => D.fxr('2025Q4').forces.rate.mean, fmt: 'n1' },
        { t: '3.8', f: D => -D.fxr('2025Q4').pipes.goods.c, fmt: 'n1' },
        { t: '1.0', f: D => D.fxr('2025Q4').forces.infl.input, fmt: 'n1' },
        { t: '8.4', f: D => -D.fxr('2025Q4').model, fmt: 'n1' },
        { t: '9.1', f: D => D.fxr('2025Q4').unexplained, fmt: 'n1' },
        { t: '1', f: D => parseInt(D.fxr('2025Q4').fit.label, 10), fmt: 'int' },
        { t: '7', f: D => D.fxr('2025Q4').fit.rmseHold, fmt: 'n0' },
        { t: '5', f: D => D.fxr('2025Q4').fit.rmseHoldZero, fmt: 'n0' },
        { t: '11', f: D => -D.fxr('2025Q4').anchor.value, fmt: 'n0' },
      ],
      facts: [
        { f: D => D.fxr('2025Q4').actual > 0, note: '2025Q4 澳元比一年前变强（指针在强的一边）' },
        { f: D => { const F = D.fxr('2025Q4').forces; return F.rate.input < 0 && F.rate.mean > 0 && F.rate.c < 0 && D.fxr('2025Q4').pipes.cap.c < 0; }, note: '澳洲利率比美国低、平常（1996–2021）是高 → 利差推弱，资本管推弱' },
        { f: D => Math.abs(D.fxr('2025Q4').forces.conf.c) < 0.5, note: '信心（VIX）和平常差不多，几乎不推（< 0.5%）' },
        { f: D => { const F = D.fxr('2025Q4').forces; return F.infl.input > 0 && F.infl.c < 0 && F.tot.input < 0 && F.tot.c < 0 && D.fxr('2025Q4').pipes.goods.c < 0; }, note: '澳洲物价多涨、贸易条件比一年前变差 → 商品价格管推弱' },
        { f: D => D.fxr('2025Q4').model < 0 && D.fxr('2025Q4').unexplained > 0, note: '拟合推弱，指针却在强的一边：说不清为正' },
        { f: D => { const F = D.fxr('2025Q4').fit; return F.label === '1 年尺度拟合，探索性' && F.fitFrom === '1996Q1' && F.fitTo === '2021Q4' && F.holdFrom === '2022Q1' && F.hold === true; }, note: '标签原文；拟合 1996–2021，2022 起保留样本，2025Q4 在保留样本里' },
        { f: D => D.fxr('2025Q4').fit.rmseHold > D.fxr('2025Q4').fit.rmseHoldZero, note: '保留样本上拟合的误差比只猜「不变」大' },
        { f: D => D.fxr('2025Q4').anchor.value < 0, note: '比 PPP 锚便宜' },
      ],
      concept: ['fx'] },

    { type: 'reveal', title: '第 2 步：五股力，各管多久', panel: { id: 'fx-reactor', iso: AUS, date: '2025Q4', forces: true }, hl: ['fx'],
      drills: [DRILL_ANCHOR, DRILL_PIPE, DRILL_PROD, DRILL_TOT, DRILL_CONF],
      text: [
        '**结论：点任意一根管，它就拆成五股力。五股力管的时间不一样：信心几天就翻，利差几个季度，贸易条件跟着商品周期，生产率和通胀差要十年以上。**',
        '图里已经拆开了：资本管 = 利差 + 信心，商品价格管 = 通胀差 + 生产率 + 贸易条件。每一行写着今天推多少。澳洲（和日本）的信心用 VIX（恐慌指数）量，贸易条件用 ABS 贸易条件指数（日本用油价）；生产率试过，放进去保留样本猜得更差，所以写「不计入」。别的国家没有这些数据，就老实写「没有数据」。',
        '想看每股力的历史证据，点下面的按钮（可选）：图会换成那股力的例子，看完点「回到汇率闸」。',
      ],
      facts: [
        { f: D => { const F = D.fxr('2025Q4').forces; return Number.isFinite(F.conf.c) && Number.isFinite(F.tot.c) && F.tot.src === 'abs' && D.fit.countries.AUS.vix.startsWith('vix'); }, note: '澳洲：信心（VIX）和贸易条件（ABS 指数）都有拟合的推力' },
        { f: D => D.fxrOf('JPN', '2025Q4').fit && D.fxrOf('JPN', '2025Q4').forces.tot.src === 'oil', note: '日本也是拟合的，贸易条件用油价' },
        { f: D => { const F = D.fxr('2025Q4').forces.prod; return F.skipped === true && F.c === null && /不计入/.test(F.note); }, note: '生产率：不计入' },
        { f: D => ['AUS', 'JPN'].every(k => D.fit.countries[k].tried.prod.rmseHold > D.fit.countries[k].stats.rmseHold), note: '生产率放进去，保留样本的误差变大（AUS、JPN 都是）' },
        { f: D => ['GBR', 'EA', 'CHN'].every(k => !D.fit.countries[k]), note: '别的国家（英国、欧元区、中国）没有拟合' },
      ],
      concept: ['fx', 'riskPremium'] },

    { type: 'reveal', title: '第 3 步：贸易水管，为什么推不动汇率', map: { open: true, select: AUS, year: 2011 }, hl: ['exports', 'imports'],
      text: [
        '**结论：贸易水管很粗，可贸易差额本身几乎推不动汇率。17 个国家 1973–2020 年的 5 年回归里，经常账户这一项约等于 0。**',
        '地图上选中了澳洲（2011 年）：那一年澳洲卖给中国 74 十亿美元，2003 年只有 6 十亿美元，翻了十几倍。',
        '可 2001–2011 年，澳洲**每一年都是逆差**（经常账户为负，最深的 2007 年约占 GDP 的 6.7%）。按「逆差 → 货币弱」，澳元该变弱；它却翻了一倍。',
        '为什么：每一笔货款背后都有一笔反向的钱。买得多、卖得少，差额要靠外国人把钱借进来（资本水管）；钱进来也要先买本币。两边抵掉，剩下的推力就小了。',
        '真正推汇率的是**贸易条件**（卖的东西贵不贵：价格），不是贸易差额（卖了多少：数量）。价格那一股，在上一步的五股力里。',
      ],
      nums: [
        { t: '17', f: D => D.spec.countries, fmt: 'int' }, { t: '5', f: D => D.spec.r2[2].h, fmt: 'int' }, { t: '0', f: D => D.spec.fit5y.ca, fmt: 'int' },
        { t: '74', f: D => D.w('trade.AUS.CHN', 2011), fmt: 'n0' }, { t: '6', f: D => D.w('trade.AUS.CHN', 2003), fmt: 'n0' },
        { t: '6.7', f: D => -D.w('countries.AUS.currentAccountGdp', 2007), fmt: 'pct1' },
      ],
      facts: [
        { f: D => { const r = D.w('trade.AUS.CHN', 2011) / D.w('trade.AUS.CHN', 2003); return r >= 10 && r < 20; }, note: '澳洲 → 中国 2011 / 2003 = 十几倍' },
        { f: D => { for (let y = 2001; y <= 2011; y++) if (!(D.w('countries.AUS.currentAccountGdp', y) < 0)) return false; return true; }, note: '澳洲经常账户 2001–2011 年每年为负' },
        { f: D => { let m = 0, my = 0; for (let y = 2001; y <= 2011; y++) { const v = -D.w('countries.AUS.currentAccountGdp', y); if (v > m) { m = v; my = y; } } return my === 2007; }, note: '2001–2011 年逆差最深的是 2007 年' },
        { f: D => D.q('AUS', 'fxPerUsd', '2001Q3') / D.q('AUS', 'fxPerUsd', '2011Q2') >= 2, note: '澳元同期翻了一倍' },
        { f: D => D.spec.fit5y.ca === 0, note: '5 年回归：经常账户系数 ≈ 0（spec）' },
      ],
      concept: ['exports', 'imports', 'fx'] },

    { type: 'reveal', title: '第 4 步：储备货币，美国为什么能一直逆差', map: { open: true, select: 'USA', year: 2025 }, hl: ['reserveCurrency', 'foreignBonds'],
      text: [
        '**结论：全世界都要存美元当备用水，美国就能长期买得多、卖得少，美元也不用靠高利率撑着。**',
        '地图上选中了美国。1995 到 2025 年，美国的经常账户每一年都是逆差，最深的 2006 年约占 GDP 的 5.8%。',
        '美元没有因此变弱，因为各国央行的储备里美元占一大半：2025 年约 57%，欧元只有 20%。',
        '钱是这样转回来的：别国卖货给美国换来美元，再买美国国债存起来。中国手里的美国国债，2007 年底 478 十亿美元，2008 年底 727 十亿美元。贸易水管流出去的美元，又从资本水管流回美国。',
        '代价是全靠信心：美元的储备份额最高时（1999 年）有 71%，现在一点点往下走；英国 2022（信心那一股）说明，信心一松，这根水管会反着流。',
      ],
      nums: [
        { t: '5.8', f: D => -D.w('countries.USA.currentAccountGdp', 2006), fmt: 'pct1' },
        { t: '57', f: D => D.w('reserves.USD', 2025), fmt: 'pct0' }, { t: '20', f: D => D.w('reserves.EUR', 2025), fmt: 'pct0' },
        { t: '478', f: D => D.w('ustForeign.CHN', 2007), fmt: 'n0' }, { t: '727', f: D => D.w('ustForeign.CHN', 2008), fmt: 'n0' },
        { t: '71', f: D => D.w('reserves.USD', 1999), fmt: 'pct0' },
      ],
      facts: [
        { f: D => { for (let y = 1995; y <= 2025; y++) if (!(D.w('countries.USA.currentAccountGdp', y) < 0)) return false; return true; }, note: '美国经常账户 1995–2025 年每年为负' },
        { f: D => { let m = 0, my = 0; for (let y = 1995; y <= 2025; y++) { const v = -D.w('countries.USA.currentAccountGdp', y); if (v > m) { m = v; my = y; } } return my === 2006; }, note: '逆差最深的是 2006 年' },
        { f: D => { let m = 0, my = 0; for (let y = 1995; y <= 2025; y++) { const v = D.w('reserves.USD', y); if (v > m) { m = v; my = y; } } return my === 1999; }, note: '美元储备份额最高在 1999 年' },
        { f: D => D.w('reserves.USD', 2025) < D.w('reserves.USD', 2015) && D.w('reserves.USD', 2015) < D.w('reserves.USD', 1999), note: '美元份额一点点往下走（1999 > 2015 > 2025）' },
        { f: D => D.w('reserves.USD', 2025) > 0.5, note: '美元占一大半（> 50%）' },
      ],
      concept: ['reserveCurrency', 'foreignBonds', 'imports'] },

    { type: 'reveal', title: '第 5 步：澳元三段：2003 → 2011 → 2025',
      panel: { id: 'fx-reactor', iso: AUS, date: '2003Q4', dates: ['2003Q4', '2008Q4', '2011Q2', '2025Q4'] }, hl: ['fx'],
      drills: [DRILL_PIPE, DRILL_TOT],
      text: [
        '**结论：澳元十年翻倍、又跌回去。推它的主要是资本管（利差 + 信心）和贸易条件；2008 年那一跌是信心。点图上的四个日期看。**',
        '**2003：起飞。**澳元比一年前变强 28%。资本管推强 13.9%：利差 3.7 个点，市场也从前一年的恐慌里平静下来（VIX 比一年前低 13 点，信心推强 9.2%）。拟合合计推强 14%，另外 14% 说不清：那一年美元自己也在变弱，对一篮子货币弱了 8%。',
        '**2008：急跌，信心断了。**澳元一个季度从 0.88 跌到 0.67 美元，比一年前弱 24%。利差还在推强（6.1%），可 VIX 这一季平均冲到 59，信心一股就推弱 21.2%，把资本管拧成推弱 15.1%。拟合推弱 16.3%，只剩 8% 说不清（第 7 课细看）。',
        '**风险货币和避险货币：**同一季，日元比一年前反而强了 18%。同样是恐慌，信心把澳元推弱 21%，把日元推强 17%：世界一慌，钱逃回美元和日元。澳元是风险货币，日元是避险货币。',
        '澳洲没走 B2：中国刺激让出口没断，澳联储 2008Q3 到 2009Q2 降息 4.2 个点，浮动房贷当季就落到家庭身上。',
        '**2011：最贵。**1 澳元换 1.06 美元，比 PPP 锚贵 44%。资本管推强 13.1%：利差 4.5 个点（近四季平均），市场平静（信心推强 6.3%）。贸易条件也推强 3.7%：铁矿石价格是 2003 年的十几倍。',
        '**2025：回落。**下坡在 2015 年看得最清楚：2015Q2 铁矿石比一年前便宜 43%，贸易条件推弱 5.1%，澳元弱 17%。到 2025 年底，铁矿石已从高位回落，利差也变成负的：两根管一起往弱推。1 澳元换 0.66 美元，比锚便宜 11%。长期，锚把澳元从「贵 44%」拉回了「便宜 11%」。',
      ],
      nums: [
        { t: '28', f: D => D.fxr('2003Q4').actual, fmt: 'n0' },
        { t: '13.9', f: D => D.fxr('2003Q4').pipes.cap.c, fmt: 'n1' },
        { t: '3.7', f: D => D.fxr('2003Q4').forces.rate.input / 100, fmt: 'pp1' },
        { t: '13', f: D => -D.fxr('2003Q4').forces.conf.input, fmt: 'n0' },
        { t: '9.2', f: D => D.fxr('2003Q4').forces.conf.c, fmt: 'n1' },
        { t: '14', f: D => D.fxr('2003Q4').model, fmt: 'n0' },
        { t: '14', f: D => D.fxr('2003Q4').unexplained, fmt: 'n0' },
        { t: '8', f: D => -D.usd('2003Q4').chg, fmt: 'n0' },
        { t: '0.88', f: D => 1 / D.q('AUS', 'fxPerUsd', '2008Q3'), fmt: 'n2' }, { t: '0.67', f: D => 1 / D.q('AUS', 'fxPerUsd', '2008Q4'), fmt: 'n2' },
        { t: '24', f: D => -D.fxr('2008Q4').actual, fmt: 'n0' },
        { t: '6.1', f: D => D.fxr('2008Q4').forces.rate.c, fmt: 'n1' },
        { t: '59', f: D => D.fxr('2008Q4').forces.conf.vixLevel, fmt: 'n0' },
        { t: '21.2', f: D => -D.fxr('2008Q4').forces.conf.c, fmt: 'n1' },
        { t: '15.1', f: D => -D.fxr('2008Q4').pipes.cap.c, fmt: 'n1' },
        { t: '16.3', f: D => -D.fxr('2008Q4').model, fmt: 'n1' },
        { t: '8', f: D => -D.fxr('2008Q4').unexplained, fmt: 'n0' },
        { t: '18', f: D => D.fxrOf('JPN', '2008Q4').actual, fmt: 'n0' },
        { t: '21', f: D => -D.fxr('2008Q4').forces.conf.c, fmt: 'n0' },
        { t: '17', f: D => D.fxrOf('JPN', '2008Q4').forces.conf.c, fmt: 'n0' },
        { t: '4.2', f: D => D.q('AUS', 'policyRate', '2008Q3') - D.q('AUS', 'policyRate', '2009Q2'), fmt: 'pp1' },
        { t: '1', f: () => 1, fmt: 'int' },
        { t: '1.06', f: D => 1 / D.q('AUS', 'fxPerUsd', '2011Q2'), fmt: 'n2' }, { t: '44', f: D => D.fxr('2011Q2').anchor.value, fmt: 'n0' },
        { t: '13.1', f: D => D.fxr('2011Q2').pipes.cap.c, fmt: 'n1' },
        { t: '4.5', f: D => D.fxr('2011Q2').forces.rate.input / 100, fmt: 'pp1' },
        { t: '6.3', f: D => D.fxr('2011Q2').forces.conf.c, fmt: 'n1' },
        { t: '3.7', f: D => D.fxr('2011Q2').forces.tot.c, fmt: 'n1' },
        { t: '43', f: D => -D.fxr('2015Q2').forces.tot.ore, fmt: 'n0' },
        { t: '5.1', f: D => -D.fxr('2015Q2').forces.tot.c, fmt: 'n1' },
        { t: '17', f: D => -D.fxr('2015Q2').actual, fmt: 'n0' },
        { t: '0.66', f: D => 1 / D.q('AUS', 'fxPerUsd', '2025Q4'), fmt: 'n2' }, { t: '11', f: D => -D.fxr('2025Q4').anchor.value, fmt: 'n0' },
      ],
      facts: [
        { f: D => { const F = D.fxr('2003Q4').forces; return F.rate.input > 0 && F.rate.c > 0 && F.conf.input < -10 && F.conf.c > 0; }, note: '2003：利差为正推强；VIX 比一年前低 10 点以上，信心推强' },
        { f: D => Math.abs(D.fxr('2003Q4').pipes.goods.c) < 1, note: '2003：商品价格管几乎不推（< 1%）' },
        { f: D => D.usd('2003Q4').chg < 0 && D.fxr('2003Q4').unexplained > 10, note: '2003：美元指数比一年前弱，说不清的部分还大（> 10%）' },
        { f: D => { const R = D.fxr('2008Q4'), F = R.forces; return F.rate.input > 3 && F.rate.c > 0 && F.conf.c < -15 && R.pipes.cap.c < 0; }, note: '2008Q4：利差还在（> 3 个点，推强），信心推弱 > 15%，资本管整根推弱' },
        { f: D => { const F = D.fxr('2008Q4').forces; return ['rate', 'infl', 'tot'].every(k => Math.abs(F[k].c) < Math.abs(F.conf.c)); }, note: '2008Q4：信心是最大的一股力' },
        { f: D => Math.abs(D.fxr('2008Q4').unexplained) < Math.abs(D.fxr('2008Q4').model), note: '2008Q4：拟合解释了大半，说不清的是小头' },
        { f: D => { const J = D.fxrOf('JPN', '2008Q4'); return J.actual > 0 && J.forces.conf.c > 0 && D.fxr('2008Q4').forces.conf.c < 0; }, note: '2008Q4 同一季：日元变强、信心推强；澳元信心推弱' },
        { f: D => D.fit.countries.AUS.risk.startsWith('澳元是风险货币') && D.fit.countries.JPN.risk.startsWith('日元是避险货币') && D.fit.countries.AUS.coef.vix < 0 && D.fit.countries.JPN.coef.vix > 0, note: '拟合的符号：澳元是风险货币（VIX 系数 < 0），日元是避险货币（> 0）' },
        { f: D => D.w('trade.AUS.CHN', 2010) > D.w('trade.AUS.CHN', 2008), note: '中国刺激：澳洲对中国出口 2010 年比 2008 年多（出口没断）' },
        { f: D => D.sim('AUS', 'qcount:cycles.long.fork=B2', '2007Q4', '2010Q4') < 0.5, note: '澳洲模型 2008–2010 年没有 B2' },
        { f: D => { const a = D.fxr('2011Q2'); return a.anchor.value > 40; }, note: '2011Q2 比 PPP 锚贵 40% 以上' },
        { f: D => { const R = D.fxr('2011Q2'); return R.pipes.cap.c > 0 && R.forces.conf.c > 0 && R.forces.tot.c > 0; }, note: '2011Q2：资本管、信心、贸易条件都推强' },
        { f: D => { for (let i = 0; i < 4; i++) { const d = ['2011Q1', '2011Q2', '2011Q3', '2011Q4'][i]; if (1 / D.q('AUS', 'fxPerUsd', d) > 1 / D.q('AUS', 'fxPerUsd', '2011Q2') + 1e-9) return false; } return true; }, note: '2011Q2 是 2011 年澳元最贵的季度' },
        { f: D => { const r = D.ore('2011Q2') / D.ore('2003Q4'); return r >= 10 && r < 20; }, note: '铁矿石 2011Q2 / 2003Q4 = 十几倍' },
        { f: D => { const R = D.fxr('2015Q2'), F = R.forces; return R.actual < 0 && F.tot.ore < 0 && F.tot.c < 0 && ['rate', 'conf', 'infl'].every(k => F[k].c > F.tot.c); }, note: '2015Q2：铁矿石比一年前便宜，贸易条件是推弱最多的一股' },
        { f: D => D.ore('2025Q4') < D.ore('2011Q2') * 0.7, note: '2025 年铁矿石比 2011 年高位低三成以上（从高位回落）' },
        { f: D => gap(D, '2025Q4') < 0 && D.fxr('2025Q4').pipes.cap.c < 0 && D.fxr('2025Q4').pipes.goods.c < 0, note: '2025 年底利差为负，两根管都往弱推' },
        { f: D => D.fxr('2025Q4').anchor.value < 0, note: '2025：比锚便宜' },
      ],
      concept: ['fx', 'exports'] },

    { type: 'reveal', title: '第 6 步：计算器，10 年后的人民币', panel: { id: 'fx-calc', preset: 'usdcny' }, hl: ['fx'], next: 'm5',
      text: [
        '**结论：把五股力加起来，就能粗算 10 年后的汇率。它给方向和量级，不给精确数字。**',
        '公式：Δs ≈ 1.0·(π−π*) − 0.6·(i−i*) − 0.8·(g−g*) − k·ΔToT + RP。这里 s 是一份外币换多少人民币，**s 变大 = 人民币变弱**；带 * 的是外国。注意：这和图里「往上 = 本币强」正好相反。',
        '中国是追赶型经济：生产率快，有一大块是追赶，不全变成货币升值，所以 g 的系数缩到约 0.3 倍。',
        '两个情景（2026 年 10 月）：美元/人民币现在约 6.71，研究的基准是 10 年后约 6.0（区间 5.2–7.0）；澳元/人民币现在约 4.65，基准约 4.0（区间 3.4–4.6）。用按钮切换，拖滑块看每股力推多少。滑块的默认值是假设，旁边标了今天的真实读数。',
        '**老实说：**这是粗算。5 年的回归把几股力都放进去，也只能解释约三成（R² 0.32）；看 1 年，通胀差只能解释 5%。用它判断方向和量级，别拿它预测明年。',
        '下一课「同一个季度，八个视角」：停在 2008Q3，看八个角色各看到什么；外国人那一张，会回到澳洲的汇率闸。',
      ],
      nums: [
        { t: '10', f: D => D.spec.horizon, fmt: 'int' },
        { t: '1.0', f: D => D.spec.rule.infl, fmt: 'n1' }, { t: '0.6', f: D => D.spec.rule.rate, fmt: 'n1' }, { t: '0.8', f: D => D.spec.rule.prod, fmt: 'n1' },
        { t: '0.3', f: D => D.spec.catchUpG, fmt: 'n1' },
        { t: '6.71', f: D => D.spec.scen.usdcny.spot, fmt: 'n2' }, { t: '6.0', f: D => D.spec.scen.usdcny.mid, fmt: 'n1' },
        { t: '5.2', f: D => D.spec.scen.usdcny.lo, fmt: 'n1' }, { t: '7.0', f: D => D.spec.scen.usdcny.hi, fmt: 'n1' },
        { t: '4.65', f: D => D.spec.scen.audcny.spot, fmt: 'n2' }, { t: '4.0', f: D => D.spec.scen.audcny.mid, fmt: 'n1' },
        { t: '3.4', f: D => D.spec.scen.audcny.lo, fmt: 'n1' }, { t: '4.6', f: D => D.spec.scen.audcny.hi, fmt: 'n1' },
        { t: '5', f: D => D.spec.r2[2].h, fmt: 'int' }, { t: '0.32', f: D => D.spec.r2Full5y, fmt: 'n2' },
        { t: '1', f: D => D.spec.r2[0].h, fmt: 'int' }, { t: '5', f: D => D.spec.r2[0].r2, fmt: 'pct0' },
        { t: '44', f: D => D.fxr('2011Q2').anchor.value, fmt: 'n0' },
      ],
      facts: [
        { f: D => D.spec.r2Full5y > 0.25 && D.spec.r2Full5y < 0.35, note: '「约三成」= R² 0.32' },
        { f: D => ['2003Q4', '2011Q2'].every(d => /^收紧/.test(D.sim('AUS', 'start:cycles.short.label', d, d))), note: '三问②：澳洲 2003Q4、2011Q2 小周期在「收紧（加息）」' },
        { f: D => D.sim('AUS', 'start:cycles.short.phase', '2025Q4', '2025Q4') === 'ease' && gap(D, '2025Q4') < 0, note: '三问②：澳洲 2025Q4 在「降息」，利差为负' },
        { f: D => D.fxr('2008Q4').forces.conf.c < -20, note: '三问①：2008 年信心一断（信心推弱 > 20%）' },
      ],
      // the fixed 三问 (tools/COURSE-V3.md), answered for this lesson's example: the AUD 2003 → 2011 → 2025
      ending: {
        q1: '水的问题还是河道的问题？国境线上的水：2003–2011 年利差和铁矿石把外面的钱引进澳洲（水多了，澳元强）；2008 年信心一断，水先逃回美元。',
        q2: '环上哪一步？利差跟着小周期走：2003、2011 年澳洲都在「收紧（加息）」，利差大、澳元强；2025 年在「降息」，利差变负。',
        q3: '谁赢谁输、钱放哪？2011 年澳元比锚贵 44%：那时把澳元换成外币的人赢，在顶部买澳元资产的外国人输。本币比锚贵很多时，留一份外币（判断）。',
      },
      concept: ['fx', 'riskPremium'] },
  ],
};

export default LESSON_FX;
