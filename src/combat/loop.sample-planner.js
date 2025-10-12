// src/combat/loop.sample-planner.js
// @ts-check
import { tryAttack, tryAttackEquipped, tryMove } from "./actions.js";
import { apCost } from "./time.js";
import {
  BASE_MOVE_AP_COST,
  DEFAULT_BASE_ACTION_AP,
  DEFAULT_MELEE_RANGE_TILES,
  SIMPLE_PLANNER_FALLBACK_BASE_COOLDOWN,
  SIMPLE_PLANNER_FALLBACK_BASE_DAMAGE,
} from "../../js/constants.js";

/**
 * Simple greedy planner: attack if we can afford it, otherwise move.
 * @param {import("./actor.js").Actor} target
 */
export function simplePlanner(target) {
  return (actor) => {
    const attackCost = apCost(actor, actor.baseActionAP ?? DEFAULT_BASE_ACTION_AP);
    if (actor.ap >= attackCost) {
      if (tryAttackEquipped(actor, target, DEFAULT_MELEE_RANGE_TILES)) {
        return;
      }
      if (
        tryAttack(actor, target, {
          base: SIMPLE_PLANNER_FALLBACK_BASE_DAMAGE,
          type: "fire",
          key: "swing",
          baseCooldown: SIMPLE_PLANNER_FALLBACK_BASE_COOLDOWN,
          baseAP: actor.baseActionAP,
        })
      ) {
        return;
      }
    }

    const moveCost = apCost(actor, BASE_MOVE_AP_COST, { includeMoveDelta: true });
    if (actor.ap >= moveCost) {
      tryMove(actor, { dx: 1, dy: 0 });
    }
  };
}
