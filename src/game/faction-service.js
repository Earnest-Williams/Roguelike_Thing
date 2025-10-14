// src/game/faction-service.js
// @ts-check

/**
 * @file Centralizes all logic for determining allegiance between actors.
 * This service is the single source of truth for whether two actors are hostile.
 * It does NOT handle self-comparison; that is the responsibility of the AI layer.
 */

export const FactionService = {
  /**
   * Determines if two actors are allied.
   * @param {import('../combat/actor.js').Actor|any} a
   * @param {import('../combat/actor.js').Actor|any} b
   * @returns {boolean}
   */
  isAllied(a, b) {
    if (!a || !b) return false;

    const actorA = toActor(a);
    const actorB = toActor(b);
    if (!actorA || !actorB) return false;

    const A = new Set(actorA.factions || []);
    const B = new Set(actorB.factions || []);

    // "unaligned" allies no one.
    if (A.has("unaligned") || B.has("unaligned")) return false;

    // intrinsic faction overlap → allied
    for (const fa of A) if (B.has(fa)) return true;

    // optional: shared affiliation → allied
    const AA = new Set(actorA.affiliations || []);
    const BB = new Set(actorB.affiliations || []);
    for (const tag of AA) if (BB.has(tag)) return true;

    return false;
  },

  /**
   * Determines if two actors are hostile. This is the inverse of `isAllied`.
   * @param {import('../combat/actor.js').Actor|any} a
   * @param {import('../combat/actor.js').Actor|any} b
   * @returns {boolean}
   */
  isHostile(a, b) {
    return this.relation(a, b) < 0;
  },

  /**
   * Canonical relation score between two entities.
   * @param {import('../combat/actor.js').Actor|any} a
   * @param {import('../combat/actor.js').Actor|any} b
   * @returns {-1|0|1}
   */
  relation(a, b) {
    const actorA = toActor(a);
    const actorB = toActor(b);
    if (!actorA || !actorB) return 0;
    if (actorA === actorB) return 1;
    if (this.isAllied(actorA, actorB)) return 1;

    const factionsA = Array.isArray(actorA.factions) ? actorA.factions : [];
    const factionsB = Array.isArray(actorB.factions) ? actorB.factions : [];
    if (factionsA.length === 0 || factionsB.length === 0) {
      return 0;
    }

    const filteredA = factionsA.filter((id) => id && id !== "unaligned");
    const filteredB = factionsB.filter((id) => id && id !== "unaligned");

    if (filteredA.length === 0 && filteredB.length === 0) {
      return 0;
    }

    if (filteredA.length === 0 || filteredB.length === 0) {
      return -1;
    }

    return -1;
  },
};

/**
 * Attempts to unwrap commonly used wrappers (e.g. Monster) to expose the underlying actor.
 * @param {any} entity
 * @returns {import('../combat/actor.js').Actor|null}
 */
function toActor(entity) {
  if (!entity) return null;
  if (entity.__actor && entity.__actor !== entity) return toActor(entity.__actor);
  if (entity.actor && entity.actor !== entity) return toActor(entity.actor);
  if (Array.isArray(entity.factions)) return entity;
  return null;
}

