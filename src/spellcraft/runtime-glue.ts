// @ts-nocheck
import type { ActorLike, GameCtx } from "@types/core";
import { castSpell } from "@spells/engine";
import type { SpellDef } from "@spells/types";

export class KnowledgeBook {
  readonly unlocked = new Set<string>();
  unlock(id: string) { this.unlocked.add(id); }
  has(id: string) { return this.unlocked.has(id); }
  toJSON(): string[] { return Array.from(this.unlocked); }
  static from(json: string[]) { const kb = new KnowledgeBook(); json.forEach((id) => kb.unlock(id)); return kb; }
}

export class Blueprint {
  constructor(
    public id: string,
    public name: string,
    public fragmentIds: string[],
    public def: SpellDef
  ) {}
}

export function castCrafted(args: {
  actor: ActorLike & { __spellCD?: Record<string, number> };
  blueprint: Blueprint;
  ctx: GameCtx & { targetPos?: { x: number; y: number }; targetActor?: ActorLike };
}) {
  return castSpell({ actor: args.actor, ctx: args.ctx, defOverride: args.blueprint.def });
}
