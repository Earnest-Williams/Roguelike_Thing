import { getPolicyPreset, mergePolicies, normalizePolicy } from "./explore_policy";
function resolvePolicy(input, overrides) {
    if (!input) {
        const preset = getPolicyPreset("cartographer");
        return overrides ? mergePolicies(preset, overrides) : preset;
    }
    if (typeof input === "string") {
        const preset = getPolicyPreset(input);
        return overrides ? mergePolicies(preset, overrides) : preset;
    }
    if (input && typeof input === "object" && "pathCost" in input && input.switches && input.weights) {
        return overrides ? mergePolicies(input, overrides) : normalizePolicy(input);
    }
    return mergePolicies(normalizePolicy(input), overrides);
}
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
export function computePathCost(tile, ctx = {}) {
    const policy = resolvePolicy(ctx.policy, ctx.overrides);
    const weights = policy.pathCost;
    const breakdown = [];
    const baseCost = Number.isFinite(tile?.baseCost) ? Number(tile.baseCost) : 1;
    breakdown.push({ id: "base", weight: weights.base, value: baseCost, contribution: baseCost * weights.base });
    const lightSample = Number.isFinite(tile?.light)
        ? Number(tile.light)
        : typeof ctx.sampleLightAt === "function"
            ? ctx.sampleLightAt(tile.x, tile.y)
            : 1;
    const darkness = 1 - clamp01(lightSample ?? 1);
    breakdown.push({ id: "lighting", weight: weights.lighting, value: darkness, contribution: darkness * weights.lighting });
    const threatSample = Number.isFinite(tile?.threat)
        ? Number(tile.threat)
        : typeof ctx.sampleThreatAt === "function"
            ? ctx.sampleThreatAt(tile.x, tile.y)
            : 0;
    breakdown.push({ id: "threat", weight: weights.threat, value: threatSample, contribution: threatSample * weights.threat });
    const lavaValue = tile?.isLava ? 1 : 0;
    breakdown.push({ id: "lava", weight: weights.lava, value: lavaValue, contribution: lavaValue * weights.lava });
    const revisitCount = Number.isFinite(tile?.revisitCount)
        ? Number(tile.revisitCount)
        : ctx.visited?.has(`${tile.x},${tile.y}`)
            ? 1
            : 0;
    breakdown.push({ id: "revisit", weight: weights.revisit, value: revisitCount, contribution: revisitCount * weights.revisit });
    const lootValue = tile?.hasLoot ? 1 : 0;
    breakdown.push({ id: "loot", weight: weights.loot, value: lootValue, contribution: lootValue * weights.loot });
    const unexploredValue = tile?.explored === false ? 1 : 0;
    breakdown.push({ id: "unexplored", weight: weights.unexplored, value: unexploredValue, contribution: unexploredValue * weights.unexplored });
    const total = breakdown.reduce((sum, entry) => sum + entry.contribution, 0);
    return {
        cost: total,
        breakdown,
        weights,
    };
}
export { clamp01 };
