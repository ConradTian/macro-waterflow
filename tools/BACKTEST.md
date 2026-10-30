# 回测：真实数据上的表盘和灯，能不能提前看到什么

`node tools/backtest_real.mjs`（打印表格）· `node tools/backtest_real.mjs --write`（重写 `src/data/real/backtest.js` 和本文件里的表）· `node tools/check_backtest.mjs`（检查没有偷看未来、生成文件和脚本一致）。

## 先看结论（给初学者）

**一句话：表盘和灯主要是在「描述现在」。拿它们去猜之后 4 季的失业率和通胀，并不比「什么都不变」更准。** 只有两个地方带一点「提前量」，而且证据都薄。

怎么测的：站在 2000 年到 2021 年的每一季，只用那一季为止的数据，把表盘和灯重新读一遍（就像当时真的在看这个 app），再去看之后 4 季、8 季真实发生了什么。拿来比的是最笨的两种猜法：「不变」（失业率、通胀照现在）和「持续」（过去一年怎么变，下一年再变一次）。没有调任何阈值：用的就是 app 现在的规则。2022 年以后是保留样本，只报告、不拿来改任何东西。

| 读数 | 之后 4–8 季告诉你什么 | 比笨办法好吗 | 证据 |
|---|---|---|---|
| 小周期 **扩张** | 失业率继续降（美国 25 季里没有一季在之后 4 季上升） | 不比「持续」好：扩张之前失业率本来就在降 | 中 |
| 小周期 **收紧** | 美国：8 季后失业率平均高 1.6pp、通胀低 0.8pp，而收紧之前失业率还在降，这是「拐弯」的信息 | 只在 8 季、只在美国、只在方向上略好（70% 对「不变」65%）；4 季看不出来，误差反而更大；澳洲没有这个现象 | 弱–中 |
| **降息 / 推不动** | 失业率已经在升；之后怎么走不确定 | 否 | 弱 |
| **湖崩**（B2）黄 / 红 | 美国 2008：之后两年私人债务/GDP 掉 12pp、信贷存量缩 3%，方向对 | 只有一次。红灯亮时失业率已经升了 3.7pp：它是**确认**，不是预警。真正提前的是黄灯（2008Q1–Q2，之后 8 季失业率 +4.6pp） | 弱（1 次） |
| 大周期 **⑦**（增长化债） | 本该：政府债务/GDP 下降 | 否：两国进 ⑦ 后（都在 2022 年以后）债务/GDP 反而升了；⑦ 的条件也不比「过去一年在降就继续降」多知道什么 | 弱 |
| **河溢**灯（通胀离目标） | 红 / 黄通常一年内退掉 | 灯的颜色不持久：猜「一年后变绿」比猜「保持现在颜色」准（美国 67% 对 54%） | 中 |
| **河干**灯（失业高于正常） | 失业高的状态会延续 | 颜色很持久（美国 76%、澳洲 85% 一年后还是同色）；澳洲 2013–19 年的黄灯靠的是事后才定下的 u*，换成当时能算的 u* 大多是绿 | 中 |
| **衰退**（美国） | 三次衰退前 4 季内都在「收紧」 | 「收紧」亮的 26 季里只有 8 季在 4 季内进衰退（31%，平时 16%），约为平时的 2 倍；最简单的「长期利率低于政策利率」（收益率倒挂）准得多（83%）。2022–24 收紧了 10 季，没有衰退 | 弱（3 次衰退） |

为什么会这样：小周期表盘是**跟着央行走**的（2026-10-29 的设计：收紧 = 央行在一轮加息里，降息 = 央行在降），所以它本质上是「央行现在在做什么」，而央行的动作本身就是对已经发生的事的反应；「推不动」在美国 2010–2021 年是因为大周期停在 ⑥（规则：⑥ 里的降息一律算推不动），不是新证据。

样本很小：2000–2021 年 84 季，但相邻季的「之后 4 季」大部分重叠，相当于只有二十来个独立的年份、美国 3 次衰退、1 次 B2。命中率差 10 个百分点以内都当噪声看。

## Plain-English conclusions

