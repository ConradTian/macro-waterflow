// Lessons as DATA (course agreed with the user: each lesson adds one player; all on real US quarters).
//
// Lesson   = { id, title, oneLine, rulesOn:[ruleId], startDate, endDate, mode:'history', available, steps:[...] }
// Step     = { type, title, text:[paragraph...] (use **bold**; known keywords auto-link to concept cards),
//              hl:[flow term ids to glow], concept:[concept ids to point at] , ... }
//   intro      { }                                   one-line conclusion + "下面分 N 步"
//   watch      { until:'2000Q4' }                    play from the previous step's end date to `until`
//   predict    { q, options:[{t, ok}], explain, until }   pause, ask, reveal, then play to `until`
//   experiment { from, until, slider | choices, metrics, insight }
//                slider:  { rule, key, min, max, step, def, label, fmt }       (needs sim.setRuleParam, falls back to direct param)
//                choices: [{ label, set:{ rules:{ruleId:bool}, params:{'rule.key':v} } }]   (first = baseline)
//   recap      { lines:[3], concepts:[...], next:lessonId }
//   reveal     { show:[partIds], text, question?, answerHint?, relation?, from?, until?, block?:'sources', tab?, hl, concept }
//                progressive disclosure. With `question`: phenomenon + question first, parts in `show` appear only after
//                the learner taps 揭晓 (then answerHint + relation). Without: parts appear on entry. `show` is cumulative.
//                Only has a visual effect if the lesson declares startParts (default: all parts visible).
//                part ids: bank pool repay household firm channel cash centralBank government capex interest
//                          + tab ids ledger cycle assets takeover.  optional until/from: play slowly through a window.
//   takeover   { role, text, decision:{key,min,max,step,default,label?,fmt?}, from, until, compare?:[{title,realKey?,get,fmt?}] }
//                sim.takeover(role) + slider -> sim.setDecision(role,{[key]:v}); plays from..until; real/model/user charts.
// Lesson extras: pace (ms per quarter), startParts:[...], rulesOn:'all' | [ruleIds], role:'bank' (role lessons -> 已学).
// Flow term ids that exist in the diagram: policyRate bankApproval newLoans interestPaid principalRepay
//   assetReservoir goodsChannel cpi capacity capex qe fiscalInjection.
// Metric spec: 'end:path' | 'max:path' | 'min:path' | 'sum:path' evaluated on snapshots in [from..until].

// Cycle lessons 1-3 run the FULL model (all rules on). Reason: with only the bank/household rules the bank_loosen.max and
// bank_tighten_* experiments barely move anything; the effects below were measured on the full model.

