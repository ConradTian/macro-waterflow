# Country scout: GBR, JPN, EA, CHN (2026-10-30, read-only burst)

Can the four countries that are not yet enabled get their own main diagram? This doc records what the engine check and a model-vs-real comparison show today, which data is missing, and the smallest next step for each country. No app files were changed.

## 0. Conclusion first

| Order | Country | State today | Main blocker | Smallest next step |
|---|---|---|---|---|
| 1 | **GBR** | Data almost complete. The engine **blows up with NaN from 2020Q2** (873 failures). | Real GDP fell 21.7% year on year in 2020Q2, and the lockdown reader amplifies that ×4, so unemployment reaches 40% and then NaN. | Add `COUNTRY_PARAMS.GBR` with `shockMult: 1, slackVsCapEff: true, shockLayoff: 0.05` (furlough scheme). In a scratch trial this removes the NaN; u RMSE is 1.7pp and the CPI peak is 8.7% (real 9.4%). |
| 2 | **EA** | Engine runs (3 failures, all because params are missing). Calibration is far off: 10y yield 10.2% and gov debt 177% by 2025. | 2020Q2 at −13.9% blows up the same way. hhDebt/GDP is missing at t=0, so the US 65% is used (real 1999 value: 46%). The sovereign crisis (u 12.3% in 2013) has no mechanism. | Same shock fix as GBR, plus a short EA seed (`hhDebtGdp .46, privateCreditGdp 1.12, govDebtGdp .70, mortgageRate ≈ .06`). After that, 10y and gov debt fall back to 4.2% and 106%. |
| 3 | **CHN** | Engine runs (3 failures, all because params are missing). Data has the most holes. | No 10y yield, no mortgage rate, no core CPI and no DSR. hhDebt starts in 2006, so the 1995 value falls back to the US 65% (real 2006 value: 11%). Unemployment is an annual ILO modelled value. The model misses the 2021-25 property bust entirely (real −21%, model 0%). | Data first. Backfill hhDebt at about 8-10% for 1995. Use 10y CGB yields from ChinaBond/PBoC and the 5y+ LPR / benchmark lending rate as the mortgage rate. Then write `COUNTRY_PARAMS.CHN` with a gT path and once-a-year repricing. |
| 4 | **JPN** | Engine runs, but with **67 failures** (negative rates, floating-point tolerance at yen scale). The calibration is the furthest off of all. | The engine cannot produce post-bubble deflation. House prices: model +145%, real −36% for 1995-2007. CPI averages 2.8% in the model, real −0.2% for 1998-2012. Gov debt: model 74%, real 220%. | Engine work first: `policyMin < 0`, a `piE0Lo` below zero, a long cycle that starts at ⑥/⑦, and a relative tolerance in EC. Treat Japan as a separate engine round. Do not fit parameters first. |

Why this order: GBR is most like AUS (floating mortgages, full BIS DSR / house prices / credit), and one parameter fixes it. EA mainly needs a seed and the shock fix. CHN is blocked by data. JPN is blocked by engine structure.

## 1. `engine_check --country XXX` results

You don't need `--force`. `engine_check.mjs` runs any `src/data/countries/<iso>-quarterly.js`, and when `COUNTRY_PARAMS[iso]` is missing it **silently uses the USA params** (sim.js:23). No target table exists for these four (`COUNTRY_TARGETS` only has AUS), so only the generic checks run.

| Country | Failures | Breakdown |
|---|---|---|
| GBR | **873** | 1 params missing. 2 border checks. NaN/Inf: 3,403 values in history mode and 19,733 in free mode, starting at 2020Q2 (`bank.badLoanRate`, `household.lvr`, `equity.price/pe`). About 860 knock-on failures after the NaN (budget identity / M chain / iou / toFinancial / new flows), 144-146 each. |
| JPN | **67** | 1 params missing. 2 border checks. 21 `policy range` (the data has −0.1% for 2016-2024, but EC:68 asserts `policy >= 0`; the loop stops after 25 failures, so the real count is higher). 31 `budget identity`: the absolute tolerance of 1e-9 is too tight at yen scale (GDP about 6×10^5 bn), so this is a tolerance problem, not an accounting error. 12 `new flows sane` in free mode from 2026Q3 (cause not yet found; probably a negative coupon or rent at negative rates). |
| EA | **3** | 1 params missing. 2 border checks. |
| CHN | **3** | 1 params missing. 2 border checks. |

