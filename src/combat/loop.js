// src/combat/loop.js
// @ts-check
import { rebuildStatusDerived, tickStatuses } from "./status.js";
import { gainAP, tickCooldowns } from "./time.js";
import { updateResources, isDefeated } from "./resources.js";
import { EVENT, emit } from "../ui/event-log.js";

/**
 * Runs one turn for an actor.
 * Strategy:
 *  1) Rebuild statusDerived (so costs/regen/cooldowns reflect current statuses)
 *  2) Gain AP
 *  3) Let controller/AI attempt actions while AP available
 *  4) Tick cooldowns
 *  5) Tick statuses (damage over time, timers)
 *  6) Regen resources
 *  7) Return defeat flag
 *
 * @param {import("./actor.js").Actor} actor
 * @param {(actor: import("./actor.js").Actor)=>void} [actionPlanner]
 */
export function runTurn(actor, actionPlanner) {
  rebuildStatusDerived(actor);
  gainAP(actor);

  actionPlanner?.(actor);

  tickCooldowns(actor);
  tickStatuses(actor);
  updateResources(actor);

  emit(EVENT.TURN, { who: actor.name, ap: actor.ap, hp: actor.res.hp });

  return isDefeated(actor);
}
