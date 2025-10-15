// @ts-nocheck
import type { SpellDef } from "@spells/types";

export const KINDS = {
  CORE: "core",
  FORM: "form",
  VECTOR: "vector",
  AUGMENT: "augment",
  METER: "meter",
} as const;
export type FragmentKind = typeof KINDS[keyof typeof KINDS];

export interface KnowledgeFragment {
  id: string;
  kind: FragmentKind;
  tags: string[];
  powerCost: number;
  apply(acc: CompileAccumulator, ctx: { tier: number }): void;
}

export interface CompileAccumulator {
  name: string[];
  tags: Set<string>;
  prePackets: Record<string, number>;
  statusAttempts: import("@types/core").StatusAttempt[];
  targetKind: SpellDef["targetKind"];
  shape: NonNullable<SpellDef["shape"]>;
  vector: Record<string, unknown>;
  utility: string | null;
  preMult: number;
  costMult: number;
  cdMult: number;
  _source: string[];
  _hazard: SpellDef["hazard"] | null;
}

export interface CompileOptions {
  tier?: number;
  idHint?: string;
}
