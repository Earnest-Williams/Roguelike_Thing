// src/combat/save.js
// @ts-nocheck
import { normalizePolaritySigned } from "./polarity.js";
/**
 * Convert an actor into a lightweight JSON-friendly blob containing just the
 * runtime state required to resume combat (resources, statuses, etc.).
 *
 * @param {import("./actor.js").Actor | null | undefined} actor
 */
export function serializeActor(actor) {
    if (!actor)
        return null;
    const statusBlob = Array.isArray(actor.statuses)
        ? actor.statuses.map(s => ({
            id: s.id,
            stacks: s.stacks,
            potency: s.potency,
            endsAt: s.endsAt,
            nextTickAt: s.nextTickAt,
        }))
        : [];
    return {
        hp: actor.hp,
        ap: actor.ap,
        statuses: statusBlob,
        attunement: { stacks: { ...(actor.attunement?.stacks || {}) } },
        resources: { pools: clonePools(actor.resources?.pools) },
        cooldowns: actor.cooldowns instanceof Map
            ? Object.fromEntries(actor.cooldowns.entries())
            : { ...(actor.cooldowns || {}) },
        polarity: actor?.polarity ? { ...actor.polarity } : undefined,
    };
}
/**
 * Merge a serialized blob back onto an actor instance. The function mutates the
 * provided actor and returns it for convenience so callers can chain updates.
 *
 * @param {import("./actor.js").Actor | null | undefined} actor
 * @param {ReturnType<typeof serializeActor>} blob
 */
export function hydrateActor(actor, blob) {
    if (!actor || !blob)
        return actor;
    actor.hp = blob.hp;
    actor.ap = blob.ap;
    if (blob.polarity) {
        if (typeof actor.setPolarity === "function") {
            actor.setPolarity(blob.polarity);
        }
        else {
            actor.polarity = normalizePolaritySigned(blob.polarity);
        }
    }
    actor.statuses = Array.isArray(blob.statuses) ? blob.statuses.map(s => ({ ...s })) : [];
    actor.attunement = actor.attunement || {};
    actor.attunement.stacks = { ...(blob.attunement?.stacks || {}) };
    actor.resources = actor.resources || { pools: Object.create(null) };
    actor.resources.pools = clonePools(blob.resources?.pools);
    if (blob.cooldowns instanceof Map) {
        actor.cooldowns = new Map(blob.cooldowns);
    }
    else if (blob.cooldowns && typeof blob.cooldowns === "object") {
        actor.cooldowns = new Map(Object.entries(blob.cooldowns));
    }
    else {
        actor.cooldowns = new Map();
    }
    return actor;
}
/**
 * Clone the nested resource pool dictionary while preserving plain object
 * semantics. Used by serialization helpers so we never leak references between
 * saved blobs and live actors.
 *
 * @param {Record<string, { cur?: number, max?: number }> | null | undefined} pools
 */
function clonePools(pools) {
    const out = Object.create(null);
    if (!pools)
        return out;
    for (const [key, value] of Object.entries(pools)) {
        if (!value || typeof value !== "object")
            continue;
        out[key] = { ...value };
    }
    return out;
}
