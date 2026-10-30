// Data for the 「汇率」 lesson (src/data/lesson-fx.js) and its panels (src/ui/fx-lab.js).
// Two kinds of numbers, kept apart:
//   SPEC   numbers from the parent research (../dalio_432/closeout/handover_macro.md §4.2, scripts/fx_model.py; JST 1973–2020,
//          17 countries vs USD) and the approved lesson spec (2026-10 scenarios). Not recomputable here: the JST panel is not in this repo.
//   SERIES short extracts of the raw FRED files in data_src/world/fred (monthly averages). tools/check_lesson_fx.mjs recomputes every
//          value from those CSVs, so a typo cannot slip in. Quarterly FX / rates come straight from src/data/countries/*-quarterly.js.

export const FX_SPEC = {
  source: 'JST 宏观历史数据 1973–2020，17 国对美元（研究：dalio_432 fx_model.py）',
  countries: 17, from: 1973, to: 2020,
  // share of FX changes explained by the inflation gap alone (R²), non-overlapping windows of h years
  r2: [{ h: 1, r2: 0.05 }, { h: 2, r2: 0.10 }, { h: 5, r2: 0.22 }, { h: 10, r2: 0.23 }, { h: 20, r2: 0.75 }, { h: 40, r2: 0.86 }],
  r2Full5y: 0.32,                                   // 5-year model with all variables
  fit5y: { infl: 1.46, rate: -0.62, prod: -0.82, ca: 0 },   // fitted 5y coefficients (current account ≈ 0)
  rule: { infl: 1.0, rate: 0.6, prod: 0.8 },        // the rounded formula: Δs ≈ 1.0·(π−π*) − 0.6·(i−i*) − 0.8·(g−g*) − k·ΔToT + RP
  catchUpG: 0.3,                                    // catch-up economy (China): scale the g coefficient by about 0.3
  horizon: 10,                                      // calculator horizon, years
  asOf: '2026-10',
  // 10-year scenarios (quote = units of the quote currency per 1 unit of the base currency; home currency = CNY in both)
  scen: {
    usdcny: { base: 'USD', quote: 'CNY', spot: 6.71, mid: 6.0, lo: 5.2, hi: 7.0 },
    audcny: { base: 'AUD', quote: 'CNY', spot: 4.65, mid: 4.0, lo: 3.4, hi: 4.6 },
  },
  // AUD/CNY reference values named in the spec (terms-of-trade step)
  audcnyRef: [{ at: 2006, v: 6.0, label: '2006 约 6.0' }, { at: 2011, v: 6.7, label: '2011 约 6.7' }, { at: 2026.79, v: 4.65, label: '2026-10 约 4.65' }],
};

// JPY per USD, calendar-year mean of FRED EXJPUS (monthly average)
export const JPY_ANNUAL = {
  source: 'FRED EXJPUS（日元/美元，月平均）→ 按年平均',
  years: [1980, 1981, 1982, 1983, 1984, 1985, 1986, 1987, 1988, 1989, 1990, 1991, 1992, 1993, 1994, 1995, 1996, 1997, 1998, 1999, 2000],
  jpyPerUsd: [226.58, 220.45, 249.05, 237.45, 237.59, 238.47, 168.5, 144.62, 128.14, 137.99, 144.82, 134.51, 126.75, 111.23, 102.2, 94.11, 108.8, 121.09, 130.82, 113.71, 107.82],
};

// UK 2021-07 .. 2023-06, monthly: USD per GBP (FRED EXUSUK, monthly average) and the 10-year gilt yield in % (FRED IRLTLT01GBM156N)
export const UK_MONTHLY = {
  source: 'FRED EXUSUK（美元/英镑，月平均）、IRLTLT01GBM156N（英国 10 年期国债利率，月平均）',
  months: ['2021-07', '2021-08', '2021-09', '2021-10', '2021-11', '2021-12', '2022-01', '2022-02', '2022-03', '2022-04', '2022-05', '2022-06', '2022-07', '2022-08', '2022-09', '2022-10', '2022-11', '2022-12', '2023-01', '2023-02', '2023-03', '2023-04', '2023-05', '2023-06'],
  usdPerGbp: [1.3808, 1.3797, 1.3732, 1.3701, 1.3463, 1.3303, 1.3555, 1.354, 1.3168, 1.2933, 1.2438, 1.232, 1.1987, 1.1983, 1.132, 1.1332, 1.1727, 1.218, 1.2237, 1.2084, 1.2138, 1.2446, 1.2484, 1.2627],
  gilt10y: [0.6979, 0.644, 0.8023, 1.083, 0.9394, 0.8375, 1.2051, 1.4891, 1.5457, 1.8362, 1.9069, 2.3824, 2.1454, 2.3278, 3.5007, 4.1096, 3.4171, 3.5015, 3.5115, 3.5553, 3.5638, 3.6503, 3.9621, 4.3659],
};

// the five forces: one colour each, used by every panel (CSS --fx-* in assets/css/fx-lab.css). Order = the formula's order.
export const FX_FORCES = [
  { key: 'infl', name: '通胀差', sym: 'π−π*', push: '通胀高 → 本币弱', when: '长期（20 年以上）', step: 1 },
  { key: 'rate', name: '利差', sym: 'i−i*', push: '利率高 → 本币强', when: '短中期（几个季度到几年）', step: 2 },
  { key: 'prod', name: '生产率', sym: 'g−g*', push: '生产率快 → 本币强', when: '长期（十年）', step: 3 },
  { key: 'tot', name: '贸易条件', sym: 'ΔToT', push: '卖的东西变贵 → 本币强', when: '跟着商品周期', step: 4 },
  { key: 'conf', name: '信心', sym: 'RP', push: '没信心 → 本币弱', when: '突然（几天到几周）', step: 5 },
];
