// src/combat/status.registry.js
// @ts-check

import {
  ADRENALINE_ACTION_COST_MULTIPLIER,
  ADRENALINE_COOLDOWN_MULTIPLIER,
  ADRENALINE_MAX_STACKS,
  ADRENALINE_STAMINA_REGEN_PER_TURN,
  BURN_MAX_STACKS,
  BURN_TICK_DAMAGE_PER_STACK,
  CHILLED_FACTOR_PER_STACK,
  CHILLED_MAX_STACKS,
  EXHAUSTED_ACTION_COST_MULTIPLIER,
  EXHAUSTED_MAX_STACKS,
  EXHAUSTED_STAMINA_REGEN_PER_TURN,
  FATIGUE_ACTION_COST_MULTIPLIER_PER_STACK,
  FATIGUE_MAX_STACKS,
  HASTE_COOLDOWN_MULTIPLIER,
  HASTE_MAX_STACKS,
  HASTE_SPEED_MULTIPLIER_PER_STACK,
  HEALTH_FLOOR,
  REGENERATION_HP_PER_TURN,
  REGENERATION_MAX_STACKS,
} from "../../constants.js";
import { defineStatus } from "./status.js";

function resourcesOf(actor) {
  if (!actor) return null;
  if (actor.resources) return actor.resources;
  if (actor.res) {
    actor.resources = actor.res;
    return actor.res;
  }
  const hp = typeof actor.hp === "number" ? actor.hp : 0;
  const res = { hp };
  actor.resources = res;
  actor.res = res;
  return res;
}

function loseHP(actor, amount) {
  if (!actor || !Number.isFinite(amount) || amount <= 0) return;
  const res = resourcesOf(actor);
  if (!res) return;
  const next = Math.max(HEALTH_FLOOR, (res.hp ?? 0) - amount);
  res.hp = next;
  if (actor.res && actor.res !== res) actor.res.hp = next;
  if (actor.resources && actor.resources !== res) actor.resources.hp = next;
  actor.hp = next;
}

// Burn: stacking damage-over-time
defineStatus({
  id: "burn",
  stacking: "add_stacks",
  maxStacks: BURN_MAX_STACKS,
  tickEvery: 1,
  onTick(actor, instance) {
    const stacks = Math.max(1, instance?.stacks ?? 1);
    const dmg = Math.max(1, BURN_TICK_DAMAGE_PER_STACK * stacks);
    loseHP(actor, dmg);
  },
});

// Poisoned: independent instances with potency stored on apply
defineStatus({
  id: "poisoned",
  stacking: "independent",
  tickEvery: 1,
  onApply(actor, instance) {
    const potency = Math.max(1, instance?.potency ?? instance?.stacks ?? 1);
    return { potency };
  },
  onTick(actor, instance) {
    const potency = Math.max(1, instance?.potency ?? 1);
    loseHP(actor, potency);
  },
});

// Slowed: refresh, increases action speed and movement cost
defineStatus({
  id: "slowed",
  stacking: "refresh",
  maxStacks: 1,
  derive(actor, instance) {
    const stacks = Math.max(1, instance?.stacks ?? 1);
    const sd = actor.statusDerived;
    sd.actionSpeedPct += 0.10 * stacks;
    sd.moveAPDelta += 0.1 * stacks;
  },
});

// Stunned: refresh, extremely slow actions
defineStatus({
  id: "stunned",
  stacking: "refresh",
  maxStacks: 1,
  derive(actor, instance) {
    const stacks = Math.max(1, instance?.stacks ?? 1);
    actor.statusDerived.actionSpeedPct += 1.0 * stacks;
  },
});

// Haste: refresh, faster actions and cooldowns
defineStatus({
  id: "haste",
  stacking: "refresh",
  maxStacks: HASTE_MAX_STACKS,
  derive(actor, instance) {
    const stacks = Math.max(1, instance?.stacks ?? 1);
    const sd = actor.statusDerived;
    const speedDelta = HASTE_SPEED_MULTIPLIER_PER_STACK - 1;
    sd.actionSpeedPct += speedDelta * stacks;
    sd.cooldownMult *= Math.pow(HASTE_COOLDOWN_MULTIPLIER, stacks);
  },
});

// Adrenaline: faster actions/cooldowns and stamina regen boost
defineStatus({
  id: "adrenaline",
  stacking: "refresh",
  maxStacks: ADRENALINE_MAX_STACKS,
  derive(actor, instance) {
    const stacks = Math.max(1, instance?.stacks ?? 1);
    const sd = actor.statusDerived;
    const speedDelta = ADRENALINE_ACTION_COST_MULTIPLIER - 1;
    sd.actionSpeedPct += speedDelta * stacks;
    sd.cooldownMult *= Math.pow(ADRENALINE_COOLDOWN_MULTIPLIER, stacks);
    sd.regenFlat.stamina += ADRENALINE_STAMINA_REGEN_PER_TURN * stacks;
  },
});

// Fatigue: stacking slow
defineStatus({
  id: "fatigue",
  stacking: "add_stacks",
  maxStacks: FATIGUE_MAX_STACKS,
  derive(actor, instance) {
    const stacks = Math.max(1, instance?.stacks ?? 1);
    actor.statusDerived.actionSpeedPct += (FATIGUE_ACTION_COST_MULTIPLIER_PER_STACK - 1) * stacks;
  },
});

// Chilled: stacking slow that also lengthens cooldowns
defineStatus({
  id: "chilled",
  stacking: "add_stacks",
  maxStacks: CHILLED_MAX_STACKS,
  derive(actor, instance) {
    const stacks = Math.max(1, instance?.stacks ?? 1);
    const sd = actor.statusDerived;
    sd.actionSpeedPct += (CHILLED_FACTOR_PER_STACK - 1) * stacks;
    sd.cooldownMult *= Math.pow(CHILLED_FACTOR_PER_STACK, stacks);
  },
});

// Regeneration: heal per turn
defineStatus({
  id: "regeneration",
  stacking: "refresh",
  maxStacks: REGENERATION_MAX_STACKS,
  derive(actor, instance) {
    const stacks = Math.max(1, instance?.stacks ?? 1);
    actor.statusDerived.regenFlat.hp += REGENERATION_HP_PER_TURN * stacks;
  },
});

// Exhausted: slower actions and reduced stamina regen
defineStatus({
  id: "exhausted",
  stacking: "refresh",
  maxStacks: EXHAUSTED_MAX_STACKS,
  derive(actor, instance) {
    const stacks = Math.max(1, instance?.stacks ?? 1);
    const sd = actor.statusDerived;
    sd.actionSpeedPct += (EXHAUSTED_ACTION_COST_MULTIPLIER - 1) * stacks;
    sd.regenFlat.stamina += EXHAUSTED_STAMINA_REGEN_PER_TURN * stacks;
  },
});
