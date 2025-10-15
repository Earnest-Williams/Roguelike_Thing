import assert from "node:assert/strict";
import { createActor, applyStatus, tickN, serialize, deserialize } from "./_helpers.js";

(function testSaveLoadPreservesTimers() {
  const defender = createActor({ id: "save_load_actor", hp: 100 });
  applyStatus(defender, { type: "bleed", stacks: 3, duration: 5 });
  tickN(2, { actors: [defender] });

  const snapshot = serialize({ defender });
  const restored = deserialize(snapshot);
  const defenderCopy = restored.defender;

  tickN(4, { actors: [defender] });
  tickN(4, { actors: [defenderCopy] });

  assert.equal(defender.hp, defenderCopy.hp, "restored actor should take identical damage after remaining ticks");
  const liveStacks = defender.statuses?.find((s) => s.id === "bleed")?.stacks || 0;
  const copyStacks = defenderCopy.statuses?.find((s) => s.id === "bleed")?.stacks || 0;
  assert.equal(liveStacks, 0, "original bleed should be finished");
  assert.equal(copyStacks, 0, "restored bleed should also finish");

  console.log("✓ save/load restores stacked status timers accurately");
})();
