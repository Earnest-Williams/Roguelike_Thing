// src/combat/attack.js
// @ts-check
import { COMBAT_RESIST_MAX, COMBAT_RESIST_MIN } from "../config.js";
import { HEALTH_FLOOR } from "../../constants.js";
import { applyOutgoingScaling, noteUseGain } from "./attunement.js";
import { applyStatuses } from "./status.js";
import { polarityDefScalar, polarityOnHitScalar } from "./polarity.js";
import { logAttackStep } from "./debug-log.js";
import { makeAttackContext } from "./attack-context.js";
import { eventGain } from "./resources.js";
import { POLAR_BIAS } from "./constants.js";
import { logEvent } from "./debug.js";

function applyPolarityBias(attacker, defender, packet) {
  if (!packet || !Number.isFinite(packet.amount)) return packet?.amount ?? 0;
  const aPol = attacker?.polarity?.type || attacker?.polarity;
  const dPol = defender?.polarity?.type || defender?.polarity;
  const aKey = typeof aPol === "string" ? aPol : attacker?.polarity?.current;
  const dKey = typeof dPol === "string" ? dPol : defender?.polarity?.current;
  const bias = (POLAR_BIAS[aKey]?.[dKey]) || 0;
  return packet.amount * (1 + bias);
}

function gatherResist(source, type) {
  if (!source) return 0;
  if (source instanceof Map) {
    const value = source.get(type);
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof source === "object") {
    const value = source[type];
    return Number.isFinite(value) ? value : 0;
  }
  return 0;
}

function gatherFlat(source, type) {
  if (!source) return 0;
  if (source instanceof Map) {
    const value = source.get(type);
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof source === "object") {
    const value = source[type];
    return Number.isFinite(value) ? value : 0;
  }
  return 0;
}

function hasImmunity(defender, type) {
  const candidates = [
    defender?.immunities,
    defender?.modCache?.immunities,
    defender?.modCache?.defense?.immunities,
  ];
  for (const source of candidates) {
    if (!source) continue;
    if (source instanceof Set && source.has(type)) return true;
    if (Array.isArray(source) && source.includes(type)) return true;
    if (typeof source === "object" && source[type]) return true;
  }
  return false;
}

function applyDefenses(defender, packet, derived) {
  if (!packet) return 0;
  const type = packet.type;
  let amount = Number(packet.amount) || 0;
  if (amount <= 0) return 0;
  if (hasImmunity(defender, type)) return 0;

  const resists = [
    defender?.resistsPct,
    defender?.modCache?.resists,
    defender?.modCache?.defense?.resists,
    derived?.resistsPct,
    derived?.resistDelta,
  ];
  let resistPct = 0;
  for (const src of resists) {
    resistPct += gatherResist(src, type);
  }
  resistPct = clamp(resistPct, COMBAT_RESIST_MIN, COMBAT_RESIST_MAX);
  amount *= Math.max(0, 1 - resistPct);

  const flats = [
    defender?.flatDR,
    defender?.modCache?.defense?.flatDR,
    derived?.flatDR,
  ];
  let flat = 0;
  for (const src of flats) flat += gatherFlat(src, type);
  amount = Math.max(0, amount - flat);
  return Math.max(0, Math.floor(amount));
}

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
 * @property {ReturnType<typeof makeAttackContext>} [breakdown]
 */

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function prepareBreakdown(ctx) {
  const existing = ctx.breakdown;
  const attempts = Array.isArray(ctx.statusAttempts)
    ? ctx.statusAttempts
    : Array.isArray(ctx.attempts)
    ? ctx.attempts
    : Array.isArray(existing?.attempts)
    ? existing.attempts
    : [];

  const base =
    existing && Array.isArray(existing.steps)
      ? existing
      : makeAttackContext({
          attacker: ctx.attacker,
          defender: ctx.defender,
          turn: ctx.turn ?? 0,
          prePackets: ctx.prePackets || {},
          attempts,
        });

  base.attacker = ctx.attacker;
  base.defender = ctx.defender;
  base.turn = ctx.turn ?? 0;
  base.prePackets = { ...(ctx.prePackets || {}) };
  base.postPackets = {};
  base.steps ||= [];
  base.steps.length = 0;
  base.appliedStatuses = [];
  base.totalDamage = 0;

  const sharedAttempts = Array.isArray(attempts) ? attempts : [];
  ctx.statusAttempts = sharedAttempts;
  ctx.attempts = sharedAttempts;
  base.attempts = sharedAttempts;

  ctx.breakdown = base;
  return base;
}

