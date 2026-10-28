import { createSim } from '../src/engine/sim.js';
import { US_Q } from '../src/data/us-quarterly.js';
const s = createSim({ data: US_Q, mode: 'history' }); while (s.t < 4*16+3) s.step();
const h = s.history();
for (let t = 4*12; t <= 4*16+3; t++) console.log(US_Q.dates[t], 'fiscalAdj', (h[t].extra.fiscalAdj*100).toFixed(1), 'inject', h[t].flows.fiscalInjection.toFixed(0), 'debt', (h[t].gov.debtGdp*100).toFixed(1), 'u', (h[t].macro.unemployment*100).toFixed(1));
