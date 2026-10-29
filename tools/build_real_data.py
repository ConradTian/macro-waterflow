"""Build src/data/real/usa-real.js and src/data/real/aus-real.js (the REAL-data layer, display only) from data_src/real/.

Run:  %USERPROFILE%/.venvs/dalio432/Scripts/python.exe -I tools/build_real_data.py
No network (tools/fetch_real_data.py downloads). Never touches us-quarterly.js / aus-quarterly.js: the engine reads those and its
calibration must not change. These files are for the 「真实」 view only (gauges, lamps, cycle dials, asset levels): never fit on them.

Quarter rules: a quarter built from monthly data needs >= 2 months; with exactly 2 months it is kept and flagged 「部分」 (meta.partial).
Series past their own last quarter are null (meta.lastReal says where each one ends). A few levels are carried past the last BIS
quarter by the growth of a more timely official series (meta.extended); every such step is listed.
"""
import io
import json
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data_src" / "real"
OUTDIR = ROOT / "src" / "data" / "real"
D432 = next((p / "dalio_432" for p in ROOT.parents if (p / "dalio_432").is_dir()), ROOT.parent / "dalio_432")
START = pd.Period("1995Q1", "Q")
TODAY = pd.Timestamp.today().to_period("Q")


# ================================================================ generic readers
def fred(sid):
    d = pd.read_csv(RAW / "fred" / f"{sid}.csv")
    s = pd.to_numeric(d.iloc[:, 1], errors="coerce")
    s.index = pd.to_datetime(d.iloc[:, 0])
    return s.dropna()


def fred_q(sid):
    """FRED quarterly series -> Series on a quarterly PeriodIndex."""
    s = fred(sid)
    s.index = s.index.to_period("Q")
    return s.groupby(level=0).mean()


def to_month(s, how="mean"):
    """daily / weekly (DatetimeIndex) -> monthly PeriodIndex (mean, or last obs of the month)."""
    g = s.groupby(s.index.to_period("M"))
    return g.mean() if how == "mean" else g.last()


def m2q(s, how="mean"):
    """monthly PeriodIndex series -> (quarterly series, set of partial quarters). Needs >= 2 months; 2 months = partial.
    how='end': value of the last month present (the quarter's 3rd month when complete)."""
    s = s.dropna().sort_index()
    q = s.index.asfreq("Q")
    g = s.groupby(q)
    n = g.size()
    v = g.mean() if how == "mean" else g.last()
    v = v[n >= 2]
    part = {str(p) for p in n[n == 2].index}
    return v, part


class Builder:
    def __init__(self, iso):
        self.iso, self.S, self.src, self.part, self.ext, self.notes = iso, {}, {}, {}, {}, []

    def put(self, k, s, src, part=None, ext=None):
        self.S[k] = s
        self.src[k] = src
        if part:
            self.part[k] = sorted(part)
        if ext:
            self.ext[k] = ext


def chain_extend(base, ind, label):
    """Carry `base` (quarterly) past its last value with the growth of `ind` (quarterly). Returns (series, ext-info or None)."""
    base = base.dropna()
    last = base.index.max()
    ind = ind.dropna()
    if last not in ind.index or ind.index.max() <= last:
        return base, None
    tail = ind[ind.index > last] / ind[last] * base[last]
    out = pd.concat([base, tail])
    return out, {"from": str(tail.index.min()), "to": str(tail.index.max()), "how": label}


def ext_ratio(r, lvl, e, gdp4):
    """Carry a BIS debt/GDP ratio past its last quarter: ratio_last x (level / level_last) / (gdp4 / gdp4_last), where gdp4 is the mean
    annualised GDP of the last 4 quarters (the BIS denominator). Stops where GDP stops. Returns (series, ext-info or None)."""
    if not e:
        return r, None
    last = r.index.max()
    t = lvl[lvl.index > last]
    t = (r[last] * (t / lvl[last]) / (gdp4.reindex(t.index) / gdp4[last])).dropna()
    if t.empty:
        return r, None
    return pd.concat([r, t]), {**e, "from": str(t.index.min()), "to": str(t.index.max())}


# ================================================================ BIS / ABS / RBA / OECD readers
_bis = {}


def bis(name, key):
    if name not in _bis:
        z = zipfile.ZipFile(RAW / "bis" / f"{name}_csv_col.zip")
        _bis[name] = pd.read_csv(z.open(z.namelist()[0]), low_memory=False)
    t = _bis[name]
    r = t[t["Series"] == key]
    if r.empty:
        return None
    row = r.iloc[0]
    out = {pd.Period(c.replace("-", ""), freq="Q"): float(row[c]) for c in t.columns
           if len(c) == 7 and c[4:6] == "-Q" and c[:4].isdigit() and pd.notna(row[c])}
    return pd.Series(out).sort_index()


