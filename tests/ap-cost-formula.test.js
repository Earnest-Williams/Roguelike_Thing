import assert from "node:assert/strict";
import { finalAPForAction } from "../src/combat/time.js";
import { Actor } from "../src/combat/actor.js";

(function testFinalAPIncludesTemporalAndStatus() {
  const actor = new Actor({
    id: "tester",
    baseStats: { maxHP: 10, maxStamina: 10, maxMana: 5, baseSpeed: 1 },
  });
  actor.statusDerived = {
    moveAPDelta: 1,
    actionSpeedPct: -0.2,
  };
  actor.modCache.temporal.baseActionAPDelta = 1;
  actor.modCache.temporal.baseActionAPMult = 1;
  actor.modCache.temporal.actionSpeedPct = 0.1;

  const { costAP } = finalAPForAction(actor, 10, ["move"]);
  assert.equal(costAP, 11, "AP cost should reflect move delta and speed modifiers");
  console.log("✓ finalAPForAction accounts for statusDerived and temporal modifiers");
})();
