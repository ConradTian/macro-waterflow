
## 接线 (D-integration: both lessons in the real app)

Done 2026-10-29. Files: `src/data/lessons.js`, `src/ui/lessons.js`, `assets/css/lessons.css`, `index.html`, `tools/check_lessons.mjs`, `tools/check_d_lessons.mjs` (new). `fx-lab.js` / `investor-lab.js` and their CSS are unchanged.

**Course** (`COURSE` in `src/data/lessons.js`; `LESSONS` imports `LESSON_FX` and `LESSON_INVESTOR` and lists them last):
- Menu order: 主线 `m1 … m5` → 接下来 `fx` (汇率), `inv` (投资者) → 选学 `5` (Capex 与产能), `7` (自由运行), `w2` (澳洲) → 自由运行 link → 旧版课程 (collapsed; now also `w1`, which 汇率 absorbs).
- `COURSE.later = ['fx', 'inv']`. `COURSE.soon` (the 制作中 placeholders) is gone. The 推荐 badges run 1–7 over main + later; the round badges of fx / inv are 汇 / 投.
- Handover: m5's last step `next: 'fx'`, fx → `inv` (its own data), inv has no `next`: its last step is the `blind` panel with the three practice-card links and the deck link.
- Reaching the last step of a `kind: 'fx'` or `'capstone'` lesson marks it 已完成 (their last step is a reveal, not a recap).
- Lesson 7's chain text now points at 「毕业课：投资者」 instead of 「新版制作中」.

**Runner: step field `panel: { id, ...options }`** (`src/ui/lessons.js`, `syncPanel` / `dropPanel`):
- The module is chosen by the lesson's kind: `fx` → `mountFxPanel` / `unmountFxPanel`; `capstone` → `mountInvestorPanel` / `unmountInvestorPanel`. Any other lesson falls back to the panel id (`fx-*` → FX, else investor). Modules load lazily in `startLesson` (before the first step); if one fails to load, the steps show text only.
- Mount: at the end of every `draw()`, i.e. on entering the step and on every card rebuild. Unmount: in `leaveStep()` (step change, ‹ 上一步, ↺, a new lesson) and so on exit. Before `draw()` rebuilds the card, an FX panel hosted in the card is unmounted first (investor panels are re-attached with the same spec and keep their state). `onRender` re-mounts if a render lost the diagram host.
- Hosts:
  - `'diagram'` (default): `div#ls-panel.ls-pnl.ls-pnl-dia[data-kind=fx|inv]`, absolutely over the whole diagram column (`z-index: 32`, above the 曲线 toggle, below the world map and the sheets). `#diagram.ls-pnl-on` hides the flow diagram (`visibility: hidden`, the DOM stays, as with the curves view) and the 曲线 toggle / curves view. iPad ≈ 540×750, phone 390 × 46dvh. FX panels scroll inside `.fxp`; investor panels scroll in the host.
  - `'card'`: `div.ls-pnl-card` at the end of the lesson-card body, under the text. Used when the step needs the diagram visible. On iPad the card may then grow to 72 % of the right column (`.ls-card.ls-pcard`); on phone the card body scrolls (⤢ makes it tall).
- Host per step (the table `CARD_PANELS` in `src/ui/lessons.js`; everything not listed goes over the diagram):

