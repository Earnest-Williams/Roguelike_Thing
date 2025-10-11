// src/sim/config.js
// Shared configuration values for combat simulations.

export const SIM_DEFAULT_RUN_COUNT = 50;
export const SIM_DEFAULT_SEED = 1234;
export const SIM_MAX_TURNS = 200;
export const SIM_PARTIAL_TURN_CREDIT = 0.5;

export const SIM_BALANCE_BANDS = Object.freeze({
  brigand_vs_dummy_ttk: Object.freeze({ min: 4, max: 10 }),
  pyro_vs_dummy_ttk: Object.freeze({ min: 3, max: 8 }),
});

export const SIMULATION_CONFIG = Object.freeze({
  DEFAULT_RUN_COUNT: SIM_DEFAULT_RUN_COUNT,
  DEFAULT_SEED: SIM_DEFAULT_SEED,
  MAX_TURNS: SIM_MAX_TURNS,
  PARTIAL_TURN_CREDIT: SIM_PARTIAL_TURN_CREDIT,
  BALANCE_BANDS: SIM_BALANCE_BANDS,
});
