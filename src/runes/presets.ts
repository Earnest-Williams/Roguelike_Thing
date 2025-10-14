import { RUNE_ANCHOR, RUNE_TRIGGER, RUNE_EFFECT, type RuneDef } from "./types";

export const RUNES: Readonly<Record<string, RuneDef>> = {
  fireburst_sigil: {
    id: "fireburst_sigil",
    name: "Fireburst Sigil",
    anchor: RUNE_ANCHOR.FLOOR,
    trigger: RUNE_TRIGGER.STEP_ON,
    effect: RUNE_EFFECT.ATTACK,
    armingTime: 1,
    charges: 2,
    cooldown: 0,
    radius: 1,
    prePackets: { fire: 10 },
    statusAttempts: [{ id: "burning", baseChance: 0.6, baseDuration: 3 }],
    security: { dc: 12, glyphHP: 4, visible: false },
    tags: ["fire", "burst", "trap"],
  },
  freezing_seal: {
    id: "freezing_seal",
    name: "Freezing Seal",
    anchor: RUNE_ANCHOR.DOOR,
    trigger: RUNE_TRIGGER.OPEN,
    effect: RUNE_EFFECT.SEAL,
    armingTime: 1,
    charges: -1,
    cooldown: 1,
    prePackets: { cold: 6 },
    radius: 1,
    statusAttempts: [{ id: "slowed", baseChance: 1.0, baseDuration: 2 }],
    security: { dc: 14, glyphHP: 8, visible: false },
    tags: ["cold", "seal", "door"],
  },
} as const;
