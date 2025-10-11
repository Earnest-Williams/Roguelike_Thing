// src/combat/polarity.js
// @ts-check

const TYPES = ["order", "growth", "chaos", "decay", "void"];

/** Clamp utility */
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** Normalize any partial vector into a safe 0..1 vector with unit L1 norm (sum=1) */
export function normalizePolarity(input = {}) {
  let sum = 0;
  const out = Object.create(null);
  for (const k of TYPES) {
    const v = Number(input[k] || 0);
    out[k] = v > 0 ? v : 0;
    sum += out[k];
  }
  if (sum <= 0) {
    // neutral
    for (const k of TYPES) out[k] = 0;
    return out;
  }
  for (const k of TYPES) out[k] = out[k] / sum;
  return out;
}

/**
 * Opposition table: each type is opposed by two (Brand Plan concept).
 * Tune weights as needed; keep total magnitude ≤ 1 pre-clamp.
 */
const OPPOSES = {
  order: ["chaos", "void"],
  growth: ["decay", "void"],
  chaos: ["order", "growth"],
  decay: ["growth", "order"],
  void: ["order", "growth"],
};

/**
 * Compute a signed “difference score” in [-1, +1] of attacker vs defender.
 * Positive -> attacker favored (more damage). Negative -> defender favored (less).
 * This is intentionally simple and tunable.
 */
export function polarityAlignmentScore(att, def) {
  const A = normalizePolarity(att);
  const D = normalizePolarity(def);
  let score = 0;

  // Matching contribution (small)
  for (const k of TYPES) {
    score += 0.25 * (A[k] * (1 - D[k]));
  }

  // Opposition contribution (larger)
  for (const k of TYPES) {
    const opps = OPPOSES[k] || [];
    for (const o of opps) {
      score += 0.5 * (A[k] * (D[o] || 0));
    }
  }

  // Defender “counters” (pull score back)
  for (const k of TYPES) {
    const opps = OPPOSES[k] || [];
    for (const o of opps) {
      score -= 0.4 * (D[k] * (A[o] || 0));
    }
  }

  return clamp(score, -1, 1);
}

/**
 * Convert alignment score into offense multiplier, clamped to ±50%.
 * E.g., score=+1 -> x1.5 ; score= -1 -> x0.5
 */
export function polarityOffenseMult(attPol, defPol, cap = 0.5) {
  const s = polarityAlignmentScore(attPol, defPol);
  return 1 + clamp(s, -cap, cap);
}

/**
 * Defense scalar: reduces damage after resists. Same cap by default.
 * Note: interpreted as extra “resistance” applied multiplicatively.
 */
export function polarityDefenseMult(defPol, attPol, cap = 0.5) {
  const s = polarityAlignmentScore(attPol, defPol);
  const d = -s;
  return 1 + clamp(d, -cap, cap);
}
