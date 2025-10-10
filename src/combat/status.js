// src/combat/status.js
// @ts-check

import {
  BURN_MAX_STACKS,
  DEFAULT_STATUS_DURATION_TURNS,
  DEFAULT_STATUS_STACKS,
  HASTE_MAX_STACKS,
  STATUS_TICK_DELTA_TURNS,
} from "../../constants.js";

const RESOURCE_KEYS = ["hp", "stamina", "mana"]; // used for regen aggregation

/**
 * @typedef {Object} StatusDerived
 * @property {boolean} canAct
 * @property {number} moveAPDelta
 * @property {number} actionSpeedPct
 * @property {number} cooldownMult
 * @property {number} accuracyFlat
 * @property {number} critChancePct
 * @property {Record<string, number>} damageDealtMult
 * @property {Record<string, number>} damageTakenMult
 * @property {Record<string, number>} resistDelta
 * @property {Record<string, number>} regen
 */

/**
 * Lightweight status registry with stacking and ticking.
 * Extend handlers as needed.
 */

/**
 * @typedef {"refresh"|"add_stacks"|"independent"} StackingRule
 */

/**
 * @typedef {Object} StatusDef
 * @property {string} id
 * @property {StackingRule} stacking
 * @property {number} maxStacks
 * @property {(actor: import("./actor.js").Actor, inst: import("./actor.js").StatusInstance)=>void} [onApply]
 * @property {(actor: import("./actor.js").Actor, inst: import("./actor.js").StatusInstance, turn: number)=>void} [onTick]  // per turn
 * @property {(actor: import("./actor.js").Actor, inst: import("./actor.js").StatusInstance, turn: number)=>void} [onExpire]
 * @property {(ctx: { actor: import("./actor.js").Actor, inst: import("./actor.js").StatusInstance }) => Partial<StatusDerived>|null|undefined} [derive]
 */

/** @type {Map<string, StatusDef>} */
const REG = new Map();

/**
 * @param {StatusDef} def
 */
export function defineStatus(def) {
  REG.set(def.id, def);
}

/**
 * @param {string} id
 */
export function getStatusDef(id) {
  return REG.get(id) || null;
}

function createEmptyDamageTypeMap() {
  return Object.create(null);
}

function createEmptyRegenMap() {
  /** @type {Record<string, number>} */
  const regen = Object.create(null);
  for (const key of RESOURCE_KEYS) regen[key] = 0;
  return regen;
}

/**
 * @returns {StatusDerived}
 */
export function createEmptyStatusDerived() {
  return {
    canAct: true,
    moveAPDelta: 0,
    actionSpeedPct: 0,
    cooldownMult: 1,
    accuracyFlat: 0,
    critChancePct: 0,
    damageDealtMult: createEmptyDamageTypeMap(),
    damageTakenMult: createEmptyDamageTypeMap(),
    resistDelta: createEmptyDamageTypeMap(),
    regen: createEmptyRegenMap(),
  };
}

/**
 * Aggregates derive() modifiers from all current statuses.
 * @param {import("./actor.js").Actor} actor
 */
