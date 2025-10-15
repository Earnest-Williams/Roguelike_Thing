import { TILE_WALL } from "../constants.js";
import { colorStringToRgba as toRgba } from "../utils.js";
import type { RGBA, TileVisual } from "./types.js";

export interface OverlayEntityVisual {
  x: number;
  y: number;
  kind?: string;
  glyph?: string;
  fg?: string | RGBA;
  bg?: string | RGBA;
  overlayA?: number;
  overlayColor?: string | RGBA;
  badge?: string;
  badgeColor?: string | RGBA;
  badgeBg?: string | RGBA;
  [key: string]: unknown;
}

export type OverlayAlphaSampler = (
  x: number,
  y: number,
  entitiesOnTile?: readonly OverlayEntityVisual[],
) => number | undefined;

export type OverlayColorSampler = (
  x: number,
  y: number,
  entitiesOnTile?: readonly OverlayEntityVisual[],
) => RGBA | null | undefined;

export interface BuildMainViewBatchParams {
  grid: number[][];
  explored: boolean[][];
  visibleSet: Set<string>;
  player: { x: number; y: number; lightRadius?: number; getLightRadius?: () => number };
  startPos?: { x: number; y: number } | null;
  endPos?: { x: number; y: number } | null;
  colors: Record<string, string>;
  lightRadius?: number;
  overlayAlphaAt: OverlayAlphaSampler;
  overlayColorAt?: OverlayColorSampler | null;
  overlayColor?: RGBA | null;
  entities?: OverlayEntityVisual[];
}

export interface BuildMinimapPresentationParams {
  grid: number[][];
  explored: boolean[][];
  player: { x: number; y: number };
  padding?: number;
  colors: Record<string, string>;
}

export interface MinimapPresentation {
  tiles: TileVisual[];
  width: number;
  height: number;
  padding: number;
  colors: {
    viewport?: RGBA;
    border?: RGBA;
  };
}

