// src/combat/perception.js
// @ts-nocheck
import { computeActorFOV, collectWorldLightSources } from "../sim/senses.js";
import { posKeyFromCoords } from "../../js/utils.js";
import { asActor } from "./actor.js";

/**
 * Refresh perception data for a single entity and return the resulting payload.
 * Falls back to an empty perception object when FOV cannot be computed.
 *
 * @param {any} entity
 * @param {any} worldCtx
 * @returns {{ fov: Set<string> | null, visibleActors: any[], visibleLights: any[] }}
 */
export function updatePerception(entity, worldCtx = {}) {
  if (!entity) return makeEmptyPerception();

  const perceptionOwner = asActor(entity) ?? entity;
  const mapState = worldCtx?.mapState ?? worldCtx?.maze ?? worldCtx?.map ?? null;
  const fov = computeActorFOV({ mapState }, entity);
  if (!fov) {
    const empty = makeEmptyPerception();
    entity.perception = empty;
    if (perceptionOwner && perceptionOwner !== entity) {
      perceptionOwner.perception = empty;
    }
    return empty;
  }

  const actors = listActors(worldCtx);
  const visibleActors = [];
  for (const other of actors) {
    if (!other || other === entity || other === perceptionOwner) continue;
    const pos = resolvePosition(other);
    if (!pos) continue;
    if (!fov.has(posKeyFromCoords(pos.x, pos.y))) continue;
    visibleActors.push(other);
  }

  const lights = collectWorldLightSources({
    player: worldCtx?.player,
    mobs: resolveMobList(worldCtx?.mobManager),
    entities: worldCtx?.entities ?? [],
    mapState,
  });

  const visibleLights = [];
  for (const light of lights) {
    if (!light) continue;
    const lx = toInt(light?.x);
    const ly = toInt(light?.y);
    if (!Number.isFinite(lx) || !Number.isFinite(ly)) continue;
    if (!fov.has(posKeyFromCoords(lx, ly))) continue;
    visibleLights.push(light);
  }

  const perception = { fov, visibleActors, visibleLights };
  entity.perception = perception;
  if (perceptionOwner && perceptionOwner !== entity) {
    perceptionOwner.perception = perception;
  }
  return perception;
}

function listActors(worldCtx = {}) {
  const actors = [];
  if (worldCtx?.player) actors.push(worldCtx.player);
  for (const mob of resolveMobList(worldCtx?.mobManager)) {
    if (mob && !actors.includes(mob)) {
      actors.push(mob);
    }
  }
  if (Array.isArray(worldCtx?.entities)) {
    for (const ent of worldCtx.entities) {
      if (ent && !actors.includes(ent)) {
        actors.push(ent);
      }
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
      console.warn("mobManager.list() threw while resolving actors", err);
      return [];
    }
  }
  if (Array.isArray(mobManager.list)) return mobManager.list;
  if (Array.isArray(mobManager)) return mobManager;
  return [];
}

function resolvePosition(entity) {
  if (!entity) return null;
  if (typeof entity.x === "number" && typeof entity.y === "number") {
    return { x: entity.x, y: entity.y };
  }
  const pos = typeof entity.pos === "function" ? entity.pos() : entity.pos;
  if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
    return { x: pos.x, y: pos.y };
  }
  if (typeof entity.getPosition === "function") {
    const result = entity.getPosition();
    if (result && typeof result.x === "number" && typeof result.y === "number") {
      return { x: result.x, y: result.y };
    }
  }
  return null;
}

function toInt(value) {
  if (!Number.isFinite(value)) return NaN;
  return value | 0;
}

function makeEmptyPerception() {
  return { fov: null, visibleActors: [], visibleLights: [] };
}
