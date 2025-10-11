// src/ui/debug-overlay.js
// @ts-check
import {
  DEBUG_OVERLAY_BREAKDOWN_LIMIT,
  DEBUG_OVERLAY_LOG_LIMIT,
  DEBUG_OVERLAY_MIN_PERCENT_DISPLAY,
  DEBUG_OVERLAY_NUMBER_DIGITS,
} from "../config.js";
import { subscribe, latest, EVENT } from "./event-log.js";

export class DebugOverlay {
  /**
   * @param {{ root?: HTMLElement | null, actorProvider: () => any }} opts
   */
  constructor({ root = null, actorProvider }) {
    this.actorProvider = actorProvider;
    this.root = root || this.#createRoot();
    this.logEl = this.root.querySelector(".dbg-log");
    this.statsEl = this.root.querySelector(".dbg-stats");
    this.filterEl = this.root.querySelector(".dbg-filter");
    this.lastCombat = null;
    this.filterSet = new Set([EVENT.COMBAT, EVENT.STATUS, EVENT.TURN, EVENT.CONSOLE]);

    subscribe("*", () => {
      this.renderLog();
    });
    subscribe(EVENT.COMBAT, (entry) => {
      this.lastCombat = entry;
      this.renderStats();
    });

    this.#initFilters();
    this.renderLog();
  }

  #createRoot() {
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
  }

  #chipClass(active) {
    const base =
      "px-2 py-1 rounded border text-[10px] tracking-wide uppercase transition-colors";
    return active
      ? `${base} border-cyan-300 bg-cyan-500/20`
      : `${base} border-white/20 text-white/60 hover:border-white/40`;
  }

  #initFilters() {
    if (!this.filterEl) return;
    const entries = [
      { type: EVENT.COMBAT, label: "COMBAT" },
      { type: EVENT.STATUS, label: "STATUS" },
      { type: EVENT.TURN, label: "TURN" },
      { type: EVENT.CONSOLE, label: "CONSOLE" },
    ];
    this.filterButtons = new Map();
    this.filterEl.innerHTML = "";
    for (const entry of entries) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.type = entry.type;
      btn.textContent = entry.label;
      btn.className = this.#chipClass(true);
      btn.addEventListener("click", () => {
        if (this.filterSet.has(entry.type)) {
          this.filterSet.delete(entry.type);
        } else {
          this.filterSet.add(entry.type);
        }
        if (this.filterSet.size === 0) {
          this.filterSet.add(entry.type);
        }
        this.#updateFilterButtons();
        this.renderLog();
      });
      this.filterButtons.set(entry.type, btn);
      this.filterEl.appendChild(btn);
    }
    this.#updateFilterButtons();
  }

  #updateFilterButtons() {
    if (!this.filterButtons) return;
    for (const [type, btn] of this.filterButtons.entries()) {
      const active = this.filterSet.has(type);
      btn.className = this.#chipClass(active);
    }
  }

  renderStats() {
    const a = this.actorProvider?.();
    if (!a) return;
    const lines = [];
    const name = a.name ?? a.id ?? "?";
    const hp = a.res?.hp;
    const maxHp = a.base?.maxHP ?? a.baseStats?.maxHP;
    const ap = a.ap;
    const apCap = a.apCap;
    lines.push(`Actor: ${name}  HP:${hp}/${maxHp}  AP:${ap}/${apCap}`);
    if (typeof a.totalActionCostMult === "function") {
      lines.push(
        `Speed x: ${a.totalActionCostMult().toFixed(2)}  CD x: ${
          typeof a.totalCooldownMult === "function" ? a.totalCooldownMult().toFixed(2) : "1.00"
        }`,
      );
    }
    const statuses = Array.isArray(a.statuses)
      ? a.statuses.map((s) => `${s.id}(${s.stacks},${Math.round(s.remaining ?? 0)})`).join(", ")
      : "-";
    lines.push(`Statuses: ${statuses || "-"}`);
    lines.push(`Resists: ${fmtMap(resolveResists(a))}`);
    lines.push(`Affins : ${fmtMap(resolveAffinities(a))}`);
    lines.push(`Brands : ${fmtBrands(a)}`);

    if (this.lastCombat?.payload) {
      const p = this.lastCombat.payload;
      lines.push("Last Attack:");
      lines.push(
        `  ${p.who} → ${p.vs} [${p.profile?.type ?? "?"}] = ${p.damage} (${p.mode})`,
      );
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

  renderLog() {
    if (!this.logEl) return;
    const entries = latest(DEBUG_OVERLAY_LOG_LIMIT)
      .slice()
      .reverse()
      .filter((e) => this.filterSet.has(e.type));
    this.logEl.innerHTML = entries.map((e) => renderEntry(e)).join("");
  }
}

function renderEntry(e) {
  if (e.type === EVENT.COMBAT) {
    const p = e.payload;
    return `<div>⚔️ ${p.who} → ${p.vs} [${p.mode}/${p.profile.type}] dmg=${p.damage} hp:${p.hpBefore}→${p.hpAfter} ${p.note || ""}</div>`;
  }
  if (e.type === EVENT.STATUS) {
    const p = e.payload;
    return `<div>✴️ ${p.who}: ${p.id} ${p.action}${p.stacks ? ` x${p.stacks}` : ""}</div>`;
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

function fmtMap(obj) {
  if (!obj) return "-";
  if (obj instanceof Map) {
    const pairs = [];
    for (const [k, v] of obj.entries()) {
      pairs.push([k, v]);
    }
    return fmtPairs(pairs);
  }
  const keys = Object.keys(obj);
  if (!keys.length) return "-";
  return fmtPairs(keys.map((k) => [k, obj[k]]));
}

function fmtPairs(entries) {
  const out = [];
  for (const [k, raw] of entries) {
    const num = Number(raw);
    if (!Number.isFinite(num)) continue;
    if (Math.abs(num) < DEBUG_OVERLAY_MIN_PERCENT_DISPLAY) continue;
    out.push(`${k}:${Math.round(num * 100)}%`);
  }
  return out.length ? out.join(" ") : "-";
}

function resolveResists(actor) {
  return actor?.modCache?.resists || actor?.modCache?.defense?.resists || null;
}

function resolveAffinities(actor) {
  return (
    actor?.modCache?.affinities || actor?.modCache?.offense?.affinities || null
  );
}

function fmtBrands(actor) {
  const direct = Array.isArray(actor?.modCache?.brands)
    ? actor.modCache.brands
    : null;
  const legacy = Array.isArray(actor?.modCache?.offense?.brandAdds)
    ? actor.modCache.offense.brandAdds
    : null;
  const list = direct || legacy;
  if (!list || !list.length) return "-";
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

function formatBreakdownStep(step) {
  if (!step) return "?";
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

function fmtNumber(value, digits = DEBUG_OVERLAY_NUMBER_DIGITS) {
  if (!Number.isFinite(value)) return "0";
  return Number(value).toFixed(digits);
}

function fmtDelta(value, digits = DEBUG_OVERLAY_NUMBER_DIGITS) {
  if (!Number.isFinite(value)) return "0";
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${fmtNumber(value, digits)}`;
}
