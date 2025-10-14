import {
  TILE_FLOOR,
  TILE_WALL,
  DEFAULT_MOB_HP,
  DEFAULT_MOB_SPEED,
  DEFAULT_INVENTORY_CAPACITY,
  SHORT_TERM_MEMORY_PENALTY,
  CARDINAL_DIRECTIONS,
  WEAPON_CATEGORY,
  ATTACK_KIND,
  THROW_CLASS,
  FOV_TRANSFORMS,
  DAMAGE_TYPE,
  DEFAULT_MARTIAL_DAMAGE_TYPE,
  STATUS_IDS,
  SLOT,
  ALL_SLOTS_ORDER,
} from "./js/constants.js";
import {
  shuffle,
  posKey,
  posKeyFromCoords,
  randChoice,
  clamp,
  getNow,
  smoothstep01,
  chebyshevDistance,
  hasLineOfSight,
  clamp01Normalized,
} from "./js/utils.js";
import { CONFIG } from "./src/config.js";
import { createInitialState } from "./src/game/state.js";
import { ChapterState } from "./src/game/chapter-state.js";
import { FactionService } from "./src/game/faction-service.js";
import { mulberry32 } from "./src/sim/sim.js";
import { collectWorldLightSources } from "./src/sim/lights.js";
import { AIPlanner } from "./src/combat/ai-planner.js";
import { updatePerception } from "./src/sim/senses.js";
import { Actor } from "./src/combat/actor.js";
import { attachLogs } from "./src/combat/debug-log.js";
import { foldModsFromEquipment } from "./src/combat/mod-folding.js";
import {
  Item,
  ItemStack,
  makeItem,
  classifyThrowability,
  throwPenaltiesFor,
  buildEffectiveThrowProfile,
  getAttackModesForItem,
  getThrowProfileForItem,
} from "./js/item-system.js";
import { CanvasRenderer } from "./js/render/canvas-renderer.js";
import { RenderController } from "./js/render/controller.js";
import { mountDevPanel } from "./js/render/presenters.js";
import { resolveAttack } from "./src/combat/attack.js";
import { Sound } from "./src/ui/sound.js";
import { DebugOverlay } from "./src/ui/debug-overlay.js";
import { emit, EVENT } from "./src/ui/event-log.js";
import { UIManager } from "./src/ui/UIManager.js";
import {
  FurnitureKind,
  FurnitureOrientation,
  Door,
  DOOR_TYPE,
  DOOR_STATE,
  DOOR_VARIANT_IDS,
  FURNITURE_EFFECT_IDS,
} from "./src/world/furniture/index.js";
import { generateDoorsForDungeon } from "./src/world/dungeon/door-placement.js";
import {
  computeFieldOfView,
  computeLightOverlayVisuals,
} from "./src/world/fov.js";
import { createCompositeLightContext, compositeOverlayAt } from "./src/world/light_math.js";
import { setAIOverlayEnabled, updateAIOverlay } from "./src/debug/ai_overlay.js";
import "./src/combat/status-registry.js";
import {
  STATUS_REGISTRY,
  applyStatuses,
  getStatusDefinitionCore,
  rebuildStatusDerivedCore,
  tickStatusesAtTurnStart,
} from "./src/combat/status.js";
import { setStatusDamageAdapter } from "./src/content/statuses.js";

Sound.init();

let debugPanelLoader = null;
let debugPanelToggleCount = 0;

function loadDebugPanelModule() {
  if (!debugPanelLoader) {
    debugPanelLoader = import("./js/debug/debug-panel.js")
      .then((mod) => {
        if (!mod || typeof mod.ensureDebugPanel !== "function") {
          return null;
        }
        const api = mod.ensureDebugPanel();
        if (api && typeof globalThis !== "undefined") {
          try {
            const g = /** @type {any} */ (globalThis);
            g.__debugPanel = api;
          } catch {
            // ignore assignment failures
          }
        }
        return api || null;
      })
      .catch((err) => {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[debug] Failed to load debug panel", err);
        }
        debugPanelLoader = null;
        return null;
      });
  }
  return debugPanelLoader;
}

function queueDebugPanelToggle() {
  debugPanelToggleCount += 1;
  loadDebugPanelModule().then((api) => {
    if (!api || typeof api.toggle !== "function") {
      debugPanelToggleCount = 0;
      return;
    }
    const toggles = debugPanelToggleCount;
    debugPanelToggleCount = 0;
    if (toggles % 2 === 1) {
      try {
        api.toggle();
      } catch (err) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[debug] Failed to toggle debug panel", err);
        }
      }
    }
  });
}

function shouldBootstrapDebugPanel() {
  if (typeof window === "undefined") return false;
  const w = window;
  const flags = /** @type {any} */ (w.DEBUG_FLAGS);
  if (flags && (flags.debugPanel || flags.devPanel || flags.attackDebug)) {
    return true;
  }
  const search = typeof w.location?.search === "string" ? w.location.search : "";
  if (search && typeof URLSearchParams === "function") {
    try {
      const params = new URLSearchParams(search);
      const value = params.get("debugPanel");
      if (value === "" || value === "1" || value === "true") {
        return true;
      }
    } catch {
      // ignore URL parsing issues
    }
  }
  try {
    const stored = w.localStorage?.getItem?.("debug-panel");
    if (stored === "1" || stored === "true") {
      return true;
    }
  } catch {
    // ignore storage access issues
  }
  return false;
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (event) => {
    if (event.key === "F3") {
      event.preventDefault();
      queueDebugPanelToggle();
    }
  });

  const g = /** @type {any} */ (window);
  g.loadDebugPanel = () => {
    debugPanelToggleCount = 0;
    return loadDebugPanelModule().then((api) => api?.show?.());
  };
  g.hideDebugPanel = () => {
    debugPanelToggleCount = 0;
    return loadDebugPanelModule().then((api) => api?.hide?.());
  };
  g.toggleDebugPanel = () => {
    debugPanelToggleCount = 0;
    return loadDebugPanelModule().then((api) => api?.toggle?.());
  };

  if (shouldBootstrapDebugPanel()) {
    loadDebugPanelModule().then((api) => api?.show?.());
  }
}

// Route periodic status damage through the full attack resolution pipeline so that
// damage numbers, resistances, and triggers work exactly like direct attacks.
setStatusDamageAdapter(({ statusId, target, amount, type, turn }) => {
  const dmg = Math.max(0, Math.floor(Number(amount) || 0));
  if (!target || dmg <= 0) return 0;
  const ctx = resolveAttack({
    attacker: { id: `status:${statusId}` },
    defender: target,
    turn,
    base: 0,
    prePackets: [{ type: type || DEFAULT_MARTIAL_DAMAGE_TYPE, amount: dmg }],
    tags: ["status", statusId, "dot"],
  });
  return ctx?.totalDamage ?? 0;
});

function computeActorDelay(actor) {
  // Mobs can modify their base delay via status effects. We clamp to a minimum
  // positive delay so that buggy or extreme modifiers never freeze the timeline.
  if (!actor) return 1;
  const base = typeof actor.baseDelay === "number" ? actor.baseDelay : 1;
  const pct = actor.statusDerived?.actionSpeedPct ?? 0;
  const delay = base * (1 + pct);
  return delay > 0 ? delay : 0.1;
}

function resolveTurnRng(source) {
  if (typeof source === "function") return source;
  if (typeof source?.next === "function") {
    return () => source.next();
  }
  if (typeof source?.random === "function") {
    return () => source.random();
  }
  return Math.random;
}

function handleDeath(gameCtx, actor) {
  // Centralized death handling ensures UI, mob management, and state bookkeeping
  // stay consistent regardless of what triggered the fatal blow.
  if (!actor || actor.hp > 0) return false;
  if (actor.__dead) return true;
  actor.__dead = true;

  const manager = gameCtx?.mobManager;
  if (actor.kind !== "player" && manager?.removeById) {
    manager.removeById(actor.id);
  }

  if (actor.kind === "player") {
    const sim = gameCtx?.state?.sim;
    if (sim) {
      clearTimeout(sim.timeout);
      sim.timeout = null;
      sim.loopFn = null;
      sim.isPaused = true;
    }
    emit(EVENT.STATUS, {
      who: actor?.name ?? actor?.id ?? "player",
      msg: "You died",
      restartVisible: true,
      paused: true,
    });
  }

  return true;
}

globalThis.__applyStatusesImpl = applyStatuses;

class RingBuffer {
  // Lightweight fixed-size log used by debugging helpers so we can inspect the
  // most recent combat/status events without spamming the console.
  constructor(capacity = 64) {
    this.capacity = capacity;
    this.buffer = [];
  }
  push(value) {
    if (this.buffer.length >= this.capacity) {
      this.buffer.shift();
    }
    this.buffer.push(value);
  }
  toArray() {
    return this.buffer.slice();
  }
}

function attachDebug(mob) {
  // Inject a circular log onto a mob at runtime. This is intentionally opt-in so
  // it can be attached from dev tools without altering game logic.
  if (!mob || mob.__log) return;
  const rb = new RingBuffer(128);
  mob.__log = {
    push: (event) => rb.push(event),
    attackStep: (step, data) =>
      rb.push({ kind: "attack_step", step, data }),
    statusApply: (id, data) =>
      rb.push({ kind: "status_apply", id, data }),
    statusTick: (id, data) => rb.push({ kind: "status_tick", id, data }),
    statusExpire: (id, data) =>
      rb.push({ kind: "status_expire", id, data }),
    dump: () => rb.toArray(),
  };
}

window.attachDebug = attachDebug;
window.StatusRegistry = STATUS_REGISTRY;
window.STATUS_REGISTRY = STATUS_REGISTRY;
window.getStatus = getStatusDefinitionCore;
window.getStatusDefinition = getStatusDefinitionCore;
window.rebuildStatusDerived = rebuildStatusDerivedCore;
window.applyStatuses = applyStatuses;
window.resolveAttack = resolveAttack;

