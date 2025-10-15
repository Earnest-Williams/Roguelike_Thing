import { strict as assert } from "node:assert";
import { DAMAGE_TYPE } from "../js/constants.js";
import { Actor } from "../src/combat/actor.js";
import { resolveAttack } from "../src/combat/resolve.js";

function createBasicActors() {
  const attacker = new Actor({
    id: "attacker",
    baseStats: {
      str: 10,
      dex: 10,
      int: 10,
      vit: 10,
      con: 10,
      will: 10,
      luck: 10,
      maxHP: 20,
      maxStamina: 10,
      maxMana: 5,
      baseSpeed: 1,
    },
  });
  const defender = new Actor({
    id: "defender",
    baseStats: {
      str: 5,
      dex: 5,
      int: 5,
      vit: 5,
      con: 5,
      will: 5,
      luck: 5,
      maxHP: 12,
      maxStamina: 5,
      maxMana: 5,
      baseSpeed: 1,
    },
  });
  return { attacker, defender };
}

(function testEchoAndOnKillHooks() {
  const { attacker, defender } = createBasicActors();
  attacker.modCache.temporal.echo = { chancePct: 1, fraction: 0.5 };
  attacker.modCache.temporal.onKillHaste = { statusId: "haste", duration: 2, stacks: 2 };
  attacker.modCache.resource.onKillGain = { stamina: 5 };

  const staminaPool = attacker.resources.pools.stamina;
  const staminaBefore = staminaPool.cur;

  const result = resolveAttack({
    attacker,
    defender,
    packets: [{ type: DAMAGE_TYPE.SLASH, amount: 10 }],
  });

  assert.ok(result.echo?.triggered, "echo should trigger");
  assert.equal(result.echo?.totalDamage, 5, "echo should deal half damage");
  assert.ok(!result.echo?.result?.echo, "echo result should not chain further");
  assert.equal(defender.res.hp, 0, "defender should be at zero HP after echo");

  const haste = attacker.statuses.find((s) => s.id === "haste");
  assert.ok(haste, "haste should be applied to attacker");
  assert.ok(haste.stacks >= 2, "haste should respect configured stacks");

  const staminaAfter = attacker.resources.pools.stamina.cur;
  const expectedStamina = Math.min(staminaPool.max, staminaBefore + 5);
  assert.equal(staminaAfter, expectedStamina, "on-kill resource gain should apply");

  console.log("✓ echo triggers once, haste and resource gain apply on kill");
})();

(function testAllowOnKillFalseBlocksEchoKillHaste() {
  const { attacker, defender } = createBasicActors();
  attacker.modCache.temporal.echo = { chancePct: 1, fraction: 0.5, allowOnKill: false };
  attacker.modCache.temporal.onKillHaste = { statusId: "haste", duration: 1 };

  const staminaPool = attacker.resources.pools.stamina;
  const staminaBefore = staminaPool.cur;
  attacker.modCache.resource.onKillGain = { stamina: 3 };

  defender.res.hp = 12;

  resolveAttack({
    attacker,
    defender,
    packets: [{ type: DAMAGE_TYPE.SLASH, amount: 8 }],
  });

  const haste = attacker.statuses.find((s) => s.id === "haste");
  assert.ok(!haste, "echo-only kill should not grant haste when allowOnKill=false");

  const staminaAfter = attacker.resources.pools.stamina.cur;
  assert.equal(
    staminaAfter,
    staminaBefore,
    "echo-only kill should not grant on-kill resources when allowOnKill=false",
  );

  console.log("✓ allowOnKill=false suppresses on-kill haste/resource gains from echo");
})();