_abs = {}


def abs_tab(name):
    if name not in _abs:
        _abs[name] = pd.read_csv(RAW / "abs" / name, low_memory=False)
    return _abs[name]


def abs_q(name, **flt):
    d = abs_tab(name)
    for k, v in flt.items():
        d = d[d[k].astype(str) == str(v)]
    s = pd.Series(pd.to_numeric(d.OBS_VALUE, errors="coerce").values, index=pd.PeriodIndex(d.TIME_PERIOD.str.replace("-", ""), freq="Q"))
    return s.sort_index().dropna()


def abs_m(name, **flt):
    d = abs_tab(name)
    for k, v in flt.items():
        d = d[d[k].astype(str) == str(v)]
    return pd.Series(pd.to_numeric(d.OBS_VALUE, errors="coerce").values, index=pd.PeriodIndex(d.TIME_PERIOD, freq="M")).sort_index().dropna()


def rba(name, sid):
    """RBA csv table: header rows, then 'Series ID' row, then dated rows. Returns Series (DatetimeIndex)."""
    lines = (RAW / "rba" / name).read_text(encoding="utf-8-sig").splitlines()
    hdr = next(i for i, l in enumerate(lines) if l.startswith("Series ID"))
    ids = lines[hdr].split(",")
    col = ids.index(sid)
    rows = []
    for l in lines[hdr + 1:]:
        p = l.split(",")
        if len(p) > col and p[col].strip() not in ("", "NA"):
            rows.append((p[0], p[col]))
    idx = pd.to_datetime([r[0] for r in rows], dayfirst=True, format="mixed")
    return pd.Series(pd.to_numeric([r[1] for r in rows], errors="coerce"), index=idx).dropna()


def oecd_cpi(exp):
    d = pd.read_csv(RAW / "oecd" / "cpi_aus_yoy.csv")
    d = d[d.EXPENDITURE == exp]
    q = d[d.FREQ == "Q"]
    qs = pd.Series(q.OBS_VALUE.values, index=pd.PeriodIndex(q.TIME_PERIOD.str.replace("-", ""), freq="Q"))
    m = d[d.FREQ == "M"]
    ms = pd.Series(m.OBS_VALUE.values, index=pd.PeriodIndex(m.TIME_PERIOD, freq="M"))
    mq, part = m2q(ms)
    out = qs.combine_first(mq)
    part = {p for p in part if pd.Period(p, "Q") not in qs.index}
    return out.sort_index(), part


def hp_trend_one_sided(y, lam=1600.0, burn=12):
    """One-sided HP trend: for each t, the HP trend of y[0..t] evaluated at t (real-time estimate, no future data)."""
    y = np.asarray(y, float)
    n = len(y)
    out = np.full(n, np.nan)
    for t in range(burn, n):
        m = t + 1
        D = np.zeros((m - 2, m))
        for i in range(m - 2):
            D[i, i:i + 3] = [1, -2, 1]
        A = np.eye(m) + lam * D.T @ D
        out[t] = np.linalg.solve(A, y[:m])[-1]
    return out


def rebase(s, at=START):
    return s / s.loc[at] * 100


def ann_to_q_interp(s_annual):
    """annual values (index = year) at mid-year -> quarterly PeriodIndex, linear between, flat outside."""
    pts = {pd.Period(f"{y}Q2", "Q"): v for y, v in s_annual.items()}
    rng = pd.period_range(min(pts), TODAY, freq="Q")
    s = pd.Series(np.nan, index=rng)
    for p, v in pts.items():
        s[p] = v
    return s.astype(float).interpolate(limit_direction="both")


