// src/combat/time.js
// @ts-check

import { BASE_AP_GAIN_PER_TURN } from "../../constants.js";
import { rand } from "./rng.js";

/**
 * Computes the final AP cost (and potential refund) for an action.
 * @param {import("./actor.js").Actor} actor
 * @param {number} baseAP
 * @param {string[]} [tags]
 */
export function finalAPForAction(actor, baseAP, tags = []) {
  const tagList = Array.isArray(tags) ? tags : [];
  const status = actor?.statusDerived || { moveAPDelta: 0, actionSpeedPct: 0 };
  const mcTemporal = actor?.modCache?.temporal || {};
  const temporal = actor?.temporal ? { ...actor.temporal, ...mcTemporal } : mcTemporal;

  const moveDelta =
    (tagList.includes("move") ? Number(temporal.moveAPDelta || 0) : 0) + Number(status.moveAPDelta || 0);
  const baseDelta = Number(temporal.baseActionAPDelta || 0);
  const baseMult = Number.isFinite(temporal.baseActionAPMult) ? temporal.baseActionAPMult : 1;
  const speedPct = Number(temporal.actionSpeedPct || 0) + Number(status.actionSpeedPct || 0);
  const speedScalar = Math.max(0.1, 1 + speedPct);

  const base = Math.max(1, Math.floor(Number(baseAP) || 0) + moveDelta + baseDelta);
  const scaled = Math.max(1, Math.round(base * baseMult * speedScalar));

  return { costAP: scaled };
}

/**
 * Computes a cooldown in turns after temporal modifiers.
 * @param {import("./actor.js").Actor} actor
 * @param {number} baseCooldown
 */
