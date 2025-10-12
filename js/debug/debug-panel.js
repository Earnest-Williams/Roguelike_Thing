// js/debug/debug-panel.js
// Developer overlay for inspecting combat resolution packets.

import { DebugBus } from "./debug-bus.js";

if (typeof window !== "undefined" && typeof document !== "undefined") {
  (function mountDebugPanel() {
    const root = document.createElement("div");
    root.id = "debug-panel";
    Object.assign(root.style, {
      position: "fixed",
      top: "8px",
      right: "8px",
      zIndex: 9999,
      width: "420px",
      maxHeight: "80vh",
      overflow: "auto",
      background: "rgba(0, 0, 0, 0.8)",
      color: "#eee",
      font: "12px/1.4 monospace",
      padding: "8px",
      borderRadius: "12px",
      boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
      display: "none",
    });
    document.body.appendChild(root);

    let enabled = false;
    function setVisible(v) {
      enabled = v;
      root.style.display = v ? "block" : "none";
    }

    window.addEventListener("keydown", (e) => {
      if (e.key === "F3") {
        setVisible(!enabled);
      }
    });

    function renderAttack(evt) {
      if (!enabled || !evt || evt.type !== "attack") return;
      const { payload } = evt;
      if (!payload) return;

      const summary = document.createElement("div");
      summary.style.margin = "6px 0 12px";

      const packets = payload.afterDefense || {};
      const packetKeys = Object.keys(packets).filter((key) => packets[key] > 0);
      const chips = packetKeys
        .map(
          (key) =>
            `<span style="display:inline-block;margin:0 6px 6px 0;padding:2px 6px;border-radius:6px;background:#222">${key}:${packets[key]}</span>`,
        )
        .join("");

      const applied = Array.isArray(payload.appliedStatuses)
        ? payload.appliedStatuses.map((s) => s?.id || String(s)).join(", ") || "—"
        : "—";

      summary.innerHTML = `
        <div><strong>Packets:</strong> ${chips || "—"}</div>
        <div><strong>Total:</strong> ${payload.totalDamage ?? 0}</div>
        <div><strong>Status Applied:</strong> ${applied}</div>
      `;

      const pre = document.createElement("pre");
      pre.style.whiteSpace = "pre-wrap";
      pre.style.margin = "0 0 8px 0";
      pre.textContent = JSON.stringify(payload, null, 2);

      root.prepend(pre);
      root.prepend(summary);

      while (root.childElementCount > 20) {
        root.removeChild(root.lastChild);
      }
    }

    DebugBus.on(renderAttack);
  })();
}
