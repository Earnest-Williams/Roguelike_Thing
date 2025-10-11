import "./resolve-order.test.js";
import "./status-buffduration.test.js";
import "./temporal-cooldown-tags.test.js";

import { strict as assert } from "node:assert";
import { foldModsFromEquipment, foldMods } from "../src/combat/mod-folding.js";
import { resolveAttack } from "../src/combat/resolve.js";
import { finalAPForAction, finalCooldown, beginCooldown, tickCooldowns, isOnCooldown } from "../src/combat/time.js";
import { addStatus, tickStatuses, rebuildDerived } from "../src/combat/status.js";
import { setSeed, roll } from "../src/combat/rng.js";
import { serializeActor, hydrateActor } from "../src/combat/save.js";
import { Actor } from "../src/combat/actor.js";

function testStatusTicking() {
  const actor = { statuses: [], turn: 0, hp: 10 };
  addStatus(actor, "burning", { potency: 2, duration: 2 });
  tickStatuses(actor, 1);
  assert.equal(actor.hp, 8, "burning should deal damage on first tick");
  tickStatuses(actor, 2);
  assert.equal(actor.hp, 6, "burning should tick again before expiry");
  tickStatuses(actor, 3);
  assert.equal(actor.statuses.length, 0, "burning should expire after duration");
  console.log("✓ status ticking & expiry");
}

function testStatusZeroDuration() {
  const actor = { statuses: [], turn: 0 };
  addStatus(actor, "haste", { duration: 0 });
  assert.equal(actor.statuses.length, 1, "status applies immediately");
  tickStatuses(actor, 1);
  assert.equal(actor.statuses.length, 0, "zero-duration status should drop on next tick");
  console.log("✓ status zero-duration cleanup");
}

function testResolveWithPolarity() {
  const attacker = {
    id: "atk",
    statusDerived: {},
    modCache: {
      offense: { conversions: [], brandAdds: [], affinities: {}, brands: [] },
      defense: { resists: {}, immunities: new Set() },
      immunities: new Set(),
      affinities: {},
      polarity: { onHitBias: { all: 0.2 }, defenseBias: {} },
    },
    attunement: { rules: Object.create(null), stacks: Object.create(null) },
  };
  const defender = {
    id: "def",
    statusDerived: {},
    modCache: {
      defense: { resists: { fire: 0.2 }, immunities: new Set(), flatDR: {}, polarity: { defenseBias: { all: 0.1 } } },
      immunities: new Set(),
      resists: { fire: 0.2 },
      polarity: { defenseBias: { all: 0.1 } },
    },
    res: { hp: 200 },
  };
  const ctx = {
    attacker,
    defender,
    packets: [{ type: "fire", amount: 100 }],
  };
  const result = resolveAttack(ctx);
  assert.equal(result.totalDamage, 105, "polarity biases and resists should combine deterministically");
  assert.equal(defender.res.hp, 95, "defender hp reduced by resolved damage");
  console.log("✓ resolveAttack polarity/resist order");
}

function testFoldModsSlotFilters() {
  const actor = {
    equipment: {
      offhand: { id: "buckler", defense: { parryPct: 0.1 } },
      head: { id: "helm", defense: { parryPct: 0.2 } },
    },
    statuses: [],
    attunement: { rules: Object.create(null), stacks: Object.create(null) },
  };
  foldModsFromEquipment(actor);
  assert.equal(actor.modCache.defense.parryPct, 0.1, "only offhand parry should apply");
  console.log("✓ foldMods slot filter");
}

function testCooldownLifecycle() {
  const actor = {};
  beginCooldown(actor, "dash", 3);
  assert.equal(isOnCooldown(actor, "dash"), true, "cooldown should start active");
  tickCooldowns(actor);
  tickCooldowns(actor);
  tickCooldowns(actor);
  assert.equal(isOnCooldown(actor, "dash"), false, "cooldown should expire after ticks");
  console.log("✓ cooldown begin/tick lifecycle");
}

function testTemporalMath() {
  const actor = { temporal: { actionSpeedPct: 0.5 } };
  const { costAP } = finalAPForAction(actor, 10, []);
  assert.equal(costAP, 5, "action speed should reduce AP cost");

  const cdActor = { temporal: { cooldownPct: -0.25 } };
  assert.equal(finalCooldown(cdActor, 8), 6, "cooldown reduction stacks");

  console.log("✓ temporal math");
}

function testResourceAndSave() {
  const actor = new Actor({
    id: "persist",
    baseStats: { str: 8, dex: 8, int: 8, vit: 8, maxHP: 20, maxStamina: 10, maxMana: 5, baseSpeed: 1 },
  });
  addStatus(actor, "haste", { stacks: 1, duration: 2 });
  rebuildDerived(actor);
  beginCooldown(actor, "strike", 2);
  const blob = serializeActor(actor);
  const other = new Actor({
    id: "clone",
    baseStats: { str: 8, dex: 8, int: 8, vit: 8, maxHP: 20, maxStamina: 10, maxMana: 5, baseSpeed: 1 },
  });
  hydrateActor(other, blob);
  assert.deepEqual(Object.entries(other.cooldowns), Object.entries(actor.cooldowns), "cooldowns persist through save/load");
  console.log("✓ save/hydrate actor state");
}

function testRngDeterminism() {
  setSeed(42);
  const a = roll(1, 20);
  setSeed(42);
  const b = roll(1, 20);
  assert.equal(a, b, "seeded rolls should be deterministic");
  console.log("✓ rng determinism");
}

function testFoldMods() {
  const itemA = { brands: [{ type: "fire", flat: 3 }], resists: { fire: 0.1 } };
  const itemB = { brands: [{ type: "fire", flat: 2 }], resists: { cold: 0.2 } };
  const out = foldMods([itemA, itemB]);
  assert.equal(out.offense.brands.length, 2);
  assert.equal(out.defense.resists.fire, 0.1);
  assert.equal(out.defense.resists.cold, 0.2);
  console.log("✓ foldMods basic");
}

(function run() {
  testStatusTicking();
  testStatusZeroDuration();
  testResolveWithPolarity();
  testFoldModsSlotFilters();
  testCooldownLifecycle();
  testTemporalMath();
  testResourceAndSave();
  testRngDeterminism();
  testFoldMods();
})();

