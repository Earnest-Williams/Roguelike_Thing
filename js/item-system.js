import {
  WEAPON_CATEGORY,
  RANGED_WEAPON_CATEGORIES,
  THROW_CLASS,
  ATTACK_KIND,
  SLOT,
} from "./constants.js";
import { clamp, clamp01 } from "./utils.js";

function dimsVolumeL(d) {
  return (d.l * d.w * d.h) / 1000.0;
} // cm^3 to liters

function dimsLongest(d) {
  return Math.max(d.l, d.w, d.h);
}

function normalizeDamageProfile(dmg) {
  if (!dmg) {
    return { diceCount: 1, diceSides: 4, bonus: 0 };
  }
  const diceCount = Math.max(0, Math.floor(dmg.diceCount ?? dmg.dice ?? 1));
  const diceSides = Math.max(1, Math.floor(dmg.diceSides ?? dmg.sides ?? 6));
  const bonus = Math.floor(dmg.bonus ?? dmg.flat ?? 0);
  return { diceCount, diceSides, bonus };
}

function computeHeftScore(item) {
  if (!item) return 0.5;
  const dims = item.dims || { l: 1, w: 1, h: 1 };
  const longest = Math.max(dims.l || 1, dims.w || 1, dims.h || 1);
  const mass = Math.max(0.05, item.mass ?? 0.1);
  // Heft combines mass with the leverage granted by item length.
  return mass * (0.6 + longest / 60);
}

function defaultThrowDamageForItem(item) {
  const heft = computeHeftScore(item);
  let diceSides = 2;
  if (heft <= 0.75) diceSides = 2;
  else if (heft <= 1.5) diceSides = 3;
  else if (heft <= 2.5) diceSides = 4;
  else if (heft <= 4) diceSides = 6;
  else if (heft <= 6) diceSides = 8;
  else if (heft <= 8) diceSides = 10;
  else diceSides = 12;
  const bonus = Math.max(0, Math.floor((heft - 2.5) / 2));
  return { diceCount: 1, diceSides, bonus };
}

function defaultThrowRangeForItem(item) {
  const dims = item && item.dims ? item.dims : { l: 1, w: 1, h: 1 };
  const longest = Math.max(dims.l || 1, dims.w || 1, dims.h || 1);
  const optimal = Math.max(2, Math.min(5, Math.round(1 + longest / 60)));
  const max = Math.max(optimal + 1, Math.min(7, optimal + Math.round(longest / 50)));
  return { min: 1, optimal, max };
}

function normalizeThrowProfile(profile, item) {
  const baseRange = profile?.range || {};
  const defaults = defaultThrowRangeForItem(item);
  const min = Math.max(1, Math.floor(baseRange.min ?? defaults.min));
  const optimal = Math.max(min, Math.floor(baseRange.optimal ?? defaults.optimal));
  const max = Math.max(optimal, Math.floor(baseRange.max ?? defaults.max));
  const damage = normalizeDamageProfile(
    profile?.damage ?? defaultThrowDamageForItem(item),
  );
  const accuracy = typeof profile?.accuracy === "number" ? profile.accuracy : 0;
  const consumesItem =
    profile?.consumesItem !== undefined ? !!profile.consumesItem : true;
  const recoveryChance = clamp01(profile?.recoveryChance ?? 0);
  const notes = profile?.notes || null;
  return {
    range: { min, optimal, max },
    damage,
    accuracy,
    consumesItem,
    recoveryChance,
    notes,
  };
}

export function classifyThrowability(item) {
  if (!item) return THROW_CLASS.UNSUITABLE;
  const mass = item.mass ?? 0.1;
  const longest =
    typeof item.longestCm === "function"
      ? item.longestCm()
      : dimsLongest(item.dims || { l: 1, w: 1, h: 1 });
  const isDeclaredThrowWeapon =
    item.weaponProfile?.category === WEAPON_CATEGORY.THROWN ||
    !!item.throwProfile;
  if (isDeclaredThrowWeapon) return THROW_CLASS.PURPOSE_BUILT;
  if (mass > 3.0 || longest > 120) return THROW_CLASS.UNSUITABLE;
  if (mass <= 0.3 && longest <= 30) return THROW_CLASS.MAKESHIFT;
  return THROW_CLASS.IMPROVISED;
}