| lesson | step (position in the lesson, 1 = the intro; title words) | panel | host | why |
|---|---|---|---|---|
| 汇率 | 1 先说结论 | fx-frame | diagram | |
| 汇率 | 2 锚 | fx-anchor | diagram | |
| 汇率 | 3 利差 | fx-pipe | diagram | |
| 汇率 | 4 生产率 | fx-prod | diagram | |
| 汇率 | 5 贸易条件 | fx-tot | diagram | |
| 汇率 | 6 信心 | fx-conf | diagram | (its `hl: riskPremium` has no data-term in the diagram: no glow; check_lessons WARN) |
| 汇率 | 7 储备货币 | — | (world map) | `map: { open, select: 'USA', year: 2025 }` |
| 汇率 | 8 计算器 | fx-calc | diagram | |
| 投资者 | 1 先说结论 | — | — | |
| 投资者 | 2 五个表 (watch, plays 2007Q4 → 2009Q1) | gauges | diagram | the gauges are the point of the step; they follow the sim on their own |
| 投资者 | 3 资产反应表 | assetTable | **card** | a row tap flashes the winners' pools in the diagram, so the diagram stays visible |
| 投资者 | 4 实际利率 | realRate | diagram | |
| 投资者 | 5 贵不贵 | priced | diagram | |
| 投资者 | 6 三个信号 | timeline | diagram | |
| 投资者 | 7 四种货币 | fx | diagram | |
| 投资者 | 8 盲测 | blind | diagram | |

