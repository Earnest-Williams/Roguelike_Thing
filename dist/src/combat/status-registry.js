// src/combat/status-registry.js
// @ts-nocheck
import { STATUS_DEFINITIONS, setStatusDamageAdapter } from "../content/statuses.js";
import { registerStatus } from "./status.js";
function ensureResources(actor) {
    if (!actor)
        return { hp: 0 };
    if (actor.resources && typeof actor.resources.hp === "number")
        return actor.resources;
    const hp = Number.isFinite(actor?.res?.hp)
        ? actor.res.hp
        : Number.isFinite(actor?.hp)
            ? actor.hp
            : 0;
    const bucket = { ...(actor.resources || {}), hp };
    actor.resources = bucket;
    if (actor.res)
        actor.res.hp = hp;
    actor.hp = hp;
    return bucket;
}
function applyDirectDamage(actor, amount) {
    if (!actor || !Number.isFinite(amount) || amount <= 0)
        return 0;
    const resources = ensureResources(actor);
    const dmg = Math.max(0, Math.floor(amount));
    const next = Math.max(0, (resources.hp ?? 0) - dmg);
    resources.hp = next;
    if (actor.res)
        actor.res.hp = next;
    actor.hp = next;
    if (actor.resources && typeof actor.resources === "object") {
        actor.resources.hp = next;
        if (actor.resources.pools?.hp) {
            actor.resources.pools.hp.cur = next;
        }
    }
    return dmg;
}
setStatusDamageAdapter(({ target, amount, type }) => {
    const dealt = applyDirectDamage(target, amount);
    if (dealt > 0 && target?.logs?.status) {
        target.logs.status.push({ kind: "status_tick", type, amount: dealt });
    }
    return dealt;
});
for (const def of STATUS_DEFINITIONS) {
    registerStatus(def);
}
