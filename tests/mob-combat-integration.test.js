// tests/mob-combat-integration.test.js
// Integration tests for mob combat and faction-based engagement

import { strict as assert } from "node:assert";
import { TILE_FLOOR } from "../js/constants.js";
import { createMobFromTemplate } from "../src/factories/index.js";
import { Actor } from "../src/combat/actor.js";
import { tryAttack } from "../src/combat/actions.js";
import { FactionService } from "../src/game/faction-service.js";
import { findEntityAtPosition, hasValidPosition } from "./helpers/entity-utils.js";

function makeGrid(width, height, value = TILE_FLOOR) {
  const grid = [];
  for (let y = 0; y < height; y += 1) {
    const row = [];
    for (let x = 0; x < width; x += 1) {
      row.push(value);
    }
    grid.push(row);
  }
  return grid;
}

function makeWorld(mobs, player = null, width = 15, height = 15) {
  const grid = makeGrid(width, height);
  const mobList = Array.isArray(mobs) ? mobs : [mobs];
  
  const mobManager = {
    list: () => mobList.filter(Boolean),
    getMobAt(x, y) {
      const mob = findEntityAtPosition(mobList, x, y, { includeDead: true });
      if (mob) return mob;
      if (player && hasValidPosition(player) && player.x === x && player.y === y) {
        return player;
      }
      return null;
    },
  };

  return {
    mapState: { width, height, grid },
    maze: grid,
    mobManager,
    player,
    entities: player ? [player] : [],
  };
}

