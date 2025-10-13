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
// NOTE: spawnMonsters is the canonical spawner; do not use any local/legacy spawn helpers.
import { spawnMonsters } from "./src/game/spawn.js";
import {
  createDefaultModCache,
  createEmptyStatusDerivedMods,
} from "./src/game/utils.js";
import { AIPlanner } from "./src/combat/ai-planner.js";
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
  computeTileOverlayAlpha,
  createLightOverlayContext,
} from "./src/world/fov.js";
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
      message: "You died",
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
        if (!it || !it.lightRadius) continue;
        const candidate = {
          radius: it.lightRadius,
          color: it.lightColor || fallback.color,
          flickerRate:
            typeof it.flickerRate === "number"
              ? it.flickerRate
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

  class Mob {
    constructor(o) {
      this.id = __mobAutoId++;
      this.kind = o.kind;
      this.name = o.name;
      this.x = o.x | 0;
      this.y = o.y | 0;
      this.hp = o.hp ?? DEFAULT_MOB_HP;
      this.maxHp = this.hp;
      this.speed = o.speed ?? DEFAULT_MOB_SPEED;
      this.baseDelay = o.baseDelay ?? 1;
      this.nextActAt = o.nextActAt ?? 0;
      this.glyph = o.glyph ?? "?";
      this.color = o.color ?? "#fff";
      this.factions = Array.isArray(o.factions) && o.factions.length
        ? [...o.factions]
        : ["unaligned"];
      if (this.factions.includes("unaligned") && this.factions.length > 1) {
        this.factions = ["unaligned"];
      }
      this.affiliations = Array.isArray(o.affiliations)
        ? [...o.affiliations]
        : [];
      this.equipment = new Equipment();
      this.inventory = new Inventory(DEFAULT_INVENTORY_CAPACITY);
      this.statuses = [];
      this.statusDerived = createEmptyStatusDerivedMods();
      this.modCache = createDefaultModCache();
      this.__log = null;
    }
    get pos() {
      return { x: this.x, y: this.y };
    }
    set pos(p) {
      this.x = p.x | 0;
      this.y = p.y | 0;
    }
    getLightRadius() {
      const gearRadius =
        typeof this.equipment?.getLightRadius === "function"
          ? Number(this.equipment.getLightRadius()) || 0
          : 0;
      const innateBonus = Number(this.modCache?.vision?.lightBonus || 0);
      return Math.max(0, gearRadius + innateBonus);
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
    takeTurn(gameCtx) {
      /* no-op base */
    }
  }

  class Player extends Mob {
    constructor(o) {
      super({ kind: "player", glyph: "@", color: "#fff", ...o });
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
    tick(gameCtx, turn) {
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
        const turnCtx = { ...gameCtx, mobManager: occupancyView };
        m.takeTurn(turnCtx);
        const to = { x: m.x, y: m.y };

        if (to.x !== from.x || to.y !== from.y) {
          plannedMoves.push({ mob: m, from, to });
        }

        const delay = computeActorDelay(m);
        m.nextActAt = turn + delay;
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
    return Math.max(0, Number(player?.getLightRadius?.() ?? 0));
  }

  function getLightProperties() {
    const radius = readPlayerLightRadius();
    const defaults = {
      radius,
      color: LIGHT_CONFIG.fallbackColor,
      flickerRate: LIGHT_CONFIG.fallbackFlickerRate,
    };
    if (!player?.equipment?.getLightSourceProperties) {
      return defaults;
    }
    const props =
      player.equipment.getLightSourceProperties(defaults) ?? defaults;
    return { ...props, radius };
  }

  function refreshLightingVisuals() {
    const overlay = computeLightOverlayVisuals(getLightProperties(), LIGHT_CONFIG);
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
    const start = startRoom?.center
      ? { x: startRoom.center.x, y: startRoom.center.y }
      : {
          x: Math.floor(mapState.width / 2),
          y: Math.floor(mapState.height / 2),
        };
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
    const end = endRoom?.center
      ? { x: endRoom.center.x, y: endRoom.center.y }
      : start;
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
      start: { x: Math.round(start.x), y: Math.round(start.y) },
      end: { x: Math.round(end.x), y: Math.round(end.y) },
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

  function renderScene() {
    if (!renderController || !rendererReady) return;
    if (!mapState.grid || !mapState.grid.length) return;
    if (!player || !player.pos) return;

    const playerPos = player.pos;
    const currentVisible =
      fovState.currentVisible instanceof Set
        ? fovState.currentVisible
        : new Set();
    const view = buildViewTransform(playerPos);

    refreshLightingVisuals();
    const lightCtx = createLightOverlayContext(player, LIGHT_CONFIG, getNow);
    if (
      currentEndPos &&
      mapState.explored[currentEndPos.y]?.[currentEndPos.x]
    ) {
      isEndRendered = true;
      gameState.isEndRendered = isEndRendered;
    }

    const overlayColor = fovState.overlayRgb
      ? { ...fovState.overlayRgb, a: 1 }
      : null;

    const furnitureEntities = buildFurnitureVisuals(
      mapState,
      currentVisible,
      CONFIG.visual.colors,
    );
    const mobEntities = buildMobVisuals(mobManager, currentVisible);
    const entities =
      furnitureEntities.length > 0
        ? furnitureEntities.concat(mobEntities)
        : mobEntities;

    renderController.render(
      {
        map: { grid: mapState.grid, explored: mapState.explored },
        fov: { visible: currentVisible },
        player: { x: playerPos.x, y: playerPos.y },
        start: player.startPos ?? null,
        end: isEndRendered ? currentEndPos : null,
        colors: CONFIG.visual.colors,
        overlayAlphaAt: (x, y) =>
          computeTileOverlayAlpha(x, y, lightCtx, LIGHT_CONFIG),
        overlayColor,
        entities,
      },
      view,
    );
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
    emit(EVENT.STATUS, { message: "AI exploring...", restartVisible: false });
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

      if (mapState.known[endPos.y][endPos.x] === TILE_FLOOR) {
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
          message: "AI is trapped!",
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
    function gameLoop() {
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
        if (mobManager) {
          mobManager.tick(gameCtx, turn);
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
          emit(EVENT.STATUS, { message: "Exit found!", restartVisible: true });
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
    emit(EVENT.STATUS, { paused: simState.isPaused });
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
      paused: false,
      restartVisible: false,
      message: "Generating dungeon...",
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

    gameState.player = newPlayer;
    return newPlayer;
  }

  function generateAndValidateDungeon() {
    emit(EVENT.STATUS, { message: "Generating dungeon...", restartVisible: false });
    const dungeonData = generateDungeon();
    if (!dungeonData) {
      return { success: false, reason: "generation" };
    }

    mapState.grid = dungeonData.grid;
    mapState.width = mapState.grid[0].length;
    mapState.height = mapState.grid.length;
    mapState.furniture = normalizeFurniturePlacements(
      dungeonData.furniture || [],
    );
    rebuildFurnitureIndex();

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
        message: "Map generation failed, retrying...",
        restartVisible: false,
      });
      initRetries++;
      gameState.initRetries = initRetries;
      setTimeout(startNewSimulation, 100);
    } else if (reason === "connectivity") {
      emit(EVENT.STATUS, {
        message: "Map is not fully connected, regenerating...",
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
       * Use the central spawner which:
       *  - Builds weighted tables from MOB_TEMPLATES and theme tags
       *  - Picks open tiles away from the player
       *  - Creates Monsters via factories (folding mods correctly)
       */
      const gameCtx = {
        player,
        mobManager,
        maze: mapState.grid,
        state: gameState,
        AIPlanner,
      };
      const chapter = gameState.chapter;
      const tags = chapter?.theme?.monsterTags ?? [];
      const count = 8;
      const includeTags = tags;
      const rng = gameState.rng;
      const spawned = spawnMonsters(gameCtx, { count, includeTags, rng });
      if (CONFIG?.debug?.logSpawns !== false) {
        console.log(
          `[SPAWN] ${spawned} mobs (tags: ${tags.join(", ") || "all"})`,
        );
      }
      gameState.__didInitialSpawns = true;
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
        message: "Fatal Error: Map generation failed repeatedly.",
        restartVisible: true,
      });
      console.error("Map generation failed after multiple retries.");
      return;
    }

    if (!gameState.chapter) {
      gameState.chapter = new ChapterState({ depth: 0 });
    } else {
      gameState.chapter.reset();
    }
    const chapter = gameState.chapter;
    if (chapter) {
      emit(EVENT.STATUS, {
        message: `Chapter Theme: ${chapter.theme.name}`,
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
      const result = generateAndValidateDungeon();
      if (!result.success) {
        handleDungeonFailure(result.reason);
        return;
      }

      initializeSimulation(result.dungeonData);
    }, 50);
  }

  function bootstrap() {
    const ticksPerSecond = CONFIG.ai.ticksPerSecond;
    speedSlider.value = ticksPerSecond;
    emit(EVENT.STATUS, { speed: ticksPerSecond });
    restartBtn.addEventListener("click", startNewSimulation);
    speedSlider.addEventListener("input", (e) => {
      simState.speed = parseInt(e.target.value, 10);
      emit(EVENT.STATUS, { speed: simState.speed });
    });
    window.addEventListener("resize", handleResize);
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        togglePause();
      }
    });
    initMinimapDOM();
    startNewSimulation();
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

