import { strict as assert } from "node:assert";

import { createCompositeLightContext, compositeOverlayAt } from "../src/world/light_math.js";

(function testCompositeOverlayRespectsLosFn() {
  const lights = [
    { x: 0, y: 0, radius: 4, color: "#ffffff", intensity: 1 },
  ];
  const cfg = { baseOverlayAlpha: 0.5 };
  const ctx = createCompositeLightContext(lights, cfg, () => 0);

  const visible = compositeOverlayAt(
    1,
    0,
    ctx,
    cfg,
    () => true,
  );
  assert(visible.a > 0, "light should contribute when losFn returns true");

  const blocked = compositeOverlayAt(
    1,
    0,
    ctx,
    cfg,
    () => false,
  );
  assert.equal(blocked.a, 0, "light should not contribute when losFn returns false");
  assert.equal(blocked.rgb, null, "blocked contributions should not tint the overlay");

  console.log("✓ compositeOverlayAt respects losFn gates");
})();
