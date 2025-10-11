// src/combat/loop.js
// @ts-check
import { rebuildDerived, tickStatusesAtTurnStart } from "./status.js";
import { gainAP, tickCooldowns } from "./time.js";
import { updateResources, isDefeated } from "./resources.js";
import { EVENT, emit } from "../ui/event-log.js";
import { decayPerTurn } from "./attunement.js";
import { logTurnEvt } from "./debug-log.js";

export function startTurn(actor) {
  if (!actor) return;
  decayPerTurn(actor);
  rebuildDerived(actor);
  logTurnEvt(actor, {
    phase: "start_turn",
    actorId: actor.id,
    attunement: actor.attunement,
    turn: actor.turn,
  });
}

export function endTurn(actor) {
  if (!actor) return;
  logTurnEvt(actor, {
    phase: "end_turn",
    actorId: actor.id,
    hp: actor.hp,
    ap: actor.ap,
    turn: actor.turn,
  });
}

/**
 * Runs one turn for an actor.
 * Strategy:
 *  1) Advance turn counter
 *  2) Decay attunements for the new turn
 *  3) Tick statuses (damage over time, expiry) & rebuild status-derived aggregates
 *  4) Rebuild the mod cache so attunement/status effects apply to this turn
 *  5) Apply passive regeneration
 *  6) Gain AP
 *  7) Let controller/AI attempt actions while AP available
 *  8) Tick cooldowns
 *  9) Return defeat flag
 *
 * @param {import("./actor.js").Actor} actor
 * @param {(actor: import("./actor.js").Actor)=>void} [actionPlanner]
 */
export function runTurn(actor, actionPlanner) {
  const turn = actor ? (actor.__turnCounter = (actor.__turnCounter ?? 0) + 1) : 0;
  if (actor) actor.turn = turn;
  startTurn(actor);
  tickStatusesAtTurnStart(actor, turn);
  updateResources(actor);
  gainAP(actor);

  actionPlanner?.(actor);

  tickCooldowns(actor);

  endTurn(actor);

  emit(EVENT.TURN, { who: actor.name, ap: actor.ap, hp: actor.res.hp });

  return isDefeated(actor);
}
