import assert from "node:assert/strict";
import { addStatus, tickStatuses } from "../src/combat/status.js";

function mkActor(hp = 20) {
  return {
    hp,
    resources: { hp },
    statuses: [],
    turn: 0,
  };
}

(function testBleedStacksAndExpires() {
  const actor = mkActor(20);

  addStatus(actor, "bleed");
  tickStatuses(actor, 1);
  assert.equal(actor.hp, 19, "bleed should deal 1 damage on its first tick");

  const stacked = addStatus(actor, "bleed");
  assert.equal(stacked?.stacks, 2, "bleed should stack additively");

  tickStatuses(actor, 2);
  assert.equal(actor.hp, 17, "bleed should scale damage with stacks");

  tickStatuses(actor, 3);
  assert.equal(actor.hp, 15, "bleed should continue ticking while active");

  tickStatuses(actor, 4);
  assert.equal(actor.hp, 13, "bleed duration should extend when refreshed");

  tickStatuses(actor, 5);
  assert.equal(actor.hp, 13, "bleed should stop dealing damage after expiry");
  assert.equal(actor.statuses.some((s) => s.id === "bleed"), false, "bleed should be removed after duration");

  console.log("✓ bleed stacks, damages, and expires");
})();

