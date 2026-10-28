"""Build src/data/us-quarterly.js (CONTRACT section 1) from the read-only dalio_432 data.

Run:  <venv>/Scripts/python.exe -I tools/build_us_data.py
"""
import json
import zipfile
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
D432 = ROOT.parent / "dalio_432"
DATA = D432 / "data"
OUT = ROOT / "src" / "data" / "us-quarterly.js"

dates = [f"{y}Q{q}" for y in range(1995, 2026) for q in range(1, 5)]
assert len(dates) == 124
qidx = pd.PeriodIndex(dates, freq="Q")

m = pd.read_csv(DATA / "macro_monthly.csv", index_col=0, parse_dates=True)
m.index = m.index.to_period("M")


def q_mean(s):
    """Mean of the months in each quarter (monthly Period index in)."""
    return s.groupby(s.index.asfreq("Q")).mean().reindex(qidx)


def q_end(s):
    """Value of the last month of each quarter."""
    return pd.Series(s.reindex(qidx.asfreq("M", "end")).values, index=qidx)


def unlag_m(s, k=1):
    """Monthly macro was shifted forward k months in macro_monthly; shift back."""
    return s.shift(-k)


def q_series_unlagged(col, idx):
    """Quarterly value for quarter Q sits at label month end(Q)+3 months; undo."""
    return pd.Series(m[col].reindex(idx.asfreq("M", "end") + 3).values, index=idx)


S = {}
# --- rates (not lagged in macro_monthly: month-end obs)
S["policyRate"] = q_mean(m["FEDFUNDS"]) / 100
S["gov10y"] = q_mean(m["DGS10"]) / 100
mort = pd.read_csv(ROOT / "data_src" / "MORTGAGE30US.csv", parse_dates=["observation_date"])
mort = mort.dropna().set_index("observation_date")["MORTGAGE30US"]
mort.index = mort.index.to_period("Q")
S["mortgageRate"] = (mort.groupby(level=0).mean() / 100).reindex(qidx)
# --- prices / inflation (CPI & UNRATE were lagged +1m -> undo)
cpi = unlag_m(m["CPIAUCSL"])
core = unlag_m(m["CPILFESL"])
un = unlag_m(m["UNRATE"])
S["cpiYoY"] = q_mean(cpi / cpi.shift(12) - 1)
S["coreCpiYoY"] = q_mean(core / core.shift(12) - 1)
S["unemployment"] = q_mean(un) / 100
# --- GDP (quarterly, lagged +1 quarter -> undo)
S["gdpNominal"] = q_series_unlagged("GDP", qidx)
ext = pd.period_range("1993Q1", "2025Q4", freq="Q")
rg = q_series_unlagged("GDPC1", ext)
S["gdpRealGrowthYoY"] = (rg / rg.shift(4) - 1).reindex(qidx)


# --- asset prices (end of quarter, rebased)
def rebase(s):
    return s / s.iloc[0] * 100


cs = pd.read_csv(ROOT / "data_src" / "CSUSHPINSA.csv", parse_dates=["observation_date"]).set_index("observation_date")["CSUSHPINSA"]
cs.index = cs.index.to_period("M")
S["houseIndex"] = rebase(q_end(cs))
S["equityIndex"] = rebase(q_end(m["SP_P"]))
S["cape"] = q_end(m["CAPE"])
gold = pd.read_csv(D432 / "cache" / "gold_github_monthly_2026-10-26.csv")
gold.index = pd.PeriodIndex(gold["Date"], freq="M")
S["goldIndex"] = rebase(q_end(gold["Price"].astype(float)))
S["oilPrice"] = q_mean(m["DCOILWTICO"])
# --- debt
dsr = pd.read_csv(DATA / "v2_bis_dsr_panel.csv")
dsr = dsr[(dsr.country == "US") & (dsr.sector == "H")]
dsr.index = pd.PeriodIndex(pd.to_datetime(dsr["date"]), freq="Q")
S["hhDsr"] = (dsr["dsr"] / 100).reindex(qidx)
bc = pd.read_csv(DATA / "v2_bis_credit_panel.csv")
bc = bc[bc.country == "US"]
bc.index = pd.PeriodIndex(pd.to_datetime(bc["date"]), freq="Q")
S["privateCreditGdp"] = (bc["credit_gdp"] / 100).reindex(qidx)
tc = pd.read_csv(zipfile.ZipFile(D432 / "cache" / "bis_total_credit_2026-10-26.zip").open("WS_TC_csv_col.csv"), low_memory=False)
row = tc[tc["Series"] == "Q:US:H:A:M:770:A"].iloc[0]
hh = pd.Series({pd.Period(c.replace("-", ""), freq="Q"): float(row[c])
                for c in tc.columns if c[:2] in ("19", "20") and c[4:6] == "-Q" and pd.notna(row[c])})
S["hhDebtGdp"] = (hh / 100).reindex(qidx)
S["govDebtGdp"] = q_series_unlagged("GFDEGDQ188S", qidx) / 100
S["bankCredit"] = q_mean(m["TOTBKCR"])

