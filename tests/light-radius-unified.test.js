import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLightOverlayContext } from "../src/world/fov.js";
import { Monster } from "../src/game/monster.js";
import { Actor } from "../src/combat/actor.js";

// Meta-guard: prohibit resurrection of legacy Mob class in source.
(function testNoLegacyMobClass() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const root = path.resolve(__dirname, "..");
  function* walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        yield* walk(p);
      } else if (entry.isFile() && p.endsWith(".js")) {
        yield p;
      }
    }
  }
  for (const f of walk(root)) {
    const txt = fs.readFileSync(f, "utf8");
    if (/class\s+Mob\b/.test(txt)) {
      throw new Error(
        `Legacy Mob class found in ${path.relative(root, f)}`,
      );
    }
  }
})();

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
