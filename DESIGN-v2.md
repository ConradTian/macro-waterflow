# DESIGN v2 — locked with the user 2026-10-28

Teaching philosophy: teach like a child doing it the first time. Progressive disclosure:
phenomenon → "why?" → reveal → relation to what came before. One diagram throughout.

## 1. One diagram, two scales
- Stage 1 "小镇" (town): the SAME water diagram, small synthetic economy: 镇银行, 5 households
  (小王家、老李家…, aggregated node labelled with names), 10 houses, 小卖部 (shop), 万元 units.
  Simple made-up numbers, one mechanism at a time, delays off at first. Lesson 0 + role lessons run here.
- Stage 2 "美国": same diagram, real US data 1995Q1–2025Q4, 十亿美元 units. Cycle lessons run here.
- Transition = zoom animation on the same diagram: names → "1.2 亿个家庭", 万元 → 十亿美元; layout unchanged.
- No exam stage, no card-sorting. Each lesson ends by DISPLAYING the full causal chain, each link
  tappable → its pipe glows. "猜一猜" predict steps stay (no penalty).

## 2. Diagram parts are of three kinds (water budget)
| kind | drawing | members |
|---|---|---|
| 水泵 PUMP — creates water (money) | pump icon + "+" | bank lending (main pump), central-bank QE, government deficit |
| 排水口 DRAIN — destroys water | funnel/sink icon + "−" | principal repayment (main drain), government surplus, QT |
| 管道 PIPE — only moves water | plain pipe | interest, wages, consumption, asset purchases, taxes, Capex, rent, dividends, coupons |
Plus:
- **水量平衡条** fixed under the diagram each quarter:
  `本季总水量变化 = 泵入(放贷 + QE + 赤字) − 排出(还本 + 盈余) = ±X`
- **债务影子水箱 (欠条箱)** beside the bank pump: every unit pumped adds an equal IOU; repayment
  removes water and IOU together. ("水是凭空来的，但不是白来的")

## 3. Valves vs water levels
- Valves (user-adjustable, drawn as valve icons): 央行 政策利率 · QE 开关; 银行 审批松紧 · LVR 上限;
  家庭 借款意愿 · 储蓄率; 企业 Capex 力度; 政府 财政注入.
- Water levels (outcomes, can't be set): 房价, 股价, 物价, 失业 …
- Turning a valve plays a **propagation ripple**: pipes light up in causal order with delay labels
  (立刻 / 1–2 季 / 2–4 季 / 2–3 年). Example 加息: 政策利率↑ —立刻→ 新房贷利率↑ —1–2季→ 新贷款↓ —2–4季→ 房价↓;
  —重定价 2–3年→ 存量房贷利率↑ → DSR↑ → 银行收紧.
- Taught in lesson 0's last step ("阀门 vs 水位"), in every role lesson ("它能拧哪个阀门"), and
  available any time in the 接管 tab next to each valve.

## 4. Asset reservoir split into 4 sub-pools (cash tank stays separate)
| sub-pool | level | inflow | spring (CF) | special links |
|---|---|---|---|---|
| 房产 | house price | mortgage new water | 租金 ← household income | collateral loop: price → bank approval (feedback pipe); mortgage-rate valve |
| 股票 | equity price | investor allocation | 利润/分红 ← goods channel | firm profits; risk premium |
| 长期国债 | bond price | flight-to-safety money, central-bank QE | 票息 ← government | rate seesaw: rate↑ → price↓; NOT a safe haven in inflationary crises |
| 黄金 | gold price | inflow when trust in money falls | NO spring | real rate↓ → gold↑; no CF, confidence only |
Key teaching point: buying an existing asset = buying water rights; it raises that sub-pool's level but does
NOT widen the goods channel. Only Capex widens the channel — draw these two pipe kinds differently.

## 5. Navigation
- Fixed "教学" button top-right; default load = full interface, history mode.
- Course menu: 入门 (第 0 课, town) → 角色课 (7 roles) → 周期课 (US).
- Free-run mode = subpage `free/` opened in a new window, reachable from inside any lesson.
- Ledger ↔ diagram link: tapping a ledger entry / lamp lights the related pipes.

## 6. Cycle detection: two dials + trail (approved after v2 lock)
Problem: single ring re-decided every quarter by argmax → jumps around; mixes short and long cycles.
- **Long-term debt cycle dial (大周期)**: slow variables only (total/private debt-to-GDP trend, policy rate near
  zero bound, interest/tax, deleveraging). Moves rarely (years). Stages: ① 堆债 ② 缓冲池满 ⑤ 降息失灵/私人去杠杆
  ⑥ 政府接手 ⑦ 金融压制/增长化债 ⑧ 修复. US 1995–2025 roughly: ①② 1995–2007, ⑤⑥ 2008–2014, ⑦ 2010s–2021.
- **Short-term debt cycle dial (小周期)**: driven by the four lamps; moves every few quarters: 扩张 → 过热(B1)
  或 缩水(B2) → 加息/衰退 → 降息重启.
- **Hysteresis**: advance only when evidence points to the next stage for several consecutive quarters; only
  clockwise or stay (fork at B1/B2); when evidence is mixed show "在 ② 与 ③ 之间" instead of picking one.
- **Trail band** under the dials: long cycle as a slowly colour-changing wide band, short cycles as small waves
  inside it, over the whole run — shows short cycles repeating and the long cycle ratcheting forward.
