// src/factories/index.js
// @ts-check
import { BASE_ITEMS } from "../content/items.js";
import { MOB_TEMPLATES } from "../content/mobs.js";
import { SLOT } from "../../constants.js";
import { makeItem, registerItem, upsertItem } from "../../item-system.js";
import { Actor } from "../combat/actor.js";
import { foldModsFromEquipment } from "../combat/mod-folding.js";

// One-time registration (idempotent safe-guard)
let _registered = false;
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

export function createItem(id) {
  ensureItemsRegistered();
  return makeItem(id);
}

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
  const a = new Actor({ id: t.id, name: t.name, baseStats: t.baseStats, equipment });
  // merge innate payloads (affinities/resists/brands) by pretending they are “items” in a virtual slot
  if (t.innate) {
    const pseudo = { id: `${t.id}#innate`, ...t.innate };
    equipment["Innate"] = pseudo;
  }
  a.setFoldedMods(foldModsFromEquipment(equipment));
  return a;
}

/** choose a legal slot by item.equipSlots */
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
