// src/combat/attack.js
// @ts-check
import { DAMAGE_TYPE } from "../../constants.js";

/**
 * @typedef {import("../combat/actor.js").Actor} Actor
 * @typedef {import("../../item-system.js").Item} Item
 */

/**
 * @typedef {Object} AttackProfile
 * @property {string} label
 * @property {number} base // base damage before brands/affinity
 * @property {string} type // DAMAGE_TYPE key e.g., "FIRE"|"PHYSICAL" (we’ll lower it)
 */

/**
 * @typedef {Object} AttackContext
 * @property {AttackProfile} profile
 * @property {Item} [sourceItem]
 */

/**
 * Resolve order (Phase-1 cut):
 * 1) Start with base damage by type
 * 2) Apply attacker’s brands (flat, then % for matching type)
 * 3) Apply attacker global dmgMult
 * 4) If defender immune(type) → zero
 * 5) Apply defender resist(type) multiplicatively
 * 6) Apply elemental affinity (attacker) as outgoing bonus (additive %)
 *    (If you want “polarity bias,” treat certain type pairings as +/− in this step)
 */
export function resolveAttack(attacker, defender, ctx) {
  const typeKey = String(ctx.profile.type || "physical").toLowerCase();
  let dmg = Math.max(0, ctx.profile.base | 0);

  // 2) brands
  for (const b of attacker.modCache.brands) {
    if (b.type && b.type.toLowerCase() === typeKey) {
      if (Number.isFinite(b.flat)) dmg += b.flat;
      if (Number.isFinite(b.pct) && b.pct) dmg *= (1 + b.pct);
    }
  }

  // 3) attacker global mult
  dmg *= attacker.modCache.dmgMult;

  // 4) immunity
  if (defender.isImmune(typeKey)) {
    return { total: 0, type: typeKey, note: "immune" };
  }

  // 5) defender resist
  const resist = clamp01(defender.resistOf(typeKey));
  dmg *= (1 - resist);

  // 6) attacker affinity
  const affinity = clampSigned(attacker.affinityOf(typeKey), -0.9, 0.9);
  dmg *= (1 + affinity);

  // (Optional) polarity bias hook — customize mapping later:
  // dmg = applyPolarityBias(dmg, attacker, defender, typeKey);

  // Floor to integer in this phase
  dmg = Math.max(0, Math.floor(dmg));
  return { total: dmg, type: typeKey };
}

function clamp01(x) {
  return Math.max(0, Math.min(1, Number(x) || 0));
}
function clampSigned(x, lo, hi) {
  x = Number(x) || 0;
  return Math.max(lo, Math.min(hi, x));
}
