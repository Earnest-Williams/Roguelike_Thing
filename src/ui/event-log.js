// src/ui/event-log.js
// @ts-check
import { EVENT_LOG_RING_MAX, EVENT_LOG_LATEST_DEFAULT } from "../config.js";

export const EVENT = Object.freeze({
  TURN: "turn",
  COMBAT: "combat",
  STATUS: "status",
  CONSOLE: "console",
});

/** @type {Map<string, Set<Function>>} */
const subs = new Map();
/** @type {Array<{ t: number, type: string, payload: any }>} */
const ring = [];

/** @param {any} value */
function isPromiseLike(value) {
  return !!(value && typeof value === "object" && typeof value.then === "function");
}

function pushEntry(type, payload) {
  const entry = { t: Date.now(), type, payload };
  ring.push(entry);
  if (ring.length > EVENT_LOG_RING_MAX) ring.shift();
  return entry;
}

/**
 * @param {Set<Function> | undefined} listeners
 * @param {{ t: number, type: string, payload: any }} entry
 * @param {string} type
 * @param {Promise<any>[]} promises
 */
function notifyListeners(listeners, entry, type, promises) {
  if (!listeners) return;
  for (const fn of listeners) {
    try {
      const result = fn(entry);
      if (isPromiseLike(result)) {
        promises.push(result);
      }
    } catch (err) {
      if (typeof console !== "undefined" && console.error) {
        console.error(`[event-log] handler for "${type}" threw`, err);
      }
    }
  }
}

/**
 * @param {string} type
 * @param {any} reason
 */
function logRejection(type, reason) {
  if (typeof console !== "undefined" && console.error) {
    console.error(`[event-log] async handler for "${type}" rejected`, reason);
  }
}

/**
 * Emit an event to synchronous listeners.
 * @param {string} type
 * @param {any} payload
 * @returns {{ t: number, type: string, payload: any }} Recorded entry.
 */
export function emit(type, payload) {
  // Events are stored in a small ring buffer for debugging/UX widgets. We keep
  // this implementation minimal so it can be used from both game logic and the
  // browser console without worrying about reentrancy.
  const entry = pushEntry(type, payload);
  const promises = [];
  notifyListeners(subs.get(type), entry, type, promises);
  notifyListeners(subs.get("*"), entry, "*", promises);
  for (const promise of promises) {
    promise.catch((err) => logRejection(type, err));
  }
  return entry;
}

/**
 * Emit an event and await asynchronous listeners.
 * @param {string} type
 * @param {any} payload
 * @returns {Promise<{ t: number, type: string, payload: any }>}
 */
export async function emitAsync(type, payload) {
  const entry = pushEntry(type, payload);
  const promises = [];
  notifyListeners(subs.get(type), entry, type, promises);
  notifyListeners(subs.get("*"), entry, "*", promises);
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
 * @param {string} type
 * @param {(entry: { t: number, type: string, payload: any }) => void} fn
 */
export function subscribe(type, fn) {
  // Subscribers receive the raw entry object. Returning an unsubscribe function
  // keeps cleanup ergonomic for UI components.
  if (!subs.has(type)) subs.set(type, new Set());
  subs.get(type).add(fn);
  return () => subs.get(type)?.delete(fn);
}

/**
 * @param {number} [n]
 */
export function latest(n = EVENT_LOG_LATEST_DEFAULT) {
  // Copy the newest N entries so callers can safely mutate the returned array
  // without corrupting the ring buffer.
  return ring.slice(Math.max(0, ring.length - n));
}
