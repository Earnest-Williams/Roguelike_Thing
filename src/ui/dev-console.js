// src/ui/dev-console.js
// @ts-check
import {
  DEV_CONSOLE_DEFAULT_SIM_ITERATIONS,
  DEV_CONSOLE_DEFAULT_STATUS_DURATION,
  DEV_CONSOLE_DEFAULT_STATUS_STACKS,
  DEV_CONSOLE_LOOT_TOAST_HIDE_DELAY_MS,
  DEV_CONSOLE_LOOT_TOAST_TRANSITION_MS,
  DEV_CONSOLE_LOOT_TOAST_TRANSLATE_Y_PX,
  DEV_CONSOLE_LOOT_TOAST_VISIBLE_DURATION_MS,
  DEV_CONSOLE_LOOT_TOAST_CONTAINER_BOTTOM_PX,
  DEV_CONSOLE_LOOT_TOAST_CONTAINER_GAP_PX,
  DEV_CONSOLE_LOOT_TOAST_CONTAINER_RIGHT_PX,
  DEV_CONSOLE_LOOT_TOAST_CONTAINER_Z_INDEX,
  DEV_CONSOLE_LOOT_TOAST_BOX_SHADOW,
  DEV_CONSOLE_LOOT_TOAST_BORDER_RADIUS_PX,
  DEV_CONSOLE_LOOT_TOAST_FONT_SIZE_PX,
  DEV_CONSOLE_LOOT_TOAST_PADDING,
  DEV_CONSOLE_RAF_FALLBACK_DELAY_MS,
} from "../config.js";
import { createActorFromTemplate, createItem } from "../factories/index.js";
import { pickLoot } from "../factories/loot.js";
import { applyStatuses } from "../combat/status.js";
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
          const id = args[0];
          const dur = +args[1] || DEV_CONSOLE_DEFAULT_STATUS_DURATION;
          const stacks = +args[2] || DEV_CONSOLE_DEFAULT_STATUS_STACKS;
          applyStatuses(
            { statusAttempts: [{ id, baseDuration: dur, stacks }] },
            ctx.playerActor,
            ctx.playerActor,
            ctx.turn?.() ?? 0,
          );
          log(`status ${id} dur=${dur} stacks=${stacks}`);
          break;
        }
        case "/loot": {
          const table = args[0]; const drop = pickLoot(table);
          if (drop) {
            ctx.addItemToInventory(drop);
            showLootToast(drop);
          }
          const affixInfo = describeAffixes(drop);
          const label = drop ? `${drop.name || drop.id}${affixInfo}` : "nothing";
          log(`loot ${table}: ${label}`);
          break;
        }
        case "/fight": {
          const t = ctx.getTarget?.(); if (!t) { log("no target"); break; }
          const equip = ctx.playerActor.equipment || {};
          const mh =
            equip[SLOT.RightHand] ||
            equip.RightHand ||
            equip[SLOT.LeftHand] ||
            equip.LeftHand;
          const item = mh?.item || mh;
          const r = performEquippedAttack(ctx.playerActor, t, item, 1);
          log(`attack: ${r.ok} dmg=${r.outcome?.total||0}`); break;
        }
        case "/sim": {
          const N = +args[0] || DEV_CONSOLE_DEFAULT_SIM_ITERATIONS;
          import("../sim/sim.js").then(({ simulate, SIMULATION_CONFIG })=>{
            const seedArg = args[1];
            const seed = seedArg ? +seedArg : SIMULATION_CONFIG.DEFAULT_SEED;
            const out = simulate({ a:"brigand", b:"dummy", N, seed });
            log(JSON.stringify({ ...out, config: SIMULATION_CONFIG }));
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
  const names = affixNames(drop);
  return names.length ? ` [${names.join(" · ")}]` : "";
}

function affixNames(drop) {
  if (!drop) return [];
  const affixes = Array.isArray(drop.affixes) ? drop.affixes : [];
  return affixes
    .map((a) => (a && typeof a.id === "string" ? a.id : null))
    .filter(Boolean)
    .map(formatAffixName);
}

function formatAffixName(id) {
  return String(id)
    .replace(/_/g, " ")
    .replace(/\b([a-z])/g, (_, ch) => ch.toUpperCase());
}

let lootToastContainer = null;

function ensureLootToastContainer() {
  if (lootToastContainer && lootToastContainer.isConnected) return lootToastContainer;
  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.right = `${DEV_CONSOLE_LOOT_TOAST_CONTAINER_RIGHT_PX}px`;
  el.style.bottom = `${DEV_CONSOLE_LOOT_TOAST_CONTAINER_BOTTOM_PX}px`;
  el.style.display = "flex";
  el.style.flexDirection = "column";
  el.style.alignItems = "flex-end";
  el.style.gap = `${DEV_CONSOLE_LOOT_TOAST_CONTAINER_GAP_PX}px`;
  el.style.pointerEvents = "none";
  el.style.zIndex = `${DEV_CONSOLE_LOOT_TOAST_CONTAINER_Z_INDEX}`;
  document.body.appendChild(el);
  lootToastContainer = el;
  return el;
}

function showLootToast(drop) {
  const names = affixNames(drop);
  if (!names.length) return;
  const container = ensureLootToastContainer();
  const toast = document.createElement("div");
  toast.textContent = `${drop.name || drop.id} — ${names.join(" · ")}`;
  toast.style.background = "rgba(15,23,42,0.92)";
  toast.style.color = "#f8fafc";
  toast.style.padding = DEV_CONSOLE_LOOT_TOAST_PADDING;
  toast.style.borderRadius = `${DEV_CONSOLE_LOOT_TOAST_BORDER_RADIUS_PX}px`;
  toast.style.fontFamily = "monospace";
  toast.style.fontSize = `${DEV_CONSOLE_LOOT_TOAST_FONT_SIZE_PX}px`;
  toast.style.boxShadow = DEV_CONSOLE_LOOT_TOAST_BOX_SHADOW;
  toast.style.opacity = "0";
  toast.style.transform = `translateY(${DEV_CONSOLE_LOOT_TOAST_TRANSLATE_Y_PX}px)`;
  toast.style.transition = `opacity ${DEV_CONSOLE_LOOT_TOAST_TRANSITION_MS}ms ease-out, transform ${DEV_CONSOLE_LOOT_TOAST_TRANSITION_MS}ms ease-out`;
  container.appendChild(toast);
  const raf =
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (fn) => setTimeout(fn, DEV_CONSOLE_RAF_FALLBACK_DELAY_MS);
  raf(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = `translateY(${DEV_CONSOLE_LOOT_TOAST_TRANSLATE_Y_PX}px)`;
    setTimeout(() => {
      if (toast.parentElement === container) toast.remove();
    }, DEV_CONSOLE_LOOT_TOAST_HIDE_DELAY_MS);
  }, DEV_CONSOLE_LOOT_TOAST_VISIBLE_DURATION_MS);
}
