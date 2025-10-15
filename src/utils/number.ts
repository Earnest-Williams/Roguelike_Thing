// src/utils/number.js
// @ts-nocheck

/**
 * Clamp a numeric value to the inclusive range [min, max].
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
export function clamp(value, min, max) {
  let lo = min;
  let hi = max;

  if (typeof lo === "number" && typeof hi === "number" && lo > hi) {
    [lo, hi] = [hi, lo];
  }

  if (!Number.isFinite(value)) {
    if (Number.isNaN(value)) {
      if (Number.isFinite(lo)) return lo;
      if (Number.isFinite(hi)) return hi;
      return 0;
    }
    if (value === Infinity) {
      return Number.isFinite(hi) ? hi : value;
    }
    if (value === -Infinity) {
      return Number.isFinite(lo) ? lo : value;
    }
  }
  if (Number.isFinite(lo) && value < lo) return lo;
  if (Number.isFinite(hi) && value > hi) return hi;
  return value;
}

/**
 * Clamp a numeric value to the inclusive range [0, 1].
 * @param {number} value
 */
export function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

