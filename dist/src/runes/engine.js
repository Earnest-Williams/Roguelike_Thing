import { resolveAttack } from "@combat/resolve";
import { EVENT, emit } from "@ui/event-log";
import { RUNE_EFFECT } from "./types.js";
export class RuneStore {
    constructor() {
        this.byTile = new Map();
        this.byDoor = new Map();
        this.byItem = new WeakMap();
        this.all = new Set();
    }
    key(x, y, layer = 0) {
        return `${x},${y},${layer}`;
    }
    addTileRune(r, x, y, layer = 0) {
        const k = this.key(x, y, layer);
        const list = this.byTile.get(k) ?? [];
        list.push(r);
        this.byTile.set(k, list);
        this.all.add(r);
        r.pos = { x, y, layer };
    }
    addDoorRune(r, door) {
        const list = this.byDoor.get(door) ?? [];
        list.push(r);
        this.byDoor.set(door, list);
        this.all.add(r);
        r.door = door;
    }
    addItemRune(r, item) {
        const list = this.byItem.get(item) ?? [];
        list.push(r);
        this.byItem.set(item, list);
        this.all.add(r);
        r.item = item;
    }
    remove(r) {
        this.all.delete(r);
        // Omit index cleanup for brevity; implement as needed.
    }
}
export function makeRuneInstance(def, owner) {
    return {
        def,
        ownerId: owner?.ownerId ?? null,
        ownerFaction: owner?.ownerFaction ?? [],
        armedAtTurn: null,
        chargesLeft: def.charges,
        lastFiredTurn: -1,
        detectedBy: new Set(),
        hp: def.security?.glyphHP ?? 5,
    };
}
export function armRune(r, turn) {
    r.armedAtTurn = turn + (r.def.armingTime ?? 0);
}
function allowedByWard(r, actor, ctx) {
    const w = r.def.ward;
    if (!w)
        return true;
    if (w.ownerId && actor.id === w.ownerId)
        return true;
    if (w.allowFactions?.some((f) => actor.factions?.includes(f)))
        return true;
    if (w.denyFactions?.some((f) => actor.factions?.includes(f)))
        return false;
    return true;
}
const isArmed = (r, turn) => r.armedAtTurn !== null && turn >= r.armedAtTurn;
const offCooldown = (r, turn) => (turn - r.lastFiredTurn) >= (r.def.cooldown ?? 0);
const spendCharge = (r) => (r.chargesLeft < 0 ? true : (--r.chargesLeft, r.chargesLeft >= 0));
function fireAttackRune(rune, attacker, victims, turn) {
    const packets = Object.entries(rune.def.prePackets ?? {}).map(([type, amount]) => ({ type, amount }));
    return victims.map((target) => resolveAttack({
        attacker,
        defender: target,
        turn,
        packets,
        statusAttempts: rune.def.statusAttempts,
        tags: ["rune", ...(rune.def.tags || [])],
    }));
}
export function tryTriggerRune(args) {
    const { rune, actor, ctx } = args;
    const turn = ctx.turn ?? actor.__turn ?? 0;
    if (!isArmed(rune, turn) || !offCooldown(rune, turn))
        return false;
    if (!allowedByWard(rune, actor, ctx))
        return false;
    if (rune.def.condition && !rune.def.condition({ actor, rune }))
        return false;
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
        if (rune.chargesLeft === 0)
            ctx.removeRune?.(rune);
    }
    return fired;
}
