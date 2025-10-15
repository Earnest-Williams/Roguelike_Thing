// src/game/monster.js
// @ts-nocheck
import { SLOT, LIGHT_CHANNELS } from "../../js/constants.js";
import { MOB_TEMPLATES, cloneGuardConfig, cloneWanderConfig } from "../content/mobs.js";
import { planTurn } from "../combat/ai-planner.js";
import { updatePerception } from "../combat/perception.js";
import { executeDecision } from "../combat/actions.js";
import { rebuildModCache } from "../combat/mod-folding.js";
/**
 * @file Monster
 * World-entity wrapper around a combat `Actor`. This is the **only** Monster
 * definition in the codebase; import from `src/game/monster.js` everywhere.
 *
 * Responsibilities:
 *  - Maintain world position/ids for rendering & scheduling
 *  - Proxy combat state to the underlying Actor
 *  - Expose `getLightRadius()` so vision code can read the actor's folded mods
 *  - Delegate turns to the AI planner via `takeTurn(ctx)`
 */
/**
 * World entity wrapper around a combat actor.
 */
export class Monster {
    constructor({ actor, glyph = "?", color = "#fff", baseDelay = 1, guard = null, wander = null, spawnPos = null, homePos = null, } = {}) {
        if (!actor)
            throw new Error("Monster requires an actor instance");
        this.__actor = actor;
        if (actor) {
            rebuildModCache(actor);
        }
        this.glyph = glyph;
        this.color = color;
        this.baseDelay = Number.isFinite(baseDelay) && baseDelay > 0 ? baseDelay : 1;
        this.nextActAt = 0;
        this.x = 0;
        this.y = 0;
        this.kind = "monster";
        this.id = `${actor.id}#${Math.random().toString(36).slice(2, 7)}`;
        this.name = actor.name ?? actor.id ?? "monster";
        this.__template = actor.__template || null;
        let resolvedSpawn = null;
        let spawnExplicit = false;
        let spawnFromFallback = false;
        if (isPoint(spawnPos)) {
            resolvedSpawn = clonePoint(spawnPos);
            spawnExplicit = true;
        }
        else if (isPoint(actor.spawnPos)) {
            resolvedSpawn = clonePoint(actor.spawnPos);
            spawnExplicit = true;
        }
        else {
            const fallbackSpawn = snapshotPosition(actor);
            if (fallbackSpawn) {
                resolvedSpawn = fallbackSpawn;
                spawnFromFallback = true;
            }
        }
        this.spawnPos = resolvedSpawn;
        this._spawnFromFallback = spawnFromFallback && !spawnExplicit;
        const actorHome = clonePoint(actor.homePos);
        const actorHomePlaceholder = actorHome
            && actorHome.x === 0 && actorHome.y === 0
            && !spawnExplicit
            && !isPoint(homePos);
        const homeExplicitParam = isPoint(homePos);
        let resolvedHome = null;
        let homeFromFallback = false;
        if (homeExplicitParam) {
            resolvedHome = clonePoint(homePos);
        }
        else if (actorHome && !actorHomePlaceholder) {
            resolvedHome = actorHome;
        }
        else if (resolvedSpawn) {
            resolvedHome = { ...resolvedSpawn };
            homeFromFallback = true;
        }
        this.homePos = resolvedHome;
        this._homeFromFallback = homeFromFallback || (!resolvedHome && !homeExplicitParam);
        if (this.homePos && !spawnExplicit && !homeExplicitParam && this.homePos.x === 0 && this.homePos.y === 0) {
            this._homeFromFallback = true;
        }
        const guardSource = guard ?? actor.guard ?? actor.__template?.guard ?? null;
        const wanderSource = wander ?? actor.wander ?? actor.__template?.wander ?? null;
        this.guard = cloneGuardConfig(guardSource);
        this.wander = cloneWanderConfig(wanderSource);
        this.guardRadius = resolveRadius(this.guard, actor.guardRadius, actor.__template?.guardRadius);
        this.wanderRadius = resolveRadius(this.wander, actor.wanderRadius, actor.__template?.wanderRadius);
        this.guardResumeBias = resolveResumeBias(this.guard, actor.guardResumeBias);
        this.wanderResumeBias = resolveResumeBias(this.wander, actor.wanderResumeBias);
        this.lightMask = actor.lightMask ?? LIGHT_CHANNELS.ALL;
        this.lightChannel = actor.lightChannel ?? LIGHT_CHANNELS.ALL;
        if (this.spawnPos) {
            actor.spawnPos = clonePoint(this.spawnPos);
        }
        if (!this.homePos && this.spawnPos) {
            this.homePos = { ...this.spawnPos };
            this._homeFromFallback = false;
        }
        if (!this.homePos && this.guard?.anchor) {
            this.homePos = clonePoint(this.guard.anchor);
            this._homeFromFallback = false;
        }
        if (this.homePos) {
            actor.homePos = clonePoint(this.homePos);
        }
        syncBehaviorToActor(this);
        updateAnchorsFromPosition(this);
    }
    get actor() {
        return this.__actor;
    }
    get factions() {
        return this.__actor?.factions || [];
    }
    get affiliations() {
        return this.__actor?.affiliations || [];
    }
    get res() {
        return this.__actor?.res;
    }
    set res(value) {
        if (this.__actor) {
            this.__actor.res = value;
        }
    }
    get resources() {
        return this.__actor?.resources;
    }
    set resources(value) {
        if (this.__actor) {
            this.__actor.resources = value;
        }
    }
    get modCache() {
        return this.__actor?.modCache;
    }
    set modCache(value) {
        if (this.__actor) {
            this.__actor.modCache = value;
        }
    }
    get statusDerived() {
        return this.__actor?.statusDerived;
    }
    set statusDerived(value) {
        if (this.__actor) {
            this.__actor.statusDerived = value;
        }
    }
    get statuses() {
        return this.__actor?.statuses;
    }
    set statuses(value) {
        if (!this.__actor)
            return;
        if (Array.isArray(value)) {
            this.__actor.statuses = value;
            return;
        }
        this.__actor.statuses = [];
    }
    get actions() {
        return this.__actor?.actions;
    }
    get equipment() {
        return this.__actor?.equipment;
    }
    get hp() {
        return this.__actor?.res?.hp ?? 0;
    }
    set hp(value) {
        if (this.__actor?.res) {
            this.__actor.res.hp = value;
        }
    }
    get maxHp() {
        return this.__actor?.base?.maxHP ?? this.__actor?.baseStats?.maxHP ?? 0;
    }
    set maxHp(value) {
        if (this.__actor?.base) {
            this.__actor.base.maxHP = value;
        }
        if (this.__actor?.baseStats) {
            this.__actor.baseStats.maxHP = value;
        }
    }
    get pos() {
        return { x: this.x, y: this.y };
    }
    set pos(p) {
        if (!p)
            return;
        this.x = p.x | 0;
        this.y = p.y | 0;
        const valid = Number.isFinite(this.x) && Number.isFinite(this.y);
        if (valid && (!this.spawnPos || this._spawnFromFallback)) {
            this.spawnPos = { x: this.x, y: this.y };
            this._spawnFromFallback = false;
        }
        if (valid && (!this.homePos || this._homeFromFallback)) {
            this.homePos = { x: this.x, y: this.y };
            this._homeFromFallback = false;
        }
        updateAnchorsFromPosition(this);
    }
    /** Visible-light radius is defined by the Actor. */
    getLightRadius() {
        return typeof this.__actor?.getLightRadius === "function"
            ? this.__actor.getLightRadius()
            : 0;
    }
    onTurnStart(turn) {
        if (typeof this.__actor?.onTurnStart === "function") {
            this.__actor.onTurnStart(turn);
        }
    }
    /**
     * Execute a full AI turn for the monster.
     *
     * 1. Refresh perception so `planTurn` sees the latest world state.
     * 2. Ask the combat planner for a decision (`planTurn`).
     * 3. Hand that decision to the action executor (`executeDecision`).
     * 4. Refresh perception again so downstream actors see updated positions/hp.
     * 5. Return the resolved delay so the scheduler knows when we can act again.
     */
    async takeTurn(ctx = {}) {
        const world = (ctx && typeof ctx === "object" && ctx.world)
            ? ctx.world
            : ctx || {};
        const rng = resolveRng(ctx?.rng ?? world?.rng);
        updateAnchorsFromPosition(this);
        if (world && typeof world === "object") {
            if (this.guard && world.guard == null) {
                world.guard = cloneGuardConfig(this.guard);
            }
            if (this.wander && world.wander == null) {
                world.wander = cloneWanderConfig(this.wander);
            }
        }
        this.perception = updatePerception(this, world);
        const decision = planTurn({
            actor: this,
            combatant: this.__actor,
            selfMob: this,
            world,
            perception: this.perception,
            rng,
            now: ctx?.now,
            guard: this.guard ? cloneGuardConfig(this.guard) : null,
            wander: this.wander ? cloneWanderConfig(this.wander) : null,
        });
        this.lastPlannerDecision = decision;
        if (this.__actor && this.__actor !== this) {
            this.__actor.lastPlannerDecision = decision;
        }
        const delay = await executeDecision({
            actor: this,
            combatant: this.__actor,
            world,
            decision,
            rng,
            now: ctx?.now,
        });
        this.perception = updatePerception(this, world);
        const resolved = Number.isFinite(delay) ? delay : this.baseDelay;
        return resolved > 0 ? resolved : this.baseDelay;
    }
}
function resolveRng(source) {
    if (typeof source === "function")
        return source;
    if (typeof source?.next === "function") {
        return () => source.next();
    }
    if (typeof source?.random === "function") {
        return () => source.random();
    }
    return Math.random;
}
function resolveRadius(config, ...fallbacks) {
    if (config && typeof config.radius === "number")
        return config.radius;
    for (const value of fallbacks) {
        if (Number.isFinite(value))
            return value;
    }
    return null;
}
function resolveResumeBias(config, fallback) {
    if (config && typeof config.resumeBias === "number")
        return clamp01(config.resumeBias);
    if (Number.isFinite(fallback))
        return clamp01(fallback);
    return null;
}
function snapshotPosition(entity) {
    if (!entity)
        return null;
    if (Number.isFinite(entity.x) && Number.isFinite(entity.y)) {
        return { x: entity.x | 0, y: entity.y | 0 };
    }
    if (isPoint(entity.spawnPos)) {
        return clonePoint(entity.spawnPos);
    }
    const pos = typeof entity.pos === "function" ? entity.pos() : entity.pos;
    if (isPoint(pos)) {
        return clonePoint(pos);
    }
    return null;
}
function clonePoint(point) {
    return isPoint(point) ? { x: point.x | 0, y: point.y | 0 } : null;
}
function clamp01(value) {
    const v = Number(value);
    if (!Number.isFinite(v))
        return 0;
    if (v <= 0)
        return 0;
    if (v >= 1)
        return 1;
    return v;
}
function isPoint(obj) {
    return obj && Number.isFinite(obj.x) && Number.isFinite(obj.y);
}
function computeAnchor(monster, guard) {
    if (!monster || !guard)
        return null;
    if (isPoint(guard.anchor)) {
        return { x: guard.anchor.x | 0, y: guard.anchor.y | 0 };
    }
    const base = monster.homePos || monster.spawnPos || monster.__actor?.homePos || monster.__actor?.spawnPos;
    const resolvedBase = isPoint(base)
        ? { x: base.x | 0, y: base.y | 0 }
        : Number.isFinite(monster.x) && Number.isFinite(monster.y)
            ? { x: monster.x | 0, y: monster.y | 0 }
            : null;
    if (!resolvedBase)
        return null;
    if (guard.anchorOffset && isPoint(guard.anchorOffset)) {
        return {
            x: resolvedBase.x + (guard.anchorOffset.x | 0),
            y: resolvedBase.y + (guard.anchorOffset.y | 0),
        };
    }
    return { ...resolvedBase };
}
function updateAnchorsFromPosition(monster) {
    if (!monster || typeof monster !== "object")
        return;
    const actor = monster.actor ?? monster.__actor ?? null;
    if (monster.spawnPos) {
        if (!Number.isFinite(monster.spawnPos.x) || !Number.isFinite(monster.spawnPos.y)) {
            monster.spawnPos = null;
        }
    }
    if (monster.homePos) {
        if (!Number.isFinite(monster.homePos.x) || !Number.isFinite(monster.homePos.y)) {
            monster.homePos = null;
        }
    }
    if (monster.guard) {
        const anchor = computeAnchor(monster, monster.guard);
        if (anchor) {
            monster.guard.anchor = anchor;
            if (!monster.homePos) {
                monster.homePos = { ...anchor };
                monster._homeFromFallback = false;
            }
            if (actor) {
                actor.guard = cloneGuardConfig(monster.guard);
                actor.homePos = actor.homePos ?? { ...anchor };
            }
        }
        if (typeof monster.guard.radius === "number") {
            monster.guardRadius = monster.guard.radius;
            if (actor)
                actor.guardRadius = monster.guard.radius;
        }
        if (typeof monster.guard.resumeBias === "number" && actor) {
            actor.guardResumeBias = clamp01(monster.guard.resumeBias);
        }
    }
    if (monster.wander) {
        if (typeof monster.wander.radius === "number") {
            monster.wanderRadius = monster.wander.radius;
            if (actor)
                actor.wanderRadius = monster.wander.radius;
        }
        if (typeof monster.wander.resumeBias === "number" && actor) {
            actor.wanderResumeBias = clamp01(monster.wander.resumeBias);
        }
        if (!monster.wander.anchor && monster.guard?.anchor) {
            monster.wander.anchor = { ...monster.guard.anchor };
        }
    }
    if (monster.spawnPos && actor && !actor.spawnPos) {
        actor.spawnPos = { ...monster.spawnPos };
    }
    if (monster.homePos && actor && !actor.homePos) {
        actor.homePos = { ...monster.homePos };
    }
    if (monster.homePos) {
        monster._homeFromFallback = false;
    }
}
function syncBehaviorToActor(monster) {
    if (!monster || typeof monster !== "object")
        return;
    const actor = monster.actor ?? monster.__actor ?? null;
    if (!actor || actor === monster)
        return;
    if (monster.guard) {
        actor.guard = cloneGuardConfig(monster.guard);
        if (typeof monster.guard.radius === "number") {
            actor.guardRadius = monster.guard.radius;
        }
        if (typeof monster.guard.resumeBias === "number") {
            actor.guardResumeBias = clamp01(monster.guard.resumeBias);
        }
    }
    else if (actor.guard) {
        monster.guard = cloneGuardConfig(actor.guard);
    }
    if (monster.wander) {
        actor.wander = cloneWanderConfig(monster.wander);
        if (typeof monster.wander.radius === "number") {
            actor.wanderRadius = monster.wander.radius;
        }
        if (typeof monster.wander.resumeBias === "number") {
            actor.wanderResumeBias = clamp01(monster.wander.resumeBias);
        }
    }
    else if (actor.wander) {
        monster.wander = cloneWanderConfig(actor.wander);
    }
    if (Number.isFinite(monster.guardRadius)) {
        actor.guardRadius = monster.guardRadius;
    }
    if (Number.isFinite(monster.wanderRadius)) {
        actor.wanderRadius = monster.wanderRadius;
    }
    if (Number.isFinite(monster.guardResumeBias)) {
        actor.guardResumeBias = clamp01(monster.guardResumeBias);
    }
    if (Number.isFinite(monster.wanderResumeBias)) {
        actor.wanderResumeBias = clamp01(monster.wanderResumeBias);
    }
    if (monster.spawnPos) {
        actor.spawnPos = { ...monster.spawnPos };
    }
    if (monster.homePos && !actor.homePos) {
        actor.homePos = { ...monster.homePos };
    }
}
const HAND_SLOTS = [SLOT.LeftHand, SLOT.RightHand];
function resolveActor(entity) {
    if (!entity)
        return null;
    if (entity.__actor && entity.__actor !== entity)
        return resolveActor(entity.__actor);
    if (entity.actor && entity.actor !== entity)
        return resolveActor(entity.actor);
    return entity;
}
function hasEquipped(actor, slot) {
    if (!actor?.equipment)
        return false;
    const current = actor.equipment[slot];
    if (current)
        return true;
    if (slot === SLOT.LeftHand || slot === SLOT.RightHand) {
        const other = slot === SLOT.LeftHand ? SLOT.RightHand : SLOT.LeftHand;
        const otherItem = actor.equipment[other];
        if (otherItem && otherItem.handsRequired === 2) {
            return true;
        }
    }
    return false;
}
function tryEquip(actor, item, preferredSlots = []) {
    if (!actor || !item || typeof actor.equip !== "function")
        return false;
    const slots = Array.isArray(preferredSlots) && preferredSlots.length
        ? preferredSlots.slice()
        : Array.isArray(item.equipSlots)
            ? item.equipSlots.slice()
            : [];
    for (const slot of slots) {
        if (!slot)
            continue;
        if (typeof item.canEquipTo === "function" && !item.canEquipTo(slot))
            continue;
        if (hasEquipped(actor, slot))
            continue;
        if (item.handsRequired === 2 && HAND_SLOTS.includes(slot)) {
            const other = slot === SLOT.LeftHand ? SLOT.RightHand : SLOT.LeftHand;
            if (hasEquipped(actor, other))
                continue;
            actor.equip(slot, item);
            actor.equip(other, item);
            return true;
        }
        actor.equip(slot, item);
        return true;
    }
    return false;
}
/**
 * Equipment loadouts by monster template id.
 */
