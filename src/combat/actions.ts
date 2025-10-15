// src/combat/actions.js
// @ts-nocheck
import { finalAPForAction, spendAP, startCooldown, isReady } from "./time.js";
import { resolveAttack } from "./resolve.js";
import { breakdownFromContext } from "./attack-breakdown.js";
import { performEquippedAttack, pickAttackMode } from "../game/combat-glue.js";
import { FactionService } from "../game/faction-service.js";
import { EVENT, emit } from "../ui/event-log.js";
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
import { canPay, eventGain, spendResources } from "./resources.js";
import { noteAttacked, noteMoved } from "./actor.js";
import { cloneGuardConfig, cloneWanderConfig } from "../content/mobs.js";
import {
  Door,
  DOOR_STATE,
  FURNITURE_EFFECT_IDS,
  FurnitureKind,
} from "../world/furniture/index.js";
import { Sound } from "../ui/sound.js";

/**
 * @typedef {import("./actor.js").Actor} Actor
 */

/**
 * @typedef {Object} EquippedAttackPlan
 * @property {any} item The weapon or item used to perform the attack.
 * @property {any} mode The resolved attack mode supplied by the equipment.
 * @property {string} key Unique cooldown/action identifier for the plan.
 * @property {{ id: string, baseAP: number, baseCooldown: number, resourceCost?: any, tags: string[] }} action
 *   The synthetic action used to evaluate costs for the attack.
 * @property {Record<string, number>} baseCosts Resource costs that must be paid prior to the attack.
 * @property {number} costAP Total action points required to execute the attack after modifiers.
 */

/**
 * @typedef {Object} DecisionExecutionParams
 * @property {any} actor Entity requesting the action.
 * @property {Actor} [combatant] Optional combatant wrapper for the actor.
 * @property {any} [world] The world or map state where the action is being executed.
 * @property {any} [decision] Planner decision describing the action to perform.
 * @property {(() => number) | { next?: () => number, random?: () => number }} [rng] Optional RNG source.
 */

