// src/world/furniture/furniture.js
// @ts-nocheck

import { LIGHT_CHANNELS } from "../../../js/constants.js";
import { FurnitureEffect } from "./effects.js";
import { resolveStuff } from "../stuff.js";

let NEXT_FURNITURE_ID = 1;

export const FurnitureKind = Object.freeze({
  GENERIC: "generic",
  DOOR: "door",
  TABLE: "table",
  SEAT: "seat",
  STORAGE: "storage",
  LIGHT: "light",
  DECOR: "decor",
});

export const FurnitureOrientation = Object.freeze({
  NONE: "none",
  NORTH_SOUTH: "north_south",
  EAST_WEST: "east_west",
  FLOOR: "floor",
});

/**
 * Base class for any stationary interactive object (doors, furniture, fixtures, etc.).
 */
export class Furniture {
  /**
   * @param {Object} params
   * @param {string} [params.id]
   * @param {FurnitureKind[keyof FurnitureKind] | string} params.kind
   * @param {string} params.name
   * @param {FurnitureOrientation[keyof FurnitureOrientation] | string} [params.orientation]
   * @param {import("../stuff.js").Stuff | string | null} [params.material]
   * @param {string[]} [params.tags]
   * @param {Record<string, any>} [params.metadata]
   */
  constructor({
    id = null,
    kind,
    name,
    orientation = FurnitureOrientation.NONE,
    material = null,
    tags = [],
    metadata = {},
  }) {
    if (!kind) {
      throw new Error("Furniture requires a kind");
    }
    const resolvedMaterial = resolveStuff(material);
    this.id = id || `furn-${NEXT_FURNITURE_ID++}`;
    this.kind = kind;
    this.name = typeof name === "string" && name.length > 0 ? name : "Furniture";
    this.orientation = orientation || FurnitureOrientation.NONE;
    this.material = resolvedMaterial ?? null;
    this.tags = new Set(Array.isArray(tags) ? tags : []);
    this.metadata = metadata && typeof metadata === "object" ? { ...metadata } : {};
    this.lightMask = Number.isFinite(this.metadata.lightMask)
      ? this.metadata.lightMask
      : LIGHT_CHANNELS.ALL;
    /** @type {Map<string, FurnitureEffect>} */
    this.effects = new Map();
  }

  /**
   * @returns {string[]}
   */
  listTags() {
    return Array.from(this.tags);
  }

  /**
   * @param {string} tag
   */
  addTag(tag) {
    if (!tag) return;
    this.tags.add(tag);
  }

  /**
   * @param {string} tag
   */
  removeTag(tag) {
    if (!tag) return;
    this.tags.delete(tag);
  }

  /**
   * @param {string} tag
   * @returns {boolean}
   */
  hasTag(tag) {
    if (!tag) return false;
    return this.tags.has(tag);
  }

  /**
   * @param {FurnitureEffect} effect
   */
  applyEffect(effect) {
    if (!(effect instanceof FurnitureEffect)) {
      throw new Error("applyEffect expects a FurnitureEffect instance");
    }
    this.effects.set(effect.id, effect);
  }

  /**
   * @param {string} id
   */
  removeEffect(id) {
    if (!id) return;
    this.effects.delete(id);
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  hasEffect(id) {
    if (!id) return false;
    return this.effects.has(id);
  }

  /**
   * @returns {FurnitureEffect[]}
   */
  listEffects() {
    return Array.from(this.effects.values());
  }

  /**
   * Copy helper used by placement logic when the same furniture template is reused.
   * @returns {Furniture}
   */
  clone(overrides = {}) {
    const { metadata: overrideMetadata, ...rest } = overrides || {};
    const copy = new Furniture({
      id: null,
      kind: this.kind,
      name: this.name,
      orientation: this.orientation,
      material: this.material,
      tags: this.listTags(),
      metadata: {
        ...(this.metadata && typeof this.metadata === "object" ? { ...this.metadata } : {}),
        ...(overrideMetadata && typeof overrideMetadata === "object"
          ? { ...overrideMetadata }
          : {}),
      },
      ...rest,
    });
    for (const eff of this.effects.values()) {
      const effectCopy = typeof eff.clone === "function"
        ? eff.clone()
        : new FurnitureEffect(eff.id, {
            tags: Array.from(eff.tags ?? []),
            data: eff.data && typeof eff.data === "object" ? { ...eff.data } : {},
            source: eff.source ?? null,
            duration: eff.duration ?? null,
            description: eff.description ?? null,
          });
      copy.applyEffect(effectCopy);
    }
    return copy;
  }
}

