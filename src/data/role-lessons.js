// 角色课 (role lessons) as DATA: one lesson per player. Drives the lesson runner (src/ui/lessons.js, extended by the TEACH-UI agent).
//
// Lesson   = { id:'role-xxx', role, title, oneLine, rulesOn:[ruleId], startDate, endDate, mode:'history', available, note?,
//              startParts:[partId], steps:[...] }
// Shared step fields: { type, title, text:[paragraph...] (**bold**; known keywords auto-link), hl:[flow term ids], concept:[concept ids] }
// Step types (same as lessons.js): intro | watch{until} | predict{q,options,explain,until} | experiment{from,until,choices,metrics,insight} | recap{lines,concepts,next}
// NEW step types:
//   reveal   { show:[partIds], text, question?, answerHint? }
//              part ids (cumulative, on top of lesson.startParts): bank pool repay household firm channel cash centralBank government capex interest
//              (tabs, if ever wanted: ledger cycle assets takeover). No time passes: the sim stays at the previous step's end date.
//   takeover { role, from, until, decision:{key,min,max,step,default,label,fmt}, metrics:[{label,get,fmt}], insight }
//              user takes over `role` from `from`, holds `decision.key` constant (sim.setDecision(role,{[key]:v})) until `until`;
//              window plays, real / model / user lines are compared. `metrics` use the same 'end:|max:|min:|sum:path' spec as experiment
//              (fallback table if the UI has no chart). fmt 'pct2' = percent with 2 decimals (fallback: 'pct').
// All numbers quoted in the text come from RULE_BY_ID (the engine's own defaults), so the text cannot drift from rules.js.
// Verified by tools/check_role_lessons.mjs (ids exist; predict answers are what the model really does).
//
// `next` in recap: role-lesson id (string) or a cycle-lesson id (number).

import { RULE_DEFS, RULE_BY_ID } from '../engine/rules.js';

const ALL = RULE_DEFS.map(r => r.id);
const R = (id, k) => RULE_BY_ID[id].params[k];
const p0 = x => Math.round(x * 100) + '%';
const p1 = x => (Math.round(x * 1000) / 10) + '%';
const pp = x => (Math.round(x * 1000) / 10) + ' 个点';
const x2 = x => x.toFixed(2);

// builds a lesson: numbers the middle steps ("第 k 步"), fills the "下面分 N 步" line in the intro
function lesson(def) {
  const mid = def.steps.filter(s => s.type !== 'intro' && s.type !== 'recap');
  const circ = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫';
  const outline = `下面分 ${mid.length} 步：` + mid.map((s, i) => circ[i] + s.title).join(' ');
  let k = 0;
  const steps = def.steps.map(s => {
    const t = { ...s };
    if (t.type !== 'intro' && t.type !== 'recap') { k += 1; t.title = `第 ${k} 步：${t.title}`; }
    if (t.type === 'intro') t.text = t.text.map(x => (x === '{{STEPS}}' ? outline : x));
    return t;
  });
  return { mode: 'history', rulesOn: ALL, ...def, steps };
}