order = ["policyRate", "mortgageRate", "gov10y", "cpiYoY", "coreCpiYoY", "unemployment", "gdpNominal",
         "gdpRealGrowthYoY", "houseIndex", "equityIndex", "cape", "goldIndex", "oilPrice", "hhDsr",
         "privateCreditGdp", "hhDebtGdp", "govDebtGdp", "bankCredit"]
RATIOS = {"policyRate", "mortgageRate", "gov10y", "cpiYoY", "coreCpiYoY", "unemployment",
          "gdpRealGrowthYoY", "hhDsr", "privateCreditGdp", "hhDebtGdp", "govDebtGdp"}


def sig(x, n):
    if x is None or pd.isna(x):
        return None
    return 0 if x == 0 else float(f"{x:.{n}g}")


series = {k: [sig(v, 4 if k in RATIOS else 5) for v in S[k].values] for k in order}

sources = {
    "policyRate": "macro_monthly.csv FEDFUNDS (effective fed funds), quarterly mean",
    "mortgageRate": "data_src/MORTGAGE30US.csv (Freddie Mac PMMS 30y fixed, weekly), quarterly mean",
    "gov10y": "macro_monthly.csv DGS10, quarterly mean of month-end obs",
    "cpiYoY": "macro_monthly.csv CPIAUCSL (lag undone), monthly yoy, quarterly mean",
    "coreCpiYoY": "macro_monthly.csv CPILFESL (lag undone), monthly yoy, quarterly mean",
    "unemployment": "macro_monthly.csv UNRATE (lag undone), quarterly mean",
    "gdpNominal": "macro_monthly.csv GDP (FRED, $bn SAAR; quarterly lag undone)",
    "gdpRealGrowthYoY": "macro_monthly.csv GDPC1 (lag undone), 4-quarter growth",
    "houseIndex": "data_src/CSUSHPINSA.csv (S&P/Case-Shiller US National, NSA), last month of quarter, 1995Q1=100",
    "equityIndex": "macro_monthly.csv SP_P (Shiller S&P 500 price, monthly average of daily closes), last month of quarter, 1995Q1=100",
    "cape": "macro_monthly.csv CAPE (Shiller), last month of quarter",
    "goldIndex": "dalio_432/cache/gold_github_monthly_2026-10-26.csv (datasets/gold-prices monthly price), last month of quarter, 1995Q1=100",
    "oilPrice": "macro_monthly.csv DCOILWTICO (WTI $/bbl), quarterly mean",
    "hhDsr": "v2_bis_dsr_panel.csv US sector H (BIS household debt service ratio), /100",
    "privateCreditGdp": "v2_bis_credit_panel.csv US credit_gdp (BIS private non-fin credit, % GDP), /100",
    "hhDebtGdp": "dalio_432/cache/bis_total_credit_2026-10-26.zip series Q:US:H:A:M:770:A (BIS household credit, % GDP, quarterly), /100",
    "govDebtGdp": "macro_monthly.csv GFDEGDQ188S (FRED federal debt % GDP; quarterly lag undone), /100",
    "bankCredit": "macro_monthly.csv TOTBKCR (FRED all commercial banks credit, $bn), quarterly mean",
}
notes = [
    "Publication lags in macro_monthly.csv were undone so each value sits in its own period: CPIAUCSL, CPILFESL, UNRATE shifted back 1 month; GDP, GDPC1, GFDEGDQ188S shifted back 1 quarter. FEDFUNDS, DGS10, TOTBKCR, DCOILWTICO, CAPE, SP_P were not lagged in the source and are used as is.",
    "Quarterly aggregation: mean of months for rates, yields, CPI yoy, unemployment, oil, bank credit; last month of the quarter for houseIndex, equityIndex, cape, goldIndex; GDP as given (annualised $bn).",
    "hhDsr uses BIS US household DSR (starts 1999Q1; null before). FRED TDSP only starts 2005 so it is not used.",
    "hhDebtGdp is the quarterly BIS household credit/GDP series (not interpolated, not JST).",
    "goldIndex is built from a monthly-average gold price (datasets/gold-prices) sampled at the last month of each quarter: smoother than a true quarter-end close.",
    "equityIndex is a price-only index from Shiller's monthly-average S&P price, so it is smoother than a true quarter-end close.",
    "Quarters from 2022Q1 are the held-out sample of the parent research project (reservedFrom).",
]
meta = {"sources": {k: sources[k] for k in order}, "notes": notes}

lines = ["// AUTO-GENERATED by tools/build_us_data.py - do not edit by hand.", "export const US_Q = {"]
lines.append("  dates: " + json.dumps(dates, separators=(",", ":")) + ",")
lines.append("  reservedFrom: '2022Q1',")
lines.append("  series: {")
for k in order:
    lines.append(f"    {k}: " + json.dumps(series[k], separators=(",", ":")) + ",")
lines.append("  },")
lines.append("  meta: " + json.dumps(meta, ensure_ascii=False, indent=2).replace("\n", "\n  ") + "\n};")
OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
print("wrote", OUT, OUT.stat().st_size, "bytes")
