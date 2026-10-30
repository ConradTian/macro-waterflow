"""Build src/data/countries/<iso>-quarterly.js (same shape as US_Q + fxPerUsd, exportsGdp, importsGdp,
foreignGovHoldShare) and src/data/countries/index.js from the raw files in data_src/world/. No network.

Run:  <venv>/Scripts/python.exe -I tools/build_country_data.py
"""
import io
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I mode does not add the script dir

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import world_common as wc  # noqa: E402
from world_common import DATES, QIDX, RAW, ROOT  # noqa: E402

OUTDIR = ROOT / "src" / "data" / "countries"
OUTDIR.mkdir(parents=True, exist_ok=True)

ORDER = ["policyRate", "mortgageRate", "gov10y", "cpiYoY", "coreCpiYoY", "unemployment", "gdpNominal",
         "gdpRealGrowthYoY", "houseIndex", "equityIndex", "cape", "goldIndex", "oilPrice", "hhDsr",
         "privateCreditGdp", "hhDebtGdp", "govDebtGdp", "bankCredit"]
EXTRA = ["fxPerUsd", "exportsGdp", "importsGdp", "foreignGovHoldShare"]
OPTIONAL = ["govDeficitGdp", "govInterestGdp", "bankNplRatio"]  # optional (only written for a country whose build() returns them: GBR)
RATIOS = {"policyRate", "mortgageRate", "gov10y", "cpiYoY", "coreCpiYoY", "unemployment", "gdpRealGrowthYoY", "hhDsr",
          "privateCreditGdp", "hhDebtGdp", "govDebtGdp", "exportsGdp", "importsGdp", "foreignGovHoldShare",
          "govDeficitGdp", "govInterestGdp", "bankNplRatio"}

NAN = pd.Series(np.nan, index=QIDX)


# ---------------------------------------------------------------- national loaders
def rba_mortgage():
    """RBA F5: Lending rates; Housing loans; Banks; Variable; Standard; Owner-occupier (FILRHLBVS), monthly %."""
    d = pd.read_excel(RAW / "rba" / "f05hist.xlsx", sheet_name="Data", header=None)
    ids = d.index[d[0] == "Series ID"][0]
    col = [i for i in d.columns if d.iloc[ids, i] == "FILRHLBVS"][0]
    body = d.iloc[ids + 1:]
    body = body[body[0].apply(lambda v: hasattr(v, "year"))]
    s = pd.Series(pd.to_numeric(body[col], errors="coerce").values, index=pd.to_datetime(body[0].values).to_period("M"))
    return s.dropna()


def boe_mortgage():
    d = pd.read_csv(RAW / "boe" / "IUMTLMV.csv")
    s = pd.Series(pd.to_numeric(d["IUMTLMV"], errors="coerce").values,
                  index=pd.to_datetime(d["DATE"], format="%d %b %Y").dt.to_period("M"))
    return s.dropna()


def ecb_mortgage():
    d = pd.read_csv(RAW / "ecb" / "mir_housing_new.csv")
    return pd.Series(d.OBS_VALUE.values, index=pd.PeriodIndex(d.TIME_PERIOD, freq="M")).dropna()


def ons_unemp():
    """ONS MGSX: monthly rows like "2026 JUL","4.7" (annual and quarterly sections skipped)."""
    out = {}
    mon = {m: i for i, m in enumerate(["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"], 1)}
    for line in (RAW / "ons" / "mgsx.csv").read_text(encoding="utf-8").splitlines():
        parts = [p.strip('"') for p in line.split('","')]
        if len(parts) != 2:
            continue
        k, v = parts[0].strip('"'), parts[1].strip('"')
        bits = k.split()
        if len(bits) == 2 and bits[0].isdigit() and bits[1] in mon:
            try:
                out[pd.Period(f"{bits[0]}-{mon[bits[1]]:02d}", freq="M")] = float(v)
            except ValueError:
                pass
    return pd.Series(out).sort_index()


def eurostat_unemp():
    d = pd.read_csv(RAW / "eurostat" / "une_rt_m_EA21.csv")
    return pd.Series(d.OBS_VALUE.values, index=pd.PeriodIndex(d.TIME_PERIOD, freq="M")).dropna()


