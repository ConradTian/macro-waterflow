"""Build src/data/blind-cards.js for the 历史盲测 (blind backtest) mode. No network.

Run:   %USERPROFILE%/.venvs/dalio432/Scripts/python.exe -I tools/build_blind_data.py            (writes the JS, prints a summary)
       ... build_blind_data.py --views-truncated   (prints {card id: view} recomputed from raw data cut at each card's year;
                                                     tools/check_blind_data.mjs compares it with the published views)
       ... build_blind_data.py --calls ISO          (prints the annual call for every year of one country, for review)

Inputs (read-only): ../dalio_432/data/jst_panel.csv (JST R6), data_src/world/* (BIS, FRED, IMF WEO, World Bank),
data_src/blind/* (ChinaBond, CSI, OECD FINMARK, local copies). Rules and approximations: tools/BLIND-DATA.md.

Pipeline, per country:  raw annual series (one per source)  ->  derive(): one harmonised annual panel, built strictly
forward in time (later sources only extend earlier ones by their growth, never rescale the past)  ->  view(panel, year) and
the annual cycle machine use rows <= year only  ->  reveal returns use the years after.
The no-look-ahead proof: the published view uses the full raw data; --views-truncated rebuilds everything from raw data
truncated at the card's year; the checker asserts the two are identical.
"""
import json
import math
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import world_common as W  # noqa: E402  (BIS / FRED loaders over data_src/world)

ROOT = Path(__file__).resolve().parent.parent
BL = ROOT / "data_src" / "blind"
WD = ROOT / "data_src" / "world"
# BLIND_JST overrides the path (a git worktree has no ../dalio_432 next to it); still read-only
JST = Path(os.environ["BLIND_JST"]) if os.environ.get("BLIND_JST") else ROOT.parent / "dalio_432" / "data" / "jst_panel.csv"
OUT = ROOT / "src" / "data" / "blind-cards.js"
LAST = 2025                     # last complete year used anywhere
AS_OF = "2026-10-29"
ISOS = ["USA", "JPN", "AUS", "CHN"]
BIS2 = {"USA": "US", "JPN": "JP", "AUS": "AU", "CHN": "CN"}
FXC = {"USA": "USD", "JPN": "JPY", "AUS": "AUD", "CHN": "CNY"}

# ---------------------------------------------------------------- the deck (contract: tools/BLIND-CONTRACT.md)
BATCH1 = {"USA-1928", "USA-1982", "USA-2006", "JPN-1989", "JPN-2000", "JPN-2012", "AUS-1989", "AUS-2015", "CHN-2008", "CHN-2015"}
DECK = [
    ("USA", 1928, "危", "1929 年股灾，接着大萧条：股价三年跌约八成，失业率升到 25%。"),
    ("USA", 1932, "转", "1932 年 7 月股市见底；1933 年罗斯福上台、整顿银行、美元对黄金贬值，股市大涨。"),
    ("USA", 1946, "转", "战后放开物价管制，1946–47 年通胀冲到两位数，现金和国债被通胀吃掉。"),
    ("USA", 1965, "平", "越战和社会开支加码，1966 年起通胀抬头，股市进入十几年的横盘。"),
    ("USA", 1973, "危", "石油危机加通胀，1973–74 年美股跌近一半，扣掉通胀更惨。"),
    ("USA", 1980, "危", "沃尔克把利率加到近 20%，1980、1981–82 年两次衰退，通胀被压下去。"),
    ("USA", 1982, "转", "1982 年夏天通胀和利率见顶，股票和国债一起开始近 20 年的大牛市。"),
    ("USA", 1995, "平", "生产率上升、通胀低，美股连续四年涨 20% 以上（互联网热潮前半段）。"),
    ("USA", 1999, "危", "2000 年科网泡沫破裂，纳斯达克跌近八成，美股连跌三年。"),
    ("USA", 2002, "转", "2002 年 10 月股市见底，低利率推起房价，2003 年起经济和股市回升。"),
    ("USA", 2006, "危", "房价 2006 年见顶，2007 年次贷爆雷，2008 年雷曼倒闭、全球金融危机。"),
    ("USA", 2009, "转", "2009 年 3 月股市见底，零利率加量化宽松，股市开始十年牛市。"),
    ("USA", 2015, "平", "美联储 2015 年底开始慢慢加息，经济平稳，股市小幅波动后继续涨。"),
    ("USA", 2021, "危", "2022 年通胀冲到 9%，美联储一年加息 4 个多百分点，股票和国债一起跌。"),
    ("JPN", 1960, "平", "池田内阁提出国民收入倍增计划，日本进入高速增长，股价和地价大涨。"),
    ("JPN", 1973, "危", "石油危机，1974 年通胀超过 20%，日本战后第一次负增长。"),
    ("JPN", 1985, "平", "广场协议后日元大升值，日本央行降息，股市和地价泡沫开始膨胀。"),
    ("JPN", 1989, "危", "1989 年底日经见顶，1990 年起股价、随后地价崩跌，泡沫破裂。"),
    ("JPN", 1992, "转", "股价已跌一半、地价开始跌，银行坏账浮现，进入「失去的十年」。"),
    ("JPN", 1997, "危", "1997–98 年山一证券、长银等金融机构倒闭，亚洲金融危机，通缩加深。"),
    ("JPN", 2000, "平", "2000 年 8 月日本央行取消零利率，随后科网泡沫破裂，2001 年又回到零利率加量化宽松。"),
    ("JPN", 2003, "转", "2003 年政府注资理索纳银行，股市 4 月见底，之后几年回升。"),
    ("JPN", 2008, "危", "全球金融危机，日元大涨、出口崩，日本股市 2008 年跌四成。"),
    ("JPN", 2012, "转", "2012 年底安倍上台，安倍经济学大规模宽松，日元贬值、股市大涨。"),
    ("JPN", 2016, "平", "日本央行负利率加收益率曲线控制，股市波动中上涨，通胀仍低。"),
    ("JPN", 2020, "转", "疫情后全球宽松，2022 年起日元大贬、通胀回来，日股创新高。"),
    ("AUS", 1960, "平", "1960 年 11 月政府突然收紧信贷，1961 年小衰退，之后恢复增长。"),
    ("AUS", 1974, "危", "石油危机加工资暴涨，1974 年澳股大跌，通胀超过 15%。"),
    ("AUS", 1981, "平", "资源热退潮，1982–83 年衰退加大旱，失业率升到 10%。"),
    ("AUS", 1989, "危", "利率高到 17–18%，1990–91 年「不得不有的衰退」，地产商和银行亏损。"),
    ("AUS", 1991, "转", "降息后通胀降到 2% 左右，澳洲开始近 30 年没有衰退的扩张。"),
    ("AUS", 2000, "平", "GST 开征、科网泡沫破裂，2001 年小放缓后房价开始快速上涨。"),
    ("AUS", 2008, "危", "全球金融危机，澳股跌四成，但大降息、财政刺激加中国需求，没有衰退。"),  # + REVEAL_WHY below
    ("AUS", 2009, "转", "2009 年股市反弹，矿业繁荣回来，澳联储在发达国家里最早开始加息。"),
    ("AUS", 2015, "平", "矿业投资退潮，降息推高悉尼、墨尔本房价，2017 年监管收紧后房价回落。"),
    ("AUS", 2021, "危", "2022 年起澳联储从 0.1% 加息到 4.35%，房价先跌后涨，股票和国债一起跌。"),
    ("CHN", 2007, "危", "2007 年 10 月 A 股见顶，2008 年跌约三分之二，全球金融危机。"),
    ("CHN", 2008, "转", "四万亿刺激加信贷放水，2009 年 A 股和房价大反弹。"),
    ("CHN", 2010, "危", "通胀抬头，2010–11 年加息、限购，A 股连跌，房价横盘。"),
    ("CHN", 2012, "平", "经济放缓、两次降息，A 股低迷，房价 2012 年底重新上涨。"),
    ("CHN", 2013, "危", "2013 年 6 月「钱荒」，利率飙升，影子银行收紧，A 股偏弱。"),
    ("CHN", 2014, "转", "2014 年底起降息降准、加杠杆入市，A 股 2015 年上半年翻倍后暴跌。"),
    ("CHN", 2015, "危", "2015 年 6 月股灾，8 月人民币贬值，资本外流。"),
    ("CHN", 2016, "平", "棚改货币化推高三四线房价，供给侧改革，A 股慢牛（白马股）。"),
    ("CHN", 2018, "平", "去杠杆加中美贸易战，2018 年 A 股跌约四分之一，民企违约增多。"),
    ("CHN", 2020, "转", "疫情后中国最先复苏，A 股核心资产大涨到 2021 年初，之后回落。"),
    ("CHN", 2021, "危", "「三条红线」后恒大等房企违约，房价开始下跌，A 股连跌三年。"),
    ("CHN", 2024, "转", "2024 年 9 月大规模刺激政策，A 股急涨；房价仍在跌。"),
]
# optional second reveal line (reveal.why, src/blind/main.js shows it under `what`); 负资产 ≠ B2 (tools/COURSE-V3.md queue 2c)
REVEAL_WHY = {
    "AUS-2008": "为什么不是 B2（地下水位没跌破吸程线）：房价只小跌、负资产少，银行没伤；降息很快传到浮动利率房贷，推得动。",
}

