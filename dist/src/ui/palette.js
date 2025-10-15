// src/ui/palette.js
// @ts-nocheck
import { DAMAGE_TYPE, DEFAULT_MARTIAL_DAMAGE_TYPE } from "../../js/constants.js";
export function colorForType(type) {
    const t = String(type || "").toLowerCase();
    if (t === DAMAGE_TYPE.SLASH)
        return "#ffffff";
    if (t === DAMAGE_TYPE.PIERCE)
        return "#9dd6ff";
    if (t === DAMAGE_TYPE.BLUNT)
        return "#d2c59c";
    if (t === "fire")
        return "#ff6a00";
    if (t === "cold")
        return "#66ccff";
    if (t === "lightning")
        return "#ffee55";
    if (t === "poison")
        return "#66dd66";
    if (t === "arcane")
        return "#cc66ff";
    if (t === DAMAGE_TYPE.RADIANT)
        return "#ffe680";
    if (t === DAMAGE_TYPE.NECROTIC)
        return "#8050a0";
    return "#ffffff";
}
export function dominantAffinity(actor) {
    const affinityMap = actor?.modCache?.affinities || actor?.modCache?.offense?.affinities || null;
    if (!affinityMap)
        return DEFAULT_MARTIAL_DAMAGE_TYPE;
    let best = DEFAULT_MARTIAL_DAMAGE_TYPE;
    let val = -Infinity;
    for (const k of Object.keys(affinityMap)) {
        const v = affinityMap[k];
        if (v > val) {
            val = v;
            best = k;
        }
    }
    return best;
}
