import assert from "node:assert/strict";
import { createActor, resolveAttack, setSeed } from "./_helpers.js";

(function testDefenseOrdering() {
  setSeed(1234);
  const attacker = createActor({ id: "armor_order_atk" });
  const defender = createActor({
    id: "armor_order_def",
    resists: { slash: 0.1, fire: 0.2 },
    armorFlat: 3,
    immunities: ["fire"],
    hp: 100,
  });

  const result = resolveAttack(attacker, defender, {
    prePackets: [
      { type: "slash", amount: 5 },
      { type: "fire", amount: 7 },
    ],
  });

  const finals = Array.from(result.packetsAfterDefense || []).map((pkt) => ({
    type: pkt.type,
    amt: pkt.amount,
  }));

  const slashPacket = finals.find((entry) => entry.type === "slash");
  const firePacket = finals.find((entry) => entry.type === "fire");

  assert.ok(slashPacket && slashPacket.amt > 0, "slash damage should survive after DR");
  assert.equal(firePacket?.amt ?? 0, 0, "fire damage should be fully negated by immunity");
  const totalFromPackets = finals.reduce((sum, entry) => sum + (entry.amt || 0), 0);
  assert.equal(result.totalDamage, totalFromPackets, "totalDamage should equal packet sum");
  assert.ok(!Array.isArray(result.appliedStatuses) || !result.appliedStatuses.some((s) => s?.id === "burn"), "no burn should apply when damage is immune");

  console.log("✓ defense ordering respects immunities and flat DR");
})();
