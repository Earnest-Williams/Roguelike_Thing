import { strict as assert } from "node:assert";
import { AFFIX_POOLS } from "../src/content/affixes.js";
import { ITEMS } from "../src/content/items.js";

(function testAffixPools() {
  const prefixIds = new Set(AFFIX_POOLS.prefix.map((a) => a.id));
  assert(prefixIds.size >= 10, "expected at least ten weapon prefixes");
  for (const id of ["corroding", "venom_laced", "radiant"]) {
    assert(prefixIds.has(id), `missing expected prefix ${id}`);
  }

  const suffixIds = new Set(AFFIX_POOLS.suffix.map((a) => a.id));
  for (const id of ["of_precision", "of_focus", "of_duality", "of_vigor"]) {
    assert(suffixIds.has(id), `missing expected suffix ${id}`);
  }

  console.log("✓ affix pool extensions registered");
})();

(function testCompositeItems() {
  const byId = Object.fromEntries(ITEMS.map((item) => [item.id, item]));

  const prismatic = byId.prismatic_glaive;
  assert(prismatic, "prismatic glaive should exist");
  assert(prismatic.brands?.length >= 2, "prismatic glaive should have dual brands");

  const stormvenom = byId.stormvenom_blade;
  assert(stormvenom, "stormvenom blade should exist");
  assert(stormvenom.statusMods?.length, "stormvenom blade should bundle status interactions");
  assert(stormvenom.resource?.costMult?.stamina < 1, "stormvenom blade should adjust stamina cost");

  const equilibrium = byId.equilibrium_halberd;
  assert(equilibrium, "equilibrium halberd should exist");
  const grantAxes = Object.keys(equilibrium.polarity?.grant || {});
  assert(grantAxes.length >= 3, "equilibrium halberd should grant multiple polarity axes");

  console.log("✓ composite items expose layered modifiers");
})();