/**
 * @typedef {{ x: number, y: number }} Point
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
  if (!actor || typeof dir !== "object") return false;
  const dx = Number.isFinite(dir?.dx) ? dir.dx : 0;
  const dy = Number.isFinite(dir?.dy) ? dir.dy : 0;
  if (!dx && !dy) return false;

  const base = Math.max(MIN_AP_COST, BASE_MOVE_AP_COST);
  const moveAction = { id: "move", baseAP: base, tags: ["move"] };
  const { costAP } = finalAPForAction(actor, moveAction.baseAP, moveAction.tags);
  if (!spendAP(actor, costAP)) return false;

  actor.x = (actor.x || 0) + dx;
  actor.y = (actor.y || 0) + dy;
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

  spendResources(attacker, baseCosts, action.tags);

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
    costAP,
  };
  
  const hpBefore = defender?.res && typeof defender.res.hp === "number" ? defender.res.hp : 0;
  const out = resolveAttack(ctx);
  const breakdown = breakdownFromContext(out);
  const hpAfter = defender?.res && typeof defender.res.hp === "number" ? defender.res.hp : 0;
  
  attacker._turnDidAttack = true;
  noteAttacked(attacker);

  if (defender?.res && typeof defender.res.hp === "number") {
    defender.res.hp = Math.max(HEALTH_FLOOR, defender.res.hp);
  }

  // Emit combat event for UI feedback
  const payload = {
    who: attacker.name ?? attacker.id,
    vs: defender.name ?? defender.id,
    attacker,
    defender,
    damage: hpBefore - hpAfter,
    totalDamage: hpBefore - hpAfter,
    hpBefore,
    hpAfter,
    packets: out.packetsAfterDefense,
    statuses: out.appliedStatuses,
    ctx,
    attackContext: out,
    breakdown,
  };
  emit(EVENT.COMBAT, payload);

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
    resourceCost: mode.profile?.resourceCost
      ? { ...mode.profile.resourceCost }
      : undefined,
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

  spendResources(attacker, plan.baseCosts, plan.action.tags);

  attacker._turnDidAttack = true;
  noteAttacked(attacker);

  startCooldown(attacker, plan.key, plan.action.baseCooldown);

  return true;
}

const CARDINAL_DIRS = Object.freeze([
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
]);

const DEFAULT_WANDER_RADIUS = 6;

/**
 * Execute a planner decision and return the delay before the actor may act again.
 * Falls back to the actor's base delay when the decision does not supply one.
 *
 * @param {DecisionExecutionParams} params
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
      const guardInput = decision.guard ?? actor?.guard ?? performer?.guard ?? null;
      let guardState = cloneGuardConfig(guardInput);

      const decisionAnchor = resolvePosition(decision.at);
      let anchor = decisionAnchor ?? (guardState?.anchor ? { ...guardState.anchor } : null);
      if (!anchor) {
        anchor = resolvePosition(actor?.homePos)
          ?? resolvePosition(performer?.homePos)
          ?? resolvePosition(actor?.spawnPos)
          ?? resolvePosition(performer?.spawnPos)
          ?? resolvePosition(actor);
      }

      const defaultRadius = Number.isFinite(decision.radius)
        ? decision.radius
        : Number.isFinite(actor?.guardRadius)
        ? actor.guardRadius
        : Number.isFinite(performer?.guardRadius)
        ? performer.guardRadius
        : 3;

      let radius = Number.isFinite(guardState?.radius) ? guardState.radius : defaultRadius;
      if (!guardState && (anchor || Number.isFinite(defaultRadius))) {
        guardState = {};
      }
      if (guardState) {
        if (anchor) {
          guardState.anchor = { ...anchor };
        }
        if (Number.isFinite(radius)) {
          guardState.radius = radius;
        }
        const cloned = cloneGuardConfig(guardState);
        if (actor && typeof actor === "object") {
          actor.guard = cloneGuardConfig(guardState);
          if (Number.isFinite(guardState.radius)) actor.guardRadius = guardState.radius;
          if (guardState.resumeBias != null) actor.guardResumeBias = guardState.resumeBias;
          if (anchor) {
            actor.homePos = { ...anchor };
            if ("_homeFromFallback" in actor) {
              actor._homeFromFallback = false;
            }
          }
        }
        if (performer && performer !== actor) {
          performer.guard = cloned ?? null;
          if (Number.isFinite(guardState.radius)) performer.guardRadius = guardState.radius;
          if (guardState.resumeBias != null) performer.guardResumeBias = guardState.resumeBias;
          if (anchor) {
            performer.homePos = { ...anchor };
          }
        }
        decision.guard = cloned ?? decision.guard;
      }

      const selfPos = resolvePosition(actor);
      if (anchor && selfPos) {
        const dist = manhattanDistance(selfPos, anchor);
        if (Number.isFinite(radius) && dist > radius) {
          const step = stepToward(selfPos, anchor, world, actor);
          const moved = attemptPlannerStep(actor, selfPos, step, world, decision, "guard_step");
          if (moved) {
            noteMoved(performer);
          }
        } else {
          recordPlannerStep(actor, "guard_step", {
            from: selfPos,
            to: selfPos,
            blocked: false,
            radius,
            dist,
            guard: guardState ?? null,
          });
        }
      } else {
        recordPlannerStep(actor, "guard_step", { blocked: true, reason: "missing_anchor", guard: guardState ?? null });
      }
      return baseDelay;
    }

    case "WANDER": {
      const leash = resolveLeash(decision.leash, actor);
      const wanderInput = decision.wander ?? actor?.wander ?? performer?.wander ?? null;
      let wanderState = cloneWanderConfig(wanderInput);
      if (!wanderState) {
        wanderState = {};
      }
      if (!Number.isFinite(wanderState.radius) && Number.isFinite(leash)) {
        wanderState.radius = leash;
      }
      if (!wanderState.anchor) {
        const guardAnchor = actor?.guard?.anchor ?? performer?.guard?.anchor ?? null;
        const home = resolvePosition(actor?.homePos)
          ?? resolvePosition(performer?.homePos)
          ?? resolvePosition(actor?.spawnPos)
          ?? resolvePosition(performer?.spawnPos)
          ?? null;
        wanderState.anchor = guardAnchor
          ? { x: guardAnchor.x | 0, y: guardAnchor.y | 0 }
          : home ?? null;
      }
      if (actor && typeof actor === "object") {
        actor.wander = cloneWanderConfig(wanderState);
        if (Number.isFinite(wanderState.radius)) actor.wanderRadius = wanderState.radius;
        if (wanderState.resumeBias != null) actor.wanderResumeBias = wanderState.resumeBias;
      }
      if (performer && performer !== actor) {
        performer.wander = cloneWanderConfig(wanderState);
        if (Number.isFinite(wanderState.radius)) performer.wanderRadius = wanderState.radius;
        if (wanderState.resumeBias != null) performer.wanderResumeBias = wanderState.resumeBias;
      }

      decision.wander = cloneWanderConfig(wanderState);

      const selfPos = resolvePosition(actor);
      const leashRadius = Number.isFinite(wanderState.radius) ? wanderState.radius : leash;
      const step = randomLeashedStep(actor, leashRadius, world, rngFn);
      const moved = attemptPlannerStep(actor, selfPos, step, world, decision, "wander_step");
      if (moved) {
        noteMoved(performer);
      }
      return baseDelay;
    }

    default:
      return baseDelay;
  }
}

/**
 * Resolve the base delay value for the actor taking into account combatant
 * metadata and speed modifiers.
 *
 * @param {any} actor
 * @param {Actor} [combatant]
 * @returns {number}
 */
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

