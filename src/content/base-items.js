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
  conversion_ring: {
    slot: "ring",
    offense: {
      conversions: [{ from: "physical", to: "fire", pct: 0.5, includeBaseOnly: true }],
    },
  },
  affinity_ring_fire: {
    slot: "ring",
    offense: { affinities: { fire: 0.15 } },
  },
  resist_cloak_cold: {
    slot: "cloak",
    defense: { resists: { cold: 0.25 } },
  },
};