# ---------------------------------------------------------------- generic helpers
def ann(s, how="mean", need=1):
    """Monthly/quarterly/daily Series with a Period or Datetime index -> annual Series (int year index)."""
    if s is None or len(s) == 0:
        return pd.Series(dtype=float)
    idx = s.index
    yrs = idx.year if hasattr(idx, "year") else idx.to_timestamp().year
    g = s.groupby(np.asarray(yrs))
    if how == "mean":
        out = g.mean()
        out = out[g.count() >= need]
    elif how == "last":
        out = g.last()
    elif how == "dec":   # mean of the December observations
        m = np.asarray(idx.month if hasattr(idx, "month") else idx.to_timestamp().month)
        d = s[m == 12]
        dy = d.index.year if hasattr(d.index, "year") else d.index.to_timestamp().year
        out = d.groupby(np.asarray(dy)).mean()
    out.index = out.index.astype(int)
    return out[out.index <= LAST].astype(float)


def sig(x, n=4):
    if x is None:
        return None
    try:
        if not math.isfinite(float(x)):
            return None
    except (TypeError, ValueError):
        return None
    x = float(x)
    return 0 if x == 0 else float(f"{x:.{n}g}")


def nz(x):
    return x is not None and not (isinstance(x, float) and math.isnan(x)) and not pd.isna(x)


# ---------------------------------------------------------------- raw loaders (each returns annual Series, int years)
def load_raw():
    """All raw annual series, per country: dict iso -> dict name -> Series. Nothing here mixes sources."""
    jst = pd.read_csv(JST)
    weo = pd.read_csv(WD / "imf" / "weo.csv")
    fin = pd.read_csv(BL / "oecd" / "finmark.csv")

    def weo_s(c, ind):
        d = weo[(weo.COUNTRY == c) & (weo.INDICATOR == ind)]
        s = pd.Series(d.OBS_VALUE.values.astype(float), index=d.TIME_PERIOD.astype(int)).sort_index()
        return s[s.index <= LAST]

    def wb_s(ind, c):
        j = json.loads((WD / "worldbank" / f"{ind}.json").read_text(encoding="utf-8"))
        out = {int(r["date"]): float(r["value"]) for r in (j[1] or []) if r.get("countryiso3code") == c and r.get("value") is not None}
        s = pd.Series(out, dtype=float).sort_index()
        return s[s.index <= LAST]

    def fin_m(c, m):
        d = fin[(fin.REF_AREA == c) & (fin.MEASURE == m)]
        return pd.Series(d.OBS_VALUE.values.astype(float), index=pd.PeriodIndex(d.TIME_PERIOD, freq="M")).sort_index()

    def bis_ann(table, key, need):
        s = W.bis_series(table, key)
        return ann(s, "mean", need) if s is not None else pd.Series(dtype=float)

    raw = {}
    for iso in ISOS:
        r = {}
        b = BIS2[iso]
        if iso != "CHN":
            x = jst[jst.iso == iso].set_index("year").sort_index()
            for c in ["tloans", "gdp", "cpi", "stir", "ltrate", "hpnom", "unemp", "debtgdp", "xrusd", "eq_tr", "bond_tr",
                      "housing_tr", "bill_rate", "eq_dp", "housing_rent_yd", "rgdpbarro", "pop"]:
                r["jst_" + c] = x[c].astype(float).dropna()
        r["bis_cg"] = bis_ann("WS_TC", f"Q:{b}:P:A:M:770:A", 4)
        r["bis_hp"] = bis_ann("WS_SPP", f"Q:{b}:N:628", 4)
        r["bis_pol"] = ann(W.policy_month(b) if iso in ("JPN", "CHN") else W.bis_series("WS_CBPOL", f"M:{b}"), "mean", 6)
        r["weo_infl"] = weo_s(iso, "PCPIPCH")
        r["weo_rg"] = weo_s(iso, "NGDP_RPCH")
        r["weo_ngdpd"] = weo_s(iso, "NGDPD")
        r["weo_gov"] = weo_s(iso, "GGXWDG_NGDP")
        r["wb_pop"] = wb_s("SP.POP.TOTL", iso)
        fxm = W.fx_month(FXC[iso])
        # JST xrusd is a year-end rate (AUS 2000 = 1.805 = Dec 2000), so the extension uses the December monthly average
        r["fx"] = ann(fxm, "dec") if fxm is not None else pd.Series(1.0, index=range(1870, LAST + 1))
        r["fx_avg"] = ann(fxm, "mean", 12) if fxm is not None else pd.Series(1.0, index=range(1870, LAST + 1))   # for GDP in local currency
        r["o_bill"] = ann(fin_m(iso, "IR3TIB"), "mean", 12)
        r["o_lt"] = ann(fin_m(iso, "IRLT"), "mean", 12)
        r["o_lt_dec"] = ann(fin_m(iso, "IRLT"), "dec")
        r["o_share_dec"] = ann(fin_m(iso, "SHARE"), "dec")
        raw[iso] = r

    # unemployment, monthly -> annual mean (extension after JST; China: World Bank ILO model)
    u = pd.read_csv(BL / "local" / "fred_UNRATE_2026-10-26.csv")
    us_u = pd.Series(pd.to_numeric(u.iloc[:, 1], errors="coerce").values, index=pd.PeriodIndex(pd.to_datetime(u.iloc[:, 0]), freq="M")).dropna()
    raw["USA"]["m_unemp"] = ann(us_u, "mean", 11)      # Oct 2025 was never collected (US government shutdown)
    raw["AUS"]["m_unemp"] = ann(W.fred("LRUNTTTTAUM156S"), "mean", 12)
    raw["JPN"]["m_unemp"] = ann(W.fred("LRUNTTTTJPM156S"), "mean", 12)
    raw["CHN"]["m_unemp"] = wb_s("SL.UEM.TOTL.ZS", "CHN")

    # within-year timing of the short rate (monthly series already on disk): December mean and annual mean of one series
    # per country. The year-end rate used by the short cycle = annual-average rate + (December - annual mean) of this series.
    tb = pd.read_csv(BL / "local" / "fred_DTB3_2026-10-26.csv")
    tbs = pd.Series(pd.to_numeric(tb.iloc[:, 1], errors="coerce").values, index=pd.to_datetime(tb.iloc[:, 0])).dropna()
    cbd = pd.read_csv(BL / "chinabond" / "cgb_curve.csv")
    cb3 = pd.Series(pd.to_numeric(cbd["m3"], errors="coerce").values, index=pd.to_datetime(cbd["date"])).dropna()
    cb3m = cb3.groupby(cb3.index.to_period("M")).mean()
    timing = {
        "USA": tbs.groupby(tbs.index.to_period("M")).mean(),           # 3-month T-bill, 1954+
        "JPN": W.policy_month("JP"),                                   # BoJ policy rate (BIS), 1946+
        "AUS": W.bis_series("WS_CBPOL", "M:AU"),                       # RBA cash rate (BIS), 1976+
        "CHN": cb3m.combine_first(fin_m("CHN", "IR3TIB")),             # 3-month CGB 2006+, interbank 3-month before
    }
    for iso, m in timing.items():
        cnt = m.groupby(m.index.year).count()
        full = [y for y, n in cnt.items() if n >= 12]
        a, d = ann(m, "mean"), ann(m, "dec")
        raw[iso]["tim_shift"] = (d - a).reindex([y for y in full if y <= LAST]).dropna()

    # US equity (Ken French market = MKT_RF + RF, monthly, compounded by calendar year) and Shiller December D/P
    kf = pd.read_csv(BL / "local" / "kenfrench_monthly.csv")
    m = pd.Series((kf.MKT_RF + kf.RF).values, index=pd.PeriodIndex(pd.to_datetime(kf.date), freq="M"))
    g = (1 + m).groupby(m.index.year)
    raw["USA"]["kf_eq"] = (g.prod() - 1)[g.count() == 12]
    raw["USA"]["kf_eq"] = raw["USA"]["kf_eq"][raw["USA"]["kf_eq"].index <= LAST]
    sh = pd.read_csv(BL / "local" / "shiller_monthly.csv")
    shs = pd.Series((sh.D / sh.P).values * 100, index=pd.PeriodIndex(pd.to_datetime(sh.date), freq="M")).dropna()
    raw["USA"]["sh_dp_dec"] = ann(shs, "dec")
    # Japan share price index (OECD MEI via FRED, monthly from 1959): December levels, for calendar-year equity returns
    raw["JPN"]["share_dec"] = ann(W.fred("SPASTT01JPM661N"), "dec")

    # China: ChinaBond CGB curve (3M, 10Y), CSI 300 total return + price (year-end closes)
    cb = pd.read_csv(BL / "chinabond" / "cgb_curve.csv")
    cb.index = pd.to_datetime(cb["date"])
    for col, name in [("m3", "cgb3m"), ("y10", "cgb10")]:
        v = pd.to_numeric(cb[col], errors="coerce").dropna()
        full = v.groupby(v.index.year).count()
        a = ann(v, "mean")
        raw["CHN"][name] = a[[y for y in a.index if full.get(y, 0) >= 200]]      # 2006 starts in March: not a full year
        raw["CHN"][name + "_dec"] = ann(v, "dec")
    for code, name in [("H00300", "csi_tr"), ("000300", "csi_pr")]:
        d = pd.read_csv(BL / "csindex" / f"{code}.csv", dtype={"tradeDate": str})
        d = d[d.tradeDate >= "20021231"]
        v = pd.Series(d.close.values.astype(float), index=pd.to_datetime(d.tradeDate))
        a = ann(v.sort_index(), "last")
        raw["CHN"][name] = a[a.index >= (2004 if code == "H00300" else 2002)]
    return raw


