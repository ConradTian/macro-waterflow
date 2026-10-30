// 角色课 (role lessons) as DATA, one lesson per player. They run in the 万元 TOWN (scenario:'town', see lessons.js header for the step types);
// a few end with an optional 'zoom' step that replays a real US window where that is clearly consistent with the engine.
//
// Skeleton of every role lesson:  结论 -> 它想要什么 -> 它看得到/看不到什么 -> 它的阀门 (valve step + ripple) -> 它的规则 (watch the town where they fire,
//   ledger tab open) -> 猜一猜 (predict, verified by tools/check_role_lessons.mjs) -> 它的动作碰到谁 (reveal outward) -> 试一试 (try: slider or choices)
//   -> 因果链 (chain, tappable) -> [放大到美国看看 (zoom)] -> next.
// Delays are OFF in the town by default; lessons where lag is the point switch them on with {delays:true} and say so (central bank, firm).
// All numbers quoted in the text come from RULE_BY_ID (the engine's own defaults); tools/check_role_lessons.mjs re-runs every predict on the town engine.
//
// Lesson = { id:'role-xxx', role, title, oneLine, scenario:'town', delays, rulesOn, available, startParts, steps }
// recap/chain `next`: role-lesson id (string) or cycle-lesson id (number).

import { RULE_DEFS, RULE_BY_ID } from '../engine/rules.js';

const ALL = RULE_DEFS.map(r => r.id);
const R = (id, k) => RULE_BY_ID[id].params[k];
const p0 = x => Math.round(x * 100) + '%';
const p1 = x => (Math.round(x * 1000) / 10) + '%';
const pp = x => (Math.round(x * 10000) / 100) + ' 个点';
const x2 = x => x.toFixed(2);

// builds a lesson: numbers the middle steps ("第 k 步"), fills the "下面分 N 步" line in the intro
function lesson(def) {
  const mid = def.steps.filter(s => s.type !== 'intro' && s.type !== 'chain' && s.type !== 'zoom');
  const circ = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫';
  const outline = `下面分 ${mid.length + 1} 步：` + mid.map((s, i) => circ[i] + s.title).join(' ') + ' ' + circ[mid.length] + '因果链';
  let k = 0;
  const steps = def.steps.map(s => {
    const t = { ...s };
    if (t.type !== 'intro' && t.type !== 'zoom') { k += 1; t.title = `第 ${k} 步：${t.title}`; }
    if (t.type === 'zoom') t.title = `放大到美国看看（选看）：${t.title}`;
    if (t.type === 'intro') t.text = t.text.map(x => (x === '{{STEPS}}' ? outline : x));
    return t;
  });
  return { mode: 'history', scenario: 'town', delays: false, rulesOn: ALL, pace: 1500, ...def, steps };
}

