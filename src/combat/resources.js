// src/combat/resources.js
// @ts-check

/**
 * Applies per-turn regeneration and clamps values.
 * Call after statuses tick (or before, by your chosen order—see loop below).
 * @param {import("./actor.js").Actor} actor
 */
export function updateResources(actor) {
  if (!actor) return;

  // Base passive regen (customize per your game)
  const base = { hp: 0, stamina: 1, mana: 1 };

  // Status-derived additions:
  const add = actor.statusDerived?.regen ?? { hp: 0, stamina: 0, mana: 0 };

  actor.res.hp = clamp(actor.res.hp + (base.hp + (add.hp ?? 0)), 0, actor.base.maxHP);
  actor.res.stamina = clamp(
    actor.res.stamina + (base.stamina + (add.stamina ?? 0)),
    0,
    actor.base.maxStamina,
  );
  actor.res.mana = clamp(actor.res.mana + (base.mana + (add.mana ?? 0)), 0, actor.base.maxMana);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Returns true when actor is out (dead/defeated).
 * @param {import("./actor.js").Actor} actor
 */
export function isDefeated(actor) {
  return actor.res.hp <= 0;
}
