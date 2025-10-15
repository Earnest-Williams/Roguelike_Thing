import { strict as assert } from "node:assert";

import { Actor } from "../dist/src/combat/actor.js";
import { MOB_TEMPLATES } from "../dist/src/content/mobs.js";
import { FactionService } from "../dist/src/game/faction-service.js";
// [Unified Implementation] Pull the Monster wrapper from its canonical module.
import { Monster } from "../dist/src/game/monster.js";
import { rebuildModCache } from "../dist/src/combat/mod-folding.js";

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

(function testActorSanitizesFactionsAndAffiliations() {
  const actor = new Actor({
    id: "sanity",
    factions: ["npc_hostile", null, "npc_hostile", ""],
    affiliations: [null, "bandits:redhands", "", "bandits:redhands"],
  });

  assert.deepEqual(actor.factions, ["npc_hostile"], "constructor should dedupe/sanitize factions");
  assert.deepEqual(actor.affiliations, ["bandits:redhands"], "affiliations should omit invalid entries");
})();

(function testSharedFactionAllies() {
  const a = makeActor({ id: "a", factions: ["npc_hostile"], affiliations: [] });
  const b = makeActor({ id: "b", factions: ["npc_hostile"], affiliations: [] });
  assert.equal(
    FactionService.isAllied(a, b),
    true,
    "actors with matching intrinsic factions should be allied",
  );
  assert.equal(
    FactionService.isFriendly(a, b),
    true,
    "friendly helper should mirror allied checks",
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
    FactionService.isFriendly(chaotic, other),
    false,
    "unaligned faction should not be marked friendly",
  );
  assert.equal(
    FactionService.isHostile(chaotic, other),
    true,
    "unaligned actors should be hostile to others",
  );
  assert.equal(
    FactionService.relation(chaotic, other),
    -1,
    "unaligned faction should register hostile relation versus other factions",
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
  assert.equal(
    FactionService.isFriendly(a, b),
    true,
    "shared affiliations should report as friendly",
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
    rebuildModCache(actor);
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
    FactionService.relation(orc, skeleton),
    -1,
    "monster wrappers should compute hostile relations via FactionService",
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

  rebuildModCache(actor);
  assert.equal(actor.modCache?.vision?.lightBonus, 1, "innate dark vision should apply");

  rebuildModCache(actor);
  assert.equal(
    actor.modCache?.vision?.lightBonus,
    1,
    "rebuilding the mod cache should preserve innate vision bonuses",
  );
})();

(function testFactionlessActorsAreHostileToFactionedOpponents() {
  const loner = makeActor({ id: "loner", factions: [], affiliations: [] });
  const raider = makeActor({ id: "raider", factions: ["npc_hostile"], affiliations: [] });

  assert.equal(
    FactionService.isHostile(loner, raider),
    true,
    "actors without factions should be treated as hostile toward factioned opponents",
  );
  assert.equal(
    FactionService.relation(loner, raider),
    -1,
    "relation() should report hostility when one side lacks factions",
  );
})();

(function testFactionlessPeersRemainNeutral() {
  const a = makeActor({ id: "fa", factions: [], affiliations: [] });
  const b = makeActor({ id: "fb", factions: [], affiliations: [] });

  assert.equal(FactionService.isHostile(a, b), false, "two factionless actors should not be hostile");
  assert.equal(FactionService.relation(a, b), 0, "relation should be neutral for factionless peers");
})();

(function testRelationTreatsSelfAsFriendly() {
  const self = makeActor({ id: "self", factions: ["neutral"], affiliations: [] });
  assert.equal(FactionService.relation(self, self), 1, "actor should be friendly to itself");
})();

(function testDeepWrapperResolution() {
  const allied = makeActor({ id: "ally", factions: ["player_allies"], affiliations: [] });
  const wrapped = { actor: { __actor: allied } };

  assert.equal(
    FactionService.isAllied(wrapped, allied),
    true,
    "wrapper objects should resolve down to the underlying actor",
  );
})();

console.log("✓ faction alliances, hostility edges & innate vision");
