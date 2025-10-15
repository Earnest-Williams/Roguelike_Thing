// @ts-nocheck
// src/combat/debug.ts
export function logEvent(actor, kind, payload = {}) {
    if (!actor)
        return;
    const ring = actor.log || (actor.log = []);
    ring.push({ t: actor.turn ?? 0, kind, ...payload });
    if (ring.length > 200)
        ring.shift();
}
