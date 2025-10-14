// @ts-check

/** @typedef {import("./types.js").TileVisual} TileVisual */
/** @typedef {import("./types.js").RGBA} RGBA */

import { TILE_WALL } from "../constants.js";
import { colorStringToRgba as toRgba } from "../utils.js";

// Lighting overlays read Actor.getLightRadius() (Monster delegates). No local helpers.

/**
 * Convert state into renderable tile visuals for the main map.
 * Supports per-tile overlay alpha and color via overlayAlphaAt/overlayColorAt,
 * gracefully falling back to a flat overlayColor tint when needed.
 * @param {Object} params
 * @param {number[][]} params.grid
 * @param {boolean[][]} params.explored
 * @param {Set<string>} params.visibleSet
 * @param {{ x: number, y: number }} params.player
 * @param {{ x: number, y: number } | null | undefined} [params.startPos]
 * @param {{ x: number, y: number } | null | undefined} [params.endPos]
 * @param {Record<string, string>} params.colors
 * @param {(x: number, y: number) => number | undefined} params.overlayAlphaAt
 * @param {(x: number, y: number) => import("./types.js").RGBA | undefined | null} [params.overlayColorAt]
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
  overlayColorAt = null,
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

  const rawPlayerLightRadius = Number(player?.getLightRadius?.() ?? 0);
  const playerLightRadius = Number.isFinite(rawPlayerLightRadius)
    ? Math.max(0, rawPlayerLightRadius)
    : 0;

  const overlayAlphaFn =
    typeof overlayAlphaAt === "function" ? overlayAlphaAt : null;
  const overlayColorFn =
    typeof overlayColorAt === "function" ? overlayColorAt : null;

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
        const overlayA = playerLightRadius > 0 && overlayAlphaFn
          ? overlayAlphaFn(x, y)
          : 0;
        if (typeof overlayA === "number") {
          const clamped = Math.max(0, Math.min(1, overlayA));
          if (clamped > 0) {
            base.overlayA = clamped;
            const oc = overlayColorFn
              ? overlayColorFn(x, y) ?? overlayRgb
              : overlayRgb;
            if (oc) {
              base.overlayColor = oc;
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

export function presentDebug(actor) {
  if (!actor?._debug?.turns?.length) return "";
  const latest = actor._debug.turns[actor._debug.turns.length - 1];
  try {
    return JSON.stringify(latest, null, 2);
  } catch (err) {
    return String(latest);
  }
}

export function drawHUD(ctx, actor) {
  if (!actor) return "";
  const attEntries = Object.entries(actor.attunement?.stacks || {})
    .sort((a, b) => (b[1] || 0) - (a[1] || 0))
    .slice(0, 2)
    .map(([type, stacks]) => `${type}:${stacks}`)
    .join(" ");

  const pools = Object.entries(actor.resources?.pools || {})
    .map(([name, state]) => {
      const cur = Number(state?.cur ?? state);
      const max = Number(state?.max ?? state);
      return `${name}:${cur}/${max}`;
    })
    .join(" ");

  const cds = Object.entries(actor.cooldowns || {})
    .map(([key, value]) => `${key}:${value}`)
    .join(" ");

  const sts = Array.isArray(actor.statuses)
    ? actor.statuses.map(s => `${s.id}(${s.stacks})`).join(" ")
    : "";

  const apCap = actor.maxAP ?? actor.apCap ?? actor.baseActionAP ?? 0;
  const text = `AP:${actor.ap}/${apCap} RES[${pools}] ATTUNE[${attEntries}] CD[${cds}] ST[${sts}]`;

  if (ctx) {
    if (typeof ctx.debugText === "function") {
      ctx.debugText(text);
    } else if (typeof ctx.fillText === "function") {
      ctx.save?.();
      ctx.fillStyle = ctx.fillStyle || "#fff";
      ctx.fillText(text, 8, 16);
      ctx.restore?.();
    }
  }

  return text;
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

export function mountDevPanel(root, actor) {
  const panel = document.createElement("div");
  panel.className = "dev-panel";
  panel.style.cssText = "position:absolute;right:8px;top:8px;width:420px;background:#111a;border:1px solid #444;padding:8px;font:12px monospace;color:#ddd;";
  const area = document.createElement("pre");
  area.style.cssText = "max-height:320px;overflow:auto;white-space:pre-wrap;";
  panel.appendChild(area);
  root.appendChild(panel);

  setInterval(() => {
    const data = {
      turn: actor?.logs?.turn?.toArray?.() || [],
      attack: actor?.logs?.attack?.toArray?.() || [],
      status: actor?.logs?.status?.toArray?.() || [],
    };
    area.textContent = JSON.stringify(data, null, 2);
  }, 250);
}
