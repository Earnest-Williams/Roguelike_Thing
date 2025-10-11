// src/combat/resources.js
// @ts-check

import {
  BASE_PASSIVE_REGEN,
  HEALTH_FLOOR,
  RESOURCE_FLOOR,
} from "../../constants.js";

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

  const hpGain = base.hp + regenFlat.hp + hpMax * (regenPct.hp ?? 0);
  const hpCap = hpMax || baseHP;
  pool.hp = clamp(pool.hp + hpGain, HEALTH_FLOOR, Number.isFinite(hpCap) ? hpCap : pool.hp);

  const staminaGain = base.stamina + regenFlat.stamina + staminaMax * (regenPct.stamina ?? 0);
  const staminaCap = staminaMax || baseStamina;
  pool.stamina = clamp(
    pool.stamina + staminaGain,
    RESOURCE_FLOOR,
    Number.isFinite(staminaCap) ? staminaCap : pool.stamina,
  );

  const manaGain = base.mana + regenFlat.mana + manaMax * (regenPct.mana ?? 0);
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
