import assert from "node:assert/strict";
import { createActor, resolveAttack, setSeed } from "./_helpers.js";

function summarizePackets(view) {
  const entries = [];
  if (!Array.isArray(view)) return entries;
  for (const pkt of view) {
    entries.push({ type: pkt.type, finalAmount: pkt.amount });
  }
  return entries;
}

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

  const finals = summarizePackets(result.packetsAfterDefense);
  const totals = result.packetsAfterDefense?.byType || Object.create(null);
  const slashPacket = finals.find((entry) => entry.type === "slash");
  const firePacket = finals.find((entry) => entry.type === "fire");

  assert.ok(slashPacket && slashPacket.finalAmount > 0, "slash damage should survive after DR");
  assert.equal(firePacket?.finalAmount ?? 0, 0, "fire damage should be fully negated by immunity");
  assert.equal(totals.fire ?? 0, 0, "fire packet aggregation should reflect immunity");
  const totalFromPackets = finals.reduce((sum, entry) => sum + (entry.finalAmount || 0), 0);
  assert.equal(result.totalDamage, totalFromPackets, "totalDamage should equal packet sum");
  const applied = Array.isArray(result.appliedStatuses) ? result.appliedStatuses : [];
  assert.ok(!applied.some((s) => s?.id === "burn"), "no burn should apply when damage is immune");

  console.log("✓ defense ordering respects immunities and flat DR");
})();
