import type { ActorLike, GameCtx } from "@types/core";
import { resolveAttack } from "@combat/resolve";
import { EVENT, emit } from "@ui/event-log";
import type { SpellDef } from "./types";
import { SPELLS } from "./registry";

function getCooldownRemaining(
  actor: ActorLike & { __spellCD?: Record<string, number> },
  spellId: string,
  turn: number
): number {
  const cd = actor.__spellCD?.[spellId] ?? 0;
  return Math.max(0, cd - turn);
}

function setCooldown(
  actor: ActorLike & { __spellCD?: Record<string, number> },
  spellId: string,
  baseCooldown: number
): void {
  const m = actor.modCache?.temporal?.cooldownMult ?? 1;
  const tagMult = actor.modCache?.temporal?.cooldownPerTag?.get?.("spell") ?? 1;
  const turns = Math.max(0, Math.round(baseCooldown * m * tagMult));
  (actor.__spellCD ||= {})[spellId] = (actor.__turn ?? 0) + turns;
}

function payCosts(actor: ActorLike, baseCost: SpellDef["cost"]): boolean {
  const cMul = actor.modCache?.resource?.costMult || {};
  const mana = Math.ceil((baseCost.mana || 0) * (cMul.mana ?? 1));
  const stamina = Math.ceil((baseCost.stamina || 0) * (cMul.stamina ?? 1));
  if ((actor.res.mana ?? 0) < mana) return false;
  if ((actor.res.stamina ?? 0) < stamina) return false;
  if (mana) actor.res.mana = (actor.res.mana ?? 0) - mana;
  if (stamina) actor.res.stamina = (actor.res.stamina ?? 0) - stamina;
  if (baseCost.hp) actor.res.hp = Math.max(0, actor.res.hp - baseCost.hp);
  return true;
}

function inRange(a: { x?: number; y?: number }, b: { x: number; y: number }, r: number) {
  if (a.x == null || a.y == null) return false;
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= r;
}

export interface CastArgs {
  actor: ActorLike & { __spellCD?: Record<string, number> };
  spellId?: string;
  ctx: GameCtx & {
    targetPos?: { x: number; y: number };
    targetActor?: ActorLike;
  };
  /** Pass a compiled/crafted definition to bypass registry lookup. */
  defOverride?: SpellDef;
}

/** Returns ok plus per-target resolve results (if any). */
export function castSpell(args: CastArgs): { ok: boolean; results?: any[]; reason?: string } {
  const { actor, ctx, defOverride } = args;
  const def: SpellDef | undefined = defOverride ?? (args.spellId ? SPELLS[args.spellId] : undefined);
  if (!def) return { ok: false, reason: "unknown" };

  const turn = ctx.turn ?? actor.__turn ?? 0;
  if (actor.statusDerived?.canAct === false) return { ok: false, reason: "stunned" };
  if (!defOverride && args.spellId && getCooldownRemaining(actor, args.spellId, turn) > 0)
    return { ok: false, reason: "cooldown" };
  if (!payCosts(actor, def.cost || {})) return { ok: false, reason: "cost" };

  // Utility-only spells
  if (typeof def.onCast === "function") {
    if (!ctx.targetPos) return { ok: false, reason: "no-target" };
    def.onCast({ actor, targetPos: ctx.targetPos, canOccupy: ctx.canOccupy });
    if (args.spellId) setCooldown(actor, args.spellId, def.cooldown);
    emit(EVENT.SPELL_CAST, { def, actor });
    return { ok: true };
  }

  // Collect targets (minimal shapes — extend as needed)
  const targets: ActorLike[] = [];
  if (def.targetKind === "self") {
    targets.push(actor);
  } else if (def.targetKind === "actor" && ctx.targetActor && inRange(actor, ctx.targetActor, def.range)) {
    targets.push(ctx.targetActor);
  } else if (def.targetKind === "circle" && ctx.targetPos) {
    const r = def.shape?.radius ?? 1;
    const all = [ctx.player, ...(ctx.mobManager?.list ?? [])]
      .map((m) => (m?.__actor ?? m) as ActorLike)
      .filter(Boolean);
    for (const a of all) {
      if (inRange(a, ctx.targetPos, r)) targets.push(a);
    }
  }

  const packets = Object.entries(def.prePackets || {}).map(([type, amount]) => ({ type, amount }));

  const results = targets.map((t) =>
    resolveAttack({
      attacker: actor,
      defender: t,
      turn,
      packets,
      statusAttempts: def.statusAttempts,
      tags: ["spell", ...def.tags],
    })
  );

  if (def.hazard && ctx.addHazard && ctx.targetPos) {
    ctx.addHazard({ ...def.hazard, pos: ctx.targetPos, source: actor });
  }

  if (args.spellId) setCooldown(actor, args.spellId, def.cooldown);
  emit(EVENT.SPELL_CAST, { def, actor, results });
  return { ok: true, results };
}
