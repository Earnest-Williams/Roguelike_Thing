import { strict as assert } from "node:assert";

import { TILE_FLOOR } from "../js/constants.js";
import { buildSpawnWeights, spawnMonsters } from "../src/game/spawn.js";
import { Monster } from "../src/game/monster.js";

function sequenceRng(values) {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
}

class StubMobManager {
  constructor() {
    this.list = [];
  }
  add(mob) {
    this.list.push(mob);
    return mob;
  }
  getMobAt(x, y) {
    return this.list.find((m) => m.x === x && m.y === y) || null;
  }
  reindex() {
    // no-op for tests
  }
}

(function testTagFiltering() {
  const weights = buildSpawnWeights({ includeTags: ["orc"] });
  assert(weights.some((entry) => entry.id === "orc"), "orc template should be available when requested by tag");
  assert(!weights.some((entry) => entry.id === "skeleton"), "templates without the requested tag should be filtered out");
  console.log("✓ spawn weights filter by tags");
})();

(function testSpawnCreatesMobs() {
  const size = 12;
  const maze = Array.from({ length: size }, () => Array(size).fill(TILE_FLOOR));
  const mobManager = new StubMobManager();
  const rng = sequenceRng([0, 0.1, 0.2, 0.3, 0.8, 0.9]);
  const gameCtx = { maze, mobManager, player: null };

  const spawned = spawnMonsters(gameCtx, { count: 2, includeTags: ["orc"], rng });

  assert.equal(spawned, 2, "expected two mobs to spawn");
  assert.equal(mobManager.list.length, 2, "mob manager should track spawned mobs");
  for (const mob of mobManager.list) {
    assert(mob instanceof Monster, "spawned mobs should be Monster instances");
    assert(mob?.actor, "spawned entities should expose their actor");
    assert.equal(mob.actor.id, "orc", "spawned mob should match requested template");
    assert(Number.isInteger(mob.x) && Number.isInteger(mob.y), "spawned mobs should have integer coordinates");
  }
  console.log("✓ spawnMonsters populates mobs from templates");
})();
