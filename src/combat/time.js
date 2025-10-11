// src/combat/time.js
// @ts-check

import {
  BASE_AP_GAIN_PER_TURN,
  COOLDOWN_MIN_TURNS,
  MIN_AP_COST,
  MIN_TOTAL_ACTION_COST_MULTIPLIER,
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
  const base = Number(baseCostAP) || 0;

  /** @type {number} */
  let mult;
  if (typeof actor?.totalActionCostMult === "function") {
    mult = actor.totalActionCostMult();
  } else {
    const speedMult = Number(actor?.modCache?.speedMult);
    const temporalPct = Number(actor?.modCache?.temporal?.actionSpeedPct) || 0;
    const derivedPct = Number(actor?.statusDerived?.actionSpeedPct) || 0;
    const pct = 1 + temporalPct + derivedPct;
    mult = (Number.isFinite(speedMult) && speedMult > 0 ? speedMult : 1) * pct;
    mult = Math.max(MIN_TOTAL_ACTION_COST_MULTIPLIER, mult);
  }

  const raw = base * mult;
  const cost = Number.isFinite(raw) ? raw : base;
  return Math.max(MIN_AP_COST, Math.round(cost));
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
  if (!actor || !(actor.cooldowns instanceof Map)) return;
  const turn = actor.turn || 0;
  for (const [key, readyAt] of actor.cooldowns.entries()) {
    if (turn >= readyAt) actor.cooldowns.delete(key);
  }
}

/**
 * Starts a cooldown in turns, scaled by cooldownMult (longer if >1).
 * @param {import("./actor.js").Actor} actor
 * @param {string} key
 * @param {number} baseTurns
 */
export function startCooldown(actor, key, baseTurns) {
  if (!actor || !key) return;
  const temporal = actor.modCache?.temporal || { cooldownMult: 1 };
  const sd = actor.statusDerived || {};
  const raw = Number(baseTurns) * (temporal.cooldownMult || 1) * (sd.cooldownMult || 1);
  const turns = Math.max(COOLDOWN_MIN_TURNS, Math.round(Number.isFinite(raw) ? raw : Number(baseTurns) || 0));
  if (!actor.cooldowns || !(actor.cooldowns instanceof Map)) actor.cooldowns = new Map();
  const currentTurn = actor.turn || 0;
  actor.cooldowns.set(key, currentTurn + turns);
}

/**
 * Returns true if an ability/key is ready (cooldown == 0).
 * @param {import("./actor.js").Actor} actor
 * @param {string} key
 */
export function isReady(actor, key) {
  if (!actor) return true;
  if (!actor.cooldowns || !(actor.cooldowns instanceof Map)) {
    return true;
  }
  const readyAt = actor.cooldowns.get(key);
  if (readyAt === undefined) return true;
  const turn = actor.turn || 0;
  return turn >= readyAt;
}
