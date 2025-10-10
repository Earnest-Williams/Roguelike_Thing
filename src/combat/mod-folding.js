// src/combat/mod-folding.js
// @ts-check
import {
  ALL_SLOTS_ORDER,
  BASE_DAMAGE_MULTIPLIER,
  BASE_SPEED_MULTIPLIER,
  MAX_AFFINITY_CAP,
  MAX_RESIST_CAP,
  MIN_AFFINITY_CAP,
  MIN_SPEED_MULTIPLIER,
  MAX_SPEED_MULTIPLIER,
} from "../../constants.js";

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
function foldItemInto(item, folded) {
  if (!item) return;
  if (Array.isArray(item.brands)) {
    for (const b of item.brands) {
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

export function foldModsFromEquipment(equipment) {
  /** @type {ModCache} */
  const folded = {
    resists: Object.create(null),
    affinities: Object.create(null),
    immunities: new Set(),
    dmgMult: BASE_DAMAGE_MULTIPLIER,
    speedMult: BASE_SPEED_MULTIPLIER,
    brands: [],
  };

  const seen = new Set();
  for (const slot of ALL_SLOTS_ORDER) {
    const raw = equipment[slot];
    const item = asItem(raw);
    if (!item) continue;
    seen.add(slot);
    foldItemInto(item, folded);
  }

  for (const key of Object.keys(equipment)) {
    if (seen.has(key)) continue;
    const item = asItem(equipment[key]);
    if (!item) continue;
    foldItemInto(item, folded);
  }

  // Clamp/normalize
  for (const k of Object.keys(folded.resists)) {
    folded.resists[k] = Math.max(0, Math.min(MAX_RESIST_CAP, folded.resists[k])); // cap default resist ceiling
  }
  for (const k of Object.keys(folded.affinities)) {
    folded.affinities[k] = Math.max(
      MIN_AFFINITY_CAP,
      Math.min(MAX_AFFINITY_CAP, folded.affinities[k]),
    );
  }
  folded.dmgMult = Math.max(0, folded.dmgMult);
  folded.speedMult = Math.max(
    MIN_SPEED_MULTIPLIER,
    Math.min(MAX_SPEED_MULTIPLIER, folded.speedMult),
  );

  return folded;
}
