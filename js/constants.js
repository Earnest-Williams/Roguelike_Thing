export const TILE_FLOOR = 0;
export const TILE_WALL = 1;

export const DEFAULT_LIGHT_RADIUS = 1;
export const DEFAULT_MOB_HP = 10;
export const DEFAULT_MOB_SPEED = 1;
export const DEFAULT_INVENTORY_CAPACITY = 20;
export const DEFAULT_MONSTER_AGGRO_RANGE = 8;
export const SHORT_TERM_MEMORY_PENALTY = 15;
export const MINIMAP_DEFAULT_DIMENSION = 640;

export const CARDINAL_DIRECTIONS = Object.freeze([
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
]);

export const WEAPON_CATEGORY = Object.freeze({
  MELEE: "melee",
  BOW: "bow",
  CROSSBOW: "crossbow",
  SLING: "sling",
  THROWN: "thrown",
});

export const RANGED_WEAPON_CATEGORIES = new Set([
  WEAPON_CATEGORY.BOW,
  WEAPON_CATEGORY.CROSSBOW,
  WEAPON_CATEGORY.SLING,
  WEAPON_CATEGORY.THROWN,
]);

export const ATTACK_KIND = Object.freeze({
  MELEE: "melee",
  RANGED: "ranged",
  THROW: "throw",
});

export const THROW_CLASS = Object.freeze({
  PURPOSE_BUILT: "purpose_built",
  MAKESHIFT: "makeshift",
  IMPROVISED: "improvised",
  UNSUITABLE: "unsuitable",
});

export const FOV_TRANSFORMS = Object.freeze([
  [1, 0, 0, 1],
  [0, 1, 1, 0],
  [0, -1, 1, 0],
  [-1, 0, 0, 1],
  [-1, 0, 0, -1],
  [0, -1, -1, 0],
  [0, 1, -1, 0],
  [1, 0, 0, -1],
]);

export const DAMAGE_TYPE = Object.freeze({
  SLASH: "slash",
  PIERCE: "pierce",
  BLUNT: "blunt",
  FIRE: "fire",
  COLD: "cold",
  LIGHTNING: "lightning",
  POISON: "poison",
  ARCANE: "arcane",
  RADIANT: "radiant",
  NECROTIC: "necrotic",
});

export const MARTIAL_DAMAGE_TYPES = Object.freeze([
  DAMAGE_TYPE.SLASH,
  DAMAGE_TYPE.PIERCE,
  DAMAGE_TYPE.BLUNT,
]);

export const DEFAULT_MARTIAL_DAMAGE_TYPE = DAMAGE_TYPE.SLASH;

export const STATUS_IDS = Object.freeze([
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
  "haste",
]);

export const STACKING_RULE = Object.freeze({
  REFRESH: "refresh",
  ADD_STACKS: "add_stacks",
  INDEPENDENT: "independent",
});

export const SLOT = Object.freeze({
  Head: "Head",
  LeftHand: "LeftHand",
  RightHand: "RightHand",
  LeftRing: "LeftRing",
  RightRing: "RightRing",
  Amulet: "Amulet",
  BodyArmor: "BodyArmor",
  Cloak: "Cloak",
  Boots: "Boots",
  Gloves: "Gloves",
  Belt: "Belt",
  Belt1: "Belt1",
  Belt2: "Belt2",
  Belt3: "Belt3",
  Belt4: "Belt4",
  Backpack: "Backpack",
  Quiver: "Quiver",
});

export const ALL_SLOTS_ORDER = Object.freeze([
  SLOT.Head,
  SLOT.Amulet,
  SLOT.LeftRing,
  SLOT.RightRing,
  SLOT.Cloak,
  SLOT.BodyArmor,
  SLOT.Gloves,
  SLOT.Boots,
  SLOT.LeftHand,
  SLOT.RightHand,
  SLOT.Belt,
  SLOT.Belt1,
  SLOT.Belt2,
  SLOT.Belt3,
  SLOT.Belt4,
  SLOT.Backpack,
  SLOT.Quiver,
]);

// MERGED CONSTANTS FROM ROOT
export const DEFAULT_STATUS_DURATION_TURNS = 5;
export const DEFAULT_STATUS_STACKS = 1;
export const MIN_STATUS_STACKS = 1;
export const STATUS_TICK_DELTA_TURNS = 1;

