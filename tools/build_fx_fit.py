"""Build src/data/fx-fit.js: the FX reactor's 1-year fit (1 年尺度拟合，探索性) for AUS and JPN. No network.

Run:  <venv>/Scripts/python.exe -I tools/build_fx_fit.py [--explore]

Quarterly OLS per country, fitted on 1996Q1-2021Q4 (the first quarter with a year of history in the countries' data is 1996Q1);
2022Q1-2025Q4 is the hold-out (保留样本: never used in the fit, only scored).
  y     = 100 * ln(fx[t-4] / fx[t])               the 4-quarter change of the home currency vs the USD, + = home stronger
                                                   (fx = fxPerUsd, quarterly mean, src/data/countries/<iso>-quarterly.js)
  infl  = 100 * (cpiYoY home - cpiYoY US)          通胀差, pp (src/data/countries/*, src/data/us-quarterly.js)
  rate  = mean of the last 4 quarters of 100 * (policyRate home - policyRate US)    利差, pp
  tot   = 100 * ln(ToT[t] / ToT[t-4])              贸易条件, % (log)
            AUS: ABS terms of trade, SA index (data_src/world/abs, ANA_AGG TTR M5 TSEST 20)
            JPN: the WTI oil price (data_src/world/fred/MCOILWTICO.csv, quarterly mean) as a reverse proxy (energy importer)
  vix   = VIX (data_src/world/fred_vix/VIXCLS.csv, daily): quarterly mean or max; 4-quarter change, or level minus its
          1996-2021 mean. The variant with the lowest hold-out error is kept (per country).
  prod  (optional) = relative growth of real GDP per person vs the US (World Bank NY.GDP.PCAP.KD, annual, spread over
          quarters); kept only if it lowers the hold-out error.
Standard errors: Newey-West (Bartlett kernel, 4 lags, small-sample factor n/(n-k)) because the 4-quarter changes overlap.
The checker tools/check_fx_reactor.mjs recomputes all of this from the same files.
"""
import json
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I mode does not add the script dir

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data_src" / "world"
OUT = ROOT / "src" / "data" / "fx-fit.js"
FIT = ("1996Q1", "2021Q4")
HOLD = ("2022Q1", "2025Q4")
LAGS = 4
EXPLORE = "--explore" in sys.argv
sys.stdout.reconfigure(encoding="utf-8")


# ---------------------------------------------------------------- inputs
def js_obj(path, name):
    """Read dates + series arrays out of a generated quarterly data file (JSON arrays after each key)."""
    t = (ROOT / path).read_text(encoding="utf-8")
    dates = json.loads(re.search(r"dates:\s*(\[[^\]]*\])", t).group(1))
    out = {"dates": dates}
    for k in ["policyRate", "cpiYoY", "fxPerUsd"]:
        m = re.search(r"\n\s*" + k + r":\s*(\[[^\]]*\])", t)
        out[k] = pd.Series([np.nan if v is None else v for v in json.loads(m.group(1))], index=pd.PeriodIndex(dates, freq="Q"), dtype=float)
    return out


US = js_obj("src/data/us-quarterly.js", "US_Q")
HOME = {"AUS": js_obj("src/data/countries/aus-quarterly.js", "AUS_Q"), "JPN": js_obj("src/data/countries/jpn-quarterly.js", "JPN_Q")}
QI = pd.PeriodIndex(HOME["AUS"]["dates"], freq="Q")


def vix_q():
    d = pd.read_csv(RAW / "fred_vix" / "VIXCLS.csv")
    s = pd.to_numeric(d.iloc[:, 1], errors="coerce")
    s.index = pd.to_datetime(d.iloc[:, 0]).dt.to_period("Q")
    s = s.dropna()
    g = s.groupby(level=0)
    return g.mean(), g.max()


def abs_tot():
    d = pd.read_csv(RAW / "abs" / "ana_agg_ttr.csv")
    d = d[(d.MEASURE == "M5") & (d.DATA_ITEM == "TTR") & (d.TSEST == 20) & (d.FREQ == "Q")].dropna(subset=["OBS_VALUE"])
    return pd.Series(d.OBS_VALUE.values.astype(float), index=pd.PeriodIndex(d.TIME_PERIOD.str.replace("-", ""), freq="Q")).sort_index()


def rba_icp_sdr():
    lines = (RAW / "rba_i2" / "i2-data.csv").read_text(encoding="utf-8-sig").splitlines()
    ids = next(l for l in lines if l.startswith("Series ID")).split(",")
    col = ids.index("GRCPAISDR")
    rows = {}
    for l in lines:
        p = l.split(",")
        if re.fullmatch(r"\d\d/\d\d/\d{4}", p[0]) and len(p) > col and p[col] not in ("", None):
            rows[pd.Period(f"{p[0][6:10]}-{p[0][3:5]}", freq="M")] = float(p[col])
    s = pd.Series(rows).sort_index()
    return s.groupby(s.index.asfreq("Q")).mean()


