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
  TILE_FLOOR,
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

const CARDINAL_DIRS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

const DEFAULT_WANDER_RADIUS = 6;

/**
 * Execute a planner decision and return the delay before the actor may act again.
 * Falls back to the actor's base delay when the decision does not supply one.
 *
 * @param {{ actor: any, combatant?: Actor, world?: any, decision?: any, rng?: (() => number) | null }} params
 */
export function executeDecision({ actor, combatant, world, decision, rng }) {
  const baseDelay = resolveDelayBase(actor, combatant);
  if (!decision || typeof decision !== "object") {
    return baseDelay;
  }

  const performer = resolveCombatant(actor, combatant);
  const rngFn = resolveRng(rng);

  switch (decision.type) {
    case "ATTACK": {
      const target = resolveTarget(decision.target ?? decision.targetActor ?? decision.entity);
      if (performer && target) {
        const selfPos = resolvePosition(actor);
        const targetPos = resolvePosition(decision.target ?? decision.targetEntity ?? target) ?? null;
        const dist = selfPos && targetPos ? chebyshevDistance(selfPos, targetPos) : 1;
        const success =
          tryAttackEquipped(performer, target, Math.max(1, dist)) ||
          tryAttack(performer, target);
        if (!success && targetPos) {
          const step = stepToward(selfPos, targetPos, world, actor);
          if (step && applyStep(actor, step, world)) {
            noteMoved(performer);
          }
        }
      }
      return baseDelay;
    }

    case "MOVE": {
      const selfPos = resolvePosition(actor);
      let targetPos = decision.to ?? decision.targetPos ?? null;
      if (!targetPos && decision.target) {
        targetPos = resolvePosition(decision.target);
      }
      const step = targetPos
        ? stepToward(selfPos, targetPos, world, actor)
        : decision.to;
      if (step && applyStep(actor, step, world)) {
        noteMoved(performer);
      }
      return baseDelay;
    }

    case "GUARD": {
      const anchor = decision.at ?? actor?.homePos ?? actor?.spawnPos ?? resolvePosition(actor);
      const radius = Number.isFinite(decision.radius)
        ? decision.radius
        : Number.isFinite(actor?.guardRadius)
        ? actor.guardRadius
        : 3;
      const selfPos = resolvePosition(actor);
      if (anchor && selfPos) {
        const dist = manhattanDistance(selfPos, anchor);
        if (dist > radius) {
          const step = stepToward(selfPos, anchor, world, actor);
          if (step && applyStep(actor, step, world)) {
            noteMoved(performer);
          }
        }
      }
      return baseDelay;
    }

    case "WANDER": {
      const leash = resolveLeash(decision.leash, actor);
      const step = randomLeashedStep(actor, leash, world, rngFn);
      if (step && applyStep(actor, step, world)) {
        noteMoved(performer);
      }
      return baseDelay;
    }

    default:
      return baseDelay;
  }
}

function resolveDelayBase(actor, combatant) {
  const entity = actor ?? combatant;
  const base = Number.isFinite(entity?.baseDelay)
    ? entity.baseDelay
    : Number.isFinite(combatant?.baseDelay)
    ? combatant.baseDelay
    : 1;
  const pct = Number.isFinite(combatant?.statusDerived?.actionSpeedPct)
    ? combatant.statusDerived.actionSpeedPct
    : Number.isFinite(actor?.statusDerived?.actionSpeedPct)
    ? actor.statusDerived.actionSpeedPct
    : 0;
  const delay = base * (1 + pct);
  return delay > 0 ? delay : base;
}

function resolveCombatant(actor, combatant) {
  if (combatant) return combatant;
  if (actor?.__actor) return actor.__actor;
  return actor;
}

function resolveTarget(candidate) {
  if (!candidate) return null;
  if (candidate.__actor) return resolveTarget(candidate.__actor);
  if (candidate.actor && candidate.actor !== candidate) return resolveTarget(candidate.actor);
  return candidate;
}

