# CONTRACT — 模块接口约定 (v0.1, rough build)

All agents MUST follow this file. Do not change it; if something is missing, add it inside
your own files and report it to the orchestrator.

## 0. Ground rules
- Static site for GitHub Pages: plain HTML + CSS + vanilla JS ES modules. No build step, no npm,
  no frameworks, no CDN except none. Must work when served from `https://conradtian.github.io/macro-waterflow/`
  → use **relative** paths only (`./src/...`).
- Mobile first (390×844 portrait). Responsive: ≥ 768px wide (iPad / desktop) switches to two columns
  (flow diagram left, tabs right). Same code, CSS media queries only.
- UI language: Chinese. Abbreviations (DSR, LVR, Capex, CF, CPI, QE…) stay in English but are always
  rendered as clickable terms: `<button class="term" data-term="dsr">DSR</button>` (see §5).
- Toy model: direction & structure only. Never hard-code outcomes ("B2 happens in 2007"). Dalio stage labels
  are DETECTED from state, never used to set prices.
- UI never mutates economic state. It only calls `sim` methods (§3) and reads snapshots.
- Units: rates/ratios are decimals (0.05 = 5%), annualised. Money amounts are nominal US$ bn, annualised
  for flows-of-income (GDP, income, taxes), **per quarter** for the `flows` block. Price indices = 100 at 1995Q1.
- Quarter strings: `"1995Q1"`. Index `t = 0` is 1995Q1.

## 1. Real data module — `src/data/us-quarterly.js` (owner: DATA agent)
```js
export const US_Q = {
  dates: ['1995Q1', ..., '2025Q4'],          // 124 quarters
  reservedFrom: '2022Q1',                     // label later quarters "保留样本，仅示意"
  series: {                                   // arrays aligned with dates; null where missing
    policyRate,      // Fed funds, decimal
    mortgageRate,    // 30y fixed new mortgage rate, decimal
    gov10y,          // 10y Treasury yield, decimal
    cpiYoY,          // headline CPI yoy, decimal
    coreCpiYoY,
    unemployment,    // decimal
    gdpNominal,      // $bn annualised
    gdpRealGrowthYoY,// decimal
    houseIndex,      // Case-Shiller rebased 1995Q1 = 100
    equityIndex,     // S&P price rebased 1995Q1 = 100
    cape,
    goldIndex,       // rebased 1995Q1 = 100 (null before data start is OK)
    oilPrice,        // WTI $/bbl
    hhDsr,           // household debt service ratio, decimal (FRED TDSP or BIS US-H)
    privateCreditGdp,// BIS private non-fin credit / GDP, decimal
    hhDebtGdp,       // household debt / GDP, decimal (best available; may be interpolated – note in meta)
    govDebtGdp,      // federal debt / GDP, decimal
    bankCredit,      // $bn
  },
  meta: { sources: {seriesKey: 'text'}, notes: ['...'] }
};
```

## 2. Engine — `src/engine/*.js` (owner: ENGINE agent)
### 2.1 State (plain serialisable object, one per quarter = "snapshot")
```js
{
  t, date,                       // 0, '1995Q1'
  branch: 'model' | 'user',
  macro:  { gdpNominal, realOutput, capacity, outputGap, priceLevel, inflation, inflationExp, unemployment },
  rates:  { policy, mortgageEff, mortgageNew, gov10y, riskPremium, realPolicy },
  money:  { M },                 // deposits $bn
  debt:   { household, firm, government },          // $bn stocks
  bank:   { capitalRatio, approval, badLoanRate },  // approval = loan approval multiplier (1 = neutral)
  household: { income, dsr, lvr, consumption, savingRate },
  firm:   { profit, capex, capexPipeline: [ ... ] },
  gov:    { spending, taxes, deficit, interest, interestToTax, debtGdp },
  assets: {                       // each: price index (1995Q1=100), qoq nominal return, real return
    cash:    { price, ret, realRet },
    bond:    { price, ret, realRet, yield },
    equity:  { price, ret, realRet, pe },
    housing: { price, ret, realRet, priceToIncome, rentYield },
    gold:    { price, ret, realRet },
  },
  flows: {                        // THIS quarter, $bn, all ≥ 0 — drives the water diagram
    newLoans, principalRepay, interestPaid, fiscalInjection, qe,
    toHousing, toFinancial, toConsumption, toCapex, toCash,   // split of new spending power
    wages, profits, taxes, spillToGoods                         // goods-channel side
  },
  lights: {                       // four lamps 信贷/偿债/政策/估值
    credit:      { level: 'green'|'yellow'|'red', value, label, driver },
    debtService: { ... }, policy: { ... }, valuation: { ... }
  },
  ring: {                         // Dalio ring ①–⑧ (+ fork B1/B2), detected
    stage: 1..8,                  // most likely position
    fork: null | 'B1' | 'B2',
    probs: { 1: 0.1, 2: 0.6, ... },
    label: '② 资产缓冲池装满',
    nextSignal: '若信贷脉冲转负 → 进入 ⑤'
  },
  ledger: [ { date, player, observe, rule, action, immediate, delayed } ],  // entries THIS quarter
  pauses: [ { code, message } ],  // key-node auto-pause triggers this quarter (may be empty)
  causal: { [metricKey]: [ { factor, contribution } ] }  // approx in-model attribution, e.g. causal['assets.housing.ret']
}
```
`player` ids: `'centralBank' | 'government' | 'bank' | 'household' | 'firm' | 'investor' | 'foreign'`.

