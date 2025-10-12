export function createEmptyDamageTypeMap() {
  return Object.create(null);
}

export function createEmptyStatusDerivedMods() {
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
  };
}

