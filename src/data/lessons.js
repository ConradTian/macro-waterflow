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
//   view:'waves'|'flow'   (any step) switch the left panel on entry: 'waves' = the curves view over the water diagram (US long-cycle chart,
//                         quarterly short-cycle chart + the game's own calls, long-cycle band; it moves with the cycle rings), 'flow' = the water diagram.
//                         Steps without `view` leave it as it is. A lesson starts on 'flow' and leaving the lesson restores 'flow'. Town steps have no curves.
//   map:{open:true|false, select?:'AUS', year?:2008}   (any step) dispatch mw:map to the world-map page. A step WITHOUT `map` closes a map that the
//                         lesson opened (so ‹ 上一步 returns to the main screen); leaving the lesson closes it too. open:true without `select` clears the selection.
// Lesson extras for the world lessons (kind:'world', menu group 「世界」): country:'AUS' = the lesson lives in that country's view; starting it goes to
//   ?country=AUS&lesson=<id> if COUNTRY_READY[iso] (src/data/countries/index.js), else it shows 「细图制作中」 and cannot be started. draft:true = outline only.
// WORLD NUMBERS: a vals/claims getter 'world:<path>@<year>' reads WORLD (src/data/world.js), e.g. 'world:countries.CHN.gdpUsd@2008' (USD bn),
//   'world:trade.CHN.USA@2008' (CHN exports to USA, USD bn), 'world:reserves.USD@2008' (share), 'world:ustForeign.CHN@2008'. '@last' = latest non-null year.
//   fmt 'bn' = 十亿美元, 'tn' = 万亿美元 (both take USD bn). No scratch sim is run for these.
// Never shown to the learner, only read by tools/check_lessons.mjs (so a retune cannot silently falsify a text):
//   predict option.when [cond]   the claim an option makes; exactly the ok option must hold
//   claims [cond]                every factual sentence of a step.  cond = { get, from?, until?, set?, vs?, mul?, gt|gte|lt|lte, dateBetween?, dateBefore? }

