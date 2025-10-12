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
  };
})();
