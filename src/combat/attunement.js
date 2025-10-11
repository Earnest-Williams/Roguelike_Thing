// src/combat/attunement.js
// @ts-check

/**
 * Fetch the current attunement stacks for a given damage type.
 * @param {import("./actor.js").Actor|{attunement?: {stacks?: Record<string, number>}}} actor
 * @param {string} type
 */
export function getStacks(actor, type) {
  if (!actor || typeof actor !== "object") return 0;
  const stacks = actor.attunement?.stacks;
  if (!stacks || typeof stacks !== "object") return 0;
  return stacks[type] | 0;
}

/**
 * Mutate an actor's attunement stacks for a given type.
 * @param {import("./actor.js").Actor|{attunement?: {stacks?: Record<string, number>}}} actor
 * @param {string} type
 * @param {number} value
 */
export function setStacks(actor, type, value) {
  if (!actor || typeof actor !== "object") return;
  if (!actor.attunement) {
    actor.attunement = { rules: Object.create(null), stacks: Object.create(null) };
  }
  const stacks = actor.attunement.stacks || (actor.attunement.stacks = Object.create(null));
  if (value <= 0) {
    delete stacks[type];
  } else {
    stacks[type] = value | 0;
  }
}

/**
 * Resolve the attunement rule for a specific type on an actor.
 * @param {import("./actor.js").Actor|{attunement?: {rules?: Record<string, any>}}} actor
 * @param {string} type
 */
export function ruleFor(actor, type) {
  if (!actor || typeof actor !== "object") return undefined;
  const rules = actor.attunement?.rules;
  if (!rules || typeof rules !== "object") return undefined;
  return rules[type];
}

/**
 * Apply outgoing attunement scaling to packets before defenses.
 * @param {{ packets: Array<{type: string, amount: number}>, attacker: any, target: any }} ctx
 */
export function applyOutgoingScaling(ctx) {
  if (!ctx || !ctx.attacker || !Array.isArray(ctx.packets)) return;
  const { attacker } = ctx;
  const rules = attacker.attunement?.rules;
  if (!rules) return;

  for (const packet of ctx.packets) {
    if (!packet || typeof packet.type !== "string") continue;
    const rule = rules[packet.type];
    if (!rule) continue;
    const stacks = getStacks(attacker, packet.type);
    if (!stacks) continue;
    const dmgPct = rule.perStack?.damagePct || 0;
    if (!dmgPct) continue;
    const scaled = packet.amount * (1 + dmgPct * stacks);
    packet.amount = Math.max(0, scaled);
    attacker.logs?.attack?.push?.({
      kind: "attune_apply",
      type: packet.type,
      stacks,
      amount: packet.amount,
    });
  }
}

/**
 * Register attunement gains for types that successfully dealt damage.
 * @param {any} attacker
 * @param {Set<string>} usedTypes
 */
export function noteUseGain(attacker, usedTypes) {
  if (!attacker || !usedTypes?.size) return;
  const rules = attacker.attunement?.rules;
  if (!rules) return;
  for (const type of usedTypes) {
    const rule = rules[type];
    if (!rule) continue;
    const gain = rule.onUseGain | 0;
    if (!gain) continue;
    const current = getStacks(attacker, type);
    const rawCap = rule.maxStacks;
    const cap = Number.isFinite(rawCap) && rawCap > 0 ? rawCap : Number.POSITIVE_INFINITY;
    const nextStacks = Math.min(cap, current + gain);
    setStacks(attacker, type, nextStacks);
    attacker.logs?.attack?.push?.({ kind: "attune_gain", type, stacks: nextStacks });
  }
}

/**
 * Decay attunement stacks once per turn.
 * @param {any} actor
 */
export function decayPerTurn(actor) {
  if (!actor?.attunement?.stacks) return;
  const stacks = actor.attunement.stacks;
  const rules = actor.attunement.rules || {};
  for (const [type, value] of Object.entries(stacks)) {
    const rule = rules[type];
    if (!rule) {
      delete stacks[type];
      continue;
    }
    const dec = rule.decayPerTurn | 0;
    if (!dec) continue;
    const next = Math.max(0, (value | 0) - dec);
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
  const rules = actor.attunement?.rules;
  if (!stacks || !rules) return derived;

  for (const [type, count] of Object.entries(stacks)) {
    const stackCount = count | 0;
    if (!stackCount) continue;
    const rule = rules[type];
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
