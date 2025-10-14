// src/combat/actions.js
// @ts-check
import { finalAPForAction, spendAP, startCooldown, isReady } from "./time.js";
import { resolveAttack } from "./resolve.js";
import { performEquippedAttack, pickAttackMode } from "../game/combat-glue.js";
import { FactionService } from "../game/faction-service.js";
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

  const door = resolveDoorAt(world, x, y);
  if (door && !isDoorOpen(door)) {
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
  const door = resolveDoorAt(world, x, y);
  if (door && !isDoorOpen(door) && !canDoorBeOpenedNow(door)) {
    return false;
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
  return Boolean(getOccupant(world, x, y, self));
}

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

function canDoorBeOpenedNow(door) {
  if (!door) return false;
  if (isDoorOpen(door)) return false;
  const state = typeof door.state === "string" ? door.state : door.metadata?.state;
  if (state === DOOR_STATE.BLOCKED) return false;
  if (doorHasEffect(door, FURNITURE_EFFECT_IDS.LOCKED)) return false;
  if (doorHasEffect(door, FURNITURE_EFFECT_IDS.JAMMED)) return false;
  return true;
}

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