def truncate(raw, year):
    return {iso: {k: s[s.index <= year] for k, s in r.items()} for iso, r in raw.items()}


# ---------------------------------------------------------------- derive: one harmonised annual panel per country
def splice_level(primary, ext, years):
    """primary where present, else ext (a level from another source). Causal."""
    return pd.Series([primary.get(y, np.nan) if nz(primary.get(y, np.nan)) else ext.get(y, np.nan) for y in years], index=years, dtype=float)


def splice_growth(primary, growth, years):
    """primary where present; after a gap, extend the previous value by `growth` (decimal, at year t). Causal."""
    out, prev = [], np.nan
    for y in years:
        v = primary.get(y, np.nan)
        if not nz(v):
            gr = growth.get(y, np.nan)
            v = prev * (1 + gr) if nz(prev) and nz(gr) else np.nan
        out.append(v)
        prev = v
    return pd.Series(out, index=years, dtype=float)


def splice_add(primary, delta, years):
    out, prev = [], np.nan
    for y in years:
        v = primary.get(y, np.nan)
        if not nz(v):
            d = delta.get(y, np.nan)
            v = prev + d if nz(prev) and nz(d) else np.nan
        out.append(v)
        prev = v
    return pd.Series(out, index=years, dtype=float)


def bond_tr(y0, y1, n=10):
    """Total return of a 10y par bond bought at yield y0 (decimal), revalued a year later at y1 with n-1 years left."""
    if not (nz(y0) and nz(y1)):
        return np.nan
    k = np.arange(1, n)
    price = (y0 / (1 + y1) ** k).sum() + 1 / (1 + y1) ** (n - 1)
    return y0 + price - 1


EMPTY = pd.Series(dtype=float)


