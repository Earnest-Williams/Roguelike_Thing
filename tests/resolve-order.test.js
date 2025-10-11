import assert from "node:assert/strict";
import { Actor } from "../src/combat/actor.js";
import { resolveAttack } from "../src/combat/resolve.js";

function createActors() {
  const a = new Actor({ id: "atk", baseStats: { str: 10, dex: 10, int: 10, vit: 10, maxHP: 20, maxStamina: 10, maxMana: 5, baseSpeed: 1 } });
  const d = new Actor({ id: "def", baseStats: { str: 10, dex: 10, int: 10, vit: 10, maxHP: 20, maxStamina: 10, maxMana: 5, baseSpeed: 1 } });
  a.modCache.offense.conversions.push({ from: "physical", to: "fire", pct: 0.5 });
  a.modCache.offense.brands = [{ type: "fire", flat: 2, pct: 0.1 }];
  a.modCache.affinities.fire = 0.2;
  d.modCache.resists.fire = 0.25;
  d.res.hp = 30;
  return { a, d };
}

(function testOrder() {
  const { a, d } = createActors();
  const { packetsAfterDefense, totalDamage } = resolveAttack({
    attacker: a,
    defender: d,
    packets: [{ type: "physical", amount: 10 }],
  });
  assert.equal(packetsAfterDefense.fire, 6);
  assert.equal(packetsAfterDefense.physical, 5);
  assert.equal(totalDamage, 11);
})();
