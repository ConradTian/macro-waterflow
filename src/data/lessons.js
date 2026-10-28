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

// Cycle lessons 1-3 run the FULL model (all rules on). Reason: with only the bank/household rules the bank_loosen.max and
// bank_tighten_* experiments barely move anything; the effects below were measured on the full model.

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
