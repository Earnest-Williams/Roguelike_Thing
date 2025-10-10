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
  PHYSICAL: "physical",
  FIRE: "fire",
  COLD: "cold",
  LIGHTNING: "lightning",
  POISON: "poison",
  ARCANE: "arcane",
});

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
