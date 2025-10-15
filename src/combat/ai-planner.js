// src/combat/ai-planner.js
// @ts-nocheck
import { ACTIONS } from "../content/actions.js";
import { FactionService } from "../game/faction-service.js";
// All entity targeting must normalize to Actor and exclude self before hostility checks.
import { asActor } from "../combat/actor.js";
import { hasLineOfSight } from "../../js/utils.js";
import { evaluateCandidates, explainDecision, clamp01 as clamp01Utility } from "../ai/planner.js";
import { computePathCost } from "../ai/path_cost.js";
import { TILE_FLOOR } from "../../js/constants.js";

/**
 * @file
 * Normalizes arbitrary simulation "entities" (Monsters, Actors, raw POJOs)
 * into `Actor` instances, **excludes self**, and selects a hostile target using
 * `FactionService`. This is the canonical planner—remove/avoid any competing
 * variants. Consumers should pass `{ selfMob }` on context to help compute
 * distances using world coordinates when available.
 *
 * Key guarantees:
 *  - Entity → Actor coercion via `asActor(...)`
 *  - Self-filtering: both wrapper and actor identity are excluded
 *  - Hostility check is centralized (no duplicated faction math here)
 *  - Distance is Chebyshev on mob world coords when possible
 *
 * See also: src/game/monster.js (AI handoff) and src/game/faction-service.js.
 */

const asPosition = (entity) => {
  if (!entity) return null;
  if (typeof entity.x === "number" && typeof entity.y === "number") {
    return { x: entity.x, y: entity.y };
  }
  const pos = typeof entity.pos === "function" ? entity.pos() : entity.pos;
  if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
    return { x: pos.x, y: pos.y };
  }
  if (typeof entity.getPosition === "function") {
    const result = entity.getPosition();
    if (result && typeof result.x === "number" && typeof result.y === "number") {
      return { x: result.x, y: result.y };
    }
  }
  return null;
};

const listMobs = (mobManager) => {
  if (!mobManager) return [];
  if (typeof mobManager.list === "function") {
    try {
      const result = mobManager.list();
      return Array.isArray(result) ? result : [];
    } catch (err) {
      console.warn("mobManager.list() threw during AI planning", err);
      return [];
    }
  }
  if (Array.isArray(mobManager.list)) return mobManager.list;
  if (Array.isArray(mobManager)) return mobManager;
  return [];
};

const DEFAULT_WANDER_RADIUS = 6;

function gatherCollisionEntities(context) {
  const entities = [];
  if (context?.player) entities.push(context.player);
  for (const mob of listMobs(context?.mobManager)) {
    if (mob && !entities.includes(mob)) entities.push(mob);
  }
  if (Array.isArray(context?.entities)) {
    for (const ent of context.entities) {
      if (ent && !entities.includes(ent)) entities.push(ent);
    }
  }
  return entities;
}

function resolveGridLike(context) {
  if (Array.isArray(context?.mapState?.grid)) return context.mapState.grid;
  if (Array.isArray(context?.maze)) return context.maze;
  if (Array.isArray(context?.grid)) return context.grid;
  return null;
}

function buildCollisionGuards(self, context = {}) {
  const grid = resolveGridLike(context);
  const entities = gatherCollisionEntities(context);

  const canMove = (entity, step) => {
    if (!entity || !step) return false;
    const dx = Number(step.dx) || 0;
    const dy = Number(step.dy) || 0;
    if (!dx && !dy) return false;
    const origin = asPosition(entity) ?? asPosition(entity?.__actor) ?? null;
    if (!origin) return false;
    const nx = origin.x + dx;
    const ny = origin.y + dy;
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return false;

    if (grid) {
      const row = grid[ny];
      if (!row || row[nx] == null) return false;
      if (row[nx] !== TILE_FLOOR) return false;
    }

    for (const candidate of entities) {
      if (!candidate) continue;
      if (candidate === entity) continue;
      if (candidate === self) continue;
      if (candidate === entity?.__actor) continue;
      if (candidate === entity?.actor) continue;
      if (candidate === self?.__actor) continue;
      const pos = asPosition(candidate);
      if (pos && pos.x === nx && pos.y === ny) {
        return false;
      }
    }

    return true;
  };

  const tryMove = (entity, step) => {
    if (!canMove(entity, step)) return false;
    if (typeof context?.tryMove === "function") {
      return context.tryMove(entity, step);
    }
    if (typeof entity?.tryMove === "function") {
      const maze = grid ?? context?.maze;
      return entity.tryMove(step.dx, step.dy, maze, context?.mobManager);
    }
    if (entity?.__actor && typeof entity.__actor.tryMove === "function") {
      const maze = grid ?? context?.maze;
      return entity.__actor.tryMove(step.dx, step.dy, maze, context?.mobManager);
    }
    return false;
  };

  return { canMove, tryMove };
}

