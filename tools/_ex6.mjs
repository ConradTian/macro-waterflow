import { mk } from './_explore.mjs';
const s = mk(); const p = x => JSON.stringify(x);
let sn = s.snapshot(); console.log('iou', p(sn.iou), 'M', sn.money.M, 'budget', p(sn.budget), 'house', sn.assets.housing.price, sn.assets.housing.level, 'priceLevel', sn.macro.priceLevel);
const act = a => { const r = s.townAction(a); const n = s.snapshot(); console.log(a.type, r.ok, r.reason||'', '|', r.entry && r.entry.action, '| M', n.money.M, 'iou', n.iou.bankTotal, 'H', n.assets.housing.price.toFixed(2), 'lvl', n.assets.housing.level.toFixed(1), 'budget', p(n.budget.pumpedIn), p(n.budget.drainedOut), n.budget.net, 'pipes', r.entry&&r.entry.pipes); return n; };
act({type:'loan',who:'小王',amount:50});
act({type:'repay',who:'小王',amount:10});
console.log(p(s.snapshot().town.households[0]));
act({type:'buyHouse',who:'小王',from:'老李'});
console.log(p(s.snapshot().town.households.slice(0,2)));
act({type:'spend',who:'小王',amount:5});
act({type:'payInterest',who:'大刘',amount:2});
console.log('bank pocket', s.snapshot().town.bank.pocket, 'shop', s.snapshot().town.shop.deposit);
for (let i=0;i<2;i++){ s.step(); }
sn=s.snapshot(); console.log('after 2q', sn.date, 'M', sn.money.M.toFixed(1), 'H', sn.assets.housing.price.toFixed(1), 'P', sn.macro.priceLevel.toFixed(1), p(sn.budget.pumpedIn), p(sn.budget.drainedOut), sn.budget.net.toFixed(2), 'M_before', sn.budget.M_before.toFixed(2), 'M_after', sn.budget.M_after.toFixed(2));
