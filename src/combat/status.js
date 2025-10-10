// src/combat/status.js
// @ts-check

import {
  ADRENALINE_ACTION_COST_MULTIPLIER,
  ADRENALINE_COOLDOWN_MULTIPLIER,
  ADRENALINE_MAX_STACKS,
  ADRENALINE_STAMINA_REGEN_PER_TURN,
  BURN_MAX_STACKS,
  BURN_TICK_DAMAGE_PER_STACK,
  CHILLED_FACTOR_PER_STACK,
  CHILLED_MAX_STACKS,
  DEFAULT_ACTION_COST_MULTIPLIER,
  DEFAULT_COOLDOWN_MULTIPLIER,
  DEFAULT_MOVE_COST_MULTIPLIER,
  DEFAULT_REGEN_HP_PER_TURN,
  DEFAULT_REGEN_MANA_PER_TURN,
  DEFAULT_REGEN_STAMINA_PER_TURN,
  DEFAULT_STATUS_DURATION_TURNS,
  DEFAULT_STATUS_STACKS,
  EXHAUSTED_ACTION_COST_MULTIPLIER,
  EXHAUSTED_MAX_STACKS,
  EXHAUSTED_STAMINA_REGEN_PER_TURN,
  FATIGUE_ACTION_COST_MULTIPLIER_PER_STACK,
  FATIGUE_MAX_STACKS,
  HASTE_COOLDOWN_MULTIPLIER,
  HASTE_MAX_STACKS,
  HASTE_SPEED_MULTIPLIER_PER_STACK,
  HEALTH_FLOOR,
  MIN_STATUS_STACKS,
  REGENERATION_HP_PER_TURN,
  REGENERATION_MAX_STACKS,
  STATUS_TICK_DELTA_TURNS,
} from "../../constants.js";
import { EVENT, emit } from "../ui/event-log.js";

/**
 * Proxy bridge so browser/runtime specific status application logic can live
 * outside of the shared combat module. The resolver will call through this
 * export which, by default, delegates to an implementation registered on the
 * global object (set by index.html). If no implementation is registered we
 * gracefully return an empty list.
 *
 * @param {{statusAttempts?: any[]}|null} ctx
 * @param {any} S
 * @param {any} D
 * @param {number} turn
 * @returns {any[]}
 */
export function applyStatuses(ctx, S, D, turn) {
  if (typeof globalThis !== "undefined") {
    const impl = globalThis.__applyStatusesImpl;
    if (typeof impl === "function") {
      return impl(ctx, S, D, turn);
    }
  }
  return [];
}

/**
 * @typedef {Object} StatusDerived
 * @property {number} moveCostMult
 * @property {number} actionCostMult
 * @property {number} cooldownMult
 * @property {{hp:number, stamina:number, mana:number}} regen
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
 * @property {(actor: import("./actor.js").Actor, inst: import("./actor.js").StatusInstance)=>void} [derive]
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

/**
 * @returns {StatusDerived}
 */
export function createEmptyStatusDerived() {
  return {
    moveCostMult: DEFAULT_MOVE_COST_MULTIPLIER,
    actionCostMult: DEFAULT_ACTION_COST_MULTIPLIER,
    cooldownMult: DEFAULT_COOLDOWN_MULTIPLIER,
    regen: {
      hp: DEFAULT_REGEN_HP_PER_TURN,
      stamina: DEFAULT_REGEN_STAMINA_PER_TURN,
      mana: DEFAULT_REGEN_MANA_PER_TURN,
    },
  };
}

/**
 * Aggregates derive() modifiers from all current statuses.
 * @param {import("./actor.js").Actor} actor
 */
