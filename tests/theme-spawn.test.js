import { strict as assert } from "node:assert";

import { TILE_FLOOR } from "../js/constants.js";
import { spawnByIdCounts } from "../src/game/spawn.js";
import { MOB_TEMPLATES } from "../src/content/mobs.js";
import { Monster } from "../src/game/monster.js";

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

function makeMaze(size = 8) {
  return Array.from({ length: size }, () => Array(size).fill(TILE_FLOOR));
}

function sequenceRng(values) {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
}

(function testRoleOverlayTagFiltering() {
  const maze = makeMaze();
  const mobManager = new StubMobManager();
  const player = { x: 1, y: 1 };
  const theme = {
    roleOverlay: {
      id: "role_vanguard_captain",
      includeTags: ["undead"],
      roleIds: ["role_vanguard_captain"],
    },
    roleOverlayCandidates: [
      {
        id: "role_skirmisher_pack",
        includeTags: ["goblin"],
        roleIds: ["role_skirmisher_pack"],
      },
    ],
  };
  const gameCtx = { maze, mobManager, player, state: { chapter: { theme } } };

  const rng = sequenceRng([0.1, 0.3, 0.5, 0.7, 0.9, 0.2]);
  const spawned = spawnByIdCounts(gameCtx, { skeleton: 1, orc: 1 }, 0, rng);

  assert.equal(spawned, 2, "expected both requested mobs to spawn");
  const skeleton = mobManager.list.find((mob) => mob.actor?.id === "skeleton");
  const orc = mobManager.list.find((mob) => mob.actor?.id === "orc");
  assert(skeleton instanceof Monster, "skeleton spawn should be a Monster");
  assert(orc instanceof Monster, "orc spawn should be a Monster");
  assert.deepEqual(skeleton.roleIds, ["role_vanguard_captain"], "matching tags should apply overlay roles");
  assert.equal(skeleton.roleOverlayId, "role_vanguard_captain", "overlay id should be attached to matching mobs");
  assert.equal(orc.roleIds.length, 0, "non-matching tags should not receive overlay roles");
  assert.equal(orc.roleOverlayId, null, "non-matching mobs should not carry an overlay id");
  assert.deepEqual(skeleton.actor.factions, MOB_TEMPLATES.skeleton.factions, "roles should not change faction alignment");
  assert.deepEqual(orc.actor.factions, MOB_TEMPLATES.orc.factions, "overlay skips should leave factions untouched");
  console.log("✓ role overlays respect include/exclude tags and preserve factions");
})();

(function testOverlayCandidatesAndGuardPreservation() {
  const maze = makeMaze();
  const mobManager = new StubMobManager();
  const player = { x: 2, y: 2 };
  const theme = {
    roleOverlay: {
      id: "role_ritual_chorus",
      includeTags: ["construct"],
      roleIds: ["role_ritual_chorus"],
    },
    roleOverlayCandidates: [
      {
        id: "role_vanguard_captain",
        includeTags: ["undead"],
        roleIds: ["role_vanguard_captain"],
      },
    ],
  };
  const gameCtx = { maze, mobManager, player, state: { chapter: { theme } } };

  const rng = sequenceRng([0.2, 0.4]);
  const spawned = spawnByIdCounts(gameCtx, { skeleton: 1 }, 0, rng);
  assert.equal(spawned, 1, "expected fallback candidate to spawn skeleton");

  const skeleton = mobManager.list[0];
  assert(skeleton instanceof Monster, "spawn should wrap the actor in a Monster instance");
  assert.deepEqual(skeleton.roleIds, ["role_vanguard_captain"], "candidate overlay should provide role ids");
  assert.equal(skeleton.roleOverlayId, "role_vanguard_captain", "candidate overlay id should be preserved");

  const templateGuard = MOB_TEMPLATES.skeleton.guard;
  assert.deepEqual(
    skeleton.guard?.anchorOffset,
    templateGuard.anchorOffset,
    "guard anchor offset should remain intact after overlays",
  );
  assert.equal(skeleton.actor.guardRadius, templateGuard.radius, "actor guard radius should match template");
  assert.equal(skeleton.actor.guardResumeBias, templateGuard.resumeBias, "guard resume bias should remain unchanged");
  console.log("✓ overlay candidates apply roles without disturbing guard metadata");
})();
