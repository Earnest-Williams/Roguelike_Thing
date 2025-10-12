// src/combat/mod-folding.js
// @ts-check
import { COMBAT_RESIST_MAX, COMBAT_RESIST_MIN } from "../config.js";
import { rebuildDerived } from "./status.js";
import { normalizePolaritySigned } from "./polarity.js";

const SLOT_RULES = {
  offhand: ["parryPct"],
  head: ["sightRange"],
};

/**
 * @typedef {import("../../item-system.js").Item} Item
 * @typedef {import("../../item-system.js").ItemStack} ItemStack
 */

/**
 * Normalize an equipment entry into an Item.
 * @param {Item|ItemStack|any} entry
 * @returns {Item|null}
 */
function asItem(entry) {
  if (!entry) return null;
  if (typeof entry !== "object") return null;
  if (entry instanceof Object && "item" in entry && entry.item) {
    return /** @type {ItemStack} */ (entry).item;
  }
  return /** @type {Item} */ (entry);
}

/**
 * Merge helper for "record" style numeric payloads. Supports both objects and
 * arrays of { type, amount } style entries.
 * @param {Record<string, number>} into
 * @param {Record<string, number>|Array<{ type?: string, id?: string, amount?: number, value?: number, flat?: number, pct?: number, percent?: number }> | undefined} add
 */
function mergeRecord(into, add) {
  if (!add) return;
  if (Array.isArray(add)) {
    for (const entry of add) {
      if (!entry) continue;
      const key = entry.type ?? entry.id;
      if (!key) continue;
      const amount = Number(entry.amount ?? entry.value ?? entry.flat ?? entry.percent ?? entry.pct ?? 0) || 0;
      into[key] = (into[key] || 0) + amount;
    }
    return;
  }
  for (const key of Object.keys(add)) {
    const amount = Number(add[key]) || 0;
    into[key] = (into[key] || 0) + amount;
  }
}

const POLAR_AXES = ["order", "growth", "chaos", "decay", "void"]; // allow "all" separately
const POLAR_AXES_SET = new Set(POLAR_AXES);

/**
 * Merge polarity bias style maps additively.
 * @param {Record<string, number>} into
 * @param {Record<string, number>|undefined|null} add
 */
function mergePolarity(into, add) {
  if (!add) return;
  for (const key of Object.keys(add)) {
    if (key !== "all" && !POLAR_AXES_SET.has(key)) continue;
    const amount = Number(add[key]);
    if (!Number.isFinite(amount) || amount === 0) continue;
    into[key] = (into[key] || 0) + amount;
  }
}

function mergePolarityBias(dst = Object.create(null), src = Object.create(null)) {
  if (!dst) return src || Object.create(null);
  if (!src) return dst;
  dst.all = (dst.all || 0) + Number(src.all || 0);
  if (src.vs) {
    dst.vs ||= Object.create(null);
    for (const [k, v] of Object.entries(src.vs)) {
      const value = Number(v) || 0;
      if (!value) continue;
      dst.vs[k] = (dst.vs[k] || 0) + value;
    }
  }
  return dst;
}

function addGrantVector(actor, grant) {
  if (!actor || !grant) return;
  if (!actor.polarity || typeof actor.polarity !== "object") {
    actor.polarity = { grant: Object.create(null) };
  }
  actor.polarity.grant ||= Object.create(null);
  for (const [axis, value] of Object.entries(grant)) {
    const amount = Number(value) || 0;
    if (!amount) continue;
    actor.polarity.grant[axis] = (actor.polarity.grant[axis] || 0) + amount;
  }
}

/**
 * Multiplies numeric properties from `mults` into `into`.
 * @param {Record<string, number>} into
 * @param {Record<string, number>|undefined|null} mults
 */
function multiply(into, mults) {
  if (!mults) return;
  for (const key of Object.keys(mults)) {
    const value = Number(mults[key]);
    if (!Number.isFinite(value)) continue;
    into[key] = (into[key] ?? 1) * value;
  }
}

function mergeResourceTagMultipliers(mc, pool, resource) {
  if (!resource || !resource.spendMultipliers) return;
  if (!(mc.resource.costPerTag instanceof Map)) {
    mc.resource.costPerTag = new Map();
  }
  const perTag = mc.resource.costPerTag.get(pool) || {};
  for (const [tag, mult] of Object.entries(resource.spendMultipliers)) {
    const value = Number(mult);
    if (!Number.isFinite(value)) continue;
    perTag[tag] = (perTag[tag] || 1) * value;
  }
  mc.resource.costPerTag.set(pool, perTag);
}

function mergeAttunementRule(into, type, payload) {
  if (!into || !type || !payload) return;
  if (typeof payload !== "object") return;
  const target = into[type] || (into[type] = { onUseGain: 0, decayPerTurn: 0, maxStacks: 0, perStack: {} });

  const gain = Number(payload.onUseGain ?? payload.gain ?? payload.perUseGain ?? payload.useGain ?? 0) || 0;
  if (gain) target.onUseGain += gain;

  const decay = Number(payload.decayPerTurn ?? payload.decay ?? payload.decayRate ?? 0) || 0;
  if (decay) target.decayPerTurn = Math.max(target.decayPerTurn, decay);

  const max = Number(payload.maxStacks ?? payload.max ?? payload.maximum ?? payload.cap ?? 0) || 0;
  if (max) target.maxStacks = Math.max(target.maxStacks, max);

  const perStack = payload.perStack && typeof payload.perStack === "object" ? payload.perStack : null;
  if (perStack) {
    const add = (field, aliases) => {
      for (const alias of aliases) {
        if (perStack[alias] === undefined) continue;
        const value = Number(perStack[alias]) || 0;
        if (!value) continue;
        target.perStack[field] = (target.perStack[field] || 0) + value;
        break;
      }
    };
    add("damagePct", ["damagePct", "dmgPct", "damage"]);
    add("resistPct", ["resistPct", "resist", "resistancePct"]);
    add("accuracyFlat", ["accuracyFlat", "accuracy", "accuracyBonus"]);
  }

  into[type] = target;
}

function mergeAttunementPayload(into, payload) {
  if (!into || !payload) return;
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      if (!entry) continue;
      const type = entry.type ?? entry.id ?? entry.element ?? entry.damageType;
      if (!type) continue;
      mergeAttunementRule(into, type, entry);
    }
    return;
  }
  if (typeof payload !== "object") return;
  if (payload.type) {
    mergeAttunementRule(into, payload.type, payload);
    return;
  }
  for (const [type, value] of Object.entries(payload)) {
    mergeAttunementRule(into, type, value);
  }
}

/**
 * Applies a temporal payload to the provided mod cache.
 * @param {import("./actor.js").Actor['modCache']} cache
 * @param {any} payload
 */
