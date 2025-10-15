import assert from "node:assert/strict";
import { createActor, performAction, tickChannel } from "./_helpers.js";

(function testInsufficientResourceCancelsAction() {
  const actor = createActor({ id: "resource_gate", stamina: 0, ap: 10 });
  const result = performAction(actor, "PowerStrike");
  assert.equal(result.ok, false, "action should fail when stamina is unavailable");
  assert.equal(actor.ap, 10, "AP should remain unchanged when action is cancelled");
  console.log("✓ insufficient resource cancels action without AP spend");
})();

(function testChannelDrainsAndHalts() {
  const actor = createActor({ id: "resource_channel", mana: 5, ap: 100 });
  const start = performAction(actor, "SustainBeam");
  assert.ok(start.ok && start.channel, "channel action should start successfully");
  const channel = start.channel;
  while (channel.active) {
    tickChannel(channel);
  }
  assert.equal(actor.mana, 0, "channel should drain mana to zero");
  assert.equal(channel.active, false, "channel should mark as inactive when drained");
  if (actor.cooldowns instanceof Map) {
    assert.ok(actor.cooldowns.has("SustainBeam"), "cooldown map should include channel id");
  } else {
    assert.ok(actor.cooldowns && actor.cooldowns["SustainBeam"] > 0, "cooldown object should include channel id");
  }
  console.log("✓ channel drains resources to zero then applies cooldown");
})();