def derive(r, iso):
    """Annual panel (index = years) with: cg_jst, cg_bis (% GDP), ngdp, rgdp, pop, cpi, infl (%), pol (%), lt (%), hp, u (%),
    gov (% GDP), fx (local per USD), dp (equity D/P %), and local nominal returns r_cash, r_bond, r_eq, r_house (decimals)
    with approximation tags. Every value at year t uses raw values <= t only."""
    J = lambda k: r.get("jst_" + k, EMPTY)  # noqa: E731
    if iso == "CHN":
        y0 = 1985
    else:
        y0 = int(J("gdp").index.min())
    years = list(range(y0, LAST + 1))
    P = pd.DataFrame(index=years, dtype=float)
    fx = splice_level(J("xrusd"), r["fx"], years)
    P["fx"] = fx
    ngdp_loc = (r["weo_ngdpd"] * r["fx_avg"]).dropna()                       # WEO GDP in USD bn x average FX = local bn
    ngdp_ext = ngdp_loc.pct_change(fill_method=None)
    if iso == "CHN":
        P["ngdp"] = ngdp_loc.reindex(years)
        P["rgdp"] = splice_growth(pd.Series({1990: 100.0}), r["weo_rg"] / 100, years)
        P["pop"] = r["wb_pop"].reindex(years)
        P["cpi"] = splice_growth(pd.Series({1990: 100.0}), r["weo_infl"] / 100, years)
        # short-term market rate, like JST's stir: 3-month CGB yield (2006+), before that the 3-month interbank rate (OECD)
        P["pol"] = splice_level(r["cgb3m"], r["o_bill"], years)
        P["lt"] = r["cgb10"].reindex(years)
        P["hp"] = r["bis_hp"].reindex(years)
        P["u"] = r["m_unemp"].reindex(years)
        P["gov"] = r["weo_gov"].reindex(years)
        P["cg_jst"] = np.nan
        tr, pr = r["csi_tr"], r["csi_pr"]
        dp = {}
        for y in years:
            # the total return index only adds dividends from 2006 (2005 equals the price index), so D/P starts in 2006
            if y >= 2006 and all(nz(s.get(k, np.nan)) for s in (tr, pr) for k in (y, y - 1)):
                dy = (tr[y] / tr[y - 1]) / (pr[y] / pr[y - 1]) - 1          # dividends paid in y / price at the start of y
                dp[y] = dy * pr[y - 1] / pr[y] * 100                         # ... over the price at the end of y
        P["dp"] = pd.Series(dp, dtype=float).reindex(years)
    else:
        P["ngdp"] = splice_growth(J("gdp"), ngdp_ext, years)
        P["rgdp"] = splice_growth(J("rgdpbarro") * J("pop"), r["weo_rg"] / 100, years)
        P["pop"] = splice_growth(J("pop"), r["wb_pop"].pct_change(fill_method=None), years)
        P["cpi"] = splice_growth(J("cpi"), r["weo_infl"] / 100, years)
        last_j = J("stir").index.max()
        P["pol"] = splice_level(J("stir"), r["o_bill"][r["o_bill"].index > last_j], years)
        P["lt"] = splice_level(J("ltrate"), r["o_lt"][r["o_lt"].index > J("ltrate").index.max()], years)
        P["hp"] = splice_growth(J("hpnom"), r["bis_hp"].pct_change(fill_method=None), years)
        P["u"] = splice_level(J("unemp"), r["m_unemp"][r["m_unemp"].index > J("unemp").index.max()], years)
        P["gov"] = splice_add(J("debtgdp") * 100, r["weo_gov"].diff(), years)
        P["cg_jst"] = (J("tloans") / J("gdp") * 100).reindex(years)
        dp_ext = r.get("sh_dp_dec", EMPTY)
        P["dp"] = splice_level(J("eq_dp") * 100, dp_ext[dp_ext.index > J("eq_dp").index.max()] if len(dp_ext) else EMPTY, years)
    P["cg_bis"] = r["bis_cg"].reindex(years)
    P["infl"] = P["cpi"].pct_change(fill_method=None) * 100
    # year-end short rate for the central-bank rules: annual average + within-year timing (none on disk -> the average)
    P["polYE"] = P["pol"] + r["tim_shift"].reindex(years).fillna(0.0)

    # ---- local nominal returns (reveal only) + approximation tags
    tags = {}

    def tag(col, y, t):
        tags.setdefault((col, y), t)

    rc, rb, re_, rh = {}, {}, {}, {}
    if iso == "CHN":
        for y in years:
            b = r["cgb3m"].get(y, np.nan)
            if nz(b):
                rc[y] = b / 100
            elif nz(r["o_bill"].get(y, np.nan)):
                rc[y] = r["o_bill"][y] / 100
                tag("r_cash", y, "人民币现金 2007 年前用银行间 3 个月利率（OECD）")
            rb[y] = bond_tr(r["cgb10_dec"].get(y - 1, np.nan) / 100, r["cgb10_dec"].get(y, np.nan) / 100)
            tag("r_bond", y, "中国国债回报用 10 年期收益率近似（中债，12 月均值）")
            if nz(r["csi_tr"].get(y, np.nan)) and nz(r["csi_tr"].get(y - 1, np.nan)):
                re_[y] = r["csi_tr"][y] / r["csi_tr"][y - 1] - 1
            if nz(P.at[y, "hp"]) and y - 1 in P.index and nz(P.at[y - 1, "hp"]):
                rh[y] = P.at[y, "hp"] / P.at[y - 1, "hp"] - 1 + CN_RENT
                tag("r_house", y, f"中国房子回报 = 房价变化 + 假设净租金 {CN_RENT:.1%}")
    else:
        bill = J("bill_rate").copy()
        jl = bill.index.max()
        for y in years:
            v = bill.get(y, np.nan)
            if nz(v):
                rc[y] = v
            elif y > jl and nz(r["o_bill"].get(y, np.nan)):
                rc[y] = r["o_bill"][y] / 100
                tag("r_cash", y, "2021 年后现金回报用 3 个月利率（OECD）")
            elif y < jl:
                prev = [bill.get(k, np.nan) for k in (y - 1, y - 2, y - 3)]
                prev = [p for p in prev if nz(p)]
                if prev:
                    rc[y] = prev[0]
                    tag("r_cash", y, f"{y} 年 JST 缺短期利率，用前一年的值")
            v = J("bond_tr").get(y, np.nan)
            if nz(v):
                rb[y] = v
            elif y > J("bond_tr").index.max():
                rb[y] = bond_tr(r["o_lt_dec"].get(y - 1, np.nan) / 100, r["o_lt_dec"].get(y, np.nan) / 100)
                tag("r_bond", y, "2021 年后国债回报用 10 年期收益率近似（OECD，12 月均值）")
            v = J("eq_tr").get(y, np.nan)
            sd = r.get("share_dec", EMPTY)
            if iso == "JPN" and nz(sd.get(y, np.nan)) and nz(sd.get(y - 1, np.nan)):
                # JST's Japanese equity return is not aligned with calendar years (e.g. JST 2009 -25%, TOPIX 2009 +7%):
                # use the share price index December to December + last year's dividend yield (JST, held after 2020)
                dpj = J("eq_dp")
                dy = dpj.get(y - 1, np.nan) if nz(dpj.get(y - 1, np.nan)) else dpj.iloc[-1]
                re_[y] = sd[y] / sd[y - 1] - 1 + dy
                tag("r_eq", y, "日股回报 = 股价指数（OECD）12 月对 12 月 + 上年股息率（JST）；JST 的日股回报和日历年对不上，所以不用")
            elif nz(v):
                re_[y] = v
            elif y > J("eq_tr").index.max():
                if iso == "USA":
                    re_[y] = r["kf_eq"].get(y, np.nan)
                    tag("r_eq", y, "2021 年后美股回报用 Ken French 全市场回报")
                elif iso == "AUS":
                    s0, s1 = r["o_share_dec"].get(y - 1, np.nan), r["o_share_dec"].get(y, np.nan)
                    re_[y] = s1 / s0 - 1 + AU_DIV if nz(s0) and nz(s1) else np.nan
                    tag("r_eq", y, f"2021 年后澳股回报 = OECD 股价指数 12 月对 12 月 + 假设股息率 {AU_DIV:.0%}")
            v = J("housing_tr").get(y, np.nan)
            if nz(v):
                rh[y] = v
            elif y > J("housing_tr").index.max() and y - 1 in P.index and nz(P.at[y, "hp"]) and nz(P.at[y - 1, "hp"]):
                ry = J("housing_rent_yd").iloc[-1]
                rh[y] = P.at[y, "hp"] / P.at[y - 1, "hp"] - 1 + ry
                tag("r_house", y, f"2021 年后房子回报 = 房价变化（BIS）+ JST 2020 年净租金 {ry:.1%}")
    P["r_cash"] = pd.Series(rc, dtype=float).reindex(years)
    P["r_bond"] = pd.Series(rb, dtype=float).reindex(years)
    P["r_eq"] = pd.Series(re_, dtype=float).reindex(years)
    P["r_house"] = pd.Series(rh, dtype=float).reindex(years)
    P.attrs["tags"] = tags
    return P


CN_RENT = 0.015   # assumed net rental yield, China (gross ~2%, less costs)
AU_DIV = 0.04     # assumed dividend yield, ASX 2021+ (JST AUS eq_dp 2011-2020 averages ~4.3%)


# ---------------------------------------------------------------- annual features (data <= t only)
TH = dict(  # thresholds of the annual rule set (tools/BLIND-DATA.md)
    debtUp=3.0, debtHiPct=0.8, valPct=0.8, cut=1.0, zero=1.0, ciNeg=-0.5, delev=-5.0, govUp=3.0, real=-1.0,
    govFlat=1.0, pvtFlat=2.0, reUp=2.0, pcg=3.0, infl=3.5, inflUp=0.5, hike=0.5, turn=0.25, hold=2, polFlat=0.1,
    uFlat=0.1, uRise=1.0, ciTight=-1.5, minHist=8, bisMin=10, polLow=0.1, valWin=30,
)


def pct_rank(hist, v, minn=TH["minHist"]):
    h = [x for x in hist if nz(x)]
    if not nz(v) or len(h) < minn:
        return None
    return (sum(1 for x in h if x <= v) - 1) / (len(h) - 1)


def credit_src(P, t, iso):
    if iso == "CHN":
        return "cg_bis"
    nb = P.loc[:t, "cg_bis"].notna().sum()
    return "cg_bis" if nb >= TH["bisMin"] else "cg_jst"


