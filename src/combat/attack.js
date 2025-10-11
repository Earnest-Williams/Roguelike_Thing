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
 */

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function resolveAttack(ctx) {
  const { attacker, defender } = ctx;
  if (defender && !defender.resources) {
    if (defender.res) defender.resources = defender.res;
    else defender.resources = { hp: defender.hp ?? 0 };
  }
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

  // 5) Polarity (offense/defense scalars)
  const polOn = polarityOnHitScalar(attacker.polarity || attacker.modCache?.polarity?.onHitBias || {}, defender.polarity || defender.modCache?.polarity?.defenseBias || {});
  for (const k of Object.keys(packets)) packets[k] = Math.floor(packets[k] * (1 + polOn));

  // 6) Status-derived (outgoing/incoming)
  const atkSD = attacker.statusDerived || {};
  const defSD = defender.statusDerived || {};
  for (const k of Object.keys(packets)) {
    const out = (atkSD.damageDealtMult?.[k] || 0);
    const inn = (defSD.damageTakenMult?.[k] || 0);
    packets[k] = Math.floor(packets[k] * (1 + out));
    packets[k] = Math.floor(packets[k] * (1 + inn));
  }

  // 7) Immunities & Resists & Polarity defense
  const defRes = defender.modCache?.defense?.resists || {};
  const defImm = defender.modCache?.defense?.immunities || defender.modCache?.immunities || new Set();
  const polDef = polarityDefScalar(defender.polarity || defender.modCache?.polarity?.defenseBias || {}, attacker.polarity || attacker.modCache?.polarity?.onHitBias || {});
  for (const k of Object.keys(packets)) {
    if (defImm?.has?.(k)) { packets[k] = 0; continue; }
    const resist = clamp((defRes[k] || 0) + (defSD.resistDelta?.[k] || 0), -0.50, 0.80);
    packets[k] = Math.floor(packets[k] * (1 - resist));
    packets[k] = Math.floor(packets[k] * (1 - polDef));
  }

  // 8) Armour/DR (optional hook; physical-first)
  // if (defender.armor) { ... }

  // 9) Sum & apply
  const total = Object.values(packets).reduce((a, b) => a + (b|0), 0);
  if (defender.resources) {
    defender.resources.hp = Math.max(0, (defender.resources.hp|0) - total);
    if (defender.res && defender.res !== defender.resources) defender.res.hp = defender.resources.hp;
  }

  // 10) Status application
  const appliedStatuses = applyStatuses(ctx, attacker, defender, ctx.turn);

  return { packetsAfterDefense: packets, totalDamage: total, appliedStatuses };
}

// Simple polarity scalars (cap ±0.5)
export function polarityOnHitScalar(att, def) {
  const ks = ["order","growth","chaos","decay","void"];
  let sum = 0;
  for (const k of ks) sum += (att[k] || 0) * (-(def[k] || 0));
  return clamp(sum, -0.5, 0.5);
}
export function polarityDefScalar(def, att) {
  const ks = ["order","growth","chaos","decay","void"];
  let sum = 0;
  for (const k of ks) sum += (def[k] || 0) * (-(att[k] || 0));
  return clamp(sum, -0.5, 0.5);
}
