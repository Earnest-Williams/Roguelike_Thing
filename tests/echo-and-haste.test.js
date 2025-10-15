import assert from "node:assert/strict";
import { DAMAGE_TYPE } from "../js/constants.js";
import { Actor } from "../dist/src/combat/actor.js";
import { resolveAttack } from "../dist/src/combat/resolve.js";

(function testEchoAndHasteFinalize() {
  const attacker = new Actor({
    id: "echoer",
    baseStats: {
      str: 8,
      dex: 8,
      int: 8,
      vit: 8,
      con: 8,
      will: 8,
      luck: 8,
      maxHP: 20,
      maxStamina: 10,
      maxMana: 5,
      baseSpeed: 1,
    },
  });
  const defender = new Actor({
    id: "dummy",
    baseStats: {
      str: 4,
      dex: 4,
      int: 4,
      vit: 4,
      con: 4,
      will: 4,
      luck: 4,
      maxHP: 6,
      maxStamina: 4,
      maxMana: 2,
      baseSpeed: 1,
    },
  });
  attacker.modCache.temporal.echo = { chance: 1, fraction: 0.5 };
  attacker.modCache.temporal.onKillHaste = { stacks: 2, duration: 2 };

  const result = resolveAttack({
    attacker,
    defender,
    packets: [{ type: DAMAGE_TYPE.SLASH, amount: 6 }],
  });

  assert.equal(defender.res.hp, 0, "defender should be killed by attack + echo");
  const haste = attacker.statuses.find((s) => s.id === "haste");
  assert.ok(haste, "haste should be applied on kill");
  assert.ok(result.echo?.triggered, "echo should trigger once");
  assert.ok(!result.echo?.result?.echo, "echo should not chain recursively");
  console.log("✓ finalizeAttack applies haste and echo via temporal hooks");
})();
