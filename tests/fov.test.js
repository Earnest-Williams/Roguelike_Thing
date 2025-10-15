import { strict as assert } from "node:assert";

import { computeFieldOfView } from "../dist/src/world/fov.js";
import { TILE_WALL } from "../js/constants.js";

function buildMap(width, height, wallPositions = []) {
  const grid = Array.from({ length: height }, () => Array(width).fill(0));
  const known = Array.from({ length: height }, () => Array(width).fill(0));
  for (const { x, y } of wallPositions) {
    if (y >= 0 && y < height && x >= 0 && x < width) {
      grid[y][x] = TILE_WALL;
      known[y][x] = TILE_WALL;
    }
  }
  return { width, height, grid, known };
}

function key(x, y) {
  return `${x},${y}`;
}

function testUnobstructedFovCoversChebyshevRadius() {
  const map = buildMap(5, 5);
  const origin = { x: 2, y: 2 };
  const radius = 2;
  const visible = computeFieldOfView(origin, radius, map);
  const radiusSq = radius * radius;
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      if (dx * dx + dy * dy <= radiusSq) {
        assert(
          visible.has(key(origin.x + dx, origin.y + dy)),
          `expected tile ${origin.x + dx},${origin.y + dy} to be visible`,
        );
      }
    }
  }
  console.log("✓ FOV covers Chebyshev radius when unobstructed");
}

function testWallsBlockTilesBehindThem() {
  const map = buildMap(5, 5, [{ x: 3, y: 2 }]);
  const origin = { x: 1, y: 2 };
  const radius = 4;
  const visible = computeFieldOfView(origin, radius, map);
  assert(visible.has(key(3, 2)), "wall tile should still be visible");
  assert(!visible.has(key(4, 2)), "tile behind wall should be hidden");
  console.log("✓ FOV respects blocking walls");
}

function testKnownGridTreatsUnknownAsTransparent() {
  const map = buildMap(5, 5, [{ x: 3, y: 2 }]);
  map.known[2][3] = -1;
  const origin = { x: 1, y: 2 };
  const radius = 4;
  const visible = computeFieldOfView(origin, radius, map, { useKnownGrid: true });
  assert(
    visible.has(key(4, 2)),
    "unknown cell in known-grid context should not block visibility",
  );
  console.log("✓ Known-grid exploration ignores unknown blockers");
}

(function runFovTests() {
  testUnobstructedFovCoversChebyshevRadius();
  testWallsBlockTilesBehindThem();
  testKnownGridTreatsUnknownAsTransparent();
})();
