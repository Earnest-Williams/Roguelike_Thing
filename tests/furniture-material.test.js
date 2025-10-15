// tests/furniture-material.test.js
// @ts-nocheck

import { Furniture, FurnitureKind } from "../src/world/furniture/furniture.js";
import { STUFF } from "../src/world/stuff.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const base = new Furniture({
  kind: FurnitureKind.DECOR,
  name: "Statue",
  material: "stone",
});

assert(base.material?.id === STUFF.STONE.id, "Base furniture should resolve string materials to Stuff instances");

const clone = base.clone({ material: "marble" });

assert(clone.material?.id === STUFF.MARBLE.id, "Clone should resolve string material overrides");
assert(base.material?.id === STUFF.STONE.id, "Original furniture material should remain unchanged after cloning");

console.log("\u2713 Furniture material resolution works");
