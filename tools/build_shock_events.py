"""Build src/data/shock-events.js: the event trajectories of the lesson 「水的问题，还是河道的问题」 (src/data/lesson-shocks.js).

Run:  %USERPROFILE%\\.venvs\\dalio432\\Scripts\\python.exe -I tools/build_shock_events.py [fetch]
  fetch   download the raw files into data_src/shocks/<source>/ first (FRED csv, IMF WEO via api.imf.org SDMX); then build.
  (none)  build from the saved raw files, no network.

Sources (read only):
  ../dalio_432/data/jst_panel.csv            JST Macrohistory R6 (annual, to 2020): real GDP = rgdpmad * pop, cpi (index), unemp
  data_src/shocks/fred/*.csv                 FRED GDPC1 (real GDP, quarterly), CPIAUCSL / CPIAUCNS (CPI-U, monthly), UNRATE
  data_src/shocks/imf/weo_shocks.csv         IMF WEO latest vintage: NGDP_RPCH (real GDP growth), PCPIPCH (CPI inflation), LUR, DEU G163 CHN USA

Series per country (annual):
  USA  JST 1870-2020; 2021+ chain-linked with FRED growth (real GDP: calendar-year mean of GDPC1; CPI: calendar-year mean of CPIAUCSL;
       unemployment: mean of UNRATE). Same splice as tools/build_waves.py.
  DEU, EA (G163), CHN  WEO growth / inflation rates (an index is built from the growth rates). WEO years after 2025 are projections: dropped.

Method (the quadrant, one point per year of an event):
  x_t = how far real GDP is above (+) or below (-) the OLD trend path, in %:  100 * (Y_t / (Y_base * (1+g)^(t-base)) - 1)
        g = average real GDP growth over the event's trend window (default: the 10 years before the base year), so no hindsight.
        Each arrow segment = one year's move = (that year's growth - g), roughly.
  y_t = inflation in year t minus inflation in the base year, in percentage points (CPI, calendar-year average vs the year before).
  Point 0 = the base year = (0, 0). Years from 2022 on are flagged hold:true (保留样本: after the research cut-off).
"""
import io
import json
import sys
import time
import urllib.request
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
D432 = ROOT.parent / "dalio_432"
RAW = ROOT / "data_src" / "shocks"
OUT = ROOT / "src" / "data" / "shock-events.js"
UA = "macro-waterflow-data-fetch/1.0 (teaching project; research use)"
HOLD_FROM = 2022           # 保留样本 from this year on
LAST_FULL = 2025           # last full calendar year of data


# ------------------------------------------------------------------------------------------------ fetch
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


