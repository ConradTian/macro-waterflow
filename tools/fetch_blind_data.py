"""Download the raw files for the 历史盲测 (blind backtest) deck into data_src/blind/<source>/.

Run:  %USERPROFILE%/.venvs/dalio432/Scripts/python.exe -I tools/fetch_blind_data.py [source ...]
Only needed when refreshing; tools/build_blind_data.py rebuilds from the saved files with no network.
This is the ONLY blind-mode script that uses the network.

What it gets (everything else comes from JST in ../dalio_432 and the files already in data_src/world):
  chinabond  ChinaBond CGB yield curve (3M, 1Y, 10Y ...) daily, 2002-2025, from the PBOC-hosted history page
  csindex    CSI 300 total return (H00300) and price (000300) daily closes + P/E, from China Securities Index Co.
  oecd       OECD Financial market (FINMARK): 3M rate, 10y rate, share prices, monthly, CHN/USA/JPN/AUS
  local     copies of already-downloaded US files from ../dalio_432 (read-only there): Ken French US market returns,
             Shiller monthly (US dividends), FRED UNRATE, FRED DTB3

Downloaded files are data only (CSV/JSON/XLSX); nothing is executed. Each source has its own folder.
Honest user-agent, no workarounds for blocked endpoints.
"""
import io
import json
import re
import shutil
import sys
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data_src" / "blind"
DALIO = ROOT.parent / "dalio_432"
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


# ---------------------------------------------------------------- ChinaBond (中债国债收益率曲线)
def fetch_chinabond():
    """The PBOC-hosted ChinaBond history page returns one HTML table per query (<= 1 year). We keep only the rows of
    中债国债收益率曲线 (CGB curve), parsed to CSV; the HTML itself is not kept."""
    base = "https://yield.chinabond.com.cn/cbweb-pbc-web/pbc/historyQuery?"
    rows = []
    for y in range(2002, 2026):
        q = urllib.parse.urlencode({"startDate": f"{y}-01-01", "endDate": f"{y}-12-31", "gjqx": "0", "qxId": "ycqx", "locale": "cn_ZH"})
        t = get(base + q).decode("utf-8", "replace")
        n = 0
        for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", t, re.S):
            cells = [re.sub(r"<[^>]+>", "", c).strip() for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S)]
            if len(cells) == 10 and cells[0] == "中债国债收益率曲线" and re.fullmatch(r"\d{4}-\d{2}-\d{2}", cells[1]):
                rows.append(cells[1:])
                n += 1
        print(f"  {y}: {n} days")
        time.sleep(1)
    d = pd.DataFrame(rows, columns=["date", "m3", "m6", "y1", "y3", "y5", "y7", "y10", "y30"]).drop_duplicates("date").sort_values("date")
    save("chinabond", "cgb_curve.csv", d.to_csv(index=False), base + "startDate=YYYY-01-01&endDate=YYYY-12-31&gjqx=0&qxId=ycqx&locale=cn_ZH",
         "ChinaBond CGB yield curve (中债国债收益率曲线), percent, daily, years 2002-2025; parsed from the HTML table")


# ---------------------------------------------------------------- CSI (中证指数)
def fetch_csindex():
    for code, note in [("H00300", "CSI 300 Total Return Index (沪深300全收益), daily close"),
                       ("000300", "CSI 300 price index (沪深300), daily close + P/E (peg, from 2011-06)")]:
        url = f"https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode={code}&startDate=20020101&endDate=20251231"
        j = json.loads(get(url))
        d = pd.DataFrame(j["data"])[["tradeDate", "close", "peg"]]
        d = d[d.tradeDate >= "20020101"]
        save("csindex", f"{code}.csv", d.to_csv(index=False), url, note)


# ---------------------------------------------------------------- OECD FINMARK
def fetch_oecd():
    url = ("https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_STES@DF_FINMARK,4.0/"
           "CHN+USA+JPN+AUS.M........?startPeriod=1990-01")
    d = pd.read_csv(io.BytesIO(get(url, accept="application/vnd.sdmx.data+csv; charset=utf-8")))
    d = d[["REF_AREA", "MEASURE", "UNIT_MEASURE", "TIME_PERIOD", "OBS_VALUE"]]
    save("oecd", "finmark.csv", d.to_csv(index=False), url,
         "OECD Financial market indicators, monthly: IR3TIB 3-month rate, IRLT 10y gov yield, SHARE share price index, CC FX")


# (RBA F7 was tried on 2026-10-29: it is now "business lending rates"; the RBA no longer publishes a share-market table,
#  so AUS 2021+ equity uses the OECD share price index + an assumed dividend yield, see tools/BLIND-DATA.md.)


# ---------------------------------------------------------------- local copies (read-only source)
LOCAL = [
    ("data/kenfrench_monthly.csv", "Ken French US market MKT_RF+RF monthly (dalio_432 processed copy of the F-F 3 factors)"),
    ("data/shiller_monthly.csv", "Shiller monthly P, D, E, CPI, CAPE (dalio_432 processed copy of ie_data.xls)"),
    ("cache/fred_UNRATE_2026-10-26.csv", "FRED UNRATE US unemployment rate, monthly SA"),
    ("cache/fred_DTB3_2026-10-26.csv", "FRED DTB3 US 3-month T-bill, daily, 1954+ (within-year timing of the short rate)"),
]


def copy_local():
    dst = RAW / "local"
    dst.mkdir(parents=True, exist_ok=True)
    for rel, note in LOCAL:
        src = DALIO / rel
        if src.exists():
            shutil.copyfile(src, dst / src.name)
            LOG.append((f"local/{src.name}", f"copied from ../dalio_432/{rel}", "2026-10-26", note, src.stat().st_size))
            print(f"  copied {src.name}")
        else:
            print("  MISSING", rel)


SOURCES = {"chinabond": fetch_chinabond, "csindex": fetch_csindex, "oecd": fetch_oecd, "local": copy_local}

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
    logp.parent.mkdir(parents=True, exist_ok=True)
    logp.write_text(json.dumps(old, indent=1, ensure_ascii=False), encoding="utf-8")
