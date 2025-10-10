// @ts-check

/** @typedef {import("./types.js").TileVisual} TileVisual */
/** @typedef {import("./types.js").RGBA} RGBA */

import { TILE_WALL } from "../constants.js";
import { colorStringToRgba as toRgba } from "../utils.js";

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
 * @param {Array<{
 *   x: number,
 *   y: number,
 *   kind?: string,
 *   glyph?: string,
 *   fg?: string | RGBA,
 *   bg?: string | RGBA,
 *   overlayA?: number,
 *   overlayColor?: string | RGBA,
 *   badge?: string,
 *   badgeColor?: string | RGBA,
 *   badgeBg?: string | RGBA,
 * }>} [params.entities]
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
  entities = [],
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

  const overlayRgb = normalizeColor(overlayColor) || null;

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

  if (Array.isArray(entities) && entities.length > 0) {
    for (const ent of entities) {
      if (!ent || typeof ent.x !== "number" || typeof ent.y !== "number") continue;
      /** @type {TileVisual} */
      const visual = {
        x: ent.x,
        y: ent.y,
        kind: ent.kind || "entity",
        glyph: ent.glyph,
        fg: normalizeColor(ent.fg) || undefined,
        bg: normalizeColor(ent.bg) || undefined,
      };
      if (typeof ent.overlayA === "number") {
        const clamped = Math.max(0, Math.min(1, ent.overlayA));
        if (clamped > 0) {
          visual.overlayA = clamped;
          const oc = normalizeColor(ent.overlayColor);
          if (oc) visual.overlayColor = oc;
        }
      }
      if (ent.badge) {
        visual.badge = ent.badge;
        const badgeColor = normalizeColor(ent.badgeColor);
        if (badgeColor) visual.badgeColor = badgeColor;
        const badgeBg = normalizeColor(ent.badgeBg);
        if (badgeBg) visual.badgeBg = badgeBg;
      }
      batch.push(visual);
    }
  }

  return batch;
}

/**
 * Build tile visuals and palette information for the minimap surface.
 * @param {Object} params
 * @param {number[][]} params.grid
 * @param {boolean[][]} params.explored
 * @param {{ x: number, y: number }} params.player
 * @param {number} [params.padding]
 * @param {Record<string, string>} params.colors
 * @returns {{ tiles: TileVisual[], width: number, height: number, padding: number, colors: { viewport?: RGBA, border?: RGBA } }}
 */
export function buildMinimapPresentation({
  grid,
  explored,
  player,
  padding = 0,
  colors = {},
}) {
  const pad = Math.max(0, Math.floor(padding));
  const width = grid[0]?.length || 0;
  const height = grid.length || 0;
  const totalW = width + pad * 2;
  const totalH = height + pad * 2;

  const baseFloor = colors.floor ? toRgba(colors.floor) : toRgba("#111111");
  const exploredFloor = colors.floorExplored
    ? toRgba(colors.floorExplored)
    : baseFloor;
  const wallColor = colors.wall ? toRgba(colors.wall) : toRgba("#333333");
  const playerColor = colors.player
    ? toRgba(colors.player)
    : toRgba("#ffffff");
  const viewportColor = colors.viewport
    ? toRgba(colors.viewport)
    : undefined;
  const borderColor = colors.border ? toRgba(colors.border) : undefined;

  /** @type {TileVisual[]} */
  const tiles = [];

  if (totalW <= 0 || totalH <= 0) {
    return { tiles, width: 0, height: 0, padding: pad, colors: {} };
  }

  for (let y = 0; y < totalH; y++) {
    for (let x = 0; x < totalW; x++) {
      tiles.push({ x, y, kind: "floor", bg: baseFloor });
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tileValue = grid[y][x];
      const tx = x + pad;
      const ty = y + pad;
      if (tileValue === TILE_WALL) {
        tiles.push({ x: tx, y: ty, kind: "wall", bg: wallColor });
      } else if (explored?.[y]?.[x] && exploredFloor !== baseFloor) {
        tiles.push({ x: tx, y: ty, kind: "floor", bg: exploredFloor });
      }
    }
  }

  if (player && typeof player.x === "number" && typeof player.y === "number") {
    tiles.push({
      x: pad + player.x,
      y: pad + player.y,
      kind: "player",
      bg: playerColor,
    });
  }

  return { 
    tiles,
    width: totalW,
    height: totalH,
    padding: pad,
    colors: {
      viewport: viewportColor,
      border: borderColor,
    },
  };
}

/**
 * @param {string | RGBA | null | undefined} input
 * @returns {RGBA | null}
 */
function normalizeColor(input) {
  if (!input) return null;
  if (typeof input === "string") {
    try {
      return toRgba(input);
    } catch (_) {
      return null;
    }
  }
  if (typeof input === "object") {
    const maybe = /** @type {any} */ (input);
    if (
      typeof maybe.r === "number" &&
      typeof maybe.g === "number" &&
      typeof maybe.b === "number"
    ) {
      return {
        r: maybe.r,
        g: maybe.g,
        b: maybe.b,
        a: typeof maybe.a === "number" ? maybe.a : 1,
      };
    }
  }
  return null;
}