export function throwPenaltiesFor(item) {
  const cls = classifyThrowability(item);
  switch (cls) {
    case THROW_CLASS.PURPOSE_BUILT:
      return {
        throwClass: cls,
        allowed: true,
        rangeMult: 1.0,
        dmgMult: 1.0,
        accDelta: 0,
        consume: true,
        recover: 0.33,
      };
    case THROW_CLASS.MAKESHIFT:
      return {
        throwClass: cls,
        allowed: true,
        rangeMult: 0.9,
        dmgMult: 0.9,
        accDelta: -0.05,
        consume: true,
        recover: 0.1,
      };
    case THROW_CLASS.IMPROVISED:
      return {
        throwClass: cls,
        allowed: true,
        rangeMult: 0.7,
        dmgMult: 0.75,
        accDelta: -0.15,
        consume: true,
        recover: 0,
      };
    case THROW_CLASS.UNSUITABLE:
    default:
      return {
        throwClass: cls,
        allowed: false,
        rangeMult: 0,
        dmgMult: 0,
        accDelta: -1,
        consume: false,
        recover: 0,
      };
  }
}

function baseThrowProfileForItem(item) {
  if (!item) return null;
  if (item.weaponProfile?.category === WEAPON_CATEGORY.THROWN) {
    const wp = item.weaponProfile;
    return normalizeThrowProfile(
      {
        range: wp.range ? { ...wp.range } : null,
        damage: wp.damage ? { ...wp.damage } : null,
        accuracy: wp.accuracy,
        consumesItem: wp.consumeWeaponOnUse ?? (wp.ammo ? false : true),
        recoveryChance: wp.recoveryChance,
        notes: wp.notes,
      },
      item,
    );
  }
  if (item.throwProfile) {
    return cloneThrowProfile(item.throwProfile);
  }
  return normalizeThrowProfile(null, item);
}

export function buildEffectiveThrowProfile(item) {
  if (!(item instanceof Item)) return null;
  const penalties = throwPenaltiesFor(item);
  const base = baseThrowProfileForItem(item) || {
    range: { min: 1, optimal: 1, max: 1 },
    damage: { diceCount: 0, diceSides: 0, bonus: 0 },
    accuracy: 0,
    consumesItem: true,
    recoveryChance: 0,
    notes: null,
  };
  const hasExplicitProfile =
    !!item.throwProfile || item.weaponProfile?.category === WEAPON_CATEGORY.THROWN;
  if (!penalties.allowed) {
    return {
      range: { min: 1, optimal: 1, max: 1 },
      damage: { diceCount: 0, diceSides: 0, bonus: 0 },
      accuracy: -1,
      consumesItem: false,
      recoveryChance: 0,
      notes: "Unsuitable to throw",
      throwClass: penalties.throwClass,
      allowed: false,
    };
  }
  const scaledMin = Math.max(1, Math.floor(base.range.min * penalties.rangeMult));
  const scaledOptimal = Math.max(
    scaledMin,
    Math.floor(base.range.optimal * penalties.rangeMult),
  );
  const scaledMax = Math.max(
    scaledOptimal,
    Math.floor(base.range.max * penalties.rangeMult),
  );
  const range = {
    min: scaledMin,
    optimal: scaledOptimal,
    max: scaledMax,
  };
  const damage = {
    diceCount: base.damage.diceCount,
    diceSides: Math.max(1, Math.round(base.damage.diceSides * penalties.dmgMult)),
    bonus: Math.floor(base.damage.bonus * penalties.dmgMult),
  };
  const accuracy = (base.accuracy ?? 0) + penalties.accDelta;
  const consumesItem =
    hasExplicitProfile && base.consumesItem !== undefined
      ? base.consumesItem
      : penalties.consume;
  const recoveryChance =
    hasExplicitProfile &&
    base.recoveryChance !== undefined &&
    base.recoveryChance !== null
      ? clamp01(base.recoveryChance)
      : penalties.recover;
  return {
    range,
    damage,
    accuracy,
    consumesItem,
    recoveryChance,
    notes: base.notes || null,
    throwClass: penalties.throwClass,
    allowed: true,
  };
}

