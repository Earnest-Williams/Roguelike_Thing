import assert from "node:assert/strict";
import { finalAPForAction } from "../src/combat/time.js";
import { Actor } from "../src/combat/actor.js";

(function testApFormula() {
  const actor = new Actor({
    id: "tester",
    baseStats: { str: 5, dex: 5, int: 5, vit: 5, maxHP: 10, maxStamina: 10, maxMana: 5, baseSpeed: 1 },
  });
  actor.statusDerived = {
    moveAPDelta: 1,
    actionSpeedPct: -0.2,
  };
  actor.modCache.temporal.baseActionAPDelta = 1;
  actor.modCache.temporal.actionSpeedPct = 0.1;
  const { costAP } = finalAPForAction(actor, 10, ["move"]);
  assert.equal(costAP, 11, "AP cost should include statusDerived + temporal adjustments");
  console.log("✓ finalAPForAction applies statusDerived + temporal modifiers");
})();