export const MONSTER_LOADOUTS = {
    orc(actor, rng, createItem) {
        if (!actor || typeof createItem !== "function")
            return;
        const roll = typeof rng === "function" ? rng : Math.random;
        if (!hasEquipped(actor, SLOT.RightHand) && !hasEquipped(actor, SLOT.LeftHand)) {
            const weaponId = roll() < 0.5 ? "mace" : "long_sword";
            tryEquip(actor, createItem(weaponId), [SLOT.RightHand, SLOT.LeftHand]);
        }
        if (!hasEquipped(actor, SLOT.Head) && roll() < 0.5) {
            tryEquip(actor, createItem("leather_cap"), [SLOT.Head]);
        }
        if (!hasEquipped(actor, SLOT.BodyArmor) && roll() < 0.5) {
            tryEquip(actor, createItem("basic_clothes"), [SLOT.BodyArmor]);
        }
        if (!hasEquipped(actor, SLOT.Boots) && roll() < 0.6) {
            tryEquip(actor, createItem("boots"), [SLOT.Boots]);
        }
        if (roll() < 0.25) {
            const torch = createItem("torch");
            tryEquip(actor, torch, [SLOT.LeftHand, SLOT.RightHand, SLOT.Belt1, SLOT.Belt2, SLOT.Belt3, SLOT.Belt4]);
        }
    },
    skeleton(actor, rng, createItem) {
        if (!actor || typeof createItem !== "function")
            return;
        const roll = typeof rng === "function" ? rng : Math.random;
        if (!hasEquipped(actor, SLOT.RightHand) && !hasEquipped(actor, SLOT.LeftHand)) {
            const weaponId = roll() < 0.5 ? "dagger" : "short_sword";
            tryEquip(actor, createItem(weaponId), [SLOT.RightHand, SLOT.LeftHand]);
        }
        if (!hasEquipped(actor, SLOT.BodyArmor) && roll() < 0.25) {
            tryEquip(actor, createItem("cloak"), [SLOT.Cloak, SLOT.BodyArmor]);
        }
        // Skeletons must not produce functional lights; deliberately skip torches.
    },
};
export function applyLoadout(entity, templateId, rng = Math.random, createItemFn = null) {
    const actor = resolveActor(entity);
    if (!actor)
        return;
    const maker = typeof createItemFn === "function" ? createItemFn : null;
    if (!maker)
        return;
    const template = MOB_TEMPLATES?.[templateId];
    const fn = MONSTER_LOADOUTS[templateId];
    const wrappedCreate = (id) => {
        const item = maker(id);
        if (templateId === "skeleton") {
            extinguishLight(item);
        }
        return item;
    };
    if (typeof fn === "function") {
        fn(actor, rng, wrappedCreate);
    }
    ensureIntelligentMobLight(actor, template, rng, wrappedCreate);
}
function extinguishLight(item) {
    if (!item || typeof item !== "object")
        return;
    if ("lit" in item)
        item.lit = false;
    if ("emitsLight" in item)
        item.emitsLight = false;
    if (Number.isFinite(item.radius))
        item.radius = 0;
    if (Number.isFinite(item.lightRadius))
        item.lightRadius = 0;
}
const INTELLIGENT_TAGS = new Set(["humanoid", "intelligent", "caster", "bandit", "orc"]);
function ensureIntelligentMobLight(actor, template, rng, createItem) {
    if (!actor || typeof createItem !== "function")
        return;
    if (!template || !Array.isArray(template.tags))
        return;
    const isIntelligent = template.tags.some((tag) => INTELLIGENT_TAGS.has(tag));
    if (!isIntelligent)
        return;
    const random = typeof rng === "function" ? rng : Math.random;
    const hasExistingLight = Object.values(actor.equipment || {}).some((entry) => itemEmitsLight(resolveEquippedItem(entry)));
    if (!hasExistingLight) {
        const useLantern = random() < 0.35;
        const preferredSlots = [
            SLOT.Belt1,
            SLOT.Belt2,
            SLOT.Belt3,
            SLOT.Belt4,
            SLOT.LeftHand,
            SLOT.RightHand,
        ];
        let placed = tryEquip(actor, createItem(useLantern ? "lantern" : "torch"), preferredSlots);
        if (!placed && useLantern) {
            placed = tryEquip(actor, createItem("torch"), preferredSlots);
        }
        if (!placed) {
            tryEquip(actor, createItem("lantern"), preferredSlots);
        }
    }
    const desiredOilFlasks = 2;
    const oilSlots = [SLOT.Belt1, SLOT.Belt2, SLOT.Belt3, SLOT.Belt4, SLOT.Backpack];
    let equippedOil = countEquipped(actor, (item) => item?.id === "oil_flask");
    while (equippedOil < desiredOilFlasks) {
        const placed = tryEquip(actor, createItem("oil_flask"), oilSlots);
        if (!placed)
            break;
        equippedOil += 1;
    }
}
function resolveEquippedItem(entry) {
    let current = entry;
    let guard = 0;
    while (current &&
        typeof current === "object" &&
        "item" in current &&
        current.item &&
        current.item !== current &&
        guard < 4) {
        current = current.item;
        guard += 1;
    }
    return current && typeof current === "object" ? current : null;
}
function itemEmitsLight(item) {
    if (!item || typeof item !== "object")
        return false;
    if (item.lit === false)
        return false;
    if (item.emitsLight === false)
        return false;
    const radii = [item.radius, item.lightRadius, item.light?.radius];
    return radii.some((value) => Number.isFinite(value) && value > 0);
}
function countEquipped(actor, predicate) {
    if (typeof predicate !== "function")
        return 0;
    let count = 0;
    for (const entry of Object.values(actor.equipment || {})) {
        const item = resolveEquippedItem(entry);
        if (predicate(item))
            count += 1;
    }
    return count;
}