const Game = (() => {
  // Everything inside this closure runs once on boot and wires together DOM
  // elements, rendering systems, and the persistent `gameState` object.
  const gameState = createInitialState();
  gameState.config = gameState.config || {};

  if (typeof window !== "undefined") {
    window.addEventListener("keydown", (event) => {
      if (event.code === "F9") {
        event.preventDefault();
        const debug = gameState?.debug;
        if (!debug) return;
        debug.showAIOverlay = !debug.showAIOverlay;
        setAIOverlayEnabled(debug.showAIOverlay);
        if (debug.showAIOverlay) {
          updateAIOverlay(window.__AI_LAST_DECISION ?? null);
        }
      }
    });
  }

  const DEFAULT_TICKS_PER_SECOND = Number.isFinite(CONFIG?.ai?.ticksPerSecond)
    ? CONFIG.ai.ticksPerSecond
    : 12;
  const BASE_GENERATOR_HYBRID = (() => {
    try {
      return JSON.parse(JSON.stringify(CONFIG?.generator?.hybrid || {}));
    } catch {
      return {};
    }
  })();
  const MENU_SETTINGS_KEY = "rl_menu_settings";
  const LAST_RUN_MODE_KEY = "rl_last_run_mode";

  const viewportEl =
    (gameState.ui.viewport = document.getElementById("maze-viewport"));
  const canvas =
    (gameState.ui.canvas = document.getElementById("maze-canvas"));
  const statusDiv =
    (gameState.ui.statusDiv = document.getElementById("status"));
  const restartBtn =
    (gameState.ui.restartBtn = document.getElementById("restartBtn"));
  const equipmentSlotsDiv =
    (gameState.ui.equipmentSlots =
      document.getElementById("equipment-slots"));
  const inventorySlotsDiv =
    (gameState.ui.inventorySlots =
      document.getElementById("inventory-slots"));
  const speedSlider =
    (gameState.ui.speedSlider = document.getElementById("speed-slider"));
  const speedValue =
    (gameState.ui.speedValue = document.getElementById("speed-value"));
  const pauseIndicator =
    (gameState.ui.pauseIndicator =
      document.getElementById("pause-indicator"));
  const containerEl =
    (gameState.ui.container = document.getElementById("container"));
  let startMenuDom = null;
  let startMenuForm = null;

  const uiManager = new UIManager({
    status: statusDiv,
    restartButton: restartBtn,
    pauseIndicator,
    speedValue,
    equipmentSlots: equipmentSlotsDiv,
    inventorySlots: inventorySlotsDiv,
  });
  gameState.ui.manager = uiManager;

  const canvasRenderer = canvas ? new CanvasRenderer(canvas) : null;
  gameState.render.canvasRenderer = canvasRenderer;
  const renderController = canvasRenderer
    ? new RenderController(canvasRenderer)
    : null;
  gameState.render.renderController = renderController;
  let rendererReady = false;
  gameState.render.ready = rendererReady;

  let minimapModalEl =
    (gameState.ui.minimapModal = document.getElementById("minimapModal"));
  const minimapCanvasEl =
    (gameState.ui.minimapCanvas =
      document.getElementById("minimapCanvas"));
  let minimapCloseBtn =
    (gameState.ui.minimapClose = document.getElementById("minimapClose"));
  const minimapRenderer = minimapCanvasEl
    ? new CanvasRenderer(minimapCanvasEl)
    : null;
  gameState.render.minimapRenderer = minimapRenderer;
  const minimapController = minimapRenderer
    ? new RenderController(minimapRenderer)
    : null;
  gameState.render.minimapController = minimapController;

  const simState = gameState.sim;
  simState.timeout = null;
  simState.loopFn = null;
  simState.isPaused = false;
  simState.speed = CONFIG.ai.ticksPerSecond;
  simState.isReady = false;
  simState.turnCounter = 0;

  const debugState = gameState.debug;
  let devPanelMounted = debugState.devPanelMounted;
  let debugOverlayMounted = debugState.debugOverlayMounted;
  let debugOverlayInstance = debugState.debugOverlayInstance;

  const mapState = gameState.map;

  function rebuildFurnitureIndex(furniturePlacements = mapState.furniture) {
    // Furniture placement lookups are hot paths, so we rebuild a map keyed by
    // tile position whenever the placement array changes.
    mapState.furnitureIndex = new Map();
    if (!Array.isArray(furniturePlacements)) return;
    for (const placement of furniturePlacements) {
      if (!placement || !placement.position) continue;
      const px = Math.round(placement.position.x);
      const py = Math.round(placement.position.y);
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
      const keyStr = posKeyFromCoords(px, py);
      mapState.furnitureIndex.set(keyStr, placement);
    }
  }

  function normalizeFurniturePlacements(placements) {
    // Ensure every placement contains rounded integer coordinates so both
    // rendering and collision code can assume consistent data.
    if (!Array.isArray(placements)) return [];
    return placements
      .map((placement) => {
        if (!placement) return null;
        const rawPos = placement.position || placement.pos || {};
        const px = Math.round(rawPos.x ?? NaN);
        const py = Math.round(rawPos.y ?? NaN);
        if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
        return {
          ...placement,
          position: { x: px, y: py },
        };
      })
      .filter(Boolean);
  }

  function buildCulminationVaultPlacement(theme, endPos) {
    // Late-game themes can inject a special vault at the dungeon exit; we build
    // a synthetic furniture placement so level generation stays declarative.
    if (!theme || !endPos) return null;
    const px = Math.round(endPos.x ?? NaN);
    const py = Math.round(endPos.y ?? NaN);
    if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
    const culmination = theme.culminationEvent || theme.culmination || null;
    const tags = Array.isArray(culmination?.tags)
      ? culmination.tags.slice()
      : [];
    if (!tags.includes("vault")) tags.push("vault");
    return {
      furniture: {
        id: `chapter_vault:${theme.id}`,
        kind: "chapter_vault",
        name: culmination?.name || "Culmination Vault",
        tags,
        metadata: {
          themeId: theme.id,
          description: culmination?.description || "",
        },
      },
      position: { x: px, y: py },
      orientation: "none",
      metadata: {
        themeId: theme.id,
        tags,
      },
    };
  }

  const fovState = gameState.fov;
  fovState.overlayStyle = CONFIG.visual.colors.visibleOverlay;

  const explorationState = gameState.exploration;

  let player = gameState.player || {};
  if (!gameState.player) {
    gameState.player = player;
  }
  let mobManager = gameState.mobManager;
  let isEndRendered = gameState.isEndRendered;
  const INVALID_POSITION_COORD = -1;
  let prevPlayerPos = gameState.prevPlayerPos;
  let hasPrevPlayerPos = gameState.hasPrevPlayerPos;
  let currentEndPos = gameState.currentEndPos;
  let initRetries = gameState.initRetries;

  const rawLightConfig = CONFIG.visual.light || {};
  const LIGHT_CONFIG = {
    fallbackColor: rawLightConfig.fallbackColor || "#ffe9a6",
    fallbackFlickerRate:
      typeof rawLightConfig.fallbackFlickerRate === "number"
        ? rawLightConfig.fallbackFlickerRate
        : 0,
    baseOverlayAlpha:
      typeof rawLightConfig.baseOverlayAlpha === "number"
        ? rawLightConfig.baseOverlayAlpha
        : 0.2,
    flickerVariance:
      typeof rawLightConfig.flickerVariance === "number"
        ? rawLightConfig.flickerVariance
        : 0.12,
    flickerNearDeadZoneTiles:
      typeof rawLightConfig.flickerNearDeadZoneTiles === "number"
        ? rawLightConfig.flickerNearDeadZoneTiles
        : 1,
    flickerFalloffPower:
      typeof rawLightConfig.flickerFalloffPower === "number"
        ? rawLightConfig.flickerFalloffPower
        : 1.75,
    requireLineOfSight: Boolean(rawLightConfig.requireLineOfSight),
  };

  const VIEW_W = CONFIG.visual.view.width;
  const VIEW_H = CONFIG.visual.view.height;
  const MIN_CELL_SIZE = CONFIG.visual.minCellSize;
  let CELL_SIZE = CONFIG.visual.cellSize;
  let HALF_CELL = CELL_SIZE / 2;
  const MAX_INIT_RETRIES = CONFIG.general.maxInitRetries;

  // ===================== EQUIPMENT MODEL =====================

  // ---- Slot enum (canonical names)
  const SLOT = {
    Head: "Head",
    LeftHand: "LeftHand",
    RightHand: "RightHand",
    LeftRing: "LeftRing",
    RightRing: "RightRing",
    Amulet: "Amulet",
    BodyArmor: "BodyArmor",
    Cloak: "Cloak",
    Boots: "Boots",
    Gloves: "Gloves",
    Belt: "Belt", // the belt garment itself
    Belt1: "Belt1", // attachments on belt
    Belt2: "Belt2",
    Belt3: "Belt3",
    Belt4: "Belt4",
    Backpack: "Backpack",
    Quiver: "Quiver",
  };

  // Legacy aliases so existing UI keeps showing something
  const LEGACY_SLOT_ALIAS = new Map([
    ["Left", SLOT.LeftHand],
    ["Right", SLOT.RightHand],
    ["Body", SLOT.BodyArmor],
  ]);

  // Order for rendering later
  const ALL_SLOTS_ORDER = [
    SLOT.Head,
    SLOT.Amulet,
    SLOT.LeftRing,
    SLOT.RightRing,
    SLOT.Cloak,
    SLOT.BodyArmor,
    SLOT.Gloves,
    SLOT.Boots,
    SLOT.LeftHand,
    SLOT.RightHand,
    SLOT.Belt,
    SLOT.Belt1,
    SLOT.Belt2,
    SLOT.Belt3,
    SLOT.Belt4,
    SLOT.Backpack,
    SLOT.Quiver,
  ];

  const SLOT_LABELS = {
    [SLOT.Head]: "Head",
    [SLOT.Amulet]: "Amulet",
    [SLOT.LeftRing]: "Left Ring",
    [SLOT.RightRing]: "Right Ring",
    [SLOT.Cloak]: "Cloak",
    [SLOT.BodyArmor]: "Body",
    [SLOT.Gloves]: "Gloves",
    [SLOT.Boots]: "Boots",
    [SLOT.LeftHand]: "Left Hand",
    [SLOT.RightHand]: "Right Hand",
    [SLOT.Belt]: "Belt",
    [SLOT.Belt1]: "Belt Slot 1",
    [SLOT.Belt2]: "Belt Slot 2",
    [SLOT.Belt3]: "Belt Slot 3",
    [SLOT.Belt4]: "Belt Slot 4",
    [SLOT.Backpack]: "Backpack",
    [SLOT.Quiver]: "Quiver",
  };

  function labelForSlot(slot) {
    if (SLOT_LABELS[slot]) return SLOT_LABELS[slot];
    return slot
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\b(\w)/g, (_, c) => c.toUpperCase());
  }

  // ---- Inventory ----
  // This represents the carried inventory. Capacity is enforced by the equipped Backpack.

  class Inventory {
    // The Inventory object acts as the canonical source for carried item
    // capacity. The UI consumes its stacks array directly, so we keep the API
    // intentionally tiny and predictable.
    constructor(slotCount = 20) {
      this.capacitySlots = slotCount; // UI slots; you can raise this later
      this.stacks = Array.from({ length: slotCount }, () => null);
      this.constraints = null; // set from equipped backpack
    }
    setConstraints(c) {
      this.constraints = c ? { ...c } : null;
    }
    list() {
      return this.stacks;
    }
  }

  const INVENTORY_CONTAINER_METHODS = {
    usedMassKg() {
      let m = 0;
      for (const s of this.stacks) if (s) m += s.totalMassKg();
      return m;
    },
    usedVolumeL() {
      let v = 0;
      for (const s of this.stacks) if (s) v += s.totalVolumeL();
      return v;
    },
    longestItemCm() {
      let L = 0;
      for (const s of this.stacks)
        if (s) L = Math.max(L, s.item.longestCm());
      return L;
    },
    fitsConstraints(stack) {
      if (!this.constraints) return true; // no backpack equipped => unrestricted (you may change this)
      const cap = this.constraints;
      const massAfter = this.usedMassKg() + stack.totalMassKg();
      const volAfter = this.usedVolumeL() + stack.totalVolumeL();
      const longest = Math.max(
        this.longestItemCm(),
        stack.item.longestCm(),
      );
      if (massAfter > cap.maxMassKg) return false;
      if (volAfter > cap.volumeL) return false;
      if (longest > cap.maxItemLengthCm) return false;
      if (typeof cap.accepts === "function" && !cap.accepts(stack.item))
        return false;
      return true;
    },
    add(itemOrStack, options = {}) {
      const { silent = false } = options;
      const sourceItem =
        itemOrStack instanceof ItemStack
          ? itemOrStack?.item ?? null
          : itemOrStack ?? null;
      const incoming =
        itemOrStack instanceof ItemStack
          ? itemOrStack
          : new ItemStack(itemOrStack, 1);
      const notifyPickup = () => {
        if (silent) return;
        Sound.playLoot(sourceItem);
      };
      const merges = [];
      const newSlots = [];
      let mergedTotalQty = 0;
      let placedTotalQty = 0;
      const rollback = () => {
        for (const { index, added } of merges) {
          const stack = this.stacks[index];
          if (stack) {
            stack.qty -= added;
            if (stack.qty === 0) this.stacks[index] = null;
          }
        }
        for (const { index } of newSlots) {
          this.stacks[index] = null;
        }
        incoming.qty += mergedTotalQty + placedTotalQty;
        merges.length = 0;
        newSlots.length = 0;
        mergedTotalQty = 0;
        placedTotalQty = 0;
      };
      // Try merge first
      if (incoming.stackable) {
        for (let i = 0; i < this.stacks.length && incoming.qty > 0; i++) {
          const s = this.stacks[i];
          if (s && s.canMerge(incoming) && s.qty < s.maxStack) {
            const space = s.maxStack - s.qty;
            const moved = Math.min(space, incoming.qty);
            const tmp = new ItemStack(incoming.item.clone(), moved);
            if (!this.fitsConstraints(tmp)) {
              rollback();
              return false;
            }
            s.qty += moved;
            merges.push({ index: i, added: moved });
            mergedTotalQty += moved;
            incoming.qty -= moved;
          }
        }
        if (incoming.qty <= 0) {
          notifyPickup();
          return true;
        }
      }
      // Place into free slots, respecting stack limits
      for (let i = 0; i < this.stacks.length && incoming.qty > 0; i++) {
        if (!this.stacks[i]) {
          const maxPerSlot =
            typeof incoming.maxStack === "number" && incoming.maxStack > 0
              ? incoming.maxStack
              : 1;
          const qtyToStore = Math.min(incoming.qty, maxPerSlot);
          if (qtyToStore <= 0) {
            rollback();
            return false;
          }
          const tmp = new ItemStack(incoming.item.clone(), qtyToStore);
          if (!this.fitsConstraints(tmp)) {
            rollback();
            return false;
          }
          this.stacks[i] = tmp;
          newSlots.push({ index: i });
          placedTotalQty += qtyToStore;
          incoming.qty -= qtyToStore;
        }
      }
      if (incoming.qty <= 0) {
        notifyPickup();
        return true;
      }
      rollback();
      return false;
    },
    removeByIndex(idx, qty = Infinity) {
      const s = this.stacks[idx];
      if (!s) return null;
      const take = Math.min(qty, s.qty);
      s.qty -= take;
      if (s.qty <= 0) this.stacks[idx] = null;
      return new ItemStack(s.item.clone(), take);
    },
    findStack(predicate) {
      if (typeof predicate !== "function") return null;
      for (let i = 0; i < this.stacks.length; i++) {
        const stack = this.stacks[i];
        if (stack && predicate(stack, i)) {
          return { index: i, stack };
        }
      }
      return null;
    },
    consumeAt(index, qty = 1) {
      if (index < 0 || index >= this.stacks.length) return false;
      const stack = this.stacks[index];
      if (!stack) return false;
      if (qty <= 0) return true;
      if (stack.qty < qty) return false;
      stack.qty -= qty;
      if (stack.qty === 0) this.stacks[index] = null;
      return true;
    },
    consumeMatching(predicate, qty = 1) {
      const found = this.findStack(predicate);
      if (!found) return false;
      return this.consumeAt(found.index, qty);
    },
  };

  Object.assign(Inventory.prototype, INVENTORY_CONTAINER_METHODS);

  // ---- Equipment ----
  // Enforces slot compatibility and 2H weapon occupancy.

  class Equipment {
    constructor() {
      this.slots = new Map();
      for (const s of ALL_SLOTS_ORDER) this.slots.set(s, null);
      // Derived occupancy marker for two-handed
      this._twoHandOccupantId = null;
    }

    get(slot) {
      return this.slots.get(slot) || null;
    }
    all() {
      return Array.from(this.slots.entries());
    }

    // For legacy UI; maps to the 5 old labels
    asLegacyRecord() {
      return {
        Head: this.get(SLOT.Head),
        Body: this.get(SLOT.BodyArmor),
        Left: this.get(SLOT.LeftHand),
        Right: this.get(SLOT.RightHand),
        Belt: this.get(SLOT.Belt),
      };
    }

    canEquipTo(slot, item) {
      if (!(item instanceof Item)) return false;
      if (!this.slots.has(slot)) return false;
      if (!item.canEquipTo(slot)) return false;
      const isHandSlot =
        slot === SLOT.LeftHand || slot === SLOT.RightHand;
      if (!isHandSlot) return true;

      const left = this.get(SLOT.LeftHand);
      const right = this.get(SLOT.RightHand);
      const hasTwoHandEquipped =
        (left && left.handsRequired === 2 && left !== item) ||
        (right && right.handsRequired === 2 && right !== item);

      if (item.handsRequired === 2) {
        const other =
          slot === SLOT.LeftHand ? SLOT.RightHand : SLOT.LeftHand;
        if (
          (this.get(slot) && this.get(slot) !== item) ||
          (this.get(other) && this.get(other) !== item)
        ) {
          return false;
        }
        if (
          (left && left !== item) ||
          (right && right !== item)
        ) {
          return false;
        }
      } else if (hasTwoHandEquipped) {
        return false;
      }
      return true;
    }

    equipTo(slot, item) {
      if (!this.canEquipTo(slot, item)) return false;
      const isHandSlot =
        slot === SLOT.LeftHand || slot === SLOT.RightHand;

      if (isHandSlot && item.handsRequired === 2) {
        this.slots.set(SLOT.LeftHand, item);
        this.slots.set(SLOT.RightHand, item);
        this._twoHandOccupantId = item.id;
        return true;
      }

      if (isHandSlot && this._twoHandOccupantId) {
        // Unequip the two-handed item before equipping the one-handed item
        this.unequip(SLOT.LeftHand);
      }

      this.slots.set(slot, item);
      if (isHandSlot) {
        this._twoHandOccupantId = null;
      }
      return true;
    }

    unequip(slot) {
      const it = this.get(slot);
      // If removing a 2H item from either hand, clear both
      if (
        it &&
        (slot === SLOT.LeftHand || slot === SLOT.RightHand) &&
        it.handsRequired === 2
      ) {
        this.slots.set(SLOT.LeftHand, null);
        this.slots.set(SLOT.RightHand, null);
        this._twoHandOccupantId = null;
        return it;
      }
      this.slots.set(slot, null);
      return it;
    }
    removeItemInstance(item) {
      if (!item) return false;
      for (const [slot, equipped] of this.slots.entries()) {
        if (equipped === item) {
          this.unequip(slot);
          return true;
        }
      }
      return false;
    }

    getLightSourceProperties(defaults = null) {
      const fallback = defaults
        ? { ...defaults }
        : {
            radius: 0,
            color: LIGHT_CONFIG.fallbackColor,
            flickerRate: LIGHT_CONFIG.fallbackFlickerRate,
          };
      let best = { ...fallback };
      let usingFallback = true;
      for (const [, it] of this.slots) {
        if (!it || typeof it !== "object") continue;
        const item = "item" in it && it.item ? it.item : it;
        if (!Number.isFinite(item?.lightRadius) || item.lightRadius <= 0) {
          continue;
        }
        const candidate = {
          radius: item.lightRadius,
          color: item.lightColor || fallback.color,
          flickerRate:
            typeof item.flickerRate === "number"
              ? item.flickerRate
              : fallback.flickerRate,
        };
        if (
          candidate.radius > best.radius ||
          (usingFallback && candidate.radius === best.radius)
        ) {
          best = candidate;
          usingFallback = false;
        }
      }
      return best;
    }

    getLightRadius() {
      return this.getLightSourceProperties().radius;
    }

    getLightColor() {
      return this.getLightSourceProperties().color;
    }

    getLightFlickerRate() {
      return this.getLightSourceProperties().flickerRate;
    }

    currentBackpackConstraints() {
      const pack = this.get(SLOT.Backpack);
      return pack && pack.container
        ? {
            volumeL: pack.container.volumeL,
            maxMassKg: pack.container.maxMassKg,
            maxItemLengthCm: pack.container.maxItemLengthCm,
            accepts: pack.container.accepts || null,
          }
        : null;
    }
  }

  // ---- Mobs ----

  let __mobAutoId = 1;

  class Player {
    constructor(o = {}) {
      const name = o.name ?? "Player";
      const factions =
        Array.isArray(o.factions) && o.factions.length
          ? o.factions.slice()
          : ["player"];
      const affiliations = Array.isArray(o.affiliations)
        ? o.affiliations.slice()
        : [];

      this.id = o.id || `player#${__mobAutoId++}`;
      this.kind = "player";
      this.name = name;
      this.glyph = o.glyph ?? "@";
      this.color = o.color ?? "#fff";
      this.x = o.x | 0;
      this.y = o.y | 0;
      this.baseDelay = o.baseDelay ?? 1;
      this.nextActAt = o.nextActAt ?? 0;
      this.__dead = false;

      this.inventory = new Inventory(DEFAULT_INVENTORY_CAPACITY);
      this.equipment = new Equipment();
      this.__log = null;

      this.__actor = new Actor({
        id: this.id,
        name,
        baseStats: {
          str: 5,
          dex: 5,
          int: 5,
          vit: 5,
          con: 5,
          will: 5,
          luck: 5,
          maxHP: DEFAULT_MOB_HP,
          maxStamina: 10,
          maxMana: 0,
          baseSpeed: DEFAULT_MOB_SPEED,
        },
        factions,
        affiliations,
      });
      attachLogs(this.__actor);

      this.syncActorEquipment();
    }

    get actor() {
      return this.__actor;
    }

    get factions() {
      return this.__actor?.factions || [];
    }

    set factions(value) {
      if (!this.__actor) return;
      this.__actor.factions = Array.isArray(value) ? value.slice() : [];
    }

    get affiliations() {
      return this.__actor?.affiliations || [];
    }

    set affiliations(value) {
      if (!this.__actor) return;
      this.__actor.affiliations = Array.isArray(value) ? value.slice() : [];
    }

    get res() {
      return this.__actor?.res;
    }

    set res(value) {
      if (!this.__actor) return;
      this.__actor.res = value;
    }

    get statusDerived() {
      return this.__actor?.statusDerived;
    }

    set statusDerived(value) {
      if (!this.__actor) return;
      this.__actor.statusDerived = value;
    }

    get statuses() {
      return this.__actor?.statuses;
    }

    set statuses(value) {
      if (!this.__actor) return;
      this.__actor.statuses = Array.isArray(value) ? value : [];
    }

    get modCache() {
      return this.__actor?.modCache;
    }

    set modCache(value) {
      if (!this.__actor) return;
      this.__actor.modCache = value;
    }

    get hp() {
      return this.__actor?.res?.hp ?? 0;
    }

    set hp(value) {
      if (this.__actor?.res) {
        this.__actor.res.hp = value;
      }
    }

    get maxHp() {
      return this.__actor?.base?.maxHP ?? 0;
    }

    set maxHp(value) {
      if (!this.__actor) return;
      if (this.__actor.base) {
        this.__actor.base.maxHP = value;
      }
      if (this.__actor.baseStats) {
        this.__actor.baseStats.maxHP = value;
      }
    }

    get pos() {
      return { x: this.x, y: this.y };
    }

    set pos(p) {
      if (!p) return;
      this.x = p.x | 0;
      this.y = p.y | 0;
    }

    getLightRadius() {
      const radius = this.__actor?.getLightRadius?.() ?? 0;
      return Number.isFinite(radius) ? Math.max(0, radius) : 0;
    }

    syncActorEquipment() {
      if (!this.__actor) return;
      const record = {};
      if (this.equipment?.slots instanceof Map) {
        for (const [slot, item] of this.equipment.slots.entries()) {
          if (item) {
            record[slot] = item;
          }
        }
      }
      Object.defineProperty(record, "getLightRadius", {
        enumerable: false,
        value: (...args) => this.equipment.getLightRadius(...args),
      });
      Object.defineProperty(record, "getLightSourceProperties", {
        enumerable: false,
        value: (...args) =>
          this.equipment.getLightSourceProperties(...args),
      });
      this.__actor.equipment = record;
      foldModsFromEquipment(this.__actor);
    }

    canOccupy(x, y, maze, mobManager = null) {
      if (y < 0 || y >= maze.length || x < 0 || x >= maze[0].length)
        return false;
      if (maze[y][x] === TILE_WALL) return false;
      if (mobManager && mobManager.getMobAt(x, y)) return false;
      return true;
    }

    tryMove(dx, dy, maze, mobManager = null) {
      const nx = this.x + dx,
        ny = this.y + dy;
      if (this.canOccupy(nx, ny, maze, mobManager)) {
        this.x = nx;
        this.y = ny;
        return true;
      }
      return false;
    }

    takeTurn() {
      /* player turns handled elsewhere */
    }
  }

  class MobManager {
    constructor() {
      this.list = [];
      this.index = new Map();
    }
    add(m) {
      if (!m) return null;

      // Avoid tracking the same instance twice. The simulation used to add the
      // player both during setup and on the first tick, which left duplicate
      // references in the list and caused inconsistent indexing/AI behaviour.
      if (this.list.includes(m)) {
        return m;
      }

      this.list.push(m);
      this.reindex();
      return m;
    }
    removeById(id) {
      const existing = this.list.find((x) => x.id === id);
      if (!existing) return null;
      const key = `${existing.x},${existing.y}`;
      this.list = this.list.filter((x) => x.id !== id);
      this.index.delete(key);
      return existing;
    }
    getMobAt(x, y) {
      return this.index.get(`${x},${y}`) || null;
    }
    reindex() {
      this.index.clear();
      for (const m of this.list) this.index.set(`${m.x},${m.y}`, m);
    }
    async tick(gameCtx, turn) {
      // Ensure our spatial index reflects any changes that happened between
      // ticks (for example actors being added or removed externally).
      this.reindex();

      const startIndex = new Map(this.index);
      const plannedMoves = [];
      const mobsThisTurn = [...this.list];

      const occupancyView = {
        getMobAt: (x, y) => startIndex.get(`${x},${y}`) || null,
        list: mobsThisTurn,
      };

      const rngFn = resolveTurnRng(gameCtx?.rng ?? gameCtx?.state?.rng ?? Math.random);

      for (const m of mobsThisTurn) {
        const startKey = `${m.x},${m.y}`;

        if (!this.list.includes(m)) {
          startIndex.delete(startKey);
          continue;
        }
        if (m.kind === "player") continue;

        if (handleDeath(gameCtx, m)) {
          startIndex.delete(startKey);
          continue;
        }

        const hpBeforeTick =
          m?.res && typeof m.res.hp === "number" ? m.res.hp : null;
        tickStatusesAtTurnStart(m, turn);
        if (
          hpBeforeTick != null &&
          typeof m?.res?.hp === "number" &&
          m.res.hp > hpBeforeTick &&
          (m.kind === "player" || (gameCtx?.player && m === gameCtx.player))
        ) {
          Sound.playHeal();
        }

        if (!this.list.includes(m) || m.__dead) {
          startIndex.delete(startKey);
          continue;
        }

        if (handleDeath(gameCtx, m)) {
          startIndex.delete(startKey);
          continue;
        }

        if (m.statusDerived?.canAct === false) {
          continue;
        }

        const nextActAt =
          typeof m.nextActAt === "number" ? m.nextActAt : 0;
        if (turn < nextActAt) {
          continue;
        }

        const from = { x: m.x, y: m.y };
        const worldCtx = { ...gameCtx, mobManager: occupancyView };
        let delayResult;
        try {
          delayResult = await m.takeTurn({ world: worldCtx, rng: rngFn, now: turn });
        } catch (err) {
          console.error("mob takeTurn threw", err);
          delayResult = null;
        }
        const to = { x: m.x, y: m.y };

        if (to.x !== from.x || to.y !== from.y) {
          plannedMoves.push({ mob: m, from, to });
        }

        let delay = Number.isFinite(delayResult) ? delayResult : null;
        if (!Number.isFinite(delay) || delay <= 0) {
          delay = computeActorDelay(m);
        }
        m.nextActAt = turn + (Number.isFinite(delay) && delay > 0 ? delay : computeActorDelay(m));
      }

      const occupancy = new Map(startIndex);
      for (const move of plannedMoves) {
        if (!this.list.includes(move.mob) || move.mob.__dead) continue;
        const fromKey = `${move.from.x},${move.from.y}`;
        const toKey = `${move.to.x},${move.to.y}`;
        if (occupancy.get(fromKey) !== move.mob) continue;
        if (occupancy.has(toKey)) continue;

        occupancy.delete(fromKey);
        occupancy.set(toKey, move.mob);
        move.mob.x = move.to.x;
        move.mob.y = move.to.y;
      }

      this.reindex();
    }
  }

  // ===================== RANGED COMBAT HELPERS =====================

  function isRangedWeapon(item) {
    return item instanceof Item && item.isRangedWeapon();
  }

  function damageExpectation(dmgProfile) {
    if (!dmgProfile)
      return {
        min: 0,
        max: 0,
        avg: 0,
        diceCount: 0,
        diceSides: 0,
        bonus: 0,
      };
    const { diceCount, diceSides, bonus } = dmgProfile;
    const min = diceCount * 1 + bonus;
    const max = diceCount * diceSides + bonus;
    const avg = (diceCount * (diceSides + 1)) / 2 + bonus;
    return { min, max, avg, diceCount, diceSides, bonus };
  }

  function rollDamage(dmgProfile) {
    const { diceCount, diceSides, bonus } = dmgProfile || {
      diceCount: 0,
      diceSides: 0,
      bonus: 0,
    };
    const rolls = [];
    let total = bonus;
    for (let i = 0; i < diceCount; i++) {
      const roll = 1 + Math.floor(Math.random() * Math.max(1, diceSides));
      rolls.push(roll);
      total += roll;
    }
    return { total, rolls, bonus };
  }

  function describeDamage(dmgProfile) {
    if (!dmgProfile) return "";
    const { diceCount, diceSides, bonus } = dmgProfile;
    let parts = "";
    if (diceCount > 0) {
      parts = `${diceCount}d${diceSides}`;
    }
    if (bonus) {
      parts += bonus > 0 ? `+${bonus}` : `${bonus}`;
    }
    return parts || `${bonus || 0}`;
  }

  function describeAmmo(ammoProfile) {
    if (!ammoProfile) return "";
    if (ammoProfile.label) return ammoProfile.label;
    if (ammoProfile.itemId) return ammoProfile.itemId;
    if (ammoProfile.type) return ammoProfile.type;
    if (ammoProfile.typePrefix) return `${ammoProfile.typePrefix}*`;
    return "";
  }

  function ammoMatchesProfile(ammoProfile, stack) {
    if (!ammoProfile || !stack) return false;
    const id = stack.item.id;
    if (ammoProfile.itemId) return id === ammoProfile.itemId;
    if (ammoProfile.type) return id === ammoProfile.type;
    if (ammoProfile.typePrefix)
      return id.startsWith(ammoProfile.typePrefix);
    return false;
  }

  function findAmmoStackForProfile(mob, weaponProfile) {
    if (!weaponProfile?.ammo) return null;
    if (
      !mob ||
      !mob.inventory ||
      typeof mob.inventory.findStack !== "function"
    )
      return null;
    return mob.inventory.findStack((stack) =>
      ammoMatchesProfile(weaponProfile.ammo, stack),
    );
  }

  function consumeThrownItemFromAttacker(attacker, item, context = {}) {
    if (!attacker) return false;
    if (context && typeof context.consumeSource === "function") {
      const result = context.consumeSource();
      if (result) return true;
    }
    if (
      context &&
      typeof context.inventoryIndex === "number" &&
      attacker.inventory
    ) {
      if (attacker.inventory.consumeAt(context.inventoryIndex, 1))
        return true;
    }
    if (
      context &&
      context.stack &&
      typeof context.stack.consume === "function"
    ) {
      const consumed = context.stack.consume(1);
      if (consumed) return true;
    }
    if (context && context.equipmentSlot && attacker.equipment) {
      const equipped = attacker.equipment.get(context.equipmentSlot);
      if (equipped && (equipped === item || equipped.id === item.id)) {
        attacker.equipment.unequip(context.equipmentSlot);
        return true;
      }
    }
    if (attacker.equipment && attacker.equipment.slots instanceof Map) {
      for (const [slot, equipped] of attacker.equipment.slots.entries()) {
        if (!equipped) continue;
        if (equipped === item || equipped.id === item.id) {
          attacker.equipment.unequip(slot);
          return true;
        }
      }
    }
    if (
      attacker.inventory &&
      typeof attacker.inventory.consumeMatching === "function"
    ) {
      if (
        attacker.inventory.consumeMatching(
          (stack) => stack.item === item || stack.item.id === item.id,
          1,
        )
      )
        return true;
    }
    return false;
  }

  function evaluateRangedAttack(attacker, target, weapon, context = {}) {
    if (!isRangedWeapon(weapon)) {
      return { ok: false, reason: "not_ranged" };
    }
    if (!attacker || !target) {
      return { ok: false, reason: "invalid_actor" };
    }
    const profile = weapon.weaponProfile;
    const distance = chebyshevDistance(attacker.pos, target.pos);
    const result = {
      ok: false,
      weapon,
      profile,
      distance,
      reason: null,
    };
    if (distance < profile.range.min) {
      result.reason = "too_close";
      return result;
    }
    if (distance > profile.range.max) {
      result.reason = "out_of_range";
      return result;
    }
    const requireLoS = context.requireLineOfSight !== false;
    const mazeRef = context.maze || context.grid || null;
    if (
      requireLoS &&
      mazeRef &&
      !hasLineOfSight(mazeRef, attacker.pos, target.pos)
    ) {
      result.reason = "no_los";
      return result;
    }
    if (profile.ammo) {
      const ammoStack = findAmmoStackForProfile(attacker, profile);
      if (!ammoStack) {
        result.reason = "no_ammo";
        return result;
      }
      result.ammoStack = ammoStack;
    }
    result.damage = damageExpectation(profile.damage);
    result.timeCost =
      profile.aimTime + profile.reloadTime + Math.max(1, profile.volley);
    result.ok = true;
    return result;
  }

  function finalizeAttackOutcome({
    evaluation,
    attackCtx,
    baseRoll,
    target,
    onTargetDefeated,
  }) {
    const attackResult = resolveAttack(attackCtx);
    evaluation.roll = baseRoll;
    evaluation.damageApplied = attackResult.totalDamage;
    evaluation.packetsAfterDefense = attackResult.packetsAfterDefense;
    evaluation.statusApplied = attackResult.appliedStatuses;
    evaluation.attackResult = attackResult;

    const hpView =
      typeof target.hp === "number"
        ? target.hp
        : typeof target.res?.hp === "number"
        ? target.res.hp
        : typeof target.resources?.hp === "number"
        ? target.resources.hp
        : null;
    let defeated = false;
    if (typeof hpView === "number") {
      evaluation.targetHp = hpView;
      defeated = hpView <= 0;
    }
    evaluation.targetDefeated = defeated;
    if (defeated) {
      if (typeof onTargetDefeated === "function") {
        onTargetDefeated();
      } else {
        handleDeath(attackCtx, target);
      }
    }

    return { evaluation, attackResult };
  }

  function performRangedAttack(attacker, target, weapon, context = {}) {
    const evaluation = evaluateRangedAttack(
      attacker,
      target,
      weapon,
      context,
    );
    if (!evaluation.ok) return evaluation;
    const profile = weapon.weaponProfile;
    if (profile.ammo) {
      const ammoInfo =
        evaluation.ammoStack ||
        findAmmoStackForProfile(attacker, profile);
      if (!ammoInfo) {
        return { ok: false, reason: "no_ammo" };
      }
      if (!attacker.inventory) {
        return { ok: false, reason: "no_inventory" };
      }
      const consumed = attacker.inventory.consumeAt?.(
        ammoInfo.index,
        profile.ammo.perShot ?? 1,
      );
      if (!consumed) {
        return { ok: false, reason: "no_ammo" };
      }
      evaluation.ammoUsed = profile.ammo.perShot ?? 1;
    }
    const baseRoll = rollDamage(profile.damage);
    const attackCtx = {
      attacker,
      defender: target,
      turn: context.turn ?? 0,
      physicalBase: Math.max(0, Math.floor(baseRoll.total ?? 0)),
      physicalBonus: 0,
      attackKind: "ranged",
      source: { item: weapon, weaponProfile: profile },
    };
    if (Array.isArray(context.statusAttempts) && context.statusAttempts.length) {
      attackCtx.statusAttempts = context.statusAttempts;
    }
    if (Array.isArray(context.conversions) && context.conversions.length) {
      attackCtx.conversions = context.conversions;
    }
    if (Array.isArray(context.brands) && context.brands.length) {
      attackCtx.brands = context.brands;
    }
    const deathCtx =
      context?.gameCtx ||
      (context?.mobManager ? { mobManager: context.mobManager } : context) ||
      null;
    const attackOutcome = finalizeAttackOutcome({
      evaluation,
      attackCtx,
      baseRoll,
      target,
      onTargetDefeated: () => handleDeath(deathCtx, target, deathCtx?.ui),
    });
    const { attackResult, evaluation: updatedEvaluation } = attackOutcome;
    evaluation = updatedEvaluation ?? evaluation;
    if (typeof context.onAttack === "function") {
      context.onAttack({
        attacker,
        target,
        weapon,
        evaluation,
        baseRoll,
        attackResult,
      });
    }
    if (
      profile.category === WEAPON_CATEGORY.THROWN &&
      profile.consumeWeaponOnUse
    ) {
      const consumed = consumeThrownItemFromAttacker(
        attacker,
        weapon,
        context,
      );
      evaluation.weaponConsumed = consumed;
    }
    return evaluation;
  }

  function describeRangedWeapon(item) {
    if (!isRangedWeapon(item)) {
      return item ? item.name : "";
    }
    const profile = item.weaponProfile;
    const parts = [item.name, `(${profile.category})`];
    const rangePart =
      `Range ${profile.range.min}-${profile.range.max}` +
      (profile.range.optimal !== profile.range.min &&
      profile.range.optimal !== profile.range.max
        ? ` (opt ${profile.range.optimal})`
        : "");
    parts.push(rangePart);
    parts.push(`Damage ${describeDamage(profile.damage)}`);
    if (profile.ammo) {
      const ammoPart = describeAmmo(profile.ammo);
      if (ammoPart)
        parts.push(`Ammo ${ammoPart}×${profile.ammo.perShot ?? 1}`);
    }
    if (
      profile.category === WEAPON_CATEGORY.THROWN &&
      profile.consumeWeaponOnUse
    ) {
      const recover =
        profile.recoveryChance > 0
          ? ` (recover ${Math.round(profile.recoveryChance * 100)}%)`
          : "";
      parts.push(`Consumes weapon${recover}`);
    }
    if (profile.reloadTime) {
      parts.push(`Reload ${profile.reloadTime}t`);
    }
    if (profile.volley > 1) {
      parts.push(`Volley ${profile.volley}`);
    }
    if (profile.notes) {
      parts.push(profile.notes);
    }
    return parts.join(" • ");
  }

  const RangedCombat = {
    isRangedWeapon,
    chebyshevDistance,
    hasLineOfSight,
    damageExpectation,
    rollDamage,
    describeDamage,
    describeAmmo,
    findAmmoStackForProfile,
    evaluateRangedAttack,
    performRangedAttack,
    describeRangedWeapon,
  };

  function getThrowProfileForItem(item) {
    if (!(item instanceof Item)) return null;
    return item.getThrowProfile?.() || null;
  }

  function describeThrowProfile(profile) {
    if (!profile) return "";
    const parts = [];
    if (profile.range) {
      parts.push(
        `Range ${profile.range.min}/${profile.range.optimal}/${profile.range.max}`,
      );
    }
    if (profile.damage) {
      parts.push(`Damage ${describeDamage(profile.damage)}`);
    }
    if (profile.consumesItem) {
      const recover =
        profile.recoveryChance > 0
          ? ` (recover ${Math.round(profile.recoveryChance * 100)}%)`
          : "";
      parts.push(`Consumes item${recover}`);
    }
    if (!profile.consumesItem) {
      parts.push("Reusable");
    }
    if (profile.notes) {
      parts.push(profile.notes);
    }
    return parts.join(" • ");
  }

  function describeThrowable(item) {
    const profile = getThrowProfileForItem(item);
    if (!profile) return "";
    return describeThrowProfile(profile);
  }

  function evaluateThrow(attacker, target, item, context = {}) {
    if (!(item instanceof Item)) {
      return { ok: false, reason: "invalid_item" };
    }
    if (!attacker || !target) {
      return { ok: false, reason: "invalid_actor" };
    }
    const profile = getThrowProfileForItem(item);
    if (!profile) {
      return { ok: false, reason: "not_throwable" };
    }
    const distance = chebyshevDistance(attacker.pos, target.pos);
    const result = {
      ok: false,
      item,
      profile,
      distance,
      throwClass: profile.throwClass || classifyThrowability(item),
      reason: null,
    };
    if (profile.allowed === false) {
      result.reason = "unsuitable";
      return result;
    }
    if (distance < profile.range.min) {
      result.reason = "too_close";
      return result;
    }
    if (distance > profile.range.max) {
      result.reason = "out_of_range";
      return result;
    }
    const requireLoS = context.requireLineOfSight !== false;
    const mazeRef = context.maze || context.grid || null;
    if (
      requireLoS &&
      mazeRef &&
      !hasLineOfSight(mazeRef, attacker.pos, target.pos)
    ) {
      result.reason = "no_los";
      return result;
    }
    result.damage = damageExpectation(profile.damage);
    result.timeCost = Math.max(1, Math.floor(context.timeCost ?? 1));
    result.ok = true;
    return result;
  }

  function performThrow(attacker, target, item, context = {}) {
    const evaluation = evaluateThrow(attacker, target, item, context);
    if (!evaluation.ok) return evaluation;
    const profile = evaluation.profile;
    const baseRoll = rollDamage(profile.damage);
    const attackCtx = {
      attacker,
      defender: target,
      turn: context.turn ?? 0,
      physicalBase: Math.max(0, Math.floor(baseRoll.total ?? 0)),
      physicalBonus: 0,
      attackKind: "throw",
      source: { item, throwProfile: profile },
    };
    if (Array.isArray(context.statusAttempts) && context.statusAttempts.length) {
      attackCtx.statusAttempts = context.statusAttempts;
    }
    if (Array.isArray(context.conversions) && context.conversions.length) {
      attackCtx.conversions = context.conversions;
    }
    if (Array.isArray(context.brands) && context.brands.length) {
      attackCtx.brands = context.brands;
    }
    evaluation = finalizeAttackOutcome({
      evaluation,
      attackCtx,
      baseRoll,
      target,
    });
    if (profile.consumesItem) {
      evaluation.itemConsumed = consumeThrownItemFromAttacker(
        attacker,
        item,
        context,
      );
    }
    return evaluation;
  }

  function evaluateAttack(attacker, target, item, mode, context = {}) {
    if (!mode || !mode.kind) {
      return { ok: false, reason: "invalid_mode" };
    }
    if (mode.kind === ATTACK_KIND.RANGED) {
      return evaluateRangedAttack(attacker, target, item, context);
    }
    if (mode.kind === ATTACK_KIND.THROW) {
      return evaluateThrow(attacker, target, item, context);
    }
    return { ok: false, reason: "unknown_mode" };
  }

  function performAttack(attacker, target, item, mode, context = {}) {
    if (!mode || !mode.kind) {
      return { ok: false, reason: "invalid_mode" };
    }
    if (mode.kind === ATTACK_KIND.RANGED) {
      return performRangedAttack(attacker, target, item, context);
    }
    if (mode.kind === ATTACK_KIND.THROW) {
      return performThrow(attacker, target, item, context);
    }
    return { ok: false, reason: "unknown_mode" };
  }

  function chooseAttackMode(attacker, target, item, context = {}) {
    const modes = getAttackModesForItem(item);
    let best = null;
    let bestScore = -Infinity;
    for (const mode of modes) {
      const ev = evaluateAttack(attacker, target, item, mode, context);
      if (!ev.ok) continue;
      const expectedDamage = ev.damage?.avg ?? 0;
      const timeCost = Math.max(1, ev.timeCost ?? 1);
      const dps = expectedDamage / timeCost;
      const ammoPenalty =
        mode.kind === ATTACK_KIND.RANGED &&
        !!ev.profile?.ammo
          ? 0.05
          : 0;
      const resourcePenalty =
        mode.kind === ATTACK_KIND.THROW && ev.profile?.consumesItem
          ? 0.02
          : 0;
      const score = dps - ammoPenalty - resourcePenalty;
      if (score > bestScore) {
        bestScore = score;
        best = mode;
      }
    }
    return best;
  }

  const Throwing = {
    ATTACK_KIND,
    THROW_CLASS,
    classifyThrowability,
    throwPenaltiesFor,
    buildEffectiveThrowProfile,
    getAttackModesForItem,
    getThrowProfile: getThrowProfileForItem,
    describeThrowProfile,
    describeThrowable,
    evaluateThrow,
    performThrow,
  };

  const Combat = {
    ATTACK_KIND,
    THROW_CLASS,
    getAttackModesForItem,
    evaluateAttack,
    performAttack,
    chooseAttackMode,
  };

  // --- ITEM TEMPLATES ---

  function readPlayerLightRadius() {
    const override = gameState?.config?.knobs?.playerFovOverride;
    if (override != null && Number.isFinite(override)) {
      return Math.max(0, Math.floor(override));
    }
    /** [Unified Implementation] All lighting reads delegate to Actor.getLightRadius(). */
    const radius = Number(player?.getLightRadius?.() ?? 0);
    return Number.isFinite(radius) ? Math.max(0, radius) : 0;
  }

  function getLightProperties() {
    const radius = readPlayerLightRadius();
    const fallback = { radius, color: LIGHT_CONFIG.fallbackColor, flickerRate: LIGHT_CONFIG.fallbackFlickerRate };
    const color = typeof player?.getLightColor === "function" ? player.getLightColor() : player?.equipment?.getLightColor?.();
    const flickerRate = typeof player?.getLightFlickerRate === "function" ? player.getLightFlickerRate() : player?.equipment?.getLightFlickerRate?.();
    return { radius, color: color ?? fallback.color, flickerRate: Number.isFinite(flickerRate) ? +flickerRate : fallback.flickerRate };
  }

  function refreshLightingVisuals(lightProps = null) {
    const overlay = computeLightOverlayVisuals(
      lightProps ?? getLightProperties(),
      LIGHT_CONFIG,
    );
    fovState.overlayStyle = overlay.style;
    fovState.overlayRgb = overlay.rgb;
  }

  /**
   * Computes the visible cells around the player and updates the cached FOV.
   * All vision must flow through Actor/Monster.getLightRadius().
   */
  function computeVisibleCells(pos) {
    const key = posKey(pos);
    const radius = readPlayerLightRadius();
    if (
      fovState.lastCache.visible &&
      fovState.lastCache.key === key &&
      fovState.lastCache.radius === radius
    ) {
      return fovState.lastCache.visible;
    }
    const visible = computeFieldOfView(pos, radius, mapState, { useKnownGrid: false });
    fovState.lastCache = { key, radius, visible };
    return visible;
  }
  // --- A* PATHFINDING FOR MAP VALIDATION ---
  function inBounds(grid, x, y) {
    return y >= 0 && y < grid.length && x >= 0 && x < grid[0].length;
  }
  function aStarPath(grid, start, end) {
    // Straightforward A* over the 4-connected grid. The map generator only uses this to
    // verify connectivity, so we prioritise readability over micro-optimisations – the
    // grids are small enough that the classic textbook implementation is plenty fast.
    const heuristic = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const openSet = [];
    const closedSet = new Set();
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();
    const startKey = posKey(start);
    gScore.set(startKey, 0);
    fScore.set(startKey, heuristic(start, end));
    openSet.push(start);
    while (openSet.length > 0) {
      let lowestIndex = 0;
      for (let i = 1; i < openSet.length; i++) {
        const fA = fScore.get(posKey(openSet[i])) || Infinity;
        const fB = fScore.get(posKey(openSet[lowestIndex])) || Infinity;
        if (fA < fB) {
          lowestIndex = i;
        }
      }
      const current = openSet.splice(lowestIndex, 1)[0];
      const currentKey = posKey(current);
      if (current.x === end.x && current.y === end.y) {
        const path = [];
        let temp = current;
        while (temp) {
          path.unshift(temp);
          temp = cameFrom.get(posKey(temp));
        }
        return path;
      }
      closedSet.add(currentKey);
      const neighbors = [
        { x: current.x, y: current.y - 1 },
        { x: current.x, y: current.y + 1 },
        { x: current.x - 1, y: current.y },
        { x: current.x + 1, y: current.y },
      ];
      for (const neighbor of neighbors) {
        if (
          !inBounds(grid, neighbor.x, neighbor.y) ||
          grid[neighbor.y][neighbor.x] === TILE_WALL
        ) {
          continue;
        }
        const neighborKey = posKey(neighbor);
        if (closedSet.has(neighborKey)) {
          continue;
        }
        const tentativeGScore = (gScore.get(currentKey) || 0) + 1;
        if (
          !openSet.some((node) => posKey(node) === neighborKey) ||
          tentativeGScore < (gScore.get(neighborKey) || Infinity)
        ) {
          cameFrom.set(neighborKey, current);
          gScore.set(neighborKey, tentativeGScore);
          fScore.set(
            neighborKey,
            tentativeGScore + heuristic(neighbor, end),
          );
          if (!openSet.some((node) => posKey(node) === neighborKey)) {
            openSet.push(neighbor);
          }
        }
      }
    }
    return null; // No path found
  }

  // --- DUNGEON SHAPE GENERATION HELPERS ---
  function manhattanEdgeDistanceRect(A, B) {
    const dx = Math.max(0, B.x0 - A.x1, A.x0 - B.x1);
    const dy = Math.max(0, B.y0 - A.y1, A.y0 - B.y1);
    return dx + dy;
  }
  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x,
        yi = poly[i].y;
      const xj = poly[j].x,
        yj = poly[j].y;
      const intersect =
        yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }
  function finalizeRoomShape(kind, widthHint, heightHint, tiles) {
    const normalizedTiles = tiles.map((t) => ({ x: t.x, y: t.y }));
    if (normalizedTiles.length === 0) {
      const safeW = Math.max(
        0,
        typeof widthHint === "number" ? widthHint : 0,
      );
      const safeH = Math.max(
        0,
        typeof heightHint === "number" ? heightHint : 0,
      );
      const x1 = safeW > 0 ? safeW - 1 : -1;
      const y1 = safeH > 0 ? safeH - 1 : -1;
      return {
        kind,
        w: safeW,
        h: safeH,
        tiles: normalizedTiles,
        center: {
          x: safeW > 0 ? (safeW - 1) / 2 : 0,
          y: safeH > 0 ? (safeH - 1) / 2 : 0,
        },
        bbox: { x0: 0, y0: 0, x1, y1 },
      };
    }
    let x0 = normalizedTiles[0].x;
    let y0 = normalizedTiles[0].y;
    let x1 = normalizedTiles[0].x;
    let y1 = normalizedTiles[0].y;
    for (const t of normalizedTiles) {
      if (t.x < x0) x0 = t.x;
      if (t.y < y0) y0 = t.y;
      if (t.x > x1) x1 = t.x;
      if (t.y > y1) y1 = t.y;
    }
    const derivedW = x1 - x0 + 1;
    const derivedH = y1 - y0 + 1;
    const centerX = x0 + (derivedW - 1) / 2;
    const centerY = y0 + (derivedH - 1) / 2;
    return {
      kind,
      w: derivedW,
      h: derivedH,
      tiles: normalizedTiles,
      center: { x: centerX, y: centerY },
      bbox: { x0, y0, x1, y1 },
    };
  }
  function rasterizeRegularPolygon(
    n,
    targetArea,
    minSide,
    kindLabel = `poly${n}`,
  ) {
    const twoPi = Math.PI * 2;
    const sin = Math.sin;
    const areaToR = (A) => Math.sqrt((2 * A) / (n * sin(twoPi / n)));
    const Rmin = minSide / (2 * sin(Math.PI / n));
    let R = Math.max(areaToR(targetArea), Rmin);
    const tryBuild = (Rtry) => {
      const w = Math.ceil(2 * Rtry) + 2;
      const h = w;
      const cx = w / 2,
        cy = h / 2;
      const verts = [];
      for (let i = 0; i < n; i++) {
        const ang = (twoPi * i) / n - Math.PI / n;
        verts.push({
          x: cx + Rtry * Math.cos(ang),
          y: cy + Rtry * Math.sin(ang),
        });
      }
      const tiles = [];
      for (let ty = 0; ty < h; ty++) {
        for (let tx = 0; tx < w; tx++) {
          const cxCell = tx + 0.5,
            cyCell = ty + 0.5;
          if (pointInPoly(cxCell, cyCell, verts)) {
            tiles.push({ x: tx, y: ty });
          }
        }
      }
      return finalizeRoomShape(kindLabel, w, h, tiles);
    };
    let out = tryBuild(R);
    const measured = out.tiles.length;
    if (measured < 0.9 * targetArea || measured > 1.1 * targetArea) {
      const scale = Math.sqrt(targetArea / Math.max(1, measured));
      R = Math.max(R * scale, Rmin);
      out = tryBuild(R);
    }
    return out;
  }
  function rasterizeDisc(targetArea, minSide) {
    let R = Math.sqrt(targetArea / Math.PI);
    R = Math.max(R, minSide);
    const w = Math.ceil(2 * R) + 2;
    const h = w;
    const cx = w / 2,
      cy = h / 2;
    const R2 = R * R;
    const tiles = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= R2) tiles.push({ x, y });
      }
    }
    const measured = tiles.length;
    if (measured < 0.9 * targetArea || measured > 1.1 * targetArea) {
      const scale = Math.sqrt(targetArea / Math.max(1, measured));
      const R2b = Math.max(R * scale, minSide);
      return rasterizeDisc(Math.PI * R2b * R2b, minSide);
    }
    return finalizeRoomShape("round", w, h, tiles);
  }
  function rasterizeRectLike(targetArea, minSide, kind) {
    let w, h;
    if (kind === "square") {
      const s = Math.max(minSide, Math.round(Math.sqrt(targetArea)));
      w = s;
      h = s;
    } else {
      const ratio = 1 + Math.random() * 1.5; // 1.0..2.5
      w = Math.max(minSide, Math.round(Math.sqrt(targetArea * ratio)));
      h = Math.max(minSide, Math.round(targetArea / w));
      if (w * h < targetArea) {
        if (w < h) w = Math.max(w + 1, minSide);
        else h = Math.max(h + 1, minSide);
      }
    }
    const tiles = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) tiles.push({ x, y });
    }
    return finalizeRoomShape(kind, w, h, tiles);
  }
  function rasterizeCross(targetArea, minSide) {
    const armWidth = Math.max(3, Math.round(clamp(minSide / 2, 3, 10)));
    // Area = 2 * L * armWidth - armWidth^2
    const L = Math.round(
      (targetArea + armWidth * armWidth) / (2 * armWidth),
    );
    const size = Math.max(L, minSide, armWidth * 3);
    const halfSize = Math.floor(size / 2);
    const halfArm = Math.floor(armWidth / 2);

    const tiles = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const isHorizontal = Math.abs(y - halfSize) <= halfArm;
        const isVertical = Math.abs(x - halfSize) <= halfArm;
        if (isHorizontal || isVertical) {
          tiles.push({ x, y });
        }
      }
    }
    return finalizeRoomShape("cross", size, size, tiles);
  }
  function rasterizeX(targetArea, minSide) {
    let size = Math.max(minSide, Math.round(Math.sqrt(targetArea * 0.9))); // Initial guess

    const countFor = (S) => {
      const armWidth = Math.max(3, Math.round(clamp(S / 5, 3, 9)));
      const tiles = new Set();
      const halfArm = Math.floor(armWidth / 2);
      for (let i = 0; i < S; i++) {
        for (let w = -halfArm; w <= halfArm; w++) {
          // Main diagonal segment
          if (i + w >= 0 && i + w < S) tiles.add(`${i},${i + w}`);
          // Anti-diagonal segment
          if (S - 1 - i + w >= 0 && S - 1 - i + w < S)
            tiles.add(`${i},${S - 1 - i + w}`);
        }
      }
      return tiles.size;
    };

    let areaNow = countFor(size);
    let guard = 0;
    const within = (val, tgt) =>
      Math.abs(val - tgt) <= Math.max(15, Math.floor(tgt * 0.15));
    while (!within(areaNow, targetArea) && guard++ < 50) {
      const ratio = Math.sqrt(targetArea / areaNow);
      let nextSize = Math.round(size * ratio);
      if (nextSize === size)
        nextSize = areaNow < targetArea ? size + 1 : size - 1;
      size = Math.max(minSide, nextSize);
      areaNow = countFor(size);
    }

    const finalTiles = [];
    const armWidth = Math.max(3, Math.round(clamp(size / 5, 3, 9)));
    const tileSet = new Set();
    const halfArm = Math.floor(armWidth / 2);
    for (let i = 0; i < size; i++) {
      for (let w = -halfArm; w <= halfArm; w++) {
        if (i + w >= 0 && i + w < size) tileSet.add(`${i},${i + w}`);
        if (size - 1 - i + w >= 0 && size - 1 - i + w < size)
          tileSet.add(`${i},${size - 1 - i + w}`);
      }
    }
    tileSet.forEach((key) => {
      const [x, y] = key.split(",").map(Number);
      finalTiles.push({ x, y });
    });

    return finalizeRoomShape("x", size, size, finalTiles);
  }
  function rasterizeRingHub(targetArea, minSide) {
    const orient = randChoice(["h", "v"]);
    const cw = Math.max(1, Math.floor(Math.max(2, minSide / 6)));

    let R = Math.max(minSide, Math.ceil(Math.sqrt(targetArea / Math.PI)));

    const chooseParams = (R) => {
      const w = clamp(
        Math.floor(R / 4),
        2,
        Math.max(2, Math.floor(minSide / 2)),
      );
      const rcMax = Math.max(2, R - w - 3);
      const rc = clamp(Math.floor(R / 3), 2, rcMax);
      return { w, rc };
    };

    const countFor = (R) => {
      const { w, rc } = chooseParams(R);
      const S = 2 * R + 1;
      const half = R;
      let c = 0;

      const tInner2 = (R - w) * (R - w);
      const tOuter2 = R * R;
      const hub2 = rc * rc;
      const halfCW = Math.floor((cw - 1) / 2);

      if (orient === "h") {
        for (let y = -half; y <= half; y++) {
          for (let x = -half; x <= half; x++) {
            const r2 = x * x + y * y;
            const inRing = r2 <= tOuter2 && r2 >= tInner2;
            const inHub = r2 <= hub2;
            const inCorr = Math.abs(y) <= halfCW && x >= rc && x <= R - w;
            if (inRing || inHub || inCorr) c++;
          }
        }
      } else {
        for (let y = -half; y <= half; y++) {
          for (let x = -half; x <= half; x++) {
            const r2 = x * x + y * y;
            const inRing = r2 <= tOuter2 && r2 >= tInner2;
            const inHub = r2 <= hub2;
            const inCorr = Math.abs(x) <= halfCW && y >= rc && y <= R - w;
            if (inRing || inHub || inCorr) c++;
          }
        }
      }
      return c;
    };

    const within = (val, tgt) =>
      Math.abs(val - tgt) <= Math.max(12, Math.floor(tgt * 0.1));
    let areaNow = countFor(R);
    let guard = 0;
    while (!within(areaNow, targetArea) && guard++ < 200) {
      if (areaNow < targetArea) R += 1;
      else if (R > minSide + 2) R -= 1;
      else break;
      areaNow = countFor(R);
    }

    const { w, rc } = chooseParams(R);
    const S = 2 * R + 1;
    const half = R;
    const tiles = [];

    const tInner2 = (R - w) * (R - w);
    const tOuter2 = R * R;
    const hub2 = rc * rc;
    const halfCW = Math.floor((cw - 1) / 2);

    if (orient === "h") {
      for (let y = -half; y <= half; y++) {
        for (let x = -half; x <= half; x++) {
          const r2 = x * x + y * y;
          const inRing = r2 <= tOuter2 && r2 >= tInner2;
          const inHub = r2 <= hub2;
          const inCorr = Math.abs(y) <= halfCW && x >= rc && x <= R - w;
          if (inRing || inHub || inCorr)
            tiles.push({ x: x + half, y: y + half });
        }
      }
    } else {
      for (let y = -half; y <= half; y++) {
        for (let x = -half; x <= half; x++) {
          const r2 = x * x + y * y;
          const inRing = r2 <= tOuter2 && r2 >= tInner2;
          const inHub = r2 <= hub2;
          const inCorr = Math.abs(x) <= halfCW && y >= rc && y <= R - w;
          if (inRing || inHub || inCorr)
            tiles.push({ x: x + half, y: y + half });
        }
      }
    }

    return finalizeRoomShape("ringhub", S, S, tiles);
  }
  function makeShape(targetArea, minSide) {
    const shape = randChoice([
      "square",
      "rectangle",
      "round",
      "hex",
      "oct",
      "cross",
      "x",
      "ringhub",
    ]);
    if (shape === "square")
      return rasterizeRectLike(targetArea, minSide, "square");
    if (shape === "rectangle")
      return rasterizeRectLike(targetArea, minSide, "rectangle");
    if (shape === "round") return rasterizeDisc(targetArea, minSide);
    if (shape === "hex")
      return rasterizeRegularPolygon(6, targetArea, minSide, "hex");
    if (shape === "oct")
      return rasterizeRegularPolygon(8, targetArea, minSide, "oct");
    if (shape === "cross") return rasterizeCross(targetArea, minSide);
    if (shape === "x") return rasterizeX(targetArea, minSide);
    return rasterizeRingHub(targetArea, minSide);
  }
  function canPlace(bbox, placed, minSpacing) {
    for (const r of placed) {
      const other = r.bbox;
      const overlap = !(
        bbox.x1 < other.x0 ||
        bbox.x0 > other.x1 ||
        bbox.y1 < other.y0 ||
        bbox.y0 > other.y1
      );
      if (overlap) return false;
      const l1 = manhattanEdgeDistanceRect(bbox, other);
      if (l1 < minSpacing) return false;
    }
    return true;
  }

  // -------------------------------------------------------------
  // Large-Rooms-Only Dungeon Generator (dynamic map, wall buffer)
  // Floors = 0, Walls = 1
  // -------------------------------------------------------------
  function generateLargeRoomsMap(options = {}) {
    /*
     * High level algorithm:
     *   1. Randomly pick a target area and silhouette for each desired room (square,
     *      round, polygonal, etc.) using the rasterize helpers above.
     *   2. Scatter the rooms in an expanding search radius until they no longer overlap,
     *      keeping a large Manhattan buffer so big chambers do not bleed into each other.
     *   3. After all rooms are placed, normalise the co-ordinates so the outer border is
     *      padded with solid walls and emit a single grid where 0 = floor, 1 = wall.
     *
     * The function returns both the finished tile grid and metadata about every room so
     * downstream systems (path validation, loot placement, etc.) do not need to reverse
     * engineer the layout again.
     */
    const cfg = {
      roomCountRange: [1, 11],
      areaRange: [300, 750],
      minSide: 8, // tiles; for round => diameter >= 2*minSide
      minL1EdgeSpacing: 30, // tiles; Manhattan edge-to-edge distance
      border: 15, // outer wall buffer thickness
      maxAttemptsPerRoom: 600,
      ...options,
    };
    const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

    const desiredRooms = randInt(
      cfg.roomCountRange[0],
      cfg.roomCountRange[1],
    );
    const bigRooms = [];
    for (let i = 0; i < desiredRooms; i++) {
      const area = randInt(cfg.areaRange[0], cfg.areaRange[1]);
      bigRooms.push(makeShape(area, cfg.minSide));
    }
    const placed = [];
    let searchRadius = 0;
    for (const room of bigRooms) {
      let placedOK = false;
      const baseR = (searchRadius +=
        Math.max(room.w, room.h) + cfg.minL1EdgeSpacing);
      for (let attempt = 0; attempt < cfg.maxAttemptsPerRoom; attempt++) {
        const R = baseR + Math.floor(attempt / 10) * 10;
        const tx = randInt(-R, R);
        const ty = randInt(-R, R);
        const bbox = {
          x0: tx + room.bbox.x0,
          y0: ty + room.bbox.y0,
          x1: tx + room.bbox.x1,
          y1: ty + room.bbox.y1,
        };
        if (!canPlace(bbox, placed, cfg.minL1EdgeSpacing)) continue;
        const translatedTiles = room.tiles.map((t) => ({
          x: tx + t.x,
          y: ty + t.y,
        }));
        const placedRoom = {
          kind: room.kind,
          w: room.w,
          h: room.h,
          bbox,
          center: { x: tx + room.center.x, y: ty + room.center.y },
          tiles: translatedTiles,
        };
        placed.push(placedRoom);
        placedOK = true;
        break;
      }
    }
    if (placed.length === 0) {
      const fallback = rasterizeRectLike(
        clamp((cfg.areaRange[0] + cfg.areaRange[1]) >> 1, 300, 750),
        cfg.minSide,
        "square",
      );
      const fallbackRoom = {
        kind: fallback.kind,
        w: fallback.w,
        h: fallback.h,
        bbox: {
          x0: fallback.bbox.x0,
          y0: fallback.bbox.y0,
          x1: fallback.bbox.x1,
          y1: fallback.bbox.y1,
        },
        center: { x: fallback.center.x, y: fallback.center.y },
        tiles: fallback.tiles.map((t) => ({ x: t.x, y: t.y })),
      };
      placed.push(fallbackRoom);
    }
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const r of placed) {
      minX = Math.min(minX, r.bbox.x0);
      minY = Math.min(minY, r.bbox.y0);
      maxX = Math.max(maxX, r.bbox.x1);
      maxY = Math.max(maxY, r.bbox.y1);
    }
    const innerW = maxX - minX + 1;
    const innerH = maxY - minY + 1;
    const W = innerW + 2 * cfg.border;
    const H = innerH + 2 * cfg.border;
    const grid = Array.from({ length: H }, () =>
      Array(W).fill(TILE_WALL),
    );
    const ox = -minX + cfg.border;
    const oy = -minY + cfg.border;
    for (const r of placed) {
      for (const t of r.tiles) {
        const gx = t.x + ox;
        const gy = t.y + oy;
        if (gy >= 0 && gy < H && gx >= 0 && gx < W)
          grid[gy][gx] = TILE_FLOOR;
      }
    }
    const deriveBBox = (tiles) => {
      if (!tiles || tiles.length === 0)
        return { x0: 0, y0: 0, x1: -1, y1: -1 };
      let x0 = tiles[0].x;
      let y0 = tiles[0].y;
      let x1 = tiles[0].x;
      let y1 = tiles[0].y;
      for (const t of tiles) {
        if (t.x < x0) x0 = t.x;
        if (t.y < y0) y0 = t.y;
        if (t.x > x1) x1 = t.x;
        if (t.y > y1) y1 = t.y;
      }
      return { x0, y0, x1, y1 };
    };
    const rooms = placed.map((r) => {
      const shape = r.room ?? r;
      const tiles = Array.isArray(r.tiles)
        ? r.tiles
        : Array.isArray(shape.tiles)
        ? shape.tiles
        : [];
      const rawBBox = r.bbox ?? shape.bbox ?? deriveBBox(tiles);
      const width =
        typeof shape.w === "number"
          ? shape.w
          : rawBBox.x1 >= rawBBox.x0
          ? rawBBox.x1 - rawBBox.x0 + 1
          : 0;
      const height =
        typeof shape.h === "number"
          ? shape.h
          : rawBBox.y1 >= rawBBox.y0
          ? rawBBox.y1 - rawBBox.y0 + 1
          : 0;
      const center = r.center ?? shape.center ?? {
        x: rawBBox.x0 + (width - 1) / 2,
        y: rawBBox.y0 + (height - 1) / 2,
      };
      return {
        kind: shape.kind ?? "unknown",
        w: width,
        h: height,
        bbox: {
          x0: rawBBox.x0 + ox,
          y0: rawBBox.y0 + oy,
          x1: rawBBox.x1 + ox,
          y1: rawBBox.y1 + oy,
        },
        center: { x: center.x + ox, y: center.y + oy },
        tiles: tiles.map((t) => ({ x: t.x + ox, y: t.y + oy })),
      };
    });
    return {
      grid,
      width: W,
      height: H,
      rooms,
      meta: {
        border: cfg.border,
        minL1EdgeSpacing: cfg.minL1EdgeSpacing,
        minSide: cfg.minSide,
        requestedRooms: desiredRooms,
        placedRooms: placed.length,
      },
    };
  }
  // --- DELAUNAY TRIANGULATION IMPLEMENTATION ---
  class Vertex {
    constructor(x, y) {
      this.x = x;
      this.y = y;
    }
    equals(vertex) {
      return this.x === vertex.x && this.y === vertex.y;
    }
  }

  class Edge {
    constructor(v0, v1) {
      this.v0 = v0;
      this.v1 = v1;
    }
    equals(edge) {
      return (
        (this.v0.equals(edge.v0) && this.v1.equals(edge.v1)) ||
        (this.v0.equals(edge.v1) && this.v1.equals(edge.v0))
      );
    }
  }

  class Triangle {
    constructor(v0, v1, v2) {
      this.v0 = v0;
      this.v1 = v1;
      this.v2 = v2;
      this.circumCircle = calcCircumCircle(v0, v1, v2);
    }
  }

  // Canonical: returns { center, radius, contains(p) }
  // (Only definition; earlier duplicate helper removed.)
  function calcCircumCircle(v0, v1, v2) {
    const ax = v0.x,
      ay = v0.y;
    const bx = v1.x,
      by = v1.y;
    const cx = v2.x,
      cy = v2.y;

    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (d === 0) {
      const center = { x: Infinity, y: Infinity };
      const radius = Infinity;
      return {
        center,
        radius,
        contains() {
          return false;
        },
      };
    }

    const ux =
      ((ax * ax + ay * ay) * (by - cy) +
        (bx * bx + by * by) * (cy - ay) +
        (cx * cx + cy * cy) * (ay - by)) /
      d;

    const uy =
      ((ax * ax + ay * ay) * (cx - bx) +
        (bx * bx + by * by) * (ax - cx) +
        (cx * cx + cy * cy) * (bx - ax)) /
      d;

    const center = { x: ux, y: uy };
    const radius = Math.hypot(ux - ax, uy - ay);

    return {
      center,
      radius,
      contains(p) {
        const dx = p.x - center.x;
        const dy = p.y - center.y;
        // tiny epsilon to avoid borderline FP issues
        return dx * dx + dy * dy <= radius * radius + 1e-9;
      },
    };
  }

  function superTriangle(vertices) {
    var minx = Infinity,
      miny = Infinity,
      maxx = -Infinity,
      maxy = -Infinity;
    vertices.forEach(function (vertex) {
      minx = Math.min(minx, vertex.x);
      miny = Math.min(miny, vertex.y);
      maxx = Math.max(maxx, vertex.x);
      maxy = Math.max(maxy, vertex.y);
    });
    var dx = (maxx - minx) * 10,
      dy = (maxy - miny) * 10;
    var v0 = new Vertex(minx - dx, miny - dy * 3),
      v1 = new Vertex(minx - dx, maxy + dy),
      v2 = new Vertex(maxx + dx * 3, maxy + dy);
    return new Triangle(v0, v1, v2);
  }
  function addVertex(vertex, triangles) {
    var edges = [];
    triangles = triangles.filter(function (triangle) {
      if (triangle.circumCircle.contains(vertex)) {
        edges.push(new Edge(triangle.v0, triangle.v1));
        edges.push(new Edge(triangle.v1, triangle.v2));
        edges.push(new Edge(triangle.v2, triangle.v0));
        return false;
      }
      return true;
    });
    edges = uniqueEdges(edges);
    edges.forEach(function (edge) {
      triangles.push(new Triangle(edge.v0, edge.v1, vertex));
    });
    return triangles;
  }
  function uniqueEdges(edges) {
    const uniqueEdgesMap = new Map();
    for (const edge of edges) {
      // Create a consistent key regardless of vertex order
      const key =
        edge.v0.x < edge.v1.x ||
        (edge.v0.x === edge.v1.x && edge.v0.y < edge.v1.y)
          ? `${posKey(edge.v0)}-${posKey(edge.v1)}`
          : `${posKey(edge.v1)}-${posKey(edge.v0)}`;

      if (uniqueEdgesMap.has(key)) {
        uniqueEdgesMap.delete(key); // Found a pair, so it's not unique
      } else {
        uniqueEdgesMap.set(key, edge); // First time seeing this edge
      }
    }
    return Array.from(uniqueEdgesMap.values());
  }
  function triangulate(vertices) {
    var st = superTriangle(vertices);
    var triangles = [st];
    vertices.forEach(function (vertex) {
      triangles = addVertex(vertex, triangles);
    });
    triangles = triangles.filter(function (triangle) {
      return !(
        triangle.v0.equals(st.v0) ||
        triangle.v0.equals(st.v1) ||
        triangle.v0.equals(st.v2) ||
        triangle.v1.equals(st.v0) ||
        triangle.v1.equals(st.v1) ||
        triangle.v1.equals(st.v2) ||
        triangle.v2.equals(st.v0) ||
        triangle.v2.equals(st.v1) ||
        triangle.v2.equals(st.v2)
      );
    });
    return triangles;
  }
  // ============================================================
  // HYBRID DUNGEON GENERATOR
  // Combines a large-room scaffold pass with the smaller-room filler and finally
  // adds connecting corridors. (Previous prototypes lived in test.html/test2 but
  // the logic is now embedded directly in index.html.)
  // Floors = 0, Walls = 1
  // ============================================================
  // ----- CONFIG -----
  const HYBRID_CFG = CONFIG.generator.hybrid;
  // Utility
  // clamp01Normalized helper ensures probability/ratio values stay in [0, 1].
  const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  // -------------------------
  // Phase A: Large rooms
  // -------------------------
  function generateLargeRoomsScaffold(cfg = HYBRID_CFG.large) {
    // This is adapted from the old test2 prototype's generateLargeRoomsMap helper,
    // but now lives directly in the production code so we can return both the
    // grid and normalized room descriptors.
    const out = generateLargeRoomsMap({
      roomCountRange: cfg.roomCountRange,
      areaRange: cfg.areaRange,
      minSide: cfg.minSide,
      minL1EdgeSpacing: cfg.minL1EdgeSpacing,
      border: cfg.border,
      maxAttemptsPerRoom: cfg.maxAttemptsPerRoom,
    });
    // Normalize large rooms to a common format
    const largeRooms = out.rooms.map((r) => ({
      kind: r.kind,
      w: r.w,
      h: r.h,
      bbox: {
        x0: r.bbox.x0,
        y0: r.bbox.y0,
        x1: r.bbox.x1,
        y1: r.bbox.y1,
      },
      center: { x: r.center.x, y: r.center.y },
      tiles: r.tiles.map((t) => ({ x: t.x, y: t.y })),
    }));
    return {
      grid: out.grid,
      width: out.width,
      height: out.height,
      border: cfg.border,
      largeRooms,
    };
  }
  // -------------------------
  // Phase B: Fill with small rooms
  // -------------------------
  function rectsGenerateCandidates(count, sizeMin, sizeMax, spawnRadius) {
    // Preserve the biased sizing curve from the earlier prototype but keep it here
    // so readers don't have to chase down the old test.html snippet.
    const normal = () =>
      (Math.random() + Math.random() + Math.random()) / 3; // 0..1
    const rects = [];
    for (let i = 0; i < count; i++) {
      const w =
        sizeMin.w + Math.round(normal() * (sizeMax.w - sizeMin.w));
      const h =
        sizeMin.h + Math.round(normal() * (sizeMax.h - sizeMin.h));
      rects.push({
        x: Math.random() * spawnRadius - spawnRadius / 2,
        y: Math.random() * spawnRadius - spawnRadius / 2,
        w: Math.max(sizeMin.w, w),
        h: Math.max(sizeMin.h, h),
      });
    }
    return rects;
  }
  function rectsSeparate(rects, iterations = 80) {
    // Push-apart pass, then round to ints
    for (let iter = 0; iter < iterations; iter++) {
      let moved = false;
      for (let j = 0; j < rects.length; j++) {
        const r1 = rects[j];
        for (let k = j + 1; k < rects.length; k++) {
          const r2 = rects[k];
          const dx = r1.x + r1.w / 2 - (r2.x + r2.w / 2);
          const dy = r1.y + r1.h / 2 - (r2.y + r2.h / 2);
          const halfW = (r1.w + r2.w) / 2;
          const halfH = (r1.h + r2.h) / 2;
          if (Math.abs(dx) < halfW && Math.abs(dy) < halfH) {
            moved = true;
            const ox = halfW - Math.abs(dx);
            const oy = halfH - Math.abs(dy);
            if (ox < oy) {
              const m = (ox / 2) * (dx > 0 ? 1 : -1);
              r1.x += m;
              r2.x -= m;
            } else {
              const m = (oy / 2) * (dy > 0 ? 1 : -1);
              r1.y += m;
              r2.y -= m;
            }
          }
        }
      }
      if (!moved && iter > 10) break;
    }
    // Round to integer grid
    return rects.map((r) => ({
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.max(1, Math.round(r.w)),
      h: Math.max(1, Math.round(r.h)),
    }));
  }
  function rectIntersects(a, b) {
    return !(
      a.x + a.w - 1 < b.x ||
      b.x + b.w - 1 < a.x ||
      a.y + a.h - 1 < b.y ||
      b.y + b.h - 1 < a.y
    );
  }
  function inflateRect(r, d) {
    return { x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d };
  }
  function carveRoomIntoGrid(grid, r) {
    const H = grid.length,
      W = grid[0].length;
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) {
      if (y <= 0 || y >= H - 1) continue;
      for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
        if (x <= 0 || x >= W - 1) continue;
        grid[y][x] = TILE_FLOOR; // floor
      }
    }
  }
  function smallRoomsFillIntoGrid(
    grid,
    largeRooms,
    border,
    cfg = HYBRID_CFG.small,
  ) {
    const H = grid.length,
      W = grid[0].length;
    // Inflate large rooms by clearance and treat them as blocked for small room placement
    const inflatedLarge = largeRooms.map((L) =>
      inflateRect(
        { x: L.bbox.x0, y: L.bbox.y0, w: L.w, h: L.h },
        cfg.clearanceFromLarge,
      ),
    );
    // Build a combined forbidden mask = outside interior OR within clearance of any large room
    const forbidden = (x, y) => {
      if (x < border || y < border || x >= W - border || y >= H - border)
        return true;
      return inflatedLarge.some(
        (L) =>
          x >= L.x &&
          x <= L.x + L.w - 1 &&
          y >= L.y &&
          y <= L.y + L.h - 1,
      );
    };
    // Spawn candidates in a radius around map center
    const spawnRadius = Math.max(W, H);
    let candidates = rectsGenerateCandidates(
      cfg.candidateCount,
      cfg.minSize,
      cfg.maxSize,
      spawnRadius,
    );
    candidates = rectsSeparate(candidates, cfg.separationIters);
    // Translate candidates from local space to map space: center them roughly at map center
    const ox = Math.floor(W / 2),
      oy = Math.floor(H / 2);
    candidates = candidates.map((r) => ({
      x: r.x + ox,
      y: r.y + oy,
      w: r.w,
      h: r.h,
    }));
    // Filter candidates:
    const kept = [];
    for (const r of candidates) {
      // 1) Intersects interior?
      const violatesBorder =
        forbidden(r.x, r.y) || // top-left
        forbidden(r.x + r.w - 1, r.y) || // top-right
        forbidden(r.x, r.y + r.h - 1) || // bottom-left
        forbidden(r.x + r.w - 1, r.y + r.h - 1); // bottom-right
      if (violatesBorder) continue;
      // 2) Avoid overlap with any inflated large room
      const overlapsLarge = inflatedLarge.some((L) =>
        rectIntersects({ x: r.x, y: r.y, w: r.w, h: r.h }, L),
      );
      if (overlapsLarge) continue;
      // 3) Avoid carving into existing floors poorly: optional
      // We allow overlap with empty space; it is fine to merge.
      kept.push(r);
    }
    // Optionally thin out density
    const targetCount = Math.round(
      kept.length * clamp01Normalized(cfg.keepRatio),
    );
    const smallRooms = shuffle(kept).slice(0, targetCount);
    // Carve
    for (const r of smallRooms) carveRoomIntoGrid(grid, r);
    // Return normalized descriptors for graph building
    const smallNormalized = smallRooms.map((r) => {
      const tiles = [];
      for (let dy = 0; dy < r.h; dy++) {
        for (let dx = 0; dx < r.w; dx++) {
          tiles.push({ x: r.x + dx, y: r.y + dy });
        }
      }
      return {
        kind: "rect",
        w: r.w,
        h: r.h,
        bbox: { x0: r.x, y0: r.y, x1: r.x + r.w - 1, y1: r.y + r.h - 1 },
        center: {
          x: r.x + Math.floor(r.w / 2),
          y: r.y + Math.floor(r.h / 2),
        },
        tiles,
      };
    });
    return smallNormalized;
  }
  // -------------------------
  // Phase C: Corridors and connectivity
  // -------------------------
  function kruskal(edges, pointCount) {
    const mst = [];
    const parent = Array.from({ length: pointCount }, (_, i) => i);
    const find = (i) =>
      parent[i] === i ? i : (parent[i] = find(parent[i]));
    const unite = (i, j) => {
      const a = find(i),
        b = find(j);
      if (a !== b) {
        parent[a] = b;
        return true;
      }
      return false;
    };
    edges.sort((a, b) => a.dist - b.dist);
    for (const e of edges) if (unite(e.p1, e.p2)) mst.push(e);
    return mst;
  }
  function buildEdgesFromDelaunay(points) {
    const vertices = points.map((p, i) => {
      const v = new Vertex(p.x, p.y);
      v.id = i;
      return v;
    });
    const triangleObjects = triangulate(vertices);
    const tri = [];
    for (const t of triangleObjects) {
      tri.push(t.v0.id, t.v1.id, t.v2.id);
    }
    const set = new Map();
    for (let i = 0; i < tri.length; i += 3) {
      const a = tri[i],
        b = tri[i + 1],
        c = tri[i + 2];
      const add = (i1, i2) => {
        const key = i1 < i2 ? `${i1}-${i2}` : `${i2}-${i1}`;
        if (!set.has(key)) {
          const p = points[i1],
            q = points[i2];
          set.set(key, {
            p1: i1,
            p2: i2,
            dist: Math.hypot(p.x - q.x, p.y - q.y),
          });
        }
      };
      add(a, b);
      add(b, c);
      add(c, a);
    }
    return Array.from(set.values());
  }
  function carveLCorridor(grid, p1, p2) {
    let x = Math.round(p1.x),
      y = Math.round(p1.y);
    const tx = Math.round(p2.x),
      ty = Math.round(p2.y);

    const carved = [];
    const record = (cx, cy) => {
      if (!inBounds(grid, cx, cy)) return;
      grid[cy][cx] = TILE_FLOOR;
      const last = carved[carved.length - 1];
      if (!last || last.x !== cx || last.y !== cy) {
        carved.push({ x: cx, y: cy });
      }
    };

    record(x, y);
    const goXFirst = Math.random() > 0.5;
    if (goXFirst) {
      while (x !== tx) {
        x += Math.sign(tx - x);
        record(x, y);
      }
      while (y !== ty) {
        y += Math.sign(ty - y);
        record(x, y);
      }
    } else {
      while (y !== ty) {
        y += Math.sign(ty - y);
        record(x, y);
      }
      while (x !== tx) {
        x += Math.sign(tx - x);
        record(x, y);
      }
    }
    record(tx, ty);
    return carved;
  }
  function floodFillOpen(grid, start) {
    const H = grid.length,
      W = grid[0].length;
    const key = (x, y) => `${x},${y}`;
    const seen = new Set();
    const q = [];
    if (start.x < 0 || start.y < 0 || start.x >= W || start.y >= H)
      return seen;
    if (grid[start.y][start.x] === TILE_WALL) return seen;
    q.push(start);
    seen.add(key(start.x, start.y));
    while (q.length) {
      const p = q.shift();
      for (const { dx, dy } of CARDINAL_DIRECTIONS) {
        const nx = p.x + dx;
        const ny = p.y + dy;
        const k = key(nx, ny);
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (grid[ny][nx] === TILE_FLOOR && !seen.has(k)) {
          seen.add(k);
          q.push({ x: nx, y: ny });
        }
      }
    }
    return seen;
  }
  function ensureConnectivity(grid, nodes, options = {}) {
    // BFS from first node center; if a node is isolated, connect it to nearest reachable cell.
    if (nodes.length === 0) return;
    const start = nodes[0];
    let reachable = floodFillOpen(grid, {
      x: Math.round(start.center.x),
      y: Math.round(start.center.y),
    });
    const key = (x, y) => `${x},${y}`;
    const has = (p) =>
      reachable.has(key(Math.round(p.center.x), Math.round(p.center.y)));
    const onCorridorCarved =
      typeof options.onCorridorCarved === "function"
        ? options.onCorridorCarved
        : null;
    for (const n of nodes) {
      if (has(n)) continue;
      // find nearest reachable cell
      let best = null,
        bestD = Infinity;
      for (const k of reachable) {
        const [x, y] = k.split(",").map(Number);
        const d =
          Math.abs(x - Math.round(n.center.x)) +
          Math.abs(y - Math.round(n.center.y));
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
      if (best) {
        const path = carveLCorridor(
          grid,
          { x: Math.round(n.center.x), y: Math.round(n.center.y) },
          best,
        );
        if (onCorridorCarved && Array.isArray(path) && path.length > 0) {
          onCorridorCarved(path, { fromRoom: n, toRoom: null, target: best });
        }
        reachable = floodFillOpen(grid, {
          x: Math.round(start.center.x),
          y: Math.round(start.center.y),
        });
      }
    }
  }

  function clampPositionToGrid(grid, pos) {
    const height = Array.isArray(grid) ? grid.length : 0;
    const width =
      height > 0 && Array.isArray(grid[0]) ? grid[0].length : 0;

    const rawX = Number.isFinite(pos?.x) ? pos.x : 0;
    const rawY = Number.isFinite(pos?.y) ? pos.y : 0;

    const x = width > 0 ? clamp(Math.round(rawX), 0, width - 1) : 0;
    const y = height > 0 ? clamp(Math.round(rawY), 0, height - 1) : 0;

    return { x, y };
  }
  function ensureFloorAt(grid, pos) {
    if (!grid || !pos) return;
    const rowIndex = Math.round(pos.y);
    if (rowIndex < 0 || rowIndex >= grid.length) return;
    const row = grid[rowIndex];
    if (!Array.isArray(row)) return;
    const colIndex = Math.round(pos.x);
    if (colIndex < 0 || colIndex >= row.length) return;
    if (row[colIndex] === TILE_WALL) {
      row[colIndex] = TILE_FLOOR;
    }
  }
  // -------------------------
  // Master generator
  // -------------------------
  function generateDungeon() {
    // Phase A: large-room scaffold
    const largeOut = generateLargeRoomsScaffold(HYBRID_CFG.large);
    // Adopt dynamic map sizing from scaffold
    mapState.width = largeOut.width;
    mapState.height = largeOut.height;
    const grid = largeOut.grid.map((row) => row.slice()); // copy
    const largeRooms = largeOut.largeRooms.map((room, idx) => ({
      ...room,
      id: typeof room.id === "string" ? room.id : `large-${idx}`,
    }));
    // Phase B: small rooms filling
    const smallRaw = smallRoomsFillIntoGrid(
      grid,
      largeRooms,
      largeOut.border,
      HYBRID_CFG.small,
    );
    const smallRooms = smallRaw.map((room, idx) => ({
      ...room,
      id: typeof room.id === "string" ? room.id : `small-${idx}`,
    }));
    // Unified node list (centers)
    const allRooms = largeRooms.concat(smallRooms);
    // Phase C: corridors (only now)
    const points = allRooms.map((r) => ({
      x: r.center.x,
      y: r.center.y,
    }));
    const edges = buildEdgesFromDelaunay(points);
    const mst = kruskal(edges, points.length);
    // Add sparse extra edges
    const extrasCount = Math.floor(
      edges.length * HYBRID_CFG.corridors.extraEdgeFraction,
    );
    const extraEdges = shuffle(
      edges.filter((e) => !mst.includes(e)),
    ).slice(0, extrasCount);
    const finalEdges = mst.concat(extraEdges);
    // Carve corridors
    const corridorConnections = [];
    const addCorridor = (path, fromRoom, toRoom) => {
      if (!Array.isArray(path) || path.length === 0) return null;
      const id = `corr-${corridorConnections.length}`;
      corridorConnections.push({
        id,
        path: path.map((step) => ({ x: step.x, y: step.y })),
        fromRoomId: fromRoom?.id ?? null,
        toRoomId: toRoom?.id ?? null,
      });
      return id;
    };
    for (const e of finalEdges) {
      const path = carveLCorridor(grid, points[e.p1], points[e.p2]);
      if (path && path.length > 0) {
        addCorridor(path, allRooms[e.p1], allRooms[e.p2]);
      }
    }
    // Rescue connectivity if any isolated parts remain
    if (HYBRID_CFG.corridors.rescueConnectivity) {
      ensureConnectivity(grid, allRooms, {
        onCorridorCarved(path, meta) {
          if (!path || path.length === 0) return;
          addCorridor(path, meta?.fromRoom ?? null, meta?.toRoom ?? null);
        },
      });
    }
    // Choose start/end on far rooms
    const startRoom = allRooms[0] || null;
    const rawStart = startRoom?.center
      ? { x: startRoom.center.x, y: startRoom.center.y }
      : {
          x: Math.floor(mapState.width / 2),
          y: Math.floor(mapState.height / 2),
        };
    const start = clampPositionToGrid(grid, rawStart);
    let farIdx = 0,
      farDist = -1;
    for (let i = 0; i < allRooms.length; i++) {
      const d = manhattan(start, allRooms[i].center);
      if (d > farDist) {
        farDist = d;
        farIdx = i;
      }
    }
    const endRoom = allRooms[farIdx] || startRoom;
    const rawEnd = endRoom?.center
      ? { x: endRoom.center.x, y: endRoom.center.y }
      : rawStart;
    const end = clampPositionToGrid(grid, rawEnd);
    // Force floors at start/end
    ensureFloorAt(grid, start);
    ensureFloorAt(grid, end);
    const doorPlan = generateDoorsForDungeon(grid, {
      rooms: allRooms,
      corridors: corridorConnections,
      config: HYBRID_CFG.doors || {},
      rng: Math.random,
    });
    const furniturePlacements = normalizeFurniturePlacements(
      doorPlan?.placements || [],
    );
    return {
      grid,
      start,
      end,
      furniture: furniturePlacements,
    };
  }
  function applyCellSize(size) {
    const clamped = Math.max(MIN_CELL_SIZE, Math.floor(size));
    CELL_SIZE = clamped;
    HALF_CELL = CELL_SIZE / 2;
    if (viewportEl) {
      viewportEl.style.width = `${VIEW_W * CELL_SIZE}px`;
      viewportEl.style.height = `${VIEW_H * CELL_SIZE}px`;
    }
    if (
      renderController &&
      rendererReady &&
      mapState.width > 0 &&
      mapState.height > 0
    ) {
      renderController.resize(mapState.width, mapState.height, CELL_SIZE);
    }
  }
  function updateResponsiveLayout(forceRedraw = true) {
    if (!mapState.width || !mapState.height) return;
    if (!containerEl || !viewportEl || !canvas) return;
    const appContainer = document.getElementById("app-container");
    const uiPanel = document.getElementById("ui-panel");
    if (!appContainer || !uiPanel) return;

    const measure = () => {
      const containerRect = containerEl.getBoundingClientRect();
      const viewportRect = viewportEl.getBoundingClientRect();
      const appRect = appContainer.getBoundingClientRect();
      const uiRect = uiPanel.getBoundingClientRect();
      return { containerRect, viewportRect, appRect, uiRect };
    };

    applyCellSize(CONFIG.visual.cellSize);
    let metrics = measure();
    const viewportWidth =
      metrics.viewportRect.width || VIEW_W * CELL_SIZE;
    const viewportHeight =
      metrics.viewportRect.height || VIEW_H * CELL_SIZE;
    const nonViewportWidth = metrics.appRect.width - viewportWidth;
    const nonViewportHeight =
      metrics.containerRect.height - viewportHeight;

    const widthBudget = window.innerWidth - nonViewportWidth;
    const heightBudget = window.innerHeight - nonViewportHeight;

    const widthRatio =
      viewportWidth > 0 ? Math.max(0, widthBudget / viewportWidth) : 1;
    const heightRatio =
      viewportHeight > 0 ? Math.max(0, heightBudget / viewportHeight) : 1;
    let scale = Math.min(1, widthRatio, heightRatio);
    if (!Number.isFinite(scale) || scale <= 0) {
      const safeWidth = widthRatio > 0 ? widthRatio : 1;
      const safeHeight = heightRatio > 0 ? heightRatio : 1;
      scale = Math.min(1, safeWidth, safeHeight);
    }

    const targetSize = Math.max(
      MIN_CELL_SIZE,
      Math.min(
        CONFIG.visual.cellSize,
        Math.floor(CONFIG.visual.cellSize * scale),
      ),
    );
    applyCellSize(targetSize);
    metrics = measure();

    let safety = 0;
    while (safety < 25) {
      const totalWidth = metrics.appRect.width;
      const totalHeight = Math.max(
        metrics.containerRect.height,
        metrics.uiRect.height,
      );
      if (
        (totalWidth <= window.innerWidth || CELL_SIZE <= MIN_CELL_SIZE) &&
        (totalHeight <= window.innerHeight || CELL_SIZE <= MIN_CELL_SIZE)
      ) {
        break;
      }
      if (CELL_SIZE <= MIN_CELL_SIZE) break;
      applyCellSize(CELL_SIZE - 1);
      metrics = measure();
      safety++;
    }

    if (forceRedraw) redrawAfterResize();
  }
  function redrawAfterResize() {
    if (!rendererReady) return;
    if (!mapState.grid || !mapState.grid.length) return;
    if (!player || !player.pos) return;
    renderScene();
    if (isMinimapOpen()) {
      configureMinimapRenderer();
      renderMinimapScene();
    }
  }
  function handleResize() {
    if (!mapState.grid || !mapState.grid.length) return;
    updateResponsiveLayout(true);
    handleMinimapResize();
  }
  // --- UI & RENDER FUNCTIONS ---
  function setupDOM() {
    const inventory = player?.inventory;
    const capacity =
      typeof inventory?.capacitySlots === "number"
        ? inventory.capacitySlots
        : 0;
    const stackLength = Array.isArray(inventory?.stacks)
      ? inventory.stacks.length
      : 0;
    const invCapacity = Math.max(capacity, stackLength);
    uiManager.setupEquipmentSlots(ALL_SLOTS_ORDER, labelForSlot);
    uiManager.setupInventorySlots(invCapacity);
    updateResponsiveLayout(false);
  }

  function tooltipForItem(item) {
    if (!item) return "";
    const throwInfo = describeThrowable(item);
    if (isRangedWeapon(item)) {
      const base = RangedCombat.describeRangedWeapon(item);
      return throwInfo ? `${base}\nThrow: ${throwInfo}` : base;
    }
    const name = item.name || "";
    return throwInfo ? `${name}\nThrow: ${throwInfo}` : name;
  }

  function tooltipForStack(stack) {
    if (!stack) return "";
    return tooltipForItem(stack.item);
  }

  function renderUI() {
    uiManager.renderEquipment({
      slotOrder: ALL_SLOTS_ORDER,
      getItem: (slotName) => player.equipment.get(slotName),
      tooltipForItem,
    });
    uiManager.renderInventory({
      stacks: player.inventory.stacks,
      capacity: player.inventory.capacitySlots,
      tooltipForStack,
    });
  }

  function calculateViewportTransform(playerPos) {
    const mapPxW = mapState.width * CELL_SIZE;
    const mapPxH = mapState.height * CELL_SIZE;
    const vw = VIEW_W * CELL_SIZE;
    const vh = VIEW_H * CELL_SIZE;
    const desiredX = vw / 2 - (playerPos.x + 0.5) * CELL_SIZE;
    const desiredY = vh / 2 - (playerPos.y + 0.5) * CELL_SIZE;
    const tx = Math.round(Math.max(vw - mapPxW, Math.min(0, desiredX)));
    const ty = Math.round(Math.max(vh - mapPxH, Math.min(0, desiredY)));
    return { tx, ty };
  }

  function buildViewTransform(playerPos) {
    const { tx, ty } = calculateViewportTransform(playerPos);
    const view = {
      tx,
      ty,
      cellSize: CELL_SIZE,
      viewW: VIEW_W * CELL_SIZE,
      viewH: VIEW_H * CELL_SIZE,
    };
    return view;
  }

  const RESIST_BADGE_CONFIG = {
    fire: { icon: "🔥", color: "#fb923c" },
    cold: { icon: "❄︎", color: "#38bdf8" },
    lightning: { icon: "⚡", color: "#facc15" },
    poison: { icon: "☠", color: "#86efac" },
    acid: { icon: "🧪", color: "#bef264" },
    shadow: { icon: "⬤", color: "#c084fc" },
    void: { icon: "⬤", color: "#94a3b8" },
    arcane: { icon: "✦", color: "#c4b5fd" },
    slash: { icon: "🗡", color: "#f4f4f5" },
    pierce: { icon: "➴", color: "#bae6fd" },
    blunt: { icon: "⚒", color: "#e7e5e4" },
    radiant: { icon: "☀", color: "#fde68a" },
    necrotic: { icon: "☥", color: "#a855f7" },
  };
  const BADGE_BG_COLOR = "rgba(15,23,42,0.85)";
  const DEFAULT_BADGE_ICON = "⬡";
  const DEFAULT_BADGE_COLOR = "#f8fafc";
  const MIN_BADGE_VALUE = 0.05;

  const REQUEST_FRAME =
    typeof requestAnimationFrame === "function"
      ? (cb) => requestAnimationFrame(cb)
      : (cb) => setTimeout(cb, 1000 / 30);
  const CANCEL_FRAME =
    typeof cancelAnimationFrame === "function"
      ? (id) => cancelAnimationFrame(id)
      : (id) => clearTimeout(id);
  let lightAnimationFrameId = null;
  let lightAnimationActive = false;

  function stopLightAnimationLoop() {
    if (lightAnimationFrameId != null) {
      CANCEL_FRAME(lightAnimationFrameId);
      lightAnimationFrameId = null;
    }
    lightAnimationActive = false;
  }

  function scheduleNextLightAnimationFrame() {
    if (!lightAnimationActive || lightAnimationFrameId != null) return;
    lightAnimationFrameId = REQUEST_FRAME(() => {
      lightAnimationFrameId = null;
      renderScene(true);
    });
  }

  function updateLightAnimationState(flickerRate, fromAnimationFrame = false) {
    const shouldAnimate =
      Number.isFinite(flickerRate) &&
      flickerRate > 0 &&
      rendererReady &&
      mapState.grid &&
      mapState.grid.length > 0 &&
      player &&
      player.pos;
    if (!shouldAnimate) {
      if (lightAnimationActive) {
        stopLightAnimationLoop();
      }
      return;
    }
    if (!lightAnimationActive) {
      lightAnimationActive = true;
      if (!fromAnimationFrame) {
        scheduleNextLightAnimationFrame();
      }
      return;
    }
    if (fromAnimationFrame) {
      scheduleNextLightAnimationFrame();
    }
  }

  function renderScene(fromAnimationFrame = false) {
    if (!renderController || !rendererReady) {
      stopLightAnimationLoop();
      return;
    }
    if (!mapState.grid || !mapState.grid.length) {
      stopLightAnimationLoop();
      return;
    }
    if (!player || !player.pos) {
      stopLightAnimationLoop();
      return;
    }

    const playerPos = player.pos;
    const currentVisible =
      fovState.currentVisible instanceof Set
        ? fovState.currentVisible
        : new Set();
    const view = buildViewTransform(playerPos);

    const lightProps = getLightProperties();
    refreshLightingVisuals(lightProps);
    if (
      currentEndPos &&
      mapState.explored[currentEndPos.y]?.[currentEndPos.x]
    ) {
      isEndRendered = true;
      gameState.isEndRendered = isEndRendered;
    }

    const furnitureEntities = buildFurnitureVisuals(
      mapState,
      currentVisible,
      CONFIG.visual.colors,
    );
    const mobEntities = buildMobVisuals(mobManager, currentVisible);
    const renderEntities =
      furnitureEntities.length > 0
        ? furnitureEntities.concat(mobEntities)
        : mobEntities;

    const worldLightEntities = mapState?.groundItems ?? mapState?.entities ?? [];
    const mobList = resolveMobListForLighting(mobManager);
    const worldLights = collectWorldLightSources({
      player,
      entities: Array.isArray(worldLightEntities) ? worldLightEntities : [],
      mobs: mobList,
      mapState,
    });
    const compCtx = createCompositeLightContext(worldLights, LIGHT_CONFIG, getNow);
    const overlaySampleCache = new Map();
    const losCache = new Map();
    const gridForLighting = Array.isArray(mapState?.grid) ? mapState.grid : null;
    const losFn =
      LIGHT_CONFIG.requireLineOfSight && gridForLighting
        ? (L, tx, ty) => {
            const key = `${L.x},${L.y}->${tx},${ty}`;
            if (losCache.has(key)) {
              return losCache.get(key);
            }
            const result = hasLineOfSight(
              gridForLighting,
              { x: L.x, y: L.y },
              { x: tx, y: ty },
            );
            losCache.set(key, result);
            return result;
          }
        : null;
    const sample = (x, y) => {
      const key = `${x},${y}`;
      if (overlaySampleCache.has(key)) {
        return overlaySampleCache.get(key);
      }
      const value = compositeOverlayAt(x, y, compCtx, LIGHT_CONFIG, losFn);
      overlaySampleCache.set(key, value);
      return value;
    };

    const overlayColor = fovState.overlayRgb
      ? { ...fovState.overlayRgb, a: 1 }
      : null;

    renderController.render(
      {
        map: { grid: mapState.grid, explored: mapState.explored },
        fov: { visible: currentVisible },
        player: { x: playerPos.x, y: playerPos.y },
        start: player.startPos ?? null,
        end: isEndRendered ? currentEndPos : null,
        colors: CONFIG.visual.colors,
        overlayAlphaAt: (x, y) => {
          const s = sample(x, y);
          return s?.a ?? 0;
        },
        overlayColorAt: (x, y) => {
          const s = sample(x, y);
          return s?.rgb ?? null;
        },
        overlayColor,
        entities: renderEntities,
      },
      view,
    );

    if (debugState.showAIOverlay) {
      const lastDecision =
        typeof window !== "undefined" ? window.__AI_LAST_DECISION ?? null : null;
      updateAIOverlay(lastDecision);
    }

    const flicker = Math.max(lightProps?.flickerRate ?? 0, compCtx.maxFlickerRate ?? 0);
    updateLightAnimationState(flicker, fromAnimationFrame);
  }
  function resolveMobListForLighting(manager) {
    if (!manager) return [];
    if (typeof manager.list === "function") {
      try {
        const result = manager.list();
        return Array.isArray(result) ? result : [];
      } catch (err) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("mobManager.list() threw while gathering lights", err);
        }
        return [];
      }
    }
    if (Array.isArray(manager.list)) return manager.list;
    if (Array.isArray(manager)) return manager;
    return [];
  }
  function buildFurnitureVisuals(map, visibleSet, colors) {
    if (!map || !Array.isArray(map.furniture)) return [];
    if (!(visibleSet instanceof Set)) return [];
    const visuals = [];
    for (const placement of map.furniture) {
      if (!placement || !placement.position) continue;
      const x = Math.round(placement.position.x);
      const y = Math.round(placement.position.y);
      if (!map.explored?.[y]?.[x]) continue;
      const keyStr = posKeyFromCoords(x, y);
      if (!visibleSet.has(keyStr)) continue;
      const visual = describeFurnitureVisual(placement.furniture, colors);
      if (!visual) continue;
      visual.x = x;
      visual.y = y;
      visuals.push(visual);
    }
    return visuals;
  }
  function describeFurnitureVisual(furniture, colors) {
    if (!furniture) return null;
    if (furniture instanceof Door || furniture.kind === FurnitureKind.DOOR) {
      return describeDoorVisual(furniture, colors);
    }
    return describeFixtureVisual(furniture, colors);
  }
  function describeFixtureVisual(fixture, colors) {
    if (!fixture) return null;
    const kind = fixture.kind || FurnitureKind.GENERIC;
    const orientation = fixture.orientation || FurnitureOrientation.FLOOR;
    const hasEffect =
      typeof fixture.hasEffect === "function"
        ? (id) => fixture.hasEffect(id)
        : () => false;
    const base = {
      glyph: "□",
      fg: colors.fixtureGlyph || colors.door || "#e2e8f0",
      bg: colors.floor || "#1f2933",
      name: fixture.name || "Furniture",
      orientation,
      metadata: fixture.metadata || {},
      tags:
        typeof fixture.listTags === "function"
          ? fixture.listTags()
          : Array.isArray(fixture.tags)
            ? fixture.tags
            : [],
    };
    switch (kind) {
      case FurnitureKind.TABLE:
        base.glyph = "⊞";
        base.fg = colors.tableGlyph || "#fbbf24";
        break;
      case FurnitureKind.SEAT:
        base.glyph = "¤";
        base.fg = colors.seatGlyph || "#f97316";
        break;
      case FurnitureKind.STORAGE:
        base.glyph = "⌂";
        base.fg = colors.storageGlyph || "#b45309";
        break;
      case FurnitureKind.LIGHT:
        base.glyph = "✶";
        base.fg = colors.lightGlyph || "#fde68a";
        if (hasEffect(FURNITURE_EFFECT_IDS.MAGIC_AURA)) {
          base.fg = colors.lightMagicGlyph || "#a855f7";
        }
        break;
      case FurnitureKind.DECOR:
        base.glyph = "▤";
        base.fg = colors.decorGlyph || "#60a5fa";
        break;
      default:
        break;
    }
    return base;
  }
  function describeDoorVisual(door, colors) {
    const doorType = door.type || door.metadata?.type || null;
    const variantId =
      door.variantId || door.metadata?.variantId || DOOR_VARIANT_IDS.STANDARD;
    const orientation = door.orientation || FurnitureOrientation.NONE;
    const hasEffect =
      typeof door.hasEffect === "function"
        ? (id) => door.hasEffect(id)
        : () => false;
    const isOpen =
      typeof door.isOpen === "function"
        ? door.isOpen()
        : door.state === DOOR_STATE.OPEN;
    const state =
      typeof door.state === "string"
        ? door.state
        : door.metadata?.state || (isOpen ? DOOR_STATE.OPEN : DOOR_STATE.CLOSED);
    const isPortcullis =
      doorType === DOOR_TYPE.PORTCULLIS || variantId === DOOR_VARIANT_IDS.PORTCULLIS;
    const isArchway =
      doorType === DOOR_TYPE.ARCHWAY || variantId === DOOR_VARIANT_IDS.ARCHWAY;
    const isSecret =
      doorType === DOOR_TYPE.SECRET || variantId === DOOR_VARIANT_IDS.SECRET;
    const isSliding =
      doorType === DOOR_TYPE.SLIDING || variantId === DOOR_VARIANT_IDS.SLIDING;
    const isDouble =
      doorType === DOOR_TYPE.DOUBLE || variantId === DOOR_VARIANT_IDS.DOUBLE;
    const isGrate = doorType === DOOR_TYPE.GRATE || variantId === DOOR_VARIANT_IDS.GRATE;
    const isRuned = variantId === DOOR_VARIANT_IDS.RUNED;

    const baseBg = colors.door || colors.floor || "#2a1a0f";
    const baseFg = colors.doorGlyph || colors.floorGlyph || "#fef3c7";
    let glyph = "+";
    if (isPortcullis) {
      glyph = "#";
    } else if (isArchway) {
      glyph = "∩";
    } else if (isSecret) {
      glyph = "▣";
    } else if (isGrate) {
      glyph = "╬";
    } else if (isSliding) {
      glyph = "═";
    } else if (isDouble) {
      glyph = "≡";
    }
    let fg = baseFg;
    let bg = baseBg;

    if (isPortcullis) {
      fg = colors.doorPortcullis || fg;
    } else if (isGrate) {
      fg = colors.doorGrate || colors.doorPortcullis || fg;
    } else if (variantId === "reinforced") {
      fg = colors.doorReinforced || fg;
    } else if (isArchway) {
      fg = colors.doorArchway || fg;
      bg = colors.floor || bg;
    } else if (isSecret) {
      fg = colors.doorSecret || fg;
    } else if (isSliding) {
      fg = colors.doorSliding || fg;
    } else if (isDouble) {
      fg = colors.doorDouble || fg;
    }

    if (isRuned || hasEffect(FURNITURE_EFFECT_IDS.MAGIC_SEAL)) {
      fg = colors.doorRuned || colors.doorMagic || fg;
    }

    if (hasEffect(FURNITURE_EFFECT_IDS.BROKEN)) {
      glyph = "×";
      fg = colors.doorBroken || "#9ca3af";
      bg = colors.floor || bg;
    } else if (state === DOOR_STATE.BLOCKED) {
      glyph = "!";
      fg = colors.doorJammed || fg;
    } else if (!isArchway && isOpen) {
      glyph =
        orientation === FurnitureOrientation.NORTH_SOUTH ? "⟍" : "⟋";
      fg = colors.doorOpenGlyph || fg;
      bg = colors.floor || bg;
    }

    if (!hasEffect(FURNITURE_EFFECT_IDS.BROKEN)) {
      if (hasEffect(FURNITURE_EFFECT_IDS.LOCKED)) {
        fg = colors.doorLocked || fg;
      }
      if (hasEffect(FURNITURE_EFFECT_IDS.JAMMED)) {
        fg = colors.doorJammed || fg;
      }
    }

    const visual = {
      kind: "furniture:door",
      glyph,
      fg,
      bg,
    };

    const hasMagicSeal = hasEffect(FURNITURE_EFFECT_IDS.MAGIC_SEAL);
    const hasMagicAura = hasEffect(FURNITURE_EFFECT_IDS.MAGIC_AURA);
    if (hasMagicSeal || hasMagicAura) {
      visual.overlayA = hasMagicSeal ? 0.4 : 0.25;
      visual.overlayColor = colors.doorMagic || "#a855f7";
    }

    return visual;
  }
  function buildMobVisuals(manager, visibleSet) {
    if (!manager || !Array.isArray(manager.list)) return [];
    if (!(visibleSet instanceof Set)) return [];
    const visuals = [];
    for (const mob of manager.list) {
      if (!mob || mob.kind === "player") continue;
      const key = `${mob.x},${mob.y}`;
      if (!visibleSet.has(key)) continue;
      const badge = describeDominantResistBadge(mob);
      visuals.push({
        x: mob.x,
        y: mob.y,
        kind: "mob",
        glyph: mob.glyph || "m",
        fg: mob.color || "#f87171",
        badge: badge ? badge.text : undefined,
        badgeColor: badge ? badge.color : undefined,
        badgeBg: badge ? badge.bg : undefined,
      });
    }
    return visuals;
  }
  function describeDominantResistBadge(mob) {
    const entry = dominantResistEntry(mob);
    if (!entry) return null;
    const [type, value] = entry;
    const pct = Math.round(value * 100);
    if (pct <= 0) return null;
    const key = String(type || "").toLowerCase();
    const cfg = RESIST_BADGE_CONFIG[key] || null;
    const icon = cfg?.icon || DEFAULT_BADGE_ICON;
    const color = cfg?.color || DEFAULT_BADGE_COLOR;
    return {
      text: `${icon} ${pct}%`,
      color,
      bg: BADGE_BG_COLOR,
    };
  }
  function dominantResistEntry(mob) {
    const resists = resolveResistSource(mob);
    if (!resists) return null;
    let bestType = null;
    let bestValue = -Infinity;
    for (const [type, raw] of iterateResistEntries(resists)) {
      const value = Number(raw);
      if (!Number.isFinite(value)) continue;
      if (value > bestValue) {
        bestValue = value;
        bestType = type;
      }
    }
    if (!bestType || bestValue < MIN_BADGE_VALUE) return null;
    return [bestType, bestValue];
  }
  function resolveResistSource(mob) {
    if (!mob) return null;
    const direct = mob.modCache?.resists;
    if (direct && hasEntries(direct)) return direct;
    const nested = mob.modCache?.defense?.resists;
    if (nested && hasEntries(nested)) return nested;
    return null;
  }
  function hasEntries(obj) {
    if (!obj) return false;
    if (obj instanceof Map) return obj.size > 0;
    return Object.keys(obj).length > 0;
  }
  function iterateResistEntries(resists) {
    if (!resists) return [];
    if (resists instanceof Map) return resists.entries();
    return Object.entries(resists);
  }

  // Updates the persistent fog-of-war state as the player moves. This both
  // records which tiles were ever seen (explorationState) and promotes nearby
  // floor cells to "frontiers" so the explorer knows where to head next.
  // Uses getLightRadius() directly; removes stale helper logic.
  function updateVisionAndExploration(pos) {
    const lightRadius = readPlayerLightRadius();
    const radiusSq = lightRadius * lightRadius;
    explorationState.newlyExplored = [];
    const visibleCells = computeFieldOfView(pos, lightRadius, mapState, {
      useKnownGrid: false,
    });
    fovState.lastCache = {
      key: posKey(pos),
      radius: lightRadius,
      visible: visibleCells,
    };
    const cellsToUpdate = new Set(visibleCells);
    for (const cellKey of visibleCells) {
      const [x, y] = cellKey.split(",").map(Number);
      if (mapState.grid[y][x] === TILE_FLOOR) {
        for (const { dx, dy } of CARDINAL_DIRECTIONS) {
          const n = { x: x + dx, y: y + dy };
          const withinRadius =
            (n.x - pos.x) * (n.x - pos.x) +
              (n.y - pos.y) * (n.y - pos.y) <=
            radiusSq;
          if (
            withinRadius &&
            n.x >= 0 &&
            n.x < mapState.width &&
            n.y >= 0 &&
            n.y < mapState.height &&
            mapState.grid[n.y][n.x] === TILE_WALL
          ) {
            cellsToUpdate.add(posKey(n));
          }
        }
      }
    }
    for (const cellKey of cellsToUpdate) {
      const [x, y] = cellKey.split(",").map(Number);
      if (!mapState.explored[y][x]) {
        explorationState.newlyExplored.push({ x, y });
      }
      mapState.explored[y][x] = true;
      mapState.known[y][x] = mapState.grid[y][x];
      if (mapState.known[y][x] === TILE_FLOOR) {
        const neighbors = [
          { x: x, y: y - 1 },
          { x: x, y: y + 1 },
          { x: x - 1, y: y },
          { x: x + 1, y: y },
          { x: x - 1, y: y - 1 },
          { x: x - 1, y: y + 1 },
          { x: x + 1, y: y - 1 },
          { x: x + 1, y: y + 1 },
        ];
        const hasUnknown = neighbors.some(
          (n) =>
            n.x >= 0 &&
            n.x < mapState.width &&
            n.y >= 0 &&
            n.y < mapState.height &&
            mapState.known[n.y][n.x] === -1,
        );
        if (hasUnknown) {
          explorationState.frontiers.add(posKey({ x, y }));
        } else {
          explorationState.frontiers.delete(posKey({ x, y }));
        }
      }
    }
  }
  // Heuristic scoring for neighbouring tiles when no direct goal is
  // available. Higher scores favour cells that reveal new territory while
  // penalising ones we recently stepped on (shortTermMemory) to reduce
  // aimless oscillation.
  function explorationScore(pos, shortTermMemory) {
    let score = 0;
    const lightRadius = readPlayerLightRadius();
    const visibleCells = computeFieldOfView(pos, lightRadius, mapState, {
      useKnownGrid: true,
    });
    for (const cellKey of visibleCells) {
      const [x, y] = cellKey.split(",").map(Number);
      if (mapState.known[y][x] === -1) {
        score++;
      }
    }
    if (shortTermMemory.includes(posKey(pos))) {
      score -= SHORT_TERM_MEMORY_PENALTY;
    }
    return score;
  }
  function reconstructPath(parents, startKey, targetKey, strategyName) {
    const path = [];
    let key = targetKey;
    while (key !== startKey) {
      const parentKey = parents.get(key);
      if (!parentKey) {
        throw new Error(
          `${strategyName} logic error: No parent found for key ${key} when reconstructing path from ${startKey} to ${targetKey}`,
        );
      }
      const [x, y] = key.split(",").map(Number);
      path.unshift({ x, y });
      key = parentKey;
    }
    return path;
  }

  function findPath(
    start,
    target,
    shortTermMemory,
    options = {},
    strategyFactory,
  ) {
    const effectiveOptions = options ?? {};
    const startKey = posKey(start);
    const targetKey = posKey(target);
    if (startKey === targetKey) {
      return [];
    }

    const {
      ignoreShortTermMemory = false,
    } = effectiveOptions;

    const restricted =
      !ignoreShortTermMemory &&
      shortTermMemory &&
      shortTermMemory.length > 0
        ? new Set(shortTermMemory)
        : null;

    const parents = new Map();
    const strategy = strategyFactory({
      start,
      target,
      startKey,
      targetKey,
      options: effectiveOptions,
      restricted,
    });

    const strategyName = strategy?.name || "Pathfinding";
    if (
      !strategy ||
      typeof strategy.getNextNode !== "function" ||
      typeof strategy.processNeighbor !== "function"
    ) {
      throw new Error(
        `${strategyName} strategy must define getNextNode and processNeighbor`,
      );
    }

    while (true) {
      const current = strategy.getNextNode();
      if (!current) {
        break;
      }

      const currentPos = current.pos || current;
      const currentKey = current.key || posKey(currentPos);

      if (currentKey === targetKey) {
        return reconstructPath(parents, startKey, targetKey, strategyName);
      }

      for (const { dx, dy } of CARDINAL_DIRECTIONS) {
        const neighbor = { x: currentPos.x + dx, y: currentPos.y + dy };
        if (
          neighbor.x < 0 ||
          neighbor.x >= mapState.width ||
          neighbor.y < 0 ||
          neighbor.y >= mapState.height
        ) {
          continue;
        }

        const neighborKey = posKey(neighbor);
        if (restricted && restricted.has(neighborKey)) {
          continue;
        }

        if (
          strategy.canTraverse &&
          !strategy.canTraverse({
            neighbor,
            neighborKey,
            current,
            currentKey,
            parents,
          })
        ) {
          continue;
        }

        strategy.processNeighbor({
          neighbor,
          neighborKey,
          current,
          currentKey,
          parents,
        });
      }
    }

    return null;
  }

  function createBfsStrategy({ start, startKey }) {
    const queue = [{ pos: start, key: startKey }];
    let head = 0;
    const visited = new Set([startKey]);

    return {
      name: "BFS",
      getNextNode() {
        if (head >= queue.length) {
          return null;
        }
        return queue[head++];
      },
      canTraverse({ neighbor, neighborKey }) {
        if (visited.has(neighborKey)) {
          return false;
        }
        return mapState.known[neighbor.y][neighbor.x] === TILE_FLOOR;
      },
      processNeighbor({ neighbor, neighborKey, currentKey, parents }) {
        visited.add(neighborKey);
        parents.set(neighborKey, currentKey);
        queue.push({ pos: neighbor, key: neighborKey });
      },
    };
  }

  function createWeightedSearchStrategy({ start, startKey, options }) {
    const unknownTileCost =
      options.unknownTileCost ?? CONFIG.ai.fallback.unknownTileCost;
    const open = [{ pos: start, key: startKey, cost: 0 }];
    const costs = new Map([[startKey, 0]]);
    const processed = new Set();

    return {
      name: "Weighted search",
      getNextNode() {
        while (open.length > 0) {
          open.sort((a, b) => a.cost - b.cost);
          const node = open.shift();
          if (!node) {
            break;
          }
          if (processed.has(node.key)) {
            continue;
          }
          processed.add(node.key);
          return node;
        }
        return null;
      },
      canTraverse({ neighbor, neighborKey }) {
        if (processed.has(neighborKey)) {
          return false;
        }
        return mapState.grid[neighbor.y][neighbor.x] === TILE_FLOOR;
      },
      processNeighbor({ neighbor, neighborKey, current, currentKey, parents }) {
        const currentCost = current.cost ?? 0;
        let stepCost = 1;
        if (mapState.known[neighbor.y][neighbor.x] !== TILE_FLOOR) {
          stepCost += Math.max(0, unknownTileCost);
        }
        const newCost = currentCost + stepCost;
        if (!costs.has(neighborKey) || newCost < costs.get(neighborKey)) {
          costs.set(neighborKey, newCost);
          parents.set(neighborKey, currentKey);
          open.push({ pos: neighbor, key: neighborKey, cost: newCost });
        }
      },
    };
  }

  // Classic breadth-first search that respects the knowledge gathered so
  // far. We allow the caller to provide a short-term memory blacklist so
  // the AI can temporarily avoid tiles that caused recent backtracking.
  // Callers can explicitly disable this penalty via the ignoreShortTermMemory
  // option when a full backtrack is desired.
  function bfsToTarget(start, target, shortTermMemory, options = {}) {
    return findPath(start, target, shortTermMemory, options, createBfsStrategy);
  }

  function weightedSearchToTarget(
    start,
    target,
    shortTermMemory,
    options = {},
  ) {
    const mergedOptions = {
      unknownTileCost: CONFIG.ai.fallback.unknownTileCost,
      ...options,
    };
    return findPath(
      start,
      target,
      shortTermMemory,
      mergedOptions,
      createWeightedSearchStrategy,
    );
  }

  function prioritizeFrontiers(origin, seed = 0) {
    const frontiers = [];
    for (const fKey of explorationState.frontiers) {
      const [fx, fy] = fKey.split(",").map(Number);
      const dist =
        Math.abs(origin.x - fx) + Math.abs(origin.y - fy);
      const noise =
        Math.sin(
          fx * 73856093 + fy * 19349663 + seed * 83492791,
        ) * 0.5 + 0.5;
      frontiers.push({ pos: { x: fx, y: fy }, dist, noise });
    }
    frontiers.sort((a, b) => {
      if (a.dist !== b.dist) return a.dist - b.dist;
      return a.noise - b.noise;
    });
    return frontiers;
  }

  function generateRandomWalkPath(start, steps, maxAttempts = 3) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const path = [];
      let current = { x: start.x, y: start.y };
      let failed = false;
      for (let i = 0; i < steps; i++) {
        const neighbors = CARDINAL_DIRECTIONS.map(({ dx, dy }) => ({
          x: current.x + dx,
          y: current.y + dy,
        })).filter((n) => {
          if (
            n.x < 0 ||
            n.x >= mapState.width ||
            n.y < 0 ||
            n.y >= mapState.height
          ) {
            return false;
          }
          return mapState.grid[n.y][n.x] === TILE_FLOOR;
        });

        if (neighbors.length === 0) {
          failed = true;
          break;
        }

        const next = neighbors[Math.floor(Math.random() * neighbors.length)];
        path.push(next);
        current = next;
      }

      if (!failed && path.length > 0) {
        return path;
      }
    }
    return [];
  }
  // --- SIMULATION LOGIC ---
  // Main autonomous exploration loop. The routine alternates between three
  // behaviours: beeline to the exit once discovered, opportunistically
  // explore high-value neighbours, and finally backtrack via the frontier
  // stack when no better move exists.
  function simulate(state, startPos, endPos) {
    if (state.player) {
      player = state.player;
    } else {
      state.player = player;
    }
    if (state.mobManager) {
      mobManager = state.mobManager;
    } else {
      state.mobManager = mobManager;
    }
    isEndRendered = state.isEndRendered;
    prevPlayerPos = state.prevPlayerPos;
    hasPrevPlayerPos = state.hasPrevPlayerPos;
    currentEndPos = state.currentEndPos;
    initRetries = state.initRetries;
    emit(EVENT.STATUS, {
      who: "system",
      msg: "AI exploring...",
      restartVisible: false,
    });
    player.x = startPos.x;
    player.y = startPos.y;
    player.nextActAt = 0;
    const aiState = {
      stack: [],
      visitedForPathfinding: new Set([
        posKeyFromCoords(player.x, player.y),
      ]),
      shortTermMemory: [],
      randomWalkQueue: [],
      idleTicksWithoutProgress: 0,
      frontierNoiseSeed: Math.random() * 1000,
      lastProgressTurn: 0,
    };
    explorationState.frontiers.clear();
    simState.turnCounter = 0;
    if (!mobManager) {
      mobManager = new MobManager();
      // Removed redundant mobManager.add(player); to prevent duplicate addition
      state.mobManager = mobManager;
    }
    const gameCtx = {
      player,
      mobManager,
      maze: mapState.grid,
      mapState,
      state,
      AIPlanner,
    };

    function processPlayerTurn() {
      const currentPlayerX = player.x;
      const currentPlayerY = player.y;
      const currentPos = { x: currentPlayerX, y: currentPlayerY };

      const currentKey = posKeyFromCoords(
        currentPlayerX,
        currentPlayerY,
      );
      aiState.shortTermMemory.push(currentKey);
      if (aiState.shortTermMemory.length > CONFIG.ai.shortTermMemory) {
        aiState.shortTermMemory.shift();
      }

      let nextMove = null;
      let nextPos = currentPos;
      let attemptedFrontiers = false;

      const arenaCfg = gameState?.config?.modes?.arena;
      const suppressExitNow =
        !!arenaCfg?.enabled &&
        !!arenaCfg?.suppressExitSeekUntilClear &&
        Array.isArray(mobManager?.list) &&
        mobManager.list.some((m) => {
          const target = m?.actor ?? m;
          return !!target && FactionService.isHostile(player, target);
        });

      if (!suppressExitNow && mapState.known[endPos.y][endPos.x] === TILE_FLOOR) {
        const pathToExit = bfsToTarget(
          currentPos,
          endPos,
          aiState.shortTermMemory,
          { ignoreShortTermMemory: true },
        );
        if (pathToExit && pathToExit.length > 0) {
          nextMove = pathToExit[0];
          aiState.randomWalkQueue = [];
        }
      }

      if (!nextMove && aiState.randomWalkQueue.length > 0) {
        while (aiState.randomWalkQueue.length > 0 && !nextMove) {
          const candidate = aiState.randomWalkQueue.shift();
          if (
            candidate &&
            candidate.x >= 0 &&
            candidate.x < mapState.width &&
            candidate.y >= 0 &&
            candidate.y < mapState.height &&
            mapState.grid[candidate.y][candidate.x] === TILE_FLOOR
          ) {
            nextMove = candidate;
          }
        }
      }

      if (!nextMove) {
        const neighbors = CARDINAL_DIRECTIONS.map(({ dx, dy }) => ({
          x: currentPlayerX + dx,
          y: currentPlayerY + dy,
        }));
        const unvisitedNeighbors = neighbors.filter(
          (n) =>
            n.x >= 0 &&
            n.x < mapState.width &&
            n.y >= 0 &&
            n.y < mapState.height &&
            mapState.known[n.y][n.x] === TILE_FLOOR &&
            !aiState.visitedForPathfinding.has(posKey(n)),
        );
        const potentialMoves = unvisitedNeighbors.map((n) => ({
          pos: n,
          score: explorationScore(n, aiState.shortTermMemory),
        }));
        potentialMoves.sort(
          (a, b) => b.score - a.score + (Math.random() - 0.5),
        );
        if (potentialMoves.length > 0 && potentialMoves[0].score > 0) {
          aiState.stack.push({ x: currentPlayerX, y: currentPlayerY });
          nextMove = potentialMoves[0].pos;
        }
      }

      if (!nextMove && explorationState.frontiers.size > 0) {
        const prioritized = prioritizeFrontiers(
          currentPos,
          aiState.frontierNoiseSeed,
        );
        const currentFrontierKey = posKey(currentPos);
        if (explorationState.frontiers.has(currentFrontierKey)) {
          explorationState.frontiers.delete(currentFrontierKey);
        }
        for (const candidate of prioritized) {
          attemptedFrontiers = true;
          const path = bfsToTarget(
            currentPos,
            candidate.pos,
            aiState.shortTermMemory,
            { ignoreShortTermMemory: true },
          );
          if (path && path.length > 0) {
            nextMove = path[0];
            break;
          }
        }

        if (!nextMove && attemptedFrontiers) {
          for (const candidate of prioritized) {
            const path = weightedSearchToTarget(
              currentPos,
              candidate.pos,
              aiState.shortTermMemory,
              { ignoreShortTermMemory: true },
            );
            if (path && path.length > 0) {
              nextMove = path[0];
              break;
            }
          }
        }

        if (!nextMove && attemptedFrontiers) {
          if (aiState.shortTermMemory.length > 0) {
            const retain = Math.max(
              0,
              Math.floor(
                aiState.shortTermMemory.length *
                  CONFIG.ai.fallback.memoryRetainFraction,
              ),
            );
            aiState.shortTermMemory = retain
              ? aiState.shortTermMemory.slice(-retain)
              : [];
          }
          for (const candidate of prioritized) {
            const path = bfsToTarget(
              currentPos,
              candidate.pos,
              aiState.shortTermMemory,
              { ignoreShortTermMemory: true },
            );
            if (path && path.length > 0) {
              nextMove = path[0];
              break;
            }
          }
        }
      }

      if (!nextMove && aiState.stack.length > 0) {
        nextMove = aiState.stack.pop();
      }

      if (!nextMove) {
        if (aiState.randomWalkQueue.length === 0) {
          const { steps, maxAttempts } = CONFIG.ai.fallback.randomWalk;
          const randomPath = generateRandomWalkPath(
            currentPos,
            steps,
            maxAttempts,
          );
          aiState.randomWalkQueue = randomPath.slice();
        }
        while (!nextMove && aiState.randomWalkQueue.length > 0) {
          const candidate = aiState.randomWalkQueue.shift();
          if (
            candidate &&
            candidate.x >= 0 &&
            candidate.x < mapState.width &&
            candidate.y >= 0 &&
            candidate.y < mapState.height &&
            mapState.grid[candidate.y][candidate.x] === TILE_FLOOR
          ) {
            aiState.stack.push({ x: currentPlayerX, y: currentPlayerY });
            nextMove = candidate;
          }
        }
      }

      if (!nextMove) {
        clearTimeout(simState.timeout);
        simState.timeout = null;
        simState.loopFn = null;
        emit(EVENT.STATUS, {
          who: "system",
          msg: "AI is trapped!",
          restartVisible: true,
        });
        return { ended: true };
      }

      prevPlayerPos.x = currentPlayerX;
      prevPlayerPos.y = currentPlayerY;
      if (!hasPrevPlayerPos) {
        hasPrevPlayerPos = true;
      }
      state.hasPrevPlayerPos = hasPrevPlayerPos;
      player.pos = nextMove;
      player.x = nextMove.x;
      player.y = nextMove.y;
      if (mobManager) {
        mobManager.reindex();
      }
      const nextX = player.x;
      const nextY = player.y;
      nextPos = { x: nextX, y: nextY };
      const stepKey = posKeyFromCoords(nextX, nextY);
      if (!aiState.visitedForPathfinding.has(stepKey)) {
        aiState.visitedForPathfinding.add(stepKey);
      }

      updateVisionAndExploration(nextPos);
      if (explorationState.newlyExplored.length > 0) {
        aiState.idleTicksWithoutProgress = 0;
        aiState.randomWalkQueue = [];
        aiState.lastProgressTurn = simState.turnCounter;
      } else {
        aiState.idleTicksWithoutProgress++;
        if (
          CONFIG.ai.maxIdleTicks > 0 &&
          aiState.idleTicksWithoutProgress >= CONFIG.ai.maxIdleTicks
        ) {
          aiState.idleTicksWithoutProgress = 0;
          aiState.visitedForPathfinding = new Set([posKey(nextPos)]);
          aiState.frontierNoiseSeed = Math.random() * 1000;
          if (aiState.shortTermMemory.length > 0) {
            const retain = Math.max(
              0,
              Math.floor(
                aiState.shortTermMemory.length *
                  CONFIG.ai.fallback.memoryRetainFraction,
              ),
            );
            aiState.shortTermMemory = retain
              ? aiState.shortTermMemory.slice(-retain)
              : [];
          }
          aiState.randomWalkQueue = [];
        }
      }
      fovState.currentVisible = computeVisibleCells(nextPos);
      renderScene();
      fovState.prevVisible = new Set(fovState.currentVisible);
      minimapMaybeRefreshOnTick();

      return { acted: true };
    }
    async function gameLoop() {
      clearTimeout(simState.timeout);
      if (!simState.isPaused) {
        if (handleDeath(gameCtx, player)) {
          return;
        }

        const turn = ++simState.turnCounter;
        const playerHpBefore =
          player?.res && typeof player.res.hp === "number"
            ? player.res.hp
            : null;
        tickStatusesAtTurnStart(player, turn);
        if (
          playerHpBefore != null &&
          typeof player?.res?.hp === "number" &&
          player.res.hp > playerHpBefore
        ) {
          Sound.playHeal();
        }
        if (handleDeath(gameCtx, player)) {
          return;
        }
        updatePerception(gameCtx);
        if (mobManager) {
          try {
            await mobManager.tick(gameCtx, turn);
          } catch (err) {
            console.error("mobManager.tick failed", err);
          }
        }
        if (handleDeath(gameCtx, player)) {
          return;
        }
        const currentPlayerX = player.x;
        const currentPlayerY = player.y;
        const currentPos = { x: currentPlayerX, y: currentPlayerY };
        if (currentPlayerX === endPos.x && currentPlayerY === endPos.y) {
          clearTimeout(simState.timeout);
          simState.timeout = null;
          simState.loopFn = null;
          Sound.playDoor();
          emit(EVENT.STATUS, {
            who: "system",
            msg: "Exit found!",
            restartVisible: true,
          });
          // When wiring multi-floor progression, advance the chapter here:
          // state.chapter?.nextLevel();
          renderScene();
          return;
        }

        const playerCanAct =
          (player.statusDerived?.canAct ?? true) &&
          turn >=
            (typeof player.nextActAt === "number"
              ? player.nextActAt
              : 0);

        if (playerCanAct) {
          const result = processPlayerTurn();
          if (result?.ended) {
            return;
          }
          if (result?.acted) {
            const delay = computeActorDelay(player);
            player.nextActAt = turn + delay;
          }
        }
      }
      const delay = Math.max(16, 1000 / simState.speed);
      simState.timeout = setTimeout(gameLoop, delay);
    }
    simState.loopFn = gameLoop;
    gameLoop();
    state.player = player;
    state.mobManager = mobManager;
    state.hasPrevPlayerPos = hasPrevPlayerPos;
    state.currentEndPos = currentEndPos;
    state.isEndRendered = isEndRendered;
  }
  function togglePause() {
    simState.isPaused = !simState.isPaused;
    emit(EVENT.STATUS, {
      who: "system",
      msg: simState.isPaused ? "Simulation paused" : "Simulation resumed",
      paused: simState.isPaused,
    });
    if (!simState.isPaused && typeof simState.loopFn === "function") {
      simState.timeout = setTimeout(
        simState.loopFn,
        1000 / simState.speed,
      ); // Resume the loop
    }
  }
  function resetSimulationStateForInit() {
    clearTimeout(simState.timeout);
    simState.loopFn = null;
    simState.isPaused = false;
    emit(EVENT.STATUS, {
      who: "system",
      msg: "Generating dungeon...",
      paused: false,
      restartVisible: false,
    });
    currentEndPos = null;
    gameState.currentEndPos = currentEndPos;
    hasPrevPlayerPos = false;
    gameState.hasPrevPlayerPos = hasPrevPlayerPos;
    simState.turnCounter = 0;
    mapState.furniture = [];
    rebuildFurnitureIndex();
  }

  function setupPlayer() {
    // Pass factions directly to the Player constructor, which passes it to the Actor.
    const newPlayer = new Player({
      name: "Player",
      x: 0,
      y: 0,
      factions: ["player"],
    });

    if (!mobManager) {
      throw new Error(
        "mobManager is not initialized before setupPlayer() is called.",
      );
    }
    mobManager.add(newPlayer);
    mobManager.player = newPlayer;

    if (!devPanelMounted && typeof document !== "undefined") {
      mountDevPanel(document.body, newPlayer);
      devPanelMounted = true;
      gameState.debug.devPanelMounted = true;
    }

    if (!debugOverlayMounted && typeof document !== "undefined") {
      debugOverlayInstance =
        debugOverlayInstance ||
        new DebugOverlay({
          actorProvider: () => mobManager?.player || null,
        });
      debugOverlayMounted = true;
      gameState.debug.debugOverlayMounted = true;
      gameState.debug.debugOverlayInstance = debugOverlayInstance;
    }

    // Wearables
    newPlayer.equipment.equipTo(SLOT.Head, makeItem("leather_cap"));
    newPlayer.equipment.equipTo(
      SLOT.BodyArmor,
      makeItem("basic_clothes"),
    );
    newPlayer.equipment.equipTo(SLOT.Cloak, makeItem("cloak"));
    newPlayer.equipment.equipTo(SLOT.Belt, makeItem("belt_leather"));
    newPlayer.equipment.equipTo(SLOT.Backpack, makeItem("pack_rucksack")); // choose pack
    newPlayer.equipment.equipTo(SLOT.LeftHand, makeItem("torch"));
    newPlayer.equipment.equipTo(SLOT.RightHand, makeItem("short_sword"));
    // Belt attachments
    newPlayer.equipment.equipTo(SLOT.Belt1, makeItem("pouch_small"));
    newPlayer.equipment.equipTo(SLOT.Belt2, makeItem("bow_short"));
    newPlayer.equipment.equipTo(SLOT.Quiver, makeItem("quiver_std"));

    // Inventory constraints come from backpack
    newPlayer.inventory = new Inventory(DEFAULT_INVENTORY_CAPACITY);
    newPlayer.inventory.setConstraints(
      newPlayer.equipment.currentBackpackConstraints(),
    );

    // Seed inventory
    newPlayer.inventory.add(new ItemStack(makeItem("torch"), 3), {
      silent: true,
    });
    newPlayer.inventory.add(new ItemStack(makeItem("arrow_wood"), 20), {
      silent: true,
    });
    newPlayer.inventory.add(new ItemStack(makeItem("bolt_wood"), 15), {
      silent: true,
    });
    newPlayer.inventory.add(new ItemStack(makeItem("sling_stone"), 40), {
      silent: true,
    });
    newPlayer.inventory.add(new ItemStack(makeItem("dagger")), {
      silent: true,
    });
    newPlayer.inventory.add(makeItem("crossbow_light"), { silent: true });
    newPlayer.inventory.add(new ItemStack(makeItem("sling_leather")), {
      silent: true,
    });
    newPlayer.inventory.add(new ItemStack(makeItem("throwing_knife"), 4), {
      silent: true,
    });
    newPlayer.inventory.add(new ItemStack(makeItem("javelin"), 3), {
      silent: true,
    });
    newPlayer.inventory.add(new ItemStack(makeItem("boots")), {
      silent: true,
    });
    newPlayer.inventory.add(new ItemStack(makeItem("gloves")), {
      silent: true,
    });
    newPlayer.inventory.add(new ItemStack(makeItem("amulet_simple")), {
      silent: true,
    });
    newPlayer.inventory.add(new ItemStack(makeItem("pouch_small")), {
      silent: true,
    });

    newPlayer.syncActorEquipment();

    gameState.player = newPlayer;
    return newPlayer;
  }

  function applyDungeonDataToMapState(dungeonData) {
    mapState.grid = Array.isArray(dungeonData.grid) ? dungeonData.grid : [];
    mapState.width = mapState.grid[0] ? mapState.grid[0].length : 0;
    mapState.height = mapState.grid.length;
    mapState.furniture = normalizeFurniturePlacements(
      dungeonData.furniture || [],
    );
    rebuildFurnitureIndex();
  }

  /**
   * Builds a single-room "arena" grid with a 1-tile wall border.
   * Start = center; End = opposite corner (unused if exit-seek is suppressed).
   */
  function generateArenaDungeon(width, height) {
    const w = Math.max(8, width | 0);
    const h = Math.max(8, height | 0);
    const grid = Array.from({ length: h }, (_, y) =>
      Array.from({ length: w }, (_, x) =>
        x === 0 || y === 0 || x === w - 1 || y === h - 1 ? TILE_WALL : TILE_FLOOR,
      ),
    );
    const start = { x: (w / 2) | 0, y: (h / 2) | 0 };
    const end = { x: 1, y: 1 };
    return { grid, start, end, furniture: [] };
  }

  function generateAndValidateDungeon() {
    emit(EVENT.STATUS, {
      who: "system",
      msg: "Generating dungeon...",
      restartVisible: false,
    });
    const dungeonData = generateDungeon();
    if (!dungeonData) {
      return { success: false, reason: "generation" };
    }

    applyDungeonDataToMapState(dungeonData);

    const isConnected = !!aStarPath(
      mapState.grid,
      dungeonData.start,
      dungeonData.end,
    );
    if (!isConnected) {
      return { success: false, reason: "connectivity" };
    }

    return { success: true, dungeonData };
  }

  function handleDungeonFailure(reason) {
    if (reason === "generation") {
      emit(EVENT.STATUS, {
        who: "system",
        msg: "Map generation failed, retrying...",
        restartVisible: false,
      });
      initRetries++;
      gameState.initRetries = initRetries;
      setTimeout(startNewSimulation, 100);
    } else if (reason === "connectivity") {
      emit(EVENT.STATUS, {
        who: "system",
        msg: "Map is not fully connected, regenerating...",
        restartVisible: false,
      });
      initRetries++;
      gameState.initRetries = initRetries;
      setTimeout(startNewSimulation, 50);
    }
  }

  async function initializeSimulation(dungeonData) {
    const startPos = dungeonData.start;
    const endPos = dungeonData.end;
    currentEndPos = endPos;
    gameState.currentEndPos = currentEndPos;

    const chapter = gameState.chapter;
    let furniturePlacements = Array.isArray(dungeonData.furniture)
      ? dungeonData.furniture.slice()
      : Array.isArray(mapState.furniture)
      ? mapState.furniture.slice()
      : [];
    if (chapter?.isFinalLevel) {
      const vaultPlacement = buildCulminationVaultPlacement(chapter.theme, endPos);
      if (vaultPlacement) {
        furniturePlacements.push(vaultPlacement);
      }
    }
    mapState.furniture = normalizeFurniturePlacements(furniturePlacements);
    rebuildFurnitureIndex();

    mapState.explored = Array.from({ length: mapState.height }, () =>
      Array(mapState.width).fill(false),
    );
    mapState.known = Array.from({ length: mapState.height }, () =>
      Array(mapState.width).fill(-1),
    );

    if (renderController) {
      renderController.init(mapState.width, mapState.height, CELL_SIZE);
      rendererReady = true;
      gameState.render.ready = rendererReady;
    }

    if (minimapController) {
      configureMinimapRenderer(true);
    }

    setupDOM();

    player.pos = startPos;
    player.startPos = startPos;
    isEndRendered = false;
    gameState.isEndRendered = isEndRendered;
    fovState.prevVisible = new Set();
    hasPrevPlayerPos = false;
    gameState.hasPrevPlayerPos = hasPrevPlayerPos;
    fovState.currentVisible = new Set();
    explorationState.newlyExplored = [];
    fovState.lastCache = { key: null, radius: null, visible: null };

    updateVisionAndExploration(player.startPos);
    fovState.currentVisible = computeVisibleCells(player.startPos);
    renderScene();
    renderUI();
    fovState.prevVisible = new Set(fovState.currentVisible);
    prevPlayerPos.x = player.startPos.x;
    prevPlayerPos.y = player.startPos.y;
    hasPrevPlayerPos = true;
    gameState.hasPrevPlayerPos = hasPrevPlayerPos;
    initRetries = 0;
    gameState.initRetries = initRetries;
    simState.isReady = true;

    if (!gameState.__didInitialSpawns) {
      /**
       * [Thematic Spawning]
       * Perform a one-time initial spawn using chapter theme tags.
       * This block is idempotent via `__didInitialSpawns` on game state,
       * so reloads or repeated init calls do not duplicate mobs.
       */
      const gameCtx = {
        player,
        mobManager,
        maze: mapState.grid,
        mapState,
        state: gameState,
        AIPlanner,
      };
      if (!gameCtx.state.__didInitialSpawns) {
        const overrideTags = Array.isArray(
          gameCtx.state?.config?.monsterTagsOverride,
        )
          ? gameCtx.state.config.monsterTagsOverride.filter(Boolean)
          : [];
        let tags = Array.isArray(gameCtx.state?.chapter?.theme?.monsterTags)
          ? gameCtx.state.chapter.theme.monsterTags
          : [];
        if (overrideTags.length > 0) {
          tags = overrideTags;
        }
        const rng = gameCtx.state?.rng || Math.random;
        const count = Number.isFinite(gameCtx.state?.config?.initialSpawnCount)
          ? Math.max(0, Math.floor(gameCtx.state.config.initialSpawnCount))
          : 8;
        const { spawnMonsters, spawnByIdCounts } = await import(
          "./src/game/spawn.js"
        );
        let spawned = 0;
        if (gameCtx.state?.config?.modes?.arena?.enabled) {
          const idCounts = gameCtx.state.config.modes.arena.spawnsById || {};
          spawned = spawnByIdCounts(
            gameCtx,
            idCounts,
            gameCtx.state?.config?.knobs?.spawnMinDistance,
            rng,
          );
        } else {
          spawned = spawnMonsters(gameCtx, {
            count,
            includeTags: tags,
            rng,
          });
        }
        console.log(
          `[spawn] spawned=${spawned} tags=${tags.join(",") || "all"}`,
        );
        gameCtx.state.__didInitialSpawns = true;
      }
    }

    setTimeout(() => simulate(gameState, player.startPos, endPos), 500);
  }

  /**
   * Reset the dungeon run and roll a fresh chapter theme. The theme instance is
   * cached on the long-lived game state so once multi-floor progression arrives
   * we can advance floors without rebuilding the surrounding UI plumbing.
   */
  function startNewSimulation() {
    if (initRetries > MAX_INIT_RETRIES) {
      emit(EVENT.STATUS, {
        who: "system",
        msg: "Fatal Error: Map generation failed repeatedly.",
        restartVisible: true,
      });
      console.error("Map generation failed after multiple retries.");
      return;
    }

    const depthOverride = Number.isFinite(gameState?.config?.depth)
      ? Math.max(0, Math.floor(gameState.config.depth))
      : 0;
    if (Number.isFinite(gameState?.config?.seed)) {
      const normalizedSeed = gameState.config.seed >>> 0;
      gameState.config.seed = normalizedSeed;
      gameState.rng = mulberry32(normalizedSeed);
    } else {
      delete gameState.rng;
    }
    const rngFn =
      typeof gameState?.rng === "function" ? gameState.rng : Math.random;
    gameState.chapter = new ChapterState({ depth: depthOverride, rng: rngFn });
    const chapter = gameState.chapter;
    if (chapter) {
      emit(EVENT.STATUS, {
        who: "system",
        msg: `Chapter Theme: ${chapter.theme.name}`,
        restartVisible: false,
      });
    }

    simState.isReady = false;
    resetSimulationStateForInit();
    minimapState.initialized = false;
    minimapState.tilesW = 0;
    minimapState.tilesH = 0;
    minimapState.view = null;
    mobManager = new MobManager();
    gameState.mobManager = mobManager;
    player = setupPlayer();
    gameState.player = player;
    gameState.__didInitialSpawns = false;
    rendererReady = false;
    gameState.render.ready = rendererReady;

    setTimeout(() => {
      restoreHybridGeneratorConfig();
      if (gameState?.config?.generatorOverrides) {
        try {
          deepMerge(
            CONFIG?.generator?.hybrid || {},
            gameState.config.generatorOverrides,
          );
        } catch (err) {
          console.warn("Generator override merge failed", err);
        }
      }
      const arenaCfg = gameState?.config?.modes?.arena;
      if (arenaCfg?.enabled) {
        const knobWidth = gameState?.config?.knobs?.mapWidth;
        const knobHeight = gameState?.config?.knobs?.mapHeight;
        const baseWidth = Number.isFinite(arenaCfg.width)
          ? arenaCfg.width
          : CONFIG?.modes?.arena?.width ?? 40;
        const baseHeight = Number.isFinite(arenaCfg.height)
          ? arenaCfg.height
          : CONFIG?.modes?.arena?.height ?? 24;
        const width = Number.isFinite(knobWidth) ? knobWidth : baseWidth;
        const height = Number.isFinite(knobHeight) ? knobHeight : baseHeight;
        const dungeonData = generateArenaDungeon(width, height);
        applyDungeonDataToMapState(dungeonData);
        initializeSimulation(dungeonData);
      } else {
        const result = generateAndValidateDungeon();
        if (!result.success) {
          handleDungeonFailure(result.reason);
          return;
        }

        initializeSimulation(result.dungeonData);
      }
    }, 50);
  }

  function hideStartMenu() {
    if (!startMenuForm) {
      startMenuForm = document.getElementById("customForm");
    }
    if (startMenuForm) {
      startMenuForm.style.display = "none";
    }
    if (!startMenuDom) {
      startMenuDom = document.getElementById("startMenu");
    }
    if (startMenuDom) {
      startMenuDom.style.display = "none";
    }
  }

  function showStartMenu() {
    if (!startMenuDom) {
      startMenuDom = document.getElementById("startMenu");
    }
    if (!startMenuForm) {
      startMenuForm = document.getElementById("customForm");
    }
    if (startMenuForm) {
      startMenuForm.style.display = "none";
    }
    if (startMenuDom) {
      startMenuDom.style.display = "flex";
    }
  }

  function initStartMenu() {
    startMenuDom = document.getElementById("startMenu");
    startMenuForm = document.getElementById("customForm");
    const quickBtn = document.getElementById("startQuickBtn");
    const openCustomBtn = document.getElementById("openCustomBtn");
    const cancelCustomBtn = document.getElementById("cancelCustomBtn");
    const resetCustomBtn = document.getElementById("resetCustomBtn");

    if (!startMenuDom) {
      setLastRunMode("quick");
      applyQuickSettings({ resetSpeed: true });
      startNewSimulation();
      return;
    }

    const saved = loadMenuSettings();
    prefillForm(saved);

    quickBtn?.addEventListener("click", (event) => {
      event?.preventDefault?.();
      setLastRunMode("quick");
      applyQuickSettings({ resetSpeed: true });
      hideStartMenu();
      startNewSimulation();
    });

    openCustomBtn?.addEventListener("click", (event) => {
      event?.preventDefault?.();
      if (startMenuForm) {
        startMenuForm.style.display = "block";
      }
    });

    cancelCustomBtn?.addEventListener("click", () => {
      if (startMenuForm) {
        startMenuForm.style.display = "none";
      }
    });

    resetCustomBtn?.addEventListener("click", () => {
      try {
        localStorage.removeItem(MENU_SETTINGS_KEY);
      } catch {
        // ignore storage errors
      }
      prefillForm({});
    });

    startMenuForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      const settings = collectFormSettings();
      saveMenuSettings(settings);
      setLastRunMode("custom");
      applyCustomSettings(settings);
      hideStartMenu();
      startNewSimulation();
    });

    showStartMenu();
  }

  function collectFormSettings() {
    const getInput = (id) =>
      /** @type {HTMLInputElement | null} */ (
        document.getElementById(id)
      );
    const readInt = (id) => {
      const el = getInput(id);
      if (!el) return NaN;
      const raw = el.value;
      if (raw === undefined || raw === null || raw === "") return NaN;
      return parseInt(raw, 10);
    };
    const readFloat = (id) => {
      const el = getInput(id);
      if (!el) return NaN;
      const raw = el.value;
      if (raw === undefined || raw === null || raw === "") return NaN;
      return parseFloat(raw);
    };

    const seedVal = readInt("cf-seed");
    const depthVal = readInt("cf-depth");
    const spawnVal = readInt("cf-initialSpawns");
    const tpsVal = readInt("cf-tps");
    const tagsRaw = (getInput("cf-monsterTags")?.value || "").trim();
    const monsterTags = tagsRaw
      ? tagsRaw
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [];

    const doorSpawnVal = readFloat("cf-doorSpawn");
    const extraEdgesVal = readFloat("cf-extraEdges");
    const smallCandidatesVal = readInt("cf-smallCandidates");
    const smallMinVal = readInt("cf-smallMin");
    const smallMaxVal = readInt("cf-smallMax");

    const gen = {};
    if (Number.isFinite(doorSpawnVal)) {
      gen.doors = { ...(gen.doors || {}), spawnChance: clamp01(doorSpawnVal) };
    }
    if (Number.isFinite(extraEdgesVal)) {
      gen.extraEdgesFraction = clamp01(extraEdgesVal);
    }
    if (Number.isFinite(smallCandidatesVal)) {
      gen.smallRooms = {
        ...(gen.smallRooms || {}),
        candidateCount: Math.max(0, Math.floor(smallCandidatesVal)),
      };
    }
    if (Number.isFinite(smallMinVal)) {
      gen.smallRooms = {
        ...(gen.smallRooms || {}),
        minSize: Math.max(1, Math.floor(smallMinVal)),
      };
    }
    if (Number.isFinite(smallMaxVal)) {
      gen.smallRooms = {
        ...(gen.smallRooms || {}),
        maxSize: Math.max(1, Math.floor(smallMaxVal)),
      };
    }

    const settings = {
      seed: Number.isFinite(seedVal) ? seedVal >>> 0 : undefined,
      depth: Number.isFinite(depthVal)
        ? Math.max(0, Math.floor(depthVal))
        : undefined,
      initialSpawns: Number.isFinite(spawnVal)
        ? Math.max(0, Math.floor(spawnVal))
        : undefined,
      tps: Number.isFinite(tpsVal)
        ? Math.max(1, Math.min(60, Math.floor(tpsVal)))
        : undefined,
      monsterTags: monsterTags.length ? monsterTags : undefined,
      gen: Object.keys(gen).length > 0 ? gen : undefined,
    };
    const knobDefaults = CONFIG?.knobs || {};
    const fovVal = readInt("cf-knob-fov");
    const spawnDistVal = readInt("cf-knob-spawn-dist");
    const mapWidthVal = readInt("cf-knob-map-w");
    const mapHeightVal = readInt("cf-knob-map-h");
    settings.knobs = {
      playerFovOverride: Number.isFinite(fovVal)
        ? Math.max(0, Math.floor(fovVal))
        : null,
      spawnMinDistance: Number.isFinite(spawnDistVal)
        ? Math.max(0, Math.floor(spawnDistVal))
        : Number.isFinite(knobDefaults.spawnMinDistance)
        ? Math.max(0, Math.floor(knobDefaults.spawnMinDistance))
        : 6,
      mapWidth: Number.isFinite(mapWidthVal)
        ? Math.max(8, Math.floor(mapWidthVal))
        : null,
      mapHeight: Number.isFinite(mapHeightVal)
        ? Math.max(8, Math.floor(mapHeightVal))
        : null,
    };

    const arenaDefaults = CONFIG?.modes?.arena || {};
    const arenaEnabled = !!getInput("cf-arena-enabled")?.checked;
    const arenaWidthVal = readInt("cf-arena-w");
    const arenaHeightVal = readInt("cf-arena-h");
    const arenaWidth = Number.isFinite(arenaWidthVal)
      ? Math.max(8, Math.floor(arenaWidthVal))
      : Number.isFinite(arenaDefaults.width)
      ? Math.max(8, Math.floor(arenaDefaults.width))
      : 40;
    const arenaHeight = Number.isFinite(arenaHeightVal)
      ? Math.max(8, Math.floor(arenaHeightVal))
      : Number.isFinite(arenaDefaults.height)
      ? Math.max(8, Math.floor(arenaDefaults.height))
      : 24;
    const suppressExit = !!getInput("cf-arena-suppress-exit")?.checked;
    const rawSpawns = String(
      /** @type {HTMLTextAreaElement | null} */ (
        document.getElementById("cf-arena-spawns")
      )?.value || "",
    ).trim();
    const spawnsById = {};
    if (rawSpawns) {
      for (const line of rawSpawns.split(/\r?\n/)) {
        const match = line.trim().match(/^([a-z0-9:_-]+)\s*=\s*(\d+)$/i);
        if (match) {
          const parsed = Number(match[2]);
          if (Number.isFinite(parsed)) {
            const count = Math.max(0, Math.floor(parsed));
            spawnsById[match[1]] = count;
          }
        }
      }
    }
    settings.modes = {
      arena: {
        enabled: arenaEnabled,
        width: arenaWidth,
        height: arenaHeight,
        spawnsById,
        suppressExitSeekUntilClear: suppressExit,
      },
    };
    return settings;
  }

  function saveMenuSettings(settings) {
    try {
      localStorage.setItem(MENU_SETTINGS_KEY, JSON.stringify(settings || {}));
    } catch {
      // ignore storage errors
    }
  }

  function loadMenuSettings() {
    try {
      const raw = localStorage.getItem(MENU_SETTINGS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function prefillForm(settings = {}) {
    const assign = (id, value) => {
      const input = document.getElementById(id);
      if (!input) return;
      if (value === undefined || value === null || value === "") {
        input.value = "";
      } else {
        input.value = String(value);
      }
    };
    assign("cf-seed", settings.seed);
    assign("cf-depth", settings.depth);
    assign("cf-initialSpawns", settings.initialSpawns);
    assign("cf-tps", settings.tps);
    assign(
      "cf-monsterTags",
      Array.isArray(settings.monsterTags)
        ? settings.monsterTags.join(", ")
        : "",
    );
    const gen = settings.gen || {};
    assign("cf-doorSpawn", gen?.doors?.spawnChance);
    assign("cf-extraEdges", gen?.extraEdgesFraction);
    assign("cf-smallCandidates", gen?.smallRooms?.candidateCount);
    assign("cf-smallMin", gen?.smallRooms?.minSize);
    assign("cf-smallMax", gen?.smallRooms?.maxSize);
    const knobs = settings.knobs || {};
    assign("cf-knob-fov", knobs.playerFovOverride ?? "");
    assign(
      "cf-knob-spawn-dist",
      knobs.spawnMinDistance ?? CONFIG?.knobs?.spawnMinDistance ?? 6,
    );
    assign("cf-knob-map-w", knobs.mapWidth ?? "");
    assign("cf-knob-map-h", knobs.mapHeight ?? "");
    const arena = settings?.modes?.arena || {};
    const arenaEnabledEl = /** @type {HTMLInputElement | null} */ (
      document.getElementById("cf-arena-enabled")
    );
    if (arenaEnabledEl) {
      arenaEnabledEl.checked = !!arena.enabled;
    }
    assign("cf-arena-w", arena.width ?? CONFIG?.modes?.arena?.width ?? 40);
    assign(
      "cf-arena-h",
      arena.height ?? CONFIG?.modes?.arena?.height ?? 24,
    );
    const suppressExitEl = /** @type {HTMLInputElement | null} */ (
      document.getElementById("cf-arena-suppress-exit")
    );
    if (suppressExitEl) {
      suppressExitEl.checked =
        arena.suppressExitSeekUntilClear ??
        CONFIG?.modes?.arena?.suppressExitSeekUntilClear ??
        true;
    }
    const spawnArea = /** @type {HTMLTextAreaElement | null} */ (
      document.getElementById("cf-arena-spawns")
    );
    if (spawnArea) {
      const lines = Object.entries(arena.spawnsById || {}).map(
        ([id, count]) => `${id}=${count}`,
      );
      spawnArea.value = lines.join("\n");
    }
  }

  function setLastRunMode(mode) {
    try {
      localStorage.setItem(LAST_RUN_MODE_KEY, mode);
    } catch {
      // ignore storage errors
    }
  }

  function getLastRunMode() {
    try {
      return localStorage.getItem(LAST_RUN_MODE_KEY) || "quick";
    } catch {
      return "quick";
    }
  }

  function applyQuickSettings({ resetSpeed = false } = {}) {
    gameState.config = gameState.config || {};
    delete gameState.config.monsterTagsOverride;
    delete gameState.config.initialSpawnCount;
    delete gameState.config.generatorOverrides;
    delete gameState.config.depth;
    delete gameState.config.seed;
    delete gameState.config.knobs;
    delete gameState.config.modes;
    delete gameState.rng;

    if (resetSpeed) {
      CONFIG.ai.ticksPerSecond = DEFAULT_TICKS_PER_SECOND;
    }
    if (resetSpeed || simState.speed !== CONFIG.ai.ticksPerSecond) {
      simState.speed = CONFIG.ai.ticksPerSecond;
      if (speedSlider) {
        speedSlider.value = String(CONFIG.ai.ticksPerSecond);
      }
      emit(EVENT.STATUS, {
        who: "system",
        msg: `Speed set to ${CONFIG.ai.ticksPerSecond} tps`,
        speed: CONFIG.ai.ticksPerSecond,
      });
    }
  }

  function applyCustomSettings({
    seed,
    depth,
    initialSpawns,
    monsterTags,
    tps,
    gen,
    knobs,
    modes,
  } = {}) {
    gameState.config = gameState.config || {};

    if (Array.isArray(monsterTags) && monsterTags.length) {
      gameState.config.monsterTagsOverride = monsterTags
        .filter(Boolean)
        .slice(0, 24);
    } else {
      delete gameState.config.monsterTagsOverride;
    }

    if (Number.isFinite(initialSpawns)) {
      gameState.config.initialSpawnCount = Math.max(
        0,
        Math.floor(initialSpawns),
      );
    } else {
      delete gameState.config.initialSpawnCount;
    }

    if (Number.isFinite(depth)) {
      gameState.config.depth = Math.max(0, Math.floor(depth));
    } else {
      delete gameState.config.depth;
    }

    if (Number.isFinite(seed)) {
      const normalizedSeed = seed >>> 0;
      gameState.config.seed = normalizedSeed;
      gameState.rng = mulberry32(normalizedSeed);
    } else {
      delete gameState.config.seed;
      delete gameState.rng;
    }

    if (Number.isFinite(tps)) {
      const clamped = Math.max(1, Math.min(60, Math.floor(tps)));
      CONFIG.ai.ticksPerSecond = clamped;
      simState.speed = clamped;
      if (speedSlider) {
        speedSlider.value = String(clamped);
      }
      emit(EVENT.STATUS, {
        who: "system",
        msg: `Speed set to ${clamped} tps`,
        speed: clamped,
      });
    }

    if (gen && typeof gen === "object") {
      gameState.config.generatorOverrides = clonePlain(gen);
    } else {
      delete gameState.config.generatorOverrides;
    }

    if (knobs && typeof knobs === "object") {
      const sanitizedKnobs = {
        playerFovOverride: Number.isFinite(knobs.playerFovOverride)
          ? Math.max(0, Math.floor(knobs.playerFovOverride))
          : null,
        spawnMinDistance: Number.isFinite(knobs.spawnMinDistance)
          ? Math.max(0, Math.floor(knobs.spawnMinDistance))
          : Number.isFinite(CONFIG?.knobs?.spawnMinDistance)
          ? Math.max(0, Math.floor(CONFIG.knobs.spawnMinDistance))
          : 6,
        mapWidth: Number.isFinite(knobs.mapWidth)
          ? Math.max(8, Math.floor(knobs.mapWidth))
          : null,
        mapHeight: Number.isFinite(knobs.mapHeight)
          ? Math.max(8, Math.floor(knobs.mapHeight))
          : null,
      };
      gameState.config.knobs = sanitizedKnobs;
    } else {
      delete gameState.config.knobs;
    }

    if (modes && typeof modes === "object") {
      const sanitizedModes = {};
      const arenaInput = modes.arena;
      if (arenaInput && typeof arenaInput === "object") {
        const sanitizedSpawns = {};
        for (const [id, raw] of Object.entries(arenaInput.spawnsById || {})) {
          if (!id) continue;
          const parsed = Number(raw);
          if (!Number.isFinite(parsed)) continue;
          const count = Math.max(0, Math.floor(parsed));
          sanitizedSpawns[id] = count;
        }
        sanitizedModes.arena = {
          enabled: !!arenaInput.enabled,
          width: Number.isFinite(arenaInput.width)
            ? Math.max(8, Math.floor(arenaInput.width))
            : Number.isFinite(CONFIG?.modes?.arena?.width)
            ? Math.max(8, Math.floor(CONFIG.modes.arena.width))
            : 40,
          height: Number.isFinite(arenaInput.height)
            ? Math.max(8, Math.floor(arenaInput.height))
            : Number.isFinite(CONFIG?.modes?.arena?.height)
            ? Math.max(8, Math.floor(CONFIG.modes.arena.height))
            : 24,
          spawnsById: sanitizedSpawns,
          suppressExitSeekUntilClear:
            arenaInput.suppressExitSeekUntilClear ??
            CONFIG?.modes?.arena?.suppressExitSeekUntilClear ??
            true,
        };
      }
      if (Object.keys(sanitizedModes).length > 0) {
        gameState.config.modes = sanitizedModes;
      } else {
        delete gameState.config.modes;
      }
    } else {
      delete gameState.config.modes;
    }
  }

  function restoreHybridGeneratorConfig() {
    const target = CONFIG?.generator?.hybrid;
    if (!target || typeof target !== "object") return;
    if (!BASE_GENERATOR_HYBRID || typeof BASE_GENERATOR_HYBRID !== "object") {
      return;
    }
    for (const key of Object.keys(target)) {
      if (!Object.prototype.hasOwnProperty.call(BASE_GENERATOR_HYBRID, key)) {
        delete target[key];
      }
    }
    for (const key of Object.keys(BASE_GENERATOR_HYBRID)) {
      target[key] = clonePlain(BASE_GENERATOR_HYBRID[key]);
    }
  }

  function clonePlain(value) {
    if (value === undefined || value === null) {
      return value;
    }
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch {
        // structuredClone not available for this value
      }
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }

  function clamp01(value) {
    if (!Number.isFinite(value)) {
      value = Number(value);
    }
    if (!Number.isFinite(value)) {
      return 0;
    }
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }

  function deepMerge(target, source) {
    if (!target || typeof target !== "object") return target;
    if (!source || typeof source !== "object") return target;
    for (const key of Object.keys(source)) {
      const value = source[key];
      if (Array.isArray(value)) {
        target[key] = value.slice();
      } else if (value && typeof value === "object") {
        if (
          !target[key] ||
          typeof target[key] !== "object" ||
          Array.isArray(target[key])
        ) {
          target[key] = {};
        }
        deepMerge(target[key], value);
      } else {
        target[key] = value;
      }
    }
    return target;
  }

  function bootstrap() {
    const ticksPerSecond = CONFIG.ai.ticksPerSecond;
    speedSlider.value = ticksPerSecond;
    emit(EVENT.STATUS, {
      who: "system",
      msg: `Speed set to ${ticksPerSecond} tps`,
      speed: ticksPerSecond,
    });
    restartBtn.addEventListener("click", () => {
      if (getLastRunMode() === "custom") {
        setLastRunMode("custom");
        const saved = loadMenuSettings();
        applyCustomSettings(saved);
      } else {
        setLastRunMode("quick");
        applyQuickSettings({ resetSpeed: true });
      }
      hideStartMenu();
      startNewSimulation();
    });
    speedSlider.addEventListener("input", (e) => {
      simState.speed = parseInt(e.target.value, 10);
      emit(EVENT.STATUS, {
        who: "system",
        msg: `Speed set to ${simState.speed} tps`,
        speed: simState.speed,
      });
    });
    window.addEventListener("resize", handleResize);
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        togglePause();
      }
    });
    initMinimapDOM();
    initStartMenu();
  }
  // ===================== MINIMAP =====================
  const MINIMAP_CFG = CONFIG.minimap || {};
  const MINIMAP_COLORS = MINIMAP_CFG.colors || {};
  const minimapState = {
    padding:
      typeof MINIMAP_CFG.padding === "number" ? MINIMAP_CFG.padding : 0,
    initialized: false,
    tilesW: 0,
    tilesH: 0,
    cellSize: 4,
    view: null,
  };
  let minimapDomInitialized = false;

  function initMinimapDOM() {
    if (minimapDomInitialized) return;
    minimapModalEl =
      minimapModalEl || document.getElementById("minimapModal");
    gameState.ui.minimapModal = minimapModalEl;
    minimapCloseBtn =
      minimapCloseBtn || document.getElementById("minimapClose");
    gameState.ui.minimapClose = minimapCloseBtn;
    if (!minimapModalEl || !minimapCloseBtn) return;

    minimapCloseBtn.addEventListener("click", closeMinimap);
    document.addEventListener("keydown", (e) => {
      if (e.key === "m" || e.key === "M") toggleMinimap();
      if (e.key === "Escape" && isMinimapOpen()) closeMinimap();
    });

    minimapDomInitialized = true;
  }

  function isMinimapOpen() {
    return minimapModalEl && minimapModalEl.style.display === "flex";
  }

  function determineMinimapCellSize(longestSideTiles) {
    const safeLongest = Math.max(1, longestSideTiles);
    const maxPixels = Math.floor(
      Math.min(window.innerWidth, window.innerHeight) * 0.9,
    );
    const tentative = Math.floor(maxPixels / safeLongest);
    if (!Number.isFinite(tentative) || tentative <= 0) return 4;
    return Math.max(2, tentative);
  }

  function configureMinimapRenderer(forceInit = false) {
    if (!minimapController) return;
    if (!mapState.width || !mapState.height) return;

    const pad = minimapState.padding;
    const widthTiles = mapState.width + pad * 2;
    const heightTiles = mapState.height + pad * 2;
    if (widthTiles <= 0 || heightTiles <= 0) return;

    const cellSize = determineMinimapCellSize(
      Math.max(widthTiles, heightTiles),
    );
    const needsInit = forceInit || !minimapState.initialized;
    const dimsChanged =
      widthTiles !== minimapState.tilesW ||
      heightTiles !== minimapState.tilesH ||
      cellSize !== minimapState.cellSize;

    if (needsInit) {
      minimapController.init(widthTiles, heightTiles, cellSize);
      minimapState.initialized = true;
    } else if (dimsChanged) {
      minimapController.resize(widthTiles, heightTiles, cellSize);
    }

    minimapState.tilesW = widthTiles;
    minimapState.tilesH = heightTiles;
    minimapState.cellSize = cellSize;
    minimapState.view = {
      tx: 0,
      ty: 0,
      cellSize,
      viewW: widthTiles * cellSize,
      viewH: heightTiles * cellSize,
    };
  }

  function getPlayerPos() {
    if (!player) return { x: 0, y: 0 };
    if (typeof player.x === "number" && typeof player.y === "number") {
      return { x: player.x, y: player.y };
    }
    if (
      player.pos &&
      typeof player.pos.x === "number" &&
      typeof player.pos.y === "number"
    ) {
      return { x: player.pos.x, y: player.pos.y };
    }
    return { x: 0, y: 0 };
  }

  function computeMinimapViewportRect(playerPos) {
    if (!mapState.width || !mapState.height) return null;
    const { tx, ty } = calculateViewportTransform(playerPos);
    const rawViewportX = Math.round(-tx / CELL_SIZE);
    const rawViewportY = Math.round(-ty / CELL_SIZE);
    const maxViewportX = Math.max(0, mapState.width - VIEW_W);
    const maxViewportY = Math.max(0, mapState.height - VIEW_H);
    const viewportTopLeftX = clamp(rawViewportX, 0, maxViewportX);
    const viewportTopLeftY = clamp(rawViewportY, 0, maxViewportY);

    return {
      x: minimapState.padding + viewportTopLeftX,
      y: minimapState.padding + viewportTopLeftY,
      w: Math.min(VIEW_W, mapState.width),
      h: Math.min(VIEW_H, mapState.height),
    };
  }

  function renderMinimapScene() {
    if (!minimapController) return;
    if (!minimapState.initialized) {
      configureMinimapRenderer(true);
      if (!minimapState.initialized) return;
    }
    if (!mapState.grid || !mapState.grid.length) return;

    const playerPos = getPlayerPos();
    const viewportRect = computeMinimapViewportRect(playerPos);
    if (!viewportRect) return;

    const view = minimapState.view || {
      tx: 0,
      ty: 0,
      cellSize: minimapState.cellSize,
      viewW: minimapState.tilesW * minimapState.cellSize,
      viewH: minimapState.tilesH * minimapState.cellSize,
    };

    minimapController.renderMinimap(
      {
        map: { grid: mapState.grid, explored: mapState.explored },
        player: playerPos,
        padding: minimapState.padding,
        colors: MINIMAP_COLORS,
      },
      view,
      { viewportRect },
    );
  }

  function openMinimap() {
    if (!minimapController) return;
    initMinimapDOM();
    if (!minimapModalEl) return;
    minimapModalEl.style.display = "flex";
    requestAnimationFrame(() => {
      configureMinimapRenderer();
      renderMinimapScene();
    });
  }

  function closeMinimap() {
    if (minimapModalEl) minimapModalEl.style.display = "none";
  }

  function toggleMinimap() {
    if (!simState.isReady) return;
    if (isMinimapOpen()) closeMinimap();
    else openMinimap();
  }

  function handleMinimapResize() {
    if (!minimapController) return;
    if (!mapState.width || !mapState.height) return;
    configureMinimapRenderer();
    if (isMinimapOpen()) {
      renderMinimapScene();
    }
  }

  window.addEventListener("resize", () => {
    if (!minimapController) return;
    handleMinimapResize();
  });

  function minimapMaybeRefreshOnTick() {
    if (isMinimapOpen()) {
      renderMinimapScene();
    }
  }

  // ===================== END MINIMAP =====================
  return {
    bootstrap,
    togglePause,
    state: gameState,
  };
})();

window.addEventListener("load", () => {
  Sound.init();
  Game.bootstrap();
});

