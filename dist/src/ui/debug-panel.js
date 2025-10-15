// src/ui/debug-panel.js
// Lightweight developer overlay to inspect attack resolution packets.
/**
 * Render a JSON summary of an attack context in a floating panel.
 * @param {any} ctx
 */
export function showAttackDebug(ctx) {
    if (typeof document === "undefined")
        return;
    const el = document.getElementById("attack-debug") ||
        (() => {
            const wrapper = document.createElement("div");
            wrapper.id = "attack-debug";
            wrapper.style.position = "absolute";
            wrapper.style.right = "8px";
            wrapper.style.bottom = "8px";
            wrapper.style.maxWidth = "44vw";
            wrapper.style.maxHeight = "45vh";
            wrapper.style.overflow = "auto";
            wrapper.style.background = "rgba(0,0,0,.72)";
            wrapper.style.color = "#9f9";
            wrapper.style.padding = "8px";
            wrapper.style.fontFamily = "monospace";
            wrapper.style.fontSize = "12px";
            wrapper.style.lineHeight = "1.35";
            document.body.appendChild(wrapper);
            return wrapper;
        })();
    const attackerName = ctx?.attacker?.name || ctx?.attacker?.id || "?";
    const defenderName = ctx?.defender?.name || ctx?.defender?.id || "?";
    const steps = Array.isArray(ctx?.steps)
        ? ctx.steps.map((step) => ({
            stage: step.stage,
            totals: step.packets?.byType,
            meta: step.meta,
        }))
        : [];
    const sliceLog = (log) => {
        if (!log || typeof log.toArray !== "function")
            return [];
        const arr = log.toArray();
        return arr.slice(Math.max(0, arr.length - 6));
    };
    const attackerLog = sliceLog(ctx?.attacker?.logs?.attack);
    const defenderLog = sliceLog(ctx?.defender?.logs?.attack);
    const defenderStatus = sliceLog(ctx?.defender?.logs?.status);
    const payload = {
        turn: ctx?.turn,
        attacker: attackerName,
        defender: defenderName,
        hpBefore: ctx?.hpBefore,
        hpAfter: ctx?.hpAfter,
        totalDamage: ctx?.totalDamage,
        steps,
        packets: {
            pre: ctx?.prePackets?.byType ?? ctx?.prePackets,
            offense: ctx?.packetsAfterOffense?.byType ?? ctx?.packetsAfterOffense,
            defense: ctx?.packetsAfterDefense?.byType ?? ctx?.packetsAfterDefense,
        },
        statuses: {
            attempts: ctx?.statusAttempts,
            applied: ctx?.appliedStatuses,
        },
        hooks: ctx?.hooks,
        logs: {
            attacker: attackerLog,
            defender: defenderLog,
            defenderStatus,
        },
    };
    el.textContent = JSON.stringify(payload, null, 2);
}
