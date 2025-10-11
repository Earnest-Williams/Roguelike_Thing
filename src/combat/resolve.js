// src/combat/resolve.js
// @ts-check
import { logAttackStep } from "./debug-log.js";
import { applyStatuses } from "./status.js";
import { applyOutgoingScaling, noteUseGain } from "./attunement.js";
import { polarityOnHitScalar, polarityDefScalar } from "./polarity.js";

export function resolveAttack(ctx) {
  const { attacker, defender } = ctx;
  const packetsIn = (ctx.packets || []).map((p) => ({ ...p }));
  const onHitStatuses = [];
  const log = (d) => logAttackStep(attacker, d);

  const conversions = [
    ...(Array.isArray(ctx.conversions) ? ctx.conversions : []),
  ];
  let packets = applyConversions(attacker, packetsIn, conversions);
  log({ step: "conversions", packets });
  const brandExtras = Array.isArray(ctx.brands) ? ctx.brands : [];
  packets = applyBrands(attacker, packets, onHitStatuses, brandExtras);
  log({ step: "brands", packets });

  applyOutgoingScaling({ attacker, packets, target: defender });
  noteUseGain(attacker, new Set(packets.map((p) => p.type)));
  log({ step: "attunement", packets });

  packets = applyAffinities(attacker, packets);
  log({ step: "affinities", packets });

  packets = applyPolarityAttack(attacker, defender, packets);
  log({ step: "polarity_attack", packets });

  const defended = applyDefense(defender, packets);
  log({ step: "defense", packets: defended });

  const scalar = Number.isFinite(ctx.damageScalar) ? Math.max(0, ctx.damageScalar) : 1;
  const collapsed = collapseByType(defended, scalar);
  const totalDamage = Object.values(collapsed).reduce((a, b) => a + b, 0);
  const hpSources = [];
  if (defender?.res && typeof defender.res.hp === "number") {
    hpSources.push({ obj: defender.res, key: "hp", value: defender.res.hp });
  }
  if (defender?.resources && typeof defender.resources.hp === "number") {
    hpSources.push({ obj: defender.resources, key: "hp", value: defender.resources.hp });
  }
  if (typeof defender?.hp === "number") {
    hpSources.push({ obj: defender, key: "hp", value: defender.hp });
  }
  const baseHp = hpSources.length ? hpSources[0].value : 0;
  const nextHp = Math.max(0, baseHp - totalDamage);
  for (const src of hpSources) {
    src.obj[src.key] = nextHp;
  }

  const attempts = [...onHitStatuses, ...(ctx.statusAttempts || [])];
  const appliedStatuses = attempts.length
    ? applyStatuses({ statusAttempts: attempts }, attacker, defender, ctx.turn)
    : [];

  return { packetsAfterDefense: collapsed, totalDamage, appliedStatuses };
}

// --- helper functions ---

function applyConversions(actor, packets, extra = []) {
  const base = Array.isArray(extra) ? extra : [];
  const convs = [
    ...base,
    ...(actor?.modCache?.offense?.conversions || []),
  ];
  if (!convs.length) return packets;
  const out = [];
  for (const pkt of packets) {
    let remaining = pkt.amount;
    for (const c of convs) {
      const source = c.from || c.source || c.type || pkt.type;
      if (pkt.type !== source) continue;
      const pct = Number(c.pct ?? c.percent ?? c.rate ?? c.fraction ?? 0);
      if (!Number.isFinite(pct) || pct <= 0) continue;
      const take = Math.floor(pkt.amount * pct);
      if (take > 0) {
        out.push({ type: c.to || c.into || pkt.type, amount: take });
        remaining -= take;
      }
    }
    if (remaining > 0) out.push({ type: pkt.type, amount: remaining });
  }
  return out;
}

function applyBrands(actor, packets, onHitStatuses, extra = []) {
  const base = Array.isArray(extra) ? extra : [];
  const brands = [
    ...base,
    ...(actor?.modCache?.offense?.brands || []),
    ...(actor?.modCache?.offense?.brandAdds || []),
    ...(actor?.modCache?.brands || []),
  ];
  if (!brands.length) return packets;
  return packets.map((pkt) => {
    let amt = pkt.amount;
    for (const b of brands) {
      const matchType = b.type || b.element || b.damageType;
      if (!matchType || matchType === pkt.type) {
        const flat = Number(b.flat ?? b.amount ?? 0);
        if (Number.isFinite(flat) && flat !== 0) amt += flat;
        const pct = Number(b.pct ?? b.percent ?? 0);
        if (Number.isFinite(pct) && pct !== 0) {
          amt = Math.floor(amt * (1 + pct));
        }
      }
      if (Array.isArray(b.onHitStatuses)) {
        onHitStatuses.push(...b.onHitStatuses);
      }
    }
    return { ...pkt, amount: amt };
  });
}

function applyAffinities(actor, packets) {
  const aff = actor?.modCache?.affinities || {};
  return packets.map((p) => {
    const bonus = aff[p.type] || 0;
    return bonus ? { ...p, amount: Math.floor(p.amount * (1 + bonus)) } : p;
  });
}

function applyPolarityAttack(attacker, defender, packets) {
  const s = polarityOnHitScalar(attacker, defender);
  return packets.map((p) => ({ ...p, amount: Math.floor(p.amount * s) }));
}

function applyDefense(defender, packets) {
  const imm = defender?.modCache?.immunities || new Set();
  const res = defender?.modCache?.resists || {};
  const scalar = polarityDefScalar(defender);
  const out = [];
  for (const p of packets) {
    if (imm.has(p.type)) continue;
    const r = Math.min(0.95, Math.max(0, res[p.type] || 0));
    const amt = Math.floor(p.amount * (1 - r) * scalar);
    if (amt > 0) out.push({ type: p.type, amount: amt });
  }
  return out;
}

function collapseByType(packets, scalar) {
  const out = {};
  for (const p of packets) {
    const k = p.type;
    out[k] = (out[k] || 0) + Math.floor(p.amount * scalar);
  }
  return out;
}
