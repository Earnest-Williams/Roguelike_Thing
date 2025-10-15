// tests/attunement-gain.test.js
import assert from "node:assert/strict";
import {
  applyOutgoingScaling,
  noteUseGain,
  decayAttunements,
  contributeDerived,
  tickAttunements,
} from "../dist/src/combat/attunement.js";

function fakeActorWithRule(type, patch = {}) {
  const baseRule = { onUseGain: 1, decayPerTurn: 1, maxStacks: 10, perStack: {} };
  const rule = { ...baseRule, ...patch, perStack: { ...baseRule.perStack, ...(patch.perStack || {}) } };
  const attackLog = [];
  const timeline = [];
  const rules = { [type]: rule };
  return {
    attunement: {
      rules,
      stacks: Object.create(null),
    },
    modCache: { attunementRules: rules },
    logs: {
      attack: {
        push(entry) {
          attackLog.push(entry);
        },
      },
    },
    log: timeline,
    _attackLog: attackLog,
  };
}

(function testOutgoingScalingUsesStacks() {
  const actor = fakeActorWithRule("fire", { perStack: { damagePct: 0.02 }, maxStacks: 10 });
  actor.attunement.stacks.fire = 5;
  const packets = [{ type: "fire", amount: 100 }];
  applyOutgoingScaling({ attacker: actor, packets, target: {} });
  assert.equal(packets[0].amount, 100 * (1 + 0.02 * 5));
  assert.equal(actor._attackLog.length, 1, "should record apply event when scaling occurs");
  console.log("✓ outgoing scaling uses stacks");
})();

(function testOutgoingScalingSkipsZeroOrInvalidPackets() {
  const actor = fakeActorWithRule("fire", { perStack: { damagePct: 0.5 }, maxStacks: 10 });
  actor.attunement.stacks.fire = 3;
  const packets = [
    { type: "fire", amount: 0 },
    { type: "fire", amount: -5 },
    { type: "fire", amount: Number.NaN },
  ];
  applyOutgoingScaling({ attacker: actor, packets, target: {} });
  assert.equal(actor._attackLog.length, 0, "should not log for packets without positive damage");
  assert.equal(packets[0].amount, 0);
  console.log("✓ outgoing scaling skips zero/invalid packets");
})();

(function testGainClampsToMaxStacks() {
  const actor = fakeActorWithRule("cold", { onUseGain: 3, maxStacks: 5 });
  noteUseGain(actor, new Set(["cold"]));
  noteUseGain(actor, new Set(["cold"]));
  assert.equal(actor.attunement.stacks.cold, 5);
  const before = actor.log.length;
  noteUseGain(actor, new Set(["cold"]));
  assert.equal(actor.attunement.stacks.cold, 5);
  assert.equal(actor.log.length, before, "should not log when already capped");
  console.log("✓ noteUseGain clamps to maxStacks");
})();

(function testGainSkipsUnsupportedTypes() {
  const actor = fakeActorWithRule("fire", { onUseGain: 2, maxStacks: 5 });
  noteUseGain(actor, new Set(["cold"]));
  assert.equal(actor.attunement.stacks.cold, undefined);
  assert.equal(actor.log.length, 0, "no log entries when type unsupported");
  console.log("✓ noteUseGain ignores unsupported damage types");
})();

(function testDecayReducesStacks() {
  const actor = fakeActorWithRule("shock", { decayPerTurn: 2, maxStacks: 9 });
  actor.attunement.stacks.shock = 3;
  decayAttunements(actor);
  assert.equal(actor.attunement.stacks.shock, 1);
  decayAttunements(actor);
  assert.ok(!actor.attunement.stacks.shock, "stacks should decay to zero");
  console.log("✓ decayAttunements reduces stacks and prunes empties");
})();

(function testDecaySkipsMissingRules() {
  const actor = fakeActorWithRule("fire", { decayPerTurn: 2 });
  actor.attunement.stacks.cold = 5;
  decayAttunements(actor);
  assert.equal(actor.attunement.stacks.cold, 5);
  console.log("✓ decayAttunements skips types without rules");
})();

(function testDecayClampsNegativeRates() {
  const actor = fakeActorWithRule("fire", { decayPerTurn: -5 });
  actor.attunement.stacks.fire = 4;
  decayAttunements(actor);
  assert.equal(actor.attunement.stacks.fire, 4);
  console.log("✓ decayAttunements clamps negative decay rates");
})();

(function testDecayFloorsAfterSubtracting() {
  const actor = fakeActorWithRule("fire", { decayPerTurn: 0.75 });
  actor.attunement.stacks.fire = 5;
  decayAttunements(actor);
  assert.equal(actor.attunement.stacks.fire, 4);
  console.log("✓ decayAttunements floors remaining stacks after decay");
})();

(function testDecayDropsInvalidStacks() {
  const actor = fakeActorWithRule("fire", { decayPerTurn: 1 });
  actor.attunement.stacks.fire = Number.NaN;
  decayAttunements(actor);
  assert.ok(!actor.attunement.stacks.fire);
  console.log("✓ decayAttunements removes invalid stack entries");
})();

(function testTickAttunementsSupportsMultipleTurns() {
  const actor = fakeActorWithRule("acid", { decayPerTurn: 1.5 });
  actor.attunement.stacks.acid = 7;
  tickAttunements(actor, 2);
  assert.equal(actor.attunement.stacks.acid, 4);
  tickAttunements(actor, 0);
  assert.equal(actor.attunement.stacks.acid, 4, "non-positive turns should be ignored");
  console.log("✓ tickAttunements handles multi-turn decay");
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
  assert.equal(result.resistsPct.fire, 0.03);
  assert.equal(result.accuracyFlat, 6);
  console.log("✓ contributeDerived adds resist and accuracy bonuses");
})();
