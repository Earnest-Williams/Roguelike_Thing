import { strict as assert } from "node:assert";
import { clamp as clampNumber } from "../dist/src/utils/number.js";
import { clamp as clampFrontend } from "../js/utils.js";

(function testClampInfinity() {
  assert.equal(
    clampNumber(Infinity, 0, 100),
    100,
    "Infinity should clamp to max",
  );
  assert.equal(
    clampNumber(-Infinity, 0, 100),
    0,
    "-Infinity should clamp to min",
  );
})();

(function testClampNaN() {
  assert.equal(
    clampNumber(Number.NaN, 5, 10),
    5,
    "NaN should fall back to min when available",
  );
})();

(function testClampSwapsInvertedBounds() {
  assert.equal(
    clampNumber(5, 10, 0),
    5,
    "numeric clamp should support inverted bounds",
  );
  assert.equal(
    clampFrontend(5, 10, 0),
    5,
    "frontend clamp should support inverted bounds",
  );
  assert.equal(
    clampNumber(5, Infinity, 0),
    5,
    "numeric clamp should handle inverted bounds when Infinity is involved",
  );
  assert.equal(
    clampFrontend(5, Infinity, 0),
    5,
    "frontend clamp should handle inverted bounds when Infinity is involved",
  );
})();
