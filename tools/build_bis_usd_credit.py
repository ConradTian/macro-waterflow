"""BIS Global Liquidity Indicators -> USD credit to non-banks per borrower country (the map's 地下连地下 layer).

Input (untrusted download, read as data only): data_src/bis/gli_all.csv
  https://stats.bis.org/api/v1/data/WS_GLI/all?format=csv&startPeriod=2000
Output: data_src/bis/usd_credit_nonbanks.json  {iso: {year: USD bn (Q4, or the last quarter of the year)}}

Run: %USERPROFILE%\\.venvs\\dalio432\\Scripts\\python.exe -I tools/build_bis_usd_credit.py <repo root>
Series: CURR_DENOM=USD, BORROWERS_SECTOR=N (non-banks), LENDERS_SECTOR=A (all), L_POS_TYPE=I (all instruments: loans + bonds),
UNIT_MEASURE=USD (USD bn); *_chg1y = % change vs a year ago (BIS unit 771). Only reads the columns it needs; never evaluates any field.
"""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()
SRC = ROOT / 'data_src' / 'bis' / 'gli_all.csv'
OUT = ROOT / 'data_src' / 'bis' / 'usd_credit_nonbanks.json'
CTY = {'AU': 'AUS', 'JP': 'JPN', 'CN': 'CHN', 'GB': 'GBR', 'XM': 'EA', 'US': 'USA', '3P': 'WORLD_EX_US'}

def main():
    seen = {}
    data = {}
    with SRC.open(encoding='utf-8', newline='') as f:
        for r in csv.DictReader(f):
            if r.get('CURR_DENOM') != 'USD' or r.get('BORROWERS_SECTOR') != 'N':
                continue
            key = (r['BORROWERS_CTY'], r['LENDERS_SECTOR'], r['L_POS_TYPE'], r['L_INSTR'], r['UNIT_MEASURE'])
            seen[key] = r.get('TITLE', '')
            if key[1] != 'A' or key[2] != 'I' or key[4] not in ('USD', '771') or key[0] not in CTY:
                continue
            try:
                v = float(r['OBS_VALUE'])
            except (TypeError, ValueError):
                continue
            mult = int(r.get('UNIT_MULT') or 0) if key[4] == 'USD' else 9
            per = r['TIME_PERIOD']  # 2000-Q1
            y, q = per[:4], per[-1]
            iso = CTY[key[0]]
            inst = key[3] + ('' if key[4] == 'USD' else '_chg1y')
            data.setdefault((iso, inst), {})
            prev = data[(iso, inst)].get(y)
            if prev is None or q >= prev[0]:
                data[(iso, inst)][y] = (q, v * 10 ** mult / 1e9)
    if '--list' in sys.argv:
        for k, t in sorted(seen.items()):
            print(k, t[:90])
    out = {}
    for (iso, inst), ys in data.items():
        out.setdefault(iso, {})[inst] = {y: round(v, 1) for y, (q, v) in sorted(ys.items())}
    OUT.write_text(json.dumps(out, indent=1), encoding='utf-8')
    for iso, d in out.items():
        for inst, ys in d.items():
            last = list(ys.items())[-3:]
            print(iso, inst, len(ys), last)

if __name__ == '__main__':
    main()
