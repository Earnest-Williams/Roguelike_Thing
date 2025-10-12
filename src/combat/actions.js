// src/combat/actions.js
// @ts-check
import { finalAPForAction, spendAP, startCooldown, isReady } from "./time.js";
import { resolveAttack } from "./resolve.js";
import { performEquippedAttack, pickAttackMode } from "../game/combat-glue.js";
import {
  BASE_MOVE_AP_COST,
  COOLDOWN_MIN_TURNS,
  DEFAULT_ATTACK_BASE_COOLDOWN,
  DEFAULT_ATTACK_BASE_DAMAGE,
  DEFAULT_BASE_ACTION_AP,
  DEFAULT_MELEE_RANGE_TILES,
  DEFAULT_RELOAD_TIME_TURNS,
  DEFAULT_MARTIAL_DAMAGE_TYPE,
  HEALTH_FLOOR,
  MIN_AP_COST,
  MIN_ATTACK_DAMAGE,
  SLOT,
} from "../../js/constants.js";
import { canPay, eventGain } from "./resources.js";
import { noteAttacked, noteMoved } from "./actor.js";

/**
 * @typedef {import("./actor.js").Actor} Actor
 */

/**
 * Attempt to move an actor by the provided delta, spending the appropriate AP
 * for the "move" action archetype. Returns `true` on success.
 *
 * @param {Actor} actor
 * @param {{dx:number, dy:number}} dir
 * @returns {boolean}
 */
export function tryMove(actor, dir) {
  const base = Math.max(MIN_AP_COST, BASE_MOVE_AP_COST);
  const moveAction = { id: "move", baseAP: base, tags: ["move"] };
  const { costAP } = finalAPForAction(actor, moveAction.baseAP, moveAction.tags);
  if (!spendAP(actor, costAP)) return false;

  actor.x = (actor.x || 0) + dir.dx;
  actor.y = (actor.y || 0) + dir.dy;
  eventGain(actor, { kind: "move" });
  actor._turnDidMove = true;
  noteMoved(actor);
  return true;
}

/**
 * Resolve a basic attack between two actors using scalar options. This is
 * primarily used in tests/examples where we want a predictable attack profile
 * without the full equipment pipeline.
 *
 * @param {Actor} attacker
 * @param {Actor} defender
 * @param {{label?:string, base?:number, type?:string, key?:string, baseCooldown?:number, baseAP?:number}} [opts]
 * @returns {boolean}
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
  const baseCosts = action.resourceCost ?? { stamina: 2 };
  if (!canPay(attacker, { resourceCost: baseCosts, tags: action.tags })) return false;
  const { costAP } = finalAPForAction(attacker, action.baseAP, action.tags);
  if (!spendAP(attacker, costAP)) return false;

  const profile = {
    label: opts.label || "Basic Attack",
    base: Math.max(MIN_ATTACK_DAMAGE, opts.base ?? DEFAULT_ATTACK_BASE_DAMAGE),
    type: String(opts.type || DEFAULT_MARTIAL_DAMAGE_TYPE),
  };
  const ctx = {
    attacker,
    defender,
    turn: attacker?.turn ?? 0,
    packets: [{ type: profile.type, amount: profile.base }],
    statusAttempts: [],
    baseCosts,
    tags: action.tags,
  };
  resolveAttack(ctx);
  attacker._turnDidAttack = true;
  noteAttacked(attacker);

  if (defender?.res && typeof defender.res.hp === "number") {
    defender.res.hp = Math.max(HEALTH_FLOOR, defender.res.hp);
  }

  startCooldown(attacker, key, action.baseCooldown);

  return true;
}

/**
 * Grab the primary hand item from an actor. Falls back to the off-hand to keep
 * single-weapon builds functional when the dominant slot is empty.
 *
 * @param {Actor | null | undefined} actor
 */
function mainHandItem(actor) {
  if (!actor?.equipment) return null;
  const right = actor.equipment[SLOT.RightHand] || actor.equipment.RightHand;
  const left = actor.equipment[SLOT.LeftHand] || actor.equipment.LeftHand;
  const entry = right || left || null;
  if (!entry) return null;
  return entry?.item || entry;
}

/**
 * Build the data required to perform an equipped attack including AP cost,
 * cooldown, and resolved attack mode. Returns `null` when the actor cannot
 * attack (no item, on cooldown, insufficient resources, etc.).
 *
 * @param {Actor} attacker
 * @param {Actor} defender
 * @param {number} [distTiles]
 */
export function planEquippedAttack(
  attacker,
  defender,
  distTiles = DEFAULT_MELEE_RANGE_TILES,
) {
  const item = mainHandItem(attacker);
  if (!item) return null;
  const mode = pickAttackMode(attacker, defender, item, distTiles);
  if (!mode) return null;

  const key = `${item.id || item.name || "equipped"}:${mode.kind}`;
  if (!isReady(attacker, key)) return null;

  const baseAP = Math.max(
    MIN_AP_COST,
    attacker.baseActionAP ?? DEFAULT_BASE_ACTION_AP,
  );
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
  const baseCosts = action.resourceCost ?? { stamina: 2 };
  if (!canPay(attacker, { resourceCost: baseCosts, tags: action.tags })) return null;
  const { costAP } = finalAPForAction(attacker, action.baseAP, action.tags);
  const currentAP = typeof attacker.ap === "number" ? attacker.ap : Infinity;
  if (!Number.isFinite(costAP) || currentAP < costAP) return null;

  return { item, mode, key, action, baseCosts, costAP };
}

/**
 * Execute an equipped attack using the preconditions validated by
 * `planEquippedAttack`. Returns a boolean indicating whether the attack was
 * launched (regardless of hit/miss outcome).
 *
 * @param {Actor} attacker
 * @param {Actor} defender
 * @param {number} [distTiles]
 */
export function tryAttackEquipped(
  attacker,
  defender,
  distTiles = DEFAULT_MELEE_RANGE_TILES,
) {
  const plan = planEquippedAttack(attacker, defender, distTiles);
  if (!plan) return false;

  if (!spendAP(attacker, plan.costAP)) return false;

  const res = performEquippedAttack(
    attacker,
    defender,
    plan.item,
    distTiles,
    plan.mode,
  );
  if (!res.ok) return false;

  attacker._turnDidAttack = true;
  noteAttacked(attacker);

  startCooldown(attacker, plan.key, plan.action.baseCooldown);

  return true;
}
