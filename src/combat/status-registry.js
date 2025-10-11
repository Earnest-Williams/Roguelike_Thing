// src/combat/status-registry.js
// @ts-check

import { defineStatus } from "./status.js";

function ensureResources(actor) {
  if (!actor) return { hp: 0 };
  if (actor.resources && typeof actor.resources.hp === "number") return actor.resources;
  const hp = typeof actor?.res?.hp === "number"
    ? actor.res.hp
    : typeof actor?.hp === "number"
    ? actor.hp
    : 0;
  actor.resources = { ...(actor.resources || {}), hp };
  if (actor.res) actor.res.hp = hp;
  actor.hp = hp;
  return actor.resources;
}

function loseHP(actor, amount) {
  if (!actor || !Number.isFinite(amount) || amount <= 0) return;
  const resources = ensureResources(actor);
  const next = Math.max(0, (resources.hp ?? 0) - amount);
  resources.hp = next;
  if (actor.res) actor.res.hp = next;
  actor.hp = next;
}

// burn: tick HP
defineStatus({
  id: "burn",
  stacking: "add_stacks",
  maxStacks: 10,
  tickEvery: 1,
  onTick(actor, instance) {
    const stacks = Math.max(1, instance?.stacks ?? 1);
    loseHP(actor, 1 + stacks);
  },
});

// poisoned: steady HP loss per stack
defineStatus({
  id: "poisoned",
  stacking: "independent",
  maxStacks: Infinity,
  tickEvery: 1,
  onApply(_actor, instance) {
    const potency = Math.max(1, instance?.potency ?? instance?.stacks ?? 1);
    return { potency };
  },
  onTick(actor, instance) {
    const potency = Math.max(1, instance?.potency ?? instance?.stacks ?? 1);
    loseHP(actor, potency);
  },
});

// slowed: action speed + move AP
defineStatus({
  id: "slowed",
  stacking: "refresh",
  maxStacks: 1,
  derive(actor, instance) {
    const stacks = Math.max(1, instance?.stacks ?? 1);
    const sd = actor.statusDerived || (actor.statusDerived = {});
    sd.actionSpeedPct = (sd.actionSpeedPct || 0) + 0.1 * stacks;
    sd.moveAPDelta = (sd.moveAPDelta || 0) + 0.1;
  },
});

// stunned: hard stop via huge action cost
defineStatus({
  id: "stunned",
  stacking: "refresh",
  maxStacks: 1,
  derive(actor, instance) {
    const stacks = Math.max(1, instance?.stacks ?? 1);
    const sd = actor.statusDerived || (actor.statusDerived = {});
    sd.actionSpeedPct = (sd.actionSpeedPct || 0) + 1.0 * stacks;
  },
});

// haste: faster actions
defineStatus({
  id: "haste",
  stacking: "refresh",
  maxStacks: 1,
  derive(actor, instance) {
    const stacks = Math.max(1, instance?.stacks ?? 1);
    const sd = actor.statusDerived || (actor.statusDerived = {});
    sd.actionSpeedPct = (sd.actionSpeedPct || 0) - 0.15 * stacks;
  },
});
