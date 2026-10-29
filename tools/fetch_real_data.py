"""Download the raw files for the REAL-data layer (src/data/real/*.js) into data_src/real/<source>/.

Run:  %USERPROFILE%/.venvs/dalio432/Scripts/python.exe -I tools/fetch_real_data.py [source ...]
      sources: fred abs oecd rba bis aofm gold   (default: all)
Only needed when refreshing; tools/build_real_data.py rebuilds from the saved files with no network.

Downloaded files are data only (CSV/XLSX/ZIP); nothing is executed. Saved as published.
Each download is logged (file, URL, date, bytes, note) in data_src/real/_download_log.json.
Approved by the user 2026-10-30 (real-data agent): FRED for the US, ABS / RBA for Australia (+ BIS, OECD, AOFM, gold).
"""
import json
import sys
import time
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data_src" / "real"
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
    (d / name).write_bytes(data)
    LOG.append((f"{folder}/{name}", url, str(date.today()), note, len(data)))
    print(f"  saved {folder}/{name} ({len(data) / 1e3:.0f} kB)")


# ---------------------------------------------------------------- FRED (US; plus a few world / AUS series)
FRED = {
    # --- US: every series of us-quarterly.js, from source
    "FEDFUNDS": "US effective federal funds rate, monthly %",
    "MORTGAGE30US": "Freddie Mac PMMS 30y fixed mortgage rate, weekly %",
    "DGS10": "US 10y Treasury constant maturity, daily %",
    "CPIAUCSL": "US CPI all items, SA index, monthly",
    "CPILFESL": "US CPI less food and energy, SA index, monthly",
    "UNRATE": "US unemployment rate, SA, monthly %",
    "GDP": "US nominal GDP, $bn SAAR, quarterly",
    "GDPC1": "US real GDP, chained 2017 $bn SAAR, quarterly",
    "CSUSHPINSA": "S&P/Case-Shiller US national home price index, NSA, monthly",
    "MCOILWTICO": "WTI crude oil $/bbl, monthly average",
    "GFDEGDQ188S": "US federal debt % of GDP, quarterly",
    "TOTBKCR": "US bank credit, all commercial banks, $bn, weekly",
    "EXPGS": "US exports of goods and services, $bn SAAR",
    "IMPGS": "US imports of goods and services, $bn SAAR",
    "FDHBFIN": "Federal debt held by foreign and international investors, $bn, quarterly",
    "GFDEBTN": "Federal debt: total public debt, $mn, quarterly",
    "FGDEF": "Federal government current receipts minus current expenditures (net federal saving), $bn SAAR",
    "A091RC1Q027SBEA": "Federal government current expenditures: interest payments, $bn SAAR",
    # --- US: new series for the real layer
    "FGRECPT": "Federal government current receipts, $bn SAAR (denominator of interest / tax)",
    "M2SL": "US M2 money stock, $bn SA, monthly",
    "DRALACBS": "Delinquency rate on all loans, all commercial banks, % SA, quarterly",
    "CORALACBS": "Charge-off rate on all loans, all commercial banks, % SA annualised, quarterly",
    "DRSFRMACBS": "Delinquency rate on single-family residential mortgages, commercial banks, % SA, quarterly",
    "GDPPOT": "CBO real potential GDP, chained 2017 $bn, quarterly (projection past the data)",
    "PCEC": "Personal consumption expenditures, $bn SAAR (outlet C)",
    "GPDI": "Gross private domestic investment incl. inventories, $bn SAAR (outlet I)",
    "GCE": "Government consumption expenditures and gross investment, $bn SAAR (outlet G)",
    "NETEXP": "Net exports of goods and services, $bn SAAR (outlet NX)",
    "TTLHH": "US total households, thousands, annual (house price / income per household)",
    "WALCL": "Fed total assets, $mn, weekly (QE stock proxy, 2002-12 on)",
    "TDSP": "Household debt service payments % of disposable income (Fed), quarterly, 2005 on: extends the BIS DSR",
    "CMDEBT": "Households and nonprofits; debt securities and loans; liability, $bn, quarterly (Z.1): extends BIS household credit",
    "BCNSDODNS": "Nonfinancial corporate business; debt securities and loans; liability, $bn, quarterly (Z.1): extends BIS private credit",
    # --- AUS / world from FRED (same ids as data_src/world/fred, refreshed)
    "IRLTLT01AUM156N": "AUS 10y government bond yield, monthly (OECD MEI via FRED)",
    "SPASTT01AUM661N": "AUS share price index, monthly (OECD MEI via FRED)",
    "EXUSAL": "USD per AUD, monthly average (Fed H.10)",
}


def fetch_fred():
    for sid, note in FRED.items():
        url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}"
        try:
            save("fred", f"{sid}.csv", get(url), url, note)
        except Exception as e:  # noqa
            print("  FAIL", sid, e)


