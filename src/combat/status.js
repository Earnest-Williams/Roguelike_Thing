// src/combat/status.js
// @ts-check

import { contributeDerived } from "./attunement.js";
import { logStatusEvt } from "./debug-log.js";
import { EXTRA_STATUSES } from "../content/statuses.js";

/** @typedef {{
 *   id: string,
 *   stacking?: "add"|"max"|"replace"|"refresh",
 *   tickEvery?: number,
 *   duration?: number,
 *   onApply?: (ctx: StatusHookContext) => void,
 *   onTick?: (ctx: StatusHookContext) => void,
 *   onRemove?: (ctx: StatusHookContext) => void,
 *   derive?: (ctx: StatusHookContext, derived: StatusDerived) => StatusDerived | void
 * }} StatusDefinition */

/** @typedef {{
 *   target: any,
 *   stacks: number,
 *   potency: number,
 *   turn?: number,
 *   source?: any,
 *   status?: StatusInstance
 * }} StatusHookContext */

/** @typedef {{
 *   id: string,
 *   stacks: number,
 *   potency: number,
 *   nextTickAt: number,
 *   endsAt: number,
 *   source?: any
 * }} StatusInstance */

/** @typedef {{
 *   temporal: Record<string, number>,
 *   offense: Record<string, number>,
 *   defense: Record<string, number>,
 *   resistsPct: Record<string, number>,
 *   flatDR: Record<string, number>,
 *   regenFlat: Record<string, number>,
 *   regenPct: Record<string, number>,
 *   regen: Record<string, number>,
 *   damageDealtMult: Record<string, number>,
 *   damageTakenMult: Record<string, number>,
 *   costMult: Record<string, number>,
 *   actionSpeedPct?: number,
 *   moveAPDelta?: number,
 *   cooldownPct?: number,
 *   cooldownMult?: number,
 *   resistDelta?: Record<string, number>
 * }} StatusDerived */

const _registry = new Map();
export const STATUS_REGISTRY = Object.create(null);

/**
 * Register or overwrite a status definition.
 * @param {StatusDefinition} def
 */
export function registerStatus(def) {
  if (!def || typeof def.id !== "string") {
    throw new Error("registerStatus requires an id");
  }
  const normalized = {
    stacking: "add",
    tickEvery: 0,
    duration: 0,
    ...def,
  };
  _registry.set(normalized.id, normalized);
  STATUS_REGISTRY[normalized.id] = normalized;
  return normalized;
}

export const defineStatus = registerStatus;

const DEFAULT_STATUSES = {
  haste: {
    id: "haste",
    stacking: "refresh",
    tickEvery: 1,
    duration: 6,
    derive(ctx, d) {
      d.temporal.actionSpeedPct = (d.temporal.actionSpeedPct || 0) + 0.15 * ctx.stacks;
      return d;
    },
  },
  burning: {
    id: "burning",
    stacking: "add",
    tickEvery: 1,
    duration: 4,
    onTick({ target, potency }) {
      if (target && Number.isFinite(target.hp)) {
        target.hp = Math.max(0, target.hp - potency);
      }
    },
  },
};

for (const def of Object.values(DEFAULT_STATUSES)) {
  registerStatus(def);
}

if (EXTRA_STATUSES && typeof EXTRA_STATUSES === "object") {
  for (const def of Object.values(EXTRA_STATUSES)) {
    if (def && typeof def === "object") registerStatus(def);
  }
}

function ensureStatusList(target) {
  if (!target.statuses || !Array.isArray(target.statuses)) {
    target.statuses = [];
  }
  return target.statuses;
}

function makeDerivedBase() {
  return {
    temporal: Object.create(null),
    offense: Object.create(null),
    defense: Object.create(null),
    resistsPct: Object.create(null),
    flatDR: Object.create(null),
    regenFlat: { hp: 0, stamina: 0, mana: 0 },
    regenPct: { hp: 0, stamina: 0, mana: 0 },
    regen: { hp: 0, stamina: 0, mana: 0 },
    damageDealtMult: Object.create(null),
    damageTakenMult: Object.create(null),
    costMult: { hp: 1, stamina: 1, mana: 1 },
    actionSpeedPct: 0,
    moveAPDelta: 0,
    cooldownPct: 0,
    cooldownMult: 1,
    resistDelta: Object.create(null),
  };
}

function hookPayload(target, entry) {
  return {
    target,
    stacks: entry.stacks,
    potency: entry.potency,
    turn: target.turn,
    source: entry.source,
    status: entry,
  };
}

