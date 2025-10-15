// src/game/faction-service.js
// @ts-nocheck
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
        if (!a || !b)
            return false;
        const actorA = toActor(a);
        const actorB = toActor(b);
        if (!actorA || !actorB)
            return false;
        const A = new Set(actorA.factions || []);
        const B = new Set(actorB.factions || []);
        // "unaligned" allies no one.
        if (A.has("unaligned") || B.has("unaligned"))
            return false;
        // intrinsic faction overlap → allied
        for (const fa of A)
            if (B.has(fa))
                return true;
        // optional: shared affiliation → allied
        const AA = new Set(actorA.affiliations || []);
        const BB = new Set(actorB.affiliations || []);
        for (const tag of AA)
            if (BB.has(tag))
                return true;
        return false;
    },
    /**
     * Determines if two actors are hostile based on faction overlap.
     * @param {import('../combat/actor.js').Actor|any} a
     * @param {import('../combat/actor.js').Actor|any} b
     * @returns {boolean}
     */
    isHostile(a, b) {
        const actorA = toActor(a);
        const actorB = toActor(b);
        if (!actorA || !actorB)
            return false;
        if (actorA === actorB)
            return false;
        if (this.isAllied(actorA, actorB))
            return false;
        const factionsA = sanitizeFactions(actorA);
        const factionsB = sanitizeFactions(actorB);
        if (factionsA.length === 0 && factionsB.length === 0)
            return false;
        if (factionsA.length === 0 || factionsB.length === 0)
            return true;
        return !factionsA.some((fa) => factionsB.includes(fa));
    },
    /**
     * Friendly relation mirrors the allied check but is exposed for clarity.
     * @param {import('../combat/actor.js').Actor|any} a
     * @param {import('../combat/actor.js').Actor|any} b
     * @returns {boolean}
     */
    isFriendly(a, b) {
        return this.isAllied(a, b);
    },
    /**
     * Canonical relation score between two entities (-1 hostile, 0 neutral, 1 friendly).
     * @param {import('../combat/actor.js').Actor|any} a
     * @param {import('../combat/actor.js').Actor|any} b
     * @returns {-1|0|1}
     */
    relation(a, b) {
        const actorA = toActor(a);
        const actorB = toActor(b);
        if (!actorA || !actorB)
            return 0;
        if (actorA === actorB)
            return 1;
        if (this.isFriendly(actorA, actorB))
            return 1;
        if (this.isHostile(actorA, actorB))
            return -1;
        return 0;
    },
};
/**
 * Attempts to unwrap commonly used wrappers (e.g. Monster) to expose the underlying actor.
 * @param {any} entity
 * @returns {import('../combat/actor.js').Actor|null}
 */
function toActor(entity) {
    if (!entity)
        return null;
    if (entity.__actor && entity.__actor !== entity)
        return toActor(entity.__actor);
    if (entity.actor && entity.actor !== entity)
        return toActor(entity.actor);
    if (Array.isArray(entity.factions))
        return entity;
    return null;
}
function sanitizeFactions(actor) {
    const set = new Set();
    if (typeof actor?.faction === "string") {
        set.add(actor.faction);
    }
    if (Array.isArray(actor?.factions)) {
        for (const id of actor.factions) {
            if (typeof id === "string") {
                set.add(id);
            }
        }
    }
    const result = [];
    for (const id of set) {
        if (!id || id === "unaligned")
            continue;
        result.push(id);
    }
    return result;
}
