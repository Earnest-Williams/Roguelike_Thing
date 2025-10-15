// src/factories/index.js
// @ts-check
import { BASE_ITEMS } from "../content/items.js";
import { MOB_TEMPLATES, cloneGuardConfig, cloneWanderConfig } from "../content/mobs.js";
import { normalizeRoleIdList, resolveRoleTemplates } from "../content/roles.js";
import { SLOT } from "../../js/constants.js";
import { makeItem, registerItem, upsertItem } from "../../js/item-system.js";
import { Actor } from "../combat/actor.js";
import { attachLogs } from "../combat/debug-log.js";
import { rebuildModCache } from "../combat/mod-folding.js";
// [Unified Implementation] Always use the canonical Monster wrapper.
import { Monster } from "../game/monster.js";

// One-time registration (idempotent safe-guard)
let _registered = false;

/**
 * Register the base item catalogue with the shared item system. Safe to call
 * multiple times thanks to the `_registered` flag and upsert fallback.
 */
export function ensureItemsRegistered() {
  if (_registered) return;
  for (const id of Object.keys(BASE_ITEMS)) {
    const def = BASE_ITEMS[id];
    try {
      registerItem(def);
    } catch (err) {
      // already registered – refresh definition
      try {
        upsertItem(def);
      } catch (upsertErr) {
        console.error("Failed to upsert item definition for id:", def?.id, upsertErr);
      }
    }
  }
  _registered = true;
}

/**
 * Create a concrete item instance by id, ensuring the registry has been seeded
 * beforehand so tests and simulations can call into the factories directly.
 *
 * @param {string} id
 */
export function createItem(id) {
  ensureItemsRegistered();
  return makeItem(id);
}

/**
 * Instantiate an actor from a template id, equipping any loadout entries and
 * folding innate modifiers so the resulting actor is battle-ready.
 *
 * @param {string} tid
 * @returns {Actor}
 */
export function createActorFromTemplate(tid) {
  ensureItemsRegistered();
  const t = MOB_TEMPLATES[tid];
  if (!t) throw new Error("Unknown mob template: " + tid);
  const equipment = { ...t.equipment };
  if (Array.isArray(t.loadout)) {
    // naive: put first into RightHand if possible
    for (const iid of t.loadout) {
      const it = createItem(iid);
      const slot = chooseSlotFor(it);
      if (slot) equipment[slot] = it;
    }
  }
  const a = new Actor({
    id: t.id,
    name: t.name,
    baseStats: t.baseStats,
    equipment,
    actions: Array.isArray(t.actions) ? t.actions : undefined,
    factions: t.factions,
    affiliations: t.affiliations,
  });

  Object.defineProperty(a, "__template", {
    value: t,
    enumerable: false,
    configurable: true,
    writable: false,
  });

  rebuildModCache(a);
  attachLogs(a); // enable turn/attack/status ring buffers
  return a;
}

/**
 * Create a world mob instance from a template id.
 * @param {string} tid
 */
export function createMobFromTemplate(tid, roleOptions = null) {
  const template = MOB_TEMPLATES[tid];
  if (!template) throw new Error("Unknown mob template: " + tid);
  const actor = createActorFromTemplate(tid);
  const { roleIds: requestedRoleIds, overlayId } = parseRoleOptions(roleOptions);
  const appliedRoles = applyRolesToActor(actor, requestedRoleIds, overlayId);
  const spawnPos = snapshotPosition(actor);
  if (spawnPos) {
    actor.spawnPos = clonePoint(spawnPos);
    if (!actor.homePos) actor.homePos = clonePoint(spawnPos);
  }

  const guardConfig = cloneGuardConfig(template.guard ?? actor.guard ?? null);
  if (guardConfig) {
    actor.guard = cloneGuardConfig(guardConfig);
    if (guardConfig.anchor && !actor.homePos) {
      actor.homePos = clonePoint(guardConfig.anchor);
    }
    if (typeof guardConfig.radius === "number") {
      actor.guardRadius = guardConfig.radius;
    }
    if (typeof guardConfig.resumeBias === "number") {
      actor.guardResumeBias = guardConfig.resumeBias;
    }
  }

  const wanderConfig = cloneWanderConfig(template.wander ?? actor.wander ?? null);
  if (wanderConfig) {
    actor.wander = cloneWanderConfig(wanderConfig);
    if (typeof wanderConfig.radius === "number") {
      actor.wanderRadius = wanderConfig.radius;
    }
    if (typeof wanderConfig.resumeBias === "number") {
      actor.wanderResumeBias = wanderConfig.resumeBias;
    }
  }

  const monster = new Monster({
    actor,
    glyph: template.glyph ?? "?",
    color: template.color ?? "#fff",
    baseDelay: template.baseDelay ?? 1,
    guard: guardConfig,
    wander: wanderConfig,
    spawnPos,
    homePos: actor.homePos ?? spawnPos ?? null,
  });

  syncBehaviorToActor(monster);
  monster.roleIds = appliedRoles.slice();
  monster.roleOverlayId = appliedRoles.length ? (overlayId ?? null) : null;
  if (Array.isArray(actor.roleStatusLoadouts) && actor.roleStatusLoadouts.length) {
    monster.roleStatusLoadouts = actor.roleStatusLoadouts.slice();
  }
  if (actor.aiHints && typeof actor.aiHints === "object") {
    monster.aiHints = { ...actor.aiHints };
  }
  return monster;
}

