// tests/combat-resource-cost.test.js
import assert from "node:assert/strict";
import { Actor } from "../dist/src/combat/actor.js";
import { tryAttack } from "../dist/src/combat/actions.js";
import { foldModsFromEquipment } from "../dist/src/combat/mod-folding.js";

function makeCombatant(id) {
  const actor = new Actor({
    id,
    baseStats: {
      str: 10,
      dex: 10,
      int: 10,
      vit: 10,
      con: 10,
      will: 10,
      luck: 10,
      maxHP: 40,
      maxStamina: 12,
      maxMana: 5,
      baseSpeed: 1,
    },
  });
  actor.apCap = 200;
  actor.ap = 200;
  actor.baseActionAP = 100;
  foldModsFromEquipment(actor);
  return actor;
}

// --- Basic attacks should spend their fallback stamina cost ---
{
  const attacker = makeCombatant("basic-attacker");
  const defender = makeCombatant("basic-target");
  const startStamina = attacker.resources.stamina;
  const startPool = attacker.resources.pools.stamina.cur;

  const ok = tryAttack(attacker, defender, { base: 5 });
  assert.equal(ok, true, "basic tryAttack should resolve");

  assert.equal(
    attacker.resources.stamina,
    startStamina - 2,
    "basic attack should spend the fallback stamina cost",
  );
  assert.equal(
    attacker.resources.pools.stamina.cur,
    startPool - 2,
    "stamina pool should stay in sync after spending",
  );
}

// --- Attacks should remove HP from the defender ---
{
  const attacker = makeCombatant("damage-attacker");
  const defender = makeCombatant("damage-target");
  const startHp = defender.res.hp;

  const ok = tryAttack(attacker, defender, { base: 8 });
  assert.equal(ok, true, "damage tryAttack should resolve");

  assert.ok(startHp > 0, "defender should start with positive HP");
  assert.ok(
    defender.res.hp < startHp,
    "successful attacks should reduce defender HP",
  );
  assert.equal(
    defender.res.hp,
    startHp - 8,
    "basic attack damage should subtract directly from defender HP",
  );
}

console.log("✓ attacks spend resource costs");
console.log("✓ attacks reduce defender HP");
