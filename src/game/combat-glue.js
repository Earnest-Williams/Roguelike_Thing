// src/game/combat-glue.js
// @ts-check
import { getAttackModesForItem } from "../../js/item-system.js";
import { resolveAttack } from "../combat/resolve.js";
import { EVENT, emit } from "../ui/event-log.js";
import { Sound } from "../ui/sound.js";
import "../combat/status-registry.js";
import {
  COMBAT_ATTACK_TYPE_HINT_DURATION_MS,
  COMBAT_DEFAULT_MELEE_RANGE_TILES,
  COMBAT_FALLBACK_ATTACK_BASE_DAMAGE,
} from "../config.js";

/**
 * Roll average damage from dice profile at Phase 3 (deterministic feel).
 * Switch to RNG later if desired.
 * @param {{ diceCount: number, diceSides: number, bonus?: number }} dice
 */
function avgFromDice({ diceCount, diceSides, bonus }) {
  const avgDie = (diceSides + 1) / 2;
  return Math.max(0, Math.floor(diceCount * avgDie + (bonus || 0)));
}

/**
 * Deterministic damage roll used by the preview/AI layer.
 * Mirrors rollDamage from the runtime bundle but keeps phase3 deterministic.
 * @param {{ diceCount: number, diceSides: number, bonus?: number }} dice
 */
function rollDamage(dice) {
  if (!dice || typeof dice !== "object") {
    return { total: 0, rolls: [], bonus: 0 };
  }
  const total = avgFromDice({
    diceCount: Math.max(0, Math.floor(dice.diceCount ?? 0)),
    diceSides: Math.max(0, Math.floor(dice.diceSides ?? 0)),
    bonus: Math.floor(dice.bonus ?? 0),
  });
  return {
    total,
    rolls: [],
    bonus: Math.floor(dice.bonus ?? 0),
  };
}

/**
 * Select the “best” attack mode for now:
 *  1) Use ranged if available and in range
 *  2) Else use thrown if allowed and in range
 *  3) Else treat as melee (if profile exists)
 * @param {import("../combat/actor.js").Actor} attacker
 * @param {import("../combat/actor.js").Actor} defender
 * @param {import("../../js/item-system.js").Item} weaponItem
 * @param {number} [distTiles=1]
 */
export function pickAttackMode(
  attacker,
  defender,
  weaponItem,
  distTiles = COMBAT_DEFAULT_MELEE_RANGE_TILES,
) {
  const modes = getAttackModesForItem(weaponItem); // [{kind, profile}]
  if (!modes.length) return null;

  // helper to check range
  const inRange = (p) => distTiles >= p.range.min && distTiles <= p.range.max;

  // prefer true ranged first
  const ranged = modes.find((m) => m.kind === "ranged" && inRange(m.profile));
  if (ranged) return ranged;

  const melee = modes.find(
    (m) => m.kind === "melee" && m.profile?.range && inRange(m.profile),
  );

  const thr = modes.find(
    (m) => m.kind === "throw" && m.profile.allowed && inRange(m.profile),
  );

  if (melee && distTiles <= melee.profile.range.max) return melee;
  if (thr && (!melee || distTiles > melee.profile.range.max)) return thr;

  return melee || thr || modes[0];
}

/**
 * Build AttackProfile from chosen mode
 * @param {import("../combat/actor.js").Actor} attacker
 * @param {{ kind: string, profile: any }} mode
 */
export function buildAttackProfileFromMode(attacker, mode) {
  const p = mode.profile;
  const label = mode.kind === "ranged" ? "Ranged" : mode.kind === "throw" ? "Throw" : "Melee";
  const base =
    p.damage && typeof p.damage.diceCount === "number"
      ? avgFromDice(p.damage)
      : Math.max(1, p.base || COMBAT_FALLBACK_ATTACK_BASE_DAMAGE);

  // crude mapping: melee defaults to physical, others inherit if provided
  const type = (p.type || p.damageType || "physical").toString();

  return { label, base, type };
}

