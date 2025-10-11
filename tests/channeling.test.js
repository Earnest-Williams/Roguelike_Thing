// tests/channeling.test.js
// @ts-check
import { regenTurn } from "../src/combat/resources.js";
import { endTurn } from "../src/combat/loop.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(function testChannelingBoost() {
  const actor = {
    id: "channeler",
    modCache: { resource: { channeling: true } },
    resources: {
      pools: {
        stamina: { cur: 5, max: 10, regenPerTurn: 2 },
      },
    },
    turnFlags: { moved: false, attacked: false, channeled: false },
    logs: {},
  };

  endTurn(actor);
  assert(actor.turnFlags.channeled === true, "Actor should be flagged as channeling when idle");
  regenTurn(actor);
  assert(actor.resources.pools.stamina.cur === 5 + 2 * 1.5, "Channeling should grant +50% regen");
  console.log("✓ channeling regen bonus");
})();
