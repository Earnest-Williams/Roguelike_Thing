// src/content/affixes.budgeted.js
// @ts-check

import { AFFIX_POOLS } from "./affixes.js";

function cloneBase(def) {
  return JSON.parse(JSON.stringify(def || {}));
}

function computeTagMultiplier(entry, weights) {
  if (!Array.isArray(entry?.tags) || entry.tags.length === 0) {
    return 1;
  }
  let multiplier = 1;
  for (const tag of entry.tags) {
    const factor = Number(weights?.[tag]);
    if (Number.isFinite(factor) && factor > 0) {
      multiplier *= factor;
    }
  }
  return multiplier;
}

function pickAffix(pool, remainingBudget, weights, rng) {
  const candidates = (pool || []).filter(
    (entry) => Number(entry.powerCost || 0) > 0 && entry.powerCost <= remainingBudget,
  );
  if (candidates.length === 0) return null;
  const weighted = candidates.map((entry) => ({
    entry,
    weight: Math.max(0, (entry.w || 1) * computeTagMultiplier(entry, weights)),
  }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) {
    return weighted[0]?.entry ?? null;
  }
  let roll = Math.floor((typeof rng === "function" ? rng() : Math.random()) * total);
  for (const item of weighted) {
    roll -= item.weight;
    if (roll < 0) return item.entry;
  }
  return weighted[weighted.length - 1]?.entry ?? null;
}

function formatAffixName(id = "") {
  return id.replace(/_/g, " ").replace(/\b([a-z])/g, (_, ch) => ch.toUpperCase());
}

/**
 * Apply affixes using a point-buy budget that is biased by the active theme.
 * @param {any} baseDef
 * @param {number} budget
 * @param {{ affixTagWeights?: Record<string, number> } | null} [theme]
 * @param {() => number} [rng]
 */
export function applyAffixesBudgeted(baseDef, budget, theme = null, rng = Math.random) {
  const item = cloneBase(baseDef);
  item.affixes = [];
  let remaining = Math.max(0, Math.floor(Number(budget ?? 0)));
  const weights = theme?.affixTagWeights || {};

  if (remaining > 0) {
    const pickedPrefix = pickAffix(AFFIX_POOLS.prefix, remaining, weights, rng);
    if (pickedPrefix) {
      pickedPrefix.apply(item);
      item.affixes.push({ slot: "prefix", id: pickedPrefix.id });
      remaining -= pickedPrefix.powerCost;
    }
  }

  if (remaining > 0) {
    const pickedSuffix = pickAffix(AFFIX_POOLS.suffix, remaining, weights, rng);
    if (pickedSuffix) {
      pickedSuffix.apply(item);
      item.affixes.push({ slot: "suffix", id: pickedSuffix.id });
      remaining -= pickedSuffix.powerCost;
    }
  }

  if (Array.isArray(item.affixes) && item.affixes.length && item.name) {
    const prefix = item.affixes.find((a) => a.slot === "prefix");
    const suffix = item.affixes.find((a) => a.slot === "suffix");
    const parts = [];
    if (prefix) parts.push(formatAffixName(prefix.id));
    parts.push(baseDef.name || baseDef.id || "Item");
    if (suffix) parts.push(formatAffixName(suffix.id));
    item.name = parts.filter(Boolean).join(" ");
  }

  item.powerBudget = { provided: budget, spent: Math.max(0, (budget || 0) - remaining) };

  return item;
}
