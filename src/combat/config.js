// src/combat/config.js

export const ATTUNE = {
  gainPerPointDamage: 0.10,  // gain for each final damage point dealt of a type
  minPerHitGain: 0.50,       // floor so tiny hits still move the needle
  decayPerTurn: 0.75,        // flat decay each turn (before clamp)
  cap: 20,                   // hard cap for any type
  thresholds: {
    // “soft” tiers to translate attunement → temporary affinities/resists
    3: 0.03,  // +3% affinity at 3+
    7: 0.06,  // +6% at 7+
    12: 0.10, // +10% at 12+
    16: 0.15, // +15% at 16+
  },
  leakToSiblingsPct: 0.20,   // optional: 20% of gain leaks to “adjacent” types in your design
};
