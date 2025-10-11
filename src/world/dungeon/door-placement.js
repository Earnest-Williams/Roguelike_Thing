// src/world/dungeon/door-placement.js
// @ts-check

import { TILE_FLOOR } from "../../../js/constants.js";
import { Door, DOOR_STATE, DOOR_TYPE, DOOR_VARIANT_IDS } from "../furniture/door.js";
import { FurnitureOrientation } from "../furniture/furniture.js";
import { FurnitureEffect, FURNITURE_EFFECT_IDS } from "../furniture/effects.js";
import { chooseStuffByWeight, resolveStuff, STUFF } from "../stuff.js";

const DEFAULT_VARIANTS = [
  {
    id: DOOR_VARIANT_IDS.STANDARD,
    type: DOOR_TYPE.HINGED,
    weight: 6,
    materialWeights: [
      { id: STUFF.WOOD.id, weight: 6 },
      { id: STUFF.IRON.id, weight: 2 },
      { id: STUFF.STONE.id, weight: 1 },
    ],
  },
  {
    id: DOOR_VARIANT_IDS.REINFORCED,
    type: DOOR_TYPE.HINGED,
    weight: 2,
    materialWeights: [
      { id: STUFF.IRON.id, weight: 4 },
      { id: STUFF.STEEL.id, weight: 3 },
      { id: STUFF.STONE.id, weight: 1 },
    ],
    tags: ["reinforced"],
  },
  {
    id: DOOR_VARIANT_IDS.DOUBLE,
    type: DOOR_TYPE.DOUBLE,
    weight: 0.8,
    materialWeights: [
      { id: STUFF.DARKWOOD.id, weight: 4 },
      { id: STUFF.IRON.id, weight: 2 },
      { id: STUFF.STEEL.id, weight: 1 },
    ],
    tags: ["double", "wide"],
  },
  {
    id: DOOR_VARIANT_IDS.PORTCULLIS,
    type: DOOR_TYPE.PORTCULLIS,
    weight: 1,
    materialWeights: [
      { id: STUFF.IRON.id, weight: 3 },
      { id: STUFF.STEEL.id, weight: 4 },
    ],
    tags: ["heavy"],
  },
  {
    id: DOOR_VARIANT_IDS.SLIDING,
    type: DOOR_TYPE.SLIDING,
    weight: 0.6,
    materialWeights: [
      { id: STUFF.WOOD.id, weight: 2 },
      { id: STUFF.DARKWOOD.id, weight: 1 },
      { id: STUFF.IRON.id, weight: 1.5 },
    ],
    tags: ["sliding", "mechanical"],
  },
  {
    id: DOOR_VARIANT_IDS.ARCHWAY,
    type: DOOR_TYPE.ARCHWAY,
    weight: 1,
    initialState: DOOR_STATE.OPEN,
    allowRandomEffects: false,
    materialWeights: [
      { id: STUFF.STONE.id, weight: 4 },
      { id: STUFF.WOOD.id, weight: 1 },
    ],
    tags: ["archway", "permanent_open"],
  },
  {
    id: DOOR_VARIANT_IDS.SECRET,
    type: DOOR_TYPE.SECRET,
    weight: 0.5,
    allowRandomEffects: false,
    materialWeights: [
      { id: STUFF.STONE.id, weight: 3 },
      { id: STUFF.WOOD.id, weight: 2 },
    ],
    tags: ["secret", "concealed"],
    defaultEffects: [
      {
        id: FURNITURE_EFFECT_IDS.MAGIC_AURA,
        description: "Arcane veils hide the doorway from casual sight.",
        tags: ["magical", "illusion"],
      },
    ],
  },
  {
    id: DOOR_VARIANT_IDS.GRATE,
    type: DOOR_TYPE.GRATE,
    weight: 0.5,
    materialWeights: [
      { id: STUFF.IRON.id, weight: 3 },
      { id: STUFF.STEEL.id, weight: 2 },
      { id: STUFF.BRONZE.id, weight: 1 },
      { id: STUFF.GLASS.id, weight: 0.5 },
    ],
    tags: ["barred", "sightline"],
  },
  {
    id: DOOR_VARIANT_IDS.RUNED,
    type: DOOR_TYPE.HINGED,
    weight: 0.4,
    materialWeights: [
      { id: STUFF.OBSIDIAN.id, weight: 2 },
      { id: STUFF.STONE.id, weight: 1 },
      { id: STUFF.STEEL.id, weight: 1 },
    ],
    tags: ["magical", "reinforced"],
    defaultEffects: [
      {
        id: FURNITURE_EFFECT_IDS.MAGIC_SEAL,
        description: "Runes pulse softly across the dark surface.",
        tags: ["magical", "warded"],
      },
    ],
  },
];