/**
 * Resolve the combatant data object for an actor, falling back to the actor
 * itself when no explicit combatant wrapper is present.
 *
 * @param {any} actor
 * @param {Actor} [combatant]
 */
function resolveCombatant(actor, combatant) {
  if (combatant) return combatant;
  if (actor?.__actor) return actor.__actor;
  return actor;
}

/**
 * Extract a target actor from a planner decision payload.
 *
 * @param {any} candidate
 */
function resolveTarget(candidate) {
  if (!candidate) return null;
  if (candidate.__actor) return resolveTarget(candidate.__actor);
  if (candidate.actor && candidate.actor !== candidate) return resolveTarget(candidate.actor);
  return candidate;
}

/**
 * Attempt to read a coordinate from the supplied entity. Supports raw
 * `{x, y}` properties, lazily computed `pos()` functions, and nested `pos`
 * objects.
 *
 * @param {any} entity
 * @returns {Point | null}
 */
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

/**
 * Compute Chebyshev distance (king moves) between two points.
 *
 * @param {Point | null} a
 * @param {Point | null} b
 */
function chebyshevDistance(a, b) {
  if (!a || !b) return Infinity;
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Compute Manhattan distance (taxicab metric) between two points.
 *
 * @param {Point | null} a
 * @param {Point | null} b
 */
function manhattanDistance(a, b) {
  if (!a || !b) return Infinity;
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Identify the next cardinal tile when moving from `from` toward `to`.
 * Filters out impassable positions before choosing the closest candidate.
 *
 * @param {Point | null} from
 * @param {Point | null} to
 * @param {any} world
 * @param {any} self
 */
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

/**
 * Select a random step within the leash radius while remaining on passable
 * terrain.
 *
 * @param {any} actor
 * @param {number} leash
 * @param {any} world
 * @param {() => number} rng
 */
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

/**
 * Determine the leash distance for the actor when wandering.
 *
 * @param {number | null | undefined} raw
 * @param {any} actor
 */
function resolveLeash(raw, actor) {
  if (Number.isFinite(raw) && raw >= 0) return raw;
  if (Number.isFinite(actor?.wanderRadius)) return actor.wanderRadius;
  return DEFAULT_WANDER_RADIUS;
}

/**
 * Move the entity into the provided step, interacting with doors and hostile
 * occupants as necessary.
 *
 * @param {any} entity
 * @param {Point | null} step
 * @param {any} world
 */
function applyStep(entity, step, world) {
  if (!step) return false;
  const { x, y } = step;

  const door = resolveDoorAt(world, x, y);
  if (door && !isDoorOpen(door)) {
    if (typeof world?.onAttemptOpenDoor === "function") {
      try {
        const allow = world.onAttemptOpenDoor(entity, door, { x, y });
        if (!allow) {
          return false;
        }
      } catch (err) {
        console.error("[runes] onAttemptOpenDoor failed", err);
        return false;
      }
    }
    if (canDoorBeOpenedNow(door) && openDoorThroughBump(door)) {
      Sound.playDoor();
      if (typeof world?.onDoorOpened === "function") {
        try {
          world.onDoorOpened({ door, entity, x, y });
        } catch {
          /* ignore listener errors */
        }
      }
    }
    return false;
  }

  if (!isPassable(world, x, y, entity)) {
    const occupant = getOccupant(world, x, y, entity);
    if (occupant && occupant !== entity) {
      if (FactionService.isHostile(entity, occupant)) {
        const attacker = resolveCombatant(entity, entity?.__actor);
        const defender = resolveCombatant(occupant, occupant?.__actor);
        if (attacker && defender) {
          tryAttackEquipped(attacker, defender, 1) ||
            tryAttack(attacker, defender);
        }
      }
    }
    return false;
  }

  entity.x = x;
  entity.y = y;
  if (entity?.__actor) {
    entity.__actor._turnDidMove = true;
  }
  if (typeof world?.onStepIntoTile === "function") {
    try {
      world.onStepIntoTile(entity, x, y, world?.layer ?? 0);
    } catch (err) {
      console.error("[runes] onStepIntoTile failed", err);
    }
  }
  return true;
}

/**
 * Determine whether a tile can be traversed by the provided entity. Checks the
 * grid for walls, validates door state, and ensures no other actors occupy the
 * target tile.
 *
 * @param {any} world
 * @param {number} x
 * @param {number} y
 * @param {any} self
 * @returns {boolean}
 */
function isPassable(world, x, y, self) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const grid = resolveGrid(world);
  if (grid) {
    const tile = grid[y]?.[x];
    if (tile == null) return false;
    if (tile !== TILE_FLOOR) return false;
  }
  const door = resolveDoorAt(world, x, y);
  if (door && !isDoorOpen(door) && !canDoorBeOpenedNow(door)) {
    return false;
  }
  return !isOccupied(world, x, y, self);
}

function gatherMovementGuards(decision, world) {
  const list = [];
  if (typeof decision?.canMove === "function") list.push(decision.canMove);
  if (typeof decision?.movementGuards?.canMove === "function") list.push(decision.movementGuards.canMove);
  if (typeof world?.canMove === "function") list.push(world.canMove);
  if (typeof world?.movementGuards?.canMove === "function") list.push(world.movementGuards.canMove);
  return list;
}

function attemptPlannerStep(entity, from, target, world, decision, label) {
  const origin = from ?? resolvePosition(entity);
  if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y) || !origin) {
    recordPlannerStep(entity, label, { from: origin ?? null, to: target ?? null, blocked: true, reason: "invalid_step" });
    return false;
  }
  const delta = { dx: (target.x | 0) - (origin.x | 0), dy: (target.y | 0) - (origin.y | 0) };
  if (!delta.dx && !delta.dy) {
    recordPlannerStep(entity, label, { from: origin, to: target, blocked: false, delta });
    return false;
  }

  for (const guardFn of gatherMovementGuards(decision, world)) {
    try {
      if (guardFn && guardFn(entity, delta) === false) {
        recordPlannerStep(entity, label, { from: origin, to: target, blocked: true, reason: "collision_guard", delta });
        return false;
      }
    } catch (err) {
      recordPlannerStep(entity, label, { from: origin, to: target, blocked: true, reason: "collision_guard_error", error: err?.message, delta });
      return false;
    }
  }

  const success = applyStep(entity, target, world);
  recordPlannerStep(entity, label, { from: origin, to: target, blocked: !success, delta });
  return success;
}

