// src/combat/time.js
// @ts-check

import { BASE_AP_GAIN_PER_TURN } from "../../constants.js";
import { rand } from "./rng.js";

/**
 * Computes the final AP cost for an action, factoring in temporal/status modifiers.
 * @param {import("./actor.js").Actor} actor
 * @param {number} baseAP
 * @param {string[]} [tags]
 */
export function finalAPForAction(actor, baseAP, tags = []) {
  const tagList = Array.isArray(tags) ? tags : [];
  const temporal = actor?.modCache?.temporal || Object.create(null);
  const sd = actor?.statusDerived || { moveAPDelta: 0, actionSpeedPct: 0 };

  const base = Math.max(0, Math.floor(Number(baseAP) || 0));
  const moveDelta = (tagList.includes("move") ? Number(temporal.moveAPDelta || 0) : 0)
    + Number(sd.moveAPDelta || 0);
  const baseDelta = Number(temporal.baseActionAPDelta || 0);
  const baseMult = Number.isFinite(temporal.baseActionAPMult)
    ? temporal.baseActionAPMult
    : 1;
  const speedPct = Number(temporal.actionSpeedPct || 0) + Number(sd.actionSpeedPct || 0);

  const preCost = Math.max(1, base + moveDelta + baseDelta);
  const scaled = Math.max(1, Math.round(preCost * baseMult * (1 + speedPct)));

  return { costAP: scaled };
}

/**
 * Computes a cooldown in turns after temporal modifiers.
 * @param {import("./actor.js").Actor} actor
 * @param {number} baseCooldown
 */
export function finalCooldown(actor, baseCooldown, tags = []) {
  return computeCooldownTurns(actor, baseCooldown, tags);
}

/**
 * Initiative bonus from temporal payloads.
 * @param {import("./actor.js").Actor} actor
 * @param {number} baseInit
 */
export function initiativeWithTemporal(actor, baseInit) {
  const base = Math.floor(Number(baseInit) || 0);
  const temporalSource =
    actor?.temporal || actor?.modCache?.temporalHooks || Object.create(null);
  const temporalBonus = temporalSource.initBonus || 0;
  const sd = actor?.statusDerived || {};
  return base + temporalBonus + (sd.initBonus || sd.initiativeFlat || 0);
}

/**
 * AP accrual per turn, scaled by (1 / totalActionCostMult).
 * Faster actors (lower mult) earn more usable AP effectively.
 * @param {import("./actor.js").Actor} actor
 */
export function gainAP(actor) {
  if (!actor) return;
  const mult = actor.totalActionCostMult(); // lower = faster
  const gain = Math.round(BASE_AP_GAIN_PER_TURN / mult);
  actor.ap = Math.min(actor.apCap, actor.ap + gain);
}

/**
 * Computes AP cost for a given action type, factoring in temporal/status modifiers.
 * E.g., a standard action is actor.baseActionAP (100) before temporal/status deltas.
 * @param {import("./actor.js").Actor} actor
 * @param {number} baseCostAP
 */
/**
 * Computes AP cost for a given action type, factoring in temporal/status modifiers.
 * E.g., a standard action is actor.baseActionAP (100) before temporal/status deltas.
 * @param {import("./actor.js").Actor} actor
 * @param {number} baseAP
 * @param {{ includeMoveDelta?: boolean }} [opts]
 */
export function apCost(actor, baseAP, opts = {}) {
  const tags = [];
  if (opts.includeMoveDelta) tags.push("move");
  if (opts.includeCastDelta) tags.push("cast");
  return finalAPForAction(actor, baseAP, tags).costAP;
}

/**
 * Attempts to spend AP. Returns true on success.
 * @param {import("./actor.js").Actor} actor
 * @param {number} costAP
 */
export function spendAP(actor, costAP) {
  if (actor.ap < costAP) return false;
  actor.ap -= costAP;
  return true;
}

/**
 * Ticks cooldowns down by 1 turn / cooldownMult (slower if >1).
 * We model this by accumulating fractional progress.
 * @param {import("./actor.js").Actor} actor
 */
export function beginCooldown(actor, actionId, baseCooldown, tags = []) {
  startCooldown(actor, actionId, baseCooldown, tags);
}

