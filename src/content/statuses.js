// src/content/statuses.js
// Canonical status definitions shared across runtime environments.

import { STATUS_BLEED_DAMAGE_PER_STACK, STATUS_BLEED_DURATION_TURNS } from "../config.js";

let damageAdapter = null;

/**
 * Provide a custom handler for status damage (e.g. to integrate with resolveAttack).
 * @param {(payload: { statusId: string, target: any, amount: number, type: string, turn: number }) => any} fn
 */
export function setStatusDamageAdapter(fn) {
  damageAdapter = typeof fn === "function" ? fn : null;
}

function ensureResources(actor) {
  if (!actor) return { hp: 0 };
  if (actor.resources && typeof actor.resources.hp === "number") return actor.resources;
  const hp = Number.isFinite(actor?.res?.hp)
    ? actor.res.hp
    : Number.isFinite(actor?.hp)
    ? actor.hp
    : 0;
  const bucket = { ...(actor.resources || {}), hp };
  actor.resources = bucket;
  if (actor.res) actor.res.hp = hp;
  actor.hp = hp;
  return bucket;
}

function loseHP(actor, amount) {
  if (!actor || !Number.isFinite(amount) || amount <= 0) return 0;
  const resources = ensureResources(actor);
  const next = Math.max(0, (resources.hp ?? 0) - amount);
  resources.hp = next;
  if (actor.res) actor.res.hp = next;
  actor.hp = next;
  return amount;
}

/**
 * Apply damage on behalf of a status tick, respecting any configured adapter.
 * @param {{ statusId: string, target: any, amount: number, type?: string, turn?: number }} payload
 */
export function applyStatusDamage(payload) {
  const amount = Math.max(0, Math.floor(Number(payload?.amount) || 0));
  if (!payload?.target || amount <= 0) return 0;
  const normalized = {
    statusId: String(payload.statusId || ""),
    target: payload.target,
    amount,
    type: typeof payload.type === "string" && payload.type ? payload.type : "physical",
    turn: Number.isFinite(payload.turn) ? Number(payload.turn) : 0,
  };
  if (damageAdapter) {
    return damageAdapter(normalized) ?? 0;
  }
  return loseHP(normalized.target, normalized.amount);
}

function logStatusTick(target, id, payload) {
  if (!target) return;
  target.__log?.statusTick?.(id, payload);
  if (target.logs?.status && Array.isArray(target.logs.status)) {
    target.logs.status.push({ kind: "status_tick", id, ...payload });
  }
}

export const BLEED_STATUS_DEFINITION = {
  id: "bleed",
  label: "Bleeding",
  harmful: true,
  stacking: "add",
  tickEvery: 1,
  duration: STATUS_BLEED_DURATION_TURNS,
  onTick(ctx) {
    const stacks = Math.max(1, ctx.stacks ?? 1);
    const damage = stacks * STATUS_BLEED_DAMAGE_PER_STACK;
    const dealt = applyStatusDamage({ statusId: "bleed", target: ctx.target, amount: damage, type: "physical", turn: ctx.turn });
    logStatusTick(ctx.target, "bleed", { stacks, damage: dealt });
  },
};

const CORE_STATUS_DEFINITIONS = [
  {
    id: "burn",
    label: "Burning",
    harmful: true,
    stacking: "add",
    maxStacks: 5,
    tickEvery: 1,
    duration: 4,
    onTick: ({ target, stacks = 1, turn }) => {
      const dot = 1 + stacks;
      const dealt = applyStatusDamage({ statusId: "burn", target, amount: dot, type: "fire", turn });
      logStatusTick(target, "burn", { dot, stacks, dealt });
    },
    derive: () => ({
      damageTakenMult: { cold: -0.1, fire: 0.25 },
    }),
  },
  {
    id: "burning",
    label: "Burning",
    harmful: true,
    stacking: "add",
    tickEvery: 1,
    duration: 3,
    onTick: ({ target, potency = 1, stacks = 1, turn }) => {
      const amount = Math.max(1, Math.floor(potency ?? stacks ?? 1));
      const dealt = applyStatusDamage({ statusId: "burning", target, amount, type: "fire", turn });
      logStatusTick(target, "burning", { amount: dealt, stacks, potency });
    },
  },
  {
    id: "poisoned",
    label: "Poisoned",
    harmful: true,
    stacking: "independent",
    tickEvery: 1,
    duration: 6,
    onTick: ({ target, potency = 1, turn }) => {
      const dot = Math.ceil(1.5 * potency);
      const dealt = applyStatusDamage({ statusId: "poisoned", target, amount: dot, type: "poison", turn });
      logStatusTick(target, "poisoned", { dot, potency, dealt });
    },
    onApply: () => ({ potency: 1 }),
  },
  {
    id: "slowed",
    label: "Slowed",
    harmful: true,
    stacking: "refresh",
    duration: 3,
    derive: ({ stacks = 1 }) => ({
      actionSpeedPct: 0.1 * stacks,
      moveAPDelta: 0.1,
    }),
  },
  {
    id: "stunned",
    label: "Stunned",
    harmful: true,
    stacking: "refresh",
    duration: 2,
    derive: () => ({ canAct: false }),
  },
  {
    id: "haste",
    label: "Haste",
    harmful: false,
    stacking: "refresh",
    duration: 2,
    derive: ({ stacks = 1 }) => ({ actionSpeedPct: 0.15 * stacks }),
  },
  {
    id: "channeling",
    label: "Channeling",
    harmful: false,
    stacking: "refresh",
    duration: 1,
    derive: () => ({}),
  },
];

export const EXTRA_STATUSES = {
  chilled: {
    id: "chilled",
    stacking: "max",
    tickEvery: 0,
    duration: 3,
    derive(ctx, d) {
      d.temporal.actionSpeedPct = (d.temporal.actionSpeedPct || 0) - 0.15 * (ctx.stacks ?? 1);
      return d;
    },
  },
  bleed: BLEED_STATUS_DEFINITION,
};

function dedupeStatusList(list) {
  const byId = new Map();
  for (const def of list) {
    if (!def || typeof def !== "object") continue;
    if (!def.id) continue;
    byId.set(def.id, def);
  }
  return Array.from(byId.values());
}

export const STATUS_DEFINITIONS = dedupeStatusList([
  ...CORE_STATUS_DEFINITIONS,
  BLEED_STATUS_DEFINITION,
  ...Object.values(EXTRA_STATUSES || {}),
]);


