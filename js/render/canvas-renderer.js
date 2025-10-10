// @ts-check

/** @typedef {import("./types.js").TileVisual} TileVisual */
/** @typedef {import("./types.js").ViewTransform} ViewTransform */

const DEFAULT_OVERLAY_RGBA = { r: 255, g: 255, b: 102, a: 1 };
const DEFAULT_BADGE_BG = { r: 15, g: 23, b: 42, a: 0.85 };

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
        const isPlayer = t.kind === "player";
        const isMob = t.kind === "mob";
        const fontWeight = isPlayer || isMob ? "bold " : "";
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
      if (t.badge) {
        const fontSize = Math.max(8, Math.floor(c * 0.4));
        ctx.font = `600 ${fontSize}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        const textX = px + c / 2;
        const textY = py - Math.max(2, Math.floor(fontSize * 0.1));
        const metrics = ctx.measureText(t.badge);
        const textWidth = metrics.width;
        const padX = Math.max(2, Math.floor(fontSize * 0.4));
        const padY = Math.max(1, Math.floor(fontSize * 0.3));
        const bgWidth = textWidth + padX * 2;
        const bgHeight = fontSize + padY * 2;
        const bgX = textX - bgWidth / 2;
        const bgY = textY - bgHeight + padY;
        const bgColor = t.badgeBg || DEFAULT_BADGE_BG;
        ctx.fillStyle = `rgba(${bgColor.r},${bgColor.g},${bgColor.b},${Math.min(
          1,
          Math.max(0, bgColor.a ?? 1),
        ).toFixed(3)})`;
        ctx.fillRect(bgX, bgY, bgWidth, bgHeight);
        const badgeColor = t.badgeColor || { r: 255, g: 255, b: 255, a: 1 };
        ctx.fillStyle = `rgba(${badgeColor.r},${badgeColor.g},${badgeColor.b},${Math.min(
          1,
          Math.max(0, badgeColor.a ?? 1),
        ).toFixed(3)})`;
        ctx.fillText(t.badge, textX, textY);
      }
    }
  }

  /**
   * @param {TileVisual[]} batch
   * @param {{ viewportRect?: { x: number, y: number, w: number, h: number }, padding?: number, colors?: import("./types.js").RendererMinimapColors }} [opts]
   */
  drawMinimap(batch, opts) {
    const ctx = this.ctx;
    const c = this.cell;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (const t of batch) {
      const px = t.x * c;
      const py = t.y * c;
      if (t.bg && t.kind !== "player") {
        ctx.fillStyle = rgbaToString(t.bg);
        ctx.fillRect(px, py, c, c);
      }

      if (t.kind === "player") {
        const radius = Math.max(2, Math.floor(c * 0.4));
        const fill = t.bg ? rgbaToString(t.bg) : "#fff";
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(px + c / 2, py + c / 2, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const padding = typeof opts?.padding === "number" ? Math.max(0, Math.floor(opts.padding)) : 0;
    const colors = opts?.colors || {};

    if (colors.border && this.width > padding * 2 && this.height > padding * 2) {
      const borderX = padding * c;
      const borderY = padding * c;
      const borderW = (this.width - padding * 2) * c;
      const borderH = (this.height - padding * 2) * c;
      if (borderW > 0 && borderH > 0) {
        ctx.strokeStyle = rgbaToString(colors.border);
        ctx.lineWidth = Math.max(1, Math.floor(c / 2));
        ctx.strokeRect(borderX + 0.5, borderY + 0.5, Math.max(0, borderW - 1), Math.max(0, borderH - 1));
      }
    }

    if (opts?.viewportRect && colors.viewport) {
      const { x, y, w, h } = opts.viewportRect;
      const px = x * c;
      const py = y * c;
      const pw = w * c;
      const ph = h * c;
      ctx.strokeStyle = rgbaToString(colors.viewport);
      ctx.lineWidth = Math.max(1, Math.floor(c / 2));
      ctx.strokeRect(px + 0.5, py + 0.5, Math.max(0, pw - 1), Math.max(0, ph - 1));
    }
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
