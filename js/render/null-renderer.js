// @ts-check

/** @typedef {import("./types.js").TileVisual} TileVisual */
/** @typedef {import("./types.js").ViewTransform} ViewTransform */

export class NullRenderer {
  init() {}
  /** @param {ViewTransform} _view */
  setViewTransform(_view) {}
  clear() {}
  /** @param {TileVisual[]} _batch */
  drawTiles(_batch) {}
  /** @param {TileVisual[]} _batch */
  drawMinimap(_batch) {}
  resize() {}
}
