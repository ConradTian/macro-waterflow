# B1/B2 restructure: contract for the parallel work (2026-10-29)

## Why (agreed with the user and the Ray-Dalio-Framework session)
- **Short debt cycle (小周期)** = Dalio's four steps: 扩张 → 过热 → 收紧·衰退 → 降息（推得动吗？）.
  - A top (过热) comes in two kinds:
    - **物价过热**: inflation plus rate hikes.
    - **资产过热**: a boom pushed by borrowing that breaks; credit shrinks first and house prices turn.
  - The last step is a question:
    - **推得动** (credit restarts): back to 扩张. Example: 2001–03.
    - **推不动**: the long cycle takes over: B2 → ⑤. Example: 2008–12.
  - This hand-off is **the only link between the two dials** and the **main line of the course**.
- **B1/B2 belong to the long cycle (大周期)**. They are the fork after ② 缓冲池满, i.e. where the excess claims go:
  - **B1 溢出（通胀）**: handed to the short cycle (hike, then cut, back to ①). If it spills again and again, it becomes long inflationary debt reduction: ⑦ + B1, US 1966–82 and US 2023.
  - **B2 缩水（通缩）**: asset prices fall while the debts stay. This is a balance-sheet recession and leads to ⑤.
  - B2 needs **three things at once**:
    1. house prices falling year on year;
    2. DSR high or private debt/GDP built up;
    3. rates cut (or near zero) and credit still shrinking.

## Engine output (done, src/engine/regimes.js — do NOT edit the engine)
`snap.cycles.short`:
- `phase`: `'expand' | 'hot' | 'tight' | 'ease'`. The four steps; use this for the dial position.
- `key`: `'expand' | 'hotP' | 'hotA' | 'tight' | 'ease'`. The internal key; hotP = 过热·物价, hotA = 过热·资产.
- `top`: `'price' | 'asset' | null`. Set only while `phase === 'hot'`.
- `via`: `'price' | 'asset' | null`. Which kind of top this round came from; kept during tight/ease.
- `label`: e.g. `'过热·资产'`, `'收紧·衰退（接 资产过热）'`, `'降息（推得动吗？）（接 资产过热）'`.
- `between`: `[key, key] | null`. **Internal keys**; look them up in `KEY_LABEL`.
- `handoff`: `'no' | null`. 'no' means 推不动: ease while the long cycle is on B2 or at ⑤/⑥. `handoffText` is the matching sentence.
- `evidence[]`: each `targetId` is a key. `progress[]`: each `target` is a key; `label` is `KEY_LABEL[key]`.
- `nextSignal`, `since`: as before.

`snap.cycles.long`: same as before, plus:
- `fork`: `'B1' | 'B2' | null`. Only in stages ① and ②. B2 is sticky until the stage changes; B1 = the short cycle is in a 物价过热 top.
- `b1Overlay`: bool. True in a later stage when the short cycle is in a 物价过热 top (e.g. ⑦ + B1 in 2023).
- `forkEvidence`: items (same shape as evidence) for the three B2 conditions while in ①/②, else null. `forkSignal` is the one-line text of the B2 rule.

Exports from regimes.js:
- `SHORT_LABEL`, keyed by phase.
- `KEY_LABEL`, keyed by key.
- `TOP_LABEL`, keyed by price/asset.
- `SHORT_NEXT`, keyed by key.
- `LONG_LABEL`, `LONG_ORDER`.

Pauses:
- `SHORT_FORK` is gone.
- New `SHORT_TOP`: the short cycle reaches a top.
- New `LONG_FORK`: the long cycle takes the B2 fork.

## Short-cycle rules (redesign 2026-10-29: the dial follows the central bank)
The old dial was about a year off the real Fed path. Causes: 收紧 meant recession evidence only; 降息 also counted "policy ≤ 0.5%"; streaks and dwell added lag.
- **收紧 (`tight`)**: the central bank is tightening. A hiking round of **≥ 0.5pp** (`ST.hike`, low → high) with no cut since.
  - Holding at the high counts, for up to 8 quarters (`holdMax`).
  - `label` is 「收紧·衰退」 when the recession evidence also holds (unemployment ≥ 1pp over its 4-quarter low, or credit impulse ≤ −1.5pp); otherwise it is 「收紧（加息）」.
  - `KEY_LABEL.tight` / `SHORT_LABEL.tight` are now plain 「收紧」.
