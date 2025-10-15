import assert from "node:assert/strict";
import { computeItemPower } from "../src/content/power-budget.js";
import {
  SAMPLE_GEARSETS,
  SAMPLE_GEAR_SUMMARIES,
  summarizeSampleGear,
} from "../src/content/combat-presets.js";

(function testResistCapsAndPower() {
  const first = SAMPLE_GEARSETS[0];
  const summary = summarizeSampleGear(first);
  assert(summary, "should produce a summary for the first sample kit");
  assert.ok(summary.resists.fire <= 0.95, "fire resist should be capped at or below 95%");
  assert.equal(summary.resists.fire, 0.95, "stacked fire resist should clamp to 95% in samples");
  const manualPower = first.items.reduce((sum, item) => sum + computeItemPower(item), 0);
  assert.equal(summary.power, Math.round(manualPower), "summaries should round total power");
})();

(function testSummaryExportMatchesOnDemandComputation() {
  assert.equal(SAMPLE_GEAR_SUMMARIES.length, SAMPLE_GEARSETS.length);
  SAMPLE_GEARSETS.forEach((sample, idx) => {
    const expected = summarizeSampleGear(sample);
    const exported = SAMPLE_GEAR_SUMMARIES[idx];
    assert.deepEqual(exported, expected);
    for (const value of Object.values(exported.resists)) {
      assert.ok(value <= 0.95 && value >= 0, "exported resist values stay within [0, 0.95]");
    }
  });
})();