export function getAttackModesForItem(item) {
  if (!(item instanceof Item)) return [];
  const modes = [];
  if (item.weaponProfile?.isRanged) {
    modes.push({ kind: ATTACK_KIND.RANGED, profile: item.weaponProfile });
    if (item.weaponProfile.category === WEAPON_CATEGORY.THROWN) {
      return modes;
    }
  }
  const throwProfile = buildEffectiveThrowProfile(item);
  if (throwProfile) {
    modes.push({ kind: ATTACK_KIND.THROW, profile: throwProfile });
  }
  return modes;
}

export function cloneThrowProfile(profile) {
  if (!profile) return null;
  return {
    range: profile.range ? { ...profile.range } : null,
    damage: profile.damage ? { ...profile.damage } : null,
    accuracy: profile.accuracy,
    consumesItem: profile.consumesItem,
    recoveryChance: profile.recoveryChance,
    notes: profile.notes || null,
  };
}

function normalizeAmmoProfile(ammo) {
  if (!ammo) return null;
  if (typeof ammo === "string") {
    return {
      type: ammo,
      typePrefix: ammo,
      perShot: 1,
      consumesItem: false,
    };
  }
  return {
    type: ammo.type ?? null,
    typePrefix: ammo.typePrefix ?? ammo.type ?? null,
    itemId: ammo.itemId ?? null,
    perShot: Math.max(1, ammo.perShot ?? 1),
    consumesItem: !!ammo.consumesItem,
    label: ammo.label || null,
  };
}

export function normalizeWeaponProfile(profile) {
  if (!profile) return null;
  const category = profile.category || WEAPON_CATEGORY.MELEE;
  const rangeIn = profile.range || {};
  const min = Math.max(0, Math.floor(rangeIn.min ?? 0));
  const optimal = Math.max(min, Math.floor(rangeIn.optimal ?? rangeIn.ideal ?? min));
  const max = Math.max(optimal, Math.floor(rangeIn.max ?? rangeIn.long ?? optimal));
  return {
    category,
    isRanged: RANGED_WEAPON_CATEGORIES.has(category),
    range: { min, optimal, max },
    reloadTime: Math.max(0, Math.floor(profile.reloadTime ?? profile.reload ?? 0)),
    aimTime: Math.max(0, Math.floor(profile.aimTime ?? profile.aim ?? 0)),
    volley: Math.max(1, Math.floor(profile.volley ?? 1)),
    ammo: normalizeAmmoProfile(profile.ammo),
    damage: normalizeDamageProfile(profile.damage),
    accuracy: typeof profile.accuracy === "number" ? profile.accuracy : 0,
    consumeWeaponOnUse:
      profile.consumeWeaponOnUse ??
      (category === WEAPON_CATEGORY.THROWN && !profile.ammo),
    recoveryChance: clamp01(profile.recoveryChance ?? 0),
    notes: profile.notes || null,
  };
}

export function cloneWeaponProfile(profile) {
  if (!profile) return null;
  return {
    category: profile.category,
    isRanged: profile.isRanged,
    range: profile.range ? { ...profile.range } : null,
    reloadTime: profile.reloadTime,
    aimTime: profile.aimTime,
    volley: profile.volley,
    ammo: profile.ammo ? { ...profile.ammo } : null,
    damage: profile.damage ? { ...profile.damage } : null,
    accuracy: profile.accuracy,
    consumeWeaponOnUse: profile.consumeWeaponOnUse,
    recoveryChance: profile.recoveryChance,
    notes: profile.notes,
  };
}