1. **The short dial does not beat naive forecasts at 4 quarters.** For both countries in 2000–2021, the mean absolute error of the 4-quarter change in unemployment and CPI is lowest for "no change" (US u 1.11pp, AUS 0.50pp); a forecast that uses the dial's phase (the mean outcome after earlier quarters in the same phase, walk-forward) is worse (1.22 / 0.53), and the framework's pre-registered direction table hits 58% (US) / 52% (AUS) for unemployment, below plain persistence (73% / 61%).
2. **At 8 quarters, 收紧 (tightening) carries some turn information in the US.** After 收紧 quarters US unemployment was +1.59pp higher 8 quarters later (62% up) and CPI −0.81pp lower, although unemployment had been falling before. The direction table then hits 70% vs 65% for "not up" and 55% for persistence. Error size is still worse than "no change". This is the textbook monetary-policy lag, and the dial is essentially a description of the Fed's hiking round. In AUS it does not show up (+0.07pp, 47% up).
3. **B2 / 湖崩 red is confirmation, not warning.** The one US episode (B2 confirmed 2008Q3–2009Q4) was followed by private debt/GDP −12.1pp and credit −3.1% over 8 quarters (vs +2.4pp / +9.9% on average). So the direction is right, but unemployment had already risen 3.7pp when it lit. The yellow (pending) quarters 2008Q1–Q2 were the real lead (u +4.6pp over the next 8 quarters). One episode is not statistical evidence. AUS never confirmed B2 (yellow 2008Q4, 2009Q1, 2012Q3; mild deleveraging after).
4. **⑦ did not precede falling government debt/GDP.** There is no ⑦ in 2000–2021. In the held-out years it was followed by rising debt/GDP (US: +1.6pp over 4 quarters, and no ⑦ quarter was followed by a fall over 8 quarters; AUS: +0.9pp over 4 quarters, and no fall over 4 or 8 quarters). In-sample, the ⑦ gate condition (g − r ≥ 0 and debt/GDP not up over a year) predicts "not up next year" no better than the persistence condition alone (AUS 77% vs 78%; US 18% vs 19%).
5. **Lamps are thermometers.** 河溢 (inflation off target) is not persistent: "green in a year" beats "same colour" (US 67% vs 54%, AUS 73% vs 56%), and a red lamp's deviation shrinks about 1.7–2.8pp over the next year. 河干 (unemployment above normal) is persistent (US 76%, AUS 85% same colour a year later). A trend extrapolation adds little.
6. **Recessions (US, NBER): the dial is roughly 2x the base rate, far below the yield curve.** 收紧 at t was followed by a recession start within 0–4 quarters 31% of the time (base rate 16%). It lit before all 3 recessions (2001, 2008, 2020), but also in 18 quarters that were not followed by one, and for 10 quarters in 2022–24 with no recession. The yield curve (10y < policy rate), shown only as a reference, scores 83% with 3/3 caught. 推不动 adds nothing (20%). AUS has one recession (2020, a pandemic shock) and no dial signal before it except the 2019 rate cuts.
7. **Held-out 2022+ looks better for the dial but proves little.** The 2022–24 tightening was followed by slightly higher unemployment and lower inflation in both countries, so the phase-based forecasts beat "no change" on direction (US u 80%, AUS u 87%). But this is one episode (n = 15 overlapping quarters), and the dial rules were last redesigned on 2026-10-29/30 with 2021–26 in view (e.g. the ⑦ rule and "no 过热·物价 while the bank cuts"). It is not a clean out-of-sample test. The only clean test is going forward from today.
8. **Real-time reading changes little — with one exception.** With approximate publication lags (credit and DSR about 2 quarters late, GDP/house prices 1), the US short dial is identical in every quarter, AUS differs in 4 quarters, and the forecast tables barely move. But AUS then **confirms B2 in 2009Q2** (a false 湖崩 red): the app carries a stale input forward when a series is late, so the same old credit reading counts again and the 3-quarter streak completes. In live use, the B2 confirmation can be triggered by publication lag.

## Method

