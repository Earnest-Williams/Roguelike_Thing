// src/world/furniture/effects.js
// @ts-nocheck

export const FURNITURE_EFFECT_IDS = Object.freeze({
  LOCKED: "locked",
  JAMMED: "jammed",
  BROKEN: "broken",
  MAGIC_SEAL: "magic_seal",
  MAGIC_AURA: "magic_aura",
});

/**
 * Encapsulates a status/effect applied to furniture (doors, chests, future desks, etc.).
 */
export class FurnitureEffect {
  /**
   * @param {string} id
   * @param {Object} [options]
   * @param {string[]} [options.tags]
   * @param {Record<string, any>} [options.data]
   * @param {string | null} [options.source]
   * @param {number | null} [options.duration]
   * @param {string | null} [options.description]
   */
  constructor(
    id,
    { tags = [], data = {}, source = null, duration = null, description = null } = {},
  ) {
    if (!id || typeof id !== "string") {
      throw new Error("FurnitureEffect requires an id");
    }
    this.id = id;
    this.tags = new Set(Array.isArray(tags) ? tags : []);
    this.data = data && typeof data === "object" ? { ...data } : {};
    this.source = source ?? null;
    this.duration = Number.isFinite(duration) ? Number(duration) : null;
    this.description = typeof description === "string" ? description : null;
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
   * Create a deep copy of the effect so cloned furniture keeps independent metadata.
   * @returns {FurnitureEffect}
   */
  clone() {
    return new FurnitureEffect(this.id, {
      tags: Array.from(this.tags),
      data: this.data && typeof this.data === "object" ? { ...this.data } : {},
      source: this.source ?? null,
      duration: this.duration ?? null,
      description: this.description ?? null,
    });
  }
}

