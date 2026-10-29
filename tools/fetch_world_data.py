"""Download the raw files for the world map + country views into data_src/world/<source>/.

Run:  <venv>/Scripts/python.exe -I tools/fetch_world_data.py [source ...]
Only needed when refreshing; tools/build_world_data.py and tools/build_country_data.py
rebuild from the saved raw files with no network.

Downloaded files are data only (CSV/JSON/XLSX/TXT); nothing is executed.
Honest user-agent, no workarounds for blocked endpoints (the IMF DataMapper site is
403 for scripts, so IMF data comes from the official api.imf.org SDMX endpoint).
"""
import io
import json
import sys
import time
import urllib.request
import urllib.parse
from datetime import date
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data_src" / "world"
UA = "macro-waterflow-data-fetch/1.0 (teaching project; research use)"
LOG = []


def get(url, accept=None, timeout=180, tries=3):
    h = {"User-Agent": UA}
    if accept:
        h["Accept"] = accept
    err = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa
            err = e
            time.sleep(2 * (i + 1))
    raise err


def save(folder, name, data, url, note=""):
    d = RAW / folder
    d.mkdir(parents=True, exist_ok=True)
    p = d / name
    if isinstance(data, str):
        data = data.encode("utf-8")
    p.write_bytes(data)
    LOG.append((f"{folder}/{name}", url, str(date.today()), note, len(data)))
    print(f"  saved {folder}/{name} ({len(data)/1e3:.0f} kB)")


# ---------------------------------------------------------------- BIS
def fetch_bis():
    for ds in ["WS_TC", "WS_DSR", "WS_SPP", "WS_CBPOL"]:
        url = f"https://data.bis.org/static/bulk/{ds}_csv_col.zip"
        save("bis", f"{ds}_csv_col.zip", get(url), url, "BIS bulk download, wide (col) CSV in zip, as published")


# ---------------------------------------------------------------- FRED
FRED = {
    # long yields (OECD MEI via FRED)
    "IRLTLT01AUM156N": "AUS 10y gov yield, monthly (OECD via FRED)",
    "IRLTLT01GBM156N": "GBR 10y gov yield",
    "IRLTLT01JPM156N": "JPN 10y gov yield",
    "IRLTLT01EZM156N": "Euro area 10y gov yield",
    # unemployment
    "LRUNTTTTAUM156S": "AUS unemployment rate, monthly SA (OECD via FRED)",
    "LRUNTTTTJPM156S": "JPN unemployment rate, monthly SA (OECD via FRED)",
    "IRSTCB01JPM156N": "JPN central bank rate (call money), monthly (OECD via FRED; fills BIS gaps 2002-05, 2014-15)",
    "IRSTCB01CNM156N": "CHN central bank rate, monthly (OECD via FRED; gap filler for BIS)",
    # share prices
    "SPASTT01AUM661N": "AUS share price index (OECD via FRED)",
    "SPASTT01GBM661N": "GBR share price index",
    "SPASTT01JPM661N": "JPN share price index",
    "SPASTT01EZM661N": "Euro area share price index",
    "SPASTT01CNM661N": "CHN share price index",
    # FX
    "EXUSAL": "USD per AUD, monthly average",
    "EXUSUK": "USD per GBP, monthly average",
    "EXJPUS": "JPY per USD, monthly average",
    "EXUSEU": "USD per EUR, monthly average (1999+)",
    "EXCHUS": "CNY per USD, monthly average",
    "EXGEUS": "DEM per USD, monthly average (EA pre-1999: /1.95583)",
    # oil
    "LRHUTTTTEZM156S": "Euro area unemployment rate monthly SA (OECD via FRED; used for 1995-1999)",
    "MCOILWTICO": "WTI crude oil $/bbl, monthly",
}


