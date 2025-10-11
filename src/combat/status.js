// src/combat/status.js
// @ts-check

import { contributeDerived } from "./attunement.js";
import { logStatusEvt } from "./debug-log.js";

const REGISTRY = new Map();
export const STATUS_REG = Object.create(null);

/**
 * Registers a status definition.
 * @param {StatusDef} def
 */
export function defineStatus(def) {
  if (!def?.id) throw new Error("Status must have an id");
  const normalized = {
    stacking: "independent",
    maxStacks: Infinity,
    ...def,
  };
  REGISTRY.set(normalized.id, normalized);
  STATUS_REG[normalized.id] = normalized;
  return normalized;
}

export const registerStatus = defineStatus;

/**
 * Attempts to apply multiple statuses using the context payload.
 * @param {{ statusAttempts?: Array<StatusAttempt> }} ctx
 * @param {import("./actor.js").Actor|undefined} attacker
 * @param {import("./actor.js").Actor} defender
 * @param {number} [turn]
 */
export function applyStatuses(ctx, attacker, defender, turn) {
  const attempts = ctx?.statusAttempts || [];
  if (!defender || !attempts.length) return [];

  defender.statuses ||= [];
  const applied = [];
  const currentTurn = typeof turn === "number" ? turn : defender.turn || 0;

  for (const attempt of attempts) {
    if (!attempt?.id) continue;
    const def = REGISTRY.get(attempt.id);
    if (!def) continue;

    const baseChance = clamp(attempt.baseChance ?? 1, 0, 1);
    if (Math.random() > baseChance) continue;

    const stacks = clampStacks(Math.floor(attempt.stacks ?? 1), def);
    const duration = Math.max(1, Math.floor(attempt.baseDuration ?? 1));
    const endsAtTurn = currentTurn + duration;

    let instance = findInstance(defender.statuses, attempt.id);
    if (!instance || def.stacking === "independent") {
      instance = {
        id: attempt.id,
        stacks,
        endsAtTurn,
        nextTickAt: def.tickEvery ? currentTurn + def.tickEvery : undefined,
        source: attacker?.id,
      };
      defender.statuses.push(instance);
      logStatusEvt(defender, {
        action: "apply",
        id: instance.id,
        stacks: instance.stacks,
        potency: instance.potency,
        endsAtTurn: instance.endsAtTurn,
        ttl: Math.max(0, instance.endsAtTurn - currentTurn),
        source: instance.source,
        turn: currentTurn,
      });
    } else if (def.stacking === "refresh") {
      instance.endsAtTurn = Math.max(instance.endsAtTurn, endsAtTurn);
      instance.stacks = clampStacks(Math.max(instance.stacks, stacks), def);
      if (def.tickEvery && typeof instance.nextTickAt !== "number") {
        instance.nextTickAt = currentTurn + def.tickEvery;
      }
      logStatusEvt(defender, {
        action: "refresh",
        id: instance.id,
        stacks: instance.stacks,
        potency: instance.potency,
        endsAtTurn: instance.endsAtTurn,
        ttl: Math.max(0, instance.endsAtTurn - currentTurn),
        source: instance.source,
        turn: currentTurn,
      });
    } else if (def.stacking === "add_stacks") {
      instance.stacks = clampStacks(instance.stacks + stacks, def);
      instance.endsAtTurn = Math.max(instance.endsAtTurn, endsAtTurn);
      if (def.tickEvery && typeof instance.nextTickAt !== "number") {
        instance.nextTickAt = currentTurn + def.tickEvery;
      }
      logStatusEvt(defender, {
        action: "add_stacks",
        id: instance.id,
        stacks: instance.stacks,
        potency: instance.potency,
        endsAtTurn: instance.endsAtTurn,
        ttl: Math.max(0, instance.endsAtTurn - currentTurn),
        source: instance.source,
        turn: currentTurn,
      });
    }

    const result = callHook(def.onApply, defender, instance, { turn: currentTurn, source: attacker });
    if (result && typeof result === "object" && Object.prototype.hasOwnProperty.call(result, "potency")) {
      instance.potency = result.potency;
      logStatusEvt(defender, {
        action: "potency",
        id: instance.id,
        potency: instance.potency,
        stacks: instance.stacks,
        ttl: Math.max(0, instance.endsAtTurn - currentTurn),
        source: instance.source,
        turn: currentTurn,
      });
    }
    applied.push(attempt.id);
  }

  rebuildDerived(defender);
  return applied;
}

