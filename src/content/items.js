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
  {
    id: "prismatic_glaive",
    name: "Prismatic Glaive",
    kind: "weapon",
    equipSlot: "weapon",
    weaponProfile: { base: [["slash", 5], ["arcane", 4]] },
    brands: [
      {
        id: "sunburst_edge",
        type: "radiant",
        flat: 2,
        pct: 0.05,
        onHitStatuses: [{ id: "burn", chance: 0.25, stacks: 1, duration: 3 }],
      },
      {
        id: "umbral_rend",
        type: "void",
        pct: 0.04,
        onHitStatuses: [{ id: "slowed", chance: 0.2, stacks: 1, duration: 2 }],
      },
    ],
    polarity: {
      grant: { order: 0.2, void: 0.2 },
      onHitBias: { chaos: 0.1, decay: 0.1 },
    },
    temporal: { cooldownPct: -0.05 },
  },
  {
    id: "stormvenom_blade",
    name: "Stormvenom Blade",
    kind: "weapon",
    equipSlot: "weapon",
    weaponProfile: { base: [["slash", 4], ["lightning", 3]] },
    brands: [
      {
        id: "stormlash",
        type: "storm",
        pct: 0.06,
        onHitStatuses: [{ id: "slowed", chance: 0.25, stacks: 1, duration: 2 }],
      },
      {
        id: "venomkiss",
        type: "toxic",
        pct: 0.05,
        onHitStatuses: [{ id: "poisoned", chance: 0.4, stacks: 2, duration: 3 }],
      },
    ],
    temporal: { actionSpeedPct: -0.03 },
    resource: {
      costMult: { stamina: 0.9 },
      gainFlat: { stamina: 1 },
    },
    statusMods: [
      {
        id: "stormvenom_bundle",
        kind: "status_interaction",
        inflictChanceBonus: { poisoned: 0.1, slowed: 0.1 },
        resistChanceBonus: { stunned: -0.1 },
        receivedDurationMult: { stunned: -0.25 },
      },
    ],
  },
  {
    id: "equilibrium_halberd",
    name: "Equilibrium Halberd",
    kind: "weapon",
    equipSlot: "weapon",
    weaponProfile: { base: [["physical", 6], ["arcane", 4]] },
    brands: [
      {
        id: "gravity_well",
        type: "void",
        pct: 0.05,
        onHitStatuses: [{ id: "slowed", chance: 0.3, stacks: 1, duration: 2 }],
      },
      {
        id: "aurora_edge",
        type: "radiant",
        pct: 0.04,
        onHitStatuses: [{ id: "burn", chance: 0.2, stacks: 1, duration: 2 }],
      },
    ],
    polarity: {
      grant: { order: 0.15, growth: 0.1, chaos: 0.1 },
      onHitBias: { order: 0.1, chaos: 0.1, void: 0.05 },
    },
    temporal: { actionSpeedPct: -0.04, cooldownPct: -0.05 },
    resource: {
      gainFlat: { stamina: 2 },
      costMult: { stamina: 0.95 },
    },
    statusMods: [
      {
        id: "balance_field",
        kind: "status_interaction",
        inflictChanceBonus: { stunned: 0.05, slowed: 0.1 },
        resistChanceBonus: { stunned: 0.05 },
        receivedDurationMult: { slowed: -0.2 },
      },
    ],
  },
  {
    id: "glacier_spear",
    name: "Glacier Spear",
    kind: "weapon",
    equipSlot: "weapon",
    weaponProfile: { base: [["pierce", 5], ["cold", 4]] },
    brands: [
      {
        id: "frostbite_tip",
        type: "cold",
        flat: 2,
        pct: 0.07,
        onHitStatuses: [{ id: "slowed", chance: 0.35, stacks: 1, duration: 2 }],
      },
    ],
    attunement: {
      onUseGain: 1,
      decayPerTurn: 1,
      maxStacks: 6,
      perStack: { damagePct: 0.015 },
    },
  },
  {
    id: "caustic_falchion",
    name: "Caustic Falchion",
    kind: "weapon",
    equipSlot: "weapon",
    weaponProfile: { base: [["slash", 5]] },
    brands: [
      {
        id: "corrosion_wave",
        type: "acid",
        flat: 1,
        pct: 0.08,
        onHitStatuses: [{ id: "poisoned", chance: 0.4, stacks: 1, duration: 3 }],
      },
    ],
    resource: {
      costMult: { stamina: 0.85 },
    },
  },
  {
    id: "earthshaker_maul",
    name: "Earthshaker Maul",
    kind: "weapon",
    equipSlot: "weapon",
    weaponProfile: { base: [["bludgeon", 7]] },
    brands: [
      {
        id: "tectonic_rumble",
        type: "earth",
        flat: 3,
        pct: 0.05,
        onHitStatuses: [{ id: "stunned", chance: 0.3, stacks: 1, duration: 1 }],
      },
    ],
    temporal: { actionSpeedPct: -0.05 },
    resource: {
      costMult: { stamina: 1.1 },
      gainFlat: { stamina: 2 },
    },
  },
  {
    id: "voltaic_chakram",
    name: "Voltaic Chakram",
    kind: "weapon",
    equipSlot: "weapon",
    weaponProfile: { base: [["slash", 3], ["lightning", 5]] },
    brands: [
      {
        id: "lightning_arc",
        type: "lightning",
        flat: 2,
        pct: 0.06,
        onHitStatuses: [{ id: "stunned", chance: 0.2, stacks: 1, duration: 1 }],
      },
      {
        id: "storm_resonance",
        type: "storm",
        pct: 0.03,
        onHitStatuses: [{ id: "slowed", chance: 0.25, stacks: 1, duration: 2 }],
      },
    ],
    polarity: {
      grant: { chaos: 0.1, order: 0.1 },
      onHitBias: { order: 0.1 },
    },
  },
  {
    id: "tidal_scepter",
    name: "Tidal Scepter",
    kind: "weapon",
    equipSlot: "weapon",
    weaponProfile: { base: [["arcane", 4], ["water", 4]] },
    brands: [
      {
        id: "undertow_surge",
        type: "water",
        flat: 1,
        pct: 0.07,
        onHitStatuses: [{ id: "slowed", chance: 0.3, stacks: 1, duration: 2 }],
      },
    ],
    resource: {
      gainFlat: { mana: 2 },
    },
  },
];

