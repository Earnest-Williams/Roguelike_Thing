// src/combat/status.js
// @ts-check

import { contributeDerived } from "./attunement.js";
import { logStatusEvt } from "./debug-log.js";
import { STATUS_DEFINITIONS } from "../content/statuses.js";

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
 *   baseActionAPDelta?: number,
 *   cooldownPct?: number,
 *   cooldownMult?: number,
 *   castTimeDelta?: number,
 *   recoveryPct?: number,
 *   initBonus?: number,
 *   initiativeFlat?: number,
 *   accuracyFlat?: number,
 *   resistDelta?: Record<string, number>
 * }} StatusDerived */

const _registry = new Map();
export const STATUS_REGISTRY = Object.create(null);

function normalizeStacking(value) {
  if (typeof value !== "string") return "add";
  const raw = value.toLowerCase();
  switch (raw) {
    case "add":
    case "stack":
    case "add_stacks":
      return "add";
    case "refresh":
    case "reapply":
      return "refresh";
    case "max":
    case "cap":
      return "max";
    case "replace":
      return "replace";
    case "independent":
    case "independent_stacks":
      return "independent";
    default:
      return raw;
  }
}

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
  normalized.stacking = normalizeStacking(normalized.stacking);
  _registry.set(normalized.id, normalized);
  STATUS_REGISTRY[normalized.id] = normalized;
  return normalized;
}

export const defineStatus = registerStatus;

function applyDirectHpLoss(target, amount) {
  if (!target) return 0;
  const dmg = Math.max(0, Math.floor(Number(amount) || 0));
  if (!dmg) return 0;

  if (target.res && Number.isFinite(target.res.hp)) {
    const next = Math.max(0, target.res.hp - dmg);
    target.res.hp = next;
    if (target.resources && typeof target.resources === "object") {
      target.resources.hp = next;
      if (target.resources.pools?.hp) {
        target.resources.pools.hp.cur = next;
      }
    }
    if (Number.isFinite(target.hp)) {
      target.hp = next;
    }
  } else if (Number.isFinite(target?.hp)) {
    const next = Math.max(0, target.hp - dmg);
    target.hp = next;
    if (target.resources && typeof target.resources === "object") {
      target.resources.hp = next;
      if (target.resources.pools?.hp) {
        target.resources.pools.hp.cur = next;
      }
    }
  }

  return dmg;
}

function dealTypeDamage(target, type, amount) {
  const dealt = applyDirectHpLoss(target, amount);
  if (!dealt) return 0;
  if (target && typeof target === "object") {
    target.lastDamageType = type || target.lastDamageType || null;
  }
  logStatusEvt(target, { action: "dot", type, amount: dealt });
  return dealt;
}

for (const def of STATUS_DEFINITIONS) {
  if (def && typeof def === "object") {
    registerStatus(def);
  }
}

function ensureStatusList(target) {
  if (!target.statuses || !Array.isArray(target.statuses)) {
    target.statuses = [];
  }
  return target.statuses;
}

export function hasStatus(target, id) {
  if (!target || !id) return false;
  const list = Array.isArray(target.statuses) ? target.statuses : null;
  if (!list || !list.length) return false;
  return list.some((entry) => entry && entry.id === id);
}

