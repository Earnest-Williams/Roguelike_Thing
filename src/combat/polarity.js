// src/combat/polarity.js
// @ts-check

import { POLAR_BIAS } from "./constants.js";

/** @typedef {"order"|"growth"|"chaos"|"decay"|"void"} PolarityAxis */

const AXES = /** @type {PolarityAxis[]} */ (["order", "growth", "chaos", "decay", "void"]);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/**
 * Normalize a signed polarity vector to L1=1 while preserving sign per axis.
 * If all zeros, returns zeros.
 * @param {Partial<Record<PolarityAxis, number>>} [input]
 * @returns {Record<PolarityAxis, number>}
 */
export function normalizePolaritySigned(input = {}) {
  const out = Object.create(null);
  let sum = 0;
  for (const k of AXES) {
    const v = clamp(Number(input[k] ?? 0), -1, 1);
    out[k] = v;
    sum += Math.abs(v);
  }
  if (sum <= 0) {
    for (const k of AXES) out[k] = 0;
    return out;
  }
  for (const k of AXES) {
    out[k] = out[k] / sum;
  }
  return out;
}

/**
 * Combine baseline actor polarity with any granted (item/status) polarity.
 * "Grant" is additive; result is re-normalized to signed L1=1.
 * @param {import("./actor.js").Actor|undefined|null} actor
 * @param {"offense"|"defense"} side
 */
export function effectivePolarity(actor, side) {
  const base = actor?.polarity || {};
  const grant = actor?.modCache?.[side]?.polarity?.grant || {};
  const combined = Object.create(null);
  for (const k of AXES) {
    combined[k] = (base[k] || 0) + (grant[k] || 0);
  }
  return normalizePolaritySigned(combined);
}

/**
 * Compute offense multiplier from attacker vs defender using opposition map.
 * We weight the attacker's vector against defender axes: friendly vs opposed.
 * @param {import("./actor.js").Actor|undefined|null} attacker
 * @param {import("./actor.js").Actor|undefined|null} defender
 * @param {number} [cap]
 */
export function polarityOffenseMult(attacker, defender, cap = 0.5) {
  const att = effectivePolarity(attacker, "offense");
  const def = effectivePolarity(defender, "defense");
  let score = 0;
  for (const A of AXES) {
    const a = att[A] || 0;
    if (!a) continue;
    for (const D of AXES) {
      const w = POLAR_BIAS[A]?.[D] || 0;
      if (!w) continue;
      score += a * (def[D] || 0) * w;
    }
  }
  const bias = attacker?.modCache?.offense?.polarity?.onHitBias || {};
  for (const k of AXES) {
    if (!bias[k]) continue;
    score += (att[k] || 0) * bias[k];
  }
  score += bias.all || 0;
  return 1 + clamp(score, -cap, cap);
}

/**
 * Defense multiplier mirrors offense but uses defense bias and reversed sign.
 * (Positive defense score reduces incoming damage.)
 * @param {import("./actor.js").Actor|undefined|null} defender
 * @param {import("./actor.js").Actor|undefined|null} attacker
 * @param {number} [cap]
 */
export function polarityDefenseMult(defender, attacker, cap = 0.5) {
  const def = effectivePolarity(defender, "defense");
  const att = effectivePolarity(attacker, "offense");
  let score = 0;
  for (const D of AXES) {
    const d = def[D] || 0;
    if (!d) continue;
    for (const A of AXES) {
      const w = POLAR_BIAS[A]?.[D] || 0;
      if (!w) continue;
      score += d * (att[A] || 0) * w;
    }
  }
  const bias = defender?.modCache?.defense?.polarity?.defenseBias || {};
  for (const k of AXES) {
    if (!bias[k]) continue;
    score += (def[k] || 0) * bias[k];
  }
  score += bias.all || 0;
  return 1 - clamp(score, -cap, cap);
}
