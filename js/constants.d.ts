export const TILE_FLOOR: 0;
export const TILE_WALL: 1;

export type TileKind = typeof TILE_FLOOR | typeof TILE_WALL;

export const DEFAULT_LIGHT_RADIUS: 1;
export const DEFAULT_MOB_HP: 10;
export const DEFAULT_MOB_SPEED: 1;
export const DEFAULT_INVENTORY_CAPACITY: 20;
export const DEFAULT_MONSTER_AGGRO_RANGE: 8;
export const SHORT_TERM_MEMORY_PENALTY: 15;
export const MINIMAP_DEFAULT_DIMENSION: 640;

export const CARDINAL_DIRECTIONS: readonly Readonly<{ dx: number; dy: number; }>[];

export const WEAPON_CATEGORY: {
  readonly MELEE: "melee";
  readonly BOW: "bow";
  readonly CROSSBOW: "crossbow";
  readonly SLING: "sling";
  readonly THROWN: "thrown";
};
export type WeaponCategory = typeof WEAPON_CATEGORY[keyof typeof WEAPON_CATEGORY];

export const RANGED_WEAPON_CATEGORIES: ReadonlySet<WeaponCategory>;

export const ATTACK_KIND: {
  readonly MELEE: "melee";
  readonly RANGED: "ranged";
  readonly THROW: "throw";
};
export type AttackKind = typeof ATTACK_KIND[keyof typeof ATTACK_KIND];

export const THROW_CLASS: {
  readonly PURPOSE_BUILT: "purpose_built";
  readonly MAKESHIFT: "makeshift";
  readonly IMPROVISED: "improvised";
  readonly UNSUITABLE: "unsuitable";
};
export type ThrowClass = typeof THROW_CLASS[keyof typeof THROW_CLASS];

export const FOV_TRANSFORMS: readonly (readonly [number, number, number, number])[];

export const LIGHT_CHANNELS: {
  readonly NONE: 0;
  readonly NORMAL: 1;
  readonly SPECTRAL: 2;
  readonly MAGIC: 4;
  readonly ALL: 4294967295;
};
export type LightChannel = typeof LIGHT_CHANNELS[keyof typeof LIGHT_CHANNELS];

export const DAMAGE_TYPE: {
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
};
export type DamageType = typeof DAMAGE_TYPE[keyof typeof DAMAGE_TYPE];

export const MARTIAL_DAMAGE_TYPES: readonly [
  typeof DAMAGE_TYPE.SLASH,
  typeof DAMAGE_TYPE.PIERCE,
  typeof DAMAGE_TYPE.BLUNT
];
export const DEFAULT_MARTIAL_DAMAGE_TYPE: typeof DAMAGE_TYPE.SLASH;

export const STATUS_IDS: readonly [
  "burn",
  "bleed",
  "poisoned",
  "frozen",
  "shocked",
  "stunned",
  "slowed",
  "silenced",
  "weakened",
  "confused",
  "haste"
];
export type StatusId = (typeof STATUS_IDS)[number];

export const STACKING_RULE: {
  readonly REFRESH: "refresh";
  readonly ADD_STACKS: "add_stacks";
  readonly INDEPENDENT: "independent";
};
export type StackingRule = typeof STACKING_RULE[keyof typeof STACKING_RULE];

export const SLOT: {
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
};
export type EquipSlot = typeof SLOT[keyof typeof SLOT];

export const ALL_SLOTS_ORDER: readonly [
  typeof SLOT.Head,
  typeof SLOT.Amulet,
  typeof SLOT.LeftRing,
  typeof SLOT.RightRing,
  typeof SLOT.Cloak,
  typeof SLOT.BodyArmor,
  typeof SLOT.Gloves,
  typeof SLOT.Boots,
  typeof SLOT.LeftHand,
  typeof SLOT.RightHand,
  typeof SLOT.Belt,
  typeof SLOT.Belt1,
  typeof SLOT.Belt2,
  typeof SLOT.Belt3,
  typeof SLOT.Belt4,
  typeof SLOT.Backpack,
  typeof SLOT.Quiver
];

export const DEFAULT_STATUS_DURATION_TURNS: 5;
export const DEFAULT_STATUS_STACKS: 1;
export const MIN_STATUS_STACKS: 1;
export const STATUS_TICK_DELTA_TURNS: 1;

