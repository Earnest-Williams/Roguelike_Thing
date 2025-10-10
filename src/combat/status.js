// src/combat/status.js
// @ts-check

import {
  BURN_MAX_STACKS,
  DEFAULT_STATUS_DURATION_TURNS,
  DEFAULT_STATUS_STACKS,
  HASTE_MAX_STACKS,
  STATUS_TICK_DELTA_TURNS,
} from "../../constants.js";

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
    moveCostMult: 1.0,
    actionCostMult: 1.0,
    cooldownMult: 1.0,
    regen: { hp: 0, stamina: 0, mana: 0 },
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

    const before = actor.statusDerived;
    def.derive(actor, inst);
    const after = actor.statusDerived || agg;

    if (after !== agg) {
      agg.moveCostMult = Number.isFinite(after.moveCostMult) ? after.moveCostMult : agg.moveCostMult;
      agg.actionCostMult = Number.isFinite(after.actionCostMult) ? after.actionCostMult : agg.actionCostMult;
      agg.cooldownMult = Number.isFinite(after.cooldownMult) ? after.cooldownMult : agg.cooldownMult;
      if (after.regen) {
        agg.regen = {
          hp: Number.isFinite(after.regen.hp) ? after.regen.hp : agg.regen.hp,
          stamina: Number.isFinite(after.regen.stamina) ? after.regen.stamina : agg.regen.stamina,
          mana: Number.isFinite(after.regen.mana) ? after.regen.mana : agg.regen.mana,
        };
      }
      actor.statusDerived = agg;
    } else if (before !== after) {
      actor.statusDerived = agg;
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

// ---- Example stock statuses (you can move these elsewhere) ----
defineStatus({
  id: "burn",
  stacking: "add_stacks",
  maxStacks: BURN_MAX_STACKS,
  onTick(actor, inst) {
    // Each stack pings 1 damage per turn (demo). Gate by hp floor.
    actor.res.hp = Math.max(0, actor.res.hp - inst.stacks);
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
    const stacks = Math.max(1, inst?.stacks ?? 1);
    const speedMult = Math.pow(0.85, stacks);
    actor.statusDerived.actionCostMult *= speedMult;
    actor.statusDerived.cooldownMult *= 0.9;
  },
});

defineStatus({
  id: "fatigue",
  stacking: "add_stacks",
  maxStacks: 5,
  derive(actor, inst) {
    const stacks = Math.max(0, inst?.stacks ?? 0);
    actor.statusDerived.actionCostMult *= Math.pow(1.05, stacks);
  },
});

defineStatus({
  id: "chilled",
  stacking: "add_stacks",
  maxStacks: 3,
  derive(actor, inst) {
    const stacks = Math.max(0, inst?.stacks ?? 0);
    const factor = Math.pow(1.1, stacks);
    actor.statusDerived.actionCostMult *= factor;
    actor.statusDerived.cooldownMult *= factor;
  },
});

defineStatus({
  id: "regeneration",
  stacking: "refresh",
  maxStacks: 1,
  derive(actor) {
    actor.statusDerived.regen.hp += 1;
  },
});

defineStatus({
  id: "adrenaline",
  stacking: "refresh",
  maxStacks: 1,
  derive(actor) {
    actor.statusDerived.actionCostMult *= 0.85;
    actor.statusDerived.cooldownMult *= 0.85;
    actor.statusDerived.regen.stamina += 1;
  },
});

defineStatus({
  id: "exhausted",
  stacking: "refresh",
  maxStacks: 1,
  derive(actor) {
    actor.statusDerived.actionCostMult *= 1.25;
    actor.statusDerived.regen.stamina -= 1;
  },
});
