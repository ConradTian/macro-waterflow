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

## Sequencing (orchestrator)
- **Already running:**
  - the engine recalibration (worktree; owns `lessons.js` until merged), plus the AUS dial fix;
  - map + FX reactor (`flow.js` border band, `world-map.js`);
  - the shock lesson (new files only).
- **After those merge:** one course agent does the lessons, runner, ending block and course menu, and one layer agent does the progressive diagram. Their files are disjoint:
  - course agent: `lessons.js`, `src/ui/lessons.js`, `lessons.css`;
  - layer agent: `src/data/layers.js`, `flow.js` visibility, `simple.js`, `app.js` toggle.
