// Country labels for the UI (units, names, data sources, tank scales). DOM-free and dependency-free: Node checkers import it too.
//   countryInfo(iso)              -> { iso, name, ccy, ccyName, unitBn, cbName, households, realData, mortNote, tank:{cash,iou}, ... }
//   currentCountry(sim?)          -> ISO of the sim on screen (the town is always 'USA'); without a sim: ?country= of the URL, else 'USA'
//   registerCountryData / countryData   the quarterly data the app booted with (gauge.js and causal-view.js re-run the engine on it)
//   fmtBn(v, iso)                 -> '620 十亿澳元' / '2.10 万亿澳元'
//   localizeText(text, iso)       -> engine / card text with the US-only words swapped for the country's (identity for the USA)
// The USA entry reproduces the old hard-coded texts exactly (十亿美元, 1.2 亿户, 联储), so the US view is unchanged.
// tank = the water-diagram tank scales: cash tank full at M/GDP = tank.cash, IOU box full at (household + firm debt)/GDP = tank.iou.
//   Measured on the model's own full run (history and free mode) with the country's engine parameters, plus ~10% head room.
//   USA 1.4 / 2.4 are the original constants. AUS: M/GDP peaks at 1.74 in history, so 1.9. GBR: measured (see its entry). The others are provisional guesses
//   (their engine calibration is not done yet): re-measure with tools/check_country_ui.mjs when COUNTRY_READY flips.

export const COUNTRY_INFO = {
  USA: {
    name: '美国', ccy: 'USD', ccyName: '美元', unitBn: '十亿美元', cbName: '联储', cbAlias: [],
    households: '1.2 亿户', realData: '美国官方数据（FRED、BEA、BLS 等）',
    mortNote: '美国 30 年固定 φ 小，浮动利率国家冲击来得快。',
    tank: { cash: 1.4, iou: 2.4 },
  },
  AUS: {
    name: '澳洲', ccy: 'AUD', ccyName: '澳元', unitBn: '十亿澳元', cbName: '澳联储', cbAlias: ['澳储行'],
    households: '约 1000 万户', realData: '澳洲官方与国际机构数据（RBA、ABS、BIS、OECD、IMF）',
    mortNote: '澳洲房贷大多是浮动利率，φ 大，冲击来得快（对比：美国 30 年固定，φ 小）。',
    tank: { cash: 2.2, iou: 2.4 },
  },
  GBR: {
    name: '英国', ccy: 'GBP', ccyName: '英镑', unitBn: '十亿英镑', cbName: '英国央行', cbAlias: [],
    households: '约 2800 万户', realData: '英国官方与国际机构数据（BoE、ONS、BIS、OECD）',
    mortNote: '英国房贷多是 2–5 年期固定后重定价，φ 居中：冲击比美国 30 年固定快，比澳洲浮动慢。',
    tank: { cash: 2.2, iou: 1.7 },   // measured 2026-10-30 on COUNTRY_PARAMS.GBR: M/GDP peaks 1.96 (history), debt/GDP 1.53
  },
  JPN: {
    name: '日本', ccy: 'JPY', ccyName: '日元', unitBn: '十亿日元', cbName: '日本央行', cbAlias: [],
    households: '约 5600 万户', realData: '日本官方与国际机构数据（日本银行、内阁府、BIS、OECD）',
    mortNote: '日本房贷多是浮动或短期固定，而且利率长期接近 0，φ 虽大但利率几乎不动。',
    tank: { cash: 2.2, iou: 3.0 },
  },
  EA: {
    name: '欧元区', ccy: 'EUR', ccyName: '欧元', unitBn: '十亿欧元', cbName: '欧央行', cbAlias: [],
    households: '约 1.5 亿户', realData: '欧元区官方与国际机构数据（ECB、Eurostat、BIS、OECD；1999 年前为合成）',
    mortNote: '欧元区各国不同：德法多是长期固定，南欧多是浮动，整体 φ 居中。',
    tank: { cash: 2.0, iou: 2.8 },
  },
  CHN: {
    name: '中国', ccy: 'CNY', ccyName: '人民币', unitBn: '十亿人民币', cbName: '人民银行', cbAlias: [],
    households: '约 4.9 亿户', realData: '中国官方与国际机构数据（人民银行、国家统计局、BIS）',
    mortNote: '中国房贷按 LPR 浮动、每年重定价一次，φ 小。',
    tank: { cash: 2.6, iou: 3.2 },
  },
};

