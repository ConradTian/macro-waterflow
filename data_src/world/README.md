# data_src/world: raw downloads for the world map and country views

Everything here is data only (CSV / JSON / XLSX / TXT / zipped CSV), read by `tools/build_world_data.py` and `tools/build_country_data.py` with no network.
To refresh: `%USERPROFILE%\.venvs\dalio432\Scripts\python.exe -I tools/fetch_world_data.py` (then rebuild). The log of the last fetch is `_download_log.json`.
IMF data comes from the official `api.imf.org` SDMX endpoint (the older DataMapper site returns 403 for scripts, so it is not used). IMF DOTS is now called IMTS there.

| file | URL | downloaded | note |
|---|---|---|---|
| `bis/WS_CBPOL_csv_col.zip` | https://data.bis.org/static/bulk/WS_CBPOL_csv_col.zip | 2026-10-29 | BIS bulk download, wide (col) CSV in zip, as published |
| `bis/WS_DSR_csv_col.zip` | https://data.bis.org/static/bulk/WS_DSR_csv_col.zip | 2026-10-29 | BIS bulk download, wide (col) CSV in zip, as published |
| `bis/WS_SPP_csv_col.zip` | https://data.bis.org/static/bulk/WS_SPP_csv_col.zip | 2026-10-29 | BIS bulk download, wide (col) CSV in zip, as published |
| `bis/WS_TC_csv_col.zip` | https://data.bis.org/static/bulk/WS_TC_csv_col.zip | 2026-10-29 | BIS bulk download, wide (col) CSV in zip, as published |
| `boe/IUMTLMV.csv` | https://www.bankofengland.co.uk/boeapps/iadb/fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/1995&Dateto=now&SeriesCodes=IUMTLMV&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N | 2026-10-29 | BoE IADB IUMTLMV: monthly average of quoted household mortgage SVR |
| `ecb/mir_housing_new.csv` | https://data-api.ecb.europa.eu/service/data/MIR/M.U2.B.A2C.AM.R.A.2250.EUR.N?format=csvdata | 2026-10-29 | ECB MIR housing loans new business rate, euro area |
| `eurostat/une_rt_m_EA21.csv` | https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/une_rt_m/M.SA.TOTAL.PC_ACT.T.EA21?format=SDMX-CSV&startPeriod=1995-01 | 2026-10-29 | Eurostat une_rt_m euro area EA21 (from 2000), SA, % of active population |
| `fred/EXCHUS.csv` | https://fred.stlouisfed.org/graph/fredgraph.csv?id=EXCHUS | 2026-10-29 | CNY per USD, monthly average |
| `fred/EXGEUS.csv` | https://fred.stlouisfed.org/graph/fredgraph.csv?id=EXGEUS | 2026-10-29 | DEM per USD, monthly average (EA pre-1999: /1.95583) |
| `fred/EXJPUS.csv` | https://fred.stlouisfed.org/graph/fredgraph.csv?id=EXJPUS | 2026-10-29 | JPY per USD, monthly average |
| `fred/EXUSAL.csv` | https://fred.stlouisfed.org/graph/fredgraph.csv?id=EXUSAL | 2026-10-29 | USD per AUD, monthly average |
| `fred/EXUSEU.csv` | https://fred.stlouisfed.org/graph/fredgraph.csv?id=EXUSEU | 2026-10-29 | USD per EUR, monthly average (1999+) |
| `fred/EXUSUK.csv` | https://fred.stlouisfed.org/graph/fredgraph.csv?id=EXUSUK | 2026-10-29 | USD per GBP, monthly average |
| `fred/IRLTLT01AUM156N.csv` | https://fred.stlouisfed.org/graph/fredgraph.csv?id=IRLTLT01AUM156N | 2026-10-29 | AUS 10y gov yield, monthly (OECD via FRED) |
| `fred/IRLTLT01EZM156N.csv` | https://fred.stlouisfed.org/graph/fredgraph.csv?id=IRLTLT01EZM156N | 2026-10-29 | Euro area 10y gov yield |
| `fred/IRLTLT01GBM156N.csv` | https://fred.stlouisfed.org/graph/fredgraph.csv?id=IRLTLT01GBM156N | 2026-10-29 | GBR 10y gov yield |
| `fred/IRLTLT01JPM156N.csv` | https://fred.stlouisfed.org/graph/fredgraph.csv?id=IRLTLT01JPM156N | 2026-10-29 | JPN 10y gov yield |
| `fred/IRSTCB01CNM156N.csv` | https://fred.stlouisfed.org/graph/fredgraph.csv?id=IRSTCB01CNM156N | 2026-10-29 | CHN central bank rate, monthly (OECD via FRED; gap filler for BIS) |
| `fred/IRSTCB01JPM156N.csv` | https://fred.stlouisfed.org/graph/fredgraph.csv?id=IRSTCB01JPM156N | 2026-10-29 | JPN central bank rate (call money), monthly (OECD via FRED; fills BIS gaps 2002-05, 2014-15) |
| `fred/LRHUTTTTEZM156S.csv` | https://fred.stlouisfed.org/graph/fredgraph.csv?id=LRHUTTTTEZM156S | 2026-10-29 | Euro area unemployment rate monthly SA (OECD via FRED; used for 1995-1999) |
| `fred/LRUNTTTTAUM156S.csv` | https://fred.stlouisfed.org/graph/fredgraph.csv?id=LRUNTTTTAUM156S | 2026-10-29 | AUS unemployment rate, monthly SA (OECD via FRED) |
| `fred/LRUNTTTTJPM156S.csv` | https://fred.stlouisfed.org/graph/fredgraph.csv?id=LRUNTTTTJPM156S | 2026-10-29 | JPN unemployment rate, monthly SA (OECD via FRED) |
| `fred/MCOILWTICO.csv` | https://fred.stlouisfed.org/graph/fredgraph.csv?id=MCOILWTICO | 2026-10-29 | WTI crude oil $/bbl, monthly |
| `fred/SPASTT01AUM661N.csv` | https://fred.stlouisfed.org/graph/fredgraph.csv?id=SPASTT01AUM661N | 2026-10-29 | AUS share price index (OECD via FRED) |
| `fred/SPASTT01CNM661N.csv` | https://fred.stlouisfed.org/graph/fredgraph.csv?id=SPASTT01CNM661N | 2026-10-29 | CHN share price index |
| `fred/SPASTT01EZM661N.csv` | https://fred.stlouisfed.org/graph/fredgraph.csv?id=SPASTT01EZM661N | 2026-10-29 | Euro area share price index |
| `fred/SPASTT01GBM661N.csv` | https://fred.stlouisfed.org/graph/fredgraph.csv?id=SPASTT01GBM661N | 2026-10-29 | GBR share price index |
| `fred/SPASTT01JPM661N.csv` | https://fred.stlouisfed.org/graph/fredgraph.csv?id=SPASTT01JPM661N | 2026-10-29 | JPN share price index |
| `fred/DTWEXBGS.csv` | https://fred.stlouisfed.org/graph/fredgraph.csv?id=DTWEXBGS | 2026-10-29 | Nominal broad US dollar index (Jan 2006 = 100), daily, 2006+ (fetch source `fxextra`; -> src/data/usd-index.js) |
| `fred/TWEXBMTH.csv` | https://fred.stlouisfed.org/graph/fredgraph.csv?id=TWEXBMTH | 2026-10-29 | Trade-weighted US dollar index, broad (Jan 1997 = 100), monthly 1973-2019 (discontinued; pre-2006 splice) |
| `fred/TWEXB.csv` | https://fred.stlouisfed.org/graph/fredgraph.csv?id=TWEXB | 2026-10-29 | Same index, weekly 1995-2019 (fallback for months TWEXBMTH lacks) |
| `fred/PIORECRUSDM.csv` | https://fred.stlouisfed.org/graph/fredgraph.csv?id=PIORECRUSDM | 2026-10-29 | Global price of iron ore, USD/dmt, monthly (IMF via FRED): AUS terms-of-trade direction for the FX reactor |
| `gold/gold_github_monthly_2026-10-26.csv` | copied from ../dalio_432/cache (datasets/gold-prices monthly, GitHub) | 2026-10-26 |  |
| `imf/cofer.csv` | https://api.imf.org/external/sdmx/2.1/data/IMF.STA,COFER/G001....A?startPeriod=1995 | 2026-10-29 | IMF COFER, world, annual, all indicators/currencies |
| `imf/cpi_jpn_yoy.csv` | https://api.imf.org/external/sdmx/2.1/data/IMF.STA,CPI/JPN.CPI._T.YOY_PCH_PA_PT.M?startPeriod=1994 | 2026-10-29 | IMF CPI Japan all items yoy %, monthly (OECD feed ends 2021-06) |
| `imf/imts_trade.csv` | https://api.imf.org/external/sdmx/2.1/data/IMF.STA,IMTS/{USA+CHN+G163+JPN+GBR+AUS}.{XG_FOB_USD \| MG_CIF_USD}.{same six + G001}.A?startPeriod=1995&endPeriod=2025 | 2026-10-29 | two queries (exports FOB, imports CIF) concatenated; G163 = euro area, G001 = World |
| `imf/qnea_gdp.csv` | https://api.imf.org/external/sdmx/2.1/data/IMF.STA,QNEA/AUS+GBR+JPN+CHN+G163.B1GQ....Q?startPeriod=1993 | 2026-10-29 | IMF QNEA GDP B1GQ, V=current prices, Q=volume, SA/NSA, quarterly |
| `imf/weo.csv` | https://api.imf.org/external/sdmx/2.1/data/IMF.RES,WEO/G001+G163+USA+CHN+JPN+GBR+AUS.NGDPD+NGDP_RPCH+BCA_NGDPD+GGXWDG_NGDP+PCPIPCH.A?startPeriod=1990&endPeriod=2026 | 2026-10-29 | IMF WEO latest vintage, annual, 1990-2026 |
| `oecd/cpi_yoy.csv` | https://sdmx.oecd.org/public/rest/data/OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL,1.0/... | 2026-10-29 | OECD CPI yoy growth (GY), _T all items and _TXCP01_NRG all items excl food & energy; M and Q |
| `ons/mgsx.csv` | https://www.ons.gov.uk/generator?format=csv&uri=/employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms | 2026-10-29 | ONS MGSX unemployment rate 16+, SA |
| `rba/f05hist.xlsx` | https://www.rba.gov.au/statistics/tables/xls/f05hist.xlsx | 2026-10-29 | RBA F5 indicator lending rates |
| `aofm/foreign_holdings.xlsx` | https://www.aofm.gov.au/sites/default/files/2025-05-02/foreign_holdings.xlsx (linked from https://www.aofm.gov.au/statistics/non-resident-holdings) | 2026-10-29 | AOFM Non-resident Holdings of AGS, quarterly 2003Q2-2026Q2 (engine agent, AUS foreignGovHoldShare) |
| `tic/mfh.txt` | https://ticdata.treasury.gov/Publish/mfh.txt | 2026-10-29 | TIC Major Foreign Holders of Treasury securities |
| `tic/mfhhis01.txt` | https://ticdata.treasury.gov/resource-center/data-chart-center/tic/Documents/mfhhis01.txt | 2026-10-29 | TIC Major Foreign Holders of Treasury securities |
| `worldbank/NE.EXP.GNFS.ZS.json` | https://api.worldbank.org/v2/country/AUS;GBR;JPN;CHN;USA;EMU/indicator/NE.EXP.GNFS.ZS?format=json&per_page=20000&date=1995:2025 | 2026-10-29 | World Bank WDI |
| `worldbank/NE.IMP.GNFS.ZS.json` | https://api.worldbank.org/v2/country/AUS;GBR;JPN;CHN;USA;EMU/indicator/NE.IMP.GNFS.ZS?format=json&per_page=20000&date=1995:2025 | 2026-10-29 | World Bank WDI |
| `worldbank/SL.UEM.TOTL.ZS.json` | https://api.worldbank.org/v2/country/AUS;GBR;JPN;CHN;USA;EMU/indicator/SL.UEM.TOTL.ZS?format=json&per_page=20000&date=1995:2025 | 2026-10-29 | World Bank WDI |
| `worldbank/SP.POP.TOTL.json` | https://api.worldbank.org/v2/country/AUS;GBR;JPN;CHN;USA;EMU/indicator/SP.POP.TOTL?format=json&per_page=20000&date=1995:2026 | 2026-10-29 | World Bank WDI total population (EMU = euro area aggregate); mid-year estimates; fetch with `fetch_world_data.py population` |

## Not downloaded / unreachable

- AOFM `Non-resident Holdings of AGS`: downloaded later (2026-10-29, engine agent), see `aofm/foreign_holdings.xlsx` above; AUS `foreignGovHoldShare` now filled (2003Q2 on, held flat before). Other countries: no open bulk series found.
- China 10y government yield, China / Japan mortgage rates, euro-area and China household DSR: no open bulk series.
- US Treasury TIC history file starts in 2000 (1995-1999 left null in `ustForeign`).