function recordPlannerStep(entity, label, payload = {}) {
  if (!entity) return;
  const entry = { label, ...payload };
  entity.lastPlannerStep = entry;
  if (entity.__actor && entity.__actor !== entity) {
    entity.__actor.lastPlannerStep = entry;
  }
  if (entity.actor && entity.actor !== entity) {
    entity.actor.lastPlannerStep = entry;
  }
}

/**
 * Extract a 2D grid reference from the world when available.
 *
 * @param {any} world
 * @returns {any[] | null}
 */
function resolveGrid(world) {
  if (!world) return null;
  if (Array.isArray(world?.mapState?.grid)) return world.mapState.grid;
  if (Array.isArray(world?.maze)) return world.maze;
  if (Array.isArray(world?.grid)) return world.grid;
  return null;
}

/**
 * Boolean helper for tile occupancy checks.
 *
 * @param {any} world
 * @param {number} x
 * @param {number} y
 * @param {any} self
 */
function isOccupied(world, x, y, self) {
  return Boolean(getOccupant(world, x, y, self));
}

/**
 * Resolve furniture placements at the supplied coordinate if available.
 *
 * @param {any} world
 * @param {number} x
 * @param {number} y
 * @returns {any}
 */
function getFurniturePlacement(world, x, y) {
  if (!world) return null;
  const mapState = world.mapState;
  if (!mapState) return null;
  const key = `${x},${y}`;
  if (mapState.furnitureIndex instanceof Map) {
    const placement = mapState.furnitureIndex.get(key);
    if (placement) return placement;
  }
  if (!Array.isArray(mapState.furniture)) return null;
  for (const placement of mapState.furniture) {
    if (!placement || !placement.position) continue;
    const px = Math.round(placement.position.x ?? NaN);
    const py = Math.round(placement.position.y ?? NaN);
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    if (px === x && py === y) return placement;
  }
  return null;
}

