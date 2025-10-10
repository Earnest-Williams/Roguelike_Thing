// src/ui/debug-overlay.js
// @ts-check
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

    subscribe("*", () => {
      this.renderLog();
    });
  }

  #createRoot() {
    const el = document.createElement("div");
    el.className =
      "fixed top-2 right-2 z-50 bg-black/70 text-white font-mono text-xs rounded-lg p-3 w-[360px] max-h-[60vh] overflow-hidden flex flex-col gap-2";
    el.innerHTML = `
      <div class="dbg-stats whitespace-pre leading-4"></div>
      <div class="dbg-log flex-1 overflow-auto border-t border-white/20 pt-2"></div>
    `;
    document.body.appendChild(el);
    return el;
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
    lines.push(`Resists: ${fmtMap(a.modCache?.resists)}`);
    lines.push(`Affins : ${fmtMap(a.modCache?.affinities)}`);
    const brands = Array.isArray(a.modCache?.brands)
      ? a.modCache.brands
          .map((b) => `${b.type}+${b.flat || 0}/${Math.round((b.pct || 0) * 100)}%`)
          .join(", ")
      : "";
    lines.push(`Brands : ${brands || "-"}`);
    if (this.statsEl) {
      this.statsEl.textContent = lines.join("\n");
    }
  }

  renderLog() {
    if (!this.logEl) return;
    const entries = latest(60).slice().reverse();
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
  return `<div>• ${e.type}</div>`;
}

function fmtMap(obj) {
  if (!obj) return "-";
  const keys = Object.keys(obj);
  if (!keys.length) return "-";
  return keys
    .map((k) => `${k}:${Math.round((Number(obj[k]) || 0) * 100)}%`)
    .join(" ");
}
