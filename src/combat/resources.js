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

  const staminaMaxBase = actor.base.maxStamina + (mods.maxFlat?.stamina ?? 0);
  const staminaMax = Math.max(0, Math.round(staminaMaxBase * (1 + (mods.maxPct?.stamina ?? 0))));
  const manaMaxBase = actor.base.maxMana + (mods.maxFlat?.mana ?? 0);
  const manaMax = Math.max(0, Math.round(manaMaxBase * (1 + (mods.maxPct?.mana ?? 0))));
  const hpMaxBase = actor.base.maxHP + (mods.maxFlat?.hp ?? 0);
  const hpMax = Math.max(0, Math.round(hpMaxBase * (1 + (mods.maxPct?.hp ?? 0))));

  const hpGain = base.hp + regenFlat.hp + hpMax * (regenPct.hp ?? 0);
  actor.res.hp = clamp(actor.res.hp + hpGain, HEALTH_FLOOR, hpMax || actor.base.maxHP);

  const staminaGain = base.stamina + regenFlat.stamina + staminaMax * (regenPct.stamina ?? 0);
  actor.res.stamina = clamp(actor.res.stamina + staminaGain, RESOURCE_FLOOR, staminaMax || actor.base.maxStamina);

  const manaGain = base.mana + regenFlat.mana + manaMax * (regenPct.mana ?? 0);
  actor.res.mana = clamp(actor.res.mana + manaGain, RESOURCE_FLOOR, manaMax || actor.base.maxMana);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Returns true when actor is out (dead/defeated).
 * @param {import("./actor.js").Actor} actor
 */
export function isDefeated(actor) {
  return actor.res.hp <= HEALTH_FLOOR;
}