export class Item {
  constructor(o) {
    this.id = o.id;
    this.name = o.name;
    this.kind = o.kind;
    this.equipSlots = Array.isArray(o.equipSlots)
      ? o.equipSlots.slice()
      : [];
    this.handsRequired = o.handsRequired ?? 0;
    this.dims = o.dims ?? { l: 1, w: 1, h: 1 };
    this.mass = o.mass ?? 0.1;
    this.stackable = !!o.stackable;
    this.maxStack = o.maxStack ?? (this.stackable ? 99 : 1);
    this.lightRadius = o.lightRadius ?? 0;
    this.lightColor = o.lightColor ?? null;
    this.flickerRate = typeof o.flickerRate === "number" ? o.flickerRate : 0;
    this.container = o.container ? { ...o.container } : null;
    if (this.container) this.contents = [];
    const hasExplicitThrowProfile =
      o.throwProfile !== undefined && o.throwProfile !== null;
    this.throwProfile = hasExplicitThrowProfile
      ? normalizeThrowProfile(o.throwProfile, this)
      : null;
    this.weaponProfile = normalizeWeaponProfile(o.weaponProfile);
  }
  isWeapon() {
    return this.kind === "weapon" || !!this.weaponProfile;
  }
  isRangedWeapon() {
    return !!(this.weaponProfile && this.weaponProfile.isRanged);
  }
  isThrowable() {
    return throwPenaltiesFor(this).allowed;
  }
  getThrowProfile() {
    return buildEffectiveThrowProfile(this);
  }
  clone() {
    const copy = {
      id: this.id,
      name: this.name,
      kind: this.kind,
      equipSlots: Array.isArray(this.equipSlots)
        ? this.equipSlots.slice()
        : this.equipSlots,
      handsRequired: this.handsRequired,
      dims: this.dims ? { ...this.dims } : undefined,
      mass: this.mass,
      stackable: this.stackable,
      maxStack: this.maxStack,
      lightRadius: this.lightRadius,
      lightColor: this.lightColor,
      flickerRate: this.flickerRate,
      container: null,
      throwProfile: this.throwProfile ? cloneThrowProfile(this.throwProfile) : null,
      weaponProfile: cloneWeaponProfile(this.weaponProfile),
    };

    if (this.container) {
      copy.container = { ...this.container };
    }

    const cloned = new Item(copy);

    if (Array.isArray(this.contents)) {
      cloned.contents = this.contents.slice();
    }

    return cloned;
  }
  canEquipTo(slot) {
    return this.equipSlots.includes(slot);
  }
  volumeLPerUnit() {
    return dimsVolumeL(this.dims);
  }
  longestCm() {
    return dimsLongest(this.dims);
  }
}

export class ItemStack {
  constructor(item, qty = 1) {
    if (!(item instanceof Item)) throw new Error("ItemStack needs Item");
    this.item = item;
    this.qty = qty;
  }
  get id() {
    return this.item.id;
  }
  get name() {
    return this.item.name;
  }
  get stackable() {
    return this.item.stackable;
  }
  get maxStack() {
    return this.item.maxStack;
  }
  totalMassKg() {
    return this.item.mass * this.qty;
  }
  totalVolumeL() {
    return this.item.volumeLPerUnit() * this.qty;
  }
  canMerge(other) {
    return this.stackable && other.stackable && this.id === other.id;
  }
  consume(n = 1) {
    if (!this.stackable) return false;
    const amount = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    if (amount === 0) return true;
    if (this.qty < amount) return false;
    this.qty -= amount;
    return true;
  }
}

const ItemRegistry = new Map();

export function registerItem(def) {
  if (!def || typeof def.id !== "string" || !def.id) {
    throw new Error("Item definition must include a stable string id");
  }
  if (ItemRegistry.has(def.id)) {
    throw new Error(`Duplicate item id registration attempted: ${def.id}`);
  }
  const prepared = { ...def };
  if (prepared.weaponProfile?.category === WEAPON_CATEGORY.THROWN) {
    prepared.throwProfile = null;
  }
  ItemRegistry.set(def.id, new Item(prepared));
}

