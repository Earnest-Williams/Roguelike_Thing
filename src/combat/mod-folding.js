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
 * Adds numeric properties from `add` into `into`.
 * @param {Record<string, number>} into
 * @param {Record<string, number>|undefined|null} add
 */
function add(into, add) {
  if (!add) return;
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
      cooldownMult: 1,
      cooldownPerTag: new Map(),
      echo: null,
      onKillHaste: null,
    },
    resource: {
      maxFlat: { stamina: 0, mana: 0 },
      maxPct: { stamina: 0, mana: 0 },
      regenFlat: { stamina: 0, mana: 0 },
      regenPct: { stamina: 0, mana: 0 },
      costMult: { stamina: 1, mana: 1 },
      onHitGain: null,
      onKillGain: null,
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
      const t = item.temporal;
      mc.temporal.actionSpeedPct += Number(t.actionSpeedPct) || 0;
      mc.temporal.moveAPDelta += Number(t.moveAPDelta) || 0;
      const cooldownMult = Number(t.cooldownMult);
      if (Number.isFinite(cooldownMult)) {
        mc.temporal.cooldownMult *= cooldownMult;
      }
      if (t.cooldownPerTag instanceof Map) {
        for (const [tag, mult] of t.cooldownPerTag.entries()) {
          const prev = mc.temporal.cooldownPerTag.get(tag) || 1;
          mc.temporal.cooldownPerTag.set(tag, prev * (Number(mult) || 1));
        }
      } else if (Array.isArray(t.cooldownPerTag)) {
        for (const entry of t.cooldownPerTag) {
          if (!entry) continue;
          const tag = entry.tag ?? entry.type ?? entry.id;
          if (!tag) continue;
          const prev = mc.temporal.cooldownPerTag.get(tag) || 1;
          mc.temporal.cooldownPerTag.set(tag, prev * (Number(entry.mult ?? entry.value ?? entry.amount ?? entry.pct ?? entry.percent) || 1));
        }
      } else if (t.cooldownPerTag && typeof t.cooldownPerTag === "object") {
        for (const tag of Object.keys(t.cooldownPerTag)) {
          const prev = mc.temporal.cooldownPerTag.get(tag) || 1;
          mc.temporal.cooldownPerTag.set(tag, prev * (Number(t.cooldownPerTag[tag]) || 1));
        }
      }
      if (t.echo !== undefined && t.echo !== null) {
        mc.temporal.echo = t.echo;
      }
      if (t.onKillHaste) {
        mc.temporal.onKillHaste = t.onKillHaste;
      }
    }

    // Resource
    if (item.resource) {
      const r = item.resource;
      add(mc.resource.maxFlat, {
        stamina: r.maxStaminaFlat ?? r.maxFlat?.stamina ?? 0,
        mana: r.maxManaFlat ?? r.maxFlat?.mana ?? 0,
      });
      add(mc.resource.maxPct, {
        stamina: r.maxStaminaPct ?? r.maxPct?.stamina ?? 0,
        mana: r.maxManaPct ?? r.maxPct?.mana ?? 0,
      });
      add(mc.resource.regenFlat, {
        stamina: r.staminaRegenPerTurn ?? r.regenFlat?.stamina ?? 0,
        mana: r.manaRegenPerTurn ?? r.regenFlat?.mana ?? 0,
      });
      add(mc.resource.regenPct, {
        stamina: r.staminaRegenPct ?? r.regenPct?.stamina ?? 0,
        mana: r.manaRegenPct ?? r.regenPct?.mana ?? 0,
      });
      if (r.costMult) {
        const staminaMult = Number(r.costMult.stamina);
        if (Number.isFinite(staminaMult)) {
          mc.resource.costMult.stamina *= staminaMult;
        }
        const manaMult = Number(r.costMult.mana);
        if (Number.isFinite(manaMult)) {
          mc.resource.costMult.mana *= manaMult;
        }
      }
      const staminaCostMult = Number(r.staminaCostMult);
      if (Number.isFinite(staminaCostMult)) {
        mc.resource.costMult.stamina *= staminaCostMult;
      }
      const manaCostMult = Number(r.manaCostMult);
      if (Number.isFinite(manaCostMult)) {
        mc.resource.costMult.mana *= manaCostMult;
      }
      if (r.onHitGain && !mc.resource.onHitGain) {
        mc.resource.onHitGain = r.onHitGain;
      }
      if (r.onKillGain && !mc.resource.onKillGain) {
        mc.resource.onKillGain = r.onKillGain;
      }
      if (r.channeling) {
        mc.resource.channeling = true;
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
