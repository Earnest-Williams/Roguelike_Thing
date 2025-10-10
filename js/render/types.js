// @ts-check

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
 */

/**
 * @typedef {Object} ViewTransform
 * @property {number} tx
 * @property {number} ty
 * @property {number} cellSize
 * @property {number} viewW
 * @property {number} viewH
 */

export {};
