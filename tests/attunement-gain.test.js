// tests/attunement-gain.test.js
import assert from "node:assert/strict";
import { gainAttunementsFromPackets } from "../src/combat/attunement.js";
import { ATTUNE } from "../src/config.js";

const attacker = {
  id: "tester",
  attune: {
    pool: { physical: 1, fire: ATTUNE.cap - 1 },
    lastTurnUpdated: 0,
  },
};

const packets = {
  physical: 10,
  fire: 5,
  shadow: 2,
  poison: 0,
  cold: -3,
  void: Number.NaN,
};

gainAttunementsFromPackets(attacker, packets);

const pool = attacker.attune.pool;

assert.equal(pool.physical, 1 + Math.max(ATTUNE.minPerHitGain, packets.physical * ATTUNE.gainPerPointDamage));
assert.equal(
  pool.fire,
  Math.min(
    ATTUNE.cap,
    (ATTUNE.cap - 1) + Math.max(ATTUNE.minPerHitGain, packets.fire * ATTUNE.gainPerPointDamage),
  ),
);
assert.equal(
  pool.shadow,
  Math.max(ATTUNE.minPerHitGain, packets.shadow * ATTUNE.gainPerPointDamage),
);
assert.ok(!("poison" in pool), "zero damage types should not be added");
assert.ok(!("cold" in pool), "negative damage types should not be added");
assert.ok(!("void" in pool), "non-finite packet values should be ignored");