def ons_q(path):
    """ONS generator csv (PUSF): the quarterly block, rows like "1995 Q1","-10335" -> Series on a quarterly PeriodIndex."""
    out = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        parts = [p.strip('"') for p in line.split('","')]
        if len(parts) != 2:
            continue
        bits = parts[0].strip('"').split()
        if len(bits) == 2 and bits[0].isdigit() and bits[1] in ("Q1", "Q2", "Q3", "Q4"):
            try:
                out[pd.Period(f"{bits[0]}{bits[1]}", freq="Q")] = float(parts[1].strip('"'))
            except ValueError:
                pass
    return pd.Series(out).sort_index()


def sa_ratio(x_m, gdp_ann_bn):
    """NSA quarterly flow (GBP m) over the quarter's GDP (annualised bn / 4), seasonally adjusted with ADDITIVE quarter-of-year
    factors (share of GDP): deviation from a centred 2x4 moving average, MEDIAN per quarter of the year over 1995Q1-2021Q4 only
    (the median keeps the 2020Q2 lockdown spike out of the Q2 factor; 2022+ never enters), factors re-centred to sum to zero.
    Ratio-to-GDP form, so the result reads like the US SAAR deficit / GDP (no trailing-sum lag)."""
    r = (x_m.reindex(QIDX) / (gdp_ann_bn * 1000 / 4)).astype(float)
    trend = (0.5 * r.shift(2) + r.shift(1) + r + r.shift(-1) + 0.5 * r.shift(-2)) / 4
    d = (r - trend)[(r.index >= pd.Period("1995Q1", "Q")) & (r.index <= pd.Period("2021Q4", "Q"))]
    f = d.groupby(d.index.quarter).median()
    f = f - f.mean()
    return r - pd.Series(r.index.quarter, index=r.index).map(f).values, f


GBR_RAW = ROOT / "data_src" / "gbr"


def gbr_fiscal(gdp):
    """GBR round 2: the real fiscal path series (same meaning as the US NIPA pair: positive = deficit, both / GDP)."""
    if not (GBR_RAW / "ons_J5II.csv").exists() or not (GBR_RAW / "ons_NMFX.csv").exists():
        return None
    dfc, fd = sa_ratio(-ons_q(GBR_RAW / "ons_J5II.csv"), gdp)
    itr, fi = sa_ratio(ons_q(GBR_RAW / "ons_NMFX.csv"), gdp)
    print("  GBR fiscal seasonal factors (pp of GDP, Q1..Q4): deficit", [round(100 * float(v), 2) for v in fd.values],
          "interest", [round(100 * float(v), 2) for v in fi.values])
    return dfc, itr


def gbr_npl():
    """World Bank FB.AST.NPER.ZS (bank nonperforming loans / total gross loans, %, annual; IMF FSI) for GBR, held flat within each
    year, /100. Display only (the B2 card's 加分项); the engine and the dials never read it. None when the file is missing."""
    p = GBR_RAW / "wb_FB.AST.NPER.ZS_GBR.json"
    if not p.exists():
        return None
    j = json.loads(p.read_text(encoding="utf-8"))
    out = {int(r["date"]): float(r["value"]) for r in (j[1] or []) if r.get("value") is not None and r.get("countryiso3code") == "GBR"}
    return wc.annual_to_q(pd.Series(out).sort_index().reindex(wc.YEARS)) / 100


def imf_cpi_jpn_q():
    d = pd.read_csv(RAW / "imf" / "cpi_jpn_yoy.csv")
    s = pd.Series(d.OBS_VALUE.values, index=pd.PeriodIndex(d.TIME_PERIOD.str.replace("-M", "-"), freq="M")).dropna()
    return s.groupby(s.index.asfreq("Q")).mean().reindex(QIDX)


# ---------------------------------------------------------------- per-country definitions
CFG = {
    "AUS": dict(b="AU", oecd="AUS", ccy="AUD", wb="AUS", yld="IRLTLT01AUM156N", eq="SPASTT01AUM661N",
                imf="AUS", name="Australia"),
    "GBR": dict(b="GB", oecd="GBR", ccy="GBP", wb="GBR", yld="IRLTLT01GBM156N", eq="SPASTT01GBM661N",
                imf="GBR", name="United Kingdom"),
    "JPN": dict(b="JP", oecd="JPN", ccy="JPY", wb="JPN", yld="IRLTLT01JPM156N", eq="SPASTT01JPM661N",
                imf="JPN", name="Japan"),
    "EA": dict(b="XM", oecd="EA20", ccy="EUR", wb="EMU", yld="IRLTLT01EZM156N", eq="SPASTT01EZM661N",
               imf="G163", name="Euro area"),
    "CHN": dict(b="CN", oecd="CHN", ccy="CNY", wb="CHN", yld=None, eq="SPASTT01CNM661N",
                imf="CHN", name="China"),
}

