// src/content/themes.js
// @ts-check

const DEFAULT_LEVEL_COUNT = 3;

export const DESCRIPTORS = [
  { id: "ashen_catacombs", type: "descriptor", tags: ["undead", "bone", "ember"], weight: 8 },
  { id: "sunken_ruins", type: "descriptor", tags: ["aquatic", "moss", "ancient"], weight: 6 },
  { id: "arcane_spire", type: "descriptor", tags: ["arcane", "construct", "sigil"], weight: 5 },
  { id: "crystalline_wastes", type: "descriptor", tags: ["crystal", "frigid", "reflective"], weight: 4 },
  { id: "fungal_wilds", type: "descriptor", tags: ["fungal", "spore", "feral"], weight: 7 },
  { id: "goblin_redoubts", type: "descriptor", tags: ["goblin", "scrap", "trap"], weight: 5, budgetModifier: 2 },
];

export const MECHANICS = [
  { id: "haunting_resurgence", type: "mechanic", tags: ["spectral", "curse", "echo"], weight: 7, budgetModifier: 4 },
  { id: "storm_wracked", type: "mechanic", tags: ["lightning", "tempo", "charged"], weight: 6, budgetModifier: 5 },
  { id: "ritual_convergence", type: "mechanic", tags: ["summoning", "support", "ritual"], weight: 5, budgetModifier: 3 },
  { id: "infernal_pressure", type: "mechanic", tags: ["fire", "pressure", "rage"], weight: 6, budgetModifier: 6 },
  { id: "temporal_echoes", type: "mechanic", tags: ["temporal", "echo", "paradox"], weight: 3, budgetModifier: 8 },
  { id: "toxic_bloom", type: "mechanic", tags: ["poison", "blight", "growth"], weight: 4 },
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

function formatComponentName(id) {
  return String(id || "")
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

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

function buildWeightsFromTags(tags) {
  const weights = {};
  for (const tag of tags) {
    if (!tag) continue;
    weights[tag] = (weights[tag] || 0) + 1;
  }
  return weights;
}

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

/**
 * @param {number} [dungeonDepth]
 * @param {() => number} [rng]
 */
export function generateDungeonTheme(dungeonDepth = 0, rng = Math.random) {
  const picker = typeof rng === "function" ? rng : Math.random;
  const descriptor = pickWeighted(DESCRIPTORS, picker);
  const mechanics = pickMechanicsForDepth(dungeonDepth, picker);

  const componentTags = uniqueTags([
    ...descriptor.tags,
    ...mechanics.flatMap((mechanic) => mechanic.tags || []),
  ]);

  const monsterTags = [...componentTags];
  const affixTags = [...componentTags];
  const weights = {
    mobTags: buildWeightsFromTags(monsterTags),
    affixTags: buildWeightsFromTags(affixTags),
  };

  const totalLevels = Math.max(
    1,
    DEFAULT_LEVEL_COUNT + Math.floor(Math.max(0, dungeonDepth) / 2) + (mechanics.length - 1),
  );

  const powerBudgetCurve = buildPowerBudgetCurve(dungeonDepth, [descriptor, ...mechanics]);
  const idComponents = [descriptor.id, ...mechanics.map((m) => m.id)];
  const id = idComponents.join("__");
  const mechanicNamesForName = mechanics.length > 0
    ? mechanics.map((mechanic) => formatComponentName(mechanic.id))
    : ["Unknown"];
  const name = `${formatComponentName(descriptor.id)} with ${mechanicNamesForName.join(" & ")}`;
  const culminationEvent = buildCulminationEvent(descriptor, mechanics, componentTags);

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
  };
}

export function debugGenerateThemes(count = 5, depth = 0, rng = Math.random) {
  const themes = [];
  for (let i = 0; i < count; i += 1) {
    themes.push(generateDungeonTheme(depth, rng));
  }
  return themes;
}
