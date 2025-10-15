// tests/attunement.test.js
import { strict as assert } from "node:assert";
import { Actor } from "../dist/src/combat/actor.js";
import { gainAttunement, decayAttunements } from "../dist/src/combat/attunement.js";

(function testGainAndDecay() {
  const actor = new Actor({
    id: "attune",
    baseStats: {
      str: 1,
      dex: 1,
      int: 1,
      vit: 1,
      con: 1,
      will: 1,
      luck: 1,
      maxHP: 10,
      maxStamina: 5,
      maxMana: 5,
      baseSpeed: 1,
    },
  });

  actor.modCache.attunementRules = {
    fire: { onUseGain: 2, maxStacks: 5, decayPerTurn: 1 },
    cold: { onUseGain: 1, maxStacks: 3, decayPerTurn: 2 },
  };

  gainAttunement(actor, "fire");
  gainAttunement(actor, "fire");
  gainAttunement(actor, "cold");

  assert.equal(actor.attunement.stacks.fire, 4);
  assert.equal(actor.attunement.stacks.cold, 1);

  decayAttunements(actor);
  assert.equal(actor.attunement.stacks.fire, 3);
  assert.ok(!("cold" in actor.attunement.stacks));

  console.log("✓ attunement gain/decay");
})();
