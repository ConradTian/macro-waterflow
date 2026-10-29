"""Shared loaders for build_world_data.py and build_country_data.py (reads data_src/world only, no network)."""
import io
import json
import re
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data_src" / "world"

DATES = [f"{y}Q{q}" for y in range(1995, 2026) for q in range(1, 5)]
assert len(DATES) == 124
QIDX = pd.PeriodIndex(DATES, freq="Q")
YEARS = list(range(1995, 2026))


# ---------------------------------------------------------------- generic helpers
def sig(x, n):
    if x is None or (isinstance(x, float) and np.isnan(x)) or pd.isna(x):
        return None
    return 0 if x == 0 else float(f"{x:.{n}g}")


def rebase(s):
    """Rebase so the first quarter (1995Q1) = 100."""
    first = s.iloc[0]
    if pd.isna(first):
        raise ValueError("cannot rebase: first value missing")
    return s / first * 100


def q_mean(s):
    """Monthly (PeriodIndex M) -> quarterly mean, on QIDX."""
    return s.groupby(s.index.asfreq("Q")).mean().reindex(QIDX)


def q_end(s):
    """Monthly -> value of the last month of each quarter, on QIDX."""
    return pd.Series(s.reindex(QIDX.asfreq("M", "end")).values, index=QIDX)


def y_mean(s):
    """Monthly or quarterly Period series -> annual mean, index = YEARS."""
    g = s.groupby(s.index.asfreq("Y")).mean()
    g.index = g.index.year
    return g.reindex(YEARS)


# ---------------------------------------------------------------- FRED
def fred(sid):
    """FRED csv -> float Series with a monthly PeriodIndex (values '.' dropped). For monthly series only."""
    d = pd.read_csv(RAW / "fred" / f"{sid}.csv")
    s = pd.to_numeric(d.iloc[:, 1], errors="coerce")
    s.index = pd.to_datetime(d.iloc[:, 0]).dt.to_period("M")
    return s.dropna()


def fred_daily_to_monthly(sid):
    d = pd.read_csv(RAW / "fred" / f"{sid}.csv")
    s = pd.to_numeric(d.iloc[:, 1], errors="coerce")
    s.index = pd.to_datetime(d.iloc[:, 0])
    return s.dropna().groupby(s.dropna().index.to_period("M")).mean()


# ---------------------------------------------------------------- BIS bulk (col format zips)
_bis_cache = {}


def bis_table(name):
    if name not in _bis_cache:
        z = zipfile.ZipFile(RAW / "bis" / f"{name}_csv_col.zip")
        _bis_cache[name] = pd.read_csv(z.open(z.namelist()[0]), low_memory=False)
    return _bis_cache[name]


def bis_series(name, key):
    """One BIS series (e.g. 'Q:AU:P:A:M:770:A') -> Series with Period index (Q or M by column format). None if absent."""
    t = bis_table(name)
    r = t[t["Series"] == key]
    if r.empty:
        return None
    row = r.iloc[0]
    out = {}
    for c in t.columns:
        if re.fullmatch(r"\d{4}-Q[1-4]", c):
            v = row[c]
            if pd.notna(v):
                out[pd.Period(c.replace("-", ""), freq="Q")] = float(v)
        elif re.fullmatch(r"\d{4}-\d{2}", c):
            v = row[c]
            if pd.notna(v):
                out[pd.Period(c, freq="M")] = float(v)
    s = pd.Series(out).sort_index()
    return s if len(s) else None


# ---------------------------------------------------------------- IMF QNEA GDP
def qnea(country, price, sa):
    """IMF QNEA B1GQ: price 'V' current / 'Q' volume; sa 'SA'/'NSA'. Quarterly Series on PeriodIndex (raw units)."""
    d = pd.read_csv(RAW / "imf" / "qnea_gdp.csv")
    d = d[(d.COUNTRY == country) & (d.PRICE_TYPE == price) & (d.S_ADJUSTMENT == sa)]
    if d.empty:
        return None
    s = pd.Series(d.OBS_VALUE.values, index=pd.PeriodIndex(d.TIME_PERIOD.str.replace("-", ""), freq="Q"))
    return s.sort_index()


