// tests/attunement-gain.test.js
import assert from "node:assert/strict";
import { gainAttunement, tickAttunements } from "../src/combat/attunement.js";

const actor = {
  id: "tester",
  modCache: {
    offense: {
      brands: [
        { type: "fire" },
        { type: "ice" },
      ],
    },
    attunement: {
      fire: { maxStacks: 5, decayPerTurn: 2, onUseGain: 2 },
      ice: { maxStacks: 3, decayPerTurn: 1, onUseGain: 1 },
      shadow: { maxStacks: 4, decayPerTurn: 1 },
    },
  },
  attunements: Object.create(null),
};

gainAttunement(actor, "fire", 3);
assert.equal(actor.attunements.fire.stacks, 3, "fire attunement should gain stacks");

gainAttunement(actor, "fire", 10);
assert.equal(actor.attunements.fire.stacks, 5, "fire attunement respects max stacks");

// Unknown brand should be ignored
gainAttunement(actor, "shadow", 2);
assert.ok(!("shadow" in actor.attunements), "attunement without matching brand is ignored");

// Tick should decay and prune empty entries
gainAttunement(actor, "ice", 1);
tickAttunements(actor);
assert.equal(actor.attunements.fire.stacks, 3, "fire decays by configured amount");
assert.ok(!actor.attunements.ice, "ice attunement should decay to zero and be removed");

tickAttunements(actor);
assert.ok(actor.attunements.fire.stacks < 3, "further ticks continue to decay");