export const BURN_MAX_STACKS: 10;
export const HASTE_MAX_STACKS: 1;
export const FATIGUE_MAX_STACKS: 5;
export const CHILLED_MAX_STACKS: 3;
export const REGENERATION_MAX_STACKS: 1;
export const ADRENALINE_MAX_STACKS: 1;
export const EXHAUSTED_MAX_STACKS: 1;
export const BLEED_DURATION_TURNS: 3;

export const BASE_DAMAGE_MULTIPLIER: 1;
export const BASE_SPEED_MULTIPLIER: 1;

export const MAX_RESIST_CAP: 0.9;
export const MIN_AFFINITY_CAP: -0.9;
export const MAX_AFFINITY_CAP: 0.9;

export const MIN_SPEED_MULTIPLIER: 0.2;
export const MAX_SPEED_MULTIPLIER: 5;

export const BASE_AP_GAIN_PER_TURN: 100;
export const MIN_AP_COST: 1;
export const COOLDOWN_PROGRESS_PER_TURN: 1;
export const COOLDOWN_MIN_TURNS: 0;

export const DEFAULT_MOVE_COST_MULTIPLIER: 1;
export const DEFAULT_ACTION_COST_MULTIPLIER: 1;
export const DEFAULT_COOLDOWN_MULTIPLIER: 1;
export const DEFAULT_REGEN_HP_PER_TURN: 0;
export const DEFAULT_REGEN_STAMINA_PER_TURN: 0;
export const DEFAULT_REGEN_MANA_PER_TURN: 0;

export const BURN_TICK_DAMAGE_PER_STACK: 1;
export const BLEED_TICK_DAMAGE_PER_STACK: 1;
export const HASTE_SPEED_MULTIPLIER_PER_STACK: 0.85;
export const HASTE_COOLDOWN_MULTIPLIER: 0.9;
export const FATIGUE_ACTION_COST_MULTIPLIER_PER_STACK: 1.05;
export const CHILLED_FACTOR_PER_STACK: 1.1;
export const REGENERATION_HP_PER_TURN: 1;
export const ADRENALINE_ACTION_COST_MULTIPLIER: 0.85;
export const ADRENALINE_COOLDOWN_MULTIPLIER: 0.85;
export const ADRENALINE_STAMINA_REGEN_PER_TURN: 1;
export const EXHAUSTED_ACTION_COST_MULTIPLIER: 1.25;
export const EXHAUSTED_STAMINA_REGEN_PER_TURN: -1;
export const HEALTH_FLOOR: 0;

export const RESOURCE_FLOOR: 0;

export const BASE_PASSIVE_REGEN_HP: 0;
export const BASE_PASSIVE_REGEN_STAMINA: 1;
export const BASE_PASSIVE_REGEN_MANA: 1;
export const BASE_PASSIVE_REGEN: Readonly<{
  hp: typeof BASE_PASSIVE_REGEN_HP;
  stamina: typeof BASE_PASSIVE_REGEN_STAMINA;
  mana: typeof BASE_PASSIVE_REGEN_MANA;
}>;

export const CHANNELING_REGEN_MULT: 1.5;

export const DEFAULT_AP_CAP: 100;
export const DEFAULT_BASE_ACTION_AP: 100;
export const MIN_TOTAL_ACTION_COST_MULTIPLIER: 0.05;
export const MIN_TOTAL_COOLDOWN_MULTIPLIER: 0.05;

export const BASE_MOVE_AP_COST: 50;
export const DEFAULT_ATTACK_BASE_DAMAGE: 5;
export const MIN_ATTACK_DAMAGE: 1;
export const DEFAULT_ATTACK_BASE_COOLDOWN: 1;
export const DEFAULT_RELOAD_TIME_TURNS: 1;
export const DEFAULT_MELEE_RANGE_TILES: 1;

export const SIMPLE_PLANNER_FALLBACK_BASE_DAMAGE: 8;
export const SIMPLE_PLANNER_FALLBACK_BASE_COOLDOWN: 2;

export const POLAR_BIAS: Readonly<{
  order: Readonly<{ chaos: 0.1; decay: 0.1 }>;
  growth: Readonly<{ decay: 0.1; void: -0.05 }>;
  chaos: Readonly<{ order: 0.1; void: -0.05 }>;
  decay: Readonly<{ growth: 0.1; order: 0.1; void: -0.05 }>;
  void: Readonly<{
    order: -0.05;
    growth: -0.05;
    chaos: -0.05;
    decay: -0.05;
  }>;
}>;
