// src/combat/resources.js
// @ts-nocheck

import { HEALTH_FLOOR } from "../../js/constants.js";

const RESOURCE_KEYS = ["hp", "stamina", "mana"];

/**
 * Ensure actor.resources / actor.res exist and share the same reference.
 * @param {any} actor
 * @returns {Record<string, number>}
 */
function ensureResourceBucket(actor) {
  if (!actor) return Object.create(null);
  if (!actor.resources || typeof actor.resources !== "object") {
    actor.resources = Object.create(null);
  }
  if (!actor.res || actor.res !== actor.resources) {
    actor.res = actor.resources;
  }
  actor.resources.pools = actor.resources.pools || Object.create(null);
  actor.max = actor.max || Object.create(null);
  return actor.resources;
}

/**
 * Pull the base max for a pool from actor stats.
 * @param {any} actor
 * @param {"hp"|"stamina"|"mana"} key
 */
function baseMaxFor(actor, key) {
  if (!actor) return 0;
  const capKey = `max${key[0].toUpperCase()}${key.slice(1)}`;
  const baseStats = actor.base ?? actor.baseStats ?? Object.create(null);
  if (Number.isFinite(baseStats[capKey])) return Number(baseStats[capKey]);
  if (Number.isFinite(actor.baseStats?.[capKey])) return Number(actor.baseStats[capKey]);
  if (Number.isFinite(actor.max?.[key])) return Number(actor.max[key]);
  if (Number.isFinite(actor.resources?.pools?.[key]?.max)) {
    return Number(actor.resources.pools[key].max);
  }
  return 0;
}

/**
 * Compute per-turn regen for a single pool.
 * @param {number} cur
 * @param {number} max
 * @param {{ regenFlat?:Record<string,number>, regenPct?:Record<string,number> }} res
 * @param {{ regenFlat?:Record<string,number>, regenPct?:Record<string,number> }} sd
 * @param {"hp"|"stamina"|"mana"} key
 */
function regenFor(cur, max, res, sd, key) {
  const flat = (res.regenFlat?.[key] || 0) + (sd?.regenFlat?.[key] || 0);
  const pct = (res.regenPct?.[key] || 0) + (sd?.regenPct?.[key] || 0);
  const amount = flat + max * pct;
  return Math.max(0, amount);
}

function perTagCostFor(per, tag, key) {
  if (!per) return 0;
  if (per instanceof Map) {
    const entry = per.get(tag);
    if (entry && Number.isFinite(entry[key])) return Number(entry[key]);
    return 0;
  }
  if (typeof per === "object" && per[tag]) {
    const entry = per[tag];
    if (Number.isFinite(entry?.[key])) return Number(entry[key]);
  }
  return 0;
}

/**
 * Compute the effective cost for a pool.
 * @param {any} actor
 * @param {string} key
 * @param {number} baseCost
 * @param {Iterable<string>} [tags]
 */
function computeCost(actor, key, baseCost, tags = []) {
  const resMods = actor?.modCache?.resource || Object.create(null);
  const sd = actor?.statusDerived || Object.create(null);
  let cost = Math.max(0, Number(baseCost) || 0);
  const resMult = Number.isFinite(resMods.costMult?.[key]) ? resMods.costMult[key] : 1;
  const resFlat = Number(resMods.costFlat?.[key] || 0);
  const sdMult = Number.isFinite(sd.costMult?.[key]) ? sd.costMult[key] : 1;
  const sdFlat = Number(sd.costFlat?.[key] || 0);
  cost = cost * resMult * sdMult + resFlat + sdFlat;
  for (const tag of tags) {
    cost += perTagCostFor(resMods.costPerTag, tag, key);
    cost += perTagCostFor(sd.costPerTag, tag, key);
  }
  return Math.max(0, cost);
}

/**
 * Apply resource costs to an action given base cost and tags.
 * Multiplies by costMult, adds costFlat, and costPerTag when present.
 * @param {any} actor
 * @param {Record<string, number>} baseCosts
 * @param {Iterable<string>} [tags]
 */
export function spendResources(actor, baseCosts, tags = []) {
  if (!actor || !baseCosts) return;
  const store = ensureResourceBucket(actor);
  const tagList = Array.isArray(tags) ? tags : Array.from(tags || []);
  for (const [key, base] of Object.entries(baseCosts)) {
    const normalizedKey = /** @type {"hp"|"stamina"|"mana"} */ (key);
    const cost = computeCost(actor, normalizedKey, base, tagList);
    if (!Number.isFinite(cost) || cost <= 0) continue;
    const cur = Number(store[normalizedKey] || 0);
    const next = Math.max(0, cur - cost);
    store[normalizedKey] = next;
    if (store.pools?.[normalizedKey]) {
      store.pools[normalizedKey].cur = next;
    }
  }
}