VAR = {"AUS": "AUS_Q", "GBR": "GBR_Q", "JPN": "JPN_Q", "EA": "EA_Q", "CHN": "CHN_Q"}


def first_valid_rebase(s):
    """Rebase to 100 at the first valid quarter. Returns (series, first_label)."""
    v = s.first_valid_index()
    if v is None:
        return s, None
    return s / s.loc[v] * 100, str(v)


def build(iso):
    c = CFG[iso]
    b = c["b"]
    S, src, nt = {}, {}, []

    # --- rates
    S["policyRate"] = wc.q_mean(wc.policy_month(b)) / 100
    pol_src = {
        "AUS": "BIS WS_CBPOL M:AU (RBA cash rate target, monthly), quarterly mean",
        "GBR": "BIS WS_CBPOL M:GB (Bank of England Bank Rate, monthly), quarterly mean",
        "JPN": "BIS WS_CBPOL M:JP (BoJ policy rate; gaps 2002-05 and 2014-15 filled from OECD call money rate via FRED IRSTCB01JPM156N), quarterly mean",
        "EA": "BIS WS_CBPOL M:XM (ECB main refinancing rate) from 1999; Germany (Bundesbank, M:DE) before 1999; quarterly mean",
        "CHN": "BIS WS_CBPOL M:CN (PBoC benchmark lending rate, from 1996; gaps filled from OECD via FRED IRSTCB01CNM156N), quarterly mean",
    }
    src["policyRate"] = pol_src[iso]

    if iso == "AUS":
        S["mortgageRate"] = wc.q_mean(rba_mortgage()) / 100
        src["mortgageRate"] = "RBA table F5 (f05hist.xlsx) FILRHLBVS: banks, variable, standard, owner-occupier housing loan rate, quarterly mean"
    elif iso == "GBR":
        S["mortgageRate"] = wc.q_mean(boe_mortgage()) / 100
        src["mortgageRate"] = "BoE IADB IUMTLMV: quoted household mortgage SVR (monthly average), quarterly mean"
    elif iso == "EA":
        S["mortgageRate"] = wc.q_mean(ecb_mortgage()) / 100
        src["mortgageRate"] = "ECB MIR.M.U2.B.A2C.AM.R.A.2250.EUR.N: new-business housing loan rate, euro area (from 2003), quarterly mean"
        nt.append("mortgageRate for EA is the new-business housing loan rate (all maturities) from 2003; it is not a standard-variable rate and has no history before 2003.")
    else:
        S["mortgageRate"] = NAN
        src["mortgageRate"] = "missing: no open, stable, bulk series found" + (
            " (BoJ's average contract rate would be the match)" if iso == "JPN" else " (China has benchmark / LPR rates only)")

    if c["yld"]:
        S["gov10y"] = wc.q_mean(wc.fred(c["yld"])) / 100
        src["gov10y"] = f"FRED {c['yld']} (OECD long-term government bond yield, ~10y), quarterly mean"
    else:
        S["gov10y"] = NAN
        src["gov10y"] = "missing: no open bulk source for China 10y government yield"

    # --- prices / labour
    cpi = wc.oecd_cpi_q(c["oecd"], "_T")
    cpi_src = f"OECD DF_PRICES_ALL {c['oecd']} CPI all items, yoy (quarterly where published, else mean of 3 months)"
    if iso == "JPN":
        cpi = cpi.combine_first(imf_cpi_jpn_q())
        cpi_src += "; after 2021Q2 (OECD feed ends) IMF CPI Japan all items yoy, monthly, quarterly mean"
    if iso == "EA":
        cpi_src = "OECD DF_PRICES_ALL EA20 HICP all items, yoy (monthly mean to quarterly; quarterly where published)"
    S["cpiYoY"] = cpi / 100
    src["cpiYoY"] = cpi_src
    core = wc.oecd_cpi_q(c["oecd"], "_TXCP01_NRG")
    if core is None:
        S["coreCpiYoY"] = NAN
        src["coreCpiYoY"] = "missing: OECD publishes no core series for China"
    else:
        S["coreCpiYoY"] = core / 100
        src["coreCpiYoY"] = f"OECD DF_PRICES_ALL {c['oecd']} CPI all items excl. food & energy, yoy"
        if iso == "JPN":
            nt.append("coreCpiYoY for Japan ends 2021Q2 (OECD feed stopped); null afterwards. The IMF feed has no core series.")
        if iso == "EA":
            nt.append("coreCpiYoY for EA starts 1997Q1 (OECD).")

    if iso == "AUS":
        un = wc.fred("LRUNTTTTAUM156S")
        u_src = "FRED LRUNTTTTAUM156S (OECD harmonised unemployment rate, SA), quarterly mean"
    elif iso == "JPN":
        un = wc.fred("LRUNTTTTJPM156S")
        u_src = "FRED LRUNTTTTJPM156S (OECD harmonised unemployment rate, SA), quarterly mean"
    elif iso == "GBR":
        un = ons_unemp()
        u_src = "ONS MGSX (unemployment rate 16+, SA, monthly), quarterly mean"
    elif iso == "EA":
        e = eurostat_unemp()
        un = e.combine_first(wc.fred("LRHUTTTTEZM156S")[lambda x: x.index < pd.Period("2000-01", "M")])
        u_src = "Eurostat une_rt_m EA21 SA from 2000 (current euro-area membership); FRED LRHUTTTTEZM156S (OECD, EA19) for 1995-1999"
    if iso != "CHN":
        S["unemployment"] = wc.q_mean(un) / 100
        src["unemployment"] = u_src
    else:
        S["unemployment"] = wc.annual_to_q(wc.wb("SL.UEM.TOTL.ZS", "CHN")) / 100
        src["unemployment"] = "World Bank SL.UEM.TOTL.ZS (ILO modelled estimate, annual) held flat within each year"
        nt.append("China unemployment is the ILO modelled annual estimate, held constant within a year, not the NBS surveyed urban rate; it is nearly flat (about 4.5-5%).")

    # --- GDP
    if iso == "CHN":
        v = wc.qnea("CHN", "V", "NSA")
        gdp = v.rolling(4).sum().reindex(QIDX) / 1e9
        src["gdpNominal"] = "IMF QNEA CHN B1GQ current prices, NSA: trailing 4-quarter sum (annual-rate level), CNY bn"
        nt.append("China gdpNominal is a trailing 4-quarter sum of NSA quarterly GDP (no seasonal adjustment published), not a seasonally adjusted annualised rate; it lags the US-style SAAR by about 1.5 quarters.")
    else:
        v = wc.qnea(c["imf"], "V", "SA")
        gdp = v.reindex(QIDX) * 4 / 1e9
        src["gdpNominal"] = f"IMF QNEA {c['imf']} B1GQ current prices, SA, x4 (annualised), {c['ccy']} bn"
    S["gdpNominal"] = gdp
    if iso == "GBR":
        fis = gbr_fiscal(gdp)
        if fis is not None:
            S["govDeficitGdp"], S["govInterestGdp"] = fis
            src["govDeficitGdp"] = ("ONS PUSF J5II (public sector net borrowing excl. public sector banks, GBP m, NSA), sign flipped "
                                    "(positive = deficit), / quarterly GDP (gdpNominal / 4); seasonally adjusted with additive quarter-of-year "
                                    "factors (median deviation from a centred 2x4 moving average, 1995-2021 only)")
            src["govInterestGdp"] = ("ONS PUSF NMFX (central government current expenditure: net interest payable, GBP m, NSA), "
                                     "/ quarterly GDP; same seasonal adjustment")
            nt.append("govDeficitGdp / govInterestGdp (GBR) feed the engine's real fiscal path (cp.fiscalRealPath), like the US NIPA pair. "
                      "UK borrowing covers the whole public sector (central + local government + public corporations, excl. public sector "
                      "banks: the 2008-09 bank nationalisations are outside); interest is central government only (net interest payable, "
                      "incl. the index-linked uplift, so it jumps with RPI in 2022-23). The US pair is federal only.")
        npl = gbr_npl()
        if npl is not None:
            S["bankNplRatio"] = npl
            src["bankNplRatio"] = ("World Bank WDI FB.AST.NPER.ZS (bank nonperforming loans to total gross loans, %, annual, from the IMF "
                                   "Financial Soundness Indicators), held flat within each year, /100; gaps before 2008 except 2005")
            nt.append("bankNplRatio (GBR) is display only: the B2 card's 'how hurt are the banks' 加分项. The engine and the cycle dials never read it.")
    if iso == "CHN":
        q = wc.qnea("CHN", "Q", "NSA")
        g = (q / q.shift(4) - 1).reindex(QIDX)
        ann = wc.weo("CHN", "NGDP_RPCH") / 100
        step = wc.annual_to_q(ann)
        S["gdpRealGrowthYoY"] = g.combine_first(step)
        src["gdpRealGrowthYoY"] = "IMF QNEA CHN volume NSA, 4-quarter growth (from 2012Q1); before that the IMF WEO annual real growth NGDP_RPCH held flat within each year"
        nt.append("China gdpRealGrowthYoY before 2012 is the annual WEO growth rate (step), not a quarterly figure.")
    else:
        q = wc.qnea(c["imf"], "Q", "SA")
        S["gdpRealGrowthYoY"] = (q / q.shift(4) - 1).reindex(QIDX)
        src["gdpRealGrowthYoY"] = f"IMF QNEA {c['imf']} B1GQ volume SA, 4-quarter growth"

    # --- asset prices
    hp = wc.bis_series("WS_SPP", f"Q:{b}:N:628")
    S["houseIndex"], hfirst = first_valid_rebase(hp.reindex(QIDX))
    src["houseIndex"] = f"BIS WS_SPP Q:{b}:N:628 (residential property prices, nominal), 1995Q1=100"
    if hfirst and hfirst != "1995Q1":
        src["houseIndex"] = src["houseIndex"].replace("1995Q1=100", f"{hfirst}=100 (series starts there)")
        nt.append(f"houseIndex starts {hfirst}; rebased to 100 at that quarter instead of 1995Q1.")
    eq = wc.q_end(wc.fred(c["eq"]))
    S["equityIndex"], efirst = first_valid_rebase(eq)
    src["equityIndex"] = f"FRED {c['eq']} (OECD share price index, monthly average), last month of quarter, 1995Q1=100"
    if efirst and efirst != "1995Q1":
        src["equityIndex"] = src["equityIndex"].replace("1995Q1=100", f"{efirst}=100 (series starts there)")
        nt.append(f"equityIndex starts {efirst}; rebased to 100 at that quarter instead of 1995Q1.")
    S["cape"] = NAN
    src["cape"] = "missing: no CAPE for this market (no Shiller-type series); left null"
    fx_m = wc.fx_month(c["ccy"])
    gold_local = wc.gold_usd_month() * fx_m
    S["goldIndex"], _ = first_valid_rebase(wc.q_end(gold_local.dropna()))
    src["goldIndex"] = f"gold in {c['ccy']}: datasets/gold-prices monthly USD price x {c['ccy']} per USD (FRED monthly average), last month of quarter, 1995Q1=100"
    S["oilPrice"] = wc.q_mean(wc.fred("MCOILWTICO"))
    src["oilPrice"] = "FRED MCOILWTICO (WTI $/bbl), quarterly mean; USD-denominated for every country (a world price)"

    # --- debt
    dsr = wc.bis_series("WS_DSR", f"Q:{b}:H")
    if dsr is not None:
        S["hhDsr"] = dsr.reindex(QIDX) / 100
        src["hhDsr"] = f"BIS WS_DSR Q:{b}:H (household debt service ratio), /100"
    else:
        S["hhDsr"] = NAN
        src["hhDsr"] = "missing: BIS publishes no household DSR for " + ("the euro area aggregate" if iso == "EA" else "China (only the whole private sector, Q:CN:P)")
    S["privateCreditGdp"] = wc.bis_series("WS_TC", f"Q:{b}:P:A:M:770:A").reindex(QIDX) / 100
    src["privateCreditGdp"] = f"BIS WS_TC Q:{b}:P:A:M:770:A (credit to private non-financial sector, % GDP), /100"
    S["hhDebtGdp"] = wc.bis_series("WS_TC", f"Q:{b}:H:A:M:770:A").reindex(QIDX) / 100
    src["hhDebtGdp"] = f"BIS WS_TC Q:{b}:H:A:M:770:A (credit to households and NPISH, % GDP), /100"
    g = wc.bis_series("WS_TC", f"Q:{b}:G:A:N:770:A")
    gk = "N"
    if g is None:
        g = wc.bis_series("WS_TC", f"Q:{b}:G:A:M:770:A")
        gk = "M"
    S["govDebtGdp"] = g.reindex(QIDX) / 100
    src["govDebtGdp"] = f"BIS WS_TC Q:{b}:G:A:{gk}:770:A (general government debt, {'nominal' if gk == 'N' else 'market'} value, % GDP), /100"
    bc = wc.bis_series("WS_TC", f"Q:{b}:P:B:M:XDC:A")
    S["bankCredit"] = bc.reindex(QIDX) if bc is not None else NAN
    src["bankCredit"] = f"BIS WS_TC Q:{b}:P:B:M:XDC:A (credit to private non-financial sector from domestic banks, {c['ccy']} bn, end of quarter)"
    nt.append("bankCredit is BIS bank credit to the private non-financial sector (loans and securities), not the US 'all commercial banks credit' (TOTBKCR); same idea, different definition and end-of-quarter level.")
    nt.append("govDebtGdp is the BIS general-government debt ratio (this country: general government; the US series uses federal debt only).")

    # --- extras
    S["fxPerUsd"] = wc.q_mean(fx_m)
    src["fxPerUsd"] = f"FRED monthly average {c['ccy']} per USD (EXUSAL, EXUSUK, EXJPUS, EXUSEU, EXCHUS" + ("; before 1999 EXGEUS / 1.95583" if iso == "EA" else "") + "), quarterly mean"
    S["exportsGdp"] = wc.annual_to_q(wc.wb("NE.EXP.GNFS.ZS", c["wb"])) / 100
    S["importsGdp"] = wc.annual_to_q(wc.wb("NE.IMP.GNFS.ZS", c["wb"])) / 100
    wbnote = "World Bank WDI NE.@@.GNFS.ZS (goods and services, % of GDP), annual value held flat within each year; latest year 2024"
    src["exportsGdp"] = wbnote.replace("@@", "EXP")
    src["importsGdp"] = wbnote.replace("@@", "IMP")
    if iso == "EA":
        nt.append("EA exportsGdp/importsGdp use the World Bank 'EMU' aggregate, which includes trade between euro-area members (about 49% of GDP); the extra-area share is roughly half.")
    fs = FOREIGN_SERIES.get(iso)
    S["foreignGovHoldShare"] = fs() if callable(fs) else NAN
    if S["foreignGovHoldShare"] is None:
        S["foreignGovHoldShare"] = NAN
    src["foreignGovHoldShare"] = FOREIGN_NOTE.get(iso, "missing: no open bulk series found")
    if iso == "AUS" and S["foreignGovHoldShare"].notna().any():
        nt.append("foreignGovHoldShare (AUS) is the AOFM non-resident share of Commonwealth securities (AGS, market value), not of all general-government debt (state bonds excluded). "
                  "The official series starts 2003Q2; 1995Q1-2003Q1 are held flat at the 2003Q2 value (34.7%) so the engine's foreign-holdings effect, measured from the first quarter, starts neutral.")
    return S, src, nt


