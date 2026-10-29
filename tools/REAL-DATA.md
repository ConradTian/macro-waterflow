# 真实数据层（「真实 / 模型」开关用）

只用来**展示**：水尺、灯、两个周期表盘、资产水位读真实季度数据。**从不拟合**：引擎和它的校准只读 `src/data/us-quarterly.js`、`src/data/countries/aus-quarterly.js`，这两个文件没有改动。2022Q1 起是母项目的留出样本（`reservedFrom`）。

| 步骤 | 命令 | 说明 |
|---|---|---|
| 下载 | `%USERPROFILE%\.venvs\dalio432\Scripts\python.exe -I tools/fetch_real_data.py [fred abs oecd rba bis aofm gold]` | 原样存到 `data_src/real/<来源>/`；每个文件的 URL、日期、字节数记在 `data_src/real/_download_log.json` |
| 生成 | `… -I tools/build_real_data.py` | 不联网，写 `src/data/real/usa-real.js`、`aus-real.js` |
| 检查 | `node tools/check_real_data.mjs [--verbose]` | 覆盖表、无 NaN、和引擎文件的重叠差、快照形状、真实与模型表盘对照 |

下载日期 2026-10-30。AOFM 网站两次超时，所以 AUS `foreignGovHoldShare` 读的是前一天的 `data_src/world/aofm/foreign_holdings.xlsx`（覆盖到 2026Q2），文件 meta 中有注明。

## 截至哪一季

- 网格：1995Q1 到任一序列的最后真实季度（两国都是 2026Q3）。前 124 季和引擎网格完全相同。
- `lastRealDate`：政策利率、CPI、失业率、GDP **同时**有真实值的最后一季，用于徽章「真实数据 · 截至 …」。**USA 2026Q3**（BEA 已发布 Q3 初值）；**AUS 2026Q2**（ABS 的 Q3 国民账户 12 月才发布）。
- 每个序列各自的起止季度在 `meta.firstReal` / `meta.lastReal`。
- 「部分」：如果某季只有 3 个月中的 2 个月，仍然保留该季并标记 `meta.partial`。目前标记的有：US CPI、核心 CPI、失业率 2025Q4（BLS 没有发布 2025 年 10 月的数据）；US 房价 2026Q3（7–8 月）；AUS M3 和 D2 信贷 2026Q3（7–8 月）。只有 1 个月的季度不计入，所以没有 2026Q4。
- `meta.extended`：BIS 数据比本国数据晚一季，所以用官方增速把它往后接一季，下表列出了接上的每一季。

## 序列（✓ 与引擎文件同口径，Δ 口径有变化，＋ 新增）

### 美国 `usa-real.js`（FRED，另加 BIS 和 Shiller）

