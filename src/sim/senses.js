// src/sim/senses.js
// @ts-check

import { computeFieldOfView } from "../world/fov.js";
import { posKeyFromCoords } from "../../js/utils.js";

/**
 * Collect all world light sources including equipment carried by actors and
 * static furniture entries defined on the map state.
 * @param {{ player?: any, mobManager?: any, mapState?: any }} gameCtx
 * @returns {Array<{ id: string, x: number, y: number, radius: number, color?: string|null, ownerId?: string|null }>} 
 */
export function collectWorldLightSources(gameCtx = {}) {
  const lights = [];
  const actors = listActors(gameCtx);

  for (const entity of actors) {
    const items = listEquippedItems(entity);
    for (const item of items) {
      const radius = Number.isFinite(item?.lightRadius) ? Math.max(0, item.lightRadius) : 0;
      if (radius <= 0) continue;
      const ownerId = getEntityId(entity);
      const lx = toInt(entity?.x);
      const ly = toInt(entity?.y);
      if (!Number.isFinite(lx) || !Number.isFinite(ly)) continue;
      lights.push({
        id: `${ownerId || "actor"}:${item.id ?? "item"}`,
        x: lx,
        y: ly,
        radius,
        color: item.lightColor || null,
        ownerId: ownerId || null,
      });
    }
  }

  const furniture = Array.isArray(gameCtx?.mapState?.furniture)
    ? gameCtx.mapState.furniture
    : [];
  for (const placement of furniture) {
    const pos = placement?.position || placement?.pos || placement?.tile || null;
    const px = toInt(pos?.x);
    const py = toInt(pos?.y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    const meta = placement?.metadata || placement?.furniture?.metadata || {};
    const radius = Number.isFinite(meta?.lightRadius) ? Math.max(0, meta.lightRadius) : 0;
    if (radius <= 0) continue;
    lights.push({
      id: placement?.id || placement?.furniture?.id || `furn:${px},${py}`,
      x: px,
      y: py,
      radius,
      color: meta?.lightColor || placement?.furniture?.metadata?.lightColor || null,
      ownerId: null,
    });
  }

  return lights;
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
