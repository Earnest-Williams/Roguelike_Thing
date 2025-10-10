// src/combat/loop.js
// @ts-check
import { rebuildStatusDerived, tickStatusesAtTurnStart } from "./status.js";
import { gainAP, tickCooldowns } from "./time.js";
import { updateResources, isDefeated } from "./resources.js";
import { EVENT, emit } from "../ui/event-log.js";

/**
 * Runs one turn for an actor.
 * Strategy:
 *  1) Advance turn counter & tick statuses (damage over time, expiry)
 *  2) Rebuild statusDerived (so costs/regen/cooldowns reflect current statuses)
 *  3) Gain AP
 *  4) Let controller/AI attempt actions while AP available
 *  5) Tick cooldowns
 *  6) Regen resources
 *  7) Return defeat flag
 *
 * @param {import("./actor.js").Actor} actor
 * @param {(actor: import("./actor.js").Actor)=>void} [actionPlanner]
 */
export function runTurn(actor, actionPlanner) {
  const turn = actor ? (actor.__turnCounter = (actor.__turnCounter ?? 0) + 1) : 0;
  tickStatusesAtTurnStart(actor, turn);
  rebuildStatusDerived(actor);
  gainAP(actor);

  actionPlanner?.(actor);

  tickCooldowns(actor);
  updateResources(actor);

  emit(EVENT.TURN, { who: actor.name, ap: actor.ap, hp: actor.res.hp });

  return isDefeated(actor);
}
