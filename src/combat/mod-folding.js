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
function mergeNumMap(into, add) {
  if (!add) return;
  for (const k of Object.keys(add)) {
    const v = Number(add[k]) || 0;
    into[k] = (into[k] || 0) + v;
  }
}

/**
 * Merge helper for polarity bias maps – latter wins per key.
 * @param {Record<string, number>=} base
 * @param {Record<string, number>=} add
 */
function mergePolBias(base = {}, add = {}) {
  return { ...base, ...add };
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
  mergeNumMap(folded.resists, item.resists);
  mergeNumMap(folded.affinities, item.affinities);
  if (folded.offense) {
    mergeNumMap(folded.offense.affinities, item.affinities);
  }
  if (folded.defense) {
    mergeNumMap(folded.defense.resists, item.resists);
  }

  if (Array.isArray(item.immunities)) {
    for (const t of item.immunities) {
      const key = String(t);
      folded.immunities.add(key);
      if (folded.defense) {
        folded.defense.immunities.add(key);
      }
    }
  }

  if (typeof item.dmgMult === "number" && Number.isFinite(item.dmgMult)) {
    folded.dmgMult *= item.dmgMult;
  }
  if (typeof item.speedMult === "number" && Number.isFinite(item.speedMult)) {
    folded.speedMult *= item.speedMult;
  }
}

function foldItemIntoExtended(item, F) {
  foldItemInto(item, F);

  if (Array.isArray(item.conversions)) F.offense.conversions.push(...item.conversions);
  if (Array.isArray(item.brands)) F.offense.brandAdds.push(...item.brands);

  if (item.temporal) {
    const t = item.temporal;
    F.temporal.actionSpeedPct += t.actionSpeedPct ?? 0;
    F.temporal.moveAPDelta += t.moveAPDelta ?? 0;
    if (typeof t.cooldownMult === "number") F.temporal.cooldownMult *= t.cooldownMult;
    if (t.cooldownPerTag) {
      for (const [k, v] of Object.entries(t.cooldownPerTag)) {
        const prev = F.temporal.cooldownPerTag.get(k) || 1;
        F.temporal.cooldownPerTag.set(k, prev * v);
      }
    }
    if (t.echo) F.temporal.echo = t.echo;
    if (t.onKillHaste) F.temporal.onKillHaste = t.onKillHaste;
  }

  if (item.resource) {
    const r = item.resource;
    for (const k of ["stamina", "mana"]) {
      F.resource.maxFlat[k] += r.maxFlat?.[k] ?? 0;
      F.resource.maxPct[k] += r.maxPct?.[k] ?? 0;
      F.resource.regenFlat[k] += r.regenFlat?.[k] ?? 0;
      F.resource.regenPct[k] += r.regenPct?.[k] ?? 0;
      if (typeof r.costMult?.[k] === "number") {
        F.resource.costMult[k] *= r.costMult[k];
      }
    }
    if (r.onHitGain) F.resource.onHitGain = r.onHitGain;
    if (r.onKillGain) F.resource.onKillGain = r.onKillGain;
    if (r.channeling) F.resource.channeling = true;
  }

  if (item.statusMods) {
    const s = item.statusMods;
    mergeNumMap(F.status.inflictBonus, s.inflictBonus);
    mergeNumMap(F.status.inflictDurMult, s.inflictDurMult);
    mergeNumMap(F.status.resistBonus, s.resistBonus);
    mergeNumMap(F.status.recvDurMult, s.recvDurMult);
    F.status.buffDurMult += s.buffDurMult ?? 0;
    if (Array.isArray(s.freeActionIgnore)) {
      for (const id of s.freeActionIgnore) {
        F.status.freeActionIgnore.add(id);
      }
    }
  }

  if (item.polarity) {
    F.polarity.onHitBias = mergePolBias(F.polarity.onHitBias, item.polarity.onHitBias);
    F.polarity.defenseBias = mergePolBias(F.polarity.defenseBias, item.polarity.defenseBias);
    F.offense.polarity.onHitBias = mergePolBias(
      F.offense.polarity.onHitBias,
      item.polarity.onHitBias,
    );
    F.defense.polarity.defenseBias = mergePolBias(
      F.defense.polarity.defenseBias,
      item.polarity.defenseBias,
    );
  }
}

function clampFolded(F) {
  for (const k of Object.keys(F.resists)) {
    F.resists[k] = Math.max(0, Math.min(MAX_RESIST_CAP, F.resists[k]));
  }
  for (const k of Object.keys(F.affinities)) {
    F.affinities[k] = Math.max(
      MIN_AFFINITY_CAP,
      Math.min(MAX_AFFINITY_CAP, F.affinities[k]),
    );
  }
  F.dmgMult = Math.max(0, F.dmgMult);
  F.speedMult = Math.max(
    MIN_SPEED_MULTIPLIER,
    Math.min(MAX_SPEED_MULTIPLIER, F.speedMult),
  );

  for (const k of Object.keys(F.defense.resists)) {
    F.defense.resists[k] = Math.max(-0.5, Math.min(0.8, F.defense.resists[k]));
  }
  F.temporal.actionSpeedPct = Math.max(-0.5, Math.min(1.0, F.temporal.actionSpeedPct));
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
    offense: {
      conversions: [],
      brandAdds: [],
      affinities: Object.create(null),
      polarity: { onHitBias: {} },
    },
    defense: {
      resists: Object.create(null),
      immunities: new Set(),
      polarity: { defenseBias: {} },
    },
    temporal: {
      actionSpeedPct: 0,
      moveAPDelta: 0,
      cooldownMult: 1,
      cooldownPerTag: new Map(),
      echo: null,
      onKillHaste: null,
    },
    resource: {
      maxFlat: { stamina: 0, mana: 0 },
      maxPct: { stamina: 0, mana: 0 },
      regenFlat: { stamina: 0, mana: 0 },
      regenPct: { stamina: 0, mana: 0 },
      costMult: { stamina: 1, mana: 1 },
      onHitGain: null,
      onKillGain: null,
      channeling: false,
    },
    status: {
      inflictBonus: Object.create(null),
      inflictDurMult: Object.create(null),
      resistBonus: Object.create(null),
      recvDurMult: Object.create(null),
      buffDurMult: 0,
      freeActionIgnore: new Set(),
    },
    polarity: { onHitBias: {}, defenseBias: {} },
  };

  const seen = new Set();
  for (const slot of ALL_SLOTS_ORDER) {
    const item = asItem(equipment[slot]);
    if (!item) continue;
    seen.add(slot);
    foldItemIntoExtended(item, folded);
  }
  for (const key of Object.keys(equipment)) {
    if (seen.has(key)) continue;
    const item = asItem(equipment[key]);
    if (item) foldItemIntoExtended(item, folded);
  }

  clampFolded(folded);
  return folded;
}
