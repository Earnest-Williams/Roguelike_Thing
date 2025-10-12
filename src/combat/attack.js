// src/combat/attack.js
// @ts-check
import { DEFAULT_MARTIAL_DAMAGE_TYPE } from "../../js/constants.js";
import { resolveAttack as resolveAttackNew } from "./resolve.js";

/**
 * Normalize an arbitrary packets payload into the canonical array structure
 * expected by the modern resolution pipeline.
 *
 * @param {any} prePackets
 * @returns {Array<{ type: string, amount: number }>}
 */
function normalizePrePackets(prePackets) {
  const packets = [];
  if (!prePackets) return packets;
  if (Array.isArray(prePackets)) {
    for (const entry of prePackets) {
      if (!entry) continue;
      const type = entry.type || entry.id;
      const amount = Number(entry.amount ?? entry.value ?? entry.flat ?? 0);
      if (!type || !Number.isFinite(amount) || amount <= 0) continue;
      packets.push({ type: String(type), amount: Math.floor(amount) });
    }
    return packets;
  }
  if (typeof prePackets === "object") {
    for (const [type, amount] of Object.entries(prePackets)) {
      const value = Number(amount);
      if (!type || !Number.isFinite(value) || value <= 0) continue;
      packets.push({ type: String(type), amount: Math.floor(value) });
    }
  }
  return packets;
}

/**
 * Compatibility wrapper that accepts legacy attack contexts lacking explicit
 * packet arrays. When packets are already present the call is forwarded
 * untouched to the new resolver, otherwise the function constructs base packets
 * using classic fields like `physicalBase`.
 *
 * @param {any} ctx
 */
export function resolveAttack(ctx) {
  if (!ctx) throw new Error("resolveAttack requires a context");
  if (Array.isArray(ctx.packets)) {
    return resolveAttackNew(ctx);
  }
  const baseType = ctx.attack?.type || ctx.type || DEFAULT_MARTIAL_DAMAGE_TYPE;
  const base = Number(ctx.attack?.base ?? ctx.physicalBase ?? 0);
  const bonus = Number(ctx.physicalBonus ?? 0);
  const totalBase = Math.max(0, Math.floor(base + bonus));
  const packets = normalizePrePackets(ctx.prePackets);
  if (totalBase > 0) {
    packets.push({ type: String(baseType), amount: totalBase });
  }
  const nextCtx = {
    attacker: ctx.attacker,
    defender: ctx.defender,
    turn: ctx.turn,
    packets,
    statusAttempts: ctx.statusAttempts,
    conversions: ctx.conversions,
    brands: ctx.brands,
    damageScalar: ctx.damageScalar,
  };
  return resolveAttackNew(nextCtx);
}