# FX extras for the FX reactor (src/ui/fx-reactor.js) -> src/data/usd-index.js. Separate source key so a refresh does not re-pull the rest.
FRED_FX = {
    "DTWEXBGS": "Nominal broad US dollar index (Jan 2006 = 100), daily, 2006+ (Federal Reserve H.10 via FRED)",
    "TWEXBMTH": "Trade-weighted US dollar index: broad (Jan 1997 = 100), monthly, 1973-2019 (discontinued; splice for pre-2006)",
    "TWEXB": "Trade-weighted US dollar index: broad (Jan 1997 = 100), weekly, 1995-2019 (discontinued; fallback for the splice)",
    "PIORECRUSDM": "Global price of iron ore, USD per dry metric ton, monthly (IMF primary commodity prices via FRED): AUS terms-of-trade proxy",
}


def fetch_fred(ids=None):
    for sid, note in (ids or FRED).items():
        url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}"
        try:
            save("fred", f"{sid}.csv", get(url), url, note)
        except Exception as e:  # noqa
            print("  FAIL", sid, e)


# ---------------------------------------------------------------- IMF (api.imf.org SDMX 2.1)
IMF_KEEP = ["COUNTRY", "INDICATOR", "COUNTERPART_COUNTRY", "PRICE_TYPE", "S_ADJUSTMENT", "TYPE_OF_TRANSFORMATION",
            "FXR_CURRENCY", "FREQUENCY", "TIME_PERIOD", "OBS_VALUE", "SCALE", "UNIT"]


def imf(path):
    url = "https://api.imf.org/external/sdmx/2.1/data/" + path
    raw = get(url, accept="application/vnd.sdmx.data+csv;version=1.0.0")
    d = pd.read_csv(io.BytesIO(raw), low_memory=False)
    return url, d[[c for c in IMF_KEEP if c in d.columns]]


def fetch_imf():
    members = ["AUT", "BEL", "HRV", "CYP", "EST", "FIN", "FRA", "DEU", "GRC", "IRL", "ITA", "LVA", "LTU", "LUX",
               "MLT", "NLD", "PRT", "SVK", "SVN", "ESP"]
    six = ["USA", "CHN", "G163", "JPN", "GBR", "AUS"]
    # WEO (latest vintage): GDP USD, real growth, current account, gov gross debt, CPI inflation; world G001 and euro area G163
    url, d = imf("IMF.RES,WEO/G001+G163+USA+CHN+JPN+GBR+AUS.NGDPD+NGDP_RPCH+BCA_NGDPD+GGXWDG_NGDP+PCPIPCH.A?startPeriod=1990&endPeriod=2026")
    save("imf", "weo.csv", d.to_csv(index=False), url, "IMF WEO latest vintage, annual, 1990-2026")
    # COFER: currency composition of official FX reserves, world (G001), annual, share of allocated reserves
    url, d = imf("IMF.STA,COFER/G001....A?startPeriod=1995")
    save("imf", "cofer.csv", d.to_csv(index=False), url, "IMF COFER, world, annual, all indicators/currencies")
    # IMTS (ex-DOTS) bilateral trade, annual: exports (FOB) reported by exporter, imports (CIF) reported by importer
    cps = "+".join(six + ["G001"])
    frames = []
    for ind in ["XG_FOB_USD", "MG_CIF_USD"]:
        url, d = imf(f"IMF.STA,IMTS/{'+'.join(six)}.{ind}.{cps}.A?startPeriod=1995&endPeriod=2025")
        frames.append(d)
    save("imf", "imts_trade.csv", pd.concat(frames).to_csv(index=False), url,
         "IMF IMTS (ex-DOTS): XG_FOB_USD & MG_CIF_USD, six economies (G163 = euro area) vs partners and World G001")
    # CPI for Japan after OECD feed stops (mid-2021): all items, yoy %, monthly
    url, d = imf("IMF.STA,CPI/JPN.CPI._T.YOY_PCH_PA_PT.M?startPeriod=1994")
    save("imf", "cpi_jpn_yoy.csv", d.to_csv(index=False), url, "IMF CPI Japan all items yoy %, monthly (OECD feed ends 2021-06)")
    # Quarterly national accounts: GDP current prices (V) and volume (Q), SA and NSA
    url, d = imf("IMF.STA,QNEA/AUS+GBR+JPN+CHN+G163.B1GQ....Q?startPeriod=1993")
    save("imf", "qnea_gdp.csv", d.to_csv(index=False), url, "IMF QNEA GDP B1GQ, V=current prices, Q=volume, SA/NSA, quarterly")


