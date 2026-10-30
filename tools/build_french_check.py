# Build src/data/french-check.js: real US annual returns (Kenneth French data library) for the three read-only stock
# sub-indices of src/data/sub-index.js, to check them against reality (tools/check_lesson_investor.mjs).
#
# Inputs (downloaded 2026-10-30, untrusted data, read straight from the zip, never extracted or executed):
#   data_src/french/10_Industry_Portfolios_CSV.zip       section "Average Value Weighted Returns -- Annual"
#   data_src/french/Portfolios_Formed_on_BE-ME_CSV.zip   section "Value Weight Returns -- Annual from January to December"
# from https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/
#
# Mapping (equal-weight mix of value-weighted portfolios, annual Jan-Dec total returns in %):
#   稳股   stable   = mean(Utils, NoDur, Hlth)
#   周期股 cyclical = mean(Durbl, Manuf, Enrgy)        (alt: + HiTec, reported only)
#   成长股 growth   = BE/ME "Lo 30" (the low-B/M third)
# Years: 1995-2021 only (the check never uses 2022+).
#
# Run: %USERPROFILE%\.venvs\dalio432\Scripts\python.exe -I tools/build_french_check.py
import io, json, os, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'data_src', 'french')
OUT = os.path.join(ROOT, 'src', 'data', 'french-check.js')
Y0, Y1 = 1995, 2021


def read_section(zpath, title):
    """Return {year: {col: pct}} for one annual section of a French CSV (in a zip with exactly one .csv)."""
    with zipfile.ZipFile(zpath) as z:
        names = [n for n in z.namelist() if n.lower().endswith('.csv') and '/' not in n and '..' not in n]
        if len(names) != 1:
            sys.exit(f'{zpath}: expected one csv, got {z.namelist()}')
        info = z.getinfo(names[0])
        if info.file_size > 5_000_000:
            sys.exit(f'{zpath}: csv too large ({info.file_size})')
        lines = z.read(names[0]).decode('latin-1').splitlines()
    i = next((k for k, l in enumerate(lines) if l.strip() == title), None)
    if i is None:
        sys.exit(f'{zpath}: section {title!r} not found')
    head = [h.strip() for h in lines[i + 1].split(',')]
    if head[0] != '':
        sys.exit(f'{zpath}: unexpected header {head}')
    out = {}
    for l in lines[i + 2:]:
        cells = [c.strip() for c in l.split(',')]
        if not cells[0].isdigit():
            break                                         # blank line = end of section
        if len(cells[0]) != 4 or len(cells) != len(head):
            sys.exit(f'{zpath}: bad row {l!r}')
        y = int(cells[0])
        if not (Y0 <= y <= Y1):
            continue                                      # only 1995-2021 is read (older years have -99.99 gaps)
        row = {}
        for h, c in zip(head[1:], cells[1:]):
            v = float(c)
            if h != '<= 0' and (v <= -99.99 or not (-100 < v < 1000)):
                sys.exit(f'{zpath}: missing/implausible {h} {y}: {c}')
            row[h] = v
        out[y] = row
    return out


ind = read_section(os.path.join(SRC, '10_Industry_Portfolios_CSV.zip'), 'Average Value Weighted Returns -- Annual')
bm = read_section(os.path.join(SRC, 'Portfolios_Formed_on_BE-ME_CSV.zip'), 'Value Weight Returns -- Annual from January to December')
years = list(range(Y0, Y1 + 1))
for y in years:
    if y not in ind or y not in bm:
        sys.exit(f'year {y} missing')

r4 = lambda v: round(v / 100, 4)
mean = lambda xs: sum(xs) / len(xs)
IND = ['NoDur', 'Durbl', 'Manuf', 'Enrgy', 'HiTec', 'Telcm', 'Shops', 'Hlth', 'Utils', 'Other']
data = {
    'years': years,
    'styles': {
        'stable': [r4(mean([ind[y][k] for k in ('Utils', 'NoDur', 'Hlth')])) for y in years],
        'cyclical': [r4(mean([ind[y][k] for k in ('Durbl', 'Manuf', 'Enrgy')])) for y in years],
        'growth': [r4(bm[y]['Lo 30']) for y in years],
    },
    'industries': {k: [r4(ind[y][k]) for y in years] for k in IND},
    'bm': {'Lo 30': [r4(bm[y]['Lo 30']) for y in years], 'Hi 30': [r4(bm[y]['Hi 30']) for y in years]},
}

js = f"""// Real US annual returns for the read-only stock sub-indices (src/data/sub-index.js), 1995-2021 only (never 2022+).
// Built by tools/build_french_check.py from the Kenneth French data library (downloaded 2026-10-30, data_src/french/):
//   10 industry portfolios, value-weighted, annual Jan-Dec total returns; portfolios formed on BE/ME, value-weighted.
// Mapping: 稳股 stable = mean(Utils, NoDur, Hlth); 周期股 cyclical = mean(Durbl, Manuf, Enrgy); 成长股 growth = BE/ME Lo 30.
// Returns are fractions (0.1 = +10%). Used by tools/check_lesson_investor.mjs (model vs real: correlation of annual changes,
// volatility ordering). Nothing in the app imports this file.
export const FRENCH = {json.dumps(data, ensure_ascii=False)};

// What the check found (US history sim, Q4-to-Q4 changes 1996-2021 vs the real returns; vol = st. dev. of annual log changes).
// Recomputed and compared by tools/check_lesson_investor.mjs.
export const FRENCH_RESULT = __RESULT__;
"""
old = None
if os.path.exists(OUT):
    with open(OUT, encoding='utf-8') as f:
        t = f.read()
    k = t.find('export const FRENCH_RESULT = ')
    if k >= 0:
        old = t[k + len('export const FRENCH_RESULT = '):].strip().rstrip(';')   # keep the hand-copied result block
js = js.replace('__RESULT__', old or 'null')
with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
    f.write(js)
print('wrote', OUT)
for k, v in data['styles'].items():
    print(k, ' '.join(f'{y}:{x:+.2f}' for y, x in zip(years, v)))
