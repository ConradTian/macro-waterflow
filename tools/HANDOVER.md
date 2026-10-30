# 宏观水流模拟器 · Handover (2026-10-30 night)

Live: https://conradtian.github.io/macro-waterflow/  (old v2 frozen at /v2/) · repo ConradTian/macro-waterflow · main = 7795d2d
Everything below is pushed; no work is pending in any worktree.

## 1. What is live (this session)
- **v3 picture:**
  - 河 ring 「我花的 = 你赚的」, the 分水堰, springs wired from the weir;
  - a 地下水 band below the river (地下的洞 = 欠款 x% GDP, with the 吸程线; the table reads only the B2 evidence);
  - the **吸力尺** in the RULER SLOT: ▶ policy, ▽ inflationExp, ▼ CPI, band ▶ − ▽, 调度线 + rope, CPI → ▼ line, parts flash in engine-lag order; real mode = 结账读数;
  - 深井泵, role → valves, lamps 河溢·B1 / 河干·衰退 / 湖崩·B2 / 地下太低·透支;
  - phone 河 / 湖 / 地下 switch, panel grip, hidden-layer hint, wide-screen layout.
  - Spec: tools/DESIGN-v3.md.
- **Course (9 lessons + 专题):**
  - L1 m1, L2 shk, L3 m2 (吸力尺 core), L4 m3 (负资产 ≠ B2, B1 story 1966–82), L5 m4 (到手 ▶ − ▼), L6 fx, L7 m5 (6 steps, roles in pairs), L8 inv (asset table marked 对/部分对/错), L9 now (现在在哪, real data);
  - 专题：预期 (?lesson=exp, 7 advanced steps).
  - Old lessons stay under 旧版课程.
- **Rules:**
  - B2 = 3 conditions × 3 quarters, cleared by 推得动; 负资产 / 银行受伤 are display-only 加分项.
  - ⑦ gate = g − r ≥ 0 and gov debt not rising. Label 「⑦ 增长化债（g > r）」; 「金融压制」 only when 到手 < −1%, 「到手约为零」 for −1..0.
  - No 过热 while cutting.
