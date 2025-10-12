// src/utils/number.js
// @ts-check

/**
 * Clamp a numeric value to the inclusive range [min, max].
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
export function clamp(value, min, max) {
  if (!Number.isFinite(value)) return Number.isFinite(min) ? min : 0;
  if (Number.isFinite(min) && value < min) return min;
  if (Number.isFinite(max) && value > max) return max;
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

