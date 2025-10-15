// tests/channeling.test.js
// @ts-nocheck
import { tickResources } from "../src/combat/resources.js";
import { startTurn, endTurn } from "../src/combat/loop.js";
import { hasStatus } from "../src/combat/status.js";
import { Actor } from "../src/combat/actor.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function makeActor() {
  const actor = new Actor({
    id: "channeler",
    baseStats: {
      str: 5,
      dex: 5,
      int: 5,
      vit: 5,
      con: 5,
      will: 5,
      luck: 5,
      maxHP: 20,
      maxStamina: 10,
      maxMana: 0,
      baseSpeed: 1,
    },
  });
  actor.resources.stamina = 5;
  actor.res.stamina = 5;
  actor.modCache.resource.regenFlat.stamina = 2;
  actor.turn = 1;
  return actor;
}

(function testChannelingBoost() {
  const actor = makeActor();

  endTurn(actor);
  assert(hasStatus(actor, "channeling"), "Actor should gain channeling status when idle");

  actor.turn = 2;
  startTurn(actor);
  tickResources(actor);

  const expected = 5 + 2 * 1.1;
  assert(Math.abs(actor.resources.stamina - expected) < 1e-6, "Channeling should grant boosted regen");
  console.log("✓ channeling regen bonus");
})();