const DEFAULT_EFFECT_CHANCES = {
  locked: 0.18,
  jammed: 0.08,
  broken: 0.04,
  magical: 0.06,
};

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function key(x, y) {
  return `${x},${y}`;
}

function pickVariant(variants, rng) {
  const table = Array.isArray(variants) && variants.length > 0 ? variants : DEFAULT_VARIANTS;
  let total = 0;
  for (const v of table) {
    if (v && typeof v.weight === "number" && v.weight > 0) total += v.weight;
  }
  if (total <= 0) return table.length > 0 ? table[0] : null;
  const baseRandom = typeof rng === "function" ? rng() : Math.random();
  const roll = baseRandom * total;
  let cumulative = 0;
  for (const variant of table) {
    if (!variant || typeof variant.weight !== "number" || variant.weight <= 0) continue;
    cumulative += variant.weight;
    if (roll <= cumulative) {
      return variant;
    }
  }
  return table.length > 0 ? table[0] : null;
}

function deduceOrientation(grid, x, y) {
  const north = grid[y - 1]?.[x] === TILE_FLOOR;
  const south = grid[y + 1]?.[x] === TILE_FLOOR;
  const east = grid[y]?.[x + 1] === TILE_FLOOR;
  const west = grid[y]?.[x - 1] === TILE_FLOOR;
  if ((north && south) && !(east && west)) {
    return FurnitureOrientation.NORTH_SOUTH;
  }
  if ((east && west) && !(north && south)) {
    return FurnitureOrientation.EAST_WEST;
  }
  // fallback – prefer axis with more floor neighbours
  const ewCount = (east ? 1 : 0) + (west ? 1 : 0);
  const nsCount = (north ? 1 : 0) + (south ? 1 : 0);
  return ewCount >= nsCount
    ? FurnitureOrientation.EAST_WEST
    : FurnitureOrientation.NORTH_SOUTH;
}

function isFloor(grid, x, y) {
  return grid?.[y]?.[x] === TILE_FLOOR;
}

function isDoorPlacementLogical(grid, x, y, orientation) {
  const north = isFloor(grid, x, y - 1);
  const south = isFloor(grid, x, y + 1);
  const east = isFloor(grid, x + 1, y);
  const west = isFloor(grid, x - 1, y);
  const ns = north && south;
  const ew = east && west;

  if (orientation === FurnitureOrientation.NORTH_SOUTH) {
    if (!ns) return false;
    return !east && !west;
  }
  if (orientation === FurnitureOrientation.EAST_WEST) {
    if (!ew) return false;
    return !north && !south;
  }
  // No diagonal doors.
  return false;
}

function buildRoomTileLookup(rooms) {
  /** @type {Map<string, any[]>} */
  const tileRooms = new Map();
  /** @type {Map<string, any>} */
  const byId = new Map();
  if (!Array.isArray(rooms)) return { tileRooms, byId };
  rooms.forEach((room, idx) => {
    if (!room) return;
    const roomId = typeof room.id === "string" ? room.id : `room-${idx}`;
    room.id = roomId;
    byId.set(roomId, room);
    if (!Array.isArray(room.tiles)) return;
    for (const tile of room.tiles) {
      if (!tile) continue;
      const k = key(Math.round(tile.x), Math.round(tile.y));
      if (!tileRooms.has(k)) tileRooms.set(k, []);
      tileRooms.get(k).push(room);
    }
  });
  return { tileRooms, byId };
}

