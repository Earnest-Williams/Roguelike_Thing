// src/game/faction-service.js
// @ts-check

/**
 * Centralized allegiance logic.
 */
export const FactionService = {
  /**
   * Determine if two actors are allied.
   * @param {import('../combat/actor.js').Actor|any} a
   * @param {import('../combat/actor.js').Actor|any} b
   * @returns {boolean}
   */
  isAllied(a, b) {
    if (!a || !b) return false;

    const actorA = resolveActor(a);
    const actorB = resolveActor(b);
    if (!actorA || !actorB) return false;

    const A = new Set(actorA.factions || []);
    const B = new Set(actorB.factions || []);

    if (A.has("unaligned") || B.has("unaligned")) return false;

    for (const faction of A) {
      if (B.has(faction)) return true;
    }

    const affiliationsA = new Set(actorA.affiliations || []);
    const affiliationsB = new Set(actorB.affiliations || []);
    for (const tag of affiliationsA) {
      if (affiliationsB.has(tag)) return true;
    }

    return false;
  },

  /**
   * Determine hostility between two actors.
   * @param {import('../combat/actor.js').Actor|any} a
   * @param {import('../combat/actor.js').Actor|any} b
   * @returns {boolean}
   */
  isHostile(a, b) {
    return !this.isAllied(a, b);
  },
};

/**
 * Normalise incoming entities to an Actor-like shape by unwrapping common wrappers.
 * @param {any} entity
 * @returns {import('../combat/actor.js').Actor|null}
 */
function resolveActor(entity) {
  if (!entity) return null;

  if (entity.__actor && entity.__actor !== entity) {
    return resolveActor(entity.__actor);
  }

  if (entity.actor && entity.actor !== entity) {
    return resolveActor(entity.actor);
  }

  if (Array.isArray(entity.factions)) return entity;

  return null;
}

