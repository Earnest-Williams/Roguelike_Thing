// src/ui/event-log.js
// @ts-check

export const EVENT = Object.freeze({
  TURN: "turn",
  COMBAT: "combat",
  STATUS: "status",
  CONSOLE: "console",
});

/** @type {Map<string, Set<Function>>} */
const subs = new Map();
const RING_MAX = 200;
/** @type {Array<{ t: number, type: string, payload: any }>} */
const ring = [];

/** @param {string} type @param {any} payload */
export function emit(type, payload) {
  const entry = { t: Date.now(), type, payload };
  ring.push(entry);
  if (ring.length > RING_MAX) ring.shift();
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
  if (!subs.has(type)) subs.set(type, new Set());
  subs.get(type).add(fn);
  return () => subs.get(type)?.delete(fn);
}

/**
 * @param {number} [n]
 */
export function latest(n = 50) {
  return ring.slice(Math.max(0, ring.length - n));
}