- **The border checks are an artefact of the fallback.** `borderChecks` requires `fxPerUsd === 1` whenever `cp.iso === 'USA'`. The fallback uses the USA params, but the country's own exchange rate is not 1, so the check fails. It goes away once the country has its own params.
- **The free-mode ratchet** (rate troughs non-increasing, debt/GDP trending up) prints FAIL for all four countries, but it is not counted.
- **Seed fallback (silent):**
  - JPN is missing `govDebtGdp` and `mortgageRate`.
  - EA is missing `hhDebtGdp`, `privateCreditGdp`, `govDebtGdp` and `mortgageRate`.
  - CHN is missing `hhDebtGdp`, `govDebtGdp`, `mortgageRate` and `gov10y`.
  - The values used are **US numbers**: hhDebt 65%, gov 50%, mortgage 7.65%, 10y 6.5%.

## 2. Calibration gaps (model vs real, USA fallback params)

These rows are not formal targets yet. They are a proxy scorecard built on the AUS target style (`tools/country_scout.mjs`) and show how far off each country is. Write the formal targets into `tools/targets/<iso>.mjs` / `COUNTRY_TARGETS` later.

| Item | GBR model / real | JPN model / real | EA model / real | CHN model / real |
|---|---|---|---|---|
| House prices 1995→2007 | +86% / **+236%** | +145% / **−36%** | +3% / **+84%** | n/a (real data from 2005) |
| House max drawdown 2007-13 | −25% / −18% | −6% / −6% ✓ | −23% / −7% | 0% / −2% ✓ |
| House max drawdown 2021-25 | 0% / −4% | −1% / −1% ✓ | 0% / −3% | **0% / −21%** |
| House end-2025 vs real | NaN | **+476%** | **+122%** | +29% (within ±40%) |
| Unemployment peak 2008-13 | 8.8% / 8.4% ✓ | 11.4% / 5.4% | 9.3% / **12.3%** | 6.8% / 4.7% |
| Unemployment peak 2020-21 | **39.9%** → NaN / 5.2% | 13.6% / 3.1% | 22.3% / 8.5% | 9.7% / 5.0% |
| Unemployment RMSE | 3.9pp | 3.0pp | 3.9pp | 2.8pp (real series unreliable) |
| CPI average 1998-2012 | 2.5% / 2.1% ✓ | 2.8% / **−0.2%** | 2.5% / 2.0% ✓ | 3.0% / 1.9% |
| CPI peak 2021-23 | NaN / 9.4% | 8.0% / 3.9% | 17.1% / 10.0% | 5.3% / 2.7% |
| hh debt/GDP max | 77% / 98% | **147% / 70%** | 93% / 63% | 66% / 61% (seed 65% vs real 11%) |
| DSR 1999 / 2008 / 2025 | 11.7/12.3/NaN vs 9.1/13.3/8.8 | 11.3/10.8/9.0 vs 8.8/7.6/7.5 | no real data | no real data |
| Gov debt/GDP max | 76% / 106% | **74% / 220%** | **177% / 98%** | 83% / 99% |
| 10y yield 2025Q4 | NaN / 4.52% | 2.90% / 1.84% | **10.24% / 3.17%** | 4.90% / no data |
| Equities 2007Q4→2009Q1 | −16% / −42% | −1% / −50% | −17% / −55% | +1% / −56% |
| First ⑤ / first B2 | 2010Q3 / 2009Q2 | never / never | **2005Q1** / never | **1998Q2** / never |
| Taylor rule vs real policy rate (corr) | −0.06 | −0.14 | 0.19 | 0.45 |

**The same problem in all four:**
1. **The lockdown shock reader.** `shockFloor −5%` and `shockMult 4` turn a large GDP fall into a huge shock: GBR −21.7%, EA −13.9%, JPN −9.5%. AUS's `shockMult 6` is worse, and GBR/EA still give NaN with the AUS template. Trial with `--set shockMult=1,slackVsCapEff=true,shockLayoff=0.05` on the USA params:

   | | u peak 2020-21 | u RMSE | Other |
   |---|---|---|---|
   | GBR | 11.1% (real 5.2%) | 1.7pp | no NaN |
   | EA | 9.5% (real 8.5%) | 3.5pp | 10y 4.17%, gov debt 106% |
   | JPN | 6.5% (real 3.1%) | — | — |

   A better version is to cap the shock directly, such as `shock ≤ 0.15`. That would be a general engine guard.