def feats(P, t, iso):
    """Every quantity the rules use, at year t, from P rows <= t."""
    Q = P.loc[:t]
    v = lambda c, y: Q[c].get(y, np.nan) if y in Q.index else np.nan  # noqa: E731
    src = credit_src(P, t, iso)
    cg = Q[src]
    g = lambda y: v("ngdp", y) / v("ngdp", y - 1) - 1  # noqa: E731
    flow = lambda y: v(src, y) - v(src, y - 1) / (1 + g(y))  # noqa: E731
    f = {"src": src}
    f["cg"] = v(src, t)
    f["cgD3"] = v(src, t) - v(src, t - 3)
    win = [v(src, y) for y in range(t - 3, t + 1)]
    f["cgDD"] = v(src, t) - max(w for w in win if nz(w)) if any(nz(w) for w in win) and nz(v(src, t)) else np.nan
    f["cgPct"] = pct_rank(cg.values, v(src, t))
    f["ci"] = flow(t) - flow(t - 1)
    f["pcg"] = ((v(src, t) * v("ngdp", t)) / (v(src, t - 1) * v("ngdp", t - 1)) - 1) * 100
    f["hpY"] = (v("hp", t) / v("hp", t - 1) - 1) * 100
    # valuations trend over a century (house index vs income, dividend payout habits), so they are ranked in the last 30 years
    pi = (Q["hp"] / (Q["ngdp"] / Q["pop"])).loc[t - TH["valWin"] + 1:]
    f["PI"] = pi.get(t, np.nan)
    f["PIpct"] = pct_rank(pi.values, f["PI"])
    f["PImean"] = pi.mean() if pi.notna().sum() >= TH["minHist"] else np.nan
    pd_ = (100 / Q["dp"]).loc[t - TH["valWin"] + 1:]
    f["PD"] = pd_.get(t, np.nan)
    f["PDpct"] = pct_rank(pd_.values, f["PD"])
    f["infl"] = v("infl", t)
    f["inflUp"] = v("infl", t) - v("infl", t - 1)
    f["pol"] = v("pol", t)                       # annual average: shown on the card, used for the real rate
    # the central-bank rules use the year-end rate (where monthly data exists), so a cut late in the year counts that year
    f["polYE"] = v("polYE", t)
    f["dPol"] = v("polYE", t) - v("polYE", t - 1)
    hist2 = [v("polYE", y) for y in (t - 2, t - 1, t) if nz(v("polYE", y))]
    f["polDrop2"] = max(hist2) - v("polYE", t) if hist2 and nz(v("polYE", t)) else np.nan
    f["polPct"] = pct_rank(Q["polYE"].values, v("polYE", t))
    f["cgD1"] = v(src, t) - v(src, t - 1)
    f["real"] = v("pol", t) - v("infl", t)
    rr = Q["pol"] - Q["infl"]
    f["realPct"] = pct_rank(rr.values, f["real"])
    f["gov"] = v("gov", t)
    f["govD3"] = v("gov", t) - v("gov", t - 3)
    f["u"] = v("u", t)
    f["dU"] = v("u", t) - v("u", t - 1)
    f["lt"] = v("lt", t)
    f["gr"] = (v("ngdp", t) / v("ngdp", t - 1) - 1) * 100 - v("lt", t)      # g - r: nominal growth minus the long rate
    f["fx"] = v("fx", t)
    # gdp gap: log real GDP minus a one-sided HP trend (lambda 100, annual) fitted on the (up to) 40 years ending at t
    rg = Q["rgdp"].loc[t - 39:]
    rg = rg[rg.index >= (rg[rg.isna()].index.max() + 1 if rg.isna().any() else rg.index.min())].dropna()   # last unbroken run
    f["gap"] = float(np.log(rg.values[-1]) - hp_trend(np.log(rg.values))[-1]) if len(rg) >= 10 and t in rg.index else np.nan
    return f


def hp_trend(y, lam=100.0):
    n = len(y)
    D = np.zeros((n - 2, n))
    for i in range(n - 2):
        D[i, i:i + 3] = [1, -2, 1]
    return np.linalg.solve(np.eye(n) + lam * D.T @ D, y)


def ge(x, th):
    return nz(x) and x >= th - 1e-12


def le(x, th):
    return nz(x) and x <= th + 1e-12


# ---------------------------------------------------------------- the annual cycle machine
LONG_ORDER = [1, 2, 5, 6, 7, 8]
LONG_SYM = {1: "①", 2: "②", 5: "⑤", 6: "⑥", 7: "⑦", 8: "⑧"}
LONG_TXT = {1: "① 堆债", 2: "② 逼近吸程线（缓冲池满）", 5: "⑤ 私人去杠杆", 6: "⑥ 政府接手", 7: "⑦ 增长化债（g > r）", 8: "⑧ 修复"}
# ⑦ when the real rate (到手 ▶ − ▼) is negative that year: same stage, read as financial repression (as src/engine/regimes.js)
LONG_TXT_7_REPRESS = "⑦ 增长化债（到手为负 = 金融压制）"


LONG_TXT_7_NEAR0 = "⑦ 增长化债（到手约为零）"
def long_txt(stage, real):
    # same as regimes.js label7: below the ⑧ line (-1%) = 金融压制; between -1% and 0 = 到手约为零
    if stage != 7 or not nz(real) or real >= 0:
        return LONG_TXT[stage]
    return LONG_TXT_7_REPRESS if real < -0.01 else LONG_TXT_7_NEAR0
LONG_N = {2: 2, 5: 2, 6: 1, 7: 2, 8: 2, 1: 2}       # years of evidence needed to enter the stage (no skipping)
SHORT_TXT = {"expand": "扩张", "hotP": "过热·物价", "hotA": "过热·资产", "tight": "收紧", "ease": "降息（推得动吗？）"}


def conds(f):
    """The named conditions of the rule set, each True/False (missing data = False)."""
    c = {}
    c["debtUp"] = ge(f["cgD3"], TH["debtUp"])
    c["debtHigh"] = c["debtUp"] or ge(f["cgPct"], TH["debtHiPct"])
    c["valHigh"] = ge(f["PIpct"], TH["valPct"]) or ge(f["PDpct"], TH["valPct"])
    c["hpFall"] = le(f["hpY"], 0)
    c["cutDone"] = ge(f["polDrop2"], TH["cut"]) or le(f["polYE"], TH["zero"]) or le(f["polPct"], TH["polLow"])
    c["ciNeg"] = le(f["ci"], TH["ciNeg"])
    c["delev"] = le(f["cgDD"], TH["delev"])
    c["zero"] = le(f["polYE"], TH["zero"])
    c["govUp"] = ge(f["govD3"], TH["govUp"])
    c["negReal"] = le(f["real"], TH["real"])
    c["realNeg0"] = nz(f["real"]) and f["real"] < 0
    c["gOverR"] = nz(f["gr"]) and f["gr"] > 0
    c["inflHot"] = ge(f["infl"], TH["infl"]) and ge(f["inflUp"], TH["inflUp"])
    c["b2"] = c["hpFall"] and c["debtHigh"] and c["cutDone"] and c["ciNeg"]
    c["hotA"] = c["ciNeg"] and c["hpFall"] and c["debtHigh"]
    c["creditBack"] = ge(f["ci"], 0) and le(f["dU"], TH["uFlat"])
    c["creditRestart"] = nz(f["ci"]) and f["ci"] > 0 and ge(f["cgD1"], 0)      # 推得动: credit impulse > 0, credit/GDP no longer falling
    c["recess"] = ge(f["dU"], TH["uRise"]) or le(f["ci"], TH["ciTight"])
    return c


def long_ev(c, f):
    return {
        2: c["debtUp"] and (c["valHigh"] or ge(f["cgPct"], TH["debtHiPct"])),   # handover §2 B: asset prices / income, or private credit / GDP
        5: c["b2"] or (c["delev"] and c["zero"]),
        6: c["govUp"] and c["cutDone"],
        7: c["realNeg0"] and c["gOverR"] and le(f["cgD3"], TH["pvtFlat"]),
        8: ge(f["real"], 0) and le(f["govD3"], TH["govFlat"]),
        1: ge(f["cgD3"], TH["reUp"]) and ge(f["pcg"], TH["pcg"]),
    }


