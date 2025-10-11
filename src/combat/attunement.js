// src/combat/attunement.js
// @ts-check

/**
 * Reduce attunement stacks for an actor at the start of a turn.
 * @param {import("./actor.js").Actor|{attunements?: Record<string, {stacks:number, decayPerTurn:number}>}} actor
 */
export function tickAttunements(actor) {
  if (!actor || typeof actor !== "object") return;
  const attunements = actor.attunements;
  if (!attunements || typeof attunements !== "object") return;

  for (const [type, state] of Object.entries(attunements)) {
    if (!state || typeof state !== "object") continue;
    const decay = Number(state.decayPerTurn) || 0;
    const stacks = Number(state.stacks) || 0;
    const next = Math.max(0, stacks - decay);
    state.stacks = next;
    if (next <= 0) {
      // Prune empty trackers to keep the record tidy.
      delete attunements[type];
    }
  }
}

/**
 * Gain attunement stacks for an actor.
 * @param {import("./actor.js").Actor|{attunements?:Record<string, any>, modCache?:any}} actor
 * @param {string} type
 * @param {number} amount
 */
export function gainAttunement(actor, type, amount) {
  if (!actor || typeof actor !== "object") return;
  if (!type || typeof type !== "string") return;
  const gain = Number(amount);
  if (!Number.isFinite(gain) || gain <= 0) return;

  const offenseBrands = actor.modCache?.offense?.brands;
  const brands = Array.isArray(offenseBrands) && offenseBrands.length > 0
    ? offenseBrands
    : actor.modCache?.brands || [];
  const mod = brands.find((b) => b?.type === type);
  if (!mod) return;

  const def = actor.modCache?.attunement?.[type];
  if (!def) return;

  const decay = Number(def.decayPerTurn ?? def.decay) || 0;
  const maxCandidate =
    def.maxStacks ??
    def.max ??
    def.maximum ??
    def.cap ??
    Number.POSITIVE_INFINITY;
  const max = Number(maxCandidate);
  const cap = Number.isFinite(max) ? max : Number.POSITIVE_INFINITY;

  actor.attunements ||= Object.create(null);
  const existing = actor.attunements[type] || { stacks: 0, max: cap, decayPerTurn: decay };
  existing.max = cap;
  existing.decayPerTurn = decay;
  const currentStacks = Number(existing.stacks) || 0;
  existing.stacks = Math.min(cap, currentStacks + gain);
  actor.attunements[type] = existing;
}
