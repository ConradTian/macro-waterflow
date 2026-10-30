# Consistency review: lessons + concept cards (2026-10-30, read-only, after `git merge integ`)

Scope read: lessons.js main line (m1, m2, m3, m4, m5), lesson-shocks.js (shk), lesson-fx.js (fx), lesson-investor.js (inv), lesson-exp.js, lesson-now.js, concepts.js, role-cards.js, tools/DESIGN-v3.md (+ gauges.js, because inv step 1 shows it).

Reference rules (m2 第 4 步 is the canonical text):
- **吸力 / 开阀 = ▶ − ▽** (borrowing, investing, pricing assets).
- **到手实际利率 / 结账 = ▶ − ▼** (savers, ⑦, 政策灯). Engine: `rates.realPolicy = policy − inflation` = ▶ − ▼ (economy.js:964).
- **B2** = 3 conditions at once for 3 quarters in a row; cleared by 推得动. 负资产 ≠ B2.
- **湖崩·B2** = B2 confirmed (objective.js:77), not just an asset fall.

同比 / 环比: **no hits** in any lesson, concepts.js or role-cards.js. Clean.

---

## P1: 吸力 (▶ − ▽) mixed up with 到手实际利率 (▶ − ▼)

**1. src/data/concepts.js:64–75 (吸力 card)**
- Problem: the card says 吸力 = 实际利率. Its live value and `why` use `rates.realPolicy` (▶ − ▼). Example: at 2022Q4, m2 says the band (▶ − ▽) is already **blue**, but this card prints a negative 吸力 ("吸力是负的…抽水几乎白送").
- Replace:
  - short (line 64): `吸力 = ▶ − ▽（政策利率减大家心里的涨价速度）：央行手里只有这一个旋钮，它同时推两支箭——存湖划不划算、抽水贵不贵。存钱的人到手的是另一个数 ▶ − ▼（见「实际利率」）。`
  - why (line 66): `const r = s.rates?.policy - s.macro?.inflationExp;`
  - why (line 69): `` `现在 ${P(r, 2)} = 政策利率 ▶ ${P(s.rates?.policy, 2)} − 心里的涨价速度 ▽ ${P(s.macro?.inflationExp)}。${t}` ``
  - formula (line 72): `吸力（开阀）= ▶ − ▽ = 政策利率 − 通胀预期\n到手实际利率（结账）= ▶ − ▼：存钱的人看它，不是吸力\n箭头 1 …（unchanged）`
  - logic (line 74): `→ 扣掉大家心里的涨价速度 ▽，就是吸力（开阀）`
  - live (line 75): `liveFn: s => s.rates?.policy - s.macro?.inflationExp`, and drop `live: 'rates.realPolicy'`.

**2. src/data/concepts.js:146–155 (实际利率 card)**
- Problem: the card calls itself "借钱真正花多少代价：吸力旋钮的真实读数", with formula "政策利率 − 通胀（或通胀预期）". It merges 结账 into 开阀, while its live value is ▶ − ▼.
- Replace:
  - short: `到手实际利率 = ▶ − ▼（政策利率减物价比一年前）：存钱的人真正到手多少（结账）。⑦、政策灯看它；借钱、投资看吸力 ▶ − ▽（开阀）。`
  - water: `结账那一头：存在湖里的钱，扣掉 ▼ 后真正到手的利息。▼ 越高，到手越少。`
  - formula: `到手实际利率 = 政策利率 ▶ − 物价比一年前 ▼`
  - logic, first line: `存钱的人：看扣掉 ▼ 后真正到手多少；借钱、投资的人看吸力 ▶ − ▽（见「吸力」）`

**3. src/data/concepts.js:633–637 (政策灯)**
- Problem: the water text says '吸力旋钮指示灯', but m2 says 政策灯 reads 结账 (▶ − ▼).
- Replace:
  - short: `货币政策现在是松还是紧（看到手实际利率 ▶ − ▼，结账）。`
  - water: `结账读数指示灯：▶ − ▼ 离中性多远。`

**4. src/data/lesson-now.js:263, 270 (and fact note at 275; title at 234)**
- Problem: the band in real mode is ▶ − ▼. Line 238 says so ("叫结账读数"). But the conclusion and q3 call it "吸力贴着 0", and the step title calls it "存湖划不划算" (a 吸力 arrow).
- Replace:
  - 263: `…河偏满，结账读数（▶ − ▼）贴着 0，湖里有贵的池子。`
  - 270: `谁赢谁输、钱放哪？结账读数（▶ − ▼）贴着 0（美国 {uBand}，澳洲 {aBand}）：存现金的人大致打平；…`
  - 275 note: `结账读数贴着 0`
  - 234 title: `第 4 步：吸力尺：存钱的人到手多少（结账读数）`

**5. src/data/lesson-investor.js:115 (and 90)**
- Problem: there is now a second definition of 吸力. Line 115 says "吸力 = 开阀（10 年期 − ▽）", but m2 and the 吸力 card say 吸力 = ▶ − ▽. Line 90 says "吸力（实际利率）".
- Replace:
  - 115 title: `第 4 步：资产看长端的开阀（10 年期 − ▽）`
  - 125, first sentence, add: `第 3 课的吸力是短端 ▶ − ▽；资产的泉眼远，看同一把尺的长端：10 年期 − ▽。`
  - 90: `吸力（▶ − ▽）是正是负？`

