// src/sim/senses.js
// @ts-check

import { computeFieldOfView } from "../world/fov.js";
import { posKeyFromCoords } from "../../js/utils.js";

/**
 * Collect all world light sources including equipment carried by actors and
 * static furniture entries defined on the map state. A light source is any
 * entity with a positive radius where `lit !== false` and either advertises
 * `emitsLight === true` or exposes a radius property.
 * @param {{ player?: any, mobManager?: any, mapState?: any }} gameCtx
 * @returns {Array<{ id: string, x: number, y: number, radius: number, color?: string|null, ownerId?: string|null, emitsLight?: bo
olean }>}
 */
export function collectWorldLightSources(gameCtx = {}) {
  const lights = [];
  const actors = listActors(gameCtx);

  for (const entity of actors) {
    const ownerId = getEntityId(entity) || "actor";
    const lx = toInt(entity?.x);
    const ly = toInt(entity?.y);
    if (!Number.isFinite(lx) || !Number.isFinite(ly)) continue;
    const items = listEquippedItems(entity);
    for (const item of items) {
      const descriptor = resolveLightDescriptor(item);
      if (!descriptor) continue;
      lights.push({
        id: `${ownerId}:${item?.id ?? "item"}`,
        x: lx,
        y: ly,
        radius: descriptor.radius,
        color: descriptor.color,
        ownerId: ownerId || null,
        emitsLight: true,
      });
    }
  }

  const furniture = Array.isArray(gameCtx?.mapState?.furniture)
    ? gameCtx.mapState.furniture
    : [];
  for (const placement of furniture) {
    const pos = resolvePlacementPosition(placement);
    if (!pos) continue;
    const descriptor = resolveLightDescriptor(
      placement?.metadata,
      placement?.furniture?.metadata,
      placement,
    );
    if (!descriptor) continue;
    lights.push({
      id: placement?.id || placement?.furniture?.id || `furn:${pos.x},${pos.y}`,
      x: pos.x,
      y: pos.y,
      radius: descriptor.radius,
      color:
        descriptor.color ??
        placement?.metadata?.lightColor ??
        placement?.furniture?.metadata?.lightColor ??
        null,
      ownerId: null,
      emitsLight: true,
    });
  }

  const ground = listGroundItems(gameCtx?.mapState);
  for (const entry of ground) {
    const item = entry.item ?? entry;
    const descriptor = resolveLightDescriptor(item);
    if (!descriptor) continue;
    const gx = toInt(entry.x);
    const gy = toInt(entry.y);
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue;
    lights.push({
      id: entry.id || item?.id || `ground:${gx},${gy}`,
      x: gx,
      y: gy,
      radius: descriptor.radius,
      color: descriptor.color,
      ownerId: null,
      emitsLight: true,
    });
  }

  return lights;
}

function resolvePlacementPosition(placement) {
  if (!placement || typeof placement !== "object") return null;
  const px = toInt(
    placement.x ?? placement?.position?.x ?? placement?.pos?.x ?? placement?.tile?.x,
  );
  const py = toInt(
    placement.y ?? placement?.position?.y ?? placement?.pos?.y ?? placement?.tile?.y,
  );
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
  return { x: px, y: py };
}

function listGroundItems(mapState) {
  const out = [];
  if (!mapState) return out;
  const ground = mapState.groundItems;
  const visit = (entry) => {
    const normalized = normalizeGroundEntry(entry);
    if (normalized) out.push(normalized);
  };
  if (Array.isArray(ground)) {
    for (const entry of ground) visit(entry);
  } else if (ground instanceof Map) {
    for (const value of ground.values()) {
      if (Array.isArray(value)) {
        for (const entry of value) visit(entry);
      } else {
        visit(value);
      }
    }
  } else if (ground && typeof ground === "object") {
    for (const value of Object.values(ground)) {
      if (Array.isArray(value)) {
        for (const entry of value) visit(entry);
      } else {
        visit(value);
      }
    }
  }
  return out;
}

function normalizeGroundEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const item = entry.item ?? entry.payload ?? entry;
  const pos = entry.position ?? entry.pos ?? entry.tile ?? entry;
  const gx = toInt(entry.x ?? pos?.x);
  const gy = toInt(entry.y ?? pos?.y);
  if (!Number.isFinite(gx) || !Number.isFinite(gy)) return null;
  return {
    id: entry.id ?? item?.id ?? null,
    item,
    x: gx,
    y: gy,
  };
}

function resolveLightDescriptor(...candidates) {
  const queue = [];
  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    if (seen.has(candidate)) continue;
    queue.push(candidate);
    seen.add(candidate);
  }
  while (queue.length) {
    const candidate = queue.shift();
    const descriptor = extractLightDescriptor(candidate);
    if (descriptor) return descriptor;
    for (const key of ["light", "source", "item", "payload"]) {
      const value = candidate?.[key];
      if (!value) continue;
      if (Array.isArray(value)) {
        for (const entry of value) {
          if (entry && typeof entry === "object" && !seen.has(entry)) {
            queue.push(entry);
            seen.add(entry);
          }
        }
      } else if (typeof value === "object" && !seen.has(value)) {
        queue.push(value);
        seen.add(value);
      }
    }
  }
  return null;
}

