import { mk } from './_explore.mjs';
const pc = x => (x * 100).toFixed(1) + '%';
const f = (x, d=1) => (+x).toFixed(d);
function seq(setup, n, opts={}, rules={}) {
  const s = mk(opts); for (const [k,v] of Object.entries(rules)) s.setRuleEnabled(k,v); setup && setup(s); const out=[];
  for (let i=0;i<n;i++){ s.step(); out.push(s.snapshot()); }
  return {s,out};
}
// C government
for (const [lab, rules] of [['stim on',{}],['stim off',{gov_stimulus:false}]]) {
  const {out} = seq(s=>s.townAction({type:'saving',adj:0.05}), 12, {}, rules);
  console.log(lab, 'u peak', pc(Math.max(...out.map(o=>o.macro.unemployment))), 'debtGdp end', pc(out[11].gov.debtGdp), 'start', pc(mk().snapshot().gov.debtGdp), 'M end', f(out[11].money.M), 'fisc flows', out.map(o=>f(o.flows.fiscalInjection)).join(' '));
}
// gov valve fiscalInjection 0.10 in neutral
{
 const {out} = seq(s=>s.setValve('fiscalInjection',0.10), 10);
 out.forEach((o,i)=>console.log(' fiscal10 q'+(i+1),'fisc',f(o.flows.fiscalInjection),'press',pc(o.macro.demandPressure),'infl',pc(o.macro.inflation),'u',pc(o.macro.unemployment),'debtGdp',pc(o.gov.debtGdp),'deficitGdp?',pc(o.gov.deficit/o.macro.gdpNominal),'gov10y',pc(o.rates.gov10y),'M',f(o.money.M),'i2t',pc(o.gov.interestToTax),'rules',o.ledger.map(e=>e.rule.slice(0,10)).join('|')));
}
// D foreign
{
 const base = seq(null, 6), boom = seq(s=>s.setValve('capexMult',1.3), 6), fis = seq(s=>s.setValve('fiscalInjection',0.12), 8);
 const nx = (r,i) => { const ss = r.s; return null; };
 // use suggestion at each step
 for (const [lab, setup] of [['base',null],['capex1.3',s=>s.setValve('capexMult',1.3)],['fiscal12%',s=>s.setValve('fiscalInjection',0.12)]]) {
   const s = mk(); setup&&setup(s); const rows=[];
   for (let i=0;i<8;i++){ s.step(); const sg=s.suggestion('foreign'); const sn=s.snapshot(); rows.push(`q${i+1} p${pc(sn.macro.demandPressure)} nx${pc(sg.values.netExportRatio)} infl${pc(sn.macro.inflation)} defGdp${pc(sn.gov.deficit/sn.macro.gdpNominal)} 10y${pc(sn.rates.gov10y)} yTP${pc(sn.rates.gov10y)} ledger:${sn.ledger.filter(e=>e.player==='foreign').map(e=>e.action).join(',')}`); }
   console.log(lab); rows.forEach(r=>console.log('  '+r));
 }
}
// E investor
for (const on of [false,true]) {
  const s = mk(); if (on) s.townAction({type:'riskOff', on:true}); 
  for (let i=0;i<4;i++){ s.step(); const sn=s.snapshot(); const fl=sn.flows; const tot=fl.toCash+fl.toFinancial+fl.toHousing; console.log('riskoff',on,'q'+(i+1),'cash%',pc(fl.toCash/tot),'fin%',pc(fl.toFinancial/tot),'house%',pc(fl.toHousing/tot),'bond/fin',pc(fl.toBond/fl.toFinancial),'eq/fin',pc(fl.toEquity/fl.toFinancial),'gold/fin',pc(fl.toGold/fl.toFinancial),'B px',f(sn.assets.bond.price),'E',f(sn.assets.equity.price),'H',f(sn.assets.housing.price),'ledger',sn.ledger.map(e=>e.rule.slice(0,8)).join('|'), 'alloc', JSON.stringify(sn.extra.alloc)); }
}
