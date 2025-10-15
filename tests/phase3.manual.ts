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

import { Actor } from "../dist/src/combat/actor.js";
import { foldModsFromEquipment } from "../dist/src/combat/mod-folding.js";
import { makeItem } from "../js/item-system.js";
import { performEquippedAttack } from "../dist/src/game/combat-glue.js";

/** Item instances returned by the item factory. */
type Item = ReturnType<typeof makeItem>;

/** Equipment entry the actor constructor understands. */
type EquipmentEntry = Item | { item?: Item | null } | undefined;

/** Fully-specified stat block consumed by {@link Actor}. */
interface BaseStats {
  str: number;
  dex: number;
  int: number;
  vit: number;
  con: number;
  will: number;
  luck: number;
  maxHP: number;
  maxStamina: number;
  maxMana: number;
  baseSpeed: number;
}

/**
 * Minimal subset of the Actor init payload needed for our manual test.
 * Additional fields (AI hooks, factions, etc.) can be added later without
 * changing the call sites below.
 */
interface ActorTemplate {
  id: string;
  name?: string;
  baseStats?: Partial<BaseStats>;
  weaponId?: string;
  equipment?: Partial<Record<string, EquipmentEntry>>;
}

/** Configuration for a single attacker-versus-defender check. */
interface AttackScenario {
  attacker: ActorTemplate;
  defender: ActorTemplate;
  /** Tile distance between the attacker and defender (defaults to 1). */
  distanceTiles?: number;
}

/**
 * Runtime shape of Actor exposed by the combat systems.
 * Casts in this file rely on these fields existing on the JS class.
 */
type CombatActor = InstanceType<typeof Actor> & {
  res: { hp: number };
  equipment: Record<string, EquipmentEntry>;
};

/** Convenience wrapper to describe the interesting bits of an attack result. */
interface AttackSummary {
  attackerId: string;
  defenderId: string;
  weaponId: string;
  ok: boolean;
  hpBefore: number;
  hpAfter: number;
  damage: number;
}

const DEFAULT_BASE_STATS: BaseStats = {
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
function createActorFromTemplate(template: ActorTemplate): CombatActor {
  const baseStats: BaseStats = { ...DEFAULT_BASE_STATS, ...template.baseStats };
  const equipment: Record<string, EquipmentEntry> = { ...template.equipment };

  if (template.weaponId) {
    equipment.RightHand = makeItem(template.weaponId);
  }

  const actor = new Actor({
    id: template.id,
    name: template.name,
    baseStats,
    equipment,
  }) as CombatActor;

  foldModsFromEquipment(actor);
  actor.res.hp = baseStats.maxHP;
  return actor;
}

/** Narrowing helper that checks whether a slot already contains an Item. */
function isItem(entry: EquipmentEntry): entry is Item {
  return Boolean(entry && typeof entry === "object" && "id" in entry);
}

/**
 * Extract the weapon Item the attacker will swing for this scenario.
 */
function getEquippedWeapon(actor: CombatActor): Item {
  const slot = actor.equipment.RightHand;
  if (isItem(slot)) return slot;
  if (slot && typeof slot === "object" && "item" in slot && slot.item) {
    return slot.item;
  }
  throw new Error(`Actor ${actor.id} has no weapon equipped.`);
}

/**
 * Execute the configured scenario and collect a short summary of the outcome.
 */
function runScenario(scenario: AttackScenario): AttackSummary {
  const attacker = createActorFromTemplate(scenario.attacker);
  const defender = createActorFromTemplate(scenario.defender);
  const weapon = getEquippedWeapon(attacker);
  const hpBefore = defender.res.hp;

  const result = performEquippedAttack(
    attacker,
    defender,
    weapon,
    scenario.distanceTiles ?? 1,
  ) as { ok: boolean | undefined };

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
function logSummary(summary: AttackSummary): void {
  const { attackerId, defenderId, weaponId, ok, hpBefore, hpAfter, damage } =
    summary;
  console.log(
    `\n${attackerId} attacks ${defenderId} with ${weaponId}: ${ok ? "hit" : "miss"}`,
  );
  console.log(`Damage dealt: ${damage}`);
  console.log(`Defender HP: ${hpBefore} → ${hpAfter}`);
}

const scenario: AttackScenario = {
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