**Country** (投资者 `country: 'AUS'`, same path as `w2`): starting it from a US page goes to `?country=AUS&lesson=inv` (full reload; 汇率's 下一课 does this too). Exiting a lesson whose `country` is not the US, while the page is in that country's view, now goes back to the US root page (theme kept, every other parameter dropped), so the app is on the US sim in the viewer's stored layout (simple by default). This applies to `w2` too.

**CSS**: `index.html` links `assets/css/fx-lab.css` and `assets/css/investor-lab.css`. `free/index.html` runs no lessons and does not load them.

**Checks**:
- `tools/check_lessons.mjs`: the per-step checks (and the world rule "no typed numbers") do not run on kind `fx` / `capstone`; their numbers belong to `check_lesson_fx.mjs` / `check_lesson_investor.mjs`. New block 13 checks their place: registered last in `LESSONS`, `COURSE.later = fx, inv`, no `soon`, m5 → fx → inv, inv ends on the `blind` panel, `country: AUS` ready, every panel id exists in `FX_PANELS` / `INVESTOR_PANEL_IDS`, concepts exist. Every lesson is still in the menu exactly once; 世界 1 is under 旧版.
- `tools/check_d_lessons.mjs` (own static server on 8303, CDP 9403; `--shots` writes `tools/shots/d-*.png`): menu order and uniqueness; both lessons opened from the menu and walked step by step at iPad 1180×820 and phone 390×844 (exactly one panel of the right id, in the right host, unmounted on 下一步 / ‹ 上一步 / 退出); m5 → fx → inv; the asset-table row tap lights the diagram; the three blind links; exiting 投资者 lands on the US root page in simple mode; no JS errors.

## 投资者

Capstone lesson 「投资者」, approved by the user (2026-10-29). House rules: `tools/B1B2-CONTRACT.md`.

**Files (only these belong to this section):**
- `src/data/lesson-investor.js`: `LESSON_INVESTOR` (one lesson object, same shape as a `LESSONS` entry), plus the data the panels draw: `ASSET_COLS` / `ASSET_ROWS` (handover §4.3), `JPN_JST` (Japan 1985–2020 from JST), `JPN_SIGNALS`, `TOY` (the toy formula constants).
- `src/ui/investor-lab.js`, `assets/css/investor-lab.css`: the panels.
- `tools/investor-lab-demo.html`: demo and self-test page. `tools/check_lesson_investor.mjs`: the checker.

**Wiring (for the agent that owns `lessons.js` / `src/ui/lessons.js` / the HTML; this lesson does not touch them):**
- Add `LESSON_INVESTOR` to the course (id `'inv'`, `kind: 'capstone'`, label 毕业课; the menu group is your call). It has `country: 'AUS'`: the gauges then read the AUS sim, the only one whose 汇率 gauge moves. Remove that field to run it on the US.
- Load `assets/css/investor-lab.css` in `index.html`.
- New step field `panel: { id, ... }`. When a step with `panel` is entered, call `mountInvestorPanel(host, step.panel)` with a host element in the lesson card body (or a larger sheet; the panel sizes itself to its host). Call `unmountInvestorPanel()` when the step is left or the lesson is exited. `draw()` rebuilds the card's HTML on every render: after each `draw()`, call `mountInvestorPanel(newHost, step.panel)` again. With an equal spec it only moves the live panel into the new host and keeps its state (slider, selected row); with a different spec it unmounts the old panel and mounts the new one.
- Steps use only the existing types: `intro`, `watch` (step 1, `until: '2009Q1'`), `reveal`. There are no `vals` and no model numbers in the texts. `claims` here are checked by `check_lesson_investor.mjs`, not `check_lessons.mjs`.

**API (`src/ui/investor-lab.js`):**
- `mountInvestorPanel(host, spec)` returns `{ id, el, refresh }` or `null`. It appends one `div.ivl[data-panel=id]` to `host`. Only one panel is mounted at a time. Mounting a different spec unmounts the previous panel first; mounting an equal spec (same JSON, ignoring `snap`) re-attaches the live panel to the new host.
- `unmountInvestorPanel()`: stops the timers and the ResizeObserver, removes the panel's element, and clears any diagram flash it started. The host is left exactly as it was before mounting.
- `refreshInvestorPanel()`: optional. The panels that read the sim follow it on their own, polling `currentSim()` from `flow.js` every 400 ms and redrawing when the quarter changes.
- `INVESTOR_PANEL_IDS`, `nowRow(snap)` (snapshot → asset-table row id), `toy`, and `audCross()` are also exported, for tests.
- Every `spec` may carry `snap` (an object or a function) to override the sim, as the demo and tests do.

**Panel ids:**

| id | spec fields | reads | what it does |
|---|---|---|---|
| `gauges` | none | sim snapshot: `cycles.short` (phase, label, handoff), `cycles.long` (stage, fork, b1Overlay), `rates.realPolicy`, `lights.valuation` (+ `assets.housing.priceToIncome`, `assets.equity.pe`), `border.fxPerUsd` / `fxChg4q`, `sim.country` | Five gauges: 小周期位置, 大周期位置, 实际利率, 估值, 汇率. The bottom line names the asset-table row for now (`nowRow`). In the US the 汇率 gauge says the dollar is the ruler itself. |
| `assetTable` | `select?` (row id: `b1` `cut` `b2` `l6` `l7` `A` `C`) | `ASSET_ROWS`, snapshot (for the 现在 row) | Tap a row: its winners and losers light up, and the winners' pools flash in the diagram (`flash()` from links.js, if `#diagram` exists). Tap a column header to see that pool's 泉水 (the 资产 tab's idea). Carries the caveat 「还没有用数据逐格验证」. |
| `realRate` | `def?` (start value, default `TOY.r0` = 1%; the lesson uses −1%) | `TOY`, snapshot (for the 现在 marker) | A slider from −2% to +5%. Bonds `100·((1+r0)/(1+r))^10`, gold `^20`, and the equity P/E `1/(r + 5% − 1.5%)` are indexed to 100 at 1%, all labelled 玩具公式. Tapping or dragging the chart moves the slider. |
| `priced` | `cards` (default `['JPN-1989','JPN-2012']`), `extra?` (an optional third card, behind a toggle) | `src/data/blind-cards.js` (dynamic import): `view.pct`, `view.levels`, `view.call`, `reveal.ret1` | A dot plot of own-history percentiles (credit/GDP, house/income, equity valuation, real rate), plus a comparison table that includes the next year's returns. |
| `timeline` | `year?` (default 2013) | `JPN_JST`, `JPN_SIGNALS` | Japan's equity (1989 = 100) with the four exit signals (2005 / 2009 / 2013 / 2022). The year slider and chips light the signals and count them, ending in a verdict (only one lit = not enough; three = act). Each signal has a sparkline. |
| `fx` | `from` / `until` (default 2007Q1 / 2010Q4), `base` (default 2008Q2) | AUS / JPN / CHN quarterly `fxPerUsd` (via `COUNTRY_DATA`), and blind card AUS-2008 `reveal.ret1` | What 1 AUD buys in USD, JPY and CNY, indexed to `base`, with a tap/drag readout and a number table. The callout reads 「保险要在火灾前买」. |
| `blind` | `cards` (practice card ids), `base?` (the URL of `/blind/`; default resolved from the module, i.e. `<site>/blind/`) | blind-cards.js (names and types only, never the reveal) | Three practice cards, each with an `打开 ↗` link to `blind/?card=ID` (new tab), and one link to the whole deck. `/blind/` has no tutorial mode, so these are plain card links. |

**Numbers:**
- 2008 AUD fall against the USD: the spec said about 35%. The repo's quarterly averages give **29.6%**, from 0.94 USD in 2008Q2 to 0.66 USD in 2009Q1. The lesson says 30% and explains that 35% is the daily high-to-low.
- Same period: against the JPY −37.0%, against the CNY −30.9%.
- JST (Japan) and `jpn-quarterly.js`, as recomputed by the checker:
  - credit trough 2005;
  - real house-price trough 2009;
  - g > r from 2013 (first three-year run);
  - equity 2012 = 30, 2020 = 73 (1989 = 100);
  - CPI ≥ 2% from 2022Q2 to the end of the data;
  - equity index at 2022Q2 = 2.6 times its 2012 low.
- Practice cards are USA-2006, USA-2009 and AUS-2015 (危 / 转 / 平). The spec's example JPN-2012 and AUS-2008 are revealed inside this lesson (steps 4 and 6), so they would be spoilers.

## FX

Big lesson 「汇率」, approved by the user (2026-10-29). It sits after the main line (m1–m5) and before 投资者 (`'inv'`), and absorbs 世界 1 (border pipes, China's dollars back into Treasuries, the reserve pool, the AUS raw-material basin) and the FX part of 世界 2. House rules: `tools/B1B2-CONTRACT.md`.

**Files (only these belong to this section):**
- `src/data/lesson-fx.js`: `LESSON_FX` (one lesson object, same shape as a `LESSONS` entry; also the default export).
- `src/data/fx-data.js`: `FX_SPEC` (research and spec numbers), `JPY_ANNUAL` and `UK_MONTHLY` (extracts of `data_src/world/fred`), `FX_FORCES` (the five forces, in formula order).
- `src/ui/fx-lab.js`, `assets/css/fx-lab.css`: the panels.
- `tools/fx-lab-demo.html`: demo page (`?step=N` or `?panel=ID[&preset=audcny]`, `&theme=dark`). `tools/check_lesson_fx.mjs`: the checker.

**Wiring (for the agent that owns `lessons.js` / `src/ui/lessons.js` / the HTML):**
- Register `LESSON_FX` (id `'fx'`, `kind: 'fx'`, label 汇率). It replaces `COURSE.soon` key `fx`. `w1` and `w2` can then leave the menu, or move to 旧版 / 选学.
- Load `assets/css/fx-lab.css` in `index.html`.
- New step field `panel: { id, ...options }`.
  - When a step with `panel` is entered, call `mountFxPanel(host, step.panel)`.
  - Call `unmountFxPanel()` when the step is left, the lesson is exited, or before `draw()` rebuilds the host.
  - The host should be a large area. The panels were designed for the diagram column (iPad about 540×750; phone 390×470, scrolling inside) and size themselves to the host's width.
  - The lesson card keeps the text.
- Steps use only `intro` and `reveal`, with no `vals` and no `claims`. Step 6 uses `map: { open: true, select: 'USA', year: 2025 }` (the world-map event, as in `w1`) and has no panel.
- The numbers in the texts are typed in. Each is backed by `step.nums` (`{ t, f(D), fmt }`) and each claim by `step.facts` (`{ f(D), note }`), and `check_lesson_fx.mjs` verifies both.
  - `check_lessons.mjs` should skip `kind: 'fx'`. Its world rule "no typed numbers" does not apply here.
- The last step has `next: 'inv'`. The runner's 下一课 button falls back to 回到课程菜单 until `'inv'` is registered.

**API (`src/ui/fx-lab.js`):**
- `mountFxPanel(host, spec)` returns the root `div.fxp[data-panel=id]`, appended to `host`, or `null` for an unknown id.
  - Only one panel is mounted at a time. Mounting again unmounts the previous one first.
  - The panel scrolls inside itself (`max-height: 100%`). Give the host a height.
- `unmountFxPanel()` removes the element, its listeners, the tooltip and the ResizeObserver, leaving the host exactly as it was. It is safe to call twice.
- `FX_PANELS` (the ids), plus `fxCalc`, `CALC_PRESETS`, `todayReadings`, `audcnyYear`, `yearMean` and `qv`, are exported for tests.
- The panels never touch the sim, the diagram or the URL. They read only `src/data/countries/{aus,chn}-quarterly.js`, `src/data/us-quarterly.js` and `src/data/fx-data.js`.

**Panel ids** (every exchange-rate line reads 「往上 = 本币变强」; one colour per force, all panels):

| id | spec fields | shows |
|---|---|---|
| `fx-frame` | none | The formula, colour-coded. A map table of the five forces: direction, fitted 5-year coefficient, horizon, lesson step. A time scale showing which force works over which horizon. |
| `fx-anchor` | none | R² of the inflation gap by horizon (1/2/5/10/20/40 years: 0.05/0.10/0.22/0.23/0.75/0.86) as a bar chart, plus two leaking reservoirs. |
| `fx-pipe` | `from` / `until` (default 2001Q1 / 2011Q4) | USD per AUD (quarterly) above the AUS − US policy-rate gap, with a shared crosshair. The 2008Q4 panic is marked. |
| `fx-prod` | none | USD per 100 JPY, 1980–2000 (annual), with 1985–1995 shaded. |
| `fx-tot` | none | CNY per AUD, 2001–2025 (annual mean of CHN `fxPerUsd` / AUS `fxPerUsd`), with the spec's reference points (2006 ≈ 6.0, 2011 ≈ 6.7, 2026-10 ≈ 4.65) as hollow circles. Below it, the rate gap. |
| `fx-conf` | none | UK 2021-07 to 2023-06, monthly: the 10-year gilt yield above USD per GBP. Two bands: H1 2022 (利差) and Sep–Oct 2022 (减税预算). |
| `fx-calc` | `preset`: `'usdcny'` (default) or `'audcny'` | Sliders for π−π*, i−i*, g−g* (as gaps in points) and for k·ΔToT and RP (as effects, %/year). It shows each term's contribution bar and the result after 10 years, on a scale with the research range, the base, and today's spot. A 追赶型 checkbox scales g by 0.3. Defaults are assumptions that land on the research base (6.02 / 4.01); each slider shows today's reading (2025 CPI gap, 2025Q4 policy-rate gap). The panel states that this is a rough guide with low R². |

**Numbers worth knowing** (all checked by `check_lesson_fx.mjs`):
- Every value typed in the lesson recomputes from the repo's data or the spec, 65 numbers and 18 facts in all. Examples:
  - AUD 0.51 → 1.06 USD (2001Q3 → 2011Q2);
  - rate gap 0.2 / 3.7 / 4.7 points;
  - 2001–2011, AUS inflation was 0.6 points a year above the US;
  - JPY 238 → 94 (×2.5);
  - AUD/CNY 2006 6.0, 2011 6.7 (the highest year), 2025 4.63;
  - gilt yield 2.3 → 3.5 → 4.1%, the biggest monthly jump since 1980;
  - GBP 1.20 → 1.13 → 1.22;
  - US current account negative every year 1995–2025, deepest in 2006 (5.8% of GDP);
  - USD reserve share 57% in 2025, peak 71% in 1999.
- The spec's AUD/CNY values match the data: 2006 = 6.01 and 2011 = 6.68 (annual means). The data ends in 2025Q4 (2025 mean 4.63), so 4.65 for 2026-10 is labelled as the spec's value.
- Iron-ore prices are not in the repo, so the terms-of-trade step gives only a direction for them, and `k` is a free slider.
