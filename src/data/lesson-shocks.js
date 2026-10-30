// Course v3 lesson L2 「是水的问题还是河道的问题？」 (tools/DESIGN-v3.md course outline, rewritten 2026-10-30 to the v3 rules: one question,
// one new piece = the 测流断面 (layer L-channel), one example = 2021 水多了 vs 2022 能源河道变窄, 6 steps incl. the intro, the 三问 ending).
// Right after L1 钱从哪来. It absorbs the old optional lesson 「Capex 与产能」 (step 4 runs on the sim). Shape = the entries of LESSONS in
// src/data/lessons.js; the orchestrator registers it (do not import lessons.js from here). Contract: tools/D-CONTRACT.md, section 「冲击」.
// The panels shk-lines / shk-parts stay in src/ui/shock-lab.js (cards, demo page) but no step of the v3 lesson mounts them.
//
// Extra fields used here:
//   kind:'shocks'               own checker (tools/check_lesson_shocks.mjs). Numbers are typed in the text, each backed by `nums`.
//   step.panel { id, ... }      the runner calls mountShockPanel(host, step.panel) from src/ui/shock-lab.js on entry, unmountShockPanel() on leave
//                               ids: shk-rule (the four corners + six parts), shk-quad (the event quadrant; group, select), shk-lines (三条线:
//                               temporary vs permanent), shk-parts (the event x part table). Every panel opens an event card on tap.
//   step 4 (Capex)              a normal sim step: reveal from 2020Q4 to 2023Q4 with vals / claims, as the cycle lessons (check_lessons format)
//   last step `ending`          the fixed 三问 block { q1, q2, q3 } (one line each, answered for this lesson's example, 2021 vs 2022)
// Never shown to the learner, only read by tools/check_lesson_shocks.mjs:
//   step.nums / card.nums [{ t, f, fmt }]   every number typed in the text: f(D) recomputes it from the raw data; fmt(f(D)) must equal t.
//                               Allowed without an entry: years, quarters (2020Q4), N 月, 第 N 步/课, 下面分 N 步, B1/B2, {placeholders}.
//   step.facts / card.facts [{ f, note }]   non-numeric claims (a direction, "the highest year"): f(D) must be true.
//   D = { pt(id,y) -> {x,dy,gr,pi,u}, ev(id) -> {g,base,trend}, us(k,y) k = gr|pi|u, cpiNsa('YYYY-MM'), weo(iso,ind,y), jst(iso,col,y),
//         waves(iso,a,b) average growth % from src/data/waves.js, capexLag (US history mode, from src/engine/economy.js) }
//   (all recomputed by the checker from the raw files; shock-events.js must match them)
// fmt: n0 n1 (decimals), a1 (absolute value, 1 decimal), int, pct0 (x100).

/* ---------- the six parts an event can hit (columns of the shk-parts table; card rows) ---------- */
export const SHOCK_PARTS = [
  { k: 'width',  name: '断面宽度', sub: '产能：一季最多能运出多少东西' },
  { k: 'water',  name: '水',       sub: '需求：抽水和回灌' },
  { k: 'pool',   name: '资产池',   sub: '湖边的房、股、债' },
  { k: 'debt',   name: '债务',     sub: '地下水位：欠得越多越低' },
  { k: 'border', name: '闸（国境）', sub: '关税、贸易条件' },
  { k: 'mood',   name: '预期和信心', sub: '大家以为会怎样' },
];

// the four corners of the quadrant (x = GDP vs its old trend, y = inflation vs the base year)
export const SHOCK_CORNERS = {
  ru: { name: '水多了', kind: 'water', note: '流量和水位一起往上：需求' },
  ld: { name: '水少了', kind: 'water', note: '一起往下：需求' },
  lu: { name: '河道变窄', kind: 'channel', note: '流量往下、断面水位往上：供给（断面宽度变小）' },
  rd: { name: '河道变宽', kind: 'channel', note: '流量往上、断面水位往下：供给（断面宽度变大）' },
};
export const SHOCK_GROUPS = { modern: '1964 年以后', war: '1915–1948：战争和大萧条' };

/* ---------- the event cards (all drawn ones have trajectories in src/data/shock-events.js; the rest are cards only) ----------
 * card = { id, name, when, where, kind: 'water'|'channel'|'both', one (conclusion), hit: [{ k, s: +1|-1, lab, w: 1..3 (how hard), t }],
 *          policy, ring, data (the numbers; null for a card without data), judge (the mapping is a judgement), nums, facts }
 * Every `hit` is a judgement (the card says 判断); the trajectory on the quadrant is data. */
