import { createSim } from '../src/engine/sim.js';
const f = (x, d = 1) => (x == null ? '-' : (+x).toFixed(d));
const pc = x => (x * 100).toFixed(1) + '%';
export function mk(opts = {}) { return createSim({ scenario: 'town', ...opts }); }
export function row(s) {
  return `${s.date} M${f(s.money.M)} H${f(s.assets.housing.price)} E${f(s.assets.equity.price)} B${f(s.assets.bond.price)} G${f(s.assets.gold.price)} P${f(s.macro.priceLevel)} inf${pc(s.macro.inflation)} u${pc(s.macro.unemployment)} inc${f(s.household.income)} sav${pc(s.household.savingRate)} dsr${pc(s.household.dsr)} lvr${pc(s.household.lvr)} pol${pc(s.rates.policy)} mE${pc(s.rates.mortgageEff)} appr${f(s.bank.approval,2)} press${pc(s.macro.demandPressure)} cap${f(s.macro.capacityPotential)} newL${f(s.flows.newLoans)} rep${f(s.flows.principalRepay)} capex${f(s.flows.toCapex)} cash${f(s.flows.toCash)} fin${f(s.flows.toFinancial)} hou${f(s.flows.toHousing)} bond${f(s.flows.toBond)} gold${f(s.flows.toGold)} fisc${f(s.flows.fiscalInjection)} qe${f(s.flows.qe)} sales${f(s.town.shop.sales)} rules[${s.ledger.map(e => e.rule).join('|')}]`;
}
export function run(label, setup, n = 8, opts = {}) {
  const s = mk(opts); console.log('--', label, JSON.stringify(opts)); console.log(row(s.snapshot()));
  setup && setup(s);
  for (let i = 0; i < n; i++) { s.step(); console.log(row(s.snapshot())); }
  return s;
}
