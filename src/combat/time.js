// src/combat/time.js
// @ts-check

import {
  BASE_AP_GAIN_PER_TURN,
  COOLDOWN_MIN_TURNS,
  COOLDOWN_PROGRESS_PER_TURN,
  MIN_AP_COST,
} from "../../constants.js";

/**
 * AP accrual per turn, scaled by (1 / totalActionCostMult).
 * Faster actors (lower mult) earn more usable AP effectively.
 * @param {import("./actor.js").Actor} actor
 */
export function gainAP(actor) {
  if (!actor) return;
  const mult = actor.totalActionCostMult(); // lower = faster
  const gain = Math.round(BASE_AP_GAIN_PER_TURN / mult);
  actor.ap = Math.min(actor.apCap, actor.ap + gain);
}

/**
 * Computes AP cost for a given action type, scaled by totalActionCostMult.
 * E.g., a standard action is actor.baseActionAP (100) at mult=1.
 * @param {import("./actor.js").Actor} actor
 * @param {number} baseCostAP
 */
export function apCost(actor, baseCostAP) {
  const mult = actor.totalActionCostMult();
  return Math.max(MIN_AP_COST, Math.round(baseCostAP * mult));
}

/**
 * Attempts to spend AP. Returns true on success.
 * @param {import("./actor.js").Actor} actor
 * @param {number} costAP
 */
export function spendAP(actor, costAP) {
  if (actor.ap < costAP) return false;
  actor.ap -= costAP;
  return true;
}

/**
 * Ticks cooldowns down by 1 turn / cooldownMult (slower if >1).
 * We model this by accumulating fractional progress.
 * @param {import("./actor.js").Actor} actor
 */
export function tickCooldowns(actor) {
  if (!actor) return;
  const mult = actor.totalCooldownMult(); // >1 means slower cooldowns
  for (const key of Object.keys(actor.cooldowns)) {
    let remain = actor.cooldowns[key];
    remain -= COOLDOWN_PROGRESS_PER_TURN / mult;
    actor.cooldowns[key] = Math.max(COOLDOWN_MIN_TURNS, remain);
    if (actor.cooldowns[key] === COOLDOWN_MIN_TURNS) delete actor.cooldowns[key];
  }
}

/**
 * Starts a cooldown in turns, scaled by cooldownMult (longer if >1).
 * @param {import("./actor.js").Actor} actor
 * @param {string} key
 * @param {number} baseTurns
 */
export function startCooldown(actor, key, baseTurns) {
  const mult = actor.totalCooldownMult();
  const current = actor.cooldowns[key] || 0;
  actor.cooldowns[key] = Math.max(current, baseTurns * mult);
}

/**
 * Returns true if an ability/key is ready (cooldown == 0).
 * @param {import("./actor.js").Actor} actor
 * @param {string} key
 */
export function isReady(actor, key) {
  return !actor.cooldowns[key];
}
