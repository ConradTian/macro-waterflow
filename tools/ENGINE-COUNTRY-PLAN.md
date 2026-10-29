# Engine audit (read-only, 2026-10-29): running any country, plus the border block

E = `src/engine/economy.js`, R = `regimes.js`, Ru = `rules.js`, Si = `sim.js`, EC = `tools/engine_check.mjs`, F = `src/ui/flow.js`.

## 1. How history mode uses the data
- **Exogenous inputs (E:48-61):**
  - `policyRate`: only when `cb_real_path` is on (E:162).
  - `oilPrice`: the change over 4 quarters (E:577).
  - `gdpRealGrowthYoY`: a quarter more than 5% below a year earlier becomes a shock, `4*max(0,-0.05-g)`.
  - Fiscal policy and QE are rule-driven, not data.
- **Seed at t=0 (E:64-119):** `gdpNominal, hhDebtGdp, privateCreditGdp, govDebtGdp, mortgageRate, policyRate, cpiYoY, hhDsr, unemployment, gov10y`.
  - **A null silently falls back to a US number.** Require non-null t=0 values.
- **Charts only:** `houseIndex, equityIndex, cape, goldIndex, coreCpiYoY, bankCredit`, plus the later values of the seed series.
- **US-calibrated constants:**
  - **Module constants:** `WS .66, USTAR .055, TARGET .02` (E:7-9); `MORT_REPRICE .0992, RATE_SENS, WEALTH_MPC, GAP_SLOPE, ERP*, PE_*, MORT_SHARE .8, REG_TARGET` (E:13-23).
  - **Seed:** `Df` 0.8, `HV0 = MORT_SHARE*Dh/0.38` (LVR 0.38), `gBase .04, gT .022, c0 .15, s0 .07, tau0 .185, spread .017, gold0 .06, M .55·GDP, nxRatio -0.03`; `piE0` clamped to [1%, 5%] (E:74).
  - **Mortgages:** 25% floating at policy + 0.035 (E:457); DSR cap dsr0 + 0.06 (E:478).
  - **Bad loans and the labour market:** LGD at LVR 0.5 (E:495); bad loans at lvr .42 and u .06 (E:641); Okun 0.6 (E:596); profit share .13 (E:602).
  - **Clamps:** 10y yield [0.005, 0.15] (E:451); policy [0, 0.2] (E:188).
  - **Rules:** all absolute thresholds.
    - `cb_taylor rStar .01, floor .0025, debtBase 1.2`
    - `bank_lvr_cap .55`; `hh_overhang/hh_forced_sales lvr .47, u .07`; `bank_tighten_collateral lvr .40`
    - `inv_valuation.ceil 1.36`, which caps the price/income ratio
    - `foreign_trade k .35`
  - **Lamps (R:7-46):** absolute bands; the "起点 4.00" text (R:40) and `PI = 4*…` (E:139).
  - **Cycles:** the `LT`/`ST` thresholds are absolute; `LONG_NEXT`/`B2_TXT` are frozen at module load; the long cycle starts at ①; `CPI_BAND`, `capR .075` and `i2t .25`.
  - **Time:** `HIST_LAST/FREE_LAST` and `qLabel` assume 1995Q1–2025Q4.
  - **Units:** "十亿美元" in F:144,687,981, `gauge.js:60`, `ui/concepts.js:50`, `lessons.js`; "1.2 亿户" in F:144.
  - **Tank scales:** cash `M/GDP/1.4`, IOU box `/2.4` (F:199-200).
  - **US data imported directly:** `gauge.js`, `causal-view.js` and `check_causal.mjs` import `US_Q`.

## 2. Country parameters
- `createSim({data, country='USA'})` merges the country's parameters into K, so `settle`/`decideAll`/`makeView` read `K.x` instead of the module constants.
- `makeRuleParams(cp.rules)` applies rule overrides, and must also be used in `reset` (Si:82).
- USA holds today's numbers exactly. The town stays on USA.
- **AUS starting values:**
  - **Growth and inflation:** `ws` 0.60, `ustar` 0.05, `target` 0.025, `gT` 0.03, `gBase` 0.055, `okun` 0.45, `piE0Lo` 0.01.
  - **Mortgages:** `mortFloatShare` 0.9 (US 0.25), `mortFloatSpread` 0.022, `mortReprice` 0.6 (US 0.099), `mortShare` 0.85.
  - **Leverage:** `lvr0` about 0.22 (US 0.38), with `lvrScale = lvr0/0.38` applied to the absolute LVR thresholds (E:495, 641; the Ru lvr rules).
  - **The 2020 shock:** `shockThr` / `shockGain` (JobKeeper damped unemployment).
  - **Labels:** `cbName` 澳联储, `unit` 十亿澳元, `hhLabel`.
  - **Rules:** `inv_valuation {ceil 2.0, rateElast .45}`, `cb_taylor {debtBase 1.6}`, `hh_forced_sales {u .09}`. AUS unemployment was 8.5% in 1995, so `forced_sales` at `u .07` would fire from the first quarter.
- **JPN:**
  - `policyMin` -0.005, `piE0Lo` -0.01, 10y floor -0.002;
  - `startLong` 6/7;
  - an exogenous QE path (optional `cbAssetsGdp` series) and yield-curve control from 2016;
  - `ustar` .03, `gT` .008, a different cash-tank scale.
- **GBR:** `mortFloatShare` about 0.6, `mortReprice` about 0.25; the 2008 house fall was about -18%; a large border effect (GBP 2008, 2016).
- **EA:**
  - the ECB rate is exogenous and negative (`policyMin` -0.01); data before 1999 is synthetic;
  - `ustar` .08, `mortFloatShare` .4.