function applyTemporalPayload(cache, payload) {
  if (!payload) return;
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      applyTemporalPayload(cache, entry);
    }
    return;
  }
  if (typeof payload !== "object") return;
  const temporal = cache.temporal;
  const pickNumber = (...candidates) => {
    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null) continue;
      const value = Number(candidate);
      if (Number.isFinite(value)) return value;
    }
    return null;
  };
  const addNumber = (field, ...aliases) => {
    for (const alias of [field, ...aliases]) {
      if (payload[alias] === undefined) continue;
      const value = Number(payload[alias]);
      if (!Number.isFinite(value)) continue;
      temporal[field] = (temporal[field] || 0) + value;
      return;
    }
  };
  const multNumber = (field, ...aliases) => {
    for (const alias of [field, ...aliases]) {
      if (payload[alias] === undefined) continue;
      const value = Number(payload[alias]);
      if (!Number.isFinite(value)) continue;
      temporal[field] = (temporal[field] ?? 1) * value;
      return;
    }
  };
  const applyTriplet = (source, { delta, pct, mult }) => {
    if (source === undefined || source === null) return;
    if (typeof source === "number") {
      if (delta) temporal[delta] = (temporal[delta] || 0) + source;
      return;
    }
    if (typeof source !== "object") return;
    if (delta) {
      const value = pickNumber(
        source.delta,
        source.flat,
        source.add,
        source.value,
        source.amount,
      );
      if (value !== null) {
        temporal[delta] = (temporal[delta] || 0) + value;
      }
    }
    if (pct) {
      const value = pickNumber(source.pct, source.percent, source.rate);
      if (value !== null) {
        temporal[pct] = (temporal[pct] || 0) + value;
      }
    }
    if (mult) {
      const value = pickNumber(source.mult, source.multiplier, source.scale);
      if (value !== null) {
        temporal[mult] = (temporal[mult] ?? 1) * value;
      }
    }
  };
  const applyCooldownPerTag = (value) => {
    if (!value) return;
    if (value instanceof Map) {
      for (const [tag, mult] of value.entries()) {
        if (!tag) continue;
        const prev = temporal.cooldownPerTag.get(tag) || 1;
        temporal.cooldownPerTag.set(tag, prev * (Number(mult) || 1));
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (!entry) continue;
        const tag = entry.tag ?? entry.type ?? entry.id;
        if (!tag) continue;
        const prev = temporal.cooldownPerTag.get(tag) || 1;
        const mult = pickNumber(
          entry.mult,
          entry.value,
          entry.amount,
          entry.pct,
          entry.percent,
          entry.multiplier,
        );
        temporal.cooldownPerTag.set(tag, prev * (mult ?? 1));
      }
      return;
    }
    if (typeof value === "object") {
      for (const tag of Object.keys(value)) {
        const prev = temporal.cooldownPerTag.get(tag) || 1;
        const mult = pickNumber(value[tag]);
        temporal.cooldownPerTag.set(tag, prev * (mult ?? 1));
      }
    }
  };

  addNumber(
    "actionSpeedPct",
    "actionSpeedPct",
    "actionSpeedPercent",
    "speedPct",
    "speedPercent",
    "globalSpeedPct",
    "globalSpeedPercent",
  );
  addNumber("moveAPDelta", "moveAPDelta", "moveApDelta", "moveApFlat", "moveAPFlat", "moveApBonus");
  addNumber(
    "moveAPPct",
    "moveAPPct",
    "moveApPct",
    "moveApPercent",
    "moveAPPercent",
    "moveSpeedPct",
    "moveSpeedPercent",
  );
  multNumber("moveAPMult", "moveAPMult", "moveApMult", "moveApMultiplier", "moveSpeedMult");
  applyTriplet(payload.moveAP ?? payload.moveAp ?? payload.move, {
    delta: "moveAPDelta",
    pct: "moveAPPct",
    mult: "moveAPMult",
  });
  addNumber(
    "baseActionAPDelta",
    "baseActionAPDelta",
    "baseActionApDelta",
    "baseActionApFlat",
    "baseActionAPFlat",
    "baseActionApBonus",
  );
  addNumber(
    "baseActionAPPct",
    "baseActionAPPct",
    "baseActionApPct",
    "baseActionApPercent",
    "baseActionAPPercent",
    "baseActionSpeedPct",
    "baseActionSpeedPercent",
  );
  multNumber(
    "baseActionAPMult",
    "baseActionAPMult",
    "baseActionApMult",
    "baseActionApMultiplier",
    "baseActionSpeedMult",
  );
  applyTriplet(payload.baseActionAP ?? payload.baseActionAp ?? payload.baseAction, {
    delta: "baseActionAPDelta",
    pct: "baseActionAPPct",
    mult: "baseActionAPMult",
  });
  addNumber(
    "apGainFlat",
    "apGainFlat",
    "apRegenFlat",
    "apGainPerTurn",
    "apRegenPerTurn",
    "apGainFlatPerTurn",
    "apRegenFlatPerTurn",
  );
  addNumber(
    "apGainPct",
    "apGainPct",
    "apGainPercent",
    "apRegenPct",
    "apRegenPercent",
    "apGainPerTurnPct",
    "apRegenPerTurnPct",
  );
  multNumber("apGainMult", "apGainMult", "apGainMultiplier", "apRegenMult", "apRegenMultiplier");
  applyTriplet(payload.apGain ?? payload.apRegen, {
    delta: "apGainFlat",
    pct: "apGainPct",
    mult: "apGainMult",
  });
  addNumber("apCapFlat", "apCapFlat", "apCapDelta", "apCapAdd", "apMaxFlat", "apMaxDelta");
  addNumber("apCapPct", "apCapPct", "apCapPercent", "apMaxPct", "apMaxPercent");
  multNumber("apCapMult", "apCapMult", "apCapMultiplier", "apMaxMultiplier");
  applyTriplet(payload.apCap ?? payload.apMax, {
    delta: "apCapFlat",
    pct: "apCapPct",
    mult: "apCapMult",
  });
  addNumber(
    "initiativeFlat",
    "initiativeFlat",
    "initFlat",
    "initiativeDelta",
    "initiativeBonus",
    "initBonus",
  );
  addNumber(
    "initiativePct",
    "initiativePct",
    "initPct",
    "initiativePercent",
    "initPercent",
  );
  multNumber(
    "initiativeMult",
    "initiativeMult",
    "initMult",
    "initiativeMultiplier",
    "initMultiplier",
  );
  applyTriplet(payload.initiative, {
    delta: "initiativeFlat",
    pct: "initiativePct",
    mult: "initiativeMult",
  });
  const actionSpeed = payload.actionSpeed ?? payload.speed;
  if (actionSpeed && typeof actionSpeed === "object") {
    const pct = pickNumber(actionSpeed.pct, actionSpeed.percent, actionSpeed.rate);
    if (pct !== null) {
      temporal.actionSpeedPct = (temporal.actionSpeedPct || 0) + pct;
    }
    const mult = pickNumber(actionSpeed.mult, actionSpeed.multiplier, actionSpeed.scale);
    if (mult !== null) {
      temporal.actionSpeedPct = (temporal.actionSpeedPct || 0) + (mult - 1);
    }
    const flat = pickNumber(actionSpeed.flat, actionSpeed.add, actionSpeed.value, actionSpeed.amount);
    if (flat !== null) {
      temporal.actionSpeedPct = (temporal.actionSpeedPct || 0) + flat;
    }
  }
  const cooldownMult = Number(
    payload.cooldownMult ??
    payload.cooldownMultiplier ??
    payload.globalCooldownMult ??
    payload.globalCooldownMultiplier,
  );
  if (Number.isFinite(cooldownMult)) {
    temporal.cooldownMult *= cooldownMult;
  }
  const cooldownPerTag =
    payload.cooldownPerTag ??
    payload.cooldownMultByTag ??
    payload.cooldownMultiplierByTag ??
    payload.cooldownByTag;
  applyCooldownPerTag(cooldownPerTag);
  if (payload.cooldown && typeof payload.cooldown === "object") {
    const nestedMult = pickNumber(
      payload.cooldown.mult,
      payload.cooldown.multiplier,
      payload.cooldown.value,
      payload.cooldown.amount,
    );
    if (nestedMult !== null) {
      temporal.cooldownMult *= nestedMult;
    }
    applyCooldownPerTag(
      payload.cooldown.perTag ??
        payload.cooldown.byTag ??
        payload.cooldown.tags ??
        payload.cooldown.perType ??
        payload.cooldown.byType,
    );
  }
  if (payload.echo !== undefined && payload.echo !== null) {
    temporal.echo = payload.echo;
  }
  if (payload.onKillHaste) {
    temporal.onKillHaste = payload.onKillHaste;
  }
}

