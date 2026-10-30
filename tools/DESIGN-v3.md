# DESIGN v3: three places + one price (2026-10-30, user-approved via Ray-Dalio-Framework)

The old site is frozen at /v2/ (static copy of a3bd76d), so 旧版课程 stays reachable there. The new site carries the new course.
Mnemonic, shown in the UI: **短周期看河，长周期看地下水，资产看湖，角色看阀，汇率看闸。**

## Core idea
- **河 (now):** one ring. Spending → 测流断面 (width = 产能, 水位 = 物价, flow = GDP) → sellers receive → 分水堰 splits the flow into 工资 / 利润 / 租金 / 利息 / 税 → 工资 goes back to spenders. 「我花的 = 你赚的」 is the backbone.
- **地下水 (future income):**
  - 放贷 = pumping future water up; 还本 = 回灌.
  - Debt = how far the 地下水位 has dropped.
  - 吸程线 = the depth below which the pump can't lift (= B2).
  - Every creation of water is a pump-up (放贷, deficit, QE); every destruction is a recharge (还本, surplus, QT).
- **湖 (stored):**
  - The cash pool carries the 吸力泵, and the asset pools sit beside it.
  - 票息 / 分红 / 租金 are 泉眼, PHYSICALLY wired from the 分水堰.
- **吸力 = the real rate:** one knob held by the central bank, with two arrows: 存湖划不划算 / 抽水贵不贵.
- **Roles = who turns which valve.** Tapping a role highlights its valves; takeover keeps working.
- **Expectations get no separate part:** they sit inside 吸力 and 怕. Say so once, in the 吸力 card.

## Hard rules
- **Dial rules unchanged:** B2 (3-quarter confirm, cleared by 推得动), ⑦, 收紧 / 降息, no 过热 while cutting. The picture READS them (src/engine/regimes.js).
- **地下水位 / 吸程线 readouts come from the existing B2 evidence only:** DSR vs start, private debt/GDP over 3 years, house prices, cut-but-credit-shrinking, plus the 加分项 (负资产 / 银行受伤).
  - Never a second B2 threshold.
  - The table sits BELOW the line exactly when `cycles.long.fork === 'B2'`, or the long stage is ⑤.
  - Depth = a 0..1 blend of how many B2 conditions hold and how close they are (the evidence margins).
