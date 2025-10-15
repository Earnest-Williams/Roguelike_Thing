import { RUNE_TRIGGER } from "./types";
import { tryTriggerRune } from "./engine";
export function onAttemptOpenDoor(gameCtx, actor, door) {
    const list = gameCtx.runeStore.byDoor.get(door) ?? [];
    for (const r of list)
        if (r.def.trigger === RUNE_TRIGGER.OPEN) {
            const fired = tryTriggerRune({ rune: r, actor, ctx: gameCtx });
            if (fired)
                return false; // sealed or consumed the interaction
        }
    return true;
}
export function onStepIntoTile(gameCtx, actor, x, y, layer = 0) {
    const key = `${x},${y},${layer}`;
    const list = gameCtx.runeStore.byTile.get(key) ?? [];
    for (const r of list)
        if (r.def.trigger === RUNE_TRIGGER.STEP_ON) {
            tryTriggerRune({ rune: r, actor, ctx: gameCtx });
        }
}
export function tickRunes(gameCtx) {
    for (const r of gameCtx.runeStore.all) {
        if (r.def.trigger === RUNE_TRIGGER.TIMER) {
            tryTriggerRune({ rune: r, actor: gameCtx.player, ctx: gameCtx });
        }
        else if (r.def.trigger === RUNE_TRIGGER.PROXIMITY && r.pos && gameCtx.findNearestHostile && r.def.losRange) {
            const hostile = gameCtx.findNearestHostile(r.pos, r.def.losRange);
            if (hostile)
                tryTriggerRune({ rune: r, actor: hostile, ctx: gameCtx });
        }
    }
}
