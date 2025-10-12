// src/combat/post-damage-hooks.js
// @ts-check

import { addStatus } from "./status.js";
import { rand } from "./rng.js";

/**
 * Applies temporal/resource post-damage hooks such as on-kill haste and echo.
 *
 * @param {any} ctx
 * @param {{ killed?: boolean }} outcome
 * @param {(ctx: any) => ReturnType<import("./resolve.js").resolveAttack>} resolveAttackFn
 */
export function postDamageTemporalResourceHooks(ctx, outcome = {}, resolveAttackFn) {
  const summary = {
    hasteApplied: null,
    resourceGains: null,
    echo: null,
  };

  const attacker = ctx?.attacker;
  if (!attacker) return summary;

  const temporal = attacker.modCache?.temporal || {};
  const resource = attacker.modCache?.resource || {};
  const echoCfg = temporal.echo || null;

  const killAlreadyRewarded = Boolean(ctx?._postDamageKillRewarded);
  let shouldApplyOnKill = false;
  if (outcome?.killed && !killAlreadyRewarded) {
    if (!ctx?.isEcho || getAllowOnKill(echoCfg)) {
      shouldApplyOnKill = true;
    }
    if (ctx && typeof ctx === "object") {
      ctx._postDamageKillRewarded = true;
    }
  }

  if (shouldApplyOnKill) {
    const hasteSummary = maybeApplyOnKillHaste(attacker, temporal.onKillHaste);
    if (hasteSummary) summary.hasteApplied = hasteSummary;
    const gainSummary = maybeApplyOnKillResourceGain(attacker, resource.onKillGain);
    if (gainSummary) summary.resourceGains = gainSummary;
  }

  if (echoCfg && !ctx?.isEcho) {
    const chance = clampChance(echoCfg);
    const rngFn = typeof ctx?.rng === "function" ? ctx.rng : randOrMathRandom;
    const shouldTrigger = chance >= 1 || (chance > 0 && rollChance(rngFn, chance));
    if (shouldTrigger) {
      const fraction = clampFraction(echoCfg);
      if (fraction > 0 && typeof resolveAttackFn === "function") {
        const echoCtx = buildEchoContext(ctx, echoCfg, fraction);
        if (echoCtx) {
          const echoResult = resolveAttackFn(echoCtx) || null;
          summary.echo = {
            triggered: true,
            fraction,
            chance,
            allowOnKill: getAllowOnKill(echoCfg),
            totalDamage: Number(echoResult?.totalDamage || 0),
            result: echoResult,
          };
        }
      }
    }
  }

  return summary;
}

function randOrMathRandom() {
  if (typeof rand === "function") return rand();
  return Math.random();
}

/**
 * @param {(typeof rand) | (() => number)} rngFn
 * @param {number} chance
 */
function rollChance(rngFn, chance) {
  const fn = typeof rngFn === "function" ? rngFn : randOrMathRandom;
  return fn() < chance;
}

/**
 * @param {any} cfg
 */
function clampChance(cfg) {
  const raw = pickNumber(
    cfg?.chancePct,
    cfg?.chance,
    cfg?.probability,
    cfg?.prob,
    cfg?.rate,
  );
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(1, raw));
}

/**
 * @param {any} cfg
 */
function clampFraction(cfg) {
  const raw = pickNumber(
    cfg?.fraction,
    cfg?.percent,
    cfg?.pct,
    cfg?.mult,
    cfg?.multiplier,
    cfg?.damageScalar,
    cfg?.damageMult,
  );
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(1, raw));
}

/**
 * @param {any} cfg
 */
function getAllowOnKill(cfg) {
  if (!cfg || cfg.allowOnKill === undefined || cfg.allowOnKill === null) return true;
  return Boolean(cfg.allowOnKill);
}

/**
 * @param {any} ctx
 * @param {any} echoCfg
 * @param {number} fraction
 */