export function resolveAttack(ctx) {
  if (!ctx.attacker) {
    throw new Error("resolveAttack: ctx.attacker is required");
  }
  if (!ctx.defender) {
    throw new Error("resolveAttack: ctx.defender is required");
  }
  const attacker = ctx.attacker;
  const defender = ctx.defender;
  const attack = ctx.attack;
  const { resource: defenderResources, syncHp: syncDefenderHp } = ensureResourceHandles(defender);

  const breakdown = prepareBreakdown(ctx);

  logAttackStep(attacker, {
    step: "begin",
    attack: attack || null,
    ctx: {
      defenderId: defender?.id,
      turn: ctx.turn,
      physicalBase: ctx.physicalBase,
      physicalBonus: ctx.physicalBonus,
      tags: ctx.tags,
    },
  });

  let basePool = Math.max(0, Math.floor(ctx.physicalBase || 0));
  let bonusPool = Math.max(0, Math.floor(ctx.physicalBonus || 0));
  /** @type {Record<string, number>} */
  const packets = { ...(ctx.prePackets || {}) };

  logAttackStep(attacker, {
    step: "seed",
    basePool,
    bonusPool,
    packets: { ...packets },
    dmg: basePool + bonusPool,
  });

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

  breakdown.steps.push({ stage: "start", packets: { ...packets } });

  // 3) Brands (flats + percent of remaining physical; no feedback into conversions)
  const brands = [
    ...(Array.isArray(ctx.brands) ? ctx.brands : []),
    ...(attacker.modCache?.offense?.brandAdds || attacker.modCache?.offense?.brands || attacker.modCache?.brands || []),
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

  breakdown.attempts = ctx.statusAttempts || breakdown.attempts;

  logAttackStep(attacker, {
    step: "post_conversion_brand",
    packets: { ...packets },
    conversions: conv,
    brands,
    dmg: Object.values(packets).reduce((sum, value) => sum + (value | 0), 0),
  });

  // 3.25) Attunement scaling before other offensive multipliers
  const attunementPackets = Object.entries(packets).map(([type, amount]) => ({
    type,
    amount,
  }));
  applyOutgoingScaling({ packets: attunementPackets, attacker, target: defender });
  for (const packet of attunementPackets) {
    packets[packet.type] = Math.max(0, packet.amount);
  }

  // 3.5) Global outgoing damage multiplier (applies uniformly to all packets)
  const dmgMultRaw = attacker.modCache?.dmgMult;
  const dmgMult = Number.isFinite(dmgMultRaw) ? Math.max(0, dmgMultRaw) : 1;
  if (dmgMult !== 1) {
    for (const type of Object.keys(packets)) {
      packets[type] = Math.floor(packets[type] * dmgMult);
    }
  }

  // 5) Affinities (attacker)
  const aff = attacker.modCache?.offense?.affinities || {};
  for (const k of Object.keys(packets)) {
    packets[k] = Math.floor(packets[k] * (1 + (aff[k] || 0)));
  }

  breakdown.steps.push({ stage: "offense", packets: { ...packets } });

  // 6) Status-derived (outgoing/incoming) and Polarity
  const atkSD = attacker.statusDerived || {};
  const defSD = defender.statusDerived || {};
  const polOff = polarityOnHitScalar(attacker, defender);
  const polDef = polarityDefScalar(defender, attacker);

  const packetList = Object.entries(packets).map(([type, amount]) => ({
    type,
    amount: Math.max(0, Number(amount) || 0),
  }));

  for (const packet of packetList) {
    const type = packet.type;
    let value = packet.amount;
    const out = atkSD.damageDealtMult?.[type] || 0;
    const inn = defSD.damageTakenMult?.[type] || 0;
    if (out) value *= 1 + out;
    if (inn) value *= 1 + inn;
    value *= Math.max(0, 1 + polOff);
    value *= Math.max(0, 1 - polDef);
    packet.amount = applyPolarityBias(attacker, defender, { type, amount: value });
  }

  const usedTypes = new Set();
  const defensePackets = Object.create(null);
  for (const packet of packetList) {
    const reduced = applyDefenses(defender, packet, defSD);
    if (reduced > 0) {
      defensePackets[packet.type] = (defensePackets[packet.type] || 0) + reduced;
      usedTypes.add(packet.type);
    }
  }

  breakdown.steps.push({ stage: "defense", packets: { ...defensePackets } });

  const postAffinityTotal = Object.values(defensePackets).reduce((sum, value) => sum + (value | 0), 0);
  logAttackStep(attacker, {
    step: "post_affinity_resist",
    packets: { ...defensePackets },
    statusDerived: {
      attacker: atkSD,
      defender: defSD,
    },
    dmg: postAffinityTotal,
  });

  const damageScalarRaw = Number(ctx?.damageScalar ?? 1);
  const damageScalar = Number.isFinite(damageScalarRaw)
    ? Math.max(0, damageScalarRaw)
    : 1;
  if (damageScalar !== 1) {
    for (const type of Object.keys(defensePackets)) {
      defensePackets[type] = Math.floor(defensePackets[type] * damageScalar);
    }
  }

  breakdown.postPackets = { ...defensePackets };

  // 8) Armour/DR (optional hook; physical-first)
  // if (defender.armor) { ... }

  // 9) Sum & apply
  const total = Object.values(defensePackets).reduce((a, b) => a + (b | 0), 0);
  const currentHp = (defenderResources?.hp ?? 0) | 0;
  const nextHp = Math.max(0, currentHp - total);
  syncDefenderHp(nextHp);

  if (total > 0) {
    eventGain(attacker, { kind: "hit", amount: total });
  }
  const wasCrit = Boolean(
    ctx.crit || ctx.wasCrit || ctx.attack?.crit || ctx.result?.crit,
  );
  if (wasCrit) {
    eventGain(attacker, { kind: "crit", amount: total });
  }
  if (currentHp > HEALTH_FLOOR && nextHp <= HEALTH_FLOOR) {
    eventGain(attacker, { kind: "kill", amount: total });
  }

  if (total > 0 && usedTypes.size) {
    noteUseGain(attacker, usedTypes);
    logEvent(attacker, "attack_out", { packets: defensePackets, total });
  }

  // 10) Status application
  const appliedStatuses = applyStatuses(ctx, attacker, defender, ctx.turn);

  breakdown.appliedStatuses = appliedStatuses;

  logAttackStep(attacker, {
    step: "result",
    packets: { ...defensePackets },
    total,
    defenderId: defender?.id,
    defenderHp: defender?.hp,
    appliedStatuses,
    dmg: total,
  });

  breakdown.totalDamage = total;

  return {
    packetsAfterDefense: defensePackets,
    totalDamage: total,
    appliedStatuses,
    breakdown,
    crit: wasCrit,
  };
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

