// src/game/combat-glue.js
// @ts-check
import { getAttackModesForItem } from "../../js/item-system.js";
import { resolveAttack } from "../combat/attack.js";
import { EVENT, emit } from "../ui/event-log.js";
import "../combat/status.registry.js";

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
 * Select the “best” attack mode for now:
 *  1) Use ranged if available and in range
 *  2) Else use thrown if allowed and in range
 *  3) Else treat as melee (if profile exists)
 * @param {import("../combat/actor.js").Actor} attacker
 * @param {import("../combat/actor.js").Actor} defender
 * @param {import("../../js/item-system.js").Item} weaponItem
 * @param {number} [distTiles=1]
 */
export function pickAttackMode(attacker, defender, weaponItem, distTiles = 1) {
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
      : Math.max(1, p.base || 5);

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
  const before = defender.res.hp;
  const outcome = resolveAttack({
    attacker,
    defender,
    turn: attacker?.turn ?? 0,
    physicalBase: profile.base,
  });
  defender.res.hp = Math.max(0, defender.res.hp);

  emit(EVENT.COMBAT, {
    who: attacker.name ?? attacker.id,
    vs: defender.name ?? defender.id,
    mode: mode.kind,
    profile,
    damage: outcome.totalDamage,
    hpBefore: before,
    hpAfter: defender.res.hp,
    packets: outcome.packetsAfterDefense,
    statuses: outcome.appliedStatuses,
  });

  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  emit("attack_type_hint", { type: profile.type || "physical", until: now + 250 });

  return { ok: true, outcome, profile, mode };
}