/**
 * Applies a resource payload to the provided mod cache.
 * @param {import("./actor.js").Actor['modCache']} cache
 * @param {any} payload
 */
function applyResourcePayload(cache, payload) {
  if (!payload) return;
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      applyResourcePayload(cache, entry);
    }
    return;
  }
  if (typeof payload !== "object") return;
  const resource = cache.resource;
  if (!(resource.costPerTag instanceof Map)) {
    resource.costPerTag = new Map();
  }
  const pickNumber = (...candidates) => {
    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null) continue;
      const value = Number(candidate);
      if (Number.isFinite(value)) return value;
    }
    return null;
  };
  const merge = (bucket, value) => {
    if (!value) return;
    mergeRecord(bucket, value);
  };
  const addResource = (bucket, key, ...aliases) => {
    for (const alias of aliases) {
      if (payload[alias] === undefined) continue;
      const value = Number(payload[alias]);
      if (!Number.isFinite(value)) continue;
      bucket[key] = (bucket[key] || 0) + value;
    }
  };
  const applyResourceValue = (bucket, key, value, mode = "add") => {
    if (!bucket || key === undefined || key === null) return;
    const name = String(key);
    if (mode === "mult") {
      const mult = Number(value);
      if (!Number.isFinite(mult)) return;
      bucket[name] = (bucket[name] ?? 1) * mult;
      return;
    }
    const amount = Number(value);
    if (!Number.isFinite(amount)) return;
    bucket[name] = (bucket[name] || 0) + amount;
  };
  const handleResourceEntry = (key, value, buckets) => {
    if (key === undefined || key === null) return;
    const name = String(key);
    if (typeof value === "number") {
      if (buckets.flat) {
        applyResourceValue(buckets.flat, name, value);
        return;
      }
      if (buckets.mult) {
        applyResourceValue(buckets.mult, name, value, "mult");
        return;
      }
      if (buckets.pct) {
        applyResourceValue(buckets.pct, name, value);
        return;
      }
      return;
    }
    if (!value) return;
    if (value instanceof Map) {
      for (const [subKey, subValue] of value.entries()) {
        handleResourceEntry(subKey, subValue, buckets);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (!entry) continue;
        const res = entry.resource ?? entry.type ?? entry.id ?? name;
        handleResourceEntry(res, entry, buckets);
      }
      return;
    }
    if (typeof value === "object") {
      if (buckets.flat) {
        const flat = pickNumber(
          value.flat,
          value.amount,
          value.value,
          value.delta,
          value.add,
        );
        if (flat !== null) applyResourceValue(buckets.flat, name, flat);
      }
      if (buckets.pct) {
        const pct = pickNumber(value.pct, value.percent, value.rate);
        if (pct !== null) applyResourceValue(buckets.pct, name, pct);
      }
      if (buckets.mult) {
        const mult = pickNumber(value.mult, value.multiplier, value.scale);
        if (mult !== null) applyResourceValue(buckets.mult, name, mult, "mult");
      }
      const nested =
        value.byResource ??
        value.perResource ??
        value.resources ??
        value.values;
      if (nested) {
        applyResourceGroup(nested, buckets);
      }
      return;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    if (buckets.flat) applyResourceValue(buckets.flat, name, numeric);
  };
  const applyResourceGroup = (group, buckets) => {
    if (!group) return;
    if (group instanceof Map) {
      for (const [key, value] of group.entries()) {
        handleResourceEntry(key, value, buckets);
      }
      return;
    }
    if (Array.isArray(group)) {
      for (const entry of group) {
        if (!entry) continue;
        const res = entry.resource ?? entry.type ?? entry.id;
        if (res !== undefined && res !== null) {
          handleResourceEntry(res, entry, buckets);
          continue;
        }
        if (typeof entry === "object") {
          for (const key of Object.keys(entry)) {
            handleResourceEntry(key, entry[key], buckets);
          }
        }
      }
      return;
    }
    if (typeof group !== "object") {
      return;
    }
    const recurse = [
      group.byResource,
      group.perResource,
      group.resources,
      group.values,
    ];
    for (const candidate of recurse) {
      if (candidate) applyResourceGroup(candidate, buckets);
    }
    const flatGroups = [group.flat, group.add, group.delta, group.amount, group.value];
    if (buckets.flat) {
      for (const flat of flatGroups) {
        if (flat) applyResourceGroup(flat, { flat: buckets.flat });
      }
    }
    if (buckets.pct) {
      const pctGroups = [group.pct, group.percent, group.rate];
      for (const pct of pctGroups) {
        if (pct) applyResourceGroup(pct, { pct: buckets.pct });
      }
    }
    if (buckets.mult) {
      const multGroups = [group.mult, group.multiplier, group.scale];
      for (const mult of multGroups) {
        if (!mult) continue;
        if (typeof mult === "number") {
          for (const key of Object.keys(buckets.mult)) {
            applyResourceValue(buckets.mult, key, mult, "mult");
          }
        } else {
          applyResourceGroup(mult, { mult: buckets.mult });
        }
      }
    }
    const skipKeys = new Set([
      "flat",
      "pct",
      "percent",
      "rate",
      "mult",
      "multiplier",
      "scale",
      "add",
      "delta",
      "amount",
      "value",
      "byResource",
      "perResource",
      "resources",
      "values",
      "perTag",
      "byTag",
      "tags",
      "onHit",
      "onKill",
      "onSpend",
      "onSpendRefund",
    ]);
    for (const key of Object.keys(group)) {
      if (skipKeys.has(key)) continue;
      handleResourceEntry(key, group[key], buckets);
    }
  };

  merge(resource.maxFlat, payload.maxFlat);
  addResource(
    resource.maxFlat,
    "hp",
    "maxHpFlat",
    "maxHPFlat",
    "hpMaxFlat",
    "maxHpDelta",
    "maxHpAdd",
  );
  addResource(resource.maxFlat, "stamina", "maxStaminaFlat", "staminaMaxFlat", "maxStaminaDelta");
  addResource(resource.maxFlat, "mana", "maxManaFlat", "manaMaxFlat", "maxManaDelta");

  merge(resource.maxPct, payload.maxPct);
  addResource(resource.maxPct, "hp", "maxHpPct", "maxHPPct", "hpMaxPct", "maxHpPercent");
  addResource(resource.maxPct, "stamina", "maxStaminaPct", "staminaMaxPct", "maxStaminaPercent");
  addResource(resource.maxPct, "mana", "maxManaPct", "manaMaxPct", "maxManaPercent");
  applyResourceGroup(payload.max, {
    flat: resource.maxFlat,
    pct: resource.maxPct,
  });

  merge(resource.regenFlat, payload.regenFlat);
  addResource(
    resource.regenFlat,
    "hp",
    "hpRegenPerTurn",
    "hpRegen",
    "hpRegenFlat",
    "hpRegenFlatPerTurn",
  );
  addResource(
    resource.regenFlat,
    "stamina",
    "staminaRegenPerTurn",
    "staminaRegen",
    "staminaRegenFlat",
    "staminaRegenFlatPerTurn",
  );
  addResource(
    resource.regenFlat,
    "mana",
    "manaRegenPerTurn",
    "manaRegen",
    "manaRegenFlat",
    "manaRegenFlatPerTurn",
  );

  merge(resource.regenPct, payload.regenPct);
  addResource(resource.regenPct, "hp", "hpRegenPct", "hpRegenPercent");
  addResource(resource.regenPct, "stamina", "staminaRegenPct", "staminaRegenPercent");
  addResource(resource.regenPct, "mana", "manaRegenPct", "manaRegenPercent");
  applyResourceGroup(payload.regen ?? payload.regenPerTurn, {
    flat: resource.regenFlat,
    pct: resource.regenPct,
  });

  merge(resource.startFlat, payload.startFlat);
  addResource(
    resource.startFlat,
    "hp",
    "startHpFlat",
    "startHPFlat",
    "startHp",
    "startHpDelta",
    "startHpAdd",
  );
  addResource(
    resource.startFlat,
    "stamina",
    "startStaminaFlat",
    "startStamina",
    "startStaminaDelta",
  );
  addResource(
    resource.startFlat,
    "mana",
    "startManaFlat",
    "startMana",
    "startManaDelta",
  );

  merge(resource.startPct, payload.startPct);
  addResource(resource.startPct, "hp", "startHpPct", "startHPPct", "startHpPercent");
  addResource(
    resource.startPct,
    "stamina",
    "startStaminaPct",
    "startStaminaPercent",
  );
  addResource(resource.startPct, "mana", "startManaPct", "startManaPercent");
  applyResourceGroup(payload.start, {
    flat: resource.startFlat,
    pct: resource.startPct,
  });

  merge(resource.gainFlat, payload.gainFlat ?? payload.onGainFlat);
  addResource(
    resource.gainFlat,
    "hp",
    "hpGainFlat",
    "hpGain",
    "hpOnHitGain",
    "hpGainPerHit",
    "hpGainOnHit",
  );
  addResource(
    resource.gainFlat,
    "stamina",
    "staminaGainFlat",
    "staminaGain",
    "staminaOnHitGain",
    "staminaGainPerHit",
  );
  addResource(
    resource.gainFlat,
    "mana",
    "manaGainFlat",
    "manaGain",
    "manaOnHitGain",
    "manaGainPerHit",
  );

  merge(resource.gainPct, payload.gainPct ?? payload.onGainPct);
  addResource(resource.gainPct, "hp", "hpGainPct", "hpGainPercent", "hpOnHitGainPct");
  addResource(resource.gainPct, "stamina", "staminaGainPct", "staminaGainPercent");
  addResource(resource.gainPct, "mana", "manaGainPct", "manaGainPercent");
  applyResourceGroup(payload.gain ?? payload.onGain, {
    flat: resource.gainFlat,
    pct: resource.gainPct,
  });
  const gainEvents = payload.gain ?? payload.onGain;
  if (gainEvents && typeof gainEvents === "object") {
    if (!resource.onHitGain && gainEvents.onHit) {
      resource.onHitGain = gainEvents.onHit;
    }
    if (!resource.onKillGain && gainEvents.onKill) {
      resource.onKillGain = gainEvents.onKill;
    }
    if (!resource.onSpendGain && (gainEvents.onSpend ?? gainEvents.onCast)) {
      resource.onSpendGain = gainEvents.onSpend ?? gainEvents.onCast;
    }
    if (!resource.onSpendRefund && gainEvents.onSpendRefund) {
      resource.onSpendRefund = gainEvents.onSpendRefund;
    }
  }

  merge(resource.leechFlat, payload.leechFlat);
  addResource(resource.leechFlat, "hp", "hpLeechFlat", "hpLeech");
  addResource(resource.leechFlat, "stamina", "staminaLeechFlat", "staminaLeech");
  addResource(resource.leechFlat, "mana", "manaLeechFlat", "manaLeech");

  merge(resource.leechPct, payload.leechPct);
  addResource(resource.leechPct, "hp", "hpLeechPct", "hpLeechPercent");
  addResource(resource.leechPct, "stamina", "staminaLeechPct", "staminaLeechPercent");
  addResource(resource.leechPct, "mana", "manaLeechPct", "manaLeechPercent");
  applyResourceGroup(payload.leech, {
    flat: resource.leechFlat,
    pct: resource.leechPct,
  });

  merge(resource.costFlat, payload.costFlat ?? payload.costAdd);
  addResource(resource.costFlat, "hp", "hpCostFlat", "hpCost", "hpCostAdd");
  addResource(resource.costFlat, "stamina", "staminaCostFlat", "staminaCost", "staminaCostAdd");
  addResource(resource.costFlat, "mana", "manaCostFlat", "manaCost", "manaCostAdd");

  multiply(resource.costMult, payload.costMult);
  const staminaCostMult = Number(payload.staminaCostMult ?? payload.staminaCostMultiplier);
  if (Number.isFinite(staminaCostMult)) {
    resource.costMult.stamina = (resource.costMult.stamina ?? 1) * staminaCostMult;
  }
  const manaCostMult = Number(payload.manaCostMult ?? payload.manaCostMultiplier);
  if (Number.isFinite(manaCostMult)) {
    resource.costMult.mana = (resource.costMult.mana ?? 1) * manaCostMult;
  }
  const hpCostMult = Number(payload.hpCostMult ?? payload.hpCostMultiplier);
  if (Number.isFinite(hpCostMult)) {
    resource.costMult.hp = (resource.costMult.hp ?? 1) * hpCostMult;
  }
  applyResourceGroup(payload.cost, {
    flat: resource.costFlat,
    mult: resource.costMult,
  });
  const ensureCostPool = (pool) => {
    if (!pool) return null;
    const key = String(pool);
    const existing = resource.costPerTag.get(key) || {};
    resource.costPerTag.set(key, existing);
    return existing;
  };
  const applyCostPerTag = (tag, value) => {
    if (!tag) return;
    if (typeof value === "number") {
      const mult = Number(value);
      if (!Number.isFinite(mult)) return;
      for (const pool of ["hp", "stamina", "mana"]) {
        const perTag = ensureCostPool(pool);
        if (!perTag) continue;
        perTag[tag] = (perTag[tag] || 1) * mult;
      }
      return;
    }
    if (value instanceof Map) {
      for (const [pool, multValue] of value.entries()) {
        const mult = Number(multValue);
        if (!Number.isFinite(mult)) continue;
        const perTag = ensureCostPool(pool);
        if (!perTag) continue;
        perTag[tag] = (perTag[tag] || 1) * mult;
      }
      return;
    }
    if (value && typeof value === "object") {
      for (const [pool, multValue] of Object.entries(value)) {
        const mult = Number(multValue);
        if (!Number.isFinite(mult)) continue;
        const perTag = ensureCostPool(pool);
        if (!perTag) continue;
        perTag[tag] = (perTag[tag] || 1) * mult;
      }
    }
  };
  const costPerTag =
    payload.costPerTag ??
    payload.costMultByTag ??
    payload.costMultiplierByTag ??
    payload.costByTag;
  const nestedCostPerTag =
    payload.cost?.perTag ??
    payload.cost?.byTag ??
    payload.cost?.tags ??
    payload.cost?.perType ??
    payload.cost?.byType;
  if (costPerTag instanceof Map) {
    for (const [tag, value] of costPerTag.entries()) {
      applyCostPerTag(tag, value);
    }
  } else if (Array.isArray(costPerTag)) {
    for (const entry of costPerTag) {
      if (!entry) continue;
      const tag = entry.tag ?? entry.type ?? entry.id;
      if (!tag) continue;
      const value =
        entry.mult ??
        entry.value ??
        entry.amount ??
        entry.pct ??
        entry.percent ??
        entry.multiplier ??
        entry.byResource ??
        entry.resources ??
        null;
      if (value !== null && value !== undefined) {
        applyCostPerTag(tag, value);
        continue;
      }
      if (entry.cost && typeof entry.cost === "object") {
        applyCostPerTag(tag, entry.cost);
      }
    }
  } else if (costPerTag && typeof costPerTag === "object") {
    for (const tag of Object.keys(costPerTag)) {
      applyCostPerTag(tag, costPerTag[tag]);
    }
  }
  if (nestedCostPerTag instanceof Map) {
    for (const [tag, value] of nestedCostPerTag.entries()) {
      applyCostPerTag(tag, value);
    }
  } else if (Array.isArray(nestedCostPerTag)) {
    for (const entry of nestedCostPerTag) {
      if (!entry) continue;
      const tag = entry.tag ?? entry.type ?? entry.id;
      if (!tag) continue;
      const value =
        entry.mult ??
        entry.value ??
        entry.amount ??
        entry.pct ??
        entry.percent ??
        entry.multiplier ??
        entry.byResource ??
        entry.resources ??
        null;
      if (value !== null && value !== undefined) {
        applyCostPerTag(tag, value);
        continue;
      }
      if (entry.cost && typeof entry.cost === "object") {
        applyCostPerTag(tag, entry.cost);
      }
    }
  } else if (nestedCostPerTag && typeof nestedCostPerTag === "object") {
    for (const tag of Object.keys(nestedCostPerTag)) {
      applyCostPerTag(tag, nestedCostPerTag[tag]);
    }
  }
  if (payload.onHitGain && !resource.onHitGain) {
    resource.onHitGain = payload.onHitGain;
  }
  if (payload.onKillGain && !resource.onKillGain) {
    resource.onKillGain = payload.onKillGain;
  }
  if (payload.onSpendGain && !resource.onSpendGain) {
    resource.onSpendGain = payload.onSpendGain;
  }
  if (payload.onSpendRefund && !resource.onSpendRefund) {
    resource.onSpendRefund = payload.onSpendRefund;
  }
  if (payload.channeling) {
    resource.channeling = true;
  }
}

