// @ts-nocheck
import type { HazardSpec, StatusAttempt } from "@types/core";

export const RUNE_ANCHOR = {
  FLOOR: "floor",
  WALL: "wall",
  DOOR: "door",
  ITEM: "item",
} as const;
export type RuneAnchor = typeof RUNE_ANCHOR[keyof typeof RUNE_ANCHOR];

export const RUNE_TRIGGER = {
  STEP_ON: "step_on",
  OPEN: "open",
  PROXIMITY: "proximity",
  TIMER: "timer",
  HIT: "hit",
  BEING_HIT: "being_hit",
} as const;
export type RuneTrigger = typeof RUNE_TRIGGER[keyof typeof RUNE_TRIGGER];

export const RUNE_EFFECT = {
  ATTACK: "attack",
  HAZARD: "hazard",
  SEAL: "seal",
  WARD: "ward",
  UTILITY: "utility",
} as const;
export type RuneEffect = typeof RUNE_EFFECT[keyof typeof RUNE_EFFECT];

export interface RuneDef {
  id: string;
  name: string;
  anchor: RuneAnchor;
  trigger: RuneTrigger;
  effect: RuneEffect;
  armingTime: number;
  charges: number; // -1 = infinite
  cooldown: number;
  radius?: number;
  losRange?: number;
  prePackets?: Record<string, number>;
  statusAttempts?: StatusAttempt[];
  hazard?: HazardSpec;
  ward?: { allowFactions?: string[]; denyFactions?: string[]; ownerId?: string | null };
  security?: { dc: number; glyphHP: number; visible: boolean };
  condition?:(ctx: { actor: import("@types/core").ActorLike; rune: RuneInstance }) => boolean;
  onUtility?:(arg:{ actor: import("@types/core").ActorLike; rune: RuneInstance; ctx: import("@types/core").GameCtx })=>void;
  tags: string[];
}

export interface RuneInstance {
  def: RuneDef;
  ownerId?: string | null;
  ownerFaction?: string[];
  armedAtTurn: number | null;
  chargesLeft: number; // mirrors def.charges initially
  lastFiredTurn: number;
  detectedBy: Set<string>;
  hp: number;
  pos?: { x: number; y: number; layer?: number };
  door?: unknown;
  item?: unknown;
}
