import { strict as assert } from "node:assert";
import { createLightOverlayContext } from "../src/world/fov.js";
import { Monster } from "../src/game/monster.js";
import { Actor } from "../src/combat/actor.js";

function testLightOverlayRespectsGetter() {
  const player = {
    x: 3,
    y: 4,
    lightRadius: 0,
    getLightRadius() {
      return 6;
    },
    equipment: {
      getLightFlickerRate() {
        return 0;
      },
    },
  };

  const ctx = createLightOverlayContext(player, {}, () => 0);
  assert.equal(
    ctx.radius,
    6,
    "light overlay context should pull radius from getLightRadius()",
  );
}

function testMonsterDelegatesToActorGetter() {
  const actor = new Actor({
    id: "vision-test",
    baseStats: { baseSpeed: 1, maxHP: 1 },
  });
  actor.equipment.getLightRadius = () => 3;
  actor.modCache.vision.lightBonus = 2;

  const monster = new Monster({ actor });
  assert.equal(
    monster.getLightRadius(),
    5,
    "monster should delegate getLightRadius() to the underlying actor",
  );
}

export function testUnifiedLightRadiusAccessors() {
  testLightOverlayRespectsGetter();
  testMonsterDelegatesToActorGetter();
  console.log("✓ light radius delegates to Actor.getLightRadius()");
}

(function runLightRadiusTests() {
  testUnifiedLightRadiusAccessors();
})();
