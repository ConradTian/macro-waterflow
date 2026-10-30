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
0b. **New 专题 「AI 抗冲击：一个澳洲家庭怎么配置」 (?lesson=ai-au, in the 专题 menu).** User request via the peer, 2026-10-30. Do it after item 0, before EA. ≤ 7 steps + ending; phone-first. The full spec is in the peer's message; summary:
   1. Question + conclusion: the house, the job and the AUD sit on one river, so the liquid money first diversifies off it; AI tilts are small and follow the bottlenecks.
   2. What AI changes on the picture: 分水堰 wage share ↓ with profits / rents flowing to the bottlenecks; 估值 already priced, narrow pools fall most; 吸力 two forces, currently up (real data 2026Q3: US 10y ~4.9%, AUS ~5.1%); 河道 inflation first, cheaper services later; 地下 / 闸 debt-financed capex, money flows to the USD lake.
   3. Phases 投资期 → 扩散期 → 分配期; the main risk is the capex boom breaking first, or faster redistribution.
   4. The Australian view: ASX has almost no compute exposure; AU banks = mortgage risk; iron ore is not a reliable tailwind; the AUD is a shock absorber (reuse the L6 numbers: AUD 2008 −24%, yen +18%).
   5. Bottlenecks now: read-only from Evoquant\5_situ_aware\reports\NOW.md and MORNING.md, labelled 「2026 年 10 月读数，描述不是预测」. Priced: power equipment, copper, optical; tight but not run up: pipelines, DC REITs; unreadable: nuclear. The radar lights after prices.
   6. Hypothetical worked example (NO real user data): house A$700k with no mortgage + A$300k liquid →
      - 60% global equity ex-AU, unhedged;
      - 10% bottleneck tilt;
      - 10% cash / short duration incl. a 6-month emergency fund;
      - 10% global bonds hedged to AUD;
      - 10% physical gold;
      - excluded: AU banks and AU REITs.
      - Trigger buttons: 收紧 / AI 信用压力 / 降息且推得动 / 绳紧 / 卡点挪了, each showing the new table.
      - Staged entry over 9 months; rebalance when a block drifts > 5pp; an offset-account note.
      - If the blind-test data allows: a 「示意回放」 of 2008 and 2022 in AUD vs 60/40.
   7. Who to ask: an ASIC-registered, fee-only adviser, for tax / super / structure (not for timing).
   8. Ending: the 三问 + 「这是用框架演示的样板，不是个人建议」.
   - Every number from data or engine, never typed. Push, then send the peer the link.
   - **CORRECTION from SITU-AWARE v2** (5_situ_aware\reports\MORNING.md v2, TEST_V2.md): the bottleneck radar and the leading data gave no profitable early signal; industry momentum doesn't beat SPY after 2011 net of costs; the macro switch has only 4 episodes. Therefore:
     - step 5 adds 「我们用公开数据做的卡点雷达和行业动量，回测里扣掉成本后都没有稳定跑赢大盘：市场比公开数据快。所以卡点只当背景，不当择时信号」;
     - step 6: the 10% tilt becomes a fixed 「信念仓位」 (0–10% by conviction), rebalanced yearly, NOT rotated. REMOVE the 「卡点挪了」 button. Keep 收紧 / AI 信用压力, labelled 「风险控制，不是赚钱信号；历史上只有 4 次收紧，证据不足」;
     - conclusion: the core (60% global ex-AU unhedged) does most of the work; the tilt is optional.
   - **RESTRUCTURE (user, later the same night): about 80% macro, 20% allocation = 8 macro steps + 2 allocation steps + ending.** This supersedes the step list above; the corrections above still apply. One idea per step, conclusion first, parts shown on the main diagram.
     - **M1 问题与结论:** AI widens the channel, but the weir tilts toward the owners of the bottlenecks; the shocks come in three phases; an AU household sits on one river (house + job + AUD).
     - **M2 分水堰** (Restrepo, NBER WP 34423, Oct 2025):
       - in the AGI limit the labor share → 0 and wages are capped by the compute cost of replicating a job, yet the wage level can still be higher (the share shrinks, not the level);
       - the relative loss hurts in three places: (a) scarce fixed-库容 assets (good-location houses, schools) priced by the top; (b) the saving glut of the rich (Mian–Straub–Sufi), so water sits in the lake → household borrowing → the hole deepens; (c) politics → taxes at the weir / redistribution (Dalio internal order);
       - draw the K by place on the diagram.
     - **M3 河道与物价, two speeds:**
       - now, physical bottlenecks (power, copper, chips) narrow the channel → inflation, leaning B1 (CPI: US ~3.8%, AUS ~4% per real data);
       - later, cheap AI services → disinflation;
       - use the 测流断面 diagnostic.
     - **M4 吸力:** capex + deficits push it up; the saving glut pushes it down; currently up (10y: US ~4.9%, AUS ~5.1%; RBA path per real data; VERIFY every number against data_src/real before typing). Long bonds and narrow pools fear a rising 吸力.
     - **M5 估值:** big AI profit growth is already priced; returns depend on surprise; narrow pools fall most on disappointment.
     - **M6 地下和闸:** AI capex is increasingly debt-financed (bonds, private credit, DC builders), so a bust is a credit event (情景 B); money runs to the USD lake.
     - **M7 三阶段与切换风险:** 投资期 → 扩散期 → 分配期 (K politics, compute / capital taxed, UBI via the deep pump; if financed by printing → B1). The main risk is a bumpy switch.
     - **M8 澳洲视角:**
       - same river; ASX has little compute exposure; AU banks = mortgage risk;
       - iron ore: China steel peaked 2020, property starts down > 50%, Simandou supply from late 2025, so the 2021–23 windfall (hh debt/GDP 118 → 109%) is unlikely to repeat; the ratio has been rising since 2024 (114% in 2025);
       - debt reduction must come from nominal GDP and slower credit (APRA);
       - the AUD as a shock absorber (2008 AUD −24%, JPY +18%);
       - AU jobs as bottleneck vs supplementary tasks (no AU-specific evidence yet; say so).
     - **A1 诚实的一页:** SITU-AWARE v2 result (no profitable timing signal after costs).
     - **A2 worked example:** as above (fixed 0–10% 信念仓位, risk-control triggers, staged entry, offset note, licensed adviser).
     - **Ending:** the 三问 + 「样板，不是个人建议」.
     - **Sources:** every number from repo data / engine, or a cited dated fact (NBER WP 34423; Grid Strategies; PJM auctions; SITU-AWARE reports; ABS / RBA / BIS for AU debt and rates). Verify the peer's quoted figures against the data before using them; if one doesn't match, use the data and note it.
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