function resolvePosition(entity) {
  if (!entity) return null;
  if (typeof entity.x === "number" && typeof entity.y === "number") {
    return { x: entity.x | 0, y: entity.y | 0 };
  }
  const pos = typeof entity.pos === "function" ? entity.pos() : entity.pos;
  if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
    return { x: pos.x | 0, y: pos.y | 0 };
  }
  return null;
}

function chebyshevDistance(a, b) {
  if (!a || !b) return Infinity;
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function manhattanDistance(a, b) {
  if (!a || !b) return Infinity;
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function stepToward(from, to, world, self) {
  if (!from || !to) return null;
  const candidates = [];
  for (const dir of CARDINAL_DIRS) {
    const nx = from.x + dir.dx;
    const ny = from.y + dir.dy;
    if (!isPassable(world, nx, ny, self)) continue;
    candidates.push({ x: nx, y: ny });
  }
  candidates.sort((a, b) => manhattanDistance(a, to) - manhattanDistance(b, to));
  return candidates[0] ?? null;
}

function randomLeashedStep(actor, leash, world, rng) {
  const origin = actor?.spawnPos ?? actor?.homePos ?? resolvePosition(actor);
  if (!origin) return null;
  const current = resolvePosition(actor);
  if (!current) return null;

  const options = [];
  for (const dir of CARDINAL_DIRS) {
    const nx = current.x + dir.dx;
    const ny = current.y + dir.dy;
    if (!isPassable(world, nx, ny, actor)) continue;
    const dist = manhattanDistance(origin, { x: nx, y: ny });
    if (dist > leash) continue;
    options.push({ x: nx, y: ny });
  }
  if (!options.length) return null;
  const pick = Math.max(0, Math.floor(rng() * options.length));
  return options[pick] ?? null;
}

function resolveLeash(raw, actor) {
  if (Number.isFinite(raw) && raw >= 0) return raw;
  if (Number.isFinite(actor?.wanderRadius)) return actor.wanderRadius;
  return DEFAULT_WANDER_RADIUS;
}

function applyStep(entity, step, world) {
  if (!step) return false;
  const { x, y } = step;
  if (!isPassable(world, x, y, entity)) return false;
  entity.x = x;
  entity.y = y;
  if (entity?.__actor) {
    entity.__actor._turnDidMove = true;
  }
  return true;
}

function isPassable(world, x, y, self) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const grid = resolveGrid(world);
  if (grid) {
    const tile = grid[y]?.[x];
    if (tile == null) return false;
    if (tile !== TILE_FLOOR) return false;
  }
  return !isOccupied(world, x, y, self);
}

function resolveGrid(world) {
  if (!world) return null;
  if (Array.isArray(world?.mapState?.grid)) return world.mapState.grid;
  if (Array.isArray(world?.maze)) return world.maze;
  if (Array.isArray(world?.grid)) return world.grid;
  return null;
}

function isOccupied(world, x, y, self) {
  if (!world) return false;
  const mgr = world.mobManager;
  if (mgr?.getMobAt) {
    const occupant = mgr.getMobAt(x, y);
    if (occupant && occupant !== self) return true;
  }
  for (const mob of resolveMobList(mgr)) {
    if (!mob || mob === self) continue;
    if (mob.x === x && mob.y === y) return true;
  }
  return false;
}

function resolveMobList(mobManager) {
  if (!mobManager) return [];
  if (typeof mobManager.list === "function") {
    try {
      const out = mobManager.list();
      return Array.isArray(out) ? out : [];
    } catch (err) {
      console.warn("mobManager.list() threw while checking occupancy", err);
      return [];
    }
  }
  if (Array.isArray(mobManager.list)) return mobManager.list;
  if (Array.isArray(mobManager)) return mobManager;
  return [];
}

function resolveRng(source) {
  if (typeof source === "function") return source;
  if (typeof source?.next === "function") {
    return () => source.next();
  }
  if (typeof source?.random === "function") {
    return () => source.random();
  }
  return Math.random;
}