# ---------------------------------------------------------------- OECD CPI
def oecd_cpi_q(area, exp):
    """OECD CPI yoy (%), quarterly Series on QIDX: quarterly obs where present, else mean of the monthly obs."""
    d = pd.read_csv(RAW / "oecd" / "cpi_yoy.csv")
    d = d[(d.REF_AREA == area) & (d.EXPENDITURE == exp)]
    if d.empty:
        return None
    q = d[d.FREQ == "Q"]
    qs = pd.Series(q.OBS_VALUE.values, index=pd.PeriodIndex(q.TIME_PERIOD.str.replace("-", ""), freq="Q"))
    m = d[d.FREQ == "M"]
    ms = pd.Series(m.OBS_VALUE.values, index=pd.PeriodIndex(m.TIME_PERIOD, freq="M"))
    mq = ms.groupby(ms.index.asfreq("Q")).agg(["mean", "count"])
    mq = mq[mq["count"] == 3]["mean"]  # only complete quarters from monthly
    out = qs.combine_first(mq)
    return out.reindex(QIDX)


# ---------------------------------------------------------------- WEO / World Bank (annual)
def weo(country, ind):
    d = pd.read_csv(RAW / "imf" / "weo.csv")
    d = d[(d.COUNTRY == country) & (d.INDICATOR == ind)]
    s = pd.Series(d.OBS_VALUE.values, index=d.TIME_PERIOD.astype(int)).sort_index()
    return s.reindex(YEARS)


def wb(indicator, iso3):
    """World Bank annual indicator -> Series index YEARS (ratio-percent as published)."""
    j = json.loads((RAW / "worldbank" / f"{indicator}.json").read_text(encoding="utf-8"))
    rows = j[1] or []
    out = {}
    for r in rows:
        code = r.get("countryiso3code") or ""
        if code == iso3 and r.get("value") is not None:
            out[int(r["date"])] = float(r["value"])
    return pd.Series(out).sort_index().reindex(YEARS)


def annual_to_q(s):
    """Annual Series (index = year) -> quarterly step series on QIDX (each quarter takes its year's value)."""
    return pd.Series([s.get(p.year, np.nan) for p in QIDX], index=QIDX)


# ---------------------------------------------------------------- gold
def gold_usd_month():
    g = pd.read_csv(RAW / "gold" / "gold_github_monthly_2026-10-26.csv")
    g.index = pd.PeriodIndex(g["Date"], freq="M")
    return g["Price"].astype(float)


# ---------------------------------------------------------------- FX (local currency per USD, monthly)
def fx_month(code):
    if code == "USD":
        return None
    if code == "AUD":
        return 1 / fred("EXUSAL")
    if code == "GBP":
        return 1 / fred("EXUSUK")
    if code == "JPY":
        return fred("EXJPUS")
    if code == "CNY":
        return fred("EXCHUS")
    if code == "EUR":
        eur = 1 / fred("EXUSEU")  # 1999+
        dem = fred("EXGEUS") / 1.95583  # DEM per USD / fixed conversion rate -> synthetic EUR per USD
        return eur.combine_first(dem[dem.index < pd.Period("1999-01", "M")])
    raise KeyError(code)


# ---------------------------------------------------------------- JS output
def js_array(vals, n):
    return json.dumps([sig(v, n) for v in vals], separators=(",", ":"))


def waves_now():
    """Read the 'now' ring position per iso from src/data/waves.js (the file is JSON after the 'export const WAVES = ')."""
    txt = (ROOT / "src" / "data" / "waves.js").read_text(encoding="utf-8")
    body = txt[txt.index("{", txt.index("export const WAVES")):]
    body = body[: body.rindex("};") + 1]
    w = json.loads(body)
    return {c["iso"]: c.get("now") for c in w["countries"]}


# ---------------------------------------------------------------- policy rate (monthly, percent)
_OECD_RATE = {"JP": "IRSTCB01JPM156N", "CN": "IRSTCB01CNM156N"}


def policy_month(b):
    """BIS monthly central-bank policy rate (percent). Gaps filled from the OECD call/central-bank rate on FRED where
    that exists (Japan: BIS has no value in 2002-05 and 2014-15). Euro area: Germany (Bundesbank) before 1999."""
    s = bis_series("WS_CBPOL", f"M:{b}")
    if b == "XM":
        de = bis_series("WS_CBPOL", "M:DE")
        s = s.combine_first(de[de.index < pd.Period("1999-01", "M")])
    if b in _OECD_RATE:
        s = s.combine_first(fred(_OECD_RATE[b]))
    return s
