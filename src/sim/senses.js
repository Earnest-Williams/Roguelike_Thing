// src/sim/senses.js
// @ts-check

import { computeFieldOfView } from "../world/fov.js";
import { posKeyFromCoords } from "../../js/utils.js";
import { collectWorldLightSources as collectLights } from "./lights.js";

export { collectWorldLightSources } from "./lights.js";

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
 * @param {{ player?: any, mobManager?: any, mapState?: any, entities?: any[] }} gameCtx
 */
export function updatePerception(gameCtx = {}) {
  const actors = listActors(gameCtx);
  if (actors.length === 0) return;

  const lights = collectLights({
    player: gameCtx?.player,
    mobs: resolveMobList(gameCtx?.mobManager),
    entities: gameCtx?.entities ?? [],
    mapState: gameCtx?.mapState,
  });

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

function toInt(value) {
  if (!Number.isFinite(value)) return NaN;
  return value | 0;
}