/**
 * Aggregates all modifiers from currently equipped items and stores the result
 * on the actor. This builds the canonical mod cache for combat resolution.
 * @param {import("./actor.js").Actor} actor
 */
export function foldModsFromEquipment(actor) {
  const temporalHooks = {
    actionSpeedPct: 0,
    moveAPDelta: 0,
    cooldownPct: 0,
    initBonus: 0,
    castTimeDelta: 0,
    recoveryPct: 0,
  };
  const resourceRules = Object.create(null);

  const mc = actor.modCache = {
    resists: Object.create(null),
    affinities: Object.create(null),
    immunities: new Set(),
    dmgMult: 1,
    speedMult: 1,
    brands: [],
    attunementRules: Object.create(null),
    offense: {
      conversions: [],
      brandAdds: [],
      affinities: Object.create(null),
      polarity: { grant: Object.create(null), onHitBias: Object.create(null) },
    },
    defense: {
      resists: Object.create(null),
      immunities: new Set(),
      flatDR: Object.create(null),
      polarity: { grant: Object.create(null), defenseBias: Object.create(null) },
    },
    temporal: {
      actionSpeedPct: 0,
      moveAPDelta: 0,
      moveAPPct: 0,
      moveAPMult: 1,
      cooldownPct: 0,
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
  };

  if (typeof actor.setPolarity === "function") {
    actor.setPolarity(actor.polarity);
  }
  actor.polarityRaw = { ...(actor.polarity || Object.create(null)) };

  const equipment = actor.equipment || {};
  const sortedSlots = Object.keys(equipment).sort((a, b) =>
    String(a).localeCompare(String(b)),
  );
  for (const slot of sortedSlots) {
    const item = asItem(equipment[slot]);
    if (!item) continue;

    const slotKey = typeof slot === "string" ? slot.toLowerCase() : String(slot).toLowerCase();
    const allowed = SLOT_RULES[slotKey] || SLOT_RULES[slot] || null;
    const allowField = (field) => {
      if (!allowed) return true;
      return allowed.includes(field);
    };

    mergeAttunementPayload(mc.attunementRules, item.attunement);
    mergeAttunementPayload(mc.attunementRules, item.attunements);

    // Brands
    if (Array.isArray(item.brands)) {
      for (const brand of item.brands) {
        if (!brand) continue;
        const type = brand.type ?? brand.element ?? brand.damageType ?? null;
        const flat = Number(brand.flat ?? brand.amount ?? 0) || 0;
        const percent = Number(brand.percent ?? brand.pct ?? 0) || 0;
        const onHitStatuses = Array.isArray(brand.onHitStatuses)
          ? brand.onHitStatuses.slice()
          : [];
        mc.offense.brandAdds.push({ type, flat, percent, onHitStatuses });
        mc.brands.push({ kind: "brand", type, flat, pct: percent, onHitStatuses });
        if (brand.attunement && type) {
          mergeAttunementRule(mc.attunementRules, type, brand.attunement);
        }
        if (brand.temporal) {
          const t = brand.temporal;
          temporalHooks.actionSpeedPct += t.actionSpeedPct || 0;
          temporalHooks.moveAPDelta += t.moveAPDelta || 0;
          temporalHooks.cooldownPct += t.cooldownPct || 0;
          temporalHooks.initBonus += t.initBonus || 0;
          temporalHooks.castTimeDelta += t.castTimeDelta || 0;
          temporalHooks.recoveryPct += t.recoveryPct || 0;
        }
        if (brand.resources) {
          for (const [pool, payload] of Object.entries(brand.resources)) {
            const current = resourceRules[pool] || {
              maxDelta: 0,
              regenPerTurn: 0,
              onMoveGain: 0,
              onHitGain: 0,
              onCritGain: 0,
              onKillGain: 0,
              spendMultipliers: {},
              minToUse: 0,
            };
            current.maxDelta += payload.maxDelta || 0;
            current.regenPerTurn += payload.regenPerTurn || 0;
            current.onMoveGain += payload.onMoveGain || 0;
            current.onHitGain += payload.onHitGain || 0;
            current.onCritGain += payload.onCritGain || 0;
            current.onKillGain += payload.onKillGain || 0;
            current.minToUse = Math.max(current.minToUse, payload.minToUse || 0);
            if (payload.spendMultipliers) {
              for (const [tag, mult] of Object.entries(payload.spendMultipliers)) {
                const prev = current.spendMultipliers[tag] || 1;
                current.spendMultipliers[tag] = prev * (mult || 1);
              }
            }
            resourceRules[pool] = current;
            mergeResourceTagMultipliers(mc, pool, current);
          }
        }
      }
    }

    // Nested offense payloads (brands / conversions / affinities)
    if (Array.isArray(item.offense?.brands)) {
      for (const brand of item.offense.brands) {
        if (!brand) continue;
        const type = brand.type ?? brand.element ?? brand.damageType ?? null;
        const flat = Number(brand.flat ?? brand.amount ?? 0) || 0;
        const percent = Number(brand.percent ?? brand.pct ?? 0) || 0;
        const onHitStatuses = Array.isArray(brand.onHitStatuses)
          ? brand.onHitStatuses.slice()
          : [];
        mc.offense.brandAdds.push({ type, flat, percent, onHitStatuses });
        mc.brands.push({ kind: "brand", type, flat, pct: percent, onHitStatuses });
        if (brand.attunement && type) {
          mergeAttunementRule(mc.attunementRules, type, brand.attunement);
        }
        if (brand.temporal) {
          const t = brand.temporal;
          temporalHooks.actionSpeedPct += t.actionSpeedPct || 0;
          temporalHooks.moveAPDelta += t.moveAPDelta || 0;
          temporalHooks.cooldownPct += t.cooldownPct || 0;
          temporalHooks.initBonus += t.initBonus || 0;
          temporalHooks.castTimeDelta += t.castTimeDelta || 0;
          temporalHooks.recoveryPct += t.recoveryPct || 0;
        }
        if (brand.resources) {
          for (const [pool, payload] of Object.entries(brand.resources)) {
            const current = resourceRules[pool] || {
              maxDelta: 0,
              regenPerTurn: 0,
              onMoveGain: 0,
              onHitGain: 0,
              onCritGain: 0,
              onKillGain: 0,
              spendMultipliers: {},
              minToUse: 0,
            };
            current.maxDelta += payload.maxDelta || 0;
            current.regenPerTurn += payload.regenPerTurn || 0;
            current.onMoveGain += payload.onMoveGain || 0;
            current.onHitGain += payload.onHitGain || 0;
            current.onCritGain += payload.onCritGain || 0;
            current.onKillGain += payload.onKillGain || 0;
            current.minToUse = Math.max(current.minToUse, payload.minToUse || 0);
            if (payload.spendMultipliers) {
              for (const [tag, mult] of Object.entries(payload.spendMultipliers)) {
                const prev = current.spendMultipliers[tag] || 1;
                current.spendMultipliers[tag] = prev * (mult || 1);
              }
            }
            resourceRules[pool] = current;
            mergeResourceTagMultipliers(mc, pool, current);
          }
        }
      }
    }
    if (Array.isArray(item.offense?.brandAdds)) {
      for (const brand of item.offense.brandAdds) {
        if (!brand) continue;
        const type = brand.type ?? brand.element ?? brand.damageType ?? null;
        const flat = Number(brand.flat ?? brand.amount ?? 0) || 0;
        const percent = Number(brand.percent ?? brand.pct ?? 0) || 0;
        const onHitStatuses = Array.isArray(brand.onHitStatuses)
          ? brand.onHitStatuses.slice()
          : [];
        mc.offense.brandAdds.push({ type, flat, percent, onHitStatuses });
        mc.brands.push({ kind: "brand", type, flat, pct: percent, onHitStatuses });
        if (brand.attunement && type) {
          mergeAttunementRule(mc.attunementRules, type, brand.attunement);
        }
        if (brand.temporal) {
          const t = brand.temporal;
          temporalHooks.actionSpeedPct += t.actionSpeedPct || 0;
          temporalHooks.moveAPDelta += t.moveAPDelta || 0;
          temporalHooks.cooldownPct += t.cooldownPct || 0;
          temporalHooks.initBonus += t.initBonus || 0;
          temporalHooks.castTimeDelta += t.castTimeDelta || 0;
          temporalHooks.recoveryPct += t.recoveryPct || 0;
        }
        if (brand.resources) {
          for (const [pool, payload] of Object.entries(brand.resources)) {
            const current = resourceRules[pool] || {
              maxDelta: 0,
              regenPerTurn: 0,
              onMoveGain: 0,
              onHitGain: 0,
              onCritGain: 0,
              onKillGain: 0,
              spendMultipliers: {},
              minToUse: 0,
            };
            current.maxDelta += payload.maxDelta || 0;
            current.regenPerTurn += payload.regenPerTurn || 0;
            current.onMoveGain += payload.onMoveGain || 0;
            current.onHitGain += payload.onHitGain || 0;
            current.onCritGain += payload.onCritGain || 0;
            current.onKillGain += payload.onKillGain || 0;
            current.minToUse = Math.max(current.minToUse, payload.minToUse || 0);
            if (payload.spendMultipliers) {
              for (const [tag, mult] of Object.entries(payload.spendMultipliers)) {
                const prev = current.spendMultipliers[tag] || 1;
                current.spendMultipliers[tag] = prev * (mult || 1);
              }
            }
            resourceRules[pool] = current;
            mergeResourceTagMultipliers(mc, pool, current);
          }
        }
      }
    }

    // Conversions / Affinities
    if (Array.isArray(item.conversions)) {
      for (const conv of item.conversions) {
        if (!conv) continue;
        mc.offense.conversions.push({ ...conv });
      }
    }
    if (Array.isArray(item.offense?.conversions)) {
      for (const conv of item.offense.conversions) {
        if (!conv) continue;
        mc.offense.conversions.push({ ...conv });
      }
    }
    mergeRecord(mc.affinities, item.affinities);
    mergeRecord(mc.offense.affinities, item.affinities);
    if (item.offense?.affinities) {
      mergeRecord(mc.affinities, item.offense.affinities);
      mergeRecord(mc.offense.affinities, item.offense.affinities);
    }

    if (item.offense?.attunement) {
      mergeAttunementPayload(mc.attunementRules, item.offense.attunement);
    }
    if (item.defense?.attunement) {
      mergeAttunementPayload(mc.attunementRules, item.defense.attunement);
    }

    // Resists / Immunities
    if (Array.isArray(item.resists)) {
      for (const r of item.resists) {
        if (!r) continue;
        const type = r.type ?? r.id;
        if (!type) continue;
        if (r.immunity) {
          mc.immunities.add(type);
          mc.defense.immunities.add(type);
          continue;
        }
        const amount = Number(r.amount ?? r.value ?? r.percent ?? r.pct ?? 0) || 0;
        mc.resists[type] = (mc.resists[type] || 0) + amount;
        mc.defense.resists[type] = (mc.defense.resists[type] || 0) + amount;
      }
    } else if (item.resists && typeof item.resists === "object") {
      for (const type of Object.keys(item.resists)) {
        const amount = Number(item.resists[type]) || 0;
        mc.resists[type] = (mc.resists[type] || 0) + amount;
        mc.defense.resists[type] = (mc.defense.resists[type] || 0) + amount;
      }
    }
    if (item.defense?.resists) {
      mergeRecord(mc.resists, item.defense.resists);
      mergeRecord(mc.defense.resists, item.defense.resists);
    }
    if (Array.isArray(item.immunities)) {
      for (const type of item.immunities) {
        if (!type) continue;
        const key = String(type);
        mc.immunities.add(key);
        mc.defense.immunities.add(key);
      }
    }
    if (Array.isArray(item.defense?.immunities)) {
      for (const type of item.defense.immunities) {
        if (!type) continue;
        const key = String(type);
        mc.immunities.add(key);
        mc.defense.immunities.add(key);
      }
    }

    if (item.defense?.flatDR && allowField("flatDR")) {
      for (const [type, value] of Object.entries(item.defense.flatDR)) {
        const amount = Number(value) || 0;
        if (!amount) continue;
        mc.defense.flatDR[type] = (mc.defense.flatDR[type] || 0) + amount;
      }
    }

    if (item.defense && typeof item.defense === "object") {
      for (const [field, value] of Object.entries(item.defense)) {
        if (field === "resists" || field === "immunities" || field === "attunement" || field === "flatDR") {
          continue;
        }
        if (!Number.isFinite(value)) continue;
        if (!allowField(field)) continue;
        mc.defense[field] = (mc.defense[field] || 0) + Number(value);
      }
    }

    // Scalar offense/tempo knobs
    const dmgMult = Number(item.dmgMult);
    if (Number.isFinite(dmgMult)) {
      mc.dmgMult *= dmgMult;
    }
    const speedMult = Number(item.speedMult);
    if (Number.isFinite(speedMult)) {
      mc.speedMult *= speedMult;
    }

    // Polarity grant/bias
    if (item.polarity?.grant) {
      addGrantVector(actor, item.polarity.grant);
      mc.polarity.grant ||= Object.create(null);
      for (const [axis, value] of Object.entries(item.polarity.grant)) {
        const amount = Number(value) || 0;
        if (!amount) continue;
        mc.polarity.grant[axis] = (mc.polarity.grant[axis] || 0) + amount;
      }
    }
    if (item.polarity?.onHitBias) {
      mc.offense.polarity.onHitBias = mergePolarityBias(
        mc.offense.polarity.onHitBias,
        item.polarity.onHitBias,
      );
    }
    if (item.polarity?.defenseBias) {
      mc.defense.polarity.defenseBias = mergePolarityBias(
        mc.defense.polarity.defenseBias,
        item.polarity.defenseBias,
      );
    }

    // Status interaction
    if (item.statusMods) {
      const entries = Array.isArray(item.statusMods) ? item.statusMods : [item.statusMods];
      for (const sm of entries) {
        if (!sm) continue;
        mergeRecord(mc.status.inflictBonus, sm.inflictChanceBonus || sm.inflictBonus);
        mergeRecord(mc.status.inflictDurMult, sm.inflictDurationMult || sm.inflictDurMult);
        mergeRecord(mc.status.resistBonus, sm.resistChanceBonus || sm.resistBonus);
        mergeRecord(mc.status.recvDurMult, sm.receivedDurationMult ?? sm.recvDurMult);
        const buffDelta = Number(sm.buffDurationMult ?? sm.buffDurMult);
        if (Number.isFinite(buffDelta)) {
          const next = mc.status.buffDurMult * (1 + buffDelta);
          mc.status.buffDurMult = Math.max(0, next);
        }
        const freeAction = sm.freeAction || {};
        const freeIgnores = sm.freeActionIgnore || freeAction.ignore;
        if (Array.isArray(freeIgnores)) {
          for (const id of freeIgnores) {
            if (!id) continue;
            mc.status.freeActionIgnore.add(String(id));
          }
        }
        if (Number.isFinite(freeAction.cooldown)) {
          mc.status.freeActionCooldown = Math.max(
            mc.status.freeActionCooldown,
            Number(freeAction.cooldown),
          );
        }
        if (freeAction.purgeOnUse) {
          mc.status.freeActionPurge = true;
        }
      }
    }

    // Temporal
    if (item.temporal) {
      applyTemporalPayload(mc, item.temporal);
    }

    // Resource
    if (item.resource) {
      applyResourcePayload(mc, item.resource);
    }

    // Generic mod payloads
    const rawMods = [];
    if (Array.isArray(item.mods)) rawMods.push(...item.mods);
    if (Array.isArray(item.modifiers)) rawMods.push(...item.modifiers);
    for (const mod of rawMods) {
      if (!mod || typeof mod !== "object") continue;
      if (mod.kind === "temporal") {
        applyTemporalPayload(mc, mod);
      }
      if (mod.temporal) {
        applyTemporalPayload(mc, mod.temporal);
      }
      if (mod.payload) {
        applyTemporalPayload(mc, mod.payload);
        applyResourcePayload(mc, mod.payload);
      }
      if (Array.isArray(mod.payloads)) {
        for (const payload of mod.payloads) {
          applyTemporalPayload(mc, payload?.temporal ?? payload);
          applyResourcePayload(mc, payload?.resource ?? payload);
        }
      }
      if (mod.payload?.temporal) {
        applyTemporalPayload(mc, mod.payload.temporal);
      }

      if (mod.attunement) {
        mergeAttunementPayload(mc.attunementRules, mod.attunement);
      }
      if (mod.payload?.attunement) {
        mergeAttunementPayload(mc.attunementRules, mod.payload.attunement);
      }
      if (Array.isArray(mod.payloads)) {
        for (const payload of mod.payloads) {
          if (!payload) continue;
          if (payload.attunement) {
            mergeAttunementPayload(mc.attunementRules, payload.attunement);
          }
        }
      }

      if (mod.kind === "resource") {
        applyResourcePayload(mc, mod);
      }
      if (mod.resource) {
        applyResourcePayload(mc, mod.resource);
      }
      if (mod.payload?.resource) {
        applyResourcePayload(mc, mod.payload.resource);
      }
    }
  }

  const combinedPolarity = Object.create(null);
  for (const axis of POLAR_AXES) {
    const base = Number(actor.polarity?.[axis] || 0);
    const grant = Number(mc.polarity.grant?.[axis] || 0);
    combinedPolarity[axis] = base + grant;
  }
  actor.polarityRaw = combinedPolarity;
  actor.polarityEffective = normalizePolaritySigned(combinedPolarity);
  actor.polarityVector = actor.polarityEffective;
  mc.offense.polarity.grant = { ...mc.polarity.grant };
  mc.defense.polarity.grant = { ...mc.polarity.grant };
  mc.statusInteraction = mc.status;

  mc.offense.brands = Array.isArray(mc.offense.brandAdds)
    ? mc.offense.brandAdds.slice()
    : [];

  mc.temporalHooks = { ...temporalHooks };
  mc.temporal.cooldownPct = (mc.temporal.cooldownPct || 0) + (temporalHooks.cooldownPct || 0);
  const clonedRules = Object.create(null);
  for (const [pool, rule] of Object.entries(resourceRules)) {
    clonedRules[pool] = {
      ...rule,
      spendMultipliers: { ...(rule.spendMultipliers || {}) },
    };
  }
  mc.resourceRules = clonedRules;

  const temporalBase = {
    actionSpeedPct: 0,
    moveAPDelta: 0,
    cooldownPct: 0,
    initBonus: 0,
    castTimeDelta: 0,
    recoveryPct: 0,
  };
  const prevTemporal =
    actor.temporal && typeof actor.temporal === "object"
      ? actor.temporal
      : temporalBase;
  actor.temporal = {
    ...temporalBase,
    ...prevTemporal,
    ...temporalHooks,
  };

  const resourceRoot =
    actor.resources && typeof actor.resources === "object"
      ? actor.resources
      : (actor.resources = { pools: Object.create(null) });
  const pools = resourceRoot.pools || Object.create(null);
  resourceRoot.pools = pools;
  if (actor.res && actor.res !== actor.resources && typeof actor.res === "object") {
    actor.res.pools = pools;
  }
  const seenPools = new Set();
  for (const [pool, rule] of Object.entries(resourceRules)) {
    seenPools.add(pool);
    const existing = pools[pool] || {};
    const baseMax = Number.isFinite(existing.baseMax)
      ? existing.baseMax
      : Number.isFinite(existing.max)
      ? existing.max
      : Number.isFinite(existing.cur)
      ? existing.cur
      : 0;
    const max = Math.max(0, baseMax + (rule.maxDelta || 0));
    const curSource = Number.isFinite(existing.cur) ? existing.cur : max;
    const cur = Math.min(max, curSource);
    const spendMultipliers = { ...(existing.spendMultipliers || {}) };
    if (rule.spendMultipliers) {
      for (const [tag, mult] of Object.entries(rule.spendMultipliers)) {
        const prev = spendMultipliers[tag] || 1;
        spendMultipliers[tag] = prev * (mult || 1);
      }
    }
    pools[pool] = {
      cur,
      max,
      regenPerTurn: rule.regenPerTurn || 0,
      onMoveGain: rule.onMoveGain || 0,
      onHitGain: rule.onHitGain || 0,
      onCritGain: rule.onCritGain || 0,
      onKillGain: rule.onKillGain || 0,
      spendMultipliers,
      minToUse: rule.minToUse || 0,
      baseMax,
    };
  }
  for (const [key, state] of Object.entries(pools)) {
    if (seenPools.has(key)) continue;
    if (Number.isFinite(state?.baseMax)) {
      const baseMax = Math.max(0, Math.floor(Number(state.baseMax)));
      state.max = baseMax;
      const current = Number.isFinite(state.cur) ? Number(state.cur) : baseMax;
      state.cur = Math.min(baseMax, Math.max(0, current));
      state.regenPerTurn = 0;
      state.onMoveGain = 0;
      state.onHitGain = 0;
      state.onCritGain = 0;
      state.onKillGain = 0;
      state.spendMultipliers = {};
      state.minToUse = Number(state.minToUse || 0);
      continue;
    }
    delete pools[key];
  }

  // Clamp resists per plan: [-0.50, +0.80]
  for (const key of Object.keys(mc.defense.resists)) {
    mc.defense.resists[key] = Math.max(
      COMBAT_RESIST_MIN,
      Math.min(COMBAT_RESIST_MAX, mc.defense.resists[key]),
    );
  }
  for (const key of Object.keys(mc.resists)) {
    mc.resists[key] = Math.max(
      COMBAT_RESIST_MIN,
      Math.min(COMBAT_RESIST_MAX, mc.resists[key]),
    );
  }

  if (Number.isFinite(mc.temporal.actionSpeedPct)) {
    mc.temporal.actionSpeedPct = Math.min(0.75, mc.temporal.actionSpeedPct);
  }

  actor.attunement = actor.attunement || {};
  actor.attunement.rules = mc.attunementRules;
  actor.attunement.stacks = actor.attunement.stacks || Object.create(null);
  for (const key of Object.keys(actor.attunement.stacks)) {
    if (!mc.attunementRules[key]) {
      delete actor.attunement.stacks[key];
    }
  }

  // Rebuild status-derived (equip can change it)
  actor.statusDerived = rebuildDerived(actor);
  return mc;
}

/**
 * Convenience helper for folding modifiers from an array or record of items.
 * Primarily useful for lightweight tests that don't need a full actor.
 * @param {Array<any>|Record<string, any>} items
 */
export function foldMods(items) {
  const actor = {
    equipment: {},
    statuses: [],
    attunement: { rules: Object.create(null), stacks: Object.create(null) },
  };

  if (Array.isArray(items)) {
    let idx = 0;
    for (const item of items) {
      actor.equipment[`slot${idx++}`] = item;
    }
  } else if (items && typeof items === "object") {
    actor.equipment = { ...items };
  }

  return foldModsFromEquipment(actor);
}