export const ROLE_LESSONS = [
  /* ============================ 央行 ============================ */
  lesson({
    id: 'role-centralBank', role: 'centralBank',
    title: '央行：只拧一个总闸',
    oneLine: '央行只有一个大阀门：政策利率。它能改水价，却不能直接决定银行放多少贷款，而且水价变化要过好几个季度才流到下游。',
    startDate: '2003Q1', endDate: '2010Q4', available: true,
    startParts: ['centralBank', 'bank'],
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**结论：央行手里只有一个大阀门：政策利率（利率压到底以后才有第二个：QE）。它能改水价，不能直接决定银行放多少贷款。**',
          '就像水库管理员只拧总闸：下游每家每户用多少水，他管不到；而且水要流好几个季度才到下游。',
          '{{STEPS}}',
          '时间：2003Q1 → 2010Q4，都是真实的美国季度。',
        ],
        hl: ['policyRate'], concept: ['policyRate', 'mortgageEff'] },

      { type: 'reveal', title: '它想要什么', show: ['centralBank'],
        text: [
          `央行想要三件事：**物价稳**（通胀接近 ${p0(R('cb_taylor', 'target'))}）、**就业稳**（失业别太高）、**金融系统别出事**。`,
          '好比水库管理员：不想发洪水（通胀），也不想断流（失业和信贷冻结）。',
        ],
        question: '先想一想：央行能直接命令银行“今年放 1 万亿贷款”吗？',
        answerHint: '不能。央行只能改水价（利率）。放多少贷款，是银行（看抵押品和坏账）和家庭（想不想借）一起决定的。',
        hl: ['policyRate'], concept: ['policyRate'] },

      { type: 'reveal', title: '它看得到什么，看不到什么', show: ['centralBank', 'channel'],
        text: [
          '**看得到**（规则真正读的数）：通胀、失业率、需求压力（需求比产能多还是少）、信贷脉冲，再加上私人债务总量占 GDP 的比例。',
          '**看不到**：每家银行的资本和坏账、每户家庭的月供压力、资产池里的价格偏没偏离、企业的 Capex 管道和真实产能，以及将来会不会来一次油价冲击。',
          '所以央行像只能看后视镜开车：看到通胀高才加息，等水流到下游，已经晚了半拍。',
        ],
        question: '想一想：为什么说央行总是“慢半拍”？',
        answerHint: '它读的都是已经发生的数（通胀、失业），而拧了阀门之后，水还要几个季度才流到下游。',
        hl: ['cpi', 'goodsChannel'], concept: ['cpi', 'unemployment', 'outputGap', 'creditImpulse'] },

      { type: 'reveal', title: '它能拧哪个阀门', show: ['centralBank', 'bank', 'interest'],
        text: [
          '**阀门①：政策利率**。最短期借钱的价格。拧它，银行的资金成本和新房贷利率先变（图里央行框里的数字）。',
          `**阀门②：QE**。政策利率压到约 ${p1(R('cb_qe', 'floorRate'))} 以下、私人信贷还在收缩、失业又高时，央行直接买债，把新水注进池子。`,
          '注意：两个阀门都是“改价格”或“直接加水”。银行框里那个审批小圆点，不归央行管。',
        ],
        hl: ['policyRate', 'qe', 'bankApproval'], concept: ['policyRate', 'qe'] },

      { type: 'watch', until: '2004Q2', title: '它的规则：看它动手',
        text: [
          '央行有三条规则，都在“规则清单”里：',
          '① **真实路径**（cb_real_path）：历史模式下，利率照着真实联储走。这是输入，不是模型算的。',
          `② **泰勒规则**（cb_taylor）：目标利率 = 中性利率 + 通胀 + ${R('cb_taylor', 'wInfl')}×(通胀 − ${p0(R('cb_taylor', 'target'))}) + 失业缺口反应。每季只向目标走 ${p0(R('cb_taylor', 'smooth'))}，一季最多动 ${pp(R('cb_taylor', 'maxMove'))}，最低 ${p1(R('cb_taylor', 'floor'))}；私人债务越重，中性利率越低。关掉真实路径后它才接手。`,
          `③ **QE**（cb_qe）：利率到底 + 信贷收缩 + 失业高，才启动；通胀回到 ${p1(R('cb_qe', 'piOff'))} 以上或失业回落就停。`,
          '看这个：这一段利率压在很低的位置。每次利率变动约 0.25 个点以上，记录栏会写一行“规则 + 动作”。',
        ],
        hl: ['policyRate'], concept: ['policyRate'] },

      { type: 'predict', from: '2004Q2', until: '2006Q2', title: '猜一猜',
        q: '从 2004 年中起，央行连续加息，政策利率从约 1% 升到约 5%。同期，家庭实际在付的房贷利率（有效房贷利率）会怎样？',
        options: [
          { t: '跟着升了近 4 个点', ok: false },
          { t: '升得很少（不到一半），甚至没升', ok: true },
          { t: '先暴涨后暴跌', ok: false },
        ],
        explain: [
          '央行改的只是新贷款的价格。存量房贷每季只向新利率靠近一小步（约 10%）。',
          '新房贷利率里，约 3/4 跟的是长期国债收益率，而长债又只是政策利率路径的慢平均。',
          '所以总闸拧了，下游的水价还没怎么变。这就是传导延迟。',
        ],
        hl: ['policyRate', 'interestPaid'], concept: ['mortgageEff'] },

      { type: 'reveal', title: '拧了以后水怎么流（一）：先到家庭', show: ['household', 'interest'],
        text: [
          '顺着水流，按“谁先动”的顺序：央行加息 → 银行的新房贷更贵 → 只有新借款的人立刻多付 → 老房贷分批重定价，家庭的付息（橙管）一季一季变重 → 偿债率 DSR 慢慢爬升。',
          '看这个：付息管是慢慢变粗，不是一下变粗。',
        ],
        question: '想一想：谁最先感觉到加息？',
        answerHint: '新借款的人，和刚好到期重定价的那一小批。大多数家庭还在付老利率。',
        hl: ['interestPaid'], concept: ['dsr', 'mortgageEff'] },

      { type: 'reveal', title: '拧了以后水怎么流（二）：再到资产池和河道', show: ['pool', 'channel'],
        text: [
          'DSR 升高、借款变贵 → 家庭借得少 → 新贷款（蓝管）变细 → 流进房产的水少了，资产池水位涨得慢甚至回落 → 买东西的水少了，商品河道里的需求压力降温，通胀回落。',
          '这一整条链要约 4–8 个季度。央行没碰银行的闸门，但水价变了以后，银行和家庭会按自己的规则去反应。',
        ],
        hl: ['newLoans', 'assetReservoir', 'goodsChannel', 'cpi'], concept: ['newLoans', 'assetReservoir', 'cpi'] },

      { type: 'watch', until: '2010Q4', title: '降息、触底、QE',
        text: [
          '后面的故事：房价掉头、失业升高，央行一路降息。',
          '利率压到接近 0，总闸已经拧到头。这时 QE 规则触发：央行买债，新水直接注进池子（图左上的 QE 管亮起来）。',
          '看这个：QE 管变粗的那几个季度；还有银行的审批小圆点，它并没有因为降息就回到原位。',
        ],
        hl: ['qe', 'bankApproval', 'newLoans'], concept: ['qe', 'bankApproval'] },

      { type: 'takeover', role: 'centralBank', title: '换你来拧', from: '2004Q1', until: '2009Q4',
        text: [
          '现在你是央行。从 2004Q1 起，你把政策利率定在一个数上，之后一直不动。',
          '试试：一直压在 1%（不加息）会怎样？一直 5%（一开始就从紧）又会怎样？',
          '播放后对比三条线：真实、模型（按规则）、你的版本。',
        ],
        decision: { key: 'policyRate', min: 0, max: 0.10, step: 0.0025, default: 0.01, label: '政策利率（全程保持）', fmt: 'pct2' },
        metrics: [
          { label: '期间房价峰值', get: 'max:assets.housing.price', fmt: 'idx' },
          { label: '期间通胀峰值', get: 'max:macro.inflation', fmt: 'pct' },
          { label: '期间失业率峰值', get: 'max:macro.unemployment', fmt: 'pct' },
          { label: '期末家庭 DSR', get: 'end:household.dsr', fmt: 'pct' },
        ],
        insight: '利率只是水价。它改变的是“借钱有多贵”，不是“银行放不放”。拧得太松，通胀和房价冲得高；拧得太紧，失业和债务压力来得更早。',
        hl: ['policyRate'] },

      { type: 'recap', title: '总结',
        lines: [
          '央行只拧总闸：政策利率（到底以后才有 QE）。它改水价，不直接决定贷款量。',
          '传导有延迟：新贷款先变，存量房贷分批重定价，一整条链约 4–8 个季度。',
          '央行读的是后视镜（通胀、失业、缺口），所以总是慢半拍。下一课看银行：那道真正决定放多少水的闸门。',
        ],
        concepts: ['policyRate', 'mortgageEff', 'qe', 'creditImpulse'], next: 'role-bank' },
    ],
  }),

  /* ============================ 银行 ============================ */
  lesson({
    id: 'role-bank', role: 'bank',
    title: '银行：开闸与关闸',
    oneLine: '银行不创造需求，它只管一道闸门：抵押品好就开大，抵押品差就关小。所以它把繁荣放大，也把萧条放大。',
    startDate: '2003Q1', endDate: '2010Q4', available: true,
    startParts: ['bank', 'household', 'interest'],
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**结论：银行不创造需求，它只管一道闸门（审批倍数）。抵押品好就开大，抵押品差就关小，所以它把繁荣和萧条都放大。**',
          '像水渠上的闸门管理员：他不是水源，但闸门开多大，决定下游有多少水。',
          '{{STEPS}}',
          '时间：2003Q1 → 2010Q4，真实美国季度。',
        ],
        hl: ['bankApproval', 'newLoans'], concept: ['bankApproval', 'lvr'] },

      { type: 'reveal', title: '它想要什么', show: ['bank'],
        text: [
          '银行想要：**利差收入减去坏账**，同时让**资本**别跌破红线，别被亏损冲垮。',
          '它追求的不是“放最多”，而是“收得回来”。',
        ],
        question: '想一想：银行怎么判断一笔房贷“收得回来”？',
        answerHint: '看抵押品（房子值多少、房贷占房价多少，也就是 LVR）和借款人的偿债压力（DSR）。房价涨，抵押品变好，银行就敢多放。',
        hl: ['bankApproval'], concept: ['lvr', 'bankCapital', 'badLoans'] },

      { type: 'reveal', title: '它看得到什么，看不到什么', show: ['bank', 'household'],
        text: [
          '**看得到**：房价同比涨跌（抵押品）、自己的坏账率、资本充足率、房贷平均 LVR。',
          '**看不到**：每个家庭将来会不会失业、央行下一步怎么走、房价明年涨还是跌。',
          '**管不了**：央行利率（水价）、家庭想不想借（需求）、房价本身。银行只能决定“批不批”。',
        ],
        question: '想一想：银行收紧闸门，能让房价立刻止跌吗？',
        answerHint: '不能，反而更糟。房价是买房的水推出来的，银行关闸，水更少。',
        hl: ['bankApproval'], concept: ['badLoans', 'bankCapital'] },

      { type: 'reveal', title: '它能拧哪个阀门', show: ['bank', 'household'],
        text: [
          '银行只有一个旋钮：**审批倍数**（银行框里的小圆点，1.00 = 中性）。',
          '它同时管三件事：① 直接乘在新贷款上；② 抬高或压低 LVR 上限和偿债率上限；③ 收紧时新房贷还要加点，利率更贵。',
          '新贷款 = 家庭想借的、抵押品允许的、偿债能力允许的、银行资本允许的，取最小，再乘审批倍数。',
        ],
        question: '想一想：审批倍数小于 1 时，家庭想借也借不到吗？',
        answerHint: '对。家庭想借的是“需求”，真正放出来的是“需求和银行批准的重叠部分”。',
        hl: ['bankApproval', 'newLoans'], concept: ['bankApproval', 'newLoans'] },

      { type: 'watch', until: '2006Q4', title: '它的规则：看它开闸',
        text: [
          '银行有四条规则，按这个顺序判断：',
          `① **先看亏损**（bank_tighten_losses）：坏账率 > ${p1(R('bank_tighten_losses', 'bad'))} 或资本充足率 < ${p1(R('bank_tighten_losses', 'cap'))}，每季收紧 ${x2(R('bank_tighten_losses', 'step'))}，最低到 ${x2(R('bank_tighten_losses', 'min'))}。`,
          `② **再看抵押品**（bank_tighten_collateral）：房价同比 < ${p0(R('bank_tighten_collateral', 'hp'))}（或比近期峰值回撤 > ${p0(R('bank_tighten_collateral', 'dd'))}），并且平均 LVR > ${p0(R('bank_tighten_collateral', 'lvr'))}，每季收紧 ${x2(R('bank_tighten_collateral', 'step'))}。`,
          `③ **最后才放宽**（bank_loosen）：房价同比 > ${p0(R('bank_loosen', 'hp'))}、坏账率 < ${p1(R('bank_loosen', 'bad'))}、资本充足率 > ${p0(R('bank_loosen', 'cap'))}，三个都满足，每季放宽 ${x2(R('bank_loosen', 'step'))}，最高 ${x2(R('bank_loosen', 'max'))}。`,
          `④ **先修资本**（bank_rebuild_capital）：资本低于 ${p1(R('bank_rebuild_capital', 'cap'))}，审批上限被压住，降息也不会自动恢复。`,
          `三条都没触发时，倍数每季向 1.00 回一点。收紧每步（${x2(R('bank_tighten_losses', 'step'))}）比放宽每步（${x2(R('bank_loosen', 'step'))}）大：关闸比开闸快。`,
          '看这个：这一段房价在涨，银行框里的小圆点向右走，蓝管跟着变粗。',
        ],
        hl: ['bankApproval', 'newLoans'], concept: ['bankApproval', 'lvr'] },

      { type: 'predict', from: '2006Q4', until: '2008Q4', title: '猜一猜',
        q: '房价掉头向下，银行的收紧规则开始触发，审批倍数一路下调。收紧后的两年里，银行自己手里的坏账率会怎样？',
        options: [
          { t: '很快回落，因为不放新贷款了', ok: false },
          { t: '还会继续上升一阵', ok: true },
          { t: '一直不变', ok: false },
        ],
        explain: [
          '收紧只管“新贷款”，也就是水龙头。已经放出去的老贷款是存量，银行收不回来的部分取决于家庭的失业、月供压力和房价。',
          '房价下跌 → LVR 变高；失业升高、DSR 还重 → 老贷款继续出问题，坏账要晚一些才见顶。',
          '银行的自保动作，救不了已经放出去的水。',
        ],
        hl: ['bankApproval', 'newLoans'], concept: ['badLoans'] },

      { type: 'reveal', title: '拧了以后水怎么流（一）：蓝管变细', show: ['repay', 'pool'],
        text: [
          '银行收紧 → 蓝管（新贷款）变细 → 但家庭每季还本的橙管没变细 → 新贷款少于还本，货币 M 净减少（信贷脉冲转负）→ 流进房产的水变少，资产池水位涨不动。',
          '看这个：蓝管比还本管细。',
        ],
        hl: ['newLoans', 'principalRepay', 'assetReservoir'], concept: ['creditImpulse', 'principalRepay'] },

      { type: 'reveal', title: '拧了以后水怎么流（二）：圈倒着转', show: ['channel', 'firm'],
        text: [
          '房价承压 → 平均 LVR 升高 → 银行下一季更敢收（规则②再触发）。同时，企业的新贷款也要乘同一个审批倍数，企业借不到，Capex 和需求一起降温。',
          '每家银行都在理性自保，合起来却让整个圈倒着转：房价↓ → LVR↑ → 收紧 → 新贷款↓ → 房价↓。这就是顺周期，第 3 课叫它 B2。',
        ],
        question: '想一想：如果央行这时降息，能把这个圈拉回来吗？',
        answerHint: '很难。问题出在银行的闸门（抵押品和资本），不在水价。资本不足时规则④还会压住审批上限。',
        hl: ['bankApproval', 'assetReservoir'], concept: ['lvr', 'bankApproval', 'creditImpulse'] },

      { type: 'takeover', role: 'bank', title: '换你来拧', from: '2003Q1', until: '2010Q4',
        text: [
          '现在你是银行风控总监。把审批倍数固定在一个数，全程不变（你不再按规则放宽或收紧）。',
          '试试固定在 1.00（既不放也不收）：繁荣会小一点，萧条也会浅一点吗？再试试固定在 1.30（一直敞开）。',
        ],
        decision: { key: 'approval', min: 0.5, max: 1.4, step: 0.05, default: 1.0, label: '审批倍数（全程保持）', fmt: 'x2' },
        metrics: [
          { label: '期间房价峰值', get: 'max:assets.housing.price', fmt: 'idx' },
          { label: '期间房价最低值', get: 'min:assets.housing.price', fmt: 'idx' },
          { label: '累计新贷款（十亿美元）', get: 'sum:flows.newLoans', fmt: 'num' },
          { label: '期间坏账率峰值', get: 'max:bank.badLoanRate', fmt: 'pct' },
          { label: '期间资本充足率最低值', get: 'min:bank.capitalRatio', fmt: 'pct' },
        ],
        insight: '闸门是放大器。固定得越高，繁荣越大，之后的坏账越重；固定得越低，两头都被削平。银行规则的问题不在于不理性，而在于每家都顺着周期走。',
        hl: ['bankApproval', 'newLoans'] },

      { type: 'recap', title: '总结',
        lines: [
          '银行只拧一个旋钮：审批倍数。抵押品好就放宽，抵押品差、坏账高就收紧，关闸比开闸快。',
          '收紧只管新贷款，管不了已经放出去的旧债，所以坏账会比房价更晚见顶。',
          '每家银行自保，合起来让圈倒着转（B2）。下一课看家庭：站在闸门另一边的人。',
        ],
        concepts: ['bankApproval', 'lvr', 'badLoans', 'bankCapital'], next: 'role-household' },
    ],
  }),

  /* ============================ 家庭 ============================ */
  lesson({
    id: 'role-household', role: 'household',
    title: '家庭：借与存的两只手',
    oneLine: '家庭有两只手：借和存。房价涨时伸手多借，压力大时缩手多存。每家都合理，合在一起却会把别人的收入压下去。',
    startDate: '2004Q1', endDate: '2010Q4', available: false /* predict not model-verified yet; US-window version superseded by town scenario */,
    startParts: ['household', 'bank', 'interest', 'repay'],
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**结论：家庭有两只手：借和存。房价涨，伸手多借；压力大，缩手多存。每家都合理，合起来却会压低所有人的收入。**',
          '像一群人同时从池塘取水自保：每个人都在保自己，水位却一起往下掉。',
          '{{STEPS}}',
          '时间：2004Q1 → 2010Q4，真实美国季度。',
        ],
        hl: ['newLoans', 'interestPaid'], concept: ['dsr', 'hhDebt'] },

      { type: 'reveal', title: '它想要什么', show: ['household'],
        text: [
          '家庭想要：**平稳地过日子**（消费不要大起大落）、有房住、净资产别缩水。',
          '家庭最怕三件事：失业、月供太重（DSR 高）、房子比房贷还便宜（负资产）。',
        ],
        question: '想一想：房价涨了一大截，邻居都在买房，你会借更多还是更少？',
        answerHint: '多数人借更多：看到涨就外推“还会涨”。这就是下面的第一条规则。',
        hl: ['newLoans'], concept: ['income', 'hhDebt'] },

      { type: 'reveal', title: '它看得到什么，看不到什么', show: ['household', 'bank'],
        text: [
          '**看得到**：自己的月供占收入的比例（DSR）、房价涨跌、周围的失业、利率。',
          '**看不到**：银行下个季度收不收闸、房价明年涨还是跌、别的家庭是不是也在同时多存钱。',
          '**管不了**：房价、利率、银行批不批。家庭只能决定“想借多少”和“存多少”。实际借到的，是想借的和银行允许的里较小的那个。',
        ],
        hl: ['newLoans', 'bankApproval'], concept: ['dsr', 'lvr'] },

      { type: 'reveal', title: '它能拧哪两个阀门', show: ['household', 'interest', 'repay'],
        text: [
          '家庭有两个旋钮：**借款需求**（想借多少，1.00 = 正常）和**储蓄率**（收入里存下多少）。',
          '借款需求变大，蓝管想变粗；储蓄率升高，花出去的水变少。',
        ],
        question: '想一想：所有家庭的储蓄率一起升高，对“别人”意味着什么？',
        answerHint: '你少花的每一块钱，都是别人少收到的一块钱。',
        hl: ['newLoans', 'interestPaid'], concept: ['income', 'newLoans'] },

      { type: 'watch', until: '2007Q2', title: '它的规则：看它出手',
        text: [
          '家庭有五条规则，先说最重要的三条：',
          `① **追涨 / 观望**（hh_chase）：房价同比 > ${p0(R('hh_chase', 'up'))}，外推上涨，借款需求上调（至少一成，最多五成）；房价同比 < ${p0(R('hh_chase', 'down'))}，观望，借款需求下调（最低减半）。`,
          `② **去杠杆**（hh_deleverage）：DSR 比起点高 ${pp(R('hh_deleverage', 'dsr'))}以上，或失业率 > ${p1(R('hh_deleverage', 'u'))}，借款需求 ×${x2(R('hh_deleverage', 'borrow'))}，储蓄率加 ${pp(R('hh_deleverage', 'save'))}。`,
          '③ **债务悬压**（hh_overhang）：房价从峰值回撤、LVR 高、DSR 高，越多越重，家庭多年少借多存。悬压每季只衰减一点点，降息也很难把它重新点燃。',
          '另外两条：**被迫出售**（hh_forced_sales）：LVR 高、坏账和失业上升，抛房压低房价；**通胀预期脱锚**（hh_infl_deanchor）：通胀长期高于目标，预期就不再回到目标。',
          '看这个：这一段房价在涨，记录栏里家庭的“追涨”一条条出现，借款需求大于 1。',
        ],
        hl: ['newLoans', 'assetReservoir'], concept: ['dsr', 'lvr', 'housePrice'] },

      { type: 'predict', from: '2007Q2', until: '2009Q4', title: '猜一猜',
        q: '房价转跌、失业升高，家庭一起多存少借，想把债还轻。这对“全体家庭的总收入”意味着什么？',
        options: [
          { t: '总收入不受影响', ok: false },
          { t: '总收入反而更高，因为债务轻了', ok: false },
          { t: '总收入下降：一家的储蓄，是另一家少掉的收入', ok: true },
        ],
        explain: [
          '每家都在省钱，整体的消费需求就少了。',
          '企业卖不动、招工少、工资少，水又回到家庭的收入上：收入下降。',
          '个体合理，合起来不合理。这叫“节约悖论”，也是资产负债表衰退的核心。',
        ],
        hl: ['goodsChannel', 'newLoans'], concept: ['income', 'dsr'] },

      { type: 'reveal', title: '借的水去哪了：房产那一格', show: ['pool'],
        text: [
          '家庭想借得多、银行也肯批 → 蓝管变粗 → 买房的水流进资产池 → 房价涨。',
          '反过来，家庭缩手 → 蓝管变细 → 流进房产的水少 → 房价涨不动，甚至回落。',
          '家庭的借款需求和银行的审批，是同一根蓝管的两只手：一只想要，一只批准。',
        ],
        hl: ['newLoans', 'assetReservoir'], concept: ['assetReservoir', 'housePrice'] },

      { type: 'reveal', title: '水怎么流回自己：工资', show: ['channel', 'firm'],
        text: [
          '家庭多存少花 → 商品河道里的需求少 → 企业卖不动、招工少 → 工资（回到家庭的水）变少 → 家庭收入下降。',
          '收入是 DSR 的分母：收入一少，月供压力就更难降下来。',
        ],
        question: '想一想：这时央行降息，家庭会马上多借吗？',
        answerHint: '很难。债务悬压越重，利率对借款需求的传导越弱（规则 hh_overhang 里的“传导减弱”）。',
        hl: ['goodsChannel', 'newLoans'], concept: ['income', 'dsr'] },

      { type: 'watch', until: '2010Q4', title: '悬压：降息也点不着',
        text: [
          '继续往后看：家庭一边还债一边少借，债务悬压每季只衰减一点点。',
          '看这个：新贷款（蓝管）长期细于还本管，家庭债务在慢慢往下走，而不是反弹。',
        ],
        hl: ['newLoans', 'principalRepay'], concept: ['hhDebt', 'creditImpulse'] },

      { type: 'takeover', role: 'household', title: '换你来拧', from: '2004Q1', until: '2010Q4',
        text: [
          '现在你是“全体家庭的平均借款意愿”。把借款倍数固定在一个数，全程不变（规则里“额外储蓄”暂停，只剩利率和失业对储蓄的自然影响）。',
          '试试：固定 0.7（一直谨慎）和 1.3（一直乐观）。看房价、收入和 DSR 怎么变。',
        ],
        decision: { key: 'borrowMult', min: 0.5, max: 1.5, step: 0.05, default: 1.0, label: '借款需求倍数（全程保持）', fmt: 'x2' },
        metrics: [
          { label: '期间房价峰值', get: 'max:assets.housing.price', fmt: 'idx' },
          { label: '累计新贷款（十亿美元）', get: 'sum:flows.newLoans', fmt: 'num' },
          { label: '期间家庭 DSR 峰值', get: 'max:household.dsr', fmt: 'pct' },
          { label: '期间失业率峰值', get: 'max:macro.unemployment', fmt: 'pct' },
        ],
        insight: '借得越多，房价和收入涨得越快，之后的偿债压力也越重。家庭手里没有“既涨得高又不摔”的旋钮。',
        hl: ['newLoans'] },

      { type: 'recap', title: '总结',
        lines: [
          '家庭有两个旋钮：借款需求和储蓄率。涨时追涨多借，压力大时去杠杆多存。',
          '每家合理，合起来压低总收入（节约悖论），债务悬压又让降息很难奏效。',
          '下一课看企业：另一个借钱的人，它的旋钮是 Capex。',
        ],
        concepts: ['dsr', 'lvr', 'hhDebt', 'income'], next: 'role-firm' },
    ],
  }),

  /* ============================ 企业（草稿） ============================ */
  lesson({
    id: 'role-firm', role: 'firm',
    title: '企业：Capex 与产能的时差',
    oneLine: '企业的阀门是 Capex。今天多投的钱，要约 6 个季度才变成新产能，所以需求一冲到产能上限，通胀就来了。',
    startDate: '2019Q1', endDate: '2023Q4', available: false /* predict not model-verified yet; US-window version superseded by town scenario */,
    startParts: ['firm', 'capex'],
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**结论：企业的阀门是 Capex（资本开支）。今天多投的钱，要约 6 个季度才变成新产能。所以需求一冲到产能上限，新产能还来不及，通胀就来了。**',
          '像修一条新水渠：今天开工，要等一年半才通水。',
          '{{STEPS}}',
          '时间：2019Q1 → 2023Q4，真实美国季度（含 2020 年的冲击）。',
        ],
        hl: ['capex', 'capacity'], concept: ['capex', 'capacity'] },

      { type: 'reveal', title: '它想要什么', show: ['firm'],
        text: [
          '企业想要：**长期利润，并且活下来**。需求好、借钱便宜，就扩张；需求差、借钱贵、坏账多，就收缩。',
        ],
        question: '想一想：企业今天决定扩产，今天就能多卖货吗？',
        answerHint: '不能。设备要买、厂房要建，新产能要等约 6 个季度。',
        hl: ['capex'], concept: ['capex'] },

      { type: 'reveal', title: '它看得到什么，看不到什么', show: ['firm', 'channel'],
        text: [
          '**看得到**：订单有多旺（需求比产能多还是少）、扣掉通胀后的融资成本、自己的坏账。',
          '**看不到**：明年的需求、央行下一步、别的企业是不是也在同时扩产（大家一起扩，一起过剩）。',
          '**管不了**：利率、家庭收入，还有油价（模型里是外生数据）。',
        ],
        hl: ['goodsChannel', 'capacity'], concept: ['outputGap', 'realRate'] },

      { type: 'reveal', title: '它能拧哪个阀门', show: ['firm', 'capex'],
        text: [
          '企业只有一个旋钮：**Capex 倍数**（1.00 = 基准）。',
          '倍数升高：企业多借多花（当季就是需求），约 6 个季度后形成新产能。倍数降低：反过来。',
          '现实里企业还定价、招聘、分红回购，本游戏简化成这一个旋钮，价格由“需求冲产能”和通胀预期决定。',
        ],
        hl: ['capex', 'capacity'], concept: ['capex'] },

      { type: 'watch', until: '2021Q4', title: '它的规则：看它投资',
        text: [
          '企业有三条规则：',
          `① **扩张**（firm_capex_up）：需求压力 > ${p1(R('firm_capex_up', 'p'))} 且实际融资成本 < ${p1(R('firm_capex_up', 'rReal'))}，每季加码 ${x2(R('firm_capex_up', 'step'))}，上限 ${x2(R('firm_capex_up', 'max'))}。`,
          `② **收缩**（firm_capex_cut）：需求缺口 < ${p1(R('firm_capex_cut', 'p'))} 或实际融资成本 > ${p1(R('firm_capex_cut', 'rReal'))} 或企业坏账 > ${p1(R('firm_capex_cut', 'bad'))}，每季削减 ${x2(R('firm_capex_cut', 'step'))}，下限 ${x2(R('firm_capex_cut', 'min'))}。`,
          `③ **油价传导**（firm_oil_passthrough）：这不是企业的“决定”，而是成本推价格：油价同比涨 100%，年化价格推力约 ${p1(R('firm_oil_passthrough', 'k'))}。`,
          '看这个：Capex 管（右下）的宽度，和商品河道的水位。',
        ],
        hl: ['capex', 'capacity', 'goodsChannel'], concept: ['capex', 'capacity'] },

      { type: 'predict', from: '2021Q4', until: '2023Q2', title: '猜一猜',
        q: '需求冲过产能，企业一路加码 Capex。在接下来的 6 个季度里，通胀压力会因为新产能很快回落吗？',
        options: [
          { t: '会，企业一加码，产能马上变大', ok: false },
          { t: '不会马上，新产能要等约 6 个季度才到', ok: true },
          { t: '企业加码反而让产能变小', ok: false },
        ],
        explain: [
          'Capex 先进入管道，约 6 个季度后才变成产能。当季看到的只是需求变大（买设备、建厂也是需求）。',
          '所以加码的头几个季度，需求压力反而更高。',
          '产能晚到，通胀就多持续一阵。',
        ],
        hl: ['capex', 'capacity', 'cpi'], concept: ['capex', 'capacity', 'cpi'] },

      { type: 'reveal', title: '拧了以后水怎么流', show: ['household', 'bank', 'channel'],
        text: [
          'Capex 加码 → 企业向银行多借、多花 → 当季：这笔钱是需求，流进商品河道，需求压力更高 → 工资和利润回到家庭手里 → 约 6 个季度后：新产能到位，河道容量变大，压力才回落。',
          '先加需求，后加供给。时差就是通胀的空间。',
        ],
        question: '想一想：如果这时央行为了压通胀加息，Capex 会怎样？',
        answerHint: '融资成本升高，规则 ② 触发，企业收缩 Capex。短期压住了需求，但未来的产能也少了，供给更紧。',
        hl: ['capex', 'goodsChannel'], concept: ['capex', 'outputGap'] },

      { type: 'takeover', role: 'firm', title: '换你来拧', from: '2019Q1', until: '2023Q4',
        text: [
          '现在你是“全体企业的平均 Capex 意愿”。把倍数固定，全程不变。',
          '试试：固定 1.3（一直猛投）和 0.7（一直谨慎）。看产能和通胀怎么变。',
        ],
        decision: { key: 'capexMult', min: 0.6, max: 1.4, step: 0.05, default: 1.0, label: 'Capex 倍数（全程保持）', fmt: 'x2' },
        metrics: [
          { label: '期间通胀峰值', get: 'max:macro.inflation', fmt: 'pct' },
          { label: '期末产能（指数）', get: 'end:macro.capacity', fmt: 'idx' },
          { label: '累计 Capex（十亿美元）', get: 'sum:firm.capex', fmt: 'num' },
          { label: '期间失业率峰值', get: 'max:macro.unemployment', fmt: 'pct' },
        ],
        insight: '多投产能要等约 6 个季度，当季只是多了需求；少投则把未来的供给越压越紧。企业没有一个能立刻压通胀的旋钮。',
        hl: ['capex', 'capacity'] },

      { type: 'recap', title: '总结',
        lines: [
          '企业的旋钮是 Capex 倍数：需求旺、钱便宜就加码；缺口大、钱贵、坏账多就削减。',
          'Capex 当季是需求，约 6 个季度后才是产能。先加需求后加供给，时差就是通胀的空间。',
          '下一课看政府：私人部门收缩时，谁来补水。',
        ],
        concepts: ['capex', 'capacity', 'outputGap', 'cpi'], next: 'role-government' },
    ],
  }),

  /* ============================ 政府（草稿） ============================ */
  lesson({
    id: 'role-government', role: 'government',
    title: '政府：最后的补水人',
    oneLine: '私人部门收缩时，政府多花钱把水池补上；通胀太高或利息吃掉太多税收时，它收紧。代价是债务和利息。',
    startDate: '2007Q3', endDate: '2011Q4', available: true,
    startParts: ['government', 'channel'],
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**结论：政府是最后的“补水人”。私人部门收缩时它多花钱，把水池补上；通胀太高或利息太重时它收紧。补水不是免费的，代价是债务和利息。**',
          '{{STEPS}}',
          '时间：2007Q3 → 2011Q4，真实美国季度。',
        ],
        hl: ['fiscalInjection'], concept: ['fiscalInjection', 'interestToTax'] },

      { type: 'reveal', title: '它想要什么', show: ['government'],
        text: [
          '政府想要：**收入和就业稳**、公共产能够用、**债务别失控**，还有政治支持。',
          '约束有两个：利息占税收的比例，和投资者愿不愿意继续借钱给它。',
        ],
        question: '想一想：为什么私人部门收缩时，需要政府而不是家庭来花钱？',
        answerHint: '家庭和企业都在还债、少借，谁都不敢花。只有政府能在这时把净水注进来，对冲私人信贷的收缩。',
        hl: ['fiscalInjection'], concept: ['fiscalInjection'] },

      { type: 'reveal', title: '它看得到什么，看不到什么', show: ['government', 'channel'],
        text: [
          `**看得到**：失业率（比近 2 年低点高多少）、需求缺口、通胀、利息占税收的比例、银行资本充足率。`,
          '**看不到**：私人部门自己会不会很快恢复；债权人哪天不愿再借（这由“外国部门”的规则决定）。',
          '**管不了**：央行利率，以及家庭、企业怎么花。',
        ],
        hl: ['cpi', 'goodsChannel'], concept: ['unemployment', 'outputGap', 'interestToTax'] },

      { type: 'reveal', title: '它能拧哪个阀门', show: ['government', 'household', 'firm'],
        text: [
          '政府的旋钮是**财政注入**（占 GDP 的比例，每年）。图里右上的紫管：正数是多花，负数是收紧。',
          '注入的钱里，大部分变成消费需求，一部分变成企业 Capex，小部分存成现金。',
          '现实里还有税率、转移支付、公共投资的区别，本游戏把它们合成这一个旋钮。',
        ],
        hl: ['fiscalInjection', 'capex'], concept: ['fiscalInjection'] },

      { type: 'watch', until: '2009Q2', title: '它的规则：看它出手',
        text: [
          '政府有三条规则：',
          `① **逆周期加码**（gov_stimulus）：失业率比近 2 年低点高 > ${pp(R('gov_stimulus', 'du'))}，或需求缺口 < ${p0(R('gov_stimulus', 'gap'))}，注入按缺口深度加码，每季最多加 ${p1(R('gov_stimulus', 'ramp'))} GDP，上限 ${p0(R('gov_stimulus', 'max'))} GDP。景气稳定后每季收回一小步。`,
          `② **紧缩**（gov_austerity）：通胀 > ${p1(R('gov_austerity', 'pi'))} 或利息/税收 > ${p0(R('gov_austerity', 'i2t'))}，向下收一小步，最低到 ${p1(R('gov_austerity', 'cut'))} GDP。它排在加码前面，先判断。`,
          `③ **救银行**（gov_bank_recap）：银行资本充足率 < ${p1(R('gov_bank_recap', 'cap'))}，政府注资，每季补足缺口的 ${p0(R('gov_bank_recap', 'rate'))}，目标 ${p1(R('gov_bank_recap', 'target'))}，这笔钱计入政府债务。`,
          '看这个：紫管（财政注入）在失业升高之后变粗。',
        ],
        hl: ['fiscalInjection'], concept: ['fiscalInjection', 'unemployment'] },

      { type: 'predict', from: '2009Q2', until: '2011Q4', title: '猜一猜',
        q: '如果政府在这一轮衰退里不出手（关掉加码规则），失业率的峰值会怎样？',
        options: [
          { t: '更高', ok: true },
          { t: '一样', ok: false },
          { t: '更低', ok: false },
        ],
        explain: [
          '政府不补水，家庭和企业又都在去杠杆，需求缺口更大、更久，失业升得更高。',
          '但补水有代价：政府债务/GDP 更高，利息负担也更重。',
          '（你可以在“规则清单”里关掉“逆周期加码”，重跑对比。）',
        ],
        hl: ['fiscalInjection'], concept: ['fiscalInjection', 'unemployment'] },

      { type: 'reveal', title: '拧了以后水怎么流（一）：先到家庭和企业', show: ['household', 'firm'],
        text: [
          '政府多花钱 → 钱先到家庭和企业手里，大部分变成消费，一部分变成 Capex → 企业卖得动、不裁人 → 失业回落 → 税收回升。',
          '看这个：紫管变粗的同时，商品河道的需求压力不再那么深。',
        ],
        hl: ['fiscalInjection', 'goodsChannel'], concept: ['fiscalInjection', 'unemployment'] },

      { type: 'reveal', title: '拧了以后水怎么流（二）：债务与银行', show: ['bank', 'interest'],
        text: [
          '政府多花的钱来自发债 → 政府债务/GDP 上升 → 利息占税收的比例上升 → 太高时，紧缩规则会反过来触发。',
          '银行资本跌破红线时，政府还会注资，这也计入债务：补了银行的水，欠了自己的债。',
        ],
        question: '想一想：补水补到什么时候该停？',
        answerHint: '规则是：景气稳定后逐步收回；如果通胀太高或利息吃掉太多税收，就收紧。',
        hl: ['fiscalInjection'], concept: ['interestToTax', 'gMinusR'] },

      { type: 'takeover', role: 'government', title: '换你来拧', from: '2007Q3', until: '2011Q4',
        text: [
          '现在你是财政部长。把财政注入固定在一个数（占 GDP，每年），全程不变。',
          '试试：固定 0（完全不出手）和 6%（大力补水）。看失业、债务和通胀怎么变。',
        ],
        decision: { key: 'fiscalInjection', min: 0, max: 0.12, step: 0.005, default: 0, label: '财政注入（占 GDP / 年，全程保持）', fmt: 'pct' },
        metrics: [
          { label: '期间失业率峰值', get: 'max:macro.unemployment', fmt: 'pct' },
          { label: '期末政府债务 / GDP', get: 'end:gov.debtGdp', fmt: 'pct' },
          { label: '期间通胀峰值', get: 'max:macro.inflation', fmt: 'pct' },
          { label: '期末利息 / 税收', get: 'end:gov.interestToTax', fmt: 'pct' },
        ],
        insight: '补水越多，失业越低，债务和利息越重。固定一个数的坏处是不会收回：这是真实政府和规则的差别。',
        hl: ['fiscalInjection'] },

      { type: 'recap', title: '总结',
        lines: [
          '政府的旋钮是财政注入：失业升高、需求缺口深就加码；通胀高、利息重就收紧；银行资本不足就注资。',
          '补水有代价：债务、利息，和需求超过产能时的通胀。',
          '下一课看投资者：新增的水流进哪个池子。',
        ],
        concepts: ['fiscalInjection', 'interestToTax', 'unemployment'], next: 'role-investor' },
    ],
  }),

  /* ============================ 投资者（草稿） ============================ */
  lesson({
    id: 'role-investor', role: 'investor',
    title: '投资者：新增的水流向哪',
    oneLine: '投资者不造水，只决定新增的水往哪个池子流：房、股、现金。它追涨，也会在害怕时一起逃，所以放大价格的涨跌。',
    startDate: '2006Q1', endDate: '2010Q4', available: false /* predict not model-verified yet; US-window version superseded by town scenario */,
    note: '接管即将开放',
    startParts: ['pool', 'cash'],
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**结论：投资者不造水，只决定“新增的那部分水”往哪个池子流：房、股、现金。它追涨，也会在害怕时一起逃，所以放大价格的涨跌。**',
          '像池塘边的人：水不是他们放的，但他们决定把桶放在哪个池子旁边。',
          '{{STEPS}}',
          '时间：2006Q1 → 2010Q4，真实美国季度。本课的最后一步是实验，接管投资者即将开放。',
        ],
        hl: ['assetReservoir'], concept: ['assetReservoir', 'riskPremium'] },

      { type: 'reveal', title: '它想要什么', show: ['pool'],
        text: [
          '投资者想要：**扣掉通胀后，购买力稳步增加**。',
          '它比较房产、股票、现金这几个池子里谁更值，再把新水往更好的池子送。',
        ],
        question: '想一想：看到一个池子最近涨得很快，你会往里放更多水吗？',
        answerHint: '多数人会，这就是“追涨”（动量）。下面第一条规则。',
        hl: ['assetReservoir'], concept: ['assetReservoir'] },

      { type: 'reveal', title: '它看得到什么，看不到什么', show: ['pool', 'cash'],
        text: [
          '**看得到**：房价同比、股价同比（动量）、风险溢价、信贷脉冲、房价与收入的比。',
          '**看不到**：价格下个季度到底涨还是跌；别的投资者是不是也在同时逃。',
          '**管不了**：新水一共有多少（那是新贷款、财政注入、QE 决定的）；价格本身（价格是被流进来的水推出来的）。',
        ],
        hl: ['assetReservoir'], concept: ['housePrice', 'equityAsset', 'riskPremium'] },

      { type: 'reveal', title: '它能拧哪个阀门', show: ['pool', 'cash'],
        text: [
          '投资者的旋钮是**新增资金的去向权重**：房产、金融资产、现金，各占几成。',
          `但它能影响的只是一部分：模型里，新增水的约 1/4 按投资者的权重分配，其余约 3/4 已经有用途（比如买房贷款直接进房产）。`,
          '现实里还有债券、黄金、外币的配置，本游戏简化成这三个池子。',
        ],
        hl: ['assetReservoir'], concept: ['assetReservoir', 'cashAsset'] },

      { type: 'watch', until: '2008Q1', title: '它的规则：看它追涨',
        text: [
          '投资者有三条规则：',
          `① **追涨**（inv_momentum）：权重随近期涨幅放大。房价或股价同比越高，新水越往那边流；下跌时同样反过来。`,
          `② **避险**（inv_riskoff）：风险溢价 > ${p0(R('inv_riskoff', 'rp'))} 或信贷脉冲 < ${p1(R('inv_riskoff', 'ci'))}，现金权重 ×3，房产和股票权重 ×0.7。（模型里避险池是现金；债券价格由收益率变化决定，不接收新增资金。）`,
          `③ **估值锚**（inv_valuation）：房价/收入比起点高出 ${p0(R('inv_valuation', 'ceil') - 1)} 以上，往回拉，租金回报变低，买入吸引力下降。`,
          '看这个：记录栏里“新增资金配置：房产 / 金融资产 / 现金”那一行。',
        ],
        hl: ['assetReservoir'], concept: ['assetReservoir', 'priceToIncome', 'rentYield'] },

      { type: 'predict', from: '2008Q1', until: '2009Q4', title: '猜一猜',
        q: '信贷脉冲转负、风险溢价升高。投资者“新增资金”里，流向现金的比例会怎样？',
        options: [
          { t: '升高', ok: true },
          { t: '不变', ok: false },
          { t: '降低', ok: false },
        ],
        explain: [
          '避险规则触发：现金权重 ×3，房产和股票各 ×0.7。害怕的时候，新水都往现金池流。',
          '于是房产和股票的新水变少，价格更难涨。',
          '每个人都想先逃，合起来就是踩踏。',
        ],
        hl: ['assetReservoir'], concept: ['riskPremium', 'cashAsset'] },

      { type: 'reveal', title: '拧了以后水怎么流', show: ['channel', 'household', 'bank'],
        text: [
          '投资者逃向现金 → 房产和股票的新水变少，价格涨不动或下跌 → 家庭的财富缩水，少花一点（模型里约 1.5% 的财富变化会变成消费变化）→ 商品河道需求降温。',
          '同时房价下跌，银行看到抵押品变差 → 收紧审批 → 回到银行课里的 B2。',
        ],
        hl: ['assetReservoir', 'bankApproval'], concept: ['assetReservoir', 'lvr'] },

      { type: 'experiment', from: '2006Q1', until: '2010Q4', title: '动手改（接管即将开放）',
        text: [
          '投资者暂时不能接管。但你可以关掉它的一条规则，看会发生什么。',
          '选一个方案，点“重跑”，时间倒回 2006Q1，重新跑到 2010Q4。',
        ],
        choices: [
          { label: '照规则', set: {} },
          { label: '关掉追涨', set: { rules: { inv_momentum: false } } },
          { label: '关掉避险', set: { rules: { inv_riskoff: false } } },
          { label: '关掉估值锚', set: { rules: { inv_valuation: false } } },
        ],
        metrics: [
          { label: '期间房价峰值', get: 'max:assets.housing.price', fmt: 'idx' },
          { label: '期间房价最低值', get: 'min:assets.housing.price', fmt: 'idx' },
          { label: '期间股价最低值', get: 'min:assets.equity.price', fmt: 'idx' },
          { label: '累计流入现金（十亿美元）', get: 'sum:flows.toCash', fmt: 'num' },
        ],
        insight: '追涨抬高峰值，避险抬高现金；估值锚在房价过热时往回拉。三条规则里没有一条能让价格稳定，它们都跟着情绪走。',
        hl: ['assetReservoir'] },

      { type: 'recap', title: '总结',
        lines: [
          '投资者只决定新增水的去向：房、股、现金。追涨放大涨，避险放大跌。',
          '它能影响的只是新增水里的一部分，更大的水量来自新贷款、财政和 QE。',
          '下一课看外国部门：本国需求太旺时，谁来分担。',
        ],
        concepts: ['assetReservoir', 'riskPremium', 'housePrice', 'cashAsset'], next: 'role-foreign' },
    ],
  }),

  /* ============================ 外国（草稿） ============================ */
  lesson({
    id: 'role-foreign', role: 'foreign',
    title: '外国：分担与要价',
    oneLine: '外国部门是个有规则的邻居：你需求太旺，它多卖给你帮你降温；你赤字大又通胀高，它就要更高的利息。',
    startDate: '2020Q1', endDate: '2023Q4', available: false /* predict not model-verified yet; US-window version superseded by town scenario */,
    note: '接管即将开放',
    startParts: ['channel', 'government'],
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**结论：外国部门是个有规则的“邻居”。本国需求冲过产能，它多卖给你，帮你分担；本国赤字大又通胀高，它就要更高的利息才肯借。**',
          '{{STEPS}}',
          '时间：2020Q1 → 2023Q4，真实美国季度。本游戏里外国只是规则 NPC，接管即将开放。',
        ],
        hl: ['goodsChannel'], concept: ['goodsChannel', 'interestToTax'] },

      { type: 'reveal', title: '它想要什么', show: ['channel'],
        text: [
          '外国部门想要：**卖得出去**（出口）、**借出去的钱有回报**（持有本国债券）。',
        ],
        question: '想一想：本国需求太旺、国内产能不够时，邻居会怎么做？',
        answerHint: '多卖给你。部分需求外溢到海外，国内的价格压力小一点。',
        hl: ['goodsChannel'], concept: ['goodsChannel'] },

      { type: 'reveal', title: '它看得到什么，看不到什么', show: ['channel', 'government'],
        text: [
          '**看得到**：本国的需求压力（需求比产能多多少）、财政赤字占 GDP 的比例、通胀。',
          '**看不到**：本国央行下一步，和国内银行、家庭的细节。',
          '**管不了**：本国的规则。外国部门只能自己决定“卖多少”和“要价多少”。',
        ],
        hl: ['cpi'], concept: ['outputGap', 'interestToTax'] },

      { type: 'reveal', title: '它能拧哪两个阀门', show: ['channel', 'government', 'bank'],
        text: [
          '**阀门①：净出口**。本国需求压力越高，进口越多，净出口越低（需求外溢）。',
          '**阀门②：期限溢价**。赤字大又通胀高，要求长端国债多给一点利息（加 0.5 个点）。',
          '现实里还有汇率、资本流动、外国持有多少国债，本游戏简化了，只留这两个规则。',
        ],
        hl: ['goodsChannel', 'cpi'], concept: ['bondAsset', 'discountRate'] },

      { type: 'watch', until: '2022Q2', title: '它的规则：看它出手',
        text: [
          '外国部门有两条规则：',
          `① **外溢**（foreign_trade）：净出口 = 基准 − ${R('foreign_trade', 'k')} × 需求压力。需求超过产能，进口增加，部分需求外溢，缓解通胀；需求不足则净出口回升。`,
          `② **要价**（foreign_funding）：财政赤字 > ${p0(R('foreign_funding', 'def'))} GDP 且通胀 > ${p0(R('foreign_funding', 'pi'))}，长端国债期限溢价 +${p1(R('foreign_funding', 'add'))}。`,
          '看这个：商品河道的需求压力，和记录栏里的“期限溢价”一行。',
        ],
        hl: ['goodsChannel', 'cpi'], concept: ['bondAsset', 'outputGap'] },

      { type: 'predict', from: '2022Q2', until: '2023Q4', title: '猜一猜',
        q: '需求压力还是正的，通胀也不低。外国部门的规则会让净出口比基准怎样？',
        options: [
          { t: '更低：进口增加，需求外溢', ok: true },
          { t: '更高：外国买得更多', ok: false },
          { t: '完全不变', ok: false },
        ],
        explain: [
          '需求压力为正，规则 ① 让净出口低于基准：本国多进口，外国多卖。',
          '这帮本国降了点温，代价是经常账户逆差扩大，外国手里的本国资产变多。',
          '（规则里写的是“外国持有更多本币资产”，是延迟后果。）',
        ],
        hl: ['goodsChannel'], concept: ['goodsChannel'] },

      { type: 'reveal', title: '拧了以后水怎么流（一）：需求外溢', show: ['firm'],
        text: [
          '本国需求压力高 → 进口增加，净出口下降 → 一部分需求流到海外 → 本国商品河道里的需求压力小一点 → 通胀压力小一点。',
          '外国卖得越多，本国越不缺货，这是它“帮你降温”的方式。',
        ],
        hl: ['goodsChannel', 'cpi'], concept: ['goodsChannel', 'cpi'] },

      { type: 'reveal', title: '拧了以后水怎么流（二）：利息要求', show: ['household', 'interest'],
        text: [
          '赤字大又通胀高 → 外国要求更高的期限溢价 → 长端国债收益率上升 → 新房贷利率上升（房贷利率里约 3/4 跟长债）→ 家庭付息变重，政府的利息负担也加重。',
          '看这个：新房贷利率比政策利率更先被推高。',
        ],
        hl: ['interestPaid', 'policyRate'], concept: ['bondAsset', 'mortgageEff', 'interestToTax'] },

      { type: 'experiment', from: '2020Q1', until: '2023Q4', title: '动手改（接管即将开放）',
        text: [
          '外国部门暂时不能接管，但你可以关掉它的一条规则。',
          '选一个方案，点“重跑”，时间倒回 2020Q1，重新跑到 2023Q4。',
        ],
        choices: [
          { label: '照规则', set: {} },
          { label: '关掉外溢', set: { rules: { foreign_trade: false } } },
          { label: '关掉要价', set: { rules: { foreign_funding: false } } },
        ],
        metrics: [
          { label: '期间通胀峰值', get: 'max:macro.inflation', fmt: 'pct' },
          { label: '期间 10 年国债收益率峰值', get: 'max:rates.gov10y', fmt: 'pct' },
          { label: '期间新房贷利率峰值', get: 'max:rates.mortgageNew', fmt: 'pct' },
        ],
        insight: '外溢帮本国降通胀；要价让借钱变贵。外国部门不改本国的规则，却让本国的约束更硬。',
        hl: ['goodsChannel', 'cpi'] },

      { type: 'recap', title: '总结',
        lines: [
          '外国有两条规则：需求外溢（净出口随需求压力变动）和要价（赤字大又通胀高时加期限溢价）。',
          '外溢缓解通胀，要价推高利率。汇率和资本流动本游戏简化了。',
          '七个角色都看完了：回到第 1 课，再用所有角色一起看一遍抵押品回路。',
        ],
        concepts: ['goodsChannel', 'bondAsset', 'interestToTax'], next: 1 },
    ],
  }),
];

export const ROLE_LESSON_BY_ID = Object.fromEntries(ROLE_LESSONS.map(l => [l.id, l]));
