// src/ui/palette.js
// @ts-check

export function colorForType(type) {
  const t = String(type || "").toLowerCase();
  if (t === "fire") return "#ff6a00";
  if (t === "cold") return "#66ccff";
  if (t === "lightning") return "#ffee55";
  if (t === "poison") return "#66dd66";
  if (t === "arcane") return "#cc66ff";
  return "#ffffff";
}

export function dominantAffinity(actor) {
  const affinityMap =
    actor?.modCache?.affinities || actor?.modCache?.offense?.affinities || null;
  if (!affinityMap) return "physical";
  let best = "physical";
  let val = -Infinity;
  for (const k of Object.keys(affinityMap)) {
    const v = affinityMap[k];
    if (v > val) {
      val = v;
      best = k;
    }
  }
  return best;
}
