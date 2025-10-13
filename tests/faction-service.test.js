import { strict as assert } from "node:assert";

import { Actor } from "../src/combat/actor.js";
import { MOB_TEMPLATES } from "../src/content/mobs.js";
import { FactionService } from "../src/game/faction-service.js";
import { Monster } from "../src/game/monster.js";
import {
  foldInnatesIntoModCache,
  foldModsFromEquipment,
  rebuildModCache,
} from "../src/combat/mod-folding.js";

function makeActor({ id, factions, affiliations }) {
  return new Actor({
    id,
    baseStats: {
      str: 5,
      dex: 5,
      int: 5,
      vit: 5,
      con: 5,
      will: 5,
      luck: 5,
      maxHP: 10,
      maxStamina: 10,
      maxMana: 0,
      baseSpeed: 1,
    },
    factions,
    affiliations,
  });
}

(function testSharedFactionAllies() {
  const a = makeActor({ id: "a", factions: ["npc_hostile"], affiliations: [] });
  const b = makeActor({ id: "b", factions: ["npc_hostile"], affiliations: [] });
  assert.equal(
    FactionService.isAllied(a, b),
    true,
    "actors with matching intrinsic factions should be allied",
  );
})();

(function testUnalignedNeverAllies() {
  const chaotic = makeActor({ id: "chaos", factions: ["unaligned"], affiliations: [] });
  const other = makeActor({ id: "other", factions: ["npc_hostile"], affiliations: [] });
  assert.equal(
    FactionService.isAllied(chaotic, other),
    false,
    "unaligned faction should never ally with other factions",
  );
  assert.equal(
    FactionService.isHostile(chaotic, other),
    true,
    "unaligned actors should be hostile to others",
  );
})();

(function testAffiliationsBridgeFactions() {
  const a = makeActor({
    id: "aff_a",
    factions: ["npc_hostile"],
    affiliations: ["bandits:redhands"],
  });
  const b = makeActor({
    id: "aff_b",
    factions: ["neutral"],
    affiliations: ["bandits:redhands"],
  });
  assert.equal(
    FactionService.isAllied(a, b),
    true,
    "shared affiliations should create alliances across factions",
  );
})();

(function testMonsterWrappersUseActorData() {
  function actorFromTemplate(id) {
    const template = MOB_TEMPLATES[id];
    const actor = new Actor({
      id: template.id,
      name: template.name,
      baseStats: template.baseStats,
      factions: template.factions,
      affiliations: template.affiliations,
    });
    Object.defineProperty(actor, "__template", {
      value: template,
      enumerable: false,
      configurable: true,
      writable: false,
    });
    foldModsFromEquipment(actor);
    foldInnatesIntoModCache(actor);
    return actor;
  }

  const orc = new Monster({ actor: actorFromTemplate("orc") });
  const skeleton = new Monster({ actor: actorFromTemplate("skeleton") });

  assert.equal(
    FactionService.isHostile(orc, skeleton),
    true,
    "monster wrappers should proxy allegiance data to the underlying actor",
  );
  assert.equal(
    orc.getLightRadius() >= 1,
    true,
    "orc monsters should expose innate dark vision through getLightRadius",
  );
})();

(function testRebuildModCachePreservesVisionBonus() {
  const template = MOB_TEMPLATES.orc;
  const actor = new Actor({
    id: template.id,
    name: template.name,
    baseStats: template.baseStats,
    factions: template.factions,
    affiliations: template.affiliations,
  });
  Object.defineProperty(actor, "__template", {
    value: template,
    enumerable: false,
    configurable: true,
    writable: false,
  });

  foldModsFromEquipment(actor);
  foldInnatesIntoModCache(actor);
  assert.equal(actor.modCache?.vision?.lightBonus, 1, "innate dark vision should apply");

  rebuildModCache(actor);
  assert.equal(
    actor.modCache?.vision?.lightBonus,
    1,
    "rebuilding the mod cache should preserve innate vision bonuses",
  );
})();

console.log("✓ faction alliances & innate vision");
