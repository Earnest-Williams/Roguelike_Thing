import { strict as assert } from "node:assert";

import { TILE_FLOOR } from "../js/constants.js";
import {
  collectWorldLightSources,
  updatePerception,
} from "../src/sim/senses.js";

function makeMap(width, height) {
  const grid = Array.from({ length: height }, () => Array(width).fill(TILE_FLOOR));
  return { width, height, grid, furniture: [], groundItems: [] };
}

(function testCollectWorldLights() {
  const mapState = makeMap(10, 10);
  mapState.furniture.push({
    id: "sconce",
    x: 2,
    y: 1,
    metadata: { emitsLight: true, radius: 4 },
  });
  mapState.groundItems.push({
    id: "drop-torch",
    x: 6,
    y: 5,
    item: { emitsLight: true, lit: true, radius: 3 },
  });

  const player = {
    id: "player",
    x: 5,
    y: 5,
    equipment: {
      slots: new Map([
        ["main", { id: "lantern", emitsLight: true, lit: true, radius: 5 }],
      ]),
    },
  };

  const lights = collectWorldLightSources({ player, mapState, mobManager: null });
  assert.equal(lights.length, 3, "expected equipment, furniture, and ground lights to be collected");
  const carried = lights.find((entry) => entry.ownerId === "player");
  assert(carried, "should track carried light source");
  assert.equal(carried.radius, 5, "should preserve carried light radius");
  assert(lights.some((entry) => entry.id === "sconce"), "should include furniture light sources");
  assert(
    lights.some((entry) => entry.id === "drop-torch"),
    "should include ground light sources",
  );
  console.log("✓ collectWorldLightSources aggregates world lights");
})();

(function testUpdatePerception() {
  const mapState = makeMap(7, 7);
  const player = {
    id: "seer",
    x: 3,
    y: 3,
    getLightRadius() {
      return 4;
    },
    equipment: {
      slots: new Map([
        ["hand", { id: "lamp", emitsLight: true, lit: true, radius: 4 }],
      ]),
    },
  };
  const goblin = {
    id: "goblin",
    x: 5,
    y: 3,
    getLightRadius() {
      return 0;
    },
  };
  mapState.groundItems.push({
    id: "beacon",
    x: 5,
    y: 3,
    item: { emitsLight: true, lit: true, radius: 2 },
  });

  const mobManager = {
    list() {
      return [goblin];
    },
  };

  updatePerception({ player, mobManager, mapState });

  assert(player.perception, "player should receive perception data");
  assert(player.perception.fov instanceof Set, "player FOV should be a Set of coordinates");
  assert(
    player.perception.visibleActors.includes(goblin),
    "goblin should be visible to the player",
  );
  assert(
    player.perception.visibleLights.some((entry) => entry.id === "beacon"),
    "ground light should be visible to the player",
  );

  assert(goblin.perception, "goblin should receive perception struct even with zero vision");
  assert.equal(goblin.perception.fov, null, "goblin FOV should be null when vision radius is zero");
  assert.equal(goblin.perception.visibleActors.length, 0, "goblin should not see any actors");
  assert.equal(goblin.perception.visibleLights.length, 0, "goblin should not see any lights");
  console.log("✓ updatePerception populates actors and lights");
})();
