import { strict as assert } from "node:assert";

import { SLOT } from "../js/constants.js";
import { applyLoadout } from "../dist/src/game/monster.js";

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

(function testHumanoidLoadoutGuaranteesLightAndOil() {
  const actor = makeStubActor();
  const rng = sequenceRng([0.0, 1.0, 1.0, 1.0, 0.5, 0.2, 0.8]);
  const created = [];
  const stubCreateItem = (id) => {
    created.push(id);
    if (id === "torch" || id === "lantern") {
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
        lightRadius: id === "lantern" ? 5 : 2,
      };
    }
    if (id === "oil_flask") {
      return {
        id,
        equipSlots: [
          SLOT.Belt1,
          SLOT.Belt2,
          SLOT.Belt3,
          SLOT.Belt4,
          SLOT.Backpack,
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

  const equipment = Object.values(actor.equipment);
  const lightEquipped = equipment.some((item) => item?.id === "torch" || item?.id === "lantern");
  assert.equal(lightEquipped, true, "humanoids should always carry a light source");

  const oilFlaskCount = equipment.reduce(
    (count, item) => (item?.id === "oil_flask" ? count + 1 : count),
    0,
  );
  assert(
    oilFlaskCount >= 2,
    "humanoids should carry spare oil flasks",
  );

  console.log("✓ humanoid loadouts always include light sources and spare oil");
})();
