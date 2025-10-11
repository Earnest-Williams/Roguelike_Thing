// src/content/actions.js
// @ts-check

export const ACTIONS = {
  strike: {
    id: "strike",
    baseAP: 4,
    baseCooldown: 0,
    tags: ["melee"],
    resourceCost: { stamina: 6 },
    exec(attacker, ctx) {
      return attacker?.performMelee?.(ctx);
    },
  },
  fire_bolt: {
    id: "fire_bolt",
    baseAP: 6,
    baseCooldown: 4,
    tags: ["spell", "cast"],
    resourceCost: { mana: 8 },
    exec(attacker, ctx) {
      return attacker?.performSpell?.("fire", ctx);
    },
  },
};

