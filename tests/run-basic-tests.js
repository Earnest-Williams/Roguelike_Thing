import { strict as assert } from "node:assert";
import { foldMods, foldModsFromEquipment } from "../src/combat/mod-folding.js";
import { resolveAttack } from "../src/combat/attack.js";
import { finalAPForAction, finalCooldown } from "../src/combat/time.js";
import {
  canPay,
  spend as spendResource,
  regenTurn,
  eventGain,
} from "../src/combat/resources.js";
import { attachLogs } from "../src/combat/debug-log.js";
import { Actor } from "../src/combat/actor.js";

function mkActor(partial = {}) {
  const baseModCache = partial.modCache || {
    brands: [],
    immunities: new Set(),
    offense: { brands: [], brandAdds: [], affinities: {}, conversions: [] },
    defense: { resists: {}, immunities: new Set() },
    temporal: {},
    attunementRules: Object.create(null)
  };
  baseModCache.attunementRules ||= Object.create(null);
  return attachLogs({
    id: partial.id || "A",
    name: partial.name || "A",
    hp: partial.hp ?? 100,
    statuses: [],
    attunement: { rules: { ...baseModCache.attunementRules }, stacks: Object.create(null) },
    modCache: baseModCache,
    ...partial
  });
}

(function testFoldMods() {
  const itemA = { brands: [{ type: "fire", flat: 3 }], resists: { fire: 0.1 } };
  const itemB = { brands: [{ type: "fire", flat: 2 }], resists: { cold: 0.2 } };
  const out = foldMods([itemA, itemB]);
  assert.equal(out.offense.brands.length, 2);
  assert.equal(out.defense.resists.fire, 0.1);
  assert.equal(out.defense.resists.cold, 0.2);
  console.log("✓ foldMods basic");
})();

(function testResolveOrder() {
  const atk = mkActor({ id: "att" });
  const def = mkActor({
    id: "def",
    modCache: {
      brands: [],
      immunities: new Set(),
      offense: { brands: [], brandAdds: [], affinities: {}, conversions: [] },
      defense: { resists: { fire: 0.25 }, immunities: new Set() },
      temporal: {},
      attunementRules: Object.create(null)
    }
  });
  const ctx = {
    attacker: atk,
    defender: def,
    physicalBase: 20,
    conversions: [{ to: "fire", percent: 1 }]
  };
  const result = resolveAttack(ctx);
  assert.ok(result.breakdown, "breakdown should exist");
  assert.equal(result.breakdown.steps.length >= 3, true, "breakdown should record phases");
  assert.equal(result.totalDamage, 15);
  console.log("✓ resolveAttack order/resist");
})();

(function testTemporalHooks() {
  const actor = { temporal: { actionSpeedPct: 0.5 } };
  const { costAP } = finalAPForAction(actor, 10, []);
  assert.equal(costAP, 5, "action speed should reduce AP cost");

  const cdActor = { temporal: { cooldownPct: -0.25 } };
  assert.equal(finalCooldown(cdActor, 8), 6, "cooldown reduction stacks");

  const moveActor = { temporal: { moveAPDelta: -2, castTimeDelta: -3 } };
  const moveCost = finalAPForAction(moveActor, 10, ["move"]);
  assert.equal(moveCost.costAP, 8, "move tag should apply move delta");
  const castCost = finalAPForAction(moveActor, 10, ["cast"]);
  assert.equal(castCost.costAP, 7, "cast tag should apply cast delta");
  const neutralCost = finalAPForAction(moveActor, 10, []);
  assert.equal(neutralCost.costAP, 10, "no tag should leave base AP intact");
  console.log("✓ temporal hooks math");
})();

(function testResourceHooks() {
  const actor = {
    resources: {
      pools: {
        stamina: {
          cur: 10,
          max: 10,
          regenPerTurn: 0,
          spendMultipliers: { melee: 0.5 },
          minToUse: 5,
        },
      },
    },
  };
  const swing = { resourceCost: { stamina: 8 }, tags: ["melee"] };
  assert.equal(canPay(actor, swing), true, "should pass min gate and multiplier");
  spendResource(actor, swing);
  assert.equal(actor.resources.pools.stamina.cur, 6, "spend should apply multiplier");

  actor.resources.pools.mana = { cur: 9, max: 10, regenPerTurn: 5 };
  regenTurn(actor);
  assert.equal(actor.resources.pools.mana.cur, 10, "regen caps at max");
  console.log("✓ resource hooks math");
})();

(function testResourceEventGains() {
  const actor = {
    resources: {
      pools: {
        stamina: { cur: 5, max: 10, onHitGain: 2, onKillGain: 5 },
      },
    },
  };
  eventGain(actor, { kind: "hit" });
  assert.equal(actor.resources.pools.stamina.cur, 7, "hit gain applied");
  eventGain(actor, { kind: "kill", amount: 3 });
  assert.equal(actor.resources.pools.stamina.cur, 10, "kill gain clamps to max");
  console.log("✓ resource event gains");
})();

(function testFoldTemporalAndResourceHooks() {
  const actor = new Actor({
    id: "hook-test",
    baseStats: {
      str: 10,
      dex: 10,
      int: 10,
      vit: 10,
      maxHP: 100,
      maxStamina: 20,
      maxMana: 10,
      baseSpeed: 1,
    },
  });

  actor.equipment.RightHand = {
    id: "brand_hook",
    brands: [
      {
        temporal: { actionSpeedPct: 0.1, moveAPDelta: -1 },
        resources: {
          stamina: {
            maxDelta: 5,
            regenPerTurn: 2,
            onHitGain: 1,
            spendMultipliers: { melee: 0.9 },
            minToUse: 3,
          },
        },
      },
    ],
  };

  foldModsFromEquipment(actor);

  assert.equal(actor.temporal.actionSpeedPct, 0.1, "temporal hook folded");
  assert.equal(actor.temporal.moveAPDelta, -1, "move delta folded");

  const stamina = actor.resources.pools.stamina;
  assert.equal(stamina.max, 25, "resource max applies delta");
  assert.equal(stamina.cur, 20, "resource current clamped to new max");
  assert.equal(stamina.regenPerTurn, 2, "regen applied");
  assert.equal(stamina.onHitGain, 1, "event gain applied");
  assert.equal(stamina.minToUse, 3, "gate applied");
  assert.equal(stamina.spendMultipliers.melee, 0.9, "multiplier merged");

  console.log("✓ foldMods temporal/resource hooks");
})();