# ================================================================ USA
def build_usa():
    b = Builder("USA")
    gdp = fred_q("GDP")
    s, p = m2q(fred("FEDFUNDS").pipe(lambda x: x.set_axis(x.index.to_period("M"))))
    b.put("policyRate", s / 100, "FRED FEDFUNDS (effective federal funds rate, monthly), quarterly mean", p)
    s, p = m2q(to_month(fred("MORTGAGE30US")))
    b.put("mortgageRate", s / 100, "FRED MORTGAGE30US (Freddie Mac PMMS 30y fixed, weekly -> monthly mean), quarterly mean", p)
    s, p = m2q(to_month(fred("DGS10"), "last"))
    b.put("gov10y", s / 100, "FRED DGS10 (10y Treasury, daily): month-end observation, quarterly mean (as in us-quarterly.js)", p)
    cpi = fred("CPIAUCSL").pipe(lambda x: x.set_axis(x.index.to_period("M")))
    core = fred("CPILFESL").pipe(lambda x: x.set_axis(x.index.to_period("M")))
    s, p = m2q(cpi / cpi.shift(12) - 1)
    b.put("cpiYoY", s, "FRED CPIAUCSL (CPI all items, SA): monthly yoy, quarterly mean", p)
    s, p = m2q(core / core.shift(12) - 1)
    b.put("coreCpiYoY", s, "FRED CPILFESL (CPI less food and energy, SA): monthly yoy, quarterly mean", p)
    s, p = m2q(cpi)
    b.put("cpiIndex", rebase(s), "FRED CPIAUCSL, quarterly mean, 1995Q1 = 100 (price level for real returns)", p)
    s, p = m2q(fred("UNRATE").pipe(lambda x: x.set_axis(x.index.to_period("M"))))
    b.put("unemployment", s / 100, "FRED UNRATE (SA), quarterly mean", p)
    b.put("gdpNominal", gdp, "FRED GDP (BEA nominal GDP, $bn SAAR)")
    rg = fred_q("GDPC1")
    b.put("gdpRealGrowthYoY", rg / rg.shift(4) - 1, "FRED GDPC1 (real GDP, chained 2017 $), 4-quarter growth")
    pot = fred_q("GDPPOT")
    b.put("gdpReal", rg, "FRED GDPC1 (real GDP, chained 2017 $bn SAAR)")
    b.put("gdpPotential", pot[pot.index <= rg.index.max()], "FRED GDPPOT (CBO real potential GDP, chained 2017 $bn); cut at the last real GDP quarter")
    b.put("outputGap", (rg / pot - 1).dropna(), "GDPC1 / GDPPOT - 1 (CBO output gap)")
    cs = fred("CSUSHPINSA").pipe(lambda x: x.set_axis(x.index.to_period("M")))
    s, p = m2q(cs, "end")
    b.put("houseIndex", rebase(s), "FRED CSUSHPINSA (S&P/Case-Shiller US national, NSA), last month of quarter, 1995Q1 = 100", p)
    mm = pd.read_csv(D432 / "data" / "macro_monthly.csv", index_col=0, parse_dates=True)
    mm.index = mm.index.to_period("M")
    s, p = m2q(mm["SP_P"].dropna(), "end")
    b.put("equityIndex", rebase(s), "dalio_432/data/macro_monthly.csv SP_P (Shiller S&P 500 price, monthly average of daily closes; read-only local copy), last month of quarter, 1995Q1 = 100", p)
    s, p = m2q(mm["CAPE"].dropna(), "end")
    b.put("cape", s, "dalio_432/data/macro_monthly.csv CAPE (Shiller P/E10), last month of quarter", p)
    g = pd.read_csv(RAW / "gold" / "gold_monthly.csv")
    g = pd.Series(g["Price"].astype(float).values, index=pd.PeriodIndex(g["Date"], freq="M"))
    s, p = m2q(g, "end")
    b.put("goldIndex", rebase(s), "datasets/gold-prices monthly USD gold price (GitHub, refreshed), last month of quarter, 1995Q1 = 100", p)
    s, p = m2q(fred("MCOILWTICO").pipe(lambda x: x.set_axis(x.index.to_period("M"))))
    b.put("oilPrice", s, "FRED MCOILWTICO (WTI $/bbl, monthly), quarterly mean", p)

    # --- debt (BIS; carried past the last BIS quarter by official US series, flagged)
    dsr = bis("WS_DSR", "Q:US:H") / 100
    dsr, e = chain_extend(dsr, fred_q("TDSP"), "x growth of FRED TDSP (Fed household debt service / disposable income)")
    b.put("hhDsr", dsr, "BIS WS_DSR Q:US:H (household debt service ratio, from 1999Q1), /100" + ("; extended by FRED TDSP growth" if e else ""), ext=e)
    gdp4 = gdp.rolling(4).mean()
    lvlP = bis("WS_TC", "Q:US:P:A:M:XDC:A")
    lvlH = bis("WS_TC", "Q:US:H:A:M:XDC:A")
    z1P = fred_q("CMDEBT") + fred_q("BCNSDODNS")
    lvlP, eP = chain_extend(lvlP, z1P, "level x growth of Fed Z.1 (CMDEBT + BCNSDODNS), / mean GDP of the last 4 quarters")
    lvlH, eH = chain_extend(lvlH, fred_q("CMDEBT"), "level x growth of Fed Z.1 CMDEBT, / mean GDP of the last 4 quarters")
    rP = bis("WS_TC", "Q:US:P:A:M:770:A") / 100
    rH = bis("WS_TC", "Q:US:H:A:M:770:A") / 100
    s, e = ext_ratio(rP, lvlP, eP, gdp4)
    b.put("privateCreditGdp", s, "BIS WS_TC Q:US:P:A:M:770:A (private non-financial credit, % GDP), /100", ext=e)
    s, e = ext_ratio(rH, lvlH, eH, gdp4)
    b.put("hhDebtGdp", s, "BIS WS_TC Q:US:H:A:M:770:A (household credit, % GDP), /100", ext=e)
    b.put("privateCredit", lvlP, "BIS WS_TC Q:US:P:A:M:XDC:A (private non-financial credit, $bn, end of quarter)", ext=eP)
    b.put("govDebtGdp", fred_q("GFDEGDQ188S") / 100, "FRED GFDEGDQ188S (federal debt % GDP), /100")
    s, p = m2q(to_month(fred("TOTBKCR")))
    b.put("bankCredit", s, "FRED TOTBKCR (all commercial banks bank credit, $bn, weekly -> monthly mean), quarterly mean", p)
    # --- border / fiscal
    b.put("fxPerUsd", pd.Series(1.0, index=gdp.index[gdp.index >= START]), "constant 1 (USD per USD)")
    b.put("exportsGdp", fred_q("EXPGS") / gdp, "FRED EXPGS / GDP")
    b.put("importsGdp", fred_q("IMPGS") / gdp, "FRED IMPGS / GDP")
    b.put("foreignGovHoldShare", (fred_q("FDHBFIN") / (fred_q("GFDEBTN") / 1000)).dropna(), "FRED FDHBFIN / (GFDEBTN / 1000)")
    b.put("govDeficitGdp", -fred_q("FGDEF") / gdp, "-FRED FGDEF (NIPA net federal saving) / GDP; positive = deficit")
    b.put("govInterestGdp", fred_q("A091RC1Q027SBEA") / gdp, "FRED A091RC1Q027SBEA (federal interest payments) / GDP")
    b.put("govInterestToTax", (fred_q("A091RC1Q027SBEA") / fred_q("FGRECPT")).dropna(), "FRED A091RC1Q027SBEA / FGRECPT (federal interest payments / federal current receipts, NIPA)")
    # --- money, banks, QE
    s, p = m2q(fred("M2SL").pipe(lambda x: x.set_axis(x.index.to_period("M"))))
    b.put("money", s, "FRED M2SL (M2, $bn SA, monthly), quarterly mean", p)
    b.put("m2Gdp", (s / gdp).dropna(), "M2SL quarterly mean / GDP (SAAR)", p)
    b.put("badLoans", fred_q("DRALACBS") / 100, "FRED DRALACBS (delinquency rate on all loans, all commercial banks, SA), /100")
    b.put("chargeOffs", fred_q("CORALACBS") / 100, "FRED CORALACBS (net charge-off rate on all loans, all commercial banks, SA annualised), /100")
    b.put("badLoansResidential", fred_q("DRSFRMACBS") / 100, "FRED DRSFRMACBS (delinquency rate, single-family residential mortgages, commercial banks), /100")
    w, p = m2q(to_month(fred("WALCL")))
    base = w[(w.index >= pd.Period("2007Q1", "Q")) & (w.index <= pd.Period("2007Q4", "Q"))].mean()
    qe = ((w - base).clip(lower=0) / 1000 / gdp).dropna()
    qe = qe.combine_first(pd.Series(0.0, index=pd.period_range(START, w.index.min() - 1, freq="Q")))
    b.put("qeGdp", qe, "PROXY: (FRED WALCL Fed total assets, quarterly mean - its 2007 mean, floored at 0) / GDP; 0 before 2002Q4 (no QE)", p)
    # --- the four outlets (BEA expenditure shares; C + I + G + NX = GDP exactly in NIPA)
    for k, sid, lab in [("outC", "PCEC", "personal consumption expenditures"), ("outI", "GPDI", "gross private domestic investment incl. inventories"),
                        ("outG", "GCE", "government consumption expenditures and gross investment"), ("outNX", "NETEXP", "net exports")]:
        b.put(k, (fred_q(sid) / gdp).dropna(), f"FRED {sid} ({lab}, $bn SAAR) / GDP (BEA NIPA table 1.1.5)")
    tt = fred("TTLHH")
    hh = ann_to_q_interp(pd.Series(tt.values / 1000, index=tt.index.year))
    b.put("households", hh[hh.index <= gdp.index.max()], "FRED TTLHH (total households, Census CPS/ASEC, annual, millions) at mid-year, linear between, held flat after the last year")
    b.notes += [
        "Every series is rebuilt from the downloads in data_src/real (one vintage, 2026-10-30), so 1995-2025 values can differ slightly from us-quarterly.js (data revisions); tools/check_real_data.mjs prints the overlap gap.",
        "equityIndex and cape come from the read-only dalio_432 copy of Shiller's monthly data (the same source as us-quarterly.js); Shiller's own file stops in 2023 on the Yale site.",
        "hhDsr, privateCreditGdp, hhDebtGdp: BIS ends one quarter or more before the US national sources; the extra quarters (meta.extended) carry the BIS value by the growth of the Fed series named there.",
        "qeGdp is a proxy for the cycle dials only (the model's QE stock starts at 0 in 1995): Fed balance sheet above its 2007 size, share of GDP.",
        "outC + outI + outG + outNX = 1 (BEA expenditure identity; the statistical discrepancy sits on the income side).",
    ]
    return b