export const LESSONS = [
  {
    id: 0,
    title: '搭出水流系统',
    oneLine: '从一家银行和一个水池开始，一次只加一块，搭出整张水流图。',
    rulesOn: 'all',               // full model runs underneath; only the picture is revealed piece by piece
    startDate: '1996Q1', endDate: '2013Q4', mode: 'history', available: true,
    pace: 1500,                   // ms per quarter at 1x: slow, so pipes can be watched
    startParts: ['bank', 'pool'], // everything else (and all four tabs) is hidden until a 'reveal' step shows it
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**整张图只讲一件事：银行造水，借款人接水，水流向资产或商品，还本再把水收回。**',
          '我们不一次全看。每一步先看现象，再问「为什么」，再亮出解释它的那一块。',
          '现在图里只有银行和资产池。时间用真实的美国季度（从 1996Q1 开始）。',
        ],
        hl: ['bankApproval', 'assetReservoir'] },

      { type: 'reveal', title: '第 1 步：银行造出新水', until: '1996Q4', show: [],
        text: ['银行刚放出一笔贷款。看蓝色的「新贷款」管，水往下流，资产池的水位在动。'],
        question: '这笔贷款的水，是从哪里来的？',
        answerHint: '不是把别人的存款转借出去，而是在账户上直接记一笔新存款。贷款创造存款：多出来的这笔就是新水，叫货币总量 M。',
        relation: '银行是水龙头，资产池是水最后聚集的地方。',
        hl: ['newLoans', 'assetReservoir'], concept: ['M', 'newLoans'] },

      { type: 'reveal', title: '第 2 步：水为什么不会一直涨', until: '1997Q4', show: ['repay'],
        text: ['银行一直在放贷，新水不停地流进来。'],
        question: '那为什么水位不会涨到溢出？',
        answerHint: '借款要还。还本的那一刻，那笔存款被销毁，水从左边的排水口流走，叫货币注销。',
        relation: '新贷款是进水，还本是出水。进水大于出水，水位涨；反过来就退潮。',
        concept: ['principalRepay'] },

      { type: 'reveal', title: '第 3 步：谁在借', until: '1998Q4', show: ['household', 'firm'],
        text: ['水从银行流出来，又要流进资产池。中间一定有人把水接过去。'],
        question: '谁是借款人？',
        answerHint: '家庭和企业。家庭借来买房，企业借来投资和周转。',
        relation: '借款人站在银行和资产池中间：银行放水，借款人接水，再把水送去别处。' },

      { type: 'reveal', title: '第 4 步：钱花出去分两路', until: '1999Q4', show: ['channel', 'cash'],
        text: ['借款人拿到钱，不会全放进资产池。'],
        question: '钱花出去，会去哪？',
        answerHint: '分两路：一路买房子股票，推高资产价格；一路买东西，流进右边的商品河道，推高物价。还有一小份留作现金。',
        relation: '所以有两个水位：资产池的水位是资产价格，商品河道的水位是物价。它们不一定一起涨。',
        hl: ['assetReservoir', 'goodsChannel'], concept: ['assetReservoir', 'goodsChannel', 'cpi'] },

      { type: 'reveal', title: '第 5 步：付息只是换主人', until: '2000Q4', show: ['interest'],
        text: ['借款人每个季度还的，不只是本金。'],
        question: '那利息呢？水去了哪，总水量变了吗？',
        answerHint: '利息是借款人把水交给银行。水只是换了主人，总水量不变。',
        relation: '还本让水消失；付息只让水换主人。两者别混在一起。',
        hl: ['interestPaid'], concept: ['interestPaid'] },

      { type: 'reveal', title: '第 6 步：谁决定水贵不贵', until: '2001Q4', show: ['centralBank'],
        text: ['同样是借钱，有的年份借的人多，有的年份借的人少。看左上角的数字，它在变。'],
        question: '是谁在调水价？',
        answerHint: '央行。政策利率像一道闸门：利率低，水便宜，借的人多；利率高，水贵，借的人少。',
        relation: '闸门先影响新贷款；已经借出去的旧贷款要等重定价，慢慢才变。所以加息不会马上见效。',
        hl: ['policyRate'], concept: ['policyRate'] },

      { type: 'reveal', title: '第 7 步：私人不借了，水从哪来', from: '2008Q4', until: '2009Q4', show: ['government'],
        text: ['时间跳到 2008 年底。新贷款变少，还本却还在继续。'],
        question: '私人不借了，水从哪来？',
        answerHint: '政府。财政注入（花得比收得多）是一个水龙头；央行买债（QE）是另一个。',
        relation: '私人退潮时，政府的水龙头顶上去。代价是政府自己的债务上升。',
        hl: ['fiscalInjection', 'qe'], concept: ['fiscalInjection', 'qe'] },

      { type: 'reveal', title: '第 8 步：河道能变宽吗', until: '2013Q4', show: ['capex'],
        text: ['商品河道的宽度有上限。水一多，水位（物价）就被挤高。'],
        question: '河道能变宽吗？',
        answerHint: '能。企业投资（Capex）盖厂房、买设备，河道才变宽。但投资要隔好几个季度才见效。',
        relation: '投资拓宽河道，有延迟。所以通胀常常慢半拍才回落。',
        hl: ['capex', 'capacity'], concept: ['capex', 'capacity'] },

      { type: 'reveal', title: '第 9 步：这些数字从哪来', show: ['ledger'], block: 'sources',
        text: ['图上的数字，有的是真的，有的是模型算的。'],
        question: '怎么分辨哪些是真实数据、哪些是模型？',
        answerHint: '真实数据：政策利率（历史模式直接用）、房价、通胀、失业率等，来自 FRED、BIS、Case-Shiller。模型算出的：大多数水流（新贷款、还本、各条水管）和模型房价。',
        relation: '图表里：实线 = 真实，虚线 = 模型，点线 = 你的版本；灰色区「保留样本·示意」= 2022 年后。',
        tryIt: '流水账已解锁。点左上角 ▾ 收起本卡，再点流水账里任意一条记录：图里它推动的水管会亮 3 秒。',
        tab: 'ledger' },

      { type: 'recap', title: '总结',
        lines: [
          '银行放贷造出新水，还本把水注销；付息只让水换主人。',
          '水分两路：资产价格和物价。央行调水价，政府在私人退潮时补水，投资拓宽河道，且有延迟。',
          '每个角色都有自己的规则。下一课从银行开始，看它到底怎么决定闸门。',
        ],
        concepts: ['M', 'newLoans', 'principalRepay', 'policyRate'], next: 'role:bank' },
    ],
  },

  {
    id: 1,
    title: '银行 + 家庭：抵押品回路',
    oneLine: '房价涨 → 抵押品变好 → 银行放水 → 更多贷款买房 → 房价再涨。一个自己喂自己的圈。',
    rulesOn: 'all',
    startDate: '1997Q1', endDate: '2006Q2', mode: 'history', available: true,
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**结论：房价上涨，会让银行把贷款闸门开大；闸门开大，又把房价推得更高。**',
          '这是一个自己喂自己的圈（正反馈）。就像上游放水越多，下游水位越高，上游看到水位高就放得更多。',
          '下面分 5 步：① 看水往哪流 ② 看银行闸门 ③ 看家庭追涨 ④ 猜一猜 ⑤ 动手改。',
          '本课只盯银行和家庭这个圈，其他角色照自己的规则在后台运行。时间：1997Q1 → 2006Q2（真实季度）。',
        ],
        hl: ['bankApproval', 'newLoans', 'assetReservoir'], concept: ['lvr'] },

      { type: 'watch', until: '1999Q4', title: '第 1 步：看水往哪流',
        text: [
          '银行把**新贷款**（蓝管）借给家庭。家庭拿去买房，水流进**资产池**里的房产。',
          '看这个：蓝管变粗时，资产池里房产那一格的水位一起涨。',
        ],
        hl: ['newLoans', 'assetReservoir'], concept: ['newLoans', 'assetReservoir'] },

      { type: 'watch', until: '2002Q4', title: '第 2 步：谁在拧银行闸门',
        text: [
          '银行每季看两样东西：房价同比涨了多少、坏账多不多。',
          '房价涨得快，说明手里的抵押品值钱了（LVR 变好）。坏账又低。',
          '于是触发规则：「放宽审批」。银行框里的小圆点向右移（审批倍数变大），新贷款变多。',
          '看这个：审批 ×1.xx 往上走，蓝管跟着变粗。',
        ],
        hl: ['bankApproval', 'newLoans'], concept: ['lvr', 'bankApproval'] },

      { type: 'watch', until: '2004Q4', title: '第 3 步：家庭也在追涨',
        text: [
          '家庭看到房价同比涨了 5% 以上，会外推：「还会涨」，于是借得更多。',
          '银行愿意借，家庭又想借，两边一起把水抽进房产。',
          '代价在慢慢累积：每个季度要还的本和息（橙色管）越来越多，DSR 偿债率往上爬。',
        ],
        hl: ['newLoans', 'principalRepay', 'interestPaid'], concept: ['dsr'] },

      { type: 'predict', until: '2006Q2', title: '第 4 步：猜一猜',
        q: '圈已经转了 8 年，闸门还开着，没有别的力量。接下来 1.5 年房价会？',
        options: [
          { t: '继续往上涨', ok: true },
          { t: '先横盘一阵', ok: false },
          { t: '突然大跌', ok: false },
        ],
        explain: [
          '圈只要没被打断，就会继续转：房价涨 → 抵押品好 → 闸门开着 → 房价再涨。',
          '要打断它，得有别的力量（比如利率升高，第 2 课）。',
          '但注意：转得越久，家庭 DSR 越高，圈越脆弱。',
        ],
        hl: ['newLoans', 'assetReservoir'] },

      { type: 'experiment', from: '1997Q1', until: '2006Q2', title: '第 5 步：动手改',
        text: [
          '你来当银行风控总监：规定闸门最多开到几倍。1.0 就是不放宽，1.25 是默认。',
          '选一个方案，点「重跑」。时间会倒回 1997Q1，用你的设置重新跑到 2006Q2，并和默认值比较。',
        ],
        choices: [
          { label: '默认：最多放宽到 ×1.25', set: {} },
          { label: '不放宽：闸门锁在 ×1.0', set: { params: { 'bank_loosen.max': 1.0 } } },
        ],
        metrics: [
          { label: '期末房价指数', get: 'end:assets.housing.price', fmt: 'idx' },
          { label: '累计新贷款（十亿美元）', get: 'sum:flows.newLoans', fmt: 'num' },
          { label: '期末家庭 DSR', get: 'end:household.dsr', fmt: 'pct' },
        ],
        insight: '闸门锁死，2006Q2 房价指数约 185；放宽到 ×1.25 约 210。闸门上限就是这个圈的「放大倍数」。注意：再放宽到 ×1.5 并不会更高（约 196），借得太满，家庭偿债压力反过来拖住房价，所以不是越大越好。',
        hl: ['bankApproval'] },

      { type: 'recap', title: '总结',
        lines: [
          '抵押品回路：房价↑ → LVR 变好 → 银行放宽 → 新贷款↑ → 房价↑。',
          '银行和家庭各自只按自己的规则行动，圈是它们合在一起的结果。',
          '圈转得越久，家庭 DSR 越高。这是下一课（央行加息）和 B2 的伏笔。',
        ],
        concepts: ['lvr', 'bankApproval', 'newLoans', 'dsr'], next: 2 },
    ],
  },

  {
    id: 2,
    title: '加入央行：加息的传导延迟',
    oneLine: '央行加息，房价不会马上跌。旧房贷要分批重定价，约两年后才转跌。',
    rulesOn: 'all',
    startDate: '2003Q1', endDate: '2008Q1', mode: 'history', available: true,
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**结论：加息的效果有「水管长度」。新贷款的利率马上变，但存量房贷的实际利率要分批重定价，所以房价过约两年才转跌。**',
          '下面分 4 步：① 看低利率期 ② 看加息怎么传下去 ③ 猜一猜 ④ 动手改。',
          '本课加入央行：政策利率沿用真实联储路径。时间：2003Q1 → 2008Q1。',
        ],
        hl: ['policyRate'], concept: ['policyRate', 'mortgageEff'] },

      { type: 'watch', until: '2004Q2', title: '第 1 步：低利率期',
        text: [
          '政策利率压在很低的位置（央行框里能看到数字）。借钱便宜，上一课的圈转得更快。',
          '看这个：房产水位继续涨，蓝管保持粗。',
        ],
        hl: ['policyRate', 'newLoans', 'assetReservoir'] },

      { type: 'watch', until: '2006Q2', title: '第 2 步：加息一路往上',
        text: [
          '央行看到通胀和经济过热，连续加息。',
          '先变的是新贷款的利率。可大部分家庭借的是旧房贷，要等到重定价那天，利率才跟着上去。',
          '所以房价还在涨：旧账单还没变，银行也还没收闸。',
        ],
        hl: ['policyRate', 'interestPaid'], concept: ['mortgageEff'] },

      { type: 'predict', until: '2008Q1', title: '第 3 步：猜一猜',
        q: '政策利率已升到约 5%。接下来 2 年，房价会？',
        options: [
          { t: '立刻暴跌', ok: false },
          { t: '先见顶，然后温和回落', ok: true },
          { t: '继续大涨', ok: false },
        ],
        explain: [
          '旧房贷分批重定价，每个季度只有一小批人的付息变多，压力是慢慢累积的。',
          '等 DSR 升到够高、房价同比转弱，银行才触发收紧。',
          '从 2004 年中开始加息，到 2006 年中房价见顶，隔了大约两年；之后到 2008Q1 约回落 8%，是温和回落，不是暴跌。',
        ],
        hl: ['interestPaid', 'assetReservoir'] },

      { type: 'experiment', from: '2003Q1', until: '2008Q1', title: '第 4 步：动手改',
        text: [
          '假如央行当年一直不加息，会怎样？',
          '选一个方案，点「重跑」。时间倒回 2003Q1，重新跑到 2008Q1。',
        ],
        choices: [
          { label: '照真实加息', set: {} },
          { label: '利率一直不动（锁在 2003Q1 的水平）', set: { rules: { cb_real_path: false, cb_taylor: false } } },
        ],
        metrics: [
          { label: '期间房价峰值', get: 'max:assets.housing.price', fmt: 'idx' },
          { label: '期末房价指数', get: 'end:assets.housing.price', fmt: 'idx' },
          { label: '期末有效房贷利率', get: 'end:rates.mortgageEff', fmt: 'pct' },
        ],
        insight: '利率不动，房价峰值约 233（照真实加息约 210）；2008Q1 有效房贷利率约 5.8%（照真实加息约 7.2%）。圈转得更高，也更脆弱。加息像在长长的水管里加了一道阻力，水要过一阵才到下游。',
        hl: ['policyRate'] },

      { type: 'recap', title: '总结',
        lines: [
          '加息先改新贷款，再慢慢改存量房贷（重定价延迟）。',
          '压力靠 DSR 一点点累积，达到阈值银行才收闸，所以房价转跌比加息晚约两年。',
          '这个延迟是下一课「圈反转」的发令枪。',
        ],
        concepts: ['policyRate', 'mortgageEff', 'dsr'], next: 3 },
    ],
  },

  {
    id: 3,
    title: '回路反转：B2',
    oneLine: '房价转跌，圈就倒着转：房价↓ → LVR 变差 → 银行收紧 → 新贷款↓ → 房价↓。降息也救不了。',
    rulesOn: 'all',
    startDate: '2006Q1', endDate: '2010Q4', mode: 'history', available: true,
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**结论：同一个圈，方向反过来就是 B2。降息打开的是水龙头，可堵住的是银行的闸门。**',
          '下面分 4 步：① 看房价转跌 ② 看银行收闸 ③ 猜一猜 ④ 动手改。',
          '时间：2006Q1 → 2010Q4。央行按真实路径降息。',
        ],
        hl: ['bankApproval', 'newLoans'], concept: ['lvr', 'creditImpulse'] },

      { type: 'watch', until: '2007Q4', title: '第 1 步：房价掉头',
        text: [
          '加息的延迟到了：家庭的付息变重，借款需求先降，房价同比由正转负。',
          '看这个：房产水位开始回落。',
        ],
        hl: ['assetReservoir', 'interestPaid'], concept: ['dsr'] },

      { type: 'watch', until: '2008Q4', title: '第 2 步：银行收闸',
        text: [
          '银行看到两件事：房价同比低于 -2%，房贷的 LVR 超过 42%。',
          '触发规则：「收紧住房信贷」。审批倍数下降，蓝管变细。',
          '新贷款少于还本，信贷脉冲转负：池子里流出的水比流进的多。',
        ],
        hl: ['bankApproval', 'newLoans', 'principalRepay'], concept: ['creditImpulse', 'bankApproval'] },

      { type: 'predict', until: '2010Q4', title: '第 3 步：猜一猜',
        q: '央行已把利率降到接近 0。接下来 2 年，新贷款会重新涌回来吗？',
        options: [
          { t: '会，利率这么低', ok: false },
          { t: '不会，仍然偏弱', ok: true },
          { t: '先涨后跌', ok: false },
        ],
        explain: [
          '问题出在银行的闸门（抵押品和资本），不在利率。',
          '旧债还在偿还，还本的管子比新贷款粗，水位继续下降。',
          '这就是为什么需要下一课：政府接手去补水。',
        ],
        hl: ['policyRate', 'newLoans', 'principalRepay'] },

      { type: 'experiment', from: '2006Q1', until: '2010Q4', title: '第 4 步：动手改',
        text: [
          '假如银行不收闸，会怎样？',
          '选一个方案，点「重跑」。时间倒回 2006Q1，重新跑到 2010Q4。',
        ],
        choices: [
          { label: '银行照规则收紧', set: {} },
          { label: '银行不收紧', set: { rules: { bank_tighten_collateral: false, bank_tighten_losses: false } } },
        ],
        metrics: [
          { label: '期末房价指数', get: 'end:assets.housing.price', fmt: 'idx' },
          { label: '审批倍数最低值', get: 'min:bank.approval', fmt: 'x2' },
          { label: '期末家庭 DSR', get: 'end:household.dsr', fmt: 'pct' },
        ],
        insight: '从 2006 年高点算起，房价最大回撤：不收紧约 −6%，照规则收紧约 −17%。2009Q1 新贷款：不收紧约 192，收紧约 116（十亿美元/季）。收闸是银行的自保，却让整个圈加速倒转；不收闸跌得浅，但银行自己扛更多坏账风险。',
        hl: ['bankApproval'] },

      { type: 'recap', title: '总结',
        lines: [
          'B2：房价↓ → LVR 变差 → 银行收紧 → 信贷脉冲转负 → 房价↓。',
          '降息只改价格，银行闸门不开，水依然进不来。',
          '私人部门退潮时，需要有人接手补水：下一课加入政府。',
        ],
        concepts: ['creditImpulse', 'lvr', 'bankApproval'], next: 4 },
    ],
  },

  { id: 4, title: '加入政府：⑥ 接手', oneLine: '私人信贷退潮时，财政支出加 QE 把水池重新注满。',
    rulesOn: [], startDate: '2009Q1', endDate: '2014Q4', mode: 'history', available: false, steps: [] },
  { id: 5, title: '加入企业：Capex 与产能', oneLine: '需求冲到产能上限就出现通胀（B1）；产能要靠 Capex，且有滞后。',
    rulesOn: [], startDate: '2020Q1', endDate: '2022Q4', mode: 'history', available: false, steps: [] },
  { id: 6, title: '加入投资者：资产面板', oneLine: '新增的水怎么在房、股、债、金之间分配，决定谁涨。',
    rulesOn: [], startDate: '1995Q1', endDate: '2025Q4', mode: 'history', available: false, steps: [] },
  { id: 7, title: '全开：自由运行到 2050', oneLine: '所有角色一起动，从现在往后跑，看周期自己怎么走。',
    rulesOn: [], startDate: '2025Q4', endDate: '2050Q4', mode: 'free', available: false, steps: [] },
];

export const LESSON_BY_ID = Object.fromEntries(LESSONS.map(l => [l.id, l]));
