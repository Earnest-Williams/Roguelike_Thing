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
import { rebuildDerived } from "./status.js";

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
 * @property {Record<string, import("./resources.js").ResourceState>} [pools]
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
 * @property {Record<string, any>} attunementRules
 * @property {{ conversions: any[], brandAdds: any[], affinities: Record<string, number>, polarity: { onHitBias: Record<string, number> } }} offense
 * @property {{ resists: Record<string, number>, immunities: Set<string>, polarity: { defenseBias: Record<string, number> } }} defense
 * @property {{
 *   actionSpeedPct: number,
 *   moveAPDelta: number,
 *   moveAPPct: number,
 *   moveAPMult: number,
 *   baseActionAPDelta: number,
 *   baseActionAPPct: number,
 *   baseActionAPMult: number,
 *   apGainFlat: number,
 *   apGainPct: number,
 *   apGainMult: number,
 *   apCapFlat: number,
 *   apCapPct: number,
 *   apCapMult: number,
 *   initiativeFlat: number,
 *   initiativePct: number,
 *   initiativeMult: number,
 *   cooldownMult: number,
 *   cooldownPerTag: Map<string, number>,
 *   echo: any,
 *   onKillHaste: any,
 * }} temporal
 * @property {{
 *   maxFlat: Record<string, number>,
 *   maxPct: Record<string, number>,
 *   regenFlat: Record<string, number>,
 *   regenPct: Record<string, number>,
 *   startFlat: Record<string, number>,
 *   startPct: Record<string, number>,
 *   gainFlat: Record<string, number>,
 *   gainPct: Record<string, number>,
 *   leechFlat: Record<string, number>,
 *   leechPct: Record<string, number>,
 *   costFlat: Record<string, number>,
 *   costMult: Record<string, number>,
 *   costPerTag: Map<string, Record<string, number>>,
 *   onHitGain: any,
 *   onKillGain: any,
 *   onSpendGain: any,
 *   onSpendRefund: any,
 *   channeling: boolean,
 * }} resource
 * @property {{ inflictBonus: Record<string, number>, inflictDurMult: Record<string, number>, resistBonus: Record<string, number>, recvDurMult: Record<string, number>, buffDurMult: number, freeActionIgnore: Set<string>, freeActionCooldown: number, freeActionPurge: boolean }} status
 * @property {{ grant?: Record<string, number>, onHitBias?: Record<string, number>, defenseBias?: Record<string, number> }} polarity
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
    this.statusDerived = rebuildDerived(this);

    /** @type {ModCache} */
    this.modCache = {
      resists: Object.create(null),
      affinities: Object.create(null),
      immunities: new Set(),
      dmgMult: BASE_DAMAGE_MULTIPLIER,
      speedMult: BASE_SPEED_MULTIPLIER,
      brands: [],
      attunementRules: Object.create(null),
      offense: {
        conversions: [],
        brandAdds: [],
        brands: [],
        affinities: Object.create(null),
        polarity: { grant: Object.create(null), onHitBias: {} },
      },
      defense: {
        resists: Object.create(null),
        immunities: new Set(),
        polarity: { grant: Object.create(null), defenseBias: {} },
      },
      temporal: {
        actionSpeedPct: 0,
        moveAPDelta: 0,
        moveAPPct: 0,
        moveAPMult: 1,
        baseActionAPDelta: 0,
        baseActionAPPct: 0,
        baseActionAPMult: 1,
        apGainFlat: 0,
        apGainPct: 0,
        apGainMult: 1,
        apCapFlat: 0,
        apCapPct: 0,
        apCapMult: 1,
        initiativeFlat: 0,
        initiativePct: 0,
        initiativeMult: 1,
        cooldownMult: 1,
        cooldownPerTag: new Map(),
        echo: null,
        onKillHaste: null,
      },
      resource: {
        maxFlat: { hp: 0, stamina: 0, mana: 0 },
        maxPct: { hp: 0, stamina: 0, mana: 0 },
        regenFlat: { hp: 0, stamina: 0, mana: 0 },
        regenPct: { hp: 0, stamina: 0, mana: 0 },
        startFlat: { hp: 0, stamina: 0, mana: 0 },
        startPct: { hp: 0, stamina: 0, mana: 0 },
        gainFlat: { hp: 0, stamina: 0, mana: 0 },
        gainPct: { hp: 0, stamina: 0, mana: 0 },
        leechFlat: { hp: 0, stamina: 0, mana: 0 },
        leechPct: { hp: 0, stamina: 0, mana: 0 },
        costFlat: { hp: 0, stamina: 0, mana: 0 },
        costMult: { hp: 1, stamina: 1, mana: 1 },
        costPerTag: new Map(),
        onHitGain: null,
        onKillGain: null,
        onSpendGain: null,
        onSpendRefund: null,
        channeling: false,
      },
      status: {
        inflictBonus: Object.create(null),
        inflictDurMult: Object.create(null),
        resistBonus: Object.create(null),
        recvDurMult: Object.create(null),
        buffDurMult: 1,
        freeActionIgnore: new Set(),
        freeActionCooldown: 0,
        freeActionPurge: false,
      },
      polarity: { grant: Object.create(null) },
    };

    // Track per-type attunement runtime state (rules + live stacks).
    /** @type {{ rules: Record<string, any>, stacks: Record<string, number> }} */
    this.attunement = this.attunement || {};
    this.attunement.rules = this.attunement.rules || Object.create(null);
    this.attunement.stacks = this.attunement.stacks || Object.create(null);

    /** @type {Resources & { pools?: Record<string, import("./resources.js").ResourceState> }} */
    this.res = {
      hp: this.base.maxHP,
      stamina: this.base.maxStamina,
      mana: this.base.maxMana,
      pools: Object.create(null),
    };
    /** @type {Resources & { pools?: Record<string, import("./resources.js").ResourceState> }} */
    this.resources = this.res;

    // Seed primary resource pools so temporal/resource folding can build on top
    // of per-class baselines (e.g., stamina, mana). Equipment/status deltas are
    // applied relative to these defaults inside foldModsFromEquipment.
    const baselinePools = this.resources.pools;
    const seedPool = (name, baseMax) => {
      if (!Number.isFinite(baseMax)) return;
      const max = Math.max(0, Math.floor(Number(baseMax)));
      baselinePools[name] = {
        cur: max,
        max,
        regenPerTurn: 0,
        spendMultipliers: {},
        minToUse: 0,
        baseMax: max,
      };
    };
    seedPool("stamina", this.base.maxStamina);
    seedPool("mana", this.base.maxMana);

    /**
     * Temporal hooks merged from equipment/status.
     * These are distinct from the legacy modCache.temporal payload so newer
     * helpers can reason about action speed/cooldowns without disturbing
     * existing calculations.
     */
    this.temporal = {
      actionSpeedPct: 0,
      moveAPDelta: 0,
      cooldownPct: 0,
      initBonus: 0,
      castTimeDelta: 0,
      recoveryPct: 0,
    };

    /** @type {ChannelingState|null} */
    this.channeling = null;

    this.freeAction = {
      cooldownRemaining: 0,
      ready: true,
    };

    this.turnFlags = { moved: false, attacked: false, channeled: false };

    // Temporal state
    /** @type {number} */
    this.ap = 0;
    /** @type {number} */
    this.apCap = DEFAULT_AP_CAP;
    /** @type {number} */
    this.baseActionAP = DEFAULT_BASE_ACTION_AP;

    /** @type {number} */
    this.turn = 0;

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
    const sdPct = this.statusDerived?.actionSpeedPct ?? 0;
    const temporalPct = this.modCache?.temporal?.actionSpeedPct ?? 0;
    const pct = sdPct + temporalPct;
    const mult = this.modCache.speedMult * (1 + pct);
    return Math.max(MIN_TOTAL_ACTION_COST_MULTIPLIER, mult);
  }

  totalCooldownMult() {
    const temporal = this.modCache?.temporal?.cooldownMult ?? 1;
    const derived = this.statusDerived?.cooldownMult ?? 1;
    return Math.max(MIN_TOTAL_COOLDOWN_MULTIPLIER, temporal * derived);
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

function ensureTurnFlags(actor) {
  if (!actor) return { moved: false, attacked: false, channeled: false };
  if (!actor.turnFlags || typeof actor.turnFlags !== "object") {
    actor.turnFlags = { moved: false, attacked: false, channeled: false };
  }
  return actor.turnFlags;
}

function ensureFreeActionState(actor) {
  if (!actor) return null;
  if (!actor.freeAction || typeof actor.freeAction !== "object") {
    actor.freeAction = { cooldownRemaining: 0, ready: true };
  }
  return actor.freeAction;
}

export function noteMoved(actor) {
  const flags = ensureTurnFlags(actor);
  if (flags) {
    flags.moved = true;
    flags.channeled = false;
  }
  if (actor) {
    actor._turnDidMove = true;
  }
  ensureFreeActionState(actor);
}

export function noteAttacked(actor) {
  const flags = ensureTurnFlags(actor);
  if (flags) {
    flags.attacked = true;
    flags.channeled = false;
  }
  if (actor) {
    actor._turnDidAttack = true;
  }
}

export function tickFreeAction(actor) {
  const fa = ensureFreeActionState(actor);
  if (!fa) return;
  if (fa.ready) return;
  fa.cooldownRemaining = Math.max(0, Number(fa.cooldownRemaining || 0) - 1);
  if (fa.cooldownRemaining <= 0) {
    fa.cooldownRemaining = 0;
    fa.ready = true;
  }
}
