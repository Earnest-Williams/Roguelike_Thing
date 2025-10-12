import assert from "node:assert/strict";
import { Actor } from "../src/combat/actor.js";
import { finalCooldown } from "../src/combat/time.js";

(function testCooldownTag() {
  const a = new Actor({ id: "x", baseStats: { str: 1, dex: 1, int: 1, vit: 1, maxHP: 5, maxStamina: 5, maxMana: 5, baseSpeed: 1 } });
  a.modCache.temporal.cooldownPct = -0.25;
  const cd = finalCooldown(a, 8);
  assert.equal(cd, 6);
})();
