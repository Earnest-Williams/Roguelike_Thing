// src/combat/ai-planner.js
// @ts-check
import { ACTIONS } from "../content/actions.js";
import { FactionService } from "../game/faction-service.js";
// All entity targeting must normalize to Actor and exclude self before hostility checks.
import { asActor } from "../combat/actor.js";
import { hasLineOfSight } from "../../js/utils.js";
import { evaluateCandidates, explainDecision, clamp01 as clamp01Utility } from "../ai/planner.js";
import { computePathCost } from "../ai/path_cost.js";

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

function selectTarget(self, ctx = {}) {
  /** @type {(e: any) => import("./actor.js").Actor | null} */
  const toActor = ctx.toActor ?? asActor;
  const selfActor = toActor(self) ?? self;
  const selfMob = ctx.selfMob ?? selfActor;

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

function resolveGuardRadius(actor, combatant) {
  if (Number.isFinite(actor?.guardRadius)) return actor.guardRadius;
  if (Number.isFinite(combatant?.guardRadius)) return combatant.guardRadius;
  return null;
}

function resolveWanderRadius(actor, combatant) {
  if (Number.isFinite(actor?.wanderRadius)) return actor.wanderRadius;
  if (Number.isFinite(combatant?.wanderRadius)) return combatant.wanderRadius;
  return DEFAULT_WANDER_RADIUS;
}

function chebyshevDistance(a, b) {
  if (!a || !b) return Infinity;
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function isValidPoint(pos) {
  return Boolean(pos && Number.isFinite(pos.x) && Number.isFinite(pos.y));
}

export function planTurn({ actor, combatant, world = {}, perception, rng }) {
  const performer = combatant ?? asActor(actor) ?? actor;
  const selfMob = actor ?? performer;
  const rngFn = resolvePlanRng(rng);
  const ctx = { ...world, selfMob, rng: rngFn };
  if (perception) ctx.perception = perception;

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
  const guardRadius = resolveGuardRadius(actor, combatant ?? performer);
  if (home && Number.isFinite(guardRadius) && guardRadius >= 0) {
    return { type: "GUARD", at: home, radius: guardRadius };
  }

  const leash = resolveWanderRadius(actor, combatant ?? performer);
  return { type: "WANDER", leash };
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

    const decision = buildUtilityDecision(selfMob, selection, context, distance);
    const explain = explainDecision(decision);
    if (explain) {
      selfMob.lastPlannerDecision = explain;
      if (actor && actor !== selfMob) {
        actor.lastPlannerDecision = explain;
      }
      context.lastPlannerDecision = explain;
    }
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
      context,
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
