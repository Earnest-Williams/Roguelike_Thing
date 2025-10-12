// src/content/affixes.js
// @ts-check

export const AFFIX_POOLS = {
  prefix: [
    { id:"searing",  apply:i=>addBrand(i, "fire", { flat:2, pct:0.05 }), w:3, powerCost:3, tags:["fire", "elemental", "offense"] },
    { id:"freezing", apply:i=>addBrand(i, "cold", { flat:2, pct:0.05 }), w:3, powerCost:3, tags:["cold", "elemental", "control"] },
    { id:"drenching", apply:i=>addBrand(i, "water", { flat:2, pct:0.05 }), w:3, powerCost:2, tags:["water", "elemental", "offense"] },
    { id:"crackling",apply:i=>addBrand(i, "lightning", { flat:1, pct:0.08 }), w:2, powerCost:3, tags:["lightning", "elemental", "burst"] },
    { id:"corroding", apply:i=>addBrand(i, "acid", { flat:1, pct:0.06, onHitStatuses:[{ id:"poisoned", chance:0.2, stacks:1, potency:2 }] }), w:2, powerCost:4, tags:["acid", "debuff", "damage_over_time"] },
    { id:"venom_laced", apply:i=>addBrand(i, "toxic", { pct:0.08, onHitStatuses:[{ id:"poisoned", chance:0.35, stacks:1 }] }), w:2, powerCost:4, tags:["toxic", "poison", "debuff"] },
    { id:"radiant", apply:i=>merge(addBrand(i, "radiant", { flat:2, pct:0.05 }), { affinities:{ radiant:0.05 } }), w:1, powerCost:5, tags:["radiant", "holy", "support"] },
    { id:"duskforged", apply:i=>merge(addBrand(i, "void", { pct:0.05 }), { polarity:{ grant:{ void:0.1 } } }), w:1, powerCost:5, tags:["void", "polarity", "dark"] },
    { id:"tempestuous", apply:i=>merge(addBrand(i, "storm", { pct:0.07 }), { temporal:{ actionSpeedPct:-0.05 } }), w:2, powerCost:4, tags:["storm", "elemental", "tempo"] },
    { id:"geomantic", apply:i=>addBrand(i, "earth", { flat:3, onHitStatuses:[{ id:"slowed", chance:0.25, stacks:1, duration:2 }] }), w:1, powerCost:4, tags:["earth", "control", "crowd_control"] },
    { id:"siphoning", apply:i=>merge(addBrand(i, "blood", { pct:0.04 }), { resources:{ stamina:{ onHitGain:1 } } }), w:1, powerCost:3, tags:["blood", "sustain", "stamina"] },
  ],
  suffix: [
    { id:"of_embers", apply:i=>merge(i, { affinities:{ fire:0.05 } }), w:3, powerCost:2, tags:["fire", "elemental", "affinity"] },
    { id:"of_winter", apply:i=>merge(i, { resists:{ cold:0.10 } }), w:3, powerCost:3, tags:["cold", "defense", "resist"] },
    { id:"of_swiftness", apply:i=>merge(i, { speedMult:0.95 }), w:2, powerCost:4, tags:["speed", "mobility", "tempo"] },
    { id:"of_precision", apply:i=>merge(i, { temporal:{ baseActionAPDelta:-5, actionSpeedPct:-0.02 } }), w:2, powerCost:4, tags:["tempo", "accuracy", "control"] },
    { id:"of_focus", apply:i=>merge(i, { temporal:{ cooldownPct:-0.05 }, resource:{ costMult:{ stamina:0.9 } } }), w:2, powerCost:5, tags:["cooldown", "stamina", "sustain"] },
    { id:"of_duality", apply:i=>merge(i, { affinities:{ fire:0.04, lightning:0.04 }, polarity:{ grant:{ order:0.05, chaos:0.05 } } }), w:1, powerCost:5, tags:["fire", "lightning", "polarity"] },
    { id:"of_vigor", apply:i=>merge(i, { resource:{ gainFlat:{ stamina:1 }, regenFlat:{ stamina:1 } } }), w:1, powerCost:4, tags:["stamina", "sustain", "endurance"] },
  ],
};

function addBrand(item, type, { flat=0, pct=0, ...rest }={}) {
  const arr = Array.isArray(item.brands) ? item.brands : (item.brands = []);
  arr.push({ kind:"brand", type, flat, pct, ...rest });
  return item;
}

function merge(item, payload) {
  for (const k of Object.keys(payload)) {
    if (typeof payload[k] === "object" && !Array.isArray(payload[k])) {
      item[k] = { ...(item[k]||{}), ...payload[k] };
    } else {
      item[k] = payload[k];
    }
  }
  return item;
}

/** Roll a weighted entry */
export function rollWeighted(list, rng) {
  const total = list.reduce((a,x)=>a+x.w,0) || 1;
  let r = Math.floor(rng()*total);
  for (const e of list) { if ((r -= e.w) < 0) return e; }
  return list[0];
}

/** Applies up to {p:1, s:1} affixes to a base item def (shallow cloned) */
export function applyAffixes(baseDef, rng=Math.random) {
  const it = JSON.parse(JSON.stringify(baseDef));
  it.affixes = [];
  if (rng() < 0.75) {
    const picked = rollWeighted(AFFIX_POOLS.prefix, rng);
    picked.apply(it);
    it.affixes.push({ slot: "prefix", id: picked.id });
  }
  if (rng() < 0.75) {
    const picked = rollWeighted(AFFIX_POOLS.suffix, rng);
    picked.apply(it);
    it.affixes.push({ slot: "suffix", id: picked.id });
  }
  if (Array.isArray(it.affixes) && it.affixes.length && it.name) {
    const prefix = it.affixes.find((a) => a.slot === "prefix");
    const suffix = it.affixes.find((a) => a.slot === "suffix");
    const parts = [];
    if (prefix) parts.push(formatAffixName(prefix.id));
    parts.push(baseDef.name || baseDef.id || "Item");
    if (suffix) parts.push(formatAffixName(suffix.id));
    it.name = parts.filter(Boolean).join(" ");
  }
  return it;
}

function formatAffixName(id="") {
  return id
    .replace(/_/g, " ")
    .replace(/\b([a-z])/g, (_, ch) => ch.toUpperCase());
}