# ---------------------------------------------------------------- ABS Data API (SDMX, csv with labels)
ABS = {
    # Expenditure on GDP (cat. 5206.0): current prices (C) and chain volumes (VCH), seasonally adjusted (20).
    # Items: GDP, household FCE (PHS), general-government FCE (GGS), GFCF private (PSS) / public (GSS), inventories, X, M, statistical discrepancy.
    "ana_exp.csv": ("ANA_EXP,1.0.0/C+VCH.GPM+FCE+GFC+IST+XGS+MGS+SDE+GNE.SSS+PHS+GGS+PSS+GSS.20.AUS.Q?startPeriod=1959-Q3",
                    "ABS 5206.0 expenditure on GDP, current prices + chain volumes, SA, quarterly (from 1959Q3: burn-in for the one-sided HP trend)"),
    "lf_unemp.csv": ("LF,1.0.0/M13.3.1599.20.AUS.M?startPeriod=1990-01",
                     "ABS 6202.0 Labour Force: unemployment rate, persons 15+, SA, monthly"),
    "cpi_q.csv": ("CPI_Q,1.0.0/1+3.999901+999902.20.50.Q?startPeriod=1990-Q1",
                  "ABS 6401.0 CPI: all groups SA + trimmed mean, index and yoy, weighted average of 8 capitals, quarterly"),
    "erp_q.csv": ("ERP_Q,1.0.0/1.3.TOT.AUS.Q?startPeriod=1990-Q1",
                  "ABS 3101.0 estimated resident population, Australia, persons, quarterly"),
}


def fetch_abs():
    for name, (path, note) in ABS.items():
        url = "https://data.api.abs.gov.au/rest/data/ABS," + path + ("&" if "?" in path else "?") + "format=csvfilewithlabels"
        try:
            save("abs", name, get(url), url, note)
        except Exception as e:  # noqa
            print("  FAIL abs", name, e)


# ---------------------------------------------------------------- OECD CPI (AUS: the AUS_Q definition)
def fetch_oecd():
    url = ("https://sdmx.oecd.org/public/rest/data/OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL,1.0/"
           "AUS.M+Q.N.CPI.PA._T+_TXCP01_NRG.N.GY?startPeriod=1994-01")
    save("oecd", "cpi_aus_yoy.csv", get(url, accept="application/vnd.sdmx.data+csv; charset=utf-8"), url,
         "OECD CPI yoy (GY), AUS, all items (_T) and excl. food & energy (_TXCP01_NRG), monthly + quarterly")


# ---------------------------------------------------------------- RBA statistical tables (csv)
RBA = {
    "f1.1-data.csv": "RBA F1.1 money market: cash rate target, monthly average",
    "f5-data.csv": "RBA F5 indicator lending rates (FILRHLBVS = banks' standard variable owner-occupier housing rate), monthly",
    "d3-data.csv": "RBA D3 monetary aggregates (M3 = DMAM3N original, DMAM3S seasonally adjusted, $bn), monthly",
    "d2-data.csv": "RBA D2 lending and credit aggregates ($bn, monthly): extends the BIS credit levels past their last quarter",
    "a1-data.csv": "RBA A1 balance sheet, weekly, 2013 on (Australian dollar securities: bond purchases 2020-22)",
}


def fetch_rba():
    for name, note in RBA.items():
        url = f"https://www.rba.gov.au/statistics/tables/csv/{name}"
        try:
            save("rba", name, get(url), url, note)
        except Exception as e:  # noqa
            print("  FAIL rba", name, e)


# ---------------------------------------------------------------- BIS bulk (credit, DSR, property prices)
def fetch_bis():
    for ds in ["WS_TC", "WS_DSR", "WS_SPP"]:
        url = f"https://data.bis.org/static/bulk/{ds}_csv_col.zip"
        save("bis", f"{ds}_csv_col.zip", get(url), url, "BIS bulk download, wide (col) CSV in zip, as published")


def fetch_aofm():
    url = "https://www.aofm.gov.au/sites/default/files/2025-05-02/foreign_holdings.xlsx"
    save("aofm", "foreign_holdings.xlsx", get(url), url, "AOFM non-resident holdings of AGS, quarterly (sheet AGS)")


def fetch_gold():
    url = "https://raw.githubusercontent.com/datasets/gold-prices/main/data/monthly.csv"
    save("gold", "gold_monthly.csv", get(url), url, "datasets/gold-prices monthly USD gold price (same source as goldIndex in us-quarterly.js)")


SOURCES = {"fred": fetch_fred, "abs": fetch_abs, "oecd": fetch_oecd, "rba": fetch_rba, "bis": fetch_bis, "aofm": fetch_aofm, "gold": fetch_gold}

if __name__ == "__main__":
    which = sys.argv[1:] or list(SOURCES)
    for k in which:
        print("==", k)
        try:
            SOURCES[k]()
        except Exception as e:  # noqa
            print("  SOURCE FAILED", k, repr(e))
    logp = RAW / "_download_log.json"
    old = json.loads(logp.read_text(encoding="utf-8")) if logp.exists() else {}
    for f, url, dt, note, n in LOG:
        old[f] = {"url": url, "date": dt, "note": note, "bytes": n}
    RAW.mkdir(parents=True, exist_ok=True)
    logp.write_text(json.dumps(old, indent=1, ensure_ascii=False), encoding="utf-8")
    print("log:", logp)
