# A+B package: role cards, goods outlets, objective strip, schematic fixes (2026-10-29)

Approved by the user via the Ray-Dalio-Framework session. Parts A and B only. Courses (C), FX/investor lessons (D) and 历史盲测 (E) come later — do not start them.
House rules: the "House rules for everyone" section of `tools/B1B2-CONTRACT.md` (language, light theme, iPad first, screenshots, no commits).
**Keep structure changes minimal.** Do not touch the engine (`src/engine/*`).

## A. Small additions
1. **Role cards.** A fixed 4-line card per role: 想要什么 / 盯着什么 / 能拧什么 / 常犯的错（和总目标的冲突）.
   - 央行：物价约 2%、就业稳｜CPI、失业率、实际利率｜政策利率、QE｜只看物价，看不见资产泡沫
   - 银行：赚利差、不出坏账｜房价（抵押品）、坏账率、资本｜审批松紧、LVR｜繁荣时放太多，萧条时一起收
   - 家庭：有房住、生活变好｜房价、月供/收入、工作｜借多少、存多少｜追涨借太多；出事后一起省钱，压低别人的收入
   - 企业：利润｜订单（需求）、融资成本｜Capex｜繁荣时一起扩产 → 产能过剩
   - 政府：稳定、就业（各国权重不同）｜失业率、利息/税收、债务｜支出、税收｜刺激收太早（日本 1997），或钱给错地方
   - 投资者：扣掉通胀后的回报｜各资产涨幅、实际利率｜新钱进哪个池子｜追涨杀跌，放大波动
   - 外国人：收益和安全｜利差、汇率、赤字｜买不买你的东西和国债｜风险一来一起撤
   - 整个经济（第 8 张）：长期运出最多的真实东西给人用（累计真实消费）｜四个扣分项：泛滥（通胀偏离目标）、干涸（失业、产能闲置）、溃坝（金融危机 / B2）、透支（债务/收入过高）
   - Localise per country through `src/ui/country-info.js` (central-bank name; the AUS target is 2–3%).
2. **Goods-channel outlets.** Label four outlets at the end of the channel: 家庭消费 / 企业投资（变成更宽的河道）/ 政府购买 / 净出口.
   - Add one income-return loop arrow: 花钱 → 企业 → 工资、利润 → 家庭.
   - Message: water is not used up, it circulates; goods are used up; GDP = what the four outlets take.
   - **Data:** the existing `flows.toConsumption` pipe is only the household's extra spending, not GDP consumption. The outlets read `household.consumption`, `firm.capex`, `gov.spending` (or the engine's real G), and `border.netExports` (0 when there is no border). Check that they sum to `macro.gdpNominal`/4 within a few % and document the residual if not.
3. **实际利率** next to 政策利率 (nominal − inflation, `rates.realPolicy`). It is the real master valve used by the Capex, bond, gold and ⑦/⑧ rules.
4. **Total-objective strip.** One line plus four penalty lamps:
   - 泛滥: |inflation − target|; green < 1pp, amber 1–2.5pp, red > 2.5pp.
   - 干涸: unemployment − normal rate (u*); green < 1pp, amber 1–3pp, red > 3pp.
   - 溃坝: red when the long cycle is on B2 or in ⑤; amber when bad loans are above their band; else green.
   - 透支: the worse of the debt-service (DSR) lamp and the 利息/税收 lamp (`computeLamps` in `regimes.js`), so a ⑥/⑦ government debt build-up also lights it.
   - Score: **每人真实消费**, cumulative real consumption per person, 1995 = 100 (or the first quarter shown).
     - The game data has no population yet. Add World Bank `SP.POP.TOTL` (annual, all 6 countries + EA aggregate, 1995–latest) to `src/data/world.js` through `tools/fetch_world_data.py` → `data_src/world/worldbank/` → `tools/build_world_data.py`. Downloads are pre-approved; follow the existing pattern (untrusted data, `python -I`). Interpolate to quarters in the UI and hold the last year flat.

## B. Schematic fixes (no restructure; in order of impact)
1. **Goods channel = width × depth.** Width = capacity, water depth = demand / capacity (`macro.demandPressure`, `outputGap`).
   - Water below the bank = 闲置（失业）; overflow above the bank = 溢出（通胀）.
   - No 3D. Keep the 2D plan view and add a small 2D channel **cross-section** inset: width, depth, freeboard.
2. Make the income loop visible as **one big loop** instead of scattered small pipes.
3. The 欠条箱 (debt) already exists: make it prominent, next to the cash tank, so debt visibly outgrows water. Label it 「欠条 x% GDP / 水 y% GDP」.
4. **Flows show as % of GDP by default** (annualised: quarterly flow × 4 ÷ GDP, the same as the gauges). Absolute numbers (十亿) and details only on tap. Pipe thickness proportional to flow.
5. **Three pipe colours only:** pump (creates water) = blue +, drain (destroys water) = red −, ordinary pipe = grey. Add one legend line. The four asset pools keep their own water colours. 付息 is an ordinary (grey) pipe. Keep light and dark tokens.
6. **Asset pools:** add a 历史正常区间 band (above = 贵, below = 便宜) instead of a bare index.
7. = A3.

## File ownership
| Agent | Owns | Items |
|---|---|---|
| diagram | `src/ui/flow.js`, `assets/css/app.css` (flow-svg rules only), `src/data/gauges.js` (only if a gauge needs it) | A2, A3, B1–B6 |
| roles | new `src/data/role-cards.js`, `src/ui/concepts.js`, `src/ui/tabs/takeover.js`, new `assets/css/roles.css` | A1 |
| objective | new `src/ui/objective.js`, new `assets/css/objective.css`, `src/app.js` (mount only), `index.html`, `free/index.html` (link tags and the mount point), `tools/fetch_world_data.py`, `tools/build_world_data.py`, `src/data/world.js` (population only) | A4 |

- The roles agent may need `roles.css` linked in both HTML files: ask the objective agent's owner (the orchestrator) by noting it in the report; the orchestrator adds the link tag.
- `src/ui/lessons.js` pairs pipes and chips **by index**. Keep pipe and chip counts equal and keep the border pipes last.

## Checks (all must stay green)
- `node tools/engine_check.mjs` and `--country AUS`; `check_lessons`, `check_role_lessons`, `check_concept_why`, `check_causal`, `check_gauges`, `check_headline`, `check_causal_view`.
- Browser: `ui_clickthrough`, `cv_clickthrough`, `check_pin`, `check_view`, `check_map`, `check_scrubber`, `check_country_ui` (each needs its own server on its port, see the file header).
- Screenshots at phone 390, iPad landscape 1180×820 and desktop 1920×1000, for the US (t=52 2008Q1, t=60, t=110) and AUS (`?country=AUS`).
