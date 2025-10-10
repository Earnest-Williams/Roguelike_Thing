// src/content/affixes.js
// @ts-check

export const AFFIX_POOLS = {
  prefix: [
    { id:"searing",  apply:i=>addBrand(i, "fire", { flat:2, pct:0.05 }), w:3 },
    { id:"freezing", apply:i=>addBrand(i, "cold", { flat:2, pct:0.05 }), w:3 },
    { id:"crackling",apply:i=>addBrand(i, "lightning", { flat:1, pct:0.08 }), w:2 },
  ],
  suffix: [
    { id:"of_embers", apply:i=>merge(i, { affinities:{ fire:0.05 } }), w:3 },
    { id:"of_winter", apply:i=>merge(i, { resists:{ cold:0.10 } }), w:3 },
    { id:"of_swiftness", apply:i=>merge(i, { speedMult:0.95 }), w:2 },
  ],
};

function addBrand(item, type, { flat=0, pct=0 }={}) {
  const arr = Array.isArray(item.brands) ? item.brands : (item.brands = []);
  arr.push({ kind:"brand", type, flat, pct });
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
    it.name = parts.join(" ");
  }
  return it;
}

function formatAffixName(id="") {
  return id
    .replace(/_/g, " ")
    .replace(/\b([a-z])/g, (_, ch) => ch.toUpperCase());
}
