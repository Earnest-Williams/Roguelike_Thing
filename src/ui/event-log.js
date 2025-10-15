// src/ui/event-log.js
// @ts-nocheck
import { EVENT_LOG_RING_MAX, EVENT_LOG_LATEST_DEFAULT } from "../config.js";

/**
 * Lightweight in-memory event log used throughout the UI layer. The module
 * acts as a tiny event bus that is safe to call from anywhere, including the
 * browser console, while also keeping a short history for debugging widgets.
 *
 * The implementation intentionally avoids depending on framework-specific
 * constructs so it can be reused across different parts of the codebase.
 */

/** @typedef {{ t: number, type: string, payload: any }} EventLogEntry */
/** @typedef {(entry: EventLogEntry) => unknown} EventListener */

export const EVENT = Object.freeze({
  TURN: "turn",
  COMBAT: "combat",
  STATUS: "status",
  CONSOLE: "console",
  SPELL_CAST: "SPELL_CAST",
  RUNE_TRIGGER: "RUNE_TRIGGER",
});

/** @type {Map<string, Set<EventListener>>} */
const subs = new Map();
/** @type {EventLogEntry[]} */
const ring = [];

/**
 * Return whether a value quacks like a promise. The heuristic is intentionally
 * loose so that callers can return any thenable implementation.
 * @param {unknown} value
 * @returns {value is Promise<unknown>}
 */
function isPromiseLike(value) {
  return !!(value && typeof value === "object" && typeof value.then === "function");
}

/**
 * Record the provided payload in the ring buffer and return the entry.
 * @param {string} type
 * @param {any} payload
 * @returns {EventLogEntry}
 */
function pushEntry(type, payload) {
  const entry = { t: Date.now(), type, payload };
  ring.push(entry);
  if (ring.length > EVENT_LOG_RING_MAX) ring.shift();
  return entry;
}

/**
 * Notify listeners for a specific event type and collect any returned
 * promises.
 * @param {string} type
 * @param {EventLogEntry} entry
 * @returns {Promise<unknown>[]}
 */
function dispatchToListeners(type, entry) {
  const listeners = subs.get(type);
  if (!listeners || listeners.size === 0) return [];

  /** @type {Promise<unknown>[]} */
  const promises = [];
  for (const listener of listeners) {
    try {
      const result = listener(entry);
      if (isPromiseLike(result)) {
        promises.push(result);
      }
    } catch (err) {
      if (typeof console !== "undefined" && console.error) {
        console.error(`[event-log] handler for "${type}" threw`, err);
      }
    }
  }
  return promises;
}

/**
 * Log a rejection from an asynchronous handler in a defensive manner. Console
 * access is guarded so the function remains safe to use in headless test
 * environments.
 * @param {string} type
 * @param {unknown} reason
 */
function logRejection(type, reason) {
  if (typeof console !== "undefined" && console.error) {
    console.error(`[event-log] async handler for "${type}" rejected`, reason);
  }
}

/**
 * Emit an event to synchronous listeners.
 *
 * Events are stored in a small ring buffer for debugging/UX widgets. We keep
 * this implementation minimal so it can be used from both game logic and the
 * browser console without worrying about reentrancy.
 *
 * @param {string} type
 * @param {any} payload
 * @returns {EventLogEntry} Recorded entry.
 */
export function emit(type, payload) {
  const entry = pushEntry(type, payload);
  const promises = [
    ...dispatchToListeners(type, entry),
    ...dispatchToListeners("*", entry),
  ];
  for (const promise of promises) {
    promise.catch((err) => logRejection(type, err));
  }
  return entry;
}

/**
 * Emit an event and await asynchronous listeners.
 * @param {string} type
 * @param {any} payload
 * @returns {Promise<EventLogEntry>}
 */
export async function emitAsync(type, payload) {
  const entry = pushEntry(type, payload);
  const promises = [
    ...dispatchToListeners(type, entry),
    ...dispatchToListeners("*", entry),
  ];
  if (promises.length === 0) {
    return entry;
  }
  const results = await Promise.allSettled(promises);
  for (const result of results) {
    if (result.status === "rejected") {
      logRejection(type, result.reason);
    }
  }
  return entry;
}

/**
 * Register a listener for the given event type. Listeners receive the raw
 * event entry object. The returned function can be used to unsubscribe.
 *
 * @param {string} type
 * @param {EventListener} fn
 * @returns {() => void}
 */
export function subscribe(type, fn) {
  if (typeof fn !== "function") {
    throw new TypeError("event-log.subscribe expects a function listener");
  }
  if (!subs.has(type)) subs.set(type, new Set());
  const listeners = subs.get(type);
  listeners.add(fn);
  return () => {
    const set = subs.get(type);
    if (!set) return;
    set.delete(fn);
    if (set.size === 0) {
      subs.delete(type);
    }
  };
}

/**
 * Return the newest {@code n} entries in chronological order.
 * @param {number} [n=EVENT_LOG_LATEST_DEFAULT]
 * @returns {EventLogEntry[]}
 */
export function latest(n = EVENT_LOG_LATEST_DEFAULT) {
  // Copy the newest N entries so callers can safely mutate the returned array
  // without corrupting the ring buffer.
  return ring.slice(Math.max(0, ring.length - n));
}