export function createMobWithRoles(tid, roleIds, options = {}) {
  const normalizedRoles = normalizeRoleIdList(roleIds);
  const overlayId = typeof options.overlayId === "string" ? options.overlayId : null;
  return createMobFromTemplate(tid, { roleIds: normalizedRoles, overlayId });
}

function parseRoleOptions(input) {
  if (Array.isArray(input) || typeof input === "string") {
    return { roleIds: normalizeRoleIdList(input), overlayId: null };
  }
  if (!input || typeof input !== "object") {
    return { roleIds: [], overlayId: null };
  }
  const roleIds = normalizeRoleIdList(input.roleIds ?? input.roles ?? input.roleId ?? null);
  const overlayId = typeof input.overlayId === "string" ? input.overlayId : null;
  return { roleIds, overlayId };
}

function applyRolesToActor(actor, roleIds = [], overlayId = null) {
  if (!actor) return [];
  const normalized = normalizeRoleIdList(roleIds);
  if (!normalized.length) {
    actor.roleIds = [];
    actor.roleOverlayId = null;
    return [];
  }

  const templates = resolveRoleTemplates(normalized);
  if (!templates.length) {
    actor.roleIds = [];
    actor.roleOverlayId = null;
    return [];
  }

  const aiHints = actor.aiHints && typeof actor.aiHints === "object"
    ? { ...actor.aiHints }
    : {};

  let innate = null;
  let innatesTouched = false;
  const applied = [];

  for (const role of templates) {
    applied.push(role.id);

    if (role.statMods) {
      applyStatMods(actor, role.statMods);
    }

    if (role.affinities || role.resists || role.polarity) {
      if (!innate) {
        innate = cloneInnatePayload(actor.innates || actor.__template?.innate || null);
      }
      if (role.affinities) {
        innate.affinities = mergeNumberRecords(innate.affinities, role.affinities);
        innatesTouched = true;
      }
      if (role.resists) {
        innate.resists = mergeNumberRecords(innate.resists, role.resists);
        innatesTouched = true;
      }
      if (role.polarity) {
        const pol = innate.polarity = clonePolarityPayload(innate.polarity);
        if (role.polarity.grant) {
          pol.grant = mergeNumberRecords(pol.grant, role.polarity.grant);
          innatesTouched = true;
        }
        if (role.polarity.onHitBias) {
          pol.onHitBias = mergeNumberRecords(pol.onHitBias, role.polarity.onHitBias);
          innatesTouched = true;
        }
        if (role.polarity.defenseBias) {
          pol.defenseBias = mergeNumberRecords(pol.defenseBias, role.polarity.defenseBias);
          innatesTouched = true;
        }
      }
    }

    if (role.aiHints) {
      mergeAiHints(aiHints, role.aiHints);
    }

    if (role.statusLoadout) {
      if (!Array.isArray(actor.roleStatusLoadouts)) actor.roleStatusLoadouts = [];
      if (!actor.roleStatusLoadouts.includes(role.statusLoadout)) {
        actor.roleStatusLoadouts.push(role.statusLoadout);
      }
    }
  }

  if (innatesTouched && innate) {
    actor.innates = innate;
  }

  if (Object.keys(aiHints).length > 0) {
    actor.aiHints = aiHints;
  }

  actor.roleIds = applied.slice();
  actor.roleOverlayId = overlayId ?? null;

  rebuildModCache(actor);

  return applied;
}

function applyStatMods(actor, mods) {
  if (!actor || !mods || typeof mods !== "object") return;
  const base = actor.base;
  if (!base || typeof base !== "object") return;
  for (const [key, value] of Object.entries(mods)) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const current = Number(base[key]) || 0;
    let next = current + amount;
    if (key === "baseSpeed") {
      next = Math.max(0.05, next);
    }
    base[key] = next;
    if (actor.baseStats && actor.baseStats !== base) {
      actor.baseStats[key] = next;
    }
    if (key === "maxHP") {
      syncPrimaryResource(actor, "hp", next);
    } else if (key === "maxStamina") {
      syncPrimaryResource(actor, "stamina", next);
    } else if (key === "maxMana") {
      syncPrimaryResource(actor, "mana", next);
    }
  }
}

