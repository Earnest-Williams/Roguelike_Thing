// src/content/items.js
// @ts-check

import { DAMAGE_TYPE, LIGHT_CHANNELS } from "../../js/constants.js";

const { SLASH, PIERCE, BLUNT, FIRE, COLD, LIGHTNING, ARCANE, RADIANT } = DAMAGE_TYPE;

/**
 * @typedef {Readonly<{ id: string; type: string; flat?: number; pct?: number; onHitStatuses?: ReadonlyArray<Readonly<{ id: string; chance: number; stacks?: number; duration?: number }>>; attunement?: unknown; temporal?: unknown; resources?: unknown; }>} ItemBrand
 */

/**
 * @typedef {Readonly<{ base: ReadonlyArray<readonly [string, number]> }>} WeaponProfile
 */

/**
 * @typedef {Readonly<{
 *   id: string;
 *   name?: string;
 *   description?: string;
 *   kind: string;
 *   equipSlot: string;
 *   weaponProfile?: WeaponProfile;
 *   brands?: ReadonlyArray<ItemBrand>;
 *   polarity?: unknown;
 *   attunement?: unknown;
 *   temporal?: unknown;
 *   resource?: unknown;
 *   statusMods?: ReadonlyArray<unknown>;
 *   defense?: unknown;
 *   light?: unknown;
 *   lightMask?: number;
 * }>} ItemDefinition
 */

/**
 * Create an immutable item record.
 * @param {ItemDefinition} item
 * @returns {ItemDefinition}
 */
function freezeItem(item) {
  return Object.freeze(item);
}

/**
 * Helper for registering a weapon with consistent defaults.
 * @param {Omit<ItemDefinition, "kind" | "equipSlot">} item
 */
const weapon = (item) =>
  freezeItem({
    kind: "weapon",
    equipSlot: "weapon",
    ...item,
  });

/**
 * Helper for registering a tool item.
 * @param {Omit<ItemDefinition, "kind">} item
 */
const tool = (item) =>
  freezeItem({
    kind: "tool",
    equipSlot: item.equipSlot || "tool",
    ...item,
  });

/**
 * Helper for registering an armor piece.
 * @param {Omit<ItemDefinition, "kind">} item
 */
const armor = (item) =>
  freezeItem({
    kind: "armor",
    ...item,
  });

/**
 * Helper for registering a trinket item.
 * @param {Omit<ItemDefinition, "kind" | "equipSlot">} item
 */
const trinket = (item) =>
  freezeItem({
    kind: "trinket",
    equipSlot: "trinket",
    ...item,
  });

const MUNDANE_WEAPONS = [
  weapon({
    id: "iron_shortsword",
    name: "Iron Shortsword",
    description: "A reliable iron blade issued to city guards and caravan escorts.",
    weaponProfile: { base: [[SLASH, 4]] },
    resource: { costMult: { stamina: 0.95 } },
  }),
  weapon({
    id: "well_balanced_spear",
    name: "Well-Balanced Spear",
    description: "An ash-wood spear tipped with hardened steel, easy to wield in narrow halls.",
    weaponProfile: { base: [[PIERCE, 4]] },
  }),
  weapon({
    id: "sturdy_quarterstaff",
    name: "Sturdy Quarterstaff",
    description: "A length of knotted hardwood popular among village militias.",
    weaponProfile: { base: [[BLUNT, 4]] },
    resource: { gainFlat: { stamina: 1 } },
  }),
  weapon({
    id: "hunters_longbow",
    name: "Hunter's Longbow",
    description: "A laminated bow with a smooth draw, meant for long hunts rather than sorcery.",
    weaponProfile: { base: [[PIERCE, 3]] },
    resource: { costMult: { stamina: 0.9 } },
  }),
];

