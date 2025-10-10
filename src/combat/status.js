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
 * @property {(actor: import("./actor.js").Actor, inst: import("./actor.js").StatusInstance)=>void} [onTick]  // per turn
 * @property {(actor: import("./actor.js").Actor, inst: import("./actor.js").StatusInstance)=>void} [onExpire]
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
      return;
    }
  } else if (def.stacking === "add_stacks") {
    if (existing.length) {
      const e = existing[0];
      e.stacks = Math.min(def.maxStacks, e.stacks + stacks);
      e.remaining = Math.max(e.remaining, durationTurns);
      def.onApply?.(actor, e);
      return;
    }
  }
  // independent or none existing
  const inst = { id, stacks: Math.max(1, Math.min(def.maxStacks, stacks)), remaining: durationTurns, payload };
  actor.statuses.push(inst);
  def.onApply?.(actor, inst);
}

/**
 * Ticks all statuses by 1 turn (or pass dtTurns)
 * @param {import("./actor.js").Actor} actor
 * @param {number} [dtTurns]
 */
export function tickStatuses(actor, dtTurns = STATUS_TICK_DELTA_TURNS) {
  for (const s of actor.statuses) {
    const def = getStatusDef(s.id);
    if (!def) continue;
    def.onTick?.(actor, s);
    s.remaining -= dtTurns;
  }
  // expire
  const keep = [];
  for (const s of actor.statuses) {
    if (s.remaining > 0) {
      keep.push(s);
    } else {
      const def = getStatusDef(s.id);
      def?.onExpire?.(actor, s);
    }
  }
  actor.statuses = keep;
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
});
