// @ts-nocheck
import type { StatusAttempt } from "@types/core";

export const TARGET_KIND = {
  SELF: "self",
  POINT: "point",
  ACTOR: "actor",
  LINE: "line",
  CONE: "cone",
  CIRCLE: "circle",
} as const;
export type TargetKind = typeof TARGET_KIND[keyof typeof TARGET_KIND];

export const SCHOOL = {
  FIRE: "fire",
  COLD: "cold",
  LIGHTNING: "lightning",
  ARCANE: "arcane",
  TOXIC: "toxic",
  EARTH: "earth",
} as const;
export type School = typeof SCHOOL[keyof typeof SCHOOL];

export interface SpellDef {
  id: string;
  name: string;
  tags: string[];
  school?: School;
  cost: Partial<Record<"mana" | "stamina" | "hp", number>>;
  apCost: number;
  cooldown: number; // turns
  range: number; // tiles
  targetKind: TargetKind;
  shape?: Partial<{ radius: number; length: number; angleDeg: number }>;
  prePackets: Record<string, number>;
  statusAttempts?: StatusAttempt[];
  // Optional utility-only behavior:
  onCast?:
    | ((args: {
        actor: import("@types/core").ActorLike;
        targetPos: { x: number; y: number };
        canOccupy?: (p: { x: number; y: number }) => boolean;
      }) => void)
    | undefined;
  // Optional hazard created by cast (e.g., poison cloud):
  hazard?: import("@types/core").HazardSpec;
}