export function rebuildStatusDerived(actor) {
  if (!actor) return createEmptyStatusDerived();

  const agg = createEmptyStatusDerived();
  actor.statusDerived = agg;
  if (!Array.isArray(actor.statuses)) {
    actor.statuses = [];
  }

  for (const inst of actor.statuses) {
    if (!inst) continue;
    const def = getStatusDef(inst.id);
    if (!def || typeof def.derive !== "function") continue;

    // Each derive function should mutate actor.statusDerived (agg) in place to accumulate its effect.
    def.derive(actor, inst);
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

  const normalizedStacks = Math.max(MIN_STATUS_STACKS, stacks);
  const existing = actor.statuses.filter(s => s.id === id);
  if (def.stacking === "refresh") {
    if (existing.length) {
      const e = existing[0];
      e.stacks = Math.min(def.maxStacks, normalizedStacks);
      e.remaining = durationTurns;
      def.onApply?.(actor, e);
      rebuildStatusDerived(actor);
      emit(EVENT.STATUS, {
        who: actor.name,
        id,
        stacks: e.stacks,
        action: "apply",
      });
      return;
    }
  } else if (def.stacking === "add_stacks") {
    if (existing.length) {
      const e = existing[0];
      e.stacks = Math.min(def.maxStacks, e.stacks + normalizedStacks);
      e.remaining = Math.max(e.remaining, durationTurns);
      def.onApply?.(actor, e);
      rebuildStatusDerived(actor);
      emit(EVENT.STATUS, {
        who: actor.name,
        id,
        stacks: e.stacks,
        action: "apply",
      });
      return;
    }
  }
  // independent or none existing
  const inst = {
    id,
    stacks: Math.min(def.maxStacks, normalizedStacks),
    remaining: durationTurns,
    payload,
  };
  actor.statuses.push(inst);
  def.onApply?.(actor, inst);
  rebuildStatusDerived(actor);
  emit(EVENT.STATUS, { who: actor.name, id, stacks: inst.stacks, action: "apply" });
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

    emit(EVENT.STATUS, { who: actor.name, id: inst.id, action: "expire" });
    def.onExpire?.(actor, inst, turn);
  }

  actor.statuses = keep;
  rebuildStatusDerived(actor);
}

// ---- Example stock statuses (you can move these elsewhere) ----
defineStatus({
  id: "burn",
  stacking: "add_stacks",
  maxStacks: BURN_MAX_STACKS,
  onTick(actor, inst) {
    // Each stack pings 1 damage per turn (demo). Gate by hp floor.
    actor.res.hp = Math.max(
      HEALTH_FLOOR,
      actor.res.hp - inst.stacks * BURN_TICK_DAMAGE_PER_STACK,
    );
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
  derive(actor, inst) {
    const stacks = Math.max(MIN_STATUS_STACKS, inst?.stacks ?? MIN_STATUS_STACKS);
    const speedMult = Math.pow(HASTE_SPEED_MULTIPLIER_PER_STACK, stacks);
    actor.statusDerived.actionCostMult *= speedMult;
    actor.statusDerived.cooldownMult *= HASTE_COOLDOWN_MULTIPLIER;
  },
});

defineStatus({
  id: "fatigue",
  stacking: "add_stacks",
  maxStacks: FATIGUE_MAX_STACKS,
  derive(actor, inst) {
    const stacks = Math.max(0, inst?.stacks ?? 0);
    actor.statusDerived.actionCostMult *= Math.pow(
      FATIGUE_ACTION_COST_MULTIPLIER_PER_STACK,
      stacks,
    );
  },
});

defineStatus({
  id: "chilled",
  stacking: "add_stacks",
  maxStacks: CHILLED_MAX_STACKS,
  derive(actor, inst) {
    const stacks = Math.max(0, inst?.stacks ?? 0);
    const factor = Math.pow(CHILLED_FACTOR_PER_STACK, stacks);
    actor.statusDerived.actionCostMult *= factor;
    actor.statusDerived.cooldownMult *= factor;
  },
});

defineStatus({
  id: "regeneration",
  stacking: "refresh",
  maxStacks: REGENERATION_MAX_STACKS,
  derive(actor) {
    actor.statusDerived.regen.hp += REGENERATION_HP_PER_TURN;
  },
});

defineStatus({
  id: "adrenaline",
  stacking: "refresh",
  maxStacks: ADRENALINE_MAX_STACKS,
  derive(actor) {
    actor.statusDerived.actionCostMult *= ADRENALINE_ACTION_COST_MULTIPLIER;
    actor.statusDerived.cooldownMult *= ADRENALINE_COOLDOWN_MULTIPLIER;
    actor.statusDerived.regen.stamina += ADRENALINE_STAMINA_REGEN_PER_TURN;
  },
});

defineStatus({
  id: "exhausted",
  stacking: "refresh",
  maxStacks: EXHAUSTED_MAX_STACKS,
  derive(actor) {
    actor.statusDerived.actionCostMult *= EXHAUSTED_ACTION_COST_MULTIPLIER;
    actor.statusDerived.regen.stamina += EXHAUSTED_STAMINA_REGEN_PER_TURN;
  },
});
