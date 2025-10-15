var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _DebugOverlay_instances, _DebugOverlay_createRoot, _DebugOverlay_chipClass, _DebugOverlay_initFilters, _DebugOverlay_updateFilterButtons;
// src/ui/debug-overlay.js
// @ts-nocheck
import { DEBUG_OVERLAY_BREAKDOWN_LIMIT, DEBUG_OVERLAY_LOG_LIMIT, DEBUG_OVERLAY_MIN_PERCENT_DISPLAY, DEBUG_OVERLAY_NUMBER_DIGITS, } from "../config.js";
import { subscribe, latest, EVENT } from "./event-log.js";
/** Minimum absolute delta required to consider a resource as changed. */
const RESOURCE_CHANGE_EPSILON = 1e-6;
/**
 * Labels to use when displaying tracked resources.
 * @type {Record<string, string>}
 */
const RESOURCE_LABELS = {
    stamina: "Sta",
    mana: "Mana",
};
/**
 * Event types that can be toggled in the overlay log.
 * @type {ReadonlyArray<{ type: string, label: string }>}
 */
const FILTER_ENTRIES = Object.freeze([
    { type: EVENT.COMBAT, label: "COMBAT" },
    { type: EVENT.STATUS, label: "STATUS" },
    { type: EVENT.TURN, label: "TURN" },
    { type: EVENT.CONSOLE, label: "CONSOLE" },
]);
/**
 * @typedef {ReturnType<typeof latest>[number]} DebugEventEntry
 */
/**
 * @typedef {{
 *   root?: HTMLElement | null,
 *   actorProvider: () => any,
 * }} DebugOverlayOptions
 */
