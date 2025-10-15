import { strict as assert } from "node:assert";

import { Actor } from "../dist/src/combat/actor.js";
import { runTurnAsync } from "../dist/src/combat/loop.js";
import { EVENT, subscribe } from "../dist/src/ui/event-log.js";

(async function testRunTurnAsyncAwaitsPlanner() {
  const actor = new Actor({
    id: "async-runner",
    baseStats: {
      str: 8,
      dex: 8,
      int: 8,
      vit: 8,
      con: 8,
      will: 8,
      luck: 8,
      maxHP: 20,
      maxStamina: 10,
      maxMana: 0,
      baseSpeed: 1,
    },
  });
  actor.base.maxHp = actor.base.maxHP;
  actor.baseStats.maxHp = actor.baseStats.maxHP;

  let plannerRan = false;
  const planner = async (entity) => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    plannerRan = true;
    if (entity?.turnFlags) {
      entity.turnFlags.attacked = true;
    }
  };

  let turnEvents = 0;
  const unsub = subscribe(EVENT.TURN, () => {
    turnEvents += 1;
  });

  const defeated = await runTurnAsync(actor, planner);
  unsub();

  assert.equal(plannerRan, true, "async planner should have executed");
  assert.equal(defeated, false, "actor should survive the turn");
  assert.equal(turnEvents, 1, "turn event should fire exactly once");

  console.log("✓ runTurnAsync awaits planner and event emission");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