- **Real / model mode:** USA to 2026Q3, AUS to 2026Q2; twin dials; 真实 x hints. Backtest section in real mode: 「表盘是『现在在哪』的地图，不是预报」. The frozen-rules log starts 2026-10-30 (tools/freeze_log.mjs, append-only, rules entry #2 exists).
- **World map:** 3-layer icons, a mini 吸力尺 per gate (rope only for CNY), 地下·美元债 layer (BIS), drag-throttled, phone tap-to-expand.
- **Countries:** USA, AUS and **GBR** are online. GBR: furlough param, real ONS fiscal path, 14/14 hard targets; the 2009–13 unemployment plateau is still too low (model 4.5% vs real 7.8%).
- **Blind test (/blind/):** the 3-year result and the 60/40 benchmark are both rebalanced yearly.
- **Cache-busting:** import map + `?v=` hashes. GitHub Pages still caches index.html for about 10 minutes.

## 2. How to work (house rules)
- **Before every push:** `node tools/stamp_version.mjs && node tools/check_version_stamp.mjs --static`.
- **Merging agent branches:** merge into a fresh `.claude/worktrees/integN` worktree from main, with its own `python -m http.server <port>`. Run checkers ONE AT A TIME, fast-forward main, run `node tools/check_blind_data.mjs` in main (it needs the sibling ../dalio_432), then push.
- **Must stay green:**
  - engine_check: USA 17/17; `--country AUS` and `--country GBR` ALL PASSED;
  - check_d_lessons, check_lessons, check_real_data, check_backtest(_view), check_ruler_main, check_v3_picture, check_layers, check_real_mode, check_map, check_country_ui (also with `COUNTRY=GBR`), check_blind(_data), check_lesson_*.
- **Engine edits:** prove bit-identical with `node tools/sim_fingerprint.mjs <dir>` before and after (USA/AUS/town).
- **User preferences:**
  - LOW concurrency: one agent at a time.
  - RAM < 85%: check before any agent or headless Edge, close Edge after.
  - Decide small wording / table / review calls yourself; ask only for real scope forks.
  - Chinese, short, top-down. Never write 同比 / 环比.
  - Light theme only.
  - 2022+ is 保留样本: never fit on it.
- **Shared scratchpad:** prefix your scratch scripts, and never run another session's script. Parallel checkers collide on fixed CDP ports (`CDP_PORT` exists on check_map), so re-run an odd failure alone before believing it.
- **Peer:** the Ray-Dalio-Framework session (uds:\\.\pipe\LOCAL\cc-msg-7023f9489345193d646b47ecc03bbe94) relays the user's decisions. Send it a short Chinese status per push.
- **Trigger word 「皇帝内经」:** send the latest macro data and game status to the holiday idea collector session. End every reply with the reminder line.

## 3. Queue (user-approved order, next first)
0. **FIRST, before EA: the check scripts filled the C: drive.** About 1,300 Edge profiles × ~0.5 GB, roughly 80 GB since 10-28. RESOURCER already deleted them with the owner's OK.
   - **Cause:** tools/check_*.mjs create a fresh Edge profile in %TEMP% with mkdtempSync on every run and never delete it (e.g. check_d_lessons.mjs 'mw-dles-', check_real_mode.mjs 'mw-real-'). Launches without --user-data-dir also leave HeadlessEdge* folders behind.
   - **Fix it in ALL check scripts:**
     - (1) reuse one fixed profile per script under tools/_edge_<name> (as _edge_now / _edge_exp already do), and clear storage via CDP (Storage.clearDataForOrigin);
     - (2) where a temp dir is unavoidable: kill Edge, wait for it to exit, then rmSync(profile, {recursive, force}) in try/finally, plus a process.on('exit') hook that also covers failure and early-exit paths;
     - (3) every launch gets an explicit --user-data-dir plus --disk-cache-size=1 --no-first-run --no-default-browser-check;
     - (4) add a checker that counts %TEMP%\mw-* and HeadlessEdge* before and after a full check run, and fails if any are left.
   - Also remove the stale `.claude/worktrees/*` (about 40; everything is merged). Then reply to RESOURCER and to the Ray-Dalio-Framework peer.
1. **EA:**
   - fix the COVID shock the GBR way (shockMult 1, slackVsCapEff, furlough);
   - EA initial values (household 0.46 / private 1.12 / gov 0.70);
   - allow negative rates (deposit rate);
   - extra-EA trade only;
   - EA target table; see tools/COUNTRY-SCOUT.md.
2. **CHN:** data first (10y CGB, mortgage rate / LPR, DSR construction, household debt before 2006), then params (potential growth 9 → 4.5%, yearly mortgage repricing). The core target is the post-2021 property downturn.
3. **JPN:** an engine pass first (negative rates and inflation expectations, relative identity tolerance, BoJ assets / YCC as exogenous inputs, start the long cycle at ⑥/⑦), then fit.
4. **Combined engine round** (merge only with USA 17/17 and robustness no worse):
   - bank-loss → credit tightening;
   - the 2001–02 equity / investment fall plus equity timing, so the capex pipe can go ON in history mode;
   - 2008 energy inflation (the gap is energy, not core);
   - household saving reading ▽.
5. **AUS data refresh:** add the RBA ICP (A$ / US$) and ABS terms of trade to aus-quarterly (卖的东西贵不贵).

## 4. Known gaps / small backlog
- GBR: unemployment plateau 2009–13 too low; Taylor correlation weak; no GBR real-data layer.
- US model unemployment 2006–07 is too high (the user chose to leave it; labelled 模型偏差).
- **Backtest:** the dials do not beat 「下季 = 本季」. The only win is US policy-rate direction at 8 quarters (71% vs 57%). Also, a stale input can complete a B2 streak (AUS 2009Q2 with publication lags), so consider counting the streak only on fresh data.
- Ruler: the marks are still small on iPad 1024.
- 外国人买国债 pipe runs down the left edge.
- Legacy 旧版 lessons keep old words (frozen; also at /v2/).
- `lesson-investor.js` keeps 「⑤ B2 缩水」 (pinned by the handover in dalio_432); the new text lives in overlay fields.

## 5. Reports (tools/)
BACKTEST.md, BACKTEST-READOUT.md, ASSET-TABLE-CHECK.md, COUNTRY-SCOUT.md, CONSISTENCY-REVIEW.md, DESIGN-v3.md, COURSE-V3.md, REAL-DATA.md.