function buildEchoContext(ctx, echoCfg, fraction) {
  if (!ctx) return null;
  const packets = Array.isArray(ctx.packets)
    ? ctx.packets.map((p) => ({ ...p }))
    : [];
  if (!packets.length) return null;

  const statusAttempts = echoCfg.copyStatuses
    ? Array.isArray(ctx.statusAttempts)
      ? ctx.statusAttempts.map((s) => ({ ...s }))
      : []
    : [];

  const damageScalarBase = Number.isFinite(ctx?.damageScalar)
    ? Math.max(0, Number(ctx.damageScalar))
    : 1;

  const echoCtx = {
    ...ctx,
    packets,
    statusAttempts,
    isEcho: true,
    damageScalar: damageScalarBase * fraction,
  };

  if (!echoCfg.copyResourceCosts) {
    if ("resourceCosts" in echoCtx) delete echoCtx.resourceCosts;
  } else if (ctx?.resourceCosts && typeof ctx.resourceCosts === "object") {
    echoCtx.resourceCosts = cloneObject(ctx.resourceCosts);
  }

  if ("packetsAfterDefense" in echoCtx) delete echoCtx.packetsAfterDefense;
  if ("totalDamage" in echoCtx) delete echoCtx.totalDamage;
  if ("appliedStatuses" in echoCtx) delete echoCtx.appliedStatuses;

  return echoCtx;
}

/**
 * @param {any} attacker
 * @param {any} hasteCfg
 */
function maybeApplyOnKillHaste(attacker, hasteCfg) {
  if (!attacker || !hasteCfg) return null;
  if (!canGrantOnKillHaste(attacker, hasteCfg)) return null;

  const statusId = String(
    hasteCfg.statusId || hasteCfg.status || hasteCfg.id || "haste",
  );
  const stacksRaw = pickNumber(
    hasteCfg.stacks,
    hasteCfg.stack,
    hasteCfg.amount,
    hasteCfg.value,
  );
  const stacks = Number.isFinite(stacksRaw) ? Math.max(1, Math.floor(stacksRaw)) : 1;
  const durationRaw = pickNumber(
    hasteCfg.duration,
    hasteCfg.turns,
    hasteCfg.baseDuration,
    hasteCfg.time,
    hasteCfg.length,
  );
  const duration = Number.isFinite(durationRaw)
    ? Math.max(1, Math.floor(durationRaw))
    : 1;
  const potency = pickNumber(hasteCfg.potency, hasteCfg.power, hasteCfg.strength);

  const applied = addStatus(attacker, statusId, {
    duration,
    stacks,
    ...(Number.isFinite(potency) ? { potency: potency } : {}),
    source: "onKillHaste",
  });

  if (applied) {
    stampOnKillHasteICD(attacker, hasteCfg);
    return {
      statusId,
      stacks: applied.stacks,
      duration,
      potency: applied.potency,
    };
  }
  return null;
}

/**
 * @param {any} attacker
 * @param {Record<string, number>} gains
 */
function maybeApplyOnKillResourceGain(attacker, gains) {
  if (!attacker || !gains || typeof gains !== "object") return null;
  const pools = ensureResourcePools(attacker);
  const applied = {};
  for (const [pool, rawAmount] of Object.entries(gains)) {
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount === 0) continue;
    if (pool === "hp") {
      const before = getPrimaryResource(attacker, "hp");
      const max = getPrimaryResourceMax(attacker, "hp");
      const after = clamp(before + amount, 0, max);
      setPrimaryResource(attacker, "hp", after);
      const delta = after - before;
      if (delta !== 0) applied[pool] = delta;
      continue;
    }
    const poolState = pools?.[pool];
    if (poolState) {
      const before = Number(poolState.cur || 0);
      const max = Number.isFinite(poolState.max) ? poolState.max : before;
      const after = clamp(before + amount, 0, max);
      poolState.cur = after;
      syncPrimaryMirror(attacker, pool, after);
      const delta = after - before;
      if (delta !== 0) applied[pool] = delta;
      continue;
    }
    const before = getPrimaryResource(attacker, pool);
    if (before === null) continue;
    const max = getPrimaryResourceMax(attacker, pool);
    const after = clamp(before + amount, 0, max);
    setPrimaryResource(attacker, pool, after);
    const delta = after - before;
    if (delta !== 0) applied[pool] = delta;
  }
  return Object.keys(applied).length ? applied : null;
}

