// tests/channeling.test.js
// @ts-check
import { CHANNELING_REGEN_MULT } from "../constants.js";
import { regenTurn } from "../src/combat/resources.js";
import { endTurn } from "../src/combat/loop.js";
import { hasStatus } from "../src/combat/status.js";

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
  assert(hasStatus(actor, "channeling"), "Actor should gain channeling status when idle");
  regenTurn(actor);
  assert(
    actor.resources.pools.stamina.cur === 5 + 2 * CHANNELING_REGEN_MULT,
    "Channeling should grant boosted regen",
  );
  console.log("✓ channeling regen bonus");
})();
