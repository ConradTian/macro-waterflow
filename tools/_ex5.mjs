import { mk } from './_explore.mjs';
const pc = x => (x * 100).toFixed(1) + '%';
const f = (x, d=1) => (+x).toFixed(d);
function go(label, setup, n, opts={}, rules={}) {
  const s = mk(opts); for (const [k,v] of Object.entries(rules)) s.setRuleEnabled(k,v); setup && setup(s);
  console.log('###', label);
  const sn0=s.snapshot(); console.log(' q0 H',f(sn0.assets.housing.price),'M',f(sn0.money.M));
  for (let i=0;i<n;i++){ s.step(); const o=s.snapshot(); console.log(' q'+(i+1),'H',f(o.assets.housing.price),'appr',f(o.bank.approval,2),'newL',f(o.flows.newLoans),'rep',f(o.flows.principalRepay),'M',f(o.money.M),'bad',pc(o.bank.badLoanRate),'cap',pc(o.bank.capitalRatio),'lvr',pc(o.household.lvr),'dsr',pc(o.household.dsr),'u',pc(o.macro.unemployment),'pol',pc(o.rates.policy),'infl',pc(o.macro.inflation),'| '+o.ledger.filter(e=>!/用户接管/.test(e.rule)).map(e=>e.player+':'+e.rule.slice(0,14)).join(' | ')); }
}
go('loosen: 2 buys w/ loans', s=>{ for(let i=0;i<2;i++){ s.townAction({type:'loan',who:'小王',amount:40}); s.townAction({type:'buyHouse',who:'小王',from:'老李'});} }, 6);
go('tighten: rate 9%', s=>s.setValve('policyRate',0.09), 8);
go('CB taylor: fiscal 8% no real path', s=>{ s.setRuleEnabled('cb_real_path', false); s.setValve('fiscalInjection',0.08);}, 8);
go('CB taylor: nothing no real path', s=>{ s.setRuleEnabled('cb_real_path', false);}, 4);
go('hh deleverage: saving', s=>s.townAction({type:'saving',adj:0.06}), 8);
