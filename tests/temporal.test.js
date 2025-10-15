// tests/temporal.test.js
// @ts-nocheck
import { Actor } from "../src/combat/actor.js";
import { tryAttack } from "../src/combat/actions.js";

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

function makeActor(id) {
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
      maxHP: 100,
      maxStamina: 50,
      maxMana: 10,
      baseSpeed: 1,
    },
  });
  actor.apCap = 200;
  actor.ap = 200;
  actor.baseActionAP = 100;
  return actor;
}

// --- Temporal Echo repeats the attack with scaled damage ---
{
  const attacker = makeActor("echoer");
  attacker.modCache.temporal.echo = { chance: 1, fraction: 0.5 };
  const defender = makeActor("target");
  defender.res.hp = 30;

  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const ok = tryAttack(attacker, defender, { base: 10 });
    assert(ok, "Temporal echo attack should resolve");
  } finally {
    Math.random = originalRandom;
  }

  assert(
    defender.res.hp === 15,
    `Temporal echo should apply reduced follow-up damage (expected 15 HP, got ${defender.res.hp})`,
  );
}

// --- On-Kill Haste applies the haste status ---
{
  const attacker = makeActor("haste-killer");
  attacker.turn = 3;
  attacker.modCache.temporal.onKillHaste = { duration: 2 };
  attacker.modCache.temporal.echo = null;

  const defender = makeActor("victim");
  defender.res.hp = 8;

  const ok = tryAttack(attacker, defender, { base: 10 });
  assert(ok, "On-kill haste attack should resolve");
  assert(defender.res.hp === 0, "Defender should be defeated by the attack");

  const haste = attacker.statuses.find((s) => s.id === "haste");
  assert(haste, "Killer should gain haste on kill");
  assert(haste.stacks === 1, `Haste should apply a single stack (got ${haste?.stacks})`);
  assert(
    haste.endsAtTurn === attacker.turn + 2,
    `Haste should last for 2 turns from current turn (expected ${attacker.turn + 2}, got ${haste?.endsAtTurn})`,
  );
}

console.log("\u2713 Temporal echo and on-kill haste mechanics");
