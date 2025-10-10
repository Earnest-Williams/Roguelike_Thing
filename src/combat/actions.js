// src/combat/actions.js
// @ts-check
import { apCost, spendAP, startCooldown, isReady } from "./time.js";
import { resolveAttack } from "./attack.js";
import { performEquippedAttack, pickAttackMode } from "../game/combat-glue.js";
import {
  BASE_MOVE_AP_COST,
  COOLDOWN_MIN_TURNS,
  DEFAULT_ATTACK_BASE_COOLDOWN,
  DEFAULT_ATTACK_BASE_DAMAGE,
  DEFAULT_BASE_ACTION_AP,
  DEFAULT_MELEE_RANGE_TILES,
  DEFAULT_RELOAD_TIME_TURNS,
  HEALTH_FLOOR,
  MIN_AP_COST,
  MIN_ATTACK_DAMAGE,
  SLOT,
} from "../../constants.js";

/**
 * @typedef {import("./actor.js").Actor} Actor
 */

/**
 * Move action (example). Returns boolean success.
 * @param {Actor} actor
 * @param {{dx:number, dy:number}} dir
 */
export function tryMove(actor, dir) {
  const base = Math.round(BASE_MOVE_AP_COST * (actor.statusDerived.moveCostMult ?? 1));
  const cost = apCost(actor, Math.max(MIN_AP_COST, base));
  if (!spendAP(actor, cost)) return false;

  actor.x = (actor.x || 0) + dir.dx;
  actor.y = (actor.y || 0) + dir.dy;
  return true;
}

/**
 * Attack action (example). Applies cooldown and spends AP.
 * @param {Actor} attacker
 * @param {Actor} defender
 * @param {{label?:string, base?:number, type?:string, key?:string, baseCooldown?:number, baseAP?:number}} [opts]
 */
export function tryAttack(attacker, defender, opts = {}) {
  const key = opts.key || "basic_attack";
  if (!isReady(attacker, key)) return false;

  const baseAP = Math.max(
    MIN_AP_COST,
    opts.baseAP ?? attacker.baseActionAP ?? DEFAULT_BASE_ACTION_AP,
  );
  const cost = apCost(attacker, baseAP);
  if (!spendAP(attacker, cost)) return false;

  const profile = {
    label: opts.label || "Basic Attack",
    base: Math.max(MIN_ATTACK_DAMAGE, opts.base ?? DEFAULT_ATTACK_BASE_DAMAGE),
    type: String(opts.type || "physical"),
  };
  const result = resolveAttack(attacker, defender, { profile });

  defender.res.hp = Math.max(HEALTH_FLOOR, defender.res.hp - result.total);

  const baseCd = Math.max(
    COOLDOWN_MIN_TURNS,
    opts.baseCooldown ?? DEFAULT_ATTACK_BASE_COOLDOWN,
  );
  startCooldown(attacker, key, baseCd);

  return true;
}

function mainHandItem(actor) {
  if (!actor?.equipment) return null;
  const right = actor.equipment[SLOT.RightHand] || actor.equipment.RightHand;
  const left = actor.equipment[SLOT.LeftHand] || actor.equipment.LeftHand;
  const entry = right || left || null;
  if (!entry) return null;
  return entry?.item || entry;
}

export function tryAttackEquipped(
  attacker,
  defender,
  distTiles = DEFAULT_MELEE_RANGE_TILES,
) {
  const item = mainHandItem(attacker);
  if (!item) return false;
  const mode = pickAttackMode(attacker, defender, item, distTiles);
  if (!mode) return false;

  const key = `${item.id || item.name || "equipped"}:${mode.kind}`;
  if (!isReady(attacker, key)) return false;

  const baseAP = Math.max(MIN_AP_COST, attacker.baseActionAP ?? DEFAULT_BASE_ACTION_AP);
  const cost = apCost(attacker, baseAP);
  if (!spendAP(attacker, cost)) return false;

  const res = performEquippedAttack(attacker, defender, item, distTiles, mode);
  if (!res.ok) return false;

  const baseCooldown = Math.max(
    COOLDOWN_MIN_TURNS,
    mode.profile?.reloadTime ?? DEFAULT_RELOAD_TIME_TURNS,
  );
  startCooldown(attacker, key, baseCooldown);

  return true;
}