def run_machine(P, iso, upto):
    """Walk the annual machine from the first usable year to `upto`; returns {year: call}. Uses feats(P, t) for t <= upto only."""
    start = None
    for t in P.index:
        f = feats(P, t, iso)
        if nz(f["cgD3"]) and nz(f["pol"]) and nz(f["infl"]):
            start = t
            break
    calls = {}
    if start is None:
        return calls
    st = {"stage": 1, "streak": {}, "via5": False, "b2prev": False,
          "phase": "expand", "via": None, "cb": None}
    for t in range(start, upto + 1):
        f = feats(P, t, iso)
        c = conds(f)
        c["_b2prev"] = st["b2prev"]
        warm = t < start + 3
        # ---- long
        ev = long_ev(c, f)
        nxt = LONG_ORDER[(LONG_ORDER.index(st["stage"]) + 1) % 6]     # annual steps are coarse: no skipping, every stage is seen
        streak = {s: (st["streak"].get(s, 0) + 1 if ev[s] and not warm else 0) for s in LONG_ORDER}
        hit = nxt if streak[nxt] >= LONG_N[nxt] else None
        moved = None
        if hit is not None:
            moved = (st["stage"], hit)
            st["via5"] = hit == 5 and c["b2"]
            st["stage"] = hit
            streak = {}
        st["streak"] = streak
        early = st["stage"] in (1, 2)
        # B2 is lit in the year its three conditions hold, and stays lit the next year while house prices still fall
        b2live = early and not warm and (c["b2"] or (st["b2prev"] and c["hpFall"]))
        st["b2prev"] = c["b2"] and not warm
        # ---- short (central-bank following; annual)
        cb = st["cb"]
        pol = f["polYE"]
        if nz(pol):
            if cb is None:
                cb = {"dir": None, "lo": pol, "hi": pol, "hiT": t}
            cb = dict(cb)
            if cb["dir"] != "up":
                cb["lo"] = min(cb["lo"], pol)
            if cb["dir"] != "down" and pol > cb["hi"]:
                cb["hi"], cb["hiT"] = pol, t
            if cb["dir"] != "up" and pol - cb["lo"] >= TH["turn"] - 1e-12:
                cb["dir"], cb["hi"], cb["hiT"] = "up", pol, t
            elif cb["dir"] != "down" and cb["hi"] - pol >= TH["turn"] - 1e-12:
                cb["dir"], cb["lo"] = "down", pol
        st["cb"] = cb
        rnd = (cb["hi"] - cb["lo"]) if cb and cb["dir"] == "up" else 0
        c["hiking"] = cb is not None and cb["dir"] == "up" and rnd >= TH["hike"] - 1e-12 and t - cb["hiT"] <= TH["hold"]
        c["cutting"] = cb is not None and cb["dir"] != "up" and ge(f["polDrop2"], TH["turn"]) and le(f["dPol"], TH["polFlat"])
        c["_round"] = rnd
        ph, via = st["phase"], st["via"]
        new = None
        if not warm:
            if ph == "expand":
                new = "tight" if c["hiking"] else "hotA" if c["hotA"] else "hotP" if c["inflHot"] else None
            elif ph in ("hotP", "hotA"):
                if c["hiking"]:
                    new = "tight"
                elif c["cutting"]:
                    new = "ease"
                elif ph == "hotP" and c["hotA"]:
                    new = "hotA"
                elif not (c["inflHot"] if ph == "hotP" else c["hotA"]) and c["creditBack"]:
                    new = "expand"
            elif ph == "tight":
                if c["cutting"]:
                    new = "ease"
                elif not c["hiking"]:
                    new = "expand"          # the hold outlasted 2 years without a cut
            elif ph == "ease":
                # 降息 is left only when it worked (推得动), as in the engine: a new hiking round of >= 0.5pp (a year is
                # long, so that round is already 收紧), or credit restarts. A rate sitting flat at its low stays 降息;
                # a small hike (< 0.5pp, e.g. BoJ 2000 +0.25pp) does not end it.
                if c["hiking"]:
                    new = "tight"
                elif c["inflHot"]:
                    new = "hotP"
                elif c["creditRestart"] and not le(f["dPol"], -TH["turn"]):
                    new = "expand"
        restart = False
        if new:
            restart = ph == "ease" and new in ("expand", "tight")
            if new in ("hotP", "hotA"):
                via = new
            elif new == "expand" or (new == "tight" and ph in ("expand", "ease")):
                via = None                  # a new round: forget the previous round's top
            ph = new
        if ph == "tight":
            if via != "hotA" and c["hotA"]:
                via = "hotA"
            elif not via and c["inflHot"]:
                via = "hotP"
        st["phase"], st["via"] = ph, via
        price_top = ph == "hotP" or (ph == "tight" and via == "hotP" and ge(f["infl"], TH["infl"]))
        fork = "B2" if (b2live or (st["stage"] == 5 and st["via5"])) else ("B1" if price_top else None)
        handoff = ph == "ease" and (b2live or st["stage"] in (5, 6))
        calls[t] = {"t": t, "f": f, "c": c, "stage": st["stage"], "moved": moved, "fork": fork, "phase": ph, "via": via,
                    "handoff": handoff, "restart": restart, "ev": ev, "warm": warm}
    return calls


# ---------------------------------------------------------------- signals (shown on the reveal), view
def fmt(x, unit):
    if x is None or not nz(x):
        return "缺数据"
    if unit == "pp":
        s = f"{x:+.1f}pp"
    elif unit == "%":
        s = f"{x:.1f}%"
    elif unit == "pct":
        s = f"{x * 100:.0f} 分位"
    else:
        s = str(x)
    return s.replace("-", "−")


def signals(k):
    f, c = k["f"], k["c"]
    S = [
        ("debtUp", f"私人债务/GDP 三年升 ≥ 3pp（{fmt(f['cgD3'], 'pp')}）", c["debtUp"]),
        ("debtHigh", f"私人债务/GDP 在自身历史 ≥ 80 分位（{fmt(f['cgPct'], 'pct')}）或三年升 ≥ 3pp", c["debtHigh"]),
        ("valHigh", f"房价/收入（{fmt(f['PIpct'], 'pct')}）或股票估值（{fmt(f['PDpct'], 'pct')}）在近 30 年 ≥ 80 分位", c["valHigh"]),
        ("hpFall", f"房价比一年前跌（{fmt(f['hpY'], '%')}）", c["hpFall"]),
        ("cutDone", f"已降息：年末利率比两年高点降 ≥ 1pp、或 ≤ 1%、或在自身历史最低 10%（年末 {fmt(f['polYE'], '%')}）", c["cutDone"]),
        ("ciNeg", f"信贷脉冲 ≤ −0.5pp（{fmt(f['ci'], 'pp')}）", c["ciNeg"]),
        ("delev", f"私人债务/GDP 比三年高点低 ≥ 5pp（{fmt(f['cgDD'], 'pp')}）", c["delev"]),
        ("zero", f"年末短期利率 ≤ 1%（{fmt(f['polYE'], '%')}）", c["zero"]),
        ("govUp", f"政府债务/GDP 三年升 ≥ 3pp（{fmt(f['govD3'], 'pp')}）", c["govUp"]),
        ("negReal", f"实际利率 ≤ −1%（{fmt(f['real'], '%')}）", c["negReal"]),
        ("inflHot", f"通胀 ≥ 3.5% 且比一年前高 ≥ 0.5pp（{fmt(f['infl'], '%')}，{fmt(f['inflUp'], 'pp')}）", c["inflHot"]),
        ("hiking", f"央行本轮加息 ≥ 0.5pp（{fmt(c['_round'], 'pp')}）", c["hiking"]),
        ("cutting", f"年末利率比两年高点降 ≥ 0.25pp 且今年不再加（比上年末 {fmt(f['dPol'], 'pp')}）", c["cutting"]),
        ("creditBack", f"信贷重启（推得动）：信贷脉冲 > 0 且私人债务/GDP 不再下降（{fmt(f['ci'], 'pp')}，{fmt(f['cgD1'], 'pp')}）", c["creditRestart"]),
        ("b2", "B2 三条同时成立：房价跌 + 债务高 + 降息后信贷仍收缩", c["b2"]),
    ]
    return [{"id": i, "text": t, "lit": bool(l)} for i, t, l in S]


def short_label(k):
    ph, via = k["phase"], k["via"]
    name = ("收紧·衰退" if k["c"]["recess"] else "收紧（加息）") if ph == "tight" else SHORT_TXT[ph]
    if k["handoff"]:
        name = "降息（推不动）"          # the engine's handoff 'no': the long cycle (B2 / ⑤ / ⑥) has taken over
    if via and ph not in ("hotP", "hotA", "expand"):
        name += "（接 " + ("物价过热" if via == "hotP" else "资产过热") + "）"
    if k["restart"] and ph == "expand" and k["stage"] in (1, 2):
        name += "（推得动）"
    return name