/**
 * Full attack execution hook used by your planners/controls.
 * Emits events for UI/debug.
 * @param {import("../combat/actor.js").Actor} attacker
 * @param {import("../combat/actor.js").Actor} defender
 * @param {import("../../js/item-system.js").Item} weaponItem
 * @param {number} [distTiles]
 */
export function performEquippedAttack(attacker, defender, weaponItem, distTiles, preselectedMode = null) {
  const mode = preselectedMode || pickAttackMode(attacker, defender, weaponItem, distTiles);
  if (!mode) return { ok: false, reason: "no_mode" };

  const profile = buildAttackProfileFromMode(attacker, mode);
  const hpBefore =
    (defender?.res && typeof defender.res.hp === "number")
      ? defender.res.hp
      : typeof defender?.resources?.hp === "number"
      ? defender.resources.hp
      : typeof defender?.hp === "number"
      ? defender.hp
      : 0;

  const damageRoll = mode?.profile?.damage
    ? rollDamage(mode.profile.damage)
    : { total: profile.base ?? 0, rolls: [], bonus: 0 };
  const baseAmount = Math.max(0, Math.floor(damageRoll.total));

  const statusAttempts = Array.isArray(mode?.profile?.statusAttempts)
    ? mode.profile.statusAttempts.map((attempt) => ({ ...attempt }))
    : [];

  const packets = [];
  const prePackets = mode?.profile?.prePackets;
  if (prePackets && typeof prePackets === "object") {
    if (Array.isArray(prePackets)) {
      for (const entry of prePackets) {
        if (!entry) continue;
        const type = entry.type || entry.id;
        const amount = Number(entry.amount ?? entry.value ?? 0);
        if (type && Number.isFinite(amount) && amount > 0) {
          packets.push({ type: String(type), amount: Math.floor(amount) });
        }
      }
    } else {
      for (const [type, amount] of Object.entries(prePackets)) {
        const val = Number(amount);
        if (!type || !Number.isFinite(val) || val <= 0) continue;
        packets.push({ type: String(type), amount: Math.floor(val) });
      }
    }
  }

  packets.push({ type: profile.type, amount: baseAmount });

  const ctx = {
    attacker,
    defender,
    turn: attacker?.turn ?? 0,
    packets,
    statusAttempts,
  };

  const out = resolveAttack(ctx);
  if (defender?.res && typeof defender.res.hp === "number") {
    defender.res.hp = Math.max(0, defender.res.hp);
  }

  const hpAfter =
    (defender?.res && typeof defender.res.hp === "number")
      ? defender.res.hp
      : typeof defender?.resources?.hp === "number"
      ? defender.resources.hp
      : typeof defender?.hp === "number"
      ? defender.hp
      : 0;

  const payload = {
    who: attacker.name ?? attacker.id,
    vs: defender.name ?? defender.id,
    mode: mode.kind,
    profile,
    damageRoll,
    out,
    damage: hpBefore - hpAfter,
    totalDamage: hpBefore - hpAfter,
    primaryDamage: out.totalDamage,
    echoDamage: out.echo?.totalDamage ?? 0,
    hpBefore,
    hpAfter,
    packets: out.packetsAfterDefense,
    statuses: out.appliedStatuses,
    ctx,
    breakdown: null,
    echoResult: out.echo?.result ?? null,
  };
  emit(EVENT.COMBAT, payload);
  Sound.playAttack(payload);

  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  emit("attack_type_hint", {
    type: profile.type || "physical",
    until: now + COMBAT_ATTACK_TYPE_HINT_DURATION_MS,
  });

  return {
    ...out,
    totalDamage: hpBefore - hpAfter,
    ok: true,
    outcome: out,
    profile,
    mode,
    damageRoll,
    attackContext: ctx,
    echoResult: out.echo?.result ?? null,
  };
}

