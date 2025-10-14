import { strict as assert } from "node:assert";

import { SLOT } from "../js/constants.js";
import { applyLoadout } from "../src/game/monster.js";

function sequenceRng(values) {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
}

function makeStubActor() {
  return {
    equipment: {},
    equip(slot, item) {
      this.equipment[slot] = item;
    },
  };
}

(function testSkeletonLoadoutExtinguishesLight() {
  const actor = makeStubActor();
  const rng = sequenceRng([0.1, 0.1, 0.1]);
  const stubCreateItem = (id) => ({
    id,
    emitsLight: true,
    lit: true,
    radius: 5,
    lightRadius: 5,
    equipSlots: [SLOT.RightHand, SLOT.LeftHand],
  });

  applyLoadout(actor, "skeleton", rng, stubCreateItem);

  const equipped = Object.values(actor.equipment);
  assert(equipped.length > 0, "skeleton should equip at least one item");
  for (const item of equipped) {
    if (Object.prototype.hasOwnProperty.call(item, "emitsLight")) {
      assert.equal(item.emitsLight, false, "skeleton lights should be extinguished");
    }
    if (Object.prototype.hasOwnProperty.call(item, "lit")) {
      assert.equal(item.lit, false, "skeleton should not have lit lights");
    }
    if (Object.prototype.hasOwnProperty.call(item, "radius")) {
      assert(item.radius <= 0, "light radius should be zeroed");
    }
    if (Object.prototype.hasOwnProperty.call(item, "lightRadius")) {
      assert(item.lightRadius <= 0, "alt light radius should be zeroed");
    }
  }
  console.log("✓ skeleton loadout extinguishes light sources");
})();

(function testOrcLoadoutUsesRng() {
  const actor = makeStubActor();
  const rng = sequenceRng([0.0, 1.0, 1.0, 1.0, 0.5]);
  const created = [];
  const stubCreateItem = (id) => {
    created.push(id);
    if (id === "torch") {
      return {
        id,
        equipSlots: [
          SLOT.LeftHand,
          SLOT.RightHand,
          SLOT.Belt1,
          SLOT.Belt2,
          SLOT.Belt3,
          SLOT.Belt4,
        ],
      };
    }
    return {
      id,
      equipSlots: [
        SLOT.RightHand,
        SLOT.LeftHand,
        SLOT.Head,
        SLOT.BodyArmor,
        SLOT.Boots,
      ],
    };
  };

  applyLoadout(actor, "orc", rng, stubCreateItem);

  assert(
    created.some((id) => id === "mace" || id === "long_sword" || id === "club"),
    "orc loadout should create a main-hand weapon",
  );
  const torchEquipped = Object.values(actor.equipment).some((item) => item?.id === "torch");
  assert.equal(torchEquipped, false, "torch should not equip when RNG roll exceeds threshold");
  console.log("✓ orc loadout respects RNG when equipping items");
})();
