/**
 * Utility exploration policy schema and helpers.
 * Policies are JSON friendly so they can be tuned outside of the codebase and
 * hot-swapped for different play styles (cartographer, greedy, etc.).
 */

export type GateState = Record<string, boolean>;
export type WeightTable = Record<string, number>;
export type ThresholdTable = Record<string, number>;
export type FormulaTable = Record<string, string>;

export interface PathCostWeights {
  base: number;
  lighting: number;
  threat: number;
  lava: number;
  revisit: number;
  loot: number;
  unexplored: number;
}

export interface ExplorePolicyDefinition {
  id: string;
  label: string;
  description?: string;
  switches?: GateState;
  thresholds?: ThresholdTable;
  weights?: WeightTable;
  gates?: GateState;
  formulas?: FormulaTable;
  pathCost?: Partial<PathCostWeights>;
  metadata?: Record<string, unknown>;
}

export interface ExplorePolicy extends ExplorePolicyDefinition {
  switches: GateState;
  thresholds: ThresholdTable;
  weights: WeightTable;
  gates: GateState;
  formulas: FormulaTable;
  pathCost: PathCostWeights;
}

export interface ExplorePolicyCatalog {
  [id: string]: ExplorePolicyDefinition;
}

const ZERO_WEIGHTS: PathCostWeights = Object.freeze({
  base: 1,
  lighting: 0,
  threat: 0,
  lava: 0,
  revisit: 0,
  loot: 0,
  unexplored: 0,
});

export function normalizePolicy(def: ExplorePolicyDefinition): ExplorePolicy {
  return {
    ...def,
    switches: { ...def.switches },
    thresholds: { ...def.thresholds },
    weights: { ...def.weights },
    gates: { ...def.gates },
    formulas: { ...def.formulas },
    pathCost: { ...ZERO_WEIGHTS, ...def.pathCost },
  };
}

export function mergePolicies(base: ExplorePolicyDefinition, overrides?: Partial<ExplorePolicyDefinition>): ExplorePolicy {
  if (!overrides) return normalizePolicy(base);
  const merged: ExplorePolicyDefinition = {
    ...base,
    ...overrides,
    switches: { ...base.switches, ...overrides.switches },
    thresholds: { ...base.thresholds, ...overrides.thresholds },
    weights: { ...base.weights, ...overrides.weights },
    gates: { ...base.gates, ...overrides.gates },
    formulas: { ...base.formulas, ...overrides.formulas },
    pathCost: { ...base.pathCost, ...overrides.pathCost },
  };
  return normalizePolicy(merged);
}

export function loadPolicyPreset(json: ExplorePolicyDefinition): ExplorePolicy {
  if (!json || typeof json !== "object") {
    throw new TypeError("Policy preset must be an object");
  }
  if (typeof json.id !== "string" || typeof json.label !== "string") {
    throw new TypeError("Policy preset requires id and label");
  }
  return normalizePolicy({
    ...json,
    switches: { ...json.switches },
    thresholds: { ...json.thresholds },
    weights: { ...json.weights },
    gates: { ...json.gates },
    formulas: { ...json.formulas },
    pathCost: { ...json.pathCost },
  });
}

export const POLICY_PRESETS: ExplorePolicyCatalog = Object.freeze({
  cartographer: {
    id: "cartographer",
    label: "Cartographer",
    description: "Explore every tile, prioritising safety and light.",
    switches: { pursueCombat: false, healWhenHurt: true },
    thresholds: { minimumLight: 0.4, lowHealth: 0.6 },
    weights: {
      exploration: 1.0,
      light: 0.5,
      safety: 0.8,
      loot: 0.3,
      exit: 0.1,
    },
    gates: { allowAggro: false },
    formulas: {
      safety: "Math.max(0, 1 - threat)",
    },
    pathCost: {
      lighting: -0.3,
      threat: 0.8,
      lava: 3,
      revisit: 0.4,
      loot: -0.5,
      unexplored: -0.8,
    },
  },
  greedy: {
    id: "greedy",
    label: "Greedy",
    description: "Loot-driven behaviour with some risk tolerance.",
    switches: { pursueCombat: true, healWhenHurt: false },
    thresholds: { minimumLight: 0.2, lowHealth: 0.4 },
    weights: {
      exploration: 0.4,
      light: 0.2,
      safety: 0.4,
      loot: 1.1,
      exit: 0.2,
    },
    gates: { allowAggro: true },
    formulas: {
      loot: "Math.max(0, loot - threat * 0.25)",
    },
    pathCost: {
      lighting: -0.1,
      threat: 0.9,
      lava: 2,
      revisit: 0.2,
      loot: -0.7,
      unexplored: -0.4,
    },
  },
  coward: {
    id: "coward",
    label: "Coward",
    description: "Avoid danger at all costs and keep health topped up.",
    switches: { pursueCombat: false, healWhenHurt: true },
    thresholds: { minimumLight: 0.5, lowHealth: 0.75 },
    weights: {
      exploration: 0.2,
      light: 0.6,
      safety: 1.2,
      loot: 0.1,
      exit: 0.4,
    },
    gates: { allowAggro: false },
    formulas: {
      safety: "Math.max(0, 1 - threat * 1.5)",
    },
    pathCost: {
      lighting: -0.5,
      threat: 1.5,
      lava: 4,
      revisit: 0.6,
      loot: -0.2,
      unexplored: -0.3,
    },
  },
  speedrunner: {
    id: "speedrunner",
    label: "Speedrunner",
    description: "Find the exit quickly, ignore optional content.",
    switches: { pursueCombat: false, healWhenHurt: false },
    thresholds: { minimumLight: 0.1, lowHealth: 0.3 },
    weights: {
      exploration: 0.2,
      light: 0.1,
      safety: 0.5,
      loot: 0.05,
      exit: 1.4,
    },
    gates: { allowAggro: false },
    formulas: {
      exit: "exit * (1 + Math.max(0, 1 - progress))",
    },
    pathCost: {
      lighting: -0.05,
      threat: 0.6,
      lava: 1.5,
      revisit: 0.2,
      loot: -0.1,
      unexplored: -0.6,
    },
  },
  arena: {
    id: "arena",
    label: "Arena",
    description: "Aggressive combat focus.",
    switches: { pursueCombat: true, healWhenHurt: false },
    thresholds: { minimumLight: 0.2, lowHealth: 0.35 },
    weights: {
      exploration: 0.2,
      light: 0.1,
      safety: 0.4,
      loot: 0.2,
      exit: 0.3,
      combat: 1.6,
    },
    gates: { allowAggro: true },
    formulas: {
      combat: "targetThreat ? Math.max(0.1, 1 - targetThreat) : 1",
    },
    pathCost: {
      lighting: -0.05,
      threat: 0.3,
      lava: 1.2,
      revisit: 0.3,
      loot: -0.2,
      unexplored: -0.4,
    },
  },
});

export function listPolicyPresets(): ExplorePolicy[] {
  return Object.values(POLICY_PRESETS).map((preset) => normalizePolicy(preset));
}

export function getPolicyPreset(id: string, overrides?: Partial<ExplorePolicyDefinition>): ExplorePolicy {
  const preset = POLICY_PRESETS[id];
  if (!preset) {
    throw new Error(`Unknown policy preset: ${id}`);
  }
  return mergePolicies(preset, overrides);
}