function findThresholdTile(path, room, tileRooms) {
  if (!room || !Array.isArray(path) || path.length === 0) return null;
  let inside = false;
  for (const step of path) {
    if (!step) continue;
    const sx = Math.round(step.x);
    const sy = Math.round(step.y);
    const k = key(sx, sy);
    const roomsHere = tileRooms.get(k) || [];
    if (!inside && roomsHere.includes(room)) {
      inside = true;
      continue;
    }
    if (!inside) continue;
    if (roomsHere.includes(room)) {
      continue;
    }
    if (roomsHere.length > 0) {
      // This tile belongs to another room; keep scanning until corridor space.
      continue;
    }
    return { x: sx, y: sy };
  }
  return null;
}

function maybeApplyDoorEffects(door, chances, rng, { allowRandomEffects = true } = {}) {
  if (!allowRandomEffects) return;
  const random = typeof rng === "function" ? rng : Math.random;
  const roll = () => random();
  if (roll() < clamp01(chances.broken)) {
    door.applyEffect(
      new FurnitureEffect(FURNITURE_EFFECT_IDS.BROKEN, {
        tags: ["structural"],
        description: "Splintered frame and shattered panels.",
      }),
    );
    return;
  }
  if (roll() < clamp01(chances.locked)) {
    door.applyEffect(
      new FurnitureEffect(FURNITURE_EFFECT_IDS.LOCKED, {
        tags: ["mechanical"],
        data: { difficulty: "standard" },
      }),
    );
  }
  if (roll() < clamp01(chances.jammed)) {
    door.applyEffect(
      new FurnitureEffect(FURNITURE_EFFECT_IDS.JAMMED, {
        tags: ["mechanical"],
        data: { severity: "minor" },
      }),
    );
  }
  if (roll() < clamp01(chances.magical)) {
    door.applyEffect(
      new FurnitureEffect(FURNITURE_EFFECT_IDS.MAGIC_SEAL, {
        tags: ["magical"],
        description: "Arcane sigils shimmer across the surface.",
      }),
    );
  }
}

function pickMaterialForVariant(variant, rng) {
  if (Array.isArray(variant?.materialWeights) && variant.materialWeights.length > 0) {
    const chosen = chooseStuffByWeight(variant.materialWeights, rng);
    if (chosen) return chosen;
  }
  if (variant?.type === DOOR_TYPE.PORTCULLIS) {
    return resolveStuff(STUFF.IRON);
  }
  if (variant?.type === DOOR_TYPE.GRATE) {
    return resolveStuff(STUFF.STEEL);
  }
  if (variant?.type === DOOR_TYPE.SLIDING) {
    return resolveStuff(STUFF.IRON);
  }
  if (variant?.type === DOOR_TYPE.DOUBLE) {
    return resolveStuff(STUFF.DARKWOOD);
  }
  return resolveStuff(STUFF.WOOD);
}

function applyVariantDefaultEffects(door, variant) {
  if (!variant || !Array.isArray(variant.defaultEffects)) return;
  for (const entry of variant.defaultEffects) {
    if (!entry) continue;
    if (typeof entry === "string") {
      door.applyEffect(new FurnitureEffect(entry));
      continue;
    }
    if (!entry.id) continue;
    const { id, ...rest } = entry;
    door.applyEffect(
      new FurnitureEffect(id, {
        tags: Array.isArray(rest.tags) ? rest.tags : [],
        data: rest.data && typeof rest.data === "object" ? { ...rest.data } : {},
        source: rest.source ?? null,
        duration: rest.duration ?? null,
        description: rest.description ?? null,
      }),
    );
  }
}

function makePlacement({
  door,
  x,
  y,
  corridorId,
  fromRoomId,
  toRoomId,
}) {
  return {
    furniture: door,
    position: { x, y },
    orientation: door.orientation,
    metadata: {
      corridorId: corridorId ?? null,
      fromRoomId: fromRoomId ?? null,
      toRoomId: toRoomId ?? null,
    },
  };
}

/**
 * Generate doorway furniture placements for a carved dungeon grid.
 * @param {number[][]} grid
 * @param {Object} context
 * @param {Array<any>} [context.rooms]
 * @param {Array<{ id?: string, path: Array<{ x: number, y: number }>, fromRoomId?: string | null, toRoomId?: string | null }>} [context.corridors]
 * @param {Object} [context.config]
 * @param {number} [context.config.spawnChance]
 * @param {number} [context.config.maxPerConnection]
 * @param {Array<any>} [context.config.variants]
 * @param {Object} [context.config.effectChances]
 * @param {() => number} [context.rng]
 * @returns {{ placements: Array<{ furniture: Door, position: { x: number, y: number }, orientation: string, metadata: Record<string, any> }>, stats: Record<string, any> }}
 */
