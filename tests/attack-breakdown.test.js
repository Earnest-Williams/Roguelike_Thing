// tests/attack-breakdown.test.js
import assert from "node:assert/strict";
import { Actor } from "../src/combat/actor.js";
import { foldModsFromEquipment } from "../src/combat/mod-folding.js";
import { makeItem } from "../js/item-system.js";
import { performEquippedAttack } from "../src/game/combat-glue.js";

const attacker = new Actor({
  id: "attacker",
  baseStats: {
    str: 12,
    dex: 10,
    int: 8,
    vit: 10,
    maxHP: 30,
    maxStamina: 12,
    maxMana: 5,
    baseSpeed: 1,
  },
  equipment: { RightHand: makeItem("long_sword") },
});
attacker.setFoldedMods(foldModsFromEquipment(attacker.equipment));
attacker.modCache.brands.push({
  kind: "brand",
  id: "phys_flat",
  type: "physical",
  flat: 2,
  pct: 0.1,
});
attacker.modCache.dmgMult = 1.2;

const defender = new Actor({
  id: "defender",
  baseStats: {
    str: 8,
    dex: 8,
    int: 8,
    vit: 8,
    maxHP: 28,
    maxStamina: 10,
    maxMana: 4,
    baseSpeed: 1,
  },
});
defender.setFoldedMods(foldModsFromEquipment(defender.equipment));
defender.modCache.resists.physical = 0.1;

const startHp = defender.res.hp;
const weapon = attacker.equipment.RightHand;
const result = performEquippedAttack(attacker, defender, weapon, 1);

assert.equal(result.ok, true, "attack should resolve");
assert.ok(result.outcome?.breakdown?.length, "breakdown should exist");

const steps = result.outcome.breakdown.map((s) => s.step);
for (const key of [
  "base",
  "brand_flat",
  "brand_pct",
  "attacker_mult",
  "defender_resist",
  "floor",
  "total",
]) {
  assert.ok(steps.includes(key), `expected step ${key} in breakdown`);
}

const totalStep = result.outcome.breakdown[result.outcome.breakdown.length - 1];
assert.equal(totalStep.step, "total");
assert.equal(totalStep.value, result.outcome.total);
assert.equal(defender.res.hp, startHp - result.outcome.total, "hp reduced by total");
