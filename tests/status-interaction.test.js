// tests/status-interaction.test.js
// @ts-check
import { applyOneStatusAttempt } from "../src/combat/status.js";

function mkActor() {
  return {
    id: "test",
    statuses: [],
    modCache: {
      status: {
        inflictBonus: Object.create(null),
        inflictDurMult: Object.create(null),
        resistBonus: Object.create(null),
        recvDurMult: Object.create(null),
        buffDurMult: 1,
        freeActionIgnore: new Set(),
        freeActionCooldown: 0,
        freeActionPurge: false,
      },
    },
    freeAction: { ready: true, cooldownRemaining: 0 },
    logs: { attack: { messages: [] } },
  };
}

(function testBonusesAndFreeAction() {
  const attacker = mkActor();
  const defender = mkActor();

  attacker.modCache.status.inflictBonus.burning = 0.2;
  attacker.modCache.status.inflictDurMult.burning = 1; // +100%

  defender.modCache.status.resistBonus.burning = -0.1;
  defender.modCache.status.recvDurMult.burning = -0.5; // -50%
  defender.modCache.status.freeActionIgnore.add("burning");
  defender.modCache.status.freeActionCooldown = 2;
  defender.modCache.status.freeActionPurge = true;
  defender.statuses.push({ id: "burning", stacks: 1, potency: 1, nextTickAt: 0, endsAt: 3 });

  const originalRandom = Math.random;
  Math.random = () => 0; // deterministic success

  const attempt = { id: "burning", baseChance: 0.8, baseDuration: 2 };
  const res1 = applyOneStatusAttempt({ attacker, defender, attempt, turn: 1 });
  assert(res1 && res1.ignored, "First burn should be ignored by free action");
  assert(defender.freeAction.ready === false, "Free action should be consumed");
  assert(defender.freeAction.cooldownRemaining === 2, "Cooldown should be applied");
  assert(defender.statuses.length === 0, "Existing burn should be purged on ignore");

  const res2 = applyOneStatusAttempt({ attacker, defender, attempt, turn: 2 });
  assert(res2 && !res2.ignored, "Second burn should apply while free action on cooldown");
  assert(defender.statuses.length === 1, "Burn should be added");
  const applied = defender.statuses[0];
  assert(applied.endsAt === defender.turn + 2, "Duration modifiers should resolve to 2 turns");

  Math.random = originalRandom;
  console.log("✓ status interaction bonuses and free action");
})();

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
