// src/combat/mod-folding.js
// @ts-check
import { rebuildStatusDerived } from "./status.js";

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

/**
 * Merge polarity bias style maps additively.
 * @param {Record<string, number>} into
 * @param {Record<string, number>|undefined|null} add
 */
function mergePolarity(into, add) {
  if (!add) return;
  for (const key of Object.keys(add)) {
    const amount = Number(add[key]) || 0;
    into[key] = (into[key] || 0) + amount;
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

/**
 * Applies a temporal payload to the provided mod cache.
 * @param {import("./actor.js").Actor['modCache']} cache
 * @param {any} payload
 */
function applyTemporalPayload(cache, payload) {
  if (!payload) return;
  const temporal = cache.temporal;
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
  addNumber("apCapFlat", "apCapFlat", "apCapDelta", "apCapAdd", "apMaxFlat", "apMaxDelta");
  addNumber("apCapPct", "apCapPct", "apCapPercent", "apMaxPct", "apMaxPercent");
  multNumber("apCapMult", "apCapMult", "apCapMultiplier", "apMaxMultiplier");
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
  if (cooldownPerTag instanceof Map) {
    for (const [tag, mult] of cooldownPerTag.entries()) {
      if (!tag) continue;
      const prev = temporal.cooldownPerTag.get(tag) || 1;
      temporal.cooldownPerTag.set(tag, prev * (Number(mult) || 1));
    }
  } else if (Array.isArray(cooldownPerTag)) {
    for (const entry of cooldownPerTag) {
      if (!entry) continue;
      const tag = entry.tag ?? entry.type ?? entry.id;
      if (!tag) continue;
      const prev = temporal.cooldownPerTag.get(tag) || 1;
      const value = Number(entry.mult ?? entry.value ?? entry.amount ?? entry.pct ?? entry.percent ?? entry.multiplier ?? 0) || 1;
      temporal.cooldownPerTag.set(tag, prev * value);
    }
  } else if (cooldownPerTag && typeof cooldownPerTag === "object") {
    for (const tag of Object.keys(cooldownPerTag)) {
      const prev = temporal.cooldownPerTag.get(tag) || 1;
      const value = Number(cooldownPerTag[tag]) || 1;
      temporal.cooldownPerTag.set(tag, prev * value);
    }
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
  const resource = cache.resource;
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

  merge(resource.leechFlat, payload.leechFlat);
  addResource(resource.leechFlat, "hp", "hpLeechFlat", "hpLeech");
  addResource(resource.leechFlat, "stamina", "staminaLeechFlat", "staminaLeech");
  addResource(resource.leechFlat, "mana", "manaLeechFlat", "manaLeech");

  merge(resource.leechPct, payload.leechPct);
  addResource(resource.leechPct, "hp", "hpLeechPct", "hpLeechPercent");
  addResource(resource.leechPct, "stamina", "staminaLeechPct", "staminaLeechPercent");
  addResource(resource.leechPct, "mana", "manaLeechPct", "manaLeechPercent");

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
  const applyCostPerTag = (tag, value) => {
    if (!tag) return;
    const key = String(tag);
    const prev = resource.costPerTag.get(key) || { hp: 1, stamina: 1, mana: 1 };
    if (typeof value === "number") {
      const mult = Number(value);
      if (Number.isFinite(mult)) {
        for (const res of ["hp", "stamina", "mana"]) {
          prev[res] = (prev[res] ?? 1) * mult;
        }
      }
    } else if (value && typeof value === "object") {
      for (const res of Object.keys(value)) {
        const mult = Number(value[res]);
        if (!Number.isFinite(mult)) continue;
        prev[res] = (prev[res] ?? 1) * mult;
      }
    }
    resource.costPerTag.set(key, prev);
  };
  const costPerTag =
    payload.costPerTag ??
    payload.costMultByTag ??
    payload.costMultiplierByTag ??
    payload.costByTag;
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
  const mc = actor.modCache = {
    resists: Object.create(null),
    affinities: Object.create(null),
    immunities: new Set(),
    dmgMult: 1,
    speedMult: 1,
    brands: [],
    offense: {
      conversions: [],
      brandAdds: [],
      affinities: Object.create(null),
      polarity: { onHitBias: {} },
    },
    defense: {
      resists: Object.create(null),
      immunities: new Set(),
      polarity: { defenseBias: {} },
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
    },
    polarity: { onHitBias: {}, defenseBias: {} },
  };

  actor.polarity = {};

  const equipment = actor.equipment || {};
  for (const slot of Object.keys(equipment)) {
    const item = asItem(equipment[slot]);
    if (!item) continue;

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
      }
    }

    // Conversions / Affinities
    if (Array.isArray(item.conversions)) {
      for (const conv of item.conversions) {
        if (!conv) continue;
        mc.offense.conversions.push({
          from: conv.from ?? null,
          to: conv.to,
          percent: Number(conv.percent ?? conv.pct ?? 0) || 0,
          includeBaseOnly: !!conv.includeBaseOnly,
        });
      }
    }
    if (Array.isArray(item.offense?.conversions)) {
      for (const conv of item.offense.conversions) {
        if (!conv) continue;
        mc.offense.conversions.push({
          from: conv.from ?? null,
          to: conv.to,
          percent: Number(conv.percent ?? conv.pct ?? 0) || 0,
          includeBaseOnly: !!conv.includeBaseOnly,
        });
      }
    }
    mergeRecord(mc.affinities, item.affinities);
    mergeRecord(mc.offense.affinities, item.affinities);
    if (item.offense?.affinities) {
      mergeRecord(mc.affinities, item.offense.affinities);
      mergeRecord(mc.offense.affinities, item.offense.affinities);
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
      for (const key of Object.keys(item.polarity.grant)) {
        actor.polarity[key] = (actor.polarity[key] || 0) + (Number(item.polarity.grant[key]) || 0);
      }
    }
    if (item.polarity?.onHitBias) {
      mergePolarity(mc.polarity.onHitBias, item.polarity.onHitBias);
      mergePolarity(mc.offense.polarity.onHitBias, item.polarity.onHitBias);
    }
    if (item.polarity?.defenseBias) {
      mergePolarity(mc.polarity.defenseBias, item.polarity.defenseBias);
      mergePolarity(mc.defense.polarity.defenseBias, item.polarity.defenseBias);
    }

    // Status interaction
    if (item.statusMods) {
      const sm = item.statusMods;
      mergeRecord(mc.status.inflictBonus, sm.inflictBonus || sm.inflictChanceBonus);
      mergeRecord(mc.status.inflictDurMult, sm.inflictDurMult || sm.inflictDurationMult);
      mergeRecord(mc.status.resistBonus, sm.resistBonus || sm.resistChanceBonus);
      mergeRecord(mc.status.recvDurMult, sm.recvDurMult ?? sm.receivedDurationMult);
      const buffMult = Number(sm.buffDurMult ?? sm.buffDurationMult);
      if (Number.isFinite(buffMult)) {
        mc.status.buffDurMult *= buffMult;
      }
      const freeIgnores = sm.freeActionIgnore || sm.freeAction?.ignore;
      if (Array.isArray(freeIgnores)) {
        for (const id of freeIgnores) {
          if (id) mc.status.freeActionIgnore.add(String(id));
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
      const temporalPayloads = [];
      if (mod.kind === "temporal") temporalPayloads.push(mod);
      if (mod.temporal && typeof mod.temporal === "object") temporalPayloads.push(mod.temporal);
      if (mod.payload?.temporal && typeof mod.payload.temporal === "object") {
        temporalPayloads.push(mod.payload.temporal);
      }
      for (const payload of temporalPayloads) {
        applyTemporalPayload(mc, payload);
      }

      const resourcePayloads = [];
      if (mod.kind === "resource") resourcePayloads.push(mod);
      if (mod.resource && typeof mod.resource === "object") resourcePayloads.push(mod.resource);
      if (mod.payload?.resource && typeof mod.payload.resource === "object") {
        resourcePayloads.push(mod.payload.resource);
      }
      for (const payload of resourcePayloads) {
        applyResourcePayload(mc, payload);
      }
    }
  }

  // Clamp resists per plan: [-0.50, +0.80]
  for (const key of Object.keys(mc.defense.resists)) {
    mc.defense.resists[key] = Math.max(-0.50, Math.min(0.80, mc.defense.resists[key]));
  }
  for (const key of Object.keys(mc.resists)) {
    mc.resists[key] = Math.max(-0.50, Math.min(0.80, mc.resists[key]));
  }

  // Rebuild status-derived (equip can change it)
  actor.statusDerived = rebuildStatusDerived(actor);
  return mc;
}
