// src/combat/attunement.js
// @ts-check

/**
 * @typedef {Object} AttuneRule
 * @property {number} [onUseGain]
 * @property {number} [decayPerTurn]
 * @property {number} [maxStacks]
 * @property {{ damagePct?: number, resistPct?: number, accuracyFlat?: number }} [perStack]
 */

/**
 * @typedef {{ rules: Record<string, AttuneRule>, stacks: Record<string, number> }} AttunementState
 */

function logAttunementEvent(actor, entry) {
  actor?.log?.push?.(entry);
  actor?.logs?.attack?.push?.(entry);
}

/**
 * Ensure .attunement exists and points to current rules.
 * @param {any} actor
 */
export function ensureAttunement(actor) {
  if (!actor) return;
  if (!actor.attunement) {
    actor.attunement = { rules: Object.create(null), stacks: Object.create(null) };
  }
  const cacheRules = actor.modCache?.attunementRules;
  if (cacheRules) {
    actor.attunement.rules = cacheRules;
  } else if (!actor.attunement.rules) {
    actor.attunement.rules = Object.create(null);
  }
  if (!actor.attunement.stacks) {
    actor.attunement.stacks = Object.create(null);
  }
}

/**
 * Fetch the current attunement stacks for a given damage type.
 * @param {import("./actor.js").Actor|{attunement?: {stacks?: Record<string, number>}}} actor
 * @param {string} type
 */
export function getStacks(actor, type) {
  if (!actor || typeof type !== "string") return 0;
  ensureAttunement(actor);
  const value = actor.attunement?.stacks?.[type];
  return Number.isFinite(value) ? Number(value) : 0;
}

/**
 * Mutate an actor's attunement stacks for a given type.
 * @param {import("./actor.js").Actor|{attunement?: {stacks?: Record<string, number>}}} actor
 * @param {string} type
 * @param {number} value
 */
export function setStacks(actor, type, value) {
  if (!actor || typeof type !== "string") return;
  ensureAttunement(actor);
  const stacks = actor.attunement.stacks;
  const next = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  if (next <= 0) {
    delete stacks[type];
    return;
  }
  stacks[type] = next;
}

/**
 * Resolve the attunement rule for a specific type on an actor.
 * @param {import("./actor.js").Actor|{attunement?: {rules?: Record<string, any>}}} actor
 * @param {string} type
 */
export function ruleFor(actor, type) {
  if (!actor || typeof type !== "string") return undefined;
  ensureAttunement(actor);
  return actor.attunement?.rules?.[type];
}

/**
 * Gain stacks for a specific damage type.
 * @param {any} actor
 * @param {string} type
 * @param {number} [amount]
 */
export function gainAttunement(actor, type, amount) {
  if (!actor || typeof type !== "string") return;
  ensureAttunement(actor);
  const rule = actor.attunement.rules?.[type];
  if (!rule) return;
  const incRaw = Number.isFinite(amount) ? Number(amount) : Number(rule.onUseGain ?? 1);
  const inc = Math.max(0, incRaw);
  if (!inc) return;
  const cur = Number(actor.attunement.stacks[type] || 0);
  const max = Number(rule.maxStacks ?? 0);
  const cap = max > 0 ? max : Number.POSITIVE_INFINITY;
  const next = Math.min(cap, cur + inc);
  if (next === cur) return;
  actor.attunement.stacks[type] = next;
  logAttunementEvent(actor, { kind: "attune_gain", type, stacks: next });
}

/**
 * Decay stacks for all types at turn start.
 * @param {any} actor
 * @param {number} [nTurns]
 */
export function tickAttunements(actor, nTurns = 1) {
  ensureAttunement(actor);
  const stacks = actor.attunement?.stacks;
  const rules = actor.attunement?.rules;
  if (!stacks || !rules) return;

  const turns = Number(nTurns);
  if (!Number.isFinite(turns) || turns <= 0) return;

  for (const [type, value] of Object.entries(stacks)) {
    const rule = rules[type];
    if (!rule) continue;

    const currentRaw = Number(value);
    if (!Number.isFinite(currentRaw) || currentRaw <= 0) {
      delete stacks[type];
      continue;
    }

    const decayRaw = Number(rule.decayPerTurn);
    const decayPerTurn = Number.isFinite(decayRaw) && decayRaw >= 0 ? decayRaw : 0;
    const decayTotal = decayPerTurn * turns;
    const next = Math.max(0, Math.floor(currentRaw - decayTotal));
    if (next <= 0) {
      delete stacks[type];
    } else {
      stacks[type] = next;
    }
  }
}

export function decayAttunements(actor, nTurns) {
  tickAttunements(actor, nTurns);
}

export const decayPerTurn = tickAttunements;

/**
 * Apply outgoing attunement scaling to packets before defenses.
 * @param {{ packets: Array<{type: string, amount: number}>, attacker: any, target: any }} ctx
 */
