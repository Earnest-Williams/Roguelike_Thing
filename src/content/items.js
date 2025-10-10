// src/content/items.js
// @ts-check
import { SLOT } from "../../constants.js";

/** @type {Record<string, any>} */
export const BASE_ITEMS = {
  // simple melee
  "short_sword": {
    id: "short_sword",
    name: "Short Sword",
    kind: "weapon",
    equipSlots: [SLOT.RightHand, SLOT.LeftHand, SLOT.Belt1, SLOT.Belt2],
    handsRequired: 1,
    dims: { l: 75, w: 5, h: 3 },
    mass: 1.2,
    weaponProfile: {
      category: "melee",
      range: { min: 0, optimal: 1, max: 1 },
      damage: { diceCount: 1, diceSides: 6, bonus: 1 },
    },
  },

  // elemental exemplar
  "flame_sword": {
    id: "flame_sword",
    name: "Flame Sword",
    kind: "weapon",
    equipSlots: [SLOT.RightHand, SLOT.LeftHand, SLOT.Belt1, SLOT.Belt2],
    handsRequired: 1,
    dims: { l: 100, w: 5, h: 3 },
    mass: 1.6,
    weaponProfile: {
      category: "melee",
      range: { min: 0, optimal: 1, max: 1 },
      damage: { diceCount: 1, diceSides: 8, bonus: 1 },
    },
    brands: [{ id: "fire_edge", kind: "brand", type: "fire", flat: 3, pct: 0.10 }],
    affinities: { fire: 0.05 },
    resists: { fire: 0.05 },
  },

  // ranged exemplar
  "short_bow": {
    id: "short_bow",
    name: "Short Bow",
    kind: "weapon",
    equipSlots: [SLOT.LeftHand, SLOT.RightHand, SLOT.Belt1, SLOT.Belt2],
    handsRequired: 2,
    dims: { l: 110, w: 8, h: 3 },
    mass: 1.0,
    weaponProfile: {
      category: "bow",
      range: { min: 2, optimal: 7, max: 9 },
      reloadTime: 1,
      aimTime: 1,
      volley: 1,
      ammo: { type: "arrow", itemId: "arrow_wood", consumesItem: true },
      damage: { diceCount: 1, diceSides: 6, bonus: 1 },
      accuracy: 0.1,
    },
  },

  // defenses
  "cloak_cold": {
    id: "cloak_cold",
    name: "Cloak of Winter",
    kind: "armor",
    equipSlots: [SLOT.Cloak],
    dims: { l: 50, w: 35, h: 10 },
    mass: 1.2,
    resists: { cold: 0.25 },
  },
};
