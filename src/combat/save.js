// src/combat/save.js
// @ts-check
import { normalizePolaritySigned } from "./polarity.js";

export function serializeActor(actor) {
  if (!actor) return null;
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

export function hydrateActor(actor, blob) {
  if (!actor || !blob) return actor;
  actor.hp = blob.hp;
  actor.ap = blob.ap;
  if (blob.polarity) {
    if (typeof actor.setPolarity === "function") {
      actor.setPolarity(blob.polarity);
    } else {
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
  } else if (blob.cooldowns && typeof blob.cooldowns === "object") {
    actor.cooldowns = new Map(Object.entries(blob.cooldowns));
  } else {
    actor.cooldowns = new Map();
  }
  return actor;
}

function clonePools(pools) {
  const out = Object.create(null);
  if (!pools) return out;
  for (const [key, value] of Object.entries(pools)) {
    if (!value || typeof value !== "object") continue;
    out[key] = { ...value };
  }
  return out;
}

