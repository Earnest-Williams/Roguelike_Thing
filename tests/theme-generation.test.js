import { strict as assert } from "node:assert";
import { generateDungeonTheme, DESCRIPTORS, MECHANICS } from "../src/content/themes.js";

function makeDeterministicRng(seed = 1) {
  let state = seed;
  return () => {
    const x = Math.sin(state++) * 10000;
    return x - Math.floor(x);
  };
}

(function testGenerateDungeonTheme() {
  const rng = makeDeterministicRng(7);
  const theme = generateDungeonTheme(rng);

  assert.ok(theme, "Theme should be generated");
  assert.equal(typeof theme.id, "string");
  assert.equal(typeof theme.name, "string");

  const descriptor = DESCRIPTORS.find((d) => d.id === theme.descriptor.id);
  const mechanic = MECHANICS.find((m) => m.id === theme.mechanic.id);
  assert.ok(descriptor, "Descriptor reference should be valid");
  assert.ok(mechanic, "Mechanic reference should be valid");

  assert.ok(Array.isArray(theme.tags?.mobs), "Theme should expose mob tags");
  assert.ok(theme.tags.mobs.length > 0, "Mob tags should not be empty");
  assert.ok(Array.isArray(theme.tags?.affixes), "Theme should expose affix tags");
  assert.ok(theme.tags.affixes.length > 0, "Affix tags should not be empty");

  assert.ok(theme.weights?.mobTags, "Theme should provide mob tag weights");
  assert.ok(
    Object.keys(theme.weights.mobTags).length > 0,
    "Mob tag weights should be populated",
  );
  assert.ok(theme.weights?.affixTags, "Theme should provide affix tag weights");
  assert.ok(
    Object.keys(theme.weights.affixTags).length > 0,
    "Affix tag weights should be populated",
  );

  assert.ok(theme.budget, "Theme should provide budget information");
  assert.ok(theme.budget.base > 0, "Theme should compute a base budget");
  assert.ok(theme.budget.perLevel > 0, "Theme should compute a per-level budget");

  assert.ok(theme.culmination, "Theme should include culmination metadata");
  assert.equal(typeof theme.culmination.name, "string");
  assert.ok(Array.isArray(theme.culmination.tags));

  console.log("✓ generateDungeonTheme produces a structured theme");
})();