**6. src/data/lessons.js:836 (m3 第 4 步, Volcker)**
- Problem: "到手实际利率 X（▶ − ▼），抽水极贵". 抽水贵 is the 吸力 (▶ − ▽) arrow, not 结账.
- Replace: `` `**收尾靠沃尔克：**${qd(b1.ffPk)} ▶ 拉到 ${s1(b1.ffPk.ff)}（季度平均），到手实际利率（▶ − ▼）${sp1(b1.ffPk.real)}：存钱的人第一次大赚；▶ 远高过 ▽，抽水也极贵。代价是河干：…` ``

**7. src/data/lesson-fx.js:191 (also 135, 188)**
- Problem: line 191 says "吸力该看实际利率（利率减通胀）… 两根管合起来就是实际利率的差". That defines 吸力差 as a difference of ▶ − ▼. Lines 135 and 188 say "实际利率高" without saying which one.
- Replace:
  - 191: `吸力本该是 ▶ − ▽。这里的利差只用两国政策利率 ▶ 的差（各国没有可比的 ▽，判断）；物价差（▼ 的差）放在下面那根管里。`
  - 135 / 188: `（实际利率高）` → `（▶ − ▽ 高）`

**8. src/data/gauges.js:62 (五个表, shown in inv 第 1 步)**
- Problem: the verdict says '吸力（实际利率）为正/负', but the number is ▶ − ▼.
- Replace: `'利率跑赢通胀：到手实际利率（▶ − ▼）为正，偏紧'` / `'通胀跑赢利率：到手实际利率（▶ − ▼）为负，偏松'`

**9. src/data/concepts.js:756–762 (黄金 card)**
- Problem: `why` prints `rates.realPolicy` (▶ − ▼) as the gold driver. inv 第 4 步 (lesson-investor.js:126) says the engine drives gold with 10y − ▽ and "资产不看它（结账）". Same for lesson-investor.js:24 ("只看实际利率").
- Replace:
  - 759: show `rates.gov10y − macro.inflationExp` labelled `开阀（10 年 − ▽）`.
  - 762 formula: `黄金 ≈ − 开阀（10 年 − ▽）+ 对货币信心的下降`
  - lesson-investor.js:24: `没有泉水：只看开阀（10 年 − ▽）和对货币的信心`

**10. src/data/role-cards.js:93**
- Problem: '吸力（实际利率）' is ambiguous.
- Replace: `湖里各池的资产涨幅、开阀（10 年 − ▽）`

**11. src/data/lessons.js:690 (m2 第 6 步)**
- Problem: "意外（▼ − ▽）… 第 5 课的 ⑦ 化债就靠它". But m4 (lessons.js:973) says ⑦ is decided by g − r, with 到手实际利率 < 0 only a 加分项.
- Replace: `**地下的洞**（第五处）：▼ 比 ▽ 高的那几年，意外让政府的债变轻：它是第 5 课 ⑦ 化债的帮手之一（⑦ 本身看名义增长跑赢利率）。`

**12. tools/DESIGN-v3.md:16, 48, 107**
- Problem: the glossary itself says 吸力 = "the real rate" and "吸力旋钮（…实际利率）". Line 107 says "⑦ the river grows faster than 吸力".
- Replace:
  - 16: `- **吸力 = ▶ − ▽ (开阀):** one knob held by the central bank, with two arrows: 存湖划不划算 / 抽水贵不贵. 到手实际利率 = ▶ − ▼ (结账) is a different number: savers, ⑦, 政策灯.`
  - 48: `| 政策利率 / 实际利率 | 吸力旋钮（▶ − ▽，开阀）；到手实际利率 ▶ − ▼（结账） |`
  - 107: `- ⑦ nominal growth beats the 10y rate (g − r > 0), and the gov hole stops deepening; 到手实际利率 ▶ − ▼ < 0 helps;`

## P2: B2 / 负资产 / 湖崩 definitions

**13. src/data/lessons.js:551, 554 (m1 第 5 步)**
- Problem: 湖崩 is defined as "借来的水灌大的资产湖垮掉：金融危机", i.e. an asset fall. Also, the four lamps are lit in 第 7 课 (m5), not 第 5 课.
- Replace:
  - 551: `总目标有四个扣分项：**河溢、河干、湖崩、地下太低**。第 7 课会把这四盏灯一起点亮；这一课先讲前两个，正好是一条河的两种坏天气：`
  - 554: `另外两个，**湖崩**（大周期确认走上 B2：三条同时成立、连续 3 季；光是资产跌不算）和**地下太低**（抽得太多，利息吃掉收入），第 4 课和第 7 课再讲。`

**14. src/data/role-cards.js:112**
- Problem: 湖崩 = '金融危机（B2、环 ⑤）' is a vague "crisis".
- Replace: `R('湖崩', '大周期 B2 已确认（三条连续 3 季）或进 ⑤；光是资产跌不算（负资产 ≠ B2）')`