export class DebugOverlay {
    /**
     * Debug UI widget that renders a rolling log of debug events and an
     * inspector for the currently focused actor.
     *
     * @param {DebugOverlayOptions} opts
     */
    constructor({ root = null, actorProvider }) {
        _DebugOverlay_instances.add(this);
        this.actorProvider = actorProvider;
        this.root = root || __classPrivateFieldGet(this, _DebugOverlay_instances, "m", _DebugOverlay_createRoot).call(this);
        /** @type {HTMLElement | null} */
        this.logEl = this.root.querySelector(".dbg-log");
        /** @type {HTMLElement | null} */
        this.statsEl = this.root.querySelector(".dbg-stats");
        /** @type {HTMLElement | null} */
        this.filterEl = this.root.querySelector(".dbg-filter");
        this.lastCombat = null;
        /** @type {Set<string>} */
        this.filterSet = new Set(FILTER_ENTRIES.map((entry) => entry.type));
        this.prevResources = null;
        subscribe("*", () => {
            this.renderLog();
        });
        subscribe(EVENT.COMBAT, (entry) => {
            this.lastCombat = entry;
            this.renderStats();
        });
        subscribe(EVENT.TURN, () => {
            this.renderStats();
        });
        __classPrivateFieldGet(this, _DebugOverlay_instances, "m", _DebugOverlay_initFilters).call(this);
        this.renderLog();
    }
    /**
     * Render the actor stats inspector section.
     */
    renderStats() {
        const a = this.actorProvider?.();
        if (!a) {
            this.prevResources = null;
            if (this.statsEl) {
                this.statsEl.textContent = "Actor: -";
            }
            return;
        }
        const lines = [];
        const name = a.name ?? a.id ?? "?";
        const hp = a.res?.hp;
        const maxHp = a.base?.maxHP ?? a.baseStats?.maxHP;
        const ap = a.ap;
        const apCap = a.apCap;
        lines.push(`Actor: ${name}  HP:${hp}/${maxHp}  AP:${ap}/${apCap}`);
        if (typeof a.totalActionCostMult === "function") {
            lines.push(`Speed x: ${a.totalActionCostMult().toFixed(2)}  CD x: ${typeof a.totalCooldownMult === "function" ? a.totalCooldownMult().toFixed(2) : "1.00"}`);
        }
        const statuses = Array.isArray(a.statuses)
            ? a.statuses.map((s) => `${s.id}(${s.stacks},${Math.round(s.remaining ?? 0)})`).join(", ")
            : "-";
        lines.push(`Statuses: ${statuses || "-"}`);
        lines.push(`Resists: ${fmtMap(resolveResists(a))}`);
        lines.push(`Affins : ${fmtMap(resolveAffinities(a))}`);
        lines.push(`Brands : ${fmtBrands(a)}`);
        const actorId = a.id ?? a.name ?? null;
        const currentResources = {
            actorId,
            stamina: getResourceValue(a, "stamina"),
            mana: getResourceValue(a, "mana"),
        };
        const prevResources = this.prevResources && this.prevResources.actorId === actorId
            ? this.prevResources
            : null;
        let resourceChanged = false;
        const resourceParts = [];
        for (const [key, label] of Object.entries(RESOURCE_LABELS)) {
            const value = currentResources[key];
            if (!Number.isFinite(value))
                continue;
            let part = `${label} ${formatResourceValue(value)}`;
            if (prevResources && Number.isFinite(prevResources[key])) {
                const delta = value - prevResources[key];
                if (Math.abs(delta) > RESOURCE_CHANGE_EPSILON) {
                    part += ` (${formatSignedDelta(delta)})`;
                    resourceChanged = true;
                }
            }
            resourceParts.push(part);
        }
        if (prevResources && resourceChanged && resourceParts.length) {
            lines.push(`Resources: ${resourceParts.join(" / ")}`);
        }
        this.prevResources = currentResources;
        if (a?.perception) {
            const visibleActors = Array.isArray(a.perception.visibleActors)
                ? a.perception.visibleActors.length
                : 0;
            const visibleLights = Array.isArray(a.perception.visibleLights)
                ? a.perception.visibleLights.length
                : 0;
            lines.push(`Perception: actors=${visibleActors} lights=${visibleLights}`);
            if (visibleLights > 0) {
                const coords = a.perception.visibleLights
                    .slice(0, 6)
                    .map((entry) => {
                    const lx = Number.isFinite(entry?.x) ? entry.x : "?";
                    const ly = Number.isFinite(entry?.y) ? entry.y : "?";
                    const label = typeof entry?.id === "string" ? entry.id : null;
                    return label ? `${label}@(${lx},${ly})` : `(${lx},${ly})`;
                });
                if (visibleLights > coords.length) {
                    coords.push("…");
                }
                lines.push(`  Lights: ${coords.join(", ")}`);
            }
        }
        const plannerExplain = a?.lastPlannerDecision;
        if (plannerExplain) {
            const policyId = plannerExplain.policy?.id ?? plannerExplain.policyId ?? "";
            const summary = plannerExplain.summary ?? "";
            const score = Number.isFinite(plannerExplain.score)
                ? plannerExplain.score.toFixed(DEBUG_OVERLAY_NUMBER_DIGITS)
                : plannerExplain.score;
            const labelParts = [`AI: ${plannerExplain.goal ?? "?"}`];
            if (summary)
                labelParts.push(`(${summary})`);
            if (score !== undefined)
                labelParts.push(`score=${score}`);
            if (policyId)
                labelParts.push(`[${policyId}]`);
            lines.push(labelParts.join(" "));
            const breakdownEntries = Object.values(plannerExplain.breakdown ?? {})
                .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
                .slice(0, 3)
                .map((entry) => `${entry.id}:${entry.contribution.toFixed(DEBUG_OVERLAY_NUMBER_DIGITS)}`);
            const targetLabel = (() => {
                const t = plannerExplain.target;
                if (!t)
                    return null;
                if (typeof t === "string")
                    return t;
                if (typeof t === "number")
                    return `${t}`;
                if (typeof t === "object") {
                    return t.name ?? t.id ?? null;
                }
                return null;
            })();
            if (targetLabel) {
                lines.push(`  Target: ${targetLabel}`);
            }
            if (breakdownEntries.length) {
                lines.push(`  ${breakdownEntries.join("  ")}`);
            }
        }
        if (this.lastCombat?.payload) {
            const p = this.lastCombat.payload;
            lines.push("Last Attack:");
            lines.push(`  ${p.who} → ${p.vs} [${p.profile?.type ?? "?"}] = ${p.damage} (${p.mode})`);
            if (Array.isArray(p.breakdown) && p.breakdown.length) {
                for (const step of p.breakdown.slice(0, DEBUG_OVERLAY_BREAKDOWN_LIMIT)) {
                    lines.push(`    ${formatBreakdownStep(step)}`);
                }
                if (p.breakdown.length > DEBUG_OVERLAY_BREAKDOWN_LIMIT) {
                    lines.push("    …");
                }
            }
        }
        if (this.statsEl) {
            this.statsEl.textContent = lines.join("\n");
        }
    }
    /**
     * Render the recent debug log entries.
     */
    renderLog() {
        if (!this.logEl)
            return;
        const entries = latest(DEBUG_OVERLAY_LOG_LIMIT)
            .slice()
            .reverse()
            .filter((e) => this.filterSet.has(e.type));
        this.logEl.innerHTML = entries.map((e) => renderEntry(e)).join("");
    }
}
_DebugOverlay_instances = new WeakSet(), _DebugOverlay_createRoot = function _DebugOverlay_createRoot() {
    const el = document.createElement("div");
    el.className =
        "fixed top-2 right-2 z-50 bg-black/70 text-white font-mono text-xs rounded-lg p-3 w-[360px] max-h-[60vh] overflow-hidden flex flex-col gap-2";
    el.innerHTML = `
      <div class="dbg-stats whitespace-pre leading-4"></div>
      <div class="dbg-filter flex flex-wrap gap-2"></div>
      <div class="dbg-log flex-1 overflow-auto border-t border-white/20 pt-2"></div>
    `;
    document.body.appendChild(el);
    return el;
}, _DebugOverlay_chipClass = function _DebugOverlay_chipClass(active) {
    const base = "px-2 py-1 rounded border text-[10px] tracking-wide uppercase transition-colors";
    return active
        ? `${base} border-cyan-300 bg-cyan-500/20`
        : `${base} border-white/20 text-white/60 hover:border-white/40`;
}, _DebugOverlay_initFilters = function _DebugOverlay_initFilters() {
    if (!this.filterEl)
        return;
    /** @type {Map<string, HTMLButtonElement>} */
    this.filterButtons = new Map();
    this.filterEl.innerHTML = "";
    for (const entry of FILTER_ENTRIES) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.type = entry.type;
        btn.textContent = entry.label;
        btn.className = __classPrivateFieldGet(this, _DebugOverlay_instances, "m", _DebugOverlay_chipClass).call(this, true);
        btn.addEventListener("click", () => {
            if (this.filterSet.has(entry.type)) {
                this.filterSet.delete(entry.type);
            }
            else {
                this.filterSet.add(entry.type);
            }
            if (this.filterSet.size === 0) {
                this.filterSet.add(entry.type);
            }
            __classPrivateFieldGet(this, _DebugOverlay_instances, "m", _DebugOverlay_updateFilterButtons).call(this);
            this.renderLog();
        });
        this.filterButtons.set(entry.type, btn);
        this.filterEl.appendChild(btn);
    }
    __classPrivateFieldGet(this, _DebugOverlay_instances, "m", _DebugOverlay_updateFilterButtons).call(this);
}, _DebugOverlay_updateFilterButtons = function _DebugOverlay_updateFilterButtons() {
    if (!this.filterButtons)
        return;
    for (const [type, btn] of this.filterButtons.entries()) {
        const active = this.filterSet.has(type);
        btn.className = __classPrivateFieldGet(this, _DebugOverlay_instances, "m", _DebugOverlay_chipClass).call(this, active);
    }
};
/**
 * Convert a debug event entry into an HTML string for the log.
 * @param {DebugEventEntry} e
 * @returns {string}
 */
