// src/combat/resources.js
// @ts-check

import {
  BASE_PASSIVE_REGEN,
  CHANNELING_REGEN_MULT,
  HEALTH_FLOOR,
  RESOURCE_FLOOR,
} from "../../constants.js";
import { hasStatus } from "./status.js";

/**
 * @typedef {Object} ResourceState
 * @property {number} cur
 * @property {number} max
 * @property {number} regenPerTurn
 * @property {number} [onMoveGain]
 * @property {number} [onHitGain]
 * @property {number} [onCritGain]
 * @property {number} [onKillGain]
 * @property {Record<string, number>} [spendMultipliers]
 * @property {number} [minToUse]
 * @property {number} [baseMax]
 */

/**
 * @typedef {{ kind: "move"|"hit"|"crit"|"kill", amount?: number }} ResourceEvent
 */

/**
 * Applies per-turn regeneration and clamps values.
 * Call after statuses tick (or before, by your chosen order—see loop below).
 * @param {import("./actor.js").Actor} actor
 */
export function updateResources(actor) {
  if (!actor) return;

  const pool = ensureResourcePool(actor);
  const baseStats = actor.base ?? actor.baseStats ?? {};
  const base = BASE_PASSIVE_REGEN;
  const sd = actor.statusDerived || {};
  const mods = actor.modCache?.resource || {};

  const regenFlat = {
    hp: (sd.regenFlat?.hp ?? 0) + (sd.regen?.hp ?? 0) + (mods.regenFlat?.hp ?? 0),
    stamina: (sd.regenFlat?.stamina ?? 0) + (sd.regen?.stamina ?? 0) + (mods.regenFlat?.stamina ?? 0),
    mana: (sd.regenFlat?.mana ?? 0) + (sd.regen?.mana ?? 0) + (mods.regenFlat?.mana ?? 0),
  };
  const regenPct = {
    hp: (sd.regenPct?.hp ?? 0) + (mods.regenPct?.hp ?? 0),
    stamina: (sd.regenPct?.stamina ?? 0) + (mods.regenPct?.stamina ?? 0),
    mana: (sd.regenPct?.mana ?? 0) + (mods.regenPct?.mana ?? 0),
  };

  const baseStamina = pickFirstFinite(baseStats.maxStamina, actor.baseStats?.maxStamina);
  const staminaMaxBase = baseStamina + (mods.maxFlat?.stamina ?? 0);
  const staminaMax = Math.max(
    0,
    Math.round(staminaMaxBase * (1 + (mods.maxPct?.stamina ?? 0))),
  );

  const baseMana = pickFirstFinite(baseStats.maxMana, actor.baseStats?.maxMana);
  const manaMaxBase = baseMana + (mods.maxFlat?.mana ?? 0);
  const manaMax = Math.max(
    0,
    Math.round(manaMaxBase * (1 + (mods.maxPct?.mana ?? 0))),
  );

  const baseHP = pickFirstFinite(baseStats.maxHP, actor.baseStats?.maxHP);
  const hpMaxBase = baseHP + (mods.maxFlat?.hp ?? 0);
  const hpMax = Math.max(
    0,
    Math.round(hpMaxBase * (1 + (mods.maxPct?.hp ?? 0))),
  );

  const channelingActive = hasStatus(actor, "channeling") && actor.modCache?.resource?.channeling;
  const channelingMult = channelingActive ? CHANNELING_REGEN_MULT : 1;

  const hpGain = (base.hp + regenFlat.hp + hpMax * (regenPct.hp ?? 0)) * channelingMult;
  const hpCap = hpMax || baseHP;
  pool.hp = clamp(pool.hp + hpGain, HEALTH_FLOOR, Number.isFinite(hpCap) ? hpCap : pool.hp);

  const staminaGain = (base.stamina + regenFlat.stamina + staminaMax * (regenPct.stamina ?? 0)) * channelingMult;
  const staminaCap = staminaMax || baseStamina;
  pool.stamina = clamp(
    pool.stamina + staminaGain,
    RESOURCE_FLOOR,
    Number.isFinite(staminaCap) ? staminaCap : pool.stamina,
  );

  const manaGain = (base.mana + regenFlat.mana + manaMax * (regenPct.mana ?? 0)) * channelingMult;
  const manaCap = manaMax || baseMana;
  pool.mana = clamp(
    pool.mana + manaGain,
    RESOURCE_FLOOR,
    Number.isFinite(manaCap) ? manaCap : pool.mana,
  );

  actor.res = pool;
  actor.resources = pool;
  if (typeof actor.hp === "number") actor.hp = pool.hp;
  if (typeof actor.stamina === "number") actor.stamina = pool.stamina;
  if (typeof actor.mana === "number") actor.mana = pool.mana;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Returns true when actor is out (dead/defeated).
 * @param {import("./actor.js").Actor} actor
 */
export function isDefeated(actor) {
  if (!actor) return false;
  const pool = actor.resources || actor.res;
  const hp = Number.isFinite(pool?.hp) ? pool.hp : 0;
  return hp <= HEALTH_FLOOR;
}

function ensureResourcePool(actor) {
  if (!actor) return { hp: 0, stamina: 0, mana: 0 };

  const baseStats = actor.base ?? actor.baseStats ?? {};
  const source =
    (actor.resources && typeof actor.resources === "object" && actor.resources)
    || (actor.res && typeof actor.res === "object" && actor.res)
    || { hp: 0, stamina: 0, mana: 0 };

  source.hp = pickFirstFinite(source.hp, actor.res?.hp, actor.resources?.hp, baseStats.maxHP, actor.baseStats?.maxHP);
  source.stamina = pickFirstFinite(
    source.stamina,
    actor.res?.stamina,
    actor.resources?.stamina,
    baseStats.maxStamina,
    actor.baseStats?.maxStamina,
  );
  source.mana = pickFirstFinite(source.mana, actor.res?.mana, actor.resources?.mana, baseStats.maxMana, actor.baseStats?.maxMana);

  if (!source.pools || typeof source.pools !== "object") {
    source.pools = Object.create(null);
  }
  actor.resources = source;
  actor.res = source;
  return source;
}

function pickFirstFinite(...values) {
  for (const value of values) {
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

/**
 * Returns true when the actor can afford an action's resource cost.
 * @param {import("./actor.js").Actor} actor
 * @param {{ resourceCost?: Record<string, number>, tags?: string[] }} action
 */
export function canPay(actor, action) {
  const pools = actor?.resources?.pools || {};
  const need = action?.resourceCost || {};
  const tags = Array.isArray(action?.tags) ? action.tags : [];
  for (const [pool, baseCost] of Object.entries(need)) {
    const state = pools[pool];
    if (!state) return false;
    const mult = tags.reduce(
      (acc, tag) => acc * (state.spendMultipliers?.[tag] || 1),
      1,
    );
    const base = Number(baseCost || 0);
    const cost = Math.ceil(base * mult);
    if (
      Number.isFinite(state.minToUse) &&
      Number(state.minToUse || 0) > Number(state.cur || 0)
    ) {
      return false;
    }
    if (cost > 0 && Number(state.cur || 0) < cost) return false;
  }
  return true;
}

/**
 * Applies the action's resource cost to the actor.
 * @param {import("./actor.js").Actor} actor
 * @param {{ resourceCost?: Record<string, number>, tags?: string[] }} action
 */
export function spend(actor, action) {
  const pools = actor?.resources?.pools || {};
  const need = action?.resourceCost || {};
  const tags = Array.isArray(action?.tags) ? action.tags : [];
  for (const [pool, baseCost] of Object.entries(need)) {
    const state = pools[pool];
    if (!state) continue;
    const mult = tags.reduce(
      (acc, tag) => acc * (state.spendMultipliers?.[tag] || 1),
      1,
    );
    const base = Number(baseCost || 0);
    const cost = Math.ceil(base * mult);
    if (cost <= 0) continue;
    const next = Math.max(0, Number(state.cur || 0) - cost);
    state.cur = next;
  }
}

/**
 * Applies per-turn resource regeneration, clamping to max.
 * @param {import("./actor.js").Actor} actor
 */
export function regenTurn(actor) {
  if (!actor?.resources?.pools) return;
  const channelingActive = hasStatus(actor, "channeling") && actor.modCache?.resource?.channeling;
  const mult = channelingActive ? CHANNELING_REGEN_MULT : 1;
  for (const state of Object.values(actor.resources.pools)) {
    if (!state) continue;
    const gain = Number(state.regenPerTurn || 0) * mult;
    const next = Number(state.cur || 0) + gain;
    const max = state.max ?? Number.MAX_SAFE_INTEGER;
    state.cur = Math.min(max, Math.max(0, next));
  }
}

/**
 * Applies event-based resource gains (on move/hit/crit/kill).
 * @param {import("./actor.js").Actor} actor
 * @param {ResourceEvent} evt
 */
export function eventGain(actor, evt) {
  if (!actor?.resources?.pools || !evt) return;
  for (const state of Object.values(actor.resources.pools)) {
    if (!state) continue;
    let gain = 0;
    switch (evt.kind) {
      case "move":
        gain += state.onMoveGain || 0;
        break;
      case "hit":
        gain += state.onHitGain || 0;
        break;
      case "crit":
        gain += state.onCritGain || 0;
        break;
      case "kill":
        gain += state.onKillGain || 0;
        break;
      default:
        break;
    }
    if (evt.amount) gain += evt.amount;
    if (gain) {
      const next = Number(state.cur || 0) + gain;
      const max = state.max ?? Number.MAX_SAFE_INTEGER;
      state.cur = Math.min(max, Math.max(0, next));
    }
  }
}

