// @ts-nocheck
/**
 * Manual phase 3 combat sanity check.
 *
 * This script provides a tiny, reproducible scenario that exercises the
 * deterministic attack pipeline used by the planner layer.  Run it with a
 * TypeScript-aware runtime (for example `npx ts-node tests/phase3.manual.ts`)
 * to quickly confirm that weapon folding, attack resolution and HP updates stay
 * consistent while you tweak combat formulas.
 */
import { Actor } from "../src/combat/actor.js";
import { foldModsFromEquipment } from "../src/combat/mod-folding.js";
import { makeItem } from "../js/item-system.js";
import { performEquippedAttack } from "../src/game/combat-glue.js";
const DEFAULT_BASE_STATS = {
    str: 5,
    dex: 5,
    int: 5,
    vit: 5,
    con: 5,
    will: 5,
    luck: 5,
    maxHP: 10,
    maxStamina: 10,
    maxMana: 0,
    baseSpeed: 1,
};
/**
 * Build an actor from a light-weight template, fold equipment mods and reset HP.
 */
function createActorFromTemplate(template) {
    const baseStats = { ...DEFAULT_BASE_STATS, ...template.baseStats };
    const equipment = { ...template.equipment };
    if (template.weaponId) {
        equipment.RightHand = makeItem(template.weaponId);
    }
    const actor = new Actor({
        id: template.id,
        name: template.name,
        baseStats,
        equipment,
    });
    foldModsFromEquipment(actor);
    actor.res.hp = baseStats.maxHP;
    return actor;
}
/** Narrowing helper that checks whether a slot already contains an Item. */
function isItem(entry) {
    return Boolean(entry && typeof entry === "object" && "id" in entry);
}
/**
 * Extract the weapon Item the attacker will swing for this scenario.
 */
function getEquippedWeapon(actor) {
    const slot = actor.equipment.RightHand;
    if (isItem(slot))
        return slot;
    if (slot && typeof slot === "object" && "item" in slot && slot.item) {
        return slot.item;
    }
    throw new Error(`Actor ${actor.id} has no weapon equipped.`);
}
/**
 * Execute the configured scenario and collect a short summary of the outcome.
 */
function runScenario(scenario) {
    const attacker = createActorFromTemplate(scenario.attacker);
    const defender = createActorFromTemplate(scenario.defender);
    const weapon = getEquippedWeapon(attacker);
    const hpBefore = defender.res.hp;
    const result = performEquippedAttack(attacker, defender, weapon, scenario.distanceTiles ?? 1);
    const hpAfter = defender.res.hp;
    return {
        attackerId: attacker.name ?? attacker.id,
        defenderId: defender.name ?? defender.id,
        weaponId: weapon.id,
        ok: Boolean(result?.ok),
        hpBefore,
        hpAfter,
        damage: Math.max(0, hpBefore - hpAfter),
    };
}
/** Pretty-print the summary in a developer-friendly format. */
function logSummary(summary) {
    const { attackerId, defenderId, weaponId, ok, hpBefore, hpAfter, damage } = summary;
    console.log(`\n${attackerId} attacks ${defenderId} with ${weaponId}: ${ok ? "hit" : "miss"}`);
    console.log(`Damage dealt: ${damage}`);
    console.log(`Defender HP: ${hpBefore} → ${hpAfter}`);
}
const scenario = {
    attacker: {
        id: "A",
        baseStats: {
            str: 10,
            dex: 10,
            int: 8,
            vit: 10,
            con: 10,
            will: 8,
            luck: 9,
            maxHP: 20,
            maxStamina: 10,
            maxMana: 5,
            baseSpeed: 1,
        },
        weaponId: "long_sword",
    },
    defender: {
        id: "B",
        baseStats: {
            str: 8,
            dex: 8,
            int: 8,
            vit: 8,
            con: 8,
            will: 8,
            luck: 8,
            maxHP: 25,
            maxStamina: 10,
            maxMana: 5,
            baseSpeed: 1,
        },
    },
    distanceTiles: 1,
};
logSummary(runScenario(scenario));
