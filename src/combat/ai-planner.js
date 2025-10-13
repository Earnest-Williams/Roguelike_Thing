// src/combat/ai-planner.js
// @ts-check
import { ACTIONS } from "../content/actions.js";
import { FactionService } from "../game/faction-service.js";

const asActor = (entity) => entity?.__actor ?? entity?.actor ?? entity ?? null;

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

    const allEntities = [context.player, ...(context.mobManager?.list || [])]
      .filter(Boolean);

    const candidates = allEntities
      .map((entity) => ({ entity, actor: asActor(entity) }))
      .filter(({ actor: other }) => other && other !== selfMob);

    const enemies = candidates.filter(({ actor: other }) =>
      FactionService.isHostile(actor, other),
    );

    const chosen = enemies[0] || null;
    const fallbackTarget = context.target ?? context.player ?? null;
    const targetEntity = chosen?.entity ?? fallbackTarget;
    const targetActor = chosen?.actor ?? asActor(targetEntity);
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