export const SHOCK_CARDS = [
  { id: 'ww1', name: '第一次世界大战', when: '1915–1922', where: '美国', kind: 'both',
    one: '河道变窄 + 大灌水 → 通胀；战后急收水 → 1921 年通缩。',
    hit: [{ k: 'width', s: -1, lab: '窄·临时', w: 2, t: '工厂和人手转去造军火、运往欧洲' }, { k: 'water', s: 1, lab: '多', w: 3, t: '政府借钱打仗，新成立的美联储帮着放水' },
      { k: 'debt', s: 1, lab: '加', w: 2, t: '战争国债' }, { k: 'border', s: 1, lab: '出口猛增', w: 1, t: '欧洲买美国的货' }],
    policy: '1920 年美联储大幅加息收水。', ring: '战时灌水 → 1920–1921 急刹：短而深的通缩。债不算高，很快恢复。',
    data: '1917–1920 年每年通胀 14.6%–18.0%；1921 年物价跌 10.5%，失业率 11.7%。',
    nums: [{ t: '14.6', f: D => Math.min(...[1917, 1918, 1919, 1920].map(y => D.us('pi', y))), fmt: 'n1' }, { t: '18.0', f: D => Math.max(...[1917, 1918, 1919, 1920].map(y => D.us('pi', y))), fmt: 'n1' },
      { t: '10.5', f: D => -D.us('pi', 1921), fmt: 'n1' }, { t: '11.7', f: D => D.us('u', 1921), fmt: 'n1' }] },

  { id: 'gd', name: '大萧条', when: '1929–1933', where: '美国', kind: 'water',
    one: '水被毁掉：银行成批倒闭，存款（水）跟着消失；关税又把过境的闸收窄。GDP 和物价一起往左下 → 水的问题，B2。',
    hit: [{ k: 'water', s: -1, lab: '少', w: 3, t: '银行倒闭，存款消失' }, { k: 'pool', s: -1, lab: '缩', w: 3, t: '股市崩，房价跌' },
      { k: 'debt', s: 1, lab: '变重', w: 3, t: '物价跌，同样的债越来越难还' }, { k: 'border', s: -1, lab: '窄', w: 1, t: '1930 年加关税，各国报复' }, { k: 'mood', s: -1, lab: '怕了', w: 2, t: '挤兑：人人去银行取钱' }],
    policy: '美联储没救银行，还守着金本位；1933 年放弃金本位、建存款保险，才止住。', ring: 'B2 跌破吸程线 → ⑤ 私人去杠杆，那时没有 ⑥ 及时补水。',
    data: '1933 年 GDP 比旧趋势线低 37.7%；1931、1932 年物价每年跌约 9%–10%；1933 年失业率 24.9%。',
    nums: [{ t: '37.7', f: D => -D.pt('gd', 1933).x, fmt: 'n1' }, { t: '9', f: D => -D.us('pi', 1931), fmt: 'n0' }, { t: '10', f: D => -D.us('pi', 1932), fmt: 'n0' }, { t: '24.9', f: D => D.us('u', 1933), fmt: 'n1' }] },

  { id: 'r37', name: '1937 年过早收水', when: '1936–1938', where: '美国', kind: 'water',
    one: '水抽得太早：刚恢复，财政就收紧、美联储提高准备金，1938 年又掉下去（左下那一段）。',
    hit: [{ k: 'water', s: -1, lab: '少', w: 3, t: '财政收紧 + 银行要多存准备金' }, { k: 'mood', s: -1, lab: '怕了', w: 1, t: '股市又跌' }],
    policy: '1938 年重新放水：政府加开支，放松准备金。', ring: '⑥ 政府补水做到一半就撤，退回 ⑤。',
    data: '1938 年 GDP 比一年前 −4.0%，物价 −2.1%；失业率从 14.3% 回到 19.0%。',
    nums: [{ t: '-4.0', f: D => D.us('gr', 1938), fmt: 'n1' }, { t: '-2.1', f: D => D.us('pi', 1938), fmt: 'n1' }, { t: '14.3', f: D => D.us('u', 1937), fmt: 'n1' }, { t: '19.0', f: D => D.us('u', 1938), fmt: 'n1' }] },

  { id: 'ww2', name: '第二次世界大战', when: '1940–1948', where: '美国', kind: 'both',
    one: '民用河道改成军用，政府大灌水；价格管制把水位按住，1946 年一放开就冲上来 → 之后靠 ⑦ 慢慢化债。',
    hit: [{ k: 'width', s: -1, lab: '民用窄·临时', w: 3, t: '汽车厂造坦克，民用品配给' }, { k: 'water', s: 1, lab: '多', w: 3, t: '政府借钱打仗' },
      { k: 'debt', s: 1, lab: '加', w: 3, t: '国债猛增' }, { k: 'mood', s: 1, lab: '被按住', w: 2, t: '价格管制 + 配给：钱只能存着' }],
    policy: '1942–1946 年价格管制和配给；美联储把国债利率钉在低位，到 1951 年才放手。', ring: '⑥ 政府灌水 → ⑦ 金融压制：通胀高、利率被钉住，实际利率为负，债务自己变轻。',
    data: '国债从 GDP 的 42% 升到 119%（1940 → 1946）。通胀 1942 年 10.9%，管制下 1944 年 1.7%，1946 年 8.3%，1947 年 14.4%。',
    nums: [{ t: '42', f: D => D.jst('USA', 'debtgdp', 1940), fmt: 'pct0' }, { t: '119', f: D => D.jst('USA', 'debtgdp', 1946), fmt: 'pct0' },
      { t: '10.9', f: D => D.us('pi', 1942), fmt: 'n1' }, { t: '1.7', f: D => D.us('pi', 1944), fmt: 'n1' }, { t: '8.3', f: D => D.us('pi', 1946), fmt: 'n1' }, { t: '14.4', f: D => D.us('pi', 1947), fmt: 'n1' }] },

  { id: 'b1', name: '越战和大社会：B1 溢出', when: '1964–1973', where: '美国', kind: 'water',
    one: '水多了：打仗 + 社会开支 + 宽松的钱，GDP 跑在趋势线上方，通胀一年比一年高 → 右上。',
    hit: [{ k: 'water', s: 1, lab: '多', w: 3, t: '财政和货币一起放水' }, { k: 'mood', s: -1, lab: '预期松了', w: 2, t: '大家开始习惯物价年年涨' }, { k: 'border', s: -1, lab: '美元脱钩', w: 1, t: '1971 年美元和黄金脱钩' }],
    policy: '美联储走走停停：加一点又停；1971 年冻结工资和物价。', ring: '② 逼近吸程线（湖满） → B1 溢出；反复溢出就成了 1966–1982 年的 ⑦ + B1 长通胀。',
    data: '通胀 1964 年 1.3%，1969 年 5.4%；1973 年 GDP 比旧趋势线高 3.2%，通胀 6.3%。',
    nums: [{ t: '1.3', f: D => D.us('pi', 1964), fmt: 'n1' }, { t: '5.4', f: D => D.us('pi', 1969), fmt: 'n1' }, { t: '3.2', f: D => D.pt('b1', 1973).x, fmt: 'n1' }, { t: '6.3', f: D => D.us('pi', 1973), fmt: 'n1' }],
    facts: [{ f: D => [1965, 1966, 1967, 1968, 1969, 1970, 1971, 1972, 1973].every(y => D.pt('b1', y).x > 0 && D.pt('b1', y).dy > 0), note: '1965–1973 年每年都在右上格（GDP 在旧趋势线上方，通胀比 1964 年高）' }] },

  { id: 'oil73', name: '第一次石油冲击', when: '1973–1975', where: '美国', kind: 'channel',
    one: '能源这段河道一下子变窄，前面的水还没退 → 左上，严重滞胀。',
    hit: [{ k: 'width', s: -1, lab: '窄·临时', w: 3, t: '石油禁运，油价翻了几倍' }, { k: 'border', s: -1, lab: '贸易条件变坏', w: 2, t: '进口的油贵了' },
      { k: 'water', s: 1, lab: '还多', w: 2, t: 'B1 那几年的水' }, { k: 'mood', s: -1, lab: '预期松了', w: 2, t: '工资跟着物价要涨' }],
    policy: '美联储先加息，1974–1975 衰退时又急着降息：通胀没压住。', ring: 'B1 + 河道变窄 → 小周期 收紧·衰退。',
    data: '1974 年通胀 11.0%（1973 年 6.3%）；1975 年 GDP 比旧趋势线低 8.9%，失业率 8.5%。',
    nums: [{ t: '11.0', f: D => D.us('pi', 1974), fmt: 'n1' }, { t: '6.3', f: D => D.us('pi', 1973), fmt: 'n1' }, { t: '8.9', f: D => -D.pt('oil73', 1975).x, fmt: 'n1' }, { t: '8.5', f: D => D.us('u', 1975), fmt: 'n1' }] },

  { id: 'oil79', name: '第二次石油冲击', when: '1978–1980', where: '美国', kind: 'channel',
    one: '伊朗革命：河道再窄一次，而预期早就松了 → 左上，通胀到顶。',
    hit: [{ k: 'width', s: -1, lab: '窄·临时', w: 3, t: '油价又翻倍' }, { k: 'mood', s: -1, lab: '预期松了', w: 3, t: '人人都以为物价会一直涨' }, { k: 'water', s: 1, lab: '多', w: 1, t: '利率低于通胀' }],
    policy: '1979 年 10 月起沃尔克狠狠加息（见卡片：沃尔克收水）。', ring: '⑦ + B1 长通胀的顶点。',
    data: '1980 年通胀 13.5%，GDP 比旧趋势线低 3.4%。',
    nums: [{ t: '13.5', f: D => D.us('pi', 1980), fmt: 'n1' }, { t: '3.4', f: D => -D.pt('oil79', 1980).x, fmt: 'n1' }],
    facts: [{ f: D => { for (let y = 1948; y <= 2025; y++) if (D.us('pi', y) > D.us('pi', 1980)) return false; return true; }, note: '1980 年是 1948 年以来通胀最高的一年' }] },

  { id: 'volcker', name: '沃尔克收水', when: '1980–1983', where: '美国', kind: 'water',
    one: '央行狠狠收水：利率加得很高，1981–1982 年衰退 → 左下。预期重新被锚住。',
    hit: [{ k: 'water', s: -1, lab: '少', w: 3, t: '利率加得比通胀还高' }, { k: 'mood', s: 1, lab: '重新锚住', w: 3, t: '大家相信央行这次是真的' }],
    policy: '高利率一直撑到通胀下来；代价是两次衰退。', ring: '小周期 收紧·衰退；结束了 1966–1982 年的 ⑦ + B1。',
    data: '通胀从 1980 年的 13.5% 降到 1983 年的 3.2%；1982 年失业率 9.7%。',
    nums: [{ t: '13.5', f: D => D.us('pi', 1980), fmt: 'n1' }, { t: '3.2', f: D => D.us('pi', 1983), fmt: 'n1' }, { t: '9.7', f: D => D.us('u', 1982), fmt: 'n1' }] },

  { id: 'net', name: '互联网', when: '1995–2000', where: '美国', kind: 'channel',
    one: '河道变宽：电脑和互联网让每个人做得更多，GDP 跑到趋势线上方，通胀反而降 → 右下。',
    hit: [{ k: 'width', s: 1, lab: '宽·永久', w: 3, t: '一小时能做的事变多' }, { k: 'pool', s: 1, lab: '涨', w: 2, t: '科技股越涨越疯' }, { k: 'water', s: 1, lab: '后来多了', w: 1, t: '1999–2000 年泡沫' }],
    policy: '美联储没急着加息，赌生产率真的变快；1999–2000 年才加息。', ring: '小周期 扩张；2000 年到顶，接 收紧（主线后面讲这个顶）。',
    data: '1999 年 GDP 比旧趋势线高 5.7%；通胀从 1995 年 2.8% 降到 1998 年 1.5%，2000 年回到 3.4%。',
    nums: [{ t: '5.7', f: D => D.pt('net', 1999).x, fmt: 'n1' }, { t: '2.8', f: D => D.us('pi', 1995), fmt: 'n1' }, { t: '1.5', f: D => D.us('pi', 1998), fmt: 'n1' }, { t: '3.4', f: D => D.us('pi', 2000), fmt: 'n1' }] },

  { id: 'wto', name: '中国入世', when: '2001 起', where: '全世界', kind: 'channel',
    one: '全世界的河道一下子变宽：中国的工厂接进来，东西变便宜，全球通胀低；省下的钱流进资产池，把它灌满。',
    hit: [{ k: 'width', s: 1, lab: '全球变宽', w: 3, t: '几亿人进了工厂' }, { k: 'border', s: 1, lab: '宽', w: 3, t: '关税降、订单涌进中国' },
      { k: 'pool', s: 1, lab: '灌满', w: 2, t: '中国的美元回流买美国国债，利率低' }, { k: 'debt', s: 1, lab: '加', w: 1, t: '利率低，债越堆越高' }],
    policy: '各国央行看到通胀低，利率可以长期偏低。', ring: '① 堆债 → ② 逼近吸程线（湖满）：低通胀让 2000 年代的债越堆越高。',
    data: null },

  { id: 'mining', name: '澳洲矿业繁荣', when: '2003–2011', where: '澳洲', kind: 'water',
    one: '闸外来的好消息：铁矿石涨价（贸易条件变好），外面的钱流进澳洲 = 水多了；人手、港口跟不上，物价被推高。',
    hit: [{ k: 'border', s: 1, lab: '贸易条件变好', w: 3, t: '铁矿石、煤卖得贵' }, { k: 'water', s: 1, lab: '多', w: 2, t: '矿业收入和投资' }, { k: 'width', s: 1, lab: '慢慢变宽', w: 1, t: '新矿山、新港口要好几年' }],
    policy: '澳联储 2007–2008 年加息；澳元变强也帮着降温（见汇率课）。', ring: '澳洲小周期 过热·物价。',
    data: '2008 年澳洲通胀 4.3%（2007 年 2.4%）。',
    nums: [{ t: '4.3', f: D => D.weo('AUS', 'PCPIPCH', 2008), fmt: 'n1' }, { t: '2.4', f: D => D.weo('AUS', 'PCPIPCH', 2007), fmt: 'n1' }] },

  { id: 'gfc', name: '2008 金融危机', when: '2007–2010', where: '美国', kind: 'water',
    one: '水被毁掉：房价跌、抵押品缩水，银行收闸 → 左下。2008 年先往左上一小段：那年油价冲到顶。',
    hit: [{ k: 'water', s: -1, lab: '少', w: 3, t: '银行收闸，大家只还不借' }, { k: 'pool', s: -1, lab: '缩', w: 3, t: '房价跌，股市腰斩' },
      { k: 'debt', s: 1, lab: '太重', w: 3, t: '家庭的房贷还不动' }, { k: 'mood', s: -1, lab: '怕了', w: 2, t: '雷曼倒闭后人人自保' }],
    policy: '降息到零、QE、财政救助（第 5 课）。', ring: 'B2 跌破吸程线 → ⑤ 私人去杠杆 → ⑥ 政府接手。',
    data: '2009 年 GDP 比旧趋势线低 8.2%，通胀 −0.3%（2008 年 3.8%）；2010 年失业率 9.6%。',
    nums: [{ t: '8.2', f: D => -D.pt('gfc', 2009).x, fmt: 'n1' }, { t: '-0.3', f: D => D.us('pi', 2009), fmt: 'n1' }, { t: '3.8', f: D => D.us('pi', 2008), fmt: 'n1' }, { t: '9.6', f: D => D.us('u', 2010), fmt: 'n1' }] },

  { id: 'covid', name: '疫情', when: '2019–2023', where: '美国', kind: 'both',
    one: '两样一起来：河道临时变窄 + 私人停水（2020 年左下），再是政府大灌水（2021 年猛地右上）。灌进来的水，远多于河道窄掉的那一块 → 物价冲高。',
    hit: [{ k: 'width', s: -1, lab: '窄·临时', w: 2, t: '封城，供应链断' }, { k: 'water', s: 1, lab: '先少后多', w: 3, t: '私人停水，政府发钱灌水' },
      { k: 'debt', s: 1, lab: '政府加', w: 3, t: '政府借钱发钱' }, { k: 'pool', s: 1, lab: '涨', w: 2, t: 'QE 的水流进房和股' }],
    policy: '降息到零 + QE + 发钱；2022 年 3 月起加息。', ring: '⑥ 政府补水 → 小周期 过热·物价，叠在大周期 ⑦ 上（⑦ + B1）。',
    data: '2020 年 GDP 比旧趋势线低 4.4%，2021 年回到 −0.8%；通胀 2021 年 4.7%，2022 年全年 8.0%，2022 年 6 月比一年前 9.1%（保留样本）。',
    nums: [{ t: '4.4', f: D => -D.pt('covid', 2020).x, fmt: 'n1' }, { t: '-0.8', f: D => D.pt('covid', 2021).x, fmt: 'n1' }, { t: '4.7', f: D => D.us('pi', 2021), fmt: 'n1' },
      { t: '8.0', f: D => D.us('pi', 2022), fmt: 'n1' }, { t: '9.1', f: D => D.cpiNsa('2022-06'), fmt: 'n1' }],
    facts: [{ f: D => { let m = -1e9, at = ''; for (const mm of D.cpiMonths('2021-01', '2023-12')) { const v = D.cpiNsa(mm); if (v > m) { m = v; at = mm; } } return at === '2022-06'; }, note: '2022 年 6 月是这一轮 CPI 比一年前涨得最多的月份' }] },

  { id: 'ukr', name: '乌克兰战争：能源', when: '2021–2024', where: '德国', kind: 'channel',
    one: '能源河道变窄：俄罗斯断气，电价暴涨 → 2022 年几乎垂直往上；2023 年加息收水 → 往左下。',
    hit: [{ k: 'width', s: -1, lab: '窄·临时', w: 3, t: '天然气断供' }, { k: 'border', s: -1, lab: '贸易条件变坏', w: 3, t: '进口能源贵了' }, { k: 'water', s: -1, lab: '后来少', w: 2, t: '2023 年加息' }],
    policy: '欧洲央行 2022 年 7 月起加息；政府补贴电费（又加了点水）。', ring: '小周期 过热·物价 → 收紧。',
    data: '德国通胀 2021 年 3.2%，2022 年 8.7%；GDP 2022 年 +1.9%，2023 年 −1.0%（保留样本）。',
    nums: [{ t: '3.2', f: D => D.weo('DEU', 'PCPIPCH', 2021), fmt: 'n1' }, { t: '8.7', f: D => D.weo('DEU', 'PCPIPCH', 2022), fmt: 'n1' }, { t: '1.9', f: D => D.weo('DEU', 'NGDP_RPCH', 2022), fmt: 'n1' }, { t: '-1.0', f: D => D.weo('DEU', 'NGDP_RPCH', 2023), fmt: 'n1' }] },

  { id: 'tariff', name: '关税', when: '2018、2025', where: '美国', kind: 'channel',
    one: '进口那根水管变窄 = 自家河道变窄：东西贵一点、少一点 → 轻微滞胀。年度数据里看不出干净的信号。',
    hit: [{ k: 'border', s: -1, lab: '窄', w: 3, t: '进口要多交税' }, { k: 'width', s: -1, lab: '窄一点', w: 1, t: '零件贵了、断了' }, { k: 'mood', s: -1, lab: '观望', w: 2, t: '企业不敢投资' }],
    policy: '央行一般「看穿」一次性的涨价，除非预期松动。', ring: '小周期里多一点通胀压力，不改变大周期。',
    data: null },

  { id: 'mig', name: '澳洲移民潮', when: '2023', where: '澳洲', kind: 'both',
    one: '人一下子多了：劳动力的河道变宽；可新来的人也要租房、吃饭 → 水也多了，房租先涨。',
    hit: [{ k: 'width', s: 1, lab: '劳动力宽', w: 2, t: '更多人干活' }, { k: 'water', s: 1, lab: '多', w: 2, t: '更多人花钱' }, { k: 'pool', s: 1, lab: '房租涨', w: 2, t: '房子一时盖不出来' }],
    policy: '澳联储 2022–2023 年加息。', ring: '澳洲小周期 收紧。',
    data: null },

  { id: 'jpn', name: '日本老龄化', when: '1990 起', where: '日本', kind: 'channel',
    one: '人一年年变老、变少：河道永久变窄，直线的斜率变平。央行再放水也掰不回来。',
    hit: [{ k: 'width', s: -1, lab: '窄·永久', w: 3, t: '干活的人变少' }, { k: 'water', s: -1, lab: '少', w: 2, t: '老人花得少' }, { k: 'debt', s: 1, lab: '政府加', w: 2, t: '养老、医疗靠借钱' }],
    policy: '零利率 + QE 几十年。', ring: '⑧ 修复之后：直线本身变平（看「临时还是永久」那张图）。',
    data: '日本实际 GDP 平均每年：1956–1973 年 9.5%，1973–1990 年 3.7%，1990–2022 年 0.8%（最后一年是保留样本）。',
    nums: [{ t: '9.5', f: D => D.waves('JPN', 1956, 1973), fmt: 'n1' }, { t: '3.7', f: D => D.waves('JPN', 1973, 1990), fmt: 'n1' }, { t: '0.8', f: D => D.waves('JPN', 1990, 2022), fmt: 'n1' }] },

  { id: 'ai', name: 'AI', when: '现在', where: '美国', kind: 'water',
    one: '先是水，后是河道：现在是大量投资（数据中心、芯片）= 水；等它真变成生产率，河道才变宽。',
    hit: [{ k: 'water', s: 1, lab: '多', w: 3, t: 'Capex 当季就花出去' }, { k: 'pool', s: 1, lab: '涨', w: 2, t: '科技股' }, { k: 'width', s: 1, lab: '以后宽', w: 2, t: '要等它真提高生产率' }],
    policy: '央行要分清：先来的是需求，后来的才是产能。', ring: '① 扩张。',
    data: null },

  { id: 'chn', name: '中国现在', when: '2019–2025', where: '中国', kind: 'water',
    one: '河道宽（工厂多），水不够（房地产缩水，家庭不敢花）→ 左下，物价接近零。',
    hit: [{ k: 'water', s: -1, lab: '少', w: 3, t: '家庭和企业都不借了' }, { k: 'pool', s: -1, lab: '缩', w: 3, t: '房价跌' }, { k: 'width', s: 1, lab: '宽', w: 2, t: '产能多，东西卖不掉' },
      { k: 'debt', s: 1, lab: '地方政府加', w: 2, t: '' }, { k: 'mood', s: -1, lab: '怕了', w: 2, t: '' }],
    policy: '降息、少量财政；还没大规模给家庭补水。', ring: '⑤ 降息失灵·私人去杠杆（B2 跌破吸程线，像日本 1993–1995）。',
    data: '通胀 2019 年 2.9%，2025 年 0.0%；2025 年 GDP 比 2014–2019 年的趋势线低 9.8%（保留样本）。这一项里也混着趋势本身变慢（判断）。',
    nums: [{ t: '2.9', f: D => D.weo('CHN', 'PCPIPCH', 2019), fmt: 'n1' }, { t: '0.0', f: D => D.weo('CHN', 'PCPIPCH', 2025), fmt: 'n1' }, { t: '9.8', f: D => -D.pt('chn', 2025).x, fmt: 'n1' }],
    facts: [{ f: D => D.ev('chn').trend.join() === '2014,2019', note: '中国的旧趋势用 2014–2019 年' }] },
];

