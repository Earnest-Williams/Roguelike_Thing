// src/combat/time.js
// @ts-check

import { BASE_AP_GAIN_PER_TURN } from "../../constants.js";

/**
 * Computes the final AP cost (and potential refund) for an action.
 * @param {import("./actor.js").Actor} actor
 * @param {number} baseAP
 * @param {string[]} [tags]
 */
export function finalAPForAction(actor, baseAP, tags = []) {
  const tagsArr = Array.isArray(tags) ? tags : [];
  const temporal =
    actor?.temporal || actor?.modCache?.temporalHooks || Object.create(null);
  const sd = actor?.statusDerived || {};
  const base = Math.max(0, Math.floor(Number(baseAP) || 0));
  const moveDelta = tagsArr.includes("move")
    ? (temporal.moveAPDelta || 0) + (sd.moveAPDelta || 0)
    : 0;
  const castDelta = tagsArr.includes("cast")
    ? (temporal.castTimeDelta || 0) + (sd.castTimeDelta || 0)
    : 0;
  const additive = Math.max(0, base + moveDelta + castDelta);
  const speedScalar = 1 - ((temporal.actionSpeedPct || 0) + (sd.actionSpeedPct || 0));
  const appliedScalar = Math.max(0.2, speedScalar);
  const scaled = Math.max(0, Math.ceil(additive * appliedScalar));
  const refundPct = Math.max(0, (temporal.recoveryPct || 0) + (sd.recoveryPct || 0));
  const refund = Math.max(0, Math.floor(scaled * refundPct));
  return {
    costAP: Math.max(0, scaled - refund),
    refundAP: refund,
  };
}

/**
 * Computes a cooldown in turns after temporal modifiers.
 * @param {import("./actor.js").Actor} actor
 * @param {number} baseCooldown
 */
export function finalCooldown(actor, baseCooldown) {
  const base = Math.max(0, Math.floor(Number(baseCooldown) || 0));
  const temporalSource =
    actor?.temporal || actor?.modCache?.temporalHooks || Object.create(null);
  const temporalPct = temporalSource.cooldownPct || 0;
  const sd = actor?.statusDerived || {};
  const scalarPct = 1 + temporalPct + (sd.cooldownPct || 0);
  const scalarMult = Number.isFinite(sd.cooldownMult) ? sd.cooldownMult : 1;
  const scalar = Math.max(0, scalarPct) * Math.max(0, scalarMult);
  return Math.max(0, Math.ceil(base * scalar));
}

/**
 * Initiative bonus from temporal payloads.
 * @param {import("./actor.js").Actor} actor
 * @param {number} baseInit
 */
export function initiativeWithTemporal(actor, baseInit) {
  const base = Math.floor(Number(baseInit) || 0);
  const temporalSource =
    actor?.temporal || actor?.modCache?.temporalHooks || Object.create(null);
  const temporalBonus = temporalSource.initBonus || 0;
  const sd = actor?.statusDerived || {};
  return base + temporalBonus + (sd.initBonus || sd.initiativeFlat || 0);
}

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
 * Computes AP cost for a given action type, factoring in temporal/status modifiers.
 * E.g., a standard action is actor.baseActionAP (100) before temporal/status deltas.
 * @param {import("./actor.js").Actor} actor
 * @param {number} baseCostAP
 */
/**
 * Computes AP cost for a given action type, factoring in temporal/status modifiers.
 * E.g., a standard action is actor.baseActionAP (100) before temporal/status deltas.
 * @param {import("./actor.js").Actor} actor
 * @param {number} baseAP
 * @param {{ includeMoveDelta?: boolean }} [opts]
 */
export function apCost(actor, baseAP, opts = {}) {
  const tags = [];
  if (opts.includeMoveDelta) tags.push("move");
  if (opts.includeCastDelta) tags.push("cast");
  return finalAPForAction(actor, baseAP, tags).costAP;
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
  const turns = finalCooldown(actor, baseTurns);
  actor.cooldowns ||= new Map();
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