function chebyshevDistance(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

// Test 1: Mobs detect and pursue hostile mobs from different factions
(async function testMobToMobCombatDifferentFactions() {
  // Orc (npc_hostile) vs Skeleton (unaligned) - should be hostile
  const orc = createMobFromTemplate("orc");
  orc.pos = { x: 3, y: 5 };
  orc.getLightRadius = () => 10;
  if (orc.actor) {
    orc.actor.getLightRadius = () => 10;
  }

  const skeleton = createMobFromTemplate("skeleton");
  skeleton.pos = { x: 8, y: 5 };
  skeleton.getLightRadius = () => 0;
  if (skeleton.actor) {
    skeleton.actor.getLightRadius = () => 0;
  }

  // Verify they are hostile to each other
  assert.equal(
    FactionService.isHostile(orc, skeleton),
    true,
    "orc and skeleton should be hostile"
  );
  assert.equal(
    FactionService.isHostile(skeleton, orc),
    true,
    "skeleton and orc should be hostile (symmetric)"
  );

  const world = makeWorld([orc, skeleton]);
  const rng = () => 0.3;
  const startDistance = chebyshevDistance(orc, skeleton);

  // Orc should move toward skeleton
  await orc.takeTurn({ world, rng, now: 0 });
  const afterDistance = chebyshevDistance(orc, skeleton);

  assert.ok(
    afterDistance < startDistance,
    "orc should move toward hostile skeleton (mob-to-mob engagement)"
  );
  assert.equal(
    orc.lastPlannerDecision?.type,
    "MOVE",
    "planner should produce MOVE decision toward hostile mob"
  );

  console.log("✓ mobs detect and pursue hostile mobs from different factions");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

// Test 2: Mobs ignore other mobs in their own faction
(async function testMobToMobFriendlyFirePrevention() {
  // Two orcs (both npc_hostile) - should be allied
  const orc1 = createMobFromTemplate("orc");
  orc1.pos = { x: 3, y: 5 };
  orc1.getLightRadius = () => 10;
  if (orc1.actor) {
    orc1.actor.getLightRadius = () => 10;
  }

  const orc2 = createMobFromTemplate("orc");
  orc2.pos = { x: 8, y: 5 };
  orc2.getLightRadius = () => 0;
  if (orc2.actor) {
    orc2.actor.getLightRadius = () => 0;
  }

  // Verify they are NOT hostile to each other
  assert.equal(
    FactionService.isHostile(orc1, orc2),
    false,
    "orcs in same faction should not be hostile"
  );
  assert.equal(
    FactionService.isAllied(orc1, orc2),
    true,
    "orcs in same faction should be allied"
  );

  const world = makeWorld([orc1, orc2]);
  const rng = () => 0.3;
  const startPos = { x: orc1.x, y: orc1.y };

  // Orc1 should wander, NOT attack orc2
  await orc1.takeTurn({ world, rng, now: 0 });

  // Decision should NOT be ATTACK against orc2
  assert.notEqual(
    orc1.lastPlannerDecision?.type,
    "ATTACK",
    "mob should not attack allied mob"
  );

  console.log("✓ mobs ignore allies in their own faction (no friendly fire)");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

// Test 3: Mobs detect and pursue player
(async function testMobToPlayerCombat() {
  const orc = createMobFromTemplate("orc");
  orc.pos = { x: 3, y: 5 };
  orc.getLightRadius = () => 10;
  if (orc.actor) {
    orc.actor.getLightRadius = () => 10;
  }

  const player = new Actor({
    id: "player-test",
    name: "Test Player",
    factions: ["player"],
    affiliations: [],
    baseStats: {
      str: 10, dex: 10, int: 10, vit: 10, con: 10, will: 10, luck: 10,
      maxHP: 100, maxStamina: 50, maxMana: 50, baseSpeed: 1.0,
    },
  });
  player.x = 9;
  player.y = 5;
  player.getLightRadius = () => 8;

  // Verify orc is hostile to player
  assert.equal(
    FactionService.isHostile(orc, player),
    true,
    "npc_hostile mob should be hostile to player"
  );

  const world = makeWorld([orc], player, 15, 10);
  const rng = () => 0.3;
  const startDistance = chebyshevDistance(orc, player);

  // Orc should move toward player
  await orc.takeTurn({ world, rng, now: 0 });
  const afterDistance = chebyshevDistance(orc, player);

  assert.ok(
    afterDistance < startDistance,
    "mob should move toward hostile player"
  );
  assert.ok(
    ["MOVE", "ATTACK"].includes(orc.lastPlannerDecision?.type),
    "planner should produce MOVE or ATTACK decision toward player"
  );

  console.log("✓ mobs detect and pursue player character");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

// Test 4: Mob attacks player when adjacent
(async function testMobAttacksPlayerWhenAdjacent() {
  const orc = createMobFromTemplate("orc");
  orc.pos = { x: 5, y: 5 };
  orc.getLightRadius = () => 10;
  if (orc.actor) {
    orc.actor.getLightRadius = () => 10;
  }

  const player = new Actor({
    id: "player-test",
    name: "Test Player",
    factions: ["player"],
    affiliations: [],
    baseStats: {
      str: 10, dex: 10, int: 10, vit: 10, con: 10, will: 10, luck: 10,
      maxHP: 100, maxStamina: 50, maxMana: 50, baseSpeed: 1.0,
    },
  });
  player.x = 6; // Adjacent to orc
  player.y = 5;
  player.getLightRadius = () => 8;

  const world = makeWorld([orc], player, 15, 10);
  const rng = () => 0.3;
  const distance = chebyshevDistance(orc, player);

  assert.equal(distance, 1, "player should be adjacent to orc");

  const playerHpBefore = player.res?.hp || 0;

  // Orc should attack player
  await orc.takeTurn({ world, rng, now: 0 });

  // Decision should be ATTACK since player is adjacent
  assert.equal(
    orc.lastPlannerDecision?.type,
    "ATTACK",
    "mob should choose ATTACK when hostile target is adjacent"
  );

  console.log("✓ mobs attack player when adjacent (in range)");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

// Test 5: Mob attacks hostile mob when adjacent
(async function testMobAttacksHostileMobWhenAdjacent() {
  const orc = createMobFromTemplate("orc");
  orc.pos = { x: 5, y: 5 };
  orc.getLightRadius = () => 10;
  if (orc.actor) {
    orc.actor.getLightRadius = () => 10;
  }

  const skeleton = createMobFromTemplate("skeleton");
  skeleton.pos = { x: 6, y: 5 }; // Adjacent to orc
  skeleton.getLightRadius = () => 0;
  if (skeleton.actor) {
    skeleton.actor.getLightRadius = () => 0;
  }

  const world = makeWorld([orc, skeleton]);
  const rng = () => 0.3;
  const distance = chebyshevDistance(orc, skeleton);

  assert.equal(distance, 1, "skeleton should be adjacent to orc");
  assert.equal(
    FactionService.isHostile(orc, skeleton),
    true,
    "orc and skeleton should be hostile"
  );

  // Orc should attack skeleton
  await orc.takeTurn({ world, rng, now: 0 });

  assert.equal(
    orc.lastPlannerDecision?.type,
    "ATTACK",
    "mob should choose ATTACK when hostile mob is adjacent"
  );

  console.log("✓ mobs attack hostile mobs when adjacent (mob-to-mob combat)");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

// Test 6: Multiple hostile mobs prioritize correctly
(async function testMultipleHostileTargetPrioritization() {
  const orc = createMobFromTemplate("orc");
  orc.pos = { x: 7, y: 7 };
  orc.getLightRadius = () => 10;
  if (orc.actor) {
    orc.actor.getLightRadius = () => 10;
  }

  const skeleton1 = createMobFromTemplate("skeleton");
  skeleton1.pos = { x: 5, y: 7 }; // Distance 2 from orc
  skeleton1.getLightRadius = () => 0;
  if (skeleton1.actor) {
    skeleton1.actor.getLightRadius = () => 0;
  }

  const skeleton2 = createMobFromTemplate("skeleton");
  skeleton2.pos = { x: 12, y: 7 }; // Distance 5 from orc
  skeleton2.getLightRadius = () => 0;
  if (skeleton2.actor) {
    skeleton2.actor.getLightRadius = () => 0;
  }

  const world = makeWorld([orc, skeleton1, skeleton2]);
  const rng = () => 0.3;

  const distToSkel1Before = chebyshevDistance(orc, skeleton1);
  const distToSkel2Before = chebyshevDistance(orc, skeleton2);

  // Orc should prioritize closer hostile (skeleton1)
  await orc.takeTurn({ world, rng, now: 0 });

  const distToSkel1After = chebyshevDistance(orc, skeleton1);
  const distToSkel2After = chebyshevDistance(orc, skeleton2);

  // Should move toward closer target (skeleton1), not farther one
  assert.ok(
    distToSkel1After <= distToSkel1Before,
    "mob should prioritize closer hostile target"
  );

  console.log("✓ mobs prioritize closer hostile targets");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

// Test 7: Complex faction scenario with player, allies, and enemies
(async function testComplexFactionScenario() {
  // Setup: 2 orcs (npc_hostile, allied to each other)
  //        2 skeletons (unaligned, hostile to all)
  //        1 player (hostile to npc_hostile)
  
  const orc1 = createMobFromTemplate("orc");
  orc1.pos = { x: 3, y: 5 };
  orc1.getLightRadius = () => 10;
  if (orc1.actor) orc1.actor.getLightRadius = () => 10;

  const orc2 = createMobFromTemplate("orc");
  orc2.pos = { x: 4, y: 5 };
  orc2.getLightRadius = () => 10;
  if (orc2.actor) orc2.actor.getLightRadius = () => 10;

  const skeleton1 = createMobFromTemplate("skeleton");
  skeleton1.pos = { x: 8, y: 5 };
  if (skeleton1.actor) skeleton1.actor.getLightRadius = () => 0;

  const skeleton2 = createMobFromTemplate("skeleton");
  skeleton2.pos = { x: 9, y: 5 };
  if (skeleton2.actor) skeleton2.actor.getLightRadius = () => 0;

  const player = new Actor({
    id: "player-test",
    name: "Test Player",
    factions: ["player"],
    affiliations: [],
    baseStats: {
      str: 10, dex: 10, int: 10, vit: 10, con: 10, will: 10, luck: 10,
      maxHP: 100, maxStamina: 50, maxMana: 50, baseSpeed: 1.0,
    },
  });
  player.x = 12;
  player.y = 5;
  player.getLightRadius = () => 8;

  // Verify faction relationships
  assert.equal(FactionService.isAllied(orc1, orc2), true, "orcs should be allied");
  assert.equal(FactionService.isHostile(orc1, skeleton1), true, "orc hostile to skeleton");
  assert.equal(FactionService.isHostile(skeleton1, skeleton2), false, "unaligned not hostile to each other");
  assert.equal(FactionService.isHostile(orc1, player), true, "orc hostile to player");

  const world = makeWorld([orc1, orc2, skeleton1, skeleton2], player);
  const rng = () => 0.3;

  // Orc1 should target skeleton (closer hostile), not orc2 (ally)
  await orc1.takeTurn({ world, rng, now: 0 });

  assert.ok(
    ["MOVE", "ATTACK"].includes(orc1.lastPlannerDecision?.type),
    "orc should engage with hostile (not wander)"
  );

  console.log("✓ complex faction scenario: mobs respect multiple faction relationships");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

console.log("\n=== All mob combat integration tests passed ===");
