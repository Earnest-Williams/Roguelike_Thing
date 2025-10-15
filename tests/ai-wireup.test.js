import { strict as assert } from "node:assert";

import { TILE_FLOOR, TILE_WALL } from "../js/constants.js";
import { createMobFromTemplate } from "../src/factories/index.js";
import { planTurn, AIPlanner } from "../src/combat/ai-planner.js";

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

function makeWorld(monster, player = null, width = 9, height = 9) {
  const grid = makeGrid(width, height);
  const mobManager = {
    list: () => [monster],
    getMobAt(x, y) {
      if (Number.isFinite(monster?.x) && Number.isFinite(monster?.y)) {
        if (monster.x === x && monster.y === y) return monster;
      }
      if (player && Number.isFinite(player.x) && Number.isFinite(player.y)) {
        if (player.x === x && player.y === y) return player;
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

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

(async function testMonsterWandersWithinLeash() {
  const monster = createMobFromTemplate("orc");
  monster.pos = { x: 4, y: 4 };
  monster.wanderRadius = 3;
  monster.getLightRadius = () => 6;
  if (monster.actor) {
    monster.actor.getLightRadius = () => 6;
  }

  const world = makeWorld(monster);
  const rng = () => 0.1;
  const origin = { ...monster.pos };

  let moved = false;
  for (let i = 0; i < 6; i += 1) {
    await monster.takeTurn({ world, rng, now: i });
    if (monster.x !== origin.x || monster.y !== origin.y) {
      moved = true;
      break;
    }
  }

  assert.equal(moved, true, "idle monster should eventually wander");
  const leashDist = manhattan(monster, monster.spawnPos ?? origin);
  assert.ok(leashDist <= (monster.wanderRadius ?? 6), "wander should respect leash radius");
  console.log("✓ monster wanders within leash when idle");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

(async function testMonsterApproachesVisibleHostile() {
  const monster = createMobFromTemplate("orc");
  monster.pos = { x: 2, y: 2 };
  monster.wanderRadius = 4;
  monster.getLightRadius = () => 8;
  if (monster.actor) {
    monster.actor.getLightRadius = () => 8;
  }

  const player = {
    id: "player-test",
    name: "Player",
    factions: ["player"],
    affiliations: [],
    x: 6,
    y: 2,
    res: { hp: 20 },
    base: { maxHP: 20 },
    getLightRadius: () => 8,
  };

  const world = makeWorld(monster, player, 10, 5);
  const rng = () => 0.25;
  const startDistance = manhattan(monster, player);

  await monster.takeTurn({ world, rng, now: 0 });

  const afterDistance = manhattan(monster, player);
  assert.ok(afterDistance < startDistance, "monster should close distance to visible hostile");
  assert.ok(monster.lastPlannerDecision, "planner decision should be recorded for debug overlay");
  console.log("✓ monster approaches visible hostile");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

(async function testMonsterGuardsHomePosition() {
  const monster = createMobFromTemplate("orc");
  monster.homePos = { x: 4, y: 4 };
  monster.spawnPos = { ...monster.homePos };
  monster.pos = { x: 6, y: 4 };
  monster.guardRadius = 1;
  monster.wanderRadius = 4;
  monster.getLightRadius = () => 6;
  if (monster.actor) {
    monster.actor.getLightRadius = () => 6;
  }

  const world = makeWorld(monster);
  const rng = () => 0.3;

  const startDistance = manhattan(monster, monster.homePos);
  await monster.takeTurn({ world, rng, now: 0 });
  const afterDistance = manhattan(monster, monster.homePos);

  assert.ok(afterDistance < startDistance, "guard should pull monster toward home");
  assert.ok(afterDistance <= (monster.guardRadius ?? 1), "guard should respect radius");
  console.log("✓ guard decision pulls monster toward home");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

(function testPlannerSkipsMoveWithoutTargetCoords() {
  const monster = createMobFromTemplate("orc");
  monster.pos = { x: 4, y: 4 };
  monster.getLightRadius = () => 6;
  if (monster.actor) {
    monster.actor.getLightRadius = () => 6;
  }

  const target = {
    id: "mystery",
    name: "Mystery",
    factions: ["player"],
    affiliations: [],
    res: { hp: 10 },
    base: { maxHP: 10 },
    getLightRadius: () => 6,
  };

  const size = 9;
  const maze = Array.from({ length: size }, () => Array(size).fill(TILE_FLOOR));
  const mobManager = { list: () => [monster] };
  const world = { maze, mobManager, player: target };

  const decision = planTurn({ actor: monster, combatant: monster.actor, world });
  assert.equal(
    decision.type,
    "WANDER",
    "planner should not emit a MOVE decision without a resolvable target position",
  );
  assert.match(decision.todo ?? "", /TODO/i, "wander fallback should advertise TODO for richer behavior");
  console.log("✓ planner falls back to wander when target position is unknown");
})();

(function testContextTryMoveHonorsCollisions() {
  const monster = createMobFromTemplate("orc");
  monster.pos = { x: 1, y: 1 };
  const actor = monster.actor;
  if (actor) {
    actor.getLightRadius = () => 6;
  }

  const player = {
    id: "planner-wall-target",
    name: "Player",
    factions: ["player"],
    affiliations: [],
    x: 3,
    y: 1,
    res: { hp: 10 },
    base: { maxHP: 10 },
    getLightRadius: () => 6,
  };

  const width = 5;
  const height = 5;
  const maze = makeGrid(width, height);
  maze[1][2] = TILE_WALL; // block the direct path to the player

  const mobManager = {
    list: () => [monster],
    getMobAt(x, y) {
      if (monster.x === x && monster.y === y) return monster;
      return null;
    },
  };

  let attempted = false;
  const context = {
    selfMob: monster,
    maze,
    mapState: { width, height, grid: maze },
    mobManager,
    player,
    tryMove(entity, step) {
      attempted = true;
      entity.x += step.dx;
      entity.y += step.dy;
      return true;
    },
  };

  AIPlanner.takeTurn(monster, context);

  assert.equal(attempted, false, "collision guard should prevent delegating to context.tryMove across walls");
  assert.equal(monster.x, 1, "monster should remain in place when wall blocks movement");
  assert.equal(monster.y, 1, "monster should remain in place when wall blocks movement");
  console.log("✓ planner avoids context.tryMove collisions");
})();
