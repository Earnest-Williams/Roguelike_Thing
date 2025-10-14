import { strict as assert } from "node:assert";

import { foldInnatesIntoModCache } from "../src/combat/mod-folding.js";

(function testActorInnatesFold() {
  const actor = {
    modCache: {
      resists: {},
      affinities: {},
      defense: { resists: {} },
      offense: { affinities: {} },
      vision: { lightBonus: 0 },
    },
    innates: {
      resists: { fire: 0.1 },
      affinities: { fire: 0.2 },
      vision: { lightBonus: 2 },
    },
  };

  foldInnatesIntoModCache(actor);

  assert.equal(actor.modCache.resists.fire, 0.1, "actor innates should add resists");
  assert.equal(
    actor.modCache.defense.resists.fire,
    0.1,
    "defense bucket mirrors innate resists",
  );
  assert.equal(actor.modCache.affinities.fire, 0.2, "innate affinities apply globally");
  assert.equal(
    actor.modCache.offense.affinities.fire,
    0.2,
    "offense affinities mirror innate affinities",
  );
  assert.equal(actor.modCache.vision.lightBonus, 2, "vision bonus adds to cache");
  console.log("✓ innates from actor objects fold into cache");
})();

(function testTemplateInnatesFallback() {
  const actor = {
    modCache: {
      resists: {},
      affinities: {},
      defense: { resists: {} },
      offense: { affinities: {} },
      vision: { lightBonus: 0 },
    },
    __template: {
      innate: {
        resists: { cold: 0.25 },
        affinities: { frost: 0.15 },
        vision: { lightBonus: 1 },
      },
    },
  };

  foldInnatesIntoModCache(actor);

  assert.equal(actor.modCache.resists.cold, 0.25, "template resists should fold");
  assert.equal(
    actor.modCache.offense.affinities.frost,
    0.15,
    "template affinities should fold",
  );
  assert.equal(actor.modCache.vision.lightBonus, 1, "template vision bonus should fold");
  console.log("✓ template innates still fold into cache");
})();
