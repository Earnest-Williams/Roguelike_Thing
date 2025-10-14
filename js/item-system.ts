import {
  WEAPON_CATEGORY,
  RANGED_WEAPON_CATEGORIES,
  THROW_CLASS,
  ATTACK_KIND,
  SLOT,
  LIGHT_CHANNELS,
} from "./constants.js";
import { clamp01Normalized } from "./utils.js";

export type WeaponCategory = (typeof WEAPON_CATEGORY)[keyof typeof WEAPON_CATEGORY];
export type ThrowClass = (typeof THROW_CLASS)[keyof typeof THROW_CLASS];
export type AttackKind = (typeof ATTACK_KIND)[keyof typeof ATTACK_KIND];
export type EquipSlot = (typeof SLOT)[keyof typeof SLOT];

export interface Dimensions {
  l?: number;
  w?: number;
  h?: number;
}

export interface RangeDescriptor {
  min: number;
  optimal: number;
  max: number;
}

export interface RangeDescriptorInput extends Partial<RangeDescriptor> {
  ideal?: number;
  long?: number;
}

export interface DamageProfileInput {
  diceCount?: number;
  diceSides?: number;
  bonus?: number;
  dice?: number;
  sides?: number;
  flat?: number;
}

export interface DamageProfile {
  diceCount: number;
  diceSides: number;
  bonus: number;
}

export interface LightDescriptorInput {
  radius?: number;
  color?: string | null;
  intensity?: number;
  baseIntensity?: number;
  flickerRate?: number;
  worksWhenDropped?: boolean;
  angle?: number;
  width?: number;
  channel?: number;
}

export interface LightDescriptor {
  radius: number;
  color: string | null;
  intensity: number;
  flickerRate: number;
  worksWhenDropped: boolean;
  angle?: number;
  width?: number;
  channel?: number;
}

export interface ThrowProfileInput {
  range?: RangeDescriptorInput | null;
  damage?: DamageProfileInput | null;
  accuracy?: number;
  consumesItem?: boolean;
  recoveryChance?: number;
  notes?: string | null;
}

export interface BaseThrowProfile {
  range: RangeDescriptor | null;
  damage: DamageProfile | null;
  accuracy: number;
  consumesItem: boolean;
  recoveryChance: number;
  notes: string | null;
}

export interface EffectiveThrowProfile extends BaseThrowProfile {
  throwClass: ThrowClass;
  allowed: boolean;
}

export interface AmmoProfileInput {
  type?: string | null;
  typePrefix?: string | null;
  itemId?: string | null;
  perShot?: number;
  consumesItem?: boolean;
  label?: string | null;
}

export interface AmmoProfile {
  type: string | null;
  typePrefix: string | null;
  itemId: string | null;
  perShot: number;
  consumesItem: boolean;
  label: string | null;
}

export interface WeaponProfileInput {
  category?: WeaponCategory;
  range?: RangeDescriptorInput | null;
  reloadTime?: number;
  reload?: number;
  aimTime?: number;
  aim?: number;
  volley?: number;
  ammo?: AmmoProfileInput | string | null;
  damage?: DamageProfileInput | null;
  accuracy?: number;
  consumeWeaponOnUse?: boolean;
  recoveryChance?: number;
  notes?: string | null;
}

export interface WeaponProfile {
  category: WeaponCategory;
  isRanged: boolean;
  range: RangeDescriptor;
  reloadTime: number;
  aimTime: number;
  volley: number;
  ammo: AmmoProfile | null;
  damage: DamageProfile;
  accuracy: number;
  consumeWeaponOnUse: boolean;
  recoveryChance: number;
  notes: string | null;
}

export interface ContainerDefinition {
  volumeL?: number;
  maxMassKg?: number;
  maxItemLengthCm?: number;
  accepts?: (item: Item) => boolean;
}

export type BrandDefinition = Record<string, unknown>;
export type AffixDefinition = Record<string, unknown>;

