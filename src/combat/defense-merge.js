// src/combat/defense-merge.js
// @ts-nocheck

export function consolidatedResists(actor) {
  const primary = actor?.modCache?.defense?.resists;
  const legacy = actor?.modCache?.resists;
  const out = {};
  if (legacy && typeof legacy === "object") {
    for (const [t, v] of Object.entries(legacy)) out[t] = Number(v) || 0;
  }
  if (primary && typeof primary === "object") {
    for (const [t, v] of Object.entries(primary)) out[t] = Number(v) || 0;
  }
  const delta = actor?.statusDerived?.resistDelta || {};
  for (const [t, v] of Object.entries(delta)) out[t] = (out[t] || 0) + (Number(v) || 0);
  for (const k of Object.keys(out)) out[k] = Math.max(0, Math.min(0.95, out[k]));
  return out;
}
