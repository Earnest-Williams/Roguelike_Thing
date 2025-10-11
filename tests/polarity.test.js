// tests/polarity.test.js
// @ts-check
import { Actor } from "../src/combat/actor.js";
import {
  normalizePolarity,
  polarityAlignmentScore,
  polarityDefenseMult,
  polarityOffenseMult,
  polaritySummary,
} from "../src/combat/polarity.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function approxEqual(a, b, epsilon = 1e-6) {
  return Math.abs(a - b) <= epsilon;
}

function makeActorWithPolarity(id, grant) {
  const actor = new Actor({
    id,
    baseStats: {
      str: 10,
      dex: 10,
      int: 10,
      vit: 10,
      maxHP: 100,
      maxStamina: 50,
      maxMana: 10,
      baseSpeed: 1,
    },
  });
  actor.polarityRaw = { ...grant };
  actor.polarity = normalizePolarity(grant);
  actor.polarityVector = actor.polarity;
  return actor;
}

// --- Normalization produces unit vectors ---
{
  const norm = normalizePolarity({ order: 2, chaos: 1 });
  assert(approxEqual(norm.order + norm.chaos, 1), "Normalized polarity should sum to 1");
  assert(norm.growth === 0 && norm.decay === 0 && norm.void === 0, "Unused components should be zero");
}

// --- Alignment score drives offense/defense multipliers ---
{
  const attacker = makeActorWithPolarity("att-order", { order: 3 });
  const defender = makeActorWithPolarity("def-chaos", { chaos: 1 });
  const score = polarityAlignmentScore(attacker, defender);
  const offMult = polarityOffenseMult(attacker, defender);
  const defMult = polarityDefenseMult(defender, attacker);
  assert(score < 0, "Order vs chaos should penalize the attacker in current tuning");
  assert(offMult < 1, "Negative alignment should reduce offense");
  assert(defMult > 1, "Negative alignment should increase defender mitigation");
}

// --- Summary helper exposes grant maps and multipliers ---
{
  const attacker = makeActorWithPolarity("att-summary", { order: 1, void: 0.5 });
  const defender = makeActorWithPolarity("def-summary", { chaos: 0.75 });
  const summary = polaritySummary(attacker, defender);
  assert(approxEqual(summary.attGrant.order, 1), `Summary should capture attacker grant order=1 (got ${summary.attGrant.order})`);
  assert(approxEqual(summary.defGrant.chaos, 0.75), `Summary should capture defender grant chaos=0.75 (got ${summary.defGrant.chaos})`);
  assert(approxEqual(summary.offenseMult, polarityOffenseMult(attacker, defender)), "Summary offense multiplier should match calculation");
  assert(approxEqual(summary.defenseMult, polarityDefenseMult(defender, attacker)), "Summary defense multiplier should match calculation");
  assert(approxEqual(summary.attVector.order + summary.attVector.void, 1), "Summary attacker vector should be normalized");
}

console.log("✓ polarity normalization and multipliers");