export function rebuildStatusDerived(actor) {
  if (!actor) return createEmptyStatusDerived();

  const agg = createEmptyStatusDerived();
  if (!Array.isArray(actor.statuses)) {
    actor.statuses = [];
  }

  for (const inst of actor.statuses) {
    if (!inst) continue;
    const def = getStatusDef(inst.id);
    if (!def || typeof def.derive !== "function") continue;
    const derived = def.derive({ actor, inst });
    if (!derived) continue;

    if (typeof derived.canAct === "boolean") {
      agg.canAct = agg.canAct && derived.canAct;
    }
    if (typeof derived.moveAPDelta === "number" && Number.isFinite(derived.moveAPDelta)) {
      agg.moveAPDelta += derived.moveAPDelta;
    }
    if (typeof derived.actionSpeedPct === "number" && Number.isFinite(derived.actionSpeedPct)) {
      agg.actionSpeedPct += derived.actionSpeedPct;
    }
    if (typeof derived.cooldownMult === "number" && Number.isFinite(derived.cooldownMult)) {
      const mult = derived.cooldownMult;
      if (mult <= 0) {
        console.warn(
          `[Status] Invalid cooldown multiplier (${mult}) from status '${inst.id}'. Must be positive. Ignoring value.`
        );
      } else {
        agg.cooldownMult *= mult;
      }
    }
    if (typeof derived.accuracyFlat === "number" && Number.isFinite(derived.accuracyFlat)) {
      agg.accuracyFlat += derived.accuracyFlat;
    }
    if (typeof derived.critChancePct === "number" && Number.isFinite(derived.critChancePct)) {
      agg.critChancePct += derived.critChancePct;
    }
    if (derived.damageDealtMult) {
      for (const [type, value] of Object.entries(derived.damageDealtMult)) {
        const num = Number(value);
        if (!Number.isFinite(num)) continue;
        agg.damageDealtMult[type] = (agg.damageDealtMult[type] ?? 0) + num;
      }
    }
    if (derived.damageTakenMult) {
      for (const [type, value] of Object.entries(derived.damageTakenMult)) {
        const num = Number(value);
        if (!Number.isFinite(num)) continue;
        agg.damageTakenMult[type] = (agg.damageTakenMult[type] ?? 0) + num;
      }
    }
    if (derived.resistDelta) {
      for (const [type, value] of Object.entries(derived.resistDelta)) {
        const num = Number(value);
        if (!Number.isFinite(num)) continue;
        agg.resistDelta[type] = (agg.resistDelta[type] ?? 0) + num;
      }
    }
    if (derived.regen) {
      for (const key of RESOURCE_KEYS) {
        const delta = Number(derived.regen[key]);
        if (!Number.isFinite(delta) || delta === 0) continue;
        agg.regen[key] = (agg.regen[key] ?? 0) + delta;
      }
    }
  }

  actor.statusDerived = agg;
  return agg;
}

/**
 * @param {import("./actor.js").Actor} actor
 * @param {string} id
 * @param {number} durationTurns
 * @param {number} stacks
 * @param {any} [payload]
 */
export function applyStatus(
  actor,
  id,
  durationTurns = DEFAULT_STATUS_DURATION_TURNS,
  stacks = DEFAULT_STATUS_STACKS,
  payload = null,
) {
  const def = getStatusDef(id);
  if (!def) return;

  const existing = actor.statuses.filter(s => s.id === id);
  if (def.stacking === "refresh") {
    if (existing.length) {
      const e = existing[0];
      e.stacks = Math.min(def.maxStacks, Math.max(1, stacks));
      e.remaining = durationTurns;
      def.onApply?.(actor, e);
      rebuildStatusDerived(actor);
      return;
    }
  } else if (def.stacking === "add_stacks") {
    if (existing.length) {
      const e = existing[0];
      e.stacks = Math.min(def.maxStacks, e.stacks + stacks);
      e.remaining = Math.max(e.remaining, durationTurns);
      def.onApply?.(actor, e);
      rebuildStatusDerived(actor);
      return;
    }
  }
  // independent or none existing
  const inst = { id, stacks: Math.max(1, Math.min(def.maxStacks, stacks)), remaining: durationTurns, payload };
  actor.statuses.push(inst);
  def.onApply?.(actor, inst);
  rebuildStatusDerived(actor);
}

/**
 * Ticks all statuses by 1 turn (or pass dtTurns)
 * @param {import("./actor.js").Actor} actor
 * @param {number} [turn]
 */
export function tickStatuses(actor, turn = STATUS_TICK_DELTA_TURNS) {
  if (!actor) return;
  if (!Array.isArray(actor.statuses)) {
    actor.statuses = [];
  }

  const dtTurns = STATUS_TICK_DELTA_TURNS;
  /** @type {import("./actor.js").StatusInstance[]} */
  const keep = [];

  for (const inst of actor.statuses) {
    const def = getStatusDef(inst.id);
    if (!def) continue;

    if (typeof def.onTick === "function") {
      def.onTick(actor, inst, turn);
    }

    inst.remaining -= dtTurns;
    if (inst.remaining > 0) {
      keep.push(inst);
      continue;
    }

    def.onExpire?.(actor, inst, turn);
  }

  actor.statuses = keep;
  rebuildStatusDerived(actor);
}

