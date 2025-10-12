// src/content/statuses.js
// Additional status definitions layered on top of the base registry.

import { STATUS_BLEED_DAMAGE_PER_STACK, STATUS_BLEED_DURATION_TURNS } from "../config.js";

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

export const BLEED_STATUS_DEFINITION = {
  id: "bleed",
  stacking: "add",
  tickEvery: 1,
  duration: STATUS_BLEED_DURATION_TURNS,
  onTick(ctx) {
    const stacks = Math.max(1, ctx.stacks);
    const damage = stacks * STATUS_BLEED_DAMAGE_PER_STACK;
    loseHP(ctx.target, damage);
  },
};

export const EXTRA_STATUSES = {
  chilled: {
    id: "chilled",
    stacking: "max",
    tickEvery: 0,
    duration: 3,
    derive(ctx, d) {
      d.temporal.actionSpeedPct = (d.temporal.actionSpeedPct || 0) - 0.15 * ctx.stacks;
      return d;
    },
  },
  bleed: BLEED_STATUS_DEFINITION,
};