function ensureResourcePools(actor) {
  if (!actor) return null;
  if (!actor.resources || typeof actor.resources !== "object") {
    actor.resources = actor.resources || {};
  }
  if (!actor.resources.pools || typeof actor.resources.pools !== "object") {
    actor.resources.pools = Object.create(null);
  }
  if (actor.res && !actor.res.pools) {
    actor.res.pools = actor.resources.pools;
  }
  return actor.resources.pools;
}

function getPrimaryResource(actor, key) {
  if (!actor) return null;
  if (key in (actor.res || {})) {
    const value = Number(actor.res[key]);
    if (Number.isFinite(value)) return value;
  }
  if (key in (actor.resources || {})) {
    const value = Number(actor.resources[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function getPrimaryResourceMax(actor, key) {
  const pools = actor?.resources?.pools || actor?.res?.pools;
  const poolState = pools?.[key];
  if (poolState && Number.isFinite(poolState.max)) {
    return poolState.max;
  }
  switch (key) {
    case "hp":
      return pickNumber(
        actor?.resources?.hpMax,
        actor?.res?.hpMax,
        actor?.base?.maxHP,
        actor?.baseStats?.maxHP,
      );
    case "stamina":
      return pickNumber(
        actor?.resources?.staminaMax,
        actor?.res?.staminaMax,
        actor?.base?.maxStamina,
        actor?.baseStats?.maxStamina,
      );
    case "mana":
      return pickNumber(
        actor?.resources?.manaMax,
        actor?.res?.manaMax,
        actor?.base?.maxMana,
        actor?.baseStats?.maxMana,
      );
    default:
      if (poolState && Number.isFinite(poolState.cur)) return poolState.cur;
      return Infinity;
  }
}

function setPrimaryResource(actor, key, value) {
  if (!actor) return;
  if (actor.res && key in actor.res) {
    actor.res[key] = value;
  }
  if (actor.resources && key in actor.resources) {
    actor.resources[key] = value;
  }
  if (key === "hp" && typeof actor.hp === "number") {
    actor.hp = value;
  } else if (key === "stamina" && typeof actor.stamina === "number") {
    actor.stamina = value;
  } else if (key === "mana" && typeof actor.mana === "number") {
    actor.mana = value;
  }
  syncPrimaryMirror(actor, key, value);
}

function syncPrimaryMirror(actor, key, value) {
  if (!actor) return;
  if (actor.resources?.pools?.[key]) {
    actor.resources.pools[key].cur = value;
  }
  if (actor.res?.pools?.[key]) {
    actor.res.pools[key].cur = value;
  }
}

function clamp(value, min, max) {
  if (!Number.isFinite(min)) min = Number.NEGATIVE_INFINITY;
  if (!Number.isFinite(max)) max = Number.POSITIVE_INFINITY;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function canGrantOnKillHaste(actor, cfg) {
  if (!actor || !cfg) return false;
  const nowTurn = Number.isFinite(actor.turn) ? actor.turn : 0;
  const state = ensureHasteCtl(actor);
  if (cfg.oncePerTurn && state.lastTurn === nowTurn) return false;
  if (Number.isFinite(cfg.cooldownTurns)) {
    const cd = Math.max(0, Math.floor(cfg.cooldownTurns));
    if (nowTurn < state.nextReadyAt) return false;
    state.cooldown = cd;
  }
  return true;
}

function stampOnKillHasteICD(actor, cfg) {
  if (!actor || !cfg) return;
  const state = ensureHasteCtl(actor);
  const nowTurn = Number.isFinite(actor.turn) ? actor.turn : 0;
  state.lastTurn = nowTurn;
  if (Number.isFinite(cfg.cooldownTurns)) {
    const cd = Math.max(0, Math.floor(cfg.cooldownTurns));
    state.nextReadyAt = nowTurn + cd;
  }
}

function ensureHasteCtl(actor) {
  if (!actor._onKillHasteCtl || typeof actor._onKillHasteCtl !== "object") {
    actor._onKillHasteCtl = { lastTurn: -Infinity, nextReadyAt: -Infinity, cooldown: 0 };
  }
  return actor._onKillHasteCtl;
}

function cloneObject(obj) {
  if (!obj || typeof obj !== "object") return obj;
  return JSON.parse(JSON.stringify(obj));
}

function pickNumber(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return NaN;
}