export function applyOutgoingScaling(arg0, arg1) {
  const ctx = arg1 === undefined ? arg0 : arg1;
  const attacker = arg1 === undefined ? ctx?.attacker : arg0;
  if (!ctx || !attacker || ctx.__attunementScaled) return;

  ensureAttunement(attacker);
  if (!attacker.attunement?.rules) return;

  const packets = Array.isArray(ctx.packets) ? ctx.packets : null;
  const totals = ctx.packetsAfterDefense && typeof ctx.packetsAfterDefense === "object"
    ? ctx.packetsAfterDefense
    : null;

  const applied = [];
  const scaleByType = new Map();
  const stacksByType = new Map();

  if (packets && packets.length) {
    for (const packet of packets) {
      if (!packet || typeof packet.type !== "string") continue;
      const baseAmount = Number(packet.amount);
      if (!Number.isFinite(baseAmount) || baseAmount <= 0) continue;
      const rule = ruleFor(attacker, packet.type);
      if (!rule) continue;
      const stacks = getStacks(attacker, packet.type);
      if (!stacks) continue;
      const dmgPct = rule.perStack?.damagePct || 0;
      if (!dmgPct) continue;
      const scale = 1 + dmgPct * stacks;
      if (scale === 1) continue;
      packet.amount = Math.max(0, baseAmount * scale);
      scaleByType.set(packet.type, scale);
      stacksByType.set(packet.type, stacks);
      applied.push({ type: packet.type, stacks, amount: packet.amount });
    }
  }

  let totalDamage = Number(ctx.totalDamage || 0);
  if (totals) {
    totalDamage = 0;
    for (const [type, value] of Object.entries(totals)) {
      const baseAmount = Number(value);
      if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
        totals[type] = 0;
        continue;
      }
      let scale = scaleByType.get(type);
      if (scale === undefined) {
        const rule = ruleFor(attacker, type);
        if (!rule) {
          scale = 1;
        } else {
          const stacks = getStacks(attacker, type);
          const dmgPct = rule.perStack?.damagePct || 0;
          scale = stacks ? 1 + dmgPct * stacks : 1;
          if (stacks) stacksByType.set(type, stacks);
        }
        scaleByType.set(type, scale);
      }
      const scaledAmount = Math.max(0, Math.floor(baseAmount * scale));
      totals[type] = scaledAmount;
      totalDamage += scaledAmount;
      if (scale !== 1) {
        const stacks = stacksByType.get(type) || getStacks(attacker, type) || 0;
        applied.push({ type, stacks, amount: scaledAmount });
      }
    }
    ctx.totalDamage = totalDamage;
  }

  if (applied.length) {
    attacker.log?.push?.({ kind: "attune_apply", packets: applied });
    attacker.logs?.attack?.push?.({ kind: "attune_apply", packets: applied });
  }

  ctx.__attunementScaled = true;
}

/**
 * Register attunement gains for types that successfully dealt damage.
 * @param {any} attacker
 * @param {Set<string>|string|string[]|Record<string, number>} usedTypes
 */
export function noteUseGain(attacker, usedTypes) {
  if (!attacker || usedTypes === null || usedTypes === undefined) return;
  const grant = (type) => {
    if (typeof type !== "string" || !type) return;
    gainAttunement(attacker, type);
  };

  if (typeof usedTypes === "string") {
    grant(usedTypes);
    return;
  }

  if (usedTypes instanceof Set) {
    for (const type of usedTypes) {
      grant(type);
    }
    return;
  }

  if (Array.isArray(usedTypes)) {
    for (const type of usedTypes) {
      grant(type);
    }
    return;
  }

  if (typeof usedTypes === "object") {
    for (const [type, value] of Object.entries(usedTypes)) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        if (numeric > 0) grant(type);
        continue;
      }
      if (value) grant(type);
    }
  }
}

/**
 * Allow attunement stacks to contribute passive derived bonuses (resists, accuracy, etc.).
 * @param {any} actor
 * @param {any} derived
 */
export function contributeDerived(actor, derived) {
  if (!actor || !derived) return derived;
  ensureAttunement(actor);
  const stacks = actor.attunement?.stacks;
  if (!stacks) return derived;

  for (const [type, count] of Object.entries(stacks)) {
    const stackCount = count | 0;
    if (!stackCount) continue;
    const rule = ruleFor(actor, type);
    if (!rule) continue;
    const perStack = rule.perStack || {};
    const resistPct = perStack.resistPct || 0;
    if (resistPct) {
      const total = resistPct * stackCount;
      if (total) {
        derived.resistsPct = derived.resistsPct || Object.create(null);
        derived.resistsPct[type] = (derived.resistsPct[type] || 0) + total;
        derived.resistDelta = derived.resistDelta || Object.create(null);
        derived.resistDelta[type] = (derived.resistDelta[type] || 0) + total;
      }
    }
    const accuracyFlat = perStack.accuracyFlat || 0;
    if (accuracyFlat) {
      derived.accuracyFlat = (derived.accuracyFlat || 0) + accuracyFlat * stackCount;
    }
  }
  return derived;
}
