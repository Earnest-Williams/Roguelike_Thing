import { strict as assert } from "node:assert";

import { TILE_WALL } from "../js/constants.js";
import { computeVisionWithLights } from "../dist/src/world/vision.js";

function buildMap(width, height, walls = []) {
  const grid = Array.from({ length: height }, () => Array(width).fill(0));
  const known = Array.from({ length: height }, () => Array(width).fill(0));
  for (const { x, y } of walls) {
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    grid[y][x] = TILE_WALL;
    known[y][x] = TILE_WALL;
  }
  return { width, height, grid, known };
}

(function testRemoteLightExtendsVisibility() {
  const map = buildMap(12, 1);
  const origin = { x: 0, y: 0 };
  const baseRadius = 2;
  const lights = [{ id: "torch", x: 6, y: 0, radius: 3 }];

  const vision = computeVisionWithLights({
    origin,
    baseRadius,
    mapState: map,
    lights,
  });

  assert(vision.visible instanceof Set, "vision should produce a set of visible tiles");
  assert(
    vision.visible.has("6,0"),
    "player should see the distant light source when it is in line of sight",
  );
  assert(
    vision.visible.has("7,0"),
    "tiles lit by the distant light should become visible",
  );
  assert(
    vision.extraLit.has("6,0") && vision.extraLit.has("7,0"),
    "extraLit should track tiles revealed via remote lighting",
  );
  assert(
    !vision.baseVisible.has("7,0"),
    "base visibility should not include tiles outside the player's personal radius",
  );
  console.log("✓ remote light sources extend player visibility");
})();

(function testBlockedLightDoesNotRevealBeyondWall() {
  const map = buildMap(12, 1, [{ x: 3, y: 0 }]);
  const origin = { x: 0, y: 0 };
  const baseRadius = 2;
  const lights = [{ id: "torch", x: 6, y: 0, radius: 3 }];

  const vision = computeVisionWithLights({
    origin,
    baseRadius,
    mapState: map,
    lights,
  });

  assert(
    !vision.visible.has("6,0"),
    "a wall between the player and the light should block visibility of the light",
  );
  assert(
    !vision.visible.has("7,0"),
    "tiles lit beyond a blocking wall should remain unseen",
  );
  console.log("✓ line-of-sight blockers suppress remote lighting visibility");
})();
