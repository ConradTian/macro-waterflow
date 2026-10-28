// Lessons as DATA (course agreed with the user: lesson 0 + role lessons run in the 万元 TOWN, cycle lessons 1+ on real US quarters).
//
// TOWN lessons (scenario:'town', delays:false|true) use quarter NUMBERS instead of dates; a step has `quarters` (how many quarters it plays).
//   action  { action:{type:'loan'|'buyHouse'|'repay'|'payInterest'|'spend'|'riskOff'|'saving',...}, button, text, question?, answerHint?, relation?, metrics?, show? }
//   valve   { valve:id, value, quarters, keep?:false, button, ... }           turns a valve, plays the ripple + delay labels, plays `quarters`
//   try     { valve+slider:{min,max,step,def,fmt,label} | choices:[{label,do:[..]}], quarters, metrics, insight }   sandbox, carries nothing on
//   chain   { links:[{text, term?, pipe?, part?, hl?}], text, next? }         final causal chain; tapping a link lights its pipe
//   zoom    { date, until?, text, block?:'sources', next?, showAll? }          zoomOut() animation, then the US sim from `date`
//   any step: do:[effects] at entry, after:[effects] once over (effects: {action}|{valve,value}|{delays}|{rule,on}|{param,value}|{reset:true}); metrics:[{label,get,fmt}] -> 之前/现在 table
//   reveal block: 'households' | 'budget' | 'valves' | 'sources'
//
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

// Cycle lessons 1-7 run the FULL model (all rules on). Reason: with only the bank/household rules the bank_loosen.max and
// bank_tighten_* experiments barely move anything; the effects were measured on the full model.
//
// LIVE NUMBERS (cycle lessons): no model number is typed into a text. Texts carry {key} / {key.k} placeholders:
//   step.vals     [{ key, get:'agg:path', fmt, from?, until?, set? }]    filled from a scratch sim of the step window
//   experiment    metrics[].key -> {key.0} {key.1} .. (value under choice k), {key.1-0} (|difference|); compareAll:true shows every choice
//   agg           end first start max min sum avg chg dpp dd argmax argmin when:path=value at:YYYYQn:path count:path ; path 'share.toCash' = share of new money
// Extra step fields: glow:{parts,pipes} flashes on entry; freeLink:true shows the "open free run" button; tab opens a tab.
// Never shown to the learner, only read by tools/check_lessons.mjs (so a retune cannot silently falsify a text):
//   predict option.when [cond]   the claim an option makes; exactly the ok option must hold
//   claims [cond]                every factual sentence of a step.  cond = { get, from?, until?, set?, vs?, mul?, gt|gte|lt|lte, dateBetween?, dateBefore? }

import { RULE_BY_ID } from '../engine/rules.js';
const R = (id, k) => RULE_BY_ID[id].params[k];
const p0 = x => Math.round(x * 100) + '%';
const p1 = x => (Math.round(x * 1000) / 10) + '%';

