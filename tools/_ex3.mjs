import { mk, row } from './_explore.mjs';
const pc = x => (x * 100).toFixed(1) + '%';
const f = (x, d=1) => (+x).toFixed(d);
function seq(label, setup, n, opts={}, probe) {
  const s = mk(opts); setup && setup(s); const out=[];
  for (let i=0;i<n;i++){ s.step(); out.push(s.snapshot()); }
  return out;
}
// A firm delays on
for (const d of [false, true]) {
  const base = seq('b', null, 10, {delays:d}), cx = seq('c', s=>s.setValve('capexMult',1.3), 10, {delays:d});
  console.log('firm delays', d);
  base.forEach((b,i)=>console.log(' q'+(i+1), 'pressure', pc(cx[i].macro.demandPressure), 'vs', pc(b.macro.demandPressure), ' cap +', f(cx[i].macro.capacityPotential-b.macro.capacityPotential,2), ' infl', pc(cx[i].macro.inflation), pc(b.macro.inflation), ' capexflow', f(cx[i].flows.toCapex), f(b.flows.toCapex), 'inc', f(cx[i].household.income), f(b.household.income)));
}
// B thrift
{
  const base = seq('b', null, 10), th = seq('t', s=>s.townAction({type:'saving',adj:0.05}), 10);
  console.log('thrift (rules on)');
  base.forEach((b,i)=>console.log(' q'+(i+1),'inc',f(th[i].household.income),f(b.household.income),'sales',f(th[i].town.shop.sales),f(b.town.shop.sales),'u',pc(th[i].macro.unemployment),pc(b.macro.unemployment),'sav',pc(th[i].household.savingRate),'fisc',f(th[i].flows.fiscalInjection),'rules',th[i].ledger.map(e=>e.rule.slice(0,12)).join('|')));
}
