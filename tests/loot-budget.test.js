import { strict as assert } from "node:assert";
import { applyAffixesBudgeted } from "../dist/src/content/affixes.budgeted.js";
import { AFFIX_POOLS } from "../dist/src/content/affixes.js";

function makeDeterministicRng(seed = 3) {
  let state = seed;
  return () => {
    const x = Math.sin(state++) * 10000;
    return x - Math.floor(x);
  };
}

function findPowerCost(id) {
  for (const pool of [AFFIX_POOLS.prefix, AFFIX_POOLS.suffix]) {
    const entry = pool.find((affix) => affix.id === id);
    if (entry) return Number(entry.powerCost || 0);
  }
  return 0;
}

(function testApplyAffixesBudgeted() {
  const base = { id: "training_blade", name: "Training Blade" };
  const theme = { weights: { affixTags: { fire: 1.3, elemental: 1.1, stamina: 1.2 } } };
  const rng = makeDeterministicRng(11);
  const budget = 9;

  const result = applyAffixesBudgeted(base, budget, theme, rng);

  assert.notEqual(result, base, "Result should be cloned");
  assert.ok(Array.isArray(result.affixes), "Result should track applied affixes");
  const spent = (result.affixes || []).reduce(
    (sum, affix) => sum + findPowerCost(affix.id),
    0,
  );
  assert.ok(spent <= budget, "Affix power cost should not exceed budget");

  if (result.affixes.length > 0) {
    assert.match(result.name, /Training Blade/, "Name should reflect base item");
  }

  console.log("✓ applyAffixesBudgeted respects budget constraints");
})();
