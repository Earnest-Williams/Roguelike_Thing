// src/content/mobs.js
// @ts-check
/** @type {Record<string, any>} */
export const MOB_TEMPLATES = {
  "dummy": {
    id: "dummy", name: "Training Dummy",
    baseStats: { str: 5, dex: 5, int: 5, vit: 8, maxHP: 35, maxStamina: 10, maxMana: 0, baseSpeed: 1.0 },
    equipment: {},
    actions: ["strike"],
  },
  "brigand": {
    id: "brigand", name: "Brigand",
    baseStats: { str: 9, dex: 9, int: 6, vit: 9, maxHP: 24, maxStamina: 12, maxMana: 0, baseSpeed: 1.0 },
    loadout: ["short_sword"], // resolved by factory
    actions: ["strike", "move_towards_target"],
  },
  "pyromancer": {
    id: "pyromancer", name: "Pyromancer",
    baseStats: { str: 5, dex: 7, int: 12, vit: 8, maxHP: 20, maxStamina: 8, maxMana: 16, baseSpeed: 1.0 },
    loadout: ["flame_sword", "cloak_cold"],
    innate: { affinities: { fire: 0.10 } },
    actions: ["fire_bolt", "strike"],
  },
};
