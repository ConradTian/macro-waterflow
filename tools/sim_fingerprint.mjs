// scratch (GBR round): dump full sim.history() JSON for USA / AUS (history + free) + town, to diff before/after an engine change.
// node tools/sim_fingerprint.mjs <outDir>
import { createSim } from '../src/engine/sim.js';
import { US_Q } from '../src/data/us-quarterly.js';
import { AUS_Q } from '../src/data/countries/aus-quarterly.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const out = process.argv[2] || 'gb_fp';
mkdirSync(out, { recursive: true });
const run = (data, mode, country, scenario) => { const s = createSim({ data, mode, country, scenario }); while (!s.done) s.step(); return JSON.stringify(s.history()); };
const cases = [['USA', US_Q, 'history'], ['USA', US_Q, 'free'], ['AUS', AUS_Q, 'history'], ['AUS', AUS_Q, 'free']];
for (const [c, d, m] of cases) {
  const j = run(d, m, c);
  writeFileSync(`${out}/${c}_${m}.json`, j);
  console.log(c, m, j.length, createHash('sha256').update(j).digest('hex').slice(0, 16));
}
const tj = run(null, 'history', 'USA', 'town');
writeFileSync(`${out}/TOWN_history.json`, tj);
console.log('TOWN history', tj.length, createHash('sha256').update(tj).digest('hex').slice(0, 16));
