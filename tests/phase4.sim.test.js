// tests/phase4.sim.test.js
// @ts-check
import { simulate } from "../src/sim/sim.js";

function assert(c,m){ if(!c) throw new Error(m); }

const out = simulate({ a:"brigand", b:"dummy", N:40, seed:20251010 });
console.log(out);
assert(out.turnsAvg >= 4 && out.turnsAvg <= 10, "TTK band 4..10 turns for brigand vs dummy");
