// src/combat/attunement.js
// @ts-check

/**
 * Fetch the current attunement stacks for a given damage type.
 * @param {import("./actor.js").Actor|{attunement?: {stacks?: Record<string, number>}}} actor
 * @param {string} type
 */
export function getStacks(actor, type) {
  return actor?.attunement?.stacks?.[type] | 0;
}

/**
 * Mutate an actor's attunement stacks for a given type.
 * @param {import("./actor.js").Actor|{attunement?: {stacks?: Record<string, number>}}} actor
 * @param {string} type
 * @param {number} value
 */
export function setStacks(actor, type, value) {
  if (!actor) return;
  const attune = actor.attunement || (actor.attunement = { rules: Object.create(null), stacks: Object.create(null) });
  const stacks = attune.stacks || (attune.stacks = Object.create(null));
  if (value <= 0) delete stacks[type];
  else stacks[type] = value | 0;
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
  const { attacker, packets } = ctx || {};
  if (!attacker?.attunement?.rules || !Array.isArray(packets)) return;

  const applied = [];
  for (const packet of packets) {
    if (!packet || typeof packet.type !== "string") continue;
    const rule = ruleFor(attacker, packet.type);
    if (!rule) continue;
    const stacks = getStacks(attacker, packet.type);
    if (!stacks) continue;
    const dmgPct = rule.perStack?.damagePct || 0;
    if (!dmgPct) continue;
    packet.amount = Math.max(0, packet.amount * (1 + dmgPct * stacks));
    applied.push({ type: packet.type, stacks, amount: packet.amount });
  }

  if (applied.length) {
    attacker.logs?.attack?.push?.({ kind: "attune_apply", packets: applied });
    attacker.log?.push?.({ kind: "attune_apply", packets: applied });
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
    const rawMax = rule.maxStacks;
    const cap = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : Number.POSITIVE_INFINITY;
    const next = Math.min(cap, (current + gain) | 0);
    setStacks(attacker, type, next);
    attacker.logs?.attack?.push?.({ kind: "attune_gain", type, stacks: next });
    attacker.log?.push?.({ kind: "attune_gain", type, stacks: next });
  }
}

/**
 * Decay attunement stacks once per turn.
 * @param {any} actor
 */
export function decayPerTurn(actor) {
  const stacks = actor?.attunement?.stacks;
  if (!stacks) return;
  for (const [type, count] of Object.entries(stacks)) {
    const rule = ruleFor(actor, type);
    if (!rule) {
      delete stacks[type];
      continue;
    }
    const decay = rule.decayPerTurn | 0;
    if (!decay) continue;
    setStacks(actor, type, Math.max(0, (count | 0) - decay));
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
    const resistPct = rule.perStack?.resistPct || 0;
    if (resistPct) {
      derived.resistsPct = derived.resistsPct || Object.create(null);
      derived.resistsPct[type] = (derived.resistsPct[type] || 0) + resistPct * stackCount;
    }
    const accuracyFlat = rule.perStack?.accuracyFlat || 0;
    if (accuracyFlat) {
      derived.accuracyFlat = (derived.accuracyFlat || 0) + accuracyFlat * stackCount;
    }
  }
  return derived;
}