export const BURN_MAX_STACKS = 10;
export const HASTE_MAX_STACKS = 1;
export const FATIGUE_MAX_STACKS = 5;
export const CHILLED_MAX_STACKS = 3;
export const REGENERATION_MAX_STACKS = 1;
export const ADRENALINE_MAX_STACKS = 1;
export const EXHAUSTED_MAX_STACKS = 1;
export const BLEED_DURATION_TURNS = 3;

export const BASE_DAMAGE_MULTIPLIER = 1.0;
export const BASE_SPEED_MULTIPLIER = 1.0;

export const MAX_RESIST_CAP = 0.9;
export const MIN_AFFINITY_CAP = -0.9;
export const MAX_AFFINITY_CAP = 0.9;

export const MIN_SPEED_MULTIPLIER = 0.2;
export const MAX_SPEED_MULTIPLIER = 5;

export const BASE_AP_GAIN_PER_TURN = 100;
export const MIN_AP_COST = 1;
export const COOLDOWN_PROGRESS_PER_TURN = 1;
export const COOLDOWN_MIN_TURNS = 0;

export const DEFAULT_MOVE_COST_MULTIPLIER = 1.0;
export const DEFAULT_ACTION_COST_MULTIPLIER = 1.0;
export const DEFAULT_COOLDOWN_MULTIPLIER = 1.0;
export const DEFAULT_REGEN_HP_PER_TURN = 0;
export const DEFAULT_REGEN_STAMINA_PER_TURN = 0;
export const DEFAULT_REGEN_MANA_PER_TURN = 0;

export const BURN_TICK_DAMAGE_PER_STACK = 1;
export const BLEED_TICK_DAMAGE_PER_STACK = 1;
export const HASTE_SPEED_MULTIPLIER_PER_STACK = 0.85;
export const HASTE_COOLDOWN_MULTIPLIER = 0.9;
export const FATIGUE_ACTION_COST_MULTIPLIER_PER_STACK = 1.05;
export const CHILLED_FACTOR_PER_STACK = 1.1;
export const REGENERATION_HP_PER_TURN = 1;
export const ADRENALINE_ACTION_COST_MULTIPLIER = 0.85;
export const ADRENALINE_COOLDOWN_MULTIPLIER = 0.85;
export const ADRENALINE_STAMINA_REGEN_PER_TURN = 1;
export const EXHAUSTED_ACTION_COST_MULTIPLIER = 1.25;
export const EXHAUSTED_STAMINA_REGEN_PER_TURN = -1;
export const HEALTH_FLOOR = 0;

export const RESOURCE_FLOOR = 0;

export const BASE_PASSIVE_REGEN_HP = 0;
export const BASE_PASSIVE_REGEN_STAMINA = 1;
export const BASE_PASSIVE_REGEN_MANA = 1;
export const BASE_PASSIVE_REGEN = Object.freeze({
  hp: BASE_PASSIVE_REGEN_HP,
  stamina: BASE_PASSIVE_REGEN_STAMINA,
  mana: BASE_PASSIVE_REGEN_MANA,
});

export const CHANNELING_REGEN_MULT = 1.5;

export const DEFAULT_AP_CAP = 100;
export const DEFAULT_BASE_ACTION_AP = 100;
export const MIN_TOTAL_ACTION_COST_MULTIPLIER = 0.05;
export const MIN_TOTAL_COOLDOWN_MULTIPLIER = 0.05;

export const BASE_MOVE_AP_COST = 50;
export const DEFAULT_ATTACK_BASE_DAMAGE = 5;
export const MIN_ATTACK_DAMAGE = 1;
export const DEFAULT_ATTACK_BASE_COOLDOWN = 1;
export const DEFAULT_RELOAD_TIME_TURNS = 1;
export const DEFAULT_MELEE_RANGE_TILES = 1;

export const SIMPLE_PLANNER_FALLBACK_BASE_DAMAGE = 8;
export const SIMPLE_PLANNER_FALLBACK_BASE_COOLDOWN = 2;

export const POLAR_BIAS = Object.freeze({
  order: Object.freeze({ chaos: 0.1, decay: 0.1 }),
  growth: Object.freeze({ decay: 0.1, void: -0.05 }),
  chaos: Object.freeze({ order: 0.1, void: -0.05 }),
  decay: Object.freeze({ growth: 0.1, order: 0.1, void: -0.05 }),
  void: Object.freeze({ order: -0.05, growth: -0.05, chaos: -0.05, decay: -0.05 }),
});
