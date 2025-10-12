// src/combat/loop.js
// @ts-check
import { addStatus, hasStatus, rebuildDerived, removeStatusById, tickStatuses } from "./status.js";
import { gainAP, tickCooldowns, initiativeWithTemporal } from "./time.js";
import { updateResources, isDefeated, regenTurn } from "./resources.js";
import { tickAttunements } from "./attunement.js";
import { EVENT, emit } from "../ui/event-log.js";
import { logTurnEvt } from "./debug-log.js";
import { tickFreeAction } from "./actor.js";

export function startTurn(actor) {
  if (!actor) return;
  tickFreeAction(actor);
  if (!actor.turnFlags || typeof actor.turnFlags !== "object") {
    actor.turnFlags = { moved: false, attacked: false, channeled: false };
  }
  tickAttunements(actor);
  const actedLastTurn = Boolean(actor._prevTurnDidMove || actor._prevTurnDidAttack);
  const hasChannelingStatus = hasStatus(actor, "channeling");
  const canChannel = Boolean(actor.modCache?.resource?.channeling);
  if ((actedLastTurn || !canChannel) && hasChannelingStatus) {
    removeStatusById(actor, "channeling");
  }
  actor._turnDidMove = false;
  actor._turnDidAttack = false;
  tickStatuses(actor, actor.turn || 0);
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
  if (!actor.turnFlags || typeof actor.turnFlags !== "object") {
    actor.turnFlags = { moved: false, attacked: false, channeled: false };
  }
  const canChannelNow = Boolean(actor.modCache?.resource?.channeling);
  const idle = !actor._turnDidMove && !actor._turnDidAttack;
  const flags = actor.turnFlags;
  flags.channeled = Boolean(canChannelNow && idle);
  flags.moved = false;
  flags.attacked = false;
  if (idle && canChannelNow) {
    addStatus(actor, "channeling", { duration: 1, potency: 1 });
  }
  actor._prevTurnDidMove = Boolean(actor._turnDidMove);
  actor._prevTurnDidAttack = Boolean(actor._turnDidAttack);
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
 *  2) Run start-of-turn hooks (free action, attunement decay, status ticks, derived rebuild)
 *  3) Refresh resources for the new turn
 *  4) Apply passive regeneration
 *  5) Gain AP
 *  6) Let controller/AI attempt actions while AP available
 *  7) Tick cooldowns
 *  8) Return defeat flag
 *
 * @param {import("./actor.js").Actor} actor
 * @param {(actor: import("./actor.js").Actor)=>void} [actionPlanner]
 */
export function runTurn(actor, actionPlanner) {
  const turn = actor ? (actor.__turnCounter = (actor.__turnCounter ?? 0) + 1) : 0;
  if (actor) actor.turn = turn;
  startTurn(actor);
  if (actor) {
    actor.resources ||= { pools: Object.create(null) };
    actor.resources.pools ||= Object.create(null);
  }
  updateResources(actor);
  regenTurn(actor);
  if (actor?.turnFlags && typeof actor.turnFlags === "object") {
    actor.turnFlags.channeled = false;
  }
  gainAP(actor);

  actionPlanner?.(actor);

  tickCooldowns(actor);

  endTurn(actor);

  emit(EVENT.TURN, { who: actor.name, ap: actor.ap, hp: actor.res.hp });

  return isDefeated(actor);
}

export function onNewRound(actors, rng = Math.random) {
  if (!Array.isArray(actors)) return;
  for (const actor of actors) {
    if (!actor) continue;
    const baseInit = Number(actor.baseInitiative || actor.init || 0);
    const roll = typeof rng === "function" ? rng() : Math.random();
    const die = Math.floor(roll * 20) + 1;
    actor.initRoll = initiativeWithTemporal(actor, baseInit) + die;
  }
}
