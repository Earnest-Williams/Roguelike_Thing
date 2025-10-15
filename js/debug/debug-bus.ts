export interface DebugEvent {
  type: string;
  [key: string]: unknown;
}

export type DebugListener = (event: DebugEvent) => void | Promise<unknown>;

export interface DebugBusApi {
  on(listener: DebugListener): () => void;
  emit(event: DebugEvent): void;
  emitAsync(event: DebugEvent): Promise<void>;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object" && value !== null && typeof (value as PromiseLike<unknown>).then === "function";
}

export const DebugBus: DebugBusApi = (() => {
  const listeners = new Set<DebugListener>();
  return {
    on(fn: DebugListener): () => void {
      if (typeof fn !== "function") return () => undefined;
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    emit(evt: DebugEvent): void {
      for (const fn of listeners) {
        try {
          fn(evt);
        } catch (err) {
          console.error("DebugBus listener error", err);
        }
      }
    },
    async emitAsync(evt: DebugEvent): Promise<void> {
      const promises: PromiseLike<unknown>[] = [];
      for (const fn of listeners) {
        try {
          const result = fn(evt);
          if (isPromiseLike(result)) {
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
  } satisfies DebugBusApi;
})();