/**
 * Applies a single status directly.
 * @param {import("./actor.js").Actor} target
 * @param {string} id
 * @param {number} [stacks]
 * @param {number} [duration]
 * @param {import("./actor.js").Actor} [source]
 * @param {number} [turn]
 */
export function applyStatus(target, id, stacks = 1, duration = 1, source, turn) {
  if (!target || !id) return [];
  const ctx = {
    statusAttempts: [{ id, stacks, baseChance: 1, baseDuration: duration }],
  };
  const useTurn = typeof turn === "number" ? turn : target.turn || 0;
  return applyStatuses(ctx, source, target, useTurn);
}

/**
 * Advances active statuses at the start of a turn.
 * @param {import("./actor.js").Actor} actor
 * @param {number} turn
 */
export function tickStatusesAtTurnStart(actor, turn) {
  if (!actor) return;
  if (!Array.isArray(actor.statuses) || actor.statuses.length === 0) {
    rebuildDerived(actor);
    return;
  }

  const keep = [];
  const expired = [];
  for (const instance of actor.statuses) {
    const def = REGISTRY.get(instance.id);
    if (!def) continue;

    if (def.tickEvery) {
      while (typeof instance.nextTickAt === "number" && turn >= instance.nextTickAt) {
        callHook(def.onTick, actor, instance, { turn });
        instance.nextTickAt += def.tickEvery;
      }
    }

    if (turn < instance.endsAtTurn) {
      keep.push(instance);
    } else {
      callHook(def.onExpire, actor, instance, { turn });
      expired.push({
        id: instance.id,
        stacks: instance.stacks,
        potency: instance.potency,
      });
    }
  }

  actor.statuses = keep;
  if (expired.length) {
    logStatusEvt(actor, {
      action: "expire",
      removed: expired.length,
      statuses: expired,
      turn,
    });
  }
  rebuildDerived(actor);
}

/**
 * Rebuilds derived aggregates based on current statuses.
 * @param {import("./actor.js").Actor} actor
 */
export function rebuildDerived(actor) {
  const derived = {
    moveAPDelta: 0,
    actionSpeedPct: 0,
    cooldownMult: 1,
    accuracyFlat: 0,
    critChancePct: 0,
    regenFlat: { hp: 0, stamina: 0, mana: 0 },
    regenPct: { hp: 0, stamina: 0, mana: 0 },
    costMult: { stamina: 1, mana: 1 },
    damageDealtMult: Object.create(null),
    damageTakenMult: Object.create(null),
    resistDelta: Object.create(null),
    regen: { hp: 0, stamina: 0, mana: 0 },
  };

  if (!actor) {
    return derived;
  }

  const statuses = Array.isArray(actor.statuses) ? actor.statuses : [];
  for (const instance of statuses) {
    const def = REGISTRY.get(instance.id) || STATUS_REG[instance.id];
    if (!def?.derive) continue;

    const payload = {
      target: actor,
      stacks: instance?.stacks ?? 1,
      potency: instance?.potency,
      instance,
      source: instance?.source,
    };

    let res;
    if (typeof def.derive === "function") {
      res = def.derive.length >= 2 ? def.derive(actor, instance) : def.derive(payload);
    }

    if (res && typeof res === "object") {
      mergeDerived(derived, res);
    }
  }

  derived.regen.hp = derived.regenFlat.hp;
  derived.regen.stamina = derived.regenFlat.stamina;
  derived.regen.mana = derived.regenFlat.mana;

  contributeDerived(actor, derived);

  actor.statusDerived = derived;
  return derived;
}

