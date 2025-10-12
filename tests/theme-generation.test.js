import { strict as assert } from "node:assert";
import { generateDungeonTheme } from "../src/content/themes.js";

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
  assert.ok(Array.isArray(theme.tags) && theme.tags.length > 0, "Theme should collect tags");
  assert.ok(
    theme.mechanics.length > 0,
    "Theme should include at least one mechanic",
  );
  assert.ok(Object.keys(theme.mobTagWeights).length > 0, "Mob tag weights should be populated");
  assert.ok(
    Object.keys(theme.affixTagWeights).length > 0,
    "Affix tag weights should be populated",
  );
  assert.ok(theme.baseBudget > 0, "Theme should compute a base budget");
  assert.ok(theme.perLevelBudget > 0, "Theme should compute a per-level budget");
  assert.ok(theme.culmination, "Theme should include culmination metadata");
  assert.equal(typeof theme.culmination.name, "string");
  assert.ok(Array.isArray(theme.culmination.tags));

  console.log("✓ generateDungeonTheme produces a structured theme");
})();