def oil_q():
    d = pd.read_csv(RAW / "fred" / "MCOILWTICO.csv")
    s = pd.to_numeric(d.iloc[:, 1], errors="coerce")
    s.index = pd.to_datetime(d.iloc[:, 0]).dt.to_period("M")
    s = s.dropna()
    return s.groupby(s.index.asfreq("Q")).mean()


def gdppc():
    j = json.loads((RAW / "worldbank_gdppc" / "NY.GDP.PCAP.KD.json").read_text(encoding="utf-8"))
    out = {}
    for r in j[1]:
        if r["value"] is not None:
            out.setdefault(r["countryiso3code"], {})[int(r["date"])] = float(r["value"])
    return {k: pd.Series(v).sort_index() for k, v in out.items()}


def lag4(s):
    return s.shift(4)


VIXM, VIXX = vix_q()
TOT_ABS, ICP, OIL, GPC = abs_tot(), rba_icp_sdr(), oil_q(), gdppc()


def prod_q(iso):
    """relative growth of real GDP per person (home - US), pp, spread over quarters: quarter q of year Y = q/4 * d[Y] + (1 - q/4) * d[Y-1]."""
    d = (np.log(GPC[iso]).diff() - np.log(GPC["USA"]).diff()) * 100
    v = [((p.quarter / 4) * d.get(p.year, np.nan) + (1 - p.quarter / 4) * d.get(p.year - 1, np.nan)) for p in QI]
    return pd.Series(v, index=QI)


def regressors(iso):
    H = HOME[iso]
    fx = H["fxPerUsd"].reindex(QI)
    X = pd.DataFrame(index=QI)
    X["y"] = 100 * np.log(lag4(fx) / fx)
    X["infl"] = 100 * (H["cpiYoY"].reindex(QI) - US["cpiYoY"].reindex(QI))
    gap = 100 * (H["policyRate"].reindex(QI) - US["policyRate"].reindex(QI))
    X["rate"] = gap.rolling(4, min_periods=4).mean()
    if iso == "AUS":
        tot = TOT_ABS
        X["tot"] = (100 * np.log(tot / tot.shift(4))).reindex(QI)
        X["tot_icp"] = (100 * np.log(ICP / ICP.shift(4))).reindex(QI)
        X["tot_lvl"] = tot.reindex(QI)
    else:
        X["tot"] = (100 * np.log(OIL / OIL.shift(4))).reindex(QI)
        X["tot_lvl"] = OIL.reindex(QI)
    X["vixAvg"] = VIXM.reindex(QI)
    X["vixMax"] = VIXX.reindex(QI)
    X["vixAvgChg"] = (VIXM - VIXM.shift(4)).reindex(QI)
    X["vixMaxChg"] = (VIXX - VIXX.shift(4)).reindex(QI)
    X["prod"] = prod_q(iso)
    return X


# ---------------------------------------------------------------- OLS + Newey-West (written out, so the JS checker can follow it line by line)
def ols(y, X, lags=LAGS):
    n, k = X.shape
    XtXi = np.linalg.inv(X.T @ X)
    b = XtXi @ X.T @ y
    u = y - X @ b
    S = (X * u[:, None]).T @ (X * u[:, None])
    for l in range(1, lags + 1):
        w = 1 - l / (lags + 1)
        G = (X[l:] * u[l:, None]).T @ (X[:-l] * u[:-l, None])
        S += w * (G + G.T)
    V = XtXi @ S @ XtXi * n / (n - k)
    se = np.sqrt(np.diag(V))
    r2 = 1 - (u @ u) / ((y - y.mean()) @ (y - y.mean()))
    return b, se, b / se, r2, u