- **降息 (`ease`)**: the policy rate is **≥ 0.2pp under its 6-quarter high** (`turn`), is not rising this quarter (≤ +0.1pp), and the bank is not in a hiking round.
  - The near-zero OR is gone.
- **过热 (`hot`)**: overheating while the bank has **not yet** hiked ≥ 0.5pp. Once it has, the phase is 收紧.
  - 过热 and 收紧 never overlap. 收紧 can come first: in 2000 and 2005 the hikes started before inflation was high.
  - A top first seen during 收紧 sets `via` and fires `SHORT_TOP` there. The label then reads 「收紧（加息）（接 物价过热）」.
  - 物价过热: inflation ≥ 3.5% and ≥ 0.5pp above a year ago. The "hike" condition was dropped, because hikes now mean 收紧.
  - 资产过热: credit impulse ≤ −0.5pp **and** house prices ≤ +1% vs a year ago **and** DSR ≥ start + 1pp. All three must hold; before, it was house prices OR DSR.
    - So 2023–24 stays a price top: credit and house prices dipped, but DSR was far below its start.
- **"Hiking round" / "cut"**: a turning-point filter on the policy rate (`state.cb`). A move of 0.2pp off the running low or high turns the bank's direction.
- **Speed**:
  - 收紧 and 降息 need 1 quarter, with no dwell: the policy rate has no noise.
  - 过热 needs 2 quarters and 扩张 needs 3 (credit back, unemployment not rising), both after a 2-quarter dwell.
  - 推得动 is not called in a quarter when the bank is still cutting ≥ 0.2pp.
- **Moves**:
  - 扩张 → 过热 / 收紧.
  - 过热 → 收紧 / 降息 / 扩张. 过热·物价 can be re-labelled 过热·资产.
  - 收紧 → 降息, or → 扩张 once a hold outlasts 8 quarters.
  - 降息 → 扩张 when credit restarts or the bank hikes again (`restart` event = 推得动).
  - 降息 → 过热·物价 when inflation takes off with rates still low (2021).
  - 扩张 → 降息 (2026-10-29): a cutting round with no tightening before it also reads 降息 when the cut rule holds (≥ 0.2pp under the 6-quarter high, not rising) **and** the bank cuts in that quarter (≥ `polFlat`, 0.1pp), so a rate left low after an easing round does not re-enter 降息.
    - Why: the AUS dial read 扩张 for 29 quarters from 2013Q1 while the RBA cut through 2011–16 and again 2019Q2–2020Q2; 'ease' could only be reached from 过热 / 收紧.
    - It replaces the old rule "insurance cuts with no prior tightening (1998) leave the dial on 扩张". The US now reads 降息 in 1998Q4–1999Q2 (Fed −0.75pp Sep–Nov 1998) and 2002Q4–2003Q3 (Fed −0.5pp Nov 2002, −0.25pp Jun 2003).
    - `engine_check --country AUS` asserts that the RBA cutting windows 2011Q4–2016Q3 and 2019Q2–2020Q2 read 降息 in most quarters.
- **B1**: `fork` B1 / `b1Overlay` hold during 过热·物价, and also during 收紧 that came from a price top while inflation is still ≥ 3.5%.
- **Long dial**: entering ⑥ from ⑤ needs 4 quarters (`LONG_N_TO`), every other move still needs 6.
  - ⑤ stays at 6: with 4, AUS 2021 would enter ⑤.
  - Every long stage lasts ≥ 4 quarters (the engine_check assert was ≥ 6).
- **New threshold keys** live as fallbacks in `regimes.js` (`stx()`): `turn` 0.002, `polFlat` 0.001, `inflUp` 0.005, `holdMax` 8. Any `ST` key in country-params overrides them.
  - `ST.cut` and `ST.zb` are no longer used by the short cycle. `ST.hike` is now the size of the hiking round.

