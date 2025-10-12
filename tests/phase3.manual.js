// tests/phase3.manual.js
import { Actor } from "../src/combat/actor.js";
import { foldModsFromEquipment } from "../src/combat/mod-folding.js";
import { makeItem } from "../js/item-system.js";
import { performEquippedAttack } from "../src/game/combat-glue.js";

const a = new Actor({
  id: "A",
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
  equipment: { RightHand: makeItem("long_sword") },
});
foldModsFromEquipment(a);

a.res.hp = 20;

const b = new Actor({
  id: "B",
  baseStats: {
    str: 8,
    dex: 8,
    int: 8,
    vit: 8,
    con: 8,
    will: 8,
    luck: 8,
    maxHP: 25,
    maxStamina: 10,
    maxMana: 5,
    baseSpeed: 1,
  },
});
foldModsFromEquipment(b);

const weapon = a.equipment.RightHand?.item || a.equipment.RightHand;
const res = performEquippedAttack(a, b, weapon, 1);
console.log("attack ok?", res.ok, "B hp:", b.res.hp);
