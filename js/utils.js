import { TILE_WALL } from "./constants.js";

// [Unified Implementation] No standalone light helpers; use Actor/Monster.getLightRadius().

export function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export function posKey(pos) {
  return `${pos.x},${pos.y}`;
}

export function posKeyFromCoords(x, y) {
  return `${x},${y}`;
}

export const randChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export const clamp01Normalized = (value) => {
  if (!Number.isFinite(value)) return 0;
  return clamp(value, 0, 1);
};

const colorRgbaCache = new Map();

function clampColorComponent(value) {
  return clamp(Math.round(value), 0, 255) | 0;
}

function parseColorComponents(color) {
  if (typeof color !== "string") {
    return null;
  }

  const trimmed = color.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("#")) {
    let hex = trimmed.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((ch) => ch + ch)
        .join("");
    }
    if (hex.length === 6) {
      const value = parseInt(hex, 16);
      if (!Number.isNaN(value)) {
        return {
          r: (value >> 16) & 0xff,
          g: (value >> 8) & 0xff,
          b: value & 0xff,
          a: 1,
        };
      }
    }
    return null;
  }

  const match = trimmed.match(/^rgba?\(([^)]+)\)$/i);
  if (!match) {
    return null;
  }

  const parts = match[1]
    .split(",")
    .map((p) => parseFloat(p.trim()))
    .filter((n) => Number.isFinite(n));

  if (parts.length < 3) {
    return null;
  }

  const [r, g, b, alpha = 1] = parts;
  return {
    r: clampColorComponent(r),
    g: clampColorComponent(g),
    b: clampColorComponent(b),
    a: clamp(alpha, 0, 1),
  };
}

export function colorStringToRgb(color, fallbackColor = "#ffe9a6") {
  const parsed = parseColorComponents(color);
  if (parsed) {
    const { r, g, b } = parsed;
    return { r, g, b };
  }

  if (color !== fallbackColor) {
    return colorStringToRgb(fallbackColor, fallbackColor);
  }

  return { r: 255, g: 255, b: 255 };
}

export function colorStringToRgba(color, fallbackColor = "#ffe9a6") {
  const cacheKey = `${color}|${fallbackColor}`;
  if (colorRgbaCache.has(cacheKey)) {
    return /** @type {{ r: number; g: number; b: number; a: number }} */ (
      colorRgbaCache.get(cacheKey)
    );
  }

  const parsed = parseColorComponents(color);
  if (parsed) {
    colorRgbaCache.set(cacheKey, parsed);
    return parsed;
  }

  if (color !== fallbackColor) {
    const fallback = colorStringToRgba(fallbackColor, fallbackColor);
    colorRgbaCache.set(cacheKey, fallback);
    return fallback;
  }

  const defaultColor = { r: 255, g: 255, b: 255, a: 1 };
  colorRgbaCache.set(cacheKey, defaultColor);
  return defaultColor;
}

export const getNow =
  typeof performance !== "undefined" &&
  performance &&
  typeof performance.now === "function"
    ? () => performance.now()
    : () => Date.now();

export function smoothstep01(x) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

export function chebyshevDistance(a, b) {
  if (!a || !b) return Infinity;
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function hasLineOfSight(grid, from, to) {
  if (!grid) return true;
  if (!from || !to) return false;
  let x0 = from.x | 0;
  let y0 = from.y | 0;
  const x1 = to.x | 0;
  const y1 = to.y | 0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  const width = grid[0]?.length || 0;
  const height = grid.length || 0;
  const isBlocked = (x, y) => {
    if (x === x1 && y === y1) return false;
    if (y < 0 || y >= height || x < 0 || x >= width) return true;
    return grid[y][x] === TILE_WALL;
  };
  while (!(x0 === x1 && y0 === y1)) {
    if (!(x0 === from.x && y0 === from.y) && isBlocked(x0, y0)) return false;
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
  return true;
}
