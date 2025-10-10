// src/combat/actor.js
// @ts-check
import { ALL_SLOTS_ORDER, SLOT } from "../../constants.js";

/**
 * @typedef {import("../../item-system.js").Item} Item
 * @typedef {import("../../item-system.js").ItemStack} ItemStack
 */

/**
 * @typedef {Object} BaseStats
 * @property {number} str
 * @property {number} dex
 * @property {number} int
 * @property {number} vit
 * @property {number} maxHP
 * @property {number} maxStamina
 * @property {number} maxMana
 * @property {number} baseSpeed    // AP scaling anchor (1.0 = baseline)
 */

/**
 * @typedef {Object} Resources
 * @property {number} hp
 * @property {number} stamina
 * @property {number} mana
 */

/**
 * @typedef {Object} ModCache
 * @property {Record<string, number>} resists     // e.g., { fire: 0.25, cold: 0 }
 * @property {Record<string, number>} affinities  // e.g., { fire: 0.10 }
 * @property {Set<string>} immunities             // e.g., new Set(["poison"])
 * @property {number} dmgMult                     // global outgoing damage multiplier
 * @property {number} speedMult                   // < 1 faster, > 1 slower (AP)
 * @property {Array<Object>} brands               // normalized brand mods on the actor
 */

/**
 * Minimal brand payload (extend as needed later)
 * @typedef {Object} BrandMod
 * @property {"brand"} kind
 * @property {string} [id]
 * @property {string} [type]       // elemental type (e.g., "fire")
 * @property {number} [flat]       // flat add
 * @property {number} [pct]        // +% outgoing for that type
 */

/**
 * @typedef {Object} StatusInstance
 * @property {string} id
 * @property {number} stacks
 * @property {number} remaining    // turns
 * @property {any}     payload
 */

/**
 * @typedef {Object} ActorInit
 * @property {string} id
 * @property {string} [name]
 * @property {BaseStats} baseStats
 * @property {Partial<Record<keyof typeof SLOT, Item|ItemStack>>} [equipment]
 */

/**
 * Actor = stats + equipment + folded mods + statuses + resources
 */
export class Actor {
  /**
   * @param {ActorInit} init
   */
  constructor(init) {
    this.id = init.id;
    this.name = init.name ?? init.id;

    /** @type {BaseStats} */
    this.base = { ...init.baseStats };

    /** @type {Partial<Record<string, Item|ItemStack>>} */
    this.equipment = {};
    for (const slot of ALL_SLOTS_ORDER) {
      if (init.equipment?.[slot]) this.equipment[slot] = init.equipment[slot];
    }

    /** @type {StatusInstance[]} */
    this.statuses = [];

    /** @type {ModCache} */
    this.modCache = {
      resists: Object.create(null),
      affinities: Object.create(null),
      immunities: new Set(),
      dmgMult: 1.0,
      speedMult: 1.0,
      brands: [],
    };

    /** @type {Resources} */
    this.res = {
      hp: this.base.maxHP,
      stamina: this.base.maxStamina,
      mana: this.base.maxMana,
    };
  }

  /**
   * Replaces modCache after folding (call fold in mod-folding).
   * @param {ModCache} folded
   */
  setFoldedMods(folded) {
    this.modCache = folded;
  }

  /**
   * @param {string} type
   * @returns {boolean}
   */
  isImmune(type) {
    return this.modCache.immunities.has(type);
  }

  /**
   * Fetch resistance (0..1; defensive).
   * @param {string} type
   */
  resistOf(type) {
    return this.modCache.resists[type] ?? 0;
  }

  /**
   * Affinity (offensive bonus, signed).
   * @param {string} type
   */
  affinityOf(type) {
    return this.modCache.affinities[type] ?? 0;
  }

  /**
   * Equipment accessors
   */
  equip(slot, itemOrStack) {
    this.equipment[slot] = itemOrStack;
  }
  unequip(slot) {
    const it = this.equipment[slot];
    delete this.equipment[slot];
    return it;
  }
}
