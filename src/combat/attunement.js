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

/**
 * Fetch the current attunement stacks for a given damage type.
 * @param {import("./actor.js").Actor|{attunement?: {stacks?: Record<string, number>}}} actor
 * @param {string} type
 */
export function getStacks(actor, type) {
  if (!actor || typeof type !== "string") return 0;
  return actor.attunement?.stacks?.[type] | 0;
}

/**
 * Mutate an actor's attunement stacks for a given type.
 * @param {import("./actor.js").Actor|{attunement?: {stacks?: Record<string, number>}}} actor
 * @param {string} type
 * @param {number} value
 */
export function setStacks(actor, type, value) {
  if (!actor || typeof type !== "string") return;
  const attune = actor.attunement || (actor.attunement = {});
  const stacks = attune.stacks || (attune.stacks = Object.create(null));
  const next = Number.isFinite(value) ? (value | 0) : 0;
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
  return actor?.attunement?.rules?.[type];
}

/**
 * Apply outgoing attunement scaling to packets before defenses.
 * @param {{ packets: Array<{type: string, amount: number}>, attacker: any, target: any }} ctx
 */
export function applyOutgoingScaling(ctx) {
  const packets = Array.isArray(ctx?.packets) ? ctx.packets : null;
  const attacker = ctx?.attacker;
  if (!packets || !attacker?.attunement?.rules) return;

  const applied = [];
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
    const scaled = Math.max(0, baseAmount * (1 + dmgPct * stacks));
    if (scaled === baseAmount) continue;
    packet.amount = scaled;
    applied.push({ type: packet.type, stacks, amount: scaled });
  }

  if (applied.length) {
    attacker.log?.push?.({ kind: "attune_apply", packets: applied });
    attacker.logs?.attack?.push?.({ kind: "attune_apply", packets: applied });
  }
}

/**
 * Register attunement gains for types that successfully dealt damage.
 * @param {any} attacker
 * @param {Set<string>} usedTypes
 */
export function noteUseGain(attacker, usedTypes) {
  if (!attacker?.attunement?.rules || !usedTypes?.size) return;
  for (const type of usedTypes) {
    const rule = ruleFor(attacker, type);
    if (!rule) continue;
    const gain = rule.onUseGain | 0;
    if (!gain) continue;
    const current = getStacks(attacker, type);
    const maxStacks = rule.maxStacks | 0;
    const cap = maxStacks > 0 ? maxStacks : Number.POSITIVE_INFINITY;
    const next = Math.min(cap, current + gain);
    if (next === current) continue;
    setStacks(attacker, type, next);
    attacker.log?.push?.({ kind: "attune_gain", type, stacks: next });
    attacker.logs?.attack?.push?.({ kind: "attune_gain", type, stacks: next });
  }
}

/**
 * Decay attunement stacks once per turn.
 * @param {any} actor
 */
export function decayPerTurn(actor) {
  const stacks = actor?.attunement?.stacks;
  if (!stacks) return;
  for (const [type, value] of Object.entries(stacks)) {
    const current = value | 0;
    if (!current) {
      delete stacks[type];
      continue;
    }
    const rule = ruleFor(actor, type);
    if (!rule) {
      delete stacks[type];
      continue;
    }
    const decay = rule.decayPerTurn | 0;
    if (!decay) continue;
    const next = Math.max(0, current - decay);
    setStacks(actor, type, next);
  }
}

/**
 * Allow attunement stacks to contribute passive derived bonuses (resists, accuracy, etc.).
 * @param {any} actor
 * @param {any} derived
 */
export function contributeDerived(actor, derived) {
  if (!actor || !derived) return derived;
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
