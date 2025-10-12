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
  const depth = 5;
  const rng = makeDeterministicRng(7);
  const theme = generateDungeonTheme(depth, rng);

  assert.ok(theme, "Theme should be generated");
  assert.equal(typeof theme.id, "string");
  assert.ok(theme.id.includes("__"), "Theme id should combine component identifiers");
  assert.equal(typeof theme.name, "string");

  assert.ok(Array.isArray(theme.monsterTags), "Theme should expose monster tags");
  assert.ok(theme.monsterTags.length > 0, "Monster tags should not be empty");
  assert.ok(Array.isArray(theme.affixTags), "Theme should expose affix tags");
  assert.ok(theme.affixTags.length > 0, "Affix tags should not be empty");

  assert.ok(theme.weights?.mobTags, "Theme should provide mob tag weights");
  assert.ok(Object.keys(theme.weights.mobTags).length > 0);
  assert.ok(theme.weights?.affixTags, "Theme should provide affix tag weights");
  assert.ok(Object.keys(theme.weights.affixTags).length > 0);

  assert.ok(theme.powerBudgetCurve, "Theme should provide a power budget curve");
  assert.equal(typeof theme.powerBudgetCurve.start, "number");

  const shallowTheme = generateDungeonTheme(0, makeDeterministicRng(7));
  assert.ok(
    theme.powerBudgetCurve.start >= shallowTheme.powerBudgetCurve.start,
    "Deeper themes should raise the starting budget",
  );

  assert.ok(theme.culminationEvent, "Theme should include culmination metadata");
  assert.equal(typeof theme.culminationEvent.name, "string");
  assert.ok(Array.isArray(theme.culminationEvent.tags));

  console.log("✓ generateDungeonTheme produces a procedural theme");
})();
