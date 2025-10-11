import { strict as assert } from "node:assert";
import { foldMods } from "../src/combat/mod-folding.js";
import { resolveAttack } from "../src/combat/attack.js";
import { attachLogs } from "../src/combat/debug-log.js";

function mkActor(partial = {}) {
  return attachLogs({
    id: partial.id || "A",
    name: partial.name || "A",
    hp: partial.hp ?? 100,
    statuses: [],
    attunements: {},
    modCache: partial.modCache || {
      brands: [],
      immunities: new Set(),
      offense: { brands: [], brandAdds: [], affinities: {}, conversions: [] },
      defense: { resists: {}, immunities: new Set() },
      temporal: {},
      attunement: {}
    },
    ...partial
  });
}

(function testFoldMods() {
  const itemA = { brands: [{ type: "fire", flat: 3 }], resists: { fire: 0.1 } };
  const itemB = { brands: [{ type: "fire", flat: 2 }], resists: { cold: 0.2 } };
  const out = foldMods([itemA, itemB]);
  assert.equal(out.offense.brands.length, 2);
  assert.equal(out.defense.resists.fire, 0.1);
  assert.equal(out.defense.resists.cold, 0.2);
  console.log("✓ foldMods basic");
})();

(function testResolveOrder() {
  const atk = mkActor({ id: "att" });
  const def = mkActor({
    id: "def",
    modCache: {
      brands: [],
      immunities: new Set(),
      offense: { brands: [], brandAdds: [], affinities: {}, conversions: [] },
      defense: { resists: { fire: 0.25 }, immunities: new Set() },
      temporal: {},
      attunement: {}
    }
  });
  const ctx = {
    attacker: atk,
    defender: def,
    physicalBase: 20,
    conversions: [{ to: "fire", percent: 1 }]
  };
  const result = resolveAttack(ctx);
  assert.ok(result.breakdown, "breakdown should exist");
  assert.equal(result.breakdown.steps.length >= 3, true, "breakdown should record phases");
  assert.equal(result.totalDamage, 15);
  console.log("✓ resolveAttack order/resist");
})();
