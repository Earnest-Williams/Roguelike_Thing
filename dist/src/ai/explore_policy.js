// @ts-nocheck
/**
 * Utility exploration policy schema and helpers.
 * Policies are JSON friendly so they can be tuned outside of the codebase and
 * hot-swapped for different play styles (cartographer, greedy, etc.).
 */
const ZERO_WEIGHTS = Object.freeze({
    base: 1,
    lighting: 0,
    threat: 0,
    lava: 0,
    revisit: 0,
    loot: 0,
    unexplored: 0,
});
export function normalizePolicy(def) {
    const base = def ? { ...def } : {};
    return {
        ...base,
        switches: { ...(base.switches ?? {}) },
        thresholds: { ...(base.thresholds ?? {}) },
        weights: { ...(base.weights ?? {}) },
        gates: { ...(base.gates ?? {}) },
        formulas: { ...(base.formulas ?? {}) },
        pathCost: { ...ZERO_WEIGHTS, ...(base.pathCost ?? {}) },
    };
}
export function mergePolicies(base, overrides) {
    if (!overrides)
        return normalizePolicy(base);
    const merged = {
        ...base,
        ...overrides,
        switches: { ...(base.switches ?? {}), ...(overrides.switches ?? {}) },
        thresholds: { ...(base.thresholds ?? {}), ...(overrides.thresholds ?? {}) },
        weights: { ...(base.weights ?? {}), ...(overrides.weights ?? {}) },
        gates: { ...(base.gates ?? {}), ...(overrides.gates ?? {}) },
        formulas: { ...(base.formulas ?? {}), ...(overrides.formulas ?? {}) },
        pathCost: { ...(base.pathCost ?? {}), ...(overrides.pathCost ?? {}) },
    };
    return normalizePolicy(merged);
}
export function loadPolicyPreset(json) {
    if (!json || typeof json !== "object") {
        throw new TypeError("Policy preset must be an object");
    }
    if (typeof json.id !== "string" || typeof json.label !== "string") {
        throw new TypeError("Policy preset requires id and label");
    }
    return normalizePolicy({
        ...json,
        switches: { ...(json.switches ?? {}) },
        thresholds: { ...(json.thresholds ?? {}) },
        weights: { ...(json.weights ?? {}) },
        gates: { ...(json.gates ?? {}) },
        formulas: { ...(json.formulas ?? {}) },
        pathCost: { ...(json.pathCost ?? {}) },
    });
}
export const POLICY_PRESETS = Object.freeze({
    cartographer: {
        id: "cartographer",
        label: "Cartographer",
        description: "Explore every tile, prioritising safety and light.",
        switches: { pursueCombat: false, healWhenHurt: true },
        thresholds: { minimumLight: 0.4, lowHealth: 0.6 },
        weights: {
            exploration: 1.0,
            light: 0.55,
            safety: 0.85,
            loot: 0.3,
            exit: 0.15,
            progress: 0.6,
        },
        gates: { allowAggro: false },
        formulas: {
            safety: "Math.max(0, 1 - threat)",
            progress: "Math.max(progress, exploration * 0.5)",
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
            exploration: 0.45,
            light: 0.25,
            safety: 0.45,
            loot: 1.15,
            exit: 0.25,
            progress: 0.35,
            combat: 0.5,
        },
        gates: { allowAggro: true },
        formulas: {
            loot: "Math.max(0, loot - threat * 0.25)",
            combat: "Math.max(0, combat - threat * 0.3)",
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
            exploration: 0.25,
            light: 0.7,
            safety: 1.25,
            loot: 0.1,
            exit: 0.45,
            progress: 0.2,
        },
        gates: { allowAggro: false },
        formulas: {
            safety: "Math.max(0, 1 - threat * 1.5)",
            exit: "Math.max(exit, 1 - threat)",
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
            exploration: 0.15,
            light: 0.1,
            safety: 0.45,
            loot: 0.05,
            exit: 1.4,
            progress: 1.1,
        },
        gates: { allowAggro: false },
        formulas: {
            exit: "exit * (1 + Math.max(0, 1 - progress))",
            progress: "progress * (1 + Math.max(0, exit - threat))",
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
            progress: 0.4,
        },
        gates: { allowAggro: true },
        formulas: {
            combat: "Math.max(0.1, 1 - targetThreat)",
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
    sentinel: {
        id: "sentinel",
        label: "Sentinel",
        description: "Hold territory, preferring bright, defensible ground.",
        switches: { pursueCombat: false, healWhenHurt: true },
        thresholds: { minimumLight: 0.45, lowHealth: 0.7 },
        weights: {
            exploration: 0.25,
            light: 0.75,
            safety: 1.35,
            loot: 0.1,
            exit: 0.35,
            combat: 0.25,
            progress: 0.4,
        },
        gates: { allowAggro: false },
        formulas: {
            combat: "Math.max(0, combat - threat * 0.6)",
            progress: "Math.max(progress, light * 0.4)",
        },
        pathCost: {
            lighting: -0.45,
            threat: 1.1,
            lava: 3.2,
            revisit: 0.2,
            loot: -0.1,
            unexplored: -0.25,
        },
        metadata: { role: "defensive" },
    },
    skirmisher: {
        id: "skirmisher",
        label: "Skirmisher",
        description: "Engage on favourable terms, circling and probing threats.",
        switches: { pursueCombat: true, healWhenHurt: true },
        thresholds: { minimumLight: 0.25, lowHealth: 0.45 },
        weights: {
            exploration: 0.35,
            light: 0.25,
            safety: 0.65,
            loot: 0.25,
            exit: 0.3,
            combat: 1.1,
            progress: 0.55,
        },
        gates: { allowAggro: true },
        formulas: {
            combat: "Math.max(0.2, combat - threat * 0.2 + progress * 0.2)",
            safety: "Math.max(0, safety - targetThreat * 0.2)",
        },
        pathCost: {
            lighting: -0.2,
            threat: 0.7,
            lava: 1.6,
            revisit: 0.25,
            loot: -0.25,
            unexplored: -0.45,
        },
        metadata: { role: "mobile" },
    },
    opportunist: {
        id: "opportunist",
        label: "Opportunist",
        description: "Pursue easy victories and unattended loot while staying nimble.",
        switches: { pursueCombat: true, healWhenHurt: false },
        thresholds: { minimumLight: 0.3, lowHealth: 0.5 },
        weights: {
            exploration: 0.3,
            light: 0.3,
            safety: 0.55,
            loot: 1.25,
            exit: 0.35,
            combat: 0.9,
            progress: 0.5,
        },
        gates: { allowAggro: true },
        formulas: {
            loot: "Math.max(0, loot + Math.max(0, 0.6 - threat))",
            combat: "Math.max(0, combat - targetThreat * 0.4)",
        },
        pathCost: {
            lighting: -0.25,
            threat: 0.8,
            lava: 1.8,
            revisit: 0.2,
            loot: -0.6,
            unexplored: -0.35,
        },
        metadata: { role: "raider" },
    },
});
export function listPolicyPresets() {
    return Object.values(POLICY_PRESETS).map((preset) => normalizePolicy(preset));
}
export function getPolicyPreset(id, overrides) {
    const preset = POLICY_PRESETS[id];
    if (!preset) {
        throw new Error(`Unknown policy preset: ${id}`);
    }
    return mergePolicies(preset, overrides);
}
