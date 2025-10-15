// src/content/combat-presets.js
// @ts-nocheck
import { DAMAGE_TYPE } from "../../js/constants.js";
import { computeItemPower } from "./power-budget.js";
const { FIRE, COLD, LIGHTNING, PIERCE } = DAMAGE_TYPE;
/** @typedef {{ id: string, type: string, flat?: number, pct?: number, onHitStatuses?: Array<{ id: string, chance?: number, stacks?: number, duration?: number }> }} BrandPreset */
/**
 * Foundation brand presets shared across loot generators and sample gear.
 * @type {ReadonlyArray<BrandPreset>}
 */
export const CORE_BRAND_PRESETS = Object.freeze([
    Object.freeze({ id: "ember_edge", type: FIRE, flat: 2, pct: 0.05, onHitStatuses: [{ id: "burn", chance: 0.3, duration: 3 }] }),
    Object.freeze({ id: "frost_tip", type: COLD, flat: 1, pct: 0.06, onHitStatuses: [{ id: "chilled", chance: 0.25, duration: 2 }] }),
    Object.freeze({ id: "stormlash", type: LIGHTNING, pct: 0.08, onHitStatuses: [{ id: "slowed", chance: 0.2, duration: 2 }] }),
]);
/**
 * Core affinity maps used when seeding curated kits.
 * @type {ReadonlyArray<{ id: string, affinities: Readonly<Record<string, number>> }>}
 */
export const CORE_AFFINITY_PRESETS = Object.freeze([
    Object.freeze({ id: "ember_initiate", affinities: Object.freeze({ fire: 0.12, slash: 0.05 }) }),
    Object.freeze({ id: "frost_sentinel", affinities: Object.freeze({ cold: 0.1, pierce: 0.05 }) }),
    Object.freeze({ id: "storm_scout", affinities: Object.freeze({ lightning: 0.12 }) }),
]);
/**
 * Baseline resist configurations to quickly bootstrap test actors and items.
 * @type {ReadonlyArray<{ id: string, resists: Readonly<Record<string, number>> }>}
 */
export const CORE_RESIST_PRESETS = Object.freeze([
    Object.freeze({ id: "char_guard", resists: Object.freeze({ fire: 0.35, slash: 0.2 }) }),
    Object.freeze({ id: "glacier_ward", resists: Object.freeze({ cold: 0.4, pierce: 0.25 }) }),
    Object.freeze({ id: "thunder_screen", resists: Object.freeze({ lightning: 0.3, blunt: 0.15 }) }),
]);
/**
 * Minimal status loadouts that align with the brand presets. Useful for quick QA scenarios.
 * @type {ReadonlyArray<{ id: string, attempts: ReadonlyArray<{ id: string, chance?: number, stacks?: number, duration?: number }> }>}
 */
export const CORE_STATUS_LOADOUTS = Object.freeze([
    Object.freeze({ id: "ember_burn", attempts: Object.freeze([{ id: "burn", chance: 0.35, duration: 3 }]) }),
    Object.freeze({ id: "glacial_chill", attempts: Object.freeze([{ id: "chilled", chance: 0.3, duration: 2 }]) }),
    Object.freeze({ id: "tempest_sting", attempts: Object.freeze([{ id: "slowed", chance: 0.25, duration: 2 }]) }),
]);
function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}
/**
 * Curated sample kits used by the combat sandbox to verify resist caps and budget math.
 */
export const SAMPLE_GEARSETS = Object.freeze([
    Object.freeze({
        id: "ember_initiate_kit",
        label: "Ember Initiate Kit",
        items: [
            {
                id: "ember_edge_blade",
                offense: {
                    brands: [clone(CORE_BRAND_PRESETS[0])],
                    affinities: clone(CORE_AFFINITY_PRESETS[0].affinities),
                },
            },
            {
                id: "ash_mantle",
                defense: {
                    resists: { fire: 0.55, slash: 0.3 },
                },
            },
            {
                id: "embersignet",
                offense: {
                    affinities: { fire: 0.08 },
                },
                defense: {
                    resists: { fire: 0.45 },
                },
            },
        ],
    }),
    Object.freeze({
        id: "glacier_scout_kit",
        label: "Glacier Scout Kit",
        items: [
            {
                id: "frost_tipped_spear",
                offense: {
                    brands: [clone(CORE_BRAND_PRESETS[1])],
                    affinities: clone(CORE_AFFINITY_PRESETS[1].affinities),
                },
                weaponProfile: { base: [[PIERCE, 4], [COLD, 3]] },
            },
            {
                id: "icebound_cloak",
                defense: {
                    resists: { cold: 0.5, pierce: 0.35 },
                },
            },
            {
                id: "glacier_talisman",
                defense: {
                    resists: { cold: 0.35 },
                },
            },
        ],
    }),
]);
function mergeMaps(base, delta) {
    const out = { ...base };
    if (!delta)
        return out;
    for (const [key, value] of Object.entries(delta)) {
        const num = Number(value);
        if (!Number.isFinite(num) || num === 0)
            continue;
        out[key] = (out[key] || 0) + num;
    }
    return out;
}
function clampResists(map) {
    const out = {};
    for (const [key, value] of Object.entries(map)) {
        out[key] = Math.max(0, Math.min(0.95, Number(value) || 0));
    }
    return out;
}
/**
 * Produce aggregate resist, affinity, and brand summaries for a sample kit.
 * @param {{ id: string, items: Array<any> }} sample
 */
export function summarizeSampleGear(sample) {
    if (!sample)
        return { id: "", resists: {}, affinities: {}, power: 0, brandCount: 0 };
    let resists = {};
    let affinities = {};
    let power = 0;
    let brandCount = 0;
    for (const item of sample.items || []) {
        if (!item || typeof item !== "object")
            continue;
        if (item.defense?.resists) {
            resists = mergeMaps(resists, item.defense.resists);
        }
        if (item.resists) {
            resists = mergeMaps(resists, item.resists);
        }
        if (item.offense?.affinities) {
            affinities = mergeMaps(affinities, item.offense.affinities);
        }
        if (item.affinities) {
            affinities = mergeMaps(affinities, item.affinities);
        }
        if (Array.isArray(item.offense?.brands)) {
            brandCount += item.offense.brands.length;
        }
        power += computeItemPower(item);
    }
    return {
        id: sample.id,
        resists: clampResists(resists),
        affinities,
        power: Math.round(power),
        brandCount,
    };
}
export const SAMPLE_GEAR_SUMMARIES = Object.freeze(SAMPLE_GEARSETS.map((sample) => summarizeSampleGear(sample)));