| 序列 | 来源 | 真实到 |
|---|---|---|
| ✓ policyRate | FEDFUNDS，季均 | 2026Q3 |
| ✓ mortgageRate | MORTGAGE30US（周 → 月均 → 季均） | 2026Q3 |
| ✓ gov10y | DGS10，月末值的季均 | 2026Q3 |
| ✓ cpiYoY / coreCpiYoY | CPIAUCSL / CPILFESL 月同比的季均 | 2026Q3（2025Q4 部分） |
| ✓ unemployment | UNRATE | 2026Q3（2025Q4 部分） |
| ✓ gdpNominal / gdpRealGrowthYoY | GDP / GDPC1 | 2026Q3 |
| ✓ houseIndex | CSUSHPINSA，季末月，1995Q1=100 | 2026Q3 部分 |
| ✓ equityIndex / cape | Shiller SP_P / CAPE（dalio_432 的只读副本；耶鲁站的文件 2023 年就停了） | 2026Q3 |
| ✓ goldIndex | datasets/gold-prices 月度（重新下载） | 2026Q3 |
| ✓ oilPrice | MCOILWTICO（引擎文件用的是日度 DCOILWTICO，平均差 2.3%） | 2026Q3 |
| ✓ hhDsr | BIS DSR Q:US:H（1999Q1 起） | 2026Q1，按 FRED TDSP 增速接到 2026Q2 |
| ✓ privateCreditGdp / hhDebtGdp | BIS TC 770 | 2026Q1，按 Z.1（CMDEBT + BCNSDODNS）增速 ÷ 4 季 GDP 接到 2026Q2 |
| ✓ govDebtGdp | GFDEGDQ188S | 2026Q2 |
| ✓ bankCredit | TOTBKCR | 2026Q3 |
| ✓ fxPerUsd / exportsGdp / importsGdp / foreignGovHoldShare | 1 / EXPGS / IMPGS / FDHBFIN÷GFDEBTN | 2026Q3 / 2026Q3 / 2026Q1 |
| ✓ govDeficitGdp / govInterestGdp | −FGDEF / A091RC1Q027SBEA ÷ GDP | 2026Q2 / 2026Q3 |
| ＋ money, m2Gdp | M2SL 季均；÷ GDP | 2026Q3 |
| ＋ badLoans | DRALACBS（全部贷款逾期率，商业银行） | 2026Q2 |
| ＋ chargeOffs, badLoansResidential | CORALACBS、DRSFRMACBS（仅展示） | 2026Q2 |
| ＋ outputGap, gdpReal, gdpPotential | GDPC1 / GDPPOT − 1（CBO） | 2026Q3 |
| ＋ outC / outI / outG / outNX | PCEC、GPDI（含存货）、GCE、NETEXP ÷ GDP；**加总 = 1**（NIPA 恒等式，统计误差在收入法一侧） | 2026Q3 |
| ＋ govInterestToTax | A091RC1Q027SBEA ÷ FGRECPT（联邦利息 ÷ 联邦经常收入） | 2026Q2 |
| ＋ privateCredit | BIS 私人非金融信贷存量（$bn）；用于信贷脉冲 | 2026Q2 |
| ＋ qeGdp | 代理：（WALCL − 其 2007 年均值，≥ 0）÷ GDP；2002Q4 前取 0 | 2026Q3 |
| ＋ cpiIndex, households | CPIAUCSL 季均（1995Q1=100）；TTLHH 年值放在年中，中间线性插值，最后一年之后持平 | 2026Q3 |

和 us-quarterly.js 在 1995Q1–2025Q4 的重叠差：几乎为零（利率、比率都是 0.00–0.03pp，水平量 0.0–0.2%），只有 oilPrice 差 2.3%。

### 澳洲 `aus-real.js`（ABS、RBA，另加 BIS、OECD、FRED）