/* ---------- the lesson (course v3, tools/DESIGN-v3.md: one question + one new piece + one real example, <= 6 steps, the 三问 ending) ----------
 * question  是水的问题还是河道的问题？
 * new piece the 测流断面 on the river (layer L-channel: the channel's 断面 inset, node 'section'; width = 产能, 水位 = 物价, 流量 = GDP)
 *           + Capex widens it, with a lag
 * example   2021 水多了 (US: flow and level up together) vs 2022 能源河道变窄 (US straight up, Germany flow flat / level up) */
const STEP_OUTLINE = '下面分 5 步：测流断面 → 水多了：2021 → 河道变窄：2022 → 拓宽要等：Capex → 临时还是永久：该怎么办。';

export const LESSON_SHOCKS = {
  id: 'shk', kind: 'shocks', label: '第 2 课',
  title: '是水的问题还是河道的问题？',
  oneLine: '看河上的测流断面：断面宽度 = 产能，断面水位 = 物价，流量 = GDP。流量和水位同向走 = 水的问题（需求）；反向走 = 河道的问题（供给）。只有企业投资（Capex）能拓宽断面，而且要等。',
  rulesOn: 'all',
  startDate: '2019Q1', endDate: '2023Q4', mode: 'history', available: true,
  steps: [
    { type: 'intro', title: '先说结论', panel: { id: 'shk-rule' },
      text: [
        '**结论：出事的时候，看河上的测流断面。流量（GDP）和断面水位（物价）往同一个方向走 = 水的问题（水多了或少了：需求）；往相反方向走 = 河道的问题（断面宽度 = 产能变了：供给）。只有企业投资（Capex）能把断面拓宽，而且要等。**',
        '先看图：四个格子里各画了一个小断面（把河横着切一刀看到的槽和水）。右上、左下：槽没变，水多了或少了；左上、右下：水没变，槽变窄或变宽。点一个角，看历史上哪些冲击落在那里。',
        '第 1 课看了水从哪来、在河的环上怎么转。这一课只问一个问题：**是水的问题，还是河道的问题？** 两种病的药不同：水的问题，央行收水或放水就行；河道的问题，收水、放水都只能二选一：要么保物价，要么保就业。',
        '例子只用一个：疫情之后的美国（再看一眼德国）。2021 年是水多了，2022 年是能源这一段河道变窄。',
        STEP_OUTLINE,
      ],
      hl: ['goodsChannel'], concept: ['goodsChannel'] },

    { type: 'reveal', title: '第 1 步：测流断面：宽、水位、流量', glow: { parts: ['channel'] },
      text: [
        '**结论：测流断面上有三样东西：断面宽度 = 产能，断面水位 = 物价，流量 = GDP。**',
        '先看图：河中间亮起来的那一段，右边有个小框「断面」。它是把河横着切一刀看到的样子，就像水文站的测流断面：一个槽，里面有水。',
      ],
      question: '这个断面上能读出三样东西：槽有多宽、水有多高、每季流过多少水。它们各是经济里的什么？',
      answerHint: [
        '**断面宽度 = 产能**：一季最多能运出多少东西（工厂、机器、人手）。**断面水位 = 物价**：水越满，物价涨得越快。**流量 = GDP**：一季真正运出了多少东西。',
        '水漫过河岸 = 河溢（物价涨太快）；水太浅、槽空着一大半 = 河干（工厂和人手闲着：失业）。这就是第 1 课总目标的两个扣分项。',
      ],
      relation: '于是出事时只看两样怎么一起动：水变了，水位和流量同向走；槽变了，两样反着走。下面两步，用 2021 和 2022 各看一次。',
      hl: ['capacity', 'cpi'], concept: ['capacity', 'cpi', 'outputGap'] },

    { type: 'reveal', title: '第 2 步：水多了：2021', panel: { id: 'shk-quad', group: 'modern', select: 'covid' },
      text: [
        '**结论：2021 年，流量和水位一起往上 → 水的问题：水多了。**',
        '图里是一张四格图。往右 = 流量多了（GDP 比旧趋势线高），往上 = 水位高了（通胀比起点那年高）。亮着的「疫情」线是美国，从 2019 年那一点出发，一年一个点。',
        '2020 年封城：箭头往左下，GDP 比旧趋势线低 4.4%，通胀从 1.8% 降到 1.3%。',
        '2021 年：政府发钱、央行降息到零，水一下子灌回来。箭头猛地往右上：GDP 回到只比旧趋势线低 0.8%，通胀升到 4.7%。流量和水位同向 → 槽没怎么变，是水变多了，水面快漫过河岸。',
      ],
      nums: [
        { t: '4.4', f: D => -D.pt('covid', 2020).x, fmt: 'n1' }, { t: '1.8', f: D => D.us('pi', 2019), fmt: 'n1' }, { t: '1.3', f: D => D.us('pi', 2020), fmt: 'n1' },
        { t: '0.8', f: D => -D.pt('covid', 2021).x, fmt: 'n1' }, { t: '4.7', f: D => D.us('pi', 2021), fmt: 'n1' },
      ],
      facts: [
        { f: D => D.pt('covid', 2020).x < 0 && D.pt('covid', 2020).dy < 0, note: '2020 年在左下格' },
        { f: D => D.pt('covid', 2021).x - D.pt('covid', 2020).x > 2 && D.pt('covid', 2021).dy - D.pt('covid', 2020).dy > 2, note: '2021 年那段猛地往右上（两个方向都 > 2）：同向' },
      ],
      concept: ['fiscalInjection', 'cpi'] },

    { type: 'reveal', title: '第 3 步：河道变窄：2022 石油', panel: { id: 'shk-quad', group: 'modern', select: 'ukr' },
      text: [
        '**结论：2022 年，水位还在往上冲，流量却不涨了 → 河道的问题：能源这一段断面被卡窄了。**',
        '2022 年 2 月俄乌开战，油价、天然气价格猛涨（2022 年二季度油价到了这几年的最高点）。能源是所有东西都要经过的一段河道：它一贵，运货、做货都贵，同样多的水运出的东西变少了。',
        '美国（疫情那条线）2022 年箭头几乎垂直往上：GDP 还是比旧趋势线低 0.7%，没动；通胀从 4.7% 升到全年 8.0%，6 月比一年前 9.1%。',
        '亮着的是德国，离俄罗斯的气最近：通胀从 2021 年的 3.2% 跳到 2022 年的 8.7%，GDP 只比旧趋势线高 0.6%，也几乎垂直往上。到 2023 年落在左上格：流量比旧趋势少、水位还高，反着走 = 河道变窄。',
        '2022 年起的点是保留样本（研究截止以后的数据），图上画成空心。',
      ],
      nums: [
        { t: '0.7', f: D => -D.pt('covid', 2022).x, fmt: 'n1' }, { t: '4.7', f: D => D.us('pi', 2021), fmt: 'n1' }, { t: '8.0', f: D => D.us('pi', 2022), fmt: 'n1' },
        { t: '9.1', f: D => D.cpiNsa('2022-06'), fmt: 'n1' },
        { t: '3.2', f: D => D.weo('DEU', 'PCPIPCH', 2021), fmt: 'n1' }, { t: '8.7', f: D => D.weo('DEU', 'PCPIPCH', 2022), fmt: 'n1' }, { t: '0.6', f: D => D.pt('ukr', 2022).x, fmt: 'n1' },
      ],
      facts: [
        { f: D => Math.abs(D.pt('covid', 2022).x - D.pt('covid', 2021).x) < 0.5 && D.pt('covid', 2022).dy - D.pt('covid', 2021).dy > 2, note: '美国 2022 年那段几乎垂直往上（横向 < 0.5，纵向 > 2）' },
        { f: D => Math.abs(D.pt('ukr', 2022).x) < 1 && D.pt('ukr', 2022).dy > 4, note: '德国 2022 年几乎垂直往上（横向 < 1，纵向 > 4）' },
        { f: D => D.pt('ukr', 2023).x < 0 && D.pt('ukr', 2023).dy > 0, note: '德国 2023 年落在左上格（河道变窄）' },
        { f: D => { let m = -1e9, at = ''; for (const mm of D.cpiMonths('2021-01', '2023-12')) { const v = D.cpiNsa(mm); if (v > m) { m = v; at = mm; } } return at === '2022-06'; }, note: '2022 年 6 月是这一轮 CPI 比一年前涨得最多的月份' },
      ],
      concept: ['capacity', 'cpi'] },

    // the old optional lesson 「Capex 与产能」, on the running sim (claims in the check_lessons format)
    { type: 'reveal', from: '2020Q4', until: '2023Q4', title: '第 4 步：拓宽要等：Capex', view: 'flow',
      glow: { parts: ['firm', 'capex', 'channel'], pipes: ['toCapex'] },
      text: [
        '**结论：只有企业投资（Capex）能拓宽断面，而且要等：钱当季就花出去（先是水），施工约 6 个季度以后才变成产能（断面宽度）。**',
        '切回水流图，看企业下面那根 Capex 管和河上的断面。游戏从 2020Q4 放到 2023Q4（2022 年以后是保留样本）。',
        '2021 年企业看到东西卖不过来，加大 Capex：Capex 倍数 {m0} → {m1}。',
      ],
      question: '2021 年 Capex 就加码了，为什么 2022 年水位还在涨？',
      answerHint: [
        '因为施工要时间。Capex 的钱当季就花出去，先是水（需求），把水位再推高一点；新产能要等几个季度才到货，断面才变宽。',
        '看数字：2020Q4 → 2022Q2 断面宽度（潜在产能）增加了 {c1}；2022Q2 → 2023Q4 增加了 {c2}。断面变宽的时候，通胀已经过了顶。',
      ],
      relation: '买房、买股票的水不拓宽断面，只有 Capex 能。Capex 先当水、后变河道，这个时间差就是通胀的窗口。',
      vals: [
        { key: 'c1', get: 'chg:macro.capacityPotential', fmt: 'chg1', from: '2020Q4', until: '2022Q2' },
        { key: 'c2', get: 'chg:macro.capacityPotential', fmt: 'chg1', from: '2022Q2', until: '2023Q4' },
        { key: 'm0', get: 'start:extra.capexMult', fmt: 'x2', from: '2020Q4', until: '2022Q4' }, { key: 'm1', get: 'max:extra.capexMult', fmt: 'x2', from: '2020Q4', until: '2022Q4' },
      ],
      metrics: [{ label: '断面宽度：潜在产能（十亿美元）', get: 'macro.capacityPotential', fmt: 'num' }, { label: 'Capex（十亿美元/季）', get: 'flows.toCapex', fmt: 'num' }, { label: '通胀', get: 'macro.inflation', fmt: 'pct' }],
      claims: [
        { get: 'chg:macro.capacityPotential', from: '2022Q2', until: '2023Q4', vs: { get: 'chg:macro.capacityPotential', from: '2020Q4', until: '2022Q2' }, gt: 0.003, note: '断面是后来才加速变宽的' },
        { get: 'max:extra.capexMult', from: '2020Q4', until: '2022Q4', vs: { get: 'start:extra.capexMult', from: '2020Q4', until: '2022Q4' }, gt: 0.1, note: '2021 年起 Capex 加码' },
        { get: 'argmax:macro.inflation', from: '2020Q4', until: '2023Q4', dateBetween: ['2021Q4', '2022Q4'], note: '通胀在 2022 年前后到顶（早于断面加速变宽）' },
      ],
      nums: [{ t: '6', f: D => D.capexLag, fmt: 'int' }],
      hl: ['capex', 'capacity', 'goodsChannel'], concept: ['capex', 'capacity'] },

    { type: 'reveal', title: '第 5 步：临时还是永久：该怎么办', panel: { id: 'shk-lines', iso: 'USA' }, next: 'm2',
      text: [
        '**结论：水的问题，央行收水或放水就行。河道的问题，收水压得住水位、流量掉得更多，放水保得住就业、水位更高，只能二选一；所以先分临时还是永久：临时变窄，央行一般「看穿」不管，除非大家开始以为物价会一直涨；永久变窄，放水也掰不回来。**',
        '图里是美国实际 GDP 离一条长直线多远：长直线 = 断面宽度的趋势，波浪 = 水。疫情卡窄的断面两年就松开，坑填回去了：到 2023 年美国 GDP 离 2019 年以前的旧趋势线只差 0.2%（保留样本）。',
        '点「日本：永久」：人一年年变老、变少，断面宽度的直线一次次变平，这才是永久变窄。',
        '2021–2022 年的难处：2021 年是水多了，药是收水；美联储当时以为是临时的河道变窄，可以看穿（判断），2022 年 3 月才开始加息。下一课就讲央行手里这个旋钮：它怎么让河涨落。',
      ],
      nums: [{ t: '0.2', f: D => -D.pt('covid', 2023).x, fmt: 'n1' }, { t: '9.1', f: D => D.cpiNsa('2022-06'), fmt: 'n1' }],
      facts: [
        { f: D => Math.abs(D.pt('covid', 2023).x) < 0.5, note: '临时：2023 年美国 GDP 回到旧趋势线附近' },
        { f: D => D.waves('JPN', 1956, 1973) > D.waves('JPN', 1973, 1990) && D.waves('JPN', 1973, 1990) > D.waves('JPN', 1990, 2022), note: '永久：日本的直线一次次变平' },
      ],
      // the fixed 三问 ending (tools/COURSE-V3.md), answered for this lesson's example: 2021 水多了 vs 2022 河道变窄
      ending: {
        q1: '水的问题还是河道的问题？两样都有，分两年：2021 年是水多了（流量和水位一起往上）；2022 年加上能源河道变窄（流量不动，水位冲到 6 月的 9.1%，保留样本）。',
        q2: '环上哪一步？⑥ 政府补水 → 小周期「过热·物价」，叠在大周期 ⑦ 上（判断；两个环从第 3 课起讲）。',
        q3: '谁赢谁输、钱放哪？赢的是借了固定利率债的人、手里有房和股的人、卖能源的人；输的是拿现金和长期国债的人、买能源的人。钱放实物资产，少放长期国债（判断）。',
      },
      concept: ['capacity', 'inflationExp', 'longCycle'] },
  ],
};

export default LESSON_SHOCKS;