function extractLightDescriptor(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  if (candidate.lit === false) return null;
  if (candidate.emitsLight === false) return null;
  let radius = 0;
  for (const value of [candidate.radius, candidate.lightRadius]) {
    if (!Number.isFinite(value)) continue;
    radius = Math.max(radius, Number(value));
  }
  if (!Number.isFinite(radius) || radius <= 0) return null;
  const color =
    typeof candidate.lightColor === "string" && candidate.lightColor
      ? candidate.lightColor
      : typeof candidate.color === "string" && candidate.color
      ? candidate.color
      : null;
  return { radius, color };
}

/**
 * Compute the set of visible coordinates for an actor based on their light
 * radius. Returns `null` for actors who currently cannot see.
 * @param {{ mapState?: any }} gameCtx
 * @param {{ getLightRadius?: () => number, x?: number, y?: number }} actor
 * @returns {Set<string> | null}
 */
export function computeActorFOV(gameCtx, actor) {
  if (!actor) return null;
  const radiusRaw = typeof actor.getLightRadius === "function" ? actor.getLightRadius() : 0;
  const radius = Number.isFinite(radiusRaw) ? Math.max(0, radiusRaw) : 0;
  if (radius <= 0) return null;
  const ax = toInt(actor?.x);
  const ay = toInt(actor?.y);
  if (!Number.isFinite(ax) || !Number.isFinite(ay)) return null;
  const mapState = gameCtx?.mapState;
  if (!mapState) return null;
  return computeFieldOfView({ x: ax, y: ay }, radius, mapState, { useKnownGrid: false });
}

/**
 * Refresh perception data for all world actors. Each entity receives a
 * `perception` object describing their current FOV, visible actors, and visible
 * light sources.
 * @param {{ player?: any, mobManager?: any, mapState?: any }} gameCtx
 */
export function updatePerception(gameCtx = {}) {
  const actors = listActors(gameCtx);
  if (actors.length === 0) return;

  const lights = collectWorldLightSources(gameCtx);

  for (const entity of actors) {
    const fov = computeActorFOV(gameCtx, entity);
    if (!fov) {
      entity.perception = makeEmptyPerception();
      continue;
    }

    const visibleActors = [];
    for (const other of actors) {
      if (other === entity) continue;
      const ox = toInt(other?.x);
      const oy = toInt(other?.y);
      if (!Number.isFinite(ox) || !Number.isFinite(oy)) continue;
      if (!fov.has(posKeyFromCoords(ox, oy))) continue;
      visibleActors.push(other);
    }

    const visibleLights = [];
    for (const light of lights) {
      if (!Number.isFinite(light?.x) || !Number.isFinite(light?.y)) continue;
      if (!fov.has(posKeyFromCoords(light.x, light.y))) continue;
      visibleLights.push(light);
    }

    entity.perception = {
      fov,
      visibleActors,
      visibleLights,
    };
  }
}

function makeEmptyPerception() {
  return { fov: null, visibleActors: [], visibleLights: [] };
}

function listActors(gameCtx) {
  const { player, mobManager } = gameCtx || {};
  const actors = [];
  if (player) actors.push(player);
  const mobs = resolveMobList(mobManager);
  for (const m of mobs) {
    if (m && !actors.includes(m)) {
      actors.push(m);
    }
  }
  return actors;
}

function resolveMobList(mobManager) {
  if (!mobManager) return [];
  if (typeof mobManager.list === "function") {
    try {
      const result = mobManager.list();
      return Array.isArray(result) ? result : [];
    } catch (err) {
      console.warn("mobManager.list() threw while gathering perception", err);
      return [];
    }
  }
  if (Array.isArray(mobManager.list)) return mobManager.list;
  if (Array.isArray(mobManager)) return mobManager;
  return [];
}

function listEquippedItems(entity) {
  const items = [];
  const eq = entity?.equipment;
  const seen = new Set();
  const visit = (entry) => {
    if (!entry || typeof entry !== "object") return;
    const item = "item" in entry && entry.item ? entry.item : entry;
    if (!item || typeof item !== "object") return;
    if (seen.has(item)) return;
    seen.add(item);
    items.push(item);
  };

  if (eq?.slots instanceof Map) {
    for (const value of eq.slots.values()) {
      visit(value);
    }
  } else if (typeof eq?.all === "function") {
    try {
      const entries = eq.all();
      if (Array.isArray(entries)) {
        for (const [, value] of entries) {
          visit(value);
        }
      }
    } catch (err) {
      console.warn("equipment.all() threw while collecting light sources", err);
    }
  } else if (Array.isArray(eq)) {
    for (const value of eq) visit(value);
  } else if (eq && typeof eq === "object") {
    for (const value of Object.values(eq)) visit(value);
  }

  return items;
}

function toInt(value) {
  if (!Number.isFinite(value)) return NaN;
  return value | 0;
}

function getEntityId(entity) {
  if (!entity) return null;
  return entity.id || entity.name || null;
}