export const rebuildStatusDerived = rebuildDerived;

/**
 * @typedef {Object} StatusAttempt
 * @property {string} id
 * @property {number} [baseChance]
 * @property {number} [baseDuration]
 * @property {number} [stacks]
 */

/**
 * @typedef {Object} StatusInstance
 * @property {string} id
 * @property {number} stacks
 * @property {number} endsAtTurn
 * @property {number} [nextTickAt]
 * @property {number} [potency]
 * @property {string} [source]
 */

/**
 * @typedef {Object} StatusDef
 * @property {string} id
 * @property {"refresh"|"add_stacks"|"independent"} [stacking]
 * @property {number} [maxStacks]
 * @property {number} [tickEvery]
 * @property {(actor: import("./actor.js").Actor, instance: StatusInstance, extra?: any) => any} [onApply]
 * @property {(actor: import("./actor.js").Actor, instance: StatusInstance, extra?: any) => any} [onTick]
 * @property {(actor: import("./actor.js").Actor, instance: StatusInstance, extra?: any) => any} [onExpire]
 * @property {(actor: import("./actor.js").Actor, instance: StatusInstance) => any} [derive]
 */

function clampStacks(stacks, def) {
  const value = Number.isFinite(stacks) ? stacks : 1;
  const max = Number.isFinite(def.maxStacks) ? def.maxStacks : Infinity;
  return Math.max(1, Math.min(max, value));
}

function findInstance(instances, id) {
  return instances.find(s => s.id === id) || null;
}

function mergeDerived(dst, src) {
  if (!src) return;
  if (typeof src.moveAPDelta === "number") dst.moveAPDelta += src.moveAPDelta;
  if (typeof src.actionSpeedPct === "number") dst.actionSpeedPct += src.actionSpeedPct;
  if (typeof src.cooldownMult === "number") dst.cooldownMult *= src.cooldownMult;
  if (typeof src.accuracyFlat === "number") dst.accuracyFlat += src.accuracyFlat;
  if (typeof src.critChancePct === "number") dst.critChancePct += src.critChancePct;
  if (src.damageDealtMult) mergeMap(dst.damageDealtMult, src.damageDealtMult);
  if (src.damageTakenMult) mergeMap(dst.damageTakenMult, src.damageTakenMult);
  if (src.resistDelta) mergeMap(dst.resistDelta, src.resistDelta);
  if (src.regen) addRecords(dst.regenFlat, src.regen);
  if (src.regenFlat) addRecords(dst.regenFlat, src.regenFlat);
  if (src.regenPct) addRecords(dst.regenPct, src.regenPct);
  if (src.costMult) multiplyRecords(dst.costMult, src.costMult);
}

function mergeMap(dst, src) {
  for (const key of Object.keys(src)) {
    dst[key] = (dst[key] || 0) + (src[key] || 0);
  }
}

function addRecords(dst, src) {
  for (const key of Object.keys(src)) {
    dst[key] = (dst[key] || 0) + (src[key] || 0);
  }
}

function multiplyRecords(dst, src) {
  for (const key of Object.keys(src)) {
    const value = Number.isFinite(src[key]) ? src[key] : 1;
    dst[key] = (dst[key] || 1) * value;
  }
}

function callHook(fn, actor, instance, extra) {
  if (typeof fn !== "function") return undefined;
  if (fn.length >= 2) return fn(actor, instance, extra);
  return fn({
    target: actor,
    instance,
    stacks: instance?.stacks ?? 0,
    potency: instance?.potency,
    turn: extra?.turn,
    source: extra?.source,
  });
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

export function getStatusDefinition(id) {
  return REGISTRY.get(id);
}