export function makeItem(id) {
  const t = ItemRegistry.get(id);
  if (!t) throw new Error("Unknown item: " + id);
  return t.clone();
}

export function getThrowProfileForItem(item) {
  if (!(item instanceof Item)) return null;
  return item.getThrowProfile?.() || null;
}

const ITEM_DEFINITIONS = Object.freeze({
  weapons: [
    {
      id: "dagger",
      name: "Dagger",
      kind: "weapon",
      equipSlots: [
        SLOT.LeftHand,
        SLOT.RightHand,
        SLOT.Belt1,
        SLOT.Belt2,
        SLOT.Belt3,
        SLOT.Belt4,
      ],
      handsRequired: 1,
      dims: { l: 30, w: 4, h: 2 },
      mass: 0.4,
    },
    {
      id: "short_sword",
      name: "Short Sword",
      kind: "weapon",
      equipSlots: [
        SLOT.LeftHand,
        SLOT.RightHand,
        SLOT.Belt1,
        SLOT.Belt2,
        SLOT.Belt3,
        SLOT.Belt4,
      ],
      handsRequired: 1,
      dims: { l: 75, w: 5, h: 3 },
      mass: 1.2,
    },
    {
      id: "long_sword",
      name: "Longsword",
      kind: "weapon",
      equipSlots: [
        SLOT.LeftHand,
        SLOT.RightHand,
        SLOT.Belt1,
        SLOT.Belt2,
      ],
      handsRequired: 1,
      dims: { l: 110, w: 5, h: 3 },
      mass: 1.6,
      weaponProfile: {
        category: WEAPON_CATEGORY.MELEE,
        range: { min: 0, optimal: 1, max: 1 },
        damage: { diceCount: 1, diceSides: 8, bonus: 1 },
        notes: "Two-handed for maximum leverage.",
      },
    },
    {
      id: "battle_axe",
      name: "Battle Axe",
      kind: "weapon",
      equipSlots: [SLOT.LeftHand, SLOT.RightHand],
      handsRequired: 2,
      dims: { l: 120, w: 8, h: 4 },
      mass: 2.3,
      weaponProfile: {
        category: WEAPON_CATEGORY.MELEE,
        range: { min: 0, optimal: 1, max: 1 },
        damage: { diceCount: 1, diceSides: 10, bonus: 2 },
        notes: "Heavy axe with strong chopping power.",
      },
    },
    {
      id: "mace",
      name: "Mace",
      kind: "weapon",
      equipSlots: [
        SLOT.LeftHand,
        SLOT.RightHand,
        SLOT.Belt1,
        SLOT.Belt2,
        SLOT.Belt3,
        SLOT.Belt4,
      ],
      handsRequired: 1,
      dims: { l: 70, w: 5, h: 5 },
      mass: 1.6,
      weaponProfile: {
        category: WEAPON_CATEGORY.MELEE,
        range: { min: 0, optimal: 1, max: 1 },
        damage: { diceCount: 1, diceSides: 6, bonus: 2 },
      },
    },
    {
      id: "war_hammer",
      name: "War Hammer",
      kind: "weapon",
      equipSlots: [SLOT.LeftHand, SLOT.RightHand],
      handsRequired: 2,
      dims: { l: 110, w: 8, h: 6 },
      mass: 2.8,
      weaponProfile: {
        category: WEAPON_CATEGORY.MELEE,
        range: { min: 0, optimal: 1, max: 1 },
        damage: { diceCount: 1, diceSides: 12, bonus: 3 },
        notes: "Crushing head ideal for armored foes.",
      },
    },
    {
      id: "spear",
      name: "Spear",
      kind: "weapon",
      equipSlots: [SLOT.LeftHand, SLOT.RightHand],
      handsRequired: 2,
      dims: { l: 200, w: 4, h: 4 },
      mass: 2.0,
      weaponProfile: {
        category: WEAPON_CATEGORY.MELEE,
        range: { min: 0, optimal: 2, max: 2 },
        damage: { diceCount: 1, diceSides: 6, bonus: 2 },
        notes: "Long reach for keeping foes at bay.",
      },
    },
    {
      id: "javelin",
      name: "Javelin",
      kind: "weapon",
      equipSlots: [
        SLOT.LeftHand,
        SLOT.RightHand,
        SLOT.Belt1,
        SLOT.Belt2,
        SLOT.Belt3,
        SLOT.Belt4,
      ],
      handsRequired: 1,
      stackable: true,
      maxStack: 6,
      dims: { l: 150, w: 5, h: 5 },
      mass: 1.0,
      throwProfile: {
        range: { min: 1, optimal: 5, max: 8 },
        damage: { diceCount: 1, diceSides: 6, bonus: 2 },
        consumesItem: true,
        recoveryChance: 0.35,
      },
      weaponProfile: {
        category: WEAPON_CATEGORY.THROWN,
        range: { min: 1, optimal: 5, max: 8 },
        reloadTime: 0,
        damage: { diceCount: 1, diceSides: 6, bonus: 2 },
        consumeWeaponOnUse: true,
        recoveryChance: 0.35,
        notes:
          "A heavy spear meant for throwing; the javelin itself is expended on impact",
      },
    },
  ],
  armor: [
    {
      id: "leather_cap",
      name: "Leather Cap",
      kind: "armor",
      equipSlots: [SLOT.Head],
      dims: { l: 25, w: 20, h: 15 },
      mass: 0.6,
    },
    {
      id: "basic_clothes",
      name: "Basic Clothes",
      kind: "armor",
      equipSlots: [SLOT.BodyArmor],
      dims: { l: 40, w: 30, h: 10 },
      mass: 1.0,
    },
    {
      id: "cloak",
      name: "Cloak",
      kind: "armor",
      equipSlots: [SLOT.Cloak],
      dims: { l: 50, w: 35, h: 10 },
      mass: 1.2,
    },
    {
      id: "boots",
      name: "Boots",
      kind: "armor",
      equipSlots: [SLOT.Boots],
      dims: { l: 35, w: 25, h: 15 },
      mass: 1.5,
    },
    {
      id: "gloves",
      name: "Gloves",
      kind: "armor",
      equipSlots: [SLOT.Gloves],
      dims: { l: 20, w: 12, h: 6 },
      mass: 0.3,
    },
    {
      id: "belt_leather",
      name: "Leather Belt",
      kind: "armor",
      equipSlots: [SLOT.Belt],
      dims: { l: 20, w: 10, h: 5 },
      mass: 0.3,
    },
  ],
  jewelry: [
    {
      id: "ring_plain",
      name: "Plain Ring",
      kind: "jewelry",
      equipSlots: [SLOT.LeftRing, SLOT.RightRing],
      dims: { l: 3, w: 3, h: 1 },
      mass: 0.02,
      stackable: false,
    },
    {
      id: "amulet_simple",
      name: "Amulet",
      kind: "jewelry",
      equipSlots: [SLOT.Amulet],
      dims: { l: 5, w: 4, h: 1 },
      mass: 0.05,
    },
  ],
  tools: [
    {
      id: "torch",
      name: "Torch",
      kind: "tool",
      equipSlots: [
        SLOT.LeftHand,
        SLOT.RightHand,
        SLOT.Belt1,
        SLOT.Belt2,
        SLOT.Belt3,
        SLOT.Belt4,
      ],
      dims: { l: 30, w: 4, h: 4 },
      mass: 0.5,
      stackable: true,
      maxStack: 20,
      lightRadius: 2,
      lightColor: "#ffb347",
      flickerRate: 3.5,
    },
    {
      id: "lantern",
      name: "Lantern",
      kind: "tool",
      equipSlots: [
        SLOT.LeftHand,
        SLOT.RightHand,
        SLOT.Belt1,
        SLOT.Belt2,
        SLOT.Belt3,
        SLOT.Belt4,
      ],
      dims: { l: 18, w: 12, h: 12 },
      mass: 0.9,
      lightRadius: 5,
      lightColor: "#fff4c1",
      flickerRate: 1.2,
    },
  ],
  containers: [
    {
      id: "pouch_small",
      name: "Small Pouch",
      kind: "container",
      equipSlots: [
        SLOT.Belt1,
        SLOT.Belt2,
        SLOT.Belt3,
        SLOT.Belt4,
      ],
      dims: { l: 10, w: 8, h: 4 },
      mass: 0.1,
      container: {
        volumeL: 0.6,
        maxMassKg: 1.0,
        maxItemLengthCm: 12,
        accepts: (it) => it.kind === "ammo" || it.mass <= 0.2,
      },
    },
    {
      id: "pack_sack",
      name: "Cloth Sack",
      kind: "container",
      equipSlots: [SLOT.Backpack],
      dims: { l: 40, w: 30, h: 10 },
      mass: 0.6,
      container: {
        volumeL: 20,
        maxMassKg: 12,
        maxItemLengthCm: 60,
        accepts: (it) => it.longestCm() <= 60,
      },
    },
    {
      id: "pack_rucksack",
      name: "Rucksack",
      kind: "container",
      equipSlots: [SLOT.Backpack],
      dims: { l: 60, w: 35, h: 20 },
      mass: 1.8,
      container: {
        volumeL: 45,
        maxMassKg: 25,
        maxItemLengthCm: 80,
        accepts: (it) => it.longestCm() <= 80,
      },
    },
    {
      id: "quiver_std",
      name: "Quiver",
      kind: "container",
      equipSlots: [SLOT.Quiver],
      dims: { l: 70, w: 15, h: 8 },
      mass: 0.5,
      container: {
        volumeL: 6,
        maxMassKg: 5,
        maxItemLengthCm: 80,
        accepts: (it) => it.kind === "ammo" && it.id.startsWith("arrow_"),
      },
    },
  ],
  ammo: [
    {
      id: "arrow_wood",
      name: "Wooden Arrow",
      kind: "ammo",
      equipSlots: [],
      stackable: true,
      maxStack: 99,
      dims: { l: 75, w: 1, h: 1 },
      mass: 0.03,
    },
    {
      id: "bolt_wood",
      name: "Wooden Bolt",
      kind: "ammo",
      equipSlots: [],
      stackable: true,
      maxStack: 99,
      dims: { l: 35, w: 1.2, h: 1.2 },
      mass: 0.04,
    },
    {
      id: "sling_stone",
      name: "Smooth Stone",
      kind: "ammo",
      equipSlots: [],
      stackable: true,
      maxStack: 120,
      dims: { l: 4, w: 4, h: 4 },
      mass: 0.05,
    },
  ],
});

const ITEM_GROUP_IDS = Object.freeze({
  weapons: Object.freeze(ITEM_DEFINITIONS.weapons.map((def) => def.id)),
  armor: Object.freeze(ITEM_DEFINITIONS.armor.map((def) => def.id)),
  jewelry: Object.freeze(ITEM_DEFINITIONS.jewelry.map((def) => def.id)),
  tools: Object.freeze(ITEM_DEFINITIONS.tools.map((def) => def.id)),
  containers: Object.freeze(
    ITEM_DEFINITIONS.containers.map((def) => def.id),
  ),
  ammo: Object.freeze(ITEM_DEFINITIONS.ammo.map((def) => def.id)),
  lightSources: Object.freeze(
    ITEM_DEFINITIONS.tools
      .filter((def) => typeof def.lightRadius === "number" && def.lightRadius > 0)
      .map((def) => def.id),
  ),
});

for (const defs of Object.values(ITEM_DEFINITIONS)) {
  for (const def of defs) registerItem(def);
}

export { ITEM_DEFINITIONS, ITEM_GROUP_IDS };
