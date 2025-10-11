// src/combat/actions.js
// @ts-check
import { finalAPForAction, spendAP, startCooldown, isReady } from "./time.js";
import { resolveAttack } from "./resolve.js";
import { tryTemporalEcho, applyOnKillHaste } from "./temporal.js";
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
import { canPay, spend as spendResources, eventGain } from "./resources.js";
import { noteAttacked, noteMoved } from "./actor.js";

/**
 * @typedef {import("./actor.js").Actor} Actor
 */

/**
 * Move action (example). Returns boolean success.
 * @param {Actor} actor
 * @param {{dx:number, dy:number}} dir
 */
export function tryMove(actor, dir) {
  const base = Math.max(MIN_AP_COST, BASE_MOVE_AP_COST);
  const moveAction = { id: "move", baseAP: base, tags: ["move"] };
  const { costAP } = finalAPForAction(actor, moveAction.baseAP, moveAction.tags);
  if (!spendAP(actor, costAP)) return false;

  actor.x = (actor.x || 0) + dir.dx;
  actor.y = (actor.y || 0) + dir.dy;
  eventGain(actor, { kind: "move" });
  noteMoved(actor);
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
  const action = {
    id: key,
    baseAP,
    baseCooldown: Math.max(
      COOLDOWN_MIN_TURNS,
      opts.baseCooldown ?? DEFAULT_ATTACK_BASE_COOLDOWN,
    ),
    resourceCost: opts.resourceCost,
    tags: Array.isArray(opts.tags) ? opts.tags.slice() : ["attack"],
  };
  if (!canPay(attacker, action)) return false;
  const { costAP } = finalAPForAction(attacker, action.baseAP, action.tags);
  if (!spendAP(attacker, costAP)) return false;
  spendResources(attacker, action);

  const profile = {
    label: opts.label || "Basic Attack",
    base: Math.max(MIN_ATTACK_DAMAGE, opts.base ?? DEFAULT_ATTACK_BASE_DAMAGE),
    type: String(opts.type || "physical"),
  };
  const hpBefore = getActorHp(defender);
  const ctx = {
    attacker,
    defender,
    turn: attacker?.turn ?? 0,
    packets: [{ type: profile.type, amount: profile.base }],
    statusAttempts: [],
  };
  const result = resolveAttack(ctx);
  noteAttacked(attacker);
  tryTemporalEcho(ctx, result);

  if (defender?.res && typeof defender.res.hp === "number") {
    defender.res.hp = Math.max(HEALTH_FLOOR, defender.res.hp);
  }

  const hpAfter = getActorHp(defender);
  if (hpAfter <= HEALTH_FLOOR && hpBefore > HEALTH_FLOOR) {
    applyOnKillHaste(attacker);
  }

  startCooldown(attacker, key, action.baseCooldown);

  return true;
}

function getActorHp(actor) {
  if (!actor) return 0;
  if (Number.isFinite(actor?.res?.hp)) return actor.res.hp;
  if (Number.isFinite(actor?.resources?.hp)) return actor.resources.hp;
  if (Number.isFinite(actor?.hp)) return actor.hp;
  return 0;
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
  const action = {
    id: key,
    baseAP,
    baseCooldown: Math.max(
      COOLDOWN_MIN_TURNS,
      mode.profile?.reloadTime ?? DEFAULT_RELOAD_TIME_TURNS,
    ),
    resourceCost: mode.profile?.resourceCost,
    tags: Array.isArray(mode.profile?.tags)
      ? mode.profile.tags.slice()
      : [mode.kind || "attack"],
  };
  if (!canPay(attacker, action)) return false;
  const { costAP } = finalAPForAction(attacker, action.baseAP, action.tags);
  if (!spendAP(attacker, costAP)) return false;
  spendResources(attacker, action);

  const res = performEquippedAttack(attacker, defender, item, distTiles, mode);
  if (!res.ok) return false;

  noteAttacked(attacker);

  startCooldown(attacker, key, action.baseCooldown);

  return true;
}