export interface ItemInit {
  id: string;
  name: string;
  kind: string;
  equipSlots?: EquipSlot[];
  handsRequired?: number;
  dims?: Dimensions;
  mass?: number;
  stackable?: boolean;
  maxStack?: number;
  lightRadius?: number;
  lightColor?: string | null;
  flickerRate?: number;
  light?: LightDescriptorInput | null;
  lightMask?: number;
  container?: ContainerDefinition | null;
  brands?: BrandDefinition[] | null | undefined;
  resists?: Record<string, number>;
  affinities?: Record<string, number>;
  immunities?: string[] | null;
  dmgMult?: number;
  speedMult?: number;
  affixes?: AffixDefinition[] | null | undefined;
  throwProfile?: ThrowProfileInput | null;
  weaponProfile?: WeaponProfileInput | null;
}

export interface ItemDefinition extends ItemInit {
  stackable?: boolean;
  maxStack?: number;
  container?: (ContainerDefinition & Record<string, unknown>) | null;
  light?: LightDescriptorInput | null;
}

export interface ItemDefinitionGroups {
  weapons: ItemDefinition[];
  armor: ItemDefinition[];
  jewelry: ItemDefinition[];
  tools: ItemDefinition[];
  containers: ItemDefinition[];
  ammo: ItemDefinition[];
}

export type ItemGroupIdMap = {
  [K in keyof ItemDefinitionGroups]: readonly string[];
} & { lightSources: readonly string[] };

export interface ThrowPenalty {
  throwClass: ThrowClass;
  allowed: boolean;
  rangeMult: number;
  dmgMult: number;
  accDelta: number;
  consume: boolean;
  recover: number;
}

export interface AttackMode {
  kind: AttackKind;
  profile:
    | WeaponProfile
    | EffectiveThrowProfile
    | { range: RangeDescriptor; damage: DamageProfile; [key: string]: unknown };
}

function dimsVolumeL(d: Dimensions | null | undefined): number {
  if (!d || typeof d !== "object") {
    return 0.001;
  }
  const dims = [d.l, d.w, d.h].map((value) =>
    Number.isFinite(value) && value > 0 ? value : 1,
  );
  const volumeCm3 = dims.reduce((acc, value) => acc * value, 1);
  return volumeCm3 / 1000.0;
} // cm^3 to liters

function dimsLongest(d: Dimensions | null | undefined): number {
  if (!d || typeof d !== "object") {
    return 1;
  }
  const values = [d.l, d.w, d.h]
    .map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  const longest = Math.max(...values, 0);
  return longest > 0 ? longest : 1;
}

function normalizeDamageProfile(dmg: DamageProfileInput | null | undefined): DamageProfile {
  if (!dmg) {
    return { diceCount: 1, diceSides: 4, bonus: 0 };
  }
  const diceCount = Math.max(0, Math.floor(dmg.diceCount ?? dmg.dice ?? 1));
  const diceSides = Math.max(1, Math.floor(dmg.diceSides ?? dmg.sides ?? 6));
  const bonus = Math.floor(dmg.bonus ?? dmg.flat ?? 0);
  return { diceCount, diceSides, bonus };
}

function normalizeLightDescriptor(
  light: LightDescriptorInput | null | undefined,
  defaults: LightDescriptorInput = {},
): LightDescriptor | null {
  const source = light && typeof light === "object" ? light : {};
  const radiusCandidate = source.radius ?? defaults.radius;
  const radius = Number.isFinite(radiusCandidate) ? Number(radiusCandidate) : 0;
  if (radius <= 0) return null;
  const color =
    typeof source.color === "string"
      ? source.color
      : typeof defaults.color === "string"
        ? defaults.color
        : null;
  const intensitySource =
    source.intensity ??
    defaults.intensity ??
    (Number.isFinite(defaults.baseIntensity) ? defaults.baseIntensity : undefined);
  const intensity =
    intensitySource === undefined ? 1 : clamp01Normalized(Number(intensitySource));
  const flickerRateCandidate = source.flickerRate ?? defaults.flickerRate;
  const flickerRate = Number.isFinite(flickerRateCandidate)
    ? Number(flickerRateCandidate)
    : 0;
  const worksWhenDropped =
    source.worksWhenDropped ?? defaults.worksWhenDropped ?? true;
  const angleCandidate = source.angle ?? defaults.angle;
  const angle = Number.isFinite(angleCandidate) ? Number(angleCandidate) : undefined;
  const widthCandidate = source.width ?? defaults.width;
  const width = Number.isFinite(widthCandidate) ? Math.max(0, Number(widthCandidate)) : undefined;
  const channelCandidate = source.channel ?? defaults.channel;
  const channel = Number.isFinite(channelCandidate) ? Number(channelCandidate) : undefined;
  return {
    radius,
    color,
    intensity,
    flickerRate,
    worksWhenDropped,
    angle,
    width,
    channel,
  };
}

