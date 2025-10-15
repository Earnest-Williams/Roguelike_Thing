import { KINDS } from "./types";
const add = (obj, k, v) => (obj[k] = (obj[k] || 0) + v);
export const LIB = {
    "core.fire": {
        id: "core.fire",
        kind: KINDS.CORE,
        tags: ["spell", "fire"],
        powerCost: 6,
        apply(acc) {
            add(acc.prePackets, "fire", 10);
            acc.name.push("Fire");
        },
    },
    "form.nova": {
        id: "form.nova",
        kind: KINDS.FORM,
        tags: ["aoe"],
        powerCost: 5,
        apply(acc) {
            acc.targetKind = "self";
            acc.shape.radius = Math.max(acc.shape.radius || 0, 2);
            acc.name.push("Nova");
        },
    },
    "vector.chain": {
        id: "vector.chain",
        kind: KINDS.VECTOR,
        tags: ["chain"],
        powerCost: 4,
        apply(acc) {
            acc.vector["chain"] = { hops: 2, hopRange: 4 };
            acc.name.push("Chain");
        },
    },
    "aug.burning": {
        id: "aug.burning",
        kind: KINDS.AUGMENT,
        tags: ["status", "fire"],
        powerCost: 3,
        apply(acc) {
            acc.statusAttempts.push({ id: "burning", baseChance: 0.6, baseDuration: 3 });
            acc.name.push("Burning");
        },
    },
    "meter.power+": {
        id: "meter.power+",
        kind: KINDS.METER,
        tags: ["meter"],
        powerCost: 2,
        apply(acc) {
            acc.preMult *= 1.25;
        },
    },
};