import { RULE_BY_ID } from '../engine/rules.js';
// the two big lessons after the main line (own files, own checkers): 汇率 (kind 'fx') and 投资者 (kind 'capstone'). Step field panel:{id,...}
// mounts an interactive panel (src/ui/lessons.js; contract tools/D-CONTRACT.md 「接线」).
import { LESSON_FX } from './lesson-fx.js';
import { LESSON_INVESTOR } from './lesson-investor.js';
const R =(id, k) => RULE_BY_ID[id].params[k];
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
          '模型里赤字大约一半算新水（另一半是存款人拿已有存款买国债，把已有的钱换个地方）。',
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
   * MAIN LINE (主线, ~1 hour, approved 2026-10-29): 5 lessons, kind 'main', ids m1..m5, menu group 「主线」 (see COURSE at the bottom).
   * Built mostly from the steps of lessons 0-4 + 3b; the old lessons stay in the code (menu group 「旧版课程」, ?lesson=ID still works).
   * Extra step fields used here (src/ui/lessons.js):
   *   mark:['loop'|'outlets'|'objective']   persistent glow while the step is on: the 收入循环 ring, the four outlets under the channel,
   *                                          the 总目标 strip (#objective)
   *   roleCard:'centralBank'|...|'economy'  the step shows that role card (roleCardHtml of src/ui/concepts.js) above its text
   *   next on the LAST step of any type      a 「下一课」 button (handover between lessons)
   *   townClaims (town steps of m1)          [{ at:'before'|'after', get:path, minus?:'before', gt|gte|lt|lte }] checked on the town replay
   *   ledgerAt   [{ player, ruleId, date? }] the ledger of that quarter (default: the step's quarter) has that rule entry
   * Getters 'gdp.<flow path>', 'out.C|I|G|NX', 'lamp.<id>', 'lamps.lit', '<a>/<b>' and fmt 'lamp': see getPath / fmtV in src/ui/lessons-town.js.
   * Claims may also test strings: eq:'red' / ne:'green'.
   * ===================================================================================================================== */
  {
    id: 'm1', kind: 'main', label: '第 1 课',
    title: '水从哪来、到哪去',
    oneLine: '银行放贷造水，还本把水销毁；水在经济里转圈，从四个出口运出真实的东西（GDP）。总目标：河里一直有水，不泛滥，也不干涸。',
    scenario: 'town', delays: false,   // steps 1-2 in the 万元 town (one action at a time), step 3 zooms to the US
    rulesOn: 'all', pace: 1600,
    mode: 'history', available: true,
    startParts: ['bank', 'household', 'iou'],
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**结论：银行放贷造出新水，还本把水销毁；水在经济里转圈，最后从四个出口运出真实的东西，这就是 GDP。总目标：让河里一直有足够的水，不泛滥，也不干涸。**',
          '前两步先在一个只有 5 户人家、1 家银行的小镇里看（钱用「万元」），一次只做一件事；第 3 步把同一张图放大到全美国。',
          '下面分 5 步：银行放贷造水 → 还本销毁 → 水转圈 → 四个出口 = GDP → 总目标。',
        ],
        hl: ['newLoans'], concept: ['M'] },

      { type: 'action', title: '第 1 步：银行放贷造水',
        text: [
          '小镇里现在一共有 **110 万元**的水（所有人的存款加起来）。',
          '小王想买房，手上只有 10 万元。他去镇银行，借了 **50 万元**。',
        ],
        question: '银行借给小王的 50 万，是从别人的存款里搬来的，还是凭空多出来的？',
        action: { type: 'loan', who: '小王', amount: 50 }, button: '让小王借 50 万',
        answerHint: ['凭空多出来的。银行不是搬水，而是在小王的账户上直接记一笔新存款，同时记一张欠条：小王欠银行 50。', '所以水和欠条是**一起出现**的。这个泵叫放贷泵：贷款创造新水。'],
        relation: '这是整张图的起点。水不是白来的，每一份新水都对应一张欠条（图里的欠条箱）。',
        metrics: [{ label: '小镇总水量（万元）', get: 'money.M', fmt: 'n1' }, { label: '欠条箱（万元）', get: 'iou.bankTotal', fmt: 'n1' }, { label: '小王的存款', get: 'town.households.0.deposit', fmt: 'n1' }],
        townClaims: [
          { at: 'before', get: 'money.M', gte: 109.95, lte: 110.05, note: '小镇一开始一共 110 万元' },
          { at: 'before', get: 'town.households.0.deposit', gte: 9.95, lte: 10.05, note: '小王手上 10 万元' },
          { at: 'after', get: 'money.M', minus: 'before', gte: 49.95, lte: 50.05, note: '借 50 万：总水量 +50' },
          { at: 'after', get: 'iou.bankTotal', minus: 'before', gte: 49.95, lte: 50.05, note: '欠条箱 +50' },
        ],
        hl: ['newLoans'], concept: ['M', 'newLoans'] },

      { type: 'action', title: '第 2 步：还本把水销毁', show: ['repay'],
        text: [
          '几个月后，小王把其中 **10 万元**还给了银行。',
          '看图：左边多了一个排水口。',
        ],
        question: '小王还的这 10 万，银行拿去干什么了？水还留在小镇里吗？',
        action: { type: 'repay', who: '小王', amount: 10 }, button: '让小王还 10 万',
        answerHint: ['不在了。还本的那一刻，这 10 万存款和对应的欠条**一起消失**。', '银行不是把水收进口袋，而是把它销毁。排水口就是销毁水的地方。'],
        relation: '放贷泵造水，排水口毁水。一进一出：河里的水涨还是退，就看哪边更大。',
        metrics: [{ label: '小镇总水量（万元）', get: 'money.M', fmt: 'n1' }, { label: '欠条箱（万元）', get: 'iou.bankTotal', fmt: 'n1' }],
        townClaims: [
          { at: 'after', get: 'money.M', minus: 'before', gte: -10.05, lte: -9.95, note: '还 10 万：总水量 −10' },
          { at: 'after', get: 'iou.bankTotal', minus: 'before', gte: -10.05, lte: -9.95, note: '欠条 −10，和水一起消失' },
        ],
        hl: ['principalRepay'], concept: ['principalRepay'] },

      { type: 'zoom', title: '第 3 步：水转圈（放大到美国）', date: '2015Q1', showAll: true,
        mark: ['loop'], glow: { pipes: ['toConsumption', 'wages', 'profits'] },
        text: [
          '**同一张图，放大到全美国（2015 年第一季度）。** 5 户人家变成上亿个家庭，万元变成十亿美元；泵、排水口、水管都还是那些。',
          '看中间那个亮起来的圈：**家庭花钱 → 钱成了企业的收入 → 企业付工资、留利润 → 钱回到家庭 → 再花一次。**',
          '水不会被花掉，它转圈。这一季，企业付给家庭的工资相当于 GDP 的 {w}（按一年算），企业留下的利润 {p}。',
        ],
        vals: [{ key: 'w', get: 'start:gdp.flows.wages', fmt: 'pct0' }, { key: 'p', get: 'start:gdp.flows.profits', fmt: 'pct0' }],
        claims: [
          { get: 'start:gdp.flows.wages', gt: 0.5, lt: 0.8, note: '工资是收入循环的大头（GDP 的一半以上）' },
          { get: 'start:gdp.flows.profits', gt: 0.05, lt: 0.25, note: '利润是小头' },
        ],
        relation: '放贷泵和排水口决定河里有多少水；收入循环决定这些水转得多快。前两步造出来的新水，就在这个圈里一圈圈转。',
        concept: ['income'] },

      { type: 'reveal', title: '第 4 步：四个出口 = GDP',
        mark: ['outlets'], glow: { pipes: ['outC', 'outI', 'outG', 'outNX'] },
        text: [
          '河道走到尽头，有四个出口：**家庭消费、企业投资、政府购买、净出口**（河道下面亮起来的那一排）。',
        ],
        question: '钱转圈不会用掉，那什么被用掉了？四个出口拿走的又是什么？',
        answerHint: [
          '用掉的是**货**：吃的、住的、机器、道路。四个出口拿走的货加起来，就是 GDP：一年运出多少真实的东西。',
          '2015Q1：家庭消费 {c}，企业投资 {i}，政府购买 {g}，净出口 {nx}（负数：买外国的货比卖给外国的多）。四个加起来是 100%。',
          '企业投资这个出口特别：拿走的是机器和厂房，它们会**变成更宽的河道**，以后能运出更多货。',
        ],
        relation: '钱是水，转圈；货是船上的东西，到了出口就卸下来用掉。GDP 量的是卸下来的货，不是河里的水。',
        vals: [{ key: 'c', get: 'start:out.C', fmt: 'pct0' }, { key: 'i', get: 'start:out.I', fmt: 'pct0' }, { key: 'g', get: 'start:out.G', fmt: 'pct0' }, { key: 'nx', get: 'start:out.NX', fmt: 'pct' }],
        claims: [
          { get: 'start:out.C', gt: 0.6, note: '家庭消费是最大的出口' },
          { get: 'start:out.I', gt: 0.1, note: '企业投资' },
          { get: 'start:out.G', gt: 0.08, note: '政府购买' },
          { get: 'start:out.NX', lt: 0, note: '净出口为负（买外国的多）' },
        ],
        hl: ['goodsChannel', 'capex'], concept: ['goodsChannel', 'capex', 'govPurchases'] },

      { type: 'reveal', title: '第 5 步：总目标', mark: ['objective'],
        text: [
          '**总目标：长期运出最多的真实东西给人用。** 看屏幕顶上亮起来的「总目标」条：那个数是每人真实消费（1995 年第一季度 = 100），一季一季累计得越多越好。',
          '条右边四盏灯是扣分项。这一课先看前两盏，正好是一条河的两种坏天气：',
          '**泛滥**：水太多，漫出河岸，物价涨得太快。现在通胀 {pi}，央行的目标是 2%：{lf}。',
          '**干涸**：水太少，河道闲着，人和工厂没活干。现在失业率 {u}：{ld}。',
          '另外两盏，**溃坝**（借来的水冲垮堤坝：金融危机）和**透支**（借得太多，利息吃掉收入），第 3、4 课再讲。',
        ],
        relation: '下面四课都在问同一个问题：什么力量让河道泛滥或干涸？谁能把它拉回来？',
        vals: [
          { key: 'pi', get: 'start:macro.inflation', fmt: 'pct' }, { key: 'u', get: 'start:macro.unemployment', fmt: 'pct' },
          { key: 'lf', get: 'start:lamp.flood', fmt: 'lamp' }, { key: 'ld', get: 'start:lamp.drought', fmt: 'lamp' },
        ],
        claims: [
          { get: 'start:lamp.flood', eq: 'green', note: '泛滥灯绿' },
          { get: 'start:lamp.drought', eq: 'green', note: '干涸灯绿' },
        ],
        concept: ['cpi', 'unemployment'], next: 'm2' },
    ],
  },

  {
    id: 'm2', kind: 'main', label: '第 2 课',
    title: '一个会自己转的圈',
    oneLine: '房价涨 → 抵押品值钱 → 银行放水 → 更多人借钱买房 → 房价再涨。央行加息能刹住它，可要等大约两年。',
    rulesOn: 'all',
    startDate: '1997Q1', endDate: '2008Q1', mode: 'history', available: true,
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**结论：房价涨 → 抵押品值钱 → 银行放水 → 更多人借钱买房 → 房价再涨。这个圈自己会转。央行加息能刹住它，但要等大约两年才见效。**',
          '像一座水库：下游水位越高，上游越敢放水，下游水位就更高。关小总闸以后，水还要流过很长的管子，下游过一阵才感觉到。',
          '下面分 3 步：抵押品回路 → 央行加息 → 为什么两年才见效。',
          '时间：1997Q1 → 2008Q1（真实季度）。',
        ],
        hl: ['bankApproval', 'newLoans', 'assetReservoir'], concept: ['lvr'] },

      { type: 'watch', until: '2001Q2', title: '第 1 步：抵押品回路',
        glow: { parts: ['bank', 'poolHousing'], pipes: ['collateral'] },
        text: [
          '看图左边那根虚线「抵押品」：它从房产水池连回银行。',
          `银行每季看两样东西：房价比一年前涨了多少、坏账多不多。房价涨得快（> ${p1(R('bank_loosen', 'hp'))}），手里的抵押品就值钱；坏账又少（< ${p1(R('bank_loosen', 'bad'))}），银行就放宽审批：审批倍数从 {a0} 开到 {a1}，新贷款（蓝管）跟着变粗。`,
          `家庭看到房价比一年前涨了 ${p1(R('hh_chase', 'up'))} 以上，也会想「还会涨」，借得更多。两边一起把水抽进房产：这 4 年房价涨了 {hc}。`,
          '圈在转，代价也在攒：家庭还本付息占收入的比例（DSR）从 {d0} 升到 {d1}。',
        ],
        vals: [
          { key: 'a0', get: 'start:bank.approval', fmt: 'x2' }, { key: 'a1', get: 'end:bank.approval', fmt: 'x2' },
          { key: 'hc', get: 'chg:assets.housing.price', fmt: 'chg' },
          { key: 'd0', get: 'start:household.dsr', fmt: 'pct' }, { key: 'd1', get: 'end:household.dsr', fmt: 'pct' },
        ],
        metrics: [{ label: '审批倍数', get: 'bank.approval', fmt: 'x2' }, { label: '新贷款（十亿美元/季）', get: 'flows.newLoans', fmt: 'num' }, { label: '房价指数', get: 'assets.housing.price', fmt: 'idx' }],
        claims: [
          { get: 'dpp:bank.approval', gt: 0.03, note: '审批倍数往上走' },
          { get: 'max:extra.houseYoY', gt: R('bank_loosen', 'hp'), note: '房价涨得比放宽线快' },
          { get: 'max:extra.houseYoY', gt: R('hh_chase', 'up'), note: '房价比一年前超过追涨线' },
          { get: 'min:bank.badLoanRate', lt: R('bank_loosen', 'bad'), note: '坏账少' },
          { get: 'chg:assets.housing.price', gt: 0.03, note: '房价上涨' },
          { get: 'chg:flows.newLoans', gt: 0, note: '蓝管变粗' },
          { get: 'dpp:household.dsr', gt: 0.005, note: 'DSR 往上爬' },
        ],
        hl: ['bankApproval', 'newLoans', 'assetReservoir'], concept: ['lvr', 'bankApproval', 'dsr'] },

      { type: 'watch', from: '2004Q2', until: '2006Q2', title: '第 2 步：央行加息',
        text: [
          '跳到 2004 年年中。通胀抬头，央行连续加息，把总闸一格一格拧紧。',
          '先变的是**新贷款**的利率。可大部分家庭背的是旧房贷，要等到重定价那天，利率才跟着上去。',
          '看这两年：政策利率涨了 {pol}，家庭实付的平均房贷利率却几乎没动（变化 {eff}）；房价还涨了 {hc}。',
        ],
        vals: [{ key: 'pol', get: 'dpp:rates.policy', fmt: 'pp' }, { key: 'eff', get: 'dpp:rates.mortgageEff', fmt: 'pp' }, { key: 'hc', get: 'chg:assets.housing.price', fmt: 'chg' }],
        metrics: [{ label: '政策利率', get: 'rates.policy', fmt: 'pct' }, { label: '平均房贷利率（家庭实付）', get: 'rates.mortgageEff', fmt: 'pct' }, { label: '房价指数', get: 'assets.housing.price', fmt: 'idx' }],
        claims: [{ get: 'dpp:rates.policy', gt: 0.03, note: '连续加息' }, { get: 'dpp:rates.mortgageEff', gt: -0.01, lt: 0.01, note: '实付利率几乎没动（变化不到 1 个点）' }, { get: 'chg:assets.housing.price', gt: 0.02, note: '房价还在涨' }],
        hl: ['policyRate', 'interestPaid'], concept: ['policyRate', 'mortgageEff'] },

      { type: 'predict', until: '2008Q1', title: '第 3 步：为什么两年才见效',
        q: '2006Q2，政策利率已升到约 {pol0}，房价还在涨。接下来两年，房价会？',
        options: [
          { t: '立刻暴跌', ok: false, when: [{ get: 'dd:assets.housing.price', lt: -0.15 }] },
          { t: '先见顶，然后温和回落', ok: true, when: [{ get: 'dd:assets.housing.price', lt: -0.01 }, { get: 'dd:assets.housing.price', gt: -0.15 }] },
          { t: '继续大涨', ok: false, when: [{ get: 'chg:assets.housing.price', gt: 0.05 }] },
        ],
        vals: [
          { key: 'pol0', get: 'start:rates.policy', fmt: 'pct0' },
          { key: 'pk', get: 'argmax:assets.housing.price', fmt: 'str', from: '2003Q1', until: '2008Q1' },
          { key: 'dd', get: 'dd:assets.housing.price', fmt: 'chg1', from: '2003Q1', until: '2008Q1' },
          { key: 'fall', get: 'chg:assets.housing.price', fmt: 'chg1' },
        ],
        explain: [
          '旧房贷分批重定价，每个季度只有一小批人的付息变多，压力是慢慢攒起来的。等 DSR 升到够高、房价比一年前转弱，银行才收闸。',
          '从 2004 年年中开始加息，到 {pk} 房价见顶，隔了大约两年；之后到 2008Q1 房价 {fall}（从高点算最大回撤 {dd}），是温和回落，不是暴跌。',
          '加息像在长长的水管里加了一道阻力，水要过一阵才到下游。下一课：圈倒着转的时候，降息还推得动吗？',
        ],
        claims: [{ get: 'argmax:assets.housing.price', from: '2003Q1', until: '2008Q1', dateBetween: ['2005Q4', '2006Q4'], note: '房价在 2006 年前后见顶' }],
        hl: ['interestPaid', 'assetReservoir'], concept: ['mortgageEff', 'dsr'], next: 'm3' },
    ],
  },

  {
    id: 'm3', kind: 'main', label: '第 3 课',
    title: '两个环怎么接上',
    oneLine: '降息之后，信贷回不回来？2001 年回来了（推得动），2008 年没回来（推不动）。差别在于泡沫里的资产是不是借钱买的。推不动，就交给大周期：B2 → ⑤。',
    rulesOn: 'all',
    startDate: '2000Q1', endDate: '2009Q2', mode: 'history', available: true,
    steps: [
      { type: 'intro', title: '先说结论', tab: 'cycle', view: 'flow',
        text: [
          '**结论：小周期的最后一步是一个问题：降息推得动吗？2001 年推得动，信贷回来了；2008 年推不动。差别在于：泡沫里的资产是不是借钱买的。推不动，就交给大周期：B2 缩水 → ⑤ 私人去杠杆。**',
          '像一条河上的两道调度：小周期是每年的汛期调度（加息关水，降息放水），大周期是水库本身。水库自己被抽干的时候，闸怎么开都没用。',
          '下面分 3 步：2001 和 2008 并排看 → 差别在哪 → 推不动之后。',
          '每一步看两个地方：「周期」页的两个圆环，和左边切到「曲线」的走势图。',
        ],
        hl: ['policyRate', 'newLoans'], concept: ['shortCycle', 'longCycle'] },

      { type: 'reveal', from: '2012Q4', title: '第 1 步：2001 推得动，2008 推不动', view: 'waves', tab: 'cycle',
        text: [
          '两次都是「降息」，结局完全不同。左边的曲线把这些年排在一起，看三个地方：',
          '**① 季度图上的坑**，**② 小周期条的颜色**，**③ 最下面的大周期条**。',
        ],
        question: '2001 年和 2008 年，三个地方各差在哪？',
        answerHint: [
          '**2001 年**：坑浅，信贷脉冲最低只到 {m1}；小周期条 {e1} 进「降息」，{x1} 就回到绿色（扩张）。大周期条上没有 B2。',
          '**2008 年**：坑深，信贷脉冲最低到 {m2}；小周期条 {e2} 进「降息」，一直停到 {x2} 才回到扩张。大周期条上，B2 → ⑤ → ⑥ 一格接着一格。',
        ],
        relation: '小周期条在「降息」一停好几年，就是圆环上的「推不动」；大周期条出现 B2，就是大周期开始接手。',
        vals: [
          { key: 'm1', get: 'min:extra.creditImpulse', fmt: 'pct', from: '2000Q1', until: '2003Q1' },
          { key: 'm2', get: 'min:extra.creditImpulse', fmt: 'pct', from: '2007Q3', until: '2012Q4' },
          { key: 'e1', get: 'when:cycles.short.phase=ease', fmt: 'str', from: '2000Q4', until: '2003Q1' },
          { key: 'x1', get: 'when:cycles.short.phase=expand', fmt: 'str', from: '2001Q4', until: '2003Q1' },
          { key: 'e2', get: 'when:cycles.short.phase=ease', fmt: 'str', from: '2007Q3', until: '2012Q4' },
          { key: 'x2', get: 'when:cycles.short.phase=expand', fmt: 'str', from: '2008Q1', until: '2012Q4' },
        ],
        claims: [
          { get: 'min:extra.creditImpulse', from: '2000Q1', until: '2003Q1', vs: { get: 'min:extra.creditImpulse', from: '2007Q3', until: '2012Q4' }, gt: 0.005, note: '2001 年的坑比 2008 年浅' },
          { get: 'when:cycles.short.phase=ease', from: '2000Q4', until: '2003Q1', dateBetween: ['2001Q1', '2001Q1'], note: '2001 年这圈 2001Q1 进降息' },
          { get: 'when:cycles.short.phase=expand', from: '2001Q4', until: '2003Q1', dateBetween: ['2002Q4', '2003Q2'], note: '2001 年这圈 2003Q1 回到扩张' },
          { get: 'qcount:cycles.long.fork=B2', from: '2000Q1', until: '2003Q1', lt: 0.5, note: '2000–03 年大周期条上没有 B2' },
          { get: 'when:cycles.short.phase=ease', from: '2007Q3', until: '2012Q4', dateBetween: ['2007Q4', '2007Q4'], note: '2008 年这圈 2007Q4 进降息' },
          { get: 'when:cycles.short.phase=expand', from: '2008Q1', until: '2012Q4', dateBetween: ['2012Q1', '2012Q3'], note: '2008 年这圈 2012 年才回到扩张' },
          { get: 'when:cycles.long.fork=B2', from: '2007Q3', until: '2012Q4', dateBefore: 'when:cycles.long.stage=5', note: 'B2 先于 ⑤' },
          { get: 'when:cycles.long.stage=5', from: '2007Q3', until: '2012Q4', dateBefore: 'when:cycles.long.stage=6', note: '⑤ 先于 ⑥' },
        ],
        hl: ['policyRate', 'newLoans'], concept: ['shortCycle', 'longCycle'] },

      { type: 'reveal', title: '第 2 步：差别在哪：是不是借钱买的', view: 'flow', tab: 'cycle',
        glow: { parts: ['bank', 'poolHousing', 'household'], pipes: ['collateral'] },
        text: [
          '降息只改**价格**；银行放不放贷，看的是**抵押品**（第 2 课那根虚线）。两次降息，差别就在抵押品上。',
        ],
        question: '同样降息，为什么 2001 年信贷回来了，2008 年没回来？',
        answerHint: [
          '**2001 年**：泡沫在股票，买股票的多半是自己的钱，跌了亏的是投资人自己。银行手里的抵押品（房子）没动：房价比一年前还在涨（{h1}），审批倍数开在 {a1}。降息一来，水龙头和闸门都开着，信贷就回来了。',
          '**2008 年**：泡沫在房子，房子是借钱买的。房价掉了（{h2}），抵押品缩水，第 2 课那个圈倒着转：银行把审批倍数关到 {a2}。降息打开了水龙头，闸门却关着，水进不来。',
        ],
        relation: '降息推不推得动，看银行的闸门开不开；闸门开不开，看抵押品。这就是 B2：房价在跌、债高、降了息信贷还在缩。',
        vals: [
          { key: 'h1', get: 'at:2001Q4:extra.houseYoY', fmt: 'pct', from: '2000Q1', until: '2012Q4' }, { key: 'a1', get: 'at:2001Q4:bank.approval', fmt: 'x2', from: '2000Q1', until: '2012Q4' },
          { key: 'h2', get: 'at:2008Q4:extra.houseYoY', fmt: 'pct', from: '2000Q1', until: '2012Q4' }, { key: 'a2', get: 'at:2008Q4:bank.approval', fmt: 'x2', from: '2000Q1', until: '2012Q4' },
        ],
        claims: [
          { get: 'at:2001Q4:extra.houseYoY', from: '2000Q1', until: '2012Q4', gt: 0, note: '2001 年房价还在涨' },
          { get: 'at:2001Q4:bank.approval', from: '2000Q1', until: '2012Q4', gt: 1.2, note: '2001 年银行闸门开着' },
          { get: 'at:2008Q4:extra.houseYoY', from: '2000Q1', until: '2012Q4', lt: 0, note: '2008 年房价在跌' },
          { get: 'at:2008Q4:bank.approval', from: '2000Q1', until: '2012Q4', lt: 1, note: '2008 年银行闸门关小' },
        ],
        hl: ['bankApproval', 'newLoans', 'assetReservoir', 'policyRate'], concept: ['lvr', 'bankApproval', 'B2'] },

      { type: 'watch', from: '2007Q3', until: '2009Q2', title: '第 3 步：推不动 → B2 → ⑤', view: 'flow', tab: 'cycle',
        glow: { parts: ['bank', 'poolHousing'], pipes: ['collateral'] },
        text: [
          '回到 2007 年，把推不动的那一次慢慢放一遍。',
          '{e2}，央行第一次降息，小周期走到「降息（推得动吗？）」。{fk}，三件事同时成立：房价比一年前在跌、债务堆高了、降了息信贷还在缩。大周期在 ② 之后的岔路口走上 **B2 缩水**，圆环判成「推不动」。',
          '银行把闸门关小（审批倍数 {ap}）：新贷款只有 {nl}，还本还有 {rep}（十亿美元/季），排水口在净抽水。',
          '{s5}，大周期盘进 **⑤ 私人去杠杆**：私人不借了，只顾还债。下一课：谁来补水？',
        ],
        vals: [
          { key: 'e2', get: 'when:cycles.short.phase=ease', fmt: 'str' }, { key: 'fk', get: 'when:cycles.long.fork=B2', fmt: 'str' },
          { key: 'ap', get: 'end:bank.approval', fmt: 'x2' }, { key: 'nl', get: 'end:flows.newLoans', fmt: 'num' }, { key: 'rep', get: 'end:flows.principalRepay', fmt: 'num' },
          { key: 's5', get: 'when:cycles.long.stage=5', fmt: 'str' },
        ],
        metrics: [{ label: '审批倍数', get: 'bank.approval', fmt: 'x2' }, { label: '新贷款（十亿美元/季）', get: 'flows.newLoans', fmt: 'num' }, { label: '还本（十亿美元/季）', get: 'flows.principalRepay', fmt: 'num' }, { label: '大周期', get: 'cycles.long.label', fmt: 'str' }],
        claims: [
          { get: 'when:cycles.short.phase=ease', dateBetween: ['2007Q4', '2007Q4'], note: '2007Q4 小周期进「降息」' },
          { get: 'when:cycles.long.fork=B2', dateBetween: ['2007Q3', '2008Q4'], note: '大周期走上 B2 岔路' },
          { get: 'when:cycles.short.handoff=no', dateBetween: ['2008Q1', '2008Q2'], note: '圆环判成「推不动」' },
          { get: 'at:2008Q1:extra.houseYoY', lt: 0, note: '条件 1：房价比一年前在跌' },
          { get: 'at:2008Q1:cycles.long.forkEvidence.1.value', gte: 0.01, note: '条件 2：债务堆高（DSR 比起点高 ≥ 1 个点）' },
          { get: 'at:2008Q1:extra.creditImpulse', lte: -0.005, note: '条件 3：降了息信贷还在缩' },
          { get: 'end:bank.approval', lt: 1, note: '银行把闸门关小' },
          { get: 'end:flows.newLoans', vs: { get: 'end:flows.principalRepay' }, lt: 0, note: '新贷款少于还本' },
          { get: 'when:cycles.long.stage=5', dateBetween: ['2008Q4', '2009Q2'], note: '大周期进 ⑤' },
        ],
        hl: ['policyRate', 'bankApproval', 'newLoans'], concept: ['B2', 'creditImpulse', 'longCycle'], next: 'm4' },
    ],
  },

  {
    id: 'm4', kind: 'main', label: '第 4 课',
    title: '政府接手和实际利率',
    oneLine: '私人不借了，政府和央行接手补水（⑥）；再把利率压在通胀下面，债务不用还也会一年年变轻（⑦）；私人和政府的账都修好，才走出这一圈（⑧）。',
    rulesOn: 'all', pace: 800,
    startDate: '2008Q3', endDate: '2025Q4', mode: 'history', available: true,
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**结论：私人不借了，只有政府和央行能补水（⑥）。补完水，央行把利率压在通胀下面：实际利率为负，债务不用还，也会一年年变轻（⑦）。私人和政府的账都修好了，才算走出这一圈（⑧）。**',
          '**实际利率 = 政策利率 − 通胀。** 图上央行框里「政策利率」旁边的「实际」就是它：扣掉涨价以后，借钱真正的价格。它才是真正的总闸。',
          '下面分 4 步：⑥ 政府补水 → QE 把水引到资产池 → 实际利率为负，债务变轻（⑦）→ ⑧ 出圈。',
          '时间：2008Q3 → 2025Q4（真实季度）。',
        ],
        hl: ['fiscalInjection', 'qe', 'realRate'], concept: ['fiscalInjection', 'qe', 'realRate'] },

      { type: 'reveal', until: '2009Q4', title: '第 1 步：⑥ 政府补水',
        text: [
          '私人退潮：新贷款少于还本，央行把利率降到接近 0 也没用（上一课）。这时政府出手：花得比收得多，赤字一年相当于 GDP 的 {def}。其中一部分是**新水**（财政注入，紫管）。',
          '新水分两路流出去：**订单**流向企业（采购、修路），**转移支付**流向家庭（失业金、退税、补贴）。',
        ],
        question: '政府补水，代价是什么？',
        answerHint: [
          '代价是政府的债：补的水来自赤字，政府债务/GDP 从 {d0} 升到 {d1}。失业越高，失业金越多，这一部分是自动加码的。',
          '补水接住了往下掉的经济；{s6}，大周期盘进入 **⑥ 政府接手**。',
        ],
        relation: '政府是第二个泵（第 1 课：泵造水）。私人那个泵缩小了，这个泵变大。',
        vals: [
          { key: 'def', get: 'avg:gov.deficit/macro.gdpNominal', fmt: 'pct0' },
          { key: 'd0', get: 'start:gov.debtGdp', fmt: 'pct0' }, { key: 'd1', get: 'end:gov.debtGdp', fmt: 'pct0' },
          { key: 's6', get: 'when:cycles.long.stage=6', fmt: 'str', until: '2010Q4' },
        ],
        metrics: [{ label: '财政注入（新水，十亿美元/季）', get: 'flows.fiscalInjection', fmt: 'num' }, { label: '订单 → 企业', get: 'flows.govPurchases', fmt: 'num' }, { label: '转移支付 → 家庭', get: 'flows.transfers', fmt: 'num' }, { label: '政府债务 / GDP', get: 'gov.debtGdp', fmt: 'pct' }],
        claims: [
          { get: 'end:flows.newLoans', vs: { get: 'end:flows.principalRepay' }, lt: 0, note: '新贷款少于还本' },
          { get: 'end:rates.policy', lt: 0.005, note: '利率接近 0' },
          { get: 'avg:gov.deficit/macro.gdpNominal', gt: 0.08, note: '赤字很大' },
          { get: 'min:flows.fiscalInjection', gt: 50, note: '财政注入（新水）一直在' },
          { get: 'min:flows.govPurchases', gt: 0 }, { get: 'min:flows.transfers', gt: 0 },
          { get: 'dpp:gov.debtGdp', gt: 0.02, note: '政府债务/GDP 上升' },
          { get: 'when:cycles.long.stage=6', until: '2010Q4', dateBetween: ['2010Q1', '2010Q4'], note: '大周期进 ⑥' },
        ],
        glow: { pipes: ['govPurchases', 'transfers'], parts: ['government'] },
        hl: ['fiscalInjection'], concept: ['fiscalInjection', 'govPurchases', 'transfers'] },

      { type: 'reveal', until: '2010Q4', title: '第 2 步：QE 把水引到资产池',
        text: [
          `利率已经贴地（≤ ${p1(R('cb_qe', 'floorRate'))}），失业还高（> ${p1(R('cb_qe', 'uOn'))}），通胀也不高。降息这个旋钮拧到头了，央行改拧第二个：**QE**。`,
          `央行直接买长期国债，规模每年约 GDP 的 ${p0(R('cb_qe', 'sizeGdp'))}。看图：QE 的管亮了，总水量往上走。`,
        ],
        question: '央行买的是长期国债，为什么房价、股价也会被托起来？',
        answerHint: [
          '央行付的是新水：卖债的人账户里多了存款。这些水要找地方去，大部分流进了资产池。',
          '所以 QE 先托起的是**资产价格**（国债最先，然后股票、房产），不是商品河道：国债价格 {bc}，股价 {ec}。',
        ],
        relation: '三个泵里，QE 是央行的。它不经过银行的闸门，所以银行不放贷的时候也能补水。',
        vals: [{ key: 'bc', get: 'chg:assets.bond.price', fmt: 'chg' }, { key: 'ec', get: 'chg:assets.equity.price', fmt: 'chg' }],
        metrics: [{ label: 'QE（十亿美元/季）', get: 'flows.qe', fmt: 'num' }, { label: '总水量 M', get: 'money.M', fmt: 'tn' }, { label: '国债价格指数', get: 'assets.bond.price', fmt: 'idx' }, { label: '股价指数', get: 'assets.equity.price', fmt: 'idx' }],
        claims: [{ get: 'sum:flows.qe', gt: 100, note: 'QE 在买' }, { get: 'dpp:money.M', gt: 0, note: '总水量上升' }, { get: 'chg:assets.bond.price', gt: 0, note: '国债价格上升' }, { get: 'chg:assets.equity.price', gt: 0, note: '股价上升' }],
        glow: { pipes: ['qe'], parts: ['centralBank', 'pool'] },
        hl: ['qe', 'assetReservoir'], concept: ['qe', 'assetReservoir'] },

      { type: 'predict', from: '2012Q1', until: '2015Q1', title: '第 3 步：实际利率为负，债务自己变轻（⑦）', tab: 'cycle',
        glow: { parts: ['centralBank', 'government'] },
        q: '跳到 2012Q1：政策利率 {pol}，通胀 {pi}，实际利率 {rr}，是负的。政府没有还债，债务本身还在涨。到 2015Q1，政府债务占 GDP 的比例会？',
        options: [
          { t: '更高：债还在涨', ok: false, when: [{ get: 'dpp:gov.debtGdp', gt: 0.01 }] },
          { t: '差不多', ok: false, when: [{ get: 'dpp:gov.debtGdp', gte: -0.01, lte: 0.01 }] },
          { t: '更低：没还债，比例也降了', ok: true, when: [{ get: 'dpp:gov.debtGdp', lt: -0.03 }] },
        ],
        vals: [
          { key: 'pol', get: 'start:rates.policy', fmt: 'pct' }, { key: 'pi', get: 'start:macro.inflation', fmt: 'pct' }, { key: 'rr', get: 'start:rates.realPolicy', fmt: 'pct' },
          { key: 'r0', get: 'start:gov.debtGdp', fmt: 'pct0' }, { key: 'r1', get: 'end:gov.debtGdp', fmt: 'pct0' },
          { key: 'b0', get: 'start:debt.government', fmt: 'tn' }, { key: 'b1', get: 'end:debt.government', fmt: 'tn' },
          { key: 'gg', get: 'chg:macro.gdpNominal', fmt: 'chg' }, { key: 'bg', get: 'chg:debt.government', fmt: 'chg' },
          { key: 's7', get: 'when:cycles.long.stage=7', fmt: 'str' },
        ],
        explain: [
          '更低：政府债务/GDP 从 {r0} 降到 {r1}。可政府一分钱也没还：债务本身从 {b0} 涨到 {b1}。变轻，是因为分母长得更快：这三年名义 GDP 涨了 {gg}，债务只涨了 {bg}。',
          '实际利率为负，就是让时间替欠债的人还钱：存钱的人每年亏一点，欠债的人每年轻一点。这叫**金融压制**。{s7}，大周期盘进入 **⑦ 金融压制·增长化债**。',
        ],
        claims: [
          { get: 'start:rates.realPolicy', lt: -0.02, note: '2012Q1 实际利率为负' },
          { get: 'max:rates.realPolicy', lt: -0.01, note: '这三年实际利率一直为负' },
          { get: 'chg:debt.government', gt: 0, note: '政府债务本身在涨（没还）' },
          { get: 'chg:macro.gdpNominal', vs: { get: 'chg:debt.government' }, gt: 0.03, note: '名义 GDP 涨得比债务快' },
          { get: 'when:cycles.long.stage=7', dateBetween: ['2013Q2', '2014Q4'], note: '大周期进 ⑦' },
        ],
        hl: ['policyRate', 'realRate'], concept: ['realRate', 'govDebtGdp'] },

      { type: 'reveal', from: '2025Q4', title: '第 4 步：⑧ 出圈', tab: 'cycle',
        text: [
          '⑧ 是这一圈的出口：私人的账修好了，政府的债也稳住了，下一轮借钱才是健康的新开始（回到 ①）。',
          '五个条件要同时成立：家庭偿债（DSR）比起点低、坏账少、实际利率回到 −1% 以上（压制结束）、政府债务/GDP 不再升、政府利息/税收不太高。',
        ],
        question: '跳到 2025 年底。美国走出这一圈了吗？',
        answerHint: [
          '**还没有，大周期还停在 {l}。** 四个条件已经满足：DSR 比起点低 {e0}，坏账率 {e1}，实际利率 {e2}，政府利息/税收 {e4}。',
          '只差一条：政府债务/GDP 三年里又升了 {e3}（要求不超过 1 个点）。2020 年疫情和 2023–25 年的赤字，又灌了一轮水：2019 年底到 2021 年底，政府债务/GDP 升了 {c20}。',
        ],
        relation: '⑥ 补的水要靠 ⑦ 慢慢化掉；一边化一边又灌，就出不了圈。下一课：停在一个季度，看每个角色各看到什么。',
        vals: [
          { key: 'l', get: 'start:cycles.long.label', fmt: 'str' },
          { key: 'e0', get: 'start:cycles.long.evidence.0.value', fmt: 'ppa' }, { key: 'e1', get: 'start:cycles.long.evidence.1.value', fmt: 'pct' },
          { key: 'e2', get: 'start:cycles.long.evidence.2.value', fmt: 'pct' }, { key: 'e3', get: 'start:cycles.long.evidence.3.value', fmt: 'ppa' },
          { key: 'e4', get: 'start:cycles.long.evidence.4.value', fmt: 'pct0' },
          { key: 'c20', get: 'dpp:gov.debtGdp', fmt: 'pp', from: '2019Q4', until: '2021Q4' },
        ],
        claims: [
          { get: 'start:cycles.long.stage', gte: 7, lte: 7, note: '2025Q4 还在 ⑦' },
          { get: 'count:cycles.long.stage', from: '2014Q1', until: '2025Q4', lt: 1, note: '2014 年起一直停在 ⑦' },
          { get: 'start:cycles.long.evidence.0.name', eq: 'DSR 相对起点' }, { get: 'start:cycles.long.evidence.0.value', lte: -0.025, note: 'DSR 比起点低（满足）' },
          { get: 'start:cycles.long.evidence.1.name', eq: '银行坏账率' }, { get: 'start:cycles.long.evidence.1.value', lte: 0.025, note: '坏账少（满足）' },
          { get: 'start:cycles.long.evidence.2.name', eq: '实际政策利率（压制结束）' }, { get: 'start:cycles.long.evidence.2.value', gte: -0.01, note: '实际利率回到 −1% 以上（满足）' },
          { get: 'start:cycles.long.evidence.3.name', eq: '政府债务/GDP 三年变化' }, { get: 'start:cycles.long.evidence.3.value', gt: 0.01, note: '政府债务/GDP 还在升（不满足）' },
          { get: 'start:cycles.long.evidence.4.name', eq: '政府利息/税收' }, { get: 'start:cycles.long.evidence.4.value', lte: 0.25, note: '利息/税收不太高（满足）' },
          { get: 'dpp:gov.debtGdp', from: '2019Q4', until: '2021Q4', gt: 0.05, note: '2020 年疫情：政府债务/GDP 明显上升' },
          { get: 'dpp:gov.debtGdp', from: '2022Q4', until: '2025Q4', gt: 0.01, note: '2023–25 年：政府债务/GDP 又在升' },
        ],
        hl: ['realRate'], concept: ['longCycle', 'govDebtGdp', 'interestToTax'], next: 'm5' },
    ],
  },

  {
    id: 'm5', kind: 'main', label: '第 5 课',
    title: '同一个季度，八个视角',
    oneLine: '停在 2008Q3（雷曼倒闭那一季），依次打开 8 张角色卡：每个角色看到什么、想要什么、做了什么。每个人都做了对自己合理的事，加起来，四盏扣分灯全亮。',
    rulesOn: 'all',
    startDate: '2008Q3', endDate: '2008Q3', mode: 'history', available: true,
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**结论：同一个季度，八个角色看的是同一条河，却各自只盯着自己那一段。每个人都做了对自己合理的事；加在一起，总目标的四盏扣分灯全亮了。**',
          '我们停在 2008Q3（雷曼兄弟倒闭那一季），时间不走。每一步打开一张角色卡：想要什么 / 盯着什么 / 能拧什么 / 常犯的错；再看它这一季看到了什么、做了什么。',
          '下面分 8 步：央行 → 银行 → 家庭 → 企业 → 政府 → 投资者 → 外国人 → 整个经济。',
        ],
        concept: ['longCycle'] },

      { type: 'reveal', title: '第 1 步：央行', roleCard: 'centralBank', glow: { parts: ['centralBank'] },
        text: [
          '**看到**：通胀 {pi}，失业率 {u}（模型里比真实的 {ur} 偏高），信贷在缩。',
          '**做了**：照真实联储路径继续降息：政策利率从上一季的 {p0} 降到 {p1}。实际利率（政策利率 − 通胀）已经是 {rr}。',
          '**冲突**：降息只改水的价格。下一张卡的银行把闸门关着，便宜的水也流不进去：这就是「降息推不动」。',
        ],
        vals: [
          { key: 'pi', get: 'start:macro.inflation', fmt: 'pct' }, { key: 'u', get: 'start:macro.unemployment', fmt: 'pct' }, { key: 'ur', get: 'real:start:unemployment', fmt: 'pct' },
          { key: 'p0', get: 'at:2008Q2:rates.policy', fmt: 'pct2', from: '2008Q2', until: '2008Q3' }, { key: 'p1', get: 'start:rates.policy', fmt: 'pct2' },
          { key: 'rr', get: 'start:rates.realPolicy', fmt: 'pct' },
        ],
        claims: [
          { get: 'start:macro.unemployment', vs: { get: 'real:start:unemployment' }, gt: 0.01, note: '模型失业率比真实偏高' },
          { get: 'start:extra.creditImpulse', lt: 0, note: '信贷在缩' },
          { get: 'start:rates.policy', vs: { get: 'at:2008Q2:rates.policy', from: '2008Q2', until: '2008Q3' }, lt: 0, note: '比上一季降息' },
          { get: 'start:rates.realPolicy', lt: 0, note: '实际利率为负' },
        ],
        hl: ['policyRate', 'realRate'], concept: ['policyRate', 'realRate'] },

      { type: 'reveal', title: '第 2 步：银行', roleCard: 'bank', glow: { parts: ['bank'], pipes: ['collateral', 'newLoans'] },
        text: [
          `**看到**：房价比一年前 {hy}，坏账率 {bad}（规则线 ${p1(R('bank_tighten_losses', 'bad'))}）。抵押品在缩水，坏账在涨。`,
          '**做了**：触发「坏账多 → 收紧审批」：审批倍数从 {a0} 关到 {a1}。新贷款只有 {nl}，还本有 {rep}（十亿美元/季）：放出去的水比收回来的少。',
          '**冲突**：对一家银行，少借是自保；所有银行一起收，整条河就被抽干（角色卡上的常犯的错：萧条时一起收）。',
        ],
        vals: [
          { key: 'hy', get: 'start:extra.houseYoY', fmt: 'pct' }, { key: 'bad', get: 'start:bank.badLoanRate', fmt: 'pct' },
          { key: 'a0', get: 'at:2008Q2:bank.approval', fmt: 'x2', from: '2008Q2', until: '2008Q3' }, { key: 'a1', get: 'start:bank.approval', fmt: 'x2' },
          { key: 'nl', get: 'start:flows.newLoans', fmt: 'num' }, { key: 'rep', get: 'start:flows.principalRepay', fmt: 'num' },
        ],
        claims: [
          { get: 'start:extra.houseYoY', lt: 0, note: '房价在跌' },
          { get: 'start:bank.badLoanRate', gt: R('bank_tighten_losses', 'bad'), note: '坏账率超过规则线' },
          { get: 'start:bank.approval', vs: { get: 'at:2008Q2:bank.approval', from: '2008Q2', until: '2008Q3' }, lt: 0, note: '审批倍数比上一季低' },
          { get: 'start:flows.newLoans', vs: { get: 'start:flows.principalRepay' }, lt: 0, note: '新贷款少于还本' },
        ],
        ledgerAt: [{ player: 'bank', ruleId: 'bank_tighten_losses' }],
        hl: ['bankApproval', 'newLoans'], concept: ['bankApproval', 'badLoans', 'lvr'] },

      { type: 'reveal', title: '第 3 步：家庭', roleCard: 'household', glow: { parts: ['household'], pipes: ['principalRepay'] },
        text: [
          '**看到**：工作在丢（失业率 {u}），房价在跌，每月还本付息占收入的 {dsr}。',
          '**做了**：触发「去杠杆」：少借、多存。借款需求打了折（×{bm}），储蓄率多存 {sa}。',
          '**冲突**：一家人省钱是对的；大家一起省，商店的生意就少了，别人的工资也少了。你花的钱，就是别人的收入（第 1 课的收入循环）。',
        ],
        vals: [
          { key: 'u', get: 'start:macro.unemployment', fmt: 'pct' }, { key: 'dsr', get: 'start:household.dsr', fmt: 'pct' },
          { key: 'bm', get: 'start:extra.borrowMult', fmt: 'n2' }, { key: 'sa', get: 'start:extra.saveAdj', fmt: 'pp' },
        ],
        claims: [
          { get: 'start:extra.houseYoY', lt: 0, note: '房价在跌' },
          { get: 'start:macro.unemployment', vs: { get: 'at:2007Q3:macro.unemployment', from: '2007Q3', until: '2008Q3' }, gt: 0.005, note: '失业率比一年前高（工作在丢）' },
          { get: 'start:extra.borrowMult', lt: 1, note: '借款需求打折' },
          { get: 'start:extra.saveAdj', gt: 0, note: '多存' },
        ],
        ledgerAt: [{ player: 'household', ruleId: 'hh_deleverage' }],
        hl: ['principalRepay'], concept: ['dsr', 'income'] },

      { type: 'reveal', title: '第 4 步：企业', roleCard: 'firm', glow: { parts: ['firm', 'capex'], pipes: ['toCapex', 'outI'] },
        text: [
          '**看到**：订单不够：需求比产能少 {gap}。',
          '**做了**：削减 Capex：上一季就削到了规则的下限（×{cm}），这一季停在那里。企业投资这个出口（第 1 课）只占 GDP 的 {oi}。',
          '**冲突**：角色卡上的错是「繁荣时一起扩产」；萧条时正好反过来，大家一起停投：今天的订单更少，几年后河道也窄了。',
        ],
        vals: [{ key: 'gap', get: 'start:macro.demandPressure', fmt: 'apct1' }, { key: 'cm', get: 'start:extra.capexMult', fmt: 'n2' }, { key: 'oi', get: 'start:out.I', fmt: 'pct0' }],
        claims: [
          { get: 'start:macro.demandPressure', lt: R('firm_capex_cut', 'p'), note: '需求比产能少（低于削减线）' },
          { get: 'start:extra.capexMult', lte: R('firm_capex_cut', 'min') + 0.001, note: 'Capex 倍数在下限' },
          { get: 'at:2008Q2:extra.capexMult', from: '2008Q2', until: '2008Q3', lte: R('firm_capex_cut', 'min') + 0.001, note: '上一季就到了下限' },
        ],
        ledgerAt: [{ player: 'firm', ruleId: 'firm_capex_cut', date: '2008Q2' }],
        hl: ['capex', 'capacity'], concept: ['capex', 'outputGap'] },

      { type: 'reveal', title: '第 5 步：政府', roleCard: 'government', glow: { parts: ['government'], pipes: ['fiscalInjection'] },
        text: [
          `**看到**：失业率 {u}；政府付的利息占税收的 {it}，超过了它的警戒线 ${p0(R('gov_austerity', 'i2t'))}。`,
          '**模型里做了**：触发「利息太重 → 收缩财政」：财政注入（新水）从 GDP 的 {f0} 收到 {f1}。不过赤字仍有 GDP 的 {def}，债务继续往上走（第 4 课的 ⑥ 补水）。',
          '**模型偏差**：真实的美国这时是**大幅加码**：2008 年 2 月退税支票、10 月 TARP 救银行、2009 年 2 月 ARRA 刺激法案；联邦赤字从 2008 财年约 GDP 的 3% 升到 2009 财年约 10%。模型里的政府按规则自己决定，这一季的「收」是模型没做对的地方。',
          '**冲突**：角色卡上的「刺激收太早」，真实例子是**日本 1997**：经济刚有起色，就把消费税从 3% 提到 5%，随后掉回衰退。',
        ],
        vals: [
          { key: 'u', get: 'start:macro.unemployment', fmt: 'pct' }, { key: 'it', get: 'start:gov.interestToTax', fmt: 'pct0' },
          { key: 'f0', get: 'at:2008Q2:extra.fiscalAdj', fmt: 'pct', from: '2008Q2', until: '2008Q3' }, { key: 'f1', get: 'start:extra.fiscalAdj', fmt: 'pct' },
          { key: 'def', get: 'start:gov.deficit/macro.gdpNominal', fmt: 'pct0' },
        ],
        claims: [
          { get: 'start:gov.interestToTax', gt: R('gov_austerity', 'i2t'), note: '利息/税收超过警戒线' },
          { get: 'start:extra.fiscalAdj', vs: { get: 'at:2008Q2:extra.fiscalAdj', from: '2008Q2', until: '2008Q3' }, lt: 0, note: '财政注入比上一季收' },
          { get: 'start:gov.deficit/macro.gdpNominal', gt: 0.08, note: '赤字仍然很大' },
          { get: 'dpp:gov.debtGdp', from: '2008Q3', until: '2009Q4', gt: 0.02, note: '债务继续往上走' },
        ],
        ledgerAt: [{ player: 'government', ruleId: 'gov_austerity' }],
        hl: ['fiscalInjection'], concept: ['interestToTax', 'fiscalInjection', 'govDebtGdp'] },

      { type: 'reveal', title: '第 6 步：投资者', roleCard: 'investor', glow: { parts: ['cash', 'poolBond'], pipes: ['toCash', 'toBond'] },
        text: [
          '**看到**：股价一年跌了 {ey}，风险溢价 {rp}，信贷在缩。',
          '**做了**：触发「避险」：新增的钱里 {c} 留在现金；进金融资产的那一小份里，{b} 买了国债（飞向安全）。',
          '**冲突**：对自己是保命；大家一起逃，房价、股价跌得更深，银行的抵押品更不值钱（常犯的错：追涨杀跌，放大波动）。',
        ],
        vals: [
          { key: 'ey', get: 'chg:assets.equity.price', fmt: 'apct0', from: '2007Q3', until: '2008Q3' }, { key: 'rp', get: 'start:rates.riskPremium', fmt: 'pct0' },
          { key: 'c', get: 'start:extra.alloc.c', fmt: 'pct0' }, { key: 'b', get: 'start:extra.alloc.b', fmt: 'pct0' },
        ],
        claims: [
          { get: 'chg:assets.equity.price', from: '2007Q3', until: '2008Q3', lt: -0.2, note: '股价一年跌了两成以上' },
          { get: 'start:rates.riskPremium', gt: R('inv_riskoff', 'rp'), note: '风险溢价超过避险线' },
          { get: 'start:extra.creditImpulse', lt: 0, note: '信贷在缩' },
          { get: 'start:extra.alloc.c', gt: 0.5, note: '新增的钱大半留在现金' },
          { get: 'start:extra.alloc.b', gt: 0.5, note: '金融资产里大半买国债' },
        ],
        ledgerAt: [{ player: 'investor', ruleId: 'inv_riskoff' }],
        hl: ['assetReservoir'], concept: ['riskPremium', 'bondAsset', 'cashAsset'] },

      { type: 'reveal', title: '第 7 步：外国人', roleCard: 'foreign', glow: { pipes: ['foreignBonds', 'imports', 'exports'] },
        text: [
          '**看到**：美国政府的赤字已经是 GDP 的 {def}，通胀 {pi}。',
          `**做了**：两件事。一，触发「要求更高的期限溢价」：借钱给美国政府，要多收 ${(R('foreign_funding', 'add') * 100).toFixed(1)} 个点，长期国债利率被抬到 {g10}。二，照样在买：这一季外国人买了 {fb}（十亿美元）美国国债。`,
          '**冲突**：外国人要的是收益和安全。世界一慌，钱反而先往美元里逃；可要是哪天不再信美国，就会一起撤（常犯的错）。',
        ],
        vals: [
          { key: 'def', get: 'start:gov.deficit/macro.gdpNominal', fmt: 'pct0' }, { key: 'pi', get: 'start:macro.inflation', fmt: 'pct' },
          { key: 'g10', get: 'start:rates.gov10y', fmt: 'pct' }, { key: 'fb', get: 'start:border.foreignBondBuy', fmt: 'num' },
        ],
        claims: [
          { get: 'start:gov.deficit/macro.gdpNominal', gt: R('foreign_funding', 'def'), note: '赤字超过外国人的警戒线' },
          { get: 'start:macro.inflation', gt: R('foreign_funding', 'pi'), note: '通胀超过外国人的警戒线' },
          { get: 'start:border.foreignBondBuy', gt: 0, note: '外国人照样在买美国国债' },
        ],
        ledgerAt: [{ player: 'foreign', ruleId: 'foreign_funding' }],
        hl: ['foreignBonds'], concept: ['foreignBonds', 'reserveCurrency'] },

      { type: 'reveal', title: '第 8 步：整个经济', roleCard: 'economy', mark: ['objective'],
        text: [
          '**四盏扣分灯全亮**（看屏幕顶上的总目标条）：',
          '**泛滥** {lf}：通胀 {pi}，高过 2% 的目标。**干涸** {ld}：失业率 {u}，远高于正常。**溃坝** {lb}：大周期走上了 B2 岔路，借来的水把堤坝冲开了。**透支** {lo}：家庭偿债和政府利息都太重。',
          '七个角色，每一个都做了对自己合理的事：央行降息，银行自保，家庭省钱，企业停投，政府收支出，投资者逃向现金和国债，外国人要更高的利息。加在一起，整条河既在干涸、又在溃坝。',
          '这就是为什么要有「整个经济」这张卡：只有站在整条河上看，才看得见每个角色各自看不见的东西。',
        ],
        vals: [
          { key: 'lf', get: 'start:lamp.flood', fmt: 'lamp' }, { key: 'ld', get: 'start:lamp.drought', fmt: 'lamp' },
          { key: 'lb', get: 'start:lamp.burst', fmt: 'lamp' }, { key: 'lo', get: 'start:lamp.overdraft', fmt: 'lamp' },
          { key: 'pi', get: 'start:macro.inflation', fmt: 'pct' }, { key: 'u', get: 'start:macro.unemployment', fmt: 'pct' },
        ],
        claims: [
          { get: 'start:lamps.lit', gte: 4, note: '四盏灯全亮（没有一盏是绿的）' },
          { get: 'start:lamp.flood', ne: 'green', note: '泛滥亮' }, { get: 'start:macro.inflation', gt: 0.02, note: '通胀高过目标' },
          { get: 'start:lamp.drought', eq: 'red', note: '干涸红' },
          { get: 'start:lamp.burst', eq: 'red', note: '溃坝红' }, { get: 'start:cycles.long.fork', eq: 'B2', note: '大周期在 B2 岔路' },
          { get: 'start:lamp.overdraft', ne: 'green', note: '透支亮' },
        ],
        concept: ['B2', 'dsr', 'interestToTax'], next: 'fx' },
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
    oneLine: '房价转跌，圈就倒着转：房价↓ → LVR 变差 → 银行收紧 → 新贷款↓ → 房价↓。降息也救不了，大周期由此走上 B2，通向 ⑤。',
    rulesOn: 'all',
    startDate: '2006Q1', endDate: '2010Q4', mode: 'history', available: true,
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**结论：同一个圈，方向反过来就是 B2。降息打开的是水龙头，可堵住的是银行的闸门。**',
          'B2 不是小周期里的一格，而是大周期的岔路：缓冲池（②）满了之后，多出来的水要么溢出成物价（B1），要么缩水（B2）。走上 B2，下一站就是 ⑤ 私人去杠杆。小周期怎么把接力棒交到这里，下一课（第 3.5 课）专门讲。',
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
          '这三样（房价在跌、债务高、降息后信贷还在缩）凑齐，大周期盘在 {fk} 走上 B2 这条岔路，下一站是 ⑤ 私人去杠杆。',
        ],
        vals: [{ key: 'fk', get: 'when:cycles.long.fork=B2', fmt: 'str' }],
        metrics: [{ label: '审批倍数', get: 'bank.approval', fmt: 'x2' }, { label: '新贷款（十亿美元/季）', get: 'flows.newLoans', fmt: 'num' }, { label: '还本（十亿美元/季）', get: 'flows.principalRepay', fmt: 'num' }],
        claims: [{ get: 'dpp:bank.approval', lt: -0.1, note: '审批倍数下降' }, { get: 'end:flows.newLoans', vs: { get: 'end:flows.principalRepay' }, lt: 0, note: '新贷款少于还本' }, { get: 'end:extra.creditImpulse', lt: 0, note: '信贷脉冲转负' },
          { get: 'max:household.lvr', gt: R('bank_tighten_collateral', 'lvr'), note: 'LVR 超过收紧线' },
          { get: 'when:cycles.long.fork=B2', dateBetween: ['2007Q3', '2008Q4'], note: '大周期走上 B2 岔路' }],
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
          { text: '圈倒着转到头：小周期「降息推不动」，大周期走上 B2 岔路，下一站 ⑤ 私人去杠杆（下一课讲这条连线）', part: 'cycle', term: 'B2' },
        ], next: '3b' },
    ],
  },

  /* =====================================================================================================================
   * 第 3.5 课「两个环怎么接上：降息推得动吗？」(id '3b', kind 'cycle'): the MAIN LINE of the course. Sits right after lesson 3.
   * The short cycle ends with one question (降息推得动吗？). Yes -> back to 扩张 (2001-03). No -> the long cycle takes over:
   * ② 缓冲池满 -> B2 缩水 -> ⑤ 私人去杠杆 (2008-12). Steps carry `view:'waves'|'flow'` (left panel: curves | flow diagram) next to `tab`.
   * ===================================================================================================================== */
  {
    id: '3b', kind: 'cycle', label: '第 3.5 课',
    title: '两个环怎么接上：降息推得动吗？',
    oneLine: '小周期的最后一问：降息推得动吗？推得动，回到扩张；推不动，大周期接手（B2 → ⑤）。这是两个环之间唯一的连线。',
    rulesOn: 'all',
    startDate: '2000Q1', endDate: '2012Q4', mode: 'history', available: true,
    steps: [
      { type: 'intro', title: '先说结论', tab: 'cycle', view: 'flow',
        text: [
          '**结论：小周期走完一圈，最后是一个问题：降息推得动吗？推得动，回到扩张；推不动，大周期接手：② 缓冲池满 → B2 缩水 → ⑤ 私人去杠杆。这是两个环之间唯一的连线，也是整门课的主线。**',
          '像一条河上的两道调度：小周期是每年的汛期调度（加息关水，降息放水），大周期是水库本身。汛期调度能处理溢出的水；可水库自己被抽干的时候，闸怎么开都没用，只能换水库的管理员来管。',
          '下面分 10 步：① 最后一问 ② 缓冲池满 ③ 顶来了 ④ 猜一猜 ⑤ 又到顶 ⑥ B2 岔路 ⑦ 推不动 ⑧ 看曲线 ⑨ 为什么 ⑩ 串起来。',
          '时间：2000Q1 → 2012Q4（真实季度）。每一步看两个地方：「周期」页的圆环，和左边切到「曲线」的走势图。',
        ],
        hl: ['policyRate', 'newLoans'], concept: ['shortCycle', 'longCycle'] },

      { type: 'reveal', title: '第 1 步：小周期的最后一问', tab: 'cycle', view: 'flow',
        text: [
          '小周期是一个四步的环：**扩张 → 过热 → 收紧 → 降息（推得动吗？）**。收紧就是央行加息；加息的同时，失业或信贷也可能转差，那就是「收紧·衰退」。',
          '过热有两种：**物价过热**（通胀高、还在升）和**资产过热**（借钱推起来的繁荣，先是信贷缩、再是房价转弱）。',
          '第四步「降息」，不是终点，而是一个问题。',
        ],
        question: '央行降息之后，是什么决定这个环能不能再转一圈？',
        answerHint: [
          '看信贷回不回来：降息让借钱变便宜，**银行肯放、家庭肯借**，信贷重新启动，就是「推得动」，回到扩张，环再转一圈。',
          '要是降了息，信贷还是起不来，就是「推不动」：这个环转不下去，交给大周期。',
        ],
        relation: '「推得动」留在小周期里；「推不动」才走到大周期。这一问，是两个环之间唯一的接口。',
        hl: ['policyRate', 'newLoans'], concept: ['shortCycle', 'creditImpulse'] },

      { type: 'reveal', until: '2000Q3', title: '第 2 步：缓冲池满，水有两条出路', view: 'flow', tab: 'cycle',
        text: [
          '**② 缓冲池满**的意思：资产池里装的，已经是借来的水。池子再往里灌，多出来的水只有两条出路。',
          '**一条是溢出成物价（B1）**：水漫进商品河道，物价涨。这条路小周期自己能管：加息关水，再降息放水。',
          '**另一条是缩水（B2）**：资产价格掉下来，水没了，可欠条还在。这条路小周期管不了，要交给大周期。',
          '2000 年大周期还在 ①，央行已经在加息，小周期在「收紧（加息）」；{d1} 物价也冒了头，圆环上标出「接 物价过热」（B1 苗头）。',
        ],
        vals: [{ key: 'd1', get: 'when:cycles.short.via=price', fmt: 'str' }, { key: 'f1', get: 'when:cycles.long.fork=B1', fmt: 'str' }],
        claims: [
          { get: 'when:cycles.short.via=price', dateBetween: ['2000Q2', '2000Q3'], note: '2000 年小周期在「收紧（加息）」，标出「接 物价过热」' },
          { get: 'when:cycles.long.fork=B1', dateBetween: ['2000Q2', '2000Q3'], note: '大周期岔路口是 B1（溢出）' },
        ],
        glow: { parts: ['pool', 'poolHousing', 'channel'] },
        hl: ['assetReservoir', 'goodsChannel', 'cpi'], concept: ['B1', 'B2', 'assetReservoir'] },

      { type: 'watch', until: '2001Q4', title: '第 3 步：2000–01，顶来了，央行降息', view: 'waves', tab: 'cycle',
        text: [
          '先是物价冒头，央行加息；加到头，央行掉头降息：{e0}，圆环从「收紧」转到「降息（推得动吗？）」。{d2}，大周期走到 ② 缓冲池满。信贷先缩了，可房价还在涨。',
          '央行从 {pm} 一路降息到 {pe}。看曲线：季度图上，真实 GDP 掉到了趋势线下面，这就是小周期的坑。',
          '房价还在涨，大周期没有转到 B2：银行的抵押品好好的，闸门没关。',
        ],
        vals: [
          { key: 'd2', get: 'when:cycles.long.stage=2', fmt: 'str' }, { key: 'e0', get: 'when:cycles.short.phase=ease', fmt: 'str' },
          { key: 'pm', get: 'max:rates.policy', fmt: 'pct' }, { key: 'pe', get: 'end:rates.policy', fmt: 'pct' },
        ],
        metrics: [{ label: '政策利率', get: 'rates.policy', fmt: 'pct' }, { label: '信贷脉冲', get: 'extra.creditImpulse', fmt: 'pct' }, { label: '房价比一年前', get: 'extra.houseYoY', fmt: 'pct' }],
        claims: [
          { get: 'when:cycles.long.stage=2', dateBetween: ['2001Q1', '2001Q3'], note: '大周期走到 ②' },
          { get: 'when:cycles.short.phase=ease', dateBetween: ['2001Q1', '2001Q2'], note: '第一次降息，圆环转到「降息（推得动吗？）」' },
          { get: 'dpp:rates.policy', lt: -0.03, note: '降息 3 个点以上' },
          { get: 'min:extra.creditImpulse', lt: 0, note: '信贷先缩' },
          { get: 'min:extra.houseYoY', gt: 0, note: '房价比一年前还在涨' },
        ],
        hl: ['policyRate', 'newLoans'], concept: ['shortCycle', 'longCycle'] },

      { type: 'predict', until: '2003Q1', title: '第 4 步：猜一猜', view: 'waves', tab: 'cycle', hl: ['policyRate', 'newLoans'],
        q: '2001Q4：政策利率已降到 {pol}，信贷脉冲还是负的（{ci0}）。再过一年多，到 2003Q1，降息推得动吗？降息后信贷回来了吗？',
        options: [
          { t: '回来了：新贷款重新比还本多，小周期回到扩张', ok: true, when: [{ get: 'end:extra.creditImpulse', gt: 0 }] },
          { t: '没回来：信贷还在缩，大周期接手', ok: false, when: [{ get: 'end:extra.creditImpulse', lt: 0 }] },
          { t: '回来一下，很快又掉头', ok: false, when: [{ get: 'end:extra.creditImpulse', vs: { get: 'max:extra.creditImpulse' }, lt: -0.005 }] },
        ],
        vals: [
          { key: 'pol', get: 'start:rates.policy', fmt: 'pct' }, { key: 'ci0', get: 'start:extra.creditImpulse', fmt: 'pct' },
          { key: 'ci1', get: 'end:extra.creditImpulse', fmt: 'pct' }, { key: 'nl', get: 'end:flows.newLoans', fmt: 'num' }, { key: 'rep', get: 'end:flows.principalRepay', fmt: 'num' },
          { key: 'e1', get: 'when:cycles.short.phase=ease', fmt: 'str', from: '2000Q4' }, { key: 'x1', get: 'when:cycles.short.phase=expand', fmt: 'str' },
        ],
        explain: [
          '回来了。{e1} 小周期进「降息」，{x1} 就回到「扩张」：新贷款 {nl}，还本 {rep}（十亿美元/季），信贷脉冲 {ci1}。降息推得动，环转了一圈。',
          '看曲线：季度图上这一次的坑很浅，小周期条很快回到绿色。整个过程大周期一格没动。',
          '原因下面几步再讲：这一次，银行的闸门一直开着。',
        ],
        claims: [
          { get: 'when:cycles.short.phase=expand', dateBetween: ['2002Q4', '2003Q2'], note: '小周期回到扩张' },
          { get: 'when:cycles.short.phase=ease', from: '2000Q4', dateBetween: ['2001Q1', '2001Q1'], note: '先进入降息（2001Q1）' },
          { get: 'end:flows.newLoans', vs: { get: 'end:flows.principalRepay' }, gt: 0, note: '新贷款多于还本' },
          { get: 'count:cycles.long.stage', lt: 1, note: '大周期没动' },
          { get: 'start:extra.creditImpulse', lt: 0, note: '降息时信贷脉冲还是负的' },
        ] },

      { type: 'watch', until: '2007Q3', title: '第 5 步：2005–07，同样的顶又来了', view: 'flow', tab: 'cycle',
        text: [
          '过了几年，同样的剧本又开始：{ti}，央行重新加息，小周期进入「收紧（加息）」；{hp} 物价冒头，标出「接 物价过热」；{tr} 加息之外，失业或信贷也转差，变成「收紧·衰退」；{ha} 顶换了一种，标出「接 资产过热」。',
          '这一次的底色不一样。上一轮的泡沫在股票，这一轮在房子，而且是借钱买的房子：家庭偿债占收入的比例（DSR）到了 {dsr}，房价比一年前已经是 {hy}。',
          '下一个问题又来了：降息之后，推得动吗？',
        ],
        vals: [
          { key: 'ti', get: 'when:cycles.short.phase=tight', fmt: 'str' }, { key: 'hp', get: 'when:cycles.short.via=price', fmt: 'str' }, { key: 'tr', get: 'when:cycles.short.label=收紧·衰退（接 物价过热）', fmt: 'str' }, { key: 'ha', get: 'when:cycles.short.via=asset', fmt: 'str' },
          { key: 'dsr', get: 'end:household.dsr', fmt: 'pct' }, { key: 'hy', get: 'end:extra.houseYoY', fmt: 'pct' },
        ],
        metrics: [{ label: '房价比一年前', get: 'extra.houseYoY', fmt: 'pct' }, { label: '家庭 DSR', get: 'household.dsr', fmt: 'pct' }, { label: '信贷脉冲', get: 'extra.creditImpulse', fmt: 'pct' }],
        claims: [
          { get: 'when:cycles.short.phase=tight', dateBetween: ['2004Q3', '2005Q1'], note: '2004Q4 起小周期在「收紧（加息）」' },
          { get: 'when:cycles.short.via=price', dateBetween: ['2005Q1', '2005Q3'], note: '又一次标出「接 物价过热」' },
          { get: 'when:cycles.short.label=收紧·衰退（接 物价过热）', dateBetween: ['2006Q1', '2006Q3'], note: '「收紧·衰退」' },
          { get: 'when:cycles.short.via=asset', dateBetween: ['2006Q3', '2007Q1'], note: '标出「接 资产过热」' },
          { get: 'end:extra.houseYoY', lt: 0, note: '房价比一年前在跌' },
          { get: 'end:household.dsr', gt: 0.12, note: 'DSR 高' },
        ],
        hl: ['interestPaid', 'assetReservoir'], concept: ['dsr', 'housePrice'] },

      { type: 'watch', until: '2008Q1', title: '第 6 步：2008Q1，大周期走上 B2', view: 'flow', tab: 'cycle',
        glow: { parts: ['bank', 'poolHousing'], pipes: ['collateral'] },
        text: [
          '央行开始降息：政策利率从 {p0} 降到 {p1}。可信贷没有回来。',
          '{fk}，大周期在 ② 之后的岔路口选了 **B2 缩水**。三件事同时成立：房价比一年前在跌（{hy}）；债务堆高了（DSR 比起点高 {ds}）；降了息，信贷脉冲还是负的（{ci}）。',
          '这就是第 3 课的圈：房价↓ → 抵押品变差 → 银行把闸门关小（审批倍数 {ap}）→ 新贷款↓。降息只改价格，打不开银行的闸门。',
        ],
        vals: [
          { key: 'p0', get: 'start:rates.policy', fmt: 'pct' }, { key: 'p1', get: 'end:rates.policy', fmt: 'pct' },
          { key: 'fk', get: 'when:cycles.long.fork=B2', fmt: 'str' },
          { key: 'hy', get: 'end:extra.houseYoY', fmt: 'pct' }, { key: 'ds', get: 'end:cycles.long.forkEvidence.1.value', fmt: 'pp' },
          { key: 'ci', get: 'end:extra.creditImpulse', fmt: 'pct' }, { key: 'ap', get: 'end:bank.approval', fmt: 'x2' },
        ],
        metrics: [{ label: '审批倍数', get: 'bank.approval', fmt: 'x2' }, { label: '新贷款（十亿美元/季）', get: 'flows.newLoans', fmt: 'num' }, { label: '政策利率', get: 'rates.policy', fmt: 'pct' }],
        claims: [
          { get: 'when:cycles.long.fork=B2', dateBetween: ['2007Q3', '2008Q4'], note: '大周期走上 B2 岔路' },
          { get: 'when:cycles.long.fork=B2', from: '2000Q1', until: '2012Q4', dateBetween: ['2007Q3', '2008Q4'], note: '2000Q1 之后第一次 B2 就在这里：2000–03 年间没有 B2' },
          { get: 'end:extra.houseYoY', lt: 0, note: '条件 1：房价比一年前在跌' },
          { get: 'end:cycles.long.forkEvidence.1.value', gte: 0.01, note: '条件 2：DSR 比起点高（>= 1 个点）' },
          { get: 'end:extra.creditImpulse', lte: -0.005, note: '条件 3：降息后信贷脉冲仍为负' },
          { get: 'dpp:rates.policy', lt: -0.01, note: '已经降息' },
          { get: 'end:bank.approval', lt: 1, note: '银行把闸门关小' },
        ],
        hl: ['policyRate', 'bankApproval', 'newLoans'], concept: ['B2', 'lvr', 'creditImpulse'] },

      { type: 'watch', until: '2010Q3', title: '第 7 步：推不动，大周期接手', view: 'waves', tab: 'cycle',
        text: [
          '{e2}，央行第一次降息，小周期走到「降息」；{ea}，信贷还是起不来，圆环判成「推不动」，标签写的是：**{ht}**。信贷一直起不来：到这一步结束，新贷款只有 {nl}，还本还有 {rep}（十亿美元/季）。',
          '{s5}，大周期盘进 ⑤ 私人去杠杆；{s6} 进 ⑥ 政府接手（第 4 课）。',
          '看曲线：季度图上这个坑又深又长，小周期条在「降息」那一格一停就是几年；最下面的大周期条上，B2 → ⑤ → ⑥ 一格接着一格。',
        ],
        vals: [
          { key: 'e2', get: 'when:cycles.short.phase=ease', fmt: 'str', from: '2007Q3' }, { key: 'ea', get: 'when:cycles.short.handoff=no', fmt: 'str', from: '2007Q3' }, { key: 'ht', get: 'end:cycles.short.handoffText', fmt: 'str' },
          { key: 'nl', get: 'end:flows.newLoans', fmt: 'num' }, { key: 'rep', get: 'end:flows.principalRepay', fmt: 'num' },
          { key: 's5', get: 'when:cycles.long.stage=5', fmt: 'str' }, { key: 's6', get: 'when:cycles.long.stage=6', fmt: 'str' },
        ],
        metrics: [{ label: '新贷款（十亿美元/季）', get: 'flows.newLoans', fmt: 'num' }, { label: '还本（十亿美元/季）', get: 'flows.principalRepay', fmt: 'num' }, { label: '大周期', get: 'cycles.long.label', fmt: 'str' }, { label: '小周期', get: 'cycles.short.label', fmt: 'str' }],
        claims: [
          { get: 'when:cycles.short.handoff=no', from: '2007Q3', dateBetween: ['2008Q1', '2008Q1'], note: '2008Q1 起：降息，推不动' },
          { get: 'count:cycles.short.handoff', from: '2008Q1', until: '2011Q4', lt: 1, note: '2008Q1 到 2011Q4 一直是「推不动」' },
          { get: 'when:cycles.short.phase=ease', from: '2007Q3', until: '2011Q4', dateBetween: ['2007Q4', '2007Q4'], note: '2007Q4 起小周期在「降息」' },
          { get: 'count:cycles.short.phase', from: '2007Q4', until: '2011Q4', lt: 1, note: '2007Q4 到 2011Q4 小周期一直停在「降息」' },
          { get: 'when:cycles.long.stage=5', dateBetween: ['2008Q4', '2009Q4'], note: '大周期进 ⑤' },
          { get: 'when:cycles.long.stage=6', dateBetween: ['2010Q1', '2010Q4'], note: '大周期进 ⑥' },
          { get: 'end:flows.newLoans', vs: { get: 'end:flows.principalRepay' }, lt: 0, note: '新贷款少于还本' },
        ],
        hl: ['newLoans', 'principalRepay', 'policyRate'], concept: ['longCycle', 'creditImpulse'] },

      { type: 'reveal', until: '2012Q4', title: '第 8 步：两次降息，放在曲线上看', view: 'waves', tab: 'cycle',
        text: [
          '同样是「降息」，2001 年和 2008 年是两种结局。左边已经切到曲线，在三个地方对比：',
          '**① 季度图上的坑**，**② 小周期条的颜色**，**③ 最下面的大周期条**。',
        ],
        question: '2001 年和 2008 年，三个地方各差在哪？',
        answerHint: [
          '**2001 年**：坑浅，信贷脉冲最低只到 {m1}；小周期条 {e1} 进「降息」，{x1} 就回到绿色（扩张）。大周期条上没有 B2。',
          '**2008 年**：坑深，信贷脉冲最低到 {m2}；小周期条 {e2} 进「降息」，一直停到 {x2} 才回到扩张。大周期条上，B2 → ⑤ → ⑥ 一格接着一格。',
        ],
        relation: '曲线和圆环是同一件事的两张脸：小周期条在「降息」不动，就是圆环上的「推不动」；大周期条出现 B2，就是圆环上大周期开始转。',
        vals: [
          { key: 'm1', get: 'min:extra.creditImpulse', fmt: 'pct', from: '2000Q1', until: '2003Q1' },
          { key: 'm2', get: 'min:extra.creditImpulse', fmt: 'pct', from: '2007Q3', until: '2012Q4' },
          { key: 'e1', get: 'when:cycles.short.phase=ease', fmt: 'str', from: '2000Q4', until: '2003Q1' },
          { key: 'x1', get: 'when:cycles.short.phase=expand', fmt: 'str', from: '2001Q4', until: '2003Q1' },
          { key: 'e2', get: 'when:cycles.short.phase=ease', fmt: 'str', from: '2007Q3', until: '2012Q4' },
          { key: 'x2', get: 'when:cycles.short.phase=expand', fmt: 'str', from: '2008Q1', until: '2012Q4' },
        ],
        claims: [
          { get: 'min:extra.creditImpulse', from: '2000Q1', until: '2003Q1', vs: { get: 'min:extra.creditImpulse', from: '2007Q3', until: '2012Q4' }, gt: 0.005, note: '2001 年的坑比 2008 年浅' },
          { get: 'when:cycles.short.phase=ease', from: '2000Q4', until: '2003Q1', dateBetween: ['2001Q1', '2001Q1'], note: '2001 年这圈 2001Q1 进降息' },
          { get: 'when:cycles.short.phase=expand', from: '2001Q4', until: '2003Q1', dateBetween: ['2002Q4', '2003Q2'], note: '2001 年这圈 2003Q1 回到扩张' },
          { get: 'when:cycles.short.phase=ease', from: '2007Q3', until: '2012Q4', dateBetween: ['2007Q4', '2007Q4'], note: '2008 年这圈 2007Q4 进降息' },
          { get: 'when:cycles.short.phase=expand', from: '2008Q1', until: '2012Q4', dateBetween: ['2012Q1', '2012Q3'], note: '2008 年这圈 2012 年才回到扩张' },
        ],
        hl: ['policyRate', 'newLoans'], concept: ['shortCycle', 'longCycle'] },

      { type: 'reveal', title: '第 9 步：为什么一个推得动，一个推不动', view: 'flow', tab: 'cycle',
        glow: { parts: ['bank', 'poolHousing', 'household'], pipes: ['collateral'] },
        text: [
          '降息只改**价格**；银行放不放，看的是**抵押品**。两次降息，差别就在抵押品上。',
        ],
        question: '同样降息，为什么 2001 年信贷回来了，2008 年没回来？',
        answerHint: [
          '**2001 年**：泡沫在股票，买股票的多半是自己的钱，跌了亏的是投资人自己。银行手里的抵押品（房子）没动：房价比一年前还在涨（{h1}），审批倍数开在 {a1}。降息一来，水龙头和闸门都是开的，信贷就回来了。',
          '**2007 年**：泡沫在房子，房子是借钱买的。房价掉了（{h2}），抵押品缩水，第 3 课那个圈倒着转：银行把审批倍数关到 {a2}。降息打开了水龙头，闸门还是关着，水进不来。',
        ],
        relation: '降息推不推得动，要看银行的闸门开不开；闸门开不开，要看抵押品。这就是 B2 的定义：房价在跌、债高、降了息信贷还在缩。',
        vals: [
          { key: 'h1', get: 'at:2001Q4:extra.houseYoY', fmt: 'pct', from: '2000Q1', until: '2012Q4' }, { key: 'a1', get: 'at:2001Q4:bank.approval', fmt: 'x2', from: '2000Q1', until: '2012Q4' },
          { key: 'h2', get: 'at:2008Q4:extra.houseYoY', fmt: 'pct', from: '2000Q1', until: '2012Q4' }, { key: 'a2', get: 'at:2008Q4:bank.approval', fmt: 'x2', from: '2000Q1', until: '2012Q4' },
        ],
        claims: [
          { get: 'at:2001Q4:extra.houseYoY', from: '2000Q1', until: '2012Q4', gt: 0, note: '2001 年房价还在涨' },
          { get: 'at:2001Q4:bank.approval', from: '2000Q1', until: '2012Q4', gt: 1.2, note: '2001 年银行闸门开着' },
          { get: 'at:2008Q4:extra.houseYoY', from: '2000Q1', until: '2012Q4', lt: 0, note: '2008 年房价在跌' },
          { get: 'at:2008Q4:bank.approval', from: '2000Q1', until: '2012Q4', lt: 1, note: '2008 年银行闸门关小' },
        ],
        hl: ['bankApproval', 'newLoans', 'assetReservoir', 'policyRate'], concept: ['lvr', 'bankApproval', 'B2'] },

      { type: 'chain', title: '第 10 步：把主线串起来',
        text: ['这一课只有一条线：小周期 → 降息推不动 → B2 → 大周期 ⑤。点任何一环，图里对应的地方会亮。'],
        links: [
          { text: '小周期一圈：扩张 → 过热（物价或资产）→ 收紧（央行加息，里面可能带衰退）→ 降息；最后一步是一个问题：降息推得动吗？', part: 'cycle', hl: ['policyRate'], term: 'shortCycle' },
          { text: '② 缓冲池满：资产池里是借来的水，多出来的只有两条路：溢出成物价（B1，小周期自己处理），或缩水（B2，交给大周期）', part: ['pool', 'poolHousing'], hl: ['assetReservoir'], term: 'B2' },
          { text: '推得动（2001–03）：银行的闸门开着，降息把信贷带回来，回到扩张，大周期一格没动', pipe: 'newLoans', part: 'bank', hl: ['policyRate'], term: 'creditImpulse' },
          { text: '推不动（2008–12）：房价↓、债高、降了息信贷还在缩 → B2 → ⑤ 私人去杠杆 → ⑥ 政府接手（第 4 课）。曲线上就是又深又长的坑', pipe: 'collateral', part: 'cycle', hl: ['bankApproval'], term: 'longCycle' },
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
        relation: '第 3 课的 B2 圈走到了头：小周期「降息推不动」，大周期走上 B2 岔路，进入 ⑤（降息失灵，私人去杠杆）。两个环怎么接上的，见第 3.5 课。',
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
        q: '模型里 QE 在 2010 年底停了（真实的美联储后来又做了 QE2、扭曲操作和 QE3），财政注入也一步步收回；私人部门仍然几乎不借钱。接下来两年，总水量 M 会怎样？',
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
          '两个泵都在缩：财政注入从每季 {fi0} 降到 {fi1}，模型里 QE 已经停了（真实的美联储后来又做了 QE2、扭曲操作和 QE3）。',
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
          'B1 是大周期的岔路之一（缓冲池满之后水往物价溢出），交给小周期处理：加息，再降息。另一条岔路 B2 见主线第 3 课。',
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
        relation: '主线第 1 课说过：企业投资会变成更宽的河道，河道的宽度就是产能。这次河道是被外面「卡窄」的，不是 Capex 拓宽的。',
        metrics: [{ label: '有效产能（十亿美元）', get: 'macro.capacity', fmt: 'num' }, { label: '需求压力', get: 'macro.demandPressure', fmt: 'pct' }, { label: '失业率', get: 'macro.unemployment', fmt: 'pct' }],
        claims: [{ get: 'dd:macro.capacity', lt: -0.02, note: '有效产能下降' }, { get: 'min:macro.demandPressure', lt: -0.05, note: '需求压力一度为负' }, { get: 'max:macro.unemployment', gt: 0.09, note: '失业冲高' }],
        hl: ['capacity', 'goodsChannel'], concept: ['capacity', 'outputGap'] },

      { type: 'reveal', until: '2021Q2', title: '第 2 步：政府发钱',
        text: [
          '从 2020 年二季度起，政府给家庭发了大量的钱。最大的一波在 2020Q2，2021 年初又发一轮。转移支付（紫色分支）一下子变粗。',
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
          '这就是 B1：缓冲池满之后，多出来的水溢出到物价。它是大周期的岔路之一，在小周期里表现为「过热·物价」。',
        ],
        relation: '买资产的水推资产水位，买东西的水推物价水位。这次是买东西的水太多、河道又太窄。',
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
          { key: 'b1', get: 'when:cycles.short.top=price', fmt: 'str', from: '2019Q1', until: '2023Q4' },
          { key: 'b2', get: 'when:cycles.short.label=收紧（加息）（接 物价过热）', fmt: 'str', from: '2019Q1', until: '2023Q4' },
        ],
        explain: [
          '加息先改新贷款的价格，再慢慢传到房价、需求。需求压力被压下来，溢出的水少了，通胀回落到 {i1}。',
          '代价是失业：{u0} → {u1}。降温不是免费的。',
          '看「周期」页：小周期盘要通胀 ≥ 3.5% 且还在升，连续几个季度才亮「过热·物价」（溢出成物价，也就是 B1），这次 {b1} 就亮了：那时央行还没加息。{b2} 起央行加息了，圆环转到「收紧（加息）」，仍标着「接 物价过热」。',
          'B1 是大周期的岔路之一：缓冲池满后多出来的水溢出成物价，交给小周期去加息、降息。再这样反复溢出，大周期后面的格子上就会多出一个「+ B1」（⑦ + B1，2023 年就是）。',
        ],
        metrics: [{ label: '通胀', get: 'macro.inflation', fmt: 'pct' }, { label: '政策利率', get: 'rates.policy', fmt: 'pct' }, { label: '需求压力', get: 'macro.demandPressure', fmt: 'pct' }, { label: '失业率', get: 'macro.unemployment', fmt: 'pct' }],
        claims: [{ get: 'dpp:rates.policy', gt: 0.03, note: '利率升了 3 个点以上' }, { get: 'dpp:macro.demandPressure', lt: -0.05, note: '需求压力被压下来' }, { get: 'dpp:macro.unemployment', gt: 0, note: '失业上升' },
          { get: 'when:cycles.short.top=price', from: '2019Q1', until: '2023Q4', dateBetween: ['2021Q3', '2022Q1'], note: '小周期盘亮「过热·物价」（B1）' },
          { get: 'when:cycles.short.label=收紧（加息）（接 物价过热）', from: '2019Q1', until: '2023Q4', dateBetween: ['2022Q1', '2022Q3'], note: '再往后，圆环转到「收紧（加息）」' },
          { get: 'count:cycles.long.b1Overlay', from: '2019Q1', until: '2023Q4', gt: 0, note: '大周期盘上出现「⑦ + B1」' }],
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
        relation: '买资产的水不拓宽河道，只有 Capex 能。但 Capex 有滞后，这个时间差，就是通胀的窗口。',
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
        ], next: 7 },
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
        q: '2022 年起央行加息，通胀最高到 {pi}：政策利率从 {p0} 一路加到 {p1}。这两年里，**长期国债**的价格会？',
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
          '切到「周期」页。小周期盘按「扩张 → 过热（物价或资产）→ 收紧 → 降息（推得动吗？）」转（收紧 = 央行加息，里面可能带衰退）：推得动，回到扩张；推不动，交给大周期（B2 → ⑤）。有时一圈要很多年。',
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
          '每一次衰退，政府都会出手补水（主线第 4 课）；每一次景气，它只是慢慢收回一点，不会把债还掉。',
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
          { text: '银行放贷造水，同时记下欠条；还本排水，水和欠条一起消失（第 1 课）', pipe: ['newLoans', 'principalRepay'], part: 'iou', term: 'newLoans' },
          { text: '房价涨 → 抵押品变好 → 银行放宽 → 更多贷款买房 → 房价再涨：圈自己喂自己（第 2 课）', pipe: ['collateral', 'toHousing'], part: 'poolHousing', term: 'lvr' },
          { text: '央行加息的水管很长：存量房贷分批重定价，约两年后房价才转跌（第 2 课）', pipe: 'interestPaid', part: 'centralBank', hl: ['policyRate'], term: 'mortgageEff' },
          { text: '圈倒着转（大周期的 B2 岔路）：房价↓ → 银行收紧 → 新贷款↓；降息打不开银行的闸门（第 3 课）', part: 'bank', hl: ['bankApproval'], term: 'creditImpulse' },
          { text: '主线：小周期 → 降息推不动 → B2 → 大周期 ⑤。降息推得动，信贷回来，回到扩张；推不动，大周期接手。这是两个环之间唯一的连线（第 3 课）', part: 'cycle', hl: ['policyRate', 'newLoans'], term: 'B2' },
          { text: '私人去杠杆（⑤）：政府赤字和央行 QE 两个泵接手补水（⑥，第 4 课）', pipe: ['fiscalInjection', 'qe'], part: 'government', term: 'fiscalInjection' },
          { text: '需求冲过产能，溢出成物价（大周期的 B1 岔路，小周期里是「过热·物价」）；产能只有 Capex 能拓宽，且有滞后；央行加息降温（选学：Capex 与产能）', pipe: ['toConsumption', 'toCapex'], part: 'channel', hl: ['cpi', 'capacity'], term: 'B1' },
          { text: '新增的水在房、股、债、金之间分配：恐慌逃向国债，通胀时国债下跌，QE 时资产高、物价低（毕业课：投资者）', pipe: ['toBond', 'toGold', 'toEquity'], part: 'pool', term: 'assetReservoir' },
          { text: '小周期（扩张 → 过热 → 收紧 → 降息）在大周期（⑤ → ⑥ → ⑦ → ⑧ → ①）里一圈圈重复，每次降息都要答「推得动吗」，答不动才轮到大周期；每一圈债务更高、利率谷底是否更低，要看规则（本课）', part: 'cycle', term: 'longCycle' },
        ], next: 'w2', freeLink: true },
    ],
  },
  /* ============================== 世界课：出了国境（地图 / 国别） ==============================
   * kind:'world' -> menu group 「世界」. Runs on the US sim at 2008Q4 (annual world data of 2008); steps may switch the screen:
   *   map:{open:true|false, select?:'AUS', year?:2008}   dispatches mw:map (the map page); a step without `map` closes a map the lesson opened.
   * Lesson-level country:'AUS' -> starting it goes to ?country=AUS&lesson=<id> (only when COUNTRY_READY.AUS, else 「细图制作中」).
   * Numbers come from world data: vals get 'world:<path in WORLD>@<year>' (e.g. world:trade.CHN.USA@2008 = CHN exports to USA, USD bn).
   * fmt 'bn' = 十亿美元, 'tn' = 万亿美元 (input USD bn).
   */
  {
    id: 'w1', kind: 'world', label: '世界 1',
    title: '出了国境：贸易、汇率和世界储备水库',
    oneLine: '一个国家就是一个水盆；盆和盆之间只有三种水管：贸易、资本、储备。从美国的国境线出发，经地图，看到中国和澳洲。',
    rulesOn: 'all',
    startDate: '2008Q4', endDate: '2008Q4', mode: 'history', available: true,
    steps: [
      { type: 'intro', title: '先说结论', view: 'flow', map: { open: false },
        text: [
          '**结论：一个国家就是一个水盆。盆和盆之间只有三种水管：贸易（货）、资本（钱）、储备（各国央行存的备用水）。**',
          '美国这个盆你已经会看了。出了国境没有新规则，只是把别的盆接上来：别国买美国的货，美国买别国的货，别国把赚到的钱又借回来。',
          '像一条河的上下游：上游盆里水多了会往下游流，下游缺水就要接上游的水。美元是整个流域通用的水，所以美国这个盆的水位，会被全世界的水管牵动。',
          '下面分 7 步：① 国境线 ② 看地图 ③ 中国的美元去哪 ④ 世界储备水库 ⑤ 澳洲 ⑥ 汇率闸 ⑦ 三句话。',
          '时间：2008 年（全球金融危机那一年）的年度数据。每个数字都是从数据里读出来的。',
        ],
        concept: ['reserveCurrency'] },

      { type: 'reveal', title: '第 1 步：国境线', hl: ['exports', 'imports', 'foreignBonds'], concept: ['exports', 'imports', 'foreignBonds'], map: { open: false },
        text: [
          '**图的边上有一条虚线「国境线」，三根水管穿过它：出口、进口、外国人买国债。**',
          '出口：别国买美国的货，钱流进来。进口：美国买别国的货，钱流出去。外国买国债：外国的钱直接灌进长期债券池，这是资本水管。',
          '2008 年美国出口相当于 GDP 的 {ex}，进口相当于 {im}：流出去的比流进来的多。差的那一块，要靠外国人把钱借回来补上。',
        ],
        vals: [{ key: 'ex', get: 'world:countries.USA.exportsGdp@2008', fmt: 'pct0' }, { key: 'im', get: 'world:countries.USA.importsGdp@2008', fmt: 'pct0' }],
        claims: [
          { get: 'world:countries.USA.importsGdp@2008', vs: { get: 'world:countries.USA.exportsGdp@2008' }, gt: 0, note: '美国进口 > 出口' },
          { get: 'world:countries.USA.currentAccountGdp@2008', lt: 0, note: '美国经常账户为负（流出多于流入）' },
        ] },

      { type: 'reveal', title: '第 2 步：看地图', map: { open: true, year: 2008 }, concept: ['reserveCurrency'],
        text: [
          '**打开地图：一个方块就是一个盆，方块越大，GDP 越大。**',
          '2008 年美国 {us}，中国 {cn}，澳洲 {au}。盆大，只说明一年里流过的水多，不说明水位高。',
          '欧元区、日本、英国也在图上；「其他」是把剩下的国家合成一个盆，这样各条贸易水管加起来才对得上。',
          '在地图上点一个国家只是选中它，它的贸易和资本水管会亮起来，不会走进去。',
        ],
        vals: [{ key: 'us', get: 'world:countries.USA.gdpUsd@2008', fmt: 'tn' }, { key: 'cn', get: 'world:countries.CHN.gdpUsd@2008', fmt: 'tn' }, { key: 'au', get: 'world:countries.AUS.gdpUsd@2008', fmt: 'tn' }],
        claims: [
          { get: 'world:countries.USA.gdpUsd@2008', vs: { get: 'world:countries.CHN.gdpUsd@2008' }, gt: 0, note: '美国盆 > 中国盆' },
          { get: 'world:countries.CHN.gdpUsd@2008', vs: { get: 'world:countries.AUS.gdpUsd@2008' }, gt: 0, note: '中国盆 > 澳洲盆' },
        ] },

      { type: 'predict', title: '第 3 步：猜一猜', map: { open: true, select: 'CHN', year: 2008 },
        q: '选中中国。中国到美国这根贸易水管很粗：2008 年中国卖给美国 {ex}，美国卖给中国只有 {im}。中国卖货赚到一大堆美元，这些美元后来去哪了？',
        options: [
          { t: '都拿去买美国货了', ok: false, when: [{ get: 'world:trade.USA.CHN@2008', vs: { get: 'world:trade.CHN.USA@2008' }, gt: 0 }] },
          { t: '大头又借回美国，买了美国国债', ok: true, when: [{ get: 'world:ustForeign.CHN@2008', vs: { get: 'world:ustForeign.CHN@2007' }, gt: 150 }, { get: 'world:trade.CHN.USA@2008', vs: { get: 'world:trade.USA.CHN@2008' }, lt: 300 }] },
          { t: '基本没回美国', ok: false, when: [{ get: 'world:ustForeign.CHN@2008', vs: { get: 'world:ustForeign.CHN@2007' }, lt: 1 }] },
        ],
        vals: [
          { key: 'ex', get: 'world:trade.CHN.USA@2008', fmt: 'bn' }, { key: 'im', get: 'world:trade.USA.CHN@2008', fmt: 'bn' },
          { key: 'u7', get: 'world:ustForeign.CHN@2007', fmt: 'bn' }, { key: 'u8', get: 'world:ustForeign.CHN@2008', fmt: 'bn' },
        ],
        explain: [
          '大头回来了：中国手里的美国国债，2007 年底有 {u7}，2008 年底有 {u8}。这一年多买的美债，超过当年顺差（卖给美国 {ex}，减去买美国货 {im}）的一半。',
          '货从中国流向美国，美元流向中国，又以国债的形式流回美国：贸易水管和资本水管，是同一滴水的两段旅程。',
          '所以美国能一边买得多卖得少，一边利率不至于太高：别国的钱在帮它买国债。',
        ],
        claims: [
          { get: 'world:trade.CHN.USA@2008', vs: { get: 'world:trade.USA.CHN@2008' }, gt: 0, note: '中国 → 美国 出口 > 美国 → 中国' },
          { get: 'world:ustForeign.CHN@2008', vs: { get: 'world:ustForeign.CHN@2007' }, gt: 150, note: '2008 年中国多买的美债 > 1500 亿（与下一条合起来：> 顺差的一半）' },
          { get: 'world:trade.CHN.USA@2008', vs: { get: 'world:trade.USA.CHN@2008' }, gt: 100, lt: 300, note: '2008 年顺差在 1000–3000 亿之间' },
        ],
        concept: ['foreignBonds', 'exports'] },

      { type: 'reveal', title: '第 4 步：世界储备水库', map: { open: true, select: 'USA', year: 2008 }, hl: ['reserveCurrency'], concept: ['reserveCurrency', 'foreignBonds'],
        text: [
          '**美元是世界的备用水：各国央行存起来的外汇储备里，美元占 {usd}，欧元只有 {eur}。**',
          '每个国家都想存一些最不容易出问题的水，以备急用。存的办法，主要是买美国国债。所以美国可以长期进口多于出口：差额由别国拿美元买国债补回来，水又流回美国这个盆。',
          '这是美国的特权，也是风险。它靠的是信心：别人相信美元和美债是最安全的水。',
          '失去信心的那条路是这样的：外国人不再愿意存美元，买国债的水管变细，国债要给更高的利率才有人买，美元也跟着贬值。储备货币的地位一松，盆里的水就会往外流。',
        ],
        vals: [{ key: 'usd', get: 'world:reserves.USD@2008', fmt: 'pct0' }, { key: 'eur', get: 'world:reserves.EUR@2008', fmt: 'pct0' }],
        claims: [
          { get: 'world:reserves.USD@2008', gt: 0.5, note: '美元占世界储备一半以上' },
          { get: 'world:reserves.USD@2008', vs: { get: 'world:reserves.EUR@2008' }, gt: 0, note: '美元份额 > 欧元份额' },
        ] },

      { type: 'reveal', title: '第 5 步：澳洲，原料盆', map: { open: true, select: 'AUS', year: 2008 }, concept: ['fx', 'exports'],
        text: [
          '**澳洲是靠卖原料赚钱的盆：铁矿石、煤、天然气，大头卖给中国。**',
          '2008 年澳洲卖给中国 {ac}，卖给美国只有 {au}。中国要盖房子、修路，澳洲的矿就好卖；中国放慢，澳洲的出口水管就变细。',
          '所以澳元像一道联动闸：原料价格高、澳洲利率高，外国的水往里涌，澳元强；反过来澳元弱。2007 年 1 美元换 {fx7} 澳元，2009 年要换 {fx9} 澳元：全球危机里澳元变弱了。',
          '选中澳洲后，卡片上有「进入澳洲的水流图 →」按钮。现在它还是「细图制作中」，做好以后会有专门的一课（世界 2）。',
        ],
        vals: [
          { key: 'ac', get: 'world:trade.AUS.CHN@2008', fmt: 'bn' }, { key: 'au', get: 'world:trade.AUS.USA@2008', fmt: 'bn' },
          { key: 'fx7', get: 'world:countries.AUS.fxPerUsd@2007', fmt: 'n2' }, { key: 'fx9', get: 'world:countries.AUS.fxPerUsd@2009', fmt: 'n2' },
        ],
        claims: [
          { get: 'world:trade.AUS.CHN@2008', vs: { get: 'world:trade.AUS.USA@2008' }, gt: 0, note: '澳洲 → 中国 出口 > 澳洲 → 美国' },
          { get: 'world:countries.AUS.fxPerUsd@2009', vs: { get: 'world:countries.AUS.fxPerUsd@2007' }, gt: 0, note: '澳元 2009 比 2007 弱（1 美元换更多澳元）' },
        ] },

      { type: 'reveal', title: '第 6 步：汇率闸', view: 'flow', map: { open: false }, hl: ['fx'], concept: ['fx', 'foreignBonds'],
        text: [
          '**汇率是国境线上的一道闸。利率高，水压高，外国的水往里挤，本国货币变强；利率低，水往外流，货币变弱。**',
          '回到美国这张图，在国境线上找「汇率」那道闸。2008 年澳洲的政策利率是 {ra}，美国是 {ru}：水压差这么大，钱愿意去澳洲放着。',
          '但闸不只看水压。全世界害怕的时候，水先逃回美元（避险），再高的利率也拦不住。2008 年底澳元就是这样跌的。',
          '读汇率，先问两件事：谁的水压更高？现在世界是在冒险还是在避险？',
        ],
        vals: [{ key: 'ra', get: 'world:countries.AUS.policyRate@2008', fmt: 'pct' }, { key: 'ru', get: 'world:countries.USA.policyRate@2008', fmt: 'pct' }],
        claims: [{ get: 'world:countries.AUS.policyRate@2008', vs: { get: 'world:countries.USA.policyRate@2008' }, gt: 0, note: '2008 年澳洲政策利率 > 美国' }] },

      { type: 'recap', title: '第 7 步：三句话', map: { open: false },
        lines: [
          '一个国家一个盆；盆和盆之间只有三种水管：贸易（货）、资本（钱）、储备（备用水）。',
          '货从甲流到乙，钱又以国债等形式流回来；美元是世界的备用水，所以美国能长期进口多于出口，靠的是别人的信心。',
          '利率是水压，汇率是国境线上的闸：水压高，水往里流，货币强；恐慌时，水先逃向美元。',
        ],
        concepts: ['exports', 'imports', 'fx', 'foreignBonds', 'reserveCurrency'], next: 'w2' },
    ],
  },

  /* 世界 2: the AUS country view. Runs on the AUS sim (lesson-level country:'AUS' -> ?country=AUS&lesson=w2; scratch runs use createSim({ data: AUS_Q, country:'AUS' })).
   * Getters: model numbers 'agg:path' (AUS sim), REAL data 'real:agg:series' (AUS_Q.series, no simulation), annual 'world:...' (also world:path@y0>y1 = change y1/y0-1).
   * fmt 'aud' = 十亿澳元 (model flows are local-currency bn per quarter). step.wavesNow:{iso,has} -> the checker verifies the waves.js NOW label. */
  {
    id: 'w2', kind: 'world', label: '世界 2', country: 'AUS',
    title: '澳洲：同一套水流，换一个国家',
    oneLine: '同一台水机器，换成澳洲的数据和几个设置：浮动房贷让利率咬得快，2008 年没有走进 B2，2022 年加息当季就落到家庭，今天小周期在收紧段的尾部。',
    rulesOn: 'all',
    startDate: '2006Q1', endDate: '2025Q4', mode: 'history', available: true,
    steps: [
      { type: 'intro', title: '先说结论', view: 'flow', map: { open: false },
        text: [
          '**结论：同一台水机器，换一个国家的设置，讲出来的故事就不一样。规则一条没改，改的是房贷利率的类型、房价的高低、出口卖给谁。**',
          '你在美国那张图里学到的一切，原样用在澳洲：银行、家庭、央行、国境线。这一课不教新规则，只问两件事：哪里不同？不同带来了什么？',
          '下面分 7 步：① 哪里不同 ② 2008：澳洲没走 B2 ③ 2020：冲击与 JobKeeper ④ 2022–2023：通胀与加息 ⑤ 今天（2025） ⑥ 模型的偏差 ⑦ 三句话。',
          '时间：1995–2025 年的季度数据，利率用澳联储的真实路径。每个模型数字都是现场算的；真实数据另外标明。',
        ] },

      { type: 'reveal', title: '第 1 步：哪里不同', from: '2006Q1', until: '2007Q4', hl: ['exports', 'fx'], concept: ['exports', 'fx'],
        text: [
          '**结论：三处设置不同：房贷多是浮动利率，房价高，出口大头卖给中国。**',
          '一，浮动房贷。美国的房贷多是长期固定，加息要等存量分批重定价，约两年后才咬到（第 2 课）。澳洲的房贷多是浮动的，澳联储一调，当季利息就变：水管短，水压传得快。2006 年初到 2007 年底，政策利率加了 {dp}，家庭还本付息占收入的比例（DSR）就从 {d0} 升到 {d1}。',
          '二，房价高。1995 到 2007 年，模型里的房价涨了 {hp}，家庭收入只涨了 {inc}；家庭债务占 GDP 从 {hd0}（真实）升到 {hd1}。房子是借钱撑起来的，所以利率一动，水位就晃。',
          '三，国境线。看图右边的国境线：出口水管和汇率闸。澳洲出口相当于 GDP 的 {ex}，美国只有 {exu}；大头是铁矿石、煤和天然气，主要卖给中国。2007 年底模型里每季出口约 {qx}。中国买得多，出口管就粗，澳元也跟着强；中国放慢，反过来。',
        ],
        vals: [
          { key: 'dp', get: 'dpp:rates.policy', fmt: 'pp' }, { key: 'd0', get: 'start:household.dsr', fmt: 'pct' }, { key: 'd1', get: 'end:household.dsr', fmt: 'pct' },
          { key: 'hp', get: 'chg:assets.housing.price', fmt: 'pct0', from: '1995Q1', until: '2007Q4' }, { key: 'inc', get: 'chg:household.income', fmt: 'pct0', from: '1995Q1', until: '2007Q4' },
          { key: 'hd0', get: 'real:at:1995Q1:hhDebtGdp', fmt: 'pct0', from: '1995Q1', until: '2007Q4' }, { key: 'hd1', get: 'real:at:2007Q4:hhDebtGdp', fmt: 'pct0', from: '1995Q1', until: '2007Q4' },
          { key: 'ex', get: 'world:countries.AUS.exportsGdp@2007', fmt: 'pct0' }, { key: 'exu', get: 'world:countries.USA.exportsGdp@2007', fmt: 'pct0' },
          { key: 'qx', get: 'end:border.exports', fmt: 'aud' },
        ],
        claims: [
          { get: 'dpp:household.dsr', gt: 0.01, note: '2006–2007 年加息抬高 DSR 超过 1 个点（浮动房贷）' },
          { get: 'chg:assets.housing.price', from: '1995Q1', until: '2007Q4', vs: { get: 'chg:household.income' }, gt: 0, note: '房价涨幅 > 收入涨幅' },
          { get: 'world:countries.AUS.exportsGdp@2007', vs: { get: 'world:countries.USA.exportsGdp@2007' }, gt: 0, note: '澳洲出口/GDP > 美国' },
        ] },

      { type: 'predict', title: '第 2 步：猜一猜（2008）', from: '2007Q4', until: '2010Q4', tab: 'cycle', hl: ['exports', 'policyRate'], concept: ['shortCycle', 'longCycle'],
        q: '2008 年，美国房价从 2006 年到 2012 年跌了 {us}，银行收紧，长周期掉进 B2 → ⑤（私人去杠杆）。澳洲同样是高房价、高房贷，用的是同一台水机器。澳洲 2008 会不会也走 B2？',
        options: [
          { t: '会：高房价高房贷，和美国一样', ok: false, when: [{ get: 'qcount:cycles.long.fork=B2', gt: 0 }] },
          { t: '房价会跌一大截，只是没进 B2', ok: false, when: [{ get: 'dd:assets.housing.price', lt: -0.1 }] },
          { t: '不会：房价基本没跌，长周期留在原位', ok: true, when: [{ get: 'qcount:cycles.long.fork=B2', lt: 0.5 }, { get: 'max:cycles.long.stage', lt: 5 }, { get: 'dd:assets.housing.price', gt: -0.1 }] },
        ],
        vals: [
          { key: 'us', get: 'world:countries.USA.houseReal@2006>2012', fmt: 'apct0' },
          { key: 'hr', get: 'real:dd:houseIndex', fmt: 'apct1' }, { key: 'hr2', get: 'real:chg:houseIndex', fmt: 'pct0' }, { key: 'hm', get: 'chg:assets.housing.price', fmt: 'pct0' },
          { key: 'um', get: 'max:macro.unemployment', fmt: 'pct' }, { key: 'ur', get: 'real:max:unemployment', fmt: 'pct' },
          { key: 'cx', get: 'world:trade.AUS.CHN@2008>2010', fmt: 'pct0' },
          { key: 'rp', get: 'real:dpp:policyRate', fmt: 'ppa', from: '2008Q3', until: '2009Q2' },
          { key: 'dd', get: 'dpp:household.dsr', fmt: 'ppa', from: '2008Q3', until: '2009Q2' },
        ],
        explain: [
          '不会。真实的澳洲房价，2008 年最多回撤 {hr}，到 2010 年底已经比 2007 年底高 {hr2}；模型里这三年房价涨了 {hm}。没有崩，银行就没有被抵押品拖垮，长周期没有掉进 B2。',
          '失业率也没有跳：模型里最高 {um}，真实最高 {ur}，都只是小幅波动。',
          '为什么？一，中国的刺激让出口水管不但没变细，澳洲卖给中国的货 2008 到 2010 年还多了 {cx}。二，澳联储下手快：2008 年第三季度到 2009 年第二季度，政策利率降了 {rp}。三，房贷是浮动的，降息当季就落到家庭：模型里 DSR 同期降了 {dd}，家庭很快喘过气来。',
          '这就是「换设置、换故事」：同一台机器，美国掉进了 ⑤，澳洲没有。',
        ],
        claims: [
          { get: 'qcount:cycles.long.fork=B2', lt: 0.5, note: '2008–2010 年没有 B2 岔路' },
          { get: 'max:cycles.long.stage', lt: 5, note: '长周期没到 ⑤' },
          { get: 'real:dd:houseIndex', gt: -0.1, note: '真实房价回撤 < 10%' },
          { get: 'world:countries.USA.houseReal@2006>2012', lt: -0.2, note: '美国房价 2006–2012 年跌超两成' },
          { get: 'max:macro.unemployment', lt: 0.07, note: '模型失业率始终 < 7%' },
          { get: 'world:trade.AUS.CHN@2008>2010', gt: 0, note: '澳洲对中国出口 2010 年比 2008 年多' },
          { get: 'real:dpp:policyRate', from: '2008Q3', until: '2009Q2', lt: -0.03, note: '澳联储 2008Q3–2009Q2 降息 > 3 个点' },
          { get: 'dpp:household.dsr', from: '2008Q3', until: '2009Q2', lt: -0.02, note: '同期模型 DSR 降 > 2 个点（浮动房贷）' },
        ] },

      { type: 'reveal', title: '第 3 步：2020，冲击与 JobKeeper', from: '2019Q4', until: '2021Q1', hl: ['capacity'], concept: ['shortCycle'],
        text: [
          '**结论：2020 年是「产能被按住」的冲击，不是「工作消失」的冲击。**',
          '封锁让一部分产能暂时开不了工：模型里产能损失最高 {cl}。需求塌了，失业率也跳了一下：模型最高 {um}，真实最高 {ur}，两条线都是一个尖峰，很快回落。',
          'JobKeeper（政府替企业发工资的补贴）让工人留在雇主名下，所以工作岗位没有真的消失，失业率的上升比产出的下滑小得多。模型里政府债务占 GDP 为此抬高到 {gd}，随后又收回。',
          '这和 2008 年一脉相承：水一断，政府和央行马上补水；水管短（浮动房贷），补水当季就到家庭。',
        ],
        vals: [
          { key: 'cl', get: 'max:extra.capacityLoss', fmt: 'pct' },
          { key: 'um', get: 'max:macro.unemployment', fmt: 'pct' }, { key: 'ur', get: 'real:max:unemployment', fmt: 'pct' },
          { key: 'gd', get: 'max:gov.debtGdp', fmt: 'pct0' },
        ],
        claims: [
          { get: 'max:extra.capacityLoss', gt: 0.05, note: '2020 年有明显的产能损失' },
          { get: 'max:macro.unemployment', vs: { get: 'start:macro.unemployment' }, gt: 0.02, note: '失业率尖峰 > 2 个点' },
          { get: 'real:max:unemployment', vs: { get: 'real:start:unemployment' }, gt: 0.01, note: '真实失业率也有尖峰' },
          { get: 'end:macro.unemployment', vs: { get: 'max:macro.unemployment' }, lt: -0.01, note: '失业率到 2021 年初已回落' },
        ] },

      { type: 'reveal', title: '第 4 步：2022–2023，通胀与加息', from: '2022Q2', until: '2023Q4', tab: 'cycle', hl: ['policyRate', 'interestPaid'], concept: ['policyRate'],
        text: [
          '**结论：通胀回来了，澳联储加息；因为房贷是浮动的，加息几乎立刻落到家庭的利息上，DSR 涨得快。**',
          '2022 年第二季度到 2023 年第四季度，政策利率加了 {dp}（澳联储真实路径）。模型里家庭 DSR 从 {d0} 升到 {d1}，涨了 {dd}；真实的 DSR 涨了 {rd}。方向对，幅度偏大，这是模型的偏差。',
          '还有一个只属于澳洲的坎：2020–2021 年有一大批人锁了便宜的固定利率，2022 到 2024 年陆续到期，换成浮动利率，叫「固定利率悬崖」。所以存量房贷的平均利率是慢慢追上来的：到 2023 年底只加了 {me1}，到 2024 年底才加了 {me2}。',
          '小周期的拨盘在 {tt} 换到「收紧（加息）」（接物价过热）。这时水管短的代价最清楚：家庭的钱先被利息抽走，消费被压下去，通胀才降得下来。',
        ],
        vals: [
          { key: 'dp', get: 'dpp:rates.policy', fmt: 'pp' }, { key: 'd0', get: 'start:household.dsr', fmt: 'pct' }, { key: 'd1', get: 'end:household.dsr', fmt: 'pct' },
          { key: 'dd', get: 'dpp:household.dsr', fmt: 'pp' }, { key: 'rd', get: 'real:dpp:hhDsr', fmt: 'pp' },
          { key: 'me1', get: 'dpp:rates.mortgageEff', fmt: 'pp' }, { key: 'me2', get: 'dpp:rates.mortgageEff', fmt: 'pp', until: '2024Q4' },
          { key: 'tt', get: 'when:cycles.short.phase=tight', fmt: 'str' },
        ],
        claims: [
          { get: 'dpp:household.dsr', gte: 0.02, note: 'DSR 2022Q2→2023Q4 升 ≥ 2 个点（浮动房贷）' },
          { get: 'real:dpp:hhDsr', gt: 0.01, note: '真实 DSR 也升了 > 1 个点' },
          { get: 'dpp:household.dsr', vs: { get: 'real:dpp:hhDsr' }, gt: 0, note: '模型 DSR 涨幅 > 真实（偏大）' },
          { get: 'dpp:rates.mortgageEff', until: '2024Q4', vs: { get: 'dpp:rates.mortgageEff', until: '2023Q4' }, gt: 0, note: '存量房贷利率到 2024 年底追得更多（固定利率悬崖）' },
          { get: 'dpp:rates.policy', gt: 0.03, note: '政策利率加 > 3 个点' },
          { get: 'qcount:cycles.short.phase=tight', gt: 3, note: '2022Q2–2023Q4 小周期处在「收紧」' },
        ] },

      { type: 'reveal', title: '第 5 步：今天（2025），收紧段的尾部', from: '2024Q4', until: '2025Q4', tab: 'cycle', map: { open: true, select: 'AUS', year: 2025 }, hl: ['policyRate'], concept: ['shortCycle', 'exports'],
        wavesNow: { iso: 'AUS', has: '收紧' },
        text: [
          '**结论：今天澳洲的小周期在收紧段的尾部：加息压住了通胀，但偿债变重；澳联储已经开始降息。**',
          '周期页对澳洲今天的判断是：小周期在收紧，加息压通胀，偿债变重（2020 年起的短周期）。模型的拨盘上，「收紧」从 {tt} 一直到 2025 年第一季度，第二季度起转到「降息（推得动吗？）」：澳联储开始降息。',
          '两个读数。2025 年底，政策利率 {pol}（峰值 {pk}）；家庭 DSR 还有 {dsr}，比 2022 年初高 {dsr0}。水压松了一点，但水管短：房贷还在咬着家庭。',
          '再看地图（已选中澳洲）：2025 年澳洲卖给中国 {ac}，卖给美国只有 {au}。出口水管的粗细，仍然系在中国一个国家身上。',
          '问：这次降息推得动吗？看信贷脉冲和失业率（主线第 3 课）。',
        ],
        vals: [
          { key: 'tt', get: 'when:cycles.short.phase=tight', fmt: 'str', from: '2022Q2', until: '2025Q4' },
          { key: 'pol', get: 'end:rates.policy', fmt: 'pct' }, { key: 'pk', get: 'max:rates.policy', fmt: 'pct', from: '2022Q2', until: '2025Q4' },
          { key: 'dsr', get: 'end:household.dsr', fmt: 'pct' }, { key: 'dsr0', get: 'dpp:household.dsr', fmt: 'pp', from: '2022Q1' },
          { key: 'ac', get: 'world:trade.AUS.CHN@2025', fmt: 'bn' }, { key: 'au', get: 'world:trade.AUS.USA@2025', fmt: 'bn' },
        ],
        claims: [
          { get: 'when:cycles.short.phase=tight', from: '2022Q2', until: '2025Q4', dateBefore: 'when:cycles.short.phase=ease', note: '拨盘先「收紧」后「降息」' },
          { get: 'end:household.dsr', vs: { get: 'start:household.dsr', from: '2022Q1', until: '2022Q1' }, gt: 0.02, note: '2025 年底 DSR 仍比 2022 年初高 > 2 个点' },
          { get: 'world:trade.AUS.CHN@2025', vs: { get: 'world:trade.AUS.USA@2025' }, gt: 0, note: '澳洲 → 中国 出口 > 澳洲 → 美国' },
        ] },

      { type: 'reveal', title: '第 6 步：模型的偏差，诚实交代', from: '2025Q4', concept: ['longCycle'],
        text: [
          '**结论：这台玩具机器能讲出大方向，但有三处和真实对不上。你要知道它哪里看不见。**',
          '一，失业率偏高。2023 到 2025 年，模型平均 {u1}，真实平均 {u2}：明显偏高。所以模型里的「衰退」成分比真实更重。',
          '二，缺了 2017–2019 年的房价回调。真实房价那几年回撤了 {h1}（监管机构 APRA 限制投资性房贷和只付利息贷款）；模型里同期房价还涨了 {h2}。监管这种「人为拧阀门」，模型里没有。',
          '三，缺了 2008 年的股市下跌。真实的澳洲股指从 2007 年底到 2009 年第一季度跌了 {e1}，模型里只回撤 {e2}。那是全球恐慌传过来的，国境线上的避险情绪，模型没有画。',
          '怎么用：看大方向（浮动房贷让利率咬得快，2008 年没崩，2022 年 DSR 涨得快），别拿它预测明天的数字。',
        ],
        vals: [
          { key: 'u1', get: 'avg:macro.unemployment', fmt: 'pct', from: '2022Q4', until: '2025Q4' }, { key: 'u2', get: 'real:avg:unemployment', fmt: 'pct', from: '2022Q4', until: '2025Q4' },
          { key: 'h1', get: 'real:dd:houseIndex', fmt: 'apct1', from: '2017Q1', until: '2019Q4' }, { key: 'h2', get: 'chg:assets.housing.price', fmt: 'pct0', from: '2017Q1', until: '2019Q4' },
          { key: 'e1', get: 'real:dd:equityIndex', fmt: 'apct0', from: '2007Q4', until: '2009Q1' }, { key: 'e2', get: 'dd:assets.equity.price', fmt: 'apct0', from: '2007Q4', until: '2009Q1' },
        ],
        claims: [
          { get: 'avg:macro.unemployment', from: '2022Q4', until: '2025Q4', vs: { get: 'real:avg:unemployment' }, gt: 0.008, note: '模型 2023–2025 失业率比真实高 > 0.8 个点' },
          { get: 'real:dd:houseIndex', from: '2017Q1', until: '2019Q4', lt: -0.05, note: '真实房价 2017–2019 年回撤 > 5%' },
          { get: 'dd:assets.housing.price', from: '2017Q1', until: '2019Q4', gt: -0.02, note: '模型里同期房价几乎没回撤' },
          { get: 'real:dd:equityIndex', from: '2007Q4', until: '2009Q1', lt: -0.3, note: '真实股指 2008 年跌 > 30%' },
          { get: 'dd:assets.equity.price', from: '2007Q4', until: '2009Q1', gt: -0.15, note: '模型股价回撤 < 15%' },
        ] },

      { type: 'recap', title: '第 7 步：三句话',
        lines: [
          '同一台水机器，换国家只是换数据和几个设置：浮动房贷、高房价、出口卖给中国。',
          '设置不同，故事就不同：2008 年澳洲没有走 B2，2022 年加息当季就落到家庭的利息上，今天处在小周期收紧段的尾部。',
          '这台机器是玩具：失业率偏高，漏了 2017–2019 年的房价回调和 2008 年的股市下跌；看大方向，别当预测。',
        ],
        concepts: ['exports', 'fx', 'shortCycle'] },
    ],
  },

  /* ============================== 两节大课：汇率 → 投资者 (after the main line; m5 -> fx -> inv) ==============================
   * Data in their own files (src/data/lesson-fx.js, src/data/lesson-investor.js), checked by tools/check_lesson_fx.mjs and
   * tools/check_lesson_investor.mjs (check_lessons.mjs only checks their place in the course). 汇率 absorbs 世界 1 (now 旧版).
   */
  LESSON_FX,
  LESSON_INVESTOR,
];

export const LESSON_BY_ID = Object.fromEntries(LESSONS.map(l => [l.id, l]));

// The course menu (src/ui/lessons.js), top to bottom. Keys are lesson ids, or 'role:<player>' for the town role lessons.
//   main      主线 (~1 hour), in order; each hands over to the next (last step `next`); m5 -> the first `later` lesson
//   later     the two big lessons right after the main line (汇率 -> 投资者), badges 「推荐 6 / 7」
//   advanced  选学, after those
//   legacy    旧版课程 (collapsed group at the bottom): still reachable by ?lesson=ID, nothing removed (世界 1: absorbed by 汇率)
export const COURSE = {
  main: ['m1', 'm2', 'm3', 'm4', 'm5'],
  later: ['fx', 'inv'],
  advanced: [5, 7, 'w2'],
  legacy: [0, '0b', 'role:bank', 'role:household', 'role:centralBank', 'role:government', 'role:firm', 'role:investor', 'role:foreign', 1, 2, 3, '3b', 4, 6, 'w1'],
};
