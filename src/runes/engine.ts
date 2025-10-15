// @ts-nocheck
import type { ActorLike, GameCtx } from "@types/core";
import { resolveAttack } from "@combat/resolve";
import { EVENT, emit } from "@ui/event-log";
import { RUNE_TRIGGER, RUNE_EFFECT, type RuneDef, type RuneInstance } from "./types";

export class RuneStore {
  readonly byTile = new Map<string, RuneInstance[]>();
  readonly byDoor = new Map<any, RuneInstance[]>();
  readonly byItem = new WeakMap<object, RuneInstance[]>();
  readonly all = new Set<RuneInstance>();
  private key(x: number, y: number, layer = 0) {
    return `${x},${y},${layer}`;
  }
  addTileRune(r: RuneInstance, x: number, y: number, layer = 0): void {
    const k = this.key(x, y, layer);
    const list = this.byTile.get(k) ?? [];
    list.push(r);
    this.byTile.set(k, list);
    this.all.add(r);
    r.pos = { x, y, layer };
  }
  addDoorRune(r: RuneInstance, door: unknown): void {
    const list = this.byDoor.get(door) ?? [];
    list.push(r);
    this.byDoor.set(door, list);
    this.all.add(r);
    r.door = door;
  }
  addItemRune(r: RuneInstance, item: object): void {
    const list = this.byItem.get(item) ?? [];
    list.push(r);
    this.byItem.set(item, list);
    this.all.add(r);
    r.item = item;
  }
  remove(r: RuneInstance): void {
    this.all.delete(r);
    // Omit index cleanup for brevity; implement as needed.
  }
}

export function makeRuneInstance(def: RuneDef, owner?: { ownerId?: string | null; ownerFaction?: string[] }): RuneInstance {
  return {
    def,
    ownerId: owner?.ownerId ?? null,
    ownerFaction: owner?.ownerFaction ?? [],
    armedAtTurn: null,
    chargesLeft: def.charges,
    lastFiredTurn: -1,
    detectedBy: new Set<string>(),
    hp: def.security?.glyphHP ?? 5,
  };
}

export function armRune(r: RuneInstance, turn: number): void {
  r.armedAtTurn = turn + (r.def.armingTime ?? 0);
}

function allowedByWard(r: RuneInstance, actor: ActorLike, ctx: GameCtx): boolean {
  const w = r.def.ward;
  if (!w) return true;
  if (w.ownerId && actor.id === w.ownerId) return true;
  if (w.allowFactions?.some((f) => actor.factions?.includes(f))) return true;
  if (w.denyFactions?.some((f) => actor.factions?.includes(f))) return false;
  return true;
}
const isArmed = (r: RuneInstance, turn: number) => r.armedAtTurn !== null && turn >= r.armedAtTurn!;
const offCooldown = (r: RuneInstance, turn: number) => (turn - r.lastFiredTurn) >= (r.def.cooldown ?? 0);
const spendCharge = (r: RuneInstance) => (r.chargesLeft < 0 ? true : (--r.chargesLeft, r.chargesLeft >= 0));

function fireAttackRune(rune: RuneInstance, attacker: ActorLike, victims: ActorLike[], turn: number) {
  const packets = Object.entries(rune.def.prePackets ?? {}).map(([type, amount]) => ({ type, amount }));
  return victims.map((target) =>
    resolveAttack({
      attacker,
      defender: target,
      turn,
      packets,
      statusAttempts: rune.def.statusAttempts,
      tags: ["rune", ...(rune.def.tags || [])],
    })
  );
}

export function tryTriggerRune(args: { rune: RuneInstance; actor: ActorLike; ctx: GameCtx }): boolean {
  const { rune, actor, ctx } = args;
  const turn = ctx.turn ?? actor.__turn ?? 0;
  if (!isArmed(rune, turn) || !offCooldown(rune, turn)) return false;
  if (!allowedByWard(rune, actor, ctx)) return false;
  if (rune.def.condition && !rune.def.condition({ actor, rune })) return false;

  let fired = false;

  switch (rune.def.effect) {
    case RUNE_EFFECT.ATTACK: {
      const victims = ctx.getVictimsForRune?.({ rune, actor }) ?? [];
      if (victims.length) {
        fireAttackRune(rune, ctx.runeAttackerProxy ?? actor, victims, turn);
        fired = true;
      }
      break;
    }
    case RUNE_EFFECT.HAZARD: {
      if (rune.def.hazard && ctx.addHazard && rune.pos) {
        ctx.addHazard({ ...rune.def.hazard, pos: rune.pos, source: ctx.player });
        fired = true;
      }
      break;
    }
    case RUNE_EFFECT.SEAL: {
      // Block attempted action (supply blockAction in your game ctx if desired).
      // Optional backlash:
      if (rune.def.prePackets && Object.keys(rune.def.prePackets).length) {
        fireAttackRune(rune, ctx.runeAttackerProxy ?? actor, [actor], turn);
      }
      fired = true;
      break;
    }
    case RUNE_EFFECT.WARD: {
      rune.def.onUtility?.({ actor, rune, ctx });
      fired = true;
      break;
    }
    case RUNE_EFFECT.UTILITY: {
      rune.def.onUtility?.({ actor, rune, ctx });
      fired = true;
      break;
    }
  }

  if (fired) {
    rune.lastFiredTurn = turn;
    spendCharge(rune);
    emit(EVENT.RUNE_TRIGGER, { rune, actor });
    if (rune.chargesLeft === 0) ctx.removeRune?.(rune);
  }
  return fired;
}