# ---------------------------------------------------------------- OECD (CPI)
def fetch_oecd():
    base = "https://sdmx.oecd.org/public/rest/data/OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL,1.0/"
    acc = "application/vnd.sdmx.data+csv; charset=utf-8"
    parts = []
    for freq in ["M", "Q"]:
        url = base + f"AUS+GBR+JPN+EA20+CHN.{freq}.N.CPI.PA._T+_TXCP01_NRG.N.GY?startPeriod=1994-01"
        d = pd.read_csv(io.BytesIO(get(url, accept=acc)))
        parts.append(d[["REF_AREA", "FREQ", "EXPENDITURE", "TIME_PERIOD", "OBS_VALUE"]])
    save("oecd", "cpi_yoy.csv", pd.concat(parts).to_csv(index=False), base + "...",
         "OECD CPI yoy growth (GY), _T all items and _TXCP01_NRG all items excl food & energy; M and Q")


# ---------------------------------------------------------------- national / others
def fetch_misc():
    # US Treasury TIC
    for name, url in [
        ("mfhhis01.txt", "https://ticdata.treasury.gov/resource-center/data-chart-center/tic/Documents/mfhhis01.txt"),
        ("mfh.txt", "https://ticdata.treasury.gov/Publish/mfh.txt"),
    ]:
        save("tic", name, get(url), url, "TIC Major Foreign Holders of Treasury securities")
    # World Bank (annual): trade openness, China unemployment
    for ind in ["NE.EXP.GNFS.ZS", "NE.IMP.GNFS.ZS", "SL.UEM.TOTL.ZS"]:
        url = (f"https://api.worldbank.org/v2/country/AUS;GBR;JPN;CHN;USA;EMU/indicator/{ind}"
               "?format=json&per_page=20000&date=1995:2025")
        save("worldbank", f"{ind}.json", get(url), url, "World Bank WDI")
    # RBA indicator lending rates
    for name in ["f05hist.xlsx"]:
        url = f"https://www.rba.gov.au/statistics/tables/xls/{name}"
        try:
            save("rba", name, get(url), url, "RBA F5 indicator lending rates")
        except Exception as e:  # noqa
            print("  FAIL", name, e)
    # BoE: quoted household mortgage rate (SVR)
    url = ("https://www.bankofengland.co.uk/boeapps/iadb/fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/1995&Dateto=now"
           "&SeriesCodes=IUMTLMV&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N")
    save("boe", "IUMTLMV.csv", get(url), url, "BoE IADB IUMTLMV: monthly average of quoted household mortgage SVR")
    # ECB: bank interest rate on new housing loans, euro area
    url = "https://data-api.ecb.europa.eu/service/data/MIR/M.U2.B.A2C.AM.R.A.2250.EUR.N?format=csvdata"
    d = pd.read_csv(io.BytesIO(get(url)))[["KEY", "TIME_PERIOD", "OBS_VALUE"]]
    save("ecb", "mir_housing_new.csv", d.to_csv(index=False), url, "ECB MIR housing loans new business rate, euro area")
    # Eurostat: euro area unemployment (monthly, SA)
    url = ("https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/une_rt_m/"
           "M.SA.TOTAL.PC_ACT.T.EA21?format=SDMX-CSV&startPeriod=1995-01")
    try:
        d = pd.read_csv(io.BytesIO(get(url)))
        save("eurostat", "une_rt_m_EA21.csv", d[["TIME_PERIOD", "OBS_VALUE"]].to_csv(index=False), url,
             "Eurostat une_rt_m euro area EA21 (from 2000), SA, % of active population")
    except Exception as e:  # noqa
        print("  FAIL eurostat une", e)
    # ONS: UK unemployment rate 16+ SA (MGSX)
    url = "https://www.ons.gov.uk/generator?format=csv&uri=/employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms"
    try:
        save("ons", "mgsx.csv", get(url), url, "ONS MGSX unemployment rate 16+, SA")
    except Exception as e:  # noqa
        print("  FAIL ons", e)


