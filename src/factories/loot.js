// src/factories/loot.js
// @ts-nocheck
import { LOOT_TABLES } from "../content/loot.js";
import { BASE_ITEMS } from "../content/items.js";
import { applyAffixes } from "../content/affixes.js";
import { applyAffixesBudgeted } from "../content/affixes.budgeted.js";
import { registerItem, upsertItem, makeItem } from "../../js/item-system.js";
import {
  LOOT_AFFIX_CHANCE,
  DYNAMIC_ID_RANDOMIZATION_MODULUS,
} from "../config.js";

export function randInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function pickLoot(tableId, rng = Math.random, context = {}) {
  const table = LOOT_TABLES[tableId];
  if (!table) throw new Error("Unknown loot table: " + tableId);
  const total = table.reduce((a, x) => a + x.w, 0) || 1;
  let r = Math.floor(rng() * total);
  for (const e of table) {
    if ((r -= e.w) < 0) return resolveEntry(e, rng, context);
  }
  return null;
}

/**
 * Resolve a loot table entry into a concrete item, optionally biasing affixes
 * using the active chapter theme when one is available.
 */
function resolveEntry(entry, rng, context = {}) {
  if (entry.itemId) {
    // Chance to affix weapons/armors is centrally configured.
    const base = BASE_ITEMS[entry.itemId];
    if (!base) return null;
    let def = base;
    if (rng() < LOOT_AFFIX_CHANCE) {
      const chapter = context.chapter || context.gameCtx?.chapter || null;
      if (chapter?.theme) {
        def = applyAffixesBudgeted(base, chapter.currentBudget, chapter.theme, rng);
      } else {
        def = applyAffixes(base, rng);
      }
    }
    // Ephemeral registration with unique id using the configured modulus.
    const id =
      def.id +
      "#" +
      Math.floor(rng() * DYNAMIC_ID_RANDOMIZATION_MODULUS).toString(36);
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
