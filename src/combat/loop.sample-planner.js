// src/combat/loop.sample-planner.js
// @ts-check
import { tryAttack, tryAttackEquipped, tryMove } from "./actions.js";
import { apCost } from "./time.js";

/**
 * Simple greedy planner: attack if we can afford it, otherwise move.
 * @param {import("./actor.js").Actor} target
 */
export function simplePlanner(target) {
  return (actor) => {
    const attackCost = apCost(actor, actor.baseActionAP ?? 100);
    if (actor.ap >= attackCost) {
      if (tryAttackEquipped(actor, target, 1)) {
        return;
      }
      if (tryAttack(actor, target, { base: 8, type: "fire", key: "swing", baseCooldown: 2, baseAP: actor.baseActionAP })) {
        return;
      }
    }

    const moveCost = apCost(actor, 50);
    if (actor.ap >= moveCost) {
      tryMove(actor, { dx: 1, dy: 0 });
    }
  };
}
