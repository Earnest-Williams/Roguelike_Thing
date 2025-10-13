// src/combat/ai-planner.js
// @ts-check
import { ACTIONS } from "../content/actions.js";
import { FactionService } from "../game/faction-service.js";

/**
 * Lightweight context passed to actions.
 * @typedef {{
 *   actor: any,
 *   target: any,
 *   context: any,
 *   distance: number,
 * }} PlannerScope
 */

export class AIPlanner {
  /**
   * Evaluate and perform the best action available to the actor.
   * @param {any} actor
   * @param {any} context
   */
  static takeTurn(actor, context = {}) {
    if (!actor) return;
    const selfMob = context.selfMob || actor;

    const actionIds = Array.isArray(actor.actions) && actor.actions.length
      ? actor.actions
      : AIPlanner.defaultActions(actor);

    const allEntities = [context.player, ...(context.mobManager?.list || [])]
      .filter(Boolean);
    const candidatePairs = allEntities
      .filter((entity) => entity && entity !== selfMob)
      .map((entity) => ({ entity, actor: entity.__actor || entity.actor || entity }));

    const hostilePairs = candidatePairs.filter(({ actor: other }) =>
      FactionService.isHostile(actor, other),
    );

    const chosen = hostilePairs[0] || null;
    const fallbackTarget = context.target ?? context.player ?? null;
    const targetEntity = chosen?.entity ?? fallbackTarget;
    const targetActor = chosen?.actor ?? targetEntity?.__actor ?? targetEntity;
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
        : (typeof action.priority === "number" ? action.priority : 0);
      if (score == null || Number.isNaN(score)) continue;
      if (!best || score > best.score) {
        best = { action, score, prepared };
      }
    }

    if (best?.action?.perform) {
      best.action.perform(scope, best.prepared);
    }
  }

  /**
   * Determine sensible default action list when actor has none defined.
   * @param {any} actor
   * @returns {string[]}
   */
  static defaultActions(actor) {
    if (actor?.isRangedAttacker) return ["fire_bolt", "strike"];
    return ["strike"];
  }

  /**
   * Determine approximate grid distance between two actors.
   * @param {any} actor
   * @param {any} target
   * @param {any} context
   */
  static distanceBetween(selfMob, target, context) {
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
  }
}