function syncPrimaryResource(actor, pool, rawMax) {
  if (!actor || !Number.isFinite(rawMax)) return;
  const max = Math.max(0, Math.round(rawMax));
  actor.res = actor.res || {};
  actor.resources = actor.resources || actor.res;
  if (pool === "hp") {
    actor.res.hp = max;
    actor.hp = max;
    actor.resources.hp = max;
  } else if (pool === "stamina") {
    actor.res.stamina = max;
    actor.stamina = max;
    actor.resources.stamina = max;
    const staminaPool = actor.resources?.pools?.stamina;
    if (staminaPool) {
      staminaPool.baseMax = max;
      staminaPool.max = max;
      staminaPool.cur = Math.min(Number.isFinite(staminaPool.cur) ? staminaPool.cur : max, max);
    }
  } else if (pool === "mana") {
    actor.res.mana = max;
    actor.mana = max;
    actor.resources.mana = max;
    const manaPool = actor.resources?.pools?.mana;
    if (manaPool) {
      manaPool.baseMax = max;
      manaPool.max = max;
      manaPool.cur = Math.min(Number.isFinite(manaPool.cur) ? manaPool.cur : max, max);
    }
  }
}

function cloneInnatePayload(source) {
  if (!source || typeof source !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === "polarity" && value && typeof value === "object") {
      out.polarity = clonePolarityPayload(value);
      continue;
    }
    if (!value || typeof value !== "object") {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.slice();
      continue;
    }
    out[key] = { ...value };
  }
  return out;
}

function clonePolarityPayload(source) {
  if (!source || typeof source !== "object") return {};
  const out = {};
  if (source.grant && typeof source.grant === "object") {
    out.grant = { ...source.grant };
  }
  if (source.onHitBias && typeof source.onHitBias === "object") {
    out.onHitBias = { ...source.onHitBias };
  }
  if (source.defenseBias && typeof source.defenseBias === "object") {
    out.defenseBias = { ...source.defenseBias };
  }
  return out;
}

function mergeNumberRecords(target, add) {
  const base = target && typeof target === "object" ? { ...target } : {};
  if (!add || typeof add !== "object") return base;
  for (const [key, value] of Object.entries(add)) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const current = Number(base[key]) || 0;
    base[key] = current + amount;
  }
  return base;
}

function mergeAiHints(target, payload) {
  if (!payload || typeof payload !== "object") return target;
  for (const [key, value] of Object.entries(payload)) {
    if (Number.isFinite(value)) {
      const prev = Number(target[key]) || 0;
      target[key] = prev + Number(value);
    } else if (Array.isArray(value)) {
      const existing = Array.isArray(target[key]) ? target[key].slice() : [];
      for (const entry of value) {
        if (!existing.includes(entry)) {
          existing.push(entry);
        }
      }
      target[key] = existing;
    } else if (value != null) {
      target[key] = value;
    }
  }
  return target;
}

/**
 * Choose a legal equipment slot for an item by iterating a preferred order and
 * checking its `canEquipTo` guard. Returns `null` when no slot is valid.
 *
 * @param {ReturnType<typeof makeItem>} item
 */
function chooseSlotFor(item) {
  const pref = [
    SLOT.RightHand,
    SLOT.LeftHand,
    SLOT.Cloak,
    SLOT.Head,
    SLOT.BodyArmor,
    SLOT.LeftRing,
    SLOT.RightRing,
    SLOT.Amulet,
  ];
  for (const s of pref) {
    if (item?.canEquipTo?.(s)) return s;
  }
  return null;
}

function snapshotPosition(entity) {
  if (!entity) return null;
  if (Number.isFinite(entity.x) && Number.isFinite(entity.y)) {
    return { x: entity.x | 0, y: entity.y | 0 };
  }
  if (isPoint(entity.spawnPos)) {
    return clonePoint(entity.spawnPos);
  }
  const pos = typeof entity.pos === "function" ? entity.pos() : entity.pos;
  if (isPoint(pos)) {
    return clonePoint(pos);
  }
  return null;
}

function clonePoint(point) {
  if (!isPoint(point)) return null;
  return { x: point.x | 0, y: point.y | 0 };
}

function isPoint(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y);
}

function syncBehaviorToActor(monster) {
  if (!monster || typeof monster !== "object") return;
  const actor = monster.actor || monster.__actor || null;
  if (!actor || actor === monster) return;
  if (monster.guard) {
    actor.guard = cloneGuardConfig(monster.guard);
    if (typeof monster.guard?.radius === "number") {
      actor.guardRadius = monster.guard.radius;
    }
    if (typeof monster.guard?.resumeBias === "number") {
      actor.guardResumeBias = monster.guard.resumeBias;
    }
    if (monster.guard?.anchor && !actor.homePos) {
      actor.homePos = { ...monster.guard.anchor };
    }
  }
  if (monster.wander) {
    actor.wander = cloneWanderConfig(monster.wander);
    if (typeof monster.wander?.radius === "number") {
      actor.wanderRadius = monster.wander.radius;
    }
    if (typeof monster.wander?.resumeBias === "number") {
      actor.wanderResumeBias = monster.wander.resumeBias;
    }
  }
  if (monster.spawnPos) {
    actor.spawnPos = { ...monster.spawnPos };
  }
  if (monster.homePos && !actor.homePos) {
    actor.homePos = { ...monster.homePos };
  }
}
