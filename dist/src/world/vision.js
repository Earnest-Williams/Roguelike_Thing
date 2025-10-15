// @ts-nocheck
import { computeFieldOfView } from "./fov.js";
import { hasLineOfSight } from "../../js/utils.js";
function toInt(value) {
    return Number.isFinite(value) ? value | 0 : NaN;
}
export function filterLightsInLineOfSight({ lights = [], origin, grid }) {
    if (!Array.isArray(lights) || lights.length === 0)
        return [];
    const ox = toInt(origin?.x);
    const oy = toInt(origin?.y);
    if (!Number.isFinite(ox) || !Number.isFinite(oy))
        return [];
    const out = [];
    for (const light of lights) {
        if (!light)
            continue;
        const lx = toInt(light.x);
        const ly = toInt(light.y);
        const radius = Number(light?.radius);
        if (!Number.isFinite(lx) || !Number.isFinite(ly) || !Number.isFinite(radius))
            continue;
        if (radius <= 0)
            continue;
        if (hasLineOfSight(grid, { x: ox, y: oy }, { x: lx, y: ly })) {
            out.push(light);
        }
    }
    return out;
}
export function describeLightSignature(lights = []) {
    if (!Array.isArray(lights) || lights.length === 0)
        return "";
    return lights
        .map((light) => {
        const lx = toInt(light?.x);
        const ly = toInt(light?.y);
        const lr = Number(light?.radius);
        const id = typeof light?.id === "string" ? light.id : "?";
        return `${id}:${Number.isFinite(lx) ? lx : "?"},${Number.isFinite(ly) ? ly : "?"},${Number.isFinite(lr) ? Math.max(0, Math.round(lr * 100)) : "?"}`;
    })
        .sort()
        .join("|");
}
export function computeVisionWithLights({ origin, baseRadius = 0, mapState, lights = [], lightsAlreadyFiltered = false, } = {}) {
    const ox = toInt(origin?.x);
    const oy = toInt(origin?.y);
    if (!Number.isFinite(ox) || !Number.isFinite(oy) || !mapState) {
        return {
            visible: new Set(),
            baseVisible: new Set(),
            extraLit: new Set(),
            playerLos: new Set(),
            lightSignature: "",
        };
    }
    const safeRadius = Number.isFinite(baseRadius) ? Math.max(0, baseRadius) : 0;
    const baseVisible = computeFieldOfView({ x: ox, y: oy }, safeRadius, mapState, {
        useKnownGrid: false,
    });
    const filteredLights = lightsAlreadyFiltered
        ? Array.isArray(lights)
            ? lights
            : []
        : filterLightsInLineOfSight({ lights, origin: { x: ox, y: oy }, grid: mapState?.grid });
    if (!Array.isArray(filteredLights) || filteredLights.length === 0) {
        return {
            visible: baseVisible,
            baseVisible,
            extraLit: new Set(),
            playerLos: baseVisible,
            lightSignature: "",
        };
    }
    const litTiles = new Set();
    let maxReach = safeRadius;
    for (const light of filteredLights) {
        const lx = toInt(light?.x);
        const ly = toInt(light?.y);
        const lr = Number(light?.radius);
        if (!Number.isFinite(lx) || !Number.isFinite(ly) || !Number.isFinite(lr))
            continue;
        const radius = Math.max(0, Math.ceil(lr));
        if (radius <= 0)
            continue;
        const lightVisible = computeFieldOfView({ x: lx, y: ly }, radius, mapState, {
            useKnownGrid: false,
        });
        for (const cell of lightVisible) {
            litTiles.add(cell);
        }
        const reach = Math.hypot(lx - ox, ly - oy) + radius;
        if (reach > maxReach) {
            maxReach = reach;
        }
    }
    if (litTiles.size === 0) {
        return {
            visible: baseVisible,
            baseVisible,
            extraLit: new Set(),
            playerLos: baseVisible,
            lightSignature: describeLightSignature(filteredLights),
        };
    }
    const extendedRadius = Math.ceil(maxReach);
    const playerLos = extendedRadius > safeRadius
        ? computeFieldOfView({ x: ox, y: oy }, extendedRadius, mapState, { useKnownGrid: false })
        : baseVisible;
    const finalVisible = new Set(baseVisible);
    const extraLit = new Set();
    for (const cell of playerLos) {
        if (litTiles.has(cell)) {
            if (!baseVisible.has(cell)) {
                extraLit.add(cell);
            }
            finalVisible.add(cell);
        }
    }
    return {
        visible: finalVisible,
        baseVisible,
        extraLit,
        playerLos,
        lightSignature: describeLightSignature(filteredLights),
    };
}
