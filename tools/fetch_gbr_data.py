"""GBR round (2026-10-30): download the few UK series used to set COUNTRY_PARAMS.GBR into data_src/gbr/ (data only; nothing executed).

Run:  %USERPROFILE%/.venvs/dalio432/Scripts/python.exe -I tools/fetch_gbr_data.py
Sources (official): Bank of England IADB (effective / quoted mortgage rates), ONS public sector finances (net borrowing, debt interest).
"""
import json
import time
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data_src" / "gbr"
UA = "macro-waterflow-data-fetch/1.0 (teaching project; research use)"
LOG = []


def get(url, timeout=120, tries=2):
    err = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa
            err = e
            time.sleep(2 * (i + 1))
    raise err


def save(name, data, url, note):
    RAW.mkdir(parents=True, exist_ok=True)
    (RAW / name).write_bytes(data)
    LOG.append({"file": name, "url": url, "date": str(date.today()), "note": note, "bytes": len(data)})
    print(f"  saved {name} ({len(data) / 1e3:.0f} kB)")


IADB = ("https://www.bankofengland.co.uk/boeapps/iadb/fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/1995&Dateto=now"
        "&SeriesCodes={codes}&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N")
BOE = {
    "CFMHSDE": "effective interest rate, UK MFIs' sterling secured loans to households, OUTSTANDING (stock), monthly",
    "CFMHSCV": "UNVERIFIED code (values 0.1-3.5%: not a mortgage rate, probably a deposit rate); downloaded by mistake, NOT used",
    "IUMBV34": "quoted rate, 2-year fixed mortgage (75% LTV), monthly average",
    "IUMBV42": "quoted rate, 5-year fixed mortgage (75% LTV), monthly average",
    "IUMTLMV": "quoted rate, standard variable rate (SVR), monthly average",
}
ONS = {
    "J5II": ("/economy/governmentpublicsectorandtaxes/publicsectorfinance/timeseries/j5ii/pusf", "PS net borrowing ex public sector banks, GBP m, NSA (annual/quarterly/monthly blocks)"),
    "HF6X": ("/economy/governmentpublicsectorandtaxes/publicsectorfinance/timeseries/hf6x/pusf", "PS net debt ex public sector banks, % of GDP, NSA"),
}

if __name__ == "__main__":
    for code, note in BOE.items():
        url = IADB.format(codes=code)
        try:
            save(f"boe_{code}.csv", get(url), url, "BoE IADB " + code + ": " + note)
        except Exception as e:  # noqa
            print("  FAIL", code, e)
    for code, (uri, note) in ONS.items():
        url = "https://www.ons.gov.uk/generator?format=csv&uri=" + uri
        try:
            save(f"ons_{code}.csv", get(url), url, "ONS " + code + ": " + note)
        except Exception as e:  # noqa
            print("  FAIL", code, e)
    (RAW / "_download_log.json").write_text(json.dumps(LOG, indent=1), encoding="utf-8")
