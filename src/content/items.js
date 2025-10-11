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
  {
    id: "polarity_sword",
    name: "Twin-Vein Blade",
    kind: "weapon",
    equipSlot: "weapon",
    weaponProfile: { base: [["slash", 5]] },
    brands: [
      {
        id: "edge",
        type: "physical",
        flat: 3,
      },
    ],
    polarity: {
      grant: { order: 0.6, chaos: 0.2 },
    },
  },
  {
    id: "polarity_cloak",
    name: "Veil of Stillwater",
    kind: "armor",
    equipSlot: "cloak",
    defense: {
      resists: { cold: 0.1 },
    },
    polarity: {
      defenseBias: { baseResistPct: 0.05, chaos: 0.1 },
    },
  },
  {
    id: "hex_monger_trinket",
    name: "Hex Monger Sigil",
    kind: "trinket",
    equipSlot: "trinket",
    statusMods: [
      {
        id: "hex_monger",
        kind: "status_interaction",
        inflictChanceBonus: { burn: 0.1, poisoned: 0.05 },
        inflictDurationMult: { burn: 1.0 },
        resistChanceBonus: { stunned: -0.2 },
        receivedDurationMult: { slowed: -0.5 },
        buffDurationMult: 0.25,
        freeAction: { ignore: ["stunned", "silenced"], cooldown: 3, purgeOnUse: true },
      },
    ],
    resource: {
      channeling: true,
    },
  },
];

