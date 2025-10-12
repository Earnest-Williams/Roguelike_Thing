import { strict as assert } from "node:assert";
import { Actor } from "../src/combat/actor.js";
import { resolveAttack } from "../src/combat/resolve.js";

(function testEchoAndHaste() {
  const attacker = new Actor({
    id: "attacker",
    baseStats: {
      str: 10,
      dex: 10,
      int: 10,
      vit: 10,
      maxHP: 20,
      maxStamina: 10,
      maxMana: 5,
      baseSpeed: 1,
    },
  });
  const defender = new Actor({
    id: "defender",
    baseStats: {
      str: 5,
      dex: 5,
      int: 5,
      vit: 5,
      maxHP: 10,
      maxStamina: 5,
      maxMana: 5,
      baseSpeed: 1,
    },
  });

  attacker.modCache.temporal.echo = { chance: 1, percent: 0.5 };
  attacker.modCache.temporal.onKillHaste = { duration: 2, potency: 1 };

  const { echo } = resolveAttack({
    attacker,
    defender,
    packets: [{ type: "physical", amount: 10 }],
    rng: () => 0,
  });

  assert(echo && echo.total === 5, "echo should repeat half of the damage");
  assert.equal(defender.res.hp, 0, "defender should be reduced to zero hp");
  const hasHaste = attacker.statuses.some((s) => s.id === "haste");
  assert.equal(hasHaste, true, "haste should be applied on kill");
  console.log("✓ temporal echo + on-kill haste");
})();
