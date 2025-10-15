// @ts-nocheck

/** @typedef {{ r: number, g: number, b: number, a: number }} RGBA */

/**
 * @typedef {Object} TileVisual
 * @property {number} x
 * @property {number} y
 * @property {"wall"|"floor"|"player"|"start"|"end"} kind
 * @property {string} [glyph]
 * @property {RGBA} [fg]
 * @property {RGBA} [bg]
 * @property {number} [overlayA]
 * @property {RGBA} [overlayColor]
 * @property {string} [badge]
 * @property {RGBA} [badgeColor]
 * @property {RGBA} [badgeBg]
 */

/**
 * @typedef {Object} ViewTransform
 * @property {number} tx
 * @property {number} ty
 * @property {number} cellSize
 * @property {number} viewW
 * @property {number} viewH
 */

/**
 * @typedef {Object} RendererViewportRect
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 */

/**
 * @typedef {Object} RendererMinimapColors
 * @property {RGBA} [viewport]
 * @property {RGBA} [border]
 */

/**
 * @typedef {Object} RendererMinimapOptions
 * @property {RendererViewportRect} [viewportRect]
 * @property {number} [padding]
 * @property {RendererMinimapColors} [colors]
 */

/**
 * @typedef {Object} IRenderer
 * @property {(widthTiles: number, heightTiles: number, cellSize: number) => void} init
 * @property {(view: ViewTransform) => void} setViewTransform
 * @property {(batch: TileVisual[]) => void} drawTiles
 * @property {(batch: TileVisual[], opts?: RendererMinimapOptions) => void} drawMinimap
 * @property {() => void} clear
 * @property {(widthTiles: number, heightTiles: number, cellSize: number) => void} resize
 */

export {};
