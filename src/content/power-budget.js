// src/content/power-budget.js
// @ts-check

/**
 * Estimate the total power budget for an item based on its stats.
 * @param {any} it
 */
export function computeItemPower(it) {
  if (!it || typeof it !== "object") return 0;
  let power = 0;
  const add = (value) => {
    if (!Number.isFinite(value)) return;
    power += Number(value);
  };

  const stats = it.baseState?.stats || it.baseStats || it.stats || {};
  if (Number.isFinite(stats?.str)) add(6 * stats.str);
  if (Number.isFinite(stats?.dex)) add(6 * stats.dex);
  if (Number.isFinite(stats?.int)) add(6 * stats.int);
  if (Number.isFinite(stats?.vit)) add(6 * stats.vit);

  if (it.offense?.affinities) {
    for (const value of Object.values(it.offense.affinities)) {
      if (!Number.isFinite(value)) continue;
      add(Math.round(Number(value) * 100));
    }
  }

  if (it.defense?.resists) {
    for (const value of Object.values(it.defense.resists)) {
      if (!Number.isFinite(value)) continue;
      add(Math.round(Number(value) * 80));
    }
  }

  if (Array.isArray(it.offense?.brands)) {
    for (const brand of it.offense.brands) {
      if (!brand) continue;
      add((Number(brand.flat ?? brand.amount) || 0) * 2);
      const pct = Number(brand.pct ?? brand.percent);
      if (Number.isFinite(pct)) add(Math.round(pct * 80));
    }
  }

  if (it.temporal?.actionSpeedPct) {
    add(Math.round(Math.abs(Number(it.temporal.actionSpeedPct)) * 150));
  }
  if (it.temporal?.cooldownMult && Number(it.temporal.cooldownMult) < 1) {
    add(Math.round((1 - Number(it.temporal.cooldownMult)) * 140));
  }
  if (it.temporal?.echo) add(10);
  if (it.resource?.manaCostMult && Number(it.resource.manaCostMult) < 1) {
    add(Math.round((1 - Number(it.resource.manaCostMult)) * 120));
  }

  return Math.max(0, Math.round(power));
}