const SIGNATURE_WEAPONS = [
  weapon({
    id: "flame_sword",
    name: "Flame Sword",
    weaponProfile: { base: [[FIRE, 6], [SLASH, 4]] },
    brands: [
      {
        id: "fire_edge",
        type: FIRE,
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
  }),
  weapon({
    id: "polarity_sword",
    name: "Twin-Vein Blade",
    weaponProfile: { base: [[SLASH, 5]] },
    brands: [
      {
        id: "edge",
        type: SLASH,
        flat: 3,
      },
    ],
    polarity: {
      grant: { order: 0.6, chaos: 0.2 },
    },
  }),
  weapon({
    id: "prismatic_glaive",
    name: "Prismatic Glaive",
    weaponProfile: { base: [[SLASH, 5], [ARCANE, 4]] },
    brands: [
      {
        id: "sunburst_edge",
        type: RADIANT,
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
  }),
  weapon({
    id: "stormvenom_blade",
    name: "Stormvenom Blade",
    weaponProfile: { base: [[SLASH, 4], [LIGHTNING, 3]] },
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
  }),
  weapon({
    id: "equilibrium_halberd",
    name: "Equilibrium Halberd",
    weaponProfile: { base: [[PIERCE, 6], [ARCANE, 4]] },
    brands: [
      {
        id: "gravity_well",
        type: "void",
        pct: 0.05,
        onHitStatuses: [{ id: "slowed", chance: 0.3, stacks: 1, duration: 2 }],
      },
      {
        id: "aurora_edge",
        type: RADIANT,
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
  }),
  weapon({
    id: "glacier_spear",
    name: "Glacier Spear",
    weaponProfile: { base: [[PIERCE, 5], [COLD, 4]] },
    brands: [
      {
        id: "frostbite_tip",
        type: COLD,
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
  }),
  weapon({
    id: "caustic_falchion",
    name: "Caustic Falchion",
    weaponProfile: { base: [[SLASH, 5]] },
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
  }),
  weapon({
    id: "earthshaker_maul",
    name: "Earthshaker Maul",
    weaponProfile: { base: [[BLUNT, 7]] },
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
  }),
  weapon({
    id: "voltaic_chakram",
    name: "Voltaic Chakram",
    weaponProfile: { base: [[SLASH, 3], [LIGHTNING, 5]] },
    brands: [
      {
        id: "lightning_arc",
        type: LIGHTNING,
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
  }),
  weapon({
    id: "tidal_scepter",
    name: "Tidal Scepter",
    weaponProfile: { base: [[ARCANE, 4], ["water", 4]] },
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
  }),
];

const TOOLS = [
  tool({
    id: "spotlight",
    name: "Arc-Lite Projector",
    light: {
      radius: 8,
      color: "#ffffbe",
      intensity: 1.2,
      angle: 0,
      width: Math.PI / 3,
      channel: LIGHT_CHANNELS.NORMAL,
    },
    description: "A focused beam lamp that bathes a narrow arc in brilliant light.",
  }),
  tool({
    id: "camp_lantern",
    name: "Camp Lantern",
    description: "A hooded lantern fueled by mundane oil, steady if somewhat dim.",
    equipSlot: "RightHand",
    light: {
      radius: 5,
      color: "#ffec9e",
      intensity: 0.8,
      angle: 0,
      width: Math.PI / 2,
      channel: LIGHT_CHANNELS.NORMAL,
    },
  }),
  tool({
    id: "arc_lantern",
    name: "Arc Lantern",
    equipSlot: "RightHand",
    light: {
      radius: 8,
      color: "#ffffbe",
      intensity: 1.2,
      angle: 0,
      width: Math.PI / 3,
      channel: LIGHT_CHANNELS.MAGIC,
    },
    lightMask: LIGHT_CHANNELS.MAGIC,
  }),
  tool({
    id: "oil_flask",
    name: "Oil Flask",
    description: "A small bottle of lamp oil for refilling torches or lanterns.",
    equipSlot: "belt",
  }),
];

const ARMOR = [
  armor({
    id: "polarity_cloak",
    name: "Veil of Stillwater",
    equipSlot: "cloak",
    defense: {
      resists: { cold: 0.1 },
    },
    polarity: {
      defenseBias: { baseResistPct: 0.05, chaos: 0.1 },
    },
  }),
  armor({
    id: "padded_jacket",
    name: "Padded Jacket",
    equipSlot: "armor",
    description: "Layered canvas and wool batting that blunts mundane blows.",
    defense: {
      resists: { slash: 0.05, pierce: 0.03 },
    },
  }),
];

const TRINKETS = [
  trinket({
    id: "hex_monger_trinket",
    name: "Hex Monger Sigil",
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
  }),
];

/**
 * Catalog of bespoke items available to the content pipeline.
 * Items are grouped into curated sets (mundane gear, signature artifacts, tools, etc.)
 * before being flattened to a single immutable collection so downstream systems can
 * iterate without worrying about accidental mutation during testing or content setup.
 * @type {ReadonlyArray<ItemDefinition>}
 */
export const ITEMS = Object.freeze([
  ...MUNDANE_WEAPONS,
  ...SIGNATURE_WEAPONS,
  ...TOOLS,
  ...ARMOR,
  ...TRINKETS,
]);

export const BASE_ITEMS = Object.freeze(
  ITEMS.reduce((acc, item) => {
    if (item?.id) {
      acc[item.id] = item;
    }
    return acc;
  }, /** @type {Record<string, any>} */ (Object.create(null))),
);

