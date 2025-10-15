// @ts-nocheck
import { SCHOOL, TARGET_KIND, type SpellDef } from "./types.js";

export const SPELLS: Readonly<Record<string, SpellDef>> = {
  firebolt: {
    id: "firebolt",
    name: "Firebolt",
    school: SCHOOL.FIRE,
    tags: ["spell", "fire", "projectile"],
    cost: { mana: 8 },
    apCost: 100,
    cooldown: 0,
    range: 8,
    targetKind: TARGET_KIND.ACTOR,
    prePackets: { fire: 12 },
    statusAttempts: [{ id: "burning", baseChance: 0.6, baseDuration: 3 }],
  },

  frost_nova: {
    id: "frost_nova",
    name: "Frost Nova",
    school: SCHOOL.COLD,
    tags: ["spell", "cold", "aoe"],
    cost: { mana: 12 },
    apCost: 120,
    cooldown: 3,
    range: 0,
    targetKind: TARGET_KIND.SELF,
    shape: { radius: 2 },
    prePackets: { cold: 8 },
    statusAttempts: [{ id: "slowed", baseChance: 1.0, baseDuration: 2 }],
  },

  chain_spark: {
    id: "chain_spark",
    name: "Chain Spark",
    school: SCHOOL.LIGHTNING,
    tags: ["spell", "lightning", "chain"],
    cost: { mana: 14 },
    apCost: 110,
    cooldown: 2,
    range: 6,
    targetKind: TARGET_KIND.ACTOR,
    prePackets: { lightning: 10 },
  },

  blink: {
    id: "blink",
    name: "Blink",
    school: SCHOOL.ARCANE,
    tags: ["spell", "arcane", "movement"],
    cost: { mana: 6 },
    apCost: 80,
    cooldown: 2,
    range: 6,
    targetKind: TARGET_KIND.POINT,
    prePackets: {},
    onCast: ({ actor, targetPos, canOccupy }) => {
      if (canOccupy?.(targetPos)) {
        actor.x = targetPos.x;
        actor.y = targetPos.y;
      }
    },
  },
} as const;