function selectTarget(self, ctx = {}) {
  /** @type {(e: any) => import("./actor.js").Actor | null} */
  const toActor = ctx.toActor ?? asActor;
  const selfActor = toActor(self) ?? self;
  const selfMob = ctx.selfMob ?? selfActor;
  if (ctx.guard) {
    ctx.guardDistance = guardDistanceFrom(selfMob, ctx.guard);
  }

  const allEntities = [ctx.player, ...listMobs(ctx.mobManager)];
  if (ctx.target) {
    allEntities.push(ctx.target);
  }

  const normalized = allEntities
    .filter(Boolean)
    .map((entity) => ({ entity, actor: toActor(entity) }))
    .filter(({ actor }) => Boolean(actor));

  const candidates = normalized.filter(({ actor }) => actor !== selfActor);

  const perceptionSource = ctx.selfMob ?? self;
  const perceivedVisible = Array.isArray(perceptionSource?.perception?.visibleActors)
    ? perceptionSource.perception.visibleActors
    : [];

  const perceivedHostiles = perceivedVisible
    .map((entity) => ({ entity, actor: toActor(entity) }))
    .filter(({ actor }) => actor && actor !== selfActor)
    .map((entry) => ({
      ...entry,
      position: asPosition(entry.entity) ?? asPosition(entry.actor),
    }))
    .filter(({ actor }) => FactionService.relation(selfActor, actor) < 0);

  if (perceivedHostiles.length > 0) {
    sortHostiles(perceivedHostiles, ctx, selfActor, selfMob);
    return perceivedHostiles[0];
  }

  const hostiles = candidates
    .map((entry) => ({
      ...entry,
      position: asPosition(entry.entity) ?? asPosition(entry.actor),
    }))
    .filter(({ actor }) => FactionService.relation(selfActor, actor) < 0);

  if (hostiles.length === 0) {
    return null;
  }

  sortHostiles(hostiles, ctx, selfActor, selfMob);

  return hostiles[0] ?? null;
}

function sortHostiles(list, ctx, selfActor, selfMob) {
  const maze = ctx.maze ?? ctx.grid ?? null;
  const selfPos = asPosition(selfMob) ?? asPosition(selfActor);
  const rngSource = ctx.rng;
  const rng = typeof rngSource === "function"
    ? rngSource
    : typeof rngSource?.next === "function"
    ? () => rngSource.next()
    : typeof rngSource?.random === "function"
    ? () => rngSource.random()
    : Math.random;

  const losScore = (candidate) => {
    if (!maze || !selfPos || !candidate.position) return 0;
    try {
      return hasLineOfSight(maze, selfPos, candidate.position) ? 0 : 1;
    } catch (err) {
      console.warn("LOS check failed during AI planning", err);
      return 0;
    }
  };

  const distScore = (candidate) => {
    if (!selfPos || !candidate.position) return Infinity;
    const dx = Math.abs(candidate.position.x - selfPos.x);
    const dy = Math.abs(candidate.position.y - selfPos.y);
    return Math.max(dx, dy);
  };

  list.sort((a, b) => {
    const losA = losScore(a);
    const losB = losScore(b);
    if (losA !== losB) return losA - losB;
    const dA = distScore(a);
    const dB = distScore(b);
    if (Number.isFinite(dA) && Number.isFinite(dB) && dA !== dB) {
      return dA - dB;
    }
    const roll = rng() - 0.5;
    if (roll < 0) return -1;
    if (roll > 0) return 1;
    return 0;
  });
}