**15. src/data/concepts.js:87 and 675 (地下水位 + B2 short), and lessons.js:823 (m3 第 3 步 relation)**
- Problem: "降息也推不动（负资产要多、并且伤到银行才算）" makes 负资产 + bank damage a requirement. The B2 formula (concepts.js:685) and groundwater formula (concepts.js:97) say they are only 加分项, and B2 = 3 conditions × 3 quarters.
- Replace:
  - concepts.js:87 / 675, tail: `B2 = 三条同时成立、连续 3 季：房价比一年前在跌、债堆高了、降了息信贷还在缩；降息推得动就解除。负资产、银行受伤只是加分项（负资产 ≠ B2）。`
  - lessons.js:823: `负资产是 B2 的燃料，不是 B2 本身：图上的 B2 只看三条（房价在跌、债堆高、降了息信贷还在缩）连续 3 季；负资产多、银行受伤，让这三条更容易成立、更难解除。`

**16. src/data/concepts.js:99 (地下水位 logic)**
- Problem: "资产跌、负资产多、银行受伤：水位跌破吸程线（B2）" defines B2 by 负资产.
- Replace: `→ 房价在跌、债堆高、降了息信贷还在缩，三条连续 3 季：水位跌破吸程线（B2）；负资产多、银行受伤是加分项`

**17. src/data/concepts.js:684 (B2 water)**
- Problem: it opens with "湖崩了…资产池的水退了", which reads as 湖崩 = asset fall.
- Replace: `B2 确认（三条连续 3 季）：资产池的水退了，欠的一分没少，地下水位跌破吸程线，银行关泵，降息也抽不上来。光是资产跌不算 B2。`

**18. src/data/lessons.js:856 (m3 第 5 步)**
- Problem: B2 confirm is explained well, but no main-line lesson says how B2 is **cleared**.
- Add after "…圆环判成「推不动」。": `等哪天降息推得动了（信贷回正、失业率不再升），B2 才解除。`

**19. tools/DESIGN-v3.md:104**
- Problem: "B2 = the lake collapsed…" describes an asset fall.
- Replace: `- B2 = 3 conditions together for 3 quarters (house prices falling, debt high, credit shrinking after cuts); cleared by 推得动. The table is below the line; 负资产 alone ≠ B2;`

**20. src/data/concepts.js:672 (B1 logic)**
- Problem: "推得动就回到扩张（这是 B1 的常态，如 2000–03）". m3 第 2 步 says 2001 was a stock bubble that was 推得动, not a price overflow (B1).
- Replace: `→ 再降息：推得动就回到扩张（这是 B1 的常态）`

## P3: Leftover old words (live lessons)

**21. src/data/lessons.js:481, 482, 499 (m1 第 1–2 步)**
- 481: `…同时记一笔欠款：小王欠银行 50。','所以水和欠款是**一起出现**的。…`
- 482: `…每一份都要用未来的收入还（图里地下水位往下掉了一截）。`
- 499: `…这 10 万存款和对应的欠款**一起消失**。`

**22. src/data/lesson-shocks.js:83, 122 (shk, live L2)**
- Problem: "② 逼近吸程线（缓冲池满）". This bracket explains with an old word; it is not an old-name annotation, and the engine label has no 缓冲池.
- Replace: `② 逼近吸程线（湖满）`

**23. src/data/lesson-investor.js:30**
- Replace: `stage: '⑤ B2 跌破吸程线'` (缩水 = old "B2 岔路 / 缩水").

**24. src/data/lessons.js:1240 (m5 claim note, checker-only)**
- Replace: `note: '地下太低亮'`

**25. Legacy lessons (旧版课程: 0, 1–7, 3b) in lessons.js:166–288, 1346–1361, 1468, 1556–1605, 1773, 1836, 1899, 1940–2012, 2080, 2114, 2197–2245, 2336**
- Many old words: 欠条, 欠条箱, 商品河道, 缓冲池, "B2 … 缩水", "大周期的岔路".
- They are still reachable from the new menu (COURSE.legacy).
- Low priority: leave them if 旧版 is meant to be frozen; otherwise sweep with the glossary.

## P3: Numbers / claims that disagree for the same period

**26. src/data/lesson-now.js:270 vs src/data/lessons.js:1024, 1043 (m4 第 5 步)**
- Problem: m4 (2025Q4) says 政府债务/GDP rose again in 2023–25, and that this is the one reason the US cannot leave ⑦. lesson-now q3 (same quarter) says "政府的债靠名义增长慢慢变轻（⑦）".
- Replace (270, part): `政府的债：⑦ 的帮手（名义增长）还在，可政府债务/GDP 这三年又升了，所以还出不了圈（第 5 课第 5 步）。`

No other same-quarter number conflicts were found:
- AUD 2008Q2 0.94 → 2009Q1 0.66, −30%: m5 drill = inv q3; fx 第 5 步 uses 2008Q4, a different quarter.
- 2022Q4 open / real / surprise: m2 and lesson-exp read the same engine keys.
- B2 timing: pending 2008Q1, confirmed 2008Q3. m3, m5 and the B2 card agree.
