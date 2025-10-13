import { clamp, colorStringToRgb, getNow as defaultGetNow, posKey, smoothstep01 } from "../../js/utils.js";
import { FOV_TRANSFORMS, TILE_WALL } from "../../js/constants.js";

function clampUnitInterval(value) {
  if (!Number.isFinite(value)) return 0;
  return clamp(value, 0, 1);
}

/**
 * Build a light overlay context describing the player's light radius and flicker state.
 * @param {object} player
 * @param {{ fallbackFlickerRate?: number }} lightConfig
 * @param {() => number} [getNow]
 */
export function createLightOverlayContext(player, lightConfig = {}, getNow = defaultGetNow) {
  const radius = Math.max(0, Number(player?.getLightRadius?.() ?? 0));
  const rawRate =
    typeof player?.equipment?.getLightFlickerRate === "function"
      ? player.equipment.getLightFlickerRate()
      : lightConfig?.fallbackFlickerRate ?? 0;
  const flickerRate =
    typeof rawRate === "number" && Number.isFinite(rawRate) ? Math.max(0, rawRate) : 0;
  const tSec = getNow() / 1000;
  const osc = flickerRate > 0 ? Math.sin(tSec * 2 * Math.PI * flickerRate) : 0;
  const playerX = typeof player?.x === "number" ? player.x : 0;
  const playerY = typeof player?.y === "number" ? player.y : 0;
  return {
    radius,
    osc,
    playerX,
    playerY,
  };
}

/**
 * Compute overlay alpha for a tile given lighting context and configuration.
 * @param {number} x
 * @param {number} y
 * @param {{ radius?: number, osc?: number, playerX?: number, playerY?: number } | null} lightCtx
 * @param {{ baseOverlayAlpha?: number, flickerVariance?: number, flickerNearDeadZoneTiles?: number, flickerFalloffPower?: number }} lightConfig
 */
export function computeTileOverlayAlpha(x, y, lightCtx, lightConfig = {}) {
  const baseA = clampUnitInterval(lightConfig.baseOverlayAlpha ?? 0);
  const variance = Math.max(0, lightConfig.flickerVariance ?? 0);
  if (!lightCtx || variance <= 0) {
    return baseA;
  }
  const radius = Number.isFinite(lightCtx.radius) ? Math.max(0, lightCtx.radius) : 0;
  if (radius <= 0) {
    return baseA;
  }
  const osc = lightCtx.osc || 0;
  if (osc === 0) {
    return baseA;
  }
  const dx = x - (lightCtx.playerX ?? 0);
  const dy = y - (lightCtx.playerY ?? 0);
  const dist = Math.max(Math.abs(dx), Math.abs(dy));
  const dead = lightConfig.flickerNearDeadZoneTiles ?? 0;
  const denom = Math.max(1e-6, radius - dead);
  const u0 = (dist - dead) / denom;
  const u = smoothstep01(u0);
  const falloffPower = Number.isFinite(lightConfig.flickerFalloffPower)
    ? lightConfig.flickerFalloffPower
    : 1;
  const amp = variance * Math.pow(u, falloffPower);
  const alpha = baseA + osc * amp;
  if (alpha <= 0) return 0;
  if (alpha >= 1) return 1;
  return alpha;
}

/**
 * Produce light overlay visual properties for rendering layers.
 * @param {{ color?: string }} lightProperties
 * @param {{ fallbackColor?: string, baseOverlayAlpha?: number }} lightConfig
 */
export function computeLightOverlayVisuals(lightProperties = {}, lightConfig = {}) {
  const fallbackColor = lightConfig.fallbackColor ?? "#ffe9a6";
  const rgb = colorStringToRgb(lightProperties.color, fallbackColor);
  const baseA = clampUnitInterval(lightConfig.baseOverlayAlpha ?? 0);
  return {
    style: `rgba(${rgb.r},${rgb.g},${rgb.b},${baseA.toFixed(3)})`,
    rgb,
    alpha: baseA,
  };
}