- **The picture work is engine bit-identical:** `engine_check` USA 17/17 and AUS unchanged. src/engine/* is not touched in this batch.
- **Fiscal fInj = 0.5 stays.** The deficit is drawn as two streams, captioned: 「假设一半由银行和央行买国债（新抽的水），一半由存款人买（从湖里挪过来）」.
- **Unchanged:**
  - light mode only;
  - 比一年前 / 比上季, never 同比 / 环比;
  - real mode (?mode=real) works on the new picture;
  - phone panel grip, layers, simple mode.

## Glossary (old → new; all UI text follows this)
| Old | New |
|---|---|
| 商品河道 | 河（测流断面） |
| 产能 / 河道宽度 | 断面宽度（产能） |
| 物价（河道水位） | 断面水位（物价） |
| 收入循环 | 河的环：我花的 = 你赚的 |
| 工资 / 利润 / 付息 / 税收 pipes | 分水堰 的 工资 / 利润 / 利息 / 税 口 |
| 放贷（泵） | 抽水（从地下水抽上来，未来的收入） |
| 还本（排水） | 回灌（还给地下水） |
| 欠条箱 / 债务 | 地下水位下降（欠的越多，水位越低） |
| B2 岔路 / 缩水 | 地下水位跌破 吸程线（抽不上来） |
| 资产缓冲池 / 资产池 | 湖（现金湖 + 资产池） |
| 现金 tank | 现金湖（带 吸力泵） |
| 政策利率 / 实际利率 | 吸力旋钮（央行的一个旋钮：实际利率） |
| QE / QT | 央行泵：只往湖里灌 / 从湖里抽回 |
| 注入（财政） | 政府深井泵：一半新抽，一半从湖里挪 |
| 票息 / 分红 / 租金 | 泉眼（从分水堰接过来） |
| 4 灯 泛滥 / 干涸 / 溃坝 / 透支 | 河溢 / 河干 / 湖崩 / 地下太低 |
| 国境线 / 汇率阀 | 闸（过境换颜色，闸价 = 汇率） |
| 资本管 | 吸力差（+怕） |
| 商品价格管 | 水位差（+卖的东西贵不贵） |

## PART-ID CONTRACT
**Rule 1: every existing id stays valid.** These are the ids in src/data/layers.js: parts, pipes, nodes, keys, valves. Lessons, checkers and layers keep pointing at them. Labels change; ids don't.

**Rule 2: new ids, owned by A1 in flow.js; their layer is in brackets:**
- `weir` (L-water): the 分水堰 on the ring, after the 测流断面. The `wages`, `profits`, `interestPaid`, `taxes` and spring pipes leave from it.
- `ring` (L-water): the river ring highlight. The existing `channel` part = the 测流断面 box.
- `recharge` (L-water): alias label on the `principalRepay` pipe (回灌). It is a key only; the pipe id is unchanged.
- `groundwater` (L-long): the 地下水 band under the household / bank, with the water-table line. It replaces the visual of `iou`, but the `iou` part id stays on the same element.
- `liftLine` (L-long): the 吸程线, a dashed line in the groundwater band.
- `suction` (L-short): the 吸力 knob on the central bank / cash lake, with two arrows: `suctionSave` (存湖划不划算) and `suctionPump` (抽水贵不贵). The `rate` and `realRate` nodes stay.
- `deepPump` (L-gov): the government deep-well pump. The `fiscalInjection` pipe stays and gets 2 sub-streams, `fiscalNew` and `fiscalLake`.
- `springWire` (L-assets): the wires weir → 票息 / 分红 / 租金. The `coupons`, `dividends` and `rent` pipe ids stay.
- `gate` (L-border): the 闸 on the border band. The `border` part stays.

**Rule 3: role → valves map** (A1, `ROLE_VALVES` in src/data/layers.js; A5 role cards point to the same names):
- 央行 = `policyRate`, `qe` (knob + QE pump); watches the 断面水位 and empty width.
- 银行 = `approval`, `lvrCap` (the pump); watches the groundwater table and the house pool.
- 家庭 = `saveAdj`, `borrowMult`; watches wages and its own hole.
- 企业 = `capexMult` (widen the channel); watches orders and 吸力.
- 政府 = `fiscalInjection`; tax at the weir. Watches unemployment and its own hole.
- 投资者 = the pools.
- 外国人 = `gate`.
- 整个经济 = per-person real consumption + the 4 lamps.

**Rule 4:** layers.js may ADD ids to layers. It may not remove any, or move one to a later layer than a lesson that uses it.

## Course outline (one layer per lesson; the 三问 ending unchanged)
- One lesson = one question + one new piece on the picture + one real example + at most 6 steps + the 三问 ending.
- Show first, then name it. No term before the picture shows it.

| Lesson | id | Question | New piece (layer) | Example |
|---|---|---|---|---|
| L1 | m1 | 钱从哪来、到哪去？ | ring + weir + pump-up / recharge (L-water) | US 2005 mortgage pumping |
| L2 | shk | 是水的问题还是河道的问题？ | 测流断面 (L-channel) | 2021 too much water vs 2022 oil narrowing |
| L3 | m2 | 央行怎么让河涨落？ | 吸力 knob + the house collateral loop (L-short) | 2004–06 hikes |
| L4 | m3 | 为什么有时降息也没用？ | water table + 吸程线, B1 vs B2 (L-long) | US 2008 vs AUS 2008 |
| L5 | m4 | 私人抽不动了，谁来抽？ | deep pump, QE fills only the lake, ⑦ (L-gov) | 2009–14, 2021–23 |
| L6 | fx | 水怎么过境？ | colours + gate rules (L-border) | AUD 2008, JPY 2022 |
| L7 | m5 | 同一季，每个人拧哪个阀？ | role → valves | 2008Q3 |
| L8 | inv | 钱放哪？ | lake zoom (L-assets) | 2009 order 债 → 股 → 房 |

**Cycles on the picture:**
- Short cycle = the river's seasonal rise and fall, driven by the knob.
- Long cycle = the multi-year groundwater decline. Each short cycle pumps a bit more and recharges a bit less.
  - ① the table falls step by step, and the house pool gets most of the water;
  - ② the table nears the line, and the knob nears zero;
  - B1 = the water went into the river (overflow);
  - B2 = the lake collapsed, the hole remains, the table is below the line;
  - ⑤ only private recharge, the river dries;
  - ⑥ the government deep pump feeds the river, and the central bank pump feeds the lake only;
  - ⑦ the river grows faster than 吸力, and the gov hole stops deepening;
  - ⑧ the table is back above the line.

## World + FX (A3)
- **Colours and gate:** each currency is a colour of water. It changes colour at the 闸; the gate price = the exchange rate.
- **Gate rules:**
  - 快 = 吸力差: water runs to the higher real-rate lake.
  - 慢 = 水位差 (PPP anchor) + 卖的东西贵不贵 (ToT).
  - 怕 = in fear, water runs to the biggest lake (USD) and home (JPY).
- **Reactor rename:** 资本管 → 吸力差（+怕）; 商品价格管 → 水位差（+卖的东西贵不贵）. Note: the trade balance itself barely moves FX; leaked river water comes back through the lake.
- **Crossing layers:** 河连河 = trade; 湖连湖 = capital; 地下连地下 = foreign-currency debt (BIS; ship 2 layers if the data isn't ready).
- **The US lake** is drawn as the biggest lake. Caption: 美联储加息 = 最大的湖吸力变大，全世界的水往美国跑.
- **Map boxes:** a mini 3-layer icon (河水位, 湖吸力 = REAL rate, 地下水位) with the gate underneath.

## Asset page (A4)
- **Layout:** the big classes on top: 现金 | 国债 | 股票 | 房子, with 黄金 aside.
- **Tap a class:** it opens sub-classes, LEFT (看吸力: stable or far 泉眼) vs RIGHT (看水量: river flow). The springs are wired from the weir.
- **Stocks:**
  - 稳股 (left, wide), 成长股 (far left, narrow), 周期股 (right; banks = the pump).
  - These are read-only sub-indices, using the engine's equity formula with 2 params (spring beta to flow, spring distance). No feedback into the engine.
  - Check against the Kenneth French portfolios.
- **Page rules:**
  - narrow pools jump more;
  - water enters where its pipe lands (QE → bonds, fiscal → cash, bank pump → houses);
  - one narrow middle pipe drifts right when cutting, is pulled back left when overheating, rushes back in fear, and is blocked in B2.

## Agents and file ownership (disjoint)
- **A1 Picture:** src/ui/flow.js, src/data/layers.js, src/ui/simple.js, src/ui/objective.js (lamp names), assets/css/app.css (diagram section), assets/css/simple.css, assets/css/objective.css, tools/check_layers.mjs.
- **A2 Course L1–L5 + L7:** src/data/lessons.js (m1, shk, m2, m3, m4, m5 + the menu), src/ui/lessons.js, assets/css/lessons.css, tools/check_lessons.mjs, tools/check_d_lessons.mjs (main-line parts only), src/data/lesson-shocks.js (shk).
- **A3 World + FX + L6:** src/ui/world-map.js, src/ui/fx-reactor.js, src/ui/fx-lab.js, src/data/world.js, src/data/lesson-fx.js, src/data/usd-index.js, assets/css/world.css, assets/css/fx-reactor.css, tools/check_map.mjs, tools/check_fx_reactor.mjs, tools/check_lesson_fx.mjs, plus new BIS fetch/build files (tools/*bis*, data_src/bis/).
- **A4 Asset page + L8:** new src/ui/asset-lake.js, new src/data/sub-index.js, new assets/css/asset-lake.css, src/data/lesson-investor.js, src/ui/investor-lab.js, tools/check_lesson_investor.mjs, plus new French fetch/build files (tools/*french*, data_src/french/).
- **A5 Text sweep:** src/data/concepts.js, src/data/role-cards.js, src/data/role-lessons.js, src/data/causal.js (labels only), src/ui/headline.js, src/data/blind-cards.js + tools/build_blind_data.py (reveal text only), src/ui/real-mode.js (labels), src/ui/concepts.js, tools/check_concept_why.mjs, tools/check_headline.mjs.
- **Nobody touches** src/engine/*, src/data/country-params.js or src/app.js. If you need app.js, tell the orchestrator.
- **Fallback:** a part not ready keeps its OLD working version (old map, old pools), behind a flag if needed. Never ship broken.

## Parked: 吸力尺 on the main diagram (wait for the user's explicit go after the 专题：预期 lesson)
- The 吸力 knob is replaced by the vertical ruler: ▶ policy rate, ▽ inflationExp, ▼ measured inflation, a shaded band ▶ − ▽, the 调度线 and the rope. The v3.1 redraw keeps a `// RULER SLOT` group for it beside the central bank / cash lake.
- A thin line runs from the river's CPI on the 测流断面 to ▼, so 河 → ▼ → 央行 → ▶ reads as one loop.
- When the band changes, existing parts flash in engine-lag order: pump, cash lake, asset pools, river, groundwater.
- A mini ruler sits by the border gate: the rate gap + ▽汇. Only pegged currencies get a rope (CNY on the map).
- The 4 physical rules go in the legend card only.
- On phone, show ▶, ▽ and the band; ▼ and the rope appear on tap.
- No stories, no toy and no pool-▽ on the main diagram.
