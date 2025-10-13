// src/content/mobs.js
// @ts-check
import { DAMAGE_TYPE } from "../../js/constants.js";

/**
 * Species-level mob templates.
 * Role variants will be layered on by future systems.
 */
export const MOB_TEMPLATES = {
  dummy: {
    id: "dummy",
    name: "Training Dummy",
    factions: ["unaligned"],
    affiliations: [],
    tags: ["construct", "training", "stationary"],
    spawnWeight: 0,
    glyph: "d",
    color: "#888",
    baseStats: {
      str: 5,
      dex: 5,
      int: 5,
      vit: 8,
      con: 8,
      will: 5,
      luck: 5,
      maxHP: 35,
      maxStamina: 10,
      maxMana: 0,
      baseSpeed: 1,
    },
    equipment: {},
    actions: ["strike"],
  },

  brigand: {
    id: "brigand",
    name: "Brigand",
    factions: ["npc_hostile"],
    affiliations: ["bandits:redhands"],
    tags: ["humanoid", "bandit", "melee"],
    spawnWeight: 10,
    glyph: "b",
    color: "#e53935",
    baseStats: {
      str: 9,
      dex: 9,
      int: 6,
      vit: 9,
      con: 9,
      will: 6,
      luck: 8,
      maxHP: 24,
      maxStamina: 12,
      maxMana: 0,
      baseSpeed: 1,
    },
    loadout: ["short_sword"],
    actions: ["strike", "move_towards_target"],
  },

  pyromancer: {
    id: "pyromancer",
    name: "Pyromancer",
    factions: ["npc_hostile"],
    affiliations: [],
    tags: ["humanoid", "caster", "fire", "tier1"],
    spawnWeight: 6,
    glyph: "p",
    color: "#ff7043",
    baseStats: {
      str: 6,
      dex: 8,
      int: 12,
      vit: 7,
      con: 7,
      will: 10,
      luck: 7,
      maxHP: 18,
      maxStamina: 12,
      maxMana: 24,
      baseSpeed: 1,
    },
    loadout: [],
    innate: { affinities: { fire: 0.1 } },
    actions: ["fire_bolt", "strike"],
  },

  skeleton: {
    id: "skeleton",
    name: "Skeleton",
    factions: ["unaligned"],
    affiliations: [],
    tags: ["undead", "melee", "tier1"],
    spawnWeight: 8,
    glyph: "s",
    color: "#e0e0e0",
    baseStats: {
      str: 8,
      dex: 8,
      int: 2,
      vit: 6,
      con: 0,
      will: 4,
      luck: 5,
      maxHP: 16,
      maxStamina: 10,
      maxMana: 0,
      baseSpeed: 1,
    },
    innate: { resists: { necrotic: 0.25, [DAMAGE_TYPE.BLUNT]: -0.25 } },
    loadout: ["short_sword"],
    actions: ["strike", "move_towards_target"],
  },

  orc: {
    id: "orc",
    name: "Orc",
    factions: ["npc_hostile"],
    affiliations: [],
    tags: ["orc", "humanoid", "melee", "tier1"],
    spawnWeight: 7,
    glyph: "o",
    color: "#8bc34a",
    baseStats: {
      str: 12,
      dex: 9,
      int: 7,
      vit: 11,
      con: 10,
      will: 8,
      luck: 6,
      maxHP: 24,
      maxStamina: 14,
      maxMana: 0,
      baseSpeed: 1,
    },
    innate: {
      vision: { lightBonus: 1 },
      resists: { [DAMAGE_TYPE.POISON]: 0.1 },
    },
    loadout: ["battle_axe"],
    actions: ["strike", "move_towards_target"],
  },
};

for (const t of Object.values(MOB_TEMPLATES)) {
  if (!t?.id) throw new Error("Mob template missing id");
  const factions = Array.isArray(t.factions) ? t.factions : [];
  if (factions.includes("unaligned") && factions.length > 1) {
    throw new Error(`Template ${t.id}: 'unaligned' cannot be combined with other factions`);
  }
  const bs = t.baseStats || {};
  for (const key of [
    "str",
    "dex",
    "int",
    "vit",
    "con",
    "will",
    "luck",
    "maxHP",
    "maxStamina",
    "maxMana",
    "baseSpeed",
  ]) {
    if (bs[key] == null) {
      throw new Error(`Template ${t.id} missing baseStats.${key}`);
    }
  }
}

