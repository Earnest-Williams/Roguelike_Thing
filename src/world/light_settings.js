// src/world/light_settings.js
// @ts-check

/**
 * Default knob values for the lighting falloff curve.
 */
export const DEFAULT_LIGHT_FALLOFF_SETTINGS = Object.freeze({
  /**
   * Override for the number of tiles to treat as a dead-zone near the light.
   * When null, the per-light configuration is used.
   */
  deadZoneTiles: null,
  /**
   * Multiplier applied to the smoothstep denominator, effectively changing the
   * reach of each light.
   */
  smoothstepRangeMultiplier: 1.75,
  /**
   * Power applied after the smoothstep to shape the overall intensity curve.
   */
  falloffPower: 0.8,
});

/** @typedef {{ deadZoneTiles: number | null, smoothstepRangeMultiplier: number, falloffPower: number }} LightFalloffSettings */

/** @type {LightFalloffSettings} */
const state = {
  deadZoneTiles: DEFAULT_LIGHT_FALLOFF_SETTINGS.deadZoneTiles,
  smoothstepRangeMultiplier: DEFAULT_LIGHT_FALLOFF_SETTINGS.smoothstepRangeMultiplier,
  falloffPower: DEFAULT_LIGHT_FALLOFF_SETTINGS.falloffPower,
};

/** @type {Set<(settings: LightFalloffSettings) => void>} */
const listeners = new Set();

/**
 * Internal helper to create a sanitized, readonly snapshot for external
 * consumers.
 * @returns {LightFalloffSettings}
 */
export function getLightFalloffSettings() {
  return {
    deadZoneTiles: state.deadZoneTiles,
    smoothstepRangeMultiplier: state.smoothstepRangeMultiplier,
    falloffPower: state.falloffPower,
  };
}

/**
 * Returns a mutable reference to the internal state. The returned object should
 * be treated as readonly by callers.
 * @returns {LightFalloffSettings}
 */
export function getLightFalloffSettingsRef() {
  return state;
}

function notifyListeners() {
  if (listeners.size === 0) return;
  const snapshot = getLightFalloffSettings();
  for (const fn of listeners) {
    try {
      fn(snapshot);
    } catch (err) {
      if (typeof console !== "undefined" && console.error) {
        console.error("[light-settings] listener failed", err);
      }
    }
  }
}

/**
 * @param {(settings: LightFalloffSettings) => void} fn
 * @param {{ immediate?: boolean }} [options]
 */
export function subscribeLightFalloffSettings(fn, options = {}) {
  if (typeof fn !== "function") return () => {};
  listeners.add(fn);
  if (options.immediate) {
    try {
      fn(getLightFalloffSettings());
    } catch (err) {
      if (typeof console !== "undefined" && console.error) {
        console.error("[light-settings] listener failed", err);
      }
    }
  }
  return () => listeners.delete(fn);
}

function applyDeadZoneTiles(value) {
  if (value === undefined) return false;
  const previous = state.deadZoneTiles;
  if (value === null || value === "") {
    if (previous !== null) {
      state.deadZoneTiles = null;
      return true;
    }
    return false;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) return false;
  const next = Math.max(0, num);
  if (previous === next) return false;
  state.deadZoneTiles = next;
  return true;
}

function applyRangeMultiplier(value) {
  if (value === undefined) return false;
  const num = Number(value);
  if (!Number.isFinite(num)) return false;
  const next = Math.max(0.01, num);
  if (state.smoothstepRangeMultiplier === next) return false;
  state.smoothstepRangeMultiplier = next;
  return true;
}

function applyFalloffPower(value) {
  if (value === undefined) return false;
  const num = Number(value);
  if (!Number.isFinite(num)) return false;
  const next = Math.max(0.01, num);
  if (state.falloffPower === next) return false;
  state.falloffPower = next;
  return true;
}

/**
 * Update the current lighting falloff configuration.
 * @param {Partial<LightFalloffSettings>} [partial]
 * @returns {LightFalloffSettings}
 */
export function setLightFalloffSettings(partial = {}) {
  if (!partial || typeof partial !== "object") {
    return getLightFalloffSettings();
  }
  let changed = false;
  changed = applyDeadZoneTiles(partial.deadZoneTiles) || changed;
  changed = applyRangeMultiplier(partial.smoothstepRangeMultiplier) || changed;
  changed = applyFalloffPower(partial.falloffPower) || changed;
  if (changed) {
    notifyListeners();
  }
  return getLightFalloffSettings();
}

/**
 * Restore the defaults and notify listeners if anything changed.
 */
export function resetLightFalloffSettings() {
  const changed =
    applyDeadZoneTiles(DEFAULT_LIGHT_FALLOFF_SETTINGS.deadZoneTiles) ||
    applyRangeMultiplier(DEFAULT_LIGHT_FALLOFF_SETTINGS.smoothstepRangeMultiplier) ||
    applyFalloffPower(DEFAULT_LIGHT_FALLOFF_SETTINGS.falloffPower);
  if (changed) {
    notifyListeners();
  }
  return getLightFalloffSettings();
}
