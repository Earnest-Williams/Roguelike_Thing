// src/combat/config.js

export const ATTUNE = {
  gainPerPointDamage: 0.10,
  minPerHitGain: 0.50,
  decayPerTurn: 0.75,
  cap: 20,
  thresholds: {
    3: 0.03,
    7: 0.06,
    12: 0.10,
    16: 0.15,
  },
  leakToSiblingsPct: 0.20,
};