export const ROLE_LESSONS = [
  /* ============================ 央行 ============================ */
  lesson({
    id: 'role-centralBank', role: 'centralBank',
    title: '央行：只拧一个吸力旋钮',
    oneLine: '央行只有一个大阀门：政策利率。它能改水价，却不能直接决定银行放多少贷款，而且水价变化要过好几个季度才流到下游。',
    available: true,
    startParts: ['centralBank', 'bank', 'valves', 'ledger'],
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**央行手里只有一个大阀门：政策利率（利率压到底以后才有第二个：QE）。它能改水价，不能直接决定银行放多少贷款。**',
          '就像水库管理员只拧吸力旋钮：下游每家每户用多少水，他管不到；而且水要流好几个季度才到下游。',
          '{{STEPS}}',
          '地点：还是那个 5 户人家的小镇。',
        ],
        hl: ['policyRate'], concept: ['policyRate', 'mortgageEff'] },

      { type: 'reveal', title: '它想要什么', show: ['centralBank'],
        text: [
          `央行想要三件事：**物价稳**（通胀接近 ${p0(R('cb_taylor', 'target'))}）、**就业稳**（失业别太高）、**金融系统别出事**。`,
          '好比水库管理员：不想发洪水（通胀），也不想断流（失业和信贷冻结）。',
        ],
        question: '先想一想：央行能直接命令镇银行“这个季度放 100 万贷款”吗？',
        answerHint: '不能。央行只能改水价（利率）。放多少贷款，是银行（看抵押品和坏账）和家庭（想不想借）一起决定的。',
        hl: ['policyRate'], concept: ['policyRate'] },

      { type: 'reveal', title: '它看得到什么，看不到什么', show: ['channel', 'household'],
        text: [
          '**看得到**（规则真正读的数）：通胀、失业率、需求压力（需求比产能多还是少）、信贷脉冲，再加上私人债务占 GDP 的比例。',
          '**看不到**：镇银行自己的资本和坏账、每户人家的月供压力、资产池的价格偏没偏离、企业的 Capex 管道，以及将来会不会来一次冲击。',
          '所以央行像只能看后视镜开车：看到通胀高才加息，等水流到下游，已经晚了半拍。',
        ],
        question: '想一想：为什么说央行总是“慢半拍”？',
        answerHint: '它读的都是已经发生的数（通胀、失业），而拧了阀门之后，水还要几个季度才流到下游。',
        hl: ['cpi', 'goodsChannel'], concept: ['cpi', 'unemployment', 'outputGap', 'creditImpulse'] },

      { type: 'valve', title: '它能拧哪个阀门', show: ['bank', 'poolHousing'], valve: 'policyRate', value: 0.07, quarters: 2, keep: false,
        text: [
          '**阀门①：政策利率**。最短期借钱的价格，现在是 4%。',
          `**阀门②：QE**。政策利率压到约 ${p1(R('cb_qe', 'floorRate'))} 以下、私人信贷还在收缩、失业又高时，央行直接买债，把新水注进池子。`,
          '现在先拧①：从 4% 拧到 7%。注意看图里水往哪传。',
        ],
        button: '把利率拧到 7%',
        question: '把利率从 4% 拧到 7%，新房贷利率和房价水位当季会怎样？',
        answerHint: ['新房贷利率当季就变贵了，新贷款少了，流进房产的水少了，房价水位回落。', '小镇里这一步先把「延迟」关着，所以当季就看得到。真实世界没这么快：下一步打开延迟。'],
        metrics: [{ label: '新房贷利率', get: 'rates.mortgageNew', fmt: 'pct' }, { label: '房产水位（房价指数）', get: 'assets.housing.price', fmt: 'n1' }],
        hl: ['policyRate', 'qe'], concept: ['policyRate', 'qe'] },

      { type: 'predict', title: '猜一猜', do: [{ delays: true }, { reset: true }, { valve: 'policyRate', value: 0.07 }], after: [{ valve: 'policyRate', value: null }], quarters: 4,
        q: '现在把小镇复原，打开「延迟」：已经借出去的老房贷要分批重定价。同样把政策利率从 4% 拧到 7%（升了 3 个点）。4 个季度后，家庭**实际在付的平均房贷利率**会怎样？',
        options: [
          { t: '跟着升了近 3 个点', ok: false },
          { t: '升得很少（不到一半）', ok: true },
          { t: '先暴涨后暴跌', ok: false },
        ],
        explain: [
          '央行改的只是新贷款的价格。老房贷每季只向新利率靠近一小步（约 10%）。',
          '新房贷利率里，约 3/4 跟的是长期国债收益率，而长债又只是政策利率路径的慢平均。',
          '所以吸力旋钮拧了，下游的水价还没怎么变：这就是传导延迟。',
        ],
        metrics: [{ label: '政策利率', get: 'rates.policy', fmt: 'pct' }, { label: '新房贷利率', get: 'rates.mortgageNew', fmt: 'pct' }, { label: '平均房贷利率（家庭实付）', get: 'rates.mortgageEff', fmt: 'pct' }],
        hl: ['policyRate', 'interestPaid'], concept: ['mortgageEff'] },

      { type: 'reveal', title: '拧了以后，水怎么往下传', show: ['household', 'interest'], block: 'ripple:policyRate',
        text: [
          '顺着水流，按“谁先动”的顺序：央行加息 → 银行的新房贷更贵 → 只有新借款的人立刻多付 → 老房贷分批重定价，家庭的付息一季一季变重 → 偿债率 DSR 慢慢爬升。',
          '右边这张表是真实世界的时间表（延迟打开时）：每一环标着要等多久。',
        ],
        question: '想一想：谁最先感觉到加息？',
        answerHint: '新借款的人，和刚好到期重定价的那一小批。大多数家庭还在付老利率。',
        relation: '央行没碰银行的审批阀，但水价变了以后，银行和家庭会按各自的规则反应：整条链要好几个季度。',
        hl: ['interestPaid'], concept: ['dsr', 'mortgageEff'] },

      { type: 'watch', title: '它的规则：看它动手', show: ['government', 'ledger'], tab: 'ledger', quarters: 4,
        do: [{ reset: true }, { rule: 'cb_real_path', on: false }, { valve: 'fiscalInjection', value: 0.08 }],
        after: [{ valve: 'fiscalInjection', value: null }, { rule: 'cb_real_path', on: true }],
        text: [
          '央行有三条规则，都在流水账里：',
          '① **真实路径**（cb_real_path）：历史模式下，利率照着真实联储走。小镇里它是一条平线，这一步先把它关掉。',
          `② **泰勒规则**（cb_taylor）：目标利率 = 中性利率 + 通胀 + ${R('cb_taylor', 'wInfl')}×(通胀 − ${p0(R('cb_taylor', 'target'))}) + 失业缺口反应。每季只向目标走 ${p0(R('cb_taylor', 'smooth'))}，一季最多动 ${pp(R('cb_taylor', 'maxMove'))}。`,
          `③ **QE**（cb_qe）：利率到底 + 信贷收缩 + 失业高，才启动；通胀回到 ${p1(R('cb_qe', 'piOff'))} 以上或失业回落就停。`,
          '现在我们让镇政府突然多花一笔钱（需求冲过产能，物价上涨）。看：流水账里每季多一行“泰勒规则”，利率一步步往上走。',
        ],
        metrics: [{ label: '政策利率', get: 'rates.policy', fmt: 'pct' }, { label: '通胀', get: 'macro.inflation', fmt: 'pct' }],
        hl: ['policyRate', 'fiscalInjection'], concept: ['policyRate'] },

      { type: 'try', title: '换你来拧', valve: 'policyRate', quarters: 8, do: [{ reset: true }],
        text: [
          '现在你是央行。小镇复原，延迟打开。把政策利率固定在一个数，之后 8 个季度一直不动，对比“按规则（4%）”的结果。',
          '试试：一直压在 1%（放松）会怎样？一直 7%（从紧）又会怎样？',
        ],
        slider: { min: 0, max: 0.10, step: 0.0025, def: 0.04, fmt: 'rate', label: '政策利率（全程保持）' },
        metrics: [
          { label: '8 季后房产水位', get: 'end:assets.housing.price', fmt: 'n1' },
          { label: '通胀峰值', get: 'max:macro.inflation', fmt: 'pct' },
          { label: '失业率峰值', get: 'max:macro.unemployment', fmt: 'pct' },
          { label: '8 季后平均房贷利率', get: 'end:rates.mortgageEff', fmt: 'pct' },
        ],
        insight: '利率只是水价。它改变的是“借钱有多贵”，不是“银行放不放”。拧得太松，房价和物价涨得多；拧得太紧，失业和债务压力来得更早。',
        hl: ['policyRate'] },

      { type: 'chain', title: '央行这一条因果链',
        text: ['央行的整条链，从拧吸力旋钮到水流到每家每户。点任何一环，图里对应的位置会亮。'],
        links: [
          { text: '央行拧政策利率（只有这一个大阀门）', part: 'centralBank', hl: ['policyRate'], term: 'policyRate' },
          { text: '新房贷利率立刻变：新借款的人先感觉到', pipe: 'newLoans', part: 'bank', term: 'newLoans' },
          { text: '借款变贵，新贷款（抽水泵）按比例变少', pipe: 'newLoans', term: 'newLoans' },
          { text: '流进房产的水变少，房产水位涨不动或回落', pipe: 'toHousing', part: 'poolHousing', term: 'assetReservoir' },
          { text: '老房贷分批重定价：家庭的付息一季一季变重（延迟 2–3 年）', pipe: 'interestPaid', term: 'mortgageEff' },
          { text: '偿债率 DSR 上升，家庭少借少花，河降温', part: 'channel', term: 'dsr' },
        ] },

      { type: 'zoom', title: '2004–2006 年的美联储', date: '2004Q2', until: '2006Q2', next: 'role-bank',
        text: [
          '同一张图换成真实的美国。2004 年中起，美联储连续加息，政策利率从约 1% 升到约 5.25%。',
          '看这个：政策利率升了 4 个多点，家庭实际在付的房贷利率却几乎没升。',
          '真实原因有两个。一是长期利率几乎没涨（格林斯潘称之为「谜」）：30 年房贷利率只从约 5.8% 升到约 6.4%。二是存量房贷多半是固定利率，老贷款的利率本来就不动。',
          '下一课看银行：那个真正决定抽多少水的审批阀。',
        ],
        hl: ['policyRate', 'interestPaid'], concept: ['mortgageEff'] },
    ],
  }),

  /* ============================ 银行 ============================ */
  lesson({
    id: 'role-bank', role: 'bank',
    title: '银行：开泵与关泵',
    oneLine: '银行是主泵：它放贷就造出新水。审批阀决定泵开多大：抵押品好就开大，抵押品差就关小。所以它把繁荣放大，也把萧条放大。',
    available: true,
    startParts: ['bank', 'household', 'iou', 'poolHousing', 'repay', 'valves', 'ledger'],
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**银行是主泵：它放贷就造出新水。审批阀（审批倍数）决定泵开多大：抵押品好就开大，抵押品差就关小，所以它把繁荣和萧条都放大。**',
          '像水泵房的管理员：泵一开，新水就出来了。阀开多大，决定泵出多少水。',
          '{{STEPS}}',
          '地点：5 户人家的小镇，镇银行就是主角。',
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

      { type: 'reveal', title: '它看得到什么，看不到什么', show: ['household'],
        text: [
          '**看得到**：房价比一年前涨跌（抵押品）、自己的坏账率、资本充足率、房贷平均 LVR。',
          '**看不到**：每户人家将来会不会失业、央行下一步怎么走、房价明年涨还是跌。',
          '**管不了**：央行利率（水价）、家庭想不想借（需求）、房价本身。银行只能决定“批不批”。',
        ],
        question: '想一想：银行把审批阀拧紧，能让房价立刻止跌吗？',
        answerHint: '不能，反而更糟。房价是买房的水推出来的，银行关泵，水更少。',
        hl: ['bankApproval'], concept: ['badLoans', 'bankCapital'] },

      { type: 'valve', title: '它能拧哪个阀门', valve: 'approval', value: 0.4, quarters: 2, keep: true,
        text: [
          '银行有两个阀门：**审批松紧**（银行框里的小圆点，1.00 = 中性）和 **LVR 上限**（房贷最多占房价几成）。',
          '审批倍数同时管三件事：① 直接乘在新贷款上；② 抬高或压低 LVR 和偿债率上限；③ 收紧时新房贷还要加点，利率更贵。',
          '现在把审批拧到 0.40（大幅收紧），看水往哪传。',
        ],
        button: '把审批拧到 0.40',
        question: '审批拧到 0.40，新贷款（抽水泵）和房价水位会怎样？',
        answerHint: ['新贷款（抽水泵）按比例变少，流进房产的水变少，房价水位回落。', '新水少了，小镇的水总量就不再增长。'],
        metrics: [{ label: '房产水位（房价指数）', get: 'assets.housing.price', fmt: 'n1' }, { label: '小镇总水量（万元）', get: 'money.M', fmt: 'n1' }],
        hl: ['bankApproval', 'newLoans'], concept: ['bankApproval', 'newLoans'] },

      { type: 'predict', title: '猜一猜', quarters: 3,
        q: '审批阀还停在 0.40，家庭每季照样还本（回灌口没变细）。再过 3 个季度，小镇的水总量会怎样？',
        options: [
          { t: '继续增加：只要银行还在放贷', ok: false },
          { t: '不变', ok: false },
          { t: '缩小：新贷款少于还本，回灌比抽水多', ok: true },
        ],
        explain: [
          '银行收紧只管“新贷款”，也就是进水的泵；还本是回灌口，不听银行的。',
          '新贷款少于还本，水量平衡条里“抽水 − 回灌”变成负数：水位退潮。',
          '这在真实世界叫信贷脉冲转负：流进来的水比流出去的少。',
        ],
        metrics: [{ label: '小镇总水量（万元）', get: 'money.M', fmt: 'n1' }, { label: '房产水位（房价指数）', get: 'assets.housing.price', fmt: 'n1' }],
        hl: ['newLoans', 'principalRepay'], concept: ['creditImpulse', 'principalRepay'] },

      { type: 'reveal', title: '它的动作碰到谁：圈倒着转', show: ['channel', 'firm', 'budget'],
        text: [
          '银行收紧 → 家庭想借借不到，买房的水少了 → 房价承压 → **平均 LVR 升高** → 银行下一季更敢收（抵押品规则再触发）。',
          '同时，企业的新贷款也要乘同一个审批倍数：企业借不到，Capex 和需求一起降温。',
          '每家银行都在理性自保，合起来却让整个圈倒着转：房价↓ → LVR↑ → 收紧 → 新贷款↓ → 房价↓。',
        ],
        question: '想一想：如果这时央行降息，能把这个圈拉回来吗？',
        answerHint: '很难。问题出在银行的审批阀（抵押品和资本），不在水价。资本不足时，银行还会先修资本，不随降息自动放开。',
        hl: ['bankApproval', 'assetReservoir'], concept: ['lvr', 'bankApproval', 'creditImpulse'] },

      { type: 'watch', title: '它的规则：看它开泵、关泵', show: ['centralBank', 'ledger'], tab: 'ledger', quarters: 6,
        do: [{ reset: true }, { valve: 'policyRate', value: 0.09 }], after: [{ valve: 'policyRate', value: null }],
        text: [
          '银行有四条规则，按这个顺序判断：',
          `① **先看亏损**（bank_tighten_losses）：坏账率 > ${p1(R('bank_tighten_losses', 'bad'))} 或资本充足率 < ${p1(R('bank_tighten_losses', 'cap'))}，每季收紧 ${x2(R('bank_tighten_losses', 'step'))}，最低到 ${x2(R('bank_tighten_losses', 'min'))}。`,
          `② **再看抵押品**（bank_tighten_collateral）：房价比一年前 < ${p0(R('bank_tighten_collateral', 'hp'))}（或比近期峰值回撤 > ${p0(R('bank_tighten_collateral', 'dd'))}），并且平均 LVR > ${p0(R('bank_tighten_collateral', 'lvr'))}，每季收紧 ${x2(R('bank_tighten_collateral', 'step'))}。`,
          `③ **最后才放宽**（bank_loosen）：房价比一年前 > ${p0(R('bank_loosen', 'hp'))}、坏账率 < ${p1(R('bank_loosen', 'bad'))}、资本充足率 > ${p0(R('bank_loosen', 'cap'))}，三个都满足，每季放宽 ${x2(R('bank_loosen', 'step'))}，最高 ${x2(R('bank_loosen', 'max'))}。`,
          `④ **先修资本**（bank_rebuild_capital）：资本低于 ${p1(R('bank_rebuild_capital', 'cap'))}，审批上限被压住，降息也不会自动恢复。`,
          '关泵比开泵快：收紧每步比放宽每步大。现在外面起了风：央行把水价拧到 9%，房价掉头。看流水账里银行的规则一条条出现。',
        ],
        metrics: [{ label: '审批倍数', get: 'bank.approval', fmt: 'n2' }, { label: '房产水位（房价指数）', get: 'assets.housing.price', fmt: 'n1' }, { label: '银行坏账率', get: 'bank.badLoanRate', fmt: 'pct' }],
        hl: ['bankApproval', 'newLoans'], concept: ['bankApproval', 'lvr'] },

      { type: 'try', title: '换你来拧', valve: 'approval', quarters: 8, do: [{ reset: true }],
        text: [
          '现在你是银行风控总监。小镇复原。把审批倍数固定在一个数，8 个季度全程不变（你不再按规则放宽或收紧），对比“按规则”。',
          '试试固定 0.60（一直收着）和 1.30（一直敞开）。',
        ],
        slider: { min: 0.3, max: 1.4, step: 0.05, def: 1.0, fmt: 'n2', label: '审批倍数（全程保持）' },
        metrics: [
          { label: '8 季后房产水位', get: 'end:assets.housing.price', fmt: 'n1' },
          { label: '累计新贷款（万元）', get: 'sum:flows.newLoans', fmt: 'n1' },
          { label: '8 季后小镇总水量', get: 'end:money.M', fmt: 'n1' },
          { label: '坏账率峰值', get: 'max:bank.badLoanRate', fmt: 'pct' },
        ],
        insight: '审批阀是放大器。固定得越高，水越多、房价越高；固定得越低，水越少、房价越低。银行规则的问题不在于不理性，而在于每家都顺着周期走。',
        hl: ['bankApproval', 'newLoans'] },

      { type: 'chain', title: '银行这一条因果链',
        text: ['银行的整条链。点任何一环，图里对应的水管会亮。'],
        links: [
          { text: '银行看抵押品（LVR）、坏账、资本，拧审批阀', part: 'bank', hl: ['bankApproval'], term: 'bankApproval' },
          { text: '审批倍数乘在新贷款上：抽水泵变粗或变细', pipe: 'newLoans', part: 'iou', term: 'newLoans' },
          { text: '新贷款少于还本：水量平衡条变负，水位退潮', pipe: ['newLoans', 'principalRepay'], part: 'budget', term: 'creditImpulse' },
          { text: '流进房产的水变少，房价水位涨不动或回落', pipe: 'toHousing', part: 'poolHousing', term: 'assetReservoir' },
          { text: '抵押品变差（LVR 升高），银行下一季更敢收：圈倒着转', pipe: 'collateral', part: 'bank', term: 'lvr' },
        ] },

      { type: 'zoom', title: '2007–2008 年的美国银行', date: '2006Q4', until: '2008Q4', next: 'role-household',
        text: [
          '同一个圈，放在真实的美国：房价掉头，银行的收紧规则一条条触发，审批倍数一路下调。',
          '看这个：新贷款（抽水泵）比还本管细，水总量净减少。',
          '下一课看家庭：站在审批阀另一边的人。',
        ],
        hl: ['bankApproval', 'newLoans', 'principalRepay'], concept: ['creditImpulse'] },
    ],
  }),

  /* ============================ 家庭 ============================ */
  lesson({
    id: 'role-household', role: 'household',
    title: '家庭：借与存的两只手',
    oneLine: '家庭有两只手：借和存。房价涨时伸手多借，压力大时缩手多存。每家都合理，合在一起却会把别人的收入压下去。',
    available: true,
    startParts: ['household', 'bank', 'iou', 'poolHousing', 'channel', 'valves', 'ledger'],
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**家庭有两只手：借和存。房价涨，伸手多借；压力大，缩手多存。每家都合理，合起来却会压低所有人的收入。**',
          '像一群人同时从池塘取水自保：每个人都在保自己，水位却一起往下掉。',
          '{{STEPS}}',
          '地点：5 户人家的小镇。这一课的主角是“全体家庭”。',
        ],
        hl: ['newLoans', 'interestPaid'], concept: ['dsr', 'hhDebt'] },

      { type: 'reveal', title: '它想要什么', show: ['household'],
        text: [
          '家庭想要：**平稳地过日子**（消费不要大起大落）、有房住、净资产别缩水。',
          '家庭最怕三件事：失业、月供太重（DSR 高）、房子比房贷还便宜（负资产）。',
        ],
        question: '想一想：房价涨了一大截，邻居都在买房，你会借更多还是更少？',
        answerHint: '多数人借更多：看到涨就外推“还会涨”。这就是它的第一条规则。',
        hl: ['newLoans'], concept: ['income', 'hhDebt'] },

      { type: 'reveal', title: '它看得到什么，看不到什么', show: ['bank'],
        text: [
          '**看得到**：自己的月供占收入的比例（DSR）、房价涨跌、周围的失业、利率。',
          '**看不到**：银行下个季度收不收泵、房价明年涨还是跌、**别的家庭是不是也在同时多存钱**。',
          '**管不了**：房价、利率、银行批不批。家庭只能决定“想借多少”和“存多少”。实际借到的，是想借的和银行允许的里较小的那个。',
        ],
        question: '想一想：为什么“别人也在多存钱”这一条，家庭偏偏看不到？',
        answerHint: '每户只看得到自己的账单。别人的存款变化，要等到自己的工资、小卖部的生意变差，才间接感觉到。',
        hl: ['newLoans', 'bankApproval'], concept: ['dsr', 'lvr'] },

      { type: 'valve', title: '它能拧哪两个阀门', valve: 'saveAdj', value: 0.05, quarters: 2, keep: false,
        text: [
          '家庭有两个旋钮：**借款意愿**（想借多少，1.00 = 正常）和**储蓄率**（收入里存下多少）。',
          '借款意愿变大，抽水泵想变粗；储蓄率升高，花出去的水变少。',
          '现在拧储蓄率：全镇每户都多存 5 个点。看水往哪传。',
        ],
        button: '让每户多存 5 个点',
        question: '每户都多存 5 个点，小卖部的生意和大家的收入会怎样？',
        answerHint: ['存款留在账上，不再流向小卖部。小卖部卖得少了，企业给的工资也少了。', '多存的钱，是别人少收到的钱。'],
        metrics: [{ label: '小卖部本季销售（万元）', get: 'town.shop.sales', fmt: 'n1' }, { label: '全体家庭收入（万元/年）', get: 'household.income', fmt: 'n1' }, { label: '失业率', get: 'macro.unemployment', fmt: 'pct' }],
        hl: ['goodsChannel'], concept: ['income'] },

      { type: 'predict', title: '猜一猜', do: [{ reset: true }, { action: { type: 'saving', adj: 0.05 } }], after: [], quarters: 2,
        q: '小镇复原。这一次每户人家都多存 5 个点，想把自己的日子过得更稳。2 个季度后，**全镇 5 户的总收入**会怎样？',
        options: [
          { t: '总收入不受影响', ok: false },
          { t: '总收入反而更高，因为存款更多了', ok: false },
          { t: '总收入下降：一家的储蓄，是另一家少掉的收入', ok: true },
        ],
        explain: [
          '每家都在省钱，整体的消费需求就少了。小卖部卖不动、老板少招人、工资变少，水又回到家庭的收入上：收入下降。',
          '个体合理，合起来不合理。这叫“节约悖论”，也是资产负债表衰退的核心。',
        ],
        metrics: [{ label: '全体家庭收入（万元/年）', get: 'household.income', fmt: 'n1' }, { label: '小卖部本季销售（万元）', get: 'town.shop.sales', fmt: 'n1' }, { label: '失业率', get: 'macro.unemployment', fmt: 'pct' }],
        hl: ['goodsChannel', 'newLoans'], concept: ['income', 'dsr'] },

      { type: 'reveal', title: '它的动作碰到谁：水怎么流回自己', show: ['firm', 'channel'],
        text: [
          '家庭多存少花 → 小卖部（河）需求少 → 企业卖不动、招工少 → 工资（回到家庭的水）变少 → 家庭收入下降。',
          '收入是 DSR 的分母：收入一少，月供压力就更难降下来。',
          '另一只手也一样：家庭想借得多、银行也肯批 → 抽水泵变粗 → 买房的水流进房产 → 房价涨。家庭的借款意愿和银行的审批，是同一根蓝管的两只手：一只想要，一只批准。',
        ],
        question: '想一想：你少花的每一块钱，去哪了？',
        answerHint: '你少花的每一块钱，都是别人少收到的一块钱。',
        hl: ['goodsChannel', 'newLoans'], concept: ['income', 'dsr'] },

      { type: 'watch', title: '它的规则：看它出手', show: ['centralBank', 'ledger'], tab: 'ledger', quarters: 5,
        do: [{ reset: true }, { valve: 'policyRate', value: 0.09 }], after: [{ valve: 'policyRate', value: null }],
        text: [
          '家庭有五条规则，先说最重要的三条：',
          `① **追涨 / 观望**（hh_chase）：房价比一年前 > ${p0(R('hh_chase', 'up'))}，外推上涨，借款需求上调；房价比一年前 < ${p0(R('hh_chase', 'down'))}，观望，借款需求下调。`,
          `② **去杠杆**（hh_deleverage）：DSR 比起点高 ${pp(R('hh_deleverage', 'dsr'))}以上，或失业率 > ${p1(R('hh_deleverage', 'u'))}，借款需求 ×${x2(R('hh_deleverage', 'borrow'))}，储蓄率加 ${pp(R('hh_deleverage', 'save'))}。`,
          '③ **债务悬压**（hh_overhang）：房价从峰值回撤、LVR 高、DSR 高，越多越重，家庭多年少借多存。悬压每季只衰减一点点，降息也很难把它重新点燃。',
          '另外两条：**被迫出售**（hh_forced_sales）和**通胀预期脱锚**（hh_infl_deanchor）。',
          '现在央行把水价拧到 9%，房价掉头、债务变重。看流水账里家庭的“债务悬压”出现了：多存少借。',
        ],
        metrics: [{ label: '房产水位（房价指数）', get: 'assets.housing.price', fmt: 'n1' }, { label: '家庭 DSR（月供/收入）', get: 'household.dsr', fmt: 'pct' }, { label: '储蓄率', get: 'household.savingRate', fmt: 'pct' }],
        hl: ['newLoans', 'assetReservoir'], concept: ['dsr', 'lvr', 'housePrice'] },

      { type: 'try', title: '换你来拧', valve: 'saveAdj', quarters: 6, do: [{ reset: true }],
        text: [
          '现在你是“全体家庭的平均储蓄意愿”。小镇复原。在原来的储蓄率上多加（或少加）几个点，6 个季度全程不变，对比“按规则”。',
          '试试：多存 +6 个点（更谨慎）。看总收入、失业和小卖部的生意。',
        ],
        slider: { min: -0.03, max: 0.08, step: 0.005, def: 0, fmt: 'pp', label: '额外储蓄率（全程保持）' },
        metrics: [
          { label: '6 季后全体家庭收入', get: 'end:household.income', fmt: 'n1' },
          { label: '失业率峰值', get: 'max:macro.unemployment', fmt: 'pct' },
          { label: '小卖部累计销售（万元）', get: 'sum:town.shop.sales', fmt: 'n1' },
        ],
        insight: '多存一点，每家都更安心，合起来总收入反而少了，失业还更高。家庭手里没有“既更安心、又不拖累别人”的旋钮。',
        hl: ['goodsChannel'] },

      { type: 'chain', title: '家庭这一条因果链',
        text: ['家庭的整条链，借和存两只手。点任何一环，图里对应的水管会亮。'],
        links: [
          { text: '家庭想借多少（借款意愿）和存多少（储蓄率），是它的两个旋钮', part: 'household', term: 'hhDebt' },
          { text: '想借的与银行批准的重叠，才是抽水泵的水量', pipe: 'newLoans', part: 'bank', term: 'newLoans' },
          { text: '借来的水流进房产：房价涨；流进小卖部：物价涨', pipe: ['toHousing', 'toConsumption'], term: 'assetReservoir' },
          { text: '每家多存、少花：小卖部（河）需求变少', pipe: 'toConsumption', part: 'channel', term: 'goodsChannel' },
          { text: '企业卖不动，工资变少：回到家庭的水变少，总收入下降（节约悖论）', pipe: 'wages', part: 'household', term: 'income' },
          { text: '收入是 DSR 的分母：压力更难降下来，家庭更想存：圈又转一圈', part: 'household', term: 'dsr' },
        ], next: 'role-firm' },
    ],
  }),

  /* ============================ 企业 ============================ */
  lesson({
    id: 'role-firm', role: 'firm',
    title: '企业：Capex 与产能的时差',
    oneLine: '企业的阀门是 Capex。今天多投的钱，先是需求，要隔好几个季度才变成新产能，所以需求一冲到产能上限，通胀就来了。',
    available: true,
    startParts: ['firm', 'capex', 'channel', 'valves', 'ledger'],
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**企业的阀门是 Capex（资本开支）。今天多投的钱，当季先是需求；要隔好几个季度才变成新产能。所以需求一冲到产能上限，新产能还来不及，通胀就来了。**',
          '像修一条新水渠：今天开工，要等一年半才通水。',
          '{{STEPS}}',
          '地点：5 户人家的小镇，企业就是小卖部老板们。',
        ],
        hl: ['capex', 'capacity'], concept: ['capex', 'capacity'] },

      { type: 'reveal', title: '它想要什么', show: ['firm'],
        text: ['企业想要：**长期利润，并且活下来**。需求好、借钱便宜，就扩张；需求差、借钱贵、坏账多，就收缩。'],
        question: '想一想：小卖部老板今天决定扩建店面，今天就能多卖货吗？',
        answerHint: '不能。要买设备、盖房子，新产能要等好几个季度。',
        hl: ['capex'], concept: ['capex'] },

      { type: 'reveal', title: '它看得到什么，看不到什么', show: ['channel'],
        text: [
          '**看得到**：订单有多旺（需求比产能多还是少）、扣掉通胀后的融资成本、自己的坏账。',
          '**看不到**：明年的需求、央行下一步、别的企业是不是也在同时扩产（大家一起扩，一起过剩）。',
          '**管不了**：利率、家庭收入，还有油价（模型里是外生数据）。',
        ],
        question: '想一想：为什么“大家一起扩产”会出问题？',
        answerHint: '每家只看自己的订单，看不到别人也在盖。等新产能一起到位，需求没那么多了，就过剩。',
        hl: ['goodsChannel', 'capacity'], concept: ['outputGap', 'realRate'] },

      { type: 'valve', title: '它能拧哪个阀门', valve: 'capexMult', value: 1.3, quarters: 6, keep: true, do: [{ delays: true }],
        text: [
          '企业只有一个旋钮：**Capex 倍数**（1.00 = 基准）。现实里企业还定价、招聘、分红回购，本游戏简化成这一个旋钮。',
          '这一课我们**打开延迟**：现实里一座厂房要 **6 个季度**才能建成（小镇的默认只等 2 个季度）。',
          '现在把 Capex 加大 30%，播放 6 个季度。看：断面变宽了吗？',
        ],
        button: '让 Capex 加大 30%',
        question: '加大 Capex 以后，6 个季度之内，断面会变宽吗？',
        answerHint: ['Capex 当季先是**需求**：花出去的钱变成别人的工资和收入，需求压力先涨。', '6 个季度之内，断面（产能）一点都没变宽。这笔钱还在“管道”里。'],
        metrics: [{ label: '需求压力', get: 'macro.demandPressure', fmt: 'pct' }, { label: '产能（断面宽度）', get: 'macro.capacityPotential', fmt: 'n1' }, { label: '全体家庭收入（万元/年）', get: 'household.income', fmt: 'n1' }],
        hl: ['capex', 'capacity'], concept: ['capex', 'capacity'] },

      { type: 'predict', title: '猜一猜', quarters: 4,
        q: 'Capex 还保持在 ×1.3。再过 4 个季度（第 7 到 10 季），新产能开始到位。需求压力（需求比产能多多少）会怎样？',
        options: [
          { t: '一直更高：Capex 越多，需求越大', ok: false },
          { t: '先高后低：新产能到位后，压力回落到比不加 Capex 时还低', ok: true },
          { t: '完全不变', ok: false },
        ],
        explain: [
          'Capex 经过建设期才变成产能。头几个季度只有需求（压力高、通胀高）。',
          '新产能到位后，断面变宽，压力回落，甚至比没加 Capex 时更低（产能过剩的苗头）。',
          '先加需求，后加供给。时差就是通胀的空间。',
        ],
        metrics: [{ label: '需求压力', get: 'macro.demandPressure', fmt: 'pct' }, { label: '产能（断面宽度）', get: 'macro.capacityPotential', fmt: 'n1' }, { label: '通胀', get: 'macro.inflation', fmt: 'pct' }],
        hl: ['capex', 'capacity', 'cpi'], concept: ['capex', 'capacity', 'cpi'] },

      { type: 'reveal', title: '它的动作碰到谁', show: ['household', 'bank'],
        text: [
          'Capex 加码 → 企业向银行多借、多花 → 当季：这笔钱是需求，流进河，成了别人的工资和利润，需求压力更高。',
          '约 6 个季度后：新产能到位，断面宽度变大，压力才回落。',
        ],
        question: '想一想：如果这时央行为了压通胀加息，Capex 会怎样？',
        answerHint: '融资成本升高，企业的“收缩”规则触发，Capex 削减。短期压住了需求，但未来的产能也少了，供给更紧。',
        hl: ['capex', 'goodsChannel'], concept: ['capex', 'outputGap'] },

      { type: 'watch', title: '它的规则：看它投资', show: ['government', 'ledger'], tab: 'ledger', quarters: 5,
        do: [{ reset: true }, { valve: 'fiscalInjection', value: 0.05 }], after: [{ valve: 'fiscalInjection', value: null }],
        text: [
          '企业有三条规则：',
          `① **扩张**（firm_capex_up）：需求压力 > ${p1(R('firm_capex_up', 'p'))} 且实际融资成本 < ${p1(R('firm_capex_up', 'rReal'))}，每季加码 ${x2(R('firm_capex_up', 'step'))}，上限 ${x2(R('firm_capex_up', 'max'))}。`,
          `② **收缩**（firm_capex_cut）：需求缺口 < ${p1(R('firm_capex_cut', 'p'))} 或实际融资成本 > ${p1(R('firm_capex_cut', 'rReal'))} 或企业坏账 > ${p1(R('firm_capex_cut', 'bad'))}，每季削减 ${x2(R('firm_capex_cut', 'step'))}，下限 ${x2(R('firm_capex_cut', 'min'))}。`,
          `③ **油价传导**（firm_oil_passthrough）：这不是企业的“决定”，而是成本推价格：油价比一年前涨 100%，年化价格推力约 ${p1(R('firm_oil_passthrough', 'k'))}。`,
          '现在让镇政府多花一笔钱，需求冲过产能。看流水账里企业的“扩张”规则一季一季地触发。',
        ],
        metrics: [{ label: '需求压力', get: 'macro.demandPressure', fmt: 'pct' }, { label: 'Capex 倍数', get: 'extra.capexMult', fmt: 'n2' }],
        hl: ['capex', 'capacity', 'goodsChannel'], concept: ['capex', 'capacity'] },

      { type: 'try', title: '换你来拧', valve: 'capexMult', quarters: 10, do: [{ reset: true }],
        text: [
          '现在你是“全体企业的平均 Capex 意愿”。小镇复原（延迟仍然打开）。把倍数固定，10 个季度全程不变，对比“按规则”。',
          '试试：固定 1.30（一直猛投）和 0.70（一直谨慎）。看产能和通胀怎么变。',
        ],
        slider: { min: 0.6, max: 1.4, step: 0.05, def: 1.0, fmt: 'n2', label: 'Capex 倍数（全程保持）' },
        metrics: [
          { label: '需求压力峰值', get: 'max:macro.demandPressure', fmt: 'pct' },
          { label: '10 季后产能（断面宽度）', get: 'end:macro.capacityPotential', fmt: 'n1' },
          { label: '累计 Capex（万元）', get: 'sum:flows.toCapex', fmt: 'n1' },
          { label: '通胀峰值', get: 'max:macro.inflation', fmt: 'pct' },
        ],
        insight: '多投产能要等好几个季度，当季只是多了需求；少投则把未来的供给越压越紧。企业没有一个能立刻压通胀的旋钮。',
        hl: ['capex', 'capacity'] },

      { type: 'chain', title: '企业这一条因果链',
        text: ['企业的整条链：先需求，后供给。点任何一环，图里对应的水管会亮。'],
        links: [
          { text: '企业拧 Capex 倍数：需求旺、钱便宜就加码，缺口大、钱贵就削减', part: 'firm', hl: ['capex'], term: 'capex' },
          { text: 'Capex 当季是需求：钱流进河，成了别人的工资和利润', pipe: 'toCapex', part: 'channel', term: 'capex' },
          { text: '需求压力先涨，通胀先涨；收入先涨', pipe: 'wages', part: 'channel', term: 'cpi' },
          { text: '约 6 个季度的建设期：钱还在管道里，河道没变宽', part: 'capex', hl: ['capacity'], term: 'capacity' },
          { text: '新产能到位，断面变宽，需求压力回落：先加需求，后加供给', pipe: 'toCapex', part: 'capex', term: 'outputGap' },
        ], next: 'role-government' },
    ],
  }),

  /* ============================ 政府 ============================ */
  lesson({
    id: 'role-government', role: 'government',
    title: '政府：最后的补水人',
    oneLine: '私人部门收缩时，政府多花钱把水池补上；通胀太高或利息吃掉太多税收时，它收紧。代价是债务和利息。',
    available: true,
    startParts: ['government', 'household', 'channel', 'iou', 'valves', 'ledger'],
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**政府是最后的“补水人”。私人部门收缩时它多花钱，把水池补上；通胀太高或利息太重时它收紧。补水不是免费的，代价是债务和利息。**',
          '{{STEPS}}',
          '地点：5 户人家的小镇，镇政府就是主角。',
        ],
        hl: ['fiscalInjection'], concept: ['fiscalInjection', 'interestToTax'] },

      { type: 'reveal', title: '它想要什么', show: ['government'],
        text: [
          '政府想要：**收入和就业稳**、公共产能够用、**债务别失控**，还有政治支持。',
          '约束有两个：利息占税收的比例，和债权人愿不愿意继续借钱给它。',
        ],
        question: '想一想：私人部门都在还债、少借的时候，为什么需要政府而不是家庭来花钱？',
        answerHint: '家庭和企业都在还债、少借，谁都不敢花。只有政府能在这时把净水注进来，对冲私人信贷的收缩。',
        hl: ['fiscalInjection'], concept: ['fiscalInjection'] },

      { type: 'reveal', title: '它看得到什么，看不到什么', show: ['bank'],
        text: [
          '**看得到**：失业率（比近 2 年低点高多少）、需求缺口、通胀、利息占税收的比例、银行资本充足率。',
          '**看不到**：私人部门自己会不会很快恢复；债权人哪天不愿再借（那由“外国部门”的规则决定）。',
          '**管不了**：央行利率，以及家庭、企业怎么花。',
        ],
        question: '想一想：政府看到失业升高，为什么不能马上知道“该补多少”？',
        answerHint: '它读的是已经发生的失业和缺口，又不知道私人部门什么时候自己恢复。补少了没用，补多了又留下债务。',
        hl: ['cpi', 'goodsChannel'], concept: ['unemployment', 'outputGap', 'interestToTax'] },

      { type: 'valve', title: '它能拧哪个阀门', valve: 'fiscalInjection', value: 0.05, quarters: 2, keep: false,
        text: [
          '政府的旋钮是**财政注入**（占 GDP 的比例，每年）。正数是多花（赤字，深井泵抽新水），负数是收紧（盈余，回灌）。',
          '注入的钱里，大部分变成消费需求，一部分变成企业 Capex，小部分存成现金。现实里还有税率、转移支付、公共投资的区别，本游戏把它们合成这一个旋钮。',
          '现在让镇政府多花 GDP 的 5%。看水往哪传。',
        ],
        button: '让政府多花 5%',
        question: '镇政府多花 GDP 的 5%，物价和小镇的水量会怎样？',
        answerHint: ['多花的钱是新水：总水量增加，需求变大，物价被推高。', '代价是政府债务占 GDP 的比例升高。'],
        metrics: [{ label: '通胀', get: 'macro.inflation', fmt: 'pct' }, { label: '小镇总水量（万元）', get: 'money.M', fmt: 'n1' }, { label: '政府债务 / GDP', get: 'gov.debtGdp', fmt: 'pct' }],
        hl: ['fiscalInjection'], concept: ['fiscalInjection'] },

      { type: 'watch', title: '它的规则：看它补水', show: ['ledger'], tab: 'ledger', quarters: 4,
        do: [{ reset: true }, { action: { type: 'saving', adj: 0.05 } }],
        text: [
          '政府有三条规则：',
          `① **逆周期加码**（gov_stimulus）：失业率比近 2 年低点高 > ${pp(R('gov_stimulus', 'du'))}，或需求缺口 < ${p0(R('gov_stimulus', 'gap'))}，注入按缺口深度加码，每季最多加 ${p1(R('gov_stimulus', 'ramp'))} GDP，上限 ${p0(R('gov_stimulus', 'max'))} GDP。景气稳定后每季收回一小步。`,
          `② **紧缩**（gov_austerity）：通胀 > ${p1(R('gov_austerity', 'pi'))} 或利息/税收 > ${p0(R('gov_austerity', 'i2t'))}，向下收一小步。它排在加码前面，先判断。`,
          `③ **救银行**（gov_bank_recap）：银行资本充足率 < ${p1(R('gov_bank_recap', 'cap'))}，政府注资，目标 ${p1(R('gov_bank_recap', 'target'))}，这笔钱计入政府债务。`,
          '现在全镇每户都多存了 5 个点（节约悖论，上一课学过），失业升高。看流水账里“逆周期加码”出现，财政注入变粗。',
        ],
        metrics: [{ label: '失业率', get: 'macro.unemployment', fmt: 'pct' }, { label: '本季财政注入（万元）', get: 'flows.fiscalInjection', fmt: 'n1' }],
        hl: ['fiscalInjection'], concept: ['fiscalInjection', 'unemployment'] },

      { type: 'predict', title: '猜一猜', quarters: 4,
        q: '刚才政府按规则出手补水。如果它当时**不出手**（关掉“逆周期加码”），这一轮的失业率峰值会比“出手”时怎样？',
        options: [
          { t: '更高', ok: true },
          { t: '一样', ok: false },
          { t: '更低', ok: false },
        ],
        explain: [
          '政府不补水，家庭又都在多存，需求缺口更大、更久，失业升得更高。',
          '但补水有代价：政府债务占 GDP 的比例更高，利息负担也更重。',
          '下面“换你来”里，可以亲手对比。',
        ],
        metrics: [{ label: '失业率', get: 'macro.unemployment', fmt: 'pct' }, { label: '本季财政注入（万元）', get: 'flows.fiscalInjection', fmt: 'n1' }],
        hl: ['fiscalInjection'], concept: ['fiscalInjection', 'unemployment'] },

      { type: 'reveal', title: '它的动作碰到谁', show: ['firm', 'interest'],
        text: [
          '政府多花钱 → 钱先到家庭和企业手里，大部分变成消费，一部分变成 Capex → 小卖部卖得动、不裁人 → 失业回落 → 税收回升。',
          '政府多花的钱来自发债 → 债务占 GDP 上升 → 利息占税收的比例上升 → 太高时，紧缩规则会反过来触发。',
          '银行资本跌破红线时，政府还会注资，这也计入债务：补了银行的水，欠了自己的债。',
        ],
        question: '想一想：补水补到什么时候该停？',
        answerHint: '规则是：景气稳定后逐步收回；如果通胀太高或利息吃掉太多税收，就收紧。',
        hl: ['fiscalInjection'], concept: ['interestToTax', 'gMinusR'] },

      { type: 'try', title: '换你来选', quarters: 8, do: [{ reset: true }, { action: { type: 'saving', adj: 0.05 } }],
        text: [
          '现在你是财政部长。小镇复原，再来一次“全镇多存 5 个点”的冲击。选一个方案，跑 8 个季度。',
        ],
        choices: [
          { label: '政府按规则出手（逆周期加码）', do: [] },
          { label: '政府不出手（关掉加码规则）', do: [{ rule: 'gov_stimulus', on: false }] },
        ],
        metrics: [
          { label: '失业率峰值', get: 'max:macro.unemployment', fmt: 'pct' },
          { label: '8 季后政府债务 / GDP', get: 'end:gov.debtGdp', fmt: 'pct' },
          { label: '8 季后小镇总水量（万元）', get: 'end:money.M', fmt: 'n1' },
        ],
        baseLabel: '出手（按规则）',
        insight: '补水越多，失业越低，债务也越重。补水不是免费的：这笔债以后要还，或者靠增长慢慢“化掉”。',
        hl: ['fiscalInjection'] },

      { type: 'chain', title: '政府这一条因果链',
        text: ['政府的整条链：补水，也有代价。点任何一环，图里对应的水管会亮。'],
        links: [
          { text: '私人部门收缩，失业升高、需求缺口变深', part: 'household', term: 'unemployment' },
          { text: '政府的规则触发：财政注入（深井泵）打开，造出新水', pipe: 'fiscalInjection', part: 'government', term: 'fiscalInjection' },
          { text: '钱先到家庭和企业：变成消费和 Capex，需求撑住', pipe: ['toConsumption', 'toCapex'], part: 'channel', term: 'goodsChannel' },
          { text: '失业回落、税收回升；景气稳定后，政府逐步收回', pipe: 'taxes', part: 'government', term: 'income' },
          { text: '代价：政府债务和利息上升，太高时紧缩规则触发', part: 'government', term: 'interestToTax' },
        ] },

      { type: 'zoom', title: '2007–2009 年的美国政府', date: '2007Q1', until: '2009Q2', next: 'role-investor',
        text: [
          '同一张图换成真实的美国：私人部门去杠杆，失业升高，财政注入（紫管）变粗。',
          '看这个：补水不是免费的，政府债务占 GDP 一路上升。',
          '下一课看投资者：新增的水流进哪个池子。',
        ],
        hl: ['fiscalInjection'], concept: ['fiscalInjection', 'unemployment'] },
    ],
  }),

  /* ============================ 投资者 ============================ */
  lesson({
    id: 'role-investor', role: 'investor',
    title: '投资者：新增的水流向哪',
    oneLine: '投资者不造水，只决定新增的水往哪个池子流：房、股、国债、黄金、现金。它追涨，也会在害怕时一起逃，所以放大价格的涨跌。',
    available: true,
    startParts: ['pool', 'cash', 'household', 'iou', 'valves', 'ledger'],
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**投资者不造水，只决定“新增的那部分水”往哪个池子流：房、股、国债、黄金、现金。它追涨，也会在害怕时一起逃，所以放大价格的涨跌。**',
          '像池塘边的人：水不是他们放的，但他们决定把桶放在哪个池子旁边。',
          '{{STEPS}}',
          '地点：5 户人家的小镇，镇上也有 4 个资产池。',
        ],
        hl: ['assetReservoir'], concept: ['assetReservoir', 'riskPremium'] },

      { type: 'reveal', title: '它想要什么', show: ['pool'],
        text: [
          '投资者想要：**扣掉通胀后，购买力稳步增加**。',
          '它比较房产、股票、国债、黄金、现金这几个池子里谁更值，再把新水往更好的池子送。',
        ],
        question: '想一想：看到一个池子最近涨得很快，你会往里放更多水吗？',
        answerHint: '多数人会，这就是“追涨”（动量）。它的第一条规则。',
        hl: ['assetReservoir'], concept: ['assetReservoir'] },

      { type: 'reveal', title: '它看得到什么，看不到什么', show: ['cash'],
        text: [
          '**看得到**：房价比一年前、股价比一年前（动量）、风险溢价、信贷脉冲、房价与收入的比。',
          '**看不到**：价格下个季度到底涨还是跌；别的投资者是不是也在同时逃。',
          '**管不了**：新水一共有多少（那是新贷款、财政注入、QE 决定的）；价格本身（价格是被流进来的水推出来的）。',
        ],
        question: '想一想：为什么说投资者“只能分配新增的水”？',
        answerHint: '水的总量由抽水泵、财政、QE 决定。投资者只决定这些新水往哪个池子送，而且只有约 1/4 听它的，其余约 3/4 已经有用途了。',
        hl: ['assetReservoir'], concept: ['housePrice', 'equityAsset', 'riskPremium'] },

      { type: 'watch', title: '它的旋钮：新增水的去向', show: ['poolEquity', 'poolBond', 'poolGold'], quarters: 2, block: 'alloc',
        text: [
          '投资者的旋钮是**新增资金的去向权重**：房产、股票、国债、黄金、现金，各占几成。',
          '没有外力的时候，小镇里新增的水大部分流进房产，其余按近期收益分给股票、国债、黄金，一小份留作现金。',
          '先让小镇走两个季度，看下面这行“新增资金的去向”。',
        ],
        hl: ['assetReservoir'], concept: ['assetReservoir', 'cashAsset'] },

      { type: 'predict', title: '猜一猜', do: [{ action: { type: 'riskOff', on: true } }], after: [], quarters: 2, block: 'alloc',
        q: '现在投资者害怕了，打开“避险”。接下来 2 个季度，新增资金里流向**现金**的份额会怎样？',
        options: [
          { t: '升高', ok: true },
          { t: '不变', ok: false },
          { t: '降低', ok: false },
        ],
        explain: [
          '避险规则触发：现金份额 ×3，房产和金融资产的份额 ×0.7。害怕的时候，新水都往现金池流。',
          '金融资产内部也在换：股票份额 ×0.5，国债份额被放大，成了“避风港”。',
          '每个人都想先逃，合起来就是踩踏。',
        ],
        hl: ['assetReservoir'], concept: ['riskPremium', 'cashAsset', 'bondAsset'] },

      { type: 'reveal', title: '它的动作碰到谁', show: ['channel', 'bank', 'springs'],
        text: [
          '投资者逃向现金和国债 → 房产和股票的新水变少，价格涨不动或下跌 → 家庭的财富缩水，少花一点 → 河需求降温。',
          '同时房价下跌，银行看到抵押品变差 → 收紧审批 → 回到银行课里的圈倒着转。',
          `**国债不总是避风港**：如果同时通胀预期高于 ${p0(R('inv_riskoff', 'infl'))}（通胀型危机），国债价格会跌，避险资金改去黄金。黄金没有现金流（图里没有它的“泉水”），只靠信任。`,
        ],
        question: '想一想：为什么黄金池没有“泉水”（租金、分红、票息）？',
        answerHint: '房产有租金，股票有分红，国债有票息，它们都有“现金流”。黄金只是一块金属，什么也不产出，价格全靠大家信不信它。',
        hl: ['assetReservoir', 'bankApproval'], concept: ['assetReservoir', 'goldAsset', 'bondAsset', 'cf'] },

      { type: 'watch', title: '它的规则：看它追涨和避险', show: ['centralBank', 'ledger'], tab: 'ledger', quarters: 4, block: 'alloc',
        do: [{ reset: true }, { valve: 'policyRate', value: 0.09 }], after: [{ valve: 'policyRate', value: null }],
        text: [
          '投资者有几条规则：',
          `① **追涨**（inv_momentum）：权重随近期涨幅放大。房价或股价比一年前越高，新水越往那边流；下跌时同样反过来。`,
          `② **避险**（inv_riskoff）：风险溢价 > ${p0(R('inv_riskoff', 'rp'))} 或信贷脉冲 < ${p1(R('inv_riskoff', 'ci'))}，现金份额 ×3，房产/金融资产份额 ×0.7；国债（或通胀型危机时的黄金）份额放大。`,
          `③ **估值锚**（inv_valuation）：房价/收入比起点高出 ${p0(R('inv_valuation', 'ceil') - 1)} 以上，往回拉。另外还有股票估值、国债实际收益率、黄金信任度三条小规则。`,
          '现在央行把水价拧到 9%，信贷收缩。看流水账里“避险”出现，现金的份额升上来。',
        ],
        hl: ['assetReservoir'], concept: ['assetReservoir', 'priceToIncome', 'rentYield'] },

      { type: 'try', title: '换你来选', quarters: 4, do: [{ reset: true }],
        text: [
          '现在你是投资者。小镇复原。选“照规则”或“手动避险”，跑 4 个季度，对比新增水流进各个池子的累计量。',
        ],
        choices: [
          { label: '照规则（平时追涨）', do: [] },
          { label: '手动避险（现金和国债优先）', do: [{ action: { type: 'riskOff', on: true } }] },
        ],
        metrics: [
          { label: '累计流入房产（万元）', get: 'sum:flows.toHousing', fmt: 'n1' },
          { label: '累计流入国债（万元）', get: 'sum:flows.toBond', fmt: 'n1' },
          { label: '累计流入现金（万元）', get: 'sum:flows.toCash', fmt: 'n1' },
        ],
        baseLabel: '照规则',
        insight: '避险把新水从房产、股票挪向现金和国债。每个投资者各自理性，合起来就是资产价格的踩踏。',
        hl: ['assetReservoir'] },

      { type: 'chain', title: '投资者这一条因果链',
        text: ['投资者的整条链：不造水，只分水。点任何一环，图里对应的水管会亮。'],
        links: [
          { text: '新增的水（放贷、财政、QE）是投资者分配的原料', pipe: 'newLoans', part: 'pool', term: 'assetReservoir' },
          { text: '追涨：涨得快的池子拿到更大份额，价格被推得更高', pipe: ['toHousing', 'toEquity'], part: 'poolHousing', term: 'housePrice' },
          { text: '害怕（避险）：新水转向现金和国债；通胀型危机时转向黄金', pipe: ['toCash', 'toBond', 'toGold'], part: 'cash', term: 'riskPremium' },
          { text: '房产、股票的新水变少，价格涨不动或下跌', pipe: 'toEquity', part: 'poolEquity', term: 'equityAsset' },
          { text: '财富缩水、抵押品变差：家庭少花，银行收紧，圈倒着转', pipe: 'collateral', part: 'bank', term: 'lvr' },
        ], next: 'role-foreign' },
    ],
  }),

  /* ============================ 外国 ============================ */
  lesson({
    id: 'role-foreign', role: 'foreign',
    title: '外国：分担与要价',
    oneLine: '外国部门是个有规则的邻居：你需求太旺，它多卖给你帮你降温；你赤字大又通胀高，它就要更高的利息。',
    available: true,
    startParts: ['channel', 'government', 'household', 'iou', 'valves', 'ledger'],
    steps: [
      { type: 'intro', title: '先说结论',
        text: [
          '**外国部门是个有规则的“邻居”。本国需求冲过产能，它多卖给你，帮你分担；本国赤字大又通胀高，它就要更高的利息才肯借。**',
          '{{STEPS}}',
          '地点：5 户人家的小镇。镇外的“邻居”就是外国部门。',
        ],
        hl: ['goodsChannel'], concept: ['goodsChannel', 'interestToTax'] },

      { type: 'reveal', title: '它想要什么', show: ['channel'],
        text: ['外国部门想要：**卖得出去**（出口）、**借出去的钱有回报**（持有本国债券）。'],
        question: '想一想：本国需求太旺、国内产能不够时，邻居会怎么做？',
        answerHint: '多卖给你。部分需求外溢到海外，国内的价格压力小一点。',
        hl: ['goodsChannel'], concept: ['goodsChannel'] },

      { type: 'reveal', title: '它看得到什么，看不到什么', show: ['government'],
        text: [
          '**看得到**：本国的需求压力（需求比产能多多少）、财政赤字占 GDP 的比例、通胀。',
          '**看不到**：本国央行下一步，和国内银行、家庭的细节。',
          '**管不了**：本国的规则。外国部门只能自己决定“卖多少”和“要价多少”。',
        ],
        question: '想一想：外国能直接决定你的房贷利率吗？',
        answerHint: '不能。它只改“你借钱给它看的价格”（长端国债收益率），而房贷利率约 3/4 跟的是长债收益率，所以会间接传到你头上。',
        hl: ['cpi'], concept: ['outputGap', 'interestToTax'] },

      { type: 'reveal', title: '它的“阀门”：两条规则', show: ['bank'],
        text: [
          '外国部门在这个游戏里是个**规则 NPC**，没有你能拧的阀门。它的两条规则：',
          `① **外溢**（foreign_trade）：净出口 = 基准 − ${R('foreign_trade', 'k')} × 需求压力。需求超过产能，进口增加，部分需求外溢，缓解通胀；需求不足则净出口回升。`,
          `② **要价**（foreign_funding）：财政赤字 > ${p0(R('foreign_funding', 'def'))} GDP 且通胀 > ${p0(R('foreign_funding', 'pi'))}，长端国债期限溢价 +${p1(R('foreign_funding', 'add'))}。`,
          '现实里还有汇率、资本流动，本游戏简化了。你能做的，是拧别人的阀门，看它怎么回应。',
        ],
        question: '想一想：外国“要价”要看哪两个数？',
        answerHint: '财政赤字占 GDP 的比例，和通胀。两个同时高，债权人就觉得“借给你有风险”，要多收一点利息。',
        hl: ['goodsChannel', 'cpi'], concept: ['bondAsset', 'discountRate'] },

      { type: 'watch', title: '它的规则：需求外溢', show: ['capex', 'firm'], quarters: 3,
        do: [{ valve: 'capexMult', value: 1.3 }], after: [{ valve: 'capexMult', value: null }],
        text: [
          '我们先让小卖部老板们猛投 Capex（上一课学过）：需求压力当季冲高。',
          '外国的“外溢”规则读的就是这个数：需求越冲过产能，进口越多，净出口越低，一部分需求流到海外，本国的压力小一点。',
          '（模型里这条规则没有单独的水管，效果混在河的需求压力里。）',
        ],
        metrics: [{ label: '需求压力', get: 'macro.demandPressure', fmt: 'pct' }, { label: '通胀', get: 'macro.inflation', fmt: 'pct' }],
        hl: ['goodsChannel', 'cpi'], concept: ['outputGap', 'goodsChannel'] },

      { type: 'predict', title: '猜一猜', show: ['ledger', 'interest'], tab: 'ledger', quarters: 4,
        do: [{ reset: true }, { valve: 'fiscalInjection', value: 0.12 }], after: [{ valve: 'fiscalInjection', value: null }],
        q: '现在让镇政府大幅多花（赤字很大），物价也被推高。接下来 4 个季度，外国债权人要“要价”，长期国债收益率会怎样？',
        options: [
          { t: '上升：要求更高的期限溢价', ok: true },
          { t: '不变', ok: false },
          { t: '下降：外国更愿意买', ok: false },
        ],
        explain: [
          '赤字占 GDP 超过 5%、通胀又高于 3% 的时候，“要价”规则触发：期限溢价 +0.5 个点。',
          '长端国债收益率上升，新房贷利率也跟着上升（房贷利率里约 3/4 跟长债），家庭付息变重，政府的利息负担也加重。',
        ],
        metrics: [{ label: '长期国债收益率', get: 'rates.gov10y', fmt: 'pct' }, { label: '新房贷利率', get: 'rates.mortgageNew', fmt: 'pct' }, { label: '通胀', get: 'macro.inflation', fmt: 'pct' }],
        hl: ['fiscalInjection'], concept: ['bondAsset', 'mortgageEff', 'interestToTax'] },

      { type: 'reveal', title: '它的动作碰到谁', show: ['household', 'poolBond'],
        text: [
          '外国要价 → 长端国债收益率上升 → 国债价格下跌（债池水位降）→ 新房贷利率上升 → 家庭付息变重，政府的利息负担也加重。',
          '看这个：新房贷利率比政策利率更先被长债推高。',
          '外溢帮本国降通胀；要价让借钱变贵。外国部门不改本国的规则，却让本国的约束更硬。',
        ],
        question: '想一想：外国要价，对政府意味着什么？',
        answerHint: '政府的利息占税收的比例上升。比例太高时，政府的“紧缩”规则会被触发，只好少花钱。',
        hl: ['interestPaid', 'policyRate'], concept: ['bondAsset', 'mortgageEff', 'interestToTax'] },

      { type: 'try', title: '换你来选', quarters: 6, do: [{ reset: true }, { valve: 'fiscalInjection', value: 0.12 }],
        text: [
          '外国部门暂时不能接管，但你可以关掉它的一条规则。小镇复原，让政府大幅多花，再选一个方案跑 6 个季度。',
        ],
        choices: [
          { label: '照规则（外国要价）', do: [] },
          { label: '外国不要价（关掉“要价”规则）', do: [{ rule: 'foreign_funding', on: false }] },
        ],
        metrics: [
          { label: '长期国债收益率峰值', get: 'max:rates.gov10y', fmt: 'pct' },
          { label: '新房贷利率峰值', get: 'max:rates.mortgageNew', fmt: 'pct' },
          { label: '通胀峰值', get: 'max:macro.inflation', fmt: 'pct' },
        ],
        baseLabel: '照规则',
        insight: '要价让借钱变贵，传到房贷利率；它不改通胀的来源（政府多花钱）。外国部门不改本国的规则，却让本国的约束更硬。',
        hl: ['goodsChannel', 'cpi'] },

      { type: 'chain', title: '外国这一条因果链',
        text: ['外国部门的整条链：分担，也要价。点任何一环，图里对应的水管会亮。'],
        links: [
          { text: '本国需求冲过产能：河里的需求压力变高', part: 'channel', term: 'outputGap' },
          { text: '外溢：进口增加，净出口下降，一部分需求流到海外', pipe: 'spillToGoods', part: 'channel', term: 'goodsChannel' },
          { text: '本国的压力小一点，通胀缓和', part: 'channel', hl: ['cpi'], term: 'cpi' },
          { text: '赤字大 + 通胀高：外国债权人要求更高的期限溢价（要价）', pipe: 'fiscalInjection', part: 'government', term: 'bondAsset' },
          { text: '长端国债收益率上升 → 新房贷利率上升 → 家庭和政府的利息变重', pipe: 'interestPaid', part: 'poolBond', term: 'interestToTax' },
        ], next: 1 },
    ],
  }),
];

export const ROLE_LESSON_BY_ID = Object.fromEntries(ROLE_LESSONS.map(l => [l.id, l]));
