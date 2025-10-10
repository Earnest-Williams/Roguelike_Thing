// @ts-check

import { buildMainViewBatch } from "./presenters.js";

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
}
