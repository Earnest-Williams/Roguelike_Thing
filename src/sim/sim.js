// src/sim/sim.js
// @ts-check
import { createActorFromTemplate, ensureItemsRegistered } from "../factories/index.js";
import { runTurn, runTurnAsync } from "../combat/loop.js";
import { planTurn } from "../combat/ai-planner.js";
import { executeDecision } from "../combat/actions.js";
import {
  SIM_DEFAULT_RUN_COUNT,
  SIM_DEFAULT_SEED,
  SIM_MAX_TURNS,
  SIM_PARTIAL_TURN_CREDIT,
} from "./config.js";

/**
 * Build a fast deterministic pseudo-random-number generator. The implementation
 * comes from Tommy Ettinger's mulberry32 algorithm which offers good
 * statistical distribution for simulation work while remaining tiny.
 *
 * @param {number} seed - Unsigned 32-bit seed used to initialize the stream.
 * @returns {() => number} Function returning a float in the range [0, 1).
 */
export function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function initializeActorPosition(actor, x, y) {
  if (!actor) return;
  actor.x = x;
  actor.y = y;
  actor.spawnPos = { x, y };
  actor.homePos = { x, y };
}

function createSimulationWorld(primary, secondary, rng) {
  const mobs = [primary, secondary];
  const mobManager = {
    list: () => mobs,
    getMobAt(x, y) {
      return mobs.find((mob) =>
        mob && Number.isFinite(mob.x) && Number.isFinite(mob.y) && mob.x === x && mob.y === y
      ) ?? null;
    },
  };

  const getMobAt = (x, y) => mobManager.getMobAt(x, y);
  const playerCandidate = mobs.find((mob) => mob?.isPlayer) ?? primary;

  return {
    mobManager,
    getMobAt,
    player: playerCandidate,
    rng,
  };
}

function createActionPlanner(world, rng) {
  return (actor) => {
    if (!actor) return;
    const decision = planTurn({ actor, combatant: actor, world, rng });
    executeDecision({ actor, combatant: actor, world, decision, rng });
  };
}

/**
 * Runs a batch of automated combat simulations and returns aggregate stats.
 *
 * @param {{
 *   a?: string,
 *   b?: string,
 *   N?: number,
 *   seed?: number,
 * }} [options] - Actor template ids, iteration count, and RNG seed.
 * @returns {{
 *   winsA: number,
 *   winsB: number,
 *   turnsAvg: number,
 *   dpsAvg: number,
 *   N: number,
 *   seed: number,
 * }} Aggregate win/loss counts and DPS information.
 */
export function simulate({
  a = "brigand",
  b = "dummy",
  N = SIM_DEFAULT_RUN_COUNT,
  seed = SIM_DEFAULT_SEED,
} = {}) {
  ensureItemsRegistered();
  const rng = mulberry32(seed);
  let winsA=0, winsB=0, turnsSum=0, dmgSum=0;

  for (let i=0;i<N;i++) {
    const A = createActorFromTemplate(a);
    const B = createActorFromTemplate(b);
    initializeActorPosition(A, 0, 0);
    initializeActorPosition(B, 1, 0);
    const world = createSimulationWorld(A, B, rng);
    const planner = createActionPlanner(world, rng);
    let turns=0, dmg=0;

    let partialTurn = 0;
    while (A.res.hp>0 && B.res.hp>0 && turns<SIM_MAX_TURNS) {
      const aDefeated = runTurn(A, planner);
      if (aDefeated || B.res.hp <= 0) {
        partialTurn = SIM_PARTIAL_TURN_CREDIT;
        break;
      }

      const bDefeated = runTurn(B, planner);
      if (bDefeated || A.res.hp <= 0) {
        turns++;
        break;
      }

      turns++;
    }
    const totalTurns = Math.max(turns + partialTurn, SIM_PARTIAL_TURN_CREDIT);
    if (A.res.hp>0) winsA++; else winsB++;
    dmg += (A.base.maxHP - A.res.hp) + (B.base.maxHP - B.res.hp);
    turnsSum += totalTurns; dmgSum += dmg/totalTurns;
  }
  return {
    winsA, winsB,
    turnsAvg: +(turnsSum/N).toFixed(2),
    dpsAvg: +(dmgSum/N).toFixed(2),
    N, seed
  };
}

/**
 * Async variant of {@link simulate} that awaits planners and turn events.
 * @param {{ a?: string, b?: string, N?: number, seed?: number }} [options]
 */
export async function simulateAsync({
  a = "brigand",
  b = "dummy",
  N = SIM_DEFAULT_RUN_COUNT,
  seed = SIM_DEFAULT_SEED,
} = {}) {
  ensureItemsRegistered();
  const rng = mulberry32(seed);
  let winsA = 0;
  let winsB = 0;
  let turnsSum = 0;
  let dmgSum = 0;

  for (let i = 0; i < N; i += 1) {
    const A = createActorFromTemplate(a);
    const B = createActorFromTemplate(b);
    initializeActorPosition(A, 0, 0);
    initializeActorPosition(B, 1, 0);
    const world = createSimulationWorld(A, B, rng);
    const planner = createActionPlanner(world, rng);
    let turns = 0;
    let dmg = 0;

    let partialTurn = 0;
    while (A.res.hp > 0 && B.res.hp > 0 && turns < SIM_MAX_TURNS) {
      const aDefeated = await runTurnAsync(A, planner);
      if (aDefeated || B.res.hp <= 0) {
        partialTurn = SIM_PARTIAL_TURN_CREDIT;
        break;
      }

      const bDefeated = await runTurnAsync(B, planner);
      if (bDefeated || A.res.hp <= 0) {
        turns += 1;
        break;
      }

      turns += 1;
    }

    const totalTurns = Math.max(turns + partialTurn, SIM_PARTIAL_TURN_CREDIT);
    if (A.res.hp > 0) winsA += 1; else winsB += 1;
    dmg += (A.base.maxHP - A.res.hp) + (B.base.maxHP - B.res.hp);
    turnsSum += totalTurns;
    dmgSum += dmg / totalTurns;
  }

  return {
    winsA,
    winsB,
    turnsAvg: +(turnsSum / N).toFixed(2),
    dpsAvg: +(dmgSum / N).toFixed(2),
    N,
    seed,
  };
}

export {
  SIM_DEFAULT_RUN_COUNT,
  SIM_DEFAULT_SEED,
  SIM_MAX_TURNS,
  SIM_PARTIAL_TURN_CREDIT,
  SIM_BALANCE_BANDS,
  SIMULATION_CONFIG,
} from "./config.js";