/**
 * Tick all resources at turn start (after statuses are rebuilt).
 * Honors channeling flag (actor.modCache.resource.channeling) for bonus regen.
 * @param {any} actor
 */
export function tickResources(actor) {
  if (!actor) return;
  const store = ensureResourceBucket(actor);
  const res = actor?.modCache?.resource || Object.create(null);
  const sd = actor?.statusDerived || Object.create(null);
  const maxFlat = res.maxFlat || Object.create(null);
  const maxPct = res.maxPct || Object.create(null);
  const sdMaxFlat = sd?.maxFlat || Object.create(null);
  const sdMaxPct = sd?.maxPct || Object.create(null);
  const channelingBonusMap = sd?.channelingRegenPct || Object.create(null);
  const channelingActive = Boolean(res.channeling);

  for (const key of RESOURCE_KEYS) {
    const baseMax = baseMaxFor(actor, key);
    const pctBonus = (maxPct[key] || 0) + (sdMaxPct[key] || 0);
    const flatBonus = (maxFlat[key] || 0) + (sdMaxFlat[key] || 0);
    const max = Math.max(0, baseMax * (1 + pctBonus) + flatBonus);
    actor.max[key] = max;
    const cur = Number.isFinite(store[key]) ? Number(store[key]) : max;
    if (store.pools?.[key]) {
      store.pools[key].max = max;
    }
    const channelingBonusPct = channelingActive
      ? Number.isFinite(channelingBonusMap[key])
        ? channelingBonusMap[key]
        : 0.1
      : 0;
    const gain = regenFor(cur, max, res, sd, key) * (1 + channelingBonusPct);
    const next = Math.min(max, Math.max(0, cur + gain));
    store[key] = next;
    if (store.pools?.[key]) {
      store.pools[key].cur = next;
    }
  }

  actor.hp = store.hp;
  actor.stamina = store.stamina;
  actor.mana = store.mana;
}

/**
 * Compatibility wrapper for legacy callers.
 * @param {any} actor
 */
export function updateResources(actor) {
  tickResources(actor);
}

/**
 * Legacy regen wrapper for compatibility with tests/utilities.
 * @param {any} actor
 */
export function regenTurn(actor) {
  tickResources(actor);
}

/**
 * Returns true when the actor can afford an action's resource cost.
 * @param {any} actor
 * @param {{ resourceCost?: Record<string, number>, tags?: Iterable<string> }} action
 */
export function canPay(actor, action) {
  if (!actor) return false;
  const costs = action?.resourceCost || Object.create(null);
  const tags = action?.tags ? Array.from(action.tags) : [];
  const store = ensureResourceBucket(actor);
  for (const [key, base] of Object.entries(costs)) {
    const normalizedKey = /** @type {"hp"|"stamina"|"mana"} */ (key);
    const cost = computeCost(actor, normalizedKey, base, tags);
    if (cost <= 0) continue;
    const cur = Number(store[normalizedKey] || 0);
    if (cur < cost) return false;
  }
  return true;
}

/**
 * Applies the action's resource cost to the actor using spendResources().
 * @param {any} actor
 * @param {{ resourceCost?: Record<string, number>, tags?: Iterable<string> }} action
 */
export function spend(actor, action) {
  const costs = action?.resourceCost || Object.create(null);
  const tags = action?.tags ? Array.from(action.tags) : [];
  spendResources(actor, costs, tags);
}

/**
 * Apply configured on-kill resource gains to an actor.
 * @param {any} actor
 * @param {Record<string, number>} gains
 */
export function applyOnKillResourceGain(actor, gains) {
  if (!actor || !gains || typeof gains !== "object") return null;
  const pools = ensureResourcePools(actor);
  const applied = Object.create(null);
  for (const [pool, rawAmount] of Object.entries(gains)) {
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount === 0) continue;
    if (pool === "hp") {
      const before = getPrimaryResource(actor, "hp");
      if (before === null) continue;
      const max = getPrimaryResourceMax(actor, "hp");
      const after = clamp(before + amount, 0, max);
      setPrimaryResource(actor, "hp", after);
      const delta = after - before;
      if (delta !== 0) applied[pool] = delta;
      continue;
    }
    const state = pools?.[pool];
    if (state) {
      const before = Number(state.cur || 0);
      const max = Number.isFinite(state.max) ? Number(state.max) : before;
      const after = clamp(before + amount, 0, max);
      state.cur = after;
      syncPrimaryMirror(actor, pool, after);
      const delta = after - before;
      if (delta !== 0) applied[pool] = delta;
      continue;
    }
    const before = getPrimaryResource(actor, pool);
    if (before === null) continue;
    const max = getPrimaryResourceMax(actor, pool);
    const after = clamp(before + amount, 0, max);
    setPrimaryResource(actor, pool, after);
    const delta = after - before;
    if (delta !== 0) applied[pool] = delta;
  }
  return Object.keys(applied).length ? applied : null;
}