### 2.2 Controller — `src/engine/sim.js`
```js
import { createSim } from './engine/sim.js';
const sim = createSim({ data: US_Q, mode: 'history' });   // mode 'history' | 'free'
sim.reset(mode)                // back to t=0
sim.step()                     // advance one quarter on every active branch; returns latest 'model' snapshot
sim.t                          // current quarter index
sim.done                       // true at end (history: last data quarter; free: 2050Q4)
sim.snapshot(branch='model', t=sim.t)
sim.history(branch='model')    // array of snapshots 0..t
sim.takeover(playerId|null)    // user takes one player (one at a time). Creates 'user' branch from current t.
sim.takenOver                  // playerId | null
sim.setDecision(playerId, { policyRate })   // user decision for next steps (central bank: policyRate; others: see rules)
sim.suggestion(playerId)       // what that player's rules WOULD do now (for takeover panel)
sim.rules                      // [{ id, player, text, enabled }]  transparent rule list
sim.setRuleEnabled(id, bool)
sim.on(event, fn)              // 'step' | 'pause' | 'reset'
```
History mode: exogenous shocks + Fed policyRate follow real data (unless centralBank is taken over).
All other players act by rules. Free mode: central bank follows its own rule, runs to 2050Q4, beyond
data the exogenous inputs are neutral. Deterministic (seeded RNG, no Math.random()).

## 3. UI — `src/ui/*.js`
Every tab module exports `render(container, ctx)` and is re-rendered on each step.
```js
ctx = { sim, snap /* current model snapshot */, userSnap /* or null */, real: US_Q, openTerm(id) }
```
- `src/ui/flow.js` (owner: LAYOUT agent): `renderFlow(svgHost, snap, prevSnap)` — animated SVG water diagram.
- `src/ui/tabs/ledger.js`, `cycle.js`, `assets.js`, `takeover.js` (owner: PANELS agent).
- `src/ui/chart.js` (owner: PANELS agent): `lineChart(host, { series:[{name, values, style:'real'|'model'|'user'}], dates, reservedFrom })`
  — real = solid, model = dashed, user = dotted/other colour. Shade quarters ≥ reservedFrom.
- `src/ui/concepts.js` + `src/data/concepts.js` (owner: PANELS agent): concept cards (§5).
- `index.html`, `assets/css/app.css`, `src/app.js` (owner: LAYOUT agent): shell, top time bar
  (play/pause/speed/step, date, "进入教学" banner placeholder), fixed flow area, bottom tab bar, wiring.

## 4. Visual tokens (in `assets/css/app.css`, LAYOUT agent defines; PANELS agent uses the variables)
`--bg --surface --text --muted --border --accent`
Flow colours (colour-blind safe, always paired with a text label):
`--c-credit` new loans (blue) · `--c-repay` principal repayment (orange) · `--c-fiscal` fiscal/QE (purple)
`--c-housing` · `--c-financial` · `--c-goods` · `--c-capex` · `--c-cash`
Lamp colours `--lamp-green --lamp-yellow --lamp-red` (+ text label 绿/黄/红).
Light + dark mode via `prefers-color-scheme`.

## 5. Concept cards
`src/data/concepts.js`:
```js
export const CONCEPTS = {
  dsr: {
    name: 'DSR 偿债率',
    short: '每赚 100 块要拿多少去还本付息',
    water: '收入这条河里，被债务管道抽走的比例',
    formula: 'DSR = (还本 + 付息) / 收入',
    from: ['mortgageEff', 'hhDebt', 'income'],      // ids of other concepts
    to:   ['bankApproval', 'newLoans', 'lampDebtService'],
    why:  '为什么它比"债务/GDP"更早报警……',
    live: 'household.dsr', fmt: 'pct'              // path into snapshot; fmt: 'pct' | 'num' | 'idx' | 'bn'
  }, ...
};
```
`src/ui/concepts.js` exports `initConcepts({ getSnap })` — installs ONE document-level click delegate for
`.term[data-term]`, opens a bottom sheet (mobile) / side card (wide) with the card; `from`/`to` items are
themselves `.term` buttons so the user can walk the causal web. Also exports `term(id, label?)` → HTML string.
