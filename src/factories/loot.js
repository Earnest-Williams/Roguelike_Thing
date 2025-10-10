// src/factories/loot.js
// @ts-check
import { LOOT_TABLES } from "../content/loot.js";
import { BASE_ITEMS } from "../content/items.js";
import { applyAffixes } from "../content/affixes.js";
import { registerItem, upsertItem, makeItem } from "item-system";

export function randInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function pickLoot(tableId, rng = Math.random) {
  const table = LOOT_TABLES[tableId];
  if (!table) throw new Error("Unknown loot table: " + tableId);
  const total = table.reduce((a, x) => a + x.w, 0) || 1;
  let r = Math.floor(rng() * total);
  for (const e of table) {
    if ((r -= e.w) < 0) return resolveEntry(e, rng);
  }
  return null;
}

function resolveEntry(entry, rng) {
  if (entry.itemId) {
    // 30% chance to affix weapons/armors
    const base = BASE_ITEMS[entry.itemId];
    if (!base) return null;
    const def = rng() < 0.30 ? applyAffixes(base, rng) : base;
    // ephemeral registration with unique id
    const id = def.id + "#" + Math.floor(rng() * 1e9).toString(36);
    const clone = { ...def, id };
    try {
      registerItem(clone);
    } catch (_) {
      // Ignore error if item already exists; upsertItem will handle both insert and update cases.
      upsertItem(clone);
    }
    return makeItem(id);
  }
  if (entry.gold) {
    const amount = randInt(rng, entry.gold[0], entry.gold[1]);
    return { id: "gold", name: "Gold", kind: "currency", qty: amount };
  }
  return null;
}
