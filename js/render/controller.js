// @ts-nocheck

import { buildMainViewBatch, buildMinimapPresentation } from "./presenters.js";

let debugVisible = true;
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if (e.key === "`") {
      debugVisible = !debugVisible;
      const panelRoot = globalThis.dp?.root;
      if (panelRoot instanceof HTMLElement) {
        panelRoot.style.display = debugVisible ? "block" : "none";
      }
    }
  });
}

/**
 * @typedef {import("./types.js").ViewTransform} ViewTransform
 */
/**
 * @typedef {import("./types.js").IRenderer} IRenderer
 */

/**
 * High-level orchestrator that bridges game state and renderer implementation.
 */
export class RenderController {
  /**
   * @param {IRenderer} renderer
   */
  constructor(renderer) {
    this.renderer = renderer;
  }

  /**
   * @param {number} mapW
   * @param {number} mapH
   * @param {number} cellSize
   */
  init(mapW, mapH, cellSize) {
    this.renderer.init(mapW, mapH, cellSize);
  }

  /**
   * @param {Object} state
   * @param {{ grid: number[][], explored: boolean[][] }} state.map
   * @param {{ visible: Set<string> }} state.fov
   * @param {{ x: number, y: number, lightRadius?: number }} state.player
   * @param {{ x: number, y: number } | null | undefined} [state.start]
   * @param {{ x: number, y: number } | null | undefined} [state.end]
   * @param {Record<string, string>} state.colors
   * @param {number} [state.lightRadius]
   * @param {(x: number, y: number) => number | undefined} state.overlayAlphaAt
   * @param {(x: number, y: number) => import("./types.js").RGBA | undefined | null} [state.overlayColorAt]
   * @param {import("./types.js").RGBA | null | undefined} [state.overlayColor]
   * @param {Array<any>} [state.entities]
   * @param {ViewTransform} view
   */
  render(state, view) {
    this.renderer.setViewTransform(view);
    const entities = Array.isArray(state.entities) ? state.entities : [];
    const entityMap = new Map();
    for (const ent of entities) {
      if (!ent || typeof ent.x !== "number" || typeof ent.y !== "number") continue;
      const key = `${ent.x},${ent.y}`;
      if (!entityMap.has(key)) entityMap.set(key, []);
      entityMap.get(key).push(ent);
    }
    if (state.player && typeof state.player.x === "number" && typeof state.player.y === "number") {
      const key = `${state.player.x},${state.player.y}`;
      if (!entityMap.has(key)) entityMap.set(key, []);
      entityMap.get(key).push(state.player);
    }

    const overlayAlphaAt = typeof state.overlayAlphaAt === "function"
      ? (x, y) => {
          const entitiesOnTile = entityMap.get(`${x},${y}`) || [];
          return state.overlayAlphaAt(x, y, entitiesOnTile);
        }
      : state.overlayAlphaAt;
    const overlayColorAt = typeof state.overlayColorAt === "function"
      ? (x, y) => {
          const entitiesOnTile = entityMap.get(`${x},${y}`) || [];
          return state.overlayColorAt(x, y, entitiesOnTile);
        }
      : state.overlayColorAt;

    const playerLightRadius = Number.isFinite(state.lightRadius)
      ? Math.max(0, state.lightRadius)
      : Number.isFinite(state.player?.lightRadius)
        ? Math.max(0, state.player.lightRadius)
        : 0;

    const batch = buildMainViewBatch({
      grid: state.map.grid,
      explored: state.map.explored,
      visibleSet: state.fov.visible,
      player: state.player,
      startPos: state.start ?? null,
      endPos: state.end ?? null,
      colors: state.colors,
      lightRadius: playerLightRadius,
      overlayAlphaAt,
      overlayColorAt: overlayColorAt ?? null,
      overlayColor: state.overlayColor ?? null,
      entities,
    });
    this.renderer.clear();
    this.renderer.drawTiles(batch);
  }

  /**
   * @param {number} mapW
   * @param {number} mapH
   * @param {number} cellSize
   */
  resize(mapW, mapH, cellSize) {
    this.renderer.resize(mapW, mapH, cellSize);
  }

  /**
   * Render the minimap using the configured renderer implementation.
   * @param {Object} state
   * @param {{ grid: number[][], explored: boolean[][] }} state.map
   * @param {{ x: number, y: number }} state.player
   * @param {number} [state.padding]
   * @param {Record<string, string>} [state.colors]
   * @param {ViewTransform} view
   * @param {{ viewportRect?: import("./types.js").RendererViewportRect }} [options]
   */
  renderMinimap(state, view, options) {
    this.renderer.setViewTransform(view);
    const presentation = buildMinimapPresentation({
      grid: state.map.grid,
      explored: state.map.explored,
      player: state.player,
      padding: state.padding ?? 0,
      colors: state.colors ?? {},
    });
    this.renderer.clear();
    this.renderer.drawMinimap(presentation.tiles, {
      viewportRect: options?.viewportRect,
      padding: presentation.padding,
      colors: presentation.colors,
    });
  }
}
