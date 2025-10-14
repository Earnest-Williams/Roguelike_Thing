import { strict as assert } from "node:assert";

import { emit, emitAsync, subscribe } from "../src/ui/event-log.js";

(async function testEmitAsyncWaitsForHandlers() {
  const payloads = [];
  const unsub = subscribe("async-test", async (entry) => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    payloads.push(entry.payload);
  });

  emit("async-test", { id: 1 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(payloads, [{ id: 1 }], "async handler should run eventually for emit");

  payloads.length = 0;
  await emitAsync("async-test", { id: 2 });
  assert.deepEqual(payloads, [{ id: 2 }], "emitAsync should await handler completion");

  unsub();
  console.log("✓ event log async dispatch");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
