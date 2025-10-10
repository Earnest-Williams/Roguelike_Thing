// src/combat/resources.js
// @ts-check

import {
  BASE_PASSIVE_REGEN,
  DEFAULT_REGEN_HP_PER_TURN,
  DEFAULT_REGEN_MANA_PER_TURN,
  DEFAULT_REGEN_STAMINA_PER_TURN,
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

  // Base passive regen (customize per your game)
  const base = BASE_PASSIVE_REGEN;

  // Status-derived additions:
  const add =
    actor.statusDerived?.regen ?? {
      hp: DEFAULT_REGEN_HP_PER_TURN,
      stamina: DEFAULT_REGEN_STAMINA_PER_TURN,
      mana: DEFAULT_REGEN_MANA_PER_TURN,
    };

  actor.res.hp = clamp(
    actor.res.hp + (base.hp + (add.hp ?? 0)),
    HEALTH_FLOOR,
    actor.base.maxHP,
  );
  actor.res.stamina = clamp(
    actor.res.stamina + (base.stamina + (add.stamina ?? 0)),
    RESOURCE_FLOOR,
    actor.base.maxStamina,
  );
  actor.res.mana = clamp(
    actor.res.mana + (base.mana + (add.mana ?? 0)),
    RESOURCE_FLOOR,
    actor.base.maxMana,
  );
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