def aofm_foreign_share():
    """AOFM 'Non-resident Holdings of AGS' (foreign_holdings.xlsx, sheet AGS): Proportion Held by Non-Residents (column D,
    not repo-adjusted, so the definition is the same before and after 2011), quarter-end. Held flat before the first observation."""
    p = RAW / "aofm" / "foreign_holdings.xlsx"
    if not p.exists():
        return None
    d = pd.read_excel(p, sheet_name="AGS", header=None)
    body = d[d[0].apply(lambda v: hasattr(v, "year"))]
    s = pd.Series(pd.to_numeric(body[3], errors="coerce").values, index=pd.to_datetime(body[0].values).to_period("Q")).dropna()
    s = s[~s.index.duplicated(keep="last")].reindex(QIDX)
    first = s.first_valid_index()
    if first is not None:
        s[s.index < first] = s[first]
    return s


FOREIGN_NOTE = {"AUS": "AOFM Non-resident Holdings of AGS (foreign_holdings.xlsx, sheet AGS, 'Proportion Held by Non-Residents', market value, quarter-end); "
                       "official series from 2003Q2, held flat at the 2003Q2 value before that"}
FOREIGN_SERIES = {"AUS": aofm_foreign_share}  # iso -> loader returning a quarterly Series on QIDX (None when the raw file is missing)