function renderEntry(e) {
    if (e.type === EVENT.COMBAT) {
        const p = e.payload;
        return `<div>⚔️ ${p.who} → ${p.vs} [${p.mode}/${p.profile.type}] dmg=${p.damage} hp:${p.hpBefore}→${p.hpAfter} ${p.note || ""}</div>`;
    }
    if (e.type === EVENT.STATUS) {
        const p = e.payload;
        const info = [];
        if (Object.prototype.hasOwnProperty.call(p, "paused")) {
            info.push(`paused=${Boolean(p.paused)}`);
        }
        if (Object.prototype.hasOwnProperty.call(p, "restartVisible")) {
            info.push(`restart=${Boolean(p.restartVisible)}`);
        }
        if (Object.prototype.hasOwnProperty.call(p, "speed")) {
            info.push(`speed=${p.speed}`);
        }
        const suffix = info.length ? ` (${info.join(" ")})` : "";
        const who = p.who ?? "system";
        const msg = p.msg ?? p.message ?? "";
        return `<div>✴️ ${who}: ${msg}${suffix}</div>`;
    }
    if (e.type === EVENT.TURN) {
        const p = e.payload;
        return `<div>⏳ ${p.who} turn ap=${p.ap} hp=${p.hp}</div>`;
    }
    if (e.type === EVENT.CONSOLE) {
        const p = e.payload;
        return `<div>🛠️ ${p.msg}</div>`;
    }
    return `<div>• ${e.type}</div>`;
}
/**
 * Format a resistance or affinity map into a compact human readable string.
 * @param {any} obj
 * @returns {string}
 */
function fmtMap(obj) {
    if (!obj)
        return "-";
    if (obj instanceof Map) {
        const pairs = [];
        for (const [k, v] of obj.entries()) {
            pairs.push([k, v]);
        }
        return fmtPairs(pairs);
    }
    const keys = Object.keys(obj);
    if (!keys.length)
        return "-";
    return fmtPairs(keys.map((k) => [k, obj[k]]));
}
/**
 * Turn an iterable of [key,value] pairs into a formatted percentage string.
 * @param {Array<[string, any]>} entries
 * @returns {string}
 */