| 序列 | 来源 | 真实到 |
|---|---|---|
| Δ policyRate | RBA F1.1 FIRMMCRT（引擎文件用的是 BIS 转载的同一现金利率） | 2026Q3 |
| ✓ mortgageRate | RBA F5 FILRHLBVS | 2026Q3 |
| ✓ gov10y | FRED IRLTLT01AUM156N | 2026Q3 |
| ✓ cpiYoY / coreCpiYoY | OECD（全部项目 / 剔除食品能源），口径同引擎文件 | 2026Q3 |
| Δ unemployment | ABS 6202.0 LF M13，SA（以前用 OECD 转载） | 2026Q3 |
| Δ gdpNominal / gdpRealGrowthYoY | ABS 5206.0 ANA_EXP，SA，现价 ×4/1000，链式实际量（以前用 IMF 转载） | 2026Q2 |
| ✓ houseIndex | BIS SPP Q:AU:N:628 | 2026Q2 |
| ✓ equityIndex | FRED SPASTT01AUM661N | 2026Q3 |
| ✗ cape | 没有 | — |
| ✓ goldIndex / oilPrice / fxPerUsd | 金价 × 澳元/美元（EXUSAL）/ MCOILWTICO / 1÷EXUSAL | 2026Q3 |
| ✓ hhDsr | BIS DSR Q:AU:H | 2026Q1 |
| ✓ privateCreditGdp / hhDebtGdp | BIS TC 770 | 2026Q1，按 RBA D2 增速接到 2026Q2 |
| ✓ govDebtGdp / bankCredit | BIS TC | 2026Q1 |
| Δ exportsGdp / importsGdp | ABS 5206.0 **季度**（引擎文件用世界银行年值，平均差 1.0 / 0.6pp） | 2026Q2 |
| Δ foreignGovHoldShare | AOFM，2003Q2 起；**不**做 2003 年以前的持平回填 | 2026Q2 |
| ＋ money, m3Gdp | RBA D3 DMAM3S（M3，SA）；÷ GDP | 2026Q3 部分 / 2026Q2 |
| ＋ outputGap, gdpPotential | **估算**：对数实际 GDP 的单边 HP 趋势（λ=1600，数据从 1959Q3 起，每季只用到当季为止的数据） | 2026Q2 |
| ＋ outC / outI / outG / outNX | ABS 5206.0 现价 SA：C = 家庭最终消费；I = 私人固定资本形成 + 存货变动；G = 一般政府消费 + 公共固定资本形成（含公共企业）；NX = 出口 − 进口 | 2026Q2 |
| ＋ outDiscrepancy | ABS 统计误差（支出法）÷ GDP：**C+I+G+NX+误差 = 1**；平均绝对值 0.24% GDP，最大 1.09% | 2026Q2 |
| ＋ trimmedMeanYoY, cpiIndex | ABS CPI_Q 截尾均值同比；全部项目 SA 指数 | 2026Q3 |
| ＋ privateCredit, qeGdp, population | BIS 存量（按 D2 DLCACFN 接到 2026Q3 部分）；代理：（RBA A1 澳元投资 − 2019 年均值，≥ 0）÷ GDP；ABS ERP_Q | — |
| ✗ badLoans | 没有可用的季度序列（APRA 的数据起始较晚，口径也变过） | — |

## 代理变量（灯和表盘的输入，`PROXY` 导出）

| 输入 | 真实口径 |
|---|---|
| ci 信贷脉冲 | 私人非金融信贷存量的季度变化 ×4 ÷ GDP（= 净新增信贷），用与引擎相同的 EMA(0.5) 平滑，再减去 2 季前的值。也试过 4 季版本（Biggs–Mayer–Pick），噪声相当（US 红灯季数 22 对 23），所以保留引擎公式，灯的阈值本来就是按它定的。 |
| pcg 信贷增速 | 信贷存量 4 季增速 |
| PIrel 房价/收入（起点=1） | 房价指数 ÷ 每户名义 GDP（US，人口普查局户数）或每人名义 GDP（AUS，ABS 人口），1995Q1 = 1；PI = `cp.pi0` × PIrel |
| peRel 股票估值 | US：CAPE ÷ 1995Q1 的 CAPE；AUS：股价指数 ÷ 名义 GDP（相当于市值/GDP），1995Q1 = 1 |
| dsr0 DSR 起点 | 第一个真实 DSR（BIS，1999Q1）；1995–98 年按它持平回填 |
| bad 坏账率 | US：DRALACBS 逾期率；AUS：固定 1%（中性，低于所有坏账阈值）；DSR 灯的文字改成「坏账率 无数据」 |
| qeGdp | 见上表（央行资产负债表的扩张部分） |
| defGdp | US：NIPA 联邦经常赤字；AUS：没有季度序列，取 0（⑥ 改由政府债务/GDP 或零利率条件触发） |
| i2t 利息/税收 | US：NIPA 联邦；AUS：null |
| gap 产出缺口 | US：CBO；AUS：估算（单边 HP） |

缺口处理（只用于灯和表盘）：输入当季没有真实值时，**沿用该输入上一季的值**（`carried`），不沿用它背后的水平量，所以缺一季信贷存量不会被算成「信贷流量为 0」。在序列开始之前，用它的第一个真实值回填（`backfilled`）；样本最初几季用引擎的初值（`start`）。每季的情况列在 `snap.real.filled`。

## API：`src/data/real/real-snapshot.js`（不依赖 DOM）

```js
import { realSnapshot, realLastDate, realDates, realData, realTimeline, REAL_ISOS, PROXY } from './data/real/real-snapshot.js';
realSnapshot('USA', '2008Q4')   // or a quarter index (0 = 1995Q1); null outside the grid
realLastDate('AUS')             // '2026Q2' -> 「真实数据 · 截至 2026Q2」
```

