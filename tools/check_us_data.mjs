import { US_Q } from '../src/data/us-quarterly.js';
const d = US_Q.dates;
console.log('dates', d.length, d[0], d[d.length - 1]);
const at = (k, q) => US_Q.series[k][d.indexOf(q)];
for (const [k, v] of Object.entries(US_Q.series)) {
  const nn = v.map((x, i) => [x, i]).filter(([x]) => x !== null);
  const vals = nn.map(([x]) => x);
  const gaps = v.slice(nn[0][1]).filter(x => x === null).length;
  console.log(k.padEnd(18), 'len', v.length, 'first', d[nn[0][1]], 'min', Math.min(...vals), 'max', Math.max(...vals), 'internalNulls', gaps);
}
const peak = (k, a, b) => { let bi = -1, bv = -1e9; for (let i = d.indexOf(a); i <= d.indexOf(b); i++) if (US_Q.series[k][i] > bv) { bv = US_Q.series[k][i]; bi = i; } return [d[bi], bv]; };
const trough = (k, a, b) => { let bi = -1, bv = 1e9; for (let i = d.indexOf(a); i <= d.indexOf(b); i++) if (US_Q.series[k][i] < bv) { bv = US_Q.series[k][i]; bi = i; } return [d[bi], bv]; };
console.log('FF 2007Q3', at('policyRate', '2007Q3'), '2009Q2', at('policyRate', '2009Q2'));
const hp = peak('houseIndex', '2003Q1', '2010Q4'), ht = trough('houseIndex', '2006Q3', '2014Q4');
console.log('house peak', hp, 'trough', ht, 'drop', (ht[1] / hp[1] - 1).toFixed(3));
console.log('CPI yoy 2022 max', peak('cpiYoY', '2021Q1', '2023Q4'), 'unemp peak 2009-10', peak('unemployment', '2009Q1', '2010Q4'), '2020', peak('unemployment', '2020Q1', '2021Q4'));
console.log('mortgage 2006Q2', at('mortgageRate', '2006Q2'), '2021Q1', at('mortgageRate', '2021Q1'), '2023Q4', at('mortgageRate', '2023Q4'));
console.log('2008Q4 gdpReal yoy', at('gdpRealGrowthYoY', '2008Q4'), '2020Q2', at('gdpRealGrowthYoY', '2020Q2'));
console.log('oil 2008Q3', at('oilPrice', '2008Q3'), '2020Q2', at('oilPrice', '2020Q2'));
console.log('hhDebtGdp 2008Q4', at('hhDebtGdp', '2008Q4'), 'govDebtGdp 2020Q2', at('govDebtGdp', '2020Q2'), 'hhDsr 2007Q4', at('hhDsr', '2007Q4'));