(function testAllowOnKillFalseDoesNotBlockPrimaryKillRewards() {
  const { attacker, defender } = createBasicActors();
  attacker.modCache.temporal.echo = { chancePct: 1, fraction: 0.5, allowOnKill: false };
  attacker.modCache.temporal.onKillHaste = { statusId: "haste", duration: 1, stacks: 1 };
  attacker.modCache.resource.onKillGain = { stamina: 4 };

  const staminaPool = attacker.resources.pools.stamina;
  const staminaBefore = staminaPool.cur;

  resolveAttack({
    attacker,
    defender,
    packets: [{ type: DAMAGE_TYPE.SLASH, amount: 12 }],
  });

  const haste = attacker.statuses.find((s) => s.id === "haste");
  assert.ok(haste, "primary kill should still grant haste stacks when allowOnKill=false");
  assert.equal(haste.stacks, 1, "haste stacks should reflect configuration");

  const staminaAfter = attacker.resources.pools.stamina.cur;
  const expected = Math.min(staminaPool.max, staminaBefore + 4);
  assert.equal(
    staminaAfter,
    expected,
    "primary kill should still grant resource gains even when echo disallows on-kill",
  );

  console.log("✓ primary kills still award haste/resources when echo suppresses on-kill kills");
})();

(function testOnKillHasteCooldownAndOncePerTurn() {
  const attacker = new Actor({
    id: "attacker",
    baseStats: {
      str: 10,
      dex: 10,
      int: 10,
      vit: 10,
      con: 10,
      will: 10,
      luck: 10,
      maxHP: 20,
      maxStamina: 10,
      maxMana: 5,
      baseSpeed: 1,
    },
  });
  attacker.modCache.temporal.onKillHaste = {
    statusId: "haste",
    duration: 1,
    oncePerTurn: true,
    cooldownTurns: 2,
  };

  const performKill = (turn) => {
    attacker.turn = turn;
    const defender = new Actor({
      id: `def_${turn}`,
      baseStats: {
        str: 1,
        dex: 1,
        int: 1,
        vit: 1,
        con: 1,
        will: 1,
        luck: 1,
        maxHP: 5,
        maxStamina: 1,
        maxMana: 1,
        baseSpeed: 1,
      },
    });
    resolveAttack({
      attacker,
      defender,
      packets: [{ type: DAMAGE_TYPE.SLASH, amount: 10 }],
    });
    const haste = attacker.statuses.find((s) => s.id === "haste");
    return haste ? haste.stacks : 0;
  };

  const firstStacks = performKill(0);
  const secondStacks = performKill(0);
  const thirdStacks = performKill(1);
  const fourthStacks = performKill(2);

  assert.equal(firstStacks, 1, "first kill should grant haste stack");
  assert.equal(secondStacks, 1, "oncePerTurn should block additional stacks same turn");
  assert.equal(thirdStacks, 1, "cooldown should block on subsequent turn if still active");
  assert.ok(fourthStacks >= 2, "haste should grant another stack once cooldown ends");

  console.log("✓ on-kill haste respects oncePerTurn and cooldownTurns gates");
})();

(function testEchoSkipsStatusesByDefault() {
  const { attacker, defender } = createBasicActors();
  attacker.modCache.temporal.echo = { chancePct: 1, fraction: 0.5 };

  resolveAttack({
    attacker,
    defender,
    packets: [{ type: DAMAGE_TYPE.SLASH, amount: 4 }],
    statusAttempts: [{ id: "burning", baseChance: 1, duration: 2, stacks: 1 }],
  });

  const burning = defender.statuses.find((s) => s.id === "burning");
  assert.ok(burning, "burning should apply on the initial hit");
  assert.equal(
    burning.stacks,
    1,
    "burning stacks should remain at 1 when echo does not copy statuses",
  );

  console.log("✓ echo suppresses on-hit statuses when copyStatuses is false");
})();

(function testEchoCanCopyStatusesWhenEnabled() {
  const { attacker, defender } = createBasicActors();
  attacker.modCache.temporal.echo = {
    chancePct: 1,
    fraction: 0.5,
    copyStatuses: true,
  };

  resolveAttack({
    attacker,
    defender,
    packets: [{ type: DAMAGE_TYPE.SLASH, amount: 4 }],
    statusAttempts: [{ id: "burning", baseChance: 1, duration: 2, stacks: 1 }],
  });

  const burning = defender.statuses.find((s) => s.id === "burning");
  assert.ok(burning, "burning should still apply");
  assert.ok(
    burning.stacks >= 2,
    "burning stacks should increase when echo copies statuses",
  );

  console.log("✓ echo copies status attempts when copyStatuses is true");
})();