export const LESSONS = [
  {
    id: 0,
    title: '搭出水流系统',
    oneLine: '先在一个只有 5 户人家的小镇里，一次只做一件事，搭出整张水流图；最后放大到全美国。',
    scenario: 'town',            // runs on the 万元 town sim (engine/town.js); the last step zooms to the real US sim
    delays: false,               // no repricing lag etc.: one action shows its effect at once
    rulesOn: 'all',
    pace: 1600,                  // ms per quarter at 1x: slow, so pipes can be watched
    mode: 'history', available: true,
    startParts: ['bank', 'household', 'iou', 'poolHousing'],   // everything else is revealed step by step
    // Step flow (each: phenomenon -> question -> reveal -> relation to what came before). Quarter 0 has no flows, so the first
    // actions happen "right now" at 第0季; steps 7-9 start from a fresh town ({reset:true}) and let quarters pass.
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**整张图只讲一件事：银行造水，借款人接水，水流向资产或商品，还本再把水收回。**',
          '我们先不看美国。先看一个只有 5 户人家、1 家银行、1 个小卖部的小镇，钱用「万元」。',
          '下面分 13 步：① 银行造水 ② 还本排水 ③ 家庭们 ④ 买房 ⑤ 小卖部 ⑥ 付息 ⑦ 央行闸门 ⑧ 政府水龙头 ⑨ Capex ⑩ 水量平衡 ⑪ 阀门与水位 ⑫ 因果链 ⑬ 放大到美国。',
          '每一步：先看现象，再问「为什么」，再亮出解释它的那一块。',
        ],
        hl: ['newLoans'], concept: ['M'] },

      { type: 'action', title: '第 1 步：银行造出新水', show: ['ledger'], tab: 'ledger',
        text: [
          '小镇里现在一共有 **110 万元**的水（所有人的存款加起来）。',
          '小王想买房，手上只有 10 万元。他去镇银行，借了 **50 万元**。',
        ],
        question: '银行借给小王的 50 万，是从别人的存款里搬来的，还是凭空多出来的？',
        action: { type: 'loan', who: '小王', amount: 50 }, button: '让小王借 50 万',
        answerHint: ['凭空多出来的。银行不是搬水，而是在小王的账户上直接记一笔新存款，同时记一张欠条：小王欠银行 50。', '所以水和欠条是**一起出现**的。这个泵叫放贷泵：贷款创造新水。'],
        relation: '这是整张图的起点。水不是白来的，每一份新水都对应一张欠条（图里的欠条箱）。',
        metrics: [{ label: '小镇总水量（万元）', get: 'money.M', fmt: 'n1' }, { label: '欠条箱（万元）', get: 'iou.bankTotal', fmt: 'n1' }, { label: '小王的存款', get: 'town.households.0.deposit', fmt: 'n1' }],
        hl: ['newLoans'], concept: ['M', 'newLoans'] },

      { type: 'action', title: '第 2 步：还本把水排走', show: ['repay'],
        text: [
          '几个月后，小王把其中 **10 万元**还给了银行。',
          '看图：左边多了一个排水口。',
        ],
        question: '小王还的这 10 万，银行拿去干什么了？水还留在小镇里吗？',
        action: { type: 'repay', who: '小王', amount: 10 }, button: '让小王还 10 万',
        answerHint: ['不在了。还本的那一刻，这 10 万存款和对应的欠条**一起消失**。', '银行不是把水收进口袋，而是把它销毁。排水口就是销毁水的地方。'],
        relation: '放贷泵造水，排水口毁水。一进一出：水位涨还是退，就看哪边更大。',
        metrics: [{ label: '小镇总水量（万元）', get: 'money.M', fmt: 'n1' }, { label: '欠条箱（万元）', get: 'iou.bankTotal', fmt: 'n1' }],
        hl: ['principalRepay'], concept: ['principalRepay'] },

      { type: 'reveal', title: '第 3 步：水不是飘在空中的', show: ['household'], block: 'households',
        text: [
          '到现在我们一直在说「小王」。其实镇上有 5 户人家：**小王、老李、阿珍、大刘、小陈**，一共 10 套房。',
        ],
        question: '镇上这些水（存款），是平均分给 5 户的吗？',
        answerHint: '不是。老李存款最多，还有 3 套房；小陈最少。每户有自己的存款、欠条和房子。图里的「家庭」框，就是这 5 户加在一起。',
        relation: '前面的泵和排水口，都发生在某一户身上。图上的数字，是 5 户加总，一分不差。' },

      { type: 'action', title: '第 4 步：用水买「取水权」', show: ['poolHousing'],
        text: [
          '小王手里现在有 50 万元存款。老李有一套房想卖，价格 **40 万元**。',
          '小王把它买了下来。',
        ],
        question: '小王付给老李 40 万。镇上的水总量变了吗？房子的价格水位呢？',
        action: { type: 'buyHouse', who: '小王', from: '老李' }, button: '让小王向老李买房',
        answerHint: ['水总量没变：40 万只是从小王的口袋流到老李的口袋（水只换了主人）。', '但是买房的水流进了「房产」水池，房价水位涨了约 4%。买一套已经存在的房子，是买一份「取水权」，并没有多造出一间房。'],
        relation: '放贷泵是造水；买房只是让水换主人，并推高房产水位。这是两件不同的事。',
        metrics: [{ label: '小镇总水量（万元）', get: 'money.M', fmt: 'n1' }, { label: '房产水位（房价指数）', get: 'assets.housing.price', fmt: 'n1' }, { label: '小王的存款', get: 'town.households.0.deposit', fmt: 'n1' }, { label: '老李的存款', get: 'town.households.1.deposit', fmt: 'n1' }],
        hl: ['assetReservoir'], concept: ['assetReservoir', 'housePrice'] },

      { type: 'action', title: '第 5 步：水流进小卖部', show: ['channel'],
        text: [
          '小王口袋里还剩 10 万元。他去小卖部买了 **5 万元**的东西。',
        ],
        question: '这 5 万元去哪了？它和买房的 40 万有什么不同？',
        action: { type: 'spend', who: '小王', amount: 5 }, button: '让小王去小卖部花 5 万',
        answerHint: ['5 万元流进了右边的「商品河道」（小卖部）。买房的水流进房产水池，推的是房价；买东西的水流进商品河道，推的是物价。'],
        relation: '所以有**两个水位**：房产水位（房价）和商品河道的水位（物价）。同一笔钱，流向不同，推高的东西不同。',
        metrics: [{ label: '小卖部的存款（万元）', get: 'town.shop.deposit', fmt: 'n1' }, { label: '小镇总水量（万元）', get: 'money.M', fmt: 'n1' }],
        hl: ['goodsChannel', 'cpi'], concept: ['goodsChannel', 'cpi'] },

      { type: 'action', title: '第 6 步：付息只是换主人', show: ['interest'],
        text: [
          '大刘欠银行 75 万元，这个季度要付 **2 万元**利息。',
        ],
        question: '利息付出去，小镇的总水量会少 2 万吗？',
        action: { type: 'payInterest', who: '大刘', amount: 2 }, button: '让大刘付 2 万利息',
        answerHint: ['不会。2 万元从大刘的口袋流进银行的口袋，水量不变，只是换了主人。', '只有**还本**才会让水消失。'],
        relation: '还本 = 排水口，水消失；付息 = 普通水管，水换口袋。别混在一起。',
        metrics: [{ label: '小镇总水量（万元）', get: 'money.M', fmt: 'n1' }, { label: '大刘的存款', get: 'town.households.3.deposit', fmt: 'n1' }, { label: '银行的口袋', get: 'town.bank.pocket', fmt: 'n1' }],
        hl: ['interestPaid'], concept: ['interestPaid'] },

      { type: 'valve', title: '第 7 步：央行拧水价闸门', show: ['centralBank', 'valves'], do: [{ reset: true }],
        text: [
          '小镇复原了，回到第 0 季。前面我们一件一件地做；现在让时间往前走。',
          '镇上有一道闸门：央行的**政策利率**，现在是 4%。借钱的价格，由它定。',
        ],
        question: '央行把利率从 4% 拧到 7%，小镇的新贷款、房价会怎样？',
        valve: 'policyRate', value: 0.07, quarters: 2, keep: false, button: '把利率拧到 7%',
        answerHint: ['新贷款变少，房价水位回落。借钱贵了，借的人少了，流进房产的水也少了。', '小镇里先把「延迟」关掉，所以变化当季就看得到。现实里水要慢慢传下去，角色课里再打开。'],
        relation: '放贷泵的水量，不只看银行肯不肯借，还看价格。价格这道闸门在央行手里。',
        metrics: [{ label: '新房贷利率', get: 'rates.mortgageNew', fmt: 'pct' }, { label: '房产水位（房价指数）', get: 'assets.housing.price', fmt: 'n1' }, { label: '失业率', get: 'macro.unemployment', fmt: 'pct' }],
        hl: ['policyRate'], concept: ['policyRate'] },

      { type: 'valve', title: '第 8 步：政府是另一个水龙头', show: ['government'], do: [{ reset: true }],
        text: [
          '镇政府花得比收得多（赤字）的时候，多出来的部分是新水，叫**财政注入**：这是第二个泵。',
          '反过来，收得比花得多（盈余），多出来的水被收走销毁：这是第二个排水口。',
          '现在镇政府这个季度多花了相当于镇 GDP 5% 的钱。',
        ],
        question: '多花的钱会让物价和总水量怎样？',
        valve: 'fiscalInjection', value: 0.05, quarters: 2, keep: false, button: '让政府多花 5%',
        answerHint: ['多花的钱是新水：总水量增加，需求变大，物价被推高。', '代价是政府的债务变多。盈余刚好相反：税收大于花费，多出的水被销毁。'],
        relation: '泵一共三个：银行放贷、央行 QE、政府赤字。排水口也三个：还本、政府盈余、QT。图上的泵和排水口，就这些。',
        metrics: [{ label: '通胀', get: 'macro.inflation', fmt: 'pct' }, { label: '小镇总水量（万元）', get: 'money.M', fmt: 'n1' }, { label: '政府债务 / GDP', get: 'gov.debtGdp', fmt: 'pct' }],
        hl: ['fiscalInjection'], concept: ['fiscalInjection'] },

      { type: 'valve', title: '第 9 步：只有 Capex 能拓宽河道', show: ['firm', 'capex'], do: [{ reset: true }],
        text: [
          '商品河道的宽度，是小镇一个季度最多能产出多少东西（产能）。刚才买房的钱，一分也没让河道变宽。',
          '现在小卖部老板决定扩建店面：**Capex 加大 30%**。',
        ],
        question: '下一季，河道会变宽吗？',
        valve: 'capexMult', value: 1.3, quarters: 4, keep: false, button: '让 Capex 加大 30%',
        answerHint: ['不会马上。第 1 季只是「需求」变大：花出去的钱先成了别人的收入，物价压力上来。', '过了 2 个季度，河道才真的变宽。买房、买股票的水只推高资产水位，不拓宽河道。'],
        relation: '「买资产」和「建产能」是两种不同的管道：前者只换主人、推水位；后者才让河道变宽，而且有延迟。',
        metrics: [{ label: '需求压力', get: 'macro.demandPressure', fmt: 'pct' }, { label: '产能（河道宽度）', get: 'macro.capacityPotential', fmt: 'n1' }, { label: '通胀', get: 'macro.inflation', fmt: 'pct' }],
        hl: ['capex', 'capacity'], concept: ['capex', 'capacity'] },

      { type: 'reveal', title: '第 10 步：水量平衡条', show: ['budget'], block: 'budget',
        text: [
          '图下面有一根水量平衡条。每个季度，小镇总水量的变化，只由两件事决定：',
          '**泵入（放贷 + QE + 赤字）减去 排出（还本 + 盈余）**。',
          '利息、买房、买东西、工资、税收、Capex……全是水管，只搬水，不改总量。',
        ],
        question: '这个季度，小镇的水是涨了还是退了？怎么看出来的？',
        answerHint: '看平衡条：左边是泵入，右边是排出，差就是本季总水量的变化。',
        relation: '前面 9 步学的泵、排水口、水管，都能在这根条里找到自己的位置。' },

      { type: 'reveal', title: '第 11 步：哪些能拧，哪些只能看', show: ['valves'], block: 'valves',
        text: [
          '这一路我们拧过几个阀门：政策利率、财政注入、Capex。',
          '再看看房价、物价、失业率。你拧过它们吗？',
        ],
        question: '你能直接把房价拧到 100 吗？',
        answerHint: '不能。房价、股价、物价、失业，都是**水位**，是水流进去、流出去之后的结果。你只能拧**阀门**，然后看水位怎么变。',
        relation: '一个简单的区分：能用手拧的是阀门，只能看的是水位。拧了阀门，水位要过几个季度才跟着动。' },

      { type: 'chain', title: '第 12 步：把整条因果链串起来',
        text: ['今天的故事连成一条线。点任何一环，图里对应的水管会亮。'],
        links: [
          { text: '银行放贷泵造出新水，同时记下一张欠条', pipe: 'newLoans', part: 'iou', term: 'newLoans' },
          { text: '新水变成购买力：买房，水流进房产水池，推高房价水位', pipe: 'toHousing', part: 'poolHousing', term: 'assetReservoir' },
          { text: '买东西，水流进商品河道，推高物价水位', pipe: 'toConsumption', part: 'channel', term: 'goodsChannel' },
          { text: '付息：水换主人；还本：水和欠条一起消失', pipe: ['interestPaid', 'principalRepay'], term: 'principalRepay' },
          { text: '央行的闸门定水价，新贷款随价格增减', pipe: 'newLoans', part: 'centralBank', hl: ['policyRate'], term: 'policyRate' },
          { text: '政府是另一个泵（赤字）和排水口（盈余）', pipe: 'fiscalInjection', part: 'government', term: 'fiscalInjection' },
          { text: 'Capex 才能拓宽河道，而且要等几个季度', pipe: 'toCapex', part: 'capex', term: 'capex' },
          { text: '总水量变化 = 泵入 − 排出（水量平衡条）', part: 'budget' },
        ] },

      { type: 'zoom', title: '第 13 步：同一张图，放大到全美国', date: '2006Q1', showAll: true, block: 'sources', next: 'role:bank',
        text: [
          '图没有变：还是这些泵、排水口、水管和阀门。变的只是尺度：5 户人家变成 **1.2 亿个家庭**，万元变成**十亿美元**。',
          '小镇是我们编的，好让你一次只看一件事。美国这一边的数字，有的是真的，有的是模型算的：',
        ],
        relation: '从下一课开始，我们一个角色一个角色地看：先看银行，它到底怎么决定放多少水。',
        concept: ['M'] },
    ],
  },


  /* =====================================================================================================================
   * 第 0.5 课「怎么看一个季度」(id '0b', kind 'routine'): runs on US data, after lesson 0 (the menu puts it in 入门).
   * Teaches the 4-item quarterly routine that the 本季看点 strip (src/ui/headline.js) points at: 水 / 灯 / 规则 / 下一步.
   * Extra step fields: strip:true  -> the strip under the time bar pulses when the step is entered (src/ui/lessons.js)
   *                    stripAt:{date, has:[...]} -> never shown; tools/check_lessons.mjs verifies that headlineItems() lists these texts
   * ===================================================================================================================== */
  {
    id: '0b', kind: 'routine', label: '第 0.5 课',
    title: '怎么看一个季度',
    oneLine: '每个季度只看四件事：水、灯、规则、下一步。在 2008 年第三季度走一遍。',
    rulesOn: 'all',
    startDate: '2008Q2', endDate: '2008Q4', mode: 'history', available: true,
    pace: 1600,
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**每个季度，只看四件事：① 水　② 灯　③ 规则　④ 下一步。**',
          '游戏每走一个季度，屏幕上有几十个数字在变。不用都看。屏幕顶上那一行「本季看点」，每个季度替你把变化挑出来：哪盏灯变色了、哪条规则新触发了、哪个周期往前走了。',
          '下面分 6 步：① 水 ② 灯 ③ 规则 ④ 猜一猜 ⑤ 下一步 ⑥ 串起来。我们停在 2008 年第三季度，再多走一个季度。',
        ],
        strip: true, hl: ['newLoans'], concept: ['creditImpulse'] },

      { type: 'watch', until: '2008Q3', title: '第 1 步：先看水', strip: true, glow: { parts: ['budget'] },
        text: [
          '第一个问题：**这个季度，水（货币）总量是多了还是少了？** 看图下面那一条「本季水量」。',
          '2008Q3：泵入 = 放贷 {loans} + 赤字 {def}；排出 = 还本 {rep}；净变化 **+{net}**（十亿美元）。',
          '注意：放贷（{loans}）比还本（{rep}）少，银行这一边在净抽水；是政府赤字（{def}）把总水量顶了上去。这就是 2008 年：私人部门在还债，政府在补水。',
        ],
        vals: [
          { key: 'loans', get: 'end:budget.pumpedIn.loans', fmt: 'num' }, { key: 'def', get: 'end:budget.pumpedIn.deficit', fmt: 'num' },
          { key: 'rep', get: 'end:budget.drainedOut.repay', fmt: 'num' }, { key: 'net', get: 'end:budget.net', fmt: 'num' },
        ],
        block: 'budget',
        claims: [
          { get: 'end:budget.net', gt: 0, note: '本季总水量变多' },
          { get: 'end:flows.newLoans', vs: { get: 'end:flows.principalRepay' }, lt: 0, note: '放贷少于还本' },
          { get: 'end:budget.pumpedIn.deficit', gt: 100, note: '赤字是主要的泵' },
        ],
        hl: ['newLoans', 'principalRepay', 'fiscalInjection'], concept: ['principalRepay', 'fiscalInjection'] },

      { type: 'reveal', title: '第 2 步：再看灯', strip: true, tab: 'cycle', glow: { parts: ['poolEquity', 'poolHousing'] },
        stripAt: { date: '2008Q3', has: ['估值灯 黄→绿'] },
        text: [
          '第二个问题：**四盏灯里，哪一盏这个季度变色了？** 四盏灯各管一件事：信贷灯看水管，偿债灯看还债压力，政策灯看利率松紧，估值灯看价格贵不贵。',
        ],
        question: '2008Q2 → 2008Q3，哪盏灯变了颜色？（不用算，看顶上「本季看点」的第一条。）',
        answerHint: [
          '**估值灯 黄→绿。** 股票 P/E（相对起点的倍数）从 {pe0} 降到 {pe1}，刚好跌破黄线 1.15（房价/收入 {h1}，早就在线下）。',
          '其余三盏没变色：信贷灯一直是红的（信贷脉冲 {ci}，放贷少于还本），偿债灯、政策灯一直是黄的。',
        ],
        relation: '「灯变色」= 一个比值穿过了一条线。红黄绿的线，在「周期」页每盏灯下面的刻度上都画着。',
        vals: [
          { key: 'pe0', get: 'start:lights.valuation.parts.equity', fmt: 'n2', from: '2008Q2', until: '2008Q3' },
          { key: 'pe1', get: 'end:lights.valuation.parts.equity', fmt: 'n3', from: '2008Q2', until: '2008Q3' },
          { key: 'h1', get: 'end:lights.valuation.parts.house', fmt: 'n2', from: '2008Q2', until: '2008Q3' },
          { key: 'ci', get: 'end:lights.credit.value', fmt: 'pct', from: '2008Q2', until: '2008Q3' },
        ],
        claims: [
          { get: 'start:lights.valuation.parts.equity', from: '2008Q2', until: '2008Q3', gte: 1.15, note: 'Q2 估值灯黄（股票 P/E 高于 1.15 倍）' },
          { get: 'end:lights.valuation.parts.equity', from: '2008Q2', until: '2008Q3', lt: 1.15, note: 'Q3 股票 P/E 跌回黄线下' },
          { get: 'end:lights.valuation.parts.house', from: '2008Q2', until: '2008Q3', lt: 1.15, note: '房价/收入早就在黄线下' },
          { get: 'end:lights.credit.value', from: '2008Q2', until: '2008Q3', lt: -0.015, note: '信贷灯红' },
          { get: 'end:lights.policy.value', from: '2008Q2', until: '2008Q3', gte: -0.015, lt: 0.002, note: '政策灯黄' },
        ],
        concept: ['lampValuation', 'lampCredit'] },

      { type: 'reveal', title: '第 3 步：看规则', strip: true, tab: 'ledger', glow: { parts: ['household'], pipes: ['principalRepay'] },
        stripAt: { date: '2008Q3', has: ['外国「要求更高期限溢价」新触发'] },
        text: [
          '第三个问题：**谁的规则新触发了？** 每个角色每季度都按规则行动，流水账里每个角色一张卡。但大多数卡片只是在重复上一季。',
          '所以流水账默认只显示「★ 新触发」和「做法变了」的卡片；点上面的「全部」才看全部。',
        ],
        question: '2008Q3 流水账里有好几张卡，几乎都在重复上一季。哪一张是这个季度才新触发的？',
        answerHint: [
          '**外国：要求更高的期限溢价。** 它的卡片右上角有「★ 新触发」，其余几张是「↻ 持续中」。',
          `怎么读它的规则：赤字/GDP 高于 ${p0(R('foreign_funding', 'def'))} 且通胀高于 ${p0(R('foreign_funding', 'pi'))}。看卡片里的刻度条：竖线是阈值，圆点是现值。规则读到的通胀是 {inf}，刚刚越过竖线——所以这一季触发。`,
        ],
        relation: '「新触发」= 圆点这个季度才越过竖线。圆点早就在亮色那一边的，是「持续中」，先不用管。',
        tryIt: '打开「流水账」，点一张卡，看水流图里它推动的水管亮起来。再点「全部」看看多出来的是哪些。',
        vals: [{ key: 'inf', get: 'start:macro.inflation', fmt: 'pct', from: '2008Q2', until: '2008Q3' }],
        claims: [
          { get: 'start:macro.inflation', from: '2008Q2', until: '2008Q3', gte: R('foreign_funding', 'pi'), lt: R('foreign_funding', 'pi') + 0.005, note: '规则读到的通胀刚刚越过阈值' },
        ],
        concept: ['fiscalInjection', 'cpi'] },

      { type: 'predict', until: '2008Q4', title: '第 4 步：猜一猜', strip: true, hl: ['policyRate'],
        stripAt: { date: '2008Q4', has: ['政策灯 黄→红'] },
        q: '现在是 2008Q3，政策灯是黄的：政策利率 {pol}，通胀 {pi}，实际政策利率（利率减通胀）{real}。央行还在降息。再过一个季度（2008Q4），政策灯会怎样？',
        options: [
          { t: '变绿：利率刚刚合适', ok: false, when: [{ get: 'end:lights.policy.value', gte: 0.002, lt: 0.025 }] },
          { t: '变红：利率比通胀低得更多，太松了', ok: true, when: [{ get: 'end:lights.policy.value', lt: -0.015 }] },
          { t: '还是黄', ok: false, when: [{ get: 'end:lights.policy.value', gte: -0.015, lt: 0.002 }] },
        ],
        vals: [
          { key: 'pol', get: 'start:rates.policy', fmt: 'pct2' }, { key: 'pi', get: 'start:macro.inflation', fmt: 'pct' }, { key: 'real', get: 'start:rates.realPolicy', fmt: 'pct' },
          { key: 'pol2', get: 'end:rates.policy', fmt: 'pct2' }, { key: 'pi2', get: 'end:macro.inflation', fmt: 'pct' }, { key: 'real2', get: 'end:rates.realPolicy', fmt: 'pct' },
        ],
        explain: [
          '变红。央行把政策利率降到 {pol2}，可通胀还有 {pi2}，实际政策利率是 {real2}，穿过了红线（−1.5%）。本季看点里会写「政策灯 黄→红」。',
          '灯红不一定是坏事，它只说「利率比通胀松得多」。放在 2008 年，意思是央行能做的几乎都做了——降息快没有空间了。下一步要看的就是这个。',
        ],
        claims: [{ get: 'start:lights.policy.value', gte: -0.015, lt: 0.002, note: '2008Q3 政策灯是黄的' }] },

      { type: 'reveal', title: '第 5 步：下一步还差什么', strip: true, tab: 'cycle',
        stripAt: { date: '2008Q4', has: ['政策灯 黄→红'] },
        text: [
          '第四个问题：**周期往下走一步，还差什么？** 打开「周期」页，每个表盘下面都写着「还差什么」；顶上「本季看点」的最后一行也会写。',
          '小周期现在在「{ph}」。要回到「扩张」，要同时满足两条：信贷脉冲 ≥ {t0}（现在 {v0}），失业率 4 季变化 ≤ {t1}（现在 {v1}）。两条都差得远，这个周期还没走完。',
          '大周期走得慢：下一站是 ⑤「降息失灵、私人去杠杆」，它的条件已经满足，但要连续 {need} 个季度才算数，现在是 {have}/{need}。再过一个季度，本季看点就会写「大周期 ②→⑤」。',
        ],
        relation: '读「下一步」的办法：差得远，就不用急；只差一个季度或一个条件，就盯紧下个季度。',
        vals: [
          { key: 'ph', get: 'start:cycles.short.label', fmt: 'str' },
          { key: 't0', get: 'start:cycles.short.evidence.0.threshold', fmt: 'pp' }, { key: 'v0', get: 'start:cycles.short.evidence.0.value', fmt: 'pp' },
          { key: 't1', get: 'start:cycles.short.evidence.1.threshold', fmt: 'pp' }, { key: 'v1', get: 'start:cycles.short.evidence.1.value', fmt: 'pp' },
          { key: 'have', get: 'start:cycles.long.progress.have', fmt: 'idx' }, { key: 'need', get: 'start:cycles.long.progress.need', fmt: 'idx' },
        ],
        claims: [
          { get: 'start:cycles.short.evidence.0.value', lt: 0, note: '信贷脉冲还是负的' },
          { get: 'start:cycles.short.evidence.1.value', gt: 0.001, note: '失业率 4 季变化还在抬头' },
          { get: 'start:cycles.long.progress.have', vs: { get: 'start:cycles.long.progress.need' }, gte: -1, lte: -1, note: '大周期还差 1 个季度' },
        ],
        concept: ['shortCycle', 'longCycle'] },

      { type: 'chain', title: '第 6 步：把四件事串起来', strip: true,
        text: ['每个季度按这个顺序看，一分钟够了。点任何一环，图里对应的地方会亮。'],
        links: [
          { text: '**水**：看「本季水量」——泵入（放贷 + 赤字 + QE）减排出（还本），总水量是多了还是少了', pipe: ['newLoans', 'principalRepay', 'fiscalInjection'], part: 'budget', term: 'creditImpulse' },
          { text: '**灯**：看顶上「本季看点」——信贷、偿债、政策、估值，哪盏灯变色了', part: ['poolHousing', 'poolEquity'], hl: ['policyRate'], term: 'lampCredit' },
          { text: '**规则**：只看流水账里「★ 新触发」的卡；读条件刻度，圆点这个季度才越过竖线，规则才触发', part: 'bank', pipe: 'newLoans', term: 'bankApproval' },
          { text: '**下一步**：「周期」页写着还差什么——差得远就不用急，差一步就盯紧下个季度', part: 'centralBank', hl: ['policyRate'], term: 'shortCycle' },
        ], next: 'role-bank' },
    ],
  },

  /* =====================================================================================================================
   * Cycle lessons 1-7 (US data, scenario 'us'). LIVE NUMBERS: every model number quoted in a text is a {placeholder} filled at run
   * time from scratch simulations (see src/ui/lessons-town.js: vals / metrics[].key). `when` (predict options) and `claims` (any step)
   * are never shown to the learner: tools/check_lessons.mjs evaluates them against the engine so a retune cannot silently falsify a text.
   *   cond = { get:'agg:path', from?, until?, set?, vs?:{get?,from?,until?,set?}, mul?, gt|gte|lt|lte: number }   tests  get - mul*vs  against the number
   * ===================================================================================================================== */
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
          '下面分 6 步：① 看水往哪流 ② 看银行闸门 ③ 看家庭追涨 ④ 猜一猜 ⑤ 动手改 ⑥ 因果链。',
          '本课只盯银行和家庭这个圈，其他角色照自己的规则在后台运行。时间：1997Q1 → 2006Q2（真实季度）。',
        ],
        hl: ['bankApproval', 'newLoans', 'assetReservoir'], concept: ['lvr'] },

      { type: 'watch', until: '1998Q2', title: '第 1 步：看水往哪流',
        text: [
          '银行把**新贷款**（蓝管）借给家庭。家庭拿去买房，水流进**资产池**里的房产。',
          '看这个：蓝管变粗时，资产池里房产那一格的水位一起涨。',
        ],
        metrics: [{ label: '新贷款（十亿美元/季）', get: 'flows.newLoans', fmt: 'num' }, { label: '房价指数', get: 'assets.housing.price', fmt: 'idx' }],
        claims: [{ get: 'chg:assets.housing.price', gt: 0.03, note: '房产水位上涨' }, { get: 'chg:flows.newLoans', gt: 0, note: '蓝管变粗' }],
        hl: ['newLoans', 'assetReservoir'], concept: ['newLoans', 'assetReservoir'] },

      { type: 'watch', until: '1999Q2', title: '第 2 步：谁在拧银行闸门',
        text: [
          '银行每季看两样东西：房价比一年前涨了多少、坏账多不多。',
          `房价涨得快（比一年前 > ${p1(R('bank_loosen', 'hp'))}），说明手里的抵押品值钱了（LVR 变好）。坏账又低（< ${p1(R('bank_loosen', 'bad'))}）。`,
          `于是触发规则：「放宽审批」。银行框里的小圆点向右移（审批倍数变大，每季加 ${R('bank_loosen', 'step').toFixed(2)}，上限 ×${R('bank_loosen', 'max').toFixed(2)}），新贷款变多。`,
          '看这个：审批 ×1.xx 往上走，蓝管跟着变粗，一直走到上限。',
        ],
        metrics: [{ label: '审批倍数', get: 'bank.approval', fmt: 'x2' }, { label: '新贷款（十亿美元/季）', get: 'flows.newLoans', fmt: 'num' }],
        claims: [{ get: 'dpp:bank.approval', gt: 0.03, note: '审批倍数往上走' }, { get: 'end:bank.approval', gte: R('bank_loosen', 'max') - 0.011, note: '走到上限' }, { get: 'end:bank.badLoanRate', lt: R('bank_loosen', 'bad'), note: '坏账率低' }, { get: 'end:extra.houseYoY', gt: R('bank_loosen', 'hp'), note: '房价涨得快' }],
        hl: ['bankApproval', 'newLoans'], concept: ['lvr', 'bankApproval'] },

      { type: 'watch', until: '2001Q2', title: '第 3 步：家庭也在追涨',
        text: [
          `家庭看到房价比一年前涨了 ${p1(R('hh_chase', 'up'))} 以上，会外推：「还会涨」，于是借得更多。`,
          '银行愿意借，家庭又想借，两边一起把水抽进房产。',
          '代价在慢慢累积：每个季度要还的本和息（橙色管）越来越多，DSR 偿债率往上爬。',
        ],
        metrics: [{ label: '家庭 DSR', get: 'household.dsr', fmt: 'pct' }, { label: '房价指数', get: 'assets.housing.price', fmt: 'idx' }],
        claims: [{ get: 'dpp:household.dsr', gt: 0.005, note: 'DSR 往上爬' }, { get: 'max:extra.houseYoY', gt: R('hh_chase', 'up'), note: '房价比一年前超过追涨线' }],
        hl: ['newLoans', 'principalRepay', 'interestPaid'], concept: ['dsr'] },

      { type: 'predict', until: '2006Q2', title: '第 4 步：猜一猜',
        q: '圈已经转了 4 年，闸门已开到上限，没有别的力量。接下来 5 年房价会？',
        options: [
          { t: '继续往上涨', ok: true, when: [{ get: 'chg:assets.housing.price', gt: 0.03 }] },
          { t: '先横盘一阵', ok: false, when: [{ get: 'chg:assets.housing.price', lt: 0.03 }, { get: 'chg:assets.housing.price', gt: -0.03 }] },
          { t: '突然大跌', ok: false, when: [{ get: 'dd:assets.housing.price', lt: -0.15 }] },
        ],
        vals: [{ key: 'up', get: 'chg:assets.housing.price', fmt: 'chg1' }, { key: 'dsr', get: 'end:household.dsr', fmt: 'pct' }, { key: 'dsr0', get: 'at:1997Q1:household.dsr', fmt: 'pct', from: '1997Q1', until: '2006Q2' }],
        explain: [
          '圈只要没被打断，就会继续转：房价涨 → 抵押品好 → 闸门开着 → 房价再涨。这 5 年房价 {up}。',
          '要打断它，得有别的力量（比如利率升高，第 2 课）。',
          '但注意：转得越久，圈越脆弱。家庭 DSR 已从 1997 年的 {dsr0} 走到 {dsr}。',
        ],
        claims: [{ get: 'dpp:household.dsr', from: '1997Q1', until: '2006Q2', gt: 0.005, note: 'DSR 比 1997 年高' }],
        hl: ['newLoans', 'assetReservoir'] },

      { type: 'experiment', from: '1997Q1', until: '2006Q2', title: '第 5 步：动手改',
        text: [
          '你来当银行风控总监：规定闸门最多开到几倍。1.0 就是不放宽，1.25 是默认。',
          '选一个方案，点「重跑」。时间会倒回 1997Q1，用你的设置重新跑到 2006Q2，并和默认值比较。',
        ],
        choices: [
          { label: '默认：最多放宽到 ×1.25', short: '默认 ×1.25', set: {} },
          { label: '不放宽：闸门锁在 ×1.0', short: '锁死 ×1.0', set: { params: { 'bank_loosen.max': 1.0 } } },
          { label: '更宽松：最多放宽到 ×1.5', short: '×1.5', set: { params: { 'bank_loosen.max': 1.5 } } },
        ],
        compareAll: true,
        metrics: [
          { key: 'h', label: '期末房价指数', get: 'end:assets.housing.price', fmt: 'idx' },
          { key: 'nl', label: '累计新贷款（十亿美元）', get: 'sum:flows.newLoans', fmt: 'num' },
          { key: 'dsr', label: '期末家庭 DSR', get: 'end:household.dsr', fmt: 'pct' },
        ],
        insight: [
          '闸门锁死在 ×1.0，2006Q2 房价指数 {h.1}；默认放宽到 ×1.25 时是 {h.0}（累计新贷款 {nl.1} 对 {nl.0}）。闸门上限就是这个圈的「放大倍数」。',
          '再放宽到 ×1.5，房价是 {h.2}，并不比默认高：圈自己有刹车，房价/收入太高时，估值锚会把价格往回拉。所以不是越大越好。',
        ],
        claims: [
          { get: 'end:assets.housing.price', set: { params: { 'bank_loosen.max': 1.0 } }, vs: { set: {} }, lt: -3, from: '1997Q1', until: '2006Q2', note: '锁死 → 房价更低' },
          { get: 'sum:flows.newLoans', set: { params: { 'bank_loosen.max': 1.0 } }, vs: { set: {} }, lt: 0, from: '1997Q1', until: '2006Q2', note: '锁死 → 新贷款更少' },
          { get: 'end:assets.housing.price', set: { params: { 'bank_loosen.max': 1.5 } }, vs: { set: {} }, lte: 0, from: '1997Q1', until: '2006Q2', note: '×1.5 并不更高' },
        ],
        hl: ['bankApproval'] },

      { type: 'chain', title: '第 6 步：把整条因果链串起来',
        text: ['这一课的圈连成一条线。点任何一环，图里对应的水管会亮。'],
        links: [
          { text: '房价上涨，抵押品值钱了（LVR 变好）', pipe: 'collateral', part: 'poolHousing', term: 'lvr' },
          { text: '银行看到抵押品好、坏账低，放宽审批：闸门开大', part: 'bank', hl: ['bankApproval'], term: 'bankApproval' },
          { text: '新贷款（泵）变多：造出更多新水，也记下更多欠条', pipe: 'newLoans', part: 'iou', term: 'newLoans' },
          { text: '家庭追涨，借来的水流进房产，房产水位再涨（圈转回起点）', pipe: 'toHousing', part: 'poolHousing', term: 'housePrice' },
          { text: '代价：每季还本付息越来越重，DSR 爬升，圈越转越脆弱', pipe: ['principalRepay', 'interestPaid'], part: 'household', term: 'dsr' },
        ], next: 2 },
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
          '下面分 5 步：① 看低利率期 ② 看加息怎么传下去 ③ 猜一猜 ④ 动手改 ⑤ 因果链。',
          '本课加入央行：政策利率沿用真实联储路径。时间：2003Q1 → 2008Q1。',
        ],
        hl: ['policyRate'], concept: ['policyRate', 'mortgageEff'] },

      { type: 'watch', until: '2004Q2', title: '第 1 步：低利率期',
        text: [
          '政策利率压在很低的位置（央行框里能看到数字）。借钱便宜，上一课的圈转得更快。',
          '看这个：房产水位继续涨，蓝管保持粗。',
        ],
        metrics: [{ label: '政策利率', get: 'rates.policy', fmt: 'pct' }, { label: '房价指数', get: 'assets.housing.price', fmt: 'idx' }],
        claims: [{ get: 'end:rates.policy', lt: 0.025, note: '利率很低' }, { get: 'chg:assets.housing.price', gt: 0.02, note: '房产水位继续涨' }],
        hl: ['policyRate', 'newLoans', 'assetReservoir'] },

      { type: 'watch', until: '2006Q2', title: '第 2 步：加息一路往上',
        text: [
          '央行看到通胀和经济过热，连续加息。',
          '先变的是新贷款的利率。可大部分家庭借的是旧房贷，要等到重定价那天，利率才跟着上去。',
          '所以房价还在涨：旧账单还没变，银行也还没收闸。',
          '看这个：政策利率涨了 {pol}，家庭实付的平均房贷利率只涨了 {eff}。',
        ],
        vals: [{ key: 'pol', get: 'dpp:rates.policy', fmt: 'pp' }, { key: 'eff', get: 'dpp:rates.mortgageEff', fmt: 'pp' }],
        metrics: [{ label: '政策利率', get: 'rates.policy', fmt: 'pct' }, { label: '平均房贷利率（家庭实付）', get: 'rates.mortgageEff', fmt: 'pct' }, { label: '房价指数', get: 'assets.housing.price', fmt: 'idx' }],
        claims: [{ get: 'dpp:rates.policy', gt: 0.03, note: '连续加息' }, { get: 'dpp:rates.mortgageEff', vs: { get: 'dpp:rates.policy' }, lt: 0, note: '实付利率涨得比政策利率少' }, { get: 'chg:assets.housing.price', gt: 0.02, note: '房价还在涨' }],
        hl: ['policyRate', 'interestPaid'], concept: ['mortgageEff'] },

      { type: 'predict', until: '2008Q1', title: '第 3 步：猜一猜',
        q: '政策利率已升到约 {pol0}。接下来 2 年，房价会？',
        options: [
          { t: '立刻暴跌', ok: false, when: [{ get: 'dd:assets.housing.price', lt: -0.15 }] },
          { t: '先见顶，然后温和回落', ok: true, when: [{ get: 'dd:assets.housing.price', lt: -0.01 }, { get: 'dd:assets.housing.price', gt: -0.15 }] },
          { t: '继续大涨', ok: false, when: [{ get: 'chg:assets.housing.price', gt: 0.05 }] },
        ],
        vals: [
          { key: 'pol0', get: 'start:rates.policy', fmt: 'pct0' },
          { key: 'pk', get: 'argmax:assets.housing.price', fmt: 'str', from: '2003Q1', until: '2008Q1' },
          { key: 'dd', get: 'dd:assets.housing.price', fmt: 'chg1', from: '2003Q1', until: '2008Q1' },
          { key: 'fall', get: 'chg:assets.housing.price', fmt: 'chg1', from: '2006Q2', until: '2008Q1' },
        ],
        explain: [
          '旧房贷分批重定价，每个季度只有一小批人的付息变多，压力是慢慢累积的。',
          '等 DSR 升到够高、房价比一年前转弱，银行才触发收紧。',
          '从 2004 年中开始加息，到 {pk} 房价见顶，隔了大约两年；之后到 2008Q1 房价约 {fall}（从高点算最大回撤 {dd}），是温和回落，不是暴跌。',
        ],
        claims: [{ get: 'argmax:assets.housing.price', fmt: 'date', from: '2003Q1', until: '2008Q1', dateBetween: ['2005Q4', '2006Q4'], note: '房价在 2006 年前后见顶' }],
        hl: ['interestPaid', 'assetReservoir'] },

      { type: 'experiment', from: '2003Q1', until: '2008Q1', title: '第 4 步：动手改',
        text: [
          '假如央行当年一直不加息，会怎样？',
          '选一个方案，点「重跑」。时间倒回 2003Q1，重新跑到 2008Q1。',
        ],
        choices: [
          { label: '照真实加息', short: '真实加息', set: {} },
          { label: '利率一直不动（锁在 2003Q1 的水平）', short: '利率不动', set: { rules: { cb_real_path: false, cb_taylor: false } } },
        ],
        metrics: [
          { key: 'pk', label: '期间房价峰值', get: 'max:assets.housing.price', fmt: 'idx' },
          { key: 'h', label: '期末房价指数', get: 'end:assets.housing.price', fmt: 'idx' },
          { key: 'me', label: '期末有效房贷利率', get: 'end:rates.mortgageEff', fmt: 'pct' },
        ],
        insight: '利率不动，房价峰值 {pk.1}（照真实加息 {pk.0}）；2008Q1 有效房贷利率 {me.1}（照真实加息 {me.0}）。圈转得更高，也更脆弱。加息像在长长的水管里加了一道阻力，水要过一阵才到下游。',
        claims: [
          { get: 'max:assets.housing.price', set: { rules: { cb_real_path: false, cb_taylor: false } }, vs: { set: {} }, gt: 3, from: '2003Q1', until: '2008Q1', note: '利率不动 → 房价峰值更高' },
          { get: 'end:rates.mortgageEff', set: { rules: { cb_real_path: false, cb_taylor: false } }, vs: { set: {} }, lt: 0, from: '2003Q1', until: '2008Q1', note: '利率不动 → 有效房贷利率更低' },
        ],
        hl: ['policyRate'] },

      { type: 'chain', title: '第 5 步：把整条因果链串起来',
        text: ['加息的传导，从总闸到下游的家庭。点任何一环，图里对应的水管会亮。'],
        links: [
          { text: '央行加息：政策利率上升，总闸拧紧', part: 'centralBank', hl: ['policyRate'], term: 'policyRate' },
          { text: '新房贷利率立刻上调，新贷款开始减少', pipe: 'newLoans', part: 'bank', term: 'newLoans' },
          { text: '大多数家庭借的是旧房贷：每季只有一小批重定价，实付利率慢慢爬', pipe: 'interestPaid', part: 'household', term: 'mortgageEff' },
          { text: '付息压力一点点累积，DSR 上升', pipe: ['principalRepay', 'interestPaid'], part: 'household', term: 'dsr' },
          { text: '约两年后，房价比一年前转弱、银行收闸，房价才转跌', pipe: 'collateral', part: 'poolHousing', term: 'housePrice' },
        ], next: 3 },
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
          '下面分 5 步：① 看房价转跌 ② 看银行收闸 ③ 猜一猜 ④ 动手改 ⑤ 因果链。',
          '时间：2006Q1 → 2010Q4。央行按真实路径降息。',
        ],
        hl: ['bankApproval', 'newLoans'], concept: ['lvr', 'creditImpulse'] },

      { type: 'watch', until: '2007Q4', title: '第 1 步：房价掉头',
        text: [
          '加息的延迟到了：家庭的付息变重，借款需求先降，房价比一年前由正转负。',
          '看这个：房产水位开始回落。',
        ],
        metrics: [{ label: '房价指数', get: 'assets.housing.price', fmt: 'idx' }, { label: '房价比一年前', get: 'extra.houseYoY', fmt: 'pct' }, { label: '家庭 DSR', get: 'household.dsr', fmt: 'pct' }],
        claims: [{ get: 'end:extra.houseYoY', lt: 0, note: '房价比一年前为负' }, { get: 'max:household.dsr', gt: 0.12, note: '付息变重（DSR 高）' }],
        hl: ['assetReservoir', 'interestPaid'], concept: ['dsr'] },

      { type: 'watch', until: '2008Q4', title: '第 2 步：银行收闸',
        text: [
          `银行看到两件事：房价比一年前低于 ${p0(R('bank_tighten_collateral', 'hp'))}（或较高点回撤超过 ${p0(R('bank_tighten_collateral', 'dd'))}），房贷的 LVR 超过 ${p0(R('bank_tighten_collateral', 'lvr'))}。`,
          '触发规则：「收紧住房信贷」。审批倍数下降，蓝管变细。',
          '新贷款少于还本，信贷脉冲转负：池子里流出的水比流进的多。',
        ],
        metrics: [{ label: '审批倍数', get: 'bank.approval', fmt: 'x2' }, { label: '新贷款（十亿美元/季）', get: 'flows.newLoans', fmt: 'num' }, { label: '还本（十亿美元/季）', get: 'flows.principalRepay', fmt: 'num' }],
        claims: [{ get: 'dpp:bank.approval', lt: -0.1, note: '审批倍数下降' }, { get: 'end:flows.newLoans', vs: { get: 'end:flows.principalRepay' }, lt: 0, note: '新贷款少于还本' }, { get: 'end:extra.creditImpulse', lt: 0, note: '信贷脉冲转负' },
          { get: 'max:household.lvr', gt: R('bank_tighten_collateral', 'lvr'), note: 'LVR 超过收紧线' }],
        hl: ['bankApproval', 'newLoans', 'principalRepay'], concept: ['creditImpulse', 'bankApproval'] },

      { type: 'predict', until: '2010Q4', title: '第 3 步：猜一猜',
        q: '央行已把利率降到接近 {pol}。接下来 2 年，新贷款会重新涌回来吗？',
        options: [
          { t: '会，利率这么低', ok: false, when: [{ get: 'end:flows.newLoans', vs: { get: 'end:flows.principalRepay' }, gt: 0 }] },
          { t: '不会，仍然偏弱', ok: true, when: [{ get: 'end:flows.newLoans', vs: { get: 'end:flows.principalRepay' }, lt: 0 }] },
          { t: '先涨后跌', ok: false, when: [{ get: 'max:flows.newLoans', vs: { get: 'start:flows.newLoans' }, gt: 20 }] },
        ],
        vals: [
          { key: 'pol', get: 'start:rates.policy', fmt: 'pct' },
          { key: 'nl', get: 'end:flows.newLoans', fmt: 'num' },
          { key: 'rep', get: 'end:flows.principalRepay', fmt: 'num' },
        ],
        explain: [
          '问题出在银行的闸门（抵押品和资本），不在利率。',
          '旧债还在偿还，还本的管子比新贷款粗（2010Q4：新贷款 {nl}，还本 {rep}，十亿美元/季），水位继续下降。',
          '这就是为什么需要下一课：政府接手去补水。',
        ],
        claims: [{ get: 'start:rates.policy', lt: 0.01, note: '利率接近 0（2008Q4 的 0.5% 左右）' }],
        hl: ['policyRate', 'newLoans', 'principalRepay'] },

      { type: 'experiment', from: '2006Q1', until: '2010Q4', title: '第 4 步：动手改',
        text: [
          '假如银行不收闸，会怎样？',
          '选一个方案，点「重跑」。时间倒回 2006Q1，重新跑到 2010Q4。',
        ],
        choices: [
          { label: '银行照规则收紧', short: '照规则收紧', set: {} },
          { label: '银行不收紧', short: '不收紧', set: { rules: { bank_tighten_collateral: false, bank_tighten_losses: false } } },
        ],
        metrics: [
          { key: 'dd', label: '房价最大回撤（从 2006 年高点）', get: 'dd:assets.housing.price', fmt: 'chg' },
          { key: 'nl', label: '2009Q1 新贷款（十亿美元/季）', get: 'at:2009Q1:flows.newLoans', fmt: 'num' },
          { key: 'h', label: '期末房价指数', get: 'end:assets.housing.price', fmt: 'idx' },
          { key: 'ap', label: '审批倍数最低值', get: 'min:bank.approval', fmt: 'x2' },
          { key: 'dsr', label: '期末家庭 DSR', get: 'end:household.dsr', fmt: 'pct' },
        ],
        insight: '从 2006 年高点算起，房价最大回撤：不收紧 {dd.1}，照规则收紧 {dd.0}。2009Q1 新贷款：不收紧 {nl.1}，收紧 {nl.0}（十亿美元/季）。收闸是银行的自保，却让整个圈加速倒转；不收闸跌得浅，但银行自己扛更多坏账风险。',
        claims: [
          { get: 'dd:assets.housing.price', set: { rules: { bank_tighten_collateral: false, bank_tighten_losses: false } }, vs: { set: {} }, gt: 0.03, from: '2006Q1', until: '2010Q4', note: '不收紧 → 回撤更浅' },
          { get: 'at:2009Q1:flows.newLoans', set: { rules: { bank_tighten_collateral: false, bank_tighten_losses: false } }, vs: { set: {} }, gt: 10, from: '2006Q1', until: '2010Q4', note: '不收紧 → 新贷款更多' },
        ],
        hl: ['bankApproval'] },

      { type: 'chain', title: '第 5 步：把整条因果链串起来',
        text: ['B2 是第 1 课的圈倒着转。点任何一环，图里对应的水管会亮。'],
        links: [
          { text: '加息的延迟到了：付息变重，借款需求降，房价由涨转跌', pipe: 'interestPaid', part: 'household', term: 'dsr' },
          { text: '房价下跌，抵押品变差（LVR 变差）', pipe: 'collateral', part: 'poolHousing', term: 'lvr' },
          { text: '银行收紧审批：闸门关小', part: 'bank', hl: ['bankApproval'], term: 'bankApproval' },
          { text: '新贷款少于还本，信贷脉冲转负：流出的水比流进的多', pipe: ['newLoans', 'principalRepay'], part: 'iou', term: 'creditImpulse' },
          { text: '购房资金减少，房价再跌（圈倒着转回起点）；降息只改价格，打不开银行的闸门', pipe: 'toHousing', part: 'centralBank', hl: ['policyRate'], term: 'housePrice' },
        ], next: 4 },
    ],
  },

  /* ----------------------------------------------------------------------------------------------------------------- 4 */
  {
    id: 4,
    title: '加入政府：⑥ 接手',
    oneLine: '私人信贷退潮时，财政支出加 QE 把水池重新注满。',
    rulesOn: 'all', pace: 800,
    startDate: '2008Q3', endDate: '2014Q4', mode: 'history', available: true,
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**结论：私人部门不肯再借钱、一心还债的时候，只有政府和央行能把水补回去。财政花钱是一个泵，央行买债（QE）是另一个泵。**',
          '像上游的农场全都断了水：水库管理员只能自己开闸放水，再请上级往水库里灌水。',
          '下面分 7 步：① 私人退潮 ② 政府的两条管 ③ 央行灌水 ④ 猜一猜 ⑤ 动手改 ⑥ 大周期盘 ⑦ 因果链。',
          '时间：2008Q3 → 2014Q4（真实季度）。所有角色照自己的规则运行。',
        ],
        hl: ['fiscalInjection', 'qe'], concept: ['fiscalInjection', 'qe'] },

      { type: 'reveal', until: '2009Q2', title: '第 1 步：私人退潮，降息也没用',
        text: [
          '2008 年下半年，房价在跌，银行关着闸（第 3 课）。央行把政策利率一路降到接近 0。',
          '看这个：新贷款（蓝管）细得像一根线，还本（橙管）还是那么粗。',
        ],
        question: '利率已经降到 0 了，新贷款为什么还是回不来？',
        answerHint: [
          '闸门不在价格上，在两头的资产负债表上：银行要先修复资本，家庭和企业债还没还完，想借的借不到，能借的不想借。',
          '这叫资产负债表衰退。水不是不够便宜，而是私人这头的水龙头堵住了，排水口还在不停地抽水。',
        ],
        relation: '第 3 课的 B2 圈走到了头。对应大周期的 ⑤：降息失灵，私人去杠杆。',
        metrics: [{ label: '新贷款（十亿美元/季）', get: 'flows.newLoans', fmt: 'num' }, { label: '还本（十亿美元/季）', get: 'flows.principalRepay', fmt: 'num' }, { label: '政策利率', get: 'rates.policy', fmt: 'pct' }, { label: '失业率', get: 'macro.unemployment', fmt: 'pct' }],
        claims: [{ get: 'end:flows.newLoans', vs: { get: 'end:flows.principalRepay' }, lt: 0, note: '新贷款少于还本' }, { get: 'end:rates.policy', lt: 0.005, note: '利率接近 0' }, { get: 'max:macro.unemployment', gt: 0.08, note: '失业率高' }],
        hl: ['newLoans', 'principalRepay', 'policyRate'], concept: ['creditImpulse', 'policyRate'] },

      { type: 'reveal', until: '2009Q4', title: '第 2 步：政府的两条管',
        text: [
          '这时候政府出手了。财政注入（紫管）变粗：政府花得比收得多，多出来的部分是**新水**。',
          '新水分两路流出去：**订单**流向企业（采购、修路），**转移支付**流向家庭（失业金、退税、补贴）。',
        ],
        question: '政府花的钱，是先到企业手里，还是先到家庭手里？',
        answerHint: [
          '两条都有。订单直接变成企业的收入，企业保住工人；转移支付进了家庭的口袋，家庭拿去还债或消费。',
          '失业越高，转移支付越多（失业金是自动加码的）。这笔新水来自赤字，所以政府债务/GDP 一路往上走。',
        ],
        relation: '政府是第二个泵（第 0 课：泵一共三个）。私人那个泵缩小了，这个泵变大。',
        metrics: [{ label: '财政注入（新水，十亿美元/季）', get: 'flows.fiscalInjection', fmt: 'num' }, { label: '订单 → 企业', get: 'flows.govPurchases', fmt: 'num' }, { label: '转移支付 → 家庭', get: 'flows.transfers', fmt: 'num' }, { label: '政府债务 / GDP', get: 'gov.debtGdp', fmt: 'pct' }],
        claims: [{ get: 'dpp:gov.debtGdp', gt: 0.02, note: '政府债务/GDP 上升' }, { get: 'min:flows.fiscalInjection', gt: 50, note: '财政注入一直在' }, { get: 'min:flows.govPurchases', gt: 0 }, { get: 'min:flows.transfers', gt: 0 }],
        glow: { pipes: ['govPurchases', 'transfers'], parts: ['government'] },
        hl: ['fiscalInjection'], concept: ['fiscalInjection', 'govPurchases', 'transfers'] },

      { type: 'reveal', until: '2010Q4', title: '第 3 步：央行也来灌水',
        text: [
          `利率已经贴地（≤ ${p1(R('cb_qe', 'floorRate'))}），失业还高（> ${p1(R('cb_qe', 'uOn'))}），通胀也不高。降息这个旋钮拧到头了，央行改用第二个旋钮：**QE**。`,
          `央行直接买长期国债，规模每年约 ${p0(R('cb_qe', 'sizeGdp'))} GDP。看这个：QE 的管（粉色）亮了，总水量往上走。`,
        ],
        question: '央行买的是长期国债，为什么房价、股价也会被托起来？',
        answerHint: [
          '央行付的是新水：卖债的人账户里多了存款。这些水要找地方去，大部分流进了资产池。',
          '所以 QE 先托起的是**资产价格**（国债最先，然后股票、房产），不是商品河道。下一课会专门看这一点。',
        ],
        relation: '三个泵里，QE 是央行的。它不经过银行的闸门，所以银行不放贷的时候也能补水。',
        metrics: [{ label: 'QE（十亿美元/季）', get: 'flows.qe', fmt: 'num' }, { label: '总水量 M', get: 'money.M', fmt: 'tn' }, { label: '国债价格指数', get: 'assets.bond.price', fmt: 'idx' }, { label: '股价指数', get: 'assets.equity.price', fmt: 'idx' }],
        claims: [{ get: 'sum:flows.qe', gt: 100, note: 'QE 在买' }, { get: 'dpp:money.M', gt: 0, note: '总水量上升' }, { get: 'chg:assets.bond.price', gt: 0, note: '国债价格上升' }, { get: 'chg:assets.equity.price', gt: 0, note: '股价上升' }],
        glow: { pipes: ['qe'], parts: ['centralBank'] },
        hl: ['qe'], concept: ['qe'] },

      { type: 'predict', until: '2012Q4', title: '第 4 步：猜一猜',
        q: '2010 年底，QE 停了，财政注入也一步步收回；私人部门仍然几乎不借钱。接下来两年，总水量 M 会怎样？',
        options: [
          { t: '继续快速上涨', ok: false, when: [{ get: 'chg:money.M', gt: 0.03 }] },
          { t: '停住，略有回落', ok: true, when: [{ get: 'chg:money.M', lt: 0 }, { get: 'chg:money.M', gt: -0.1 }] },
          { t: '大幅缩水', ok: false, when: [{ get: 'chg:money.M', lt: -0.1 }] },
        ],
        vals: [
          { key: 'fi0', get: 'start:flows.fiscalInjection', fmt: 'num' }, { key: 'fi1', get: 'end:flows.fiscalInjection', fmt: 'num' },
          { key: 'nl', get: 'avg:flows.newLoans', fmt: 'num' }, { key: 'rep', get: 'avg:flows.principalRepay', fmt: 'num' },
          { key: 'dm', get: 'chg:money.M', fmt: 'chg1' },
        ],
        explain: [
          '两个泵都在缩：财政注入从每季 {fi0} 降到 {fi1}，QE 已经停了。',
          '排水口还在抽：还本平均每季 {rep}，新贷款平均只有 {nl}（十亿美元）。泵入 < 排出，水位慢慢退，这两年总水量 {dm}。',
          '补水一撤，没有人接棒，水就回落。注意：模型里这段私人信贷空窗，比真实世界更深、更长（真实美国 2013 年前后家庭已开始重新借钱）。',
        ],
        metrics: [{ label: '总水量 M', get: 'money.M', fmt: 'tn' }, { label: '财政注入', get: 'flows.fiscalInjection', fmt: 'num' }, { label: '新贷款', get: 'flows.newLoans', fmt: 'num' }, { label: '还本', get: 'flows.principalRepay', fmt: 'num' }],
        claims: [{ get: 'end:flows.qe', lt: 1, note: 'QE 已停' }, { get: 'dpp:flows.fiscalInjection', lt: 0, note: '财政注入在收回' }, { get: 'avg:flows.newLoans', vs: { get: 'avg:flows.principalRepay' }, lt: 0, note: '新贷款 < 还本' }],
        hl: ['fiscalInjection', 'newLoans', 'principalRepay'] },

      { type: 'experiment', from: '2008Q3', until: '2014Q4', title: '第 5 步：动手改',
        text: [
          '你来当总指挥：时间倒回 2008Q3，选一个方案重跑到 2014Q4。',
          '注意：失业金这类「自动加码」关不掉。你关的，是政府的「主动加码」规则和央行的 QE。',
        ],
        choices: [
          { label: '财政加码 + QE 都按规则', short: '都开', set: {} },
          { label: '关掉政府的主动加码', short: '关财政', set: { rules: { gov_stimulus: false } } },
          { label: '关掉 QE', short: '关 QE', set: { rules: { cb_qe: false } } },
          { label: '两个泵都关', short: '都关', set: { rules: { gov_stimulus: false, cb_qe: false } } },
        ],
        compareAll: true,
        metrics: [
          { key: 'u', label: '失业率峰值', get: 'max:macro.unemployment', fmt: 'pct' },
          { key: 'h', label: '房价最低值', get: 'min:assets.housing.price', fmt: 'idx' },
          { key: 'g', label: '期末名义 GDP', get: 'end:macro.gdpNominal', fmt: 'tn' },
          { key: 'd', label: '期末政府债务 / GDP', get: 'end:gov.debtGdp', fmt: 'pct' },
        ],
        insight: [
          '**QE 托资产**：关掉 QE，房价最低跌到 {h.2}（都开：{h.0}）；两个都关，房价最低 {h.3}。',
          '**财政托收入**：关掉主动加码，期末名义 GDP {g.1}（都开：{g.0}），政府债务/GDP {d.1}（都开：{d.0}）。补水少了，债务看上去轻一点，但经济也小一点。',
          '失业率峰值几乎一样（{u.0} 对 {u.3}）：最高点出现在补水刚开始的时候，还来不及起作用。补水有代价：政府债务/GDP，就是它的账单。',
        ],
        claims: [
          { get: 'min:assets.housing.price', set: { rules: { cb_qe: false } }, vs: { set: {} }, lt: -3, from: '2008Q3', until: '2014Q4', note: '关 QE → 房价更低' },
          { get: 'min:assets.housing.price', set: { rules: { gov_stimulus: false, cb_qe: false } }, vs: { set: {} }, lt: -3, from: '2008Q3', until: '2014Q4', note: '都关 → 房价更低' },
          { get: 'end:macro.gdpNominal', set: { rules: { gov_stimulus: false } }, vs: { set: {} }, lt: 0, from: '2008Q3', until: '2014Q4', note: '关财政 → GDP 更小' },
          { get: 'end:gov.debtGdp', set: { rules: { gov_stimulus: false } }, vs: { set: {} }, lt: 0, from: '2008Q3', until: '2014Q4', note: '关财政 → 债务/GDP 更低' },
          { get: 'max:macro.unemployment', set: { rules: { gov_stimulus: false, cb_qe: false } }, vs: { set: {} }, lte: 0.01, gte: -0.01, from: '2008Q3', until: '2014Q4', note: '失业率峰值几乎一样' },
        ],
        hl: ['fiscalInjection', 'qe'] },

      { type: 'reveal', from: '2008Q3', until: '2014Q4', title: '第 6 步：大周期盘走到哪了', tab: 'cycle',
        text: [
          '这六年，大周期盘的指针一格一格往前走：② 缓冲池满 → ⑤ 降息失灵、私人去杠杆 → ⑥ 政府接手 → ⑦ 金融压制、增长化债。',
          '（切到「周期」页，看盘面和下面的趋势带。）',
        ],
        question: '政府和央行把水补回去之后，大周期盘上哪一格会亮起来？',
        vals: [
          { key: 'd5', get: 'when:cycles.long.stage=5', fmt: 'str' }, { key: 'd6', get: 'when:cycles.long.stage=6', fmt: 'str' }, { key: 'd7', get: 'when:cycles.long.stage=7', fmt: 'str' },
          { key: 'l', get: 'end:cycles.long.label', fmt: 'str' },
        ],
        answerHint: [
          '⑥ 政府接手：政府债务/GDP 在涨（或赤字很大），同时 QE 在买或利率贴着 0，而且连续好几个季度都是这样，指针才会挪。',
          '本模型里：{d5} 进 ⑤，{d6} 进 ⑥，{d7} 进 ⑦（现在是：{l}）。',
        ],
        relation: '⑥ 不是终点。名义增长 > 利率，债务一年年变轻，才进 ⑦。补水的账，是靠时间慢慢「化」掉的。',
        claims: [{ get: 'when:cycles.long.stage=5', dateBefore: 'when:cycles.long.stage=6', note: '⑤ 先于 ⑥' }, { get: 'when:cycles.long.stage=6', dateBefore: 'when:cycles.long.stage=7', note: '⑥ 先于 ⑦' }],
        hl: ['fiscalInjection', 'qe'], concept: ['longCycle', 'fiscalInjection'] },

      { type: 'chain', title: '第 7 步：把整条因果链串起来',
        text: ['⑤ → ⑥ 的整条链：私人退，公共进。点任何一环，图里对应的水管会亮。'],
        links: [
          { text: '私人退潮：降息到 0，新贷款仍少于还本，排水口在净抽水（⑤）', pipe: ['newLoans', 'principalRepay'], part: 'bank', hl: ['policyRate'], term: 'creditImpulse' },
          { text: '政府是第二个泵：赤字造出新水，分成订单（给企业）和转移支付（给家庭）', pipe: ['fiscalInjection', 'govPurchases', 'transfers'], part: 'government', term: 'fiscalInjection' },
          { text: '央行是第三个泵：QE 买长期国债，新水先流进资产池', pipe: 'qe', part: 'centralBank', term: 'qe' },
          { text: '资产价格被托起，抵押品回路慢慢松开；失业回落，税收回升', pipe: ['toHousing', 'collateral'], part: 'poolHousing', term: 'housePrice' },
          { text: '代价：政府债务/GDP 升高；补水一撤，没人接棒，水位又回落', pipe: 'fiscalInjection', part: 'government', term: 'interestToTax' },
          { text: '大周期盘：② → ⑤ → ⑥ → ⑦，债务靠增长和低利率慢慢化掉', part: 'cycle', term: 'longCycle' },
        ], next: 5 },
    ],
  },

  /* ----------------------------------------------------------------------------------------------------------------- 5 */
  {
    id: 5,
    title: '加入企业：Capex 与产能',
    oneLine: '需求冲到产能上限就出现通胀（B1）；产能要靠 Capex，且有滞后。',
    rulesOn: 'all', pace: 800,
    startDate: '2019Q1', endDate: '2023Q4', mode: 'history', available: true,
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**结论：需求冲过产能，溢出来的那部分水就变成物价（B1）。河道只有 Capex 能拓宽，而且要等好几个季度。**',
          '像一条河：上游突然猛放水，河道却因为施工变窄了，水就漫出河堤。',
          '下面分 7 步：① 河道变窄 ② 政府发钱 ③ 水漫堤 ④ 猜一猜 ⑤ 河道何时变宽 ⑥ 动手改 ⑦ 因果链。',
          '时间：2019Q1 → 2023Q4。2022 年以后是保留样本（图上灰色区），只作示意。',
        ],
        hl: ['capacity', 'capex', 'cpi'], concept: ['capacity', 'B1'] },

      { type: 'reveal', until: '2020Q3', title: '第 1 步：河道突然变窄',
        text: [
          '2020 年的疫情封锁：工厂停工，商店关门。能产出的东西一下子变少了，也就是**有效产能下降**。',
          '同时需求也塌了：失业率一下子冲到高位。',
        ],
        question: '产能掉了，需求也掉了。物价为什么没有马上涨？',
        vals: [{ key: 'cd', get: 'dd:macro.capacity', fmt: 'chg1' }, { key: 'pm', get: 'min:macro.demandPressure', fmt: 'pct' }, { key: 'up', get: 'max:macro.unemployment', fmt: 'pct' }],
        answerHint: [
          '因为需求掉得更多：需求压力一度是 {pm}（负的，需求比产能少）。河道窄了，水少得更多，没有漫堤。',
          '真正的麻烦在后面：封锁结束，产能要慢慢恢复，需求却会很快回来。',
        ],
        relation: '第 0 课说过：河道的宽度是产能。这次河道是被外面「卡窄」的，不是 Capex 拓宽的。',
        metrics: [{ label: '有效产能（十亿美元）', get: 'macro.capacity', fmt: 'num' }, { label: '需求压力', get: 'macro.demandPressure', fmt: 'pct' }, { label: '失业率', get: 'macro.unemployment', fmt: 'pct' }],
        claims: [{ get: 'dd:macro.capacity', lt: -0.02, note: '有效产能下降' }, { get: 'min:macro.demandPressure', lt: -0.05, note: '需求压力一度为负' }, { get: 'max:macro.unemployment', gt: 0.09, note: '失业冲高' }],
        hl: ['capacity', 'goodsChannel'], concept: ['capacity', 'outputGap'] },

      { type: 'reveal', until: '2021Q2', title: '第 2 步：政府发钱',
        text: [
          '2020 年下半年到 2021 年，政府给家庭发了大量的钱：转移支付（紫色分支）一下子变粗。',
          '这是新水（赤字泵），而且几乎全进了家庭的口袋。',
        ],
        question: '河道还没恢复，家庭手里却多了很多钱。这些钱花出去，会怎样？',
        answerHint: [
          '钱变成消费，涌向商品河道。需求恢复得比产能快，需求压力由负转正。',
          '第 4 课补水是为了填坑；这次坑早就平了，再灌水就容易漫堤。',
        ],
        relation: '同一个财政泵，在第 4 课是救命水，在这里变成推高物价的水。看的是河道还有没有空位。',
        metrics: [{ label: '转移支付 → 家庭（十亿美元/季）', get: 'flows.transfers', fmt: 'num' }, { label: '财政注入（新水）', get: 'flows.fiscalInjection', fmt: 'num' }, { label: '需求压力', get: 'macro.demandPressure', fmt: 'pct' }, { label: '通胀', get: 'macro.inflation', fmt: 'pct' }],
        claims: [{ get: 'dpp:flows.transfers', gt: 0, note: '转移支付变粗' }, { get: 'end:macro.demandPressure', gt: 0.01, note: '需求压力转正' }, { get: 'start:macro.demandPressure', lt: 0, note: '之前是负的' }],
        glow: { pipes: ['transfers'], parts: ['government', 'household'] },
        hl: ['fiscalInjection', 'goodsChannel'], concept: ['transfers', 'fiscalInjection'] },

      { type: 'reveal', until: '2022Q2', title: '第 3 步：水漫堤',
        text: [
          '需求压力一直是正的：需求比产能多出来的那一块水，没有地方去。',
          '它溢出来，抬高商品河道的水位，也就是通胀。',
        ],
        question: '需求超过产能的那一块水，最后去了哪里？',
        vals: [{ key: 'ip', get: 'max:macro.inflation', fmt: 'pct' }, { key: 'ipd', get: 'argmax:macro.inflation', fmt: 'str' }, { key: 'pk', get: 'max:macro.demandPressure', fmt: 'pct' }],
        answerHint: [
          '溢出成价格。河道装不下的水，只能抬高水位。需求压力最高 {pk}，通胀最高 {ip}（{ipd}）。',
          '这就是 B1：过热，溢出到物价。',
        ],
        relation: '第 0 课说过：买资产的水推资产水位，买东西的水推物价水位。这次是买东西的水太多、河道又太窄。',
        metrics: [{ label: '通胀', get: 'macro.inflation', fmt: 'pct' }, { label: '需求压力', get: 'macro.demandPressure', fmt: 'pct' }, { label: '有效产能（十亿美元）', get: 'macro.capacity', fmt: 'num' }],
        claims: [{ get: 'max:macro.inflation', gt: 0.04, note: '通胀冲高' }, { get: 'min:macro.demandPressure', gt: 0, note: '需求压力一直为正' }, { get: 'end:macro.inflation', gt: 0.04 }],
        hl: ['cpi', 'goodsChannel', 'capacity'], concept: ['cpi', 'B1'] },

      { type: 'predict', until: '2023Q4', title: '第 4 步：猜一猜', tab: 'cycle',
        q: '通胀已经冲到 {ip}，央行开始加息：政策利率从 {p0} 一路加到 {p1}。到 2023Q4，通胀会怎样？',
        options: [
          { t: '仍然在高位，甚至更高', ok: false, when: [{ get: 'end:macro.inflation', vs: { get: 'start:macro.inflation' }, gt: -0.005 }] },
          { t: '明显回落', ok: true, when: [{ get: 'end:macro.inflation', vs: { get: 'start:macro.inflation' }, lt: -0.015 }] },
          { t: '先掉到 0 以下', ok: false, when: [{ get: 'min:macro.inflation', lt: 0 }] },
        ],
        vals: [
          { key: 'ip', get: 'start:macro.inflation', fmt: 'pct' }, { key: 'p0', get: 'start:rates.policy', fmt: 'pct' }, { key: 'p1', get: 'max:rates.policy', fmt: 'pct' },
          { key: 'i1', get: 'end:macro.inflation', fmt: 'pct' }, { key: 'u0', get: 'start:macro.unemployment', fmt: 'pct' }, { key: 'u1', get: 'end:macro.unemployment', fmt: 'pct' },
          { key: 'b1', get: 'when:cycles.short.phase=B1', fmt: 'str', from: '2019Q1', until: '2023Q4' },
        ],
        explain: [
          '加息先改新贷款的价格，再慢慢传到房价、需求。需求压力被压下来，溢出的水少了，通胀回落到 {i1}。',
          '代价是失业：{u0} → {u1}。降温不是免费的。',
          '看「周期」页：小周期盘要通胀 > 3.5% 且央行在加息，连续几个季度才亮 B1 过热，这次到 {b1} 才亮。它比通胀慢半拍。',
        ],
        metrics: [{ label: '通胀', get: 'macro.inflation', fmt: 'pct' }, { label: '政策利率', get: 'rates.policy', fmt: 'pct' }, { label: '需求压力', get: 'macro.demandPressure', fmt: 'pct' }, { label: '失业率', get: 'macro.unemployment', fmt: 'pct' }],
        claims: [{ get: 'dpp:rates.policy', gt: 0.03, note: '利率升了 3 个点以上' }, { get: 'dpp:macro.demandPressure', lt: -0.05, note: '需求压力被压下来' }, { get: 'dpp:macro.unemployment', gt: 0, note: '失业上升' },
          { get: 'when:cycles.short.phase=B1', from: '2019Q1', until: '2023Q4', dateBetween: ['2021Q4', '2023Q4'], note: '小周期盘亮 B1' }],
        hl: ['policyRate', 'cpi'], concept: ['B1', 'policyRate', 'shortCycle'] },

      { type: 'reveal', title: '第 5 步：河道何时变宽',
        text: [
          '企业看到需求压力为正，从 2021 年起加大 Capex。',
          'Capex 先是**需求**（当季花出去的钱），过了约 6 个季度的施工期，才变成**产能**。',
        ],
        question: '2021 年 Capex 就加码了，为什么 2022 年通胀还在涨？',
        vals: [
          { key: 'c1', get: 'chg:macro.capacityPotential', fmt: 'chg1', from: '2020Q4', until: '2022Q2' },
          { key: 'c2', get: 'chg:macro.capacityPotential', fmt: 'chg1', from: '2022Q2', until: '2023Q4' },
          { key: 'm0', get: 'start:extra.capexMult', fmt: 'x2', from: '2020Q4', until: '2022Q4' }, { key: 'm1', get: 'max:extra.capexMult', fmt: 'x2', from: '2020Q4', until: '2022Q4' },
        ],
        answerHint: [
          '因为施工要时间。Capex 的钱当季就花出去了，先推高需求；新产能要等几个季度才到货。',
          '看数字：2020Q4 → 2022Q2 产能（潜在）只增加了 {c1}；2022Q2 → 2023Q4 增加了 {c2}。新产能到货的时候，通胀已经冲过顶了。（企业的 Capex 倍数 {m0} → {m1}。）',
        ],
        relation: '和第 0 课一样：买资产的水不拓宽河道，只有 Capex 能。但 Capex 有滞后，这个时间差，就是通胀的窗口。',
        metrics: [{ label: '产能（潜在，十亿美元）', get: 'macro.capacityPotential', fmt: 'num' }, { label: 'Capex（十亿美元/季）', get: 'flows.toCapex', fmt: 'num' }, { label: '通胀', get: 'macro.inflation', fmt: 'pct' }],
        claims: [{ get: 'chg:macro.capacityPotential', from: '2022Q2', until: '2023Q4', vs: { get: 'chg:macro.capacityPotential', from: '2020Q4', until: '2022Q2' }, gt: 0.01, note: '产能是后来才加速变宽的' },
          { get: 'max:extra.capexMult', from: '2020Q4', until: '2022Q4', vs: { get: 'start:extra.capexMult', from: '2020Q4', until: '2022Q4' }, gt: 0.1, note: '2021 年起 Capex 加码' }],
        hl: ['capex', 'capacity'], concept: ['capex', 'capacity'] },

      { type: 'experiment', from: '2019Q1', until: '2023Q4', title: '第 6 步：动手改',
        text: [
          '你来当总指挥：时间倒回 2019Q1，选一个方案重跑到 2023Q4，比较通胀和产能。',
          '财政方案改的是「注入的上限」；Capex 方案改的是企业扩张的上限和步子。',
        ],
        choices: [
          { label: '默认（财政和 Capex 照规则）', short: '默认', set: {} },
          { label: '财政少发钱：注入上限压到 3% GDP', short: '少发钱', set: { params: { 'gov_stimulus.max': 0.03 } } },
          { label: '企业不扩 Capex', short: '不扩 Capex', set: { rules: { firm_capex_up: false } } },
          { label: '企业大力扩 Capex（上限 ×1.5）', short: '大力 Capex', set: { params: { 'firm_capex_up.max': 1.5, 'firm_capex_up.step': 0.1 } } },
        ],
        compareAll: true,
        metrics: [
          { key: 'ip', label: '通胀峰值', get: 'max:macro.inflation', fmt: 'pct' },
          { key: 'pp', label: '需求压力峰值', get: 'max:macro.demandPressure', fmt: 'pct' },
          { key: 'cp', label: '期末产能（十亿美元）', get: 'end:macro.capacityPotential', fmt: 'num' },
          { key: 'db', label: '期末政府债务 / GDP', get: 'end:gov.debtGdp', fmt: 'pct' },
        ],
        insight: [
          '**财政少发钱**：通胀峰值 {ip.1}（默认 {ip.0}），政府债务/GDP {db.1}（默认 {db.0}）。少发的钱，就是少漫出去的水。',
          '**企业不扩 Capex**：需求压力峰值 {pp.2}（默认 {pp.0}），但期末产能也只有 {cp.2}（默认 {cp.0}）。',
          '**企业大力扩 Capex**：需求压力峰值反而更高，{pp.3}；期末产能 {cp.3}。Capex 先是需求，几年后才是产能。',
        ],
        claims: [
          { get: 'max:macro.inflation', set: { params: { 'gov_stimulus.max': 0.03 } }, vs: { set: {} }, lt: 0, from: '2019Q1', until: '2023Q4', note: '少发钱 → 通胀峰值更低' },
          { get: 'end:gov.debtGdp', set: { params: { 'gov_stimulus.max': 0.03 } }, vs: { set: {} }, lt: 0, from: '2019Q1', until: '2023Q4', note: '少发钱 → 债务/GDP 更低' },
          { get: 'max:macro.demandPressure', set: { rules: { firm_capex_up: false } }, vs: { set: {} }, lt: 0, from: '2019Q1', until: '2023Q4', note: '不扩 Capex → 压力峰值更低' },
          { get: 'end:macro.capacityPotential', set: { rules: { firm_capex_up: false } }, vs: { set: {} }, lt: 0, from: '2019Q1', until: '2023Q4', note: '不扩 Capex → 产能更小' },
          { get: 'max:macro.demandPressure', set: { params: { 'firm_capex_up.max': 1.5, 'firm_capex_up.step': 0.1 } }, vs: { set: {} }, gt: 0, from: '2019Q1', until: '2023Q4', note: '大力 Capex → 压力峰值更高' },
          { get: 'end:macro.capacityPotential', set: { params: { 'firm_capex_up.max': 1.5, 'firm_capex_up.step': 0.1 } }, vs: { set: {} }, gt: 0, from: '2019Q1', until: '2023Q4', note: '大力 Capex → 产能更大' },
        ],
        hl: ['capex', 'capacity', 'fiscalInjection'] },

      { type: 'chain', title: '第 7 步：把整条因果链串起来',
        text: ['B1 的整条链：先是河道变窄，再是水涌进来，最后溢出成物价。点任何一环，图里对应的水管会亮。'],
        links: [
          { text: '疫情封锁：河道变窄（有效产能下降），需求更低，暂时没漫堤', part: 'channel', hl: ['capacity'], term: 'capacity' },
          { text: '政府发钱（转移支付）：新水进了家庭的口袋', pipe: ['fiscalInjection', 'transfers'], part: 'government', term: 'transfers' },
          { text: '家庭花钱：水涌向商品河道，需求超过产能', pipe: 'toConsumption', part: 'channel', term: 'goodsChannel' },
          { text: '溢出的部分抬高物价水位：通胀（B1）', part: 'channel', hl: ['cpi'], term: 'cpi' },
          { text: '企业加大 Capex：先是需求，约 6 个季度后才变成产能', pipe: 'toCapex', part: 'capex', term: 'capex' },
          { text: '央行加息：新贷款、需求一起降温，通胀回落，代价是失业', pipe: 'newLoans', part: 'centralBank', hl: ['policyRate'], term: 'policyRate' },
        ], next: 6 },
    ],
  },

  /* ----------------------------------------------------------------------------------------------------------------- 6 */
  {
    id: 6,
    title: '加入投资者：资产面板',
    oneLine: '新增的水怎么在房、股、债、金之间分配，决定谁涨。',
    rulesOn: 'all', pace: 800,
    startDate: '2006Q2', endDate: '2023Q3', mode: 'history', available: true,
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**结论：新增的水流进哪个池子，哪个池子涨；而且同一个池子，在不同的「天气」里表现完全不同。**',
          '资产池有四个：房产、股票、长期国债、黄金。前三个有泉水（租金、分红、票息），黄金没有。',
          '下面分 7 步：① 四个池子 ② 恐慌天 ③ 猜一猜（通胀天） ④ 为什么 ⑤ 印钞天 ⑥ 动手改 ⑦ 因果链。',
          '我们挑三种天气：2008–09 的恐慌，2022 的通胀加息，2009–19 的 QE 印钞。全程打开「资产」页。',
        ],
        tab: 'assets', hl: ['assetReservoir'], concept: ['assetReservoir'] },

      { type: 'reveal', from: '2006Q2', title: '第 1 步：四个池子，四种泉水', tab: 'assets',
        text: [
          '**房产**的泉水是租金，**股票**是分红，**长期国债**是票息。这些都是现金流，不用别人买，自己就会流进来。',
          '**黄金**没有泉水，什么也不产出，价格全靠大家信不信货币。',
          '现金是另一只水箱，不在这四个池子里。',
        ],
        question: '同样一笔新水，进房产和进黄金，最根本的不同是什么？',
        answerHint: [
          '房产、股票、国债有现金流：持有就有收入，价格有基本面托着。黄金没有，价格只靠信任。',
          '买一个已经存在的资产，只是买下它的「取水权」：抬高这个池子的水位，不会拓宽商品河道。',
        ],
        relation: '第 0 课说过：买资产的水推资产水位，买东西的水推物价水位。这一课要看的，就是新水在池子之间怎么分。',
        glow: { parts: ['poolHousing', 'poolEquity', 'poolBond', 'poolGold'] },
        hl: ['assetReservoir'], concept: ['cf', 'goldAsset', 'bondAsset', 'equityAsset'] },

      { type: 'reveal', from: '2006Q2', until: '2009Q3', title: '第 2 步：恐慌天（2006–09）', tab: 'assets', block: 'alloc',
        text: [
          '从房价见顶到雷曼倒闭：房价在跌，股价在跌，风险溢价冲高，信贷脉冲转负。',
          `投资者的「避险」规则触发（风险溢价 > ${p0(R('inv_riskoff', 'rp'))} 或信贷脉冲 < ${p1(R('inv_riskoff', 'ci'))}）：新增资金里现金份额 ×3，房产和金融资产份额 ×0.7，股票份额 ×0.5，国债份额放大。`,
        ],
        question: '恐慌的时候，新水往哪个池子逃？哪个池子的水位涨，哪个跌？',
        vals: [
          { key: 'hc', get: 'chg:assets.housing.price', fmt: 'chg' }, { key: 'ec', get: 'chg:assets.equity.price', fmt: 'chg' },
          { key: 'bc', get: 'chg:assets.bond.price', fmt: 'chg' }, { key: 'gc', get: 'chg:assets.gold.price', fmt: 'chg' },
          { key: 's0', get: 'start:share.toCash', fmt: 'pct0' }, { key: 's1', get: 'end:share.toCash', fmt: 'pct0' },
          { key: 'b0', get: 'start:share.toBond', fmt: 'pct0' }, { key: 'b1', get: 'end:share.toBond', fmt: 'pct0' },
          { key: 'h0', get: 'start:share.toHousing', fmt: 'pct0' }, { key: 'h1', get: 'end:share.toHousing', fmt: 'pct0' },
        ],
        answerHint: [
          '往现金和国债逃。新增资金里，现金份额 {s0} → {s1}，国债份额 {b0} → {b1}，房产份额 {h0} → {h1}。（先是现金份额冲高，央行开始 QE 买债之后，国债份额再跳上去。）',
          '价格也跟着分开：房价 {hc}，股价 {ec}，国债价格 {bc}，黄金 {gc}。这是通缩型危机：钱想要安全，国债就是避风港。',
        ],
        relation: '国债涨，是因为大家抢着买（还有央行 QE 在买），收益率往下掉。记住这一点：下一步，同样的国债会遇到完全不同的天气。',
        metrics: [{ label: '房产份额（新水）', get: 'share.toHousing', fmt: 'pct0' }, { label: '国债份额（新水）', get: 'share.toBond', fmt: 'pct0' }, { label: '现金份额（新水）', get: 'share.toCash', fmt: 'pct0' }, { label: '房价指数', get: 'assets.housing.price', fmt: 'idx' }, { label: '股价指数', get: 'assets.equity.price', fmt: 'idx' }, { label: '国债价格指数', get: 'assets.bond.price', fmt: 'idx' }],
        claims: [{ get: 'chg:assets.housing.price', lt: 0 }, { get: 'chg:assets.equity.price', lt: 0 }, { get: 'chg:assets.bond.price', gt: 0 }, { get: 'chg:assets.gold.price', gt: 0 },
          { get: 'dpp:share.toCash', gt: 0, note: '现金份额上升' }, { get: 'dpp:share.toBond', gt: 0, note: '国债份额上升' }, { get: 'dpp:share.toHousing', lt: 0, note: '房产份额下降' }],
        glow: { parts: ['poolBond', 'cash'], pipes: ['toBond', 'toCash'] },
        hl: ['assetReservoir'], concept: ['riskPremium', 'bondAsset', 'cashAsset'] },

      { type: 'predict', from: '2021Q4', until: '2023Q3', title: '第 3 步：猜一猜（通胀天）', tab: 'assets',
        q: '2021 年底，通胀已冲到 {pi}，央行开始加息：政策利率从 {p0} 一路加到 {p1}。这两年里，**长期国债**的价格会？',
        options: [
          { t: '上涨：国债是避风港', ok: false, when: [{ get: 'chg:assets.bond.price', gt: 0.02 }] },
          { t: '下跌：它也躲不开', ok: true, when: [{ get: 'chg:assets.bond.price', lt: -0.02 }] },
          { t: '基本不动', ok: false, when: [{ get: 'chg:assets.bond.price', gt: -0.02 }, { get: 'chg:assets.bond.price', lt: 0.02 }] },
        ],
        vals: [
          { key: 'pi', get: 'max:macro.inflation', fmt: 'pct' }, { key: 'p0', get: 'start:rates.policy', fmt: 'pct' }, { key: 'p1', get: 'max:rates.policy', fmt: 'pct' },
          { key: 'y0', get: 'start:rates.gov10y', fmt: 'pct' }, { key: 'y1', get: 'end:rates.gov10y', fmt: 'pct' },
          { key: 'bc', get: 'chg:assets.bond.price', fmt: 'chg' }, { key: 'gc', get: 'chg:assets.gold.price', fmt: 'chg' },
        ],
        explain: [
          '国债价格是收益率的跷跷板：收益率上升，价格下跌（久期约 8，收益率每升 1 个点，价格约降 8%）。',
          '10 年国债收益率 {y0} → {y1}，国债价格 {bc}。同一时间，黄金 {gc}。',
          '所以在**通胀型**危机里，国债不是避风港。避风港是谁，取决于天气。',
        ],
        metrics: [{ label: '10 年国债收益率', get: 'rates.gov10y', fmt: 'pct' }, { label: '国债价格指数', get: 'assets.bond.price', fmt: 'idx' }, { label: '黄金价格指数', get: 'assets.gold.price', fmt: 'idx' }, { label: '现金价格指数', get: 'assets.cash.price', fmt: 'idx' }],
        claims: [{ get: 'dpp:rates.gov10y', gt: 0.005, note: '收益率上升' }, { get: 'chg:assets.gold.price', gt: 0, note: '黄金上涨' }, { get: 'chg:assets.gold.price', vs: { get: 'chg:assets.bond.price' }, gt: 0.05, note: '黄金比国债强' }],
        glow: { parts: ['poolBond', 'poolGold'] },
        hl: ['assetReservoir'], concept: ['bondAsset', 'goldAsset'] },

      { type: 'reveal', title: '第 4 步：为什么国债这次没保护你', tab: 'assets',
        text: [
          '同样是危机，同样的国债：2008 年涨，2022 年跌。',
        ],
        question: '为什么 2008 年国债涨、2022 年国债跌？',
        vals: [
          { key: 'y0', get: 'start:rates.gov10y', fmt: 'pct', from: '2021Q4', until: '2023Q3' }, { key: 'y1', get: 'end:rates.gov10y', fmt: 'pct', from: '2021Q4', until: '2023Q3' },
          { key: 'e0', get: 'start:macro.inflationExp', fmt: 'pct', from: '2021Q4', until: '2023Q3' }, { key: 'e1', get: 'max:macro.inflationExp', fmt: 'pct', from: '2021Q4', until: '2023Q3' },
          { key: 'r', get: 'min:rates.realPolicy', fmt: 'pct', from: '2021Q4', until: '2023Q3' },
        ],
        answerHint: [
          '看通胀。2008 年通胀低，利率往下走，国债价格跟着涨。2022 年通胀高，央行加息，利率往上走，国债价格下跌。国债的价格由利率决定，不由「恐慌」决定。',
          '黄金为什么涨？通胀预期 {e0} → {e1}，实际政策利率最低 {r}。钱在贬值，大家不太信钱，黄金的份额和价格就上去了。黄金没有泉水，靠的就是这份「不信」。',
        ],
        relation: '这是第 2 课的跷跷板：加息 → 债价↓。也是投资者课里那条规则的另一面：不是所有危机，资金都往国债逃。',
        glow: { parts: ['poolBond', 'poolGold'], pipes: ['toBond', 'toGold'] },
        claims: [{ get: 'dpp:macro.inflationExp', gt: 0.005, from: '2021Q4', until: '2023Q3', note: '通胀预期上升' }, { get: 'min:rates.realPolicy', lt: -0.01, from: '2021Q4', until: '2023Q3', note: '实际利率为负' }, { get: 'dpp:rates.gov10y', gt: 0.005, from: '2021Q4', until: '2023Q3' }],
        hl: ['assetReservoir'], concept: ['bondAsset', 'goldAsset', 'realRate'] },

      { type: 'reveal', from: '2009Q1', until: '2019Q4', title: '第 5 步：印钞天（2009–19）', tab: 'assets', block: 'alloc',
        text: [
          '2009 年起，央行买债印钱，利率长期贴地。新水一波接一波。',
          '看这个：资产池（房、股、金）的水位涨了一倍到几倍，物价却一直不高。',
        ],
        question: '这么多新水，物价为什么没涨？',
        vals: [
          { key: 'hc', get: 'chg:assets.housing.price', fmt: 'chg' }, { key: 'ec', get: 'chg:assets.equity.price', fmt: 'chg' }, { key: 'gc', get: 'chg:assets.gold.price', fmt: 'chg' },
          { key: 'pi', get: 'avg:macro.inflation', fmt: 'pct' }, { key: 'pr', get: 'avg:macro.demandPressure', fmt: 'pct' }, { key: 'hs', get: 'avg:share.toHousing', fmt: 'pct0' },
        ],
        answerHint: [
          '因为这些水几乎都流进了资产池：新水里平均有 {hs} 流进房产。买资产只是买「取水权」，推高的是资产水位。',
          '商品河道那头一直没被填满：需求压力平均只有 {pr}，通胀平均 {pi}。结果是房价 {hc}，股价 {ec}，黄金 {gc}，物价却平平。',
        ],
        relation: '这是 ⑥ 阶段的标志：资产高、物价低。如果这些水流进的是商品河道，就是上一课的 B1。',
        metrics: [{ label: '房价指数', get: 'assets.housing.price', fmt: 'idx' }, { label: '股价指数', get: 'assets.equity.price', fmt: 'idx' }, { label: '黄金价格指数', get: 'assets.gold.price', fmt: 'idx' }, { label: '通胀', get: 'macro.inflation', fmt: 'pct' }],
        claims: [{ get: 'chg:assets.housing.price', gt: 0.5 }, { get: 'chg:assets.equity.price', gt: 1.0 }, { get: 'avg:macro.demandPressure', lt: 0.01, note: '需求压力一直不高' }, { get: 'avg:macro.inflation', lt: 0.035, note: '通胀不高' }, { get: 'avg:share.toHousing', gt: 0.3, note: '新水大头进房产' }],
        glow: { parts: ['poolHousing', 'poolEquity', 'poolGold'], pipes: ['qe'] },
        hl: ['assetReservoir', 'qe'], concept: ['assetReservoir', 'qe'] },

      { type: 'experiment', from: '2009Q1', until: '2019Q4', title: '第 6 步：动手改',
        text: [
          '你来当央行和投资者：时间倒回 2009Q1，选一个方案重跑到 2019Q4。',
          '看资产池的水位和物价怎么变。',
        ],
        choices: [
          { label: '默认（QE 和追涨都开）', short: '默认', set: {} },
          { label: '关掉 QE', short: '关 QE', set: { rules: { cb_qe: false } } },
          { label: '关掉投资者追涨', short: '关追涨', set: { rules: { inv_momentum: false } } },
        ],
        compareAll: true,
        metrics: [
          { key: 'h', label: '房价涨幅', get: 'chg:assets.housing.price', fmt: 'chg' },
          { key: 'e', label: '股价涨幅', get: 'chg:assets.equity.price', fmt: 'chg' },
          { key: 'b', label: '国债价格涨幅', get: 'chg:assets.bond.price', fmt: 'chg' },
          { key: 'pi', label: '平均通胀', get: 'avg:macro.inflation', fmt: 'pct' },
        ],
        insight: [
          '**关掉 QE**：房价涨幅 {h.1}（默认 {h.0}），股价 {e.1}（默认 {e.0}），国债价格 {b.1}（默认 {b.0}）；平均通胀 {pi.1} 对 {pi.0}，物价几乎没动。',
          '**关掉追涨**：追涨不造水，只把新水往涨得快的池子集中。关掉它，房产少拿一些（房价涨幅 {h.2}），股票多拿一些（股价涨幅 {e.2}）。',
        ],
        claims: [
          { get: 'chg:assets.housing.price', set: { rules: { cb_qe: false } }, vs: { set: {} }, lt: 0, from: '2009Q1', until: '2019Q4', note: '关 QE → 房价涨幅更小' },
          { get: 'chg:assets.equity.price', set: { rules: { cb_qe: false } }, vs: { set: {} }, lt: 0, from: '2009Q1', until: '2019Q4', note: '关 QE → 股价涨幅更小' },
          { get: 'chg:assets.bond.price', set: { rules: { cb_qe: false } }, vs: { set: {} }, lt: 0, from: '2009Q1', until: '2019Q4', note: '关 QE → 国债价格涨幅更小' },
          { get: 'avg:macro.inflation', set: { rules: { cb_qe: false } }, vs: { set: {} }, lte: 0.005, gte: -0.005, from: '2009Q1', until: '2019Q4', note: '关 QE → 物价几乎没动' },
          { get: 'chg:assets.housing.price', set: { rules: { inv_momentum: false } }, vs: { set: {} }, lt: 0, from: '2009Q1', until: '2019Q4', note: '关追涨 → 房价涨幅更小' },
          { get: 'chg:assets.equity.price', set: { rules: { inv_momentum: false } }, vs: { set: {} }, gt: 0, from: '2009Q1', until: '2019Q4', note: '关追涨 → 股票多拿一些，股价涨幅更大' },
        ],
        hl: ['assetReservoir', 'qe'] },

      { type: 'chain', title: '第 7 步：把整条因果链串起来',
        text: ['投资者不造水，只分水。点任何一环，图里对应的水管会亮。'],
        links: [
          { text: '新增的水（放贷、财政、QE）是原料，投资者决定往哪个池子送', pipe: ['newLoans', 'qe'], part: 'pool', term: 'assetReservoir' },
          { text: '房产有租金，股票有分红，国债有票息；黄金没有泉水，只靠信任', pipe: ['rent', 'dividends', 'coupons'], part: 'poolGold', term: 'cf' },
          { text: '恐慌（通缩型）：新水逃向现金和国债，房产、股票水位下降', pipe: ['toCash', 'toBond'], part: 'cash', term: 'riskPremium' },
          { text: '通胀 + 加息：国债价格随收益率下跌，不是避风港；黄金靠不信任上涨', pipe: 'toGold', part: 'poolBond', term: 'bondAsset' },
          { text: 'QE 印钞：新水大多进资产池，资产高、物价低', pipe: ['qe', 'toHousing', 'toEquity'], part: 'poolHousing', term: 'housePrice' },
          { text: '买资产只抬水位，不拓宽河道；水流进商品河道，才是通胀（B1）', pipe: 'toConsumption', part: 'channel', term: 'goodsChannel' },
        ], next: 7 },
    ],
  },

  /* ----------------------------------------------------------------------------------------------------------------- 7 */
  {
    id: 7,
    title: '全开：自由运行到 2050',
    oneLine: '所有角色一起动，从现在往后跑，看周期自己怎么走。',
    rulesOn: 'all', pace: 220,
    startDate: '2025Q4', endDate: '2050Q4', mode: 'free', available: true,
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**结论：自由运行 = 把历史关掉，所有角色按自己的规则一起动，一直跑到 2050 年。你要看两样东西：小周期在大周期里一圈圈重复；每次降息的谷底，是不是一次比一次低。**',
          '这一课不再有「标准答案」，只有一套规则在自己跑。你在图上看到的，就是这套规则的结果。',
          '下面分 5 步：① 谁来定利率 ② 小周期一圈圈转 ③ 猜一猜 ④ 利率谷底 ⑤ 整门课的因果链。',
          '时间：2025Q4 → 2050Q4。随时可以点右上角「↗ 自由运行」，在新窗口里自己玩。',
        ],
        hl: ['policyRate'], concept: ['longCycle', 'shortCycle'], freeLink: true },

      { type: 'reveal', until: '2029Q4', title: '第 1 步：历史播完了，谁来定利率', tab: 'ledger',
        text: [
          '真实数据到 2025Q4 为止。再往后，没有真实的联储路径，也没有外生的冲击（油价、疫情）。',
          '看这个：流水账里每季都有央行的一行。',
        ],
        question: '没有真实路径了，政策利率由谁来定？',
        vals: [{ key: 'n', get: 'count:rates.policy', fmt: 'num' }, { key: 'p0', get: 'start:rates.policy', fmt: 'pct' }, { key: 'p1', get: 'end:rates.policy', fmt: 'pct' }],
        answerHint: [
          '央行按自己的规则定：泰勒规则。目标利率 = 中性利率 + 通胀 + 对通胀偏离和失业缺口的反应，每季向目标靠一小步。',
          '这 4 年里政策利率从 {p0} 走到 {p1}。其他角色也各按各的规则：银行、家庭、企业、政府、投资者、外国。',
        ],
        relation: '前面每一课，我们都是只放开一个角色、其余照规则。这里是全放开。',
        claims: [{ get: 'count:rates.policy', gt: 3, note: '利率在变（由规则定）' }],
        ledgerClaim: { player: 'centralBank', re: '泰勒', min: 4 },
        hl: ['policyRate'], concept: ['policyRate'], freeLink: true },

      { type: 'watch', until: '2044Q4', title: '第 2 步：小周期一圈圈转', tab: 'cycle',
        text: [
          '切到「周期」页。小周期盘按「扩张 → 过热（B1）或缩水（B2）→ 收紧、衰退 → 降息重启 → 扩张」转；有时一圈要很多年。',
          '大周期盘更慢，要好几年才挪一格。整个 25 年里，小周期一共换了 {n} 次挡，大周期换了 {nl} 次挡。',
        ],
        vals: [{ key: 'n', get: 'count:cycles.short.phase', fmt: 'num', from: '2025Q4', until: '2050Q4' }, { key: 'nl', get: 'count:cycles.long.stage', fmt: 'num', from: '2025Q4', until: '2050Q4' }],
        metrics: [{ label: '小周期', get: 'cycles.short.label', fmt: 'str' }, { label: '大周期', get: 'cycles.long.label', fmt: 'str' }, { label: '政策利率', get: 'rates.policy', fmt: 'pct' }, { label: '失业率', get: 'macro.unemployment', fmt: 'pct' }],
        claims: [{ get: 'count:cycles.short.phase', from: '2025Q4', until: '2050Q4', gt: 2, note: '小周期换挡 ≥ 3 次' }, { get: 'count:cycles.long.stage', from: '2025Q4', until: '2050Q4', gt: 0, note: '大周期至少挪一格' }],
        hl: ['policyRate'], concept: ['shortCycle', 'longCycle'] },

      { type: 'predict', until: '2050Q4', title: '第 3 步：猜一猜',
        q: '自由运行里，没有人刻意去还政府的债。到 2050 年，政府债务占 GDP 的比例，会比 2025 年底？',
        options: [
          { t: '更低', ok: false, when: [{ get: 'dpp:gov.debtGdp', from: '2025Q4', until: '2050Q4', lt: -0.05 }] },
          { t: '差不多', ok: false, when: [{ get: 'dpp:gov.debtGdp', from: '2025Q4', until: '2050Q4', gt: -0.05 }, { get: 'dpp:gov.debtGdp', from: '2025Q4', until: '2050Q4', lt: 0.05 }] },
          { t: '更高', ok: true, when: [{ get: 'dpp:gov.debtGdp', from: '2025Q4', until: '2050Q4', gt: 0.05 }] },
        ],
        vals: [
          { key: 'g0', get: 'start:gov.debtGdp', fmt: 'pct0', from: '2025Q4', until: '2050Q4' }, { key: 'g1', get: 'end:gov.debtGdp', fmt: 'pct0', from: '2025Q4', until: '2050Q4' },
          { key: 'gm', get: 'max:gov.debtGdp', fmt: 'pct0', from: '2025Q4', until: '2050Q4' },
        ],
        explain: [
          '每一次衰退，政府都会出手补水（第 4 课）；每一次景气，它只是慢慢收回一点，不会把债还掉。',
          '所以债务一次比一次高：2025 年底 {g0}，2050 年 {g1}（途中最高 {gm}）。这就是「债务棘轮」。',
        ],
        claims: [{ get: 'dpp:gov.debtGdp', from: '2025Q4', until: '2050Q4', gt: 0.05, note: '债务/GDP 更高' }],
        metrics: [{ label: '政府债务 / GDP', get: 'gov.debtGdp', fmt: 'pct' }, { label: '大周期', get: 'cycles.long.label', fmt: 'str' }, { label: '小周期', get: 'cycles.short.label', fmt: 'str' }],
        hl: ['fiscalInjection'] },

      { type: 'reveal', title: '第 4 步：利率谷底，一次比一次低吗', tab: 'cycle',
        text: [
          '每个小周期的衰退，都靠降息收尾。降息的谷底如果一次比一次低，就是「利率棘轮」：债务越堆越高，央行能用的子弹越来越少，最后撞到 0。',
        ],
        question: '这一次自由运行里，利率谷底是不是一路往下走？',
        vals: [
          { key: 'a', get: 'min:rates.policy', fmt: 'pct', from: '2025Q4', until: '2034Q4' }, { key: 'b', get: 'min:rates.policy', fmt: 'pct', from: '2034Q4', until: '2042Q4' }, { key: 'c', get: 'min:rates.policy', fmt: 'pct', from: '2042Q4', until: '2050Q4' },
          { key: 'n', get: 'count:cycles.short.phase', fmt: 'num', from: '2025Q4', until: '2050Q4' }, { key: 'nl', get: 'count:cycles.long.stage', fmt: 'num', from: '2025Q4', until: '2050Q4' },
          { key: 'pv', get: 'max:household.dsr', fmt: 'pct', from: '2025Q4', until: '2050Q4' },
        ],
        answerHint: [
          '把 25 年切成三段，每段里最低的政策利率：{a} → {b} → {c}。你自己看是不是一路下降。',
          '这 25 年里小周期换了 {n} 次挡，大周期换了 {nl} 次挡。短周期一直在重复，长周期在慢慢挪。',
          '这个模型里，利率棘轮靠「私人债务/GDP 很高」触发（中性利率随私人债务升高而下降）。私人债务没堆得那么高，棘轮就不明显。结论要看规则，不是看口号。',
        ],
        relation: '这就是整门课的落点：规则是透明的，你可以关掉一条看看（比如在「自由运行」页关掉 QE），再对照这四个数。',
        claims: [{ get: 'min:rates.policy', from: '2025Q4', until: '2034Q4', gt: -1 }, { get: 'count:cycles.long.stage', from: '2025Q4', until: '2050Q4', gt: 0, note: '大周期至少挪一格' }],
        glow: { parts: ['centralBank'] },
        hl: ['policyRate'], concept: ['policyRate', 'longCycle'], freeLink: true },

      { type: 'chain', title: '第 5 步：整门课的因果链',
        text: ['最后，把整门课连成一条大链。点任何一环，图里对应的水管会亮；也可以按「依次点亮」从头放一遍。'],
        links: [
          { text: '银行放贷造水，同时记下欠条；还本排水，水和欠条一起消失（第 0 课）', pipe: ['newLoans', 'principalRepay'], part: 'iou', term: 'newLoans' },
          { text: '房价涨 → 抵押品变好 → 银行放宽 → 更多贷款买房 → 房价再涨：圈自己喂自己（第 1 课）', pipe: ['collateral', 'toHousing'], part: 'poolHousing', term: 'lvr' },
          { text: '央行加息的水管很长：存量房贷分批重定价，约两年后房价才转跌（第 2 课）', pipe: 'interestPaid', part: 'centralBank', hl: ['policyRate'], term: 'mortgageEff' },
          { text: '圈倒着转（B2）：房价↓ → 银行收紧 → 新贷款↓；降息打不开银行的闸门（第 3 课）', part: 'bank', hl: ['bankApproval'], term: 'creditImpulse' },
          { text: '私人去杠杆（⑤）：政府赤字和央行 QE 两个泵接手补水（⑥，第 4 课）', pipe: ['fiscalInjection', 'qe'], part: 'government', term: 'fiscalInjection' },
          { text: '需求冲过产能，溢出成物价（B1）；产能只有 Capex 能拓宽，且有滞后；央行加息降温（第 5 课）', pipe: ['toConsumption', 'toCapex'], part: 'channel', hl: ['cpi', 'capacity'], term: 'B1' },
          { text: '新增的水在房、股、债、金之间分配：恐慌逃向国债，通胀时国债下跌，QE 时资产高、物价低（第 6 课）', pipe: ['toBond', 'toGold', 'toEquity'], part: 'pool', term: 'assetReservoir' },
          { text: '小周期（扩张 → B1/B2 → 衰退 → 降息）在大周期（⑤ → ⑥ → ⑦ → ⑧ → ①）里一圈圈重复；每一圈债务更高、利率谷底是否更低，要看规则（第 7 课）', part: 'cycle', term: 'longCycle' },
        ], freeLink: true },
    ],
  },
];

export const LESSON_BY_ID = Object.fromEntries(LESSONS.map(l => [l.id, l]));
