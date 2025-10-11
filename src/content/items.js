// src/content/items.js
// @ts-check

export const ITEMS = [
  {
    id: "flame_sword",
    kind: "weapon",
    equipSlot: "weapon",
    weaponProfile: { base: [["fire", 6], ["slash", 4]] },
    brands: [
      {
        id: "fire_edge",
        type: "fire",
        attunement: {
          onUseGain: 1,
          decayPerTurn: 1,
          maxStacks: 10,
          perStack: { damagePct: 0.02 },
        },
        temporal: { actionSpeedPct: 0.05 },
        resources: {
          stamina: {
            regenPerTurn: 1,
            spendMultipliers: { melee: 0.9 },
          },
        },
      },
    ],
  },
];

