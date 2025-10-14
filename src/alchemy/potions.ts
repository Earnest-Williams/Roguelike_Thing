/* =======================================================================================
   POTION SYSTEM — Single-File TypeScript Bundle
   ---------------------------------------------------------------------------------------
   This file implements a complete “magical food & potions” system that:
     • Compiles INGREDIENTS → a BOTTLED SPELL (or edible).
     • Supports DRINK / EAT / THROW (splash) / COAT (weapon oil) deliveries.
     • Uses your unified combat pipeline by calling castSpell(defOverride).
     • Is STRONGER than normal spells/runes via time-gated brewing “potency grades”.
     • Optionally applies short OVER-CAP windows and ELIXIR/BOMB/OIL locks.
     • Integrates with your runes (for HIT-trigger coatings) if available.

   Drop this into your project as src/alchemy/potions.ts (or split by section later).
   ======================================================================================= */

/* ---------------------------------- Ambient hooks ------------------------------------ */
/** Minimal cross-module types (keep deliberately small and structural). */
export interface Resources { hp: number; mana?: number; stamina?: number; [k: string]: number | undefined; }
export interface ActorLike {
  id: string;
  factions?: string[];
  res: Resources;
  base?: Partial<{ maxHP: number; baseSpeed: number }>;
  x?: number; y?: number;
  modCache?: {
    temporal?: { cooldownMult?: number; cooldownPerTag?: Map<string, number> };
    resource?: { costMult?: Partial<Record<"mana" | "stamina" | "hp", number>> };
  };
  statusDerived?: { canAct?: boolean };
  __turn?: number;
  // Optional bag your status system may provide:
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activeStatuses?: any[];
}
export interface StatusAttempt { id: string; baseChance: number; baseDuration: number; }
export interface HazardSpec {
  id: string; duration: number; tickEvery: number;
  prePackets?: Record<string, number>;
  statusAttempts?: StatusAttempt[];
  pos?: { x: number; y: number; layer?: number };
  source?: ActorLike;
}
export interface GameCtx {
  turn: number;
  player: ActorLike;
  mobManager?: { list: unknown[] };
  canOccupy?(pos: { x: number; y: number }): boolean;
  addHazard?(h: HazardSpec): void;
  removeRune?(r: unknown): void;
  // Optional helpers used by coatings:
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runeStore?: any;                       // your RuneStore instance (if runes module present)
  equipItemInHand?: () => object | null; // returns the equipped weapon object (for coatings)
}

/** Ambient: your spell engine entrypoint (already exists in your codebase). */
declare module "@spells/engine" {
  import type { ActorLike, GameCtx } from "*";
  export interface CastArgs {
    actor: ActorLike & { __spellCD?: Record<string, number> };
    ctx: GameCtx & { targetPos?: { x: number; y: number }; targetActor?: ActorLike };
    defOverride: import("*").SpellDef; // compile-time injected from below
  }
  export function castSpell(args: CastArgs): { ok: boolean; results?: unknown[]; reason?: string };
}

