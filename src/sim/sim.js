// src/sim/sim.js
// @ts-check
import { createActorFromTemplate, ensureItemsRegistered } from "../factories/index.js";
import { runTurn } from "../combat/loop.js";
import { AIPlanner } from "../combat/ai-planner.js";
import {
  SIM_DEFAULT_RUN_COUNT,
  SIM_DEFAULT_SEED,
  SIM_MAX_TURNS,
  SIM_PARTIAL_TURN_CREDIT,
} from "./config.js";

export function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Runs N fights of A vs B with a simple planner.
 * Returns stats: { winsA, winsB, turnsAvg, dpsAvg }
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
    let turns=0, dmg=0;

    // simple planners: evaluate available actions against the opponent
    const planA = (actor) => AIPlanner.takeTurn(actor, { target: B, distance: 1 });
    const planB = (actor) => AIPlanner.takeTurn(actor, { target: A, distance: 1 });

    let partialTurn = 0;
    while (A.res.hp>0 && B.res.hp>0 && turns<SIM_MAX_TURNS) {
      const aDefeated = runTurn(A, planA);
      if (aDefeated || B.res.hp <= 0) {
        partialTurn = SIM_PARTIAL_TURN_CREDIT;
        break;
      }

      const bDefeated = runTurn(B, planB);
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

export {
  SIM_DEFAULT_RUN_COUNT,
  SIM_DEFAULT_SEED,
  SIM_MAX_TURNS,
  SIM_PARTIAL_TURN_CREDIT,
  SIM_BALANCE_BANDS,
  SIMULATION_CONFIG,
} from "./config.js";
