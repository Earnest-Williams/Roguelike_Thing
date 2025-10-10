// src/combat/actor.js
// @ts-check
import {
  ALL_SLOTS_ORDER,
  BASE_DAMAGE_MULTIPLIER,
  BASE_SPEED_MULTIPLIER,
  DEFAULT_AP_CAP,
  DEFAULT_BASE_ACTION_AP,
  MIN_TOTAL_ACTION_COST_MULTIPLIER,
  MIN_TOTAL_COOLDOWN_MULTIPLIER,
  SLOT,
} from "../../constants.js";
import { rebuildStatusDerived } from "./status.js";

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
 * @typedef {Object} ChannelingState
 * @property {string} [statusId]
 * @property {boolean} [breakOnMove]
 * @property {boolean} [moved]
 * @property {(actor: any) => void} [onBreak]
 * @property {number} [turn]
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
 * @property {number} endsAtTurn
 * @property {number} [nextTickAt]
 * @property {string} [source]
 * @property {number} [potency]
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

    /** @type {import("./status.js").StatusDerived} */
    this.statusDerived = rebuildStatusDerived(this);

    /** @type {ModCache} */
    this.modCache = {
      resists: Object.create(null),
      affinities: Object.create(null),
      immunities: new Set(),
      dmgMult: BASE_DAMAGE_MULTIPLIER,
      speedMult: BASE_SPEED_MULTIPLIER,
      brands: [],
    };

    /** @type {Resources} */
    this.res = {
      hp: this.base.maxHP,
      stamina: this.base.maxStamina,
      mana: this.base.maxMana,
    };

    /** @type {ChannelingState|null} */
    this.channeling = null;

    // Temporal state
    /** @type {number} */
    this.ap = 0;
    /** @type {number} */
    this.apCap = DEFAULT_AP_CAP;
    /** @type {number} */
    this.baseActionAP = DEFAULT_BASE_ACTION_AP;

    /** @type {Record<string, number>} */
    this.cooldowns = Object.create(null);
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
   * Returns the combined speed multiplier (modCache.speedMult adjusted by statusDerived.actionSpeedPct).
   * Lower is faster (<1). Use when computing AP cost.
   */
  totalActionCostMult() {
    const pct = this.statusDerived?.actionSpeedPct ?? 0;
    const mult = this.modCache.speedMult * (1 + pct);
    return Math.max(MIN_TOTAL_ACTION_COST_MULTIPLIER, mult);
  }

  totalCooldownMult() {
    const pct = this.statusDerived?.actionSpeedPct ?? 0;
    return Math.max(MIN_TOTAL_COOLDOWN_MULTIPLIER, 1 + pct / 100);
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
