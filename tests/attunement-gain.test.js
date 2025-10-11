// tests/attunement-gain.test.js
import assert from "node:assert/strict";
import { applyOutgoingScaling, noteUseGain, decayPerTurn } from "../src/combat/attunement.js";

function fakeActorWithRule(type, patch = {}) {
  const baseRule = { onUseGain: 1, decayPerTurn: 1, maxStacks: 10, perStack: {} };
  const rule = { ...baseRule, ...patch, perStack: { ...baseRule.perStack, ...(patch.perStack || {}) } };
  return {
    attunement: {
      rules: { [type]: rule },
      stacks: Object.create(null),
    },
    logs: { attack: { push() {} } },
  };
}

(function testOutgoingScalingUsesStacks() {
  const actor = fakeActorWithRule("fire", { perStack: { damagePct: 0.02 }, maxStacks: 10 });
  actor.attunement.stacks.fire = 5;
  const packets = [{ type: "fire", amount: 100 }];
  applyOutgoingScaling({ attacker: actor, packets, target: {} });
  assert.equal(packets[0].amount, 100 * (1 + 0.02 * 5));
  console.log("✓ outgoing scaling uses stacks");
})();

(function testGainClampsToMaxStacks() {
  const actor = fakeActorWithRule("cold", { onUseGain: 3, maxStacks: 5 });
  noteUseGain(actor, new Set(["cold"]));
  noteUseGain(actor, new Set(["cold"]));
  assert.equal(actor.attunement.stacks.cold, 5);
  console.log("✓ noteUseGain clamps to maxStacks");
})();

(function testDecayReducesStacks() {
  const actor = fakeActorWithRule("shock", { decayPerTurn: 2, maxStacks: 9 });
  actor.attunement.stacks.shock = 3;
  decayPerTurn(actor);
  assert.equal(actor.attunement.stacks.shock, 1);
  decayPerTurn(actor);
  assert.ok(!actor.attunement.stacks.shock, "stacks should decay to zero");
  console.log("✓ decayPerTurn reduces stacks and prunes empties");
})();
