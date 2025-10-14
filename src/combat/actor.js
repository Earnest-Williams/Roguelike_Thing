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
} from "../../js/constants.js";
import { normalizePolaritySigned } from "./polarity.js";
import { rebuildModCache } from "./mod-folding.js";
import { rebuildDerived } from "./status.js";

/**
 * @typedef {import("../../js/item-system.js").Item} Item
 * @typedef {import("../../js/item-system.js").ItemStack} ItemStack
 */

/**
 * @typedef {Object} BaseStats
 * @property {number} str
 * @property {number} dex
 * @property {number} int
 * @property {number} vit
 * @property {number} con
 * @property {number} will
 * @property {number} luck
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
 * @property {{ conversions: any[], brandAdds: any[], affinities: Record<string, number>, polarity: { grant: Record<string, number>, onHitBias: Record<string, number> } }} offense
 * @property {{ resists: Record<string, number>, immunities: Set<string>, polarity: { grant: Record<string, number>, defenseBias: Record<string, number> } }} defense
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
 * @property {number} endsAt
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
 * @property {string[]} [factions]
 * @property {string[]} [affiliations]
 * @property {Partial<Record<keyof typeof SLOT, Item|ItemStack>>} [equipment]
 * @property {string[]} [actions]
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

    /** @type {string[]} */
    this.factions = Array.isArray(init.factions) && init.factions.length
      ? [...init.factions]
      : ["unaligned"];
    if (this.factions.includes("unaligned") && this.factions.length > 1) {
      this.factions = ["unaligned"];
    }

    /** @type {string[]} */
    this.affiliations = Array.isArray(init.affiliations)
      ? [...init.affiliations]
      : [];

    const baseStats = init.baseStats ?? Object.create(null);
    /** @type {BaseStats} */
    this.base = {
      str: Number.isFinite(baseStats.str) ? Number(baseStats.str) : 5,
      dex: Number.isFinite(baseStats.dex) ? Number(baseStats.dex) : 5,
      int: Number.isFinite(baseStats.int) ? Number(baseStats.int) : 5,
      vit: Number.isFinite(baseStats.vit) ? Number(baseStats.vit) : 5,
      con: Number.isFinite(baseStats.con) ? Number(baseStats.con) : 5,
      will: Number.isFinite(baseStats.will) ? Number(baseStats.will) : 5,
      luck: Number.isFinite(baseStats.luck) ? Number(baseStats.luck) : 5,
      maxHP: Number.isFinite(baseStats.maxHP) ? Number(baseStats.maxHP) : 10,
      maxStamina: Number.isFinite(baseStats.maxStamina)
        ? Number(baseStats.maxStamina)
        : 10,
      maxMana: Number.isFinite(baseStats.maxMana) ? Number(baseStats.maxMana) : 0,
      baseSpeed: Number.isFinite(baseStats.baseSpeed)
        ? Number(baseStats.baseSpeed)
        : BASE_SPEED_MULTIPLIER,
    };
    this.baseStats = this.base;

    /** @type {Partial<Record<string, Item|ItemStack>>} */
    this.equipment = {};
    for (const slot of ALL_SLOTS_ORDER) {
      if (init.equipment?.[slot]) this.equipment[slot] = init.equipment[slot];
    }

    /** @type {StatusInstance[]} */
    this.statuses = [];

    /** @type {string[]} */
    this.actions = Array.isArray(init.actions) ? init.actions.slice() : [];

    /** @type {import("./status.js").StatusDerived} */
    this.statusDerived = rebuildDerived(this);

    /**
     * Baseline signed polarity vector (-1..+1 per axis).
     * @type {{ order: number, growth: number, chaos: number, decay: number, void: number }}
     */
    this.polarity = {
      order: 0,
      growth: 0,
      chaos: 0,
      decay: 0,
      void: 0,
    };
    this.polarityRaw = { ...this.polarity };
    this.polarityEffective = { ...this.polarity };
    this.polarityVector = this.polarityEffective;

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
        polarity: { grant: Object.create(null), onHitBias: Object.create(null) },
      },
      defense: {
        resists: Object.create(null),
        immunities: new Set(),
        polarity: { grant: Object.create(null), defenseBias: Object.create(null) },
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
      polarity: {
        grant: Object.create(null),
        onHitBias: Object.create(null),
        defenseBias: Object.create(null),
      },
      vision: { lightBonus: 0 },
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

    /** @type {Map<string, number>} */
    this.cooldowns = new Map();
  }

  onTurnStart(turn) {
    this.turn = turn | 0;
    this.statusDerived = rebuildDerived(this);
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
    const speedScalar = Math.max(MIN_TOTAL_ACTION_COST_MULTIPLIER, 1 - pct);
    const mult = this.modCache.speedMult * speedScalar;
    return Math.max(MIN_TOTAL_ACTION_COST_MULTIPLIER, mult);
  }

  totalCooldownMult() {
    const temporal = this.modCache?.temporal?.cooldownMult ?? 1;
    const derived = this.statusDerived?.cooldownMult ?? 1;
    return Math.max(MIN_TOTAL_COOLDOWN_MULTIPLIER, temporal * derived);
  }

  _forEachEquipmentItem(cb) {
    if (typeof cb !== "function") return;
    const slots = this.equipment?.slots || this.equipment || {};
    const seen = new Set();
    const visit = (entry) => {
      if (!entry || typeof entry !== "object") return;
      const item = "item" in entry && entry.item ? entry.item : entry;
      if (!item || typeof item !== "object") return;
      if (seen.has(item)) return;
      seen.add(item);
      cb(item);
    };

    if (slots instanceof Map) {
      for (const entry of slots.values()) {
        visit(entry);
      }
      return;
    }

    for (const key of Object.keys(slots)) {
      visit(slots[key]);
    }
  }

  _getEquipmentLightSourceProperties(defaults = null) {
    const fallback = {
      radius: Number.isFinite(defaults?.radius) ? Math.max(0, defaults.radius) : 0,
      color: defaults?.color ?? null,
      flickerRate: Number.isFinite(defaults?.flickerRate) ? defaults.flickerRate : 0,
    };
    let best = { ...fallback };
    let usingFallback = true;

    this._forEachEquipmentItem((item) => {
      const descriptor = readItemLightDescriptor(item);
      if (!descriptor) return;
      const radius = descriptor.radius;
      const color = descriptor.color ?? fallback.color;
      const flickerRate = Number.isFinite(descriptor.flickerRate)
        ? descriptor.flickerRate
        : fallback.flickerRate;
      const candidate = { radius, color, flickerRate };
      if (radius > best.radius || (usingFallback && radius === best.radius)) {
        best = candidate;
        usingFallback = false;
      }
    });

    return best;
  }

  /**
   * Returns the current light radius for vision/FOV.
   * This is the single source of truth for vision/light radius; all render/fog
   * systems should use this accessor.
   */
  getLightRadius() {
    const gearRadius =
      typeof this.equipment?.getLightRadius === "function"
        ? this.equipment.getLightRadius()
        : this._getEquipmentLightSourceProperties().radius;
    const innateBonus = this.modCache?.vision?.lightBonus || 0;
    return Math.max(0, (gearRadius || 0) + innateBonus);
  }

  getLightSourceProperties(defaults = null) {
    const fallback = {
      radius: Number.isFinite(defaults?.radius) ? Math.max(0, defaults.radius) : 0,
      color: defaults?.color ?? null,
      flickerRate: Number.isFinite(defaults?.flickerRate) ? defaults.flickerRate : 0,
    };
    const gearProps =
      typeof this.equipment?.getLightSourceProperties === "function"
        ? this.equipment.getLightSourceProperties(fallback) ?? { ...fallback }
        : this._getEquipmentLightSourceProperties(fallback);
    const innateBonus = this.modCache?.vision?.lightBonus || 0;
    return {
      radius: Math.max(0, (gearProps.radius || 0) + innateBonus),
      color: gearProps.color ?? fallback.color,
      flickerRate: Number.isFinite(gearProps.flickerRate)
        ? gearProps.flickerRate
        : fallback.flickerRate,
    };
  }

  getLightColor(defaults = null) {
    return this.getLightSourceProperties(defaults).color;
  }

  getLightFlickerRate(defaults = null) {
    return this.getLightSourceProperties(defaults).flickerRate;
  }

  /**
   * Equipment accessors
   */
  equip(slot, itemOrStack) {
    this.equipment[slot] = itemOrStack;
    rebuildModCache(this);
  }
  unequip(slot) {
    const it = this.equipment[slot];
    delete this.equipment[slot];
    rebuildModCache(this);
    return it;
  }

  /**
   * Set the actor's baseline polarity vector (signed, normalized) and optionally
   * configure built-in polarity bias hooks for offense/defense calculations.
   * @param {(
   *   Partial<Record<"order"|"growth"|"chaos"|"decay"|"void", number>> & {
   *     onHitBias?: Partial<Record<"order"|"growth"|"chaos"|"decay"|"void"|"all", number>>;
   *     defenseBias?: Partial<Record<"order"|"growth"|"chaos"|"decay"|"void"|"all", number>>;
   *   }
   * )} config
   */
  setPolarity(config) {
    const { onHitBias, defenseBias, ...vec } = config ?? {};
    this.polarity = normalizePolaritySigned(vec);
    this.polarityRaw = { ...this.polarity };
    this.polarityEffective = { ...this.polarity };
    this.polarityVector = this.polarityEffective;

    if (onHitBias && this.modCache?.offense?.polarity?.onHitBias) {
      const bias = this.modCache.offense.polarity.onHitBias;
      clearAndAssign(bias, onHitBias);
    }

    if (defenseBias && this.modCache?.defense?.polarity?.defenseBias) {
      const bias = this.modCache.defense.polarity.defenseBias;
      clearAndAssign(bias, defenseBias);
    }
  }
}