2. **The early ⑤ comes from the seed.** EA's ⑤ at 2005Q1 and CHN's at 1998Q2 happen because the US debt/GDP seed is far above the real level. Model debt/GDP then "falls 5pp from its high", which looks like a deleveraging.
3. **The Taylor rule correlates badly** in all four: the US `rStar`/`debtBase` don't fit. This is a soft target and comes later.

## 3. Data series: what the engine and the real-data layer need, and what is missing

### 3.1 Engine file (`src/data/countries/<iso>-quarterly.js`, built by `tools/build_country_data.py`)

✓ present, ≈ substitute or short, ✗ missing. Numbers in brackets are the non-empty quarters out of 124.

| Series | Use | GBR | JPN | EA | CHN |
|---|---|---|---|---|---|
| policyRate | input | ✓ BIS | ≈ BIS + call-rate patch | ≈ ECB MRO; Germany before 1999 (**deposit rate −0.5% not used**) | ≈ benchmark lending rate (not 7-day reverse repo / LPR) |
| gdpNominal / gdpRealGrowthYoY | input / shock | ✓ | ✓ | ✓ (real from 1996) | ≈ NSA 4-quarter sum; real growth before 2012 is annual |
| oilPrice | input | ✓ | ✓ | ✓ | ✓ |
| hhDebtGdp | seed | ✓ | ✓ | ≈ from 1999 (108) | **≈ from 2006 (80)** |
| privateCreditGdp | seed | ✓ | ✓ | ≈ from 1999 | ✓ |
| govDebtGdp | seed | ✓ | ≈ from 1997Q4 | ≈ from 2000 | ≈ from 1995Q4 |
| mortgageRate | seed | ≈ SVR quotes | **✗** | ≈ ECB MIR from 2003 | **✗** |
| gov10y | seed | ✓ | ✓ | ✓ (EA aggregate) | **✗** |
| cpiYoY / unemployment | seed | ✓ | ✓ | ✓ | ✓ / **≈ ILO annual value** |
| hhDsr | seed / check | ✓ from 1999 | ✓ from 1999 | **✗** | **✗** |
| houseIndex | chart / check | ✓ | ✓ | ✓ | **≈ from 2005Q2** |
| equityIndex | chart / check | ≈ OECD | ≈ | ≈ | ≈ from 1999 |
| coreCpiYoY | chart | ✓ | ≈ to 2021Q2 | ✓ from 1997 | **✗** |
| bankCredit | chart | ≈ BIS | ≈ | ≈ from 1997 | ≈ |
| exportsGdp / importsGdp / fxPerUsd | border | ≈ WB annual | ≈ to 2024 | ≈ **includes intra-EA trade** (about 2× too large) | ≈ |
| foreignGovHoldShare | border, 10y | **✗** | **✗** | **✗** | **✗** |
| govDeficitGdp / govInterestGdp | fiscalRealPath | **✗** | **✗** | **✗** | **✗** |
| cape | equity valuation | ✗ | ✗ | ✗ | ✗ |
| cbAssetsGdp (planned) | JPN exogenous QE / YCC | — | **✗** | nice to have | — |
| fxReserves (planned) | CHN managed FX | — | — | — | **✗** |

### 3.2 Real-data layer (`src/data/real/<iso>-real.js`; today only usa/aus exist)

Only USA and AUS have one, so **all four countries are missing the whole file**. Beyond the engine series, the real-data layer also needs:
- `money` / M2 or M3
- `badLoans`
- `outputGap`
- `outC/I/G/NX`
- `qeGdp`
- `govInterestToTax`
- `privateCredit` (stock)
- `cpiIndex`
- population or households (for the PIrel house price/income ratio)

The proxy table (`PROXY`) needs `ci, pcg, PIrel, peRel, dsr0, bad, qeGdp, defGdp, i2t, gap`.

### 3.3 Candidate official sources

