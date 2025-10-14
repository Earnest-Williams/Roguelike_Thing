// js/debug/debug-bus.js
// Lightweight observer for developer tooling.

export const DebugBus = (() => {
  const listeners = new Set();
  return {
    on(fn) {
      if (typeof fn !== "function") return () => {};
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    emit(evt) {
      for (const fn of listeners) {
        try {
          fn(evt);
        } catch (err) {
          console.error("DebugBus listener error", err);
        }
      }
    },
    async emitAsync(evt) {
      const promises = [];
      for (const fn of listeners) {
        try {
          const result = fn(evt);
          if (result && typeof result.then === "function") {
            promises.push(result);
          }
        } catch (err) {
          console.error("DebugBus listener error", err);
        }
      }
      if (promises.length === 0) return;
      const results = await Promise.allSettled(promises);
      for (const outcome of results) {
        if (outcome.status === "rejected") {
          console.error("DebugBus async listener rejected", outcome.reason);
        }
      }
    },
  };
})();