function computeHeftScore(item: Item | null | undefined): number {
  if (!item) return 0.5;
  const dims = item.dims || { l: 1, w: 1, h: 1 };
  const longest = Math.max(dims.l || 1, dims.w || 1, dims.h || 1);
  const mass = Math.max(0.05, item.mass ?? 0.1);
  // Heft combines mass with the leverage granted by item length.
  return mass * (0.6 + longest / 60);
}

function defaultThrowDamageForItem(item: Item | null | undefined): DamageProfile {
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

function defaultThrowRangeForItem(item: Item | null | undefined): RangeDescriptor {
  const dims = item && item.dims ? item.dims : { l: 1, w: 1, h: 1 };
  const longest = Math.max(dims.l || 1, dims.w || 1, dims.h || 1);
  const optimal = Math.max(2, Math.min(5, Math.round(1 + longest / 60)));
  const max = Math.max(optimal + 1, Math.min(7, optimal + Math.round(longest / 50)));
  return { min: 1, optimal, max };
}

function normalizeThrowProfile(
  profile: ThrowProfileInput | null | undefined,
  item: Item | null | undefined,
): BaseThrowProfile {
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
  const recoveryChance = clamp01Normalized(profile?.recoveryChance ?? 0);
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

export function classifyThrowability(item: Item | null | undefined): ThrowClass {
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

export function throwPenaltiesFor(item: Item | null | undefined): ThrowPenalty {
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

function baseThrowProfileForItem(item: Item | null | undefined): BaseThrowProfile | null {
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

export function buildEffectiveThrowProfile(item: Item | null | undefined): EffectiveThrowProfile | null {
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
  const baseRange = base.range ?? { min: 1, optimal: 1, max: 1 };
  const scaledMin = Math.max(1, Math.floor(baseRange.min * penalties.rangeMult));
  const scaledOptimal = Math.max(
    scaledMin,
    Math.floor(baseRange.optimal * penalties.rangeMult),
  );
  const scaledMax = Math.max(
    scaledOptimal,
    Math.floor(baseRange.max * penalties.rangeMult),
  );
  const range = {
    min: scaledMin,
    optimal: scaledOptimal,
    max: scaledMax,
  };
  const baseDamage = base.damage ?? { diceCount: 0, diceSides: 0, bonus: 0 };
  const damage: DamageProfile = {
    diceCount: baseDamage.diceCount,
    diceSides: Math.max(1, Math.round(baseDamage.diceSides * penalties.dmgMult)),
    bonus: Math.floor(baseDamage.bonus * penalties.dmgMult),
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
      ? clamp01Normalized(base.recoveryChance)
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

export function getAttackModesForItem(item: Item | null | undefined): AttackMode[] {
  if (!(item instanceof Item)) return [];
  const modes: AttackMode[] = [];
  const isThrownWeapon =
    item.weaponProfile?.category === WEAPON_CATEGORY.THROWN;
  if (item.weaponProfile?.isRanged && !isThrownWeapon) {
    modes.push({ kind: ATTACK_KIND.RANGED, profile: item.weaponProfile });
  } else if (item.weaponProfile && !item.weaponProfile.isRanged) {
    modes.push({ kind: ATTACK_KIND.MELEE, profile: item.weaponProfile });
  }
  const throwProfile = buildEffectiveThrowProfile(item);
  if (throwProfile) {
    modes.push({ kind: ATTACK_KIND.THROW, profile: throwProfile });
  }
  if (!modes.length && item.isWeapon()) {
    modes.push({
      kind: ATTACK_KIND.MELEE,
      profile: {
        range: { min: 0, optimal: 1, max: 1 },
        damage: normalizeDamageProfile(item.weaponProfile?.damage),
      },
    });
  }
  return modes;
}

export function cloneThrowProfile(profile: BaseThrowProfile | null | undefined): BaseThrowProfile | null {
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

function normalizeAmmoProfile(ammo: AmmoProfileInput | string | null | undefined): AmmoProfile | null {
  if (!ammo) return null;
  if (typeof ammo === "string") {
    return {
      type: ammo,
      typePrefix: ammo,
      perShot: 1,
      consumesItem: false,
      itemId: null,
      label: null,
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

export function normalizeWeaponProfile(profile: WeaponProfileInput | null | undefined): WeaponProfile | null {
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
    recoveryChance: clamp01Normalized(profile.recoveryChance ?? 0),
    notes: profile.notes || null,
  };
}

export function cloneWeaponProfile(profile: WeaponProfile | null | undefined): WeaponProfile | null {
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
  id: string;
  name: string;
  kind: string;
  equipSlots: EquipSlot[];
  handsRequired: number;
  dims: Dimensions;
  mass: number;
  stackable: boolean;
  maxStack: number;
  lightRadius: number;
  lightColor: string | null;
  flickerRate: number;
  light: LightDescriptor | null;
  lightMask: number;
  container: (ContainerDefinition & Record<string, unknown>) | null;
  contents?: Array<ItemStack | Item | unknown>;
  brands?: BrandDefinition[] | null;
  resists?: Record<string, number>;
  affinities?: Record<string, number>;
  immunities?: string[] | null;
  dmgMult?: number;
  speedMult?: number;
  affixes?: (AffixDefinition | null | undefined)[] | null | undefined;
  throwProfile: BaseThrowProfile | null;
  weaponProfile: WeaponProfile | null;

  constructor(o: ItemInit) {
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
    this.light = normalizeLightDescriptor(o.light, {
      radius: this.lightRadius,
      color: this.lightColor,
      intensity: o.light?.intensity,
      flickerRate: this.flickerRate,
      worksWhenDropped: o.light?.worksWhenDropped,
      angle: o.light?.angle,
      width: o.light?.width,
      channel: o.light?.channel,
    });
    this.lightMask = o.lightMask ?? LIGHT_CHANNELS.ALL;
    this.container = o.container ? { ...o.container } : null;
    if (this.container) this.contents = [];
    this.brands = Array.isArray(o.brands)
      ? o.brands.map((b) => ({ ...b }))
      : o.brands === undefined
        ? undefined
        : null;
    this.resists = o.resists ? { ...o.resists } : undefined;
    this.affinities = o.affinities ? { ...o.affinities } : undefined;
    this.immunities = Array.isArray(o.immunities)
      ? o.immunities.slice()
      : o.immunities ?? null;
    this.dmgMult = o.dmgMult;
    this.speedMult = o.speedMult;
    this.affixes = Array.isArray(o.affixes)
      ? o.affixes.map((a) => ({ ...a }))
      : o.affixes;
    const hasExplicitThrowProfile =
      o.throwProfile !== undefined && o.throwProfile !== null;
    this.throwProfile = hasExplicitThrowProfile
      ? normalizeThrowProfile(o.throwProfile, this)
      : null;
    this.weaponProfile = normalizeWeaponProfile(o.weaponProfile);
  }

  isWeapon(): boolean {
    return this.kind === "weapon" || !!this.weaponProfile;
  }

  isRangedWeapon(): boolean {
    return !!(this.weaponProfile && this.weaponProfile.isRanged);
  }

  isThrowable(): boolean {
    return throwPenaltiesFor(this).allowed;
  }

  getThrowProfile(): EffectiveThrowProfile | null {
    return buildEffectiveThrowProfile(this);
  }

  clone(): Item {
    const copy: ItemInit & {
      light?: LightDescriptor | null;
      throwProfile: BaseThrowProfile | null;
      weaponProfile: WeaponProfile | null;
      container: (ContainerDefinition & Record<string, unknown>) | null;
      brands?: BrandDefinition[] | null | undefined;
      resists?: Record<string, number>;
      affinities?: Record<string, number>;
      immunities?: string[] | null;
      affixes?: (AffixDefinition | null | undefined)[] | null | undefined;
    } = {
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
      light: this.light ? { ...this.light } : null,
      lightMask: this.lightMask,
      container: null,
      throwProfile: this.throwProfile ? cloneThrowProfile(this.throwProfile) : null,
      weaponProfile: cloneWeaponProfile(this.weaponProfile),
      brands: this.brands ? this.brands.map((b) => ({ ...b })) : undefined,
      resists: this.resists ? { ...this.resists } : undefined,
      affinities: this.affinities ? { ...this.affinities } : undefined,
      immunities: Array.isArray(this.immunities)
        ? this.immunities.slice()
        : this.immunities ?? null,
      dmgMult: this.dmgMult,
      speedMult: this.speedMult,
      affixes: Array.isArray(this.affixes)
        ? this.affixes.map((a) => ({ ...a }))
        : this.affixes,
    };

    if (this.container) {
      copy.container = { ...this.container };
    }

    const cloned = new Item(copy);

    if (Array.isArray(this.contents)) {
      cloned.contents = this.contents.map((entry) => {
        if (entry instanceof ItemStack) {
          return entry.clone();
        }
        if (entry instanceof Item) {
          return entry.clone();
        }
        return entry;
      });
    }

    return cloned;
  }

  canEquipTo(slot: EquipSlot): boolean {
    return this.equipSlots.includes(slot);
  }

  volumeLPerUnit(): number {
    return dimsVolumeL(this.dims);
  }

  longestCm(): number {
    return dimsLongest(this.dims);
  }
}

export class ItemStack {
  item: Item;
  qty: number;

  constructor(item: Item, qty = 1) {
    if (!(item instanceof Item)) throw new Error("ItemStack needs Item");
    this.item = item;
    this.qty = qty;
  }

  get id(): string {
    return this.item.id;
  }

  get name(): string {
    return this.item.name;
  }

  get stackable(): boolean {
    return this.item.stackable;
  }

  get maxStack(): number {
    return this.item.maxStack;
  }

  totalMassKg(): number {
    return this.item.mass * this.qty;
  }

  totalVolumeL(): number {
    return this.item.volumeLPerUnit() * this.qty;
  }

  clone(): ItemStack {
    return new ItemStack(this.item.clone(), this.qty);
  }

  canMerge(other: ItemStack): boolean {
    return this.stackable && other.stackable && this.id === other.id;
  }

  consume(n = 1): boolean {
    if (!this.stackable) return false;
    const amount = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    if (amount === 0) return true;
    if (this.qty < amount) return false;
    this.qty -= amount;
    return true;
  }
}

const ItemRegistry = new Map<string, Item>();

function instantiateItem(def: ItemDefinition): Item {
  const prepared: ItemDefinition = { ...def };
  if (prepared.weaponProfile?.category === WEAPON_CATEGORY.THROWN) {
    prepared.throwProfile = null;
  }
  return new Item(prepared);
}

export function registerItem(def: ItemDefinition): void {
  if (!def || typeof def.id !== "string" || !def.id) {
    throw new Error("Item definition must include a stable string id");
  }
  if (ItemRegistry.has(def.id)) {
    throw new Error(`Duplicate item id registration attempted: ${def.id}`);
  }
  ItemRegistry.set(def.id, instantiateItem(def));
}

export function upsertItem(def: ItemDefinition): void {
  if (!def || typeof def.id !== "string" || !def.id) {
    throw new Error("Item definition must include a stable string id");
  }
  ItemRegistry.set(def.id, instantiateItem(def));
}

export function makeItem(id: string): Item {
  const t = ItemRegistry.get(id);
  if (!t) throw new Error("Unknown item: " + id);
  return t.clone();
}

export function getThrowProfileForItem(item: Item | null | undefined): EffectiveThrowProfile | null {
  if (!(item instanceof Item)) return null;
  return item.getThrowProfile?.() || null;
}

const ITEM_DEFINITIONS: Readonly<ItemDefinitionGroups> = Object.freeze({
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
      id: "bow_short",
      name: "Short Bow",
      kind: "weapon",
      equipSlots: [
        SLOT.LeftHand,
        SLOT.RightHand,
        SLOT.Belt1,
        SLOT.Belt2,
        SLOT.Belt3,
        SLOT.Belt4,
      ],
      handsRequired: 2,
      dims: { l: 110, w: 8, h: 3 },
      mass: 1.0,
      weaponProfile: {
        category: WEAPON_CATEGORY.BOW,
        range: { min: 2, optimal: 7, max: 9 },
        reloadTime: 1,
        aimTime: 1,
        volley: 1,
        ammo: { type: "arrow", itemId: "arrow_wood", consumesItem: true },
        damage: { diceCount: 1, diceSides: 6, bonus: 1 },
        accuracy: 0.1,
      },
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
      id: "crossbow_light",
      name: "Light Crossbow",
      kind: "weapon",
      equipSlots: [
        SLOT.LeftHand,
        SLOT.RightHand,
        SLOT.Belt1,
        SLOT.Belt2,
        SLOT.Belt3,
        SLOT.Belt4,
      ],
      handsRequired: 2,
      dims: { l: 90, w: 45, h: 18 },
      mass: 3.2,
      weaponProfile: {
        category: WEAPON_CATEGORY.CROSSBOW,
        range: { min: 2, optimal: 8, max: 10 },
        reloadTime: 2,
        aimTime: 1,
        volley: 1,
        ammo: { type: "bolt", itemId: "bolt_wood", consumesItem: true },
        damage: { diceCount: 1, diceSides: 8, bonus: 2 },
        accuracy: 0.15,
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
    {
      id: "throwing_knife",
      name: "Throwing Knife",
      kind: "weapon",
      equipSlots: [
        SLOT.LeftHand,
        SLOT.RightHand,
        SLOT.Belt1,
        SLOT.Belt2,
        SLOT.Belt3,
        SLOT.Belt4,
        SLOT.Quiver,
      ],
      stackable: true,
      maxStack: 6,
      handsRequired: 1,
      dims: { l: 25, w: 3, h: 1 },
      mass: 0.25,
      weaponProfile: {
        category: WEAPON_CATEGORY.THROWN,
        range: { min: 1, optimal: 4, max: 6 },
        damage: { diceCount: 1, diceSides: 4, bonus: 1 },
        consumeWeaponOnUse: false,
        recoveryChance: 0.4,
        accuracy: 0.1,
        notes: "Balanced blade designed for repeated throws.",
      },
    },
    {
      id: "sling_leather",
      name: "Leather Sling",
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
      dims: { l: 80, w: 5, h: 2 },
      mass: 0.2,
      weaponProfile: {
        category: WEAPON_CATEGORY.SLING,
        range: { min: 2, optimal: 6, max: 8 },
        reloadTime: 1,
        aimTime: 0,
        volley: 1,
        ammo: { type: "stone", itemId: "sling_stone", consumesItem: true },
        damage: { diceCount: 1, diceSides: 4, bonus: 1 },
        accuracy: 0.05,
        notes: "Simple leather sling for hurling stones at range.",
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
      light: {
        radius: 2,
        color: "#ffb347",
        intensity: 1,
        flickerRate: 3.5,
        worksWhenDropped: true,
      },
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
      light: {
        radius: 5,
        color: "#fff4c1",
        intensity: 1,
        flickerRate: 1.2,
        worksWhenDropped: true,
      },
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
} as ItemDefinitionGroups);

const ITEM_GROUP_IDS: ItemGroupIdMap = Object.freeze({
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
} as ItemGroupIdMap);

for (const defs of Object.values(ITEM_DEFINITIONS)) {
  for (const def of defs) registerItem(def);
}

export { ITEM_DEFINITIONS, ITEM_GROUP_IDS };
