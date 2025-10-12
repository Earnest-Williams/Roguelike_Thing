// src/game/spawn.js
// @ts-check

import { MOB_TEMPLATES } from "../content/mobs.js";

function effectiveWeight(base, tags, multipliers) {
  if (!Array.isArray(tags) || tags.length === 0) {
    return base;
  }
  let weight = base;
  for (const tag of tags) {
    const factor = Number(multipliers?.[tag]);
    if (Number.isFinite(factor) && factor > 0) {
      weight *= factor;
    }
  }
  return weight;
}

/**
 * Build weighted spawn entries biased by the current theme.
 * @param {{ mobTagWeights?: Record<string, number> } | null} theme
 * @param {Record<string, any>} [templates]
 * @returns {Array<{ id: string, template: any, weight: number }>}
 */
export function buildSpawnWeights(theme, templates = MOB_TEMPLATES) {
  const entries = [];
  const multipliers = theme?.mobTagWeights || {};
  for (const [id, template] of Object.entries(templates || {})) {
    const baseWeight = Number(template?.weight ?? 1) || 1;
    const tags = Array.isArray(template?.tags) ? template.tags : [];
    const weight = effectiveWeight(baseWeight, tags, multipliers);
    if (weight <= 0) continue;
    entries.push({ id, template, weight });
  }
  return entries;
}

/**
 * Pick an entry from a weighted list.
 * @template T extends { weight: number }
 * @param {T[]} list
 * @param {() => number} [rng]
 * @returns {T | null}
 */
export function pickWeighted(list, rng = Math.random) {
  if (!Array.isArray(list) || list.length === 0) {
    return null;
  }
  const total = list.reduce((sum, entry) => sum + Math.max(0, entry.weight || 0), 0);
  if (total <= 0) {
    return list[0] ?? null;
  }
  let roll = Math.floor((typeof rng === "function" ? rng() : Math.random()) * total);
  for (const entry of list) {
    roll -= Math.max(0, entry.weight || 0);
    if (roll < 0) return entry;
  }
  return list[list.length - 1] ?? null;
}
