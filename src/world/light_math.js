/**
 * Composite lighting math:
 *  - createCompositeLightContext(lights, cfg, nowFn)
 *  - compositeOverlayAt(x,y, ctx, cfg, losFn?, entities?) -> { a, rgb }
 *
 * Attenuation: smoothstep-like rolloff with optional dead-zone near source.
 * Flicker: per-light sine oscillator scaled by cfg.flickerVariance & falloff pow.
 * Blending: bounded “screen-like” accumulation: A = 1-Π(1-ai), C = 1-Π(1-ci*ai)
 */

import { LIGHT_CHANNELS } from "../../js/constants.js";

export function createCompositeLightContext(lights = [], cfg = {}, nowFn = defaultNow) {
  const t = nowFn() / 1000;
  const ls = [];
  let maxFlickerRate = 0;

  for (const L of lights) {
    if (!L || !Number.isFinite(+L.radius) || +L.radius <= 0) continue;
    const rate = Math.max(0, Number(L.flickerRate) || 0);
    const color = toRgb(L.color ?? cfg.fallbackColor ?? "#ffe9a6");
    ls.push({
      x: L.x|0, y: L.y|0, r: +L.radius,
      color,
      baseIntensity: clamp01(L.intensity ?? 1),
      osc: rate > 0 ? Math.sin(t * 2 * Math.PI * rate) : 0,
      angle: Number.isFinite(L.angle) ? +L.angle : undefined,
      width: Number.isFinite(L.width) ? +L.width : undefined,
      channel: Number.isFinite(L.channel) ? +L.channel : LIGHT_CHANNELS.ALL,
    });
    if (rate > maxFlickerRate) maxFlickerRate = rate;
  }
  return { lights: ls, maxFlickerRate };
}

export function compositeOverlayAt(x, y, ctx, cfg = {}, losFn = null, entitiesOnTile = []) {
  const arr = ctx?.lights || [];
  if (arr.length === 0) return { a: clamp01(cfg.baseOverlayAlpha ?? 0), rgb: null };

  let oneMinusA = 1, omr = 1, omg = 1, omb = 1;

  const tileMask = Array.isArray(entitiesOnTile) && entitiesOnTile.length > 0
    ? entitiesOnTile.reduce(
        (mask, ent) => mask | (Number.isFinite(ent?.lightMask) ? ent.lightMask : LIGHT_CHANNELS.ALL),
        0,
      ) || 0
    : LIGHT_CHANNELS.ALL;

  for (const L of arr) {
    if ((L.channel & tileMask) === 0) {
      continue;
    }
    if (losFn && !losFn(L, x, y)) continue;
    const ai = contributionAt(x, y, L, cfg);
    if (ai <= 0) continue;
    oneMinusA *= (1 - ai);
    omr *= (1 - (L.color.r / 255) * ai);
    omg *= (1 - (L.color.g / 255) * ai);
    omb *= (1 - (L.color.b / 255) * ai);
  }

  const a = clamp01(1 - oneMinusA);
  if (a <= 0) return { a: 0, rgb: null };
  return {
    a,
    rgb: { r: Math.round(255 * (1 - omr)), g: Math.round(255 * (1 - omg)), b: Math.round(255 * (1 - omb)) },
  };
}

// ---------- internals ----------
function contributionAt(x, y, L, cfg) {
  const dead = Math.max(0, cfg.flickerNearDeadZoneTiles ?? 0);
  const dx = x - L.x, dy = y - L.y;
  if (Number.isFinite(L.angle) && Number.isFinite(L.width) && L.width > 0) {
    if (dx !== 0 || dy !== 0) {
      const angleToTile = Math.atan2(dy, dx);
      let delta = angleToTile - L.angle;
      if (!Number.isFinite(delta)) {
        delta = 0;
      }
      while (delta <= -Math.PI) delta += 2 * Math.PI;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      if (Math.abs(delta) > L.width / 2) {
        return 0;
      }
    }
  }
  const dist = Math.hypot(dx, dy);
  const denom = Math.max(1e-6, L.r - dead);
  const falloff = 1 - smoothstep01((dist - dead) / denom); // 1->0 across radius
  if (falloff <= 0) return 0;

  const baseA = clamp01(cfg.baseOverlayAlpha ?? 0.75);
  const variance = Math.max(0, cfg.flickerVariance ?? 0.15);
  const fPow = Number.isFinite(cfg.flickerFalloffPower) ? cfg.flickerFalloffPower : 1;

  // Oscillation amplitude attenuates with distance (falloff^fPow)
  const flicker = variance ? (L.osc * variance * Math.pow(Math.max(falloff, 0), fPow)) : 0;

  return clamp01((baseA + flicker) * falloff * L.baseIntensity);
}

function smoothstep01(t) { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); }
function clamp01(t) { return Math.max(0, Math.min(1, +t)); }
function defaultNow() { return (typeof performance !== "undefined" ? performance.now() : Date.now()); }

function toRgb(c) {
  if (!c) return { r: 255, g: 233, b: 166 };
  if (typeof c === "object" && Number.isFinite(c.r)) return { r: c.r|0, g: c.g|0, b: c.b|0 };
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(c));
  if (!m) return { r: 255, g: 233, b: 166 };
  return { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) };
}