def fetch():
    log = []
    def save(folder, name, data, url, note):
        d = RAW / folder
        d.mkdir(parents=True, exist_ok=True)
        (d / name).write_bytes(data if isinstance(data, bytes) else data.encode("utf-8"))
        log.append({"file": f"{folder}/{name}", "url": url, "downloaded": str(date.today()), "note": note})
        print(f"  saved {folder}/{name} ({len(data) / 1e3:.0f} kB)")
    for sid, note in [("GDPC1", "US real GDP, quarterly SAAR, chained 2017 USD"), ("CPIAUCSL", "US CPI-U all items, monthly SA"),
                      ("CPIAUCNS", "US CPI-U all items, monthly NSA (the headline 比一年前 figure BLS publishes)"),
                      ("UNRATE", "US unemployment rate, monthly SA")]:
        url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}"
        save("fred", f"{sid}.csv", get(url), url, note)
    url = ("https://api.imf.org/external/sdmx/2.1/data/IMF.RES,WEO/DEU+G163+CHN+USA+JPN.NGDP_RPCH+PCPIPCH+LUR.A"
           "?startPeriod=1980&endPeriod=2026")
    raw = get(url, accept="application/vnd.sdmx.data+csv;version=1.0.0")
    d = pd.read_csv(io.BytesIO(raw), low_memory=False)
    d = d[[c for c in ["COUNTRY", "INDICATOR", "FREQUENCY", "TIME_PERIOD", "OBS_VALUE"] if c in d.columns]]
    save("imf", "weo_shocks.csv", d.to_csv(index=False), url, "IMF WEO latest vintage: real GDP growth, CPI inflation, unemployment, annual 1980-2026")
    (RAW / "_download_log.json").write_text(json.dumps(log, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "fetch":
    fetch()


# ------------------------------------------------------------------------------------------------ build
# events drawn on the quadrant: id, country, base year, last year, trend window (from, to) or None = the 10 years before the base, group
EVENTS = [
    ("ww1",     "USA", 1915, 1922, None,         "war"),
    ("gd",      "USA", 1929, 1933, None,         "war"),
    ("r37",     "USA", 1936, 1938, None,         "war"),
    ("ww2",     "USA", 1940, 1948, None,         "war"),
    ("b1",      "USA", 1964, 1973, None,         "modern"),
    ("oil73",   "USA", 1973, 1975, None,         "modern"),
    ("oil79",   "USA", 1978, 1980, None,         "modern"),
    ("volcker", "USA", 1980, 1983, None,         "modern"),
    ("net",     "USA", 1995, 2000, None,         "modern"),
    ("gfc",     "USA", 2007, 2010, None,         "modern"),
    ("covid",   "USA", 2019, 2023, None,         "modern"),
    ("ukr",     "DEU", 2021, 2024, None,         "modern"),
    ("chn",     "CHN", 2019, 2025, (2014, 2019), "modern"),
]
SRC = {
    "USA": "JST Macrohistory（1947 年以前）+ FRED：实际 GDP GDPC1、CPI CPIAUCSL、失业率 UNRATE（1948 年起，全年平均）",
    "DEU": "IMF WEO（最新一期）：实际 GDP 增速、CPI 通胀、失业率",
    "CHN": "IMF WEO（最新一期）：实际 GDP 增速、CPI 通胀、失业率",
}
NAME = {"USA": "美国", "DEU": "德国", "CHN": "中国"}


def annual_usa():
    """USA annual index levels: JST to 1947, chain-linked with FRED annual means from 1948 on."""
    j = pd.read_csv(D432 / "data" / "jst_panel.csv")
    u = j[j.iso == "USA"].set_index("year").sort_index()
    gdp = (u.rgdpmad * u["pop"]).loc[:1947].dropna()
    cpi = u.cpi.loc[:1947].dropna()
    une = u.unemp.loc[:1947].dropna()
    fred = lambda s: pd.read_csv(RAW / "fred" / f"{s}.csv", parse_dates=["observation_date"]).set_index("observation_date").iloc[:, 0]
    def ann(s):
        x = fred(s)
        n = x.groupby(x.index.year).count()
        m = x.groupby(x.index.year).mean()
        full = (n == 4) if s == "GDPC1" else (n >= 11)   # 2025-10 was never published (US government shutdown): mean of 11 months
        return m[full]
    G, C, U = ann("GDPC1"), ann("CPIAUCSL"), ann("UNRATE")
    for y in range(1948, LAST_FULL + 1):
        gdp.loc[y] = gdp.loc[y - 1] * G.loc[y] / G.loc[y - 1]
        cpi.loc[y] = cpi.loc[y - 1] * C.loc[y] / C.loc[y - 1]
        une.loc[y] = U.loc[y]
    return gdp, cpi, une


def annual_weo(iso):
    w = pd.read_csv(RAW / "imf" / "weo_shocks.csv")
    w = w[w.COUNTRY == iso]
    s = lambda ind: w[w.INDICATOR == ind].set_index("TIME_PERIOD").OBS_VALUE.sort_index().loc[:LAST_FULL]
    gr, pi, lur = s("NGDP_RPCH"), s("PCPIPCH"), s("LUR")
    gdp = (1 + gr / 100).cumprod()
    cpi = (1 + pi / 100).cumprod()
    return gdp, cpi, lur


def r(v, n=2):
    return None if v is None or (isinstance(v, float) and np.isnan(v)) else round(float(v), n)


def build():
    series = {"USA": annual_usa(), "DEU": annual_weo("DEU"), "CHN": annual_weo("CHN")}
    out = []
    for eid, iso, b, e, tw, grp in EVENTS:
        gdp, cpi, une = series[iso]
        t0, t1 = tw or (b - 10, b)
        g = (gdp.loc[t1] / gdp.loc[t0]) ** (1 / (t1 - t0)) - 1
        infl = lambda y: (cpi.loc[y] / cpi.loc[y - 1] - 1) * 100
        pts = []
        for y in range(b, e + 1):
            x = (gdp.loc[y] / (gdp.loc[b] * (1 + g) ** (y - b)) - 1) * 100
            p = {"y": y, "x": r(x), "dy": r(infl(y) - infl(b)), "gr": r((gdp.loc[y] / gdp.loc[y - 1] - 1) * 100), "pi": r(infl(y)),
                 "u": r(une.get(y, np.nan), 1)}
            if y >= HOLD_FROM:
                p["hold"] = True
            pts.append(p)
        out.append({"id": eid, "iso": iso, "country": NAME[iso], "group": grp, "base": b, "until": e, "trend": [t0, t1],
                    "g": r(g * 100), "src": SRC[iso], "pts": pts})
        print(f"{eid:8s} {iso} g={g * 100:.2f}% " + "  ".join(f"{p['y']}:({p['x']:+.1f},{p['dy']:+.1f}) gr{p['gr']} pi{p['pi']}" for p in pts))
    meta = {
        "asOf": str(date.today()), "holdFrom": HOLD_FROM,
        "x": "实际 GDP 比旧趋势线高（+）或低（−）百分之几：旧趋势 = 冲击前 10 年的平均增速（另有说明的除外），从基准年起照这个速度画直线。",
        "y": "通胀（CPI 全年平均比一年前涨幅）比基准年高（+）或低（−）几个百分点。",
        "method": "每个事件从基准年 (0, 0) 出发，一年一个点；每一段箭头 = 那一年的移动。2022 年起的点是保留样本（研究截止以后的数据）。",
    }
    js = ("// AUTO-GENERATED by tools/build_shock_events.py - do not edit by hand. Checked by tools/check_lesson_shocks.mjs (recomputed from the raw files).\n"
          f"export const SHOCK_META = {json.dumps(meta, ensure_ascii=False)};\n"
          f"export const SHOCK_EVENTS = {json.dumps(out, ensure_ascii=False)};\n")
    OUT.write_text(js, encoding="utf-8")
    print("wrote", OUT.relative_to(ROOT), f"({len(js) / 1e3:.1f} kB)")


if __name__ == "__main__":
    build()
