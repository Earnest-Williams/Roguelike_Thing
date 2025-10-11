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

  let packets = applyConversions(attacker, packetsIn);
  log({ step: "conversions", packets });
  packets = applyBrands(attacker, packets, onHitStatuses);
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
  if (defender?.res) {
    defender.res.hp = Math.max(0, defender.res.hp - totalDamage);
  }

  const attempts = [...onHitStatuses, ...(ctx.statusAttempts || [])];
  const appliedStatuses = attempts.length
    ? applyStatuses({ statusAttempts: attempts }, attacker, defender, ctx.turn)
    : [];

  return { packetsAfterDefense: collapsed, totalDamage, appliedStatuses };
}

// --- helper functions ---

function applyConversions(actor, packets) {
  const convs = actor?.modCache?.offense?.conversions || [];
  if (!convs.length) return packets;
  const out = [];
  for (const pkt of packets) {
    let remaining = pkt.amount;
    for (const c of convs) {
      const sourceType =
        typeof c.from === "string"
          ? c.from
          : typeof c.source === "string"
          ? c.source
          : null;
      if (sourceType && pkt.type !== sourceType) {
        continue;
      }
      const pctRaw =
        typeof c.pct === "number" && Number.isFinite(c.pct)
          ? c.pct
          : typeof c.percent === "number" && Number.isFinite(c.percent)
          ? c.percent
          : NaN;
      if (!Number.isFinite(pctRaw) || pctRaw <= 0 || pctRaw > 1) {
        continue;
      }
      const take = Math.floor(pkt.amount * pctRaw);
      if (take > 0) {
        const toType =
          typeof c.to === "string"
            ? c.to
            : typeof c.into === "string"
            ? c.into
            : pkt.type;
        out.push({ type: toType, amount: take });
        remaining -= take;
      }
    }
    if (remaining > 0) out.push({ type: pkt.type, amount: remaining });
  }
  return out;
}

function applyBrands(actor, packets, onHitStatuses) {
  const offenseBrands = actor?.modCache?.offense?.brands || [];
  // Exclude brands with kind === "brand" here because those are already included in offenseBrands.
  // Only include other types of brands (e.g., temporary or special brands) in extraBrands.
  const extraBrands = Array.isArray(actor?.modCache?.brands)
    ? actor.modCache.brands.filter((b) => b && b.kind !== "brand")
    : [];
  const brands = [...offenseBrands, ...extraBrands];
  return packets.map((pkt) => {
    let amt = pkt.amount;
    for (const b of brands) {
      if (!b) continue;
      const matchType = typeof b.type === "string" ? b.type : null;
      if (matchType && matchType !== pkt.type) continue;

      const flatBonus = Number(b.flat ?? b.amount ?? 0) || 0;
      if (flatBonus) amt += flatBonus;

      const pctBonus =
        typeof b.pct === "number" && Number.isFinite(b.pct)
          ? b.pct
          : typeof b.percent === "number" && Number.isFinite(b.percent)
          ? b.percent
          : 0;
      if (pctBonus) amt = Math.floor(amt * (1 + pctBonus));

      if (Array.isArray(b.onHitStatuses)) onHitStatuses.push(...b.onHitStatuses);
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
