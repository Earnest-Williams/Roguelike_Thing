// src/ui/dev-console.js
// @ts-check
import { createActorFromTemplate, createItem } from "../factories/index.js";
import { pickLoot } from "../factories/loot.js";
import { applyStatus } from "../combat/status.js";
import { performEquippedAttack } from "../game/combat-glue.js";
import { SLOT } from "../../constants.js";
import { emit, EVENT } from "./event-log.js";

export function attachDevConsole(ctx) {
  // ctx should expose: playerActor, spawnActor, removeActor, addItemToInventory, equipToSlot, getTarget
  const input = document.createElement("input");
  input.className = "fixed left-2 bottom-2 w-[560px] bg-black/70 text-white font-mono p-2 rounded";
  input.placeholder = "dev> /help";
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const line = input.value.trim(); input.value = "";
      run(line);
    }
  });
  document.body.appendChild(input);

  /** @param {string} line */
  function run(line) {
    if (!line) return;
    const [cmd, ...args] = line.split(/\s+/);
    try {
      switch (cmd) {
        case "/help":
          log("Commands: /spawn <tid>, /give <itemId>, /equip <slot> <itemId>, /status <id> <dur> <stacks>, /loot <table>, /fight, /sim <N>");
          break;
        case "/spawn": {
          const tid = args[0]; const a = createActorFromTemplate(tid);
          ctx.spawnActor(a); log(`spawned ${tid}`); break;
        }
        case "/give": {
          const id = args[0]; const it = createItem(id);
          ctx.addItemToInventory(it); log(`gave ${id}`); break;
        }
        case "/equip": {
          const slot = args[0]; const id = args[1];
          const it = createItem(id); ctx.equipToSlot(slot, it); log(`equip ${id} -> ${slot}`); break;
        }
        case "/status": {
          const id = args[0]; const dur = +args[1]||5; const stacks = +args[2]||1;
          applyStatus(ctx.playerActor, id, dur, stacks); log(`status ${id} dur=${dur} stacks=${stacks}`); break;
        }
        case "/loot": {
          const table = args[0]; const drop = pickLoot(table);
          if (drop) ctx.addItemToInventory(drop);
          const affixInfo = describeAffixes(drop);
          const label = drop ? `${drop.name || drop.id}${affixInfo}` : "nothing";
          log(`loot ${table}: ${label}`);
          break;
        }
        case "/fight": {
          const t = ctx.getTarget?.(); if (!t) { log("no target"); break; }
          const mh = ctx.playerActor.equipment[SLOT.RightHand] || ctx.playerActor.equipment[SLOT.LeftHand];
          const item = mh?.item || mh;
          const r = performEquippedAttack(ctx.playerActor, t, item, 1);
          log(`attack: ${r.ok} dmg=${r.outcome?.total||0}`); break;
        }
        case "/sim": {
          const N = +args[0]||40;
          import("../sim/sim.js").then(({ simulate })=>{
            const out = simulate({ a:"brigand", b:"dummy", N, seed:20251010 });
            log(JSON.stringify(out));
          });
          break;
        }
        default: log("unknown. /help"); break;
      }
    } catch (err) {
      log("ERR: " + (err?.message||err));
    }
  }

  function log(msg) {
    emit(EVENT.CONSOLE, { who:"console", msg });
    console.log("[dev]", msg);
  }
}

function describeAffixes(drop) {
  const affixes = Array.isArray(drop?.affixes) ? drop.affixes : null;
  if (!affixes || !affixes.length) return "";
  const parts = affixes
    .map((a) => a?.id)
    .filter(Boolean)
    .map((id) => id.replace(/_/g, " ").replace(/\b([a-z])/g, (_, ch) => ch.toUpperCase()));
  return parts.length ? ` [${parts.join(" · ")}]` : "";
}
