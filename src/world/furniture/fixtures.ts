// src/world/furniture/fixtures.js
// @ts-nocheck

import { Furniture, FurnitureKind, FurnitureOrientation } from "./furniture.js";
import { resolveStuff } from "../stuff.js";

function normalizeFootprint(footprint) {
  if (!footprint || typeof footprint !== "object") {
    return { width: 1, depth: 1 };
  }
  const width = Number.isFinite(footprint.width)
    ? Math.max(1, Math.floor(footprint.width))
    : Number.isFinite(footprint.w)
      ? Math.max(1, Math.floor(footprint.w))
      : 1;
  const depth = Number.isFinite(footprint.depth)
    ? Math.max(1, Math.floor(footprint.depth))
    : Number.isFinite(footprint.h)
      ? Math.max(1, Math.floor(footprint.h))
      : 1;
  return { width, depth };
}

/**
 * Base helper for non-door fixtures. Ensures consistent tagging and metadata
 * so future furniture (desks, wardrobes, etc.) can share orientation,
 * footprint and interaction data without duplicating boilerplate.
 */
export class Fixture extends Furniture {
  constructor({
    id = null,
    kind = FurnitureKind.GENERIC,
    name = "Fixture",
    orientation = FurnitureOrientation.FLOOR,
    material = null,
    tags = [],
    metadata = {},
    footprint = null,
  } = {}) {
    const resolvedMaterial = resolveStuff(material);
    const rawMetadata =
      metadata && typeof metadata === "object" ? { ...metadata } : {};
    const normalizedFootprint = normalizeFootprint(footprint || rawMetadata.footprint);
    const baseTags = new Set([
      "fixture",
      ...(Array.isArray(tags) ? tags : []),
    ]);
    const mergedMetadata = {
      ...rawMetadata,
      footprint: normalizedFootprint,
    };
    super({
      id,
      kind,
      name,
      orientation: orientation || FurnitureOrientation.FLOOR,
      material: resolvedMaterial,
      tags: Array.from(baseTags),
      metadata: mergedMetadata,
    });
  }
}

export class Table extends Fixture {
  constructor({
    id = null,
    name = "Table",
    material = "wood",
    tags = [],
    metadata = {},
    footprint = { width: 2, depth: 1 },
    shape = "rectangular",
    seating = 2,
  } = {}) {
    const baseMetadata =
      metadata && typeof metadata === "object" ? { ...metadata } : {};
    const mergedMetadata = {
      ...baseMetadata,
      shape,
      seating,
      surface: "flat",
    };
    const baseTags = new Set([
      "table",
      "surface",
      ...(Array.isArray(tags) ? tags : []),
    ]);
    super({
      id,
      kind: FurnitureKind.TABLE,
      name,
      material,
      tags: Array.from(baseTags),
      metadata: mergedMetadata,
      footprint,
    });
  }
}

export class Chair extends Fixture {
  constructor({
    id = null,
    name = "Chair",
    material = "wood",
    tags = [],
    metadata = {},
    footprint = { width: 1, depth: 1 },
    hasBack = true,
  } = {}) {
    const baseMetadata =
      metadata && typeof metadata === "object" ? { ...metadata } : {};
    const mergedMetadata = {
      ...baseMetadata,
      seatingCapacity: 1,
      hasBack: Boolean(hasBack),
    };
    const baseTags = new Set([
      "seat",
      "furniture",
      ...(Array.isArray(tags) ? tags : []),
    ]);
    super({
      id,
      kind: FurnitureKind.SEAT,
      name,
      material,
      tags: Array.from(baseTags),
      metadata: mergedMetadata,
      footprint,
    });
  }
}

export class StorageChest extends Fixture {
  constructor({
    id = null,
    name = "Chest",
    material = "wood",
    tags = [],
    metadata = {},
    footprint = { width: 2, depth: 1 },
    capacity = 12,
  } = {}) {
    const baseMetadata =
      metadata && typeof metadata === "object" ? { ...metadata } : {};
    const mergedMetadata = {
      ...baseMetadata,
      capacity,
      locked: Boolean(baseMetadata.locked),
    };
    const baseTags = new Set([
      "storage",
      "container",
      ...(Array.isArray(tags) ? tags : []),
    ]);
    super({
      id,
      kind: FurnitureKind.STORAGE,
      name,
      material,
      tags: Array.from(baseTags),
      metadata: mergedMetadata,
      footprint,
    });
  }
}

export class Lamp extends Fixture {
  constructor({
    id = null,
    name = "Lamp",
    material = "bronze",
    tags = [],
    metadata = {},
    footprint = { width: 1, depth: 1 },
    lightRadius = 4,
    fuelType = "oil",
  } = {}) {
    const baseMetadata =
      metadata && typeof metadata === "object" ? { ...metadata } : {};
    const mergedMetadata = {
      ...baseMetadata,
      lightRadius,
      fuelType,
      emitsLight: true,
    };
    const baseTags = new Set([
      "light",
      "lamp",
      ...(Array.isArray(tags) ? tags : []),
    ]);
    super({
      id,
      kind: FurnitureKind.LIGHT,
      name,
      material,
      tags: Array.from(baseTags),
      metadata: mergedMetadata,
      footprint,
    });
    const declaredLight =
      baseMetadata.light && typeof baseMetadata.light === "object"
        ? baseMetadata.light
        : null;
    const radiusCandidate =
      declaredLight?.radius ?? baseMetadata.lightRadius ?? lightRadius;
    const radius = Number.isFinite(radiusCandidate) ? Number(radiusCandidate) : 0;
    if (radius > 0) {
      const color =
        typeof declaredLight?.color === "string"
          ? declaredLight.color
          : typeof baseMetadata.lightColor === "string"
            ? baseMetadata.lightColor
            : "#ffe9a6";
      const intensityCandidate =
        declaredLight?.intensity ?? baseMetadata.lightIntensity;
      const intensity = Number.isFinite(intensityCandidate)
        ? Math.max(0, Math.min(1, Number(intensityCandidate)))
        : 1;
      const flickerCandidate = declaredLight?.flickerRate ?? baseMetadata.flickerRate;
      const flickerRate = Number.isFinite(flickerCandidate)
        ? Number(flickerCandidate)
        : 0;
      this.light = {
        radius,
        color,
        intensity,
        flickerRate,
        worksWhenDropped: false,
      };
    } else {
      this.light = null;
    }
  }
}

export class Rug extends Fixture {
  constructor({
    id = null,
    name = "Rug",
    material = "cloth",
    tags = [],
    metadata = {},
    footprint = { width: 3, depth: 2 },
    pattern = "geometric",
  } = {}) {
    const baseMetadata =
      metadata && typeof metadata === "object" ? { ...metadata } : {};
    const mergedMetadata = {
      ...baseMetadata,
      pattern,
      comfort: baseMetadata.comfort ?? 1,
    };
    const baseTags = new Set([
      "decor",
      "soft",
      ...(Array.isArray(tags) ? tags : []),
    ]);
    super({
      id,
      kind: FurnitureKind.DECOR,
      name,
      material,
      tags: Array.from(baseTags),
      metadata: mergedMetadata,
      footprint,
    });
  }
}