def fetch_population():
    """World Bank SP.POP.TOTL (total population, annual) for the six economies, 1995-latest: the per-person score of the objective strip."""
    ind = "SP.POP.TOTL"
    url = (f"https://api.worldbank.org/v2/country/AUS;GBR;JPN;CHN;USA;EMU/indicator/{ind}"
           "?format=json&per_page=20000&date=1995:2026")
    save("worldbank", f"{ind}.json", get(url), url, "World Bank WDI total population (EMU = euro area aggregate); mid-year estimates")


def copy_gold():
    """Gold monthly USD price: reuse the read-only copy from the parent research project (same file the US data uses)."""
    import shutil
    src = ROOT.parent / "dalio_432" / "cache" / "gold_github_monthly_2026-10-26.csv"
    dst = RAW / "gold"
    dst.mkdir(parents=True, exist_ok=True)
    if src.exists():
        shutil.copyfile(src, dst / src.name)
        LOG.append((f"gold/{src.name}", "copied from ../dalio_432/cache (originally datasets/gold-prices monthly, GitHub)", "2026-10-26", "", src.stat().st_size))


# ---------------------------------------------------------------- the FX 1-year fit (tools/build_fx_fit.py -> src/data/fx-fit.js)
# Each source in its own folder (approved 2026-10-29): risk (VIX), Australia's terms of trade (ABS national accounts, RBA commodity
# prices) and real GDP per person (productivity, optional). Saved as published; nothing is executed.
def fetch_fxfit():
    url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=VIXCLS"
    save("fred_vix", "VIXCLS.csv", get(url), url, "CBOE VIX close, daily, 1990+ (FRED VIXCLS): 信心/避险 for the FX 1-year fit")
    url = "https://data.api.abs.gov.au/rest/data/ABS,ANA_AGG,1.0.0/.TTR...Q?startPeriod=1959-Q1"
    save("abs", "ana_agg_ttr.csv", get(url, accept="application/vnd.sdmx.data+csv;version=1.0.0"), url,
         "ABS Data API, ANA_AGG (cat. 5206.0 key aggregates) TTR = terms of trade; MEASURE M5 index / M6 % change; TSEST 10 original, 20 SA, 30 trend; quarterly 1959+")
    url = "https://www.rba.gov.au/statistics/tables/csv/i2-data.csv"
    save("rba_i2", "i2-data.csv", get(url), url, "RBA statistical table I2: Index of Commodity Prices (AUD, SDR, USD terms), monthly 1982+")
    url = ("https://api.worldbank.org/v2/country/AUS;JPN;USA/indicator/NY.GDP.PCAP.KD"
           "?format=json&per_page=20000&date=1990:2025")
    save("worldbank_gdppc", "NY.GDP.PCAP.KD.json", get(url), url, "World Bank WDI GDP per capita, constant 2015 USD, annual (productivity proxy, optional)")


SOURCES = {"gold": copy_gold, "bis": fetch_bis, "fred": fetch_fred, "imf": fetch_imf, "oecd": fetch_oecd, "misc": fetch_misc, "population": fetch_population,
           "fxextra": lambda: fetch_fred(FRED_FX), "fxfit": fetch_fxfit}

if __name__ == "__main__":
    which = sys.argv[1:] or list(SOURCES)
    for k in which:
        print("==", k)
        try:
            SOURCES[k]()
        except Exception as e:  # noqa
            print("  SOURCE FAILED", k, repr(e))
    # merge into the log of earlier runs
    logp = RAW / "_download_log.json"
    old = json.loads(logp.read_text(encoding="utf-8")) if logp.exists() else {}
    for f, url, dt, note, n in LOG:
        old[f] = {"url": url, "date": dt, "note": note, "bytes": n}
    logp.write_text(json.dumps(old, indent=1, ensure_ascii=False), encoding="utf-8")
