// src/combat/loop.js
// @ts-check
import { rebuildStatusDerived, tickStatusesAtTurnStart } from "./status.js";
import { gainAP, tickCooldowns } from "./time.js";
import { updateResources, isDefeated } from "./resources.js";
import { EVENT, emit } from "../ui/event-log.js";
import { ATTUNE } from "../config.js";

export function decayAttunementsAtTurnStart(actor, turn) {
  if (!actor || actor.attune?.lastTurnUpdated === turn) return;

  const attune = actor.attune;
  if (!attune) return;

  const { pool } = attune;
  if (!pool) return;

  for (const key of Object.keys(pool)) {
    const next = Math.max(0, Math.min(ATTUNE.cap, pool[key] - ATTUNE.decayPerTurn));
    if (next === 0) {
      delete pool[key];
    } else {
      pool[key] = next;
    }
  }

  attune.lastTurnUpdated = turn;
}

/**
 * Runs one turn for an actor.
 * Strategy:
 *  1) Advance turn counter & tick statuses (damage over time, expiry)
 *  2) Rebuild statusDerived (so costs/regen/cooldowns reflect current statuses)
 *  3) Apply passive regeneration
 *  4) Gain AP
 *  5) Let controller/AI attempt actions while AP available
 *  6) Tick cooldowns
 *  7) Return defeat flag
 *
 * @param {import("./actor.js").Actor} actor
 * @param {(actor: import("./actor.js").Actor)=>void} [actionPlanner]
 */
export function runTurn(actor, actionPlanner) {
  const turn = actor ? (actor.__turnCounter = (actor.__turnCounter ?? 0) + 1) : 0;
  if (actor) actor.turn = turn;
  tickStatusesAtTurnStart(actor, turn);
  rebuildStatusDerived(actor);
  updateResources(actor);
  decayAttunementsAtTurnStart(actor, turn);
  gainAP(actor);

  actionPlanner?.(actor);

  tickCooldowns(actor);

  emit(EVENT.TURN, { who: actor.name, ap: actor.ap, hp: actor.res.hp });

  return isDefeated(actor);
}
