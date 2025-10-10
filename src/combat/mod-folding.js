// src/combat/mod-folding.js
// @ts-check
import { ALL_SLOTS_ORDER } from "../../constants.js";

/**
 * Normalizes “mod payload” fields we allow on items:
 *  - brands: BrandMod[]
 *  - resists: Record<string, number>  (defensive, e.g., { fire: 0.25 })
 *  - affinities: Record<string, number> (offensive, e.g., { fire: 0.10 })
 *  - immunities: string[]
 *  - dmgMult: number
 *  - speedMult: number
 */

/**
 * @typedef {import("./actor.js").ModCache} ModCache
 * @typedef {import("../../item-system.js").Item} Item
 * @typedef {import("../../item-system.js").ItemStack} ItemStack
 */

/**
 * @param {Item|ItemStack|undefined} entry
 * @returns {Item|null}
 */
function asItem(entry) {
  if (!entry) return null;
  // ItemStack from your system exposes `.item`
  // Guard to support both Item and ItemStack seamlessly
  return /** @type {any} */ (entry).item ? /** @type {ItemStack} */(entry).item : /** @type {Item} */(entry);
}

/**
 * Merge helper for numeric maps
 * @param {Record<string, number>} into
 * @param {Record<string, number>=} add
 */
function mergeNumberMap(into, add) {
  if (!add) return;
  for (const k of Object.keys(add)) {
    const v = Number(add[k]) || 0;
    into[k] = (into[k] || 0) + v;
  }
}

/**
 * Folds all equip mods into an aggregate ModCache.
 * Call this whenever equipment changes, then stash on the Actor via setFoldedMods().
 * @param {Partial<Record<string, Item|ItemStack>>} equipment
 * @returns {ModCache}
 */
export function foldModsFromEquipment(equipment) {
  /** @type {ModCache} */
  const folded = {
    resists: Object.create(null),
    affinities: Object.create(null),
    immunities: new Set(),
    dmgMult: 1.0,
    speedMult: 1.0,
    brands: [],
  };

  for (const slot of ALL_SLOTS_ORDER) {
    const raw = equipment[slot];
    const item = asItem(raw);
    if (!item) continue;

    // Optional payloads on your item defs:
    // item.brands, item.resists, item.affinities, item.immunities, item.dmgMult, item.speedMult
    if (Array.isArray(item.brands)) {
      for (const b of item.brands) {
        // Normalize minimal brand fields
        folded.brands.push({
          kind: "brand",
          id: b.id ?? `${item.id}#brand`,
          type: b.type ?? null,
          flat: Number.isFinite(b.flat) ? b.flat : 0,
          pct: Number.isFinite(b.pct) ? b.pct : 0,
        });
      }
    }
    mergeNumberMap(folded.resists, item.resists);
    mergeNumberMap(folded.affinities, item.affinities);

    if (Array.isArray(item.immunities)) {
      for (const t of item.immunities) folded.immunities.add(String(t));
    }

    if (typeof item.dmgMult === "number" && Number.isFinite(item.dmgMult)) {
      folded.dmgMult *= item.dmgMult;
    }
    if (typeof item.speedMult === "number" && Number.isFinite(item.speedMult)) {
      folded.speedMult *= item.speedMult;
    }
  }

  // Clamp/normalize
  for (const k of Object.keys(folded.resists)) {
    folded.resists[k] = Math.max(0, Math.min(0.9, folded.resists[k])); // cap 90% resist as a sane default
  }
  for (const k of Object.keys(folded.affinities)) {
    folded.affinities[k] = Math.max(-0.9, Math.min(0.9, folded.affinities[k]));
  }
  folded.dmgMult = Math.max(0, folded.dmgMult);
  folded.speedMult = Math.max(0.2, Math.min(5, folded.speedMult));

  return folded;
}
