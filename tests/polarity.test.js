// tests/polarity.test.js
// @ts-nocheck
import assert from "node:assert/strict";
import { normalizePolarity, polarityOffenseMult, polarityDefenseMult } from "../src/combat/polarity.js";

(function testNormalization() {
  const p = normalizePolarity({ order: 2, chaos: 1 });
  assert(Math.abs(p.order + p.chaos - 1) < 1e-9);
  assert(p.growth === 0 && p.decay === 0 && p.void === 0);
})();

(function testAdvantage() {
  const att = { order: 1 };
  const def = { chaos: 1 };
  const off = polarityOffenseMult(att, def);
  const defm = polarityDefenseMult(def, att);
  assert(off > 1.0, "attacker with advantage should get >1 offense mult");
  assert(defm < 1.0, "defender against advantage should get <1 defense mult");
})();

console.log("✓ polarity basic behavior");