## History timeline now (US, history mode, after the 2026-10-29 recalibration with the real fiscal path), against the FOMC path
| Date | 大周期 | 小周期 | Notes | Real Fed |
|---|---|---|---|---|
| 1995Q1 | ① | 扩张 | | |
| 1998Q4 | | 降息 | expand → ease (new rule) | cuts Sep–Nov 1998 (−0.75pp) |
| 1999Q3 | | 扩张 | the bank hikes again (liftoff) | |
| 1999Q4 | | 收紧（加息） | | hikes 1999Q3 → 2000Q2 |
| 2000Q2 | | 收紧（加息）（接 物价过热） | SHORT_TOP price, fork B1 | |
| 2000Q4 | → ② | 收紧·衰退（接 物价过热） | label only | |
| 2001Q1 | | 降息（接 物价过热） | | first cut Jan 2001 |
| 2002Q2 | | 扩张 | **推得动** (restart) | |
| 2002Q4 | | 降息 | expand → ease (new rule) | cut Nov 2002 (−0.5pp), Jun 2003 |
| 2003Q4 | | 扩张 | | |
| 2004Q4 | | 收紧（加息） | | hikes 2004Q3 → 2006Q2 |
| 2005Q2 | | 收紧（加息）（接 物价过热） | SHORT_TOP price, fork B1 | |
| 2006Q2 | | 收紧·衰退（接 物价过热） | label only | hold at 5.25% from Jun 2006 |
| 2006Q4 | | 收紧·衰退（接 资产过热） | SHORT_TOP asset | |
| 2007Q4 | | 降息（接 资产过热） | | first cut Sep 2007 (Q3 average −0.2pp) |
| 2008Q1 | | | **LONG_FORK B2**, handoff 'no' (**推不动**) | |
| 2009Q2 | ⑤ | | handoff still 'no' | |
| 2010Q2 | ⑥ | | handoff still 'no' | TARP/QE1 2008Q4, ARRA 2009Q1 |
| 2011Q2 | | 扩张 | | |
| 2016Q1 | ⑦ | | | |
| 2017Q1 | | 收紧（加息） | 2016: one 25bp hike, round < 0.5pp, so 扩张 | hikes Dec 2015, Dec 2016 → Dec 2018 |
| 2017Q3 | | 收紧（加息）（接 物价过热） | SHORT_TOP price, b1Overlay | |
| 2019Q3 | | 降息（接 物价过热） | | cuts Jul–Oct 2019, Mar 2020 |
| 2021Q3 | | 过热·物价 | SHORT_TOP price, b1Overlay (⑦ + B1) | rates at zero, CPI > 5% |
| 2022Q2 | | 收紧（加息）（接 物价过热） | b1Overlay until 2023Q2 | hikes Mar 2022 → Jul 2023 |
| 2023Q4 | | 收紧·衰退（接 物价过热） | label only | |
| 2024Q4 | | 降息（接 物价过热） | | first cut Sep 2024 (Q3 average −0.07pp) |

engine_check asserts this against the FOMC path (±1 quarter). It checks:
- the dial reads 收紧 in most hiking quarters;
- 降息 starts within 1 quarter of each first cut;
- no 降息 while the rate rose ≥ 0.1pp in the last 2 quarters;
- the B2 fork falls in 2007Q3–08Q4;
- ⑤ is entered in 2008Q3–09Q4 and ⑥ by 2010Q2;
- 2001–03 推得动 (back to 扩张 by 2004Q2) and 2008–11 推不动.

## House rules for everyone
- **User and language**
  - The user is a macro beginner and a hydrologist, working in Chinese.
  - Keep wording short, conclusion first.
  - Never write 同比/环比; write 比一年前 / 比上季.
- **Look**
  - The light theme is the default, and dark must still work: use the CSS tokens; every dark rule is guarded by `:root:not([data-theme="light"])`.
  - The iPad is the main device. Check phone 390px, iPad landscape 1180×820 and desktop 1920×1000.
- **Code**
  - Static ES modules, relative paths, no build step. Match the surrounding code style and comment density.
- **Screenshots**: headless Edge, `"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=W,H --virtual-time-budget=8000 --screenshot=OUT URL`.
  - Serve the repo root with `python -m http.server <your port>`.
  - Pages: `tools/frame.html?w=..&h=..&theme=light&<app query>` (full app), `tools/cycle-preview.html?w=390&t=60&theme=light` (周期 tab alone).
  - App query: `t=N` jumps to quarter N (0 = 1995Q1, 52 = 2008Q1, 56 = 2009Q1), `tab=cycle`, `pause=1`, `lesson=ID&step=N`.
  - Stop your server when done.
- **Do not commit.** Edit only the files assigned to you. Report changed files, checker output and screenshot paths.
