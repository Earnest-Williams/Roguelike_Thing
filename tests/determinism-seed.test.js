import assert from "node:assert/strict";
import { setSeed, runShortCombat, hashPackets } from "./_helpers.js";

(function testDeterminismFromSeed() {
  setSeed(2025);
  const first = runShortCombat();
  const hashOne = hashPackets(first.packets);

  setSeed(2025);
  const second = runShortCombat();
  const hashTwo = hashPackets(second.packets);

  assert.equal(hashOne, hashTwo, "combat traces should match when seeded identically");
  console.log("✓ combat packets deterministic with fixed seed");
})();