function ratio(value, max) {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return clamp01Utility(value / max);
}

function resolvePlanRng(source) {
  if (typeof source === "function") return source;
  if (typeof source?.next === "function") {
    return () => source.next();
  }
  if (typeof source?.random === "function") {
    return () => source.random();
  }
  return Math.random;
}

function resolveHomePosition(actor, combatant) {
  const home = actor?.homePos ?? actor?.spawnPos ?? combatant?.homePos ?? combatant?.spawnPos ?? null;
  if (home && Number.isFinite(home.x) && Number.isFinite(home.y)) {
    return { x: home.x | 0, y: home.y | 0 };
  }
  return null;
}

function resolveGuardRadius(actor, combatant, guard) {
  if (guard && Number.isFinite(guard.radius)) return guard.radius;
  if (Number.isFinite(actor?.guardRadius)) return actor.guardRadius;
  if (Number.isFinite(combatant?.guardRadius)) return combatant.guardRadius;
  return null;
}

function resolveGuardResumeBias(actor, combatant, guard) {
  if (guard && Number.isFinite(guard.resumeBias)) return clamp01Utility(guard.resumeBias);
  if (Number.isFinite(actor?.guardResumeBias)) return clamp01Utility(actor.guardResumeBias);
  if (Number.isFinite(combatant?.guardResumeBias)) return clamp01Utility(combatant.guardResumeBias);
  return 0;
}

function resolveWanderRadius(actor, combatant, wander) {
  if (wander && Number.isFinite(wander.radius)) return wander.radius;
  if (Number.isFinite(actor?.wanderRadius)) return actor.wanderRadius;
  if (Number.isFinite(combatant?.wanderRadius)) return combatant.wanderRadius;
  return DEFAULT_WANDER_RADIUS;
}

function resolveWanderResumeBias(actor, combatant, wander) {
  if (wander && Number.isFinite(wander.resumeBias)) return clamp01Utility(wander.resumeBias);
  if (Number.isFinite(actor?.wanderResumeBias)) return clamp01Utility(actor.wanderResumeBias);
  if (Number.isFinite(combatant?.wanderResumeBias)) return clamp01Utility(combatant.wanderResumeBias);
  return 0.25;
}

