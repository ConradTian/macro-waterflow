# Course v3: one storyline, 4 parts, 8 lessons (2026-10-29)

Approved by the user via the Ray-Dalio-Framework session. It supersedes the "main line 6 lessons" plan. House rules: `tools/B1B2-CONTRACT.md`.
**Every lesson adds exactly ONE layer to the diagram. The final full picture equals the 历史盲测 screen.**

## Lessons
| # | Part | Title | Source | Change | Layer added (diagram parts, see below) |
|---|---|---|---|---|---|
| L1 | 一个国家怎么运转 | 水从哪来、到哪去 | m1 | small (ending) | `L-water`: pumps, drains, the income loop, the 4 outlets = GDP, the total-objective strip |
| L2 | 一个国家怎么运转 | 水的问题，还是河道的问题 | new `shk` (+ the Capex 与产能 optional) | new | `L-channel`: channel width, cross-section inset, Capex → wider channel with a lag; the 三条线 straight line = the channel-width trend |
| L3 | 它怎么出毛病 | 一个会自己转的圈 | m2 | small | `L-short`: bank + household loop (collateral), policy rate, SHORT-cycle dial |
| L4 | 它怎么出毛病 | 两个环怎么接上 | m3 | small | `L-long`: LONG-cycle dial, debt box (欠条箱), B1/B2 fork |
| L5 | 它怎么出毛病 | 政府接手和实际利率 | m4 | medium: + step 化债四个出口和谁被砍 | `L-gov`: government, QE, real-rate gauge, the 4 penalty lamps |
| L6 | 国与国之间 | 汇率和国境线 | rebuilt `fx` (+ 世界 2, Australia as the worked example) | rebuild | `L-border`: border line, FX reactor, world map |
| L7 | 你 | 同一个季度，八个视角 | m5, moved | move + foreign view | (none new: all of the above, with the role cards) |
| L8 | 你 | 投资者 | `inv` | small | `L-assets`: asset pools with 贵/便宜 bands, asset-reaction table, five gauges, four currencies. Ends with 3 tutorial cards → 历史盲测 |

- **L5's new step: 化债四个出口和谁被砍.**
  - 增长 = 没人被砍
  - 通胀 = 拿现金、国债的人
  - 金融压制 = 存钱的人
  - 违约 = 债主
- **L6 order:**
  1. the reactor (2 pipes + needle + anchor);
  2. tap through to the five forces;
  3. trade pipes, and why the trade balance itself barely moves FX;
  4. reserve currency;
  5. AUD case 2003–2011–2026;
  6. calculator.

  The existing fx panels become drill-downs.
- **L7's 外国人 step:**
  - L7 stays at US 2008Q3.
  - The 外国人 step gets one sub-step that shows the FX reactor for **Australia 2008Q3 → 2009Q1**. AUD fell about 30% (quarterly averages): the capital pipe reversed (risk-off, rate gap cut) and the terms of trade fell.
  - Prefer a reactor panel (`mountFxReactor(host, { iso: 'AUS', t })`) over switching the whole sim. If switching the sim is clean, it is fine, but the step must switch back to the US afterwards.
- **Cut or merged:**
  - Capex optional → L2.
  - AUS optional (w2) → L6.
  - Lesson 0.5 → replaced by the fixed ending.
  - 自由运行 is no longer a lesson; it is renamed **沙盒** (a link in the menu).
  - All old lessons stay under 旧版课程.

## System glue
1. **The same ending for every lesson: 三问.** These are the questions the blind-test cards ask:
   - ① 水的问题还是河道的问题？
   - ② 环上哪一步？
   - ③ 谁赢谁输、钱放哪？

   Each lesson answers them for its own example in one line each. The runner renders them in a fixed `ending` block.
2. **Progressive diagram.** In simple and course mode the flow diagram shows only the layers learned so far.
   - Progress is stored per viewer in localStorage (try/catch), like `/blind/`.
   - A 「显示全部」 toggle at the top right is always available.
   - A lesson always shows its own layer plus the earlier ones.
   - Reuse the existing parts-visibility mechanism (`body.parts-on` + `data-vis`, `visSet`/`partShown` in `flow.js`, used by the town lessons). Map each `L-*` layer to a set of part ids in one table in `flow.js` or a new `src/data/layers.js`.
   - The objective strip, the dials and the border show and hide with their layers. A first-time viewer sees L1's layer only, plus the toggle.

