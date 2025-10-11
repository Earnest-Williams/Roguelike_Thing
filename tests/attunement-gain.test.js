// tests/attunement-gain.test.js
import assert from "node:assert/strict";
import {
  applyOutgoingScaling,
  noteUseGain,
  decayPerTurn,
  contributeDerived,
} from "../src/combat/attunement.js";

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

(function testContributeDerivedAddsPassiveBonuses() {
  const actor = fakeActorWithRule("fire", {
    maxStacks: 9,
    perStack: { resistPct: 0.01, accuracyFlat: 2 },
  });
  actor.attunement.stacks.fire = 3;
  const derived = { resistDelta: Object.create(null), accuracyFlat: 0 };
  const result = contributeDerived(actor, derived);
  assert.equal(result.resistDelta.fire, 0.03);
  assert.equal(result.accuracyFlat, 6);
  console.log("✓ contributeDerived adds resist and accuracy bonuses");
})();
