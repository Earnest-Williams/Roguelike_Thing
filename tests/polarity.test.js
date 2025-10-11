// tests/polarity.test.js
// @ts-check
import { Actor } from "../src/combat/actor.js";
import { polarityDefScalar, polarityOnHitScalar, polaritySummary } from "../src/combat/polarity.js";

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
  actor.polarity = { ...grant };
  return actor;
}

// --- Basic opposition clamps to configured bounds ---
{
  const attacker = makeActorWithPolarity("att-order", { order: 2 });
  const defender = makeActorWithPolarity("def-chaos", { chaos: 1 });
  const scalar = polarityOnHitScalar(attacker, defender);
  assert(approxEqual(scalar, -0.5), `Expected strong opposition to clamp at -0.5, got ${scalar}`);
}

// --- Neutral matchups are unaffected ---
{
  const attacker = makeActorWithPolarity("att-growth", { growth: 1 });
  const defender = makeActorWithPolarity("def-growth", { growth: 1 });
  const scalar = polarityOnHitScalar(attacker, defender);
  assert(approxEqual(scalar, 0), `Matching polarities should be neutral, got ${scalar}`);
}

// --- Attacker on-hit bias stacks with opposition ---
{
  const attacker = makeActorWithPolarity("att-bias", { order: 1 });
  attacker.modCache.polarity.onHitBias = { base: 0.2, vs: { chaos: 0.05 } };
  const defender = makeActorWithPolarity("def-chaos-strong", { chaos: 2 });
  const scalar = polarityOnHitScalar(attacker, defender);
  const expected = -0.5 + 0.2 + (0.05 * 2);
  assert(
    approxEqual(scalar, expected),
    `Expected bias-adjusted scalar ${expected}, received ${scalar}`,
  );
}

// --- Defender bias reduces incoming damage ---
{
  const attacker = makeActorWithPolarity("att-chaos", { chaos: 1 });
  const defender = makeActorWithPolarity("def-order", { order: 2 });
  defender.modCache.polarity.defenseBias = { base: 0.1, vs: { chaos: 0.05 } };
  const scalar = polarityDefScalar(defender, attacker);
  const expected = -0.5 + 0.1 + (0.05 * 1);
  assert(
    approxEqual(scalar, expected),
    `Expected defensive bias ${expected}, received ${scalar}`,
  );
}

// --- Summary helper exposes derived grant maps ---
{
  const attacker = makeActorWithPolarity("att-summary", { order: 1, void: 0.5 });
  const defender = makeActorWithPolarity("def-summary", { chaos: 0.75 });
  const summary = polaritySummary(attacker, defender);
  assert(approxEqual(summary.attGrant.order, 1), `Summary should capture attacker grant order=1 (got ${summary.attGrant.order})`);
  assert(approxEqual(summary.defGrant.chaos, 0.75), `Summary should capture defender grant chaos=0.75 (got ${summary.defGrant.chaos})`);
  assert(approxEqual(summary.onHit, polarityOnHitScalar(attacker, defender)), "Summary onHit should match direct computation");
  assert(approxEqual(summary.defense, polarityDefScalar(defender, attacker)), "Summary defense should match direct computation");
}

console.log("\u2713 polarity scalars and summary helpers");
