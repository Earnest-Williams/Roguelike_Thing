// src/combat/status-registry.js
// @ts-check

import {
  STATUS_BURN_BASE_DAMAGE,
  STATUS_BURN_MAX_STACKS,
  STATUS_HASTE_ACTION_SPEED_BONUS_PER_STACK,
  STATUS_SLOWED_ACTION_SPEED_PENALTY_PER_STACK,
  STATUS_SLOWED_MOVE_AP_DELTA,
  STATUS_STUNNED_ACTION_SPEED_PENALTY_PER_STACK,
} from "../config.js";
import { BLEED_STATUS_DEFINITION } from "../content/statuses.js";
import { registerStatus } from "./status.js";

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
  if (!actor || !Number.isFinite(amount) || amount <= 0) return;
  const resources = ensureResources(actor);
  const next = Math.max(0, (resources.hp ?? 0) - amount);
  resources.hp = next;
  if (actor.res) actor.res.hp = next;
  actor.hp = next;
}

registerStatus({
  id: "burn",
  stacking: "add",
  tickEvery: 1,
  duration: STATUS_BURN_MAX_STACKS,
  onTick(ctx) {
    const stacks = Math.max(1, ctx.stacks);
    loseHP(ctx.target, STATUS_BURN_BASE_DAMAGE + stacks);
  },
});

registerStatus({
  id: "poisoned",
  stacking: "add",
  tickEvery: 1,
  duration: STATUS_BURN_MAX_STACKS,
  onApply(ctx) {
    const potency = Math.max(1, ctx.potency || ctx.stacks);
    if (ctx.status) ctx.status.potency = potency;
  },
  onTick(ctx) {
    const potency = Math.max(1, ctx.status?.potency ?? ctx.stacks);
    loseHP(ctx.target, potency);
  },
});

registerStatus(BLEED_STATUS_DEFINITION);

registerStatus({
  id: "slowed",
  stacking: "max",
  duration: 3,
  derive(ctx, d) {
    const stacks = Math.max(1, ctx.stacks);
    d.temporal.actionSpeedPct = (d.temporal.actionSpeedPct || 0)
      + STATUS_SLOWED_ACTION_SPEED_PENALTY_PER_STACK * stacks;
    d.temporal.moveAPDelta = (d.temporal.moveAPDelta || 0) + STATUS_SLOWED_MOVE_AP_DELTA;
    return d;
  },
});

registerStatus({
  id: "stunned",
  stacking: "max",
  duration: 2,
  derive(ctx, d) {
    const stacks = Math.max(1, ctx.stacks);
    d.temporal.actionSpeedPct = (d.temporal.actionSpeedPct || 0)
      + STATUS_STUNNED_ACTION_SPEED_PENALTY_PER_STACK * stacks;
    return d;
  },
});

registerStatus({
  id: "haste_bonus",
  stacking: "refresh",
  duration: 4,
  derive(ctx, d) {
    const stacks = Math.max(1, ctx.stacks);
    d.temporal.actionSpeedPct = (d.temporal.actionSpeedPct || 0)
      - STATUS_HASTE_ACTION_SPEED_BONUS_PER_STACK * stacks;
    return d;
  },
});

registerStatus({
  id: "channeling",
  stacking: "refresh",
  duration: 1,
  derive() {
    return {};
  },
});