# ================================================================ AUS
def build_aus():
    b = Builder("AUS")
    E = dict(TSEST=20, REGION="AUS", FREQ="Q")
    cp = lambda item, sector="SSS": abs_q("ana_exp.csv", MEASURE="C", DATA_ITEM=item, SECTOR=sector, **E)
    gdpq = cp("GPM")                                     # $m per quarter, current prices, SA
    gdp = gdpq * 4 / 1000                               # AUD bn, annualised
    s, p = m2q(rba("f1.1-data.csv", "FIRMMCRT").pipe(lambda x: x.set_axis(x.index.to_period("M"))))
    b.put("policyRate", s / 100, "RBA F1.1 FIRMMCRT (cash rate target, monthly average), quarterly mean", p)
    s, p = m2q(rba("f5-data.csv", "FILRHLBVS").pipe(lambda x: x.set_axis(x.index.to_period("M"))))
    b.put("mortgageRate", s / 100, "RBA F5 FILRHLBVS (banks' standard variable owner-occupier housing rate), quarterly mean", p)
    s, p = m2q(fred("IRLTLT01AUM156N").pipe(lambda x: x.set_axis(x.index.to_period("M"))))
    b.put("gov10y", s / 100, "FRED IRLTLT01AUM156N (OECD 10y government bond yield; RBA F2 data), quarterly mean", p)
    s, p = oecd_cpi("_T")
    b.put("cpiYoY", s / 100, "OECD DF_PRICES_ALL AUS CPI all items yoy (quarterly where published, else mean of months) - the aus-quarterly.js definition", p)
    s, p = oecd_cpi("_TXCP01_NRG")
    b.put("coreCpiYoY", s / 100, "OECD DF_PRICES_ALL AUS CPI excl. food & energy yoy", p)
    ci = abs_q("cpi_q.csv", MEASURE=1, INDEX=999901, TSEST=20, REGION=50, FREQ="Q")
    b.put("cpiIndex", rebase(ci), "ABS 6401.0 CPI_Q all groups SA index (weighted average of 8 capitals), 1995Q1 = 100")
    tm = abs_q("cpi_q.csv", MEASURE=3, INDEX=999902, TSEST=20, REGION=50, FREQ="Q")
    b.put("trimmedMeanYoY", tm / 100, "ABS 6401.0 CPI_Q trimmed mean, yoy (the RBA's core measure; display only)")
    s, p = m2q(abs_m("lf_unemp.csv", MEASURE="M13", SEX=3, AGE=1599, TSEST=20, REGION="AUS"))
    b.put("unemployment", s / 100, "ABS 6202.0 Labour Force M13 (unemployment rate, persons 15+, SA, monthly), quarterly mean", p)
    b.put("gdpNominal", gdp, "ABS 5206.0 ANA_EXP GDP current prices SA ($m per quarter) x 4 / 1000: AUD bn annualised")
    rv = abs_q("ana_exp.csv", MEASURE="VCH", DATA_ITEM="GPM", SECTOR="SSS", **E)
    b.put("gdpRealGrowthYoY", rv / rv.shift(4) - 1, "ABS 5206.0 GDP chain volume SA, 4-quarter growth")
    b.put("gdpReal", rv * 4 / 1000, "ABS 5206.0 GDP chain volume SA x 4 / 1000 (AUD bn, annualised)")
    tr = pd.Series(np.exp(hp_trend_one_sided(np.log(rv.values))), index=rv.index)
    b.put("gdpPotential", (tr * 4 / 1000).dropna(), "估算 ESTIMATE: one-sided HP trend (lambda 1600, data from 1959Q3) of log real GDP, x4/1000")
    b.put("outputGap", (rv / tr - 1).dropna(), "估算 ESTIMATE: real GDP / one-sided HP trend - 1 (no official AUS output gap; each quarter uses only data up to that quarter)")
    hp = bis("WS_SPP", "Q:AU:N:628")
    b.put("houseIndex", rebase(hp), "BIS WS_SPP Q:AU:N:628 (residential property prices, nominal), 1995Q1 = 100")
    s, p = m2q(fred("SPASTT01AUM661N").pipe(lambda x: x.set_axis(x.index.to_period("M"))), "end")
    b.put("equityIndex", rebase(s), "FRED SPASTT01AUM661N (OECD share price index, monthly average), last month of quarter, 1995Q1 = 100", p)
    b.put("cape", pd.Series(dtype=float), "missing: no CAPE for Australia")
    fxm = 1 / fred("EXUSAL").pipe(lambda x: x.set_axis(x.index.to_period("M")))
    g = pd.read_csv(RAW / "gold" / "gold_monthly.csv")
    g = pd.Series(g["Price"].astype(float).values, index=pd.PeriodIndex(g["Date"], freq="M"))
    s, p = m2q((g * fxm).dropna(), "end")
    b.put("goldIndex", rebase(s), "gold in AUD: datasets/gold-prices monthly USD price x AUD per USD (FRED EXUSAL), last month of quarter, 1995Q1 = 100", p)
    s, p = m2q(fred("MCOILWTICO").pipe(lambda x: x.set_axis(x.index.to_period("M"))))
    b.put("oilPrice", s, "FRED MCOILWTICO (WTI $/bbl), quarterly mean (USD, a world price)", p)
    b.put("hhDsr", bis("WS_DSR", "Q:AU:H") / 100, "BIS WS_DSR Q:AU:H (household debt service ratio, from 1999Q1), /100")
    gdp4 = gdp.rolling(4).mean()
    d2 = lambda sid: m2q(rba("d2-data.csv", sid).pipe(lambda x: x.set_axis(x.index.to_period("M"))), "end")
    hhD2 = d2("DLCACOHN")[0] + d2("DLCACIHN")[0] + d2("DLCACOPN")[0]
    totD2, d2part = d2("DLCACFN")
    lvlP, eP = chain_extend(bis("WS_TC", "Q:AU:P:A:M:XDC:A"), totD2, "level x growth of RBA D2 total credit excl. financial businesses (DLCACFN), / mean GDP of the last 4 quarters")
    lvlH, eH = chain_extend(bis("WS_TC", "Q:AU:H:A:M:XDC:A"), hhD2, "level x growth of RBA D2 housing + other personal credit, / mean GDP of the last 4 quarters")
    s, e = ext_ratio(bis("WS_TC", "Q:AU:P:A:M:770:A") / 100, lvlP, eP, gdp4)
    b.put("privateCreditGdp", s, "BIS WS_TC Q:AU:P:A:M:770:A (private non-financial credit, % GDP), /100", ext=e)
    s, e = ext_ratio(bis("WS_TC", "Q:AU:H:A:M:770:A") / 100, lvlH, eH, gdp4)
    b.put("hhDebtGdp", s, "BIS WS_TC Q:AU:H:A:M:770:A (household credit, % GDP), /100", ext=e)
    b.put("privateCredit", lvlP, "BIS WS_TC Q:AU:P:A:M:XDC:A (private non-financial credit, AUD bn)", {p for p in d2part if eP and p >= eP["from"]}, ext=eP)
    b.put("govDebtGdp", bis("WS_TC", "Q:AU:G:A:N:770:A") / 100, "BIS WS_TC Q:AU:G:A:N:770:A (general government debt, nominal value, % GDP), /100")
    b.put("bankCredit", bis("WS_TC", "Q:AU:P:B:M:XDC:A"), "BIS WS_TC Q:AU:P:B:M:XDC:A (bank credit to the private non-financial sector, AUD bn)")
    s, p = m2q(fxm)
    b.put("fxPerUsd", s, "FRED EXUSAL inverted (AUD per USD, monthly average), quarterly mean", p)
    b.put("exportsGdp", cp("XGS") / gdpq, "ABS 5206.0 exports of goods and services / GDP, current prices SA, QUARTERLY (aus-quarterly.js uses World Bank annual shares)")
    b.put("importsGdp", cp("MGS") / gdpq, "ABS 5206.0 imports of goods and services / GDP, current prices SA, quarterly")
    ap = RAW / "aofm" / "foreign_holdings.xlsx"
    if not ap.exists():                                # AOFM site timed out on 2026-10-30: use the 2026-10-29 copy (covers 2026Q2)
        ap = ROOT / "data_src" / "world" / "aofm" / "foreign_holdings.xlsx"
        b.notes.append("foreignGovHoldShare read from data_src/world/aofm/foreign_holdings.xlsx (downloaded 2026-10-29); the 2026-10-30 refresh timed out.")
    a = pd.read_excel(ap, sheet_name="AGS", header=None)
    body = a[a[0].apply(lambda v: hasattr(v, "year"))]
    fs = pd.Series(pd.to_numeric(body[3], errors="coerce").values, index=pd.to_datetime(body[0].values).to_period("Q")).dropna()
    b.put("foreignGovHoldShare", fs[~fs.index.duplicated(keep="last")], "AOFM non-resident holdings of AGS (sheet AGS, proportion held by non-residents, quarter-end), from 2003Q2 (no flat backfill here)")
    s, p = m2q(rba("d3-data.csv", "DMAM3S").pipe(lambda x: x.set_axis(x.index.to_period("M"))))
    b.put("money", s, "RBA D3 DMAM3S (M3, seasonally adjusted, AUD bn, monthly), quarterly mean", p)
    b.put("m3Gdp", (s / gdp).dropna(), "RBA D3 M3 SA quarterly mean / GDP (annualised)", p)
    b.put("badLoans", pd.Series(dtype=float), "missing: no free quarterly bank bad-loan series for Australia 1995-2026 (APRA ADI statistics start later and change definition)")
    w = rba("a1-data.csv", "ARBAAASTW") / 1000                      # AUD bn
    wq, p = m2q(to_month(w))
    base = wq[(wq.index >= pd.Period("2019Q1", "Q")) & (wq.index <= pd.Period("2019Q4", "Q"))].mean()
    qe = ((wq - base).clip(lower=0) / gdp).dropna()
    qe = qe.combine_first(pd.Series(0.0, index=pd.period_range(START, wq.index.min() - 1, freq="Q")))
    b.put("qeGdp", qe, "PROXY: (RBA A1 'Australian dollar investments' quarterly mean - its 2019 mean, floored at 0) / GDP; 0 before 2013Q3 (no bond buying before 2020)", p)
    # the four outlets (ABS 5206.0, current prices SA)
    C = cp("FCE", "PHS")
    I = cp("GFC", "PSS") + cp("IST")
    G = cp("FCE", "GGS") + cp("GFC", "GSS")
    NX = cp("XGS") - cp("MGS")
    sde = cp("SDE")
    b.put("outC", C / gdpq, "ABS 5206.0 household final consumption expenditure / GDP")
    b.put("outI", I / gdpq, "ABS 5206.0 (private gross fixed capital formation + changes in inventories) / GDP")
    b.put("outG", G / gdpq, "ABS 5206.0 (general government final consumption + public gross fixed capital formation, incl. public corporations) / GDP")
    b.put("outNX", NX / gdpq, "ABS 5206.0 (exports - imports) / GDP")
    b.put("outDiscrepancy", sde / gdpq, "ABS 5206.0 statistical discrepancy (E) / GDP: C + I + G + NX + discrepancy = 1")
    pop = abs_q("erp_q.csv", MEASURE=1, SEX=3, AGE="TOT", REGION="AUS", FREQ="Q") / 1e6
    pop = pop.reindex(pd.period_range(pop.index.min(), gdp.index.max(), freq="Q")).ffill()
    b.put("population", pop, "ABS 3101.0 ERP_Q estimated resident population (millions), held flat after the last published quarter")
    b.notes += [
        "Every series is rebuilt from the downloads in data_src/real (2026-10-30). Definitions follow aus-quarterly.js except: policyRate from RBA F1.1 directly (aus-quarterly.js: BIS copy of the same cash rate), unemployment from ABS Labour Force (was the OECD copy), GDP from ABS 5206.0 (was the IMF copy), exportsGdp / importsGdp quarterly from ABS (was World Bank annual), foreignGovHoldShare without the pre-2003 flat backfill.",
        "outputGap / gdpPotential are 估算 (estimates): a one-sided HP trend, so the latest quarters are revised as new data arrive; there is no official Australian output gap series.",
        "badLoans is missing for Australia; the real cycle dials use a neutral 1% instead (documented in real-snapshot.js).",
        "privateCreditGdp, hhDebtGdp: past the last BIS quarter they are carried by RBA D2 credit growth (meta.extended).",
    ]
    return b