function normalizeEndsAt(target, endsAt) {
  const now = Number.isFinite(target?.turn) ? target.turn : 0;
  if (!Number.isFinite(endsAt)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(now, endsAt);
}

/**
 * Apply a status by id, respecting stacking rules.
 * @param {any} target
 * @param {string} id
 * @param {{ stacks?: number, potency?: number, duration?: number, source?: any }} [opts]
 */
export function addStatus(target, id, opts = {}) {
  if (!target || !id) return null;
  const def = _registry.get(id);
  if (!def) return null;

  const stacks = Math.max(1, Math.floor(Number(opts.stacks ?? 1) || 1));
  const potency = Number.isFinite(opts.potency) ? Number(opts.potency) : stacks;
  const duration = opts.duration ?? def.duration ?? 0;
  const list = ensureStatusList(target);
  const now = Number.isFinite(target.turn) ? target.turn : 0;
  const existing = list.find(s => s.id === id) || null;
  const nextEndsAt = normalizeEndsAt(target, now + duration);

  if (!existing) {
    const entry = {
      id,
      stacks,
      potency,
      nextTickAt: def.tickEvery ? now + def.tickEvery : now,
      endsAt: nextEndsAt,
      source: opts.source,
    };
    list.push(entry);
    def.onApply?.({ ...hookPayload(target, entry), source: opts.source });
    logStatusEvt(target, {
      action: "apply",
      id,
      stacks: entry.stacks,
      potency: entry.potency,
      endsAt: entry.endsAt,
    });
    return entry;
  }

  const entry = existing;
  switch (def.stacking) {
    case "replace":
      entry.stacks = stacks;
      entry.potency = potency;
      break;
    case "max":
      entry.stacks = Math.max(entry.stacks, stacks);
      entry.potency = Math.max(entry.potency, potency);
      break;
    case "refresh":
      entry.stacks += stacks;
      entry.potency += potency;
      break;
    case "add":
    default:
      entry.stacks += stacks;
      entry.potency += potency;
      break;
  }
  entry.endsAt = Math.max(entry.endsAt, nextEndsAt);
  if (opts.source !== undefined) {
    entry.source = opts.source;
  }
  if (def.tickEvery && entry.nextTickAt < now) {
    entry.nextTickAt = now + def.tickEvery;
  }
  def.onApply?.({ ...hookPayload(target, entry), source: opts.source });
  logStatusEvt(target, {
    action: "stack",
    id,
    stacks: entry.stacks,
    potency: entry.potency,
    endsAt: entry.endsAt,
  });
  return entry;
}

/**
 * Remove a status entry from target.
 * @param {any} target
 * @param {StatusInstance} entry
 */
export function removeStatus(target, entry) {
  if (!target || !entry) return;
  const list = ensureStatusList(target);
  const idx = list.indexOf(entry);
  if (idx >= 0) {
    list.splice(idx, 1);
  }
  const def = _registry.get(entry.id);
  def?.onRemove?.(hookPayload(target, entry));
  logStatusEvt(target, {
    action: "remove",
    id: entry.id,
    stacks: entry.stacks,
    potency: entry.potency,
  });
}

/**
 * Advance ticking statuses for the given actor/turn.
 * @param {any} actor
 * @param {number} turn
 */
export function tickStatuses(actor, turn) {
  if (!actor) return;
  actor.turn = turn;
  const list = ensureStatusList(actor);
  if (!list.length) return;

  for (const entry of [...list]) {
    const def = _registry.get(entry.id);
    if (!def) {
      removeStatus(actor, entry);
      continue;
    }
    if (entry.endsAt !== Number.POSITIVE_INFINITY && turn > entry.endsAt) {
      removeStatus(actor, entry);
      continue;
    }
    if (def.tickEvery) {
      while (turn >= entry.nextTickAt) {
        def.onTick?.(hookPayload(actor, entry));
        logStatusEvt(actor, {
          action: "tick",
          id: entry.id,
          stacks: entry.stacks,
          potency: entry.potency,
          turn,
        });
        entry.nextTickAt += def.tickEvery;
      }
    }
  }
}

/**
 * Recompute derived aggregates from statuses and attunement.
 * @param {any} actor
 */
export function rebuildDerived(actor) {
  const derived = makeDerivedBase();
  if (!actor) return derived;
  const list = ensureStatusList(actor);
  for (const entry of list) {
    const def = _registry.get(entry.id);
    if (!def?.derive) continue;
    const result = def.derive(hookPayload(actor, entry), derived);
    if (result && result !== derived) {
      Object.assign(derived, result);
    }
  }
  contributeDerived(actor, derived);

  derived.actionSpeedPct = derived.temporal.actionSpeedPct || 0;
  derived.moveAPDelta = derived.temporal.moveAPDelta || 0;
  derived.cooldownPct = derived.temporal.cooldownPct || 0;
  derived.cooldownMult = Number.isFinite(derived.temporal.cooldownMult)
    ? derived.temporal.cooldownMult
    : derived.cooldownMult;
  derived.resistDelta = derived.resistsPct;

  actor.statusDerived = derived;
  return derived;
}

export const rebuildStatusDerived = rebuildDerived;

/**
 * Compatibility helper: apply multiple statuses using legacy context.
 * @param {{ statusAttempts?: Array<{ id: string, baseChance?: number, baseDuration?: number, stacks?: number, potency?: number }> }} ctx
 * @param {any} attacker
 * @param {any} defender
 * @param {number} [turn]
 */
function ensureStatusInteraction(actor) {
  const cache = actor?.modCache;
  if (!cache) return Object.create(null);
  return cache.status || cache.statusInteraction || Object.create(null);
}

function ensureFreeActionBucket(actor) {
  if (!actor) return null;
  if (!actor.freeAction || typeof actor.freeAction !== "object") {
    actor.freeAction = { cooldownRemaining: 0, ready: true };
  }
  return actor.freeAction;
}

const clamp01 = (value) => Math.max(0, Math.min(1, value));

/**
 * Applies a single status attempt with status interaction bonuses and free-action handling.
 * @param {{ attacker?: any, defender: any, attempt: any, turn?: number, rng?: ()=>number }} payload
 */
export function applyOneStatusAttempt({ attacker, defender, attempt, turn, rng }) {
  if (!defender || !attempt?.id) return null;
  const def = _registry.get(attempt.id);
  if (!def) return null;

  const now = Number.isFinite(turn)
    ? Number(turn)
    : Number.isFinite(defender.turn)
    ? defender.turn
    : 0;
  defender.turn = now;

  const roll = typeof rng === "function" ? rng : Math.random;
  const aInt = ensureStatusInteraction(attacker);
  const dInt = ensureStatusInteraction(defender);

  let chance = Number(attempt.baseChance ?? attempt.chance ?? 1);
  chance = Number.isFinite(chance) ? chance : 1;
  chance += Number(aInt.inflictBonus?.[attempt.id] || 0);
  chance += Number(dInt.resistBonus?.[attempt.id] || 0);
  chance = clamp01(chance);

  const stacks = Math.max(1, Math.floor(Number(attempt.stacks ?? 1) || 1));
  const potency = Number.isFinite(attempt.potency)
    ? Number(attempt.potency)
    : stacks;

  let duration = Number(attempt.baseDuration ?? attempt.duration ?? def.duration ?? 0) || 0;
  const inflictMult = Number(aInt.inflictDurMult?.[attempt.id] || 0);
  const recvMult = Number(dInt.recvDurMult?.[attempt.id] || 0);
  duration *= 1 + inflictMult;
  duration *= 1 + recvMult;
  if (attacker && attacker === defender) {
    const buffMult = Number(aInt.buffDurMult ?? 1) || 1;
    duration *= buffMult;
  }
  duration = Math.max(0, Math.floor(duration));

  const faBucket = ensureFreeActionBucket(defender);
  const faIgnore = dInt.freeActionIgnore instanceof Set && dInt.freeActionIgnore.has(attempt.id);
  if (faIgnore && faBucket?.ready) {
    faBucket.ready = false;
    const cd = Number(dInt.freeActionCooldown || 0);
    if (Number.isFinite(cd)) {
      faBucket.cooldownRemaining = Math.max(cd, Number(faBucket.cooldownRemaining || 0));
    }
    if (dInt.freeActionPurge && Array.isArray(defender.statuses)) {
      defender.statuses = defender.statuses.filter((s) => s?.id !== attempt.id);
    }
    if (Array.isArray(defender.logs?.attack?.messages)) {
      defender.logs.attack.messages.push({ kind: "status_ignored_free_action", id: attempt.id });
    }
    return { id: attempt.id, ignored: true };
  }

  if (chance < 1 && roll() > chance) {
    return null;
  }
  if (duration <= 0) {
    return null;
  }

  return addStatus(defender, attempt.id, {
    stacks,
    potency,
    duration,
    source: attacker,
  });
}

export function applyStatuses(ctx, attacker, defender, turn) {
  const attempts = Array.isArray(ctx?.statusAttempts) ? ctx.statusAttempts : [];
  if (!defender || !attempts.length) return [];
  const applied = [];
  for (const attempt of attempts) {
    const res = applyOneStatusAttempt({ attacker, defender, attempt, turn });
    if (res && !res.ignored) {
      applied.push(attempt.id);
    }
  }
  rebuildDerived(defender);
  return applied;
}

export function applyStatus(target, id, stacks = 1, duration = 1, source, turn) {
  if (!target) return [];
  const now = Number.isFinite(turn) ? turn : Number.isFinite(target.turn) ? target.turn : 0;
  target.turn = now;
  const entry = addStatus(target, id, { stacks, potency: stacks, duration, source });
  if (!entry) return [];
  rebuildDerived(target);
  return [id];
}

export function tickStatusesAtTurnStart(actor, turn) {
  tickStatuses(actor, turn);
  rebuildDerived(actor);
}

export function getStatusDefinition(id) {
  return _registry.get(id) || null;
}

