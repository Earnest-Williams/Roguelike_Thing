// src/ui/sound.js
// @ts-check

import { DEFAULT_MARTIAL_DAMAGE_TYPE, MARTIAL_DAMAGE_TYPES } from "../../js/constants.js";

const SOUND_PARAMS = Object.freeze({
  coin: [1, , 1230, 0.02, 0.04, 0.18, 1, 1.5, 6, , , , , , , 0.1, 0.06, 0.22, 0.04, 0.5],
  sword: [1, , 200, , 0.02, 0.01, 2, 0.4, , , 50, , 0.01, , 3, , 0.02, 0.83, 0.01, 0.25],
  spell: [1.1, , 880, 0.08, 0.2, 0.8, 1, 1.5, , 0.5, , , 0.5, , 0.5, 0.02, 0.08, 0.3, 0.02],
  heal: [0.6, , 880, 0.05, 0.25, 0.4, , 1.2, , 12, 120, , 0.02, 0.2, , 0.05, 0.1, 0.35, 0.03],
  door: [0.9, , 80, 0.15, 0.03, 0.22, 1, 0.7, , 0.2, , 3, , 2.8, , 0.03, 0.02, 0.18, 0.04],
});

/** @returns {any} */
function getGlobal() {
  // eslint-disable-next-line no-undef
  return typeof globalThis !== "undefined" ? globalThis : undefined;
}

/** @returns {((...args: any[]) => any) | undefined} */
function getZzfx() {
  const g = getGlobal();
  if (!g) return undefined;
  const fn = g.zzfx;
  return typeof fn === "function" ? fn : undefined;
}

const MARTIAL_DAMAGE_SET = new Set(
  Array.isArray(MARTIAL_DAMAGE_TYPES)
    ? MARTIAL_DAMAGE_TYPES.map((t) => String(t).toLowerCase())
    : [String(DEFAULT_MARTIAL_DAMAGE_TYPE).toLowerCase()],
);

function isMartialType(type) {
  if (!type) return false;
  return MARTIAL_DAMAGE_SET.has(String(type).toLowerCase());
}

let unlocked = false;
let muted = false;
let initRegistered = false;

function warmup(suppressLogs = true) {
  if (muted || unlocked) return unlocked;
  const fn = getZzfx();
  if (typeof fn !== "function") {
    muted = true;
    return false;
  }
  try {
    fn(...[0]);
    unlocked = true;
    return true;
  } catch (err) {
    if (!suppressLogs && typeof console !== "undefined" && console.warn) {
      console.warn("[sound] Unable to unlock audio context", err);
    }
    return false;
  }
}

function ensureUnlocked() {
  if (muted) return false;
  if (unlocked) return true;
  return warmup();
}

function createPreset(params) {
  return () => {
    const fn = getZzfx();
    if (typeof fn !== "function") {
      throw new Error("zzfx unavailable");
    }
    fn(...params);
  };
}

const PRESETS = Object.freeze(
  Object.fromEntries(
    Object.entries(SOUND_PARAMS).map(([name, params]) => [name, createPreset(params)]),
  ),
);

function playPreset(name) {
  if (muted) return;
  if (!ensureUnlocked()) return;
  const preset = PRESETS[name];
  if (typeof preset !== "function") return;
  try {
    preset();
  } catch (err) {
    muted = true;
    if (typeof console !== "undefined" && console.warn) {
      console.warn(`[sound] Failed to play "${name}"`, err);
    }
  }
}

function hasNonPhysicalDamage(packets) {
  if (!packets || typeof packets !== "object") return false;
  for (const [type, value] of Object.entries(packets)) {
    if (!value) continue;
    if (!isMartialType(type)) return true;
  }
  return false;
}

function registerUnlockListeners() {
  if (initRegistered || muted) return;
  if (typeof document === "undefined") return;
  if (typeof getZzfx() !== "function") return;
  const handler = () => {
    warmup();
  };
  const opts = { once: true, passive: true };
  try {
    document.addEventListener("pointerdown", handler, opts);
    document.addEventListener("keydown", handler, opts);
  } catch (err) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[sound] Failed to register unlock listeners", err);
    }
  }
  initRegistered = true;
}

/**
 * @param {any} payload
 */
function playAttackFromPayload(payload) {
  if (muted || !payload) return;
  const attackKind =
    payload.mode ||
    (payload.ctx && payload.ctx.attackKind) ||
    (payload.profile && payload.profile.kind) ||
    null;
  const packets =
    payload.packets ||
    payload.packetsAfterDefense ||
    (payload.out && payload.out.packetsAfterDefense) ||
    null;
  const profileType = typeof payload.profile?.type === "string" ? payload.profile.type : "";
  const elemental = hasNonPhysicalDamage(packets) || (profileType && !isMartialType(profileType));

  if (attackKind === "melee") {
    playPreset("sword");
    return;
  }

  if (attackKind === "ranged" || attackKind === "throw" || elemental) {
    playPreset("spell");
    return;
  }

  playPreset("sword");
}

function playLootSfx(itemOrStack) {
  if (muted) return;
  const item = itemOrStack?.item || itemOrStack || null;
  const kind = typeof item?.kind === "string" ? item.kind.toLowerCase() : "";
  const id = typeof item?.id === "string" ? item.id.toLowerCase() : "";
  const name = typeof item?.name === "string" ? item.name.toLowerCase() : "";

  if (kind === "currency" || id === "gold" || name.includes("gold")) {
    playPreset("coin");
    return;
  }

  playPreset("coin");
}

const Sound = Object.freeze({
  init() {
    if (muted) return;
    registerUnlockListeners();
    warmup();
  },
  playAttack: playAttackFromPayload,
  playLoot: playLootSfx,
  playHeal() {
    playPreset("heal");
  },
  playDoor() {
    playPreset("door");
  },
  playSpell() {
    playPreset("spell");
  },
  playSword() {
    playPreset("sword");
  },
});

const PUBLIC_SFX = Object.freeze({
  coin: () => playPreset("coin"),
  sword: () => playPreset("sword"),
  spell: () => playPreset("spell"),
  heal: () => playPreset("heal"),
  door: () => playPreset("door"),
});

const globalObject = getGlobal();
if (globalObject && !globalObject.sfx) {
  globalObject.sfx = PUBLIC_SFX;
}

export { Sound, PUBLIC_SFX as sfx };