/**
 * Determine if a tile blocks light when casting field-of-view rays.
 * @param {{ width: number, height: number, grid: number[][], known?: number[][] }} mapState
 * @param {number} x
 * @param {number} y
 * @param {boolean} [useKnownGrid]
 */
export function tileBlocksLight(mapState, x, y, useKnownGrid = false) {
  if (!mapState) return true;
  if (x < 0 || x >= mapState.width || y < 0 || y >= mapState.height) return true;
  const grid = useKnownGrid ? mapState.known : mapState.grid;
  const row = grid?.[y];
  if (!row) return true;
  const val = row[x];
  if (useKnownGrid && val === -1) return false;
  return val === TILE_WALL;
}

/**
 * Compute the set of visible tiles using recursive shadow-casting.
 * @param {{ x: number, y: number }} pos
 * @param {number} radius
 * @param {{ width: number, height: number, grid: number[][], known?: number[][] }} mapState
 * @param {{ useKnownGrid?: boolean, transforms?: readonly number[][][] }} [options]
 * @returns {Set<string>}
 */
export function computeFieldOfView(pos, radius, mapState, options = {}) {
  const visible = new Set();
  if (!pos || !mapState) {
    return visible;
  }
  const transforms = options.transforms ?? FOV_TRANSFORMS;
  const useKnownGrid = Boolean(options.useKnownGrid);
  const safeRadius = Number.isFinite(radius) ? Math.max(0, radius) : 0;
  const radiusSq = safeRadius * safeRadius;
  visible.add(posKey(pos));
  const setVisible = (x, y) => {
    if (x < 0 || x >= mapState.width || y < 0 || y >= mapState.height) return;
    visible.add(posKey({ x, y }));
  };
  function castLight(row, startSlope, endSlope, xx, xy, yx, yy) {
    if (startSlope < endSlope) return;
    for (let i = row; i <= safeRadius; i++) {
      let dx = -i - 1;
      let dy = -i;
      let blocked = false;
      let newStart = startSlope;
      while (dx <= 0) {
        dx += 1;
        const mx = pos.x + dx * xx + dy * xy;
        const my = pos.y + dx * yx + dy * yy;
        const lSlope = (dx - 0.5) / (dy + 0.5);
        const rSlope = (dx + 0.5) / (dy - 0.5);
        if (startSlope < rSlope) {
          continue;
        }
        if (endSlope > lSlope) {
          break;
        }
        const distSq = dx * dx + dy * dy;
        if (distSq <= radiusSq) {
          setVisible(mx, my);
        }
        const blockedTile = tileBlocksLight(mapState, mx, my, useKnownGrid);
        if (blocked) {
          if (blockedTile) {
            newStart = rSlope;
            continue;
          }
          blocked = false;
          startSlope = newStart;
        } else if (blockedTile && i < safeRadius) {
          blocked = true;
          castLight(i + 1, startSlope, lSlope, xx, xy, yx, yy);
          newStart = rSlope;
        }
      }
      if (blocked) {
        break;
      }
    }
  }
  for (let oct = 0; oct < transforms.length; oct++) {
    const transform = transforms[oct];
    if (!Array.isArray(transform) || transform.length !== 4) continue;
    const [xx, xy, yx, yy] = transform;
    castLight(1, 1.0, 0.0, xx, xy, yx, yy);
  }
  return visible;
}

/**
 * Compute visible cells without caching, for consumers like the minimap.
 * @param {{ x: number, y: number }} pos
 * @param {number} radius
 * @param {{ width: number, height: number, grid: number[][], known?: number[][] }} mapState
 * @param {{ useKnownGrid?: boolean, transforms?: readonly number[][][] }} [options]
 */
export function computeVisibleCells(pos, radius, mapState, options = {}) {
  return computeFieldOfView(pos, radius, mapState, options);
}