function chebyshevDistance(a, b) {
  if (!a || !b) return Infinity;
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function isValidPoint(pos) {
  return Boolean(pos && Number.isFinite(pos.x) && Number.isFinite(pos.y));
}

function resolveGuardAnchor(actor, combatant, guard, fallbackHome) {
  if (!guard) return fallbackHome;
  if (guard.anchor && Number.isFinite(guard.anchor.x) && Number.isFinite(guard.anchor.y)) {
    return { x: guard.anchor.x | 0, y: guard.anchor.y | 0 };
  }
  const base = fallbackHome ?? resolveHomePosition(actor, combatant);
  if (!base) return null;
  if (guard.anchorOffset && Number.isFinite(guard.anchorOffset.x) && Number.isFinite(guard.anchorOffset.y)) {
    return { x: base.x + (guard.anchorOffset.x | 0), y: base.y + (guard.anchorOffset.y | 0) };
  }
  return base ? { ...base } : null;
}

function guardDistanceFrom(selfMob, guard) {
  if (!guard) return Infinity;
  const anchor = guard.anchor;
  const selfPos = asPosition(selfMob);
  if (!anchor || !selfPos) return Infinity;
  return chebyshevDistance(selfPos, anchor);
}

function shouldResumeGuard(rng, bias, distance, radius) {
  if (!Number.isFinite(distance)) return false;
  if (Number.isFinite(radius) && distance > radius) return true;
  if (!Number.isFinite(bias) || bias <= 0) return false;
  const roll = typeof rng === "function" ? rng() : Math.random();
  return roll < clamp01Utility(bias);
}

function resolveSelfActor(selfMob) {
  if (!selfMob) return null;
  if (selfMob.__actor && selfMob.__actor !== selfMob) return selfMob.__actor;
  if (selfMob.actor && selfMob.actor !== selfMob) return selfMob.actor;
  return asActor(selfMob);
}

function resolveBaseHome(selfMob) {
  if (!selfMob) return null;
  const actor = resolveSelfActor(selfMob);
  const base = selfMob.homePos || selfMob.spawnPos || actor?.homePos || actor?.spawnPos || null;
  if (base && Number.isFinite(base.x) && Number.isFinite(base.y)) {
    return { x: base.x | 0, y: base.y | 0 };
  }
  const pos = asPosition(selfMob);
  return pos ? { x: pos.x | 0, y: pos.y | 0 } : null;
}

function normalizeGuardStateForPlanner(selfMob, context) {
  const actor = resolveSelfActor(selfMob);
  const guard = context?.guard ?? selfMob?.guard ?? actor?.guard ?? null;
  if (!guard) return null;
  const baseHome = resolveBaseHome(selfMob);
  let anchor = null;
  if (guard.anchor && Number.isFinite(guard.anchor.x) && Number.isFinite(guard.anchor.y)) {
    anchor = { x: guard.anchor.x | 0, y: guard.anchor.y | 0 };
  } else if (guard.anchorOffset && Number.isFinite(guard.anchorOffset.x) && Number.isFinite(guard.anchorOffset.y) && baseHome) {
    anchor = { x: baseHome.x + (guard.anchorOffset.x | 0), y: baseHome.y + (guard.anchorOffset.y | 0) };
  } else if (baseHome) {
    anchor = { ...baseHome };
  }
  const radius = Number.isFinite(guard.radius)
    ? guard.radius
    : Number.isFinite(selfMob?.guardRadius)
      ? selfMob.guardRadius
      : Number.isFinite(actor?.guardRadius)
        ? actor.guardRadius
        : null;
  const resumeBias = Number.isFinite(guard.resumeBias)
    ? clamp01Utility(guard.resumeBias)
    : Number.isFinite(selfMob?.guardResumeBias)
      ? clamp01Utility(selfMob.guardResumeBias)
      : Number.isFinite(actor?.guardResumeBias)
        ? clamp01Utility(actor.guardResumeBias)
        : 0;
  const normalized = {
    anchor,
    anchorOffset: guard.anchorOffset ? { ...guard.anchorOffset } : null,
    radius,
    resumeBias,
  };
  normalized.distance = guardDistanceFrom(selfMob, normalized);
  return normalized;
}

function normalizeWanderStateForPlanner(selfMob, context, guardState) {
  const actor = resolveSelfActor(selfMob);
  const wander = context?.wander ?? selfMob?.wander ?? actor?.wander ?? null;
  const baseHome = guardState?.anchor ?? resolveBaseHome(selfMob);
  if (!wander && !baseHome) return null;
  const radius = wander && Number.isFinite(wander.radius)
    ? wander.radius
    : Number.isFinite(selfMob?.wanderRadius)
      ? selfMob.wanderRadius
      : Number.isFinite(actor?.wanderRadius)
        ? actor.wanderRadius
        : DEFAULT_WANDER_RADIUS;
  const resumeBias = wander && Number.isFinite(wander.resumeBias)
    ? clamp01Utility(wander.resumeBias)
    : Number.isFinite(selfMob?.wanderResumeBias)
      ? clamp01Utility(selfMob.wanderResumeBias)
      : Number.isFinite(actor?.wanderResumeBias)
        ? clamp01Utility(actor.wanderResumeBias)
        : 0.2;
  let anchor = null;
  if (wander?.anchor && Number.isFinite(wander.anchor.x) && Number.isFinite(wander.anchor.y)) {
    anchor = { x: wander.anchor.x | 0, y: wander.anchor.y | 0 };
  } else if (wander?.anchorOffset && baseHome) {
    anchor = { x: baseHome.x + (wander.anchorOffset.x | 0), y: baseHome.y + (wander.anchorOffset.y | 0) };
  } else if (baseHome) {
    anchor = { ...baseHome };
  }
  return {
    anchor,
    radius,
    resumeBias,
  };
}

export function planTurn({ actor, combatant, selfMob: explicitSelfMob, world = {}, perception, rng, guard, wander }) {
  const performer = combatant ?? asActor(actor) ?? actor;
  const selfMob = explicitSelfMob ?? actor ?? performer;
  const rngFn = resolvePlanRng(rng);
  const ctx = { ...world, selfMob, rng: rngFn };
  if (perception) ctx.perception = perception;
  const guardState = guard ?? actor?.guard ?? performer?.guard ?? null;
  const wanderState = wander ?? actor?.wander ?? performer?.wander ?? null;
  if (guardState) ctx.guard = guardState;
  if (wanderState) ctx.wander = wanderState;

  const selfPos = asPosition(selfMob) ?? asPosition(performer);
  const selection = selectTarget(performer, ctx);
  if (selection) {
    const targetActor = selection.actor ?? asActor(selection.entity);
    const targetEntity = selection.entity ?? targetActor;
    const targetPos = selection.position ?? asPosition(targetEntity) ?? asPosition(targetActor);
    if (isValidPoint(selfPos) && isValidPoint(targetPos)) {
      const dist = chebyshevDistance(selfPos, targetPos);
      if (Number.isFinite(dist) && dist <= 1) {
        return { type: "ATTACK", target: targetActor ?? targetEntity };
      }
      return {
        type: "MOVE",
        target: targetEntity ?? targetActor,
        targetActor,
        targetPos,
      };
    }
  }

  const home = resolveHomePosition(actor, combatant ?? performer);
  const guardAnchor = resolveGuardAnchor(actor, combatant ?? performer, guardState, home);
  const guardRadius = resolveGuardRadius(actor, combatant ?? performer, guardState);
  const guardBias = resolveGuardResumeBias(actor, combatant ?? performer, guardState);
  const guardDistance = guardDistanceFrom(selfMob, { ...guardState, anchor: guardAnchor });
  if (guardAnchor && Number.isFinite(guardRadius) && guardRadius >= 0) {
    if (Number.isFinite(guardDistance) && guardDistance > guardRadius) {
      return {
        type: "GUARD",
        at: guardAnchor,
        radius: guardRadius,
        guard: { ...guardState, anchor: guardAnchor, radius: guardRadius, distance: guardDistance },
        reason: "outside_guard_radius",
      };
    }
    if (shouldResumeGuard(rngFn, guardBias, guardDistance, guardRadius)) {
      return {
        type: "GUARD",
        at: guardAnchor,
        radius: guardRadius,
        guard: { ...guardState, anchor: guardAnchor, radius: guardRadius, distance: guardDistance },
        reason: "resume_bias",
      };
    }
  }

  const leash = resolveWanderRadius(actor, combatant ?? performer, wanderState);
  const wanderBias = resolveWanderResumeBias(actor, combatant ?? performer, wanderState);
  return {
    type: "WANDER",
    leash,
    wander: { ...wanderState, radius: leash, resumeBias: wanderBias },
  };
}

function resolveHealthRatio(actor) {
  if (!actor) return 0;
  const hp = Number.isFinite(actor?.res?.hp)
    ? actor.res.hp
    : Number.isFinite(actor?.resources?.hp)
      ? actor.resources.hp
      : Number.isFinite(actor?.hp)
        ? actor.hp
        : 0;
  const max = Number.isFinite(actor?.base?.maxHP)
    ? actor.base.maxHP
    : Number.isFinite(actor?.baseStats?.maxHP)
      ? actor.baseStats.maxHP
      : Number.isFinite(actor?.resources?.maxHp)
        ? actor.resources.maxHp
        : Number.isFinite(actor?.maxHp)
          ? actor.maxHp
          : 0;
  return ratio(hp, max);
}

function resolveThreatRatio(actor) {
  if (!actor) return 0;
  const offense = Number.isFinite(actor?.power)
    ? actor.power
    : Number.isFinite(actor?.level)
      ? actor.level
      : null;
  if (Number.isFinite(offense) && offense > 0) {
    return clamp01Utility(offense / (10 + offense));
  }
  return resolveHealthRatio(actor);
}

function sampleLightLevel(selfMob, ctx) {
  if (typeof ctx?.lightLevel === "number") {
    return clamp01Utility(ctx.lightLevel);
  }
  if (typeof ctx?.sampleLightAt === "function" && Number.isFinite(selfMob?.x) && Number.isFinite(selfMob?.y)) {
    return clamp01Utility(ctx.sampleLightAt(selfMob.x, selfMob.y));
  }
  if (typeof selfMob?.getLightLevel === "function") {
    return clamp01Utility(selfMob.getLightLevel());
  }
  return clamp01Utility(1);
}

function buildUtilityDecision(selfMob, selection, context, distance) {
  const policyInput = context?.policy ?? context?.aiPolicy ?? selfMob?.aiPolicy ?? null;
  const overrides = context?.policyOverrides ?? selfMob?.aiPolicyOverrides ?? null;
  const gates = {};
  if (typeof context?.allowAggro === "boolean") gates.allowAggro = context.allowAggro;
  if (typeof context?.pursueCombat === "boolean") gates.pursueCombat = context.pursueCombat;

  const lightLevel = sampleLightLevel(selfMob, context);
  const selfHealth = resolveHealthRatio(selfMob);
  const targetActor = selection?.actor ?? null;
  const targetThreat = clamp01Utility(resolveThreatRatio(targetActor));
  const threatLevel = clamp01Utility(
    typeof context?.threatLevel === "number" ? context.threatLevel : targetThreat,
  );
  const explorationFocus = clamp01Utility(context?.explorationFocus ?? 0);
  const lootFocus = clamp01Utility(context?.lootFocus ?? 0);
  const exitUrgency = clamp01Utility(context?.exitUrgency ?? 0);
  const progress = clamp01Utility(context?.progress ?? 0);
  const maxEngage = Math.max(1, Number.isFinite(context?.maxEngageDistance) ? Number(context.maxEngageDistance) : 6);
  const distVal = Number.isFinite(distance) ? Number(distance) : Infinity;
  const distanceBias = clamp01Utility(1 - Math.min(distVal, maxEngage) / maxEngage);

  const guardState = normalizeGuardStateForPlanner(selfMob, context);
  const wanderState = normalizeWanderStateForPlanner(selfMob, context, guardState);
  context.guardState = guardState;
  context.wanderState = wanderState;

  const candidates = [];

  if (selection) {
    candidates.push({
      goal: "engage",
      target: selection.entity,
      metrics: {
        light: lightLevel,
        minimumLight: lightLevel,
        safety: selfHealth,
        lowHealth: selfHealth,
        threat: threatLevel,
        loot: lootFocus,
        exit: exitUrgency,
        exploration: explorationFocus,
        combat: distanceBias,
        targetThreat,
        progress,
      },
      thresholds: { minimumLight: lightLevel },
      gates: ["allowAggro"],
      context: { distance: distVal, distanceBias, selfHealth, targetThreat },
      baseScore: 0.35 + distanceBias,
    });
  }

  candidates.push({
    goal: selection ? "hold_position" : "idle",
    target: selection?.entity ?? null,
    metrics: {
      light: lightLevel,
      minimumLight: lightLevel,
      safety: selfHealth,
      lowHealth: selfHealth,
      threat: threatLevel,
      loot: lootFocus,
      exit: exitUrgency,
      exploration: explorationFocus,
      combat: selection ? Math.max(0.1, distanceBias * 0.5) : 0,
      targetThreat,
      progress,
    },
    context: { distance: distVal, distanceBias, selfHealth, targetThreat },
    baseScore: selection ? 0.1 : 0.2,
  });

  if (!selection && guardState) {
    const urgency = guardState.radius != null && guardState.radius >= 0
      ? clamp01Utility(guardState.distance > guardState.radius
        ? 1
        : guardState.radius > 0
          ? guardState.distance / Math.max(1, guardState.radius)
          : guardState.distance > 0 ? 1 : 0)
      : clamp01Utility(guardState.distance > 0 ? 1 : 0);
    candidates.push({
      goal: "guard",
      metrics: {
        light: lightLevel,
        minimumLight: lightLevel,
        safety: clamp01Utility(1 - urgency * 0.25),
        lowHealth: selfHealth,
        threat: threatLevel,
        loot: 0,
        exit: exitUrgency,
        exploration: 0,
        combat: urgency * 0.1,
        targetThreat: 0,
        progress: clamp01Utility(guardState.distance == null
          ? 0
          : guardState.radius && guardState.radius > 0
            ? 1 - Math.min(guardState.distance, guardState.radius) / Math.max(1, guardState.radius)
            : guardState.distance > 0 ? 0 : 1),
      },
      context: {
        guardDistance: guardState.distance ?? Infinity,
        guardRadius: guardState.radius ?? null,
        guardAnchor: guardState.anchor ?? null,
        guardResumeBias: guardState.resumeBias ?? 0,
      },
      baseScore: 0.2 + (guardState.resumeBias ?? 0) + urgency * 0.6,
    });
  }

  if (!selection && wanderState) {
    const anchor = wanderState.anchor ?? guardState?.anchor ?? null;
    const selfPos = asPosition(selfMob);
    const leash = Number.isFinite(wanderState.radius) ? wanderState.radius : DEFAULT_WANDER_RADIUS;
    const distanceFromAnchor = anchor && selfPos ? chebyshevDistance(selfPos, anchor) : 0;
    const leashRatio = leash > 0 ? clamp01Utility(distanceFromAnchor / leash) : 0;
    const exploreWeight = Math.max(explorationFocus, 0.25);
    candidates.push({
      goal: "wander",
      metrics: {
        light: lightLevel,
        minimumLight: lightLevel,
        safety: selfHealth,
        lowHealth: selfHealth,
        threat: threatLevel * 0.25,
        loot: lootFocus,
        exit: exitUrgency,
        exploration: exploreWeight,
        combat: 0,
        targetThreat: 0,
        progress: clamp01Utility(1 - leashRatio * 0.5),
      },
      context: {
        leash,
        wanderResumeBias: wanderState.resumeBias ?? 0,
        wanderAnchor: anchor,
        distanceFromAnchor,
      },
      baseScore: 0.15 + (wanderState.resumeBias ?? 0) + exploreWeight * 0.5,
    });
  }

  const retreatThreshold = clamp01Utility(
    Number.isFinite(context?.retreatHealthThreshold) ? context.retreatHealthThreshold : 0.25,
  );
  const considerRetreat = context?.considerRetreat !== false;
  if (considerRetreat && selfHealth < 0.999) {
    const urgency = clamp01Utility(retreatThreshold > 0 ? 1 - selfHealth / Math.max(retreatThreshold, 1e-3) : 0);
    const retreatBase = (Number(context?.retreatBias) || 0) - 0.25 + urgency;
    candidates.push({
      goal: "retreat",
      target: selection?.entity ?? null,
      metrics: {
        light: lightLevel,
        minimumLight: lightLevel,
        safety: selfHealth,
        lowHealth: selfHealth,
        threat: threatLevel,
        loot: 0,
        exit: exitUrgency,
        exploration: 0,
        combat: 0,
        targetThreat,
        progress,
      },
      context: { distance: distVal, distanceBias, selfHealth, targetThreat },
      baseScore: retreatBase,
      formulaOverrides: { safety: "Math.max(0, 1 - threat)" },
    });
  }

  if (candidates.length === 0) return null;

  return evaluateCandidates(candidates, {
    policy: policyInput,
    overrides,
    environment: {
      threat: threatLevel,
      light: lightLevel,
      loot: lootFocus,
      exit: exitUrgency,
      progress,
      distance: Number.isFinite(distVal) ? distVal : 0,
      targetThreat,
      selfHealth,
    },
    gateOverrides: gates,
    metricAugment: context?.metricAugment,
  });
}

export const AIPlanner = {
  /**
   * Evaluate and perform the best action available to the actor.
   * @param {any} actor
   * @param {any} context
   */
  takeTurn(actor, context = {}) {
    if (!actor) return;
    const selfMob = context.selfMob || actor;

    const actionIds = Array.isArray(actor.actions) && actor.actions.length
      ? actor.actions
      : AIPlanner.defaultActions(actor);

    const selection = selectTarget(actor, { ...context, selfMob });
    const distance = selection
      ? AIPlanner.distanceBetween(selfMob, selection.entity, context)
      : AIPlanner.distanceBetween(selfMob, null, { ...context, distance: context?.distance ?? Infinity });

    const movementGuards = buildCollisionGuards(selfMob, context);
    const plannerContext = { ...context, ...movementGuards };
    const decision = buildUtilityDecision(selfMob, selection, plannerContext, distance);
    const explain = explainDecision(decision);
    if (explain) {
      selfMob.lastPlannerDecision = explain;
      if (actor && actor !== selfMob) {
        actor.lastPlannerDecision = explain;
      }
      plannerContext.lastPlannerDecision = explain;
      context.lastPlannerDecision = explain;
    }
    plannerContext.utilityDecision = decision;
    context.utilityDecision = decision;
    if (typeof context?.onDecision === "function") {
      try {
        context.onDecision({ actor: selfMob, decision, explain });
      } catch (err) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("AIPlanner.onDecision handler threw", err);
        }
      }
    }

    if (!selection) {
      return;
    }

    const targetEntity = selection.entity;
    const targetActor = selection.actor ?? asActor(targetEntity);
    const scope = {
      actor,
      target: targetEntity,
      targetActor,
      context: plannerContext,
      distance,
      decision,
    };

    let best = null;

    const goalBias = (() => {
      if (!decision) return 0;
      if (decision.goal === "engage") {
        const raw = Number.isFinite(decision.score) ? decision.score : 0;
        return Math.max(0, Math.min(0.4, 0.15 + raw * 0.05));
      }
      if (decision.goal === "retreat") {
        return -0.35;
      }
      return 0;
    })();

    for (const id of actionIds) {
      const action = ACTIONS[id];
      if (!action) continue;
      const prepared = typeof action.prepare === "function" ? action.prepare(scope) : null;
      if (prepared === false) continue;
      if (typeof action.canPerform === "function" && !action.canPerform(scope, prepared)) {
        continue;
      }
      const baseScore = typeof action.evaluate === "function"
        ? action.evaluate(scope, prepared)
        : typeof action.priority === "number"
          ? action.priority
          : 0;
      if (baseScore == null || Number.isNaN(baseScore)) continue;
      const score = baseScore + goalBias;
      if (!best || score > best.score) {
        best = { action, score, prepared };
      }
    }

    if (best?.action?.perform) {
      best.action.perform(scope, best.prepared);
    }
  },

  /**
   * Determine sensible default action list when actor has none defined.
   * @param {any} actor
   * @returns {string[]}
   */
  defaultActions(actor) {
    if (actor?.isRangedAttacker) {
      return ["move_towards_target", "fire_bolt", "strike"];
    }
    return ["move_towards_target", "strike"];
  },

  /**
   * Determine approximate grid distance between two actors.
   * @param {any} selfMob
   * @param {any} target
   * @param {any} context
   */
  distanceBetween(selfMob, target, context) {
    if (typeof context?.distance === "number") {
      return context.distance;
    }
    const ax = selfMob?.x;
    const ay = selfMob?.y;
    const tx = target?.x;
    const ty = target?.y;
    if ([ax, ay, tx, ty].every((v) => typeof v === "number")) {
      const dx = Math.abs(tx - ax);
      const dy = Math.abs(ty - ay);
      return Math.max(dx, dy);
    }
    return typeof context?.defaultDistance === "number" ? context.defaultDistance : 1;
  },
};

AIPlanner.utility = Object.freeze({
  evaluateCandidates,
  explainDecision,
  computePathCost,
});
