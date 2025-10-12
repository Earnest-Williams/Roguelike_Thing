// src/config.js
// Central configuration for tweakable gameplay and UI values.
import {
  DEFAULT_ATTACK_BASE_DAMAGE,
  DEFAULT_MELEE_RANGE_TILES,
  DEFAULT_STATUS_DURATION_TURNS,
  DEFAULT_STATUS_STACKS,
  BURN_MAX_STACKS,
  BURN_TICK_DAMAGE_PER_STACK,
  BLEED_DURATION_TURNS,
  BLEED_TICK_DAMAGE_PER_STACK,
} from "../js/constants.js";

export const COMBAT_ATTACK_TYPE_HINT_DURATION_MS = 250;

export const COMBAT_RESIST_MIN = -0.5;
export const COMBAT_RESIST_MAX = 0.8;

export const EVENT_LOG_RING_MAX = 200;
export const EVENT_LOG_LATEST_DEFAULT = 50;

export const DEBUG_OVERLAY_LOG_LIMIT = 60;
export const DEBUG_OVERLAY_BREAKDOWN_LIMIT = 8;
export const DEBUG_OVERLAY_MIN_PERCENT_DISPLAY = 1e-4;
export const DEBUG_OVERLAY_NUMBER_DIGITS = 2;

// Probability applied when rolling affixes for generated loot.
export const LOOT_AFFIX_CHANCE = 0.30;

// Upper bound for the random suffix appended to dynamic item IDs.
export const DYNAMIC_ID_RANDOMIZATION_MODULUS = 1e9;

export const DEV_CONSOLE_DEFAULT_STATUS_DURATION = DEFAULT_STATUS_DURATION_TURNS;
export const DEV_CONSOLE_DEFAULT_STATUS_STACKS = DEFAULT_STATUS_STACKS;
export const DEV_CONSOLE_DEFAULT_SIM_ITERATIONS = 40;
export const DEV_CONSOLE_RAF_FALLBACK_DELAY_MS = 16;
export const DEV_CONSOLE_LOOT_TOAST_TRANSITION_MS = 150;
export const DEV_CONSOLE_LOOT_TOAST_VISIBLE_DURATION_MS = 2600;
export const DEV_CONSOLE_LOOT_TOAST_HIDE_DELAY_MS = 200;
export const DEV_CONSOLE_LOOT_TOAST_TRANSLATE_Y_PX = 8;
export const DEV_CONSOLE_LOOT_TOAST_CONTAINER_RIGHT_PX = 16;
export const DEV_CONSOLE_LOOT_TOAST_CONTAINER_BOTTOM_PX = 96;
export const DEV_CONSOLE_LOOT_TOAST_CONTAINER_GAP_PX = 8;
export const DEV_CONSOLE_LOOT_TOAST_CONTAINER_Z_INDEX = 2000;
export const DEV_CONSOLE_LOOT_TOAST_PADDING = "8px 12px";
export const DEV_CONSOLE_LOOT_TOAST_BORDER_RADIUS_PX = 8;
export const DEV_CONSOLE_LOOT_TOAST_FONT_SIZE_PX = 12;
export const DEV_CONSOLE_LOOT_TOAST_BOX_SHADOW = "0 8px 24px rgba(15,23,42,0.35)";

// Dungeon door placement tuning
export const DUNGEON_DOOR_DEFAULT_SPAWN_CHANCE = 0.6;
export const DUNGEON_DOOR_MAX_PER_CONNECTION = 2;
export const DUNGEON_DOOR_DEFAULT_EFFECT_CHANCES = Object.freeze({
  locked: 0.18,
  jammed: 0.08,
  broken: 0.04,
  magical: 0.06,
});

// Combat status tuning
export const STATUS_BURN_MAX_STACKS = BURN_MAX_STACKS;
export const STATUS_BURN_BASE_DAMAGE = BURN_TICK_DAMAGE_PER_STACK;
export const STATUS_BLEED_DURATION_TURNS = BLEED_DURATION_TURNS;
export const STATUS_BLEED_DAMAGE_PER_STACK = BLEED_TICK_DAMAGE_PER_STACK;
export const STATUS_SLOWED_ACTION_SPEED_PENALTY_PER_STACK = 0.1;
export const STATUS_SLOWED_MOVE_AP_DELTA = 0.1;
export const STATUS_STUNNED_ACTION_SPEED_PENALTY_PER_STACK = 1.0;
export const STATUS_HASTE_ACTION_SPEED_BONUS_PER_STACK = 0.15;
export const COMBAT_DEFAULT_MELEE_RANGE_TILES = DEFAULT_MELEE_RANGE_TILES;
export const COMBAT_FALLBACK_ATTACK_BASE_DAMAGE = DEFAULT_ATTACK_BASE_DAMAGE;

