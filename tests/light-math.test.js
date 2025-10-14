import { strict as assert } from "node:assert";

import { createCompositeLightContext, compositeOverlayAt } from "../src/world/light_math.js";
import { LIGHT_CHANNELS } from "../js/constants.js";

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

(function testDirectionalLightCone() {
  const lights = [
    { x: 0, y: 0, radius: 4, color: "#ffffff", intensity: 1, angle: 0, width: Math.PI / 3 },
  ];
  const cfg = { baseOverlayAlpha: 0.5 };
  const ctx = createCompositeLightContext(lights, cfg, () => 0);

  const litTile = compositeOverlayAt(1, 0, ctx, cfg);
  assert(litTile.a > 0, "tile inside the cone should receive light");

  const darkTile = compositeOverlayAt(0, 1, ctx, cfg);
  assert.equal(darkTile.a, 0, "tile outside the cone should not receive light");

  console.log("✓ directional lights only illuminate tiles inside their cone");
})();

(function testLightChannelsRespectEntityMasks() {
  const lights = [
    {
      x: 0,
      y: 0,
      radius: 4,
      color: "#ffffff",
      intensity: 1,
      channel: LIGHT_CHANNELS.SPECTRAL,
    },
  ];
  const cfg = { baseOverlayAlpha: 0.5 };
  const ctx = createCompositeLightContext(lights, cfg, () => 0);

  const spectralEntity = [{ lightMask: LIGHT_CHANNELS.SPECTRAL }];
  const normalEntity = [{ lightMask: LIGHT_CHANNELS.NORMAL }];

  const lit = compositeOverlayAt(1, 0, ctx, cfg, null, spectralEntity);
  assert(lit.a > 0, "matching channel should allow lighting");

  const unlit = compositeOverlayAt(1, 0, ctx, cfg, null, normalEntity);
  assert.equal(unlit.a, 0, "non-matching channel should block lighting");

  console.log("✓ light channels respect entity masks");
})();
