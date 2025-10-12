// tests/phase3.test.js
// @ts-check
import { Actor } from "../src/combat/actor.js";
import { runTurn } from "../src/combat/loop.js";
import { tryAttack } from "../src/combat/actions.js";
import { BASE_PASSIVE_REGEN } from "../js/constants.js";

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

function makeActor(id) {
  return new Actor({
    id,
    baseStats: {
      str: 10,
      dex: 10,
      int: 10,
      vit: 10,
      maxHP: 30,
      maxStamina: 10,
      maxMana: 5,
      baseSpeed: 1,
    },
  });
}

// --- Haste / action speed ---
const hasteActor = makeActor("haste");
hasteActor.apCap = 250;
hasteActor.ap = 0;
hasteActor.modCache.temporal.actionSpeedPct = -0.5;
runTurn(hasteActor, () => {});
assert(
  hasteActor.ap === 200,
  `Haste should double AP gain (expected 200, got ${hasteActor.ap})`,
);

// --- Resource regeneration at turn start ---
const regenActor = makeActor("regen");
regenActor.res.stamina = 0;
regenActor.modCache.resource.regenFlat.stamina = 5;
runTurn(regenActor, () => {});
const expectedStamina = Math.min(
  regenActor.base.maxStamina,
  BASE_PASSIVE_REGEN.stamina + regenActor.modCache.resource.regenFlat.stamina,
);
assert(
  regenActor.res.stamina === expectedStamina,
  `Stamina should regenerate at turn start (expected ${expectedStamina}, got ${regenActor.res.stamina})`,
);

// --- Cooldown expiration ---
const attacker = makeActor("attacker");
const defender = makeActor("defender");
const cooldownKey = "tempo_strike";
let landed = 0;

const planner = (actor) => {
  if (tryAttack(actor, defender, { key: cooldownKey, baseCooldown: 2 })) {
    landed += 1;
  }
};

for (let turn = 0; turn < 3; turn++) {
  runTurn(attacker, planner);
}

assert(
  landed === 2,
  `Cooldown should allow a second attack once expired (expected 2 hits, got ${landed})`,
);

console.log("\u2713 Phase 3 temporal/resource hooks OK");
