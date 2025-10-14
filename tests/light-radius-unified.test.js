import { strict as assert } from "node:assert";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLightOverlayContext } from "../src/world/fov.js";
import { Monster } from "../src/game/monster.js";
import { Actor } from "../src/combat/actor.js";
import { SLOT } from "../js/constants.js";

// Meta-guard: prohibit resurrection of legacy Mob class in source.
(async function testNoLegacyMobClass() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const root = path.resolve(__dirname, "..");

  async function* walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      err.message = `Failed to read directory ${dir}: ${err.message}`;
      throw err;
    }
    for (const entry of entries) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        for await (const sub of walk(p)) {
          yield sub;
        }
      } else if (entry.isFile() && p.endsWith(".js")) {
        yield p;
      }
    }
  }

  for await (const f of walk(root)) {
    const txt = await readFile(f, "utf8");
    if (/class\s+Mob\b/.test(txt)) {
      throw new Error(
        `Legacy Mob class found in ${path.relative(root, f)}`,
      );
    }
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

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

function testActorReadsLightPropertiesFromPlainEquipment() {
  const torch = {
    id: "torch",
    emitsLight: true,
    lit: true,
    radius: 2,
    lightRadius: 2,
    flickerRate: 3.5,
    lightColor: "#f80",
  };
  const lantern = {
    id: "lantern",
    emitsLight: true,
    lit: true,
    radius: 5,
    lightRadius: 5,
    flickerRate: 1.2,
    lightColor: "#fff",
  };
  const actor = new Actor({
    id: "torch-test",
    baseStats: { baseSpeed: 1, maxHP: 1 },
    equipment: { [SLOT.LeftHand]: torch },
  });

  assert.equal(actor.getLightRadius(), 2, "actor should read light radius from equipped torch");
  assert.equal(
    actor.getLightFlickerRate(),
    torch.flickerRate,
    "actor should expose torch flicker rate",
  );
  assert.equal(
    actor.getLightColor(),
    torch.lightColor,
    "actor should expose torch light color",
  );

  actor.equipment[SLOT.RightHand] = lantern;
  assert.equal(
    actor.getLightRadius(),
    5,
    "actor should choose the strongest light radius rather than summing",
  );
  assert.equal(
    actor.getLightColor(),
    lantern.lightColor,
    "actor should update light color to match the strongest light source",
  );

  lantern.lit = false;
  assert.equal(
    actor.getLightRadius(),
    2,
    "unlit light sources should not contribute to the actor's light radius",
  );
}

function testLightOverlayUsesActorFlickerRate() {
  const flickerRate = 3.5;
  const player = {
    x: 0,
    y: 0,
    getLightRadius() {
      return 4;
    },
    getLightFlickerRate() {
      return flickerRate;
    },
    equipment: {
      getLightFlickerRate() {
        return 0.5;
      },
    },
  };

  const nowMs = 1337;
  const ctx = createLightOverlayContext(player, { fallbackFlickerRate: 0 }, () => nowMs);
  const expectedOsc = Math.sin((nowMs / 1000) * 2 * Math.PI * flickerRate);
  assert.equal(
    ctx.osc,
    expectedOsc,
    "light overlay should prefer the player's flicker rate accessor over equipment fallback",
  );
}

export function testUnifiedLightRadiusAccessors() {
  testLightOverlayRespectsGetter();
  testMonsterDelegatesToActorGetter();
  testActorReadsLightPropertiesFromPlainEquipment();
  testLightOverlayUsesActorFlickerRate();
  console.log("✓ light radius & flicker delegate to Actor accessors");
}

(function runLightRadiusTests() {
  testUnifiedLightRadiusAccessors();
})();
