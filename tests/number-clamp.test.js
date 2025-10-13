import { strict as assert } from "node:assert";
import { clamp } from "../src/utils/number.js";

(function testClampInfinity() {
  assert.equal(clamp(Infinity, 0, 100), 100, "Infinity should clamp to max");
  assert.equal(clamp(-Infinity, 0, 100), 0, "-Infinity should clamp to min");
})();

(function testClampNaN() {
  assert.equal(clamp(Number.NaN, 5, 10), 5, "NaN should fall back to min when available");
})();