/**
 * Applies passive regeneration and clamps resources.
 * Also maintains channeling state (breaks on movement/interruption).
 * @param {import("./actor.js").Actor} actor
 */
export function updateResources(actor) {
  if (!actor) return;

  if (!actor.res) {
    actor.res = { hp: 0, stamina: 0, mana: 0 };
  }

  const regenSources = [];
  if (actor.regen) regenSources.push(actor.regen);
  if (actor.statusDerived?.regen) regenSources.push(actor.statusDerived.regen);

  for (const key of RESOURCE_KEYS) {
    let delta = 0;
    for (const source of regenSources) {
      if (!source) continue;
      const value = Number(source[key]);
      if (!Number.isFinite(value)) continue;
      delta += value;
    }
    if (delta !== 0) {
      actor.res[key] = (actor.res[key] ?? 0) + delta;
    }
  }

  if (!actor.base) {
    throw new Error("actor.base is undefined in updateResources; cannot determine resource maximums.");
  }
  const maxMap = {
    hp: actor.base.maxHP,
    stamina: actor.base.maxStamina,
    mana: actor.base.maxMana,
  };

  for (const key of RESOURCE_KEYS) {
    const max = Number(maxMap[key]);
    if (Number.isFinite(max)) {
      actor.res[key] = Math.min(max, actor.res[key] ?? 0);
    }
    actor.res[key] = Math.max(0, actor.res[key] ?? 0);
  }

  const channel = actor.channeling;
  if (channel) {
    const interrupted = channel.breakOnMove && channel.moved;
    if (interrupted) {
      if (channel.statusId) {
        const idx = actor.statuses?.findIndex((s) => s.id === channel.statusId) ?? -1;
        if (idx >= 0 && actor.statuses) {
          const [inst] = actor.statuses.splice(idx, 1);
          const def = inst ? getStatusDef(inst.id) : null;
          def?.onExpire?.(actor, inst, channel.turn ?? 0);
        }
        rebuildStatusDerived(actor);
      }
      channel.onBreak?.(actor);
      actor.channeling = null;
    } else if (channel.breakOnMove) {
      channel.moved = false;
    }
  }
}

/**
 * Computes the action AP cost after status-based speed modifiers.
 * @param {import("./actor.js").Actor} actor
 * @param {number} baseAP
 */
export function computeActionAP(actor, baseAP) {
  const pct = actor?.statusDerived?.actionSpeedPct ?? 0;
  const cost = baseAP * (1 + pct);
  return Number.isFinite(cost) && cost > 0 ? Math.max(1, cost) : 1;
}

/**
 * Scales a cooldown using the cumulative cooldown multiplier.
 * @param {import("./actor.js").Actor} actor
 * @param {number} baseCooldown
 */
export function scaleCooldown(actor, baseCooldown) {
  const mult = actor?.statusDerived?.cooldownMult ?? 1;
  const scaled = baseCooldown * mult;
  return Number.isFinite(scaled) && scaled >= 0 ? scaled : 0;
}

// ---- Example stock statuses (you can move these elsewhere) ----
defineStatus({
  id: "burn",
  stacking: "add_stacks",
  maxStacks: BURN_MAX_STACKS,
  onTick(actor, inst) {
    // Each stack pings 1 damage per turn (demo). Gate by hp floor.
    actor.res.hp = Math.max(0, actor.res.hp - inst.stacks);
  },
  derive: ({ inst }) => {
    const stacks = inst?.stacks ?? 1;
    return {
      damageTakenMult: { fire: 0.1 * stacks },
    };
  },
});

defineStatus({
  id: "haste",
  stacking: "refresh",
  maxStacks: HASTE_MAX_STACKS,
  onApply(actor) {
    // Instead of mutating modCache directly, trigger a refold of all modifiers including status effects.
    actor.refoldModifiers?.();
  },
  onExpire(actor) {
    actor.refoldModifiers?.();
  },
  derive: ({ inst }) => {
    const stacks = inst?.stacks ?? 1;
    return { actionSpeedPct: -0.15 * stacks, cooldownMult: 0.9 };
  },
});