export function tickCooldowns(actor) {
  if (!actor?.cooldowns) return;
  if (actor.cooldowns instanceof Map) {
    for (const [key, value] of [...actor.cooldowns.entries()]) {
      const current = Number(value);
      if (!Number.isFinite(current)) {
        actor.cooldowns.delete(key);
        continue;
      }
      const next = current - 1;
      if (next > 0) {
        actor.cooldowns.set(key, next);
      } else {
        actor.cooldowns.delete(key);
      }
    }
    return;
  }
  const store = actor.cooldowns;
  for (const key of Object.keys(store)) {
    const value = Number(store[key]);
    if (!Number.isFinite(value)) {
      delete store[key];
      continue;
    }
    const next = value - 1;
    if (next > 0) {
      store[key] = next;
    } else {
      delete store[key];
    }
  }
}

export function isOnCooldown(actor, actionId) {
  if (!actor?.cooldowns) return false;
  if (actor.cooldowns instanceof Map) {
    const value = actor.cooldowns.get(actionId);
    return Number.isFinite(value) && value > 0;
  }
  const value = actor.cooldowns[actionId];
  return Number.isFinite(value) && value > 0;
}

export function startCooldown(actor, key, baseTurns, tags = []) {
  if (!actor || !key) return 0;
  const turns = computeCooldownTurns(actor, baseTurns, tags);
  if (turns <= 0) {
    if (actor.cooldowns instanceof Map) {
      actor.cooldowns.delete(key);
    } else if (actor.cooldowns && typeof actor.cooldowns === "object") {
      delete actor.cooldowns[key];
    }
    return 0;
  }
  if (!(actor.cooldowns instanceof Map)) {
    const existing = actor.cooldowns && typeof actor.cooldowns === "object"
      ? Object.entries(actor.cooldowns)
      : [];
    actor.cooldowns = new Map(existing);
  }
  actor.cooldowns.set(key, turns);
  return turns;
}

export function isReady(actor, key) {
  return !isOnCooldown(actor, key);
}

function computeCooldownTurns(actor, baseTurns, tags = []) {
  const tagList = Array.isArray(tags) ? tags : [];
  const temporal = actor?.modCache?.temporal || Object.create(null);
  const sd = actor?.statusDerived || Object.create(null);
  const base = Math.max(0, Math.floor(Number(baseTurns) || 0));
  if (!base) return 0;

  const perTag = temporal.cooldownPerTag instanceof Map && tagList.length
    ? Math.min(
        ...tagList.map((tag) => {
          const value = temporal.cooldownPerTag.get(tag);
          return Number.isFinite(value) ? Number(value) : 1;
        }),
      )
    : 1;
  const temporalMult = Number.isFinite(temporal.cooldownMult) ? temporal.cooldownMult : 1;
  const sdMult = Number.isFinite(sd.cooldownMult) ? sd.cooldownMult : 1;
  const pctScalar = 1 + Number(temporal.cooldownPct || 0) + Number(sd.cooldownPct || 0);
  const total = base * temporalMult * sdMult * perTag * pctScalar;
  return Math.max(0, Math.round(total));
}

export function rollEchoOnce(attacker, ctx, resolveAttackFn) {
  if (!attacker || !ctx || ctx.isEcho) return null;
  const temporal = attacker.modCache?.temporal || Object.create(null);
  const echoCfg = temporal.echo;
  if (!echoCfg) return null;

  const chance = clampChance(echoCfg);
  if (chance <= 0) return null;
  const rngFn = typeof ctx.rng === "function" ? ctx.rng : randOrMathRandom;
  if (chance < 1 && !rollChance(rngFn, chance)) {
    return { triggered: false, chance, fraction: clampFraction(echoCfg) };
  }

  const fraction = clampFraction(echoCfg);
  if (fraction <= 0) return { triggered: false, chance, fraction };

  const echoCtx = buildEchoContext(ctx, echoCfg, fraction);
  if (!echoCtx) return { triggered: false, chance, fraction };

  echoCtx.attacker = attacker;
  const resolver = typeof resolveAttackFn === "function" ? resolveAttackFn : ctx?.resolveAttackFn;
  const result = resolver ? resolver(echoCtx) : null;
  return {
    triggered: true,
    fraction,
    chance,
    allowOnKill: getAllowOnKill(echoCfg),
    totalDamage: Number(result?.totalDamage || 0),
    result: result || null,
  };
}

function randOrMathRandom() {
  if (typeof rand === "function") return rand();
  return Math.random();
}

function rollChance(rngFn, chance) {
  const fn = typeof rngFn === "function" ? rngFn : randOrMathRandom;
  return fn() < chance;
}

