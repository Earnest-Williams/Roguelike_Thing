// src/content/themes.js
// @ts-check

// Default fallback for how many dungeon levels a theme should create when
// depth-specific data does not increase the count.
const DEFAULT_LEVEL_COUNT = 3;

// Theme descriptors establish the broad fantasy of a dungeon. Each entry is a
// weighted option with tags and optional budget modifiers that influence later
// generation stages.
export const DESCRIPTORS = [
  { id: "ashen_catacombs", type: "descriptor", tags: ["undead", "bone", "ember"], weight: 8 },
  { id: "sunken_ruins", type: "descriptor", tags: ["aquatic", "moss", "ancient"], weight: 6 },
  { id: "arcane_spire", type: "descriptor", tags: ["arcane", "construct", "sigil"], weight: 5 },
  { id: "crystalline_wastes", type: "descriptor", tags: ["crystal", "frigid", "reflective"], weight: 4 },
  { id: "fungal_wilds", type: "descriptor", tags: ["fungal", "spore", "feral"], weight: 7 },
  { id: "goblin_redoubts", type: "descriptor", tags: ["goblin", "scrap", "trap"], weight: 5, budgetModifier: 2 },
];

// Mechanics apply gameplay twists to a descriptor. We pick from this list with
// weights and may use the optional budgetModifier values to scale difficulty.
export const MECHANICS = [
  { id: "haunting_resurgence", type: "mechanic", tags: ["spectral", "curse", "echo"], weight: 7, budgetModifier: 4 },
  { id: "storm_wracked", type: "mechanic", tags: ["lightning", "tempo", "charged"], weight: 6, budgetModifier: 5 },
  { id: "ritual_convergence", type: "mechanic", tags: ["summoning", "support", "ritual"], weight: 5, budgetModifier: 3 },
  { id: "infernal_pressure", type: "mechanic", tags: ["fire", "pressure", "rage"], weight: 6, budgetModifier: 6 },
  { id: "temporal_echoes", type: "mechanic", tags: ["temporal", "echo", "paradox"], weight: 3, budgetModifier: 8 },
  { id: "toxic_bloom", type: "mechanic", tags: ["poison", "blight", "growth"], weight: 4 },
];

export const ROLE_OVERLAYS = Object.freeze([
  Object.freeze({
    id: "role_vanguard_captain",
    label: "Vanguard Captain",
    tags: ["undead", "bone", "frontline"],
    weight: 4,
    includeTags: Object.freeze(["undead", "bone"]),
    excludeTags: Object.freeze(["construct"]),
    roleIds: Object.freeze(["role_vanguard_captain"]),
    notes: "Turns a base creature into a shield-bearing frontliner for ember-soaked catacombs.",
  }),
  Object.freeze({
    id: "role_ritual_chorus",
    label: "Ritual Chorus",
    tags: ["arcane", "construct", "support"],
    weight: 3,
    includeTags: Object.freeze(["arcane", "construct", "ritual"]),
    roleIds: Object.freeze(["role_ritual_chorus"]),
    notes: "Adds support-focused spellcasters that reinforce ritual-heavy mechanics.",
  }),
  Object.freeze({
    id: "role_skirmisher_pack",
    label: "Skirmisher Pack",
    tags: ["goblin", "scrap", "tempo"],
    weight: 5,
    includeTags: Object.freeze(["goblin", "melee", "tempo"]),
    roleIds: Object.freeze(["role_skirmisher_pack"]),
    notes: "Leans into mobile harassment units for trap-laden goblin redoubts.",
  }),
]);

// Choose a single element from a weighted list using the provided RNG. We fall
// back to the first element so that generation always returns a value even if
// the math encounters an edge case.
function pickWeighted(list, rng) {
  const total = list.reduce((sum, entry) => sum + (entry.weight || 1), 0) || 1;
  let roll = Math.floor(rng() * total);
  for (const entry of list) {
    roll -= entry.weight || 1;
    if (roll < 0) return entry;
  }
  return list[0];
}

