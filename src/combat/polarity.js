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

export function polarityOnHitScalar(attacker, defender) {
  const bias = attacker?.modCache?.polarity?.onHitBias || {};
  const total = bias.all || 0;
  return 1 + clamp(total, -0.5, 0.5);
}

export function polarityDefScalar(defender) {
  const bias = defender?.modCache?.polarity?.defenseBias || {};
  const total = bias.all || 0;
  return 1 + clamp(total, -0.5, 0.5);
}

export function polarityOffenseMult(attPol, defPol, cap = 0.5) {
  const bias = attPol?.onHitBias || {};
  const total = bias.all || 0;
  return 1 + clamp(total, -cap, cap);
}

export function polarityDefenseMult(defPol, attPol, cap = 0.5) {
  const bias = defPol?.defenseBias || {};
  const total = bias.all || 0;
  return 1 + clamp(total, -cap, cap);
}
