// src/combat/loop.js
// @ts-check
import {
  applyOneStatusAttempt,
  hasStatus,
  rebuildDerived,
  removeStatusById,
  tickStatusesAtTurnStart,
} from "./status.js";
import { gainAP, tickCooldowns, initiativeWithTemporal } from "./time.js";
import { tickResources, isDefeated } from "./resources.js";
import { tickAttunements } from "./attunement.js";
import { EVENT, emit, emitAsync } from "../ui/event-log.js";
import { logTurnEvt } from "./debug-log.js";
import { tickFreeAction } from "./actor.js";

/**
 * Prepare an actor for the upcoming turn by refreshing derived state and
 * running maintenance hooks. This includes ticking statuses, resources, and
 * bookkeeping flags so planners have consistent data before acting.
 *
 * @param {import("./actor.js").Actor | null | undefined} actor
 */
export function startTurn(actor) {
  if (!actor) return;
  tickFreeAction(actor);
  actor.__turnCounter = (actor.__turnCounter ?? 0) + 1;
  actor.turn = actor.__turnCounter;
  if (!actor.turnFlags || typeof actor.turnFlags !== "object") {
    actor.turnFlags = { moved: false, attacked: false, channeled: false };
  }
  tickAttunements(actor);
  const actedLastTurn = Boolean(actor._prevTurnDidMove || actor._prevTurnDidAttack);
  const canChannel = Boolean(actor.modCache?.resource?.channeling);
  if ((actedLastTurn || !canChannel) && hasStatus(actor, "channeling")) {
    removeStatusById(actor, "channeling");
  }
  actor._turnDidMove = false;
  actor._turnDidAttack = false;
  actor._didActionThisTurn = false;
  tickStatusesAtTurnStart(actor, actor.turn);
  tickResources(actor);
  logTurnEvt(actor, {
    phase: "start_turn",
    actorId: actor.id,
    attunement: actor.attunement,
    turn: actor.turn,
  });
}

/**
 * Finalize a turn after actions have been attempted. Handles channeling state,
 * updates resource caches, and records high-level flags for next turn logic.
 *
 * @param {import("./actor.js").Actor | null | undefined} actor
 */
export function endTurn(actor) {
  if (!actor) return;
  if (!actor.turnFlags || typeof actor.turnFlags !== "object") {
    actor.turnFlags = { moved: false, attacked: false, channeled: false };
  }
  const resBucket = actor.modCache?.resource || Object.create(null);
  const idle = !actor._turnDidMove && !actor._turnDidAttack;
  actor._didActionThisTurn = !idle;
  const flags = actor.turnFlags;
  flags.channeled = Boolean(idle);
  flags.moved = false;
  flags.attacked = false;

  if (idle) {
    resBucket.channeling = true;
    const result = applyOneStatusAttempt({
      attacker: actor,
      defender: actor,
      attempt: { id: "channeling", stacks: 1, duration: 1 },
      turn: actor.turn,
    });
    if (result && !result.ignored) {
      actor.statusDerived = rebuildDerived(actor);
    }
  } else {
    resBucket.channeling = false;
    if (hasStatus(actor, "channeling")) {
      removeStatusById(actor, "channeling");
      actor.statusDerived = rebuildDerived(actor);
    }
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
function isPromiseLike(value) {
  return !!(value && typeof value === "object" && typeof value.then === "function");
}

function runTurnCore(actor, actionPlanner) {
  startTurn(actor);
  if (actor) {
    actor.resources ||= { pools: Object.create(null) };
    actor.resources.pools ||= Object.create(null);
  }
  if (actor?.turnFlags && typeof actor.turnFlags === "object") {
    actor.turnFlags.channeled = false;
  }
  gainAP(actor);

  const plannerResult = typeof actionPlanner === "function" ? actionPlanner(actor) : null;
  return plannerResult;
}

function finalizeTurn(actor) {
  tickCooldowns(actor);
  endTurn(actor);
}

export function runTurn(actor, actionPlanner) {
  const plannerResult = runTurnCore(actor, actionPlanner);
  if (isPromiseLike(plannerResult)) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn(
        "runTurn received an async planner; prefer runTurnAsync to await the result.",
      );
    }
    plannerResult.catch((err) => {
      if (typeof console !== "undefined" && console.error) {
        console.error("async actionPlanner rejected", err);
      }
    });
  }

  finalizeTurn(actor);

  emit(EVENT.TURN, { who: actor.name, ap: actor.ap, hp: actor.res.hp });

  return isDefeated(actor);
}

export async function runTurnAsync(actor, actionPlanner) {
  const plannerResult = runTurnCore(actor, actionPlanner);
  await plannerResult;

  finalizeTurn(actor);

  await emitAsync(EVENT.TURN, { who: actor.name, ap: actor.ap, hp: actor.res.hp });

  return isDefeated(actor);
}

/**
 * Roll initiative for a new combat round by sampling each actor's initiative
 * die and storing the result on the actor. Consumers can then sort by the
 * `initRoll` value to build the timeline for the round.
 *
 * @param {Array<import("./actor.js").Actor | null | undefined>} actors
 * @param {() => number} [rng]
 */
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