// Deduplicate tag lists while preserving the original ordering of the first
// occurrence of each tag. This keeps later descriptions stable between runs.
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

// Convert stored identifier strings (often snake_case) into a display ready
// label such as "Fungal Wilds" for use in UI copy.
function formatComponentName(id) {
  return String(id || "")
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// Select one or more mechanics depending on the depth. Deeper dungeons get
// two mechanics to reinforce complexity while shallower ones receive just one.
// We also prevent duplicate mechanics by removing choices from the pool.
function pickMechanicsForDepth(depth, rng) {
  const mechanicCount = depth >= 5 ? 2 : 1;
  const mechanics = [];
  const pool = [...MECHANICS];
  for (let i = 0; i < mechanicCount && pool.length > 0; i += 1) {
    const choice = pickWeighted(pool, rng);
    mechanics.push(choice);
    const index = pool.findIndex((entry) => entry.id === choice.id);
    if (index >= 0) pool.splice(index, 1);
  }
  if (mechanics.length === 0 && MECHANICS.length > 0) {
    mechanics.push(MECHANICS[0]);
  }
  return mechanics;
}

// Translate dungeon depth and component modifiers into numbers used by the
// encounter builder. The curve tracks the starting budget, how it grows per
// level, scaling modifiers, and an end-of-dungeon bonus.
function buildPowerBudgetCurve(depth, components) {
  const depthLevel = Math.max(0, Math.floor(depth));
  const modifier = components.reduce((sum, component) => sum + (component.budgetModifier || 0), 0);
  const baseStart = 18 + depthLevel * 2;
  const start = Math.max(10, baseStart + modifier);
  const perLevel = Math.max(4, 4 + Math.floor(depthLevel / 2) + Math.floor(modifier / 3));
  const depthScaling = Number((0.02 + depthLevel * 0.005 + modifier * 0.001).toFixed(3));
  const finalBonus = Math.max(0, 6 + Math.floor(depthLevel / 2) + modifier);
  return { start, perLevel, depthScaling, finalBonus };
}

// Convert a list of tags into a frequency map. These weights are later used by
// other systems to bias selections toward the dominant theme elements.
function buildWeightsFromTags(tags) {
  const weights = {};
  for (const tag of tags) {
    if (!tag) continue;
    weights[tag] = (weights[tag] || 0) + 1;
  }
  return weights;
}

// Gather all tags from the chosen descriptor and mechanics while ensuring the
// list only contains unique values.
function collectComponentTags(components) {
  return uniqueTags(
    components.flatMap((component) => Array.isArray(component.tags) ? component.tags : []),
  );
}

// Craft the final dungeon event description that ties descriptors and
// mechanics together. This creates a narrative capstone for the generated
// theme, combining names, descriptions, and accumulated tags.
function buildCulminationEvent(descriptor, mechanics, tags) {
  const mechanicNames = mechanics.map((m) => formatComponentName(m.id));
  const mechanicLabel = mechanicNames.length > 0 ? mechanicNames.join(" & ") : "Unknown";
  const name = `${mechanicLabel} Nexus`;
  const description = `An apex chamber where ${
    formatComponentName(descriptor.id)
  } forces intertwine with ${mechanicNames.length > 0 ? mechanicNames.join(" and ") : "unstable"} energies.`;
  const culminationTags = uniqueTags([
    ...tags,
    ...descriptor.tags,
    ...mechanics.flatMap((m) => m.tags || []),
    "culmination",
  ]);
  return {
    id: `culmination:${descriptor.id}:${mechanics.map((m) => m.id).join(":")}`,
    name,
    description,
    tags: culminationTags,
  };
}

function cloneOverlay(overlay) {
  if (!overlay) return null;
  try {
    return JSON.parse(JSON.stringify(overlay));
  } catch {
    return { ...overlay };
  }
}

function computeOverlayWeight(overlay, weightMap = {}) {
  let weight = Number.isFinite(overlay?.weight) ? Number(overlay.weight) : 1;
  if (Array.isArray(overlay?.tags)) {
    for (const tag of overlay.tags) {
      const bonus = Number(weightMap?.[tag] || 0);
      if (Number.isFinite(bonus)) {
        weight += bonus;
      }
    }
  }
  return Math.max(1, Math.floor(weight));
}

function pickRoleOverlayFromWeights(weightMap = {}, rng = Math.random) {
  if (!Array.isArray(ROLE_OVERLAYS) || ROLE_OVERLAYS.length === 0) return null;
  const pool = ROLE_OVERLAYS.map((overlay) => ({
    ...overlay,
    weight: computeOverlayWeight(overlay, weightMap),
  }));
  const picked = pickWeighted(pool, rng);
  if (!picked) {
    return ROLE_OVERLAYS[0] ? { ...ROLE_OVERLAYS[0] } : null;
  }
  const { weight, ...rest } = picked;
  return rest;
}

function shortlistRoleOverlays(weightMap = {}) {
  if (!Array.isArray(ROLE_OVERLAYS) || ROLE_OVERLAYS.length === 0) return [];
  return ROLE_OVERLAYS.map((overlay) => ({
    ...overlay,
    weight: computeOverlayWeight(overlay, weightMap),
  }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);
}

/**
 * @param {number} [dungeonDepth]
 * @param {() => number} [rng]
 */
export function generateDungeonTheme(dungeonDepth = 0, rng = Math.random) {
  // Pick core components for the theme: one descriptor plus depth-scaled
  // mechanics. The RNG may be user supplied for deterministic generation.
  const picker = typeof rng === "function" ? rng : Math.random;
  const descriptor = pickWeighted(DESCRIPTORS, picker);
  const mechanics = pickMechanicsForDepth(dungeonDepth, picker);

  const components = [descriptor, ...mechanics];
  const componentTags = collectComponentTags(components);

  // Monster and affix tags start the same but are separated in case later
  // systems want to mutate them independently.
  const monsterTags = [...componentTags];
  const affixTags = [...componentTags];
  const weights = {
    mobTags: buildWeightsFromTags(monsterTags),
    affixTags: buildWeightsFromTags(affixTags),
  };

  // Depth increases level count and extra mechanics add more stages to explore.
  const totalLevels = Math.max(
    1,
    DEFAULT_LEVEL_COUNT + Math.floor(Math.max(0, dungeonDepth) / 2) + (mechanics.length - 1),
  );

  // Build supporting metadata for downstream systems like encounter or loot
  // generators.
  const powerBudgetCurve = buildPowerBudgetCurve(dungeonDepth, components);
  const idComponents = [descriptor.id, ...mechanics.map((m) => m.id)];
  const id = idComponents.join("__");
  const mechanicNamesForName = mechanics.length > 0
    ? mechanics.map((mechanic) => formatComponentName(mechanic.id))
    : ["Unknown"];
  const name = `${formatComponentName(descriptor.id)} with ${mechanicNamesForName.join(" & ")}`;
  const culminationEvent = buildCulminationEvent(descriptor, mechanics, componentTags);
  const roleOverlay = cloneOverlay(pickRoleOverlayFromWeights(weights.mobTags, picker));
  const roleOverlayCandidates = shortlistRoleOverlays(weights.mobTags).map(cloneOverlay);

  return {
    id,
    name,
    components: { descriptor, mechanics },
    totalLevels,
    monsterTags,
    affixTags,
    weights,
    powerBudgetCurve,
    culminationEvent,
    roleOverlay,
    roleOverlayCandidates,
  };
}

// Helper for quick manual inspection or testing; generates multiple themes at
// once using the same configuration options as the main generator.
export function debugGenerateThemes(count = 5, depth = 0, rng = Math.random) {
  const themes = [];
  for (let i = 0; i < count; i += 1) {
    themes.push(generateDungeonTheme(depth, rng));
  }
  return themes;
}
