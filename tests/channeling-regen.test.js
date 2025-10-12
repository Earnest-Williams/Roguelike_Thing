import { strict as assert } from "node:assert";
import { Actor } from "../src/combat/actor.js";
import { startTurn, endTurn } from "../src/combat/loop.js";
import { tickResources } from "../src/combat/resources.js";
import { hasStatus } from "../src/combat/status.js";
import "../src/combat/status-registry.js";

function makeChannelingActor() {
  const actor = new Actor({
    id: "chan-test",
    baseStats: {
      str: 5,
      dex: 5,
      int: 5,
      vit: 5,
      maxHP: 20,
      maxStamina: 10,
      maxMana: 10,
      baseSpeed: 1,
    },
  });
  actor.modCache.resource.regenFlat = { stamina: 1, mana: 1 };
  actor.modCache.resource.regenPct = { stamina: 0, mana: 0 };
  actor.modCache.resource.channeling = false;
  actor.res.hp = actor.resources.hp = 10;
  actor.res.stamina = actor.resources.stamina = 4;
  actor.res.mana = actor.resources.mana = 2;
  actor.turn = 0;
  return actor;
}

function approxEqual(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message} (expected ${expected}, got ${actual})`);
}

(function testChannelingGrantsIdleRegen() {
  const actor = makeChannelingActor();

  actor.turn = 1;
  const staminaBefore = actor.res.stamina;
  const manaBefore = actor.res.mana;
  startTurn(actor);
  approxEqual(actor.res.stamina, staminaBefore + 1, "baseline regen should apply without channeling status");
  approxEqual(actor.res.mana, manaBefore + 1, "baseline mana regen should apply without channeling status");

  endTurn(actor);
  assert.ok(hasStatus(actor, "channeling"), "idle actors gain the channeling status at end of turn");

  actor.turn = 2;
  startTurn(actor);
  assert.ok(hasStatus(actor, "channeling"), "channeling persists into the next turn if uninterrupted");
  approxEqual(actor.res.stamina, staminaBefore + 1 + 1.1, "channeling multiplies stamina regen");
  approxEqual(actor.res.mana, manaBefore + 1 + 1.1, "channeling multiplies mana regen");
})();

(function testChannelingBreaksAfterActing() {
  const actor = makeChannelingActor();

  actor.turn = 1;
  startTurn(actor);
  endTurn(actor);

  actor.turn = 2;
  startTurn(actor);
  const staminaBeforeAction = actor.res.stamina;
  actor._turnDidMove = true;
  endTurn(actor);

  actor.turn = 3;
  startTurn(actor);
  assert.ok(!hasStatus(actor, "channeling"), "channeling is removed on the turn after acting");
  const staminaAfterBreak = actor.res.stamina;
  approxEqual(
    staminaAfterBreak - staminaBeforeAction,
    1,
    "regen returns to baseline once channeling has broken",
  );
})();

console.log("✓ channeling idle regen behavior");
