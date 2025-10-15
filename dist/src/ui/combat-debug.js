// src/ui/combat-debug.js
// @ts-nocheck
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _CombatDebugOverlay_instances, _CombatDebugOverlay_updateVisibility, _CombatDebugOverlay_handleCombat;
import { breakdownFromAttackLog, breakdownFromContext } from "../combat/attack-breakdown.js";
import { EVENT, subscribe } from "./event-log.js";
const RECENT_LIMIT = 8;
/**
 * Escape HTML entities for safe string interpolation.
 * @param {any} value
 */
function escapeHtml(value) {
    const str = String(value ?? "");
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
/**
 * Format a totals map into a human readable string.
 * @param {Record<string, number> | undefined} totals
 */
function formatTotals(totals) {
    if (!totals || !Object.keys(totals).length)
        return "-";
    return Object.entries(totals)
        .map(([type, amount]) => `${escapeHtml(type)}:${escapeHtml(amount)}`)
        .join(", ");
}
/**
 * Format a diff map with +/- prefixes.
 * @param {Record<string, number> | undefined} diff
 */
function formatDiff(diff) {
    if (!diff || !Object.keys(diff).length)
        return "-";
    return Object.entries(diff)
        .map(([type, amount]) => {
        const prefix = Number(amount) >= 0 ? "+" : "";
        return `${escapeHtml(type)}:${prefix}${escapeHtml(amount)}`;
    })
        .join(", ");
}
/**
 * Format arbitrary metadata as prettified JSON.
 * @param {any} meta
 */
function formatMeta(meta) {
    if (meta == null)
        return "-";
    try {
        return escapeHtml(JSON.stringify(meta));
    }
    catch {
        return escapeHtml(String(meta));
    }
}
/**
 * Render status attempt/apply lists.
 * @param {{ attempts?: any[]; applied?: any[] } | undefined} statuses
 */
function formatStatuses(statuses) {
    if (!statuses || (!statuses.attempts && !statuses.applied))
        return "-";
    const parts = [];
    if (statuses.attempts && statuses.attempts.length) {
        parts.push(`Attempts: ${escapeHtml(JSON.stringify(statuses.attempts))}`);
    }
    if (statuses.applied && statuses.applied.length) {
        parts.push(`Applied: ${escapeHtml(JSON.stringify(statuses.applied))}`);
    }
    return parts.join("<br/>");
}
/**
 * Format temporal hook summaries.
 * @param {Record<string, any> | undefined} hooks
 */
function formatHooks(hooks) {
    if (!hooks || !Object.keys(hooks).length)
        return "-";
    try {
        return escapeHtml(JSON.stringify(hooks));
    }
    catch {
        return escapeHtml(String(hooks));
    }
}
/**
 * Default root creation when running in a browser environment.
 */
function createDefaultRoot() {
    if (typeof document === "undefined")
        return null;
    const el = document.createElement("div");
    el.className = "combat-debug-overlay";
    el.style.position = "fixed";
    el.style.bottom = "16px";
    el.style.left = "16px";
    el.style.maxWidth = "420px";
    el.style.maxHeight = "60vh";
    el.style.overflow = "auto";
    el.style.background = "rgba(12, 18, 30, 0.82)";
    el.style.color = "#e5f4ff";
    el.style.fontFamily = "monospace";
    el.style.fontSize = "12px";
    el.style.lineHeight = "1.4";
    el.style.padding = "12px";
    el.style.borderRadius = "8px";
    el.style.boxShadow = "0 10px 24px rgba(8,15,40,0.6)";
    if (document?.body) {
        document.body.appendChild(el);
    }
    return el;
}
/**
 * @typedef {{
 *   attackerName?: string;
 *   defenderName?: string;
 *   turn?: number | undefined;
 *   totalDamage?: number | undefined;
 *   steps: Array<{ stage: string; totals: Record<string, number>; diff?: Record<string, number>; meta?: any }>;
 *   statuses?: { attempts?: any[]; applied?: any[] } | undefined;
 *   hooks?: Record<string, any> | undefined;
 * }} LatestSummary
 */
export class CombatDebugOverlay {
    /**
     * @param {{ root?: { innerHTML: string; style?: any; remove?: () => void } | null }} [opts]
     */
    constructor(opts = {}) {
        _CombatDebugOverlay_instances.add(this);
        this.root = opts.root || createDefaultRoot();
        this.visible = false;
        /** @type {LatestSummary | null} */
        this.latest = null;
        /** @type {Array<{ label: string; turn?: number; damage?: number }>} */
        this.recent = [];
        this.unsubscribe = subscribe(EVENT.COMBAT, (entry) => {
            __classPrivateFieldGet(this, _CombatDebugOverlay_instances, "m", _CombatDebugOverlay_handleCombat).call(this, entry?.payload);
        });
        this.render();
        __classPrivateFieldGet(this, _CombatDebugOverlay_instances, "m", _CombatDebugOverlay_updateVisibility).call(this);
    }
    /**
     * Clean up DOM nodes and subscriptions.
     */
    destroy() {
        if (typeof this.unsubscribe === "function") {
            try {
                this.unsubscribe();
            }
            catch {
                // ignore unsubscribe failures
            }
        }
        this.unsubscribe = null;
        if (this.root && typeof this.root.remove === "function") {
            try {
                this.root.remove();
            }
            catch {
                // ignore DOM removal errors
            }
        }
        this.root = null;
    }
    show() {
        this.visible = true;
        this.render();
        __classPrivateFieldGet(this, _CombatDebugOverlay_instances, "m", _CombatDebugOverlay_updateVisibility).call(this);
    }
    hide() {
        this.visible = false;
        __classPrivateFieldGet(this, _CombatDebugOverlay_instances, "m", _CombatDebugOverlay_updateVisibility).call(this);
    }
    toggle() {
        this.visible = !this.visible;
        if (this.visible) {
            this.render();
        }
        __classPrivateFieldGet(this, _CombatDebugOverlay_instances, "m", _CombatDebugOverlay_updateVisibility).call(this);
    }
    /**
     * Render HTML output reflecting the current breakdown state.
     */
    render() {
        if (!this.root)
            return;
        const recentList = this.recent
            .map((entry) => {
            const details = [];
            if (entry.turn !== undefined)
                details.push(`T${escapeHtml(entry.turn)}`);
            if (entry.damage !== undefined)
                details.push(`Δ${escapeHtml(entry.damage)}`);
            const suffix = details.length ? ` <span class="muted">(${details.join(", ")})</span>` : "";
            return `<li>${escapeHtml(entry.label)}${suffix}</li>`;
        })
            .join("");
        let body = "<p class=\"muted\">No combat events recorded.</p>";
        if (this.latest) {
            const { attackerName, defenderName, turn, totalDamage, steps, statuses, hooks } = this.latest;
            const rows = steps
                .map((step) => `
            <tr>
              <td>${escapeHtml(step.stage)}</td>
              <td>${formatTotals(step.totals)}</td>
              <td>${formatDiff(step.diff)}</td>
              <td>${formatMeta(step.meta)}</td>
            </tr>
          `)
                .join("");
            const statusHtml = formatStatuses(statuses);
            const hooksHtml = formatHooks(hooks);
            body = `
        <div class="summary">
          <div><strong>Attacker:</strong> ${escapeHtml(attackerName ?? "-")}</div>
          <div><strong>Defender:</strong> ${escapeHtml(defenderName ?? "-")}</div>
          <div><strong>Turn:</strong> ${turn !== undefined ? escapeHtml(turn) : "-"}</div>
          <div><strong>Total Damage:</strong> ${totalDamage !== undefined ? escapeHtml(totalDamage) : "-"}</div>
        </div>
        <table class="breakdown">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Totals</th>
              <th>Δ</th>
              <th>Meta</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="statuses"><strong>Status Rolls:</strong><br/>${statusHtml}</div>
        <div class="hooks"><strong>Temporal Hooks:</strong><br/>${hooksHtml}</div>
      `;
        }
        this.root.innerHTML = `
      <style>
        .combat-debug-overlay .muted { color: rgba(229,244,255,0.6); }
        .combat-debug-overlay table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        .combat-debug-overlay th, .combat-debug-overlay td { border-bottom: 1px solid rgba(229,244,255,0.15); padding: 4px; text-align: left; vertical-align: top; }
        .combat-debug-overlay th { font-weight: 600; color: #9ddcff; }
        .combat-debug-overlay ul { margin: 0; padding-left: 16px; }
        .combat-debug-overlay .summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 12px; margin-bottom: 8px; }
        .combat-debug-overlay .statuses, .combat-debug-overlay .hooks { margin-top: 8px; word-break: break-word; }
      </style>
      <div class="recent">
        <strong>Recent combatants</strong>
        <ul>${recentList || "<li class=\"muted\">-</li>"}</ul>
      </div>
      ${body}
    `;
    }
}
_CombatDebugOverlay_instances = new WeakSet(), _CombatDebugOverlay_updateVisibility = function _CombatDebugOverlay_updateVisibility() {
    if (this.root && this.root.style) {
        this.root.style.display = this.visible ? "block" : "none";
    }
}, _CombatDebugOverlay_handleCombat = function _CombatDebugOverlay_handleCombat(payload) {
    if (!payload)
        return;
    const ctx = payload.attackContext || payload.out || payload.ctx || null;
    const breakdown = payload.breakdown || (ctx ? breakdownFromContext(ctx) : undefined);
    const attacker = ctx?.attacker || payload.attacker || null;
    const defender = ctx?.defender || payload.defender || null;
    const attackerName = attacker?.name ?? attacker?.id ?? payload.who ?? "?";
    const defenderName = defender?.name ?? defender?.id ?? payload.vs ?? "?";
    const defenderKey = defender?.id ?? defender?.name ?? payload.vs ?? null;
    const attackerLog = attacker?.logs?.attack;
    const logSummary = breakdownFromAttackLog(attackerLog, {
        role: "attacker",
        turn: breakdown?.turn ?? ctx?.turn,
        counterpart: defenderKey,
    });
    const steps = logSummary?.steps?.length
        ? logSummary.steps
        : breakdown?.steps ?? [];
    this.latest = {
        attackerName,
        defenderName,
        turn: breakdown?.turn ?? ctx?.turn ?? undefined,
        totalDamage: payload.totalDamage ?? breakdown?.totalDamage ?? ctx?.totalDamage ?? undefined,
        steps,
        statuses: breakdown?.statuses,
        hooks: breakdown?.hooks,
    };
    const label = `${attackerName} ▶ ${defenderName}`;
    this.recent.unshift({
        label,
        turn: this.latest.turn,
        damage: this.latest.totalDamage,
    });
    if (this.recent.length > RECENT_LIMIT) {
        this.recent.length = RECENT_LIMIT;
    }
    if (this.visible) {
        this.render();
    }
};
let instance = null;
/**
 * Ensure a singleton overlay instance is created.
 * @param {{ root?: any }} [opts]
 */
export function ensureCombatDebugOverlay(opts) {
    if (!instance) {
        instance = new CombatDebugOverlay(opts);
    }
    return instance;
}
