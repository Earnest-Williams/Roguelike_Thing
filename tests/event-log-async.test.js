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

(async function testEmitAsyncAwaitsTypedAndWildcardListeners() {
  const order = [];
  const record = (tag, entry) => {
    order.push({ tag, step: entry?.payload?.step ?? null });
  };
  const unsubType = subscribe("combo", async (entry) => {
    record("typed-start", entry);
    await new Promise((resolve) => setTimeout(resolve, 0));
    record("typed-end", entry);
  });
  const unsubWild = subscribe("*", async (entry) => {
    record("wild-start", entry);
    await new Promise((resolve) => setTimeout(resolve, 0));
    record("wild-end", entry);
  });

  const entry = await emitAsync("combo", { step: 1 });
  assert.equal(entry.type, "combo", "emitAsync should return the recorded entry");
  const targeted = order.filter((evt) => evt.step === 1);
  assert.equal(targeted.length, 4, "both listeners should execute start/end phases for the combo event");
  assert.deepEqual(
    targeted
      .filter((evt) => evt.tag.endsWith("start"))
      .map((evt) => evt.tag),
    ["typed-start", "wild-start"],
    "typed listeners should run before wildcard listeners are awaited",
  );
  const typedStart = targeted.findIndex((evt) => evt.tag === "typed-start");
  const typedEnd = targeted.findIndex((evt) => evt.tag === "typed-end");
  const wildStart = targeted.findIndex((evt) => evt.tag === "wild-start");
  const wildEnd = targeted.findIndex((evt) => evt.tag === "wild-end");
  assert.ok(typedStart > -1 && typedEnd > typedStart, "typed listener should finish after it starts");
  assert.ok(wildStart > -1 && wildEnd > wildStart, "wildcard listener should finish after it starts");

  unsubType();
  unsubWild();
  console.log("✓ event log await covers typed + wildcard listeners");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

(function testSubscribeUnsubscribeLifecycle() {
  let called = 0;
  const unsub = subscribe("lifecycle", () => {
    called += 1;
  });

  emit("lifecycle", { tick: 1 });
  unsub();
  emit("lifecycle", { tick: 2 });

  assert.equal(called, 1, "unsubscribe should stop future handler invocations");
  console.log("✓ event log unsubscribe prevents additional calls");
})();

(function testEmitLogsHandlerErrorsWithoutThrowing() {
  const originalError = console.error;
  /** @type {string[]} */
  const messages = [];
  console.error = (...args) => {
    messages.push(args.map((v) => String(v)).join(" "));
  };

  try {
    const unsub = subscribe("boom", () => {
      throw new Error("kaboom");
    });

    const entry = emit("boom", {});
    assert.equal(entry.type, "boom", "emit should still return entry when handlers throw");
    assert.ok(
      messages.some((line) => line.includes("boom")),
      "console.error should receive contextual event type",
    );
    assert.ok(
      messages.some((line) => line.includes("kaboom")),
      "console.error should receive error details",
    );

    unsub();
  } finally {
    console.error = originalError;
  }

  console.log("✓ event log emit logs handler exceptions defensively");
})();
