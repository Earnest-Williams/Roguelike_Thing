import { strict as assert } from "node:assert";

import { TILE_FLOOR } from "../js/constants.js";
import { collectWorldLightSources, updatePerception } from "../dist/src/sim/senses.js";

function makeMap(width, height) {
  const grid = Array.from({ length: height }, () => Array(width).fill(TILE_FLOOR));
  return { width, height, grid, furniture: [], groundItems: [], features: [] };
}

(function testCollectWorldLights() {
  const mapState = makeMap(10, 10);
  mapState.features = [
    { id: "sconce", x: 2, y: 1, light: { radius: 4, color: "#ffaa66" } },
  ];
  mapState.furniture = [
    {
      position: { x: 4, y: 2 },
      furniture: {
        id: "lamp", light: { radius: 3, color: "#ddeeff", intensity: 0.75 },
      },
    },
  ];

  const droppedTorch = {
    id: "drop-torch",
    x: 6,
    y: 5,
    item: { light: { radius: 3, color: "#ffcc88", intensity: 0.9, flickerRate: 5 } },
  };

  const player = {
    id: "player",
    x: 5,
    y: 5,
    getLightEmitters() {
      return [{ radius: 5, color: "#ffe9a6", intensity: 1, flickerRate: 2 }];
    },
  };

  const lights = collectWorldLightSources({
    player,
    entities: [droppedTorch],
    mobs: [],
    mapState,
  });
  assert.equal(
    lights.length,
    4,
    "expected actor, feature, fixture, and dropped item lights to be collected",
  );
  const carried = lights.find((entry) => entry.id.startsWith("actor:player"));
  assert(carried, "should track carried light source");
  assert.equal(carried.radius, 5, "should preserve carried light radius");
  assert.deepEqual(carried.color, { r: 255, g: 233, b: 166 }, "should normalize actor light color");
  const sconce = lights.find((entry) => entry.id.includes("sconce"));
  assert(sconce, "should include feature light sources");
  assert(sconce?.color, "feature light should provide rgb color data");
  const lamp = lights.find((entry) => entry.id.includes("lamp"));
  assert(lamp, "should include furniture fixtures with lights");
  assert.equal(lamp.radius, 3, "fixture light radius should be preserved");
  const torch = lights.find((entry) => entry.id.includes("drop-torch"));
  assert(torch, "should include dropped item light sources");
  assert.equal(torch.intensity, 0.9, "should preserve dropped item intensity");
  assert.equal(torch.flickerRate, 5, "should expose dropped item flicker rate");
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
  mapState.features = [
    {
      id: "beacon",
      x: 5,
      y: 3,
      light: { radius: 2, intensity: 0.8 },
    },
  ];

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
    player.perception.visibleLights.some((entry) => entry.id.includes("beacon")),
    "feature light should be visible to the player",
  );

  assert(goblin.perception, "goblin should receive perception struct even with zero vision");
  assert.equal(goblin.perception.fov, null, "goblin FOV should be null when vision radius is zero");
  assert.equal(goblin.perception.visibleActors.length, 0, "goblin should not see any actors");
  assert.equal(goblin.perception.visibleLights.length, 0, "goblin should not see any lights");
  console.log("✓ updatePerception populates actors and lights");
})();
