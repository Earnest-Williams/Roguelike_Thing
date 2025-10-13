// src/factories/index.js
// @ts-check
import { BASE_ITEMS } from "../content/items.js";
import { MOB_TEMPLATES } from "../content/mobs.js";
import { SLOT } from "../../js/constants.js";
import { makeItem, registerItem, upsertItem } from "../../js/item-system.js";
import { Actor } from "../combat/actor.js";
import { foldInnatesIntoModCache, foldModsFromEquipment } from "../combat/mod-folding.js";
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

  foldModsFromEquipment(a);
  foldInnatesIntoModCache(a);
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
  return new Monster({
    actor,
    glyph: template.glyph ?? "?",
    color: template.color ?? "#fff",
    baseDelay: template.baseDelay ?? 1,
  });
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
