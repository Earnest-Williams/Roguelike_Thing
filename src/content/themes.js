// src/content/themes.js
// @ts-check

/**
 * @typedef {Object} ChapterTheme
 * @property {string} id
 * @property {string} name
 * @property {{ id: string, title: string, description?: string, tags?: string[], mobTagWeights?: Record<string, number>, affixTagWeights?: Record<string, number>, baseBudget?: number, perLevelBudget?: number, culmination?: { name?: string, description?: string, tags?: string[] } }} descriptor
 * @property {Array<{ id: string, title: string, description?: string, tags?: string[], mobTagWeights?: Record<string, number>, affixTagWeights?: Record<string, number>, budgetBonus?: number, perLevelBonus?: number }>} mechanics
 * @property {string[]} tags
 * @property {Record<string, number>} mobTagWeights
 * @property {Record<string, number>} affixTagWeights
 * @property {number} baseBudget
 * @property {number} perLevelBudget
 * @property {{ name: string, description: string, tags: string[] }} culmination
 */

/**
 * Descriptor components describe the overarching flavor of a chapter. Each
 * entry contributes weighted tags and budget baselines that the theme builder
 * combines with a set of mechanics.
 */
export const DESCRIPTORS = [
  {
    id: "ashen_catacombs",
    title: "Ashen Catacombs",
    description: "Smoldering ossuaries where the dead burn but never rest.",
    tags: ["fire", "undead", "ruins"],
    mobTagWeights: { undead: 1.6, fire: 1.25, guardian: 1.1 },
    affixTagWeights: { fire: 1.5, burn: 1.2, elemental: 1.1 },
    baseBudget: 36,
    perLevelBudget: 8,
    culmination: {
      name: "Ember Reliquary",
      description: "A vault of charred relics sealed in ritual flame.",
      tags: ["fire", "undead", "vault"],
    },
  },
  {
    id: "sunken_galleries",
    title: "Sunken Galleries",
    description: "Flooded halls swallowed by the tides and reclaimed by kelp.",
    tags: ["water", "ancient", "depths"],
    mobTagWeights: { aquatic: 1.4, humanoid: 1.1, caster: 1.05 },
    affixTagWeights: { water: 1.45, control: 1.15, sustain: 1.05 },
    baseBudget: 32,
    perLevelBudget: 7,
    culmination: {
      name: "Tidal Vault",
      description: "A pressure-locked sanctum humming with abyssal song.",
      tags: ["water", "pressure", "vault"],
    },
  },
  {
    id: "shattered_bastion",
    title: "Shattered Bastion",
    description: "Ruined ramparts where spectral sentinels patrol crumbling walls.",
    tags: ["order", "ruin", "guardian"],
    mobTagWeights: { guardian: 1.5, construct: 1.2, humanoid: 1.05 },
    affixTagWeights: { polarity: 1.4, defense: 1.2, stamina: 1.1 },
    baseBudget: 38,
    perLevelBudget: 9,
    culmination: {
      name: "Aegis Vault",
      description: "A luminous ward storing vows carved in stone and light.",
      tags: ["order", "ward", "vault"],
    },
  },
];

/**
 * Mechanic components add twists to the base descriptor and can stack together
 * to form the final theme.
 */
export const MECHANICS = [
  {
    id: "pyre_cult",
    title: "Pyre Cult",
    description: "Fanatics kindle braziers to empower fire rites.",
    tags: ["fire", "humanoid", "ritual"],
    mobTagWeights: { humanoid: 1.2, caster: 1.25, fire: 1.15 },
    affixTagWeights: { fire: 1.3, elemental: 1.1 },
    budgetBonus: 6,
    perLevelBonus: 3,
  },
  {
    id: "tidal_surge",
    title: "Tidal Surge",
    description: "Currents sweep through the halls, empowering fluid tactics.",
    tags: ["water", "mobility", "hazard"],
    mobTagWeights: { aquatic: 1.25, mobility: 1.15 },
    affixTagWeights: { water: 1.25, mobility: 1.2 },
    budgetBonus: 5,
    perLevelBonus: 2,
  },
  {
    id: "bone_legion",
    title: "Bone Legion",
    description: "An army of skeletal wardens drilled for relentless assault.",
    tags: ["undead", "melee", "guardian"],
    mobTagWeights: { undead: 1.35, melee: 1.2 },
    affixTagWeights: { endurance: 1.1, stamina: 1.2 },
    budgetBonus: 7,
    perLevelBonus: 3,
  },
  {
    id: "temporal_echo",
    title: "Temporal Echo",
    description: "Fragments of time distort initiative and reflexes.",
    tags: ["tempo", "arcane", "anomaly"],
    mobTagWeights: { caster: 1.15, temporal: 1.25 },
    affixTagWeights: { tempo: 1.35, cooldown: 1.2 },
    budgetBonus: 8,
    perLevelBonus: 4,
  },
];

