// src/combat/status-registry.js
// @ts-check

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

function dealTypeDamage(actor, type, amount) {
  if (!actor || !Number.isFinite(amount) || amount <= 0) return;
  loseHP(actor, amount);
  if (actor.logs?.status) {
    actor.logs.status.push({ kind: "status_tick", type, amount });
  }
}

registerStatus({
  id: "burn",
  stacking: "add",
  tickEvery: 1,
  duration: 4,
  onTick(ctx) {
    dealTypeDamage(ctx.target, "fire", Math.max(1, ctx.stacks));
  },
});

registerStatus({
  id: "poisoned",
  stacking: "add",
  tickEvery: 1,
  duration: 6,
  onTick(ctx) {
    dealTypeDamage(ctx.target, "poison", Math.max(1, ctx.stacks));
  },
});

registerStatus(BLEED_STATUS_DEFINITION);

registerStatus({
  id: "slowed",
  stacking: "max",
  duration: 3,
  derive(ctx, d) {
    const stacks = Math.max(1, ctx.stacks);
    d.temporal.actionSpeedPct = (d.temporal.actionSpeedPct || 0) - 0.2 * stacks;
    d.temporal.moveAPDelta = (d.temporal.moveAPDelta || 0) + 2 * stacks;
    return d;
  },
});

registerStatus({
  id: "stunned",
  stacking: "max",
  duration: 2,
  derive(ctx, d) {
    const stacks = Math.max(1, ctx.stacks);
    d.temporal.actionSpeedPct = (d.temporal.actionSpeedPct || 0) - 0.5 * stacks;
    d.temporal.moveAPDelta = (d.temporal.moveAPDelta || 0) + 3 * stacks;
    return d;
  },
});

registerStatus({
  id: "haste",
  stacking: "refresh",
  duration: 2,
  derive(ctx, d) {
    const stacks = Math.max(1, ctx.stacks);
    d.temporal.actionSpeedPct = (d.temporal.actionSpeedPct || 0) + 0.2 * stacks;
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