# ================================================================ write
def sig(x, n):
    if x is None or pd.isna(x):
        return None
    return 0 if x == 0 else float(f"{x:.{n}g}")


LEVEL = {"gdpNominal", "houseIndex", "equityIndex", "cape", "goldIndex", "oilPrice", "bankCredit", "fxPerUsd", "cpiIndex", "money",
         "privateCredit", "gdpReal", "gdpPotential", "households", "population"}
CORE = ["policyRate", "cpiYoY", "unemployment", "gdpNominal"]


def write(b, var, fname, us_order):
    S = {k: v for k, v in b.S.items()}
    lasts = [s.dropna().index.max() for s in S.values() if len(s.dropna())]
    end = max(lasts)
    grid = pd.period_range(START, end, freq="Q")
    dates = [str(p) for p in grid]
    order = [k for k in us_order if k in S] + [k for k in S if k not in us_order]
    series, first, lastR = {}, {}, {}
    for k in order:
        s = S[k].reindex(grid)
        series[k] = [sig(v, 5 if k in LEVEL else 4) for v in s.values]
        nn = [i for i, x in enumerate(series[k]) if x is not None]
        first[k] = dates[nn[0]] if nn else None
        lastR[k] = dates[nn[-1]] if nn else None
    # lastRealDate: the last quarter where the policy rate, CPI, unemployment and GDP are all real (the badge 「真实数据 · 截至 …」)
    core_ok = [i for i in range(len(dates)) if all(series[k][i] is not None for k in CORE)]
    last_real = dates[core_ok[-1]]
    partial = {k: [d for d in v if d in dates and series[k][dates.index(d)] is not None] for k, v in b.part.items()}
    partial = {k: v for k, v in partial.items() if v}
    meta = {"country": b.iso, "builtFrom": "data_src/real (tools/fetch_real_data.py, downloaded 2026-10-30)", "lastRealDate": last_real,
            "coreForLastRealDate": CORE, "firstReal": first, "lastReal": lastR, "partial": partial, "extended": b.ext,
            "sources": {k: b.src[k] for k in order}, "notes": b.notes + [
                "Display only: quarters from 2022Q1 are the held-out sample of the parent research project (reservedFrom). Never fit on these files.",
                "部分 (partial): a quarter built from monthly data with only 2 of its 3 months (meta.partial lists them per series).",
                "Units as in us-quarterly.js: rates and ratios are fractions; gdpNominal is local-currency bn annualised; indices 1995Q1 = 100."]}
    lines = ["// AUTO-GENERATED by tools/build_real_data.py - do not edit by hand. REAL data, display only (never fit; the engine reads us-quarterly.js / aus-quarterly.js).",
             f"export const {var} = {{"]
    lines.append(f"  iso: '{b.iso}',")
    lines.append(f"  lastRealDate: '{last_real}',")
    lines.append("  dates: " + json.dumps(dates, separators=(",", ":")) + ",")
    lines.append("  reservedFrom: '2022Q1',")
    lines.append("  series: {")
    for k in order:
        lines.append(f"    {k}: " + json.dumps(series[k], separators=(",", ":")) + ",")
    lines.append("  },")
    lines.append("  meta: " + json.dumps(meta, ensure_ascii=False, indent=2).replace("\n", "\n  ") + "\n};")
    OUTDIR.mkdir(parents=True, exist_ok=True)
    p = OUTDIR / fname
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {p.name} {p.stat().st_size} bytes; grid {dates[0]}..{dates[-1]}; lastRealDate {last_real}")
    for k in order:
        print(f"  {k:22s} {str(first[k]):7s} -> {str(lastR[k]):7s}" + (f"  partial {partial[k]}" if k in partial else "") + (f"  extended {b.ext[k]['from']}..{b.ext[k]['to']}" if k in b.ext else ""))
    return series, dates