def fit(iso, X, cols, vix):
    names = ["const"] + cols
    D = X.copy()
    fitm = (D.index >= pd.Period(FIT[0], "Q")) & (D.index <= pd.Period(FIT[1], "Q"))
    hold = (D.index >= pd.Period(HOLD[0], "Q")) & (D.index <= pd.Period(HOLD[1], "Q"))
    vmean = None
    if vix and not vix.endswith("Chg"):
        vmean = D.loc[fitm, vix].mean()
    D["vix"] = D[vix] - vmean if vmean is not None else D[vix]
    F = D[fitm].dropna(subset=["y"] + cols)
    y = F["y"].values
    Xm = np.column_stack([np.ones(len(F))] + [F[c].values for c in cols])
    b, se, t, r2, u = ols(y, Xm)
    Hd = D[hold].dropna(subset=["y"] + cols)
    yh = np.column_stack([np.ones(len(Hd))] + [Hd[c].values for c in cols]) @ b
    rmse_h = float(np.sqrt(np.mean((Hd["y"].values - yh) ** 2)))
    rmse_in = float(np.sqrt(np.mean(u ** 2)))
    return {"names": names, "b": b, "se": se, "t": t, "r2": float(r2), "n": len(F), "nh": len(Hd), "rmseIn": rmse_in, "rmseHold": rmse_h,
            "vix": vix, "vixMean": vmean, "D": D, "first": str(F.index[0]), "last": str(F.index[-1]), "sdY": float(F["y"].std(ddof=0)),
            "sdYh": float(Hd["y"].std(ddof=0)), "naiveHold": float(np.sqrt(np.mean((Hd["y"].values - 0) ** 2)))}


def show(iso, r, tag=""):
    co = "  ".join(f"{n} {b:+.3f} (t {t:+.2f})" for n, b, t in zip(r["names"], r["b"], r["t"]))
    print(f"{iso} {tag:28s} n={r['n']} R2={r['r2']:.3f} rmseIn={r['rmseIn']:.2f} hold(n={r['nh']}) rmse={r['rmseHold']:.2f} | {co}")


KEY_DATES = {"AUS": ["2008Q4", "2011Q2", "2015Q2"], "JPN": ["2008Q4", "2013Q2"]}
VIXV = ["vixAvgChg", "vixAvg", "vixMaxChg", "vixMax"]
RES = {}
for iso in ["AUS", "JPN"]:
    X = regressors(iso)
    base = ["infl", "rate", "tot", "vix"]
    cands = {v: fit(iso, X, base, v) for v in VIXV}
    if EXPLORE:
        print(f"\n== {iso}: sd(y) fit {cands['vixAvg']['sdY']:.2f}, hold {cands['vixAvg']['sdYh']:.2f}; hold rmse of 'no change' {cands['vixAvg']['naiveHold']:.2f}")
        show(iso, fit(iso, X, ["infl", "rate"], "vixAvg"), "infl+rate only")
        show(iso, fit(iso, X, ["infl", "rate", "tot"], "vixAvg"), "infl+rate+tot")
        for v, r in cands.items():
            show(iso, r, v)
        if iso == "AUS":
            X2 = X.copy(); X2["tot"] = X2["tot_icp"]
            for v in VIXV:
                show(iso, fit(iso, X2, base, v), "ICP(SDR) tot, " + v)
    best = min(VIXV, key=lambda v: cands[v]["rmseHold"])
    r = cands[best]
    rp = fit(iso, X, base + ["prod"], best)
    if EXPLORE:
        show(iso, rp, "+prod, " + best)
    r["prodTried"] = {"rmseHold": rp["rmseHold"], "b": float(rp["b"][-1]), "t": float(rp["t"][-1]), "r2": rp["r2"]}
    r["cands"] = {v: {"rmseHold": c["rmseHold"], "r2": c["r2"], "b": float(c["b"][-1]), "t": float(c["t"][-1])} for v, c in cands.items()}
    if iso == "AUS":
        X2 = X.copy(); X2["tot"] = X2["tot_icp"]
        ri = fit(iso, X2, base, best)
        r["icpTried"] = {"rmseHold": ri["rmseHold"], "r2": ri["r2"], "b": float(ri["b"][3]), "t": float(ri["t"][3])}
    RES[iso] = r
    if EXPLORE:
        print(f"-> {iso} keeps {best}; decomposition (log points):")
        D = r["D"]
        for d in KEY_DATES[iso] + ["2025Q4"]:
            row = D.loc[pd.Period(d, "Q")]
            parts = {n: b * (1 if n == "const" else row[n]) for n, b in zip(r["names"], r["b"])}
            m = sum(parts.values())
            print(f"   {d}: y {row['y']:+.1f} | " + " ".join(f"{n} {v:+.1f}" for n, v in parts.items()) + f" | model {m:+.1f} resid {row['y'] - m:+.1f}"
                  + f" | x: infl {row['infl']:+.2f} rate {row['rate']:+.2f} tot {row['tot']:+.1f} vix {row['vix']:+.1f}")

if EXPLORE:
    sys.exit(0)


# ---------------------------------------------------------------- write src/data/fx-fit.js
def sig(v, n=6):
    if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))) or pd.isna(v):
        return None
    return 0 if abs(v) < 1e-9 else float(f"{float(v):.{n}g}")


