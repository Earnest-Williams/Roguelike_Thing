// src/content/affixes.budgeted.js
// @ts-check
import { AFFIX_POOLS } from "./affixes.js";

function formatAffixName(id = "") {
  return id
    .replace(/_/g, " ")
    .replace(/\b([a-z])/g, (_, ch) => ch.toUpperCase());
}

function computeAffixWeight(affix, theme) {
  let weight = Number.isFinite(affix.w) ? affix.w : 1;
  const tagWeights = theme?.weights?.affixTags || theme?.affixTagWeights || {};
  const tags = Array.isArray(affix.tags) ? affix.tags : [];
  for (const tag of tags) {
    const bonus = tagWeights[tag];
    if (Number.isFinite(bonus)) weight += bonus;
  }
  return weight;
}

function pickWeighted(entries, rng) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0) || 1;
  let roll = Math.floor(rng() * total);
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll < 0) return entry.item;
  }
  return entries[0]?.item || null;
}

/**
 * Applies affixes to an item while respecting a power budget.
 *
 * @param {Record<string, any>} baseDef
 * @param {number} budget
 * @param {{ weights?: { affixTags?: Record<string, number> } }} [theme]
 * @param {() => number} [rng]
 */
export function applyAffixesBudgeted(baseDef, budget = 0, theme, rng = Math.random) {
  const random = typeof rng === "function" ? rng : Math.random;
  const clone = JSON.parse(JSON.stringify(baseDef));
  clone.affixes = [];

  let remaining = Math.max(0, Math.floor(Number(budget) || 0));

  for (const slot of ["prefix", "suffix"]) {
    if (remaining <= 0) break;
    const pool = Array.isArray(AFFIX_POOLS[slot]) ? AFFIX_POOLS[slot] : [];
    const affordable = pool.filter((affix) => {
      const cost = Math.max(0, Math.floor(Number(affix.powerCost) || 0));
      return cost <= remaining;
    });
    if (!affordable.length) continue;

    if (random() >= 0.75) continue;

    const weighted = affordable
      .map((affix) => ({
        item: affix,
        weight: Math.max(0, computeAffixWeight(affix, theme)),
      }))
      .filter((entry) => entry.weight > 0);

    if (!weighted.length) continue;

    const chosen = pickWeighted(weighted, random);
    if (!chosen || typeof chosen.apply !== "function") continue;

    chosen.apply(clone);
    clone.affixes.push({ slot, id: chosen.id });
    const cost = Math.max(0, Math.floor(Number(chosen.powerCost) || 0));
    remaining = Math.max(0, remaining - cost);
  }

  if (Array.isArray(clone.affixes) && clone.affixes.length && clone.name) {
    const prefix = clone.affixes.find((a) => a.slot === "prefix");
    const suffix = clone.affixes.find((a) => a.slot === "suffix");
    const parts = [];
    if (prefix) parts.push(formatAffixName(prefix.id));
    parts.push(baseDef.name || baseDef.id || "Item");
    if (suffix) parts.push(formatAffixName(suffix.id));
    clone.name = parts.filter(Boolean).join(" ");
  }

  return clone;
}