/** Ambient: your event bus (optional; safe no-op if not wired at runtime). */
declare module "@ui/event-log" {
  export const EVENT: { SPELL_CAST: "SPELL_CAST" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function emit<T = any>(evt: string, payload: T): void;
}

/** Ambient: optional runes hooks (only needed for COAT delivery). */
declare module "@runes/types" {
  export const RUNE_TRIGGER: { HIT: "hit" };
  export const RUNE_EFFECT: { ATTACK: "attack" };
  export interface RuneDef {
    id: string; name: string; anchor: "item"; trigger: "hit"; effect: "attack";
    armingTime: number; charges: number; cooldown: number;
    prePackets?: Record<string, number>; statusAttempts?: import("*").StatusAttempt[]; tags?: string[];
  }
}
declare module "@runes/engine" {
  import type { RuneDef } from "@runes/types";
  export function makeRuneInstance(def: RuneDef, owner?: { ownerId?: string | null; ownerFaction?: string[] }): unknown;
  export function armRune(inst: unknown, turn: number): void;
}

/* ----------------------------------- Spell defs -------------------------------------- */
export type TargetKind = "self" | "point" | "actor" | "line" | "cone" | "circle";
export interface SpellDef {
  id: string;
  name: string;
  tags: string[];
  cost: Partial<Record<"mana" | "stamina" | "hp", number>>;
  apCost: number;
  cooldown: number;                     // turns
  range: number;                        // tiles
  targetKind: TargetKind;
  shape?: Partial<{ radius: number; length: number; angleDeg: number }>;
  prePackets: Record<string, number>;   // e.g., { fire: 12 }
  statusAttempts?: StatusAttempt[];
}

/* -------------------------------- Delivery & Ingredients ----------------------------- */
export const DELIVERY = { DRINK: "drink", THROW: "throw", COAT: "coat", EAT: "eat" } as const;
export type Delivery = typeof DELIVERY[keyof typeof DELIVERY];

export const FORM = { LIQUID: "liquid", OIL: "oil", POWDER: "powder", SOLID: "solid" } as const;
export type IngredientForm = typeof FORM[keyof typeof FORM];

export interface Ingredient {
  id: string; name: string; form: IngredientForm; tags: string[];
  aspects: Partial<Record<string, number>>; // elemental “attunement” (fire/cold/etc.)
  potency?: number;     // contributes to stack size / charges
  stability?: number;   // reduces mishap risk
  viscosity?: number;   // biases toward COAT/Hazard
  aroma?: number;       // biases toward EAT
  ingestStatuses?: StatusAttempt[]; // statuses applied when DRINK/EAT
  hazardHint?: Partial<HazardSpec>; // suggested splash cloud on THROW
}

export interface BrewOptions {
  targetDelivery?: Delivery;
  chosenSpell: SpellDef; // spell to infuse (will be scaled)
  tier?: number;
  idHint?: string;
}

/* --------------------------------- Potions & Runtime --------------------------------- */
export interface PotionDef {
  id: string; name: string; tags: string[];
  delivery: Delivery; charges: number; apCost: number; cooldown: number;
  shelfLife?: number;
  storedSpell: SpellDef;
  ingestStatuses?: StatusAttempt[]; // DRINK/EAT
  hazardOnBreak?: HazardSpec;       // THROW
  // Strength/time metadata:
  potencyGrade: "Standard" | "Greater" | "Grand" | "Mythic";
  overcapAllowance?: number;        // % allowed over caps (short window)
  brewTimeTurns: number;
  mishapChance?: number;            // % chance to fizzle/backfire on use
  lockTag?: "elixir" | "bomb" | "oil";
  lockDuration?: number;            // turns
}

export interface BrewedItem { def: PotionDef; usesLeft: number; }

/* ------------------------------ Ingredient Library (demo) ----------------------------- */
export const ING: Readonly<Record<string, Ingredient>> = {
  water:         { id:"water", name:"Water", form:FORM.LIQUID, tags:["base"], aspects:{}, potency:0, stability:2 },
  grain_alcohol: { id:"grain_alcohol", name:"Rectified Spirit", form:FORM.LIQUID, tags:["volatile","solvent"], aspects:{ arcane:1 }, potency:1, stability:-1, hazardHint:{ id:"fume", duration:2, tickEvery:1 } },
  lamp_oil:      { id:"lamp_oil", name:"Lamp Oil", form:FORM.OIL, tags:["oil","viscous"], aspects:{ fire:2 }, potency:1, viscosity:3 },
  honey:         { id:"honey", name:"Honey", form:FORM.LIQUID, tags:["sweet"], aspects:{}, potency:0, aroma:2, stability:1 },
  gum_arabic:    { id:"gum_arabic", name:"Gum Arabic", form:FORM.SOLID, tags:["thickener","binder"], aspects:{}, potency:0, viscosity:2, stability:2 },
  firecap:       { id:"firecap", name:"Firecap", form:FORM.SOLID, tags:["fire","hot"], aspects:{ fire:6 }, potency:5, ingestStatuses:[{id:"haste", baseChance:0.25, baseDuration:2}] },
  frostroot:     { id:"frostroot", name:"Frostroot", form:FORM.SOLID, tags:["cold"], aspects:{ cold:6 }, potency:5 },
  sparkweed:     { id:"sparkweed", name:"Sparkweed", form:FORM.SOLID, tags:["lightning"], aspects:{ lightning:6 }, potency:5 },
  nightshade:    { id:"nightshade", name:"Nightshade", form:FORM.SOLID, tags:["toxic"], aspects:{ poison:6 }, potency:5 },
  aether_petal:  { id:"aether_petal", name:"Aether Petal", form:FORM.SOLID, tags:["arcane","catalyst"], aspects:{ arcane:5 }, potency:4 },
  rock_salt:     { id:"rock_salt", name:"Rock Salt", form:FORM.SOLID, tags:["stabilizer"], aspects:{}, potency:0, stability:3 },
  flour:         { id:"flour", name:"Fine Flour", form:FORM.POWDER, tags:["powder","food"], aspects:{}, potency:0, aroma:1 },
  dried_meat:    { id:"dried_meat", name:"Dried Meat", form:FORM.SOLID, tags:["food","protein"], aspects:{}, potency:0, aroma:2, ingestStatuses:[{id:"regeneration", baseChance:1, baseDuration:3}] },
} as const;

/* -------------------------------- Brewing Process (time) ------------------------------ */
export type BrewStepId = "macerate" | "decoct" | "reduce" | "distill" | "age";
export interface BrewStep { id: BrewStepId; turns: number; difficulty: number; yield: number; risk: number; }
export interface Apparatus { id: string; quality: number; }              // 0..3
export interface BrewerSkill { alchemy: number; safety: number; }        // 0..100
export interface PotencyOutcome {
  grade: "Standard" | "Greater" | "Grand" | "Mythic";
  multPackets: number; multDurations: number; overcapAllowance: number;
  brewTimeTurns: number; mishapChance: number; score: number;
}
export const STEP_LIB: Readonly<Record<BrewStepId, BrewStep>> = {
  macerate:{ id:"macerate", turns: 60,  difficulty: 8,  yield: 4, risk: 1 },
  decoct:  { id:"decoct",   turns: 120, difficulty: 12, yield: 7, risk: 2 },
  reduce:  { id:"reduce",   turns: 90,  difficulty: 10, yield: 6, risk: 3 },
  distill: { id:"distill",  turns: 150, difficulty: 14, yield: 9, risk: 4 },
  age:     { id:"age",      turns: 600, difficulty: 6,  yield: 10, risk: 0 },
};
export function evaluateProcess(steps: BrewStepId[], station: Apparatus, skill: BrewerSkill): PotencyOutcome {
  const totalTurns = steps.reduce((t, id) => t + STEP_LIB[id].turns, 0);
  let score = 0, volatility = 0;
  for (const id of steps) {
    const st = STEP_LIB[id];
    const effDC = Math.max(1, st.difficulty - station.quality * 2);
    const delta = (skill.alchemy - effDC);
    score += st.yield + Math.max(0, Math.floor(delta / 5));
    volatility += Math.max(0, st.risk - Math.floor(skill.safety / 25) - station.quality);
  }
  let out: PotencyOutcome = { grade:"Standard", multPackets:1.3, multDurations:1.1, overcapAllowance:0, brewTimeTurns: totalTurns, mishapChance: Math.max(0, volatility*3), score };
  if (score >= 18) out = { ...out, grade:"Greater", multPackets:1.55, multDurations:1.25, overcapAllowance:5 };
  if (score >= 26) out = { ...out, grade:"Grand",   multPackets:1.75, multDurations:1.35, overcapAllowance:10 };
  if (score >= 34) out = { ...out, grade:"Mythic",  multPackets:2.00, multDurations:1.50, overcapAllowance:15 };
  if (steps.includes("age")) out.multPackets = parseFloat((out.multPackets * 1.05).toFixed(2)); // small aging bump
  return out;
}

/* ------------------------------- Core brewing utilities ------------------------------- */
const sum = <T>(arr: T[], f: (x: T) => number) => arr.reduce((a, b) => a + f(b), 0);

function inferDelivery(ings: Ingredient[], explicit?: Delivery): Delivery {
  if (explicit) return explicit;
  const hasOil   = ings.some(i => i.form===FORM.OIL || i.tags.includes("oil") || (i.viscosity??0)>=2);
  const isPowder = ings.every(i => i.form===FORM.POWDER || i.tags.includes("powder"));
  const foodish  = sum(ings, i => i.aroma ?? 0) >= 2 || ings.some(i => i.tags.includes("food"));
  if (hasOil)   return DELIVERY.COAT;
  if (isPowder) return DELIVERY.THROW;
  if (foodish)  return DELIVERY.EAT;
  return DELIVERY.DRINK;
}

function scaleByAspects(base: SpellDef, ings: Ingredient[]): SpellDef {
  const elemAccum: Record<string, number> = {};
  for (const ing of ings) for (const [k, v] of Object.entries(ing.aspects || {})) elemAccum[k] = (elemAccum[k] ?? 0) + v;
  const total = Object.values(elemAccum).reduce((a, b) => a + b, 0) || 1;
  const norm: Record<string, number> = {};
  for (const [k, v] of Object.entries(elemAccum)) norm[k] = 0.8 + (v / total) * 0.7; // 0.8..1.5
  const prePackets: Record<string, number> = {};
  for (const [k, a] of Object.entries(base.prePackets || {})) prePackets[k] = Math.max(1, Math.round(a * (norm[k] ?? 1.0)));
  const hasCatalyst = ings.some(i => i.tags.includes("catalyst"));
  if (hasCatalyst) for (const k of Object.keys(prePackets)) prePackets[k] = Math.round(prePackets[k] * 1.1);
  return { ...base, id:`${base.id}#infused`, name:`${base.name} Infusion`, prePackets, cost:{ mana:0, stamina:0 }, cooldown:0, tags:[...new Set([...(base.tags||[]), "infused"])] };
}

function scalePotent(base: SpellDef, multPackets: number, multDurations: number): SpellDef {
  const prePackets: Record<string, number> = {};
  for (const [k, a] of Object.entries(base.prePackets || {})) prePackets[k] = Math.max(1, Math.round(a * multPackets));
  const statusAttempts = (base.statusAttempts ?? []).map(s => ({ ...s, baseDuration: Math.max(1, Math.round(s.baseDuration * multDurations)) }));
  return { ...base, id:`${base.id}#potent`, name:`${base.name} (Potent)`, prePackets, statusAttempts, cost:{ mana:0, stamina:0 }, cooldown:0, tags:[...new Set([...(base.tags||[]), "potent"])] };
}

/* -------------------------------- Basic brew (balanced) ------------------------------- */
export function brewPotion(ingredients: Ingredient[], opts: BrewOptions): BrewedItem {
  if (!opts.chosenSpell) throw new Error("No spell provided for infusion");
  if (!ingredients.length) throw new Error("No ingredients");
  const delivery = inferDelivery(ingredients, opts.targetDelivery);
  const potency  = sum(ingredients, i => i.potency ?? 0);
  const viscosity= sum(ingredients, i => i.viscosity ?? 0);
  const stability= sum(ingredients, i => i.stability ?? 0);

  const scaled = scaleByAspects(opts.chosenSpell, ingredients);

  let charges = 1, apCost = 60, cooldown = 0;
  let hazardOnBreak: HazardSpec | undefined;
  const ingestStatuses = ingredients.flatMap(i => i.ingestStatuses ?? []);

  if (delivery === "drink" || delivery === "eat") {
    charges  = 1 + Math.floor((potency + stability) / 10);
    apCost   = delivery === "drink" ? 60 : 80;
    cooldown = 1;
  } else if (delivery === "throw") {
    charges  = 1 + Math.floor(potency / 8);
    apCost   = 90;
    cooldown = 0;
    const hasVol = ingredients.some(i => i.tags.includes("volatile") || i.form === FORM.POWDER);
    if (hasVol) {
      const radius = 1 + Math.min(2, Math.floor((potency + viscosity) / 8));
      hazardOnBreak = {
        id:"alchemical_cloud", duration: 2 + Math.floor(stability / 4), tickEvery: 1,
        prePackets: Object.fromEntries(Object.entries(scaled.prePackets).map(([k, a]) => [k, Math.max(1, Math.floor(a * 0.4))])),
        statusAttempts: scaled.statusAttempts,
      };
    }
  } else if (delivery === "coat") {
    charges  = 10 + Math.floor((viscosity + potency)/2);
    apCost   = 80;
    cooldown = 0;
  }

  const def: PotionDef = {
    id: `${opts.idHint ?? "brew"}:${ingredients.map(i => i.id).join("+")}`,
    name: `${opts.chosenSpell.name} ${delivery === "coat" ? "Oil" : delivery === "throw" ? "Phial" : delivery === "eat" ? "Ration" : "Potion"}`,
    tags: Array.from(new Set([...(opts.chosenSpell.tags||[]), ...ingredients.flatMap(i=>i.tags), delivery, "potion"])),
    delivery, charges, apCost, cooldown,
    storedSpell: scaled,
    ingestStatuses: (delivery==="drink"||delivery==="eat") ? ingestStatuses : undefined,
    hazardOnBreak,
    // baseline (no time boost)
    potencyGrade: "Standard", overcapAllowance: 0, brewTimeTurns: 0, mishapChance: 0,
  };
  return { def, usesLeft: def.charges };
}

/* ----------------------------- Strong brew (time-gated) ------------------------------- */
export interface StrongBrewOptions extends BrewOptions {
  processPlan: BrewStepId[];      // e.g., ["macerate","decoct","reduce","distill"]
  apparatus: Apparatus;           // station quality 0..3
  brewer: BrewerSkill;            // player/NPC skill
  lock?: { tag: "elixir" | "bomb" | "oil"; duration: number };
}
export function brewPotionStrong(ingredients: Ingredient[], opts: StrongBrewOptions): BrewedItem {
  if (!opts.chosenSpell) throw new Error("No spell provided for infusion");
  if (!ingredients.length) throw new Error("No ingredients");
  if (!opts.processPlan?.length) throw new Error("No process plan provided");

  const delivery = inferDelivery(ingredients, opts.targetDelivery);
  const pot = evaluateProcess(opts.processPlan, opts.apparatus, opts.brewer);          // time/skill → potency
  const scaledPotent = scalePotent(scaleByAspects(opts.chosenSpell, ingredients), pot.multPackets, pot.multDurations);

  const base = brewPotion(ingredients, { chosenSpell: scaledPotent, targetDelivery: delivery, idHint: opts.idHint });
  const def: PotionDef = {
    ...base.def,
    name: `${base.def.name} — ${pot.grade}`,
    potencyGrade: pot.grade,
    overcapAllowance: pot.overcapAllowance,
    brewTimeTurns: pot.brewTimeTurns,
    mishapChance: pot.mishapChance,
    lockTag: opts.lock?.tag,
    lockDuration: opts.lock?.duration,
  };
  return { def, usesLeft: def.charges };
}

/* ------------------------------------ Engine (use) ----------------------------------- */
import { castSpell } from "@spells/engine";
import { EVENT, emit } from "@ui/event-log";
import { RUNE_TRIGGER, RUNE_EFFECT } from "@runes/types";
import { makeRuneInstance, armRune } from "@runes/engine";

/** Use (consume/deploy) a brewed item. */
export function useBrew(args: {
  user: ActorLike & { __turn?: number };
  brew: BrewedItem;
  ctx: GameCtx & { targetPos?: { x: number; y: number }; targetActor?: ActorLike };
}): { ok: boolean; reason?: string } {
  const { user, brew, ctx } = args;
  const def = brew.def;
  if (brew.usesLeft === 0) return { ok: false, reason: "empty" };
  if (hasLock(user, def))  return { ok: false, reason: "locked" };

  // Mishap (only on potent brews with non-zero chance)
  if (def.mishapChance && (Math.random() * 100) <= def.mishapChance) {
    // Simple backfire: weak self-hit using 25% of storedSpell
    const backfire: SpellDef = { ...def.storedSpell, name:`${def.storedSpell.name} (Backfire)`, prePackets: scaleDown(def.storedSpell.prePackets, 0.25) };
    castSpell({ actor: user, ctx: { ...ctx, targetActor: user, targetPos: { x: user.x ?? 0, y: user.y ?? 0 } }, defOverride: forceSelfTarget(backfire) });
    postUse(brew, ctx, def);
    return { ok: false, reason: "mishap" };
  }

  // DRINK/EAT → self-cast + statuses
  if (def.delivery === DELIVERY.DRINK || def.delivery === DELIVERY.EAT) {
    const res = castSpell({ actor: user, ctx: { ...ctx, targetActor: user, targetPos: { x: user.x ?? 0, y: user.y ?? 0 } }, defOverride: forceSelfTarget(def.storedSpell) });
    applyIngestStatuses(user, def);
    applyOvercapWindow(user, def);
    applyLock(user, def);
    postUse(brew, ctx, def);
    return res.ok ? { ok: true } : { ok: false, reason: res.reason };
  }

  // THROW → cast at point/actor; optional splash hazard
  if (def.delivery === DELIVERY.THROW) {
    if (!ctx.targetPos && !ctx.targetActor) return { ok:false, reason:"no-target" };
    const targetPos = ctx.targetPos ?? { x: ctx.targetActor!.x!, y: ctx.targetActor!.y! };
    const res = castSpell({ actor: user, ctx: { ...ctx, targetPos, targetActor: ctx.targetActor }, defOverride: ensureAoEAtPoint(def.storedSpell) });
    if (def.hazardOnBreak && ctx.addHazard) ctx.addHazard({ ...def.hazardOnBreak, pos: targetPos, source: user });
    applyLock(user, def);
    postUse(brew, ctx, def);
    return res.ok ? { ok: true } : { ok: false, reason: res.reason };
  }

  // COAT → create a HIT-trigger rune on the weapon via your runes store
  if (def.delivery === DELIVERY.COAT) {
    const item = ctx.equipItemInHand?.();
    if (!item || !ctx.runeStore) return { ok:false, reason:"no-weapon" };
    const rune = {
      id: `coat:${def.id}`, name: `${def.storedSpell.name} Coating`,
      anchor: "item", trigger: RUNE_TRIGGER.HIT, effect: RUNE_EFFECT.ATTACK,
      armingTime: 0, charges: def.charges, cooldown: 0,
      prePackets: def.storedSpell.prePackets, statusAttempts: def.storedSpell.statusAttempts, tags: ["coating","alchemy"],
    } as const;
    const inst = makeRuneInstance(rune, { ownerId: user.id, ownerFaction: user.factions });
    ctx.runeStore.addItemRune?.(inst, item);
    armRune(inst, ctx.turn);
    // Consume the whole bottle when applying a full coating:
    brew.usesLeft = 0;
    emit?.(EVENT?.SPELL_CAST ?? "SPELL_CAST", { def: def.storedSpell, actor: user, coating: true });
    return { ok: true };
  }

  return { ok:false, reason:"unsupported" };
}

/* ------------------------------------ Helpers ---------------------------------------- */
function forceSelfTarget(spell: SpellDef): SpellDef { return { ...spell, targetKind: "self", range: 0, shape: { radius: 0 } }; }
function ensureAoEAtPoint(spell: SpellDef): SpellDef {
  if (spell.targetKind === "circle") return spell;
  return { ...spell, targetKind: "circle", shape: { radius: 1 }, range: 0 };
}
function scaleDown(packets: Record<string, number>, f: number) {
  const out: Record<string, number> = {};
  for (const [k, a] of Object.entries(packets)) out[k] = Math.max(1, Math.floor(a * f));
  return out;
}
function applyIngestStatuses(user: ActorLike, def: PotionDef) {
  for (const s of def.ingestStatuses ?? []) {
    if (Math.random() <= s.baseChance) (user.activeStatuses ||= []).push({ id: s.id, remaining: s.baseDuration });
  }
}
function applyOvercapWindow(user: ActorLike, def: PotionDef) {
  if (!def.overcapAllowance) return;
  (user.activeStatuses ||= []).push({ id: "elixir_overcap", remaining: 5, payload: { overcapPct: def.overcapAllowance } });
}
function applyLock(user: ActorLike, def: PotionDef) {
  if (!def.lockTag || !def.lockDuration) return;
  (user.activeStatuses ||= []).push({ id: `lock:${def.lockTag}`, remaining: def.lockDuration });
}
function hasLock(user: ActorLike, def: PotionDef): boolean {
  if (!def.lockTag) return false;
  return (user.activeStatuses || []).some(s => s.id === `lock:${def.lockTag}`);
}
function postUse(brew: BrewedItem, ctx: GameCtx, def: PotionDef) {
  brew.usesLeft = (brew.usesLeft < 0) ? -1 : Math.max(0, brew.usesLeft - 1);
  emit?.(EVENT?.SPELL_CAST ?? "SPELL_CAST", { def: def.storedSpell, item: def });
}

/* ------------------------------------- Examples -------------------------------------- */
// Usage examples (replace SPELLS.* with your real registry entries).
export const EXAMPLES = {
  /** Fire tonic (drink): Firebolt + water + honey + firecap */
  fire_tonic_drink: (spell: SpellDef) => brewPotion([ING.water, ING.honey, ING.firecap], { chosenSpell: spell, targetDelivery: DELIVERY.DRINK, idHint: "brew" }),
  /** Frost phial (throw): Frost nova + alcohol + frostroot + gum arabic */
  frost_phial_throw: (spell: SpellDef) => brewPotion([ING.grain_alcohol, ING.frostroot, ING.gum_arabic], { chosenSpell: spell, targetDelivery: DELIVERY.THROW, idHint: "brew" }),
  /** Shock oil (coat): Chain spark + lamp oil + aether petal + rock salt (STRONG, time-gated) */
  shock_oil_strong: (spell: SpellDef) => brewPotionStrong(
    [ING.lamp_oil, ING.sparkweed, ING.aether_petal, ING.rock_salt],
    { chosenSpell: spell, targetDelivery: DELIVERY.COAT, processPlan: ["macerate","reduce","age"], apparatus: { id:"arcane_lab", quality: 3 }, brewer: { alchemy: 70, safety: 60 }, idHint: "brew", lock: { tag: "oil", duration: 0 } }
  ),
  /** Greater fire bomb (throw, strong): long cook */
  greater_fire_phial: (spell: SpellDef) => brewPotionStrong(
    [ING.grain_alcohol, ING.firecap, ING.gum_arabic],
    { chosenSpell: spell, targetDelivery: DELIVERY.THROW, processPlan: ["macerate","decoct","reduce","distill"], apparatus: { id:"field_kit", quality: 1 }, brewer: { alchemy: 35, safety: 25 }, idHint: "brew", lock: { tag: "bomb", duration: 2 } }
  ),
};