export function removeStatusById(target, id) {
  if (!target || !id) return false;
  const list = Array.isArray(target.statuses) ? target.statuses : null;
  if (!list || !list.length) return false;
  const entry = list.find((s) => s && s.id === id);
  if (!entry) return false;
  removeStatus(target, entry);
  return true;
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
    baseActionAPDelta: 0,
    cooldownPct: 0,
    cooldownMult: 1,
    castTimeDelta: 0,
    recoveryPct: 0,
    initBonus: 0,
    initiativeFlat: 0,
    accuracyFlat: 0,
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
  const stackingMode = normalizeStacking(def.stacking);
  const existing = stackingMode === "independent" ? null : list.find((s) => s.id === id) || null;
  const nextEndsAt = normalizeEndsAt(target, now + duration);

  if (!existing) {
    const entry = {
      id,
      stacks,
      potency,
      nextTickAt: def.tickEvery ? now + def.tickEvery : now,
      endsAt: nextEndsAt,
      endsAtTurn: nextEndsAt,
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
  switch (stackingMode) {
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
      entry.stacks += stacks;
      entry.potency += potency;
      break;
    default:
      entry.stacks = stacks;
      entry.potency = potency;
      break;
  }
  entry.endsAt = Math.max(entry.endsAt, nextEndsAt);
  entry.endsAtTurn = entry.endsAt;
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

  const temporal = derived.temporal || Object.create(null);
  derived.actionSpeedPct = Number(temporal.actionSpeedPct || derived.actionSpeedPct || 0);
  derived.moveAPDelta = Number(temporal.moveAPDelta || derived.moveAPDelta || 0);
  derived.baseActionAPDelta = Number(
    temporal.baseActionAPDelta || derived.baseActionAPDelta || 0,
  );
  derived.cooldownPct = Number(temporal.cooldownPct || derived.cooldownPct || 0);
  derived.cooldownMult = Number.isFinite(temporal.cooldownMult)
    ? temporal.cooldownMult
    : derived.cooldownMult;
  derived.castTimeDelta = Number(temporal.castTimeDelta || derived.castTimeDelta || 0);
  derived.recoveryPct = Number(temporal.recoveryPct || derived.recoveryPct || 0);
  derived.initBonus = Number(temporal.initBonus || derived.initBonus || 0);
  derived.initiativeFlat = Number(
    temporal.initiativeFlat || derived.initiativeFlat || derived.initBonus || 0,
  );

  derived.resistsPct = derived.resistsPct || Object.create(null);
  derived.resistDelta = derived.resistDelta || Object.create(null);
  for (const key of Object.keys(derived.resistsPct)) {
    const raw = Number(derived.resistsPct[key] || 0);
    const clamped = Math.max(-1, Math.min(1, raw));
    derived.resistsPct[key] = clamped;
    if (Object.prototype.hasOwnProperty.call(derived.resistDelta, key)) {
      const deltaRaw = Number(derived.resistDelta[key] || 0);
      derived.resistDelta[key] = Math.max(-1, Math.min(1, deltaRaw));
    } else {
      derived.resistDelta[key] = clamped;
    }
  }
  for (const key of Object.keys(derived.resistDelta)) {
    const raw = Number(derived.resistDelta[key] || 0);
    derived.resistDelta[key] = Math.max(-1, Math.min(1, raw));
  }

  return derived;
}

export const rebuildStatusDerived = rebuildDerived;
export const rebuildStatusDerivedCore = rebuildDerived;

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
  const buffHint =
    attempt?.isBuff ??
    (attempt?.isHarmful === false ? true : undefined) ??
    (def && def.harmful === false);
  const isBuff = Boolean(buffHint);
  if (isBuff) {
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
  if (typeof defender?.onTurnStart === "function") {
    defender.onTurnStart(defender.turn || 0);
  } else {
    defender.statusDerived = rebuildDerived(defender);
  }
  return applied;
}

export function applyStatus(target, id, stacks = 1, duration = 1, source, turn) {
  if (!target) return [];
  const now = Number.isFinite(turn) ? turn : Number.isFinite(target.turn) ? target.turn : 0;
  target.turn = now;
  const entry = addStatus(target, id, { stacks, potency: stacks, duration, source });
  if (!entry) return [];
  if (typeof target.onTurnStart === "function") {
    target.onTurnStart(target.turn || 0);
  } else {
    target.statusDerived = rebuildDerived(target);
  }
  return [id];
}

export function tryApplyHaste(actor, hasteCfg) {
  if (!actor || !hasteCfg) return null;
  const config = typeof hasteCfg === "number" ? { duration: hasteCfg } : hasteCfg;
  if (!canGrantOnKillHaste(actor, config)) return null;
  const statusId = String(config.statusId || config.status || config.id || "haste");
  const stacksRaw = pickNumber(config.stacks, config.stack, config.amount, config.value);
  const stacks = Number.isFinite(stacksRaw) ? Math.max(1, Math.floor(stacksRaw)) : 1;
  const durationRaw = pickNumber(
    config.duration,
    config.turns,
    config.baseDuration,
    config.time,
    config.length,
  );
  const duration = Number.isFinite(durationRaw) ? Math.max(1, Math.floor(durationRaw)) : 1;
  const potency = pickNumber(config.potency, config.power, config.strength);

  const applied = addStatus(actor, statusId, {
    stacks,
    potency: Number.isFinite(potency) ? potency : undefined,
    duration,
    source: config.source || "onKillHaste",
  });
  if (applied) {
    stampOnKillHasteICD(actor, config);
    return applied;
  }
  return null;
}

export function tickStatusesAtTurnStart(actor, turn) {
  tickStatuses(actor, turn);
  if (!actor) return;
  if (typeof actor.onTurnStart === "function") {
    actor.onTurnStart(turn);
  } else {
    actor.statusDerived = rebuildDerived(actor);
  }
}

export function getStatusDefinition(id) {
  return _registry.get(id) || null;
}

export const getStatusDefinitionCore = getStatusDefinition;

function ensureHasteCtl(actor) {
  if (!actor._onKillHasteCtl || typeof actor._onKillHasteCtl !== "object") {
    actor._onKillHasteCtl = { lastTurn: -Infinity, nextReadyAt: -Infinity };
  }
  return actor._onKillHasteCtl;
}

function canGrantOnKillHaste(actor, cfg) {
  if (!actor || !cfg) return false;
  const nowTurn = Number.isFinite(actor.turn) ? actor.turn : 0;
  const state = ensureHasteCtl(actor);
  if (cfg.oncePerTurn && state.lastTurn === nowTurn) return false;
  if (Number.isFinite(cfg.cooldownTurns)) {
    const cd = Math.max(0, Math.floor(cfg.cooldownTurns));
    if (nowTurn < state.nextReadyAt) return false;
    state.cooldown = cd;
  }
  return true;
}

function stampOnKillHasteICD(actor, cfg) {
  if (!actor || !cfg) return;
  const state = ensureHasteCtl(actor);
  const nowTurn = Number.isFinite(actor.turn) ? actor.turn : 0;
  state.lastTurn = nowTurn;
  if (Number.isFinite(cfg.cooldownTurns)) {
    const cd = Math.max(0, Math.floor(cfg.cooldownTurns));
    state.nextReadyAt = nowTurn + cd;
  }
}

function pickNumber(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return NaN;
}

