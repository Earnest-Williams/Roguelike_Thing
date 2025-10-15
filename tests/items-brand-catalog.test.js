import { strict as assert } from "node:assert";
import { ITEMS } from "../dist/src/content/items.js";
import { AVAILABLE_BRANDS_BY_ID } from "../dist/src/content/brands.js";

(function testItemBrandsRegistered() {
  const missing = new Set();
  for (const item of ITEMS) {
    if (!item || !Array.isArray(item.brands)) continue;
    for (const brand of item.brands) {
      if (!brand || typeof brand.id !== "string") continue;
      if (!AVAILABLE_BRANDS_BY_ID[brand.id]) {
        missing.add(brand.id);
      }
    }
  }
  assert.equal(
    missing.size,
    0,
    missing.size
      ? `missing brand catalog entries: ${Array.from(missing).join(", ")}`
      : ""
  );
  console.log("✓ item brands registered in catalog");
})();
