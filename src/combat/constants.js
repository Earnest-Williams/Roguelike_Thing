// src/combat/constants.js
// @ts-check

export const POLAR_BIAS = {
  order: { chaos: 0.1, decay: 0.1 },
  growth: { decay: 0.1, void: -0.05 },
  chaos: { order: 0.1, void: -0.05 },
  decay: { growth: 0.1, order: 0.1, void: -0.05 },
  void: { order: -0.05, growth: -0.05, chaos: -0.05, decay: -0.05 },
};

