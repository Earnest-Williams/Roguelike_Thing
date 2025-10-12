// src/ui/debug-panel.js
// Lightweight developer overlay to inspect attack resolution packets.

/**
 * Render a JSON summary of an attack context in a floating panel.
 * @param {any} ctx
 */
export function showAttackDebug(ctx) {
  if (typeof document === "undefined") return;
  const el =
    document.getElementById("attack-debug") ||
    (() => {
      const d = document.createElement("pre");
      d.id = "attack-debug";
      d.style.position = "absolute";
      d.style.right = "8px";
      d.style.bottom = "8px";
      d.style.maxWidth = "40vw";
      d.style.maxHeight = "40vh";
      d.style.overflow = "auto";
      d.style.background = "rgba(0,0,0,.7)";
      d.style.color = "#9f9";
      d.style.padding = "8px";
      document.body.appendChild(d);
      return d;
    })();
  el.textContent = JSON.stringify(
    {
      pre: ctx?.prePackets,
      offense: ctx?.packetsAfterOffense,
      defense: ctx?.packetsAfterDefense,
      total: ctx?.totalDamage,
      statuses: ctx?.statusAttempts,
    },
    null,
    2,
  );
}
