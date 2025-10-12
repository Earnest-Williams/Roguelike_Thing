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

/** @param {string} type @param {any} payload */
export function emit(type, payload) {
  // Events are stored in a small ring buffer for debugging/UX widgets. We keep
  // this implementation minimal so it can be used from both game logic and the
  // browser console without worrying about reentrancy.
  const entry = { t: Date.now(), type, payload };
  ring.push(entry);
  if (ring.length > EVENT_LOG_RING_MAX) ring.shift();
  const s = subs.get(type);
  if (s) for (const fn of s) fn(entry);
  const any = subs.get("*");
  if (any) for (const fn of any) fn(entry);
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