| Gap | GBR | JPN | EA | CHN |
|---|---|---|---|---|
| Mortgage rate | BoE IADB: effective rate on the stock of mortgages (CFMBJ…) is better than SVR quotes | BoJ: average contract interest rates on new loans (housing); or JHF Flat35 | ECB MIR: cost of borrowing for house purchase before 2003, by national series | PBoC: weighted average lending rate on individual housing loans (quarterly monetary policy report, from 2008); 5y+ LPR (from 2019) |
| 10y yield | — | — | ECB SDW YC / national | ChinaBond CGB 10y; PBoC; or the Investing/CEIC proxy (watch the licence) |
| DSR | — | — | **Construct**: BIS TC hh debt × (MIR rate + 1/maturity) / disposable income (ECB QSA) | **Construct**: as for EA, with PBoC hh loans + NBS income |
| hh debt before 2006 | — | — | ECB QSA from 1999 | PBoC household loan stock (Sources & Uses of Credit Funds, from about 1997) / NBS |
| House prices before 2005 | — | — | — | NBS 70-city / average sales price per m² (from 1998) |
| Unemployment | — | — | — | NBS surveyed urban rate (from 2018); before that the registered urban rate (badly understated). Keep the ILO value as the main series. |
| Fiscal deficit / interest | ONS PSF (PSNB, debt interest, monthly) | MoF / Cabinet Office SNA general government | Eurostat gov_10q_ggnfa (quarterly) | MoF budget (annual); IMF Article IV augmented deficit |
| Central bank assets | BoE balance sheet (APF) | BoJ accounts | ECB SDW ILM | PBoC balance sheet, FX reserves (SAFE) |
| Foreign holdings of gov bonds | ONS/DMO overseas gilt holdings | MoF/BoJ flow of funds (overseas share of JGBs) | ECB SHS (patchy) | ChinaBond foreign custody (from 2014) |
| Bad loans | BoE / PRA arrears (FCA MLAR) | FSA disclosed NPLs | ECB SSM NPL (from 2015) | CBIRC NPL ratio (from 2005) |
| Core CPI | — | Japan MIC "core-core" CPI (excluding fresh food and energy); fills the gap after 2021Q2 | — | NBS core CPI (from 2013) |
| Exports/imports | ONS quarterly national accounts | Cabinet Office SNA quarterly | **Eurostat extra-EA trade** (excludes intra-EA trade) | NBS / SAFE balance of payments |

## 4. Smallest next step for each country (in order)

1. **GBR (about 1 round)**
   - Add `COUNTRY_PARAMS.GBR = {...USA_BASE, iso:'GBR', ccyUnit:'十亿英镑', cbName:'英格兰银行', shockMult:1, slackVsCapEff:true, shockLayoff:0.05, mortFixed≈0.5, mortReprice≈0.25, piTarget .02}`.
   - Run `engine_check --country GBR` and get 0 NaN first.
   - Then write `scorecardGBR`:
     - Houses: 2007-09 peak to trough −12..−22%; 1995→2007 at least +150%.
     - Unemployment: 2011 peak 7.5-9%; 2020 peak at most 7%.
     - Inflation: 2022 CPI peak 8-11%.
     - Household debt/GDP: peak 90-105% in 2008-10.
     - DSR: 2022Q2→2023Q4 rises at least 1pp (the fixed-rate cohort is rolling off).
     - Cycles: whether ⑤ is allowed in 2008-10 is a human call. UK QE plus deleveraging arguably counts.
2. **EA (about 1-2 rounds)**
   - Shock fix plus an EA seed (hhDebt .46 / pvt 1.12 / gov .70 / mortgage ≈ .065).
   - `policyMin -0.005` (use the deposit rate as the policy rate, or add a `depositRate` series).
   - Replace the trade data with extra-EA trade.
   - Leave the 2011-13 sovereign spread out of the targets for now (no mechanism).
3. **CHN (data first)**
   - Fill in the 10y yield, the housing loan rate and hh debt before 2006, and construct a DSR. Then write params with a gT path (.09 → .045), `mortReprice ≈ 0.25` (repricing once a year), and weaker bank tightening.
   - The main target is that the 2021-25 house drawdown appears (real −21%) and B2/⑤ appear after 2021.
4. **JPN (engine first)**
   - Allow negative rates: E:188 clamp, EC:68 assert, `policyMin`.
   - Let `piE0` go below 0.
   - Set the long cycle's starting stage (`startLong` 6/7).
   - Change the accounting assert to a relative tolerance (`1e-12 × M`).
   - Feed `cbAssetsGdp` / YCC in as exogenous inputs.
   - Then write targets: deflation in 1998-2012, house prices falling 1995-2005, gov debt above 150%.

## 5. Reproduce

```
node tools/engine_check.mjs --country GBR        # likewise JPN / EA / CHN
node tools/b7_coverage.mjs                        # coverage table for the six countries
node tools/country_scout.mjs [ISO...] [--tpl AUS] [--set shockMult=1,slackVsCapEff=true,shockLayoff=0.05]
```
`b7_*` are scratch scripts. `--tpl` / `--set` change `COUNTRY_PARAMS` in memory only and touch no files.
