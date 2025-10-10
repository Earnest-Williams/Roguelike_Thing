// tests/phase4.bands.test.js
import { simulate } from "../src/sim/sim.js";
import { BANDS } from "../src/sim/balance-bands.js";
function assert(c,m){ if(!c) throw new Error(m); }

const r1 = simulate({ a:"brigand", b:"dummy", N:60, seed:42 });
assert(r1.turnsAvg >= BANDS.brigand_vs_dummy_ttk.min &&
       r1.turnsAvg <= BANDS.brigand_vs_dummy_ttk.max, "brigand vs dummy within band");

const r2 = simulate({ a:"pyromancer", b:"dummy", N:60, seed:99 });
assert(r2.turnsAvg >= BANDS.pyro_vs_dummy_ttk.min &&
       r2.turnsAvg <= BANDS.pyro_vs_dummy_ttk.max, "pyro vs dummy within band");