def arr(s, n=6):
    return json.dumps([sig(v, n) for v in s.reindex(QI).values], separators=(",", ":"))


VIXDESC = {"vixAvgChg": "VIX 季度平均，比一年前的变化（点）", "vixAvg": "VIX 季度平均，减去 1996–2021 的平均（点）",
           "vixMaxChg": "VIX 季度最高，比一年前的变化（点）", "vixMax": "VIX 季度最高，减去 1996–2021 的平均（点）"}
RISK = {"AUS": "澳元是风险货币：VIX 升 → 澳元弱", "JPN": "日元是避险货币：VIX 升 → 日元强"}
TOTSRC = {"AUS": "ABS 贸易条件指数（国民账户 5206.0，季调）", "JPN": "WTI 油价（能源进口国：油价涨 → 贸易条件变坏）"}
L = ["// AUTO-GENERATED by tools/build_fx_fit.py - do not edit by hand.",
     "// The FX reactor's 1-year fit (1 年尺度拟合，探索性), read by src/ui/fx-reactor.js; checked by tools/check_fx_reactor.mjs.",
     "// Per country: OLS on 1996Q1-2021Q4 of y = 100*ln(fx[t-4]/fx[t]) (+ = home stronger) on the inflation gap, the 4-quarter mean",
     "// policy-rate gap, the 4-quarter log change of the terms of trade and VIX. 2022Q1+ = hold-out (保留样本, not in the fit).",
     "// The reactor shows force k as coef[k] * (x[k][t] - mean[k]) (a push relative to its 1996-2021 normal); the constant (= mean y)",
     "// is left in 说不清. x arrays are aligned with dates (= the countries' *-quarterly.js dates).",
     "export const FX_FIT = {",
     "  label: '1 年尺度拟合，探索性',",
     f"  fit: {json.dumps(list(FIT))}, hold: {json.dumps(list(HOLD))}, lags: {LAGS},",
     "  dates: " + json.dumps([str(p) for p in QI], separators=(",", ":")) + ",",
     "  vixAvg: " + arr(VIXM, 5) + ",",
     "  vixMax: " + arr(VIXX, 5) + ",",
     "  countries: {"]
for iso, r in RES.items():
    D = r["D"]
    fitm = (D.index >= pd.Period(FIT[0], "Q")) & (D.index <= pd.Period(FIT[1], "Q"))
    F = D[fitm].dropna(subset=["y", "infl", "rate", "tot", "vix"])
    names = r["names"]
    co = {n: sig(b) for n, b in zip(names, r["b"])}
    tt = {n: sig(t, 4) for n, t in zip(names, r["t"])}
    se = {n: sig(s, 4) for n, s in zip(names, r["se"])}
    mean = {k: sig(F[k].mean()) for k in ["y", "infl", "rate", "tot", "vix"]}
    stats = {"n": r["n"], "nHold": r["nh"], "first": r["first"], "last": r["last"], "r2": sig(r["r2"], 4), "rmseIn": sig(r["rmseIn"], 4),
             "rmseHold": sig(r["rmseHold"], 4), "rmseHoldZero": sig(r["naiveHold"], 4)}
    tried = {"vix": {k: {kk: sig(vv, 4) for kk, vv in v.items()} for k, v in r["cands"].items()},
             "prod": {k: sig(v, 4) for k, v in r["prodTried"].items()}}
    if "icpTried" in r:
        tried["totIcp"] = {k: sig(v, 4) for k, v in r["icpTried"].items()}
    L.append(f"    {iso}: {{")
    L.append(f"      vix: {json.dumps(r['vix'])}, vixDesc: {json.dumps(VIXDESC[r['vix']], ensure_ascii=False)}, risk: {json.dumps(RISK[iso], ensure_ascii=False)},")
    L.append(f"      tot: {json.dumps('abs' if iso == 'AUS' else 'oil')}, totDesc: {json.dumps(TOTSRC[iso], ensure_ascii=False)},")
    L.append(f"      vixLevelMean: {json.dumps(sig(r['vixMean']))},   // level forms only: x.vix = VIX - this (1996-2021 mean); change forms: null")
    L.append("      coef: " + json.dumps(co) + ",")
    L.append("      t: " + json.dumps(tt) + ",")
    L.append("      se: " + json.dumps(se) + ",")
    L.append("      mean: " + json.dumps(mean) + ",")
    L.append("      stats: " + json.dumps(stats) + ",")
    L.append("      tried: " + json.dumps(tried) + ",")
    L.append("      x: {")
    for k in ["y", "infl", "rate", "tot", "vix"]:
        L.append(f"        {k}: " + arr(D[k]) + ",")
    L.append("        totLevel: " + arr(D["tot_lvl"]) + ",")
    L.append("      },")
    L.append("    },")
