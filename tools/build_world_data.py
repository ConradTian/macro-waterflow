"""Build src/data/world.js (annual 1995-2025, for the map) from the raw files in data_src/world/. No network.

Run:  <venv>/Scripts/python.exe -I tools/build_world_data.py
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I mode does not add the script dir

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import world_common as wc  # noqa: E402
from world_common import RAW, ROOT, YEARS  # noqa: E402

OUT = ROOT / "src" / "data" / "world.js"

IDS = ["USA", "CHN", "EA", "JPN", "GBR", "AUS"]
NAMES = {"USA": "美国", "CHN": "中国", "EA": "欧元区", "JPN": "日本", "GBR": "英国", "AUS": "澳洲", "ROW": "其他国家"}
CCY = {"USA": "USD", "CHN": "CNY", "EA": "EUR", "JPN": "JPY", "GBR": "GBP", "AUS": "AUD", "ROW": None}
WEO = {"USA": "USA", "CHN": "CHN", "EA": "G163", "JPN": "JPN", "GBR": "GBR", "AUS": "AUS"}
BIS = {"USA": "US", "CHN": "CN", "EA": "XM", "JPN": "JP", "GBR": "GB", "AUS": "AU"}
WB = {"USA": "USA", "CHN": "CHN", "EA": "EMU", "JPN": "JPN", "GBR": "GBR", "AUS": "AUS"}
IMTS = {"USA": "USA", "CHN": "CHN", "EA": "G163", "JPN": "JPN", "GBR": "GBR", "AUS": "AUS"}
FXCODE = {"USA": "USD", "CHN": "CNY", "EA": "EUR", "JPN": "JPY", "GBR": "GBP", "AUS": "AUD"}

notes = []


def pct(s):
    return s / 100.0


def lst(s, n=4):
    return [wc.sig(v, n) for v in s.reindex(YEARS).values]


C = {}
# ------------------------------------------------------------------ per-country annual series
for iso in IDS:
    d = {}
    w = WEO[iso]
    d["gdpUsd"] = wc.weo(w, "NGDPD") / 1e9
    b = BIS[iso]
    pv = wc.bis_series("WS_TC", f"Q:{b}:P:A:M:770:A")
    d["pvtDebtGdp"] = pct(wc.y_mean(pv))
    # gov debt: IMF WEO general government gross debt; gap-fill with BIS general-government debt (nominal, else market value)
    g = pct(wc.weo(w, "GGXWDG_NGDP"))
    for key in (f"Q:{b}:G:A:N:770:A", f"Q:{b}:G:A:M:770:A"):
        bg = wc.bis_series("WS_TC", key)
        if bg is not None:
            g = g.combine_first(pct(wc.y_mean(bg)))
    d["govDebtGdp"] = g
    # policy rate: BIS monthly central bank policy rate, annual mean (EA: Germany/Bundesbank before 1999)
    pr = wc.y_mean(wc.policy_month(b))
    d["policyRate"] = pct(pr)
    # real house price index, rebased 2010 = 100 (annual mean of BIS real index)
    hr = wc.y_mean(wc.bis_series("WS_SPP", f"Q:{b}:R:628"))
    d["houseReal"] = hr / hr.loc[2010] * 100 if pd.notna(hr.get(2010)) else hr * np.nan
    d["cpiYoY"] = pct(wc.weo(w, "PCPIPCH"))
    fx = wc.fx_month(FXCODE[iso])
    d["fxPerUsd"] = pd.Series(1.0, index=YEARS) if fx is None else wc.y_mean(fx)
    d["currentAccountGdp"] = pct(wc.weo(w, "BCA_NGDPD"))
    d["exportsGdp"] = pct(wc.wb("NE.EXP.GNFS.ZS", WB[iso]))
    d["importsGdp"] = pct(wc.wb("NE.IMP.GNFS.ZS", WB[iso]))
    d["population"] = wc.wb("SP.POP.TOTL", WB[iso]) / 1e6      # millions, World Bank mid-year estimate (objective strip: score per person)
    C[iso] = d

# ROW GDP = world - six
world_gdp = wc.weo("G001", "NGDPD") / 1e9
row_gdp = world_gdp - sum(C[i]["gdpUsd"] for i in IDS)

# ------------------------------------------------------------------ longStage
now = wc.waves_now()
LONG = {}
for iso in IDS:
    n = now.get(iso)
    LONG[iso] = {"mark": n["mark"], "text": n["text"]} if n else None
# the contract names AUS "小周期收紧"; waves.js carries the long text for it, keep waves.js verbatim

# ------------------------------------------------------------------ trade matrix (USD bn): exports from row to column
t = pd.read_csv(RAW / "imf" / "imts_trade.csv")
t["OBS_VALUE"] = t.OBS_VALUE / 1e9


def tv(ind, rep, cp):
    d = t[(t.INDICATOR == ind) & (t.COUNTRY == rep) & (t.COUNTERPART_COUNTRY == cp)]
    return pd.Series(d.OBS_VALUE.values, index=d.TIME_PERIOD.astype(int)).sort_index().reindex(YEARS)


ALL = IDS + ["ROW"]
trade = {r: {} for r in ALL}
for r in IDS:
    for c in IDS:
        if r == c:
            continue
        trade[r][c] = tv("XG_FOB_USD", IMTS[r], IMTS[c])  # exporter-reported, FOB
for r in IDS:
    world = tv("XG_FOB_USD", IMTS[r], "G001")
    intra = tv("XG_FOB_USD", IMTS[r], IMTS[r]) if r == "EA" else 0
    others = sum(trade[r][c] for c in IDS if c != r)
    trade[r]["ROW"] = (world - intra - others).clip(lower=0)  # extra-EA only for the euro area
for c in IDS:
    world = tv("MG_CIF_USD", IMTS[c], "G001")  # importer-reported, CIF (same basis for both terms)
    intra = tv("MG_CIF_USD", IMTS[c], IMTS[c]) if c == "EA" else 0
    others = sum(tv("MG_CIF_USD", IMTS[c], IMTS[r]) for r in IDS if r != c)
    trade["ROW"][c] = (world - intra - others).clip(lower=0)

# ------------------------------------------------------------------ reserves (IMF COFER, world, share of allocated reserves)
cf = pd.read_csv(RAW / "imf" / "cofer.csv")
cf = cf[(cf.INDICATOR == "AFXRA") & (cf.TYPE_OF_TRANSFORMATION == "SHRO_PT")]
cf["TIME_PERIOD"] = cf.TIME_PERIOD.astype(int)


def cur(code):
    d = cf[cf.FXR_CURRENCY == f"CI_{code}"]
    return pd.Series(d.OBS_VALUE.values, index=d.TIME_PERIOD.values).sort_index().reindex(YEARS) / 100.0


res = {"USD": cur("USD"), "EUR": cur("EUR"), "JPY": cur("JPY"), "GBP": cur("GBP"), "CNY": cur("CNY"), "AUD": cur("AUD")}
# pre-euro national currencies are folded into EUR for 1995-1998 (the euro replaced them)
legacy = sum(cur(c).fillna(0) for c in ["DEM", "FRF", "NLG", "ECU"])
res["EUR"] = res["EUR"].combine_first(legacy.where(legacy > 0))
res["EUR"] = res["EUR"].where(res["EUR"].notna(), np.nan)
named = sum(res[k].fillna(0) for k in res)
res["other"] = (1 - named).clip(lower=0)
reserves = {k: lst(v, 4) for k, v in res.items()}

# ------------------------------------------------------------------ US Treasuries held by foreigners (TIC), end of year, USD bn
EA_MEMBERS = {"Austria", "Belgium", "Finland", "France", "Germany", "Greece", "Ireland", "Italy", "Luxembourg",
              "Netherlands", "Portugal", "Spain"}


def parse_tic():
    """Return {year: {country: Dec value}} from mfhhis01.txt (tab separated blocks, first column = Dec)."""
    rows = {}
    year = None
    for line in (RAW / "tic" / "mfhhis01.txt").read_text(encoding="latin-1").splitlines():
        parts = line.split("\t")
        name = re.sub(r"\s+\d+/$", "", parts[0].strip().strip('"'))  # drop footnote markers such as "United Kingdom 2/"
        if name == "Country" and len(parts) > 1 and parts[1].strip().isdigit():
            year = int(parts[1].strip())
            rows[year] = {}
            continue
        if year is None or not name or len(parts) < 2:
            continue
        try:
            v = float(parts[1])
        except ValueError:
            continue
        rows[year][name] = v
    return rows


tic = parse_tic()
ust = {k: [] for k in ["CHN", "JPN", "GBR", "EA", "ROW"]}
for y in YEARS:
    r = tic.get(y)
    if not r or "Grand Total" not in r:
        for k in ust:
            ust[k].append(None)
        continue
    chn = r.get("China, Mainland")
    jpn = r.get("Japan")
    gbr = r.get("United Kingdom")
    ea = sum(v for k, v in r.items() if k in EA_MEMBERS)
    tot = r["Grand Total"]
    row = tot - sum(x for x in (chn, jpn, gbr, ea) if x is not None)
    for k, v in zip(["CHN", "JPN", "GBR", "EA", "ROW"], [chn, jpn, gbr, ea, row]):
        ust[k].append(wc.sig(v, 5))

# ------------------------------------------------------------------ write
SIG = {"gdpUsd": 5, "fxPerUsd": 5, "houseReal": 4, "population": 6}
KEYS = ["gdpUsd", "pvtDebtGdp", "govDebtGdp", "policyRate", "houseReal", "cpiYoY", "fxPerUsd", "currentAccountGdp",
        "exportsGdp", "importsGdp", "population"]

lines = ["// AUTO-GENERATED by tools/build_world_data.py - do not edit by hand.", "export const WORLD = {"]
lines.append("  years: " + json.dumps(YEARS) + ",")
lines.append("  reservedFrom: 2022,")
lines.append("  countries: {")
for iso in IDS + ["ROW"]:
    lines.append(f"    {iso}: {{ name: {json.dumps(NAMES[iso], ensure_ascii=False)}, ccy: {json.dumps(CCY[iso])},")
    if iso == "ROW":
        lines.append("      gdpUsd: " + wc.js_array(row_gdp.reindex(YEARS).values, 5) + ",")
        lines.append("      longStage: null },")
        continue
    for k in KEYS:
        lines.append(f"      {k}: " + wc.js_array(C[iso][k].reindex(YEARS).values, SIG.get(k, 4)) + ",")
    ls = LONG[iso]
    lines.append("      longStage: " + (json.dumps(ls, ensure_ascii=False) if ls else "null") + " },")
lines.append("  },")
lines.append("  trade: {")
for r in ALL:
    inner = ", ".join(f"{c}: " + wc.js_array(trade[r][c].reindex(YEARS).values, 4) for c in ALL if c != r)
    lines.append(f"    {r}: {{ {inner} }},")
lines.append("  },")
lines.append("  reserves: {")
for k, v in reserves.items():
    lines.append(f"    {k}: {json.dumps(v, separators=(',', ':'))},")
lines.append("  },")
lines.append("  ustForeign: {")
for k, v in ust.items():
    lines.append(f"    {k}: {json.dumps(v, separators=(',', ':'))},")
lines.append("  },")

sources = {
    "gdpUsd": "IMF WEO (api.imf.org, IMF.RES:WEO) NGDPD, current USD bn; EA = IMF euro area aggregate G163; ROW = IMF world G001 minus the six",
    "pvtDebtGdp": "BIS total credit to private non-financial sector, % of GDP (WS_TC Q:xx:P:A:M:770:A), annual mean of quarters; EA = BIS XM",
    "govDebtGdp": "IMF WEO general government gross debt % GDP (GGXWDG_NGDP); gaps filled with BIS general government debt (WS_TC G, nominal)",
    "policyRate": "BIS central bank policy rates (WS_CBPOL monthly), annual mean; EA = ECB from 1999, Germany (Bundesbank) before; JPN gaps (2002-05, 2014-15) and CHN gaps filled from the OECD call/central bank rate on FRED (IRSTCB01JPM156N, IRSTCB01CNM156N)",
    "houseReal": "BIS residential property prices, real index (WS_SPP Q:xx:R:628), annual mean, rebased 2010 = 100",
    "cpiYoY": "IMF WEO PCPIPCH (average consumer prices, annual % change)",
    "fxPerUsd": "FRED monthly average exchange rates (EXUSAL, EXUSUK, EXJPUS, EXUSEU, EXCHUS, EXGEUS), annual mean",
    "currentAccountGdp": "IMF WEO BCA_NGDPD (current account balance, % of GDP)",
    "exportsGdp": "World Bank WDI NE.EXP.GNFS.ZS (goods and services, % of GDP); EA = WB 'EMU' aggregate (includes intra-euro-area trade)",
    "importsGdp": "World Bank WDI NE.IMP.GNFS.ZS (same basis as exportsGdp)",
    "population": "World Bank WDI SP.POP.TOTL, total population, millions (mid-year); EA = WB 'EMU' aggregate; ROW has none. The UI interpolates to quarters and holds the last year flat",
    "trade": "IMF IMTS (ex-DOTS) annual: exporter-reported exports FOB (XG_FOB_USD); EA = IMF G163 aggregate; ROW as residual to World (G001)",
    "reserves": "IMF COFER, share of allocated reserves, world (G001), annual",
    "ustForeign": "US Treasury TIC, Major Foreign Holders of Treasury Securities, December values (mfhhis01.txt)",
    "longStage": "src/data/waves.js 'now' per country (EA has none)",
}
notes = [
    "Annual 1995-2025. 2022+ is the hold-out label as in the US data (reservedFrom). IMF WEO values for the latest years (2025-2026) may be estimates.",
    "Euro area (EA): IMF aggregate G163 for GDP / inflation / current account / debt; BIS 'XM' for credit and house prices; ECB policy rate from 1999 and Germany's before; World Bank 'EMU' for trade shares (includes trade between euro-area members, so the ratio is about double a single country's); TIC EA = sum of Austria, Belgium, Finland, France, Germany, Greece, Ireland, Italy, Luxembourg, Netherlands, Portugal, Spain (only those TIC lists by name; in the 2000s the list is shorter, so EA is understated then). No GDP-weighted national average was needed.",
    "Trade matrix: trade[row][col] = exports from row to column, USD bn, as reported by the exporter (FOB). ROW exports to a country = that country's reported imports from the world (CIF) minus its reported imports from the five others (CIF), floored at 0; so ROW->X is on an importer/CIF basis and the six-economy cells on an exporter/FOB basis. Mirror asymmetries are normal. EA row/column = euro area as one bloc: intra-euro-area trade is dropped.",
    "Reserves: shares of allocated reserves. DEM/FRF/NLG/ECU in 1995-98 are folded into EUR; CNY (from 2016) and AUD (from 2012) are null before they are reported separately; 'other' = 1 - the six named currencies (so it includes CHF, CAD and unnamed ones, and CNY/AUD before their reporting began). Latest year can be revised.",
    "ustForeign: TIC history file starts in 2000, so 1995-1999 are null. ROW = TIC grand total (official + private) minus CHN, JPN, GBR and the EA members above; it contains Cayman Islands, Hong Kong, Switzerland etc. Held-by-residence basis: custodial centres (Belgium, Luxembourg, Ireland, Cayman) overstate their own ownership.",
    "ROW carries only gdpUsd (world minus the six): other series are not meaningful for a residual.",
    "govDebtGdp: IMF general government gross debt; USA before WEO's first year is filled from BIS general government debt (market value if no nominal series).",
    "population: 1995-2025 complete for all six (the euro-area aggregate follows the World Bank's EMU membership, so it steps up when members join).",
    "exportsGdp/importsGdp: latest World Bank year is usually 2024; later years are null.",
]
lines.append("  meta: " + json.dumps({"sources": sources, "notes": notes}, ensure_ascii=False, indent=2).replace("\n", "\n  ") + "\n};")

# WORLD_USD_DEBT (map layer 地下连地下): from data_src/bis/usd_credit_nonbanks.json (tools/build_bis_usd_credit.py), series "B" = USD bn
_usd = json.loads((ROOT / "data_src" / "bis" / "usd_credit_nonbanks.json").read_text(encoding="utf-8"))


def _js_num(v):
    return "null" if v is None else (str(int(v)) if float(v).is_integer() else repr(float(v)))


def _usd_row(key):
    s = _usd[key]["B"]
    return "[" + ",".join(_js_num(s.get(str(y))) for y in YEARS) + "]"


lines += ["",
          "// BIS Global Liquidity Indicators (WS_GLI): USD-denominated credit (bank loans + debt securities) to non-bank borrowers, USD bn,",
          "// last available quarter of each year. Built by tools/build_bis_usd_credit.py from data_src/bis/gli_all.csv (map layer 地下连地下).",
          "// BIS publishes USD credit by borrower country only for emerging economies (China here); the rest is the world-outside-the-US total.",
          "export const WORLD_USD_DEBT = {",
          '  src: "BIS GLI, USD credit to non-banks",',
          "  outsideUs: " + _usd_row("WORLD_EX_US") + ",",
          "  CHN: " + _usd_row("CHN") + ",",
          "};"]
OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
print("wrote", OUT, OUT.stat().st_size, "bytes")


# ------------------------------------------------------------------ src/data/usd-index.js (quarterly; the FX reactor and the map's sluices)
def build_fx_extra():
    """Broad dollar index, quarterly means 1995Q1-2025Q4: FRED DTWEXBGS (daily, 2006+) spliced with TWEXBMTH (monthly; TWEXB weekly fills
    any month TWEXBMTH lacks) for the earlier years. The old index is scaled so both agree in the join quarter 2006Q1. Plus the iron-ore
    price (FRED PIORECRUSDM, quarterly mean): a direction-only terms-of-trade proxy for Australia."""
    out = ROOT / "src" / "data" / "usd-index.js"
    new_q = wc.q_mean(wc.fred_daily_to_monthly("DTWEXBGS"))
    old_m = wc.fred("TWEXBMTH").combine_first(wc.fred_daily_to_monthly("TWEXB"))
    old_q = wc.q_mean(old_m)
    join = pd.Period("2006Q1", "Q")
    k = new_q[join] / old_q[join]
    ov = (new_q / old_q).dropna()
    spliced = new_q.where(new_q.index >= join, old_q * k)
    iron = wc.q_mean(wc.fred("PIORECRUSDM"))
    meta = {
        "sources": {
            "broad": "FRED DTWEXBGS (Federal Reserve H.10 nominal broad dollar index, Jan 2006 = 100), quarterly mean of daily values, 2006Q1+; "
                     "before 2006: FRED TWEXBMTH (trade-weighted broad index, Jan 1997 = 100, monthly; TWEXB weekly where a month is missing), quarterly mean, "
                     f"scaled by {k:.4f} so both agree in 2006Q1",
            "ironOre": "FRED PIORECRUSDM (IMF global price of iron ore, USD per dry metric ton), quarterly mean of monthly values",
        },
        "notes": [
            "broad: up = the US dollar stronger against a basket of currencies (the opposite sign of fxPerUsd for other countries).",
            f"Splice check: DTWEXBGS / TWEXBMTH over the overlap 2006Q1-2019Q4 ranges {ov.min():.3f}-{ov.max():.3f} (the two baskets differ a little); the join keeps the level continuous.",
            "ironOre is used only as a direction for Australia's terms of trade: the size of its effect on the currency (k in the FX formula) is not fitted here.",
        ],
    }
    L = ["// AUTO-GENERATED by tools/build_world_data.py - do not edit by hand.",
         "// FX extras (quarterly, aligned with the countries' *-quarterly.js dates): the broad US dollar index (美元对一篮子货币) and the",
         "// iron-ore price (澳洲贸易条件的方向). Read by src/ui/fx-reactor.js and src/ui/world-map.js.",
         "export const USD_INDEX = {",
         "  dates: " + json.dumps(wc.DATES) + ",",
         "  broad: " + wc.js_array(spliced.reindex(wc.QIDX).values, 5) + ",",
         "  ironOre: " + wc.js_array(iron.reindex(wc.QIDX).values, 4) + ",",
         "  meta: " + json.dumps(meta, ensure_ascii=False, indent=2).replace("\n", "\n  ") + ",",
         "};"]
    out.write_text("\n".join(L) + "\n", encoding="utf-8")
    print("wrote", out, out.stat().st_size, "bytes", f"(splice k={k:.4f}, overlap ratio {ov.min():.3f}-{ov.max():.3f})")


build_fx_extra()
