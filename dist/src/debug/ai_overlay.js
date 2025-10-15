// @ts-nocheck
/**
 * Tiny developer overlay for AI planner breakdowns.
 * Renders a fixed-position DOM panel with the latest decision's explain data.
 *
 * Usage:
 *   import { setAIOverlayEnabled, updateAIOverlay } from "./src/debug/ai_overlay.js";
 *   setAIOverlayEnabled(true|false);
 *   updateAIOverlay(window.__AI_LAST_DECISION);
 */
let enabled = false;
let rootEl = null;
export function setAIOverlayEnabled(on) {
    enabled = !!on;
    const root = ensureRoot();
    if (!root)
        return;
    root.style.display = enabled ? "block" : "none";
    if (!enabled) {
        root.innerHTML = "";
    }
}
export function updateAIOverlay(decision) {
    if (!enabled)
        return;
    const root = ensureRoot();
    if (!root)
        return;
    const explain = isObject(decision?.explain) ? decision.explain : null;
    const d = decision || {};
    const goal = d.goal ?? explain?.goal ?? "(none)";
    const scoreSource = Number.isFinite(d.score)
        ? d.score
        : Number.isFinite(explain?.score)
            ? explain.score
            : null;
    const score = scoreSource === null ? "–" : Number(scoreSource).toFixed(2);
    const target = summarizeTarget(d.target ?? explain?.target);
    const breakdown = toPairs(d.breakdown || explain?.breakdown)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 8);
    const policyId = d?.policy?.id ?? d?.policy?.name ?? explain?.policy?.id ?? explain?.policy?.label ?? "(policy)";
    root.innerHTML = `
    <div style="font-weight:600;margin-bottom:4px">AI Decision Overlay</div>
    <div><b>Policy:</b> ${escapeHtml(policyId)}</div>
    <div><b>Goal:</b> ${escapeHtml(goal)} &nbsp;&nbsp; <b>Score:</b> ${escapeHtml(String(score))}</div>
    <div><b>Target:</b> ${escapeHtml(target)}</div>
    <div style="margin-top:6px;margin-bottom:2px;font-weight:600">Top terms</div>
    ${renderBreakdownTable(breakdown)}
  `;
}
function row(term, value) {
    const v = Number(value) || 0;
    const vv = v.toFixed(3);
    const barW = Math.min(100, Math.round(Math.abs(v) * 100));
    return `
    <tr>
      <td style="padding:2px 4px">${escapeHtml(term)}</td>
      <td style="padding:2px 0;text-align:right">
        <div style="display:inline-block;vertical-align:middle;width:110px;height:10px;background:#222;margin-right:6px">
          <div style="height:10px;width:${barW}px;background:${v >= 0 ? "#3aa655" : "#c23b22"}"></div>
        </div>
        <span>${vv}</span>
      </td>
    </tr>
  `;
}
function toPairs(obj) {
    if (!obj || typeof obj !== "object")
        return [];
    return Object.entries(obj);
}
function isObject(value) {
    return !!value && typeof value === "object";
}
function summarizeTarget(t) {
    if (!t)
        return "(none)";
    if (typeof t === "string")
        return t;
    if (Number.isFinite(t.x) && Number.isFinite(t.y))
        return `(${t.x | 0},${t.y | 0})`;
    if (t.id)
        return `id:${t.id}`;
    try {
        return JSON.stringify(t);
    }
    catch {
        return String(t);
    }
}
function renderBreakdownTable(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return '<div style="font-size:12px;color:#aaa">No weighted terms</div>';
    }
    return `
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr><th style="text-align:left">Term</th><th style="text-align:right">Δ Utility</th></tr></thead>
      <tbody>
        ${rows.map(([k, v]) => row(k, v)).join("")}
      </tbody>
    </table>
  `;
}
function ensureRoot() {
    if (rootEl)
        return rootEl;
    if (typeof document === "undefined")
        return null;
    const doc = document;
    const existing = doc.getElementById("ai-overlay");
    if (existing) {
        rootEl = existing;
        rootEl.style.display = enabled ? "block" : "none";
        return rootEl;
    }
    const el = doc.createElement("div");
    el.id = "ai-overlay";
    el.style.cssText = [
        "position:fixed",
        "top:10px",
        "right:10px",
        "z-index:99999",
        "min-width:260px",
        "max-width:360px",
        "max-height:50vh",
        "overflow:auto",
        "padding:8px 10px",
        "font:12px/1.3 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Ubuntu,Arial,sans-serif",
        "color:#eaeaea",
        "background:rgba(0,0,0,0.75)",
        "border:1px solid rgba(255,255,255,0.15)",
        "border-radius:8px",
        "box-shadow:0 2px 12px rgba(0,0,0,0.45)",
        "display:none",
    ].join(";");
    const append = () => {
        if (!doc.body)
            return false;
        doc.body.appendChild(el);
        return true;
    };
    if (!append()) {
        doc.addEventListener("DOMContentLoaded", () => {
            if (!el.isConnected && doc.body) {
                doc.body.appendChild(el);
            }
        }, { once: true });
    }
    rootEl = el;
    return rootEl;
}
function escapeHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