export function generateDoorsForDungeon(
  grid,
  { rooms = [], corridors = [], config = {}, rng = Math.random } = {},
) {
  const { tileRooms, byId } = buildRoomTileLookup(rooms);
  const spawnChance = clamp01(config.spawnChance ?? 0.6);
  const maxPerConnection = Number.isFinite(config.maxPerConnection)
    ? Math.max(0, Math.floor(config.maxPerConnection))
    : 2;
  const variants = Array.isArray(config.variants) ? config.variants : DEFAULT_VARIANTS;
  const effectChances = {
    ...DEFAULT_EFFECT_CHANCES,
    ...(config.effectChances || {}),
  };

  /** @type {Set<string>} */
  const occupied = new Set();
  /** @type {Array<{ furniture: Door, position: { x: number, y: number }, orientation: string, metadata: Record<string, any> }>} */
  const placements = [];
  const stats = {
    attempted: 0,
    placed: 0,
    byVariant: new Map(),
  };

  const considerPlacement = (pos, corridor, anchorRoomId, otherRoomId) => {
    if (!pos) return;
    const k = key(pos.x, pos.y);
    if (occupied.has(k)) return;
    if (grid[pos.y]?.[pos.x] !== TILE_FLOOR) return;
    const roll = typeof rng === "function" ? rng() : Math.random();
    if (roll > spawnChance) return;
    const orientation = deduceOrientation(grid, pos.x, pos.y);
    if (!isDoorPlacementLogical(grid, pos.x, pos.y, orientation)) {
      return;
    }
    const variant = pickVariant(variants, rng);
    if (!variant) return;
    const material = pickMaterialForVariant(variant, rng);
    const door = new Door({
      variantId: variant.id,
      type: variant.type,
      state: variant.initialState || DOOR_STATE.CLOSED,
      orientation,
      material,
      tags: Array.isArray(variant.tags) ? variant.tags : [],
      metadata: {
        ...corridor?.metadata,
        variantId: variant.id,
        connection: {
          from: anchorRoomId ?? null,
          to: otherRoomId ?? null,
        },
      },
    });
    applyVariantDefaultEffects(door, variant);
    maybeApplyDoorEffects(door, effectChances, rng, {
      allowRandomEffects: variant.allowRandomEffects !== false,
    });
    placements.push(
      makePlacement({
        door,
        x: pos.x,
        y: pos.y,
        corridorId: corridor?.id ?? null,
        fromRoomId: anchorRoomId ?? null,
        toRoomId: otherRoomId ?? null,
      }),
    );
    occupied.add(k);
    stats.placed += 1;
    stats.byVariant.set(variant.id, (stats.byVariant.get(variant.id) || 0) + 1);
  };

  for (const corridor of corridors) {
    if (!corridor || !Array.isArray(corridor.path) || corridor.path.length === 0) continue;
    const fromRoom = corridor.fromRoomId ? byId.get(corridor.fromRoomId) : null;
    const toRoom = corridor.toRoomId ? byId.get(corridor.toRoomId) : null;
    const forward = findThresholdTile(corridor.path, fromRoom, tileRooms);
    const reverse = findThresholdTile([...corridor.path].reverse(), toRoom, tileRooms);
    let placedForConnection = 0;
    const targets = [];
    if (forward) {
      targets.push({ pos: forward, anchorId: fromRoom?.id ?? null, otherId: toRoom?.id ?? null });
    }
    if (reverse) {
      targets.push({ pos: reverse, anchorId: toRoom?.id ?? null, otherId: fromRoom?.id ?? null });
    }
    for (const target of targets) {
      if (maxPerConnection > 0 && placedForConnection >= maxPerConnection) break;
      stats.attempted += 1;
      const before = placements.length;
      considerPlacement(target.pos, corridor, target.anchorId, target.otherId);
      if (placements.length > before) {
        placedForConnection += 1;
      }
    }
  }

  const statsSummary = {
    attempted: stats.attempted,
    placed: stats.placed,
    byVariant: Object.fromEntries(stats.byVariant),
  };

  return { placements, stats: statsSummary };
}

