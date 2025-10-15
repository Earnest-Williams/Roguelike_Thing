// tests/phase2.test.js
// @ts-nocheck
import { Actor } from "../src/combat/actor.js";
import { addStatus, rebuildDerived } from "../src/combat/status.js";
import { runTurn } from "../src/combat/loop.js";
import { simplePlanner } from "../src/combat/loop.sample-planner.js";
import { foldModsFromEquipment } from "../src/combat/mod-folding.js";
import { makeItem } from "../js/item-system.js";
import { SLOT } from "../js/constants.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const a = new Actor({
  id: "hero",
  baseStats: {
    str: 10,
    dex: 10,
    int: 8,
    vit: 10,
    con: 10,
    will: 8,
    luck: 9,
    maxHP: 20,
    maxStamina: 10,
    maxMana: 5,
    baseSpeed: 1,
  },
  equipment: { [SLOT.RightHand]: makeItem("long_sword") },
});
foldModsFromEquipment(a);

const b = new Actor({
  id: "dummy",
  baseStats: {
    str: 5,
    dex: 5,
    int: 5,
    vit: 5,
    con: 5,
    will: 5,
    luck: 5,
    maxHP: 30,
    maxStamina: 5,
    maxMana: 0,
    baseSpeed: 1,
  },
});
foldModsFromEquipment(b);

// Apply haste to hero (faster actions)
addStatus(a, "haste", { stacks: 3, duration: 1 });
rebuildDerived(a);

const initialDummyHP = b.res.hp;
// Run a few turns
for (let t = 0; t < 3; t++) {
  const heroDown = runTurn(a, simplePlanner(b));
  const dummyDown = runTurn(b, () => {});

  assert(!heroDown, "Hero should remain alive during sanity loop");
  assert(!dummyDown, "Dummy should survive the test loop");
}

assert(a.ap <= a.apCap, "AP does not exceed cap");
assert(b.res.hp < initialDummyHP, "Dummy should take damage during the loop");

assert(a.cooldowns instanceof Map, "Cooldowns should use a Map for storage");
const swingReadyAt = a.cooldowns.get?.("swing");
assert(swingReadyAt === undefined, "Cooldown entries should expire once the turn threshold is reached");

assert(a.res.stamina === a.base.maxStamina, "Stamina regen plus adrenaline bonus should top off at the cap");

console.log("\u2713 Phase 2 AP/cooldown/regen sanity OK");
