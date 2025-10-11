// src/combat/attack.js
// @ts-check
import { applyStatuses } from "./status.js";

/**
 * @typedef {Object} AttackContext
 * @property {any} attacker
 * @property {any} defender
 * @property {number} turn
 * @property {number} physicalBase
 * @property {number} [physicalBonus]
 * @property {Record<string, number>} [prePackets]
 * @property {Array<{id:string, baseChance:number, baseDuration:number, stacks?:number}>} [statusAttempts]
 * @property {Array<string>} [tags]
 * @property {Array<{to:string, percent?:number, pct?:number, includeBaseOnly?:boolean}>} [conversions]
 * @property {Array<{type:string, flat?:number, percent?:number, pct?:number, onHitStatuses?:any[]}>} [brands]
 */

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

const POLAR_OPPOSE = Object.freeze({
  order: ["chaos", "void"],
  growth: ["decay", "void"],
  chaos: ["order", "void"],
  decay: ["growth", "void"],
  void: ["order", "growth", "chaos", "decay"],
});

export function resolveAttack(ctx) {
  if (!ctx.attacker) {
    throw new Error("resolveAttack: ctx.attacker is required");
  }
  if (!ctx.defender) {
    throw new Error("resolveAttack: ctx.defender is required");
  }
  const attacker = ctx.attacker;
  const defender = ctx.defender;
  const { resource: defenderResources, syncHp: syncDefenderHp } = ensureResourceHandles(defender);

  let basePool = Math.max(0, Math.floor(ctx.physicalBase || 0));
  let bonusPool = Math.max(0, Math.floor(ctx.physicalBonus || 0));
  /** @type {Record<string, number>} */
  const packets = { ...(ctx.prePackets || {}) };

  // 1) Conversions (includeBaseOnly, then global)
  const conv = [
    ...(Array.isArray(ctx.conversions) ? ctx.conversions : []),
    ...(attacker.modCache?.offense?.conversions || []),
  ];
  const convBase = basePool;
  for (const c of conv) {
    const src = (c.includeBaseOnly ? convBase : (basePool + bonusPool));
    const amt = Math.floor(src * (c.percent || c.pct || 0));
    if (amt > 0 && c.to) {
      if (!packets[c.to]) packets[c.to] = 0;
      packets[c.to] += amt;
      if (c.includeBaseOnly) {
        basePool -= amt;
      } else {
        const sum = basePool + bonusPool || 1;
        const fb = Math.round(amt * (basePool / sum));
        basePool -= fb;
        bonusPool -= (amt - fb);
      }
    }
  }

  // 2) Remaining physical → packets
  packets.physical = (packets.physical || 0) + basePool + bonusPool;

  // 3) Brands (flats + percent of remaining physical; no feedback into conversions)
  const brands = [
    ...(Array.isArray(ctx.brands) ? ctx.brands : []),
    ...(attacker.modCache?.offense?.brandAdds || attacker.modCache?.brands || []),
  ];
  const remainingPhys = packets.physical || 0;
  for (const b of brands) {
    if (!b?.type) continue;
    const flat = Math.floor(b.flat || 0);
    const pct = Math.max(0, b.percent || b.pct || 0);
    if (!packets[b.type]) packets[b.type] = 0;
    const add = flat + Math.floor(remainingPhys * pct);
    if (add > 0) packets[b.type] += add;
    if (b.onHitStatuses) {
      ctx.statusAttempts ||= [];
      ctx.statusAttempts.push(...b.onHitStatuses);
    }
  }

  // 4) Affinities (attacker)
  const aff = attacker.modCache?.offense?.affinities || {};
  for (const k of Object.keys(packets)) {
    packets[k] = Math.floor(packets[k] * (1 + (aff[k] || 0)));
  }

  // 5) Status-derived (outgoing/incoming) and Polarity
  const atkSD = attacker.statusDerived || {};
  const defSD = defender.statusDerived || {};
  const polOff = polarityOnHitScalar(
    attacker.polarity || attacker.modCache?.polarity?.onHitBias,
    defender.polarity || defender.modCache?.polarity?.defenseBias,
  );
  const polDef = polarityDefScalar(
    defender.polarity || defender.modCache?.polarity?.defenseBias,
    attacker.polarity || attacker.modCache?.polarity?.onHitBias,
  );

  // 6) Immunities & Resists
  const defRes = defender.modCache?.defense?.resists || {};
  const defImm = defender.modCache?.defense?.immunities || defender.modCache?.immunities || new Set();
  for (const type of Object.keys(packets)) {
    if (defImm?.has?.(type)) { packets[type] = 0; continue; }
    let value = packets[type];
    const out = (atkSD.damageDealtMult?.[type] || 0);
    const inn = (defSD.damageTakenMult?.[type] || 0);
    if (out) value = Math.floor(value * (1 + out));
    if (inn) value = Math.floor(value * (1 + inn));
    if (polOff || polDef) {
      value = Math.floor(value * (1 + polOff) * (1 - polDef));
    }
    const resist = clamp((defRes[type] || 0) + (defSD.resistDelta?.[type] || 0), -0.50, 0.80);
    if (resist) value = Math.floor(value * (1 - resist));
    packets[type] = value;
  }

  // 7) Armour/DR (optional hook; physical-first)
  // if (defender.armor) { ... }

  // 8) Sum & apply
  const total = Object.values(packets).reduce((a, b) => a + (b|0), 0);
  const currentHp = (defenderResources?.hp ?? 0) | 0;
  const nextHp = Math.max(0, currentHp - total);
  syncDefenderHp(nextHp);

  // 9) Status application
  const appliedStatuses = applyStatuses(ctx, attacker, defender, ctx.turn);

  return { packetsAfterDefense: packets, totalDamage: total, appliedStatuses };
}

function ensureResourceHandles(defender) {
  if (!defender) {
    return { resource: null, syncHp: () => {} };
  }
  let resource = defender.resources;
  if (!resource) {
    if (defender.res) {
      resource = defender.res;
      defender.resources = resource;
    } else {
      const startHp = typeof defender.hp === "number" ? defender.hp : 0;
      resource = { hp: startHp };
      defender.resources = resource;
      if (!defender.res) defender.res = resource;
    }
  }
  if (typeof resource.hp !== "number") {
    resource.hp = typeof defender.hp === "number" ? defender.hp : 0;
  }
  return {
    resource,
    syncHp(nextHp) {
      if (resource) resource.hp = nextHp;
      if (defender.resources && defender.resources !== resource) {
        defender.resources.hp = nextHp;
      }
      if (defender.res && defender.res !== resource) {
        defender.res.hp = nextHp;
      }
      defender.hp = nextHp;
    },
  };
}

// Simple polarity scalars (cap ±0.5)
export function polarityOnHitScalar(att, def) {
  if (!att) return 0;
  const oppositions = POLAR_OPPOSE[att.dominant];
  if (!oppositions) return 0;
  let bias = 0;
  for (const o of oppositions) bias += (Number(def?.[o]) || 0);
  return clamp(bias * 0.25, -0.5, 0.5);
}
export function polarityDefScalar(def, att) {
  if (!def) return 0;
  const oppositions = POLAR_OPPOSE[def.dominant];
  if (!oppositions) return 0;
  let bias = 0;
  for (const o of oppositions) bias += (Number(att?.[o]) || 0);
  return clamp(bias * 0.25, -0.5, 0.5);
}