def phase_of(key):
    return "hot" if key in ("hotP", "hotA") else key


def make_view(P, iso, year, calls):
    k = calls.get(year)
    f = feats(P, year, iso)
    pim = f["PImean"]
    view = {
        "levels": {
            "creditGdp": sig(f["cg"] / 100 if nz(f["cg"]) else None),
            "govDebtGdp": sig(f["gov"] / 100 if nz(f["gov"]) else None),
            "houseToIncome": sig(f["PI"] / pim if nz(f["PI"]) and nz(pim) else None),
            "equityVal": sig(f["PD"] if nz(f["PD"]) else None),
            "realRate": sig(f["real"] / 100 if nz(f["real"]) else None),
            "policyRate": sig(f["pol"] / 100 if nz(f["pol"]) else None),
            "cpiYoY": sig(f["infl"] / 100 if nz(f["infl"]) else None),
            "unemployment": sig(f["u"] / 100 if nz(f["u"]) else None),
            "fxPerUsd": sig(f["fx"] if nz(f["fx"]) else None),
        },
        "pct": {
            "creditGdp": sig(f["cgPct"], 3),
            "houseToIncome": sig(f["PIpct"], 3),
            "equityVal": sig(f["PDpct"], 3),
            "realRate": sig(f["realPct"], 3),
        },
        "gdpGap": sig(f["gap"]),
        "creditSource": "BIS" if f["src"] == "cg_bis" else "JST",
    }
    if k is None:
        view["call"] = None
    else:
        view["call"] = {
            "long": LONG_SYM[k["stage"]], "fork": k["fork"], "short": phase_of(k["phase"]),
            "shortKey": k["phase"], "labels": {"long": long_txt(k["stage"], f["real"]), "short": short_label(k)},
            "signals": signals(k),
        }
    return view


# ---------------------------------------------------------------- returns (reveal): real AUD
def aud_real(Pc, Pa, col, y):
    """1 + real AUD return of holding asset `col` of country panel Pc during year y. None if missing."""
    r = Pc[col].get(y, np.nan)
    fc0, fc1 = Pc["fx"].get(y - 1, np.nan), Pc["fx"].get(y, np.nan)
    fa0, fa1 = Pa["fx"].get(y - 1, np.nan), Pa["fx"].get(y, np.nan)
    ca0, ca1 = Pa["cpi"].get(y - 1, np.nan), Pa["cpi"].get(y, np.nan)
    if not all(nz(x) for x in (r, fc0, fc1, fa0, fa1, ca0, ca1)):
        return None
    fxg = (fa1 / fc1) / (fa0 / fc0)            # AUD per unit of local currency, change over the year
    return (1 + r) * fxg / (ca1 / ca0)


def returns(panels, iso, year):
    Pc, Pa = panels[iso], panels["AUS"]
    assets = {"cash": (iso, "r_cash"), "bond": (iso, "r_bond"), "equity": (iso, "r_eq"), "house": (iso, "r_house"),
              "fxUSD": ("USA", "r_cash"), "fxJPY": ("JPN", "r_cash"), "fxCNY": ("CHN", "r_cash"), "fxAUD": ("AUS", "r_cash")}
    out1, out3, yearly, used = {}, {}, {}, set()
    navail = max(0, min(3, LAST - year))
    for name, (c, col) in assets.items():
        g1 = aud_real(panels[c], Pa, col, year + 1)
        out1[name] = sig(g1 - 1) if g1 is not None else None
        gs = [aud_real(panels[c], Pa, col, year + k) for k in range(1, navail + 1)]
        if navail and all(g is not None for g in gs):
            out3[name] = sig(float(np.prod(gs)) ** (1 / navail) - 1)
            yearly[name] = [sig(g - 1, 6) for g in gs]   # year 1..n, so the game can rebalance a portfolio every year
        else:
            out3[name] = None
            yearly[name] = None
        for k in range(1, navail + 1):
            tg = panels[c].attrs["tags"].get((col, year + k))
            if tg and out1.get(name) is not None:
                used.add(tg)
    # benchmark: home 60/40 equities / government bonds, rebalanced every year (the FX + CPI factor is the same for both legs)
    def bench(y):
        e, b = aud_real(Pc, Pa, "r_eq", y), aud_real(Pc, Pa, "r_bond", y)
        return 0.6 * e + 0.4 * b if e is not None and b is not None else None
    b1 = bench(year + 1)
    out1["bench"] = sig(b1 - 1) if b1 is not None else None
    bs = [bench(year + k) for k in range(1, navail + 1)]
    out3["bench"] = sig(float(np.prod(bs)) ** (1 / navail) - 1) if navail and all(b is not None for b in bs) else None
    out3["years"] = navail
    return out1, out3, yearly, sorted(used)


# ---------------------------------------------------------------- build
def build_panels(raw):
    return {iso: derive(raw[iso], iso) for iso in ISOS}


def all_views(raw, truncated):
    """{card id: view}. truncated=False: one panel per country from the full raw data, sliced by year inside feats/machine.
    truncated=True: for every card, rebuild the panel from raw data cut at the card's year (the no-look-ahead check)."""
    out = {}
    if not truncated:
        panels = build_panels(raw)
        machines = {iso: run_machine(panels[iso], iso, LAST) for iso in ISOS}
    for iso, year, typ, what in DECK:
        cid = f"{iso}-{year}"
        if truncated:
            r = truncate(raw, year)
            P = derive(r[iso], iso)
            m = run_machine(P, iso, year)
        else:
            P, m = panels[iso], machines[iso]
        out[cid] = make_view(P, iso, year, m)
    return out


def card_notes(iso, year, view, used, ret1, ret3):
    n = []
    # the call rests on proxies where no household DSR existed (BIS DSR starts 1999; none for China), which also covers
    # the gold-standard years
    if iso == "CHN" or year < 1999:
        n.append("年度数据较粗，框架判断仅供参考")
    if year <= 1965:
        n.append("1966 年前澳元用澳镑（JST 已按 1 澳镑 = 2 澳元折算）")
    if ret3["years"] < 3:
        n.append(f"3 年回报只有 {ret3['years']} 年（数据到 {LAST} 年）")
    if iso == "CHN":
        n.append("中国房价 2006 年起、股票估值 2006 年起才有数据，相对历史位置只基于很短的历史")
    pc = view["pct"]
    for k, nm in [("creditGdp", "信贷/GDP"), ("houseToIncome", "房价/收入"), ("equityVal", "股票估值"), ("realRate", "实际利率")]:
        if pc[k] is None:
            n.append(f"{nm} 的历史位置：数据不够 {TH['minHist']} 年，不显示")
    if view["creditSource"] == "JST":
        n.append("信贷/GDP 用 JST 银行贷款口径（BIS 全口径数据还不够 10 年）")
    if year + 3 >= 2021:
        n.append("用到 2021 年以后的数据：保留样本")
    if ret1["fxCNY"] is None:
        n.append("人民币现金：1997 年前没有利率数据，这张卡不能选")
    n += used
    return n


