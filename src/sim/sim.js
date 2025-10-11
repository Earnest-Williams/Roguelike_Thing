// src/sim/sim.js
// @ts-check
import { createActorFromTemplate, ensureItemsRegistered } from "../factories/index.js";
import { runTurn } from "../combat/loop.js";
import { tryAttackEquipped } from "../combat/actions.js";

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
export function simulate({ a="brigand", b="dummy", N=50, seed=1234 }) {
  ensureItemsRegistered();
  const rng = mulberry32(seed);
  let winsA=0, winsB=0, turnsSum=0, dmgSum=0;

  for (let i=0;i<N;i++) {
    const A = createActorFromTemplate(a);
    const B = createActorFromTemplate(b);
    let turns=0, dmg=0;

    // naive planners
    const planA = (actor) => { if (!tryAttackEquipped(actor, B, 1)) {/* could move */} };
    const planB = (actor) => { if (!tryAttackEquipped(actor, A, 1)) {/* idle */} };

    let partialTurn = 0;
    while (A.res.hp>0 && B.res.hp>0 && turns<200) {
      const aDefeated = runTurn(A, planA);
      if (aDefeated || B.res.hp <= 0) {
        partialTurn = 0.5;
        break;
      }

      const bDefeated = runTurn(B, planB);
      if (bDefeated || A.res.hp <= 0) {
        turns++;
        break;
      }

      turns++;
    }
    const totalTurns = Math.max(turns + partialTurn, 0.5);
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
