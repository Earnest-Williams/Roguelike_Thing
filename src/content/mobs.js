/**
 * @file Defines mob templates. Note the separation of concerns:
 * - `id`: The species/creature type (e.g., "orc"). Role-based variants like "orc_warrior"
 * will be handled by a future "Role Template" system.
 * - `factions`: Intrinsic allegiance. Drives AI hostility.
 * - `tags`: Descriptive metadata for filtering (e.g., by spawn system).
 */
import { DAMAGE_TYPE } from "../../js/constants.js"; // This import provides the damage type constants.

export const MOB_TEMPLATES = {
  // --- UPDATE EXISTING TEMPLATES ---
  brigand: {
    id: "brigand", name: "Brigand",
    factions: ["npc_hostile"],
    affiliations: ["bandits:redhands"],
    tags: ["humanoid", "bandit", "melee"],
    spawnWeight: 10,
    baseStats: { str: 9, dex: 9, int: 6, vit: 9, con: 9, will: 6, luck: 8,
                 maxHP: 24, maxStamina: 12, maxMana: 0, baseSpeed: 1.0 },
    loadout: ["short_sword"],
    glyph: "b", color: "#e53935",
  },

  pyromancer: {
    id: "pyromancer", name: "Pyromancer",
    factions: ["npc_hostile"],
    affiliations: [],
    tags: ["humanoid","caster","fire","tier1"],
    spawnWeight: 6,
    baseStats: { str: 6, dex: 8, int: 12, vit: 7, con: 7, will: 10, luck: 7,
                 maxHP: 18, maxStamina: 12, maxMana: 24, baseSpeed: 1 },
    loadout: [],
    glyph: "p", color: "#ff7043",
  },

  // --- ADD NEW TEMPLATES ---
  skeleton: {
    id: "skeleton",
    name: "Skeleton",
    factions: ["unaligned"],
    affiliations: [],
    tags: ["undead", "melee", "tier1"],
    spawnWeight: 8,
    baseStats: { str: 8, dex: 8, int: 2, vit: 6, con: 0, will: 4, luck: 5,
                 maxHP: 16, maxStamina: 10, maxMana: 0, baseSpeed: 1 },
    // NOTE: `[DAMAGE_TYPE.BLUNT]` correctly uses the value from the constant (e.g., "blunt").
    innate: { resists: { necrotic: 0.25, [DAMAGE_TYPE.BLUNT]: -0.25 } },
    loadout: ["short_sword"],
    glyph: "s", color: "#e0e0e0",
  },

  orc: {
    id: "orc",
    name: "Orc",
    factions: ["npc_hostile"],
    affiliations: [],
    tags: ["orc", "humanoid", "melee", "tier1"],
    spawnWeight: 7,
    // Base stats are ~10% higher than a human brigand (str:9, vit:9, maxHP:24).
    baseStats: { str: 12, dex: 9, int: 7, vit: 11, con: 10, will: 8, luck: 6,
                 maxHP: 24, maxStamina: 14, maxMana: 0, baseSpeed: 1 },
    innate: {
      vision: { lightBonus: 1 },
      // NOTE: `[DAMAGE_TYPE.POISON]` correctly uses the value from the constant (e.g., "poison").
      resists: { [DAMAGE_TYPE.POISON]: 0.1 }
    },
    loadout: ["battle_axe"],
    glyph: "o", color: "#8bc34a",
  },
};

// --- TEMPLATE VALIDATION ---
for (const t of Object.values(MOB_TEMPLATES)) {
  if (!t?.id) throw new Error("Mob template missing id");
  const F = t.factions || [];
  if (F.includes("unaligned") && F.length > 1) {
    throw new Error(`Template ${t.id}: 'unaligned' cannot be combined with other factions`);
  }
  const bs = t.baseStats || {};
  for (const k of ["str","dex","int","vit","con","will","luck","maxHP","maxStamina","maxMana","baseSpeed"]) {
    if (bs[k] == null) throw new Error(`Template ${t.id} missing baseStats.${k}`);
  }
}

