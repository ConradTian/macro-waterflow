// The big lesson 「汇率」 (approved by the user 2026-10-29): after the 5-lesson main line, before 投资者. It absorbs 世界 1 (border pipes,
// China's dollars flowing back into Treasuries, the reserve pool, the AUS raw-material basin) and the FX part of 世界 2.
// Shape = the entries of LESSONS in src/data/lessons.js; the orchestrator registers it (do not import lessons.js from here).
//
// Extra fields used here (contract: tools/D-CONTRACT.md, section 「FX」):
//   kind:'fx'                   own checker (tools/check_lesson_fx.mjs); not a 'world' lesson: numbers are typed in the text, verified by `nums`
//   step.panel { id, ... }      the lesson runner calls mountFxPanel(host, step.panel) from src/ui/fx-lab.js on entry, unmountFxPanel() on leave
//   step.map                    as in the world lessons (step 6 opens the world map with the USA selected)
// Never shown to the learner, only read by tools/check_lesson_fx.mjs:
//   step.nums  [{ t, f, fmt }]  every number typed in the step's text: f(D) recomputes it from the repo's data (or the spec), formatted with fmt
//                               must equal t. Allowed without an entry: years (19xx/20xx), months (N 月), quarters, step numbers.
//   step.facts [{ f, note }]    every non-numeric factual claim (a direction, "every year", "the highest year"): f(D) must be true.
//   D = { q(iso,series,date), qy(iso,series,year), qavg(iso,series,from,until), audcny(year), uk(series,month), ukCsv, jpy(year),
//         w(path,year), spec }   (implemented in the checker; iso AUS CHN GBR JPN USA; quarterly data in src/data/countries, src/data/us-quarterly.js)
// fmt: n0 n1 n2 (decimals), pct0 pct1 (x100), pp1 (x100, 1 decimal), int, x1 (ratio, 1 decimal).

const gap = (D, d) => D.q('AUS', 'policyRate', d) - D.q('USA', 'policyRate', d);
const gapY = (D, y) => D.qy('AUS', 'policyRate', y) - D.qy('USA', 'policyRate', y);

