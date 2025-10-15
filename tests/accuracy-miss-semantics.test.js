import assert from "node:assert/strict";
import { createActor, resolveAttack, setSeed, finalAPForAction, spendAP } from "./_helpers.js";

(function testMissConsumesAP() {
  setSeed(42);
  const attacker = createActor({ id: "accuracy_atk", accuracy: 0, ap: 100 });
  const defender = createActor({ id: "accuracy_def" });

  const beforeAP = attacker.ap;
  const { costAP } = finalAPForAction(attacker, 40, ["attack"]);
  const spent = spendAP(attacker, costAP);
  assert.ok(spent, "AP should be spent before resolving attack");

  const result = resolveAttack(attacker, defender, {
    prePackets: [{ type: "slash", amount: 10 }],
    costAP,
  });

  assert.equal(result.hit, false, "attack with zero accuracy should miss");
  assert.equal(result.packets.length, 0, "no packets should be produced on miss");
  assert.equal(attacker.ap, beforeAP - costAP, "AP spent prior to attack should remain deducted");
  const attuneStacks = Object.keys(attacker.attunement?.stacks || {}).length;
  assert.equal(attuneStacks, 0, "miss should not grant attunement stacks");

  console.log("✓ misses consume AP and produce no packets or attunement");
})();