export const CONFIG = {
  visual: {
    view: { width: 41, height: 41 },
    cellSize: 20,
    minCellSize: 12,
    colors: {
      unseen: "#111",
      wall: "#3a2a23",
      floor: "#222",
      floorGlyph: "#444",
      defaultText: "#d3d3d3",
      start: "#4caf50",
      end: "#f44336",
      player: "#2196f3",
      playerGlyph: "#fff",
      door: "#8b5a2b",
      doorGlyph: "#fef3c7",
      doorOpenGlyph: "#fde68a",
      doorLocked: "#facc15",
      doorJammed: "#fb923c",
      doorBroken: "#9ca3af",
      doorMagic: "#a855f7",
      doorPortcullis: "#d1d5db",
      doorReinforced: "#cbd5f5",
      doorArchway: "#fcd34d",
      doorSecret: "#22d3ee",
      visibleOverlay: "rgba(255,255,102,0.20)",
    },
    light: {
      fallbackColor: "#ffe9a6",
      fallbackFlickerRate: 0,
      baseOverlayAlpha: 0.2,
      flickerVariance: 0.12,
    },
  },
  ai: {
    ticksPerSecond: 12,
    shortTermMemory: 60,
    maxIdleTicks: 240,
    fallback: {
      unknownTileCost: 6,
      memoryRetainFraction: 0.4,
      randomWalk: {
        steps: 6,
        maxAttempts: 4,
      },
    },
  },
  generator: {
    hybrid: {
      large: {
        roomCountRange: [1, 11],
        areaRange: [300, 750],
        minSide: 8,
        minL1EdgeSpacing: 30,
        border: 15,
        maxAttemptsPerRoom: 600,
      },
      small: {
        candidateCount: 320,
        minSize: { w: 5, h: 5 },
        maxSize: { w: 14, h: 12 },
        separationIters: 80,
        keepRatio: 1.0,
        clearanceFromLarge: 2,
      },
      corridors: {
        extraEdgeFraction: 0.15,
        rescueConnectivity: true,
      },
      doors: {
        spawnChance: 0.65,
        maxPerConnection: 2,
        effectChances: {
          locked: 0.2,
          jammed: 0.08,
          broken: 0.05,
          magical: 0.07,
        },
        variants: [
          {
            id: "standard",
            type: "hinged",
            weight: 6,
            materialWeights: [
              { id: "wood", weight: 6 },
              { id: "iron", weight: 2 },
              { id: "stone", weight: 1 },
            ],
          },
          {
            id: "reinforced",
            type: "hinged",
            weight: 2,
            tags: ["reinforced"],
            materialWeights: [
              { id: "iron", weight: 4 },
              { id: "steel", weight: 3 },
              { id: "stone", weight: 1 },
            ],
          },
          {
            id: "portcullis",
            type: "portcullis",
            weight: 1,
            tags: ["heavy"],
            materialWeights: [
              { id: "iron", weight: 3 },
              { id: "steel", weight: 4 },
            ],
          },
          {
            id: "archway",
            type: "archway",
            weight: 1,
            allowRandomEffects: false,
            initialState: "open",
            tags: ["archway", "permanent_open"],
            materialWeights: [
              { id: "stone", weight: 4 },
              { id: "wood", weight: 1 },
            ],
          },
          {
            id: "secret",
            type: "secret",
            weight: 0.5,
            allowRandomEffects: false,
            tags: ["secret", "concealed"],
            materialWeights: [
              { id: "stone", weight: 3 },
              { id: "wood", weight: 2 },
            ],
            defaultEffects: [
              {
                id: "magic_aura",
                tags: ["magical", "illusion"],
                description:
                  "A faint shimmer betrays the outline of this hidden door.",
              },
            ],
          },
        ],
      },
    },
  },
  minimap: {
    padding: 1,
    colors: {
      wall: "#3a2a23",
      floor: "#111",
      floorExplored: "#1a1a1a",
      player: "#2196f3",
      viewport: "#00bcd4",
      border: "#333",
    },
  },
  general: {
    maxInitRetries: 10,
  },
};

