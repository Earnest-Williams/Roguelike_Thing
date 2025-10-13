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

    const actorA = Array.isArray(a.factions) ? a : a.__actor || a.actor || a;
    const actorB = Array.isArray(b.factions) ? b : b.__actor || b.actor || b;

    const A = new Set(actorA.factions || []);
    const B = new Set(actorB.factions || []);

    if (A.has("unaligned") || B.has("unaligned")) return false;

    for (const f of A) {
      if (B.has(f)) return true;
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

