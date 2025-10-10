const REGISTRY = new Map(); // id -> StatusDef

/**
 * @typedef {Object} StatusDerived
 * @property {number} moveAPDelta
 * @property {number} actionSpeedPct
 * @property {number} accuracyFlat
 * @property {number} critChancePct
 * @property {Record<string, number>} damageDealtMult
 * @property {Record<string, number>} damageTakenMult
 * @property {Record<string, number>} resistDelta
 */
export let StatusDerived;

/**
 * @typedef {Object} StatusDef
 * @property {string} id
 * @property {"refresh"|"add_stacks"|"independent"} [stacking]
 * @property {number} [maxStacks]
 * @property {number} [tickEvery]
 * @property {(args: { target: any, source?: any, stacks: number, turn: number }) => { potency?: number } | void} [onApply]
 * @property {(args: { target: any, stacks: number, potency?: number, turn: number }) => void} [onTick]
 * @property {(args: { target: any, stacks: number, potency?: number, turn: number }) => void} [onExpire]
 * @property {(args: { target: any, stacks: number, potency?: number }) => Partial<StatusDerived> | void} [derive]
 */
export let StatusDef;

export function registerStatus(def) {
  if (!def?.id) throw new Error("Status must have an id");
  REGISTRY.set(def.id, def);
}

export function applyStatuses(ctx, attacker, defender, turn) {
  const { statusAttempts = [] } = ctx || {};
  const applied = [];
  defender.statuses ||= [];
  for (const at of statusAttempts) {
    const def = REGISTRY.get(at.id);
    if (!def) continue;

    // Compute chance and duration (Brand Plan: attacker/defender bonuses plug here)
    const baseChance = Math.max(0, Math.min(1, at.baseChance ?? 1));
    const rolls = Math.random(); // swap with seeded RNG if desired
    if (rolls > baseChance) continue;

    const stacks = Math.max(1, Math.floor(at.stacks ?? 1));
    const duration = Math.max(1, Math.floor(at.baseDuration ?? 1));
    const endsAtTurn = turn + duration;
    const instance = { id: at.id, stacks, endsAtTurn, nextTickAt: def.tickEvery ? turn + def.tickEvery : undefined, source: attacker?.id };

    // stacking behaviour
    if (def.stacking === "refresh") {
      const existing = defender.statuses.find(s => s.id === at.id);
      if (existing) {
        existing.endsAtTurn = Math.max(existing.endsAtTurn, endsAtTurn);
        existing.stacks = Math.max(existing.stacks, stacks);
      } else {
        defender.statuses.push(instance);
      }
    } else if (def.stacking === "add_stacks") {
      const existing = defender.statuses.find(s => s.id === at.id);
      if (existing) {
        existing.stacks = Math.min(def.maxStacks ?? Infinity, existing.stacks + stacks);
        existing.endsAtTurn = Math.max(existing.endsAtTurn, endsAtTurn);
      } else {
        defender.statuses.push(instance);
      }
    } else { // "independent"
      defender.statuses.push(instance);
    }

    if (typeof def.onApply === "function") {
      const ex = defender.statuses.find(s => s.id === at.id) || instance;
      const payload = def.onApply({ target: defender, source: attacker, stacks: ex.stacks, turn });
      if (payload && typeof payload.potency !== "undefined") ex.potency = payload.potency;
    }
    applied.push(at.id);
  }
  // rebuild derived after application
  defender.statusDerived = rebuildStatusDerived(defender);
  return applied;
}

export function tickStatusesAtTurnStart(actor, turn) {
  if (!actor?.statuses?.length) {
    actor.statusDerived = rebuildStatusDerived(actor);
    return;
  }
  const keep = [];
  for (const s of actor.statuses) {
    const def = REGISTRY.get(s.id);
    if (!def) continue;
    // ticks
    if (def.tickEvery) {
      while (typeof s.nextTickAt === "number" && turn >= s.nextTickAt) {
        def.onTick?.({ target: actor, stacks: s.stacks, potency: s.potency, turn });
        s.nextTickAt += def.tickEvery;
      }
    }
    // expiry
    if (turn < s.endsAtTurn) keep.push(s);
    else def.onExpire?.({ target: actor, stacks: s.stacks, potency: s.potency, turn });
  }
  actor.statuses = keep;
  actor.statusDerived = rebuildStatusDerived(actor);
}

export function rebuildStatusDerived(actor) {
  const out = {
    moveAPDelta: 0,
    actionSpeedPct: 0,
    accuracyFlat: 0,
    critChancePct: 0,
    damageDealtMult: Object.create(null),
    damageTakenMult: Object.create(null),
    resistDelta: Object.create(null),
  };
  for (const s of actor.statuses || []) {
    const def = REGISTRY.get(s.id);
    if (!def?.derive) continue;
    const d = def.derive({ target: actor, stacks: s.stacks, potency: s.potency });
    if (!d) continue;
    out.moveAPDelta += d.moveAPDelta ?? 0;
    out.actionSpeedPct += d.actionSpeedPct ?? 0;
    out.accuracyFlat += d.accuracyFlat ?? 0;
    out.critChancePct += d.critChancePct ?? 0;
    mergeMap(out.damageDealtMult, d.damageDealtMult);
    mergeMap(out.damageTakenMult, d.damageTakenMult);
    mergeMap(out.resistDelta, d.resistDelta);
  }
  return out;
}

function mergeMap(dst, src) {
  if (!src) return;
  for (const k of Object.keys(src)) dst[k] = (dst[k] || 0) + (src[k] || 0);
}