`realSnapshot` 和引擎快照字段相同（`macro, rates, money, debt, bank, household, firm, gov, assets.*, flows, border, budget, iou, lights, cycles, extra`），区别如下：
- `lights`：**同一个** `computeLamps`，用本国的参数。`cycles`：**同一个** `advanceCycles`，从 1995Q1 跑起（8 季预热），阈值用本国 `country-params.js` 的。
- `modelOnly`：这个国家的真实数据**从来**给不了的字段，例如所有流量分流（`flows.toHousing …`）、银行审批倍数和资本率、资本开支管道、弹簧（租金、股息；AUS 还有利息）、预算明细、风险溢价、通胀预期、收入、LVR、储蓄率、`ring`。
- `notYet`：真实序列存在、但这一季还没有发布的字段，例如 US 2026Q3 的 DSR、坏账、债务/GDP。
- 新增：`outlets {C, I, G, NX, discrepancy}`，都是占 GDP 的份额；`real { lastRealDate, afterLastReal, partial, filled, b2Now, inReserved, proxy }`。
- 水平量的单位是本币十亿：`money.M` 为 M2/M3，`debt.*` 等于比率 × GDP，`border.exports/imports` 是季度流量（× GDP/4，与引擎一致），`flows.govPurchases` 为 G × GDP/4（US 另有 `flows.taxes`、`flows.coupons`）；`assets.*.price` 是指数，`ret` 为季度涨跌，`realRet` 扣除 CPI 季度涨幅。

## 真实表盘与模型表盘（`check_real_data.mjs` 打印逐季对照）

- **USA 小周期**：和模型几乎一样，因为历史模式下模型的政策利率就是真实路径。收紧：1999Q4–2000、2004Q4–2007Q3、2017–2019Q2、2022Q2–2024Q3。降息：2001Q1、2007Q4、2019Q3、2024Q4。央行在降息时不再判「过热·物价」（2026-10-30 规则），所以 2008Q3（CPI 5.3%）和 2026Q3 都留在「降息」。
- **USA 大周期**（2026-10-30 规则：B2 连续 3 季才确认、推得动时解除；⑦ = g − r > 0 且政府债务/GDP 比一年前不升）：真实：① → 2002Q3 ② →（2008Q1 起 B2 待确认）2008Q3 B2 → 2010Q1 ⑥ → 2022Q3 ⑦。真实路径跳过了 ⑤：到 2009Q4，私人债务/GDP 只比三年高点低 2.8pp，没到 5pp 的门槛（相对 GDP 的去杠杆是 2010 年以后才出现的）；而 ⑥ 的证据（政府债务/GDP 上升、零利率）在这之前已经连续满足 6 季。⑦：2021–22 年名义增长远超 10 年国债利率、联邦债务/GDP 从 2020 年高点回落，连续 6 季后 2022Q3 进 ⑦（2022 年起是保留样本，只显示）。模型：② 2000Q4 →（2008Q1 起待确认）B2 2008Q3 → ⑤ 2009Q2 → ⑥ 2010Q2 → ⑦ 2015Q1。
- **AUS 小周期**：2011Q4–2018Q2 降息（覆盖 RBA 的 2011Q4–2016Q3 降息期），2019Q3–2021Q3 降息，2022Q3–2025Q1 收紧，2025Q2 降息，2026Q2 过热·物价，2026Q3 收紧。
- **AUS 大周期**：① → 2003Q1 ② → 2021Q3 ⑥ → 2023Q1 ⑦，**没有 B2**。B2 的证据只在 2008Q4、2009Q1、2012Q3 成立，从没连续 3 季，所以只是「B2 待确认」；2009Q4 降息推得动（回到扩张）。以前一季就确认、只有换阶段才解除，B2 从 2008Q4 一直亮到 2021Q2（溃坝灯读 `fork === 'B2'`，会红 13 年），这个问题已经修掉。`snap.real.b2Now` 仍然给「本季证据」。
