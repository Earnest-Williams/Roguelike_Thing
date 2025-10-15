// tests/phase4.sim.test.js
// @ts-nocheck
import { simulate } from "../dist/src/sim/sim.js";
import { MOB_TEMPLATES } from "../dist/src/content/mobs.js";

function assert(c,m){ if(!c) throw new Error(m); }

const baseline = simulate({ a:"brigand", b:"dummy", N:40, seed:20251010 });
console.log(baseline);
assert(baseline.turnsAvg >= 4 && baseline.turnsAvg <= 10, "TTK band 4..10 turns for brigand vs dummy");

const dummyTemplate = MOB_TEMPLATES["dummy"];
const originalBaseStats = { ...dummyTemplate.baseStats };
dummyTemplate.baseStats = { ...dummyTemplate.baseStats, maxHP: 4, vit: 1 };

try {
  const lethal = simulate({ a: "brigand", b: "dummy", N: 10, seed: 20251011 });
  console.log(lethal);
  assert(lethal.turnsAvg <= 0.6, "defender should not act after lethal blow");
  assert(lethal.dpsAvg > 0, "dps should remain finite when defender dies mid-round");
} finally {
  dummyTemplate.baseStats = originalBaseStats;
}

const rerun = simulate({ a:"brigand", b:"dummy", N:40, seed:20251010 });
console.log(rerun);
assert(rerun.turnsAvg >= 4 && rerun.turnsAvg <= 10, "TTK band stable after lethal scenario");