function pickOne(list, rng) {
  if (!Array.isArray(list) || list.length === 0) {
    return null;
  }
  const roll = Math.floor((typeof rng === "function" ? rng() : Math.random()) * list.length);
  return list[Math.max(0, Math.min(list.length - 1, roll))];
}

function pickDistinct(list, count, rng) {
  if (!Array.isArray(list) || list.length === 0 || count <= 0) {
    return [];
  }
  const pool = list.slice();
  const picks = [];
  while (pool.length > 0 && picks.length < count) {
    const idx = Math.floor((typeof rng === "function" ? rng() : Math.random()) * pool.length);
    picks.push(pool.splice(idx, 1)[0]);
  }
  return picks;
}

function mergeWeights(...sources) {
  /** @type {Record<string, number>} */
  const merged = {};
  for (const source of sources) {
    if (!source) continue;
    for (const [tag, value] of Object.entries(source)) {
      if (!Number.isFinite(value)) continue;
      const current = merged[tag] ?? 1;
      merged[tag] = current * value;
    }
  }
  return merged;
}

function collectTags(...groups) {
  const set = new Set();
  for (const group of groups) {
    if (!group) continue;
    for (const tag of group) {
      if (typeof tag === "string" && tag.length > 0) {
        set.add(tag);
      }
    }
  }
  return Array.from(set);
}

/**
 * Build a complete procedural theme by combining a descriptor with a handful
 * of mechanics.
 * @param {() => number} [rng]
 * @returns {ChapterTheme}
 */
export function generateDungeonTheme(rng = Math.random) {
  const descriptor = pickOne(DESCRIPTORS, rng) || DESCRIPTORS[0];
  const mechanics = pickDistinct(MECHANICS, 2, rng);
  const tags = collectTags(
    descriptor.tags,
    ...mechanics.map((m) => m.tags || []),
  );
  const mobTagWeights = mergeWeights(
    descriptor.mobTagWeights,
    ...mechanics.map((m) => m.mobTagWeights || {}),
  );
  const affixTagWeights = mergeWeights(
    descriptor.affixTagWeights,
    ...mechanics.map((m) => m.affixTagWeights || {}),
  );
  const baseBudget =
    Number(descriptor.baseBudget || 0) +
    mechanics.reduce((sum, mech) => sum + Number(mech.budgetBonus || 0), 0);
  const perLevelBudget =
    Number(descriptor.perLevelBudget || 0) +
    mechanics.reduce((sum, mech) => sum + Number(mech.perLevelBonus || 0), 0);

  const nameSuffix = mechanics.map((m) => m.title).join(" & ");
  const name = nameSuffix ? `${descriptor.title}: ${nameSuffix}` : descriptor.title;

  return {
    id: [descriptor.id].concat(mechanics.map((m) => m.id)).join(":"),
    name,
    descriptor,
    mechanics,
    tags,
    mobTagWeights,
    affixTagWeights,
    baseBudget,
    perLevelBudget,
    culmination: {
      name: descriptor.culmination?.name || `${descriptor.title} Vault`,
      description:
        descriptor.culmination?.description ||
        `A vault steeped in the themes of ${descriptor.title.toLowerCase()}.`,
      tags: collectTags(
        descriptor.culmination?.tags || [],
        descriptor.tags || [],
      ),
    },
  };
}

