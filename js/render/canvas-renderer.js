// @ts-check

/** @typedef {import("./types.js").TileVisual} TileVisual */
/** @typedef {import("./types.js").ViewTransform} ViewTransform */

const DEFAULT_OVERLAY_RGBA = { r: 255, g: 255, b: 102, a: 1 };

/**
 * Basic canvas-backed renderer that implements the IRenderer contract.
 */
export class CanvasRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {CanvasRenderingContext2D} [ctx]
   */
  constructor(canvas, ctx = canvas.getContext("2d")) {
    if (!ctx) {
      throw new Error("Canvas 2D context unavailable");
    }
    this.canvas = canvas;
    this.ctx = ctx;
    this.width = 0;
    this.height = 0;
    this.cell = 20;
    /** @type {ViewTransform | null} */
    this.lastView = null;
  }

  /**
   * @param {number} w
   * @param {number} h
   * @param {number} cell
   */
  init(w, h, cell) {
    this.width = Math.max(0, Math.floor(w));
    this.height = Math.max(0, Math.floor(h));
    this.cell = Math.max(1, Math.floor(cell));
    this.canvas.width = this.width * this.cell;
    this.canvas.height = this.height * this.cell;
    this.canvas.style.width = `${this.canvas.width}px`;
    this.canvas.style.height = `${this.canvas.height}px`;
  }

  /** @param {ViewTransform} view */
  setViewTransform(view) {
    this.lastView = view;
    this.cell = Math.max(1, Math.floor(view.cellSize));
    this.canvas.style.transform = `translate3d(${view.tx}px, ${view.ty}px, 0)`;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** @param {TileVisual[]} batch */
  drawTiles(batch) {
    const c = this.cell;
    const ctx = this.ctx;
    for (const t of batch) {
      const px = t.x * c;
      const py = t.y * c;
      if (t.bg) {
        ctx.fillStyle = rgbaToString(t.bg);
        if (t.kind === "player") {
          ctx.beginPath();
          ctx.arc(px + c / 2, py + c / 2, c / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(px, py, c, c);
        }
      }
      if (t.glyph) {
        const size = Math.max(10, Math.floor(c * 0.85));
        const fontWeight = t.kind === "player" ? "bold " : "";
        ctx.font = `${fontWeight}${size}px monospace`;
        if (t.fg) {
          ctx.fillStyle = rgbaToString(t.fg);
        } else {
          ctx.fillStyle = "#fff";
        }
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(t.glyph, px + c / 2, py + c / 2);
      }
      if (typeof t.overlayA === "number" && t.overlayA > 0) {
        const overlayColor = t.overlayColor || DEFAULT_OVERLAY_RGBA;
        ctx.fillStyle = `rgba(${overlayColor.r},${overlayColor.g},${overlayColor.b},${Math.min(
          1,
          Math.max(0, t.overlayA),
        ).toFixed(3)})`;
        ctx.fillRect(px, py, c, c);
      }
    }
  }

  /**
   * @param {TileVisual[]} _batch
   * @param {{ viewportRect?: { x: number, y: number, w: number, h: number } }} [_opts]
   */
  drawMinimap(_batch, _opts) {
    // Placeholder: minimap rendering is handled separately today.
  }

  /**
   * @param {number} w
   * @param {number} h
   * @param {number} cell
   */
  resize(w, h, cell) {
    this.init(w, h, cell);
    if (this.lastView) {
      this.setViewTransform(this.lastView);
    }
  }
}

/**
 * @param {import("./types.js").RGBA} color
 */
function rgbaToString(color) {
  return `rgba(${color.r},${color.g},${color.b},${color.a})`;
}
