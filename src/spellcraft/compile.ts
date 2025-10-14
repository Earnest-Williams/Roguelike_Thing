import type { SpellDef } from "@spells/types";
import { LIB } from "./library";
import { KINDS, type KnowledgeFragment, type CompileAccumulator, type CompileOptions } from "./types";

export const MAX_SLOTS: Readonly<Record<string, number>> = {
  [KINDS.CORE]: 1,
  [KINDS.FORM]: 1,
  [KINDS.VECTOR]: 1,
  [KINDS.AUGMENT]: 3,
  [KINDS.METER]: 2,
};

export function budgetForTier(tier = 1): number {
  return 16 + (tier - 1) * 4;
}

export function compileSpell(
  fragmentIds: string[],
  opts: CompileOptions = {}
): SpellDef {
  const tier = opts.tier ?? 1;
  const acc: CompileAccumulator = {
    name: [],
    tags: new Set(["spell", "custom"]),
    prePackets: {},
    statusAttempts: [],
    targetKind: "actor",
    shape: {},
    vector: {},
    utility: null,
    preMult: 1,
    costMult: 1,
    cdMult: 1,
    _hazard: null,
    _source: [],
  };

  const slots: Record<string, number> = {};
  let spent = 0;

  for (const id of fragmentIds) {
    const f = LIB[id];
    if (!f) throw new Error(`Unknown fragment ${id}`);
    slots[f.kind] = (slots[f.kind] || 0) + 1;
    if (slots[f.kind] > (MAX_SLOTS[f.kind] ?? 0)) {
      throw new Error(`Too many ${f.kind} fragments`);
    }
    spent += f.powerCost;
    acc._source.push(id);
  }

  const cap = budgetForTier(tier);
  if (spent > cap) throw new Error(`Budget exceeded: ${spent}/${cap}`);

  for (const id of fragmentIds) {
    const f = LIB[id] as KnowledgeFragment;
    f.apply(acc, { tier });
    f.tags?.forEach((t) => acc.tags.add(t));
  }

  // finalize numbers
  for (const [k, v] of Object.entries(acc.prePackets)) {
    acc.prePackets[k] = Math.round(v * acc.preMult);
  }

  const baseMana = Math.max(2, Math.ceil(spent * 1.1));
  const baseCD = Math.max(0, Math.round(Math.sqrt(spent) - 1));
  const baseAP = 90 + Math.min(60, spent * 5);

  const def: SpellDef = {
    id: `${opts.idHint ?? "crafted"}:${acc._source.join("+")}`,
    name: acc.name.length ? acc.name.join(" ") : "Custom Spell",
    tags: Array.from(acc.tags),
    cost: { mana: Math.ceil(baseMana * acc.costMult) },
    apCost: baseAP,
    cooldown: Math.round(baseCD * acc.cdMult),
    range: 6,
    targetKind: acc.targetKind,
    shape: acc.shape,
    prePackets: acc.prePackets,
    statusAttempts: acc.statusAttempts,
  };

  return def;
}