L.append("  },")
meta = {
    "sources": {
        "fx, cpi, policy rate": "src/data/countries/{aus,jpn}-quarterly.js and src/data/us-quarterly.js (fxPerUsd, cpiYoY, policyRate), the reactor's own inputs",
        "vix": "FRED VIXCLS (CBOE VIX close, daily, 1990+), data_src/world/fred_vix/VIXCLS.csv: quarterly mean (vixAvg) and quarterly max (vixMax)",
        "tot AUS": "ABS Data API ANA_AGG (Australian National Accounts 5206.0 key aggregates) TTR terms of trade, index, seasonally adjusted (TSEST 20), data_src/world/abs/ana_agg_ttr.csv",
        "tot JPN": "FRED MCOILWTICO (WTI $/bbl, monthly), quarterly mean, data_src/world/fred/MCOILWTICO.csv: a reverse proxy of Japan's terms of trade",
        "tried, not kept": "RBA I2 Index of Commodity Prices, SDR terms (GRCPAISDR, monthly 1982+), data_src/world/rba_i2/i2-data.csv, as AUS terms of trade; World Bank NY.GDP.PCAP.KD (data_src/world/worldbank_gdppc) relative growth vs the US as productivity",
    },
    "notes": [
        "Exploratory (1 年尺度拟合，探索性). The 5-year JST coefficients (src/data/fx-data.js FX_SPEC.rule) stay for the long-run anchor, the 汇率 lesson and its calculator.",
        f"Fit {FIT[0]}-{FIT[1]} (n = 104 quarters); hold-out {HOLD[0]}-{HOLD[1]} (16 quarters), scored with the fitted coefficients only.",
        "t-stats: Newey-West HAC, Bartlett kernel, 4 lags (the 4-quarter changes overlap), times sqrt(n/(n-k)) small-sample factor.",
        "VIX form chosen per country by the lowest hold-out error among {quarterly mean, quarterly max} x {4-quarter change, level minus 1996-2021 mean} (tried.vix).",
        "Productivity (tried.prod) and the RBA commodity index (tried.totIcp) were tried and not kept: each made the hold-out error worse.",
        "Both fits score worse in the hold-out than guessing 'no change' (rmseHoldZero): 1-year FX moves are mostly noise; treat the split as a rough reading.",
    ],
}
L.append("  meta: " + json.dumps(meta, ensure_ascii=False, indent=2).replace("\n", "\n  ") + ",")
L.append("};")
OUT.write_text("\n".join(L) + "\n", encoding="utf-8")
print("wrote", OUT, OUT.stat().st_size, "bytes")

# report: the fit tables and the decompositions in the reactor's terms (% change, + = home stronger)
for iso, r in RES.items():
    print(f"\n== {iso}  (VIX form: {r['vix']}; R2 {r['r2']:.3f}; rmse in {r['rmseIn']:.2f}; hold-out rmse {r['rmseHold']:.2f} vs 'no change' {r['naiveHold']:.2f})")
    for n, b, s, t in zip(r["names"], r["b"], r["se"], r["t"]):
        print(f"   {n:6s} {b:+8.3f}  se {s:6.3f}  t {t:+6.2f}")
    D = r["D"]
    F = D[(D.index >= pd.Period(FIT[0], "Q")) & (D.index <= pd.Period(FIT[1], "Q"))]
    mu = {k: F[k].mean() for k in ["infl", "rate", "tot", "vix"]}
    bb = dict(zip(r["names"], r["b"]))
    for d in KEY_DATES[iso] + ["2025Q4"]:
        row = D.loc[pd.Period(d, "Q")]
        c = {k: bb[k] * (row[k] - mu[k]) for k in mu}
        m = sum(c.values())
        sc = (math.exp(m / 100) - 1) * 100 / m if abs(m) > 1e-12 else 1
        act = (math.exp(row["y"] / 100) - 1) * 100
        cp = {k: v * sc for k, v in c.items()}
        print(f"   {d}: actual {act:+.1f}% | 利差 {cp['rate']:+.1f} 信心 {cp['vix']:+.1f} -> 资本管 {cp['rate'] + cp['vix']:+.1f} | 通胀差 {cp['infl']:+.1f} 贸易条件 {cp['tot']:+.1f}"
              f" -> 商品价格管 {cp['infl'] + cp['tot']:+.1f} | 公式 {m * sc:+.1f} | 说不清 {act - m * sc:+.1f}")
