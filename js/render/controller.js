// @ts-check

import { buildMainViewBatch, buildMinimapPresentation } from "./presenters.js";

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
   * @param {{ x: number, y: number }} state.player
   * @param {{ x: number, y: number } | null | undefined} [state.start]
   * @param {{ x: number, y: number } | null | undefined} [state.end]
   * @param {Record<string, string>} state.colors
   * @param {(x: number, y: number) => number | undefined} state.overlayAlphaAt
   * @param {import("./types.js").RGBA | null | undefined} [state.overlayColor]
   * @param {Array<any>} [state.entities]
   * @param {ViewTransform} view
   */
  render(state, view) {
    this.renderer.setViewTransform(view);
    const batch = buildMainViewBatch({
      grid: state.map.grid,
      explored: state.map.explored,
      visibleSet: state.fov.visible,
      player: state.player,
      startPos: state.start ?? null,
      endPos: state.end ?? null,
      colors: state.colors,
      overlayAlphaAt: state.overlayAlphaAt,
      overlayColor: state.overlayColor ?? null,
      entities: state.entities ?? [],
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
