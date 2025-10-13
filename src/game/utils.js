/**
 * Utility helpers for building deeply nested default objects. We keep these in
 * one place so that code constructing status contexts does not repeat object
 * literal boilerplate.
 */

export function createEmptyDamageTypeMap() {
  return Object.create(null);
}

export function createEmptyStatusDerivedMods() {
  // Values derived from status effects get reinitialized frequently; this helper
  // ensures every field exists so consumers can rely on strict equality checks.
  return {
    moveAPDelta: 0,
    actionSpeedPct: 0,
    accuracyFlat: 0,
    critChancePct: 0,
    canAct: true,
    damageDealtMult: createEmptyDamageTypeMap(),
    damageTakenMult: createEmptyDamageTypeMap(),
    resistDelta: createEmptyDamageTypeMap(),
  };
}

export function createDefaultStatusModCache() {
  // Cached modifiers allow status recomputation to reuse object instances and
  // avoid allocating fresh Sets or maps on every turn.
  return {
    inflictBonus: Object.create(null),
    inflictDurMult: Object.create(null),
    recvDurMult: Object.create(null),
    resistBonus: Object.create(null),
    freeAction: {
      ignore: new Set(),
    },
  };
}

export function createDefaultModCache() {
  // High-level cache bundling offense/defense/stat buckets. Consumers clone this
  // once per actor and mutate the nested maps as equipment or statuses change.
  return {
    status: createDefaultStatusModCache(),
    offense: {
      affinities: Object.create(null),
      brandAdds: [],
      conversions: [],
      polarity: { onHitBias: { baseMult: 0, vs: Object.create(null) } },
    },
    defense: {
      resists: Object.create(null),
      immunities: new Set(),
    },
    polarity: {
      grant: {
        order: 0,
        growth: 0,
        chaos: 0,
        decay: 0,
        void: 0,
      },
      defenseBias: {
        baseResistPct: 0,
        vs: Object.create(null),
      },
    },
    vision: { lightBonus: 0 },
  };
}

