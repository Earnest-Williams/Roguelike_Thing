// src/content/base-items.js
// @ts-check

export const items = {
  polarity_sword: {
    slot: "weapon",
    damage: { base: 6, type: "physical" },
    offense: { brands: [{ type: "physical", flat: 1 }] },
    polarity: { onHitBias: { all: 0.2 } },
  },
  polarity_cloak: {
    slot: "cloak",
    defense: {},
    polarity: { defenseBias: { all: 0.15 } },
    resists: { fire: 0.1 },
  },
};
