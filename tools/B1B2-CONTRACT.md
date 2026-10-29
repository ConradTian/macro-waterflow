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

## History timeline now (US, history mode)
| Date | 大周期 | 小周期 | Notes |
|---|---|---|---|
| 1995Q1 | ① | 扩张 | |
| 2000Q2 | ① | 过热·物价 | fork B1 |
| 2001Q2 | → ② | | |
| 2001Q3 | | 过热·资产 | fork null: house prices rising, so no B2 |
| 2002Q2 | | 降息 | |
| 2003Q1 | | 扩张 | **推得动** |
| 2005Q1 | | 过热·物价 | fork B1 |
| 2006Q4 | | 过热·资产 | |
| 2007Q3 | | 收紧·衰退 | |
| 2008Q1 | | | **LONG_FORK B2** |
| 2008Q2 | | 降息 | handoff 'no' (**推不动**) |
| 2009Q1 | ⑤ | | handoff still 'no' |
| 2010Q3 | ⑥ | | handoff still 'no' |
| 2012Q2 | | 扩张 | |
| 2014Q1 | ⑦ | | |
| 2016Q1 | | 收紧 | |
| 2016Q4 | | 降息 | |
| 2018Q2 | | 扩张 | |
| 2020Q4 | | 收紧 | |
| 2021Q3 | | 降息 | |
| 2022Q2 | | 扩张 | |
| 2023Q1 | | 过热·物价 | b1Overlay true (⑦ + B1) |
| 2023Q4 | | 收紧 | |
| 2025Q2 | | 降息 | |

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
