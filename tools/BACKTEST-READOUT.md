# Backtest readout (one page)

Sources: `tools/BACKTEST.md` / `src/data/real/backtest.js` (unemployment, CPI, lamps, recessions) and `tools/backtest_readout.mjs` (scratch: policy rate, house prices, the dials themselves). The scratch script imports `backtest_real.mjs` unchanged and reuses its walk-forward readings (vintage B). Every forecast made at quarter t reads only data and readings dated ≤ t. 2022+ is reported separately and was not used to choose anything. Its u / CPI numbers match `BACKTEST.md` exactly.

## Conclusion

**Measured by error size, the framework never beats "next = this quarter" in 2000–21.** That holds for unemployment, CPI inflation, the policy rate and house-price growth, at 4 and at 8 quarters, in both the US and Australia. Its forecast is "the average change after earlier quarters in the same dial phase". It also loses to its own dials' "stay where you are" reading: the short dial is in the same phase 4 quarters later 64% (US) / 58% (AUS) of the time, while the dial's own cycle order (扩张→过热→收紧→降息) predicts the phase 4 quarters ahead only 21% / 24% of the time.

**It wins only on direction, only in the US, and mostly for the policy rate.** After 收紧 the rate round tends to end, and in 扩张 rates tend to rise. Over 8 quarters the US policy rate's direction is right 71% of the time, against 57% for the best naive guess. That is the one gap above the 10-point noise line. US house-price direction (+7 points) and US unemployment at 8 quarters (+5) are within noise. Australia shows no win anywhere.

**2022+ looks better, but proves little.** On error size the framework ties "no change" (every row within about 0.2pp). On direction it beats "no change" for unemployment (80–91% vs 9–20%), but no more than the trivial guess "unemployment goes up" (80% / 87%). It is a single tightening episode (11–15 overlapping quarters), and the rules were redesigned in 2026 with 2021–26 in view.

## Table (4 quarters ahead; US / AUS)

Error = mean absolute error in pp. Direction = share of quarters where up / not up was called right. "Best naive" = the best of no change, always up, and persistence (the last 4 quarters' change repeats).

| Variable | 2000–21 error: no change · persistence · **dial** | 2000–21 direction: best naive · **framework** | 2022+ error: no change · **dial** | 2022+ direction: best naive · **framework** | Verdict |
|---|---|---|---|---|---|
| Unemployment | 1.11 · 1.29 · **1.22** / 0.50 · 0.68 · **0.53** | 73 · **58** / 61 · **52** | 0.26 · **0.25** / 0.26 · **0.22** | 80 · **67** / 87 · **87** | Loses in-sample; ties later |
| CPI inflation | 1.34 · 2.17 · **1.51** / 1.11 · 1.98 · **1.37** | 51 · **48** / 50 · **46** | 1.64 · **1.69** / 1.74 · **1.63** | 67 · **67** / 60 · **60** | Loses / ties |
| Policy rate | 0.92 · 1.16 · **1.26** / 0.67 · 0.95 · **0.82** | 56 · **65** / 76 · **65** | 1.40 · **1.33** / 1.03 · **1.12** | 73 · **60** / 67 · **47** | US direction win (8q: 71 vs 57); AUS loses to persistence; 2022+ loses |
| House-price growth (past 4q) | 3.88 · 4.78 · **4.53** / 7.06 · 10.83 · **7.91** | 58 · **65** / 56 · **55** | 4.90 · **5.11** / 8.25 · **8.36** | 73 · **60** / 50 · **43** | Loses on error; US direction +7 (noise) |
| Short dial phase | stays the same: **64% / 58%**; dial's next phase: 21% / 24%; learned transition table: 44% / 38% | — | stays the same: 67% / 47% | — | The dial describes; it does not foretell |
| Long dial stage | stays the same: **90% / 93%**; moves to next stage: 5% / 5% | — | 87% / 73% | — | Slow, so "no change" is almost always right |

Where it loses (honestly): it loses on error size for every variable in 2000–21, and the short dial's own cycle order is the worst forecast of the dial. Australia shows no direction edge at all, and persistence beats it on the AUS policy rate (76% vs 65%). In 2022+ it loses on the policy rate and on US house prices. Recessions (from `BACKTEST.md`): 收紧 is followed by a recession 31% of the time, about twice the 16% base rate, against 83% for the yield curve. B2 red lit after unemployment had already risen 3.7pp.

Caveats: the policy-rate and house-price direction table (`SIGN2` in `b5_readout.mjs`, from the dial's next phase) was written by me during this readout, before computing those two variables but after seeing the u / CPI results. The thresholds were set by people who had seen 1995–2026. The data are final vintages, not real-time ones. Each 2000–21 row has 84 overlapping quarters, which is about 20 independent years.

## 给初学者的一段话

我们做了一个「穿越测试」：假装站在 2000 年到 2021 年的每一季，只看那一季为止的数据，让 app 的表盘说一句「接下来一年会怎样」，再和最笨的猜法比。最笨的猜法是「明年跟现在一样」。

**结果：比误差大小，表盘一次也没赢过「跟现在一样」。** 失业率、物价涨幅、央行利率、房价过去一年涨了多少，美国和澳洲都一样。表盘自己也是：「一年后还停在同一档」比「按 扩张→过热→收紧→降息 的顺序走到下一档」准得多（约 60% 对约 20%）。

**它唯一有点用的地方：猜美国利率接下来是升还是降。** 央行在「收紧」时，两年后利率多半已经回落。这一项猜对 71%，笨办法 57%。房价方向多猜对一点，但差距小到可能只是运气；澳洲哪一项都没有赢。

2022 年以后看起来好一些，但那只是一次加息，而且规则是在看过这几年之后才改的，所以不能当证据。

一句话：**表盘是一个好的「现在在哪儿」的地图，不是天气预报。** 真正的检验只能从今天起：把规则冻结，往后一季一季地记下来。
