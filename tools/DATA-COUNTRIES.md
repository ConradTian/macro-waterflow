# 各国数据清单（2026-10-29 下载）

图例：✓ 真实官方序列　≈ 近似替代（见下表说明）　✗ 缺失。括号内是有数据的起止季度。
所有国家文件与美国同形：124 季度（1995Q1–2025Q4），比率用小数，`gdpNominal` 是本币十亿、年化季度水平，指数在首个有数据季度 = 100。2022Q1 起是留出样本。
重建：`python -I tools/build_country_data.py`（不联网）；检查：`node tools/check_country_data.mjs`。

## 国家季度序列

| 序列 | 澳洲 AUS | 英国 GBR | 日本 JPN | 欧元区 EA | 中国 CHN |
|---|---|---|---|---|---|
| policyRate | ✓ 现金利率（BIS CBPOL M:AU） | ✓ Bank Rate（M:GB） | ≈ BIS M:JP，2002–05、2014–15 的空档用 OECD 拆借利率补（IRSTCB01JPM156N） | ✓ ECB（M:XM，1999 起）；≈ 1999 前用德国 M:DE | ≈ 央行基准贷款利率（M:CN，1996 起；1995 用 IRSTCB01CNM156N） |
| mortgageRate | ✓ RBA F5 标准浮动·自住（FILRHLBVS，1995Q1–） | ≈ BoE IUMTLMV 抵押贷款报价 SVR（1995Q1–） | ✗ | ≈ ECB MIR 新增住房贷款利率（2003Q1–） | ✗ |
| gov10y | ✓ IRLTLT01AUM156N | ✓ IRLTLT01GBM156N | ✓ IRLTLT01JPM156N | ✓ IRLTLT01EZM156N | ✗ |
| cpiYoY | ✓ OECD PRICES_ALL | ✓ OECD | ✓ OECD 至 2021Q2，之后 IMF CPI | ✓ OECD EA20 HICP | ✓ OECD |
| coreCpiYoY | ✓ 剔除食品能源 | ✓ | ✓ 只到 2021Q2（OECD 停更） | ✓ 1997Q1– | ✗ |
| unemployment | ✓ LRUNTTTTAUM156S | ✓ ONS MGSX | ✓ LRUNTTTTJPM156S | ✓ Eurostat EA21（2000–）+ OECD EA19（1995–99） | ≈ 世界银行 ILO 模型年值（SL.UEM.TOTL.ZS），年内不变 |
| gdpNominal | ✓ IMF QNEA 季调 ×4 | ✓ 同 | ✓ 同 | ✓ 同（G163） | ≈ QNEA 未季调，取最近 4 季之和 |
| gdpRealGrowthYoY | ✓ QNEA 实际 GDP 4 季增速 | ✓ | ✓ | ✓ 1996Q1– | ≈ QNEA 实际 GDP（2012–）；之前用 WEO 年增速（年内不变） |
| houseIndex | ✓ BIS SPP 名义（Q:AU:N:628） | ✓ | ✓ | ✓ XM | ≈ 2005Q2 才有，以 2005Q2 = 100 |
| equityIndex | ≈ OECD 股价指数（SPASTT01AUM661N，月均值） | ≈ GBM | ≈ JPM | ≈ EZM | ≈ CNM，1999Q1 才有，以 1999Q1 = 100 |
| cape | ✗ 没有 | ✗ | ✗ | ✗ | ✗ |
| goldIndex | ≈ 美元金价 × 汇率（AUD） | ≈ GBP | ≈ JPY | ≈ EUR（1999 前用 DEM/1.95583） | ≈ CNY |
| oilPrice | ✓ WTI 美元/桶（全球价，各国相同） | ✓ | ✓ | ✓ | ✓ |
| hhDsr | ✓ BIS DSR（1999Q1–） | ✓ 1999Q1– | ✓ 1999Q1– | ✗ BIS 没有欧元区 | ✗ BIS 只有全私人部门 |
| privateCreditGdp | ✓ BIS TC P | ✓ | ✓ | ✓ 1999Q1– | ✓ |
| hhDebtGdp | ✓ BIS TC H | ✓ | ✓ | ✓ 1999Q1– | ✓ 2006Q1– |
| govDebtGdp | ≈ BIS TC G（名义，全政府） | ≈ | ≈ 1997Q4– | ≈ 2000Q1– | ≈ 1995Q4– |
| bankCredit | ≈ BIS 国内银行对私人非金融部门信贷（本币十亿；定义不同于美国 TOTBKCR） | ≈ | ≈ | ≈ 1997Q3– | ≈ |
| fxPerUsd | ✓ FRED 月均汇率 | ✓ | ✓ | ✓ | ✓ |
| exportsGdp / importsGdp | ≈ 世界银行年值，年内不变，至 2024 | ≈ | ≈ 2025 为空 | ≈ WDI「EMU」含区内贸易，约为单国的两倍 | ≈ |
| foreignGovHoldShare | ✓ 2003Q2 起（AOFM，之前按 2003Q2 值持平） | ✗ | ✗ | ✗ | ✗ |

要点：
- 澳洲最全，只缺 `cape`（没有）；`foreignGovHoldShare` 来自 AOFM（2003Q2 起，之前持平）；`hhDsr` 1999 年才开始。
- 日本缺房贷利率；`coreCpiYoY` 2021Q2 后为空。
- 中国缺：10 年国债、房贷、核心 CPI、`hhDsr`；房价与股价历史短。
- 欧元区是聚合口径（成员数随时间变化）。

## world.js（年度 1995–2025，给地图）

| 字段 | 来源 | 覆盖 |
|---|---|---|
| gdpUsd | ✓ IMF WEO NGDPD；EA = IMF G163；ROW = 世界（G001）减六国 | 全部 1995–2025 |
| pvtDebtGdp | ✓ BIS TC（年均） | 全部；EA 1999– |
| govDebtGdp | ✓ IMF WEO 一般政府总债务；空档用 BIS G 补 | 全部 |
| policyRate | ≈ 同国家季度表（BIS 年均） | 全部 |
| houseReal | ✓ BIS 实际房价，2010 = 100 | 全部；CHN 2005– |
| cpiYoY | ✓ IMF WEO 年均通胀 | 全部 |
| fxPerUsd | ✓ FRED 年均；USA = 1 | 全部 |
| currentAccountGdp | ✓ IMF WEO BCA_NGDPD | 全部；CHN、EA 1997– |
| exportsGdp / importsGdp | ≈ 世界银行（EA 含区内贸易） | 至 2024（CHN、EA、GBR、AUS 含 2025） |
| trade（7×7） | ✓ IMF IMTS（原 DOTS）出口方申报 FOB；ROW = 与世界总额的差；EA 去掉区内 | 42 格全部 1995–2025 |
| reserves | ✓ IMF COFER 份额；1995–98 的 DEM/FRF/NLG/ECU 并入 EUR | CNY 2016–，AUD 2012– |
| ustForeign | ✓ 美国财政部 TIC 12 月值；EA = 列名欧元区成员之和 | 2000–2025（1995–99 为空） |
| longStage | 取自 waves.js `NOW`；EA 为 null | — |

注意：
- 贸易矩阵中 ROW→X 用进口方申报的 CIF，其余格用出口方 FOB，两侧口径略有差异（正常的镜像不对称）。
- EA 的 TIC 持仓在 2000 年代偏低（TIC 当年只单独列出少数成员）。
