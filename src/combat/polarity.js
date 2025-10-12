// src/combat/polarity.js
// @ts-check

import { POLAR_BIAS as POLAR_BIAS_SOURCE } from "../../js/constants.js";
import { clamp } from "../utils/number.js";

const DEFAULT_POLAR_BIAS = Object.freeze({
  order: Object.freeze({}),
  growth: Object.freeze({}),
  chaos: Object.freeze({}),
  decay: Object.freeze({}),
  void: Object.freeze({}),
});

const POLAR_BIAS = POLAR_BIAS_SOURCE ?? DEFAULT_POLAR_BIAS;

/** @typedef {"order"|"growth"|"chaos"|"decay"|"void"} PolarityAxis */

const AXES = /** @type {PolarityAxis[]} */ (["order", "growth", "chaos", "decay", "void"]);

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
      score -= d * (att[A] || 0) * w;
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

/**
 * Convenience helper returning the additive offense scalar used by the lightweight resolver.
 * Accepts either a full attacker actor or a raw polarity map.
 * @param {any} attackerOrPolarity
 * @param {any} [defender]
 * @param {number} [cap]
 */
export function polarityOffenseScalar(attackerOrPolarity, defender = null, cap = 0.5) {
  if (attackerOrPolarity && typeof attackerOrPolarity === "object" && "modCache" in attackerOrPolarity) {
    const mult = polarityOffenseMult(attackerOrPolarity, defender, cap);
    return clamp(mult - 1, -cap, cap);
  }

  if (attackerOrPolarity && typeof attackerOrPolarity === "object") {
    const grant = attackerOrPolarity.grant;
    if (grant && typeof grant === "object") {
      const sum = Object.values(grant).reduce((acc, value) => acc + (Number(value) || 0), 0);
      const scalar = clamp(sum * 0.1, 0, Math.min(0.15, cap));
      return clamp(scalar, -cap, cap);
    }
  }

  const attacker = {
    polarity: attackerOrPolarity || Object.create(null),
    modCache: { offense: { polarity: { grant: Object.create(null), onHitBias: Object.create(null) } } },
  };
  const neutralDefender = defender && typeof defender === "object"
    ? defender
    : { polarity: Object.create(null), modCache: { defense: { polarity: { grant: Object.create(null), defenseBias: Object.create(null) } } } };
  const mult = polarityOffenseMult(attacker, neutralDefender, cap);
  return clamp(mult - 1, -cap, cap);
}

/**
 * Convenience helper returning the defensive scalar to subtract from 1 for mitigation.
 * Accepts either full actor objects or raw polarity maps.
 * @param {any} defenderOrPolarity
 * @param {any} [attacker]
 * @param {number} [cap]
 */
export function polarityDefenseScalar(defenderOrPolarity, attacker = null, cap = 0.5) {
  if (defenderOrPolarity && typeof defenderOrPolarity === "object" && "modCache" in defenderOrPolarity) {
    const mult = polarityDefenseMult(defenderOrPolarity, attacker, cap);
    return clamp(mult - 1, -cap, cap);
  }

  if (defenderOrPolarity && typeof defenderOrPolarity === "object") {
    const defenseBias = defenderOrPolarity.defenseBias;
    if (defenseBias && typeof defenseBias === "object") {
      const baseBias = Number(defenseBias.baseResistPct) || 0;
      const vs = defenseBias.vs && typeof defenseBias.vs === "object" ? defenseBias.vs : null;
      let opposed = 0;
      if (vs) {
        const attackGrant = attacker && typeof attacker === "object" && attacker.grant && typeof attacker.grant === "object"
          ? attacker.grant
          : null;
        const attackPolarity = !attackGrant && attacker && typeof attacker === "object" && attacker.polarity && typeof attacker.polarity === "object"
          ? attacker.polarity
          : null;
        let hasOpposition = false;
        if (attackGrant) {
          hasOpposition = Object.keys(vs).some((axis) => vs[axis] && (Number(attackGrant[axis]) || 0) > 0);
        } else if (attackPolarity) {
          hasOpposition = Object.keys(vs).some((axis) => vs[axis] && (Number(attackPolarity[axis]) || 0) > 0);
        } else {
          hasOpposition = Object.values(vs).some(Boolean);
        }
        opposed = hasOpposition ? 0.05 : 0;
      }
      const scalar = clamp(baseBias + opposed, 0, Math.min(0.2, cap));
      return clamp(scalar, -cap, cap);
    }
  }

  const defender = {
    polarity: defenderOrPolarity || Object.create(null),
    modCache: { defense: { polarity: { grant: Object.create(null), defenseBias: Object.create(null) } } },
  };
  const attackerObj = attacker && typeof attacker === "object"
    ? attacker
    : { polarity: Object.create(null), modCache: { offense: { polarity: { grant: Object.create(null), onHitBias: Object.create(null) } } } };
  const mult = polarityDefenseMult(defender, attackerObj, cap);
  return clamp(mult - 1, -cap, cap);
}