export function buildMainViewBatch({
  grid,
  explored,
  visibleSet,
  player,
  startPos = null,
  endPos = null,
  colors,
  lightRadius = 0,
  overlayAlphaAt,
  overlayColorAt = null,
  overlayColor = null,
  entities = [],
}: BuildMainViewBatchParams): TileVisual[] {
  const batch: TileVisual[] = [];
  if (!Array.isArray(grid) || grid.length === 0) return batch;

  const width = grid[0]?.length ?? 0;
  const height = grid.length;

  const wallBG = colors.wall ? toRgba(colors.wall) : toRgba("#000000");
  const floorBG = colors.floor ? toRgba(colors.floor) : toRgba("#000000");
  const playerBG = colors.player ? toRgba(colors.player) : toRgba("#ffffff");
  const startBG = colors.start ? toRgba(colors.start) : playerBG;
  const endBG = colors.end ? toRgba(colors.end) : playerBG;
  const floorGlyph = colors.floorGlyph ? toRgba(colors.floorGlyph) : toRgba("#888888");
  const playerGlyph = colors.playerGlyph ? toRgba(colors.playerGlyph) : toRgba("#ffffff");

  const overlayRgb = normalizeColor(overlayColor);

  const rawPlayerLightRadius = Number.isFinite(lightRadius)
    ? lightRadius
    : Number.isFinite(player?.lightRadius)
      ? player.lightRadius
      : typeof player?.getLightRadius === "function"
        ? player.getLightRadius()
        : 0;
  const playerLightRadius = Number.isFinite(rawPlayerLightRadius)
    ? Math.max(0, Number(rawPlayerLightRadius))
    : 0;

  const overlayAlphaFn = typeof overlayAlphaAt === "function" ? overlayAlphaAt : null;
  const overlayColorFn = typeof overlayColorAt === "function" ? overlayColorAt : null;

  for (let y = 0; y < height; y++) {
    const row = grid[y];
    const exploredRow = explored[y];
    if (!row || !exploredRow) continue;
    for (let x = 0; x < width; x++) {
      if (!exploredRow[x]) continue;
      const key = `${x},${y}`;
      const isVisible = visibleSet.has(key);
      const tile = row[x];
      if (typeof tile !== "number") continue;
      const isWall = tile === TILE_WALL;

      const base: TileVisual = {
        x,
        y,
        kind: isWall ? "wall" : "floor",
        bg: isWall ? wallBG : floorBG,
      };
      if (!isWall) {
        base.glyph = "·";
        base.fg = floorGlyph;
      }

      if (startPos && x === startPos.x && y === startPos.y) {
        base.kind = "start";
        base.bg = startBG;
        delete base.glyph;
        delete base.fg;
      }

      if (endPos && x === endPos.x && y === endPos.y) {
        base.kind = "end";
        base.bg = endBG;
        delete base.glyph;
        delete base.fg;
      }

      if (isVisible) {
        const overlayA = playerLightRadius > 0 && overlayAlphaFn ? overlayAlphaFn(x, y) : 0;
        if (typeof overlayA === "number") {
          const clamped = Math.max(0, Math.min(1, overlayA));
          if (clamped > 0) {
            base.overlayA = clamped;
            const oc = overlayColorFn ? overlayColorFn(x, y) ?? overlayRgb : overlayRgb;
            if (oc) {
              base.overlayColor = oc;
            }
          }
        }
      }

      batch.push(base);
    }
  }

  const playerTile: TileVisual = {
    x: player.x,
    y: player.y,
    kind: "player",
    glyph: "@",
    fg: playerGlyph,
    bg: playerBG,
    overlayA: 0,
  };
  if (overlayRgb) {
    playerTile.overlayColor = overlayRgb;
  }
  batch.push(playerTile);

  if (Array.isArray(entities) && entities.length > 0) {
    for (const ent of entities) {
      if (!ent || typeof ent.x !== "number" || typeof ent.y !== "number") continue;
      const visual: TileVisual = {
        x: ent.x,
        y: ent.y,
        kind: ent.kind ?? "entity",
      };
      if (typeof ent.glyph === "string") {
        visual.glyph = ent.glyph;
      }
      const fg = normalizeColor(ent.fg);
      if (fg) visual.fg = fg;
      const bg = normalizeColor(ent.bg);
      if (bg) visual.bg = bg;
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

export function buildMinimapPresentation({
  grid,
  explored,
  player,
  padding = 0,
  colors = {} as Record<string, string>,
}: BuildMinimapPresentationParams): MinimapPresentation {
  const pad = Math.max(0, Math.floor(padding));
  const width = grid[0]?.length ?? 0;
  const height = grid.length ?? 0;
  const totalW = width + pad * 2;
  const totalH = height + pad * 2;

  const baseFloor = colors.floor ? toRgba(colors.floor) : toRgba("#111111");
  const exploredFloor = colors.floorExplored ? toRgba(colors.floorExplored) : baseFloor;
  const wallColor = colors.wall ? toRgba(colors.wall) : toRgba("#333333");
  const playerColor = colors.player ? toRgba(colors.player) : toRgba("#ffffff");
  const viewportColor = colors.viewport ? toRgba(colors.viewport) : undefined;
  const borderColor = colors.border ? toRgba(colors.border) : undefined;

  const tiles: TileVisual[] = [];

  if (totalW <= 0 || totalH <= 0) {
    return { tiles, width: 0, height: 0, padding: pad, colors: {} };
  }

  for (let y = 0; y < totalH; y++) {
    for (let x = 0; x < totalW; x++) {
      tiles.push({ x, y, kind: "floor", bg: baseFloor });
    }
  }

  for (let y = 0; y < height; y++) {
    const row = grid[y];
    const exploredRow = explored[y];
    if (!row || !exploredRow) continue;
    for (let x = 0; x < width; x++) {
      const tileValue = row[x];
      if (typeof tileValue !== "number") continue;
      const tx = x + pad;
      const ty = y + pad;
      if (tileValue === TILE_WALL) {
        tiles.push({ x: tx, y: ty, kind: "wall", bg: wallColor });
      } else if (exploredRow[x] && exploredFloor !== baseFloor) {
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

  const colorsOut: MinimapPresentation["colors"] = {};
  if (viewportColor) colorsOut.viewport = viewportColor;
  if (borderColor) colorsOut.border = borderColor;

  return {
    tiles,
    width: totalW,
    height: totalH,
    padding: pad,
    colors: colorsOut,
  };
}

export function presentDebug(actor: unknown): string {
  const debugTurns = (actor as { _debug?: { turns?: unknown[] } })?._debug?.turns;
  if (!Array.isArray(debugTurns) || debugTurns.length === 0) return "";
  const latest = debugTurns[debugTurns.length - 1];
  try {
    return JSON.stringify(latest, null, 2);
  } catch (err) {
    return String(latest);
  }
}

type HudContext =
  | (CanvasRenderingContext2D & { debugText?(text: string): void })
  | {
      debugText?(text: string): void;
      fillText?(text: string, x: number, y: number): void;
      save?(): void;
      restore?(): void;
      fillStyle?: string;
    };

interface ActorResourcesState {
  [key: string]:
    | number
    | {
        cur?: number;
        max?: number;
      };
}

interface ActorLike {
  ap?: number;
  maxAP?: number;
  apCap?: number;
  baseActionAP?: number;
  resources?: { pools?: ActorResourcesState };
  attunement?: { stacks?: Record<string, number> };
  cooldowns?: Record<string, number>;
  statuses?: Array<{ id?: string; stacks?: number }>;
}

export function drawHUD(ctx: HudContext | null | undefined, actor: ActorLike | null | undefined): string {
  if (!actor) return "";
  const attEntries = Object.entries(actor.attunement?.stacks ?? {})
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 2)
    .map(([type, stacks]) => `${type}:${stacks}`)
    .join(" ");

  const pools = Object.entries(actor.resources?.pools ?? {})
    .map(([name, state]) => {
      const cur = typeof state === "object" && state !== null ? Number(state.cur ?? (state as number)) : Number(state);
      const max = typeof state === "object" && state !== null ? Number(state.max ?? (state as number)) : Number(state);
      return `${name}:${cur}/${max}`;
    })
    .join(" ");

  const cds = Object.entries(actor.cooldowns ?? {})
    .map(([key, value]) => `${key}:${value}`)
    .join(" ");

  const sts = Array.isArray(actor.statuses)
    ? actor.statuses.map((s) => `${s.id ?? "?"}(${s.stacks ?? 0})`).join(" ")
    : "";

  const apCap = actor.maxAP ?? actor.apCap ?? actor.baseActionAP ?? 0;
  const text = `AP:${actor.ap}/${apCap} RES[${pools}] ATTUNE[${attEntries}] CD[${cds}] ST[${sts}]`;

  if (ctx) {
    if (typeof ctx.debugText === "function") {
      ctx.debugText(text);
    } else if (typeof ctx.fillText === "function") {
      (ctx as CanvasRenderingContext2D).save?.();
      const canvasCtx = ctx as CanvasRenderingContext2D;
      canvasCtx.fillStyle = (canvasCtx.fillStyle as string | CanvasGradient | CanvasPattern) || "#fff";
      canvasCtx.fillText(text, 8, 16);
      canvasCtx.restore?.();
    }
  }

  return text;
}

export function mountDevPanel(root: HTMLElement, actor: unknown): void {
  const panel = document.createElement("div");
  panel.className = "dev-panel";
  panel.style.cssText =
    "position:absolute;right:8px;top:8px;width:420px;background:#111a;border:1px solid #444;padding:8px;font:12px monospace;color:#ddd;";
  const area = document.createElement("pre");
  area.style.cssText = "max-height:320px;overflow:auto;white-space:pre-wrap;";
  panel.appendChild(area);
  root.appendChild(panel);

  window.setInterval(() => {
    const data = {
      turn: (actor as { logs?: { turn?: { toArray?: () => unknown[] } } })?.logs?.turn?.toArray?.() ?? [],
      attack: (actor as { logs?: { attack?: { toArray?: () => unknown[] } } })?.logs?.attack?.toArray?.() ?? [],
      status: (actor as { logs?: { status?: { toArray?: () => unknown[] } } })?.logs?.status?.toArray?.() ?? [],
    };
    area.textContent = JSON.stringify(data, null, 2);
  }, 250);
}

function normalizeColor(input: string | RGBA | null | undefined): RGBA | null {
  if (!input) return null;
  if (typeof input === "string") {
    try {
      return toRgba(input);
    } catch {
      return null;
    }
  }
  if (typeof input === "object") {
    const maybe = input as Partial<RGBA>;
    if (
      typeof maybe?.r === "number" &&
      typeof maybe.g === "number" &&
      typeof maybe.b === "number"
    ) {
      return {
        r: maybe.r,
        g: maybe.g,
        b: maybe.b,
        a: typeof maybe.a === "number" ? maybe.a : 1,
      } as RGBA;
    }
  }
  return null;
}
