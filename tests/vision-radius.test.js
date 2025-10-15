import { strict as assert } from "node:assert";

import { Actor } from "../dist/src/combat/actor.js";
import { rebuildModCache } from "../dist/src/combat/mod-folding.js";
import { SLOT } from "../js/constants.js";

(function testInnateVisionStacksWithEquipmentRadius() {
  const actor = new Actor({
    id: "vision-stack",
    baseStats: { baseSpeed: 1, maxHP: 1 },
  });
  actor.innates = { vision: { lightBonus: 2 } };
  actor.equipment[SLOT.LeftHand] = {
    id: "torch",
    emitsLight: true,
    lit: true,
    radius: 3,
    lightRadius: 3,
    lightColor: "#fff",
  };

  rebuildModCache(actor);

  assert.equal(actor.modCache.vision.lightBonus, 2, "innate vision should populate mod cache");
  assert.equal(actor.getLightRadius(), 5, "innate bonus should add to equipment light radius");

  const props = actor.getLightSourceProperties();
  assert.equal(props.radius, 5, "light source properties should include innate bonus");
  assert.equal(props.color, "#fff", "light color should be preserved from equipment source");

  console.log("✓ innate vision bonus stacks with equipment radius");
})();

(function testEquipmentAccessorsStillIncorporateInnateBonus() {
  const actor = new Actor({
    id: "vision-accessor",
    baseStats: { baseSpeed: 1, maxHP: 1 },
  });
  actor.innates = { vision: { lightBonus: 1 } };
  actor.equipment.getLightRadius = () => 6;
  actor.equipment.getLightSourceProperties = () => ({ radius: 6, color: "#0ff", flickerRate: 0 });

  rebuildModCache(actor);

  assert.equal(actor.getLightRadius(), 7, "equipment getLightRadius() should include innate bonus");
  const props = actor.getLightSourceProperties();
  assert.equal(props.radius, 7, "equipment accessor radius should include innate bonus");
  assert.equal(props.color, "#0ff", "equipment accessor color should be forwarded");

  console.log("✓ innate bonus applies when equipment exposes custom light accessors");
})();

(function testRebuildModCacheRefreshesVisionBonus() {
  const actor = new Actor({
    id: "vision-refresh",
    baseStats: { baseSpeed: 1, maxHP: 1 },
  });
  actor.innates = { vision: { lightBonus: 3 } };

  rebuildModCache(actor);
  assert.equal(actor.modCache.vision.lightBonus, 3, "initial rebuild should apply innate bonus");
  assert.equal(actor.getLightRadius(), 3, "innate bonus alone should drive light radius");

  actor.innates.vision.lightBonus = 1;
  rebuildModCache(actor);
  assert.equal(
    actor.modCache.vision.lightBonus,
    1,
    "rebuilding the cache should refresh innate bonus values instead of stacking",
  );
  assert.equal(actor.getLightRadius(), 1, "light radius should reflect refreshed innate bonus");

  console.log("✓ rebuildModCache refreshes innate vision bonuses");
})();