export const LESSON_FX = {
  id: 'fx', kind: 'fx', label: '汇率',
  title: '汇率：国境线上的闸',
  oneLine: '汇率长期跟着通胀差走，短期被利差和信心拉着走。五根水管，一个公式，最后算一算 10 年后的人民币。',
  rulesOn: 'all',
  startDate: '2025Q4', endDate: '2025Q4', mode: 'history', available: true,
  steps: [
    { type: 'intro', title: '先说结论', view: 'flow', panel: { id: 'fx-frame' },
      text: [
        '**结论：汇率长期跟着通胀差走，短期被利差和信心拉着走。**',
        '汇率是国境线上的一道闸，闸两边是两个国家的水库。推这道闸的，一共五根水管：通胀差（锚）、利差（资本水管）、生产率、贸易条件（卖的东西贵不贵）、信心。',
        '图里这张表就是整课的地图：每根水管往哪边推、推多大劲、什么时候起作用。颜色全课不变。',
        '下面分 7 步：① 锚：通胀差 ② 利差：资本水管 ③ 生产率：日元 1985–1995 ④ 贸易条件：铁矿石和澳元 ⑤ 信心：英国 2022 ⑥ 储备货币：美国为什么能一直逆差 ⑦ 计算器：10 年后的人民币。',
        '读图统一：汇率线**往上 = 本币变强**（同样多的本币换到更多外币）。',
      ],
      nums: [{ t: '10', f: D => D.spec.horizon, fmt: 'int' }],
      concept: ['fx'] },

    { type: 'reveal', title: '第 1 步：锚，通胀差', panel: { id: 'fx-anchor' }, hl: ['fx'],
      text: [
        '**结论：通胀高的国家，货币长期一定变弱。看得越长，这条规律越准。**',
        '像两个水库在漏水：通胀就是漏水。漏得快的那个，一块钱能买的东西掉得快，它的钱在国境线上也就越来越不值钱。',
        '证据（1973–2020 年，17 个国家对美元）：通胀差能解释汇率变化的比例（R²），看 1 年只有 0.05，看 5 年 0.22，看 20 年 0.75，看 40 年 0.86。',
        '所以通胀差是**锚**：长期一定被拉回来；但一两年内，汇率几乎不听它的，被别的水管拉着走。下面几步就看这些水管。',
      ],
      nums: [
        { t: '17', f: D => D.spec.countries, fmt: 'int' },
        { t: '1', f: D => D.spec.r2[0].h, fmt: 'int' }, { t: '0.05', f: D => D.spec.r2[0].r2, fmt: 'n2' },
        { t: '5', f: D => D.spec.r2[2].h, fmt: 'int' }, { t: '0.22', f: D => D.spec.r2[2].r2, fmt: 'n2' },
        { t: '20', f: D => D.spec.r2[4].h, fmt: 'int' }, { t: '0.75', f: D => D.spec.r2[4].r2, fmt: 'n2' },
        { t: '40', f: D => D.spec.r2[5].h, fmt: 'int' }, { t: '0.86', f: D => D.spec.r2[5].r2, fmt: 'n2' },
      ],
      facts: [{ f: D => D.spec.r2.every((x, k, a) => !k || x.r2 >= a[k - 1].r2), note: 'R² 随时间单调上升（看得越长越准）' }],
      concept: ['fx', 'cpi'] },

    { type: 'reveal', title: '第 2 步：利差，资本水管', panel: { id: 'fx-pipe' }, hl: ['fx', 'policyRate'],
      text: [
        '**结论：短期里，利差是一根资本水管：哪边利率高，钱往哪边流，那边的货币变强。**',
        '看澳元。2001 年第三季度，1 澳元只换 0.51 美元；2011 年第二季度换到 1.06 美元，翻了一倍。',
        '同期的利差（澳洲政策利率减美国）：2001 年第一季度只有 0.2 个点，2003 年平均 3.7 个点，2011 年第二季度 4.7 个点。钱冲着高利率涌进澳洲，先得买澳元。',
        '这些年澳洲的通胀平均每年还比美国高 0.6 个点：按锚，澳元该变弱，结果反而翻倍。**短期，水管比锚有劲。**',
        '例外：2008 年第四季度全世界恐慌，钱逃回美元，澳元一个季度就从 0.88 跌到 0.67 美元，利差再大也拦不住（第 5 步讲信心）。这些年铁矿石也在涨价，澳元变强不全是利差的功劳（第 4 步）。',
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
        { t: '0.88', f: D => 1 / D.q('AUS', 'fxPerUsd', '2008Q3'), fmt: 'n2' },
        { t: '0.67', f: D => 1 / D.q('AUS', 'fxPerUsd', '2008Q4'), fmt: 'n2' },
        { t: '0.6', f: D => D.spec.rule.rate, fmt: 'n1' },
      ],
      facts: [
        { f: D => D.q('AUS', 'fxPerUsd', '2001Q3') / D.q('AUS', 'fxPerUsd', '2011Q2') >= 2, note: '澳元 2001Q3 → 2011Q2 翻了一倍（≥ ×2）' },
        { f: D => ['2001Q1', '2001Q2', '2001Q3', '2001Q4', '2002Q1', '2002Q2'].every(d => 1 / D.q('AUS', 'fxPerUsd', d) >= 1 / D.q('AUS', 'fxPerUsd', '2001Q3') - 0.002), note: '2001Q3 是 2001–2002 年澳元的底部（±0.002）' },
        { f: D => D.q('AUS', 'policyRate', '2008Q4') - D.q('USA', 'policyRate', '2008Q4') > 0.03, note: '2008Q4 利差仍 > 3 个点（利差大也拦不住）' },
      ],
      concept: ['fx', 'policyRate'] },

    { type: 'reveal', title: '第 3 步：生产率，日元 1985–1995', panel: { id: 'fx-prod' }, hl: ['fx'],
      text: [
        '**结论：一个国家做东西的效率涨得比别人快，它的货币长期变强。**',
        '1985 年，1 美元平均换 238 日元；1995 年只换 94 日元。十年里，日元值钱到原来的 2.5 倍。',
        '那些年日本的工厂越做越快、越做越好，汽车、电器卖遍全世界。外国人要买日本货，先得换日元，日元就被买贵了。像水库的进水口越开越大，水位自然高。',
        '要说清楚：1985 年 9 月的广场协议（几个大国政府联手压美元）推了头两年一把；日本的通胀也比美国低（第 1 步的锚）。几股力叠在一起，这一段分不开。',
        '回归里这一项是 −0.8×生产率差：生产率每年比对方快 1 个点，货币平均每年强约 0.8%。',
      ],
      nums: [
        { t: '1', f: () => 1, fmt: 'int' },
        { t: '238', f: D => D.jpy(1985), fmt: 'n0' }, { t: '94', f: D => D.jpy(1995), fmt: 'n0' },
        { t: '2.5', f: D => D.jpy(1985) / D.jpy(1995), fmt: 'x1' },
        { t: '0.8', f: D => D.spec.rule.prod, fmt: 'n1' },
      ],
      facts: [{ f: D => Math.abs(D.spec.fit5y.prod + D.spec.rule.prod) < 0.05, note: '公式的 0.8 = 拟合的 −0.82 取整' }],
      concept: ['fx', 'exports'] },

    { type: 'reveal', title: '第 4 步：贸易条件，铁矿石和澳元', panel: { id: 'fx-tot' }, hl: ['exports', 'fx'],
      text: [
        '**结论：一个国家卖的东西变贵（贸易条件变好），外国人要先买它的货币，货币就强；卖的东西变便宜，货币就弱。**',
        '澳洲靠卖原料：铁矿石、煤、天然气，大头卖给中国。2008 年澳洲卖给中国 27 十亿美元，卖给美国只有 10 十亿美元。',
        '中国盖房修路那些年，铁矿石抢手，澳元对人民币也强：2006 年 1 澳元约换 6.0 元人民币，2011 年约 6.7 元，是全年平均最高的一年。',
        '后来中国房地产放慢，铁矿石从高位回落，澳元一路走弱：2025 年平均 4.63 元，2026 年 10 月约 4.65 元。同时第 2 步那根水管也关上了：利差从 2011 年的 4.7 个点缩到 2025 年底的负数。两股力一起往下推。',
        '图上的线是用数据算的（澳元兑美元 × 美元兑人民币）；圆圈是本课设定的参照值。铁矿石价格不在本项目的数据里，所以这一项（k）没有拟合，计算器里你自己拖。',
      ],
      nums: [
        { t: '27', f: D => D.w('trade.AUS.CHN', 2008), fmt: 'n0' }, { t: '10', f: D => D.w('trade.AUS.USA', 2008), fmt: 'n0' },
        { t: '1', f: () => 1, fmt: 'int' },
        { t: '6.0', f: D => D.audcny(2006), fmt: 'n1' }, { t: '6.7', f: D => D.audcny(2011), fmt: 'n1' },
        { t: '4.63', f: D => D.audcny(2025), fmt: 'n2' },
        { t: '4.65', f: D => D.spec.scen.audcny.spot, fmt: 'n2' },
        { t: '4.7', f: D => gap(D, '2011Q2'), fmt: 'pp1' },
      ],
      facts: [
        { f: D => [2006, 2011].every(y => Math.abs(D.audcny(y) - D.spec.audcnyRef.find(r => r.at === y).v) < 0.05), note: '数据算出的 2006 / 2011 年平均与设定值 6.0 / 6.7 相差 < 0.05' },
        { f: D => { const ys = []; for (let y = 2001; y <= 2025; y++) ys.push(y); return ys.every(y => D.audcny(y) <= D.audcny(2011) + 1e-9); }, note: '2011 年是 2001–2025 年澳元/人民币全年平均最高的一年' },
        { f: D => gap(D, '2025Q4') < 0, note: '2025 年底利差（澳洲 − 美国）为负' },
        { f: D => D.w('trade.AUS.CHN', 2008) > D.w('trade.AUS.USA', 2008), note: '澳洲 → 中国 > 澳洲 → 美国（2008）' },
      ],
      concept: ['exports', 'fx'] },

    { type: 'reveal', title: '第 5 步：信心，英国 2022', panel: { id: 'fx-conf' }, hl: ['fx', 'riskPremium'],
      text: [
        '**结论：平时利率高 → 货币强。没了信心就反过来：国债和货币一起被卖，利率涨、货币反而跌。这就是公式里的 RP（风险溢价）。**',
        '2022 年 9 月，英国新政府宣布大规模减税，却没说钱从哪来。市场不信，抛英国国债：10 年期国债利率从 8 月的 2.3% 跳到 9 月的 3.5%、10 月的 4.1%（月平均）。一个月跳 1.2 个点，是 1980 年以来最大的单月跳涨。',
        '按第 2 步，利率高该吸钱、英镑该变强。结果相反：1 英镑从 8 月的 1.20 美元跌到 9 月的 1.13 美元。钱不是冲着高利率进来，而是连国债带英镑一起往外撤。英国央行出手买国债，首相下台，到 12 月英镑回到 1.22 美元。',
        '像坝上出了裂缝：库里水位（利率）再高，人们也先往外撤。信心是最快的一根水管，几周就能翻转。',
        '怎么读：**利率一下子跳上去、货币同时急跌**，多半是信心在漏；利率慢慢涨、货币慢慢弱（同年上半年就是这样），多半只是别国利率涨得更快，还是利差。',
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
        { f: D => D.uk('gilt10y', '2022-06') > D.uk('gilt10y', '2022-01') && D.uk('usdPerGbp', '2022-06') < D.uk('usdPerGbp', '2022-01'), note: '2022 上半年：利率慢慢涨、英镑慢慢弱' },
        { f: D => D.q('USA', 'policyRate', '2022Q2') - D.q('USA', 'policyRate', '2022Q1') > D.q('GBR', 'policyRate', '2022Q2') - D.q('GBR', 'policyRate', '2022Q1'), note: '2022 上半年美国加息比英国快（利差对英镑不利）' },
      ],
      concept: ['fx', 'riskPremium'] },

    { type: 'reveal', title: '第 6 步：储备货币，美国为什么能一直逆差', map: { open: true, select: 'USA', year: 2025 }, hl: ['reserveCurrency', 'foreignBonds'],
      text: [
        '**结论：全世界都要存美元当备用水，美国就能长期买得多、卖得少，美元也不用靠高利率撑着。**',
        '地图上选中了美国。1995 到 2025 年，美国的经常账户（和外国买卖货物、服务，加上收付的利息）每一年都是逆差，最深的 2006 年约占 GDP 的 5.8%。',
        '按普通规矩，长期逆差的货币该变弱。美元没有，因为各国央行的储备里美元占一大半：2025 年约 57%，欧元只有 20%。',
        '钱是这样转回来的：别国卖货给美国换来美元，再买美国国债存起来。中国手里的美国国债，2007 年底 478 十亿美元，2008 年底 727 十亿美元。贸易水管流出去的美元，又从资本水管流回美国。',
        '在公式里，这是美元的 RP 特别低：别人愿意存，就不用多给补偿。代价是全靠信心：美元的储备份额最高时（1999 年）有 71%，现在一点点往下走；第 5 步的英国说明，信心一松，这根水管会反着流。',
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

    { type: 'reveal', title: '第 7 步：计算器，10 年后的人民币', panel: { id: 'fx-calc', preset: 'usdcny' }, hl: ['fx'], next: 'inv',
      text: [
        '**结论：把五根水管加起来，就能粗算 10 年后的汇率。它给方向和量级，不给精确数字。**',
        '公式：Δs ≈ 1.0·(π−π*) − 0.6·(i−i*) − 0.8·(g−g*) − k·ΔToT + RP。这里 s 是一份外币换多少人民币，**s 变大 = 人民币变弱**；带 * 的是外国。注意：这和图里「往上 = 本币强」正好相反。',
        '中国是追赶型经济：生产率快，有一大块是追赶，不全变成货币升值，所以 g 的系数缩到约 0.3 倍。',
        '两个情景（2026 年 10 月）：美元/人民币现在约 6.71，研究的基准是 10 年后约 6.0（区间 5.2–7.0）；澳元/人民币现在约 4.65，基准约 4.0（区间 3.4–4.6）。用按钮切换，拖滑块看每根水管推多少。滑块的默认值是假设，旁边标了今天的真实读数。',
        '**老实说：**这是粗算。5 年的回归把几根水管都放进去，也只能解释约三成（R² 0.32）；看 1 年，通胀差只能解释 5%。用它判断方向和量级，别拿它预测明年。',
        '下一课「投资者」：汇率变了，手里的房、股、债、金各会怎样。',
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
      ],
      facts: [{ f: D => D.spec.r2Full5y > 0.25 && D.spec.r2Full5y < 0.35, note: '「约三成」= R² 0.32' }],
      concept: ['fx', 'riskPremium'] },
  ],
};

export default LESSON_FX;
