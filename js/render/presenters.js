// @ts-check

/** @typedef {import("./types.js").TileVisual} TileVisual */
/** @typedef {import("./types.js").RGBA} RGBA */

import { TILE_WALL } from "../constants.js";

const colorCache = new Map();

/**
 * @param {string} color
 * @returns {RGBA}
 */
function toRgba(color) {
  if (colorCache.has(color)) {
    return /** @type {RGBA} */ (colorCache.get(color));
  }
  const normalized = color.trim();
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 1;
  if (normalized.startsWith("#")) {
    if (normalized.length === 7) {
      r = parseInt(normalized.slice(1, 3), 16);
      g = parseInt(normalized.slice(3, 5), 16);
      b = parseInt(normalized.slice(5, 7), 16);
    } else if (normalized.length === 4) {
      r = parseInt(normalized[1] + normalized[1], 16);
      g = parseInt(normalized[2] + normalized[2], 16);
      b = parseInt(normalized[3] + normalized[3], 16);
    } else {
      throw new Error(`Unsupported hex color: ${color}`);
    }
  } else {
    const match = normalized.match(/^rgba?\(([^)]+)\)$/i);
    if (!match) {
      throw new Error(`Unsupported color format: ${color}`);
    }
    const parts = match[1]
      .split(",")
      .map((p) => parseFloat(p.trim()))
      .filter((n) => !Number.isNaN(n));
    if (parts.length < 3) {
      throw new Error(`Unsupported color format: ${color}`);
    }
    [r, g, b] = parts;
    r = clampColor(r);
    g = clampColor(g);
    b = clampColor(b);
    if (parts.length >= 4) {
      a = Math.max(0, Math.min(1, parts[3]));
    }
  }
  const rgba = { r, g, b, a };
  colorCache.set(color, rgba);
  return rgba;
}

function clampColor(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/**
 * Convert state into renderable tile visuals for the main map.
 * @param {Object} params
 * @param {number[][]} params.grid
 * @param {boolean[][]} params.explored
 * @param {Set<string>} params.visibleSet
 * @param {{ x: number, y: number }} params.player
 * @param {{ x: number, y: number } | null | undefined} [params.startPos]
 * @param {{ x: number, y: number } | null | undefined} [params.endPos]
 * @param {Record<string, string>} params.colors
 * @param {(x: number, y: number) => number | undefined} params.overlayAlphaAt
 * @param {RGBA | null | undefined} [params.overlayColor]
 * @returns {TileVisual[]}
 */
export function buildMainViewBatch({
  grid,
  explored,
  visibleSet,
  player,
  startPos = null,
  endPos = null,
  colors,
  overlayAlphaAt,
  overlayColor = null,
}) {
  const batch = [];
  if (!Array.isArray(grid) || grid.length === 0) return batch;

  const width = grid[0].length;
  const height = grid.length;

  const wallBG = colors.wall ? toRgba(colors.wall) : toRgba("#000000");
  const floorBG = colors.floor ? toRgba(colors.floor) : toRgba("#000000");
  const playerBG = colors.player ? toRgba(colors.player) : toRgba("#ffffff");
  const startBG = colors.start ? toRgba(colors.start) : playerBG;
  const endBG = colors.end ? toRgba(colors.end) : playerBG;
  const floorGlyph = colors.floorGlyph ? toRgba(colors.floorGlyph) : toRgba("#888888");
  const playerGlyph = colors.playerGlyph ? toRgba(colors.playerGlyph) : toRgba("#ffffff");

  const overlayRgb = overlayColor || null;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!explored[y]?.[x]) continue;
      const key = `${x},${y}`;
      const isVisible = visibleSet.has(key);
      const tile = grid[y][x];
      const isWall = tile === TILE_WALL;

      /** @type {TileVisual} */
      const base = {
        x,
        y,
        kind: isWall ? "wall" : "floor",
        glyph: isWall ? undefined : "·",
        fg: isWall ? undefined : floorGlyph,
        bg: isWall ? wallBG : floorBG,
      };

      if (startPos && x === startPos.x && y === startPos.y) {
        base.kind = "start";
        base.bg = startBG;
        base.glyph = undefined;
        base.fg = undefined;
      }

      if (endPos && x === endPos.x && y === endPos.y) {
        base.kind = "end";
        base.bg = endBG;
        base.glyph = undefined;
        base.fg = undefined;
      }

      if (isVisible) {
        const overlayA = overlayAlphaAt(x, y);
        if (typeof overlayA === "number") {
          const clamped = Math.max(0, Math.min(1, overlayA));
          if (clamped > 0) {
            base.overlayA = clamped;
            if (overlayRgb) {
              base.overlayColor = overlayRgb;
            }
          }
        }
      }

      batch.push(base);
    }
  }

  batch.push({
    x: player.x,
    y: player.y,
    kind: "player",
    glyph: "@",
    fg: playerGlyph,
    bg: playerBG,
    overlayA: 0,
    overlayColor: overlayRgb || undefined,
  });

  return batch;
}