const known = iso => !!COUNTRY_INFO[iso];
export function countryInfo(iso) {
  const k = String(iso || 'USA').toUpperCase();
  const c = COUNTRY_INFO[k] || COUNTRY_INFO.USA;
  return { iso: COUNTRY_INFO[k] ? k : 'USA', ...c };
}

let ACTIVE = null;      // set once by app.js at boot: the country the sim actually runs on (the URL may ask for one that is not ready)
export function setActiveCountry(iso) { ACTIVE = known(String(iso || '').toUpperCase()) ? String(iso).toUpperCase() : null; }

/** ISO of the sim on screen. The town (a lesson scenario) is always the USA. Without a sim: the app's active country, else the URL's ?country= (only for a known country). */
export function currentCountry(sim) {
  if (sim) return sim.scenario === 'town' ? 'USA' : (known(String(sim.country || '').toUpperCase()) ? String(sim.country).toUpperCase() : 'USA');
  if (ACTIVE) return ACTIVE;
  try {
    if (typeof location !== 'undefined') {
      const c = String(new URLSearchParams(location.search).get('country') || '').toUpperCase();
      if (known(c)) return c;
    }
  } catch (e) { /* no location */ }
  return 'USA';
}
export const isCountryView = sim => currentCountry(sim) !== 'USA';

/* the quarterly data the app booted with, per country (app.js registers it; Node tools register their own) */
const DATA = {};
export function registerCountryData(iso, data) { if (iso && data) DATA[String(iso).toUpperCase()] = data; }
export function countryData(iso) { return DATA[String(iso || 'USA').toUpperCase()] || null; }

/** '620 十亿澳元' / '2.10 万亿澳元' (USA: '620 十亿美元' / '2.10 万亿美元', the old text) */
export function fmtBn(v, iso) {
  if (!(typeof v === 'number' && isFinite(v))) return '—';
  const u = countryInfo(iso).ccyName;
  return Math.abs(v) >= 1000 ? (v / 1000).toFixed(2) + ' 万亿' + u : Math.round(v) + ' 十亿' + u;
}
/** the short form used in the concept card's current-value row: '2.10 万亿' / '620 十亿' for the USA (as before), with the currency elsewhere */
export function fmtBnShort(v, iso) {
  if (!(typeof v === 'number' && isFinite(v))) return '—';
  const u = countryInfo(iso).iso === 'USA' ? '' : countryInfo(iso).ccyName;
  return Math.abs(v) >= 1000 ? (v / 1000).toFixed(2) + ' 万亿' + u : v.toFixed(0) + ' 十亿' + u;
}

/** Swap the US-only words in engine / card text for the country's. Identity for the USA (and for any text without those words). */
export function localizeText(text, iso) {
  const s = String(text ?? '');
  const k = String(iso || 'USA').toUpperCase();
  if (k === 'USA' || !known(k)) return s;
  const c = COUNTRY_INFO[k];
  let out = s;
  for (const a of c.cbAlias || []) if (out.includes(a)) out = out.split(a).join(c.cbName);
  out = out.replace(/；美国第一次是 2008-11/g, '');
  out = out.replace(COUNTRY_INFO.USA.mortNote, c.mortNote);
  out = out.replace(/(^|[^澳英日欧央])联储/g, `$1${c.cbName}`);        // 「真实联储路径」 -> 「真实澳联储路径」 (a name that already carries 联储 is left alone)
  out = out.replace(/十亿美元/g, '十亿' + c.ccyName).replace(/万亿美元/g, '万亿' + c.ccyName);
  return out;
}
