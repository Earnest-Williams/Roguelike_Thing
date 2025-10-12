import assert from "node:assert/strict";
import { Actor } from "../src/combat/actor.js";
import { resolveAttack } from "../src/combat/resolve.js";

(function testEchoAndOnKillHaste() {
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
      str: 4,
      dex: 4,
      int: 4,
      vit: 4,
      maxHP: 6,
      maxStamina: 5,
      maxMana: 3,
      baseSpeed: 1,
    },
  });

  attacker.modCache.temporal.echo = { chancePct: 1, fraction: 0.3 };
  attacker.modCache.temporal.onKillHaste = { duration: 2 };
  attacker.modCache.resource.onKillGain = { stamina: 4 };
  attacker.resources.stamina = Math.max(0, attacker.resources.stamina - 2);
  if (attacker.resources.pools?.stamina) {
    attacker.resources.pools.stamina.cur = attacker.resources.stamina;
  }
  const staminaBefore = attacker.resources.stamina;

  const outcome = resolveAttack({
    attacker,
    defender,
    packets: [{ type: "physical", amount: 6 }],
  });

  assert.equal(defender.res.hp, 0, "defender should be defeated after attack");
  assert.ok(outcome.echo?.triggered, "echo should trigger when chance is 100%");
  assert.ok(!outcome.echo?.result?.echo, "echo result should not chain recursively");
  assert.equal(outcome.echo?.fraction, 0.3, "echo should carry configured fraction");
  assert.equal(outcome.echo?.allowOnKill, true, "echo should allow on-kill hooks by default");

  const haste = attacker.statuses.find((s) => s.id === "haste");
  assert.ok(haste, "on-kill haste should apply to attacker");
  assert.ok(
    haste.endsAt === Number.POSITIVE_INFINITY || haste.endsAt >= attacker.turn,
    "haste should persist for at least one turn",
  );
  assert.ok(outcome.hasteApplied, "finalizeAttack should surface haste application metadata");
  assert.equal(outcome.hasteApplied.statusId, "haste");
  assert.ok(haste.stacks >= outcome.hasteApplied.stacks);
  assert.ok(haste.potency >= outcome.hasteApplied.potency);
  assert.ok(outcome.hasteApplied.duration >= 1, "haste duration should be at least one turn");

  const staminaAfter = attacker.resources.stamina;
  const expectedStamina = Math.min(attacker.resources.pools.stamina.max, staminaBefore + 4);
  assert.equal(staminaAfter, expectedStamina, "on-kill stamina gain should be applied");
  assert.ok(
    (outcome.resourceGains?.stamina ?? 0) >= expectedStamina - staminaBefore,
    "outcome should report resource delta",
  );
  console.log("✓ resolveAttack applies echo, on-kill haste, and resource gains");
})();