function fmtPairs(entries) {
    const out = [];
    for (const [k, raw] of entries) {
        const num = Number(raw);
        if (!Number.isFinite(num))
            continue;
        if (Math.abs(num) < DEBUG_OVERLAY_MIN_PERCENT_DISPLAY)
            continue;
        out.push(`${k}:${Math.round(num * 100)}%`);
    }
    return out.length ? out.join(" ") : "-";
}
/**
 * Resolve defensive resistances for an actor.
 * @param {any} actor
 * @returns {Record<string, number> | Map<string, number> | null}
 */
function resolveResists(actor) {
    return actor?.modCache?.resists || actor?.modCache?.defense?.resists || null;
}
/**
 * Resolve offensive affinities for an actor.
 * @param {any} actor
 * @returns {Record<string, number> | Map<string, number> | null}
 */
function resolveAffinities(actor) {
    return (actor?.modCache?.affinities || actor?.modCache?.offense?.affinities || null);
}
/**
 * Format brand modifiers present on the actor.
 * @param {any} actor
 * @returns {string}
 */
function fmtBrands(actor) {
    const direct = Array.isArray(actor?.modCache?.brands)
        ? actor.modCache.brands
        : null;
    const legacy = Array.isArray(actor?.modCache?.offense?.brandAdds)
        ? actor.modCache.offense.brandAdds
        : null;
    const list = direct || legacy;
    if (!list || !list.length)
        return "-";
    return list
        .map((b) => {
        const type = b.type || b.id || "?";
        const flat = Number.isFinite(b.flat) ? b.flat : b.value ?? 0;
        const pct = Number.isFinite(b.pct)
            ? b.pct
            : Number.isFinite(b.percent)
                ? b.percent
                : 0;
        const pctStr = Math.round(pct * 100);
        return `${type}+${flat}/${pctStr}%`;
    })
        .join(", ");
}
/**
 * Format a single damage breakdown step.
 * @param {any} step
 * @returns {string}
 */
function formatBreakdownStep(step) {
    if (!step)
        return "?";
    const value = Number.isFinite(step.value) ? step.value : null;
    const delta = Number.isFinite(step.delta) ? step.delta : null;
    switch (step.step) {
        case "base":
            return `base=${value}`;
        case "brand_flat":
            return `brand ${step.source ?? "?"} +${delta}`;
        case "brand_pct":
            return `brand ${step.source ?? "?"} ${((Number.isFinite(step.pct) ? step.pct : 0) * 100).toFixed(0)}% (${fmtDelta(delta)})`;
        case "attacker_mult":
            return `atk mult x${fmtNumber(step.mult)} (${fmtDelta(delta)})`;
        case "defender_resist":
            return `resist ${(step.resist * 100).toFixed(0)}% (${fmtNumber(delta)})`;
        case "attacker_affinity":
            return `affinity ${(step.affinity * 100).toFixed(0)}% (${fmtDelta(delta)})`;
        case "immune":
            return "immune";
        case "floor":
            return `floor → ${value}`;
        case "total":
            return `total=${value}`;
        default:
            return `${step.step}: ${value}`;
    }
}
/**
 * Format a number with a fixed precision.
 * @param {number} value
 * @param {number} [digits]
 * @returns {string}
 */
function fmtNumber(value, digits = DEBUG_OVERLAY_NUMBER_DIGITS) {
    if (!Number.isFinite(value))
        return "0";
    return Number(value).toFixed(digits);
}
/**
 * Format a signed delta with a leading plus or minus.
 * @param {number} value
 * @param {number} [digits]
 * @returns {string}
 */
function fmtDelta(value, digits = DEBUG_OVERLAY_NUMBER_DIGITS) {
    if (!Number.isFinite(value))
        return "0";
    const prefix = value >= 0 ? "+" : "";
    return `${prefix}${fmtNumber(value, digits)}`;
}
/**
 * Attempt to extract a resource value from a variety of legacy shapes.
 * @param {any} actor
 * @param {string} key
 * @returns {number | null}
 */
function getResourceValue(actor, key) {
    if (Number.isFinite(actor?.res?.[key]))
        return actor.res[key];
    if (Number.isFinite(actor?.resources?.[key]))
        return actor.resources[key];
    if (Number.isFinite(actor?.[key]))
        return actor[key];
    return null;
}
/**
 * Format a resource value for display.
 * @param {number} value
 * @returns {string}
 */
function formatResourceValue(value) {
    return formatNumberWithTrim(value, 2);
}
/**
 * Format a signed delta for resource changes.
 * @param {number} value
 * @returns {string}
 */
function formatSignedDelta(value) {
    const prefix = value >= 0 ? "+" : "";
    return `${prefix}${formatNumberWithTrim(value, 2)}`;
}
/**
 * Format a number and trim trailing zeroes and decimal points.
 * @param {number} value
 * @param {number} digits
 * @returns {string}
 */
function formatNumberWithTrim(value, digits) {
    if (!Number.isFinite(value))
        return "0";
    const fixed = Number(value).toFixed(digits);
    return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}