## Interface between the course agent and the layer agent
- **`src/ui/progress.js` (layer agent):**
  - `getProgress() -> { done: [lessonId…] }`, stored in localStorage key `mw.course` (try/catch);
  - `markDone(id)`;
  - `learnedLayers() -> Set of L-* ids`;
  - fires `mw:progress` on change.
- **`src/data/layers.js` (layer agent):**
  - `LAYERS`: ordered `[{ id:'L-water', parts:[...], extras:['objective', ...] }, ...]`;
  - `LESSON_LAYER`: lessonId → layer id. The course agent tells the layer agent the final ids: L1 m1, L2 shk, L3 m2, L4 m3, L5 m4, L6 fx, L7 m5, L8 inv.
- **The course agent:**
  - calls `markDone(id)` when a lesson reaches its last step;
  - dispatches `document` event `mw:lesson-active` with `{ id }` on lesson start and step change, and `{ id: null }` on exit.

  The layer agent shows the layers up to and including that lesson's layer while it is active.
- **「显示全部」** is owned by the layer agent (`app.js` + `simple.js`), persisted in `mw.layers.all`.

## Sequencing (orchestrator)
- **Already running:**
  - the engine recalibration (worktree; owns `lessons.js` until merged), plus the AUS dial fix;
  - map + FX reactor (`flow.js` border band, `world-map.js`);
  - the shock lesson (new files only).
- **After those merge:** one course agent does the lessons, runner, ending block and course menu, and one layer agent does the progressive diagram. Their files are disjoint:
  - course agent: `lessons.js`, `src/ui/lessons.js`, `lessons.css`;
  - layer agent: `src/data/layers.js`, `flow.js` visibility, `simple.js`, `app.js` toggle.

## Next: 真实 / 模型 mode (scope approved 2026-10-30; data in tools/REAL-DATA.md)
- Toggle 「真实 / 模型」: lessons default to 模型; elsewhere the viewer's choice is remembered.
- In 真实 mode:
  - Play and takeover are disabled.
  - The scrubber and BOTH step buttons (⏮ back one quarter / ⏭ forward one quarter) keep working.
  - A badge 「真实数据 · 截至 2026Qx」 sits next to the date.
- The four outlets are real in both countries (BEA / ABS 5206.0).
- Fields that are not observable are greyed and tagged 「模型估算」, or shown as 「—」.
- In 模型 mode, inside 保留样本, a small 「真实 x」 sits next to unemployment / CPI / house prices.
- 2022+ is display only; never fit on it.

## Queue (approved, not started; 2026-10-30)
1. **Captions under every country's 「真实世界的三条线」 chart** (周期 tab and the curves view).
   - One line per item:
     - 数据：<国家> 真实 GDP（总量/人均，来源，起止年，取对数）
     - 直线 = 对数 GDP 线性趋势 = 生产率 = 河道宽度长期走势
     - 蓝色长波 = 偏离的慢变部分（HP λ=…）。Above the line = a leveraging era; below = a deleveraging era. It is drawn from GDP, not from debt.
     - 短波 = 偏离 − 长波
     - 读法
   - Take the specifics from `tools/build_waves.py`. Details go in a tap card.
2. **负资产 ≠ B2**, part of the B2 engine pass.
   - (a) On the B2 evidence card, two display-only 加分项: 负资产范围 (LVR plus house-price drawdown) and 银行受伤程度 (bad loans / capital). They are not part of the threshold. AUS real data shows 没有数据.
   - (b) L4 gets the step 「负资产不等于 B2」 with a four-case table: US 2008, Japan 1990, UK early 1990s, AUS 2008. It ends with four questions; the first three say whether B2 can happen, and the fourth (降息推不推得动) confirms it.
   - (c) The AUS-2008 blind reveal gets one line on why it was not B2.
3. **A B2 line under the dials** (part of the B2 pass). It goes under the long-cycle dial (the B2 fork) and the short-cycle dial's 「推不动 → 大周期 B2 → ⑤」 box. It is always visible, one line on phone, with the full text in the tap card:
   「B2 怎么来的：借钱买的资产跌了 → 家底变负、债还在 → 大家拼命还债、银行收紧 → 降息也推不动（负资产要多、并且伤到银行才算）。」
