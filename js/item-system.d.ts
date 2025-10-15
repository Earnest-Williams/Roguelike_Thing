import { WEAPON_CATEGORY, THROW_CLASS, ATTACK_KIND, SLOT } from "./constants.js";
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
    radius?: number | undefined;
    color?: string | null | undefined;
    intensity?: number | undefined;
    baseIntensity?: number | undefined;
    flickerRate?: number | undefined;
    worksWhenDropped?: boolean | undefined;
    angle?: number | undefined;
    width?: number | undefined;
    channel?: number | undefined;
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
    damage: DamageProfile | null;
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
} & {
    lightSources: readonly string[];
};
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
    profile: WeaponProfile | EffectiveThrowProfile | {
        range: RangeDescriptor;
        damage: DamageProfile;
        [key: string]: unknown;
    };
}
export declare function classifyThrowability(item: Item | null | undefined): ThrowClass;
export declare function throwPenaltiesFor(item: Item | null | undefined): ThrowPenalty;
export declare function buildEffectiveThrowProfile(item: Item | null | undefined): EffectiveThrowProfile | null;
export declare function getAttackModesForItem(item: Item | null | undefined): AttackMode[];
export declare function cloneThrowProfile(profile: BaseThrowProfile | null | undefined): BaseThrowProfile | null;
export declare function normalizeWeaponProfile(profile: WeaponProfileInput | null | undefined): WeaponProfile | null;
export declare function cloneWeaponProfile(profile: WeaponProfile | null | undefined): WeaponProfile | null;
export declare class Item {
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
    constructor(o: ItemInit);
    isWeapon(): boolean;
    isRangedWeapon(): boolean;
    isThrowable(): boolean;
    getThrowProfile(): EffectiveThrowProfile | null;
    clone(): Item;
    canEquipTo(slot: EquipSlot): boolean;
    volumeLPerUnit(): number;
    longestCm(): number;
}
export declare class ItemStack {
    item: Item;
    qty: number;
    constructor(item: Item, qty?: number);
    get id(): string;
    get name(): string;
    get stackable(): boolean;
    get maxStack(): number;
    totalMassKg(): number;
    totalVolumeL(): number;
    clone(): ItemStack;
    canMerge(other: ItemStack): boolean;
    consume(n?: number): boolean;
}
export declare function registerItem(def: ItemDefinition): void;
export declare function upsertItem(def: ItemDefinition): void;
export declare function makeItem(id: string): Item;
export declare function getThrowProfileForItem(item: Item | null | undefined): EffectiveThrowProfile | null;
declare const ITEM_DEFINITIONS: Readonly<ItemDefinitionGroups>;
declare const ITEM_GROUP_IDS: ItemGroupIdMap;
export { ITEM_DEFINITIONS, ITEM_GROUP_IDS };
