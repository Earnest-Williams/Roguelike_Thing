// src/content/themes.js
// @ts-check

const DEFAULT_LEVEL_COUNT = 3;

export const DESCRIPTORS = [
  {
    id: "ashen_catacombs",
    name: "Ashen Catacombs",
    description: "Collapsed burial chambers wreathed in smoldering embers and bone dust.",
    weight: 3,
    levels: 3,
    baseBudget: 24,
    budgetPerLevel: 6,
    depthMultiplier: 0.05,
    mobTags: ["undead", "bone", "fire"],
    affixTags: ["fire", "burn", "shadow"],
    mobWeights: { undead: 3, bone: 2, fire: 1 },
    affixWeights: { fire: 2, burn: 1, shadow: 1 },
    culmination: {
      name: "Reliquary of Cinders",
      description: "An ossuary vault sealed behind a barricade of ash and soul-flames.",
      tags: ["undead", "fire"],
    },
  },
  {
    id: "sunken_hollows",
    name: "Sunken Hollows",
    description: "Flooded tunnels where moss-choked ruins echo with distant waves.",
    weight: 2,
    levels: 4,
    baseBudget: 22,
    budgetPerLevel: 5,
    depthMultiplier: 0.04,
    mobTags: ["aquatic", "slime", "ancient"],
    affixTags: ["water", "acid", "control"],
    mobWeights: { aquatic: 3, slime: 1, ancient: 1 },
    affixWeights: { water: 2, acid: 1, control: 1 },
    culmination: {
      name: "Drowned Reliquary",
      description: "A tidal vault guarded by barnacled idols.",
      tags: ["water", "ancient"],
    },
  },
  {
    id: "arcane_spire",
    name: "Arcane Spire",
    description: "A spiraling tower humming with unstable magical experiments.",
    weight: 2,
    levels: 3,
    baseBudget: 26,
    budgetPerLevel: 7,
    depthMultiplier: 0.06,
    mobTags: ["construct", "arcane", "humanoid"],
    affixTags: ["arcane", "mana", "lightning"],
    mobWeights: { construct: 2, arcane: 2, humanoid: 1 },
    affixWeights: { arcane: 2, mana: 1, lightning: 1 },
    culmination: {
      name: "Resonant Focus",
      description: "A chamber containing a crystalline heart amplifying errant spells.",
      tags: ["arcane", "ritual"],
    },
  },
];

export const MECHANICS = [
  {
    id: "haunting_resurgence",
    name: "of Haunting Resurgence",
    description: "Restless spirits periodically claw their way back into the fray.",
    weight: 3,
    mobTags: ["undead", "spectral"],
    affixTags: ["spirit", "curse"],
    mobWeights: { undead: 2, spectral: 2 },
    affixWeights: { spirit: 2, curse: 2 },
    budgetModifier: 4,
    budgetPerLevel: 3,
    depthMultiplier: 0.02,
    finalLevelBonus: 6,
    culmination: {
      name: "Soul-Echo Reliquary",
      description: "A vault echoing with imprisoned spirits eager for release.",
      tags: ["spirit", "haunted"],
    },
  },
  {
    id: "storm_wracked",
    name: "of Storm Wracked Wards",
    description: "Erratic lightning surges empower denizens attuned to the storm.",
    weight: 2,
    mobTags: ["elemental", "storm"],
    affixTags: ["lightning", "tempo"],
    mobWeights: { elemental: 2, storm: 3 },
    affixWeights: { lightning: 3, tempo: 1 },
    budgetModifier: 5,
    budgetPerLevel: 4,
    depthMultiplier: 0.04,
    finalLevelBonus: 4,
    culmination: {
      name: "Stormheart Vault",
      description: "A sealed ward filled with arcing coils and stormglass prisms.",
      tags: ["lightning", "ritual"],
    },
  },
  {
    id: "ritual_convergence",
    name: "of Ritual Convergence",
    description: "Cultists assemble elaborate rites, bolstering summoned allies.",
    weight: 2,
    mobTags: ["cultist", "summoner"],
    affixTags: ["summoning", "support"],
    mobWeights: { cultist: 2, summoner: 2 },
    affixWeights: { summoning: 2, support: 2 },
    budgetModifier: 3,
    budgetPerLevel: 5,
    depthMultiplier: 0.03,
    finalLevelBonus: 8,
    culmination: {
      name: "Grand Convergence",
      description: "A vault arranged as a summoning locus ready to unleash a guardian.",
      tags: ["summoning", "ritual"],
    },
  },
];

function pickWeighted(list, rng) {
  const total = list.reduce((sum, entry) => sum + (entry.weight || 1), 0) || 1;
  let roll = Math.floor(rng() * total);
  for (const entry of list) {
    roll -= entry.weight || 1;
    if (roll < 0) return entry;
  }
  return list[0];
}

function mergeWeightMaps(base = {}, extra = {}) {
  const out = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    if (!Number.isFinite(value)) continue;
    out[key] = (out[key] || 0) + value;
  }
  return out;
}

function uniqueTags(list = []) {
  const seen = new Set();
  const out = [];
  for (const tag of list) {
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

/**
 * @param {() => number} [rng]
 */
export function generateDungeonTheme(rng = Math.random) {
  const picker = typeof rng === "function" ? rng : Math.random;
  const descriptor = pickWeighted(DESCRIPTORS, picker);
  const mechanic = pickWeighted(MECHANICS, picker);

  const totalLevels = Math.max(
    1,
    Math.round(mechanic.levelsOverride || descriptor.levels || DEFAULT_LEVEL_COUNT),
  );

  const baseBudget = Math.max(
    0,
    Math.round((descriptor.baseBudget || 0) + (mechanic.budgetModifier || 0)),
  );
  const perLevel = Math.max(
    0,
    Math.round((descriptor.budgetPerLevel || 0) + (mechanic.budgetPerLevel || 0)),
  );
  const depthMultiplier = Math.max(
    0,
    Number(descriptor.depthMultiplier || 0) + Number(mechanic.depthMultiplier || 0),
  );
  const bonusFinal = Math.max(
    0,
    Math.round((descriptor.finalLevelBonus || 0) + (mechanic.finalLevelBonus || 0)),
  );

  const tags = {
    mobs: uniqueTags([...(descriptor.mobTags || []), ...(mechanic.mobTags || [])]),
    affixes: uniqueTags([...(descriptor.affixTags || []), ...(mechanic.affixTags || [])]),
  };

  const weights = {
    mobTags: mergeWeightMaps(descriptor.mobWeights, mechanic.mobWeights),
    affixTags: mergeWeightMaps(descriptor.affixWeights, mechanic.affixWeights),
  };

  let culmination = mechanic.culmination || descriptor.culmination || null;
  if (culmination) {
    culmination = {
      name: culmination.name || "Chapter Culmination",
      description: culmination.description || "",
      tags: uniqueTags([...(culmination.tags || []), ...tags.mobs, "vault"]),
    };
  }

  return {
    id: `${descriptor.id}:${mechanic.id}`,
    name: `${descriptor.name} ${mechanic.name}`,
    descriptor,
    mechanic,
    totalLevels,
    tags,
    weights,
    budget: {
      base: baseBudget,
      perLevel,
      depthMultiplier,
      bonusFinal,
    },
    culmination,
  };
}

export function debugGenerateThemes(count = 5, rng = Math.random) {
  const themes = [];
  for (let i = 0; i < count; i += 1) {
    themes.push(generateDungeonTheme(rng));
  }
  return themes;
}
