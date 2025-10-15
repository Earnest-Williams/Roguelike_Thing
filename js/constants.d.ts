export declare const TILE_FLOOR = 0;
export declare const TILE_WALL = 1;
export type TileKind = typeof TILE_FLOOR | typeof TILE_WALL;
export declare const DEFAULT_LIGHT_RADIUS = 1;
export declare const DEFAULT_MOB_HP = 10;
export declare const DEFAULT_MOB_SPEED = 1;
export declare const DEFAULT_INVENTORY_CAPACITY = 20;
export declare const DEFAULT_MONSTER_AGGRO_RANGE = 8;
export declare const SHORT_TERM_MEMORY_PENALTY = 15;
export declare const MINIMAP_DEFAULT_DIMENSION = 640;
export declare const CARDINAL_DIRECTIONS: readonly [{
    readonly dx: 1;
    readonly dy: 0;
}, {
    readonly dx: -1;
    readonly dy: 0;
}, {
    readonly dx: 0;
    readonly dy: 1;
}, {
    readonly dx: 0;
    readonly dy: -1;
}];
export declare const WEAPON_CATEGORY: Readonly<{
    readonly MELEE: "melee";
    readonly BOW: "bow";
    readonly CROSSBOW: "crossbow";
    readonly SLING: "sling";
    readonly THROWN: "thrown";
}>;
export type WeaponCategory = typeof WEAPON_CATEGORY[keyof typeof WEAPON_CATEGORY];
export declare const RANGED_WEAPON_CATEGORIES: ReadonlySet<WeaponCategory>;
export declare const ATTACK_KIND: Readonly<{
    readonly MELEE: "melee";
    readonly RANGED: "ranged";
    readonly THROW: "throw";
}>;
export type AttackKind = typeof ATTACK_KIND[keyof typeof ATTACK_KIND];
export declare const THROW_CLASS: Readonly<{
    readonly PURPOSE_BUILT: "purpose_built";
    readonly MAKESHIFT: "makeshift";
    readonly IMPROVISED: "improvised";
    readonly UNSUITABLE: "unsuitable";
}>;
export type ThrowClass = typeof THROW_CLASS[keyof typeof THROW_CLASS];
export declare const FOV_TRANSFORMS: readonly [readonly [1, 0, 0, 1], readonly [0, 1, 1, 0], readonly [0, -1, 1, 0], readonly [-1, 0, 0, 1], readonly [-1, 0, 0, -1], readonly [0, -1, -1, 0], readonly [0, 1, -1, 0], readonly [1, 0, 0, -1]];
export declare const LIGHT_CHANNELS: Readonly<{
    readonly NONE: 0;
    readonly NORMAL: 1;
    readonly SPECTRAL: 2;
    readonly MAGIC: 4;
    readonly ALL: 4294967295;
}>;
export type LightChannel = typeof LIGHT_CHANNELS[keyof typeof LIGHT_CHANNELS];
export declare const DAMAGE_TYPE: Readonly<{
    readonly SLASH: "slash";
    readonly PIERCE: "pierce";
    readonly BLUNT: "blunt";
    readonly FIRE: "fire";
    readonly COLD: "cold";
    readonly LIGHTNING: "lightning";
    readonly POISON: "poison";
    readonly ARCANE: "arcane";
    readonly RADIANT: "radiant";
    readonly NECROTIC: "necrotic";
}>;
export type DamageType = typeof DAMAGE_TYPE[keyof typeof DAMAGE_TYPE];
export declare const MARTIAL_DAMAGE_TYPES: readonly ["slash", "pierce", "blunt"];
export declare const DEFAULT_MARTIAL_DAMAGE_TYPE: "slash";
export declare const STATUS_IDS: readonly ["burn", "bleed", "poisoned", "frozen", "shocked", "stunned", "slowed", "silenced", "weakened", "confused", "haste"];
export type StatusId = (typeof STATUS_IDS)[number];
export declare const STACKING_RULE: Readonly<{
    readonly REFRESH: "refresh";
    readonly ADD_STACKS: "add_stacks";
    readonly INDEPENDENT: "independent";
}>;
export type StackingRule = typeof STACKING_RULE[keyof typeof STACKING_RULE];
export declare const SLOT: Readonly<{
    readonly Head: "Head";
    readonly LeftHand: "LeftHand";
    readonly RightHand: "RightHand";
    readonly LeftRing: "LeftRing";
    readonly RightRing: "RightRing";
    readonly Amulet: "Amulet";
    readonly BodyArmor: "BodyArmor";
    readonly Cloak: "Cloak";
    readonly Boots: "Boots";
    readonly Gloves: "Gloves";
    readonly Belt: "Belt";
    readonly Belt1: "Belt1";
    readonly Belt2: "Belt2";
    readonly Belt3: "Belt3";
    readonly Belt4: "Belt4";
    readonly Backpack: "Backpack";
    readonly Quiver: "Quiver";
}>;
export type EquipSlot = typeof SLOT[keyof typeof SLOT];
export declare const ALL_SLOTS_ORDER: readonly ["Head", "Amulet", "LeftRing", "RightRing", "Cloak", "BodyArmor", "Gloves", "Boots", "LeftHand", "RightHand", "Belt", "Belt1", "Belt2", "Belt3", "Belt4", "Backpack", "Quiver"];
export declare const DEFAULT_STATUS_DURATION_TURNS = 5;
export declare const DEFAULT_STATUS_STACKS = 1;
export declare const MIN_STATUS_STACKS = 1;
export declare const STATUS_TICK_DELTA_TURNS = 1;
export declare const BURN_MAX_STACKS = 10;
export declare const HASTE_MAX_STACKS = 1;
export declare const FATIGUE_MAX_STACKS = 5;
export declare const CHILLED_MAX_STACKS = 3;
export declare const REGENERATION_MAX_STACKS = 1;
export declare const ADRENALINE_MAX_STACKS = 1;
export declare const EXHAUSTED_MAX_STACKS = 1;
export declare const BLEED_DURATION_TURNS = 3;
export declare const BASE_DAMAGE_MULTIPLIER = 1;
export declare const BASE_SPEED_MULTIPLIER = 1;
export declare const MAX_RESIST_CAP = 0.9;
export declare const MIN_AFFINITY_CAP = -0.9;
export declare const MAX_AFFINITY_CAP = 0.9;
export declare const MIN_SPEED_MULTIPLIER = 0.2;
export declare const MAX_SPEED_MULTIPLIER = 5;
export declare const BASE_AP_GAIN_PER_TURN = 100;
export declare const MIN_AP_COST = 1;
export declare const COOLDOWN_PROGRESS_PER_TURN = 1;
export declare const COOLDOWN_MIN_TURNS = 0;
export declare const DEFAULT_MOVE_COST_MULTIPLIER = 1;
export declare const DEFAULT_ACTION_COST_MULTIPLIER = 1;
export declare const DEFAULT_COOLDOWN_MULTIPLIER = 1;
export declare const DEFAULT_REGEN_HP_PER_TURN = 0;
export declare const DEFAULT_REGEN_STAMINA_PER_TURN = 0;
export declare const DEFAULT_REGEN_MANA_PER_TURN = 0;
export declare const BURN_TICK_DAMAGE_PER_STACK = 1;
export declare const BLEED_TICK_DAMAGE_PER_STACK = 1;
export declare const HASTE_SPEED_MULTIPLIER_PER_STACK = 0.85;
export declare const HASTE_COOLDOWN_MULTIPLIER = 0.9;
export declare const FATIGUE_ACTION_COST_MULTIPLIER_PER_STACK = 1.05;
export declare const CHILLED_FACTOR_PER_STACK = 1.1;
export declare const REGENERATION_HP_PER_TURN = 1;
export declare const ADRENALINE_ACTION_COST_MULTIPLIER = 0.85;
export declare const ADRENALINE_COOLDOWN_MULTIPLIER = 0.85;
export declare const ADRENALINE_STAMINA_REGEN_PER_TURN = 1;
export declare const EXHAUSTED_ACTION_COST_MULTIPLIER = 1.25;
export declare const EXHAUSTED_STAMINA_REGEN_PER_TURN = -1;
export declare const HEALTH_FLOOR = 0;
export declare const RESOURCE_FLOOR = 0;
export declare const BASE_PASSIVE_REGEN_HP = 0;
export declare const BASE_PASSIVE_REGEN_STAMINA = 1;
export declare const BASE_PASSIVE_REGEN_MANA = 1;
export declare const BASE_PASSIVE_REGEN: Readonly<{
    readonly hp: 0;
    readonly stamina: 1;
    readonly mana: 1;
}>;
export declare const CHANNELING_REGEN_MULT = 1.5;
export declare const DEFAULT_AP_CAP = 100;
export declare const DEFAULT_BASE_ACTION_AP = 100;
export declare const MIN_TOTAL_ACTION_COST_MULTIPLIER = 0.05;
export declare const MIN_TOTAL_COOLDOWN_MULTIPLIER = 0.05;
export declare const BASE_MOVE_AP_COST = 50;
export declare const DEFAULT_ATTACK_BASE_DAMAGE = 5;
export declare const MIN_ATTACK_DAMAGE = 1;
export declare const DEFAULT_ATTACK_BASE_COOLDOWN = 1;
export declare const DEFAULT_RELOAD_TIME_TURNS = 1;
export declare const DEFAULT_MELEE_RANGE_TILES = 1;
export declare const SIMPLE_PLANNER_FALLBACK_BASE_DAMAGE = 8;
export declare const SIMPLE_PLANNER_FALLBACK_BASE_COOLDOWN = 2;
export declare const POLAR_BIAS: Readonly<{
    readonly order: Readonly<{
        readonly chaos: 0.1;
        readonly decay: 0.1;
    }>;
    readonly growth: Readonly<{
        readonly decay: 0.1;
        readonly void: -0.05;
    }>;
    readonly chaos: Readonly<{
        readonly order: 0.1;
        readonly void: -0.05;
    }>;
    readonly decay: Readonly<{
        readonly growth: 0.1;
        readonly order: 0.1;
        readonly void: -0.05;
    }>;
    readonly void: Readonly<{
        readonly order: -0.05;
        readonly growth: -0.05;
        readonly chaos: -0.05;
        readonly decay: -0.05;
    }>;
}>;