/**
 * Applies event-based resource gains (on move/hit/crit/kill).
 * Maintains legacy pool structure for modules still using it.
 * @param {any} actor
 * @param {{ kind: "move"|"hit"|"crit"|"kill", amount?: number }} evt
 */
export function eventGain(actor, evt) {
  if (!actor?.resources?.pools || !evt) return;
  for (const state of Object.values(actor.resources.pools)) {
    if (!state) continue;
    let gain = Number(evt.amount || 0);
    switch (evt.kind) {
      case "move":
        gain += Number(state.onMoveGain || 0);
        break;
      case "hit":
        gain += Number(state.onHitGain || 0);
        break;
      case "crit":
        gain += Number(state.onCritGain || 0);
        break;
      case "kill":
        gain += Number(state.onKillGain || 0);
        break;
      default:
        break;
    }
    if (!gain) continue;
    const cur = Number(state.cur || 0);
    const max = Number.isFinite(state.max) ? Number(state.max) : Number.POSITIVE_INFINITY;
    state.cur = Math.min(max, Math.max(0, cur + gain));
  }
}

function ensureResourcePools(actor) {
  if (!actor) return Object.create(null);
  const store = ensureResourceBucket(actor);
  if (!store.pools || typeof store.pools !== "object") {
    store.pools = Object.create(null);
  }
  if (actor.res) {
    actor.res.pools = store.pools;
  }
  return store.pools;
}

function getPrimaryResource(actor, key) {
  if (!actor) return null;
  if (actor.res && key in actor.res) {
    const value = Number(actor.res[key]);
    if (Number.isFinite(value)) return value;
  }
  if (actor.resources && key in actor.resources) {
    const value = Number(actor.resources[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function getPrimaryResourceMax(actor, key) {
  const pools = actor?.resources?.pools || actor?.res?.pools;
  const state = pools?.[key];
  if (state && Number.isFinite(state.max)) {
    return Number(state.max);
  }
  switch (key) {
    case "hp":
      return pickNumber(
        actor?.resources?.hpMax,
        actor?.res?.hpMax,
        actor?.base?.maxHP,
        actor?.baseStats?.maxHP,
      );
    case "stamina":
      return pickNumber(
        actor?.resources?.staminaMax,
        actor?.res?.staminaMax,
        actor?.base?.maxStamina,
        actor?.baseStats?.maxStamina,
      );
    case "mana":
      return pickNumber(
        actor?.resources?.manaMax,
        actor?.res?.manaMax,
        actor?.base?.maxMana,
        actor?.baseStats?.maxMana,
      );
    default:
      if (state && Number.isFinite(state.cur)) return Number(state.cur);
      return pickNumber(actor?.resources?.max?.[key], actor?.res?.max?.[key]);
  }
}

function setPrimaryResource(actor, key, value) {
  if (!actor) return;
  if (actor.res && key in actor.res) {
    actor.res[key] = value;
  }
  if (actor.resources && key in actor.resources) {
    actor.resources[key] = value;
  }
  if (key === "hp" && typeof actor.hp === "number") {
    actor.hp = value;
  } else if (key === "stamina" && typeof actor.stamina === "number") {
    actor.stamina = value;
  } else if (key === "mana" && typeof actor.mana === "number") {
    actor.mana = value;
  }
  syncPrimaryMirror(actor, key, value);
}

function syncPrimaryMirror(actor, key, value) {
  if (!actor) return;
  if (actor.resources?.pools?.[key]) {
    actor.resources.pools[key].cur = value;
  }
  if (actor.res?.pools?.[key]) {
    actor.res.pools[key].cur = value;
  }
}

function pickNumber(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return 0;
}

function clamp(value, min, max) {
  if (!Number.isFinite(min)) min = Number.NEGATIVE_INFINITY;
  if (!Number.isFinite(max)) max = Number.POSITIVE_INFINITY;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Returns true when actor is out (dead/defeated).
 * @param {any} actor
 */
export function isDefeated(actor) {
  if (!actor) return false;
  const store = actor.resources || actor.res;
  let hp = Number(store?.hp);
  if (!Number.isFinite(hp)) {
    hp = Number(actor?.hp);
  }
  if (!Number.isFinite(hp)) {
    return false;
  }
  return hp <= HEALTH_FLOOR;
}