def build(write=True):
    raw = load_raw()
    panels = build_panels(raw)
    views = all_views(raw, truncated=False)
    cards = []
    for iso, year, typ, what in DECK:
        cid = f"{iso}-{year}"
        r1, r3, yearly, used = returns(panels, iso, year)
        v = views[cid]
        cards.append({
            "id": cid, "iso": iso, "year": year, "type": typ, "holdout": year + 3 >= 2021, "batch": 1 if cid in BATCH1 else 2,
            "view": v,
            "reveal": {"ret1": r1, "ret3": r3, "yearly": yearly, "what": what, **({"why": REVEAL_WHY[cid]} if cid in REVEAL_WHY else {})},
            "notes": card_notes(iso, year, v, used, r1, r3),
        })
    blind = {
        "asOf": AS_OF,
        "method": {
            "returns": "实际澳元回报：本地名义回报 × 换成澳元的汇率变化 ÷ 澳洲 CPI；汇率和 CPI 用年均值（JST 口径），资产回报是 1 月到 12 月",
            "ret3": "3 年年化（几何平均）；不够 3 年时按现有年数年化，years 给出年数",
            "bench": "基准 = 本国 60% 股票 + 40% 国债，每年再平衡",
            "yearly": "reveal.yearly = 每项资产逐年的实际澳元回报（第 1..years 年）；玩家组合和基准一样每年再平衡回原权重，3 年 = 逐年复利再年化",
            "fx": "外币现金 = 持有该国货币、拿该国短期利率",
            "gdpGap": "实际 GDP（取对数）减去趋势；趋势 = 单边 HP 滤波（λ = 100），只用当年及以前最多 40 年",
            "pct": "相对历史位置 = 截至当年的自身历史里，有多少比例的年份 ≤ 今年（0 = 最低，1 = 最高），至少 8 年数据；信贷/GDP、实际利率用全部历史，房价/收入、股票估值用近 30 年（这两个长期有趋势）",
            "levels": "比率和利率用小数；houseToIncome = 房价/人均名义 GDP，除以近 30 年均值（1 = 平均）；equityVal = 股价/股息（倍）；fxPerUsd = 年末每美元本币",
            "call": "框架的判断是一套按年的规则（tools/BLIND-DATA.md），只用当年及以前的数据；它不是标准答案",
        },
        "sources": SOURCES,
        "cards": cards,
    }
    if write:
        body = json.dumps(blind, ensure_ascii=False, indent=1, allow_nan=False)
        OUT.write_text("// Generated by tools/build_blind_data.py — do not edit by hand. Rules and sources: tools/BLIND-DATA.md\n"
                       "export const BLIND = " + body + ";\n", encoding="utf-8")
    return blind, panels


SOURCES = [
    {"id": "jst", "name": "Jordà-Schularick-Taylor Macrohistory R6", "url": "https://www.macrohistory.net/database/", "coverage": "USA/JPN/AUS 1870–2020：回报、利率、CPI、汇率、信贷、房价、政府债务、失业率"},
    {"id": "bis", "name": "BIS 信贷、房价、政策利率", "url": "https://data.bis.org/", "coverage": "私人非金融信贷/GDP（US 1952–、JP 1964–、AU 1960s–、CN 1985–），名义房价（CN 2005Q2–），政策利率"},
    {"id": "imf_weo", "name": "IMF WEO", "url": "https://api.imf.org/external/sdmx/2.1/data/IMF.RES,WEO", "coverage": "2021–2025 通胀、实际增长、美元 GDP、政府债务；中国 1990–"},
    {"id": "oecd", "name": "OECD 金融市场（FINMARK）", "url": "https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_STES@DF_FINMARK,4.0/", "coverage": "2021–2025 3 个月利率、10 年期国债收益率、澳洲股价指数；中国 3 个月利率 1997–2005"},
    {"id": "fred", "name": "FRED（汇率、失业率、日本股价指数）", "url": "https://fred.stlouisfed.org/", "coverage": "汇率 12 月均值（2021–2025 和人民币）；2021–2025 失业率；日本股价指数 1959–（OECD MEI）"},
    {"id": "worldbank", "name": "World Bank WDI", "url": "https://api.worldbank.org/v2/", "coverage": "人口；中国失业率（ILO 模型）"},
    {"id": "chinabond", "name": "中债国债收益率曲线", "url": "https://yield.chinabond.com.cn/cbweb-pbc-web/pbc/historyQuery", "coverage": "3 个月、10 年期，2006-03–2025"},
    {"id": "csindex", "name": "中证指数：沪深300 全收益 / 价格", "url": "https://www.csindex.com.cn/", "coverage": "2005–2025（价格 2002–）"},
    {"id": "french", "name": "Ken French Data Library", "url": "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html", "coverage": "2021–2025 美国全市场回报"},
    {"id": "shiller", "name": "Shiller 美股数据", "url": "http://www.econ.yale.edu/~shiller/data.htm", "coverage": "2021 美股股息率"},
]


def calls_table(iso):
    raw = load_raw()
    P = derive(raw[iso], iso)
    m = run_machine(P, iso, LAST)
    for t, k in m.items():
        lit = [s["id"] for s in signals(k) if s["lit"]]
        mv = f"  {LONG_SYM[k['moved'][0]]}→{LONG_SYM[k['moved'][1]]}" if k["moved"] else ""
        print(t, LONG_SYM[k["stage"]], k["fork"] or "  ", f"{short_label(k):<22}", mv, ",".join(lit))


def validate():
    """How good are the 2021+ approximations? Compare each with JST where both exist (1991-2020)."""
    raw = load_raw()
    rows = []
    for iso in ["USA", "JPN", "AUS"]:
        r = raw[iso]
        J = lambda k: r["jst_" + k]  # noqa: E731
        fx = r["fx"]
        yrs = range(1992, 2021)
        cand = {
            "bond": {y: bond_tr(r["o_lt_dec"].get(y - 1, np.nan) / 100, r["o_lt_dec"].get(y, np.nan) / 100) for y in yrs},
            "cash": {y: r["o_bill"].get(y, np.nan) / 100 for y in yrs},
            "fx(Dec)": {y: fx.get(y, np.nan) for y in yrs},
            "house": {y: r["bis_hp"].get(y, np.nan) / r["bis_hp"].get(y - 1, np.nan) - 1 + J("housing_rent_yd").get(y, np.nan) for y in yrs},
        }
        jst = {"bond": J("bond_tr"), "cash": J("bill_rate"), "fx(Dec)": J("xrusd"), "house": J("housing_tr")}
        if iso == "USA":
            cand["equity"] = {y: r["kf_eq"].get(y, np.nan) for y in yrs}
        elif iso == "JPN":   # the series used for every Japan card (JST's own equity return is shown to be misaligned)
            cand["equity"] = {y: r["share_dec"].get(y, np.nan) / r["share_dec"].get(y - 1, np.nan) - 1 + J("eq_dp").get(y - 1, np.nan) for y in yrs}
        else:
            cand["equity"] = {y: r["o_share_dec"].get(y, np.nan) / r["o_share_dec"].get(y - 1, np.nan) - 1 + AU_DIV for y in yrs}
        jst["equity"] = J("eq_tr")
        for k, c in cand.items():
            a = pd.Series(c, dtype=float)
            b = jst[k].reindex(a.index)
            ok = a.notna() & b.notna()
            if ok.sum() < 5:
                continue
            if k == "fx(Dec)":
                d = (a[ok] / b[ok] - 1).abs()
                rows.append((iso, k, int(ok.sum()), None, f"median |diff| {d.median():.1%}"))
            else:
                rows.append((iso, k, int(ok.sum()), round(float(np.corrcoef(a[ok], b[ok])[0, 1]), 3),
                             f"mean diff {float((a[ok] - b[ok]).mean()):+.2%}, mean |diff| {float((a[ok] - b[ok]).abs().mean()):.2%}"))
    for row in rows:
        print(*row)


if __name__ == "__main__":
    if "--validate" in sys.argv:
        validate()
    elif "--views-truncated" in sys.argv:
        print(json.dumps(all_views(load_raw(), truncated=True), ensure_ascii=False, allow_nan=False))
    elif "--calls" in sys.argv:
        calls_table(sys.argv[sys.argv.index("--calls") + 1])
    else:
        blind, panels = build()
        for c in blind["cards"]:
            v = c["view"]
            call = v["call"]
            r1 = c["reveal"]["ret1"]
            print(f"{c['id']:9s} {c['type']} b{c['batch']} {'*' if c['holdout'] else ' '} "
                  f"{(call['long'] + (call['fork'] or '')) if call else '--':5s} {call['labels']['short'] if call else '':24s} "
                  f"eq1={r1['equity']} bd1={r1['bond']} bench1={r1['bench']}")
        print("wrote", OUT.relative_to(ROOT), f"({OUT.stat().st_size / 1e3:.0f} kB)")