function clampChance(cfg) {
  const raw = pickFirstNumber(
    cfg?.chancePct,
    cfg?.chance,
    cfg?.probability,
    cfg?.prob,
    cfg?.rate,
  );
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(1, raw));
}

function clampFraction(cfg) {
  const raw = pickFirstNumber(
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

function getAllowOnKill(cfg) {
  if (!cfg || cfg.allowOnKill === undefined || cfg.allowOnKill === null) return true;
  return Boolean(cfg.allowOnKill);
}

function buildEchoContext(ctx, echoCfg, fraction) {
  const basePackets = extractPacketsForEcho(ctx);
  const packets = scalePacketList(basePackets, fraction);
  if (!packets.length) return null;

  const statusAttempts = echoCfg.copyStatuses
    ? cloneStatusAttempts(ctx?.statusAttempts)
    : [];

  const damageScalarBase = Number.isFinite(ctx?.damageScalar)
    ? Math.max(0, Number(ctx.damageScalar))
    : 1;

  const scaledPacketTotal = sumPacketAmounts(packets);
  const basePacketTotal = sumPacketAmounts(basePackets);
  const postDefenseTotal = sumPacketTotals(ctx?.packetsAfterDefense);
  const desiredTotalDamage = Number.isFinite(postDefenseTotal) && postDefenseTotal > 0
    ? postDefenseTotal * fraction
    : basePacketTotal * damageScalarBase * fraction;

  let damageScalar = damageScalarBase;
  if (scaledPacketTotal > 0 && Number.isFinite(desiredTotalDamage)) {
    const targetScalar = desiredTotalDamage / scaledPacketTotal;
    if (Number.isFinite(targetScalar)) {
      damageScalar = Math.max(0, targetScalar);
    }
  }

  const echoCtx = {
    ...ctx,
    packets,
    statusAttempts,
    isEcho: true,
    allowOnKill: getAllowOnKill(echoCfg),
    damageScalar,
    skipOnHitStatuses: !echoCfg.copyStatuses,
  };

  if (!echoCfg.copyResourceCosts) {
    if ("resourceCosts" in echoCtx) delete echoCtx.resourceCosts;
  } else if (ctx?.resourceCosts && typeof ctx.resourceCosts === "object") {
    const scaledCosts = scaleResourceCosts(ctx.resourceCosts, fraction);
    if (scaledCosts) {
      echoCtx.resourceCosts = scaledCosts;
    } else if ("resourceCosts" in echoCtx) {
      delete echoCtx.resourceCosts;
    }
  }

  if ("packetsAfterDefense" in echoCtx) delete echoCtx.packetsAfterDefense;
  if ("totalDamage" in echoCtx) delete echoCtx.totalDamage;
  if ("appliedStatuses" in echoCtx) delete echoCtx.appliedStatuses;

  return echoCtx;
}

function extractPacketsForEcho(ctx) {
  if (Array.isArray(ctx?.packets) && ctx.packets.length) {
    return ctx.packets.map((p) => ({ ...p }));
  }
  const pad = ctx?.packetsAfterDefense;
  if (pad && typeof pad === "object") {
    return Object.entries(pad)
      .filter(([, amt]) => Number.isFinite(amt) && amt > 0)
      .map(([type, amount]) => ({ type, amount }));
  }
  return [];
}

function scalePacketList(packets, fraction) {
  return packets.map((p) => ({ ...p, amount: p.amount * fraction }));
}

function sumPacketAmounts(packets) {
  return packets.reduce((acc, pkt) => acc + (Number(pkt.amount) || 0), 0);
}

function sumPacketTotals(map) {
  if (!map || typeof map !== "object") return 0;
  let total = 0;
  for (const value of Object.values(map)) {
    const num = Number(value);
    if (Number.isFinite(num)) total += num;
  }
  return total;
}

function cloneStatusAttempts(attempts) {
  if (!Array.isArray(attempts)) return [];
  return attempts.map((attempt) => (attempt ? { ...attempt } : attempt));
}

function scaleResourceCosts(costs, fraction) {
  if (!costs || typeof costs !== "object") return null;
  const out = {};
  for (const [key, value] of Object.entries(costs)) {
    const num = Number(value);
    if (!Number.isFinite(num)) continue;
    out[key] = num * fraction;
  }
  return Object.keys(out).length ? out : null;
}

function pickFirstNumber(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return NaN;
}
