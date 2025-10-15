// src/content/brands.js
// @ts-nocheck
import { DAMAGE_TYPE } from "../../js/constants.js";
/**
 * @typedef {{ id: string, name: string, type: string }} AvailableBrand
 */
/**
 * Catalog of curated brand definitions that can appear on generated or fixed items.
 * Items referencing a brand by `id` should have an entry here so tooling and tests
 * can resolve lightweight metadata (label/type) without duplicating the full payload.
 * @type {ReadonlyArray<AvailableBrand>}
 */
export const AVAILABLE_BRANDS = Object.freeze([
    Object.freeze({ id: "fire_edge", name: "Fire Edge", type: "fire" }),
    Object.freeze({ id: "edge", name: "Edge", type: DAMAGE_TYPE.SLASH }),
    Object.freeze({ id: "sunburst_edge", name: "Sunburst Edge", type: "radiant" }),
    Object.freeze({ id: "umbral_rend", name: "Umbral Rend", type: "void" }),
    Object.freeze({ id: "stormlash", name: "Stormlash", type: "storm" }),
    Object.freeze({ id: "venomkiss", name: "Venomkiss", type: "toxic" }),
    Object.freeze({ id: "gravity_well", name: "Gravity Well", type: "void" }),
    Object.freeze({ id: "aurora_edge", name: "Aurora Edge", type: "radiant" }),
    Object.freeze({ id: "frostbite_tip", name: "Frostbite Tip", type: "cold" }),
    Object.freeze({ id: "corrosion_wave", name: "Corrosion Wave", type: "acid" }),
    Object.freeze({ id: "tectonic_rumble", name: "Tectonic Rumble", type: "earth" }),
    Object.freeze({ id: "lightning_arc", name: "Lightning Arc", type: "lightning" }),
    Object.freeze({ id: "storm_resonance", name: "Storm Resonance", type: "storm" }),
    Object.freeze({ id: "undertow_surge", name: "Undertow Surge", type: "water" }),
]);
export const AVAILABLE_BRANDS_BY_ID = Object.freeze(AVAILABLE_BRANDS.reduce((acc, brand) => {
    acc[brand.id] = brand;
    return acc;
}, /** @type {Record<string, AvailableBrand>} */ (Object.create(null))));
/**
 * Convenience accessor used by tooling/tests to look up a brand definition.
 * @param {string} id
 */
export function getAvailableBrand(id) {
    return AVAILABLE_BRANDS_BY_ID[id] || null;
}
