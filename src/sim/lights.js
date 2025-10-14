/**
 * World light collection (actors, dropped items, fixtures).
 * Produces a normalized array of LightSource records for this frame.
 *
 * LightSource: {
 *   id: string,
 *   x: number, y: number,          // tile coords
 *   radius: number,                // tiles
 *   color: string|{r,g,b},         // "#RRGGBB" or {r,g,b} 0..255
 *   intensity?: number,            // 0..1, default 1
 *   flickerRate?: number,          // Hz
 * }
 */

export function collectWorldLightSources({ player, entities = [], mobs = [], mapState = null }) {
  const out = [];
  let seq = 0;

  // 1) Player & mobs: prefer plural API if available, else fallback to classic getters
  const actors = [player, ...(Array.isArray(mobs) ? mobs : [])].filter(Boolean);
  for (const a of actors) {
    if (typeof a.getLightEmitters === "function") {
      const arr = a.getLightEmitters() || [];
      for (const e of arr) {
        const rgb = toRgb(e.color);
        if (!finitePos(a.x, a.y) || !finiteRadius(e.radius)) continue;
        out.push({
          id: `actor:${a.id ?? "anon"}:${seq++}`,
          x: a.x | 0,
          y: a.y | 0,
          radius: +e.radius,
          color: rgb,
          intensity: clamp01(e.intensity ?? 1),
          flickerRate: finiteNum(e.flickerRate) ? +e.flickerRate : 0,
        });
      }
    } else {
      // Legacy single light from Actor getters
      const radius = finiteNum(a?.getLightRadius?.()) ? +a.getLightRadius() : 0;
      if (radius > 0) {
        out.push({
          id: `actor:${a.id ?? "anon"}:${seq++}`,
          x: a.x | 0,
          y: a.y | 0,
          radius,
          color: toRgb(a?.getLightColor?.() ?? "#ffe9a6"),
          intensity: 1,
          flickerRate: finiteNum(a?.getLightFlickerRate?.()) ? +a.getLightFlickerRate() : 0,
        });
      }
    }
  }

  // 2) Dropped items / fixtures that glow on the ground or in place
  for (const ent of entities) {
    // Expect either ent.light or ent.item?.light
    const L = ent?.light || ent?.item?.light || null;
    if (!L) continue;

    const works = (L.worksWhenDropped ?? true);
    const rx = finiteNum(ent.x) ? ent.x : finiteNum(ent.tx) ? ent.tx : null;
    const ry = finiteNum(ent.y) ? ent.y : finiteNum(ent.ty) ? ent.ty : null;

    // If it's tied to the ground, require position; if it's an aura, skip here (actor path handles it)
    if (!works || !finitePos(rx, ry) || !finiteRadius(L.radius)) continue;

    out.push({
      id: `world:${ent.id ?? ent.kind ?? "lit"}:${seq++}`,
      x: rx | 0,
      y: ry | 0,
      radius: +L.radius,
      color: toRgb(L.color ?? "#ffe9a6"),
      intensity: clamp01(L.intensity ?? 1),
      flickerRate: finiteNum(L.flickerRate) ? +L.flickerRate : 0,
    });
  }

  // 3) Optional: static map features (braziers/sconces) if your map tiles/objects carry .light
  if (mapState?.features) {
    for (const f of mapState.features) {
      const L = f?.light;
      if (L && finitePos(f.x, f.y) && finiteRadius(L.radius)) {
        out.push({
          id: `feat:${f.id ?? f.type}:${seq++}`,
          x: f.x | 0,
          y: f.y | 0,
          radius: +L.radius,
          color: toRgb(L.color ?? "#ffe9a6"),
          intensity: clamp01(L.intensity ?? 1),
          flickerRate: finiteNum(L.flickerRate) ? +L.flickerRate : 0,
        });
      }
    }
  }

  return out;
}

// ---------- helpers ----------
function finiteNum(n) { return Number.isFinite(+n); }
function finitePos(x, y) { return Number.isFinite(+x) && Number.isFinite(+y); }
function finiteRadius(r) { return Number.isFinite(+r) && +r > 0; }
function clamp01(t) { return Math.max(0, Math.min(1, +t)); }

export function toRgb(c) {
  if (!c) return { r: 255, g: 233, b: 166 };
  if (typeof c === "object" && Number.isFinite(c.r)) return { r: c.r|0, g: c.g|0, b: c.b|0 };
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(c));
  if (!m) return { r: 255, g: 233, b: 166 };
  return { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) };
}
