// src/combat/attack.js
import { applyStatuses } from "./status.js";

function gather(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

function doResolveAttack(rawCtx = {}) {
  const ctx = rawCtx || {};
  const S = ctx.attacker ?? ctx.S ?? null;
  const D = ctx.defender ?? ctx.D ?? null;
  const turn = Number.isFinite(ctx.turn) ? ctx.turn : 0;
  const basePhysical = ctx.basePhysical ?? 0;
  const bonusPhysical = ctx.bonusPhysical ?? 0;
  const conversions = [
    ...gather(ctx.conversions),
    ...gather(S?.modCache?.offense?.conversions),
  ];
  const brands = [
    ...gather(ctx.brands),
    ...gather(S?.modCache?.offense?.brandAdds),
  ];
  const statusAttempts = Array.isArray(ctx.statusAttempts)
    ? ctx.statusAttempts
    : [];

  const packets = Object.create(null);
  const addPacket = (type, amount) => {
    if (!type) return;
    const v = Math.floor(amount ?? 0);
    if (v > 0 && Number.isFinite(v)) packets[type] = (packets[type] || 0) + v;
  };

  let basePool = 0;
  let bonusPool = Math.max(0, Math.floor(bonusPhysical ?? 0));
  if (typeof basePhysical === "number") {
    basePool = Math.max(0, Math.floor(basePhysical));
  } else if (basePhysical && typeof basePhysical === "object") {
    for (const [k, raw] of Object.entries(basePhysical)) {
      const n = Math.floor(Number(raw ?? 0));
      if (!Number.isFinite(n) || n <= 0) continue;
      if (k === "flatFromStats") bonusPool += n;
      else basePool += n;
    }
  }

  for (const conv of conversions) {
    if (!conv) continue;
    const pct = Number(conv.pct ?? conv.percent ?? 0);
    if (!Number.isFinite(pct) || pct <= 0) continue;
    const toType = conv.to || conv.type;
    if (!toType) continue;

    let pool = basePool;
    if (!conv.includeBaseOnly) pool += bonusPool;
    if (pool <= 0) continue;

    let delta = Math.floor(pool * pct);
    if (!Number.isFinite(delta) || delta <= 0) continue;

    const baseShare = Math.min(delta, basePool);
    basePool -= baseShare;
    const bonusShare = delta - baseShare;
    if (!conv.includeBaseOnly && bonusShare > 0) {
      bonusPool = Math.max(0, bonusPool - bonusShare);
    }
    addPacket(toType, delta);
  }

  const remainingPhysical = basePool + bonusPool;
  if (remainingPhysical > 0) addPacket("physical", remainingPhysical);

  for (const b of brands) {
    if (!b) continue;
    const flat = Math.floor(Number(b.flat ?? 0));
    if (flat > 0) addPacket(b.type || b.damageType || "physical", flat);
  }

  const mulTyped = (packetMap, getMult) => {
    for (const t in packetMap) {
      const m = getMult(t);
      if (m) packetMap[t] = Math.max(0, Math.floor(packetMap[t] * (1 + m)));
    }
  };
  mulTyped(packets, (t) => S?.modCache?.offense?.affinities?.[t] || 0);

  const onHitBias =
    S?.modCache?.polarity?.onHitBias?.baseMult ??
    S?.modCache?.offense?.polarity?.onHitBias?.baseMult ??
    0;
  if (onHitBias) {
    for (const t in packets) packets[t] = Math.floor(packets[t] * (1 + onHitBias));
  }
  mulTyped(packets, (t) => S?.statusDerived?.damageDealtMult?.[t] || 0);
  mulTyped(packets, (t) => D?.statusDerived?.damageTakenMult?.[t] || 0);

  const after = Object.create(null);
  for (const t in packets) {
    if (D?.modCache?.defense?.immunities?.has?.(t)) continue;
    const baseRes =
      (D?.modCache?.defense?.resists?.[t] || 0) +
      (D?.statusDerived?.resistDelta?.[t] || 0);
    const clamped = Math.max(-1, Math.min(0.95, baseRes));
    after[t] = Math.max(0, Math.floor(packets[t] * (1 - clamped)));
  }

  const totalDamage = Object.values(after).reduce((a, v) => a + v, 0);

  if (D) {
    if (Number.isFinite(D.hp)) {
      D.hp = Math.max(0, Math.floor(D.hp - totalDamage));
    }
    if (D.res && Number.isFinite(D.res.hp)) {
      D.res.hp = Math.max(0, Math.floor(D.res.hp - totalDamage));
    }
  }

  let applied = [];
  if (statusAttempts.length) {
    applied = applyStatuses({ statusAttempts }, S, D, turn) || [];
  }

  return {
    packetsBeforeDefense: packets,
    packetsAfterDefense: after,
    totalDamage,
    appliedStatuses: applied,
  };
}

export function resolveAttackFromContext(ctx) {
  return doResolveAttack(ctx);
}

export function resolveAttackLegacy(attacker, defender, ctx = {}) {
  const profile = ctx.profile || {};

  const baseResult = doResolveAttack({
    attacker,
    defender,
    basePhysical: profile.base ?? 0,
    bonusPhysical: ctx.bonusPhysical ?? 0,
    conversions: ctx.conversions ?? [],
    brands: ctx.brands ?? [],
    statusAttempts: ctx.statusAttempts ?? [],
    turn: ctx.turn ?? 0,
  });

  return {
    ...baseResult,
    total: baseResult.totalDamage,
    type: String(profile.type || "physical").toLowerCase(),
    breakdown: [],
  };
}

export const resolveAttack = resolveAttackFromContext;
