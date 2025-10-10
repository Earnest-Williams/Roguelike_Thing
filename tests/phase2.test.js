// tests/phase2.test.js
// @ts-check
import { Actor } from "../src/combat/actor.js";
import { applyStatus } from "../src/combat/status.js";
import { runTurn } from "../src/combat/loop.js";
import { simplePlanner } from "../src/combat/loop.sample-planner.js";
import { foldModsFromEquipment } from "../src/combat/mod-folding.js";
import { makeItem } from "../js/item-system.js";
import { SLOT } from "../constants.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const a = new Actor({
  id: "hero",
  baseStats: { str: 10, dex: 10, int: 8, vit: 10, maxHP: 20, maxStamina: 10, maxMana: 5, baseSpeed: 1 },
  equipment: { [SLOT.RightHand]: makeItem("long_sword") },
});
a.setFoldedMods(foldModsFromEquipment(a.equipment));

const b = new Actor({
  id: "dummy",
  baseStats: { str: 5, dex: 5, int: 5, vit: 5, maxHP: 30, maxStamina: 5, maxMana: 0, baseSpeed: 1 },
});
b.setFoldedMods(foldModsFromEquipment(b.equipment));

// Apply adrenaline to hero (faster actions + cooldowns)
applyStatus(a, "adrenaline", 3, 1);

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

const swingCooldown = a.cooldowns.swing ?? 0;
assert(swingCooldown >= 0 && swingCooldown < 1, "Cooldown scaling should leave fractional turns remaining");

assert(a.res.stamina === a.base.maxStamina, "Stamina regen plus adrenaline bonus should top off at the cap");

console.log("\u2713 Phase 2 AP/cooldown/regen sanity OK");