export function finalCooldown(actor, baseCooldown) {
  const base = Math.max(0, Math.floor(Number(baseCooldown) || 0));
  const mcTemporal = actor?.modCache?.temporal || Object.create(null);
  const temporalSource = actor?.temporal ? { ...actor.temporal, ...mcTemporal } : mcTemporal;
  const temporalPct = Number(temporalSource.cooldownPct || 0);
  const sd = actor?.statusDerived || {};
  const scalarPct = 1 + temporalPct + Number(sd.cooldownPct || 0);
  const scalarMult = Number.isFinite(sd.cooldownMult) ? sd.cooldownMult : 1;
  const scalar = Math.max(0, scalarPct) * Math.max(0, scalarMult);
  return Math.max(0, Math.ceil(base * scalar));
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
export function beginCooldown(actor, actionId, baseCooldown) {
  if (!actor || !actionId) return;
  const turns = finalCooldown(actor, baseCooldown);
  if (turns <= 0) {
    if (actor.cooldowns instanceof Map) {
      actor.cooldowns.delete(actionId);
    } else if (actor.cooldowns && typeof actor.cooldowns === "object") {
      delete actor.cooldowns[actionId];
    }
    return;
  }
  if (!(actor.cooldowns instanceof Map)) {
    actor.cooldowns = new Map();
  }
  actor.cooldowns.set(actionId, Math.max(0, Math.floor(turns)));
}

export function tickCooldowns(actor) {
  if (!actor?.cooldowns) return;
  if (actor.cooldowns instanceof Map) {
    for (const [key, value] of actor.cooldowns.entries()) {
      const num = Number(value);
      if (!Number.isFinite(num)) {
        actor.cooldowns.delete(key);
        continue;
      }
      const next = num - 1;
      if (next > 0) {
        actor.cooldowns.set(key, next);
      } else {
        actor.cooldowns.delete(key);
      }
    }
    return;
  }
  const keys = Object.keys(actor.cooldowns);
  for (const key of keys) {
    const value = Number(actor.cooldowns[key]);
    if (!Number.isFinite(value)) {
      delete actor.cooldowns[key];
      continue;
    }
    const next = value - 1;
    if (next > 0) {
      actor.cooldowns[key] = next;
    } else {
      delete actor.cooldowns[key];
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

export function startCooldown(actor, actionId, baseTurns, tags = []) {
  if (!actor || !actionId) return 0;
  const mcTemporal = actor.modCache?.temporal || {};
  const temporal = actor.temporal ? { ...actor.temporal, ...mcTemporal } : mcTemporal;
  const perTag =
    Array.isArray(tags) && tags.length && temporal.cooldownPerTag instanceof Map
      ? Math.min(
          ...tags.map((tag) => {
            const entry = temporal.cooldownPerTag.get(tag);
            return Number.isFinite(entry) ? Number(entry) : 1;
          }),
        )
      : 1;
  const mult = Number(temporal.cooldownMult || 1) * Number(perTag || 1);
  const cd = Math.max(0, Math.round(Number(baseTurns || 0) * mult));
  actor.cooldowns ||= new Map();
  actor.cooldowns.set(actionId, cd);
  return cd;
}

export function isReady(actor, key) {
  return !isOnCooldown(actor, key);
}

export function rollEchoOnce(attacker, ctx, resolveAttackFn) {
  if (!attacker || !ctx) return null;
  const mcTemporal = attacker.modCache?.temporal || {};
  const temporal = attacker.temporal ? { ...attacker.temporal, ...mcTemporal } : mcTemporal;
  const echoCfg = temporal.echo;
  if (!echoCfg || ctx.isEcho) return null;
  const chance = clampChance(echoCfg);
  const rng = typeof ctx.rng === "function" ? ctx.rng : randOrMathRandom;
  if (!(chance >= 1 || (chance > 0 && rng() < chance))) return null;
  const fraction = clampFraction(echoCfg);
  if (fraction <= 0) return null;
  const echoCtx = buildEchoContext(ctx, echoCfg, fraction);
  if (!echoCtx) return null;
  const resolveFn = typeof resolveAttackFn === "function"
    ? resolveAttackFn
    : typeof ctx.resolveAttack === "function"
    ? ctx.resolveAttack
    : typeof ctx.resolveFn === "function"
    ? ctx.resolveFn
    : null;
  const result = resolveFn ? resolveFn(echoCtx) : null;
  return {
    triggered: true,
    fraction,
    chance,
    allowOnKill: getAllowOnKill(echoCfg),
    totalDamage: Number(result?.totalDamage || 0),
    result,
  };
}

function randOrMathRandom() {
  if (typeof rand === "function") return rand();
  return Math.random();
}

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

function buildEchoContext(ctx, echoCfg, fraction) {
  const packets = scalePacketList(extractPacketsForEcho(ctx), fraction);
  if (!packets.length) return null;
  const statusAttempts = echoCfg.copyStatuses ? cloneStatusAttempts(ctx?.statusAttempts) : [];
  const damageScalarBase = Number.isFinite(ctx?.damageScalar)
    ? Math.max(0, Number(ctx.damageScalar))
    : 1;
  const scaledPacketTotal = sumPacketAmounts(packets);
  const basePacketTotal = sumPacketAmounts(extractPacketsForEcho({ packets: ctx.packets }));
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
    damageScalar,
    skipOnHitStatuses: !echoCfg.copyStatuses,
  };
  if (!echoCfg.copyResourceCosts) {
    if ("resourceCosts" in echoCtx) delete echoCtx.resourceCosts;
  } else if (ctx?.resourceCosts && typeof ctx.resourceCosts === "object") {
    const scaledCosts = scaleResourceCosts(ctx.resourceCosts, fraction);
    if (scaledCosts) {
      echoCtx.resourceCosts = scaledCosts;
    }
  }
  delete echoCtx.packetsAfterDefense;
  delete echoCtx.totalDamage;
  delete echoCtx.appliedStatuses;
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
  if (!Array.isArray(packets) || !packets.length) return [];
  const f = Math.max(0, Math.min(1, fraction || 0));
  if (f === 0) return [];
  const out = [];
  for (const pkt of packets) {
    if (!pkt || typeof pkt !== "object") continue;
    const amount = Number(pkt.amount);
    if (!Number.isFinite(amount)) continue;
    const scaled = roundDamage(amount * f);
    if (scaled <= 0) continue;
    out.push({ ...pkt, amount: scaled });
  }
  return out;
}

function sumPacketAmounts(packets) {
  if (!Array.isArray(packets) || !packets.length) return 0;
  let total = 0;
  for (const pkt of packets) {
    const amount = Number(pkt?.amount);
    if (Number.isFinite(amount) && amount > 0) total += amount;
  }
  return total;
}

function sumPacketTotals(totals) {
  if (!totals || typeof totals !== "object") return 0;
  let total = 0;
  for (const value of Object.values(totals)) {
    const amount = Number(value);
    if (Number.isFinite(amount) && amount > 0) total += amount;
  }
  return total;
}

function cloneStatusAttempts(attempts) {
  if (!attempts) return [];
  if (Array.isArray(attempts)) {
    return attempts
      .map((attempt) => (attempt && typeof attempt === "object" ? { ...attempt } : null))
      .filter(Boolean);
  }
  if (typeof attempts === "object") {
    return [{ ...attempts }];
  }
  return [];
}

function scaleResourceCosts(costs, fraction) {
  if (!costs || typeof costs !== "object") return null;
  const clone = cloneObject(costs);
  if (!clone || typeof clone !== "object") return null;
  applyResourceCostScale(clone, Math.max(0, Math.min(1, fraction || 0)));
  return clone;
}

function applyResourceCostScale(node, fraction) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      const value = node[i];
      if (typeof value === "number" && Number.isFinite(value)) {
        node[i] = roundNumber(value * fraction);
      } else if (value && typeof value === "object") {
        applyResourceCostScale(value, fraction);
      }
    }
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      node[key] = roundNumber(value * fraction);
      continue;
    }
    if (value && typeof value === "object") {
      applyResourceCostScale(value, fraction);
    }
  }
}

function roundDamage(value) {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value);
  return rounded > 0 ? rounded : 0;
}

function roundNumber(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

function cloneObject(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(obj);
    } catch (err) {
      // ignore
    }
  }
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (err) {
    return obj;
  }
}

function getAllowOnKill(cfg) {
  if (!cfg || cfg.allowOnKill === undefined || cfg.allowOnKill === null) return true;
  return Boolean(cfg.allowOnKill);
}

function pickNumber(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return NaN;
}
