// src/world/furniture/door.js
// @ts-check

import { Furniture, FurnitureKind, FurnitureOrientation } from "./furniture.js";
import { FurnitureEffect, FURNITURE_EFFECT_IDS } from "./effects.js";
import { resolveStuff } from "../stuff.js";

export const DOOR_TYPE = Object.freeze({
  HINGED: "hinged",
  PORTCULLIS: "portcullis",
  ARCHWAY: "archway",
  SECRET: "secret",
  SLIDING: "sliding",
  DOUBLE: "double",
  GRATE: "grate",
});

export const DOOR_STATE = Object.freeze({
  OPEN: "open",
  CLOSED: "closed",
  BLOCKED: "blocked",
});

export const DOOR_VARIANT_IDS = Object.freeze({
  STANDARD: "standard",
  REINFORCED: "reinforced",
  DOUBLE: "double",
  PORTCULLIS: "portcullis",
  SLIDING: "sliding",
  ARCHWAY: "archway",
  SECRET: "secret",
  GRATE: "grate",
  RUNED: "runed",
});

const DOOR_STATES = new Set(Object.values(DOOR_STATE));

function normalizeDoorState(value) {
  if (typeof value !== "string") {
    return DOOR_STATE.CLOSED;
  }
  if (DOOR_STATES.has(value)) {
    return value;
  }
  const lower = value.toLowerCase();
  if (DOOR_STATES.has(lower)) {
    return lower;
  }
  return DOOR_STATE.CLOSED;
}

function deriveDoorName(type, material, variantId) {
  const materialName = material?.name || "";
  const base = (() => {
    switch (type) {
      case DOOR_TYPE.PORTCULLIS:
        return "Portcullis";
      case DOOR_TYPE.ARCHWAY:
        return "Archway";
      case DOOR_TYPE.SECRET:
        return "Secret Door";
      case DOOR_TYPE.SLIDING:
        return "Sliding Door";
      case DOOR_TYPE.DOUBLE:
        return "Double Door";
      case DOOR_TYPE.GRATE:
        return "Grate";
      case DOOR_TYPE.HINGED:
      default:
        return "Door";
    }
  })();
  const variant = variantId && variantId !== DOOR_VARIANT_IDS.STANDARD ? variantId.replace(/_/g, " ") : "";
  const pieces = [materialName, variant, base].filter((s) => typeof s === "string" && s.trim().length > 0);
  if (pieces.length === 0) return base;
  return pieces.join(" ");
}

/**
 * Represents a single door instance within the dungeon.
 */
export class Door extends Furniture {
  /**
   * @param {Object} params
   * @param {string} [params.id]
   * @param {string} [params.variantId]
   * @param {DOOR_TYPE[keyof DOOR_TYPE] | string} [params.type]
   * @param {DOOR_STATE[keyof DOOR_STATE] | string} [params.state]
   * @param {FurnitureOrientation[keyof FurnitureOrientation] | string} [params.orientation]
   * @param {import("../stuff.js").Stuff | string | null} [params.material]
   * @param {string[]} [params.tags]
   * @param {Record<string, any>} [params.metadata]
   * @param {string} [params.name]
   */
  constructor({
    id = null,
    variantId = DOOR_VARIANT_IDS.STANDARD,
    type = DOOR_TYPE.HINGED,
    state = DOOR_STATE.CLOSED,
    orientation = FurnitureOrientation.EAST_WEST,
    material = null,
    tags = [],
    metadata = {},
    name,
  } = {}) {
    const resolvedMaterial = resolveStuff(material);
    const normalizedState = normalizeDoorState(state);
    super({
      id,
      kind: FurnitureKind.DOOR,
      name: name || deriveDoorName(type, resolvedMaterial, variantId),
      orientation,
      material: resolvedMaterial,
      tags: Array.from(
        new Set(["door", variantId, type, ...(Array.isArray(tags) ? tags : [])]),
      ),
      metadata: { ...metadata, variantId, type, state: normalizedState },
    });
    this.type = type;
    this.state = normalizedState;
    this.variantId = variantId;
    this._syncMetadataState();
  }

  /**
   * @returns {boolean}
   */
  isOpen() {
    return this.state === DOOR_STATE.OPEN;
  }

  /**
   * @returns {boolean}
   */
  isPassable() {
    if (this.state === DOOR_STATE.OPEN) return true;
    if (this.hasEffect(FURNITURE_EFFECT_IDS.BROKEN)) return true;
    return false;
  }

  open() {
    const previous = this.state;
    this.state = DOOR_STATE.OPEN;
    if (previous !== DOOR_STATE.OPEN) {
      this.removeEffect(FURNITURE_EFFECT_IDS.JAMMED);
      this.removeEffect(FURNITURE_EFFECT_IDS.LOCKED);
    }
    this._syncMetadataState();
  }

  close() {
    this.state = DOOR_STATE.CLOSED;
    this._syncMetadataState();
  }

  /**
   * @param {FurnitureEffect} effect
   */
  applyEffect(effect) {
    super.applyEffect(effect);
    if (effect.id === FURNITURE_EFFECT_IDS.BROKEN) {
      this.state = DOOR_STATE.OPEN;
    }
    if (effect.id === FURNITURE_EFFECT_IDS.JAMMED) {
      if (this.state === DOOR_STATE.OPEN) {
        this.state = DOOR_STATE.BLOCKED;
      }
    }
    this._syncMetadataState();
  }

  _syncMetadataState() {
    if (this.metadata && typeof this.metadata === "object") {
      this.metadata.state = this.state;
    }
  }

  /**
   * Create a structural copy of the door instance, including effect metadata.
   * @returns {Door}
   */
  clone(overrides = {}) {
    const { metadata: overrideMetadata, ...rest } = overrides || {};
    const copy = new Door({
      id: null,
      variantId: this.variantId,
      type: this.type,
      state: this.state,
      orientation: this.orientation,
      material: this.material,
      tags: this.listTags(),
      metadata: {
        ...(this.metadata && typeof this.metadata === "object" ? { ...this.metadata } : {}),
        ...(overrideMetadata && typeof overrideMetadata === "object"
          ? { ...overrideMetadata }
          : {}),
      },
      name: this.name,
      ...rest,
    });
    for (const effect of this.listEffects()) {
      const effectCopy = typeof effect.clone === "function"
        ? effect.clone()
        : new FurnitureEffect(effect.id, {
            tags: Array.from(effect.tags ?? []),
            data: effect.data && typeof effect.data === "object" ? { ...effect.data } : {},
            source: effect.source ?? null,
            duration: effect.duration ?? null,
            description: effect.description ?? null,
          });
      copy.applyEffect(effectCopy);
    }
    return copy;
  }
}

