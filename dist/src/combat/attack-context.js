// src/combat/attack-context.js
// @ts-nocheck
import { logAttackStep } from "./debug-log.js";
/**
 * Create an immutable snapshot view of a packet list with by-type aggregations.
 *
 * @param {ReadonlyArray<{ type: string; amount: number; __isBase?: boolean }>} list
 * @returns {(typeof list & Record<string, number>) & { byType?: Record<string, number> }}
 */
export function attachPacketView(list = []) {
    const arr = Array.isArray(list) ? list.map((pkt) => ({ ...pkt })) : [];
    const totals = Object.create(null);
    for (const pkt of arr) {
        if (!pkt || typeof pkt.type !== "string")
            continue;
        const amount = Math.max(0, Math.floor(Number(pkt.amount) || 0));
        totals[pkt.type] = (totals[pkt.type] || 0) + amount;
    }
    for (const [type, amount] of Object.entries(totals)) {
        arr[type] = amount;
    }
    arr.byType = totals;
    return /** @type {(typeof list & Record<string, number>) & { byType?: Record<string, number> }} */ (arr);
}
/**
 * Lightweight clone of plain metadata objects. Functions/symbols are omitted.
 *
 * @param {any} value
 */
function cloneMeta(value) {
    if (value == null)
        return undefined;
    try {
        return JSON.parse(JSON.stringify(value));
    }
    catch (err) {
        try {
            return structuredClone(value);
        }
        catch {
            return undefined;
        }
    }
}
/**
 * Push an ordered combat step into the context (and associated ring buffers).
 *
 * @param {AttackContext} ctx
 * @param {string} stage
 * @param {ReadonlyArray<{ type: string; amount: number; __isBase?: boolean }>} packets
 * @param {Record<string, any>} [meta]
 */
export function recordAttackStep(ctx, stage, packets, meta) {
    if (!ctx || !stage)
        return;
    const snapshot = {
        stage,
        packets: attachPacketView(packets || []),
    };
    const clonedMeta = cloneMeta(meta);
    if (clonedMeta && Object.keys(clonedMeta).length) {
        snapshot.meta = clonedMeta;
    }
    ctx.steps.push(snapshot);
    const totals = snapshot.packets?.byType ? { ...snapshot.packets.byType } : undefined;
    logAttackStep(ctx.attacker, {
        stage,
        role: "attacker",
        turn: ctx.turn,
        defender: ctx.defender?.id ?? ctx.defender?.name,
        totals,
        meta: clonedMeta,
    });
    if (ctx.defender && ctx.defender !== ctx.attacker) {
        logAttackStep(ctx.defender, {
            stage,
            role: "defender",
            turn: ctx.turn,
            attacker: ctx.attacker?.id ?? ctx.attacker?.name,
            totals,
            meta: clonedMeta,
        });
    }
    return snapshot;
}
/**
 * Creates a canonical attack context payload used when resolving damage.
 *
 * @param {{
 *   attacker: any;
 *   defender: any;
 *   turn: number;
 *   rng?: (() => number) | null;
 *   isEcho?: boolean;
 *   prePackets?: ReadonlyArray<{ type: string; amount: number; __isBase?: boolean }>;
 *   attempts?: ReadonlyArray<any>;
 *   hpBefore?: number;
 *   hpAfter?: number;
 * }} opts
 */
export function makeAttackContext({ attacker, defender, turn, rng = null, isEcho = false, prePackets = [], attempts = [], hpBefore = 0, hpAfter = 0, }) {
    const ctx = {
        attacker,
        defender,
        turn: Number.isFinite(turn) ? Number(turn) : 0,
        rng: typeof rng === "function" ? rng : null,
        isEcho: Boolean(isEcho),
        steps: [],
        prePackets: attachPacketView(prePackets),
        packetsAfterOffense: attachPacketView([]),
        packetsAfterDefense: attachPacketView([]),
        statusAttempts: sanitizeStatusAttempts(attempts),
        totalDamage: 0,
        appliedStatuses: [],
        hooks: Object.create(null),
        echo: null,
        hpBefore: Number.isFinite(hpBefore) ? Number(hpBefore) : 0,
        hpAfter: Number.isFinite(hpAfter) ? Number(hpAfter) : 0,
    };
    recordAttackStep(ctx, "pre", prePackets);
    return ctx;
}
/**
 * @param {any} attempt
 */
export function cloneStatusAttempt(attempt) {
    if (!attempt || typeof attempt !== "object" || !attempt.id)
        return null;
    const entry = { id: String(attempt.id) };
    for (const key of [
        "chance",
        "baseChance",
        "chancePct",
        "stacks",
        "duration",
        "potency",
        "copy",
    ]) {
        if (attempt[key] !== undefined) {
            entry[key] = attempt[key];
        }
    }
    return entry;
}
/**
 * @param {Array<Record<string, any>>} attempts
 */
export function sanitizeStatusAttempts(attempts) {
    if (!Array.isArray(attempts))
        return [];
    const out = [];
    for (const attempt of attempts) {
        const cloned = cloneStatusAttempt(attempt);
        if (cloned)
            out.push(cloned);
    }
    return out;
}
/**
 * @param {Array<Record<string, any>>} attempts
 */
export function cloneStatusAttemptList(attempts) {
    if (!Array.isArray(attempts))
        return [];
    const out = [];
    for (const attempt of attempts) {
        const cloned = cloneStatusAttempt(attempt);
        if (cloned)
            out.push(cloned);
    }
    return out;
}
/**
 * @typedef {ReturnType<typeof makeAttackContext>} AttackContext
 */