- **Readings.** The unchanged `src/data/real/real-snapshot.js` code (the same `computeLamps` / `advanceCycles` as the app) runs on a copy of the real data files cut at quarter t; the reading at t is kept. `real-snapshot.js` has no truncation option, so the script loads its source as a separate module instance with the two data imports replaced by the cut copy (`timelineOn`; the substitution throws if the file changes). Nothing in `src/` is modified.
- **Vintages.** A `cut`: data cut at t, nothing else. **B `rt` (main results)**: A plus the two inputs whose built values embed later data rebuilt one-sided (see the audit). C `lag`: B plus approximate publication lags (`LAGS` in the script: US house prices, bad loans, gov debt, deficit, interest/tax 1 quarter; households and BIS credit/DSR 2; AUS GDP, house prices, qeGdp 1; population, BIS credit, gov debt, DSR 2). The app's own carry-forward fills the missing values, as it would live. Robustness only.
- **Walk-forward from 1999Q1** (the BIS DSR starts then; before it the DSR does not exist in real time). The phase-mean forecast at t uses only readings at s and outcomes realised by t (s + h ≤ t); with fewer than 4 earlier quarters in the same phase it falls back to the mean of all realised changes ("drift").
- **Outcomes** use the final data: unemployment and CPI inflation (change in pp over 4 / 8 quarters), private non-financial credit/GDP and the credit stock (8 quarters), government debt/GDP (4 / 8 quarters).
- **Samples.** In-sample: readings 2000Q1–2021Q4 whose outcome window ends by 2021Q4 (so 2000Q1–2020Q4 for 4 quarters). Held-out: readings from 2022Q1 with outcomes up to the last real quarter (USA and AUS unemployment/CPI to 2026Q3).
- **Baselines.** "No change" (0); persistence (the last h quarters' change again); drift (mean realised change so far). Direction = "up" vs "not up" (Δ > 0); "no change" always says "not up".
- **Framework direction table** (pre-registered from the dial texts before any result was computed; `FRAMEWORK_SIGN`): 扩张 u down / π up; 过热 u up / π down; 收紧 u up / π down; 降息（推得动/未定）u down / π down; 降息·推不动 u up / π down.
- **Lamps.** 湖崩 as `objective.js` reads it in real mode (red = B2 confirmed or ⑤; yellow = B2 evidence this quarter or pending). 河溢 / 河干 with `objective.js` `lampsAt` bands on the REAL CPI and unemployment. (In real mode the app currently shows the model's 河溢 / 河干; here they are computed on real data with the same rule.) 河干 is also shown with a one-sided u* (mean unemployment over the last 10 years, data from 1995).
- **Recessions.** NBER peaks 2001-03, 2007-12, 2020-02 → first recession quarters 2001Q2, 2008Q1, 2020Q1 (listed in code; 1990–91 is before the data). A signal at t "hits" if a recession starts in t..t+4; quarters already in recession are not scored. AUS: 2020Q1–Q2 (two quarters of falling real GDP, ABS) is the only one. The yield-curve row is a reference, not part of the framework.
- **Nothing tuned.** All thresholds come from `country-params.js` / `objective.js`. Horizons 4 and 8 come from the question.

## Look-ahead audit (every input of `realSnapshot`'s lamps and dials)

The pipeline itself is causal. `check_backtest.mjs` shows that the reading at t on data cut at t equals the app's full-sample reading at t for every quarter from 1999Q1 (both countries, inputs included), and that it is unchanged when every value after t is replaced by garbage. The look-ahead sits in how a few series were **built**, in the **data vintage**, and in the **rule design**:

| Input (used by) | Built from | Look-ahead? | Treatment | Effect on readings |
|---|---|---|---|---|
| policy, dPol4, polDrop… (short dial, B2, policy lamp) | FEDFUNDS / RBA cash rate, quarterly mean | No (never revised) | — | — |
| piY (hotP, policy lamp, 河溢) | CPI vs a year earlier, quarterly mean | Tiny: US CPIAUCSL is seasonally adjusted (factors revised with later data); a year-earlier comparison mostly cancels it | Flagged | — |
| u (recess label, expand, 河干) | UNRATE / ABS LF, seasonally adjusted | Tiny (same) | Flagged | — |
| dsr, dsr0, dDsr4 (DSR lamp, hotA, B2) | BIS DSR from 1999Q1 | **Yes before 1999Q1**: the app back-fills 1995–98 with the 1999Q1 value | Vintages start at 1999Q1; the checker shows the 8 quarters 1997–98 differ, none after | None in 2000+ |
| bad (⑤, ⑧) | US DRALACBS; AUS fixed 1% | No | Publication lag in C | — |
| ci, pcg, pvt, pvtD12, pvtDD (credit lamp, ①②⑤, hotA, B2) | BIS credit stock and credit/GDP; EMA and differences are one-sided | Revisions only (final BIS vintage); the 2026Q2 tail is extended with Fed Z.1 / RBA D2 growth (one-sided, held-out only) | 2-quarter publication lag in C | C: AUS false B2 2009Q2 |
| hpYoY, hpQ, dd (B2, hotA, ①) | Case-Shiller / BIS house prices | No | 1-quarter lag in C | — |
| **PIrel** (valuation lamp, ②) | house price ÷ GDP per household (US) / per person (AUS), 1995Q1 = 1 | **Yes (US)**: annual households are placed at Q2 and linearly interpolated, so Q3–Q1 use next year's count | B: flat after the last Q2 dated ≤ t | 1 lamp in 1 quarter (US valuation lamp 2004Q3 red → yellow); no dial changes |
| peRel (valuation lamp) | US Shiller CAPE; AUS equity index / GDP | Minor: Shiller's latest months use estimated earnings, later replaced | Flagged | — |
| i2t (⑧) | NIPA federal interest / receipts | Revisions only | 1-quarter lag in C | — |
| gr (⑦) | nominal GDP over 4 quarters − 10y yield | GDP revisions | AUS GDP 1-quarter lag in C | — |
| **qeGdp** (⑥) | (central-bank assets − mean of 2007 (US) / 2019 (AUS)) ÷ GDP | **Yes** for quarters before the base year ends (US 2007Q1–Q3: 0 anyway; AUS 2016Q2–2019Q3: small positive values, up to 0.46% of GDP) | B: 0 until the base year is over | None (all below the 1% gate) |
| gov, govD12, govD4 (⑥⑦⑧) | US GFDEGDQ188S; AUS BIS | Revisions only | Lag 1 (US) / 2 (AUS) in C | — |
| defGdp (⑥) | US NIPA federal deficit; AUS 0 | Revisions only | 1-quarter lag in C | — |
| **gap** | US: CBO output gap (GDPC1 / GDPPOT − 1); AUS: one-sided HP | **Yes (US)**: CBO potential is re-estimated with hindsight and cannot be rebuilt without CBO vintages | Shown with and without: removing it changes **0** readings, because no lamp or dial reads it | None (display only) |
| u* (河干 lamp) | US 5.5% fixed; AUS path 7.1% (1995) → 4.9% (2008) → 3.9% (2023) | **Yes (AUS)**: knots set later, from RBA estimates made with hindsight | Shown next to a one-sided u* (mean over the last 10 years) | AUS 河干 yellow 2013–2019 is mostly green with the one-sided u* |
| piTarget (河溢) | US 2%, AUS 2.5% | Minor: the Fed's 2% became explicit only in 2012 | Flagged | — |
| **All thresholds** (lamps, LT/ST, b2N = 3, ⑦ rule, u* path) | `country-params.js` | **Yes, can't be removed**: chosen by people who had seen 1995–2026; the 2026-10-29/30 redesigns name US 2008, AUS 2008–09/2012 and US 2021–22 | None possible; this report evaluates them as they are | Results lean in the framework's favour, also in 2022+ |
| **Data vintage** | all series as downloaded 2026-10-30 | **Yes, can't be removed here**: GDP, credit, seasonally adjusted series are revised; no real-time vintages (ALFRED) are used | Flagged; publication lags approximated in C | Unknown, likely small for policy/CPI/u, larger for credit and GDP ratios |
| Partial quarters | US CPI/u 2025Q4, houses 2026Q3; AUS M3/D2 2026Q3 | No (2 of 3 months) | Held-out only | — |

Display-only snapshot fields (`macro.outputGap`, `capacity`, flows, assets, outlets…) do not feed any reading; the CBO gap and potential GDP there carry hindsight and should not be read as real-time values.

## Results (generated)

Vintage B (one-sided). Δ = later value − value at t, in percentage points (pp). 「上升占比」 = share of quarters where it went up. The robustness line under each sample is vintage C (publication lags).

<!-- BEGIN GENERATED TABLES (node tools/backtest_real.mjs --write) -->
### USA · 2000–2021（评估样本）

**(a) 小周期表盘档位 → 之后 4 季的变化**（失业率 u、CPI 通胀 π；「之前 4 季」= 读数之前 4 季的变化，看档位是不是只是在重复已有的趋势）

| 档位 | n | Δu 4 季 | u 上升占比 | 之前 4 季 Δu | Δπ 4 季 | π 上升占比 | 之前 4 季 Δπ | n(8 季) | Δu 8 季（上升占比） | Δπ 8 季（上升占比） |
|---|---|---|---|---|---|---|---|---|---|---|
| 扩张 | 25 | −0.75pp | 0% | −0.79pp | −0.12pp | 48% | −0.04pp | 25 | −1.43pp（0%） | −0.08pp（48%） |
| 过热 | 0 | — | — | — | — | — | — | 0 | — | — |
| 收紧 | 26 | +0.39pp | 38% | −0.38pp | +0.01pp | 50% | +0.31pp | 26 | +1.59pp（62%） | −0.81pp（23%） |
| 降息（推得动/未定） | 17 | +0.68pp | 59% | +0.54pp | −0.66pp | 53% | +0.05pp | 17 | +0.75pp（41%） | +0.15pp（65%） |
| 降息·推不动 | 16 | +0.17pp | 44% | +2.25pp | +1.20pp | 56% | −0.72pp | 12 | +0.05pp（42%） | +1.61pp（83%） |

| 预测（在 t 时只用 ≤ t 的数据） | h=4：u 误差 | u 方向命中 | π 误差 | π 方向命中 | h=8：u 误差 | u 方向命中 | π 误差 | π 方向命中 |
|---|---|---|---|---|---|---|---|---|
| 不变（0） | 1.11pp | 68% | 1.34pp | 49% | 1.65pp | 65% | 1.42pp | 51% |
| 持续（过去 h 季的变化再来一次） | 1.29pp | 73% | 2.17pp | 39% | 2.07pp | 55% | 2.46pp | 26% |
| 平均漂移（到 t 为止全部已实现变化的均值） | 1.26pp | 25% | 1.45pp | 43% | 2.04pp | 24% | 1.56pp | 44% |
| 表盘分组均值（同一档位到 t 为止已实现变化的均值） | 1.22pp | 48% | 1.51pp | 42% | 1.90pp | 41% | 1.61pp | 54% |
| 框架方向（预先写定的方向表） | — | 58% | — | 48% | — | 70% | — | 50% |

n = 84 季（h=4）/ 80 季（h=8）。误差 = 平均绝对误差；方向命中 = 预测「上升」/「不升」与实际一致的占比；「不变」= 永远猜「不升」。

**(b) 大周期：B2 / 湖崩 → 之后 8 季**

| 读数 | n | Δu 8 季 | u 上升占比 | 之前 8 季 Δu | Δ私人债务/GDP 8 季 | 之前 8 季 Δ私人债务/GDP | 信贷存量 8 季增长 | 季度 |
|---|---|---|---|---|---|---|---|---|
| B2 已确认 | 6 | +0.8pp | 50% | +3.7pp | −12.1pp | +4.3pp | -3.1% | 2008Q3 2008Q4 2009Q1 2009Q2 2009Q3 2009Q4 |
| 湖崩 红（B2 或 ⑤） | 6 | +0.8pp | 50% | +3.7pp | −12.1pp | +4.3pp | -3.1% | 2008Q3 2008Q4 2009Q1 2009Q2 2009Q3 2009Q4 |
| 湖崩 黄（B2 证据成立/待确认） | 2 | +4.6pp | 100% | +0.5pp | −5.3pp | +11.3pp | -3.2% | 2008Q1 2008Q2 |
| 湖崩 绿 | 72 | +0.1pp | 32% | −0.4pp | +3.8pp | +1.9pp | 11.4% | （多） |
| 全部 | 80 | +0.2pp | 35% | −0.1pp | +2.4pp | +2.4pp | 9.9% | （多） |

**(b) ⑦ → 政府债务/GDP 之后 4 / 8 季**

| 读数 | n | Δ债务/GDP 4 季 | 4 季不升占比 | n(8 季) | Δ债务/GDP 8 季 | 8 季不升占比 |
|---|---|---|---|---|---|---|
| ⑦ 阶段 | 0 | — | — | 0 | — | — |
| ⑦ 的条件本季成立（g−r≥0 且 债务/GDP 一年不升） | 11 | +4.3pp | 18% | 11 | +3.7pp | 0% |
| 只看持续：债务/GDP 一年不升 | 16 | +3.2pp | 19% | 16 | +3.4pp | 6% |
| 只看持续：债务/GDP 一年在升 | 68 | +3.1pp | 18% | 64 | +7.4pp | 11% |
| 全部 | 84 | +3.1pp | 18% | 80 | +6.6pp | 10% |

**(c) 灯：现在的颜色 → 4 季后的颜色**（命中率 = 猜中 4 季后颜色的占比）

| 灯 | n | 持续（= 灯本身） | 永远绿 | 趋势外推 | 绿→仍绿 | 黄→仍黄 | 红→仍红 | 红 之后偏离变化 |
|---|---|---|---|---|---|---|---|---|
| 河溢（通胀离目标多远） | 84 | 54% | 67% | 38% | 67% (n=55) | 27% (n=26) | 33% (n=3) | −1.7pp |
| 河干（失业率 − u*，app 的 u*） | 84 | 76% | 70% | 79% | 88% (n=59) | 42% (n=12) | 54% (n=13) | −1.3pp |
| 河干（u* = 过去 10 年失业率均值，单边） | 84 | 74% | 74% | 77% | 87% (n=62) | 31% (n=13) | 44% (n=9) | −1.4pp |

**(d) 衰退（NBER）：读数之后 0–4 季内开始衰退**（不计已在衰退中的季度；基准 = 任意一季之后 0–4 季内开始衰退的比例 16%，n = 73）

| 信号 | 亮的季数 | 其中 0–4 季内衰退开始 | 准确率 | 抓到的衰退（共 3） | 最早提前几季 |
|---|---|---|---|---|---|
| 收紧（任何） | 26 | 8 | 31% | 3 | 4 / 4 / 4 |
| 收紧·衰退 | 3 | 2 | 67% | 2 | 2 / 4 / — |
| 降息·推不动 | 10 | 2 | 20% | 1 | — / — / 2 |
| 收紧 或 推不动 | 36 | 10 | 28% | 3 | 4 / 4 / 4 |
| 降息（任何） | 22 | 4 | 18% | 3 | 1 / 1 / 2 |
| 参照：收益率倒挂（10 年 < 政策利率） | 12 | 10 | 83% | 3 | 4 / 4 / 3 |

- 衰退 2001Q2：之前 4 季到当季的读数：2000Q2 收紧（加息）；2000Q3 收紧（加息）；2000Q4 收紧·衰退；2001Q1 降息（推得动吗？）；2001Q2 降息（推得动吗？）

- 衰退 2008Q1：之前 4 季到当季的读数：2007Q1 收紧·衰退（接 物价过热）；2007Q2 收紧（加息）（接 物价过热）；2007Q3 收紧（加息）（接 物价过热）；2007Q4 降息（推得动吗？）（接 物价过热）；2008Q1 降息（推得动吗？）（接 物价过热）

- 衰退 2020Q1：之前 4 季到当季的读数：2019Q1 收紧（加息）；2019Q2 收紧（加息）；2019Q3 降息（推得动吗？）·推不动；2019Q4 降息（推得动吗？）·推不动；2020Q1 降息（推得动吗？）·推不动

*稳健性（发布滞后版本 C）：* u 平均误差 持续 1.29pp / 分组均值 1.22pp，方向命中 持续 73% / 框架 58%；π 平均误差 持续 2.17pp / 分组均值 1.51pp，方向命中 持续 39% / 框架 48%；衰退信号「收紧 或 推不动」亮 36 季、准确率 28%、抓到 3/3。

### USA · 2022+（保留样本，只报告）

**(a) 小周期表盘档位 → 之后 4 季的变化**（失业率 u、CPI 通胀 π；「之前 4 季」= 读数之前 4 季的变化，看档位是不是只是在重复已有的趋势）

| 档位 | n | Δu 4 季 | u 上升占比 | 之前 4 季 Δu | Δπ 4 季 | π 上升占比 | 之前 4 季 Δπ | n(8 季) | Δu 8 季（上升占比） | Δπ 8 季（上升占比） |
|---|---|---|---|---|---|---|---|---|---|---|
| 扩张 | 0 | — | — | — | — | — | — | 0 | — | — |
| 过热 | 1 | −0.33pp | 0% | −2.37pp | −2.29pp | 0% | +6.12pp | 1 | −0.03pp（0%） | −4.78pp（0%） |
| 收紧 | 10 | +0.25pp | 90% | −0.33pp | −1.89pp | 10% | −1.25pp | 10 | +0.49pp（90%） | −1.93pp（20%） |
| 降息（推得动/未定） | 4 | +0.10pp | 75% | +0.26pp | +0.72pp | 100% | −0.38pp | 0 | — | — |
| 降息·推不动 | 0 | — | — | — | — | — | — | 0 | — | — |

| 预测（在 t 时只用 ≤ t 的数据） | h=4：u 误差 | u 方向命中 | π 误差 | π 方向命中 | h=8：u 误差 | u 方向命中 | π 误差 | π 方向命中 |
|---|---|---|---|---|---|---|---|---|
| 不变（0） | 0.26pp | 20% | 1.64pp | 67% | 0.46pp | 18% | 2.53pp | 82% |
| 持续（过去 h 季的变化再来一次） | 0.64pp | 67% | 3.16pp | 47% | 2.74pp | 9% | 6.96pp | 36% |
| 平均漂移（到 t 为止全部已实现变化的均值） | 0.27pp | 13% | 1.73pp | 33% | 0.47pp | 45% | 2.73pp | 18% |
| 表盘分组均值（同一档位到 t 为止已实现变化的均值） | 0.25pp | 80% | 1.69pp | 33% | 1.01pp | 82% | 2.37pp | 73% |
| 框架方向（预先写定的方向表） | — | 67% | — | 67% | — | 82% | — | 82% |

n = 15 季（h=4）/ 11 季（h=8）。误差 = 平均绝对误差；方向命中 = 预测「上升」/「不升」与实际一致的占比；「不变」= 永远猜「不升」。

**(b) 大周期：B2 / 湖崩 → 之后 8 季**

| 读数 | n | Δu 8 季 | u 上升占比 | 之前 8 季 Δu | Δ私人债务/GDP 8 季 | 之前 8 季 Δ私人债务/GDP | 信贷存量 8 季增长 | 季度 |
|---|---|---|---|---|---|---|---|---|
| B2 已确认 | 0 | — | — | — | — | — | — | — |
| 湖崩 红（B2 或 ⑤） | 0 | — | — | — | — | — | — | — |
| 湖崩 黄（B2 证据成立/待确认） | 0 | — | — | — | — | — | — | — |
| 湖崩 绿 | 10 | +0.5pp | 90% | −2.4pp | −9.1pp | −9.4pp | 5.4% | 2022Q1 2022Q2 2022Q3 2022Q4 2023Q1 2023Q2 2023Q3 2023Q4 2024Q1 2024Q2 |
| 全部 | 10 | +0.5pp | 90% | −2.4pp | −9.1pp | −9.4pp | 5.4% | 2022Q1 2022Q2 2022Q3 2022Q4 2023Q1 2023Q2 2023Q3 2023Q4 2024Q1 2024Q2 |

**(b) ⑦ → 政府债务/GDP 之后 4 / 8 季**

| 读数 | n | Δ债务/GDP 4 季 | 4 季不升占比 | n(8 季) | Δ债务/GDP 8 季 | 8 季不升占比 |
|---|---|---|---|---|---|---|
| ⑦ 阶段 | 12 | +1.6pp | 17% | 8 | +2.6pp | 0% |
| ⑦ 的条件本季成立（g−r≥0 且 债务/GDP 一年不升） | 8 | +1.1pp | 25% | 6 | +2.0pp | 17% |
| 只看持续：债务/GDP 一年不升 | 8 | +1.1pp | 25% | 6 | +2.0pp | 17% |
| 只看持续：债务/GDP 一年在升 | 6 | +0.7pp | 33% | 4 | +2.4pp | 0% |
| 全部 | 14 | +0.9pp | 29% | 10 | +2.2pp | 10% |

**(c) 灯：现在的颜色 → 4 季后的颜色**（命中率 = 猜中 4 季后颜色的占比）

| 灯 | n | 持续（= 灯本身） | 永远绿 | 趋势外推 | 绿→仍绿 | 黄→仍黄 | 红→仍红 | 红 之后偏离变化 |
|---|---|---|---|---|---|---|---|---|
| 河溢（通胀离目标多远） | 15 | 33% | 47% | 53% | 60% (n=5) | 20% (n=5) | 20% (n=5) | −3.6pp |
| 河干（失业率 − u*，app 的 u*） | 15 | 100% | 100% | 100% | 100% (n=15) | — | — | — |
| 河干（u* = 过去 10 年失业率均值，单边） | 15 | 100% | 100% | 100% | 100% (n=15) | — | — | — |

**(d) 衰退（NBER）：读数之后 0–4 季内开始衰退**（不计已在衰退中的季度；基准 = 任意一季之后 0–4 季内开始衰退的比例 0%，n = 15）

| 信号 | 亮的季数 | 其中 0–4 季内衰退开始 | 准确率 | 抓到的衰退（共 0） | 最早提前几季 |
|---|---|---|---|---|---|
| 收紧（任何） | 10 | 0 | 0% | 0 | — |
| 收紧·衰退 | 5 | 0 | 0% | 0 | — |
| 降息·推不动 | 0 | 0 | — | 0 | — |
| 收紧 或 推不动 | 10 | 0 | 0% | 0 | — |
| 降息（任何） | 4 | 0 | 0% | 0 | — |
| 参照：收益率倒挂（10 年 < 政策利率） | 10 | 0 | 0% | 0 | — |

*稳健性（发布滞后版本 C）：* u 平均误差 持续 0.64pp / 分组均值 0.25pp，方向命中 持续 67% / 框架 67%；π 平均误差 持续 3.16pp / 分组均值 1.69pp，方向命中 持续 47% / 框架 67%；衰退信号「收紧 或 推不动」亮 10 季、准确率 0%、抓到 0/0。

**USA 版本差异（2000Q1 起）**：A（只截断）vs B（单边修正）读数不同的季度：2004Q3；B vs C（发布滞后）读数（含灯）不同 63 季，其中小周期档位不同 0 季、大周期阶段/岔路/湖崩灯不同 1 季。 B2 已确认的季度：cut 2008Q3–2009Q4（6 季）；rt 2008Q3–2009Q4（6 季）；lag 2008Q3–2009Q4（6 季）。进入 ⑦：cut 2022Q3；rt 2022Q3；lag 2022Q3。

### AUS · 2000–2021（评估样本）

**(a) 小周期表盘档位 → 之后 4 季的变化**（失业率 u、CPI 通胀 π；「之前 4 季」= 读数之前 4 季的变化，看档位是不是只是在重复已有的趋势）

| 档位 | n | Δu 4 季 | u 上升占比 | 之前 4 季 Δu | Δπ 4 季 | π 上升占比 | 之前 4 季 Δπ | n(8 季) | Δu 8 季（上升占比） | Δπ 8 季（上升占比） |
|---|---|---|---|---|---|---|---|---|---|---|
| 扩张 | 11 | −0.29pp | 27% | −0.34pp | +0.15pp | 36% | −0.36pp | 11 | −0.15pp（27%） | −0.31pp（27%） |
| 过热 | 1 | +1.68pp | 100% | −0.21pp | −1.94pp | 0% | −0.48pp | 1 | −0.02pp（0%） | +2.25pp（100%） |
| 收紧 | 30 | +0.04pp | 40% | −0.38pp | −0.25pp | 57% | +0.71pp | 30 | +0.07pp（47%） | −0.46pp（37%） |
| 降息（推得动/未定） | 42 | −0.10pp | 45% | +0.33pp | +0.04pp | 50% | −0.46pp | 38 | −0.17pp（26%） | −0.15pp（47%） |
| 降息·推不动 | 0 | — | — | — | — | — | — | 0 | — | — |

| 预测（在 t 时只用 ≤ t 的数据） | h=4：u 误差 | u 方向命中 | π 误差 | π 方向命中 | h=8：u 误差 | u 方向命中 | π 误差 | π 方向命中 |
|---|---|---|---|---|---|---|---|---|
| 不变（0） | 0.50pp | 58% | 1.11pp | 50% | 0.64pp | 66% | 0.98pp | 59% |
| 持续（过去 h 季的变化再来一次） | 0.68pp | 61% | 1.98pp | 35% | 0.88pp | 54% | 1.78pp | 35% |
| 平均漂移（到 t 为止全部已实现变化的均值） | 0.51pp | 58% | 1.27pp | 44% | 0.63pp | 66% | 1.27pp | 48% |
| 表盘分组均值（同一档位到 t 为止已实现变化的均值） | 0.53pp | 55% | 1.37pp | 42% | 0.67pp | 73% | 1.32pp | 50% |
| 框架方向（预先写定的方向表） | — | 52% | — | 46% | — | 63% | — | 53% |

n = 84 季（h=4）/ 80 季（h=8）。误差 = 平均绝对误差；方向命中 = 预测「上升」/「不升」与实际一致的占比；「不变」= 永远猜「不升」。

**(b) 大周期：B2 / 湖崩 → 之后 8 季**

| 读数 | n | Δu 8 季 | u 上升占比 | 之前 8 季 Δu | Δ私人债务/GDP 8 季 | 之前 8 季 Δ私人债务/GDP | 信贷存量 8 季增长 | 季度 |
|---|---|---|---|---|---|---|---|---|
| B2 已确认 | 0 | — | — | — | — | — | — | — |
| 湖崩 红（B2 或 ⑤） | 0 | — | — | — | — | — | — | — |
| 湖崩 黄（B2 证据成立/待确认） | 3 | +0.4pp | 67% | +0.3pp | −3.3pp | +2.9pp | 7.5% | 2008Q4 2009Q1 2012Q3 |
| 湖崩 绿 | 77 | −0.1pp | 32% | −0.2pp | +5.4pp | +6.7pp | 15.7% | （多） |
| 全部 | 80 | −0.1pp | 34% | −0.2pp | +5.1pp | +6.6pp | 15.3% | （多） |

**(b) ⑦ → 政府债务/GDP 之后 4 / 8 季**

| 读数 | n | Δ债务/GDP 4 季 | 4 季不升占比 | n(8 季) | Δ债务/GDP 8 季 | 8 季不升占比 |
|---|---|---|---|---|---|---|
| ⑦ 阶段 | 0 | — | — | 0 | — | — |
| ⑦ 的条件本季成立（g−r≥0 且 债务/GDP 一年不升） | 35 | +0.0pp | 77% | 35 | +0.9pp | 71% |
| 只看持续：债务/GDP 一年不升 | 36 | −0.1pp | 78% | 36 | +0.7pp | 72% |
| 只看持续：债务/GDP 一年在升 | 48 | +3.0pp | 13% | 44 | +5.7pp | 5% |
| 全部 | 84 | +1.7pp | 40% | 80 | +3.5pp | 35% |

**(c) 灯：现在的颜色 → 4 季后的颜色**（命中率 = 猜中 4 季后颜色的占比）

| 灯 | n | 持续（= 灯本身） | 永远绿 | 趋势外推 | 绿→仍绿 | 黄→仍黄 | 红→仍红 | 红 之后偏离变化 |
|---|---|---|---|---|---|---|---|---|
| 河溢（通胀离目标多远） | 84 | 56% | 73% | 38% | 70% (n=61) | 22% (n=18) | 0% (n=5) | −2.8pp |
| 河干（失业率 − u*，app 的 u*） | 84 | 85% | 62% | 74% | 87% (n=54) | 83% (n=29) | 0% (n=1) | −2.3pp |
| 河干（u* = 过去 10 年失业率均值，单边） | 84 | 86% | 93% | 83% | 92% (n=78) | 0% (n=6) | — | — |

**(d) 衰退（ABS 2020 两季负增长）：读数之后 0–4 季内开始衰退**（不计已在衰退中的季度；基准 = 任意一季之后 0–4 季内开始衰退的比例 5%，n = 82）

| 信号 | 亮的季数 | 其中 0–4 季内衰退开始 | 准确率 | 抓到的衰退（共 1） | 最早提前几季 |
|---|---|---|---|---|---|
| 收紧（任何） | 30 | 0 | 0% | 0 | — |
| 收紧·衰退 | 6 | 0 | 0% | 0 | — |
| 降息·推不动 | 0 | 0 | — | 0 | — |
| 收紧 或 推不动 | 30 | 0 | 0% | 0 | — |
| 降息（任何） | 40 | 2 | 5% | 1 | 2 |
| 参照：收益率倒挂（10 年 < 政策利率） | 22 | 0 | 0% | 0 | — |

- 衰退 2020Q1：之前 4 季到当季的读数：2019Q1 扩张；2019Q2 过热·资产；2019Q3 降息（推得动吗？）（接 资产过热）；2019Q4 降息（推得动吗？）（接 资产过热）；2020Q1 降息（推得动吗？）（接 资产过热）

*稳健性（发布滞后版本 C）：* u 平均误差 持续 0.68pp / 分组均值 0.53pp，方向命中 持续 61% / 框架 50%；π 平均误差 持续 1.98pp / 分组均值 1.37pp，方向命中 持续 35% / 框架 43%；衰退信号「收紧 或 推不动」亮 31 季、准确率 0%、抓到 0/1。

### AUS · 2022+（保留样本，只报告）

**(a) 小周期表盘档位 → 之后 4 季的变化**（失业率 u、CPI 通胀 π；「之前 4 季」= 读数之前 4 季的变化，看档位是不是只是在重复已有的趋势）

| 档位 | n | Δu 4 季 | u 上升占比 | 之前 4 季 Δu | Δπ 4 季 | π 上升占比 | 之前 4 季 Δπ | n(8 季) | Δu 8 季（上升占比） | Δπ 8 季（上升占比） |
|---|---|---|---|---|---|---|---|---|---|---|
| 扩张 | 2 | −0.32pp | 0% | −1.64pp | +0.91pp | 50% | +3.14pp | 2 | +0.05pp（50%） | −1.90pp（0%） |
| 过热 | 0 | — | — | — | — | — | — | 0 | — | — |
| 收紧 | 11 | +0.25pp | 100% | −0.09pp | −1.37pp | 27% | −0.57pp | 9 | +0.48pp（100%） | −2.13pp（33%） |
| 降息（推得动/未定） | 2 | +0.30pp | 100% | +0.16pp | +1.26pp | 100% | −0.65pp | 0 | — | — |
| 降息·推不动 | 0 | — | — | — | — | — | — | 0 | — | — |

| 预测（在 t 时只用 ≤ t 的数据） | h=4：u 误差 | u 方向命中 | π 误差 | π 方向命中 | h=8：u 误差 | u 方向命中 | π 误差 | π 方向命中 |
|---|---|---|---|---|---|---|---|---|
| 不变（0） | 0.26pp | 13% | 1.74pp | 60% | 0.43pp | 9% | 2.39pp | 73% |
| 持续（过去 h 季的变化再来一次） | 0.58pp | 73% | 2.94pp | 47% | 1.88pp | 27% | 6.22pp | 0% |
| 平均漂移（到 t 为止全部已实现变化的均值） | 0.35pp | 13% | 1.83pp | 40% | 0.62pp | 9% | 2.45pp | 36% |
| 表盘分组均值（同一档位到 t 为止已实现变化的均值） | 0.22pp | 87% | 1.63pp | 73% | 0.37pp | 91% | 2.23pp | 73% |
| 框架方向（预先写定的方向表） | — | 87% | — | 60% | — | 91% | — | 55% |

n = 15 季（h=4）/ 11 季（h=8）。误差 = 平均绝对误差；方向命中 = 预测「上升」/「不升」与实际一致的占比；「不变」= 永远猜「不升」。

**(b) 大周期：B2 / 湖崩 → 之后 8 季**

| 读数 | n | Δu 8 季 | u 上升占比 | 之前 8 季 Δu | Δ私人债务/GDP 8 季 | 之前 8 季 Δ私人债务/GDP | 信贷存量 8 季增长 | 季度 |
|---|---|---|---|---|---|---|---|---|
| B2 已确认 | 0 | — | — | — | — | — | — | — |
| 湖崩 红（B2 或 ⑤） | 0 | — | — | — | — | — | — | — |
| 湖崩 黄（B2 证据成立/待确认） | 0 | — | — | — | — | — | — | — |
| 湖崩 绿 | 10 | +0.4pp | 90% | −1.7pp | +2.7pp | −15.0pp | 12.0% | 2022Q1 2022Q2 2022Q3 2022Q4 2023Q1 2023Q2 2023Q3 2023Q4 2024Q1 2024Q2 |
| 全部 | 10 | +0.4pp | 90% | −1.7pp | +2.7pp | −15.0pp | 12.0% | 2022Q1 2022Q2 2022Q3 2022Q4 2023Q1 2023Q2 2023Q3 2023Q4 2024Q1 2024Q2 |

**(b) ⑦ → 政府债务/GDP 之后 4 / 8 季**

| 读数 | n | Δ债务/GDP 4 季 | 4 季不升占比 | n(8 季) | Δ债务/GDP 8 季 | 8 季不升占比 |
|---|---|---|---|---|---|---|
| ⑦ 阶段 | 9 | +0.9pp | 0% | 5 | +2.0pp | 0% |
| ⑦ 的条件本季成立（g−r≥0 且 债务/GDP 一年不升） | 7 | −0.9pp | 57% | 7 | −0.0pp | 43% |
| 只看持续：债务/GDP 一年不升 | 8 | −0.8pp | 50% | 8 | +0.2pp | 38% |
| 只看持续：债务/GDP 一年在升 | 5 | +1.1pp | 0% | 1 | +2.1pp | 0% |
| 全部 | 13 | −0.0pp | 31% | 9 | +0.4pp | 33% |

**(c) 灯：现在的颜色 → 4 季后的颜色**（命中率 = 猜中 4 季后颜色的占比）

| 灯 | n | 持续（= 灯本身） | 永远绿 | 趋势外推 | 绿→仍绿 | 黄→仍黄 | 红→仍红 | 红 之后偏离变化 |
|---|---|---|---|---|---|---|---|---|
| 河溢（通胀离目标多远） | 15 | 27% | 33% | 60% | 20% (n=5) | 0% (n=3) | 43% (n=7) | −1.7pp |
| 河干（失业率 − u*，app 的 u*） | 15 | 100% | 100% | 100% | 100% (n=15) | — | — | — |
| 河干（u* = 过去 10 年失业率均值，单边） | 15 | 100% | 100% | 100% | 100% (n=15) | — | — | — |

**(d) 衰退（ABS 2020 两季负增长）：读数之后 0–4 季内开始衰退**（不计已在衰退中的季度；基准 = 任意一季之后 0–4 季内开始衰退的比例 0%，n = 15）

| 信号 | 亮的季数 | 其中 0–4 季内衰退开始 | 准确率 | 抓到的衰退（共 0） | 最早提前几季 |
|---|---|---|---|---|---|
| 收紧（任何） | 11 | 0 | 0% | 0 | — |
| 收紧·衰退 | 2 | 0 | 0% | 0 | — |
| 降息·推不动 | 0 | 0 | — | 0 | — |
| 收紧 或 推不动 | 11 | 0 | 0% | 0 | — |
| 降息（任何） | 2 | 0 | 0% | 0 | — |
| 参照：收益率倒挂（10 年 < 政策利率） | 4 | 0 | 0% | 0 | — |

*稳健性（发布滞后版本 C）：* u 平均误差 持续 0.58pp / 分组均值 0.23pp，方向命中 持续 73% / 框架 87%；π 平均误差 持续 2.94pp / 分组均值 1.63pp，方向命中 持续 47% / 框架 60%；衰退信号「收紧 或 推不动」亮 11 季、准确率 0%、抓到 0/0。

**AUS 版本差异（2000Q1 起）**：A（只截断）vs B（单边修正）读数不同的季度：无；B vs C（发布滞后）读数（含灯）不同 74 季，其中小周期档位不同 4 季、大周期阶段/岔路/湖崩灯不同 2 季。 B2 已确认的季度：cut 无；rt 无；lag 2009Q2–2009Q2（1 季）。进入 ⑦：cut 2023Q1；rt 2023Q1；lag 2023Q1。
<!-- END GENERATED TABLES -->

## Files

- `tools/backtest_real.mjs`: the backtest (prints the tables; `--write` regenerates the data file and the tables above).
- `src/data/real/backtest.js`: generated. `BACKTEST.countries.{USA,AUS}`: `readings` (per quarter from 2000Q1, as strings: `short` E 扩张 / P 过热·物价 / A 过热·资产 / T 收紧 / C 降息; `handoff` n = 推不动; `recess` r = 收紧·衰退; `long` stage digit; `fork` b = B2, p = B1, ? = B2 pending; `burst` / `flood` / `drought` / `droughtRT` g/y/r), `in` / `out` (all tables as numbers), `lag` (vintage C), `vintageDiff`.
- `tools/check_backtest.mjs`: the no-look-ahead checks and the file / doc match.

What would change these conclusions: real-time data vintages (ALFRED for the US) and, above all, readings recorded going forward from today, with the rules frozen.