/**
 * Coerce an arbitrary entity into an Actor instance when possible.
 * This consolidates the duck-typing logic that used to live in various
 * AI helpers so a missing export does not break module loading in the
 * browser build.
 * @param {any} entity
 * @returns {Actor | null}
 */
export function asActor(entity) {
  if (!entity || typeof entity !== "object") {
    return null;
  }

  if (entity instanceof Actor) {
    return entity;
  }

  if (entity.actor instanceof Actor) {
    return entity.actor;
  }

  if (entity.__actor instanceof Actor) {
    return entity.__actor;
  }

  if (typeof entity.getActor === "function") {
    try {
      const result = entity.getActor();
      if (result instanceof Actor) {
        return result;
      }
      if (result && typeof result === "object") {
        return /** @type {Actor} */ (result);
      }
    } catch {
      // Ignore accessor failures and fall through to shape checks below.
    }
  }

  if (entity.actor && typeof entity.actor === "object") {
    return /** @type {Actor} */ (entity.actor);
  }

  if (
    typeof entity.base === "object" &&
    typeof entity.res === "object" &&
    Array.isArray(entity.factions)
  ) {
    return /** @type {Actor} */ (entity);
  }

  return null;
}

/**
 * Helper to clear all keys from target and assign properties from source.
 * @param {Object} target
 * @param {Object} source
 */
function clearAndAssign(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, source);
}

function readItemLightDescriptor(item) {
  if (!item || typeof item !== "object") return null;
  if (item.lit === false) return null;
  if (item.emitsLight === false) return null;
  let radius = 0;
  for (const value of [item.radius, item.lightRadius]) {
    if (!Number.isFinite(value)) continue;
    radius = Math.max(radius, Number(value));
  }
  if (!Number.isFinite(radius) || radius <= 0) return null;
  const color =
    typeof item.lightColor === "string" && item.lightColor
      ? item.lightColor
      : typeof item.color === "string" && item.color
      ? item.color
      : null;
  const flickerRate = Number.isFinite(item.flickerRate) ? item.flickerRate : undefined;
  return { radius, color, flickerRate };
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
    actor._didActionThisTurn = true;
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
    actor._didActionThisTurn = true;
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