def write_country(iso, S, src, nt):
    series = {}
    KEYS = ORDER + EXTRA + [k for k in OPTIONAL if k in S]
    for k in KEYS:
        s = S[k].reindex(QIDX)
        n = 4 if k in RATIOS else 5
        series[k] = [wc.sig(v, n) for v in s.values]
    CN = {
        "AUS": "Australia: priority country. Variable-rate mortgages dominate, so policyRate passes through to mortgageRate quickly.",
        "GBR": "United Kingdom.", "JPN": "Japan: near-zero rates for most of the sample.",
        "EA": "Euro area (BIS XM / IMF G163 / OECD EA20 aggregates). Aggregates change membership over time (EA11 to EA20); sources adjust for breaks where they can.",
        "CHN": "China: expected gaps (no 10y yield, no mortgage rate, no household DSR, short house-price and equity history).",
    }[iso]
    notes = [CN,
             "Same shape and units as US_Q: rates and ratios are fractions (0.05 = 5%); gdpNominal is local-currency bn, annualised quarterly level; houseIndex, equityIndex, goldIndex rebased so the first quarter = 100 (1995Q1 unless noted).",
             "Quarters from 2022Q1 are the held-out sample of the parent research project (reservedFrom).",
             "Quarterly aggregation as in the US file: mean of months for rates, yields, CPI yoy, unemployment, oil, FX; last month of the quarter for equityIndex and goldIndex; equityIndex is a monthly average (OECD), so smoother than a true quarter-end close."] + nt
    lines = [f"// AUTO-GENERATED by tools/build_country_data.py - do not edit by hand.", f"export const {VAR[iso]} = {{"]
    lines.append("  dates: " + json.dumps(DATES, separators=(",", ":")) + ",")
    lines.append("  reservedFrom: '2022Q1',")
    lines.append("  series: {")
    for k in KEYS:
        lines.append(f"    {k}: " + json.dumps(series[k], separators=(",", ":")) + ",")
    lines.append("  },")
    meta = {"sources": {k: src[k] for k in KEYS}, "notes": notes}
    lines.append("  meta: " + json.dumps(meta, ensure_ascii=False, indent=2).replace("\n", "\n  ") + "\n};")
    p = OUTDIR / f"{iso.lower()}-quarterly.js"
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return p, series