/**
 * Retrieve a door instance at a given tile, accounting for placement metadata
 * and lightweight door descriptors.
 *
 * @param {any} world
 * @param {number} x
 * @param {number} y
 * @returns {any}
 */
function resolveDoorAt(world, x, y) {
  const placement = getFurniturePlacement(world, x, y);
  if (!placement) return null;
  const candidate = placement.furniture || placement;
  if (!candidate) return null;
  if (candidate instanceof Door) return candidate;
  const kind = candidate.kind || candidate.metadata?.kind || null;
  if (kind === FurnitureKind.DOOR || kind === "door") {
    return candidate;
  }
  return null;
}

/**
 * Check whether a door is currently open.
 *
 * @param {any} door
 * @returns {boolean}
 */
function isDoorOpen(door) {
  if (!door) return false;
  if (typeof door.isOpen === "function") {
    try {
      return door.isOpen();
    } catch {
      return false;
    }
  }
  const state = typeof door.state === "string" ? door.state : door.metadata?.state;
  return state === DOOR_STATE.OPEN;
}

/**
 * Determine if the given door has an effect (locked, jammed, etc.).
 *
 * @param {any} door
 * @param {string} effectId
 * @returns {boolean}
 */
function doorHasEffect(door, effectId) {
  if (!door || !effectId) return false;
  if (typeof door.hasEffect === "function") {
    try {
      return door.hasEffect(effectId);
    } catch {
      return false;
    }
  }
  const effects = door.effects;
  if (effects instanceof Map) {
    return effects.has(effectId);
  }
  if (Array.isArray(effects)) {
    return effects.some((eff) => eff && eff.id === effectId);
  }
  if (effects && typeof effects === "object") {
    return Boolean(effects[effectId]);
  }
  return false;
}

/**
 * Validate whether a door can be opened via bump interaction.
 *
 * @param {any} door
 * @returns {boolean}
 */
function canDoorBeOpenedNow(door) {
  if (!door) return false;
  if (isDoorOpen(door)) return false;
  const state = typeof door.state === "string" ? door.state : door.metadata?.state;
  if (state === DOOR_STATE.BLOCKED) return false;
  if (doorHasEffect(door, FURNITURE_EFFECT_IDS.LOCKED)) return false;
  if (doorHasEffect(door, FURNITURE_EFFECT_IDS.JAMMED)) return false;
  return true;
}

/**
 * Attempt to open a door in response to a movement bump.
 *
 * @param {any} door
 * @returns {boolean}
 */
function openDoorThroughBump(door) {
  if (!door) return false;
  if (isDoorOpen(door)) return false;
  if (typeof door.open === "function") {
    door.open();
    return true;
  }
  door.state = DOOR_STATE.OPEN;
  if (door.metadata && typeof door.metadata === "object") {
    door.metadata.state = DOOR_STATE.OPEN;
  }
  return true;
}

/**
 * Check for an entity already occupying the specified tile.
 *
 * @param {any} world
 * @param {number} x
 * @param {number} y
 * @param {any} [self]
 */
function getOccupant(world, x, y, self = null) {
  if (!world) return null;
  const mgr = world.mobManager;
  if (mgr?.getMobAt) {
    const mob = mgr.getMobAt(x, y);
    if (mob && mob !== self) return mob;
  }
  for (const mob of resolveMobList(mgr)) {
    if (!mob || mob === self) continue;
    if (mob.x === x && mob.y === y) return mob;
  }
  if (world.player && world.player !== self) {
    const player = world.player;
    if (player.x === x && player.y === y) return player;
  }
  return null;
}

/**
 * Normalize mob manager collections into iterable arrays.
 *
 * @param {any} mobManager
 * @returns {any[]}
 */
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

/**
 * Normalize the RNG interface expected by wandering logic.
 *
 * @param {any} source
 * @returns {() => number}
 */
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
