// src/combat/attack.js
// @ts-check
import {
  DAMAGE_TYPE,
  MAX_AFFINITY_CAP,
  MIN_AFFINITY_CAP,
} from "../../constants.js";

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
  const breakdown = [];
  let dmg = Math.max(0, Math.floor(Number(ctx.profile.base) || 0));
  breakdown.push({ step: "base", value: dmg });

  const brands = Array.isArray(attacker?.modCache?.brands)
    ? attacker.modCache.brands
    : [];
  for (const b of brands) {
    if (!b || !b.type || b.type.toLowerCase() !== typeKey) continue;
    if (Number.isFinite(b.flat) && b.flat) {
      dmg += b.flat;
      breakdown.push({
        step: "brand_flat",
        source: b.id || b.type,
        delta: b.flat,
        value: dmg,
      });
    }
    if (Number.isFinite(b.pct) && b.pct) {
      const before = dmg;
      dmg *= 1 + b.pct;
      breakdown.push({
        step: "brand_pct",
        source: b.id || b.type,
        pct: b.pct,
        delta: dmg - before,
        value: dmg,
      });
    }
  }

  const dmgMult = Number.isFinite(attacker?.modCache?.dmgMult)
    ? attacker.modCache.dmgMult
    : 1;
  if (dmgMult !== 1) {
    const before = dmg;
    dmg *= dmgMult;
    breakdown.push({
      step: "attacker_mult",
      mult: dmgMult,
      delta: dmg - before,
      value: dmg,
    });
  }

  if (defender.isImmune(typeKey)) {
    breakdown.push({ step: "immune", value: 0 });
    return { total: 0, type: typeKey, note: "immune", breakdown };
  }

  const resist = clamp01(defender.resistOf(typeKey));
  if (resist) {
    const before = dmg;
    dmg *= 1 - resist;
    breakdown.push({
      step: "defender_resist",
      resist,
      delta: dmg - before,
      value: dmg,
    });
  }

  const affinity = clampSigned(
    attacker.affinityOf(typeKey),
    MIN_AFFINITY_CAP,
    MAX_AFFINITY_CAP,
  );
  if (affinity) {
    const before = dmg;
    dmg *= 1 + affinity;
    breakdown.push({
      step: "attacker_affinity",
      affinity,
      delta: dmg - before,
      value: dmg,
    });
  }

  const beforeFloor = dmg;
  dmg = Math.max(0, Math.floor(dmg));
  breakdown.push({ step: "floor", delta: dmg - beforeFloor, value: dmg });
  breakdown.push({ step: "total", value: dmg });

  return { total: dmg, type: typeKey, breakdown };
}

function clamp01(x) {
  return Math.max(0, Math.min(1, Number(x) || 0));
}
function clampSigned(x, lo, hi) {
  x = Number(x) || 0;
  return Math.max(lo, Math.min(hi, x));
}