US_ORDER = ["policyRate", "mortgageRate", "gov10y", "cpiYoY", "coreCpiYoY", "unemployment", "gdpNominal", "gdpRealGrowthYoY", "houseIndex",
            "equityIndex", "cape", "goldIndex", "oilPrice", "hhDsr", "privateCreditGdp", "hhDebtGdp", "govDebtGdp", "bankCredit",
            "fxPerUsd", "exportsGdp", "importsGdp", "foreignGovHoldShare", "govDeficitGdp", "govInterestGdp"]

if __name__ == "__main__":
    us = build_usa()
    s, d = write(us, "USA_REAL", "usa-real.js", US_ORDER)
    # outlet identity check (US: exact in NIPA)
    i = len(d) - 1
    tot = [sum(s[k][j] for k in ("outC", "outI", "outG", "outNX")) for j in range(len(d)) if all(s[k][j] is not None for k in ("outC", "outI", "outG", "outNX"))]
    print(f"  USA outlets C+I+G+NX: min {min(tot):.4f} max {max(tot):.4f}")
    au = build_aus()
    s, d = write(au, "AUS_REAL", "aus-real.js", US_ORDER)
    tot = [sum(s[k][j] for k in ("outC", "outI", "outG", "outNX", "outDiscrepancy")) for j in range(len(d)) if all(s[k][j] is not None for k in ("outC", "outI", "outG", "outNX", "outDiscrepancy"))]
    dis = [abs(x) for x in s["outDiscrepancy"] if x is not None]
    print(f"  AUS outlets C+I+G+NX+disc: min {min(tot):.4f} max {max(tot):.4f}; |discrepancy| mean {np.mean(dis) * 100:.2f}% max {max(dis) * 100:.2f}% of GDP")
