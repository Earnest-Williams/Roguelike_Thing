// src/world/stuff.js
// @ts-nocheck

/**
 * Lightweight representation of "stuff" — the material that furniture or items are built from.
 * The system is intentionally metadata-heavy so that future additions (new furniture types,
 * crafting systems, etc.) can reuse it without redesigning the basics.
 */
export class Stuff {
  /**
   * @param {Object} params
   * @param {string} params.id
   * @param {string} [params.name]
   * @param {string} [params.category]
   * @param {string[]} [params.tags]
   * @param {number | null} [params.density]
   * @param {number | null} [params.hardness]
   * @param {string} [params.description]
   */
  constructor({
    id,
    name,
    category = "generic",
    tags = [],
    density = null,
    hardness = null,
    description = "",
  }) {
    if (!id || typeof id !== "string") {
      throw new Error("Stuff requires a string id");
    }
    this.id = id;
    this.name = typeof name === "string" && name.length > 0 ? name : id;
    this.category = category || "generic";
    const uniqueTags = new Set(Array.isArray(tags) ? tags : []);
    this.tags = Array.from(uniqueTags);
    this.density = Number.isFinite(density) ? density : null;
    this.hardness = Number.isFinite(hardness) ? hardness : null;
    this.description = typeof description === "string" ? description : "";
  }

  /**
   * @param {string} tag
   * @returns {boolean}
   */
  hasTag(tag) {
    if (!tag) return false;
    return this.tags.includes(tag);
  }
}

/** Simple registry to keep stuff definitions centralised. */
export class StuffRegistry {
  constructor() {
    /** @type {Map<string, Stuff>} */
    this._map = new Map();
  }

  /**
   * @param {Stuff} stuff
   * @returns {Stuff}
   */
  register(stuff) {
    if (!(stuff instanceof Stuff)) {
      throw new Error("Only Stuff instances can be registered");
    }
    this._map.set(stuff.id, stuff);
    return stuff;
  }

  /**
   * @param {string} id
   * @returns {Stuff | null}
   */
  get(id) {
    if (!id) return null;
    return this._map.get(id) || null;
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  has(id) {
    return this._map.has(id);
  }

  /**
   * @returns {Stuff[]}
   */
  list() {
    return Array.from(this._map.values());
  }

  /**
   * Pick a random Stuff entry from the registry.
   * @param {(stuff: Stuff) => boolean} [filter]
   * @param {() => number} [rng]
   * @returns {Stuff | null}
   */
  random(filter = null, rng = Math.random) {
    const entries = this.list();
    const filtered = typeof filter === "function" ? entries.filter(filter) : entries;
    if (filtered.length === 0) return null;
    const fn = typeof rng === "function" ? rng : Math.random;
    const idx = Math.floor(fn() * filtered.length);
    return filtered[Math.max(0, Math.min(filtered.length - 1, idx))] || null;
  }
}

export const StuffCatalog = new StuffRegistry();

export const STUFF = Object.freeze({
  WOOD: StuffCatalog.register(
    new Stuff({
      id: "wood",
      name: "Wood",
      category: "organic",
      tags: ["flammable", "carvable"],
      density: 0.7,
      hardness: 2,
      description: "Common timber suitable for lightweight furniture.",
    }),
  ),
  STONE: StuffCatalog.register(
    new Stuff({
      id: "stone",
      name: "Stone",
      category: "mineral",
      tags: ["durable"],
      density: 2.4,
      hardness: 7,
      description: "Worked stone blocks and slabs.",
    }),
  ),
  IRON: StuffCatalog.register(
    new Stuff({
      id: "iron",
      name: "Iron",
      category: "metal",
      tags: ["magnetic", "forgeable"],
      density: 7.8,
      hardness: 4,
      description: "Traditional wrought iron.",
    }),
  ),
  STEEL: StuffCatalog.register(
    new Stuff({
      id: "steel",
      name: "Steel",
      category: "metal",
      tags: ["forgeable", "refined"],
      density: 7.9,
      hardness: 6,
      description: "High-quality structural steel.",
    }),
  ),
  BRONZE: StuffCatalog.register(
    new Stuff({
      id: "bronze",
      name: "Bronze",
      category: "metal",
      tags: ["forgeable"],
      density: 8.8,
      hardness: 5,
      description: "Decorative but sturdy bronze alloy.",
    }),
  ),
  DARKWOOD: StuffCatalog.register(
    new Stuff({
      id: "darkwood",
      name: "Darkwood",
      category: "organic",
      tags: ["carvable", "sturdy"],
      density: 0.9,
      hardness: 3,
      description: "Dense timber favored for reinforced doors and tables.",
    }),
  ),
  MARBLE: StuffCatalog.register(
    new Stuff({
      id: "marble",
      name: "Marble",
      category: "stone",
      tags: ["polished", "decorative"],
      density: 2.7,
      hardness: 6,
      description: "Smooth marble slabs commonly used for upscale fixtures.",
    }),
  ),
  CLOTH: StuffCatalog.register(
    new Stuff({
      id: "cloth",
      name: "Cloth",
      category: "textile",
      tags: ["soft", "weavable"],
      density: 0.2,
      hardness: 1,
      description: "Layered textiles suitable for rugs, tapestries and cushions.",
    }),
  ),
  GLASS: StuffCatalog.register(
    new Stuff({
      id: "glass",
      name: "Glass",
      category: "mineral",
      tags: ["brittle", "translucent"],
      density: 2.5,
      hardness: 5,
      description: "Cast glass panes ideal for lanterns and observation grates.",
    }),
  ),
  OBSIDIAN: StuffCatalog.register(
    new Stuff({
      id: "obsidian",
      name: "Obsidian",
      category: "stone",
      tags: ["sharp", "ritual"],
      density: 2.6,
      hardness: 5,
      description: "Volcanic glass prized for arcane door inlays.",
    }),
  ),
});

/**
 * Helper that resolves arbitrary ids or Stuff instances into a Stuff entry from the catalog.
 * @param {string | Stuff | null | undefined} value
 * @returns {Stuff | null}
 */
export function resolveStuff(value) {
  if (!value) return null;
  if (value instanceof Stuff) return value;
  if (typeof value === "string") return StuffCatalog.get(value);
  return null;
}

/**
 * Weighted random selection helper.
 * @param {Array<{ id: string, weight: number }>} entries
 * @param {() => number} [rng]
 * @returns {Stuff | null}
 */
export function chooseStuffByWeight(entries, rng = Math.random) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  let total = 0;
  for (const entry of entries) {
    if (!entry || typeof entry.weight !== "number" || entry.weight <= 0) continue;
    total += entry.weight;
  }
  if (total <= 0) return null;
  const roll = (typeof rng === "function" ? rng() : Math.random()) * total;
  let cumulative = 0;
  for (const entry of entries) {
    if (!entry || typeof entry.weight !== "number" || entry.weight <= 0) continue;
    cumulative += entry.weight;
    if (roll <= cumulative) {
      const resolved = resolveStuff(entry.id);
      if (resolved) return resolved;
    }
  }
  // Fallback – return the first resolvable entry.
  for (const entry of entries) {
    const resolved = resolveStuff(entry?.id);
    if (resolved) return resolved;
  }
  return null;
}