- **CHN:**
  - managed FX: a new `fxReserves` pump with sterilisation;
  - state banks: weaker tightening rules and a bad-loan floor;
  - capital controls;
  - LPR mortgages that reprice once a year;
  - a `gT` path from .09 to .045;
  - gaps in house prices before 2005, unreliable unemployment;
  - a property bust from 2021 (B2 → ⑤).

## 3. The border block
- **Exports:** `xR = exportsGdp` from the data; free mode holds the last value.
- **Imports:** `mR = K.m0 + foreign_trade.k*clamp(pressure)`. This generalises `dec.nx` (E:415).
- **Net exports:** `nxRatio = xR − mR`. Demand only reacts to changes in `nxRatio` (E:568), so a constant US `xR = K.m0 − 0.03` leaves US demand unchanged.
- **FX:** `fxYoY` = the log change in `fxPerUsd` over 4 quarters; `fxPush = K.fxPass*clamp(fxYoY, ±.3)` with `fxPass` about 0.04, added next to `oilPush` (E:579). Export competitiveness = 0 in history mode.
- **Foreign bond buying:** `yForeign = −K.kForeign*(f_t − f_0)`, capped at −1pp, `kForeign` about 0.02, added to the 10y yield (E:450). Flow: `foreignToBond = max(0, f_t·Dg_t − f_{t−1}·Dg_{t−1})`.
- **Accounting:** under a float, the border flows are pipes, so M does not change. Do not add `foreignToBond` to `toBond`, or the identities at EC:45-55 break. China adds `budget.pumpedIn.fx` later.
- **Snapshot:** `snap.border` per WORLD-CONTRACT. For the US, `borderFeedback` is off; whether to show `reserveShareUsd` only is the engine agent's call. Also `flows.exports/imports/foreignToBond`, `yParts.foreign`, and a cause row 汇率/进口价格 under `causal['macro.inflation']`.
- **flow.js layout idea:**
  - A horizontal border band under the springs: `VB_H` 472 → about 505, dashed 国境线 at y≈478.
  - **出口** rises into the goods channel at x≈362; **进口** drops out at x≈330. The channel spans x 244-384 and has empty space from y 390 to 478.
  - The FX gate sits at about (346, 478).
  - **外国买国债** rises into the bond pool at x≈16, which avoids the coupon spring at x=33.
  - Shorten the 资产池 caption (F:450) where it crosses the band.
  - Append the new pipes to `PIPES` with `part:'border'`, keeping the pipe/chip order. Hide them when `!snap.border`.
  - The phone view crops at 434 (F:20).
- **causal.js:**
  - Edges `goodsChannel→imports +`, `imports→goodsChannel −`, `exports→goodsChannel +`, `exports→income +`, `fx→cpi +`, `foreignBond→discountRate −`.
  - Tag them `{only:'border'}`, like `only:'free'`, and teach `propagate` to filter on it.
  - No new valve: EC:327 asserts that there are 8 valves.

## 4. AUS targets (`tools/targets/aus.mjs`)
1. **House prices:** 2008-12 peak to trough at most −10%; end-2025 within ±40% of real; 2017-19 dip of 5-12% (soft).
2. **Unemployment:** 2009 peak 5.5-6.5%; 2020 peak 6.5-8.5% and never above 9%; at most 7% over 2008-16.
3. **Inflation:** the 2021-23 peak is at least 5%, dated 2022Q2..2023Q2; the 2005-07 average is at most 4%.
4. **Household debt/GDP:** at least 105% by 2010; about 120% (±15pp) by 2025; 2020Q4 no more than 8pp below its peak.
5. **Credit and DSR:**
   - The credit impulse 2008-10 has min < 0, but is negative in at most 6 of 10 quarters.
   - The DSR peaks in 2008.
   - The DSR rises at least 2pp from 2022Q2 to 2023Q4. This is the variable-rate test.
6. **Equities (ASX):** 2007Q4→2009Q1 between −55% and −35%; 2009-21 between +100% and +250%; no quarter moves more than 25%; end-2025 within ±50%.
7. **Cycles:** no B2 and no ⑤ in 1995-2025; the long cycle stays in ①/② (⑥ is allowed from 2020).
8. **Rate path (soft):** with `cb_real_path` off, the Taylor path correlates at least 0.6 with the RBA cash rate.

**Tuning order:** mortFloatShare/mortReprice → inv_valuation → lvr0/lvrScale → ustar/okun/shockGain → fxPass/kForeign → bank_loosen.max → hh_chase.up.

**engine_check:**
- `--country AUS|USA|ALL`; generic checks for every country; the scorecard comes from `tools/targets/<iso>.mjs`, with the US rows moved there verbatim.
- US-only checks: experiments, lesson numbers, valve labels, the dated cycle asserts, town.
- `COUNTRY_READY[iso]` becomes true only with 0 failures.

## 5. Risks and order
- **Risks:**
  - Lesson numbers drift with any refactor.
  - `check_causal` fails when a card has no edges.
  - Concept-card units say 十亿美元.
  - The AUS valuation lamp shows red permanently from about 2003; this needs a caption.
  - Cycle texts are frozen at module load.
  - Seed fallbacks are silent.
  - Negative rates break the clamp at E:188 and the assert at EC:63.
  - The town shares `seed`.
- **Order:**
  1. A golden fingerprint (hash of history JSON for US history, US free and town).
  2. Country params, US identical.
  3. AUS data check.
  4. engine_check per country.
  5. Border engine, off for the US.
  6. AUS calibration.
  7. UI: country labels and units, the border band, `gauge.js` / `causal-view.js` country argument.
  8. Causal nodes and cards with `only:'border'`.
  9. Gate the US lessons.
  10. GBR, JPN, EA, CHN.
