# World map + country versions: contract for the parallel work (2026-10-29)

## Agreed with the user
- **Countries:** 6 + 1. ids `USA`, `CHN`, `EA` (euro area), `JPN`, `GBR`, `AUS`, `ROW` (everyone else, so trade sums up).
- **Navigation:** main screen (US water-flow, as now) → **地图** → a country's own water-flow view.
  - In the map, tapping a country only **selects** it: a small card shows 4 readings (资产/债务/利率/大环位置), and its trade and capital pipes light up.
  - A second, explicit button on the card, **「进入 X 的水流图 →」**, enters the country. Pinch/zoom never enters.
- **Same model, other data:** a country view runs the same engine on that country's quarterly data, with a few country parameters.
  - Examples: Australia mostly variable-rate mortgages; Japan near-zero rates; China managed FX.
  - Order of country views: AUS first, then GBR, JPN, EA, CHN.
- **The 国境线 block** in a country's diagram:
  - imports/exports pipes on the goods channel;
  - an FX gate (汇率 = 闸);
  - foreigners buying government bonds (capital inflow).
- **Reserve currency:** shown as "the world's big reservoir". USD is the dominant one; the shares come from IMF COFER.
- **Lessons** live in the existing lesson panel and jump between the main screen, the map and country views. They come in a later batch.
- The user approved downloading any data needed from official sources (BIS, IMF, OECD via FRED, RBA, ABS, ONS/BoE, BoJ, ECB, US Treasury TIC, World Bank, NBS). No need to ask again.

## Data layout (macro-waterflow only; never modify ../dalio_432, which is read-only to us)
- **Raw downloads:** `data_src/world/<source>/...`. One folder per source. Keep the raw files and do not commit huge files (>5 MB); add a `data_src/world/README.md` listing URL + date for each file.
- **Build scripts:** `tools/build_world_data.py` and `tools/build_country_data.py`.
  - Run with `%USERPROFILE%\.venvs\dalio432\Scripts\python.exe -I tools/<script>.py`.
  - Downloaded files are untrusted data: read them, never execute them.
- **`src/data/world.js`** (annual, for the map):
  ```js
  export const WORLD = {
    years: [1995, …, 2025],
    reservedFrom: 2022,                       // the 2022+ hold-out label, as in the US data
    countries: {
      USA: { name: '美国', ccy: 'USD',
        gdpUsd: [...],             // USD bn
        pvtDebtGdp: [...],         // ratio
        govDebtGdp: [...],
        policyRate: [...],         // ratio
        houseReal: [...],          // index, 2010 = 100
        cpiYoY: [...],
        fxPerUsd: [...],           // local currency per USD, annual average; USA = 1
        currentAccountGdp: [...],
        exportsGdp: [...], importsGdp: [...],
        longStage: null | { mark, text } },   // today's ring position from waves.js NOW
      ...
    },
    trade: { USA: { CHN: [...], ... }, ... },  // exports from row to column, USD bn per year
    reserves: { USD: [...], EUR: [...], JPY: [...], GBP: [...], CNY: [...], AUD: [...], other: [...] },   // shares of allocated FX reserves
    ustForeign: { CHN: [...], JPN: [...], GBR: [...], EA: [...], ROW: [...] },   // US Treasuries held by foreigners, USD bn (TIC), end of year
    meta: { sources: {...}, notes: [...] },
  };
  ```
  Arrays align with `years`, with `null` where missing. If a series is impossible, leave it out and say so in `meta.notes`.
- **`src/data/countries/<iso>-quarterly.js`** (one per country, for the country views): `export const AUS_Q = {...}`.
  - **Exactly the shape of `src/data/us-quarterly.js` `US_Q`**: dates 1995Q1–2025Q4, reservedFrom '2022Q1', same series keys, same units (ratios not percents), with `null` where missing.
  - It adds these keys:
    - `fxPerUsd`
    - `exportsGdp`, `importsGdp`
    - `foreignGovHoldShare` (share of government debt held abroad, if available)
  - It also carries `meta.sources` and `meta.notes`.
- **`src/data/countries/index.js`:**
  ```js
  export const COUNTRY_DATA = { AUS: () => import('./aus-quarterly.js').then(m => m.AUS_Q), ... };
  export const COUNTRY_READY = { USA: true, AUS: false, … };   // a view exists and passes its checks
  ```
  Entry points: `USA: () => import('../us-quarterly.js')…`.

## House rules (same as the rest of the project)
- **User and text**
  - The user is a macro beginner and a hydrologist, working in Chinese.
  - UI text is Chinese, short, conclusion first.
  - Never write 同比/环比: say 比一年前 / 比上季.
- **Look**
  - The light theme is the default. CSS uses tokens, and dark rules are guarded by `:root:not([data-theme="light"])`.
  - The iPad is the main device. Check phone 390, iPad 1180×820 and desktop 1920×1000.
- **Code**: static ES modules, relative paths, no build step. Match the surrounding code style.
- **Screenshots**: headless Edge (see `tools/B1B2-CONTRACT.md` for the command), on your own port; stop your servers when done.
- **Do not commit.** Edit only the files assigned to you. Report: changed files, checks, screenshot paths, open questions.

## Addendum (batch 2 starts in parallel): border block interface
- **Snapshot keys** (engine writes them; UI reads them, null-safe: hide everything when `snap.border` is missing):
  ```js
  snap.border = {
    exports, imports,            // flows, same units as snap.flows (local ccy bn per quarter)
    netExports,                  // exports - imports
    fxPerUsd,                    // level; USA = 1
    fxChg4q,                     // ratio change vs 4 quarters ago (+ = local currency weaker vs USD)
    foreignBondBuy,              // flow into the government-bond pool from abroad (bn per quarter; may be negative)
    foreignBondShare,            // share of government debt held abroad (0..1) or null
    reserveShareUsd,             // USA only: USD share of world FX reserves (0..1) or null
  }
  ```
- **Country parameters:** `src/data/country-params.js` exports `COUNTRY_PARAMS[iso]`; USA defaults must reproduce today's engine bit for bit.
- **createSim** accepts `{ data, mode, country }`; `country` defaults to 'USA'. `sim.country` is exposed.
- **The diagram (flow.js)** draws the border as a vertical dashed "国境线" on the diagram edge, with:
  - an exports pipe coming in to the goods channel;
  - an imports pipe going out of the goods channel;
  - an FX gate on the border line with the value;
  - a foreign-bond pipe into the long-bond pool.
  - `?mockBorder=1` injects plausible fake `snap.border` values, so the UI can be built before the engine is.
- **Concept ids** for the border: `exports`, `imports`, `fx`, `foreignBonds`, `reserveCurrency`.

## File ownership right now (avoid collisions)
| Agent | Owns |
|---|---|
| data | `data_src/world/**`, `src/data/world.js`, `src/data/countries/**`, `tools/build_world_data.py`, `tools/build_country_data.py`, `tools/DATA-COUNTRIES.md`, `tools/check_country_data.mjs` |
| map | `src/ui/world-map.js`, `src/ui/world/**`, `assets/css/world.css`, `src/app.js`, `index.html`, `tools/check_map.mjs` |
| engine | `src/engine/**`, `src/data/country-params.js`, `tools/engine_check.mjs` |
| border-UI | `src/ui/flow.js`, `assets/css/app.css` (new section at the end), `src/data/concepts.js`, `src/data/causal.js`, `src/ui/links.js`, `src/data/gauges.js` |
| lessons | `src/ui/lessons.js` (runner), `src/data/lessons.js`, `src/ui/lessons-town.js`, `tools/check_lessons.mjs`, `assets/css/lessons.css` |
