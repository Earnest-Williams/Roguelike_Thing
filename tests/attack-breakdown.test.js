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
foldModsFromEquipment(attacker);
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
foldModsFromEquipment(defender);
defender.modCache.resists.physical = 0.1;

const startHp = defender.res.hp;
const weapon = attacker.equipment.RightHand;
attacker.modCache.attunement.physical = { maxStacks: 10, decayPerTurn: 1, onUseGain: 2 };
const result = performEquippedAttack(attacker, defender, weapon, 1);

assert.equal(result.ok, true, "attack should resolve");
assert.ok(result.outcome?.packetsAfterDefense, "packets should exist");

const dealt = result.outcome.totalDamage;
assert.ok(dealt > 0, "damage should be positive");
const sumPackets = Object.values(result.outcome.packetsAfterDefense).reduce(
  (acc, v) => acc + v,
  0,
);
assert.equal(sumPackets, dealt, "packets sum should equal total damage");
assert.equal(
  defender.res.hp,
  startHp - dealt,
  "hp reduced by total damage",
);

assert.equal(
  attacker.attunements.physical?.stacks,
  2,
  "attacker should gain configured attunement stacks when using the brand",
);
