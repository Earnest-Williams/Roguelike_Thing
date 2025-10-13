// src/combat/ai-planner.js
// @ts-check
import { ACTIONS } from "../content/actions.js";
import { FactionService } from "../game/faction-service.js";
import { asActor } from "../combat/actor.js";
import { hasLineOfSight } from "../../js/utils.js";

/**
 * @file
 * Normalizes arbitrary simulation "entities" (Monsters, Actors, raw POJOs)
 * into `Actor` instances, **excludes self**, and selects a hostile target using
 * `FactionService`. This is the canonical planner—remove/avoid any competing
 * variants. Consumers should pass `{ selfMob }` on context to help compute
 * distances using world coordinates when available.
 *
 * Key guarantees:
 *  - Entity → Actor coercion via `asActor(...)`
 *  - Self-filtering: both wrapper and actor identity are excluded
 *  - Hostility check is centralized (no duplicated faction math here)
 *  - Distance is Chebyshev on mob world coords when possible
 *
 * See also: src/game/monster.js (AI handoff) and src/game/faction-service.js.
 */

const asPosition = (entity) => {
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
};

const listMobs = (mobManager) => {
  if (!mobManager) return [];
  if (typeof mobManager.list === "function") {
    try {
      const result = mobManager.list();
      return Array.isArray(result) ? result : [];
    } catch (err) {
      console.warn("mobManager.list() threw during AI planning", err);
      return [];
    }
  }
  if (Array.isArray(mobManager.list)) return mobManager.list;
  if (Array.isArray(mobManager)) return mobManager;
  return [];
};

function selectTarget(self, ctx = {}) {
  /** @type {(e: any) => import("./actor.js").Actor | null} */
  const toActor = ctx.toActor ?? asActor;
  const selfActor = toActor(self) ?? self;
  const selfMob = ctx.selfMob ?? selfActor;

  const allEntities = [ctx.player, ...listMobs(ctx.mobManager)];
  if (ctx.target) {
    allEntities.push(ctx.target);
  }

  const normalized = allEntities
    .filter(Boolean)
    .map((entity) => ({ entity, actor: toActor(entity) }))
    .filter(({ actor }) => Boolean(actor));

  const candidates = normalized.filter(({ actor }) => actor !== selfActor);

  const hostiles = candidates
    .map((entry) => ({
      ...entry,
      position: asPosition(entry.entity) ?? asPosition(entry.actor),
    }))
    .filter(({ actor }) => FactionService.isHostile(selfActor, actor));

  if (hostiles.length === 0) {
    return null;
  }

  const maze = ctx.maze ?? ctx.grid ?? null;
  const selfPos = asPosition(selfMob) ?? asPosition(selfActor);
  const rngSource = ctx.rng;
  const rng = typeof rngSource === "function"
    ? rngSource
    : typeof rngSource?.next === "function"
    ? () => rngSource.next()
    : typeof rngSource?.random === "function"
    ? () => rngSource.random()
    : Math.random;

  const losScore = (candidate) => {
    if (!maze || !selfPos || !candidate.position) return 0;
    try {
      return hasLineOfSight(maze, selfPos, candidate.position) ? 0 : 1;
    } catch (err) {
      console.warn("LOS check failed during AI planning", err);
      return 0;
    }
  };

  const distScore = (candidate) => {
    if (!selfPos || !candidate.position) return Infinity;
    const dx = Math.abs(candidate.position.x - selfPos.x);
    const dy = Math.abs(candidate.position.y - selfPos.y);
    return Math.max(dx, dy);
  };

  hostiles.sort((a, b) => {
    const losA = losScore(a);
    const losB = losScore(b);
    if (losA !== losB) return losA - losB;
    const dA = distScore(a);
    const dB = distScore(b);
    if (Number.isFinite(dA) && Number.isFinite(dB) && dA !== dB) {
      return dA - dB;
    }
    const roll = rng() - 0.5;
    if (roll < 0) return -1;
    if (roll > 0) return 1;
    return 0;
  });

  return hostiles[0] ?? null;
}

export const AIPlanner = {
  /**
   * Evaluate and perform the best action available to the actor.
   * @param {any} actor
   * @param {any} context
   */
  takeTurn(actor, context = {}) {
    if (!actor) return;
    const selfMob = context.selfMob || actor;

    const actionIds = Array.isArray(actor.actions) && actor.actions.length
      ? actor.actions
      : AIPlanner.defaultActions(actor);

    const selection = selectTarget(actor, { ...context, selfMob });
    if (!selection) {
      return;
    }
    const targetEntity = selection.entity;
    const targetActor = selection.actor ?? asActor(targetEntity);
    const distance = AIPlanner.distanceBetween(selfMob, targetEntity, context);
    const scope = {
      actor,
      target: targetEntity,
      targetActor,
      context,
      distance,
    };

    let best = null;

    for (const id of actionIds) {
      const action = ACTIONS[id];
      if (!action) continue;
      const prepared = typeof action.prepare === "function" ? action.prepare(scope) : null;
      if (prepared === false) continue;
      if (typeof action.canPerform === "function" && !action.canPerform(scope, prepared)) {
        continue;
      }
      const score = typeof action.evaluate === "function"
        ? action.evaluate(scope, prepared)
        : typeof action.priority === "number"
        ? action.priority
        : 0;
      if (score == null || Number.isNaN(score)) continue;
      if (!best || score > best.score) {
        best = { action, score, prepared };
      }
    }

    if (best?.action?.perform) {
      best.action.perform(scope, best.prepared);
    }
  },

  /**
   * Determine sensible default action list when actor has none defined.
   * @param {any} actor
   * @returns {string[]}
   */
  defaultActions(actor) {
    if (actor?.isRangedAttacker) return ["fire_bolt", "strike"];
    return ["strike"];
  },

  /**
   * Determine approximate grid distance between two actors.
   * @param {any} selfMob
   * @param {any} target
   * @param {any} context
   */
  distanceBetween(selfMob, target, context) {
    if (typeof context?.distance === "number") {
      return context.distance;
    }
    const ax = selfMob?.x;
    const ay = selfMob?.y;
    const tx = target?.x;
    const ty = target?.y;
    if ([ax, ay, tx, ty].every((v) => typeof v === "number")) {
      const dx = Math.abs(tx - ax);
      const dy = Math.abs(ty - ay);
      return Math.max(dx, dy);
    }
    return typeof context?.defaultDistance === "number" ? context.defaultDistance : 1;
  },
};