def write_index():
    txt = """// AUTO-GENERATED by tools/build_country_data.py - do not edit by hand.
// COUNTRY_DATA: lazy loaders for each country's quarterly data (same shape as US_Q).
// COUNTRY_READY: a country view exists and passes its checks. Flip a flag to true only when the view is built.
export const COUNTRY_DATA = {
  USA: () => import('../us-quarterly.js').then(m => m.US_Q),
  AUS: () => import('./aus-quarterly.js').then(m => m.AUS_Q),
  GBR: () => import('./gbr-quarterly.js').then(m => m.GBR_Q),
  JPN: () => import('./jpn-quarterly.js').then(m => m.JPN_Q),
  EA: () => import('./ea-quarterly.js').then(m => m.EA_Q),
  CHN: () => import('./chn-quarterly.js').then(m => m.CHN_Q),
};
export const COUNTRY_READY = { USA: true, AUS: true, GBR: true, JPN: false, EA: false, CHN: false };
"""
    (OUTDIR / "index.js").write_text(txt, encoding="utf-8")


if __name__ == "__main__":
    cov = {}
    for iso in ["AUS", "GBR", "JPN", "EA", "CHN"]:
        S, src, nt = build(iso)
        p, series = write_country(iso, S, src, nt)
        cov[iso] = series
        print("wrote", p.name, p.stat().st_size, "bytes")
    write_index()
    print("wrote index.js")
    for iso, series in cov.items():
        row = []
        for k in series:
            v = series[k]
            nn = [i for i, x in enumerate(v) if x is not None]
            row.append(f"{k}:{DATES[nn[0]] + '-' + DATES[nn[-1]] if nn else '--'}")
        print(iso, " ".join(row))
