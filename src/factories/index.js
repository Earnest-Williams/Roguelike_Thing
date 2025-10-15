// src/factories/index.js
// @ts-check
import { BASE_ITEMS } from "../content/items.js";
import { MOB_TEMPLATES, cloneGuardConfig, cloneWanderConfig } from "../content/mobs.js";
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
export function createMobFromTemplate(tid) {
  const template = MOB_TEMPLATES[tid];
  if (!template) throw new Error("Unknown mob template: " + tid);
  const actor = createActorFromTemplate(tid);
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
  return monster;
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
