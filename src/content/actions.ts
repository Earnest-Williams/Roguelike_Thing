// src/content/actions.js
// @ts-nocheck

import { planEquippedAttack, tryAttackEquipped, tryMove } from "../combat/actions.js";

/**
 * Catalog of data-driven actions available to actors.
 */
export const ACTIONS = {
  strike: {
    id: "strike",
    tags: ["attack", "melee"],
    priority: 10,
    prepare(scope) {
      if (!scope.target) return false;
      return planEquippedAttack(scope.actor, scope.target, scope.distance ?? 1) || false;
    },
    canPerform(_scope, plan) {
      return Boolean(plan);
    },
    evaluate(scope, plan) {
      if (!plan) return -Infinity;
      const base = scope.distance <= 1 ? 15 : 5;
      const modeBonus = plan.mode?.kind === "melee" ? 2 : 0;
      const damageHint = plan.mode?.profile?.damage?.diceSides || 0;
      return base + modeBonus + damageHint * 0.1;
    },
    perform(scope) {
      if (!scope.target) return false;
      return tryAttackEquipped(scope.actor, scope.target, scope.distance ?? 1);
    },
  },
  fire_bolt: {
    id: "fire_bolt",
    tags: ["attack", "spell"],
    priority: 12,
    prepare(scope) {
      if (!scope.target) return false;
      const plan = planEquippedAttack(scope.actor, scope.target, scope.distance ?? 1);
      if (!plan) return false;
      const kind = plan.mode?.kind;
      if (kind === "ranged" || kind === "throw") return plan;
      return false;
    },
    canPerform(_scope, plan) {
      return Boolean(plan);
    },
    evaluate(scope, plan) {
      if (!plan) return -Infinity;
      const damageHint = plan.mode?.profile?.damage?.diceSides || 0;
      const distanceBonus = scope.distance > 1 ? 8 : 0;
      return 20 + distanceBonus + damageHint * 0.2;
    },
    perform(scope) {
      if (!scope.target) return false;
      return tryAttackEquipped(scope.actor, scope.target, scope.distance ?? 1);
    },
  },
  move_towards_target: {
    id: "move_towards_target",
    tags: ["move"],
    priority: 5,
    prepare(scope) {
      const { actor, target, context } = scope;
      if (!target) return false;
      const ax = actor?.x;
      const ay = actor?.y;
      const tx = target?.x;
      const ty = target?.y;
      if (![ax, ay, tx, ty].every((v) => typeof v === "number")) return false;
      const dxRaw = tx - ax;
      const dyRaw = ty - ay;
      if (dxRaw === 0 && dyRaw === 0) return false;
      let step = { dx: Math.sign(dxRaw), dy: Math.sign(dyRaw) };
      if (Math.abs(dxRaw) > Math.abs(dyRaw)) {
        step = { dx: Math.sign(dxRaw), dy: 0 };
      } else {
        step = { dx: 0, dy: Math.sign(dyRaw) };
      }
      if (context?.canMove && context.canMove(actor, step) === false) return false;
      return step;
    },
    canPerform(_scope, step) {
      return Boolean(step);
    },
    evaluate(scope, step) {
      if (!step) return -Infinity;
      if (typeof scope.distance === "number" && scope.distance <= 1) {
        return 1; // already adjacent
      }
      return 6;
    },
    perform(scope, step) {
      if (!step) return false;
      const { actor, context } = scope;
      if (context?.tryMove) {
        return context.tryMove(actor, step);
      }
      if (typeof actor?.tryMove === "function") {
        return actor.tryMove(step.dx, step.dy, context?.maze, context?.mobManager);
      }
      return tryMove(actor, step);
    },
  },
};

